'use strict';
importScripts('contracts/snapshot.js', 'adapters/model-endpoint.js', 'adapters/engine-endpoint.js', 'adapters/mjai.js', 'mahjong-analysis.js', 'analysis.js');
importScripts('harness.js', 'agent.js');
importScripts('pi-runtime.js', 'round-context.js', 'model-usage.js', 'model-session-transport.js', 'agent-run-store.js');
importScripts('contracts/engine-result.js', 'engine-agent.js');
importScripts('history.js', 'history-storage.js');
const pending = new Map();
const roundContexts = MJRoundContext.createStore({ storage: chrome.storage.local });
const runStore = MJRunStore.create({ storage: chrome.storage.local });
let revisionPromise = null;
const newRevision = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
async function configRevision() {
  if (!revisionPromise) revisionPromise = (async () => {
    const saved = (await chrome.storage.local.get('agentConfigRevision')).agentConfigRevision;
    const revision = typeof saved === 'string' ? saved : newRevision();
    if (chrome.storage.local.set && revision !== saved) await chrome.storage.local.set({ agentConfigRevision: revision });
    return revision;
  })();
  return revisionPromise;
}
async function clearAgentData(clearRuns = true) {
  for (const controller of pending.values()) controller.abort();
  const revision = newRevision(); revisionPromise = Promise.resolve(revision);
  await Promise.all([roundContexts.reset(), clearRuns ? runStore.clear() : Promise.resolve(), chrome.storage.local.set?.({ agentConfigRevision: revision })]);
}
chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.modelConfig) return;
  for (const controller of pending.values()) controller.abort();
  // Content scripts cannot observe changes to TRUSTED_CONTEXTS storage.
  // Send only an invalidation signal; credentials stay in the worker.
  return Promise.allSettled([clearAgentData(false), notifyModelConfigChanged()]);
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
  if (message?.type === 'agent:usage' && sender.url === chrome.runtime.getURL?.('options.html')) {
    runStore.list().then(records => respond({ ok: true, records })).catch(() => respond({ ok: false, error: '读取用量记录失败。' })); return true;
  }
  if (message?.type === 'agent:clear-data' && !sender.tab?.url?.startsWith('https://game.maj-soul.com/') && sender.url === chrome.runtime.getURL?.('options.html')) {
    clearAgentData().then(() => respond({ ok: true })).catch(() => respond({ ok: false, error: '清除本地记录失败，请重试。' })); return true;
  }
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
  let rawModelResult = null, accounting = null;
  (async () => {
    const key = sender.tab.id;
    if (pending.has(key)) throw new Error('已有分析正在进行。');
    // Reserve before the first await so cancellation and configuration changes
    // cover storage/permission preflight as well as the eventual fetch.
    const controller = new AbortController(); pending.set(key, controller);
    let timer = setTimeout(() => controller.abort(), 25000);
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
      const outputOptions = MJModelEndpoint.outputOptions(c);
      if (outputOptions.thinking?.type === 'enabled') {
        clearTimeout(timer); timer = setTimeout(() => controller.abort(), 120000);
      }
      const lane = message.lane === 'live' ? 'live' : 'manual-review';
      const question = message.question === undefined ? '' : message.question;
      if (typeof question !== 'string' || question.length > 4000) throw new Error('追问内容无效或过长。');
      const contextMode = c.contextMode === 'round' ? 'round' : 'snapshot';
      let session = null, sessionContext = null;
      if (contextMode === 'round') {
        const info = message.context || {}, identity = info.identity || {};
        const revision = await configRevision(); checkCancelled();
        session = await roundContexts.observe({ snapshot: message.snapshot, scope: String(key),
          identity: { matchId: typeof identity.matchId === 'string' ? `${key}:${identity.matchId.slice(0, 160)}` : null,
            roundStartId: identity.roundStartId, viewId: identity.viewId },
          position: info.position, events: info.events, lane, provider: url.href, model: c.model, task,
          config: { revision, mode: contextMode, promptVersion: 1, maxTokens: c.maxTokens, selection: c.toolCalling === true } });
        checkCancelled(); sessionContext = await roundContexts.getContext(session);
      }
      const records = [], started = Date.now(), epoch = runStore.epoch(), runId = newRevision(); let status = 'failed', attempts = 0, outcome;
      const totals = () => {
        const summary = MJModelUsage.summarize(records);
        const usage = summary.requests ? summary.usage : MJModelUsage.normalizeUsage(null);
        return { usage, cost: MJModelUsage.estimateCost(usage, c.pricing), calls: attempts, elapsedMs: Date.now() - started, contextMode };
      };
      try {
        const analysis = await MJAgent.run({ snapshot: message.snapshot, task, signal: controller.signal,
          runtime: MJPiRuntime, sessionContext, question, toolCalling: c.toolCalling === true,
          maxTurns: c.toolCalling === true && lane === 'manual-review' ? 3 : 1,
          timeoutMs: outputOptions.thinking?.type === 'enabled' ? 120000 : 25000,
          transport: async request => {
            checkCancelled(); attempts++;
            // A failed or unreadable attempt may still have been billed. Its missing usage is unknown.
            const record = { usage: MJModelUsage.normalizeUsage(null) }; records.push(record);
            const response = await fetch(url.href, { method: 'POST', signal: request.signal, credentials: 'omit', redirect: 'error',
              headers: { 'Content-Type': 'application/json', ...(c.apiKey ? { Authorization: 'Bearer ' + c.apiKey } : {}) },
              body: JSON.stringify(MJModelSessionTransport.body(request, c, outputOptions)) });
            if (!response.ok) throw new Error('模型接口返回 HTTP ' + response.status + '，请检查地址、密钥、模型及额度。');
            const data = await readJson(response, '模型');
            const usage = MJModelUsage.normalizeUsage(data);
            record.usage = usage;
            checkCancelled();
            const choice = data?.choices?.[0], content = choice?.message?.content;
            if (typeof content === 'string') rawModelResult = { content: content.slice(0, 32000), truncated: content.length > 32000,
              model: c.model, capturedAt: new Date().toISOString(), finishReason: typeof choice?.finish_reason === 'string' ? choice.finish_reason.slice(0, 100) : null };
            const result = MJModelSessionTransport.result(data, request.tools.length > 0);
            return { ...result, usage: { input: usage.uncachedInputTokens ?? usage.inputTokens ?? 0, output: usage.outputTokens ?? 0,
              cacheRead: usage.uncachedInputTokens === null ? 0 : usage.cacheReadTokens ?? 0, cacheWrite: usage.cacheWriteTokens ?? 0,
              totalTokens: (usage.inputTokens || 0) + (usage.outputTokens || 0) } };
          } });
        checkCancelled();
        if (session) {
          if (!await roundContexts.isCurrent(session)) throw new Error('分析上下文已变化，请重新分析。');
        }
        checkCancelled(); status = 'completed'; accounting = totals();
        outcome = { ok: true, ...analysis, model: c.model, ...accounting, ...(session ? { session } : {}) };
      } finally {
        accounting = totals();
        if (controller.signal.aborted) status = 'cancelled';
        await runStore.append({ id: runId, ...accounting, status, mode: contextMode, lane }, epoch).catch(() => {});
        if (controller.signal.aborted && status !== 'cancelled') await runStore.append({ id: runId, ...accounting, status: 'cancelled', mode: contextMode, lane }, epoch).catch(() => {});
        checkCancelled();
      }
      if (session && lane === 'manual-review') {
        const exchangeId = `${started}-${newRevision()}`;
        try {
          const committed = await roundContexts.appendExchange(session, { id: exchangeId, question: question || '分析当时局面', answer: JSON.stringify(outcome.result) }, { signal: controller.signal });
          checkCancelled();
          if (!committed) throw new Error('分析上下文已变化，请重新分析。');
        } catch (error) {
          await roundContexts.removeExchange(session, exchangeId).catch(() => {});
          await runStore.append({ id: runId, ...accounting, status: controller.signal.aborted ? 'cancelled' : 'failed', mode: contextMode, lane }, epoch).catch(() => {});
          throw error;
        }
      }
      return outcome;
    } finally { clearTimeout(timer); if (pending.get(key) === controller) pending.delete(key); }
  })().then(respond).catch(error => respond({ ok: false, error: modelError(error), ...(error.validation ? { validation: error.validation } : {}), ...(accounting || {}), ...(rawModelResult && error.name !== 'AbortError' ? { rawModelResult } : {}) }));
  return true;
});

function modelError(error) {
  if (error.name === 'AbortError' || ['ABORTED', 'TIME_BUDGET'].includes(error.code)) return '分析已取消或请求超时，请重试。';
  if (error.name === 'TypeError') return '无法连接模型接口，请检查地址、网络与访问权限。';
  const budget = { TURN_BUDGET: '已达到本次模型调用上限，未取得最终分析。', TOOL_BUDGET: '已达到本次工具调用上限，未取得最终分析。', TOKEN_BUDGET: '已达到本次 token 预算，未取得最终分析。' };
  return budget[error.code] || error.message;
}

async function readJson(response, label = '引擎') {
  const reader = response.body.getReader(); const chunks = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break; size += value.length;
    if (size > 1024 * 1024) { await reader.cancel(); throw new Error(label + '响应过大。'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch (_) { throw new Error(label + '未返回有效 JSON。'); }
}
