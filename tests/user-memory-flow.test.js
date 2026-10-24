const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const Controller = require('../extension/collector/controller.js');
const State = require('../extension/state.js'), History = require('../extension/history.js');
const Snapshot = require('../extension/collector/snapshot-adapter.js');
const Capture = require('../extension/user-memory-capture.js');
const Mahjong = require('../extension/mahjong-analysis.js');
const extension = path.resolve(__dirname, '../extension');
const clone = value => structuredClone(value);

function storage() {
  const values = { modelConfig: { enabled: true, provider: 'chat', endpoint: 'https://mock.invalid/v1', model: 'fixture-model', maxTokens: 8192 } };
  return { values, async setAccessLevel() {}, async get(keys) {
    if (keys == null) return clone(values);
    if (typeof keys === 'string') return clone({ [keys]: values[keys] });
    if (Array.isArray(keys)) return clone(Object.fromEntries(keys.map(k => [k, values[k]])));
    return clone(Object.fromEntries(Object.entries(keys).map(([k, v]) => [k, values[k] ?? v])));
  }, async set(next) { Object.assign(values, clone(next)); }, async remove(keys) { for (const key of [].concat(keys)) delete values[key]; } };
}

async function environment({ enabled = false } = {}) {
  const local = storage(), listeners = [], requests = [], messages = [], histories = [], packedSizes = [], packedPayloads = [];
  class MeasuredEncoder extends TextEncoder {
    encode(value) {
      const bytes = super.encode(value);
      if (typeof value === 'string' && value.includes('"evidenceVersion":1') && value.startsWith('{"id":')) { packedSizes.push(bytes.length); packedPayloads.push(value); }
      return bytes;
    }
  }
  let context, id = 0;
  context = vm.createContext({ AbortController, DOMException, Response, TextEncoder: MeasuredEncoder, TextDecoder, Uint8Array, URL,
    setTimeout, clearTimeout, structuredClone, crypto: webcrypto, performance,
    chrome: { storage: { local, onChanged: { addListener() {} } }, permissions: { contains: async () => true },
      runtime: { id: 'memory-flow', getURL: f => 'chrome-extension://memory-flow/' + f,
        onMessage: { addListener: fn => listeners.push(fn) }, openOptionsPage() {} },
      tabs: { query: async () => [], sendMessage: async () => {} } },
    importScripts(...files) { for (const file of files) vm.runInContext(fs.readFileSync(path.join(extension, file), 'utf8'), context, { filename: file }); },
    fetch: async (url, options) => {
      assert.equal(url, 'https://mock.invalid/v1/chat/completions', 'all HTTP is intercepted; no provider endpoint is used');
      const body = JSON.parse(options.body); requests.push(body);
      assert.equal(body.max_tokens, 2048, 'memory output has its own bounded budget');
      assert.equal(body.tools, undefined, 'match summaries have no model tools');
      assert.equal(body.stream, false);
      const evidence = JSON.parse(body.messages.find(m => m.role === 'user').content);
      const count = evidence.rounds.reduce((n, r) => n + r.decisions.length, 0);
      const candidate = { kind: 'observation', text: '本场已记录多次真实弃牌，可供后续复盘确认。', context: '已授权完整自家弃牌机会',
        matchId: evidence.id, evidenceIds: [evidence.rounds[0].decisions[0].id], samples: 1,
        situation: 'any', behavior: 'discard', opportunities: count };
      return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ candidates: [candidate] }) } }],
        usage: { prompt_tokens: 100, completion_tokens: 50, prompt_tokens_details: { cached_tokens: 0 } } }), { status: 200 });
    } });
  vm.runInContext(fs.readFileSync(path.join(extension, 'background.js'), 'utf8'), context, { filename: 'background.js' });
  const game = { id: 'memory-flow', tab: { id: 31 }, frameId: 0, url: 'https://game.maj-soul.com/1/' };
  const options = { id: 'memory-flow', url: 'chrome-extension://memory-flow/options.html' };
  const call = (message, sender = game) => new Promise(resolve => {
    messages.push(clone(message)); let async = false, done = false;
    for (const listener of listeners) if (listener(message, sender, value => { done = true; resolve(clone(value)); }) === true) async = true;
    if (!async && !done) resolve();
  });
  const controller = Controller.create({ state: State, history: History, id: () => 'fixture-' + ++id,
    clock: () => 1700000000000, hash: async () => 'flow-replay',
    storage: { load: async () => [], save: async match => { histories.push(clone(match)); } } });
  await controller.ready;
  const capture = Capture.create({ send: call, snapshot: Snapshot.snapshot });
  const status = () => call({ type: 'memory:status' }, options);
  async function settle() { await capture.flush(); await controller.flush(); await vm.runInContext('memoryWorker.pump()', context); for(let n=0;n<100;n++){ const value=await status(); if(!value.jobs.some(j=>['queued','running'].includes(j.status)))return; await new Promise(resolve=>setImmediate(resolve)); } throw new Error('Memory mock worker did not settle'); }
  async function receive(message) {
    const before = controller.getView(); controller.receive(message); const after = controller.getView();
    capture.record(before, message, after, 'AI建议与用户真实动作分离'); await capture.flush();
    return after;
  }
  if (enabled) assert.equal((await call({ type: 'memory:configure', enabled: true }, options)).ok, true);
  await capture.status(); await settle();
  return { local, requests, messages, histories, packedSizes, packedPayloads, controller, capture, status, settle, receive,
    pack(match) { context.__flowMatch = clone(match); try { return vm.runInContext('MJUserMemoryAgent.pack(__flowMatch)', context); } finally { delete context.__flowMatch; } },
    event: event => receive({ type: 'event', payload: { source: 'live', ...event } }) };
}

function shuffledWall(seed) {
  const wall = [];
  for (const suit of ['m', 'p', 's', 'z']) for (let n = 1; n <= (suit === 'z' ? 7 : 9); n++) for (let k = 0; k < 4; k++) wall.push(n + suit);
  let value = seed;
  for (let i = wall.length - 1; i > 0; i--) { value ^= value << 13; value ^= value >>> 17; value ^= value << 5; const j = Math.floor((value >>> 0) / 4294967296 * (i + 1)); [wall[i], wall[j]] = [wall[j], wall[i]]; }
  return wall;
}
function conserve(hands, rivers, remaining) {
  const tiles = [...hands.flat(), ...rivers.flat(), ...remaining], counts = new Map();
  for (const tile of tiles) counts.set(tile, (counts.get(tile) || 0) + 1);
  assert.equal(tiles.length, 136); assert.equal(counts.size, 34); assert.ok([...counts.values()].every(n => n === 4));
}

function applyChanges(snapshot, changes) {
  let next = clone(snapshot);
  for (const change of changes) {
    if (change.path === '') { next = clone(change.value); continue; }
    const keys = change.path.slice(1).split('/').map(k => k.replace(/~1/g, '/').replace(/~0/g, '~'));
    let parent = next;
    for (const key of keys.slice(0, -1)) parent = parent[key];
    const key = keys.at(-1);
    assert.ok(['add', 'replace'].includes(change.op), 'memory pack uses deterministic adds/replacements');
    if (Array.isArray(parent) && change.op === 'add') parent.splice(key === '-' ? parent.length : Number(key), 0, clone(change.value));
    else parent[key] = clone(change.value);
  }
  return next;
}

async function playRound(env, index, { final = false, disconnect = false, onAction } = {}) {
  const wall = shuffledWall(20261024 + index), hands = Array.from({ length: 4 }, (_, seat) => wall.slice(seat * 13, seat * 13 + 13));
  const rivers = [[], [], [], []]; let cursor = 52, step = 0, ownActions = 0;
  await env.event({ kind: 'NewRound', step, wind: Math.floor(index / 4), round: index % 4, honba: 0, sticks: 0, remaining: 70,
    scores: [25000, 25000, 25000, 25000], doras: [wall[130]], hand: hands[0].slice(), operation: { seat: 0, types: [1] } });
  while (cursor < 122) {
    const seat = (index + cursor - 52) % 4, tile = wall[cursor++]; hands[seat].push(tile);
    const afterDraw = await env.event({ kind: 'DealTile', step: ++step, seat, tile: seat === 0 ? tile : '?', remaining: 122 - cursor,
      ...(seat === 0 ? { operation: { seat: 0, types: [1] } } : {}) });
    conserve(hands, rivers, wall.slice(cursor));
    if (seat === 0) { assert.deepEqual(afterDraw.live.selfHand.slice().sort(), hands[0].slice().sort()); assert.equal(afterDraw.live.selfHand.length, 14); }
    if (disconnect && ownActions === 2 && seat === 0) await env.receive({ type: 'connection', payload: { socketId: 1, state: 'closed' } });
    const actual = hands[seat].pop(); assert.equal(actual, tile); rivers[seat].push(actual);
    const after = await env.event({ kind: 'DiscardTile', step: ++step, seat, tile, tsumogiri: true, riichi: false });
    conserve(hands, rivers, wall.slice(cursor));
    if (seat === 0) { ownActions++; assert.deepEqual(after.live.selfHand.slice().sort(), hands[0].slice().sort()); if (onAction) await onAction(env, ownActions); }
  }
  assert.equal(cursor, 122); assert.equal(wall.slice(cursor).length, 14, 'dead wall is not drawn');
  const tenpai = hands.map(hand => Mahjong.shanten(hand, 0, 4, []) === 0), ready = tenpai.filter(Boolean).length;
  const scores = tenpai.map(value => 25000 + (ready > 0 && ready < 4 ? value ? 3000 / ready : -3000 / (4 - ready) : 0));
  const end = { kind: 'NoTile', step: ++step, scores, tenpai, gameEnded: final };
  await env.event(end); await env.settle();
  return { ownActions, end };
}

test('memory flow: real collector/capture/background/Pi summarizes only the explicitly ended entire match', async t => {
  const env = await environment({ enabled: true }); let actions = 0;
  for (let i = 0; i < 3; i++) {
    const result = await playRound(env, i, { final: i === 2, onAction: async e => assert.equal(e.requests.length, 0, 'no per-action/per-round request before gameEnded') });
    actions += result.ownActions;
    assert.equal(env.requests.length, i === 2 ? 1 : 0, JSON.stringify(await env.status()));
    if (i === 2) { await env.event(result.end); await env.event({ ...result.end, step: result.end.step + 1 }); await env.settle(); }
  }
  assert.ok(actions >= 20); assert.equal(env.requests.length, 1, 'duplicate final settlement cannot dispatch again');
  const status = await env.status(); assert.equal(status.jobs.length, 1); assert.equal(status.jobs[0].status, 'completed');
  assert.equal(status.jobs[0].calls, 1); assert.equal(status.entries.length, 1); assert.equal(status.entries[0].opportunities, actions);
  const match = env.local.values.agentUserMemoryV1.matches[0];
  assert.equal(match.rounds.length, 3); assert.equal(match.rounds.reduce((n, r) => n + r.decisions.length, 0), actions);
  for (const round of match.rounds) for (const evidence of round.decisions) {
    assert.equal(evidence.actual.kind, 'DiscardTile'); assert.equal(evidence.actual.seat, 0);
    assert.equal(evidence.snapshot.selfHand.length, 14); assert.ok(evidence.snapshot.selfHand.includes(evidence.actual.tile));
    assert.ok(evidence.snapshot.game.players.every(p => !Object.hasOwn(p, 'hand')), 'opponent concealed hands never enter evidence');
  }
  const body = env.requests[0], packed = body.messages.find(m => m.role === 'user').content, input = JSON.parse(packed);
  assert.equal(input.rounds.length, 3); assert.ok(input.rounds.every(r => r.decisions[0].snapshot && r.decisions.slice(1).every(d => d.changes && !d.snapshot)));
  for (const round of input.rounds) {
    let reconstructed;
    for (const evidence of round.decisions) {
      reconstructed = evidence.snapshot || applyChanges(reconstructed, evidence.changes);
      const original = match.rounds.find(r => r.id === round.id).decisions.find(d => d.id === evidence.id);
      assert.deepEqual(reconstructed, original.snapshot, 'each compressed action reconstructs its exact frozen pre-action snapshot');
      assert.deepEqual(evidence.actual, original.actual, 'actual user action survives packing without becoming model advice');
    }
  }
  const packedBytes = Buffer.byteLength(packed), rawBytes = Buffer.byteLength(JSON.stringify(match));
  assert.ok(packedBytes <= 192000); assert.ok(packedBytes < rawBytes, 'actual ordered snapshots are compressed before HTTP');
  assert.equal(body.max_tokens, 2048); assert.equal(env.histories.at(-1).closed, true); assert.equal(env.histories.at(-1).rounds.length, 3);
  t.diagnostic(JSON.stringify({ transport: 'mock fetch only; real background + Pi', rounds: 3, actualOwnActions: actions, httpCalls: env.requests.length, rawBytes, packedBytes, outputBudget: body.max_tokens }));
});

test('memory flow: disabled by default never sends evidence or summaries through a complete legal match', async () => {
  const env = await environment();
  for (let i = 0; i < 3; i++) await playRound(env, i, { final: i === 2 });
  assert.equal((await env.status()).enabled, false); assert.equal(env.requests.length, 0);
  assert.equal(env.messages.filter(m => m.type === 'memory:evidence').length, 0);
});

function measurePack(env, rounds, actions) {
  const match = env.local.values.agentUserMemoryV1.matches[0];
  try { env.pack(match); } catch (error) { assert.equal(error.code, 'MEMORY_INPUT_BUDGET'); }
  const packedBytes = env.packedSizes.at(-1), rawBytes = Buffer.byteLength(JSON.stringify(match));
  assert.ok(Number.isInteger(packedBytes)); assert.ok(packedBytes < rawBytes);
  // Observe actual pack content before its byte guard; no budget bypass or HTTP.
  for (const round of JSON.parse(env.packedPayloads.at(-1)).rounds) {
    let reconstructed;
    for (const evidence of round.decisions) {
      reconstructed = evidence.snapshot || applyChanges(reconstructed, evidence.changes);
      assert.deepEqual(reconstructed, match.rounds.find(r => r.id === round.id).decisions.find(d => d.id === evidence.id).snapshot);
    }
  }
  return { rounds, actualOwnActions: actions, rawBytes, packedBytes, inputBudget: 192000, oversized: packedBytes > 192000 };
}

test('memory flow: four/eight exhaustive rounds fit the input budget and the entire eight-round match uses one HTTP', async t => {
  const env = await environment({ enabled: true }), sizes = []; let actions = 0;
  for (let i = 0; i < 8; i++) {
    actions += (await playRound(env, i, { final: i === 7 })).ownActions;
    if (i !== 3 && i !== 7) continue;
    sizes.push(measurePack(env, i + 1, actions));
    if (i === 3) assert.equal(env.requests.length, 0, 'four small-round endings are not entire-match termination');
  }
  const status = await env.status();
  assert.ok(sizes.every(s => !s.oversized));
  assert.equal(status.jobs.length, 1); assert.equal(status.jobs[0].status, 'completed');
  assert.equal(env.requests.length, 1); assert.equal(status.entries.length, 1);
  assert.equal(env.requests[0].max_tokens, 2048);
  t.diagnostic(JSON.stringify({ transport: 'one mocked HTTP at entire-match end', sizes, status: status.jobs[0].status }));
});

test('memory flow: a twelve-round oversized final match has an explicit budget-exceeded job and zero HTTP', async t => {
  const env = await environment({ enabled: true }); let actions = 0;
  for (let i = 0; i < 12; i++) {
    actions += (await playRound(env, i, { final: i === 11 })).ownActions;
    assert.equal(env.requests.length, 0);
  }
  const size = measurePack(env, 12, actions), status = await env.status();
  assert.equal(size.oversized, true, 'extended match actually exercises the hard input limit');
  assert.equal(status.jobs.length, 1); assert.equal(status.jobs[0].status, 'budget-exceeded');
  assert.equal(env.requests.length, 0); assert.equal(status.entries.length, 0);
  t.diagnostic(JSON.stringify({ transport: 'no HTTP; actual pack byte instrumentation', ...size, status: status.jobs[0].status }));
});

test('memory flow: replay and a historical view exclude live learning even when an entire match ends', async () => {
  for (const mode of ['replay', 'historical']) {
    const env = await environment({ enabled: true });
    if (mode === 'replay') env.controller.setMode('replay');
    else {
      await playRound(env, 0); const match = env.controller.getView().historyMatches[0];
      env.controller.viewRound(match.id, match.rounds[0].key);
      assert.ok(env.controller.getView().historical);
    }
    const before = env.messages.filter(m => m.type === 'memory:evidence').length;
    for (let i = 1; i <= 3; i++) await playRound(env, i, { final: i === 3 });
    assert.equal(env.messages.filter(m => m.type === 'memory:evidence').length, before, mode);
    assert.equal(env.requests.length, 0, mode); assert.equal((await env.status()).entries.length, 0, mode);
  }
});

test('memory flow: replay-sourced events are ignored by capture even while the selected view is live', async () => {
  const env = await environment({ enabled: true });
  await playRound(env, 0);
  const before = env.messages.filter(m => m.type === 'memory:evidence').length;
  for (const kind of ['NewRound', 'DealTile', 'DiscardTile', 'NoTile']) {
    await env.receive({ type: 'event', payload: { source: 'replay', kind, recordIndex: 1, step: 1, seat: 0, tile: '1m', gameEnded: true } });
  }
  await env.settle();
  assert.equal(env.messages.filter(m => m.type === 'memory:evidence').length, before);
  assert.equal(env.requests.length, 0); assert.equal((await env.status()).entries.length, 0);
});

test('memory flow: a disconnect invalidates the whole match rather than learning from later reliable rounds', async () => {
  const env = await environment({ enabled: true });
  for (let i = 0; i < 3; i++) await playRound(env, i, { final: i === 2, disconnect: i === 0 });
  assert.ok(env.messages.some(m => m.type === 'memory:evidence' && m.evidence.kind === 'Interrupted'));
  const status = await env.status(); assert.equal(status.jobs.length, 1); assert.equal(status.jobs[0].status, 'insufficient');
  assert.equal(env.requests.length, 0); assert.equal(status.entries.length, 0);
});
