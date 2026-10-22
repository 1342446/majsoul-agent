const { test } = require('node:test');
const assert = require('node:assert/strict');
const S = require('../extension/state.js'), P = require('../extension/protocol.js'), F = require('./fixtures.js');
const round = () => ({ ...P.decodeEvent('ActionNewRound', F.liveRound(), 'live'), step: 0 });
const evt = (kind, more) => ({ kind, source: 'live', ...more });
test('own seat and hand are initialized; concealed opponent draws are not added to self hand', () => {
  const s = S.apply(S.initial(), round());
  assert.equal(s.selfSeat, 1); assert.equal(s.selfHand.length, 13);
  const next = S.apply(s, evt('DealTile', { seat: 2, tile: '?', remaining: 68, step: 1 }));
  assert.equal(next.selfHand.length, 13); assert.equal(next.remaining, 68);
});
test('draw and discard update own hand; duplicate steps do not duplicate the river', () => {
  let s = S.apply(S.initial(), round());
  s = S.apply(s, evt('DealTile', { seat: 1, tile: '1m', step: 1 }));
  const discard = evt('DiscardTile', { seat: 1, tile: '1m', tsumogiri: true, step: 2 });
  s = S.apply(s, discard); s = S.apply(s, discard);
  assert.equal(s.selfHand.length, 13); assert.equal(s.players[1].discards.length, 1);
});
test('call consumes own tiles and marks called discard without removing its history', () => {
  let s = S.apply(S.initial(), round());
  s = S.apply(s, evt('DiscardTile', { seat: 0, tile: '8s', step: 1 }));
  s = S.apply(s, evt('ChiPengGang', { seat: 1, meldType: 1, tiles: ['8s','8s','8s'], froms: [1,0,1], step: 2 }));
  assert.equal(s.selfHand.filter(t => t === '8s').length, 1);
  assert.equal(s.players[0].discards[0].called, true); assert.equal(s.players[1].melds.length, 1);
});
test('added kan upgrades the original pon, and concealed kan preserves red-five identity', () => {
  let s = S.initial('live', 1); s.complete = true; s.selfHand = ['0p','5p','5p','5p'];
  s = S.apply(s, evt('AnGangAddGang', { seat: 1, tile: '5p', meldType: 3 }));
  assert.equal(s.selfHand.length, 0); assert.ok(s.players[1].melds[0].tiles.includes('0p'));
  s.selfHand = ['8s']; s.players[1].melds = [{ type: 1, tiles: ['8s','8s','8s'], froms: [1,0,1] }];
  s = S.apply(s, evt('AnGangAddGang', { seat: 1, tile: '8s', meldType: 2 }));
  assert.equal(s.players[1].melds.length, 1); assert.equal(s.players[1].melds[0].tiles.length, 4);
});
test('riichi payment is applied only when server confirms it, without double subtraction', () => {
  let s = S.apply(S.initial(), round());
  s = S.apply(s, evt('DiscardTile', { seat: 1, tile: '3z', riichi: true, step: 1 }));
  assert.equal(s.scores[1], 25000);
  s = S.apply(s, evt('DealTile', { seat: 2, tile: '?', riichiSuccess: { seat: 1, score: 24000, sticks: 1 }, step: 2 }));
  assert.equal(s.scores[1], 24000); assert.equal(s.sticks, 1);
});
test('gaps and unsupported events invalidate completeness; new round repairs it', () => {
  let s = S.apply(S.initial(), round());
  s = S.apply(s, evt('DealTile', { seat: 2, tile: '?', step: 4 })); assert.equal(s.complete, false);
  s = S.apply(s, round()); assert.equal(s.complete, true);
  s = S.apply(s, evt('Unsupported', { name: 'ActionUnknown', step: 1 })); assert.equal(s.complete, false);
});
test('replay source and live source stay separate and all replay hands remain available', () => {
  const e = P.decodeEvent('RecordNewRound', F.replayRound(), 'replay');
  let s = S.apply(S.initial('replay'), e);
  s = S.apply(s, { kind: 'DealTile', source: 'replay', seat: 3, tile: '1p' });
  assert.equal(s.players[3].hand.length, 14); assert.equal(s.players[0].hand.length, 13);
  assert.deepEqual(S.apply(s, evt('DealTile', { seat: 1, tile: '1m' })), s);
});
test('empty operation does not infer seat zero, and unidentified hand updates invalidate completeness', () => {
  let s = S.apply(S.initial(), { ...round(), operation: { seat: 0, types: [] } });
  assert.equal(s.selfSeat, null);
  s = S.apply(s, evt('DealTile', { seat: 1, tile: '1m', step: 1 }));
  assert.equal(s.complete, false); assert.equal(s.selfHand.length, 13);
});
test('impossible own discard is reported as incomplete instead of fabricating a hand', () => {
  let s = S.apply(S.initial(), round());
  s = S.apply(s, evt('DiscardTile', { seat: 1, tile: '1m', step: 1 }));
  assert.equal(s.complete, false); assert.equal(s.selfHand.length, 13);
  assert.ok(s.warnings.some(w => w.includes('手牌更新不一致')));
});
test('seat winds rotate with the dealer, including dealer wraparound', () => {
  for (let dealer = 0; dealer < 4; dealer++) {
    const s = { round: { index: dealer }, scores: [25000,25000,25000,25000] };
    assert.equal(S.seatWind(s, dealer), '东');
    assert.equal(S.seatWind(s, (dealer + 1) % 4), '南');
    assert.equal(S.seatWind(s, (dealer + 2) % 4), '西');
    assert.equal(S.seatWind(s, (dealer + 3) % 4), '北');
  }
  assert.equal(S.seatWind(S.initial(), 0), '座风待定');
});
test('three-player wind rotation skips the north seat', () => {
  const s = { round: { index: 2 }, scores: [35000,35000,35000] };
  assert.deepEqual([0,1,2].map(i => S.seatWind(s, i)), ['南','西','东']);
  assert.equal(S.seatWind(s, 3), '座风待定');
});
test('event history keeps the wind from its own round when later rounds rotate', () => {
  const events = S.withSeatWinds([
    { kind: 'NewRound', round: 0, scores: [25000,25000,25000,25000] },
    { kind: 'DiscardTile', seat: 0 },
    { kind: 'NewRound', round: 1, scores: [25000,25000,25000,25000] },
    { kind: 'DiscardTile', seat: 0 }
  ]);
  assert.equal(events[1].seatWind, '东'); assert.equal(events[3].seatWind, '北');
});
