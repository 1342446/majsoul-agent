const { test } = require('node:test');
const assert = require('node:assert/strict');
const P = require('../extension/protocol.js');
const F = require('./fixtures.js');
const S = require('../extension/state.js');
const Snapshot = require('../extension/collector/snapshot-adapter.js');

// Handwritten protobuf fixtures follow lq.HuleInfo/FanInfo/NoTileScoreInfo.
function huleInfo(extra = new Uint8Array()) {
  return F.cat(F.n(4, 1), F.t(3, '3m'), F.n(11, 3), F.n(13, 40),
    F.b(12, F.cat(F.t(1, '立直'), F.n(2, 1), F.n(3, 1), F.t(99, 'PRIVATE_FAN_DATA'))),
    F.strings(9, ['5p']), F.n(15, 5200), F.n(19, 5200), F.t(14, 'PRIVATE_TITLE'), extra);
}
const hule = (...infos) => F.cat(...infos.map(info => F.b(1, info)),
  F.packed(2, [25000, 25000, 25000, 25000]), F.packed(3, [-5200, 5200, 0, 0]),
  F.packed(5, [19800, 30200, 25000, 25000]), F.t(99, 'PRIVATE_ACCOUNT'));

test('replay retains selected win values while live winner shape stays unchanged', () => {
  const data = hule(huleInfo());
  const event = P.decodeEvent('RecordHule', data, 'replay');
  assert.deepEqual(event.winners[0], { seat: 1, tile: '3m', tsumo: false, han: 3, fu: 40,
    fans: [{ id: 1, value: 1, name: '立直' }], uraDoras: ['5p'], yakuman: false, dealer: false,
    pointRon: 5200, pointTsumoDealer: null, pointTsumoNonDealer: null, pointSum: 5200,
    responsibility: { value: null, seats: [] } });
  const live = P.decodeEvent('ActionHule', data, 'live');
  assert.deepEqual(live.winners, [{ seat: 1, tile: '3m', tsumo: false, han: 3, fu: 40 }]);
  assert.equal('responsibility' in live, false);
  assert.doesNotMatch(JSON.stringify(event), /PRIVATE/);
});

test('replay flags yakuman and responsibility without inventing per-winner deltas', () => {
  const info = huleInfo(F.cat(F.n(5, 1), F.n(6, 1), F.n(10, 1), F.n(16, 16000),
    F.n(17, 16000), F.n(21, 2), F.packed(22, [3])));
  const event = P.decodeEvent('RecordHule', F.cat(hule(info, huleInfo()), F.n(9, 3)), 'replay');
  assert.equal(event.winners.length, 2);
  assert.equal(event.winners[0].yakuman, true);
  assert.equal(event.winners[0].pointTsumoDealer, 16000);
  assert.deepEqual(event.winners[0].responsibility, { value: 2, seats: [3] });
  assert.equal(event.responsibility, 3);
  assert.equal('deltas' in event.winners[0], false);
  const absent = P.decodeEvent('RecordHule', F.b(1, F.n(4, 1)), 'replay').winners[0];
  assert.equal(absent.pointRon, null);
  assert.deepEqual(absent.fans, []);
});

test('fan labels are bounded and unselected nested data never survives', () => {
  const info = F.cat(F.b(12, F.t(1, 'x'.repeat(81))), F.t(1, 'PLAYER_NAME'), F.t(2, 'ACCOUNT_ID'));
  const event = P.decodeEvent('RecordHule', F.b(1, info), 'replay');
  assert.deepEqual(event.winners[0].fans, [{ id: null, value: null, name: null }]);
  assert.doesNotMatch(JSON.stringify(event), /PLAYER_NAME|ACCOUNT_ID|xxxx/);
});

test('exhaustive draw retains auditable settlements only in replay and marks unknown totals', () => {
  const oldScores = [25000, 25000, 25000, 25000], deltas = [1500, 1500, -1500, -1500];
  const settlement = F.cat(F.n(1, 0), F.packed(2, oldScores), F.packed(3, deltas), F.t(4, 'PRIVATE_HAND'));
  const data = F.cat(F.b(3, settlement), ...[1, 1, 0, 0].map(x => F.b(2, F.n(3, x))));
  const replay = P.decodeEvent('RecordNoTile', data, 'replay');
  assert.deepEqual(replay.oldScores, oldScores);
  assert.deepEqual(replay.deltas, deltas);
  assert.deepEqual(replay.tenpai, [true, true, false, false]);
  assert.deepEqual(replay.scoreSettlements, [{ seat: 0, oldScores, deltas }]);
  assert.equal(replay.settlementUnknown, false);
  assert.doesNotMatch(JSON.stringify(replay), /PRIVATE_HAND/);
  const live = P.decodeEvent('ActionNoTile', data, 'live');
  assert.equal('scoreSettlements' in live, false);
  assert.deepEqual(live.scores, replay.scores);
  assert.equal(P.decodeEvent('RecordNoTile', new Uint8Array(), 'replay').settlementUnknown, true);
  const inconsistent = F.cat(data, F.b(3, F.cat(F.packed(2, [1, 2, 3, 4]), F.packed(3, deltas))));
  assert.equal(P.decodeEvent('RecordNoTile', inconsistent, 'replay').settlementUnknown, true);
});

test('special draw retains known reason and history flag without hidden hands', () => {
  const data = F.cat(F.n(1, 4), F.n(3, 2), F.t(6, 'FUTURE_WALL'), F.b(9, huleInfo()));
  const replay = P.decodeEvent('RecordLiuJu', data, 'replay');
  assert.equal(replay.reason, 4);
  assert.equal(replay.seat, 2);
  assert.equal(replay.hasHuleHistory, true);
  assert.doesNotMatch(JSON.stringify(replay), /FUTURE_WALL|PRIVATE/);
  assert.equal('seat' in P.decodeEvent('ActionLiuJu', data, 'live'), false);
});

test('replay win details do not enter the model snapshot contract', () => {
  let state = S.apply(S.initial('replay', 0), P.decodeEvent('RecordNewRound', F.replayRound(), 'replay'));
  state = S.apply(state, P.decodeEvent('RecordHule', hule(huleInfo()), 'replay'));
  const snapshot = Snapshot.snapshot(state, { game: true, rivers: 'all', hand: false });
  assert.doesNotMatch(JSON.stringify(snapshot), /fans|uraDoras|pointRon|responsibility|winners|立直/);
});
