const { test } = require('node:test');
const assert = require('node:assert/strict');
const P = require('../extension/protocol.js');
const F = require('./fixtures.js');

test('message ID is 16-bit little endian; response is associated without a method name', () => {
  assert.equal(P.frame(F.frame(2, '.lq.Lobby.fetchGameRecord', [], 513)).id, 513);
  assert.equal(P.frame(F.frame(3, '', [], 513)).name, '');
});
test('wire reader handles packed signed scores and unknown fields', () => {
  const f = P.wire(F.cat(F.packed(6, [25000, -1000, 0]), F.t(99, 'unknown')));
  assert.deepEqual(P.nums(f, 6), [25000, -1000, 0]);
});
test('truncated and overlong fields fail explicitly', () => {
  for (const b of [[10, 5, 1], [8, 128], [0], [13, 1], [8, ...Array(10).fill(255)]]) assert.throws(() => P.wire(Uint8Array.from(b)));
});
test('masked ActionPrototype produces only selected game fields', () => {
  const packet = F.cat(F.n(1, 0), F.t(2, 'ActionNewRound'), F.b(3, P.unmask(F.liveRound())));
  const e = P.action(packet);
  assert.equal(e.encoding, 'masked'); assert.equal(e.operation.seat, 1);
  assert.deepEqual(e.hand, F.hand); assert.deepEqual(e.scores, [25000,25000,25000,25000]);
  assert.equal(e.remaining, 69);
});
test('plain ActionPrototype fallback is usable', () => {
  const packet = F.cat(F.n(1, 1), F.t(2, 'ActionDiscardTile'), F.b(3, F.cat(F.n(1, 1), F.t(2, '3z'), F.n(5, 1))));
  const e = P.action(packet); assert.equal(e.encoding, 'plain'); assert.equal(e.tile, '3z'); assert.equal(e.tsumogiri, true);
});
test('record arrays decode without exporting future wall, names or unselected fields', () => {
  const round = F.cat(F.replayRound(), F.t(14, 'FUTURE_WALL'), F.t(99, 'SECRET'));
  const input = F.wrap('.lq.GameDetailRecords', F.b(1, F.wrap('.lq.RecordNewRound', round)));
  const events = P.replay(input);
  assert.equal(events.length, 1); assert.deepEqual(events[0].hands[2], F.hand);
  assert.equal(JSON.stringify(events).includes('SECRET'), false); assert.equal(JSON.stringify(events).includes('FUTURE_WALL'), false);
});
test('versioned actions.result replay records are supported', () => {
  const event = F.wrap('.lq.RecordDealTile', F.cat(F.n(1, 2), F.t(2, '0p'), F.n(3, 68)));
  const input = F.wrap('.lq.GameDetailRecords', F.cat(F.n(2, 210715), F.b(3, F.b(3, event))));
  assert.equal(P.replay(input)[0].tile, '0p');
});
test('unknown events are explicit and not guessed as supported actions', () => {
  assert.equal(P.decodeEvent('ActionNewSpecialRule', new Uint8Array(), 'live').kind, 'Unsupported');
  assert.throws(() => P.decodeEvent('ActionNewRound', new Uint8Array(), 'live'));
});
test('riichi success has seat, exact score, and stick count', () => {
  const e = P.decodeEvent('ActionDealTile', F.cat(F.n(1, 2), F.b(5, F.cat(F.n(1, 1), F.n(2, 24000), F.n(3, 1)))), 'live');
  assert.deepEqual(e.riichiSuccess, { seat: 1, score: 24000, sticks: 1, failed: false });
});
test('discard tile identity is independent of tsumogiri display metadata', () => {
  const base = F.cat(F.n(1, 2), F.t(2, '0p'));
  const normal = P.decodeEvent('RecordDiscardTile', base, 'replay');
  const moqie = P.decodeEvent('RecordDiscardTile', F.cat(base, F.n(5, 1)), 'replay');
  assert.equal(normal.tile, '0p'); assert.equal(moqie.tile, '0p');
  assert.equal(normal.tsumogiri, false); assert.equal(moqie.tsumogiri, true);
});
