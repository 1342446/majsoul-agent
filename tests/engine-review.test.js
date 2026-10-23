'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { review } = require('../agent/engine-review.cjs');
const State = require('../extension/state.js');

const hand = ['1m', '2m', '3m', '1p', '2p', '3p', '1s', '2s', '3s', '1z', '1z', '1z', '2z'];
function replay() {
  return { format: 'mj-observer-v1', mode: 'replay', state: { selfSeat: 0 }, replayCursor: 2,
    replayRecords: [
      { kind: 'NewRound', source: 'replay', recordIndex: 0, wind: 0, round: 0, honba: 0, sticks: 0,
        scores: [25000, 25000, 25000, 25000], remaining: 70, doras: ['4p'], hands: [hand, hand, hand, hand] },
      { kind: 'DealTile', source: 'replay', recordIndex: 1, seat: 0, tile: '9m', remaining: 69 }
    ] };
}
function live() {
  const source = replay().replayRecords.map((e, step) => ({ ...e, source: 'live', step }));
  source[0].hand = hand.slice(); delete source[0].hands;
  let state = State.initial('live', 0);
  for (const e of source) state = State.apply(state, e);
  return { format: 'mj-observer-v1', mode: 'live', state, events: source };
}
const discard = { type: 'dahai', actor: 0, pai: '9m', tsumogiri: true };
const runner = { infer: async () => ({ action: { ...discard, meta: { secret: 'PRIVATE_MODEL_META', q_values: [0.5] } }, meta: { secret: 'PRIVATE_ENGINE_META' } }) };

test('CLI review returns validated legal advice, local analysis and bounded trace without raw metadata', async () => {
  const result = await review(live(), { hand: true, runner });
  assert.equal(result.format, 'majsoul-engine-review-v1');
  assert.equal(result.seat, 0);
  assert.deepEqual(result.engine.action, discard);
  assert.equal(result.result.decision.tile, '9m');
  assert.equal(result.localAnalysis.efficiency.status, 'available');
  assert.deepEqual(result.trace.events.filter(e => e.status === 'completed').map(e => e.tool), ['request.validate', 'engine.infer', 'engine.validate']);
  assert.equal('action' in result, false);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_MODEL_META|PRIVATE_ENGINE_META|q_values/);
});

test('replay reconstructs the explicit cursor prefix and never reads future records or stale exported state', async () => {
  const observation = replay();
  observation.state = { selfSeat: 0, phase: 'ended', complete: false, selfHand: ['INVALID_FUTURE_STATE'] };
  Object.defineProperty(observation.replayRecords, 2, { configurable: true, get() { throw new Error('FUTURE_RECORD_WAS_READ'); } });
  let calls = 0;
  const result = await review(observation, { hand: true, cursor: 2, runner: { infer: async request => {
    calls++;
    assert.equal(request.events.length, 3);
    assert.deepEqual(request.events.at(-1), { type: 'tsumo', actor: 0, pai: '9m' });
    assert.deepEqual(request.events[1].tehais[1], Array(13).fill('?'));
    return { action: discard };
  } } });
  assert.equal(calls, 1); assert.equal(result.result.decision.tile, '9m');
});

test('explicit cursor supersedes exported cursor when reconstructing replay state', async () => {
  const observation = replay(); observation.replayCursor = 1;
  assert.equal((await review(observation, { hand: true, cursor: 2, runner })).result.decision.tile, '9m');
});

test('review refuses inference without explicit hand authorization', async () => {
  let calls = 0;
  await assert.rejects(review(live(), { runner: { infer: async () => { calls++; return { action: discard }; } } }), /hand:true/);
  assert.equal(calls, 0);
});

test('historical, incomplete, 14-tile and melded rounds fail before runner invocation', async () => {
  let calls = 0;
  const noRun = { infer: async () => { calls++; return { action: discard }; } };
  const historical = live(); historical.historyView = { match: 'history', round: '1' };
  const incomplete = live(); incomplete.state.complete = false;
  const fourteen = replay(); fourteen.replayRecords[0].hands = [hand.concat('9m'), hand, hand, hand];
  const melded = replay();
  melded.replayRecords.push(
    { kind: 'DiscardTile', source: 'replay', recordIndex: 2, seat: 0, tile: '9m', riichi: false, tsumogiri: true },
    { kind: 'ChiPengGang', source: 'replay', recordIndex: 3, seat: 2, meldType: 1, tiles: ['9m', '9m', '9m'], froms: [0, 2, 2] });
  melded.replayCursor = 4;
  for (const observation of [historical, incomplete, fourteen, melded]) await assert.rejects(review(observation, { hand: true, runner: noRun }));
  assert.equal(calls, 0);
});

test('illegal raw engine action cannot escape CLI result validation', async () => {
  await assert.rejects(review(live(), { hand: true, runner: { infer: async () => ({ action: { ...discard, pai: '8m' } }) } }), /结果无效/);
});
