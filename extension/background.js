'use strict';
importScripts('mahjong-analysis.js', 'analysis.js');
importScripts('harness.js', 'agent.js');
importScripts('history.js', 'history-storage.js');
const pending = new Map();
chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.modelConfig) for (const controller of pending.values()) controller.abort();
});
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id) return;
  const game = sender.tab && sender.frameId === 0 && sender.url?.startsWith('https://game.maj-soul.com/');
  if (message?.type === 'model:settings' && game) { chrome.runtime.openOptionsPage(); respond({ ok: true }); return; }
  if (message?.type === 'model:status' && game) {
    chrome.storage.local.get('modelConfig').then(({ modelConfig: c }) => respond({ enabled: !!c?.enabled, model: c?.model || '' })).catch(() => respond({ enabled: false })); return true;
  }
  if (message?.type === 'model:cancel' && game) { pending.get(sender.tab.id)?.abort(); respond({ ok: true }); return; }
  if (message?.type === 'model:prepare' && game) {
    Promise.resolve().then(() => {
      const payload = JSON.stringify(message.snapshot);
      if (!payload || payload.length > 60000) throw new Error('局面数据无效或过大。');
      return { ok: true, data: MJAnalysis.prepare(message.snapshot, message.task).data };
    }).then(respond).catch(error => respond({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type !== 'model:analyze' || !game) return;
  (async () => {
    const key = sender.tab.id;
    if (pending.has(key)) throw new Error('已有分析正在进行。');
    const { modelConfig: c } = await chrome.storage.local.get('modelConfig');
    if (!c?.enabled) throw new Error('请先在设置中开启模型分析。');
    const url = MJAnalysis.endpoint(c.endpoint);
    if (!await chrome.permissions.contains({ origins: [MJAnalysis.permissionOrigin(url.href)] })) throw new Error('接口访问权限未授予，请重新保存设置。');
    if (typeof c.model !== 'string' || !c.model.trim() || c.model.length > 200 || (c.apiKey && typeof c.apiKey !== 'string')) throw new Error('模型配置无效，请重新保存设置。');
    const task = MJAnalysis.normalizeTask(message.task);
    const payload = JSON.stringify(message.snapshot);
    if (!payload || payload.length > 60000 || message.snapshot?.format !== 'mj-analysis-v1') throw new Error('局面数据无效或过大。');
    if (pending.has(key)) throw new Error('已有分析正在进行。');
    const controller = new AbortController(); pending.set(key, controller);
    const timer = setTimeout(() => controller.abort(), 25000);
    try {
      const latest = (await chrome.storage.local.get('modelConfig')).modelConfig;
      if (controller.signal.aborted || JSON.stringify(latest) !== JSON.stringify(c)) throw new Error('模型设置已变化，请重新发起分析。');
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
