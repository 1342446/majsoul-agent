const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../extension/collector/controller.js');
const S = require('../extension/state.js'), H = require('../extension/history.js');
const P = require('../extension/protocol.js'), F = require('./fixtures.js');
const opening = (source = 'live', more = {}) => ({ ...P.decodeEvent('ActionNewRound', F.liveRound(), 'live'), source, step: 0, ...more });
const make = options => C.create({ state: S, history: H, clock: () => 1700000000000, id: () => 'test', hash: async () => 'hash', ...options });
const send = (c, event) => c.receive({ type: 'event', payload: event });
const end = c => send(c, { source: 'live', kind: 'NoTile', step: 1, scores: [25000,25000,25000,25000] });

test('pure controller keeps live and replay state independent and cursor excludes future draws', async () => {
  const c = make();
  send(c, opening()); c.setSelfSeat(1);
  const hand = ['1m','2m','3m','4m','5m','6m','7m','8m','9m','1p','2p','3p','4p'];
  c.receive({ type: 'replay', payload: { records: [opening('replay', { hands: [hand, hand, hand, hand] }),
    { source: 'replay', kind: 'DealTile', seat: 0, tile: '5p', step: 1 }] } });
  c.setSelfSeat(0);
  assert.equal(c.getView().cursor, 1);
  assert.equal(c.getView().state.players[0].hand.length, 13);
  c.next(); assert.equal(c.getView().state.players[0].hand.length, 14);
  c.previous(); assert.equal(c.getView().state.players[0].hand.length, 13);
  c.setMode('live'); assert.equal(c.getView().state.selfSeat, 1);
  c.setMode('replay'); assert.equal(c.getView().state.selfSeat, 0);
  c.setCursor(999); assert.equal(c.getView().cursor, 2);
  c.roundStart(); assert.equal(c.getView().cursor, 1);
  await c.flush();
});

test('history view stays fixed while new live rounds continue collecting and export is detached', async () => {
  const c = make(); send(c, opening()); end(c); await c.flush();
  const m = c.getView().historyMatches[0]; c.viewRound(m.id, m.rounds[0].key);
  const viewed = c.getView().state;
  send(c, opening('live', { round: 1 }));
  assert.deepEqual(c.getView().state, viewed);
  assert.equal(c.getView().live.round.index, 1);
  const data = c.exportData(); data.state.players[0].discards.push({ tile: '9s' });
  data.historyMatches.length = 0; data.events.length = 0;
  assert.equal(c.getView().historyMatches.length, 1);
  assert.deepEqual(c.getView().state, viewed);
  c.returnToCurrent(); assert.equal(c.getView().state.round.index, 1);
});

test('async history loading preserves newly collected rounds and serializes all writes', async () => {
  let releaseLoad, releaseFirst, active = 0, maxActive = 0;
  const saved = [];
  const c = make({ storage: { load: () => new Promise(resolve => { releaseLoad = resolve; }),
    async save(match) { active++; maxActive = Math.max(maxActive, active); saved.push(match);
      if (saved.length === 1) await new Promise(resolve => { releaseFirst = resolve; }); active--; }
  } });
  send(c, opening()); end(c);
  assert.equal(saved.length, 0);
  releaseLoad([]); await c.ready; await Promise.resolve();
  send(c, opening('live', { round: 1 })); end(c);
  assert.equal(saved.length, 1); releaseFirst(); await c.flush();
  assert.equal(maxActive, 1); assert.equal(saved.at(-1).rounds.length, 2);
  assert.equal(c.getView().historyMatches[0].rounds.length, 2);
});

test('storage errors remain visible and unsubscribed views receive no updates', async () => {
  const c = make({ storage: { load: async () => [], save: async () => { throw new Error('disk full'); } } });
  await c.ready;
  let count = 0; const release = c.subscribe(() => { count++; c.getView().live.phase = 'corrupted'; });
  send(c, opening()); assert.equal(count, 1); assert.equal(c.getView().live.phase, 'playing');
  release(); end(c); await c.flush(); assert.equal(count, 1);
  assert.match(c.getView().historyWarning, /保存失败/);
});


test('maximum replay remains outside display views and notifications do not copy it', async () => {
  const c = make();
  const events = [opening('replay'), ...Array.from({ length: 24999 }, (_, i) => ({ source: 'replay', kind: 'Unsupported', step: i + 1 }))];
  c.receive({ type: 'replay', payload: { records: events } }); await c.flush();
  let notifications = 0, largeCopies = 0;
  const stringify = JSON.stringify;
  JSON.stringify = function(value, ...args) {
    if (value?.records?.length === 25000 || value?.replayRecords?.length === 25000) largeCopies++;
    return stringify.call(JSON, value, ...args);
  };
  try {
    const release = c.subscribe((...args) => { assert.equal(args.length, 0); notifications++; });
    for (let i = 0; i < 20; i++) c.receive({ type: 'status', payload: { incoming: i } });
    const view = c.getView();
    assert.equal(view.recordCount, 25000); assert.equal(view.records, undefined);
    assert.ok(view.recentEvents.length <= 8);
    assert.equal(largeCopies, 0); assert.equal(notifications, 20);
    // Full records are still available explicitly for an export.
    assert.equal(c.exportData().replayRecords.length, 25000); assert.equal(largeCopies, 1);
    release();
  } finally { JSON.stringify = stringify; }
});
