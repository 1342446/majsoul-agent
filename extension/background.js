'use strict';
importScripts('contracts/snapshot.js', 'adapters/model-endpoint.js', 'adapters/engine-endpoint.js', 'adapters/mjai.js', 'mahjong-analysis.js', 'analysis.js');
importScripts('harness.js', 'agent.js');
importScripts('contracts/engine-result.js', 'engine-agent.js');
importScripts('history.js', 'history-storage.js');
const pending = new Map();
chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.modelConfig) return;
  for (const controller of pending.values()) controller.abort();
  // Content scripts cannot observe changes to TRUSTED_CONTEXTS storage.
  // Send only an invalidation signal; credentials stay in the worker.
  return notifyModelConfigChanged();
});
async function notifyModelConfigChanged() {
  try {
    const tabs = await chrome.tabs.query({ url: 'https://game.maj-soul.com/*' });
    await Promise.allSettled(tabs.filter(tab => Number.isInteger(tab.id)).map(tab =>
      chrome.tabs.sendMessage(tab.id, { type: 'model:config-changed' }, { frameId: 0 })));
  } catch (_) { /* Tabs may close or unload while the configuration is saved. */ }
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id) return;
  const game = sender.tab && sender.frameId === 0 && sender.url?.startsWith('https://game.maj-soul.com/');
  if (message?.type === 'model:settings' && game) { chrome.runtime.openOptionsPage(); respond({ ok: true }); return; }
  if (message?.type === 'model:preferences' && game) {
    const p = message.preferences || {}, preferences = {};
    for (const key of ['danger', 'efficiency', 'strategy', 'automatic', 'useModel']) preferences[key] = p[key] === true;
    for (const [key, min, max, fallback] of [['modelFromTurn', 1, 18, 1], ['interval', 1, 60, 8], ['limit', 1, 100, 20]]) preferences[key] = Number.isFinite(p[key]) ? Math.min(max, Math.max(min, Math.trunc(p[key]))) : fallback;
    chrome.storage.local.set({ analysisPreferences: preferences }).then(() => respond({ ok: true })).catch(() => respond({ ok: false }));
    return true;
  }
  if (message?.type === 'model:status' && game) {
    chrome.storage.local.get(['modelConfig', 'analysisPreferences']).then(({ modelConfig: c, analysisPreferences }) => respond({ preferences: analysisPreferences, enabled: !!c?.enabled, model: c?.model || '', provider: c?.provider === 'mjai' ? 'mjai' : 'chat' })).catch(() => respond({ enabled: false, provider: 'chat' })); return true;
  }
  if (message?.type === 'model:cancel' && game) { pending.get(sender.tab.id)?.abort(); respond({ ok: true }); return; }
  if (message?.type === 'model:prepare' && game) {
    Promise.resolve().then(() => {
      const payload = JSON.stringify(message.snapshot);
      if (!payload || payload.length > 60000) throw new Error('局面数据无效或过大。');
      if (message.provider === 'mjai') {
        MJSnapshotContract.cleanSnapshot(message.snapshot);
        return { ok: true, data: MJMjaiAdapter.validateRequest(message.engineRequest) };
      }
      return { ok: true, data: MJAnalysis.prepare(message.snapshot, message.task).data };
    }).then(respond).catch(error => respond({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type !== 'model:analyze' || !game) return;
  (async () => {
    const key = sender.tab.id;
    if (pending.has(key)) throw new Error('已有分析正在进行。');
    // Reserve before the first await so cancellation and configuration changes
    // cover storage/permission preflight as well as the eventual fetch.
    const controller = new AbortController(); pending.set(key, controller);
    const timer = setTimeout(() => controller.abort(), 25000);
    const checkCancelled = () => {
      if (controller.signal.aborted) { const error = new Error('Cancelled'); error.name = 'AbortError'; throw error; }
    };
    try {
      const { modelConfig: c } = await chrome.storage.local.get('modelConfig');
      checkCancelled();
      if (!c?.enabled) throw new Error('请先在设置中开启模型分析。');
      const engine = c.provider === 'mjai';
      const requestedProvider = message.provider === undefined ? 'chat' : message.provider;
      if (!['chat', 'mjai'].includes(requestedProvider) || requestedProvider !== (engine ? 'mjai' : 'chat')) throw new Error('分析服务已变化，请刷新设置状态后重新分析。');
      const endpointAdapter = engine ? MJEngineEndpoint : MJModelEndpoint;
      const url = endpointAdapter.endpoint(c.endpoint);
      const permitted = await chrome.permissions.contains({ origins: [endpointAdapter.permissionOrigin(url.href)] });
      checkCancelled();
      if (!permitted) throw new Error('接口访问权限未授予，请重新保存设置。');
      if (typeof c.model !== 'string' || !c.model.trim() || c.model.length > 200 || (c.apiKey && typeof c.apiKey !== 'string')) throw new Error('模型配置无效，请重新保存设置。');
      const task = MJAnalysis.normalizeTask(message.task);
      const payload = JSON.stringify(message.snapshot);
      if (!payload || payload.length > 60000 || message.snapshot?.format !== 'mj-analysis-v1') throw new Error('局面数据无效或过大。');
      if (engine && (typeof c.apiKey !== 'string' || !c.apiKey.trim() || c.apiKey.length > 4096)) throw new Error('请配置本地引擎 Token。');
      if (engine && task !== 'combined') throw new Error('专业引擎仅支持综合决策，请选择综合攻守。');
      const latest = (await chrome.storage.local.get('modelConfig')).modelConfig;
      checkCancelled();
      if (JSON.stringify(latest) !== JSON.stringify(c)) throw new Error('模型设置已变化，请重新发起分析。');
      if (engine) {
        const analysis = await MJEngineAgent.run({ snapshot: message.snapshot, request: message.engineRequest, signal: controller.signal,
          infer: async (request, { signal }) => {
            const response = await fetch(url.href, { method: 'POST', signal, credentials: 'omit', redirect: 'error',
              headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + c.apiKey }, body: JSON.stringify(request) });
            if (!response.ok) throw new Error('本地引擎返回 HTTP ' + response.status + '，请检查服务、Token 与支持的局面。');
            return readJson(response);
          } });
        return { ok: true, ...analysis, model: 'mjai · 自选本地引擎', provider: 'mjai' };
      }
      const analysis = await MJAgent.run({ snapshot: message.snapshot, task, signal: controller.signal,
        explain: async (prepared, { signal }) => {
          const response = await fetch(url.href, { method: 'POST', signal, credentials: 'omit', redirect: 'error',
            headers: { 'Content-Type': 'application/json', ...(c.apiKey ? { Authorization: 'Bearer ' + c.apiKey } : {}) },
            body: JSON.stringify({ model: c.model, stream: false, max_tokens: 3000, messages: [
              { role: 'system', content: prepared.systemPrompt },
              { role: 'user', content: prepared.userPrompt }] }) });
          if (!response.ok) throw new Error('模型接口返回 HTTP ' + response.status + '，请检查地址、密钥、模型及额度。');
          // Bound the response while reading, including providers that omit Content-Length.
          const reader = response.body.getReader(); const chunks = []; let size = 0;
          while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length;
            if (size > 1024 * 1024) { await reader.cancel(); throw new Error('模型响应过大。'); } chunks.push(value); }
          const bytes = new Uint8Array(size); let offset = 0;
          for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
          let data; try { data = JSON.parse(new TextDecoder().decode(bytes)); } catch (_) { throw new Error('接口没有返回有效 JSON，请检查是否为 OpenAI 兼容接口。'); }
          const content = data.choices?.[0]?.message?.content;
          if (typeof content !== 'string' || !content.trim()) throw new Error('模型未返回文本内容，请检查模型是否支持 Chat Completions。');
          if (content.length > 32000) throw new Error('模型分析结果过长，请重试。');
          return content;
        } });
      return { ok: true, ...analysis, model: c.model };
    } finally { clearTimeout(timer); if (pending.get(key) === controller) pending.delete(key); }
  })().then(respond).catch(error => respond({ ok: false, error: error.name === 'AbortError' ? '分析已取消或超过25秒，请重试。' : (error.name === 'TypeError' ? '无法连接模型接口，请检查地址、网络与访问权限。' : error.message) }));
  return true;
});

async function readJson(response) {
  const reader = response.body.getReader(); const chunks = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break; size += value.length;
    if (size > 1024 * 1024) { await reader.cancel(); throw new Error('引擎响应过大。'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch (_) { throw new Error('本地引擎未返回有效 JSON。'); }
}
