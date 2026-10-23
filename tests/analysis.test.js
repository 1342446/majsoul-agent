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
  const notifications = [], tabQueries = [];
  const config = { enabled: true, model: 'mock-model', endpoint: 'https://provider.example/v1/chat/completions', apiKey: 'test-key', ...overrides.config };
  const context = { MJAnalysis: A, MJModelEndpoint: E, MJAgent: require('../extension/agent.js'), importScripts() {}, TextDecoder, Uint8Array, AbortController,
    setTimeout: overrides.manualTimer ? fn => { timeout = fn; return 1; } : setTimeout,
    clearTimeout: overrides.manualTimer ? () => {} : clearTimeout,
    chrome: { storage: { local: { setAccessLevel: value => { accessLevel = value; }, get: async () => ({ modelConfig: config, analysisPreferences }), set: async value => { analysisPreferences = value.analysisPreferences; } }, onChanged: { addListener: fn => { changed = fn; } } },
      tabs: { query: async query => { tabQueries.push(query); return [{ id: 7 }, { id: 8 }]; },
        sendMessage: async (...args) => { notifications.push(args); if (args[0] === 8) throw new Error('Tab closed'); } },
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
  return { call, analyze, requests, notifications, tabQueries, expire: () => timeout(), changed: (...args) => changed(...args), sender, accessLevel, get aborted() { return aborted; } };
}

test('failed structured responses preserve original final content and identify missing fields', async () => {
  const content = '  ```json\n{"task":"combined","note":"<img onerror=bad>"}\n```  ';
  const w = worker({ body: { choices: [{ finish_reason: 'stop', message: { content, reasoning_content: 'PRIVATE_REASONING' } }] } });
  const response = await w.analyze();
  assert.equal(response.ok, false);
  assert.equal(response.rawModelResult.content, content);
  assert.equal(response.rawModelResult.model, 'mock-model');
  assert.equal(response.rawModelResult.finishReason, 'stop');
  assert.equal(response.rawModelResult.truncated, false);
  assert.ok(Number.isFinite(Date.parse(response.rawModelResult.capturedAt)));
  assert.equal(response.validation.code, 'missing_fields');
  assert.equal(response.validation.path, 'result');
  assert.match(response.error, /danger、efficiency、decision、limitations/);
  assert.doesNotMatch(JSON.stringify(response), /test-key|provider\.example|PRIVATE_REASONING|Authorization/);
  assert.equal(w.requests.length, 1);
});

test('raw diagnostics are bounded and absent on success, network failure and cancellation', async () => {
  const content = 'x'.repeat(32001);
  const response = await worker({ body: { choices: [{ message: { content } }] } }).analyze();
  assert.equal(response.rawModelResult.content, content.slice(0, 32000));
  assert.equal(response.rawModelResult.truncated, true);
  for (const w of [worker(), worker({ networkError: true })]) {
    assert.equal('rawModelResult' in await w.analyze(), false);
  }
  const w = worker({ wait: true }); const pending = w.analyze();
  await new Promise(resolve => setImmediate(resolve));
  await w.call({ type: 'model:cancel' });
  assert.equal('rawModelResult' in await pending, false);
});

test('official DeepSeek Flash disables default thinking without changing other providers', async () => {
  for (const [endpoint, model, disabled] of [
    ['https://api.deepseek.com/chat/completions', 'deepseek-flash', true],
    ['https://api.deepseek.com/v1/chat/completions', 'deepseek-v4-pro', true],
    ['https://api.deepseek.com/chat/completions', 'deepseek-reasoner', false],
    ['https://provider.example/chat/completions', 'deepseek-flash', false]
  ]) {
    const w = worker({ config: { endpoint, model } });
    assert.equal((await w.analyze()).ok, true);
    const body = JSON.parse(w.requests[0].options.body);
    assert.equal(body.thinking?.type, disabled ? 'disabled' : undefined);
    assert.equal(body.max_tokens, 8192); assert.equal(w.requests.length, 1);
  }
});

test('worker distinguishes incomplete reasoning, truncation and service failures without exposing response text', async () => {
  for (const [body, expected] of [
    [{ choices: [{ finish_reason: 'length', message: { content: '', reasoning_content: 'PRIVATE' } }] }, /长度上限/],
    [{ choices: [{ finish_reason: 'length', message: { content: '{}' } }] }, /长度上限/],
    [{ choices: [{ message: { content: null, reasoning_content: 'PRIVATE' } }] }, /仅返回思考内容/],
    [{ choices: [{ finish_reason: 'content_filter', message: { content: '' } }] }, /过滤/],
    [{ choices: [{ finish_reason: 'insufficient_system_resource' }] }, /服务中断/],
    [{ choices: [{ finish_reason: 'aborted' }] }, /服务中断/],
    [{ error: { message: 'PRIVATE' } }, /接口返回错误/],
    [{ choices: [{ message: { content: [] } }] }, /正文为空或格式不兼容/],
    [null, /正文为空或格式不兼容/]
  ]) {
    const w = worker({ raw: JSON.stringify(body) }); const result = await w.analyze();
    assert.equal(result.ok, false); assert.match(result.error, expected);
    assert.doesNotMatch(result.error, /PRIVATE|Chat Completions/); assert.equal(w.requests.length, 1);
  }
});

test('worker honors thinking and configured token limits, with safe defaults for legacy configs', async () => {
  for (const [config, max, thinking] of [
    [{}, 8192, 'disabled'],
    [{ thinking: true }, 32768, 'enabled'],
    [{ thinking: true, maxTokens: 20000 }, 20000, 'enabled'],
    [{ thinking: false, maxTokens: 12000 }, 12000, 'disabled']
  ]) {
    const w = worker({ config: { endpoint: 'https://api.deepseek.com', model: 'deepseek-flash', ...config } });
    assert.equal((await w.analyze()).ok, true);
    const body = JSON.parse(w.requests[0].options.body);
    assert.equal(body.max_tokens, max); assert.equal(body.thinking.type, thinking);
  }
  for (const maxTokens of [0, 1.5, 393217, '8192']) {
    const w = worker({ config: { maxTokens } });
    assert.match((await w.analyze()).error, /输出上限/); assert.equal(w.requests.length, 0);
  }
  const other = worker({ config: { thinking: true, maxTokens: 15000 } });
  assert.equal((await other.analyze()).ok, true);
  const body = JSON.parse(other.requests[0].options.body);
  assert.equal(body.max_tokens, 15000); assert.equal('thinking' in body, false);
});

test('trusted model configuration changes notify game tabs without disclosing configuration', async () => {
  const w = worker();
  await w.changed({ analysisPreferences: {} }, 'local');
  await w.changed({ modelConfig: {} }, 'sync');
  assert.equal(w.notifications.length, 0);
  for (const newValue of [{ enabled: true, apiKey: 'SECRET' }, { enabled: false }, undefined]) {
    await w.changed({ modelConfig: { newValue } }, 'local');
  }
  assert.equal(w.tabQueries.length, 3);
  assert.equal(w.tabQueries[0].url, 'https://game.maj-soul.com/*');
  assert.equal(w.notifications.length, 6);
  for (const [tabId, message, target] of w.notifications) {
    assert.ok([7, 8].includes(tabId));
    assert.equal(JSON.stringify(message), '{"type":"model:config-changed"}');
    assert.equal(target.frameId, 0);
  }
});
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
  for (const [options, message] of [[{ status: 401 }, /HTTP 401/], [{ raw: 'not json' }, /有效 JSON/], [{ body: {} }, /正文为空或格式不兼容/], [{ raw: 'x'.repeat(1024 * 1024 + 1) }, /响应过大/], [{ networkError: true }, /无法连接/]]) {
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
  assert.match((await first).error, /超时/);
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

test('result validation identifies the failed rule without exposing model text or mistaking null entries for network errors', async () => {
  const p = prepared();
  for (const [mutate, code, path] of [
    [x => { delete x.decision; }, 'missing_fields', 'result'],
    [x => { x.PRIVATE = 'MODEL_SECRET'; }, 'extra_fields', 'result'],
    [x => { x.danger = [null]; }, 'object_type', 'danger[0]'],
    [x => { x.danger[0].opponents = [null]; }, 'object_type', 'danger[0].opponents[0]'],
    [x => { x.efficiency = [null]; }, 'object_type', 'efficiency[0]'],
    [x => { x.decision.tile = '9p'; }, 'illegal_decision_tile', 'decision.tile'],
    [x => { x.danger[0].opponents[0].level = 'safe'; }, 'unsupported_safe', 'danger[0].opponents[0].level'],
    [x => { x.efficiency.push(x.efficiency[0]); }, 'duplicate_entry', 'efficiency']
  ]) {
    const value = answer(); mutate(value);
    assert.throws(() => A.parseResult(value, p), error => {
      assert.deepEqual(error.validation, { code, path });
      assert.doesNotMatch(error.message, /PRIVATE|MODEL_SECRET/); assert.notEqual(error.name, 'TypeError'); return true;
    });
  }
  const value = answer(); value.danger = [null];
  const w = worker({ body: { choices: [{ message: { content: JSON.stringify(value) } }] } });
  const result = await w.analyze();
  assert.equal(result.ok, false); assert.equal(result.validation.code, 'object_type');
  assert.match(result.error, /条目应为对象/); assert.doesNotMatch(result.error, /无法连接/);
  assert.equal(w.requests.length, 1);
});

test('per-position schema reflects exact legal discards, task scopes, riichi draws and opponent seats', () => {
  const p = prepared(), schema = p.responseSchema.properties;
  assert.deepEqual(schema.decision.properties.tile.enum, [...p.data.localAnalysis.efficiency.candidates.map(c => c.tile), null]);
  assert.deepEqual(schema.danger.items.properties.opponents.items.properties.seat.enum, [0,2,3]);
  assert.equal(prepared('danger').responseSchema.properties.efficiency.maxItems, 0);
  assert.deepEqual(prepared('danger').responseSchema.properties.decision.properties.tile.enum, [null]);
  assert.equal(prepared('efficiency').responseSchema.properties.danger.maxItems, 0);
  const s = state('live'); s.selfHand = ['1m','2m','3m','4m','5m','6m','7m','8m','9m','1s','2s','3s','4z'];
  const prepareState = () => A.prepare(C.snapshot(s, { game: true, hand: true, rivers: 'all' }), 'combined');
  assert.deepEqual(prepareState().responseSchema.properties.decision.properties.tile.enum, [null]);
  s.selfHand.push('4z'); s.players[1].riichi = true; s.drawnTiles[1] = '4z';
  assert.deepEqual(prepareState().responseSchema.properties.decision.properties.tile.enum, ['4z',null]);
  s.phase = 'ended'; assert.deepEqual(prepareState().responseSchema.properties.decision.properties.tile.enum, [null]);
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
  assert.equal(status.preferences.useModel, true); assert.equal('consent' in status.preferences, false); assert.equal('apiKey' in status.preferences, false);
  assert.equal(w.requests.length, 0);
  assert.equal(await w.call({ type: 'model:preferences', preferences: {} }, { ...w.sender, frameId: 1 }), undefined);
});
