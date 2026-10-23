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

test('hand display sorts suits and honors, preserves red fives and keeps the draw apart without changing captured order', () => {
  const hand = ['7z', '5p', '9m', '0p', '1s', '1z', '2m', '1m'];
  assert.deepEqual(S.handLayout(hand, '1m'), {
    tiles: ['2m', '9m', '0p', '5p', '1s', '1z', '7z'], drawn: '1m'
  });
  assert.equal(hand.at(-1), '1m'); assert.equal(hand[0], '7z');
  assert.deepEqual(S.handLayout(['5p', '0p', '5p'], '5p'), { tiles: ['0p', '5p'], drawn: '5p' });
  assert.deepEqual(S.handLayout(['2m'], '9p'), { tiles: ['2m'], drawn: null });
});

test('hand display tracks draw then sorts after discarding an older tile or calling', () => {
  let s = S.apply(S.initial(), round());
  s = S.apply(s, evt('DealTile', { seat: 1, tile: '1m', step: 1 }));
  assert.equal(S.handLayout(s.selfHand, s.drawnTiles[1]).drawn, '1m');
  s = S.apply(s, evt('DiscardTile', { seat: 1, tile: '7m', step: 2 }));
  assert.equal(s.drawnTiles[1], null);
  assert.equal(S.handLayout(s.selfHand, s.drawnTiles[1]).tiles[0], '1m');
  s = S.apply(s, round());
  assert.deepEqual(s.drawnTiles, [null, null, null, null]);
});

test('opponent riichi alert excludes self, retains multiple opponents and clears at round end and next round', () => {
  let s = S.apply(S.initial(), round());
  s = S.apply(s, evt('DiscardTile', { seat: 1, tile: '3z', riichi: true, step: 1 }));
  assert.deepEqual(S.opponentRiichi(s), []);
  s = S.apply(s, evt('DiscardTile', { seat: 2, tile: '1m', riichi: true, step: 2 }));
  assert.deepEqual(S.opponentRiichi(s), [2]);
  s = S.apply(s, evt('DealTile', { seat: 3, tile: '?', riichiSuccess: { seat: 0, score: 24000, sticks: 2 }, step: 3 }));
  assert.deepEqual(S.opponentRiichi(s), [0, 2]);
  assert.deepEqual(S.opponentRiichi(S.apply(s, evt('Hule', { step: 4 }))), []);
  assert.deepEqual(S.opponentRiichi(S.apply(s, round())), []);
});

test('replay riichi alert requires an explicit own seat and follows the replay cursor', () => {
  const opening = P.decodeEvent('RecordNewRound', F.replayRound(), 'replay');
  const discard = { kind: 'DiscardTile', source: 'replay', seat: 0, tile: '7m', riichi: true };
  let s = S.apply(S.apply(S.initial('replay'), opening), discard);
  assert.deepEqual(S.opponentRiichi(s), []);
  s.selfSeat = 0; assert.deepEqual(S.opponentRiichi(s), []);
  s.selfSeat = 1; assert.deepEqual(S.opponentRiichi(s), [0]);
  assert.deepEqual(S.opponentRiichi(S.apply(S.initial('replay', 1), opening)), []);
});

test('late automatic seat detection replaces the stale unknown-seat warning but retains incomplete tracking', () => {
  let s = S.apply(S.initial(), { ...round(), operation: undefined });
  s = S.apply(s, evt('DealTile', { seat: 2, tile: '?', step: 1 }));
  assert.ok(s.warnings.some(w => w.includes('自家座位尚未识别')));
  s = S.apply(s, evt('DealTile', { seat: 1, tile: '1m', step: 2, operation: { seat: 1, types: [1] } }));
  assert.equal(s.selfSeat, 1);
  assert.ok(!s.warnings.some(w => w.includes('自家座位尚未识别')));
  assert.ok(s.warnings.some(w => w.includes('识别前的手牌变化未完整追踪')));
  assert.ok(!s.warnings.some(w => w.includes('未获得完整开局')));
  assert.equal(s.complete, false);
  assert.ok(s.selfHand.includes('1m'));
  s = S.apply(s, round());
  assert.equal(s.complete, true); assert.equal(s.seatTrackingIncomplete, false);
  assert.deepEqual(s.warnings, []);
});

test('manual seat selection updates the warning immediately without requiring another event', () => {
  let s = S.apply(S.initial(), { ...round(), operation: undefined });
  s = S.apply(s, evt('DiscardTile', { seat: 0, tile: '9m', step: 1 }));
  const selected = S.selectSelfSeat(s, 1);
  assert.equal(selected.selfSeat, 1); assert.equal(selected.complete, false);
  assert.ok(selected.warnings.some(w => w.includes('自家座位已识别')));
  assert.ok(!selected.warnings.some(w => w.includes('自家座位尚未识别')));
  assert.equal(s.selfSeat, null);
});

test('selecting own seat before untracked actions preserves a complete opening', () => {
  const s = S.selectSelfSeat(S.apply(S.initial(), { ...round(), operation: undefined }), 1);
  assert.equal(s.complete, true); assert.deepEqual(s.warnings, []);
  const changed = S.selectSelfSeat(s, 2);
  assert.equal(changed.complete, false);
  assert.ok(changed.warnings.some(w => w.includes('座位已手动变更')));
});

test('resolving own seat does not erase a missing-event warning', () => {
  let s = S.apply(S.initial(), { ...round(), operation: undefined });
  s = S.apply(s, evt('DealTile', { seat: 2, tile: '?', step: 3 }));
  s = S.selectSelfSeat(s, 1);
  assert.equal(s.complete, false);
  assert.ok(s.warnings.some(w => w.includes('动作序号有缺口')));
  assert.ok(!s.warnings.some(w => w.includes('自家座位尚未识别')));
});

test('dora follows numbered tiles and wraps nine to one in each suit', () => {
  for (const suit of ['m', 'p', 's']) {
    const indicators = ['1','2','3','4','5','6','7','8','9'].map(n => n + suit);
    assert.deepEqual(indicators.map(t => S.doraTile(t)), ['2','3','4','5','6','7','8','9','1'].map(n => n + suit));
    assert.equal(S.doraTile('0' + suit), '6' + suit);
  }
});

test('winds and dragons use separate dora cycles', () => {
  assert.deepEqual(['1z','2z','3z','4z','5z','6z','7z'].map(t => S.doraTile(t)),
    ['2z','3z','4z','1z','6z','7z','5z']);
});

test('three-player dora skips absent manzu while other suits and honors keep their cycles', () => {
  assert.equal(S.doraTile('1m', 3), '9m'); assert.equal(S.doraTile('9m', 3), '1m');
  for (const t of ['2m','5m','0m','8m','?','0z','8z','10m',null,undefined]) assert.equal(S.doraTile(t, 3), '?');
  assert.equal(S.doraTile('9p', 3), '1p'); assert.equal(S.doraTile('0s', 3), '6s');
  assert.equal(S.doraTile('4z', 3), '1z'); assert.equal(S.doraTile('7z', 3), '5z');
});

test('dora display tracks newly revealed indicators, preserves duplicates and resets on a new round', () => {
  let s = S.apply(S.initial(), round());
  assert.deepEqual(S.doraTiles(s), ['8p']);
  s = S.apply(s, evt('DealTile', { seat: 1, tile: '1m', step: 1, doras: ['7p','9m','7p','?'] }));
  assert.deepEqual(S.doraTiles(s), ['8p','1m','8p','?']);
  assert.deepEqual(s.doras, ['7p','9m','7p','?']);
  s = S.apply(s, { ...round(), scores: [35000,35000,35000], doras: ['1m'] });
  assert.deepEqual(S.doraTiles(s), ['9m']);
  assert.deepEqual(S.doraTiles(S.initial()), []);
});


test('discard method preserves explicit booleans and normalizes missing or invalid values to unknown', () => {
  for (const value of [true, false, undefined, null, 0, 1, 'false']) {
    const before = S.apply(S.initial(), round());
    const next = S.apply(before, evt('DiscardTile', { seat: 0, tile: '1m', tsumogiri: value, step: 1 }));
    assert.equal(next.players[0].discards[0].tsumogiri, typeof value === 'boolean' ? value : null);
    assert.equal(before.players[0].discards.length, 0);
  }
  // Protobuf defaults are decoded booleans and remain known tedashi.
  const decoded = P.decodeEvent('ActionDiscardTile', F.cat(F.n(1, 0), F.t(2, '1m')), 'live');
  assert.equal(decoded.tsumogiri, false);
  assert.equal(S.apply(S.apply(S.initial(), round()), decoded).players[0].discards[0].tsumogiri, false);
});

test('turn progress requires an observed opening, advances on discard once and ignores replacement draws', () => {
  let s = S.apply(S.initial(), evt('DealTile', { seat: 2, tile: '?', step: 20 }));
  assert.equal(s.turnProgress.status, 'unknown'); assert.deepEqual(s.turnProgress.bySeat, [null,null,null,null]);
  s = S.apply(s, round()); assert.deepEqual(s.turnProgress.bySeat, [1,1,1,1]);
  s = S.apply(s, evt('DealTile', { seat: 2, tile: '?', step: 1 }));
  const discard = evt('DiscardTile', { seat: 2, tile: '1p', step: 2 });
  s = S.apply(s, discard); s = S.apply(s, discard);
  assert.deepEqual(s.turnProgress.bySeat, [1,1,2,1]);
  s = S.apply(s, evt('AnGangAddGang', { seat: 2, meldType: 3, tile: '2p', step: 3 }));
  s = S.apply(s, evt('DealTile', { seat: 2, tile: '?', step: 4 }));
  s = S.apply(s, evt('BaBei', { seat: 2, step: 5 }));
  s = S.apply(s, evt('DealTile', { seat: 2, tile: '?', step: 6 }));
  assert.deepEqual(s.turnProgress.bySeat, [1,1,2,1]);
});

test('calls preserve turn count until discard, including the called-away tile in the source history', () => {
  let s = S.apply(S.initial(), round());
  s = S.apply(s, evt('DiscardTile', { seat: 0, tile: '8s', step: 1 }));
  s = S.apply(s, evt('ChiPengGang', { seat: 1, meldType: 1, tiles: ['8s','8s','8s'], froms: [1,0,1], step: 2 }));
  assert.deepEqual(s.turnProgress.bySeat, [2,1,1,1]);
  s = S.apply(s, evt('DiscardTile', { seat: 1, tile: s.selfHand[0], step: 3 }));
  assert.deepEqual(s.turnProgress.bySeat, [2,2,1,1]); assert.equal(s.players[0].discards[0].called, true);
});

test('sequence gaps, absent sequence and unsupported events keep turns unknown until a new opening', () => {
  for (const bad of [evt('DealTile', { seat: 2, tile: '?', step: 4 }), evt('DealTile', { seat: 2, tile: '?' }), evt('Unsupported', { name: 'ActionUnknown', step: 1 })]) {
    let s = S.apply(S.apply(S.initial(), round()), bad);
    assert.equal(s.turnProgress.status, 'unknown');
    s = S.apply(s, evt('DiscardTile', { seat: 2, tile: '1p', step: 5 }));
    assert.equal(s.turnProgress.status, 'unknown'); assert.ok(s.turnProgress.bySeat.every(n => n === null));
    s = S.apply(s, round()); assert.equal(s.turnProgress.status, 'known');
  }
});

test('turn tracking is independent of own-seat discovery, supports sanma and detects replay index gaps', () => {
  const opening = { ...round(), operation: undefined, scores: [35000,35000,35000] };
  let s = S.apply(S.initial(), opening); s = S.apply(s, evt('DiscardTile', { seat: 2, tile: '1p', step: 1 }));
  assert.equal(s.selfSeat, null); assert.deepEqual(s.turnProgress.bySeat, [1,1,2]);
  s = S.selectSelfSeat(s, 2); assert.deepEqual(s.turnProgress.bySeat, [1,1,2]);
  let r = S.apply(S.initial('replay'), { ...opening, source: 'replay', recordIndex: 10 });
  r = S.apply(r, { kind: 'DiscardTile', source: 'replay', seat: 2, tile: '1p', recordIndex: 12 });
  assert.equal(r.turnProgress.status, 'unknown'); assert.equal(r.turnProgress.reason, 'event_gap');
});
