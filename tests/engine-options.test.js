'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Endpoint = require('../extension/adapters/engine-endpoint.js');
const ChatEndpoint = require('../extension/adapters/model-endpoint.js');

async function settings(initial = {}, { permission = true, beforeSet, clearResult = { ok: true }, usageResult } = {}) {
  const data = structuredClone(initial), calls = [], elements = new Map(), downloads = [];
  for (const id of ['status', 'provider', 'providerHint', 'enabled', 'endpoint', 'endpointHint', 'model', 'key', 'keyLabel', 'chatOptions', 'thinking', 'thinkingHint', 'maxTokens', 'contextMode', 'toolCalling', 'priceCurrency', 'priceInput', 'priceOutput', 'priceCacheRead', 'priceCacheWrite', 'config', 'disable', 'clear', 'clearAgentData', 'exportUsage']) elements.set(id, { value: '', checked: false, textContent: '' });
  const local = {
    get: async keys => { calls.push(['get']); return Object.fromEntries((Array.isArray(keys) ? keys : [keys]).filter(key => key in data).map(key => [key, structuredClone(data[key])])); },
    set: async value => { const copied = structuredClone(value); calls.push(['set']); if (beforeSet) await beforeSet(copied); Object.assign(data, copied); },
    remove: async keys => { calls.push(['remove']); for (const key of Array.isArray(keys) ? keys : [keys]) delete data[key]; }
  };
  const context = vm.createContext({ Blob, setTimeout, URL: {
    createObjectURL(blob) { downloads.push({ blob }); return 'blob:usage-' + downloads.length; },
    revokeObjectURL(url) { calls.push(['revoke', url]); }
  }, document: { getElementById: id => elements.get(id), body: { appendChild() {} }, createElement(tag) {
    assert.equal(tag, 'a'); return { click() { Object.assign(downloads.at(-1), { href: this.href, filename: this.download }); calls.push(['download']); }, remove() {} };
  } }, chrome: { storage: { local }, runtime: { sendMessage: async message => {
    calls.push(['message', structuredClone(message)]);
    if (message.type === 'agent:usage') return usageResult || { ok: true, records: structuredClone(data.agentRunsV1 || []) };
    if (clearResult.ok) { delete data.agentRoundContextV1; delete data.agentRunsV1; }
    return clearResult;
  } }, permissions: { request: async value => { calls.push(['permission', value]); return permission; } } }, MJModelEndpoint: ChatEndpoint, MJEngineEndpoint: Endpoint });
  vm.runInContext(fs.readFileSync(require.resolve('../extension/options.js'), 'utf8'), context);
  await new Promise(resolve => setImmediate(resolve));
  const el = id => elements.get(id);
  return { data, calls, downloads, el, select(provider) { el('provider').value = provider; el('provider').onchange(); }, submit() { return el('config').onsubmit({ preventDefault() {} }); } };
}

test('mjai endpoint is strictly local HTTP analyze and exposes host-only permissions', () => {
  for (const value of ['http://127.0.0.1:17341/analyze', 'http://localhost:8080/analyze']) {
    assert.equal(Endpoint.endpoint(value).href, value);
  }
  assert.equal(Endpoint.permissionOrigin('http://localhost:17341/analyze'), 'http://localhost/*');
  for (const value of ['https://localhost/analyze', 'http://example.com/analyze', 'http://127.0.0.2/analyze', 'http://127.1/analyze', 'http://localhost/chat/completions', 'http://localhost/analyze/', 'http://localhost/analyze?token=x', 'http://localhost/analyze?', 'http://localhost/analyze#', 'http://user:password@localhost/analyze', 'http://localhost/a/../analyze']) assert.throws(() => Endpoint.endpoint(value), value);
});

test('settings default to disabled chat and old configurations remain chat only', async () => {
  const empty = await settings();
  assert.equal(empty.el('provider').value, 'chat'); assert.equal(empty.el('enabled').checked, false);
  assert.equal(empty.el('key').value, ''); assert.equal(empty.calls.some(c => c[0] === 'set'), false);
  const legacy = await settings({ modelConfig: { enabled: true, endpoint: 'https://example.com/v1/chat/completions', model: 'old-model', apiKey: 'CHAT_SECRET' } });
  assert.equal(legacy.el('provider').value, 'chat'); assert.equal(legacy.el('key').value, 'CHAT_SECRET');
  legacy.select('mjai');
  assert.equal(legacy.el('enabled').checked, false); assert.equal(legacy.el('key').value, '');
  assert.equal(legacy.el('endpoint').value, 'http://127.0.0.1:17341/analyze');
  assert.equal(legacy.el('model').value, 'mjai'); assert.equal(legacy.el('model').readOnly, true);
  assert.match(legacy.el('providerHint').textContent, /手动启动/); assert.match(legacy.el('providerHint').textContent, /不捆绑权重/);
  legacy.el('key').value = 'ENGINE_SECRET'; legacy.select('chat');
  assert.equal(legacy.el('key').value, 'CHAT_SECRET');
  legacy.select('mjai'); assert.equal(legacy.el('key').value, 'ENGINE_SECRET');
});

test('chat settings save and display the resolved request URL from a base URL', async () => {
  const page = await settings();
  page.el('endpoint').value = 'https://api.deepseek.com'; page.el('model').value = 'deepseek-flash';
  await page.submit();
  assert.equal(page.data.modelConfig.endpoint, 'https://api.deepseek.com/chat/completions');
  assert.equal(page.data.analysisProviders.chat.endpoint, page.data.modelConfig.endpoint);
  assert.equal(page.el('endpoint').value, page.data.modelConfig.endpoint);
  assert.deepEqual(Array.from(page.calls.find(call => call[0] === 'permission')[1].origins), ['https://api.deepseek.com/*']);
});

test('mjai token is required and permission runs before asynchronous storage', async () => {
  const page = await settings(); page.select('mjai');
  await page.submit(); assert.match(page.el('status').textContent, /Bearer Token/);
  assert.equal(page.calls.some(c => c[0] === 'permission'), false); assert.equal('modelConfig' in page.data, false);
  page.el('key').value = 'ENGINE_SECRET'; page.el('enabled').checked = true;
  const before = page.calls.length, pending = page.submit();
  assert.equal(page.calls[before][0], 'permission');
  assert.deepEqual(JSON.parse(JSON.stringify(page.calls[before][1])), { origins: ['http://127.0.0.1/*'] });
  await pending;
  assert.deepEqual(page.data.modelConfig, { provider: 'mjai', enabled: true, endpoint: 'http://127.0.0.1:17341/analyze', model: 'mjai', apiKey: 'ENGINE_SECRET' });
  assert.equal(page.data.analysisProviders.mjai.apiKey, 'ENGINE_SECRET');
});

test('thinking defaults off, follows mode defaults and preserves custom output limits across providers and reload', async () => {
  const page = await settings({ modelConfig: { enabled: true, endpoint: 'https://api.deepseek.com', model: 'deepseek-flash' } });
  assert.equal(page.el('thinking').checked, false); assert.equal(page.el('thinking').disabled, false);
  assert.equal(Number(page.el('maxTokens').value), 8192);
  page.el('thinking').checked = true; page.el('thinking').onchange();
  assert.equal(Number(page.el('maxTokens').value), 32768);
  page.el('maxTokens').value = '16000';
  page.el('thinking').checked = false; page.el('thinking').onchange();
  assert.equal(Number(page.el('maxTokens').value), 16000);
  page.el('thinking').checked = true; page.el('thinking').onchange();
  page.select('mjai'); assert.equal(page.el('chatOptions').hidden, true); assert.equal(page.el('maxTokens').disabled, true);
  page.select('chat'); assert.equal(page.el('thinking').checked, true);
  await page.submit();
  assert.equal(page.data.modelConfig.thinking, true); assert.equal(page.data.modelConfig.maxTokens, 16000);
  const reloaded = await settings(page.data);
  assert.equal(reloaded.el('thinking').checked, true); assert.equal(Number(reloaded.el('maxTokens').value), 16000);
});

test('invalid output limits save nothing and unsupported services cannot enable thinking', async () => {
  const page = await settings();
  page.el('endpoint').value = 'https://provider.example/v1'; page.el('model').value = 'chat'; page.el('endpoint').oninput();
  assert.equal(page.el('thinking').disabled, true);
  for (const value of ['', '0', '1.5', '393217', 'NaN']) {
    page.el('maxTokens').value = value; await page.submit();
    assert.match(page.el('status').textContent, /输出上限/);
    assert.equal('modelConfig' in page.data, false);
  }
  page.el('maxTokens').value = '12000'; page.el('thinking').checked = true;
  await page.submit(); assert.equal(page.data.modelConfig.thinking, false);
});

test('settings preserve per-provider secrets across reload and clear both providers', async () => {
  const page = await settings({ modelConfig: { provider: 'chat', enabled: false, endpoint: 'https://example.com/v1/chat/completions', model: 'chat-id', apiKey: 'CHAT_SECRET' } });
  page.select('mjai'); page.el('key').value = 'ENGINE_SECRET'; await page.submit();
  assert.equal(page.data.analysisProviders.chat.apiKey, 'CHAT_SECRET');
  const reloaded = await settings(page.data); assert.equal(reloaded.el('key').value, 'ENGINE_SECRET');
  reloaded.select('chat'); assert.equal(reloaded.el('key').value, 'CHAT_SECRET');
  await reloaded.submit(); assert.equal(reloaded.data.modelConfig.provider, 'chat'); assert.equal(reloaded.data.modelConfig.apiKey, 'CHAT_SECRET');
  await reloaded.el('clear').onclick();
  assert.equal('modelConfig' in reloaded.data, false); assert.equal('analysisProviders' in reloaded.data, false);
  assert.equal(reloaded.el('provider').value, 'chat'); assert.equal(reloaded.el('enabled').checked, false);
  reloaded.select('mjai'); assert.equal(reloaded.el('key').value, ''); reloaded.select('chat'); assert.equal(reloaded.el('key').value, '');
});

test('permission denial saves nothing, chat validation is preserved, disable closes stored providers', async () => {
  const denied = await settings({}, { permission: false }); denied.select('mjai'); denied.el('key').value = 'ENGINE'; await denied.submit();
  assert.match(denied.el('status').textContent, /未授予/); assert.equal('modelConfig' in denied.data, false);
  const page = await settings(); page.el('endpoint').value = 'http://example.com/v1/chat/completions'; page.el('model').value = 'chat'; await page.submit();
  assert.equal(page.calls.some(c => c[0] === 'permission'), false);
  page.el('endpoint').value = 'https://example.com/v1/chat/completions'; page.el('enabled').checked = true; await page.submit();
  assert.equal(page.data.modelConfig.provider, 'chat'); assert.equal(page.data.modelConfig.apiKey, '');
  page.select('mjai'); page.el('key').value = 'ENGINE'; page.el('enabled').checked = true; await page.submit();
  await page.el('disable').onclick();
  assert.equal(page.data.modelConfig.enabled, false); assert.equal(page.data.analysisProviders.chat.enabled, false); assert.equal(page.data.analysisProviders.mjai.enabled, false);
});

function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
const savedChat = () => ({ modelConfig: { provider: 'chat', enabled: true, endpoint: 'https://example.com/v1/chat/completions', model: 'chat', apiKey: 'EXISTING_SECRET' } });

test('disable and clear invalidate saves waiting for permission without restoring captured keys or enabled state', async () => {
  for (const action of ['disable', 'clear']) {
    const permission = deferred();
    const page = await settings(savedChat(), { permission: permission.promise });
    page.el('key').value = 'PENDING_SECRET'; page.el('enabled').checked = true;
    const saving = page.submit();
    assert.equal(page.calls.at(-1)[0], 'permission');
    await page.el(action).onclick();
    const status = page.el('status').textContent, writes = page.calls.filter(c => c[0] === 'set').length;
    permission.resolve(true); await saving;
    assert.equal(page.calls.filter(c => c[0] === 'set').length, writes);
    assert.equal(page.el('status').textContent, status);
    assert.equal(page.el('enabled').checked, false);
    assert.equal(JSON.stringify(page.data).includes('PENDING_SECRET'), false);
    if (action === 'disable') { assert.equal(page.data.modelConfig.enabled, false); assert.equal(page.data.modelConfig.apiKey, 'EXISTING_SECRET'); }
    else { assert.equal('modelConfig' in page.data, false); assert.equal('analysisProviders' in page.data, false); assert.equal(page.el('key').value, ''); }
  }
});

test('disable and clear serialize after an already-started save storage write', async () => {
  for (const action of ['disable', 'clear']) {
    const storage = deferred(), started = deferred(); let writes = 0;
    const page = await settings(savedChat(), { beforeSet: async () => { if (++writes === 1) { started.resolve(); await storage.promise; } } });
    page.el('key').value = 'NEW_SECRET'; page.el('enabled').checked = true;
    const saving = page.submit(); await started.promise;
    const stopping = page.el(action).onclick();
    await new Promise(resolve => setImmediate(resolve));
    // Neither disable's write nor clear's removal may overtake the in-flight save.
    assert.equal(writes, 1); assert.equal(page.calls.some(c => c[0] === 'remove'), false);
    storage.resolve(); await Promise.all([saving, stopping]);
    assert.equal(page.el('enabled').checked, false);
    if (action === 'disable') { assert.equal(page.data.modelConfig.enabled, false); assert.match(page.el('status').textContent, /已关闭/); }
    else {
      assert.equal('modelConfig' in page.data, false); assert.equal('analysisProviders' in page.data, false);
      assert.equal(page.el('key').value, ''); assert.match(page.el('status').textContent, /已清除/);
      page.select('mjai'); assert.equal(page.el('key').value, ''); page.select('chat'); assert.equal(page.el('key').value, '');
    }
  }
});

test('chat context and tools default off and optional pricing remains unknown until supplied', async () => {
  const page = await settings(savedChat());
  assert.equal(page.el('contextMode').value, 'snapshot'); assert.equal(page.el('toolCalling').checked, false);
  assert.equal(page.el('priceCurrency').value, ''); assert.equal(page.el('priceInput').value, '');
  await page.submit();
  assert.equal(page.data.modelConfig.contextMode, 'snapshot'); assert.equal(page.data.modelConfig.toolCalling, false);
  assert.deepEqual(page.data.modelConfig.pricing, { currency: null, input: null, output: null, cacheRead: null, cacheWrite: null });
});

test('chat context, tools and prices survive provider drafts, save and reload while mjai stays unchanged', async () => {
  const page = await settings(savedChat());
  page.el('contextMode').value = 'round'; page.el('toolCalling').checked = true;
  page.el('priceCurrency').value = ' CNY '; page.el('priceInput').value = '2'; page.el('priceOutput').value = '8.5';
  page.el('priceCacheRead').value = '0';
  page.select('mjai');
  assert.equal(page.el('priceInput').disabled, true); assert.equal(page.el('toolCalling').disabled, true);
  page.el('key').value = 'ENGINE'; await page.submit();
  assert.deepEqual(page.data.modelConfig, { provider: 'mjai', enabled: false, endpoint: 'http://127.0.0.1:17341/analyze', model: 'mjai', apiKey: 'ENGINE' });
  const page2 = await settings(page.data); page2.select('chat');
  assert.equal(page2.el('contextMode').value, 'round'); assert.equal(page2.el('toolCalling').checked, true);
  assert.equal(page2.el('priceInput').disabled, false); assert.equal(page2.el('priceInput').value, '2');
  await page2.submit();
  assert.deepEqual(page2.data.modelConfig.pricing, { currency: 'CNY', input: 2, output: 8.5, cacheRead: 0, cacheWrite: null });
  assert.deepEqual(page2.data.analysisProviders.chat.pricing, page2.data.modelConfig.pricing);
  const reloaded = await settings(page2.data);
  assert.equal(reloaded.el('contextMode').value, 'round'); assert.equal(reloaded.el('toolCalling').checked, true);
  assert.equal(reloaded.el('priceOutput').value, '8.5'); assert.equal(reloaded.el('priceCacheWrite').value, '');
});

test('invalid prices are rejected before permission while blank and zero prices are valid', async () => {
  const page = await settings(savedChat());
  for (const value of ['-1', 'NaN', 'Infinity', 'invalid']) {
    page.el('priceInput').value = value;
    const before = page.calls.length;
    await page.submit();
    assert.match(page.el('status').textContent, /非负数字/);
    assert.equal(page.calls.slice(before).some(call => call[0] === 'permission'), false);
    assert.equal(page.data.modelConfig.pricing, undefined);
  }
  page.el('priceInput').value = '0'; await page.submit();
  assert.equal(page.data.modelConfig.pricing.input, 0); assert.equal(page.data.modelConfig.pricing.currency, null);
});

test('clear data uses the trusted options message, keeps settings and clears both stored session keys', async () => {
  const initial = { ...savedChat(), agentRoundContextV1: { PRIVATE: 'hand' }, agentRunsV1: [{ usage: 'tokens' }] };
  const page = await settings(initial);
  await page.el('clearAgentData').onclick();
  assert.deepEqual(page.calls.find(call => call[0] === 'message')[1], { type: 'agent:clear-data' });
  assert.deepEqual(page.data.modelConfig, initial.modelConfig);
  assert.equal('agentRoundContextV1' in page.data, false); assert.equal('agentRunsV1' in page.data, false);
  assert.match(page.el('status').textContent, /已清除本地会话和运行用量/);
  assert.equal(page.el('clearAgentData').disabled, false);
  const failed = await settings(initial, { clearResult: { ok: false, error: '暂时无法清除。' } });
  await failed.el('clearAgentData').onclick();
  assert.match(failed.el('status').textContent, /暂时无法清除/);
  assert.equal('agentRunsV1' in failed.data, true);
  await failed.el('clear').onclick();
  assert.equal('modelConfig' in failed.data, false); assert.equal('agentRoundContextV1' in failed.data, false); assert.equal('agentRunsV1' in failed.data, false);
});

test('usage export downloads local numeric records with snapshot/round metadata and revokes its URL', async () => {
  const records = ['snapshot', 'round'].map((mode, index) => ({ at: 1700000000000 + index, status: 'completed', mode, lane: 'manual-review',
    elapsedMs: 100, calls: 1, usage: { inputTokens: 100 + index, outputTokens: 20, cacheReadTokens: index ? 80 : null },
    cost: { currency: 'USD', totalCost: null } }));
  const initial = { ...savedChat(), agentRunsV1: records, agentRoundContextV1: { prompt: 'PRIVATE_PROMPT' } };
  const page = await settings(initial);
  await page.el('exportUsage').onclick();
  assert.deepEqual(page.calls.find(call => call[0] === 'message')[1], { type: 'agent:usage' });
  assert.equal(page.downloads.length, 1);
  const download = page.downloads[0], text = await download.blob.text(), exported = JSON.parse(text);
  assert.equal(exported.format, 'mj-agent-usage-v1'); assert.ok(Number.isFinite(Date.parse(exported.exportedAt)));
  assert.deepEqual(exported.records, records);
  assert.equal(download.blob.type, 'application/json;charset=utf-8');
  assert.match(download.filename, /^mahjong-usage-.*\.json$/);
  assert.doesNotMatch(text, /EXISTING_SECRET|PRIVATE_PROMPT|example\.com|apiKey/);
  assert.deepEqual(page.data, initial);
  assert.equal(page.el('exportUsage').disabled, false); assert.match(page.el('status').textContent, /已导出 2 条/);
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.deepEqual(page.calls.find(call => call[0] === 'revoke'), ['revoke', download.href]);
});

test('empty usage can be exported and failed usage reads never download', async () => {
  const empty = await settings(); await empty.el('exportUsage').onclick();
  assert.deepEqual(JSON.parse(await empty.downloads[0].blob.text()).records, []);
  for (const usageResult of [{ ok: false, error: '无法读取用量。' }, { ok: true, records: null }]) {
    const page = await settings({}, { usageResult }); await page.el('exportUsage').onclick();
    assert.equal(page.downloads.length, 0); assert.equal(page.el('exportUsage').disabled, false);
    assert.match(page.el('status').textContent, /读取用量/);
  }
});
