const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fromObservation, validateRequest, tile } = require('../extension/adapters/mjai.js');
const hand = ['1m', '2m', '3m', '4m', '0m', '6m', '7m', '8m', '9m', '1p', '2p', '3p', '1z'];
const newRound = { kind: 'NewRound', source: 'live', step: 0, wind: 0, round: 0, honba: 0, sticks: 0, scores: [25000, 25000, 25000, 25000], doras: ['7z'], hand };
function live(events = [], seat = 1) {
  return { format: 'mj-observer-v1', mode: 'live', state: { selfSeat: seat, complete: true }, events: [structuredClone(newRound), ...events.map((e, i) => ({ source: 'live', step: i + 1, ...e }))] };
}
const convert = o => fromObservation(o, { hand: true });
test('converts red/honor tiles and anonymizes start game without modifying input', () => {
  const observation = live(), before = structuredClone(observation), result = convert(observation);
  assert.equal(tile('0m'), '5mr');
  assert.deepEqual(['1z', '2z', '3z', '4z', '5z', '6z', '7z'].map(tile), ['E', 'S', 'W', 'N', 'P', 'F', 'C']);
  assert.equal(result.events[1].dora_marker, 'C');
  assert.deepEqual(result.events[1].tehais[0], Array(13).fill('?'));
  assert.equal(result.events[1].tehais[1][4], '5mr');
  assert.deepEqual(observation, before);
});
test('requires explicit hand consent and confirmed live seat', () => {
  assert.throws(() => fromObservation(live()), /hand:true/);
  assert.throws(() => fromObservation(live(), { seat: 2, hand: true }), /座位/);
  const o = live(); o.state.selfSeat = null;
  assert.throws(() => convert(o), /座位/);
  assert.equal(fromObservation(o, { seat: 2, hand: true }).seat, 2);
});
test('replay reads only prefix before cursor and hides all opponents including their draws', () => {
  const records = [{ ...newRound, source: 'replay', recordIndex: 0, hands: [hand, hand, hand, hand] },
    { kind: 'DealTile', source: 'replay', recordIndex: 1, seat: 0, tile: '7z' },
    { kind: 'Unsupported', source: 'replay', recordIndex: 2 }];
  const o = { format: 'mj-observer-v1', mode: 'replay', state: { selfSeat: 1 }, replayRecords: records, replayCursor: 2 };
  const result = convert(o);
  assert.deepEqual(result.events.at(-1), { type: 'tsumo', actor: 0, pai: '?' });
  assert.deepEqual(result.events[1].tehais[0], Array(13).fill('?'));
  assert.throws(() => fromObservation(o, { hand: true, cursor: 3 }), /unsupported/);
  assert.equal(fromObservation(o, { hand: true, cursor: 1 }).events.length, 2);
});
test('opponent dealer 14-tile replay opening becomes 13 hidden tiles plus a hidden draw at cursor 1', () => {
  const hands = [hand.concat('7z'), hand, hand, hand];
  const records = [{ ...newRound, source: 'replay', recordIndex: 0, hands }];
  Object.defineProperty(records, 1, { get() { throw new Error('future opening discard must not be read'); } });
  const o = { format: 'mj-observer-v1', mode: 'replay', state: { selfSeat: 1 }, replayRecords: records, replayCursor: 1 };
  const result = convert(o);
  assert.deepEqual(result.events[1].tehais[0], Array(13).fill('?'));
  assert.deepEqual(result.events.at(-1), { type: 'tsumo', actor: 0, pai: '?' });
  assert.equal(JSON.stringify(result).includes('7z'), false);
  assert.deepEqual(hands[0], hand.concat('7z'));
});
test('real replay opening supports dealer discard without an extra recorded draw and rejects inconsistent 14-tile hands', () => {
  const o = { format: 'mj-observer-v1', mode: 'replay', state: { selfSeat: 1 }, replayCursor: 3,
    replayRecords: [{ ...newRound, source: 'replay', recordIndex: 0, hands: [hand.concat('7z'), hand, hand, hand] },
      { kind: 'DiscardTile', source: 'replay', recordIndex: 1, seat: 0, tile: '1m', riichi: false, tsumogiri: false },
      { kind: 'DealTile', source: 'replay', recordIndex: 2, seat: 1, tile: '9p' }] };
  assert.deepEqual(convert(o).events.slice(2).map(e => e.type), ['tsumo', 'dahai', 'tsumo']);
  o.replayRecords[1] = { kind: 'DealTile', source: 'replay', recordIndex: 1, seat: 0, tile: '8p' };
  assert.throws(() => convert(o), /首动作/);
  o.replayCursor = 1; o.replayRecords[0].hands[2] = hand.concat('1s');
  assert.throws(() => convert(o), /张数/);
  o.state.selfSeat = 0;
  assert.throws(() => convert(o), /自家开局需13张/);
});
test('live normal wall count and visible first dealer discard establish hidden initial draw', () => {
  const actions = [{ kind: 'DiscardTile', seat: 0, tile: '1m', riichi: false, tsumogiri: false },
    { kind: 'DealTile', seat: 1, tile: '9p' }];
  const o = live(actions); o.events[0].remaining = 69;
  assert.deepEqual(convert(o).events.slice(2).map(e => e.type), ['tsumo', 'dahai', 'tsumo']);
  const newRoundOnly = live(); newRoundOnly.events[0].remaining = 69;
  assert.equal(convert(newRoundOnly).events.length, 2);
  o.events[0].remaining = 70;
  assert.deepEqual(convert(o).events.slice(2).map(e => e.type), ['dahai', 'tsumo']);
  const explicitDraw = live([{ kind: 'DealTile', seat: 0, tile: '?' }]); explicitDraw.events[0].remaining = 69;
  assert.equal(convert(explicitDraw).events.filter(e => e.type === 'tsumo').length, 1);
});
test('a real nondealer live opening reaches engine validation and returns a legal discard', async () => {
  const State = require('../extension/state.js');
  const Snapshot = require('../extension/collector/snapshot-adapter.js');
  const EngineAgent = require('../extension/engine-agent.js');
  const o = live([{ kind: 'DiscardTile', seat: 0, tile: '1m', riichi: false, tsumogiri: false }, { kind: 'DealTile', seat: 1, tile: '9p' }]);
  o.events[0].remaining = 69;
  let state = State.initial('live', 1);
  for (const e of o.events) state = State.apply(state, e);
  const result = await EngineAgent.run({ snapshot: Snapshot.snapshot(state, { game: true, rivers: 'all', hand: true }), request: convert(o),
    infer: async () => ({ action: { type: 'dahai', actor: 1, pai: '9p', tsumogiri: true } }) });
  assert.equal(result.result.decision.tile, '9p');
});
test('rejects historical, incomplete, midround, missing steps, unsupported and three-player data', () => {
  for (const mutate of [o => { o.historyView = { match: 'x' }; }, o => { o.state.complete = false; },
    o => { o.events.shift(); }, o => { o.events[0].scores.pop(); }, o => { o.events[0].hand = [...hand, '5p']; }]) {
    const o = live(); mutate(o); assert.throws(() => convert(o));
  }
  assert.throws(() => convert(live([{ kind: 'DealTile', seat: 0, tile: '?', step: 3 }])), /序号/);
  assert.throws(() => convert(live([{ kind: 'BaBei', seat: 0 }])), /unsupported/);
  assert.throws(() => convert(live([{ kind: 'DiscardTile', seat: 0, tile: '1m' }])), /标记/);
});
test('live uses latest round only and never synthesizes from state', () => {
  const o = live([{ kind: 'Unsupported' }]);
  o.events.push({ ...newRound, step: 20, round: 2 });
  o.state.selfHand = ['9z'];
  const result = convert(o);
  assert.equal(result.events.length, 2); assert.equal(result.events[1].kyoku, 3);
});
test('reach precedes declaration discard, acceptance precedes next draw and new dora', () => {
  const result = convert(live([
    { kind: 'DiscardTile', seat: 0, tile: '1m', riichi: true, tsumogiri: false },
    { kind: 'DealTile', seat: 1, tile: '9p', riichiSuccess: { seat: 0, score: 24000, sticks: 1, failed: false }, doras: ['7z', '1m'] },
    { kind: 'DiscardTile', seat: 1, tile: '9p', riichi: false, tsumogiri: true }
  ]));
  assert.deepEqual(result.events.slice(2).map(e => e.type), ['reach', 'dahai', 'reach_accepted', 'dora', 'tsumo', 'dahai']);
  assert.throws(() => convert(live([{ kind: 'DealTile', seat: 1, tile: '9p', riichiSuccess: { seat: 0, failed: false } }])), /宣言/);
});
test('pon and added kan preserve red tile composition and require previous discard', () => {
  const result = convert(live([
    { kind: 'DiscardTile', seat: 0, tile: '0p', riichi: false, tsumogiri: false },
    { kind: 'ChiPengGang', seat: 2, meldType: 1, tiles: ['5p', '0p', '5p'], froms: [2, 0, 2] },
    { kind: 'AnGangAddGang', seat: 2, meldType: 2, tile: '5p' }
  ]));
  assert.deepEqual(result.events.at(-1), { type: 'kakan', actor: 2, pai: '5p', consumed: ['5p', '5pr', '5p'] });
  assert.throws(() => convert(live([{ kind: 'AnGangAddGang', seat: 2, meldType: 2, tile: '5p' }])), /原碰/);
  assert.throws(() => convert(live([{ kind: 'AnGangAddGang', seat: 2, meldType: 3, tile: '5p' }])), /赤牌/);
});
test('self ankan resolves red tiles from observed own hand', () => {
  const o = live([{ kind: 'DealTile', seat: 1, tile: '5m' }, { kind: 'AnGangAddGang', seat: 1, meldType: 3, tile: '5m' }]);
  o.events[0].hand = ['0m', '5m', '5m', '1m', '2m', '3m', '4m', '6m', '7m', '8m', '9m', '1p', '1z'];
  const result = convert(o);
  assert.deepEqual(result.events.at(-1).consumed, ['5mr', '5m', '5m', '5m']);
});
test('chi preserves called tile and consumed order, rejecting calls from wrong player', () => {
  const actions = [{ kind: 'DiscardTile', seat: 0, tile: '2m', riichi: false, tsumogiri: false },
    { kind: 'ChiPengGang', seat: 1, meldType: 0, tiles: ['1m', '2m', '3m'], froms: [1, 0, 1] }];
  assert.deepEqual(convert(live(actions)).events.at(-1), { type: 'chi', actor: 1, target: 0, pai: '2m', consumed: ['1m', '3m'] });
  actions[0].seat = 2; actions[1].froms[1] = 2;
  assert.throws(() => convert(live(actions)), /chi/);
});
test('dora changes must append and replay record indices cannot disappear', () => {
  assert.throws(() => convert(live([{ kind: 'DealTile', seat: 0, tile: '?', doras: ['1z'] }])), /宝牌/);
  const o = { format: 'mj-observer-v1', mode: 'replay', state: { selfSeat: 1 }, replayCursor: 1,
    replayRecords: [{ ...newRound, source: 'replay', hands: [hand, hand, hand, hand] }] };
  assert.throws(() => convert(o), /序号/);
});
test('end records terminate round without fabricating missing hora details', () => {
  const result = convert(live([{ kind: 'Hule', gameEnded: true }]));
  assert.deepEqual(result.events.slice(-2), [{ type: 'end_kyoku' }, { type: 'end_game' }]);
  assert.throws(() => convert(live([{ kind: 'NoTile' }, { kind: 'DealTile', seat: 0, tile: '1m' }])), /结束/);
});
test('bridge validation rejects unknown fields, concealed opponents, malformed events and excessive size', () => {
  const request = convert(live());
  const attacks = [r => { r.account = 'secret'; }, r => { r.events[0].names[0] = 'real name'; },
    r => { r.events[1].tehais[0][0] = '1m'; }, r => { r.events[1].tehais[1][0] = '?'; },
    r => { r.events.push({ type: 'tsumo', actor: 0, pai: '1m' }); }, r => { r.events.push({ type: 'hora', actor: 0 }); },
    r => { r.events.push({ type: 'dahai', actor: 1, pai: '1m' }); }, r => { r.events[1].private = { hand }; },
    r => { r.events = Array(2001).fill({ type: 'end_kyoku' }); }];
  for (const mutate of attacks) { const r = structuredClone(request); mutate(r); assert.throws(() => validateRequest(r)); }
  const clean = validateRequest(request); clean.events[1].tehais[1][0] = '9m';
  assert.equal(request.events[1].tehais[1][0], '1m');
});
