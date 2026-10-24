const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createStore } = require('../extension/round-context.js');

function snapshot(step = 1, source = 'live') {
  return { format: 'mj-analysis-v1', playerCount: 4, source, complete: true, phase: 'playing', selfSeat: 0, lastStep: step,
    game: { round: { wind: 0, index: 0 }, honba: 0, sticks: 0, remaining: 69 - step, doras: ['1m'], scores: [25000,25000,25000,25000],
      players: Array.from({ length: 4 }, (_, seat) => ({ seat, hand: ['7z'], melds: [], riichi: false, norths: 0 })) },
    rivers: [{ seat: 0, discards: [] }], selfHand: ['1m'], selfDrawnTile: null };
}
const input = (step = 1, more = {}) => ({ snapshot: snapshot(step), identity: { matchId: 'match-A', roundStartId: 'round-0', viewId: 'view-0' }, lane: 'live', provider: 'openai', model: 'model-a', task: 'discard', config: { revision: 1 }, ...more });
function memory() {
  const values = {};
  return { values, async get(key) { return structuredClone({ [key]: values[key] }); }, async set(next) { Object.assign(values, structuredClone(next)); } };
}

test('checkpoints are authoritative and idempotent; questions do not mutate state or synthesize events', async () => {
  const store = createStore(), first = await store.observe(input());
  assert.deepEqual(await store.observe(input()), first);
  await store.appendExchange(first, { id: 'q1', question: 'why', answer: 'opinion' });
  await store.appendExchange(first, { id: 'q1', question: 'duplicate', answer: 'duplicate' });
  const ctx = await store.getContext(first);
  assert.equal(ctx.exchanges.length, 1); assert.equal(ctx.checkpoints.length, 1); assert.deepEqual(ctx.events, []);
  assert.equal(ctx.checkpoint.snapshot.game.remaining, 68);
  ctx.checkpoint.snapshot.selfHand.push('9m');
  assert.deepEqual((await store.getContext(first)).checkpoint.snapshot.selfHand, ['1m']);
});

test('all identity, configuration and authorization dimensions isolate the active lane', async () => {
  const changes = [
    { identity: { matchId: 'match-B', roundStartId: 'round-0', viewId: 'view-0' } },
    { identity: { matchId: 'match-A', roundStartId: 'round-1', viewId: 'view-0' } },
    { identity: { matchId: 'match-A', roundStartId: 'round-0', viewId: 'view-1' } },
    { model: 'model-b' }, { provider: 'other' }, { task: 'review' }, { config: { revision: 2 } },
    { snapshot: { ...snapshot(), source: 'replay' } }, { snapshot: { ...snapshot(), selfSeat: 1 } },
    { snapshot: { ...snapshot(), selfHand: undefined } },
    { snapshot: { ...snapshot(), game: { ...snapshot().game, honba: 1 } } },
    { snapshot: { ...snapshot(), game: { ...snapshot().game, round: { wind: 0, index: 1 } } } }
  ];
  for (const change of changes) {
    const store = createStore(), before = await store.observe(input());
    await store.appendExchange(before, { id: 'q', answer: 'old context' });
    const after = await store.observe(input(1, change));
    assert.notEqual(before.id, after.id, JSON.stringify(change));
    assert.equal(await store.isCurrent(before), false);
    assert.deepEqual((await store.getContext(after)).exchanges, []);
  }
});

test('live and manual-review lanes do not invalidate or borrow each other', async () => {
  const store = createStore(), live = await store.observe(input());
  await store.appendExchange(live, { id: 'q', answer: 'live' });
  const review = await store.observe(input(1, { lane: 'manual-review' }));
  assert.notEqual(live.id, review.id); assert.equal(await store.isCurrent(live), true);
  assert.deepEqual((await store.getContext(review)).exchanges, []);
});

test('rewind and conflicting same-position snapshots branch without future history; stale answers are refused', async () => {
  const store = createStore();
  const start = await store.observe(input(1));
  await store.appendExchange(start, { id: 'start', answer: 'early' });
  const future = await store.observe(input(8));
  await store.appendExchange(future, { id: 'future', answer: 'future winner' });
  assert.equal(await store.appendExchange(start, { id: 'late', answer: 'stale' }), false);
  const rewind = await store.observe(input(2));
  const ctx = await store.getContext(rewind);
  assert.equal(rewind.branch, 1); assert.equal(ctx.checkpoints.length, 1); assert.deepEqual(ctx.exchanges, []);
  assert.equal(await store.getContext(future), null);
  const conflicting = snapshot(2); conflicting.selfHand = ['2m'];
  const branch = await store.observe(input(2, { snapshot: conflicting }));
  assert.equal(branch.branch, 2);
});

test('unknown identity is conservative and never reuses another observation as a round', async () => {
  const store = createStore();
  const a = await store.observe(input(1, { identity: {} }));
  const b = await store.observe(input(1, { identity: {} }));
  assert.notEqual(a.id, b.id);
});

test('injected chrome.local-compatible storage survives worker restart without secrets or opponent hands', async () => {
  const storage = memory(), store = createStore({ storage });
  const raw = input(3, { config: { revision: 1, apiKey: 'SECRET-KEY', baseUrl: 'SECRET-URL' },
    events: [{ kind: 'DealTile', source: 'live', seat: 1, tile: '7z', step: 2, hands: [['7z']] },
      { kind: 'DiscardTile', source: 'live', seat: 1, tile: '2m', step: 3 },
      { kind: 'DiscardTile', source: 'live', seat: 1, tile: '9m', step: 9 }] });
  raw.snapshot.rivers.push({ seat: 1, discards: [] });
  const handle = await store.observe(raw);
  await store.appendExchange(handle, { id: 'q', question: 'why', answer: 'because' });
  const serialized = JSON.stringify(storage.values);
  assert.ok(!serialized.includes('SECRET')); assert.ok(!serialized.includes('7z')); assert.ok(!serialized.includes('hands'));
  const restarted = createStore({ storage });
  assert.equal(await restarted.isCurrent(handle), true);
  const restored = await restarted.getContext(handle);
  assert.equal(restored.exchanges[0].answer, 'because'); assert.equal(restored.events.length, 2);
  assert.equal(restored.events[0].tile, '?'); assert.ok(!JSON.stringify(restored).includes('9m'));
  const again = input(3); again.snapshot.rivers.push({ seat: 1, discards: [] });
  assert.deepEqual(await restarted.observe(again), handle);
});

test('bounded histories and sessions remain bounded through restart and reset invalidates handles', async () => {
  const storage = memory(), limits = { checkpoints: 2, exchanges: 2, sessions: 2, events: 2 };
  const store = createStore({ storage, limits }); let handle;
  for (let step = 0; step < 6; step++) {
    handle = await store.observe(input(step));
    await store.appendExchange(handle, { id: `q${step}`, answer: 'a'.repeat(20000) });
  }
  const ctx = await store.getContext(handle);
  assert.equal(ctx.checkpoints.length, 2); assert.equal(ctx.exchanges.length, 2); assert.equal(ctx.exchanges[0].answer.length, 12000);
  for (let i = 0; i < 3; i++) await store.observe(input(1, { model: `model-${i}` }));
  assert.equal(storage.values.agentRoundContextV1.sessions.length, 2);
  await store.reset(); assert.equal(await store.isCurrent(handle), false);
  assert.equal(storage.values.agentRoundContextV1.sessions.length, 0);
});

test('concurrent observations serialize and delayed results cannot attach to a newer version', async () => {
  const store = createStore();
  const [first, second] = await Promise.all([store.observe(input(1)), store.observe(input(2))]);
  assert.equal(second.version, first.version + 1);
  assert.equal(await store.appendExchange(first, { id: 'late', answer: 'late' }), false);
  assert.equal(await store.isCurrent(second), true);
});

test('events obey field selection and can supplement an unchanged checkpoint idempotently', async () => {
  const store = createStore(), first = await store.observe(input());
  const events = [{ kind: 'DiscardTile', source: 'live', seat: 1, tile: '2m', step: 1 },
    { kind: 'DiscardTile', source: 'live', seat: 0, tile: '1m', step: 1 }];
  const supplemented = await store.observe(input(1, { events }));
  assert.equal(supplemented.version, first.version + 1);
  assert.equal((await store.getContext(supplemented)).events.length, 1);
  assert.deepEqual(await store.observe(input(1, { events })), supplemented);
  const handOnly = snapshot(); delete handOnly.game; delete handOnly.rivers;
  const only = await store.observe(input(1, { snapshot: handOnly, events: [
    ...events, { kind: 'ChiPengGang', source: 'live', step: 1, seat: 1, tiles: ['2m','2m','2m'] }] }));
  assert.deepEqual((await store.getContext(only)).events, []);
});

test('total serialized storage has a conservative byte budget', async () => {
  const storage = memory(), store = createStore({ storage, limits: { bytes: 80000, sessions: 12, exchanges: 20 } });
  for (let i = 0; i < 10; i++) {
    const handle = await store.observe(input(i));
    await store.appendExchange(handle, { id: `q${i}`, answer: 'a'.repeat(12000) });
  }
  assert.ok(Buffer.byteLength(JSON.stringify(storage.values.agentRoundContextV1)) <= 80000);
});

test('an exchange cancelled during storage is rolled back before the next operation can read it', async () => {
  const storage = memory(), store = createStore({ storage });
  const handle = await store.observe(input());
  const original = storage.set.bind(storage);
  let entered, release;
  const waiting = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  storage.set = async value => {
    if (value.agentRoundContextV1.sessions.some(s => s.exchanges.some(e => e.id === 'cancelled'))) { entered(); await gate; }
    await original(value);
  };
  const controller = new AbortController();
  const pending = store.appendExchange(handle, { id: 'cancelled', answer: 'CANCELLED_ANSWER' }, { signal: controller.signal });
  const rejected = assert.rejects(pending, { name: 'AbortError' });
  await waiting; controller.abort(); release(); await rejected;
  assert.deepEqual((await store.getContext(handle)).exchanges, []);
  assert.ok(!JSON.stringify(storage.values).includes('CANCELLED_ANSWER'));
  const restored = createStore({ storage });
  assert.deepEqual((await restored.getContext(handle)).exchanges, []);
});

test('specific exchange cleanup works with stale handles and preserves other versions and records', async () => {
  const store = createStore(), first = await store.observe(input());
  await store.appendExchange(first, { id: 'remove', answer: 'one' });
  await store.appendExchange(first, { id: 'keep', answer: 'two' });
  const second = await store.observe(input(2));
  assert.equal(await store.isCurrent(first), false);
  assert.equal(await store.removeExchange({ ...first, version: second.version }, 'remove'), false);
  assert.equal(await store.removeExchange(first, 'remove'), true);
  assert.deepEqual((await store.getContext(second)).exchanges.map(e => e.id), ['keep']);
});

test('tab scopes remain independently active while new rounds invalidate only their own tab across restart', async () => {
  const storage = memory(), store = createStore({ storage });
  const a = await store.observe(input(1, { scope: '7' }));
  const b = await store.observe(input(1, { scope: '8' }));
  assert.notEqual(a.id, b.id);
  assert.equal(await store.isCurrent(a), true); assert.equal(await store.isCurrent(b), true);
  await store.appendExchange(a, { id: 'tab-a', answer: 'TAB_A_ANSWER' });
  await store.appendExchange(b, { id: 'tab-b', answer: 'TAB_B_ANSWER' });
  assert.deepEqual((await store.getContext(a)).exchanges.map(e => e.id), ['tab-a']);
  assert.deepEqual((await store.getContext(b)).exchanges.map(e => e.id), ['tab-b']);
  assert.equal('scope' in await store.getContext(a), false);
  const restored = createStore({ storage });
  assert.equal(await restored.isCurrent(a), true); assert.equal(await restored.isCurrent(b), true);
  assert.deepEqual(await restored.observe(input(1, { scope: '7' })), a);
  const next = await restored.observe(input(1, { scope: '7', identity: { matchId: 'match-A', roundStartId: 'round-next', viewId: 'view-0' } }));
  assert.equal(await restored.isCurrent(a), false); assert.equal(await restored.isCurrent(b), true); assert.equal(await restored.isCurrent(next), true);
  const again = createStore({ storage });
  assert.equal(await again.isCurrent(a), false); assert.equal(await again.isCurrent(b), true); assert.equal(await again.isCurrent(next), true);
});
