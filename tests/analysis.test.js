const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const A = require('../extension/analysis.js');
const S = require('../extension/state.js');
const C = require('../extension/collector/snapshot-adapter.js');
const E = require('../extension/adapters/model-endpoint.js');
function state(source = 'replay') {
  const s = S.initial(source, 1); Object.assign(s, { round: { wind: 0, index: 0 }, scores: [25000, 25000, 25000, 25000], phase: 'playing', selfHand: ['1m', '0p'] });
  s.players.forEach((p, i) => { p.hand = [i + 1 + 's']; p.discards = [{ tile: i + 1 + 'p', tsumogiri: true }]; });
  s.account = 'PRIVATE'; s.players[0].token = 'SECRET'; return s;
}
test('snapshot respects independent scopes and never sends replay opponents hands or extra fields', () => {
  const s = state(); const original = JSON.stringify(s);
  const all = C.snapshot(s, { game: true, hand: true, rivers: 'all' });
  assert.deepEqual(all.selfHand, ['2s']); assert.equal(all.rivers.length, 4);
  assert.equal(JSON.stringify(all).includes('PRIVATE'), false); assert.equal(JSON.stringify(all).includes('SECRET'), false);
  assert.equal(all.game.players.some(p => 'hand' in p || 'discards' in p), false);
  const one = C.snapshot(s, { game: false, hand: false, rivers: '2' });
  assert.equal('game' in one, false); assert.equal('selfHand' in one, false); assert.deepEqual(one.rivers.map(p => p.seat), [2]);
  assert.equal(JSON.stringify(s), original);
});
test('live own hand, unknown tiles, missing seat, empty scopes and three-player seats', () => {
  const s = state('live'); s.selfHand.push('invalid');
  assert.deepEqual(C.snapshot(s, { hand: true, rivers: 'none' }).selfHand, ['1m', '0p', '?']);
  s.selfSeat = null; assert.throws(() => C.snapshot(s, { hand: true, rivers: 'none' }), /自家座位/);
  assert.throws(() => C.snapshot(s, { rivers: 'none' }), /至少/);
  s.scores.pop(); assert.throws(() => C.snapshot(s, { rivers: '3' }), /有效/);
  assert.equal(C.snapshot(s, { rivers: 'all' }).rivers.length, 3);
  assert.throws(() => C.snapshot(S.initial(), { game: true }), /开局/);
});
test('endpoint only permits HTTPS and loopback HTTP', () => {
  assert.equal(E.permissionOrigin('http://localhost:8000/v1/chat/completions'), 'http://localhost/*');
  assert.equal(E.permissionOrigin('https://provider.example:8443/v1/chat/completions'), 'https://provider.example/*');
  for (const url of ['https://example.com/v1/chat/completions', 'http://localhost:8000/v1/chat/completions', 'http://127.0.0.1:8000/chat/completions']) assert.ok(E.endpoint(url));
  for (const url of ['http://example.com/v1/chat/completions', 'https://user:pass@example.com/chat/completions', 'https://example.com/chat/completions?key=secret', 'file:///chat/completions', 'bad']) assert.throws(() => E.endpoint(url));
});
test('chat base URLs normalize once while preserving prefixes and ports', () => {
  for (const [base, expected] of [
    ['https://api.deepseek.com', 'https://api.deepseek.com/chat/completions'],
    ['https://api.deepseek.com/', 'https://api.deepseek.com/chat/completions'],
    ['https://example.com/v1', 'https://example.com/v1/chat/completions'],
    ['https://example.com/proxy/v1/', 'https://example.com/proxy/v1/chat/completions'],
    ['http://localhost:8000/v1/', 'http://localhost:8000/v1/chat/completions'],
    ['https://example.com/v1/chat/completions', 'https://example.com/v1/chat/completions'],
    ['https://example.com/v1/chat/completions/', 'https://example.com/v1/chat/completions']
  ]) {
    assert.equal(E.endpoint(base).href, expected);
    assert.equal(E.endpoint(E.endpoint(base).href).href, expected);
  }
});
function worker(overrides = {}) {
  let listener, changed, requests = [], accessLevel, aborted = false, timeout, analysisPreferences;
  const config = { enabled: true, model: 'mock-model', endpoint: 'https://provider.example/v1/chat/completions', apiKey: 'test-key', ...overrides.config };
  const context = { MJAnalysis: A, MJModelEndpoint: E, MJAgent: require('../extension/agent.js'), importScripts() {}, TextDecoder, Uint8Array, AbortController,
    setTimeout: overrides.manualTimer ? fn => { timeout = fn; return 1; } : setTimeout,
    clearTimeout: overrides.manualTimer ? () => {} : clearTimeout,
    chrome: { storage: { local: { setAccessLevel: value => { accessLevel = value; }, get: async () => ({ modelConfig: config, analysisPreferences }), set: async value => { analysisPreferences = value.analysisPreferences; } }, onChanged: { addListener: fn => { changed = fn; } } },
      permissions: { contains: async () => overrides.permission !== false },
      runtime: { id: 'extension-id', getURL: path => 'chrome-extension://extension-id/' + path, openOptionsPage() {}, onMessage: { addListener: fn => { listener = fn; } } } },
    fetch: async (url, options) => {
      requests.push({ url, options });
      if (overrides.wait) return new Promise((resolve, reject) => options.signal.addEventListener('abort', () => { aborted = true; reject(new DOMException('abort', 'AbortError')); }));
      if (overrides.networkError) throw new TypeError('network');
      return new Response(overrides.raw ?? JSON.stringify(overrides.body ?? { choices: [{ message: { content: JSON.stringify({ task: 'combined', danger: [], efficiency: [], decision: { action: 'unknown', tile: null, reasons: ['数据不足，无法建议弃牌。'] }, limitations: ['测试手牌数量不完整。'] }) } }] }), { status: overrides.status || 200 });
    } };
  vm.runInNewContext(fs.readFileSync(require.resolve('../extension/background.js'), 'utf8'), context);
  const sender = { id: 'extension-id', tab: { id: 7 }, frameId: 0, url: 'https://game.maj-soul.com/1/' };
  const call = (message, from = sender) => new Promise(resolve => { if (listener(message, from, resolve) !== true) resolve(undefined); });
  const analyze = (task = 'both', selection = { game: true, hand: true, rivers: 'all' }) => call({ type: 'model:analyze', task, snapshot: C.snapshot(state('live'), selection) });
  return { call, analyze, requests, expire: () => timeout(), changed: (...args) => changed(...args), sender, accessLevel, get aborted() { return aborted; } };
}
test('worker authenticates sender, keeps credentials out of status and uses non-streaming bounded request', async () => {
  const w = worker(); assert.equal(w.accessLevel.accessLevel, 'TRUSTED_CONTEXTS');
  assert.equal(await w.call({ type: 'model:analyze' }, { ...w.sender, id: 'other' }), undefined);
  assert.equal(await w.call({ type: 'model:analyze' }, { ...w.sender, frameId: 1 }), undefined);
  const status = await w.call({ type: 'model:status' }); assert.equal('apiKey' in status, false);
  const result = await w.analyze(); assert.equal(result.ok, true); assert.match(result.result.decision.reasons[0], /数据不足/); assert.ok(result.localAnalysis.efficiency);
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

function prepared(task = 'combined', selection = { game: true, hand: true, rivers: 'all' }) {
  const s = state('live'); s.selfHand = ['1m','2m','3m','4m','5m','6m','7m','8m','9m','1s','2s','3s','4z','4z'];
  return A.prepare(C.snapshot(s, selection), task);
}
function answer(task = 'combined') {
  return { task, danger: [{ tile: '1m', opponents: [{ seat: 2, level: 'medium', reasons: ['牌河依据有限。'] }] }],
    efficiency: [{ tile: '1m', reasons: ['参考本地计算。'] }], decision: { action: 'defend', tile: '1m', reasons: ['保留安全牌。'] }, limitations: ['测试数据不完整。'] };
}
test('task contracts split ordered defensive rivers from efficiency counts and preserve nullable flags', () => {
  const s = state('live'); s.players[2].discards.push({ tile: '9m', tsumogiri: false }); s.players[2].discards.push({ tile: '8m' });
  const snap = C.snapshot(s, { game: true, hand: true, rivers: 'all' });
  assert.deepEqual(snap.rivers[2].discards.map(d => d.tsumogiri), [true, false, null]);
  const danger = A.prepare(snap, 'danger');
  assert.deepEqual(danger.data.danger.rivers[2].discards.map(d => d.tile), ['3p', '9m', '8m']);
  assert.equal('efficiency' in danger.data, false); assert.match(danger.systemPrompt, /按每位对手/);
  const efficiency = A.prepare(snap, 'discard'); assert.equal(efficiency.task, 'efficiency');
  assert.equal('danger' in efficiency.data, false); assert.equal(JSON.stringify(efficiency.data).includes('tsumogiri'), false);
  assert.equal(JSON.stringify(efficiency.data).includes('discards'), false);
  assert.equal(efficiency.data.efficiency.visibleTiles.counts['9m'], 1);
  assert.equal(efficiency.responseSchema.properties.task.enum[0], 'efficiency');
  assert.equal(A.prepare(snap, 'both').task, 'combined'); assert.throws(() => A.prepare(snap, 'bad'), /任务/);
});
test('prepared data never derives from unselected scopes and strips unsolicited fields', () => {
  const snap = C.snapshot(state('live'), { rivers: '2', hand: false });
  snap.secret = 'PRIVATE'; snap.localAnalysis = { shanten: -99 }; snap.rivers[0].discards[0].instruction = 'SECRET';
  const p = A.prepare(snap, 'efficiency');
  assert.deepEqual(p.data.authorization, { game: false, riverSeats: [2], selfHand: false });
  assert.deepEqual(p.data.efficiency.visibleTiles.counts, { '3p': 1 }); assert.equal(p.data.efficiency.visibleTiles.partial, true);
  assert.equal(p.data.localAnalysis.efficiency.status, 'unavailable'); assert.equal('shanten' in p.data.localAnalysis, false); assert.equal(JSON.stringify(p).includes('PRIVATE'), false); assert.equal(JSON.stringify(p).includes('SECRET'), false);
  assert.equal('selfHand' in p.data.efficiency, false);
  assert.throws(() => A.prepare({ ...snap, rivers: [...snap.rivers, ...snap.rivers] }, 'danger'), /牌河/);
});
test('visible counts canonicalize red fives, count north extractions and avoid double counting called discards', () => {
  const s = state('live'); s.players[0].melds = [{ type: 1, tiles: ['3p', '4p', '5p'], froms: [2, 0, 0] }];
  s.players[2].discards[0].called = true; s.players[3].norths = 1;
  const snap = C.snapshot(s, { game: true, hand: true, rivers: 'all' });
  const p = A.prepare(snap, 'efficiency'); const counts = p.data.efficiency.visibleTiles.counts;
  assert.equal(counts['3p'], 1); assert.equal(counts['5p'], 2); assert.equal(counts['4z'], 1);
  assert.deepEqual(A.prepare(snap, 'danger').data.danger.game.players[0].melds[0].froms, [2, 0, 0]);
  delete snap.game; assert.equal(A.prepare(snap, 'efficiency').data.efficiency.visibleTiles.counts['3p'], 1);
});
test('strict structured result parser validates tasks, self hand suggestions and opponent risk', () => {
  const p = prepared(); const value = answer(); assert.deepEqual(A.parseResult(JSON.stringify(value), p), value);
  for (const mutate of [
    x => { x.task = 'danger'; }, x => { x.extra = 1; }, x => { x.efficiency[0].tile = '9z'; },
    x => { x.efficiency[0].tile = '9p'; }, x => { x.decision.tile = '5p'; },
    x => { x.danger[0].opponents[0].seat = 1; }, x => { x.danger[0].opponents[0].probability = 0.2; },
    x => { x.danger[0].opponents.push(x.danger[0].opponents[0]); }, x => { x.efficiency[0].shanten = 0; }
  ]) { const invalid = answer(); mutate(invalid); assert.throws(() => A.parseResult(JSON.stringify(invalid), p)); }
  assert.deepEqual(A.parseResult('```json\n' + JSON.stringify(value) + '\n```', p), value);
  const noHand = prepared('combined', { game: true, rivers: 'none' });
  assert.throws(() => A.parseResult(JSON.stringify(value), noHand));
  value.danger[0].opponents[0].level = 'unknown'; value.efficiency = []; value.decision = { action: 'unknown', tile: null, reasons: [] };
  assert.deepEqual(A.parseResult(JSON.stringify(value), noHand), value);
  assert.throws(() => A.parseResult(JSON.stringify(value), prepared('efficiency')));
  value.task = 'danger'; assert.deepEqual(A.parseResult(JSON.stringify(value), prepared('danger')), value);
});

test('worker uses separate task prompts, previews actual data and rejects malformed model recommendations', async () => {
  for (const task of ['danger', 'efficiency', 'combined']) {
    const value = { task, danger: [], efficiency: [], decision: { action: 'unknown', tile: null, reasons: ['数据不足。'] }, limitations: ['请补充完整手牌。'] };
    const w = worker({ body: { choices: [{ message: { content: '```json\n' + JSON.stringify(value) + '\n```' } }] } });
    assert.equal((await w.analyze(task)).ok, true);
    const body = JSON.parse(w.requests[0].options.body);
    const data = JSON.parse(body.messages[1].content.split('\n')[1]);
    assert.equal(data.task, task); assert.equal('response_format' in body, false);
    assert.equal('danger' in data.localAnalysis, task !== 'efficiency');
    assert.equal('efficiency' in data.localAnalysis, task !== 'danger');
    if (task === 'efficiency') assert.equal(JSON.stringify(data).includes('tsumogiri'), false);
    if (task === 'combined') { assert.match(body.messages[0].content, /任务：防守风险分析/); assert.match(body.messages[0].content, /任务：牌效率分析/); }
    const preview = await w.call({ type: 'model:prepare', task, snapshot: C.snapshot(state('live'), { game: true, hand: true, rivers: 'all' }) });
    assert.deepEqual(preview.data, data); assert.equal(w.requests.length, 1);
  }
  const w = worker({ body: { choices: [{ message: { content: JSON.stringify(answer()) } }] } });
  const bad = await w.analyze(); assert.equal(bad.ok, false); assert.match(bad.error, /结构化/);
});
test('parser prevents discarding before draw, on ended snapshots, unknown riichi draws and false safe claims', () => {
  const s = state('live'); s.selfHand = ['1m','2m','3m','4m','5m','6m','7m','8m','9m','1s','2s','3s','4z'];
  const prepareState = () => A.prepare(C.snapshot(s, { game: true, hand: true, rivers: 'all' }), 'combined');
  assert.throws(() => A.parseResult(JSON.stringify(answer()), prepareState()));
  s.selfHand.push('4z'); s.phase = 'ended'; assert.throws(() => A.parseResult(JSON.stringify(answer()), prepareState()));
  s.phase = 'playing'; s.players[1].riichi = true;
  assert.throws(() => A.parseResult(JSON.stringify(answer()), prepareState()));
  s.drawnTiles[1] = '1m'; assert.doesNotThrow(() => A.parseResult(JSON.stringify(answer()), prepareState()));
  const falseSafe = answer(); falseSafe.danger[0].opponents[0].level = 'safe';
  assert.throws(() => A.parseResult(JSON.stringify(falseSafe), prepareState()));
  const empty = { task: 'combined', danger: [], efficiency: [], decision: { action: 'unknown', tile: null, reasons: [] }, limitations: [] };
  assert.throws(() => A.parseResult(JSON.stringify(empty), prepareState()));
});

test('unknown self seat permits general danger evidence for all four visible seats', () => {
  const s = state('live'); s.selfSeat = null; s.players[0].discards = [{ tile: '1m', tsumogiri: true }];
  const p = A.prepare(C.snapshot(s, { game: true, rivers: 'all' }), 'danger');
  assert.equal(p.responseSchema.properties.danger.items.properties.opponents.maxItems, 4);
  const value = { task: 'danger', danger: [{ tile: '1m', opponents: [0,1,2,3].map(seat => ({ seat, level: seat === 0 ? 'safe' : 'unknown', reasons: ['一般危险牌分析。'] })) }], efficiency: [], decision: { action: 'unknown', tile: null, reasons: [] }, limitations: ['未指定自家，不提供弃牌建议。'] };
  assert.deepEqual(A.parseResult(JSON.stringify(value), p), value);
});

test('analysis preferences persist only whitelisted booleans and bounded scheduling values', async () => {
  const w = worker();
  const response = await w.call({ type: 'model:preferences', preferences: { useModel: true, consent: true, automatic: true, danger: true, modelFromTurn: 99, interval: -1, limit: 'invalid', apiKey: 'do-not-store' } });
  assert.equal(response.ok, true);
  const status = await w.call({ type: 'model:status' });
  assert.equal(status.preferences.modelFromTurn, 18); assert.equal(status.preferences.interval, 1); assert.equal(status.preferences.limit, 20);
  assert.equal(status.preferences.useModel, true); assert.equal('apiKey' in status.preferences, false);
  assert.equal(w.requests.length, 0);
  assert.equal(await w.call({ type: 'model:preferences', preferences: {} }, { ...w.sender, frameId: 1 }), undefined);
});
