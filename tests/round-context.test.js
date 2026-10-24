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
  assert.equal(ctx.checkpoints.length, 2); assert.equal(ctx.exchanges.length, 2); assert.equal(ctx.exchanges[0].answer.length, 20000);
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

test('events obey field selection; baseline-position events never append or invalidate an unchanged checkpoint', async () => {
  const store = createStore(), first = await store.observe(input());
  const events = [{ kind: 'DiscardTile', source: 'live', seat: 1, tile: '2m', step: 1 },
    { kind: 'DiscardTile', source: 'live', seat: 0, tile: '1m', step: 1 }];
  const supplemented = await store.observe(input(1, { events }));
  assert.equal(supplemented.version, first.version);
  assert.equal((await store.getContext(supplemented)).events.length, 0);
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
    if (value.agentRoundContextV1.sessions.some(s => s.timeline.some(e => e.type === 'exchange' && e.id === 'cancelled'))) { entered(); await gate; }
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

test('baseline plus ordered observation patches reconstruct facts and interleave successful requests', async () => {
  const storage = memory(), store = createStore({ storage });
  const first = await store.observe(input(10, { events: [{ kind: 'DealTile', source: 'live', seat: 1, tile: '9m', step: 9 }] }));
  const initial = await store.getContext(first);
  assert.equal(initial.baseline.origin, 'mid-round');
  assert.equal(initial.baseline.position, 10);
  assert.deepEqual(initial.timeline, []);
  assert.equal(initial.events[0].tile, '?');
  const request = JSON.stringify({ question: 'FIRST_REQUEST', facts: initial.baseline });
  await store.appendExchange(first, { id: 'one', question: 'one', answer: '{"action":"one"}', request, reasoning: 'SECRET_REASONING' });
  const changed = snapshot(17);
  changed.game.scores = [24000, 26000, 25000, 25000];
  changed.game.doras.push('2p');
  changed.game.players[1].melds = [{ type: 1, tiles: ['2m', '2m', '2m'], froms: [0, 1, 1] }];
  changed.selfHand = ['2m'];
  const next = await store.observe(input(17, { snapshot: changed, events: [
    { kind: 'DealTile', source: 'live', seat: 1, tile: '9m', step: 9 },
    { kind: 'DiscardTile', source: 'live', seat: 0, tile: '1m', step: 17 }
  ] }));
  await store.appendExchange(next, { id: 'two', question: 'two', answer: '{"action":"two"}', request: 'SECOND_REQUEST' });
  const context = await store.getContext(next);
  assert.deepEqual(context.timeline.map(e => e.type), ['exchange', 'observation', 'exchange']);
  assert.equal(context.timeline[0].request, request);
  assert.equal(context.timeline[1].events.length, 1);
  assert.equal(context.timeline[1].events[0].position, 17);
  assert.ok(context.timeline[1].changes.some(p => p.path === '/game/scores/0'));
  let reconstructed = structuredClone(context.baseline.snapshot);
  for (const item of context.timeline) if (item.type === 'observation') for (const patch of item.changes) {
    const parts = patch.path.slice(1).split('/');
    const parent = parts.slice(0, -1).reduce((value, key) => value[key], reconstructed), key = parts.at(-1);
    if (patch.op === 'remove') delete parent[key];
    else if (key === '-') parent.push(structuredClone(patch.value));
    else parent[key] = structuredClone(patch.value);
  }
  assert.deepEqual(reconstructed, context.checkpoint.snapshot);
  assert.equal(JSON.stringify(storage.values).includes('SECRET_REASONING'), false);
  const saved = storage.values.agentRoundContextV1.sessions[0];
  assert.equal(saved.baseline.snapshot.selfHand[0], '1m');
  assert.equal('snapshot' in saved.checkpoint, false);
  assert.equal('checkpoints' in saved, false);
  assert.deepEqual((await createStore({ storage }).getContext(next)).timeline, context.timeline);
});

test('compatibility checkpoint bounds do not crop the fact timeline or force rotation', async () => {
  const store = createStore({ limits: { checkpoints: 2 } });
  let handle = await store.observe(input(0));
  await store.appendExchange(handle, { id: 'first', answer: 'EARLY_SUCCESS' });
  for (let step = 1; step <= 20; step++) handle = await store.observe(input(step));
  const ctx = await store.getContext(handle);
  assert.equal(handle.branch, 0);
  assert.equal(ctx.baseline.position, 0);
  assert.equal(ctx.timeline.filter(e => e.type === 'observation').length, 20);
  assert.equal(ctx.timeline[0].answer, 'EARLY_SUCCESS');
  assert.equal(ctx.checkpoints.length, 2);
});

test('top-level JSON patches explicitly represent removed authorized fields', async () => {
  const store = createStore();
  const before = snapshot(1); before.rivers = [];
  await store.observe(input(1, { snapshot: before }));
  const after = snapshot(2); delete after.rivers;
  const ctx = await store.getContext(await store.observe(input(2, { snapshot: after })));
  assert.ok(ctx.timeline[0].changes.some(p => p.op === 'remove' && p.path === '/rivers' && !('value' in p)));
  assert.equal('rivers' in ctx.checkpoint.snapshot, false);
});

test('coverage gaps rebase explicitly, while overlapping incomplete windows and skipped positions append', async () => {
  const store = createStore();
  const first = await store.observe(input(10, { historyComplete: false, eventWindowStart: 5 }));
  await store.appendExchange(first, { id: 'old', answer: 'BEFORE_GAP' });
  const covered = await store.observe(input(20, { historyComplete: false, eventWindowStart: 8 }));
  assert.equal(covered.branch, 0);
  assert.equal((await store.getContext(covered)).timeline.length, 2);
  const gap = await store.observe(input(40, { historyComplete: false, eventWindowStart: 30 }));
  const context = await store.getContext(gap);
  assert.equal(gap.branch, 1);
  assert.equal(context.baseline.origin, 'checkpoint');
  assert.equal(context.baseline.reason, 'event-window-gap');
  assert.equal(context.baseline.position, 40);
  assert.deepEqual(context.timeline, []);
  assert.equal(await store.appendExchange(covered, { id: 'late', answer: 'late' }), false);
  const complete = await store.observe(input(70, { historyComplete: true, eventWindowStart: 50 }));
  assert.equal(complete.branch, 1);
  assert.equal((await store.getContext(complete)).timeline.length, 1);
});

test('round-start origin requires the snapshot itself to be at NewRound', async () => {
  const events = [{ kind: 'NewRound', source: 'live', step: 0 }];
  const start = createStore(), middle = createStore();
  assert.equal((await start.getContext(await start.observe(input(0, { events, historyComplete: true })))).baseline.origin, 'round-start');
  assert.equal((await middle.getContext(await middle.observe(input(10, { events, historyComplete: true })))).baseline.origin, 'mid-round');
});

test('capacity rotates whole checkpoints on observe, never truncates successful conversation tails', async () => {
  const store = createStore({ limits: { exchanges: 2, events: 2 } });
  let handle = await store.observe(input(1));
  await store.appendExchange(handle, { id: 'one', answer: 'one' });
  await store.appendExchange(handle, { id: 'two', answer: 'two' });
  assert.equal(await store.appendExchange(handle, { id: 'three', answer: 'three' }), false);
  assert.deepEqual((await store.getContext(handle)).exchanges.map(e => e.id), ['one', 'two']);
  const rotated = await store.observe(input(1));
  assert.equal(rotated.branch, handle.branch + 1);
  assert.equal(await store.isCurrent(handle), false);
  let ctx = await store.getContext(rotated);
  assert.equal(ctx.baseline.reason, 'unrecorded-exchange');
  assert.deepEqual(ctx.timeline, []);
  handle = await store.observe(input(2, { events: [{ kind: 'DealTile', source: 'live', seat: 0, tile: '2m', step: 2 }] }));
  handle = await store.observe(input(3, { events: [{ kind: 'DealTile', source: 'live', seat: 0, tile: '3m', step: 3 }] }));
  const overflow = await store.observe(input(4, { events: [{ kind: 'DealTile', source: 'live', seat: 0, tile: '4m', step: 4 }] }));
  ctx = await store.getContext(overflow);
  assert.equal(overflow.branch, handle.branch + 1);
  assert.equal(ctx.baseline.position, 4);
  assert.deepEqual(ctx.timeline, []);
});

test('huge requests are refused atomically without changing the run prefix or prior success', async () => {
  const storage = memory(), store = createStore({ storage, limits: { bytes: 20000 } });
  const handle = await store.observe(input());
  await store.appendExchange(handle, { id: 'saved', answer: 'SAVED', request: 'FULL_REQUEST' });
  const before = await store.getContext(handle), disk = structuredClone(storage.values);
  assert.equal(await store.appendExchange(handle, { id: 'huge', answer: 'valid', request: 'x'.repeat(1000000) }), false);
  assert.deepEqual(await store.getContext(handle), before);
  assert.deepEqual(storage.values.agentRoundContextV1.sessions[0].timeline, disk.agentRoundContextV1.sessions[0].timeline);
  assert.equal(storage.values.agentRoundContextV1.sessions[0].needsCheckpoint, true);
  assert.equal(await store.isCurrent(handle), true);
  const rotated = await store.observe(input());
  assert.equal(rotated.branch, handle.branch + 1);
  assert.equal((await store.getContext(rotated)).baseline.reason, 'unrecorded-exchange');
});

test('schema 1 rolling histories are discarded rather than reused as complete prefixes', async () => {
  const storage = memory();
  storage.values.agentRoundContextV1 = { schema: 1, next: 42, sessions: [{ id: 'old', exchanges: [{ answer: 'UNSAFE_TAIL' }] }], active: { live: 'old' } };
  const store = createStore({ storage });
  const handle = await store.observe(input(20));
  const ctx = await store.getContext(handle);
  assert.equal(ctx.baseline.origin, 'mid-round');
  assert.deepEqual(ctx.timeline, []);
  assert.equal(JSON.stringify(storage.values).includes('UNSAFE_TAIL'), false);
  assert.equal(storage.values.agentRoundContextV1.schema, 2);
});

test('replay event record indices normalize to cursor positions without losing the next event', async () => {
  const store = createStore();
  const first = await store.observe(input(1, { snapshot: snapshot(1, 'replay'), events: [{ kind: 'NewRound', source: 'replay', recordIndex: 0 }] }));
  assert.equal((await store.getContext(first)).baseline.origin, 'round-start');
  const next = await store.observe(input(2, { snapshot: snapshot(2, 'replay'), eventWindowStart: 1, events: [
    { kind: 'NewRound', source: 'replay', recordIndex: 0 },
    { kind: 'DealTile', source: 'replay', recordIndex: 1, seat: 0, tile: '2m' }
  ] }));
  const ctx = await store.getContext(next);
  assert.equal(ctx.timeline[0].events.length, 1);
  assert.equal(ctx.timeline[0].events[0].position, 2);
  assert.equal(ctx.events.length, 2);
});

test('one discard and score update append leaf patches without repeating prior rivers or other players', async () => {
  const store = createStore();
  const initial = snapshot(10);
  initial.rivers[0].discards = [{ tile: '9s', riichi: false, tsumogiri: false, called: false }];
  await store.observe(input(10, { snapshot: initial }));
  const next = structuredClone(initial); next.lastStep = 11; next.game.remaining--;
  next.rivers[0].discards.push({ tile: '3m', riichi: false, tsumogiri: true, called: false });
  next.game.scores[0] -= 1000; next.game.players[0].riichi = true;
  const ctx = await store.getContext(await store.observe(input(11, { snapshot: next })));
  const changes = ctx.timeline[0].changes;
  assert.ok(changes.some(p => p.path === '/rivers/0/discards/-' && p.op === 'add' && p.value.tile === '3m'));
  assert.ok(changes.some(p => p.path === '/game/remaining'));
  assert.ok(changes.some(p => p.path === '/game/scores/0'));
  assert.ok(changes.some(p => p.path === '/game/players/0/riichi'));
  assert.ok(!changes.some(p => ['/game', '/rivers', '/game/players'].includes(p.path)));
  assert.equal(JSON.stringify(changes).includes('9s'), false);
  assert.ok(!changes.some(p => p.path.startsWith('/game/players/1')));
  assert.deepEqual(ctx.checkpoint.snapshot.rivers[0].discards.map(d => d.tile), ['9s', '3m']);
});

test('restored nested patch values are cleaned and unsafe prototype paths discard the session', async () => {
  const storage = memory(), store = createStore({ storage });
  await store.observe(input(1));
  const handle = await store.observe(input(2));
  storage.values.agentRoundContextV1.sessions[0].timeline[0].changes.push({ op: 'add', path: '/game/players/1/hand', value: ['7z'] });
  const restored = await createStore({ storage }).getContext(handle);
  assert.ok(restored);
  assert.equal(JSON.stringify(restored).includes('7z'), false);
  assert.equal(restored.timeline[0].changes.some(p => p.path.includes('/hand')), false);
  storage.values.agentRoundContextV1.sessions[0].timeline[0].changes.push({ op: 'add', path: '/game/__proto__/polluted', value: true });
  assert.equal(await createStore({ storage }).getContext(handle), null);
  assert.equal({}.polluted, undefined);
});

test('event duplicates and later predecessor links do not fabricate a coverage gap', async () => {
  const store = createStore(); await store.observe(input(10));
  const events = [
    { kind: 'DealTile', source: 'live', seat: 0, tile: '2m', step: 17, previousPosition: 10 },
    { kind: 'DiscardTile', source: 'live', seat: 0, tile: '2m', step: 20, previousPosition: 17 }
  ];
  const handle = await store.observe(input(20, { events: [...events, events[1]] }));
  const ctx = await store.getContext(handle);
  assert.equal(handle.branch, 0);
  assert.deepEqual(ctx.timeline[0].events.map(e => e.position), [17, 20]);
});

test('storage identity is opaque and does not retain a provider endpoint', async () => {
  const storage = memory(), store = createStore({ storage });
  await store.observe(input(1, { provider: 'https://provider.example/private?token=SECRET', config: { revision: 1, apiKey: 'SECRET_KEY' } }));
  const saved = JSON.stringify(storage.values);
  assert.equal(saved.includes('provider.example'), false);
  assert.equal(saved.includes('SECRET'), false);
});

test('byte limits rotate a whole current snapshot and invalidate old prefix handles', async () => {
  const storage = memory(), store = createStore({ storage, limits: { bytes: 12000 } });
  let handle = await store.observe(input(0)), rotated = false;
  for (let step = 1; step <= 60; step++) {
    const previous = handle;
    handle = await store.observe(input(step));
    if (handle.branch > previous.branch) {
      rotated = true;
      assert.equal(await store.isCurrent(previous), false);
      const context = await store.getContext(handle);
      assert.equal(context.baseline.position, step);
      assert.equal(context.baseline.reason, 'byte-budget');
      assert.deepEqual(context.timeline, []);
    }
    assert.ok(Buffer.byteLength(JSON.stringify(storage.values.agentRoundContextV1)) <= 12000);
  }
  assert.equal(rotated, true);
});

test('failed storage mutations preserve the prior in-memory and persisted prefix', async () => {
  const storage = memory(), store = createStore({ storage });
  const handle = await store.observe(input());
  await store.appendExchange(handle, { id: 'kept', answer: 'KEPT' });
  const before = await store.getContext(handle), disk = structuredClone(storage.values);
  const set = storage.set.bind(storage);
  storage.set = async () => { throw new Error('disk unavailable'); };
  await assert.rejects(store.appendExchange(handle, { id: 'failed', answer: 'FAILED' }), /disk unavailable/);
  await assert.rejects(store.observe(input(2)), /disk unavailable/);
  await assert.rejects(store.removeExchange(handle, 'kept'), /disk unavailable/);
  await assert.rejects(store.reset(), /disk unavailable/);
  assert.deepEqual(await store.getContext(handle), before);
  assert.deepEqual(storage.values, disk);
  storage.set = set;
  assert.deepEqual((await createStore({ storage }).getContext(handle)).timeline, before.timeline);
});

test('discarded legacy handles and malformed event envelopes cannot attach to a new baseline', async () => {
  const storage = memory();
  storage.values.agentRoundContextV1 = { schema: 1, next: 2, sessions: [{ id: 'round-1' }], active: { live: 'round-1' } };
  const store = createStore({ storage });
  const handle = await store.observe(input(1, { events: { kind: 'not-an-array' } }));
  assert.equal(await store.isCurrent({ id: 'round-1', version: handle.version, branch: handle.branch }), false);
  const next = await store.observe(input(2, { events: [null, 'invalid', {}, { kind: 'Unsupported', source: 'live', step: 2 }] }));
  assert.equal((await store.getContext(next)).timeline[0].events.length, 0);
});

test('cancelled exchange rollback retries a transient storage failure without losing prior success', async () => {
  const storage = memory(), store = createStore({ storage });
  const handle = await store.observe(input());
  await store.appendExchange(handle, { id: 'prior', answer: 'PRIOR_SUCCESS' });
  const set = storage.set.bind(storage), controller = new AbortController();
  let rollbackAttempts = 0, wroteCancelled = false;
  storage.set = async value => {
    if (value.agentRoundContextV1.sessions.some(s => s.timeline.some(e => e.id === 'cancelled'))) {
      await set(value); wroteCancelled = true; controller.abort(); return;
    }
    if (wroteCancelled && ++rollbackAttempts === 1) throw new Error('temporary storage failure');
    await set(value);
  };
  await assert.rejects(store.appendExchange(handle, { id: 'cancelled', answer: 'CANCELLED' }, { signal: controller.signal }), { name: 'AbortError' });
  assert.equal(rollbackAttempts, 2);
  assert.deepEqual((await store.getContext(handle)).exchanges.map(e => e.id), ['prior']);
  assert.equal(JSON.stringify(storage.values).includes('CANCELLED'), false);
  assert.deepEqual((await createStore({ storage }).getContext(handle)).exchanges.map(e => e.id), ['prior']);
});

test('persistent rollback failures stop context reuse until cleanup can flush, even if the entry is already absent in memory', async () => {
  const storage = memory(), store = createStore({ storage });
  const handle = await store.observe(input());
  await store.appendExchange(handle, { id: 'prior', answer: 'PRIOR_SUCCESS' });
  const set = storage.set.bind(storage), controller = new AbortController();
  let unavailable = true, wroteCancelled = false, attempts = 0;
  storage.set = async value => {
    if (value.agentRoundContextV1.sessions.some(s => s.timeline.some(e => e.id === 'cancelled'))) {
      await set(value); wroteCancelled = true; controller.abort(); return;
    }
    if (wroteCancelled && unavailable) { attempts++; throw new Error('storage offline'); }
    await set(value);
  };
  await assert.rejects(store.appendExchange(handle, { id: 'cancelled', answer: 'CANCELLED' }, { signal: controller.signal }), { name: 'StorageRollbackError' });
  assert.equal(attempts, 3);
  await assert.rejects(store.getContext(handle), { name: 'StorageRollbackError' });
  assert.equal(attempts, 6);
  unavailable = false;
  assert.equal(await store.removeExchange(handle, 'cancelled'), false);
  assert.equal(JSON.stringify(storage.values).includes('CANCELLED'), false);
  assert.deepEqual((await store.getContext(handle)).exchanges.map(e => e.id), ['prior']);
  assert.deepEqual((await createStore({ storage }).getContext(handle)).exchanges.map(e => e.id), ['prior']);
});

test('oversized event windows are rejected intact rather than sliced into an apparently complete prefix', async () => {
  const store = createStore(), handle = await store.observe(input());
  const before = await store.getContext(handle);
  await assert.rejects(store.observe(input(2, { events: Array(4097).fill({ kind: 'DealTile', source: 'live', seat: 0, tile: '2m', step: 2 }) })), /input limit/);
  assert.deepEqual(await store.getContext(handle), before);
});


test('prompt version 3 never reuses version 2 requests as a supposedly identical prefix', async () => {
  const local = memory(), legacy = createStore({ storage: local });
  const old = await legacy.observe(input(1, { config: { promptVersion: 2 } }));
  await legacy.appendExchange(old, { id: 'v2', request: 'OLD_FULL_SNAPSHOT_REQUEST', answer: 'OLD_PREFIX' });
  const restored = createStore({ storage: local });
  const next = await restored.observe(input(2, { config: { promptVersion: 3 } }));
  assert.notEqual(next.id, old.id);
  const context = await restored.getContext(next);
  assert.deepEqual(context.timeline, []);
  assert.equal(context.baseline.position, 2);
  assert.doesNotMatch(JSON.stringify(context), /OLD_FULL_SNAPSHOT_REQUEST|OLD_PREFIX/);
});
