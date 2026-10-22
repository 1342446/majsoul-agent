const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const A = require('../extension/analysis.js');
const S = require('../extension/state.js');
function state(source = 'replay') {
  const s = S.initial(source, 1); Object.assign(s, { round: { wind: 0, index: 0 }, scores: [25000, 25000, 25000, 25000], phase: 'playing', selfHand: ['1m', '0p'] });
  s.players.forEach((p, i) => { p.hand = [i + 1 + 's']; p.discards = [{ tile: i + 1 + 'p', tsumogiri: true }]; });
  s.account = 'PRIVATE'; s.players[0].token = 'SECRET'; return s;
}
test('snapshot respects independent scopes and never sends replay opponents hands or extra fields', () => {
  const s = state(); const original = JSON.stringify(s);
  const all = A.snapshot(s, { game: true, hand: true, rivers: 'all' });
  assert.deepEqual(all.selfHand, ['2s']); assert.equal(all.rivers.length, 4);
  assert.equal(JSON.stringify(all).includes('PRIVATE'), false); assert.equal(JSON.stringify(all).includes('SECRET'), false);
  assert.equal(all.game.players.some(p => 'hand' in p || 'discards' in p), false);
  const one = A.snapshot(s, { game: false, hand: false, rivers: '2' });
  assert.equal('game' in one, false); assert.equal('selfHand' in one, false); assert.deepEqual(one.rivers.map(p => p.seat), [2]);
  assert.equal(JSON.stringify(s), original);
});
test('live own hand, unknown tiles, missing seat, empty scopes and three-player seats', () => {
  const s = state('live'); s.selfHand.push('invalid');
  assert.deepEqual(A.snapshot(s, { hand: true, rivers: 'none' }).selfHand, ['1m', '0p', '?']);
  s.selfSeat = null; assert.throws(() => A.snapshot(s, { hand: true, rivers: 'none' }), /自家座位/);
  assert.throws(() => A.snapshot(s, { rivers: 'none' }), /至少/);
  s.scores.pop(); assert.throws(() => A.snapshot(s, { rivers: '3' }), /有效/);
  assert.equal(A.snapshot(s, { rivers: 'all' }).rivers.length, 3);
  assert.throws(() => A.snapshot(S.initial(), { game: true }), /开局/);
});
test('endpoint only permits HTTPS and loopback HTTP with explicit completion path', () => {
  assert.equal(A.permissionOrigin('http://localhost:8000/v1/chat/completions'), 'http://localhost/*');
  assert.equal(A.permissionOrigin('https://provider.example:8443/v1/chat/completions'), 'https://provider.example/*');
  for (const url of ['https://example.com/v1/chat/completions', 'http://localhost:8000/v1/chat/completions', 'http://127.0.0.1:8000/chat/completions']) assert.ok(A.endpoint(url));
  for (const url of ['http://example.com/v1/chat/completions', 'https://user:pass@example.com/chat/completions', 'https://example.com/chat/completions?key=secret', 'https://example.com/v1', 'file:///chat/completions', 'bad']) assert.throws(() => A.endpoint(url));
});
function worker(overrides = {}) {
  let listener, changed, requests = [], accessLevel, aborted = false, timeout;
  const config = { enabled: true, model: 'mock-model', endpoint: 'https://provider.example/v1/chat/completions', apiKey: 'test-key', ...overrides.config };
  const context = { MJAnalysis: A, importScripts() {}, TextDecoder, Uint8Array, AbortController,
    setTimeout: overrides.manualTimer ? fn => { timeout = fn; return 1; } : setTimeout,
    clearTimeout: overrides.manualTimer ? () => {} : clearTimeout,
    chrome: { storage: { local: { setAccessLevel: value => { accessLevel = value; }, get: async () => ({ modelConfig: config }) }, onChanged: { addListener: fn => { changed = fn; } } },
      permissions: { contains: async () => overrides.permission !== false },
      runtime: { id: 'extension-id', getURL: path => 'chrome-extension://extension-id/' + path, openOptionsPage() {}, onMessage: { addListener: fn => { listener = fn; } } } },
    fetch: async (url, options) => {
      requests.push({ url, options });
      if (overrides.wait) return new Promise((resolve, reject) => options.signal.addEventListener('abort', () => { aborted = true; reject(new DOMException('abort', 'AbortError')); }));
      if (overrides.networkError) throw new TypeError('network');
      return new Response(overrides.raw ?? JSON.stringify(overrides.body ?? { choices: [{ message: { content: '建议打 1m，注意对手立直。' } }] }), { status: overrides.status || 200 });
    } };
  vm.runInNewContext(fs.readFileSync(require.resolve('../extension/background.js'), 'utf8'), context);
  const sender = { id: 'extension-id', tab: { id: 7 }, frameId: 0, url: 'https://game.maj-soul.com/1/' };
  const call = (message, from = sender) => new Promise(resolve => { if (listener(message, from, resolve) !== true) resolve(undefined); });
  const analyze = () => call({ type: 'model:analyze', task: 'both', snapshot: A.snapshot(state('live'), { hand: true, rivers: 'all' }) });
  return { call, analyze, requests, expire: () => timeout(), changed: (...args) => changed(...args), sender, accessLevel, get aborted() { return aborted; } };
}
test('worker authenticates sender, keeps credentials out of status and uses non-streaming bounded request', async () => {
  const w = worker(); assert.equal(w.accessLevel.accessLevel, 'TRUSTED_CONTEXTS');
  assert.equal(await w.call({ type: 'model:analyze' }, { ...w.sender, id: 'other' }), undefined);
  assert.equal(await w.call({ type: 'model:analyze' }, { ...w.sender, frameId: 1 }), undefined);
  const status = await w.call({ type: 'model:status' }); assert.equal('apiKey' in status, false);
  const result = await w.analyze(); assert.equal(result.ok, true); assert.match(result.text, /1m/);
  const { options } = w.requests[0]; const body = JSON.parse(options.body);
  assert.equal(options.headers.Authorization, 'Bearer test-key'); assert.equal(options.redirect, 'error'); assert.equal(options.credentials, 'omit');
  assert.equal(body.stream, false); assert.equal(body.model, 'mock-model'); assert.equal(body.messages.length, 2);
  assert.equal(JSON.stringify(body).includes('test-key'), false);
});
test('disabled or permission-denied configuration sends no network request', async () => {
  for (const options of [{ config: { enabled: false } }, { permission: false }]) {
    const w = worker(options); assert.equal((await w.analyze()).ok, false); assert.equal(w.requests.length, 0);
  }
});
test('HTTP errors, invalid JSON, empty content, oversized content and network errors are actionable', async () => {
  for (const [options, message] of [[{ status: 401 }, /HTTP 401/], [{ raw: 'not json' }, /有效 JSON/], [{ body: {} }, /文本内容/], [{ raw: 'x'.repeat(1024 * 1024 + 1) }, /响应过大/], [{ networkError: true }, /无法连接/]]) {
    const result = await worker(options).analyze(); assert.equal(result.ok, false); assert.match(result.error, message);
  }
});
test('duplicate requests do not call provider twice; user cancellation aborts the active request', async () => {
  const w = worker({ wait: true }); const pending = w.analyze();
  await new Promise(resolve => setImmediate(resolve));
  assert.match((await w.analyze()).error, /正在进行/); assert.equal(w.requests.length, 1);
  await w.call({ type: 'model:cancel' }); assert.equal((await pending).ok, false); assert.equal(w.aborted, true);
});
test('changing or clearing configuration aborts in-flight analysis', async () => {
  const w = worker({ wait: true }); const pending = w.analyze();
  await new Promise(resolve => setImmediate(resolve)); w.changed({ modelConfig: { newValue: undefined } }, 'local');
  assert.match((await pending).error, /取消/); assert.equal(w.aborted, true);
});
test('timeout aborts provider request and releases the per-tab request slot', async () => {
  const w = worker({ wait: true, manualTimer: true }); const first = w.analyze();
  await new Promise(resolve => setImmediate(resolve)); w.expire();
  assert.match((await first).error, /25秒/);
  const second = w.analyze(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(w.requests.length, 2); w.expire(); assert.equal((await second).ok, false);
});
