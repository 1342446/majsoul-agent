const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const M = require('../extension/user-memory.js');
const Agent = require('../extension/user-memory-agent.js');
const Capture = require('../extension/user-memory-capture.js');
function storage() {
  const values = {};
  return { values, async get(key) { return structuredClone({ [key]: values[key] }); }, async set(next) { Object.assign(values, structuredClone(next)); } };
}
function snapshot(position = 1) {
  return { format: 'mj-analysis-v1', source: 'live', playerCount: 4, complete: true, phase: 'playing', selfSeat: 0, lastStep: position - 1,
    selfHand: ['1m','2m','3m','4m','5m','6m','7m','8m','9m','1p','2p','3p','4p','5p'], apiKey: 'DO_NOT_STORE',
    game: { round: { wind: 0, index: 0 }, honba: 0, sticks: 0, remaining: 40, doras: ['1m'], scores: [25000,25000,25000,25000],
      turnProgress: { status: 'known', source: 'events', bySeat: [2,2,2,2] }, players: Array.from({ length: 4 }, (_, seat) => ({ seat, melds: [], norths: 0, riichi: false, hand: ['7z'] })) },
    rivers: Array.from({ length: 4 }, (_, seat) => ({ seat, discards: [] })) };
}
function event(round, position, kind, extra = {}) {
  return { source: 'live', matchId: 'm1', roundId: `r${round}`, position, kind, selfSeat: 0, identityKnown: true, reliable: true,
    ...(kind === 'DiscardTile' ? { snapshot: snapshot(position), actual: { seat: 0, tile: '5p', riichi: false }, advice: 'AI advice is separate' } : {}), ...extra };
}
async function round(store, index, { decisions = 7, final = false, reliable = true, identityKnown = true } = {}) {
  await store.ingest(event(index, 0, 'NewRound', { reliable, identityKnown }));
  for (let n = 1; n <= decisions; n++) await store.ingest(event(index, n, 'DiscardTile', { reliable, identityKnown }));
  return store.ingest(event(index, decisions + 1, 'Hule', { gameEnded: final, reliable, identityKnown }));
}
async function eligible(store) { await store.configure(true); for (let n = 0; n < 3; n++) await round(store, n, { final: n === 2 }); }
function candidate(match, extra = {}) {
  return { candidates: [{ kind: 'observation', text: '这场已记录弃牌动作，留作复盘候选。', context: '已授权完整自家弃牌机会', situation: 'any', behavior: 'discard',
    matchId: match.id, evidenceIds: [match.rounds[0].decisions[0].id], samples: 1, opportunities: 21, ...extra }] };
}
test('any number of small-round endings never queues a summary; only explicit entire-match ending and sufficient evidence do', async () => {
  const s = M.create({ storage: storage() }); await s.configure(true);
  for (let n = 0; n < 8; n++) { await round(s, n); assert.equal(await s.claim(), null); }
  assert.equal((await s.status()).jobs.length, 0);
  await s.ingest(event(7, 9, 'NoTile', { gameEnded: true }));
  const claimed = await s.claim(); assert.ok(claimed); assert.equal(claimed.job.calls, 1);
  assert.equal(await s.claim(), null);
});
test('thresholds reject insufficient, unknown identity, incomplete rounds, interrupted, replay, and missing hand', async () => {
  for (const mode of ['few-rounds', 'few-decisions', 'identity', 'incomplete', 'interrupted', 'missing-hand']) {
    const s = M.create({ storage: storage() }); await s.configure(true);
    for (let n = 0; n < (mode === 'few-rounds' ? 2 : 3); n++) {
      await s.ingest(event(n, 0, 'NewRound', { identityKnown: mode !== 'identity' }));
      for (let p = 1; p <= (mode === 'few-decisions' ? 3 : 7); p++) {
        const e = event(n, p, 'DiscardTile', { reliable: mode !== 'incomplete', identityKnown: mode !== 'identity' });
        if (mode === 'missing-hand') delete e.snapshot.selfHand;
        await s.ingest(e);
      }
      if (mode === 'interrupted' && n === 0) await s.ingest(event(n, 8, 'Interrupted'));
      await s.ingest(event(n, 9, 'LiuJu', { gameEnded: n === (mode === 'few-rounds' ? 1 : 2), identityKnown: mode !== 'identity' }));
    }
    assert.equal(await s.claim(), null, mode); assert.equal((await s.status()).jobs.at(-1).status, 'insufficient', mode);
  }
  const s = M.create({ storage: storage() }); await s.configure(true);
  await assert.rejects(s.ingest(event(0, 0, 'NewRound', { source: 'replay' })), /identity/);
});
test('frozen match/job deduplicate repeated endings and event replay; restart never redispatches potentially billed running jobs', async () => {
  const local = storage(), s = M.create({ storage: local }); await eligible(s);
  await round(s, 2, { final: true }); assert.equal((await s.status()).jobs.length, 1);
  const restarted = M.create({ storage: local }); const c = await restarted.claim(); assert.ok(c);
  const again = M.create({ storage: local }); assert.equal(await again.claim(), null); assert.equal((await again.status()).jobs[0].status, 'uncertain');
  await again.ingest(event(2, 10, 'Hule', { gameEnded: true })); assert.equal((await again.status()).jobs.length, 1);
});
test('snapshot whitelist strips hidden hands and secrets; model invented citations or context denominators are rejected', async () => {
  const local = storage(), s = M.create({ storage: local }); await eligible(s); const c = await s.claim();
  assert.doesNotMatch(JSON.stringify(c.match), /DO_NOT_STORE|"hand":\["7z"\]/);
  assert.throws(() => M.validateCandidates(candidate(c.match, { evidenceIds: ['made-up'] }), c.match));
  assert.throws(() => M.validateCandidates(candidate(c.match, { opportunities: 999 }), c.match));
  assert.throws(() => M.validateCandidates(candidate(c.match, { situation: 'opponent-riichi' }), c.match));
  assert.throws(() => M.validateCandidates(candidate(c.match, { behavior: 'riichi' }), c.match));
  assert.throws(() => M.validateCandidates(candidate(c.match, { kind: 'explicit-preference' }), c.match));
  await s.finish(c, candidate(c.match), { usage: null, cost: null });
  const entry = (await s.status()).entries[0]; assert.equal(entry.status, 'candidate'); assert.equal(entry.opportunities, 21);
});
test('clear, configure and manual corrections invalidate in-flight writes and cannot resurrect old memory', async () => {
  for (const operation of ['clear', 'configure', 'edit']) {
    const local = storage(), s = M.create({ storage: local }); await eligible(s); const c = await s.claim();
    if (operation === 'clear') await s.clear();
    if (operation === 'configure') await s.configure(false);
    if (operation === 'edit') await s.edit({ value: '先解释安全依据' });
    assert.equal(await s.finish(c, candidate(c.match), {}), false);
    assert.equal((await s.status()).entries.filter(e => e.status === 'candidate').length, 0);
    assert.equal((await M.create({ storage: local }).status()).entries.filter(e => e.status === 'candidate').length, 0);
  }
});
test('clear during storage persistence wins; failed clear remains a persistent cleanup barrier', async () => {
  const local = storage(), s = M.create({ storage: local }); await eligible(s); const c = await s.claim();
  const base = local.set.bind(local); let release, started;
  const reached = new Promise(resolve => { started = resolve; });
  local.set = async value => { if (value.agentUserMemoryV1.entries.some(e => e.status === 'candidate')) { started(); await new Promise(resolve => { release = resolve; }); } return base(value); };
  const finishing = s.finish(c, candidate(c.match), {}); await reached;
  const clearing = s.clear(); release(); await finishing; await clearing;
  assert.equal(local.values.agentUserMemoryV1.entries.length, 0);
  await s.edit({ value: 'old' });
  let fail = true; local.set = async value => { if (fail) throw new Error('disk full'); return base(value); };
  await assert.rejects(s.clear(), /disk full/); fail = false; await s.status();
  assert.equal((await M.create({ storage: local }).status()).entries.length, 0);
});
test('memory version pins persist across worker restart and do not change when an asynchronous summary finishes', async () => {
  const local = storage(), s = M.create({ storage: local }); await eligible(s); const c = await s.claim();
  const pin = await s.pin('tab:round1'); await s.finish(c, candidate(c.match), {});
  assert.deepEqual(await s.pin('tab:round1'), pin);
  const restart = M.create({ storage: local }); assert.deepEqual(await restart.pin('tab:round1'), pin);
  assert.equal((await restart.pin('tab:round2')).entries.length, 1);
  await restart.edit({ entryId: (await restart.status()).entries[0].id, remove: true });
  assert.equal((await restart.pin('tab:round1')).entries.length, 0);
});
test('actual Pi bundle uses a single request and no model tools for match summary (mock transport, no API)', async () => {
  const s = M.create({ storage: storage() }); await eligible(s); const c = await s.claim();
  const context = vm.createContext({ AbortController, setTimeout, clearTimeout, structuredClone, performance, TextEncoder, TextDecoder });
  vm.runInContext(fs.readFileSync(require.resolve('../extension/pi-runtime.js'), 'utf8'), context);
  let requests = 0;
  const result = await Agent.run({ match: c.match, runtime: context.MJPiRuntime, transport: async request => {
    requests++; assert.equal(request.tools.length, 0); assert.equal(request.maxTokens, 196608);
    return JSON.stringify(candidate(c.match));
  } });
  assert.equal(requests, 1); assert.equal(result.candidates.candidates.length, 1);
});
test('capture is opt-in, excludes replay/history, derives identity only from live operation, and separates actual action', async () => {
  const sent = []; const capture = Capture.create({ send: async message => { sent.push(message); return { enabled: true }; }, snapshot: () => snapshot() });
  const view = { mode: 'live', live: { selfSeat: 0, complete: true, phase: 'playing', round: { wind: 0, index: 0 }, honba: 0, turnProgress: { status: 'known' } }, contextIdentity: { matchId: 'm1', roundStartId: 'r1' } };
  const raw = { type: 'event', payload: { kind: 'DiscardTile', source: 'live', step: 1, seat: 0, tile: '5p' } };
  capture.record(view, raw, view); await capture.flush(); assert.equal(sent.length, 0);
  await capture.status(); capture.record(view, raw, view); await capture.flush();
  assert.equal(sent.at(-1).evidence.identityKnown, false); assert.equal(sent.at(-1).evidence.actual, undefined);
  capture.record(view, { type: 'event', payload: { kind: 'DealTile', source: 'live', step: 2, seat: 0, operation: { seat: 0, types: [1] } } }, view);
  capture.record(view, { ...raw, payload: { ...raw.payload, step: 3 } }, view); await capture.flush();
  assert.equal(sent.at(-1).evidence.actual.tile, '5p');
  const count = sent.length; capture.record(view, { ...raw, payload: { ...raw.payload, source: 'replay' } }, view);
  capture.record(view, raw, { ...view, historical: {} }); await capture.flush(); assert.equal(sent.length, count);
});
test('restoration whitelists every persisted layer and sanitizes queued model inputs', async () => {
  const local = storage(), original = M.create({ storage: local }); await eligible(original);
  const saved = local.values.agentUserMemoryV1;
  saved.apiKey = 'SECRET'; saved.jobs[0].secret = 'SECRET';
  saved.matches[0].secret = 'SECRET'; saved.matches[0].rounds[0].secret = 'SECRET';
  saved.matches[0].rounds[0].decisions[0].snapshot.game.players[1].hand = ['7z'];
  saved.matches[0].rounds[0].decisions[0].snapshot.password = 'SECRET';
  saved.entries.push({ id: 'explicit:1', kind: 'explicit-preference', text: '简洁说明', status: 'confirmed', apiKey: 'SECRET', createdAt: 1 });
  saved.pins.push({ key: 'old:pin', version: 1, apiKey: 'SECRET', entries: saved.entries });
  const restarted = M.create({ storage: local }); const claimed = await restarted.claim();
  assert.ok(claimed); assert.doesNotMatch(JSON.stringify(local.values.agentUserMemoryV1), /SECRET|"hand":\["7z"\]/);
  assert.doesNotMatch(Agent.pack(claimed.match), /SECRET|password|apiKey/);
});
test('temporary sanitation write failure is recoverable and atomic config invalidation cannot re-enable learning', async () => {
  const local = storage(), s = M.create({ storage: local }); await s.configure(true);
  const base = local.set.bind(local); let fail = true;
  local.set = async value => { if (fail) throw new Error('temporary disk failure'); return base(value); };
  const restarted = M.create({ storage: local }); await assert.rejects(restarted.status(), /temporary disk failure/);
  fail = false; assert.equal((await restarted.status()).enabled, true);
  const invalidating = restarted.invalidate(), disabling = restarted.configure(false);
  await Promise.all([invalidating, disabling]); assert.equal((await restarted.status()).enabled, false);
  await restarted.invalidate(); assert.equal((await restarted.status()).enabled, false);
});
test('pin persistence failure falls back to empty memory and stale capture generations are rejected', async () => {
  const local = storage(), s = M.create({ storage: local }); await s.configure(true); await s.edit({ value: '详细解释' });
  local.set = async () => { throw new Error('quota'); };
  assert.deepEqual(await s.pin('new:round'), { version: 0, entries: [] });
  const status = await s.status();
  assert.equal((await s.ingest(event(0, 0, 'NewRound', { generation: status.generation - 1 }))).accepted, false);
});
test('explicit disable and edits survive later invalidation both queued and already awaiting storage', async () => {
  for (const inProgress of [false, true]) {
    const local = storage(), s = M.create({ storage: local }); await s.configure(true);
    const base = local.set.bind(local); let release, started;
    const reached = new Promise(resolve => { started = resolve; });
    if (inProgress) local.set = async value => {
      if (value.agentUserMemoryV1.enabled === false) { started(); await new Promise(resolve => { release = resolve; }); local.set = base; }
      return base(value);
    };
    const disabling = s.configure(false);
    if (inProgress) await reached;
    const changing = s.invalidate(); if (inProgress) release();
    await Promise.all([disabling, changing]); assert.equal((await s.status()).enabled, false);
    assert.equal((await M.create({ storage: local }).status()).enabled, false);
    await Promise.all([s.edit({ value: '必须保留用户修改' }), s.invalidate()]);
    assert.equal((await s.status()).entries[0].text, '必须保留用户修改');
  }
});
test('temporary initial storage read rejection does not permanently block status or clear', async () => {
  const local = storage(); const base = local.get.bind(local); let fail = true;
  local.get = async key => { if (fail) throw new Error('temporary read'); return base(key); };
  const s = M.create({ storage: local }); await assert.rejects(s.status(), /temporary read/);
  fail = false; await s.clear(); assert.equal((await s.status()).enabled, false);
});
test('a failed disable write retains disabled intent behind the retry barrier and never dispatches old jobs', async () => {
  const local = storage(), s = M.create({ storage: local }); await eligible(s);
  const base = local.set.bind(local); let fail = true;
  local.set = async value => { if (fail) throw new Error('offline disk'); return base(value); };
  await assert.rejects(s.configure(false), /offline disk/);
  await assert.rejects(s.claim(), /offline disk/);
  fail = false; assert.equal(await s.claim(), null); assert.equal((await s.status()).enabled, false);
  assert.equal((await M.create({ storage: local }).status()).enabled, false);
});
test('manual preferences reject obvious credential material', async () => {
  const s = M.create({ storage: storage() });
  await assert.rejects(s.edit({ value: 'apiKey: example-sensitive-value' }), /密钥或密码/);
  assert.equal((await s.status()).entries.length, 0);
});
