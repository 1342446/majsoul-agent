'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Endpoint = require('../extension/adapters/engine-endpoint.js');
const ChatEndpoint = require('../extension/adapters/model-endpoint.js');

async function settings(initial = {}, { permission = true, beforeSet } = {}) {
  const data = structuredClone(initial), calls = [], elements = new Map();
  for (const id of ['status', 'provider', 'providerHint', 'enabled', 'endpoint', 'endpointHint', 'model', 'key', 'keyLabel', 'config', 'disable', 'clear']) elements.set(id, { value: '', checked: false, textContent: '' });
  const local = {
    get: async keys => { calls.push(['get']); return Object.fromEntries((Array.isArray(keys) ? keys : [keys]).filter(key => key in data).map(key => [key, structuredClone(data[key])])); },
    set: async value => { const copied = structuredClone(value); calls.push(['set']); if (beforeSet) await beforeSet(copied); Object.assign(data, copied); },
    remove: async keys => { calls.push(['remove']); for (const key of Array.isArray(keys) ? keys : [keys]) delete data[key]; }
  };
  const context = vm.createContext({ document: { getElementById: id => elements.get(id) }, chrome: { storage: { local }, permissions: { request: async value => { calls.push(['permission', value]); return permission; } } }, MJModelEndpoint: ChatEndpoint, MJEngineEndpoint: Endpoint });
  vm.runInContext(fs.readFileSync(require.resolve('../extension/options.js'), 'utf8'), context);
  await new Promise(resolve => setImmediate(resolve));
  const el = id => elements.get(id);
  return { data, calls, el, select(provider) { el('provider').value = provider; el('provider').onchange(); }, submit() { return el('config').onsubmit({ preventDefault() {} }); } };
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
