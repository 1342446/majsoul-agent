const { test } = require('node:test');
const assert = require('node:assert/strict');
const N = require('../extension/adapters/naga-replay.js');
const P = require('../extension/protocol.js');
const F = require('./fixtures.js');
// All tiles and events below are hand-authored test scenarios, not imported logs.
const rules = { roundType: 'hanchan', redFives: true, kuitan: true };
function fixture(south) {
  const stock = [];
  for (const suit of 'mpsz') for (let n = 1; n <= (suit === 'z' ? 7 : 9); n++) for (let c = 0; c < 4; c++) stock.push(n === 5 && c === 0 && suit !== 'z' ? '0' + suit : n + suit);
  const take = ts => ts.forEach(t => { const i = stock.indexOf(t); assert.ok(i >= 0); stock.splice(i, 1); });
  const own = ['1m', '1m', '1m', '2m', '3m', '4m', '2p', '3p', '4p', '6s', '7s', '8s', '1z'];
  take(own); const draw = '1z'; take([draw]); const dora = '7z'; take([dora]);
  if (south) take(south);
  const hands = [own, south || stock.splice(0, 13), stock.splice(0, 13), stock.splice(0, 13)];
  const records = [{ kind: 'NewRound', hands, scores: [25000, 25000, 25000, 25000], wind: 0, round: 0, honba: 0, sticks: 0, remaining: 70, doras: [dora] },
    { kind: 'DealTile', seat: 0, tile: draw, remaining: 69 },
    { kind: 'Hule', oldScores: [25000, 25000, 25000, 25000], deltas: [1500, -500, -500, -500], scores: [26500, 24500, 24500, 24500],
      winners: [{ seat: 0, tile: draw, tsumo: true, yakuman: false, han: 1, fu: 30, fans: [{ id: 1, value: 1, name: '门前清自摸和' }], uraDoras: [], pointTsumoNonDealer: 500, pointTsumoDealer: 500 }] }];
  return observation(records);
}
function observation(records) { return { format: 'mj-observer-v1', mode: 'replay', replayRecords: records.map((e, i) => ({ ...e, source: 'replay', recordIndex: i })) }; }
function unused(o) {
  const stock = [];
  for (const suit of 'mpsz') for (let n = 1; n <= (suit === 'z' ? 7 : 9); n++) for (let c = 0; c < 4; c++) stock.push(n === 5 && c === 0 && suit !== 'z' ? '0' + suit : n + suit);
  for (const t of [...o.replayRecords[0].hands.flat(), ...o.replayRecords[0].doras, '1z']) { const at = stock.indexOf(t); assert.ok(at >= 0, t); stock.splice(at, 1); }
  return stock;
}
const convert = o => N.fromObservation(o, { rules });
function rejection(o, pattern) { const out = convert(o); assert.equal(out.rounds.length, 0); assert.match(out.rejected[0].reason, pattern); }
test('pure UMD exports deterministic anonymous one-round Tenhou5 JSON URLs', () => {
  const o = fixture(), before = JSON.stringify(o); o.state = { nickname: 'SECRET' }; o.replayCursor = 0;
  const out = convert(o), r = out.rounds[0];
  assert.equal(out.format, 'majsoul-naga-export-v1'); assert.equal(out.rejected.length, 0);
  assert.equal(r.json.log[0].length, 17); assert.deepEqual(r.json.log[0][0], [0, 0, 0]);
  assert.deepEqual(r.json.log[0][5], [41]); assert.equal(r.json.log[0][16][0], '和了');
  assert.deepEqual(r.json.log[0][16][2], [0, 0, 0, '30符1飜500点∀', '門前清自摸和(1飜)']);
  assert.deepEqual(JSON.parse(decodeURIComponent(r.url.split('#json=')[1])), r.json);
  assert.equal(out.text, r.url); assert.equal(out.text.includes('SECRET'), false);
  delete o.state; delete o.replayCursor; assert.equal(JSON.stringify(o), before);
  assert.deepEqual(convert(o), out); assert.equal(globalThis.MJNagaReplay, N);
});
test('red fives retain distinct tile codes', () => {
  assert.equal(N.tile('0m'), 51); assert.equal(N.tile('0p'), 52); assert.equal(N.tile('0s'), 53);
  assert.equal(N.tile('5p'), 25); assert.equal(N.tile('7z'), 47); assert.throws(() => N.tile('?'));
});
test('never uses live records, current state, historical snapshots or implicit rules', () => {
  assert.throws(() => convert({ ...fixture(), mode: 'live' }), /实战/);
  assert.throws(() => convert({ ...fixture(), historyView: true }), /快照/);
  assert.throws(() => N.fromObservation(fixture()), /规则/);
  for (const r of [{ ...rules, players: 3 }, { ...rules, kuitan: false }, { ...rules, roundType: 'special' }]) assert.throws(() => N.fromObservation(fixture(), { rules: r }), /规则/);
});
test('missing frames and wrong source are global failures', () => {
  const o = fixture(); o.replayRecords[1].recordIndex = 4; assert.throws(() => convert(o), /序号/);
  o.replayRecords[1].recordIndex = 1; o.replayRecords[1].source = 'live'; assert.throws(() => convert(o), /来源/);
});
test('rejects sanma, partial hands and unknown events rather than inventing data', () => {
  const o = fixture(); o.replayRecords[0].hands.pop(); rejection(o, /配牌/);
  const a = fixture(); a.replayRecords[0].hands[1].pop(); rejection(a, /配牌/);
  const b = fixture(); b.replayRecords[1].kind = 'Unsupported'; rejection(b, /未知/);
  const c = fixture(); c.replayRecords.pop(); rejection(c, /缺少终局/);
});
test('rejects impossible tile supply, draw order, wall counts and tsumogiri', () => {
  const o = fixture(); o.replayRecords[1].seat = 2; rejection(o, /摸牌顺序/);
  const a = fixture(); a.replayRecords[1].remaining = 68; rejection(a, /余量/);
  const b = fixture(); b.replayRecords[1].tile = '1m'; rejection(b, /四张/);
  const c = fixture(); c.replayRecords.splice(2, 0, { kind: 'DiscardTile', seat: 0, tile: '2m', tsumogiri: true, riichi: false }); rejection(observation(c.replayRecords), /摸切牌/);
});
test('no red tiles may appear under explicitly confirmed no-red rules', () => {
  const o = fixture(); const out = N.fromObservation(o, { rules: { ...rules, redFives: false } });
  assert.equal(out.rounds.length, 0); assert.match(out.rejected[0].reason, /赤五/);
});
test('14-tile dealer opening requires a provable initial draw', () => {
  const south = ['5z', '5z', '5z', '6z', '6z', '6z', '2s', '3s', '4s', '6m', '7m', '8m', '1z'];
  const o = fixture(south), rs = o.replayRecords; rs[0].hands[0].push('1z'); rs[0].remaining = 69;
  rs[1] = { kind: 'DiscardTile', seat: 0, tile: '1z', tsumogiri: true, riichi: false };
  const w = rs[2].winners[0]; Object.assign(w, { seat: 1, tsumo: false, tile: '1z', pointRon: 2600, han: 2, fu: 40, fans: [{ name: '役牌 白', value: 1 }, { name: '役牌 发', value: 1 }] });
  rs[2].deltas = [-2600, 2600, 0, 0]; rs[2].scores = [22400, 27600, 25000, 25000];
  const out = convert(observation(rs)); assert.equal(out.rounds.length, 1, JSON.stringify(out.rejected));
  assert.equal(out.rounds[0].json.log[0][4].length, 13); assert.deepEqual(out.rounds[0].json.log[0][5], [41]); assert.deepEqual(out.rounds[0].json.log[0][6], [60]);
  rs[1].tsumogiri = false; rejection(observation(rs), /14张/);
});
test('unknown yaku, missing ura, multiple winners and responsibility reject explicitly', () => {
  const o = fixture(); o.replayRecords[2].winners[0].fans[0].name = 'UNTRUSTED'; rejection(o, /役种/);
  const a = fixture(); delete a.replayRecords[2].winners[0].uraDoras; rejection(a, /里宝牌/);
  const b = fixture(); b.replayRecords[2].winners.push({ ...b.replayRecords[2].winners[0], seat: 1 }); rejection(b, /多家和牌/);
  const c = fixture(); c.replayRecords[2].winners[0].responsibility = { value: 0, seats: [2] }; rejection(c, /包牌/);
  const d = fixture(); d.replayRecords[2].winners[0].fans[0].name = '__proto__'; rejection(d, /役种/);
});
test('settlement and fan counts must agree; never infers absent payment points', () => {
  const o = fixture(); o.replayRecords[2].winners[0].han = 2; rejection(o, /番符/);
  const a = fixture(); a.replayRecords[2].winners[0].pointTsumoNonDealer = null; rejection(a, /支付点数/);
  const b = fixture(); b.replayRecords[2].winners[0].pointTsumoNonDealer = 700; rejection(b, /结算不一致/);
  const c = fixture(); c.replayRecords[2].scores[1]++; rejection(c, /分数不一致/);
});
test('mixed replay lists supported and rejected rounds independently', () => {
  const a = fixture().replayRecords, b = fixture().replayRecords; b[1].kind = 'BaBei';
  const out = convert(observation(a.concat(b))); assert.equal(out.rounds.length, 1); assert.equal(out.rejected.length, 1);
  assert.notEqual(out.rounds[0].id, out.rejected[0].id); assert.equal(out.text, out.rounds[0].url);
});
test('special draws and unfinished exhaustive draw are rejected', () => {
  const a = fixture(); a.replayRecords[2] = { kind: 'LiuJu' }; rejection(observation(a.replayRecords), /途中流局/);
  const b = fixture(); b.replayRecords[2] = { kind: 'NoTile', nagashi: true }; rejection(observation(b.replayRecords), /特殊流局/);
});
test('input event and serialized size limits are enforced', () => {
  assert.throws(() => convert({ ...fixture(), replayRecords: Array(25001).fill({}) }), /大小限制/);
  const o = fixture(); o.replayRecords[0].extra = 'x'.repeat(8 * 1024 * 1024); assert.throws(() => convert(o), /大小限制/);
});
test('chi, pon and daiminkan encode called-tile direction and enforce physical consumption', () => {
  for (const meldType of [0, 1, 2]) {
    const o = fixture(), first = o.replayRecords[0], terminal = o.replayRecords[2];
    let stock = unused(o), called = meldType === 0 ? '4m' : '2m', consumed;
    if (meldType === 2) {
      // Free a fourth 2m while retaining the dealer's 345m winning sequence.
      first.hands[1][first.hands[1].indexOf('5m')] = stock.shift();
      first.hands[0][first.hands[0].indexOf('2m')] = '5m'; consumed = ['2m', '2m', '2m'];
    } else {
      first.hands[1][first.hands[1].indexOf(called)] = stock.shift();
      consumed = meldType === 0 ? ['2m', '3m'] : ['2m', '2m'];
    }
    stock = unused(o); stock.splice(stock.indexOf(called), 1);
    const discarded = first.hands[1].find(t => !consumed.includes(t));
    const events = [first, { kind: 'DealTile', seat: 0, tile: called, remaining: 69 },
      { kind: 'DiscardTile', seat: 0, tile: called, tsumogiri: true, riichi: false },
      { kind: 'ChiPengGang', seat: 1, meldType, tiles: [...consumed, called], froms: [...consumed.map(() => 1), 0] }];
    let remaining = 69;
    if (meldType === 2) { const extraDora = stock.shift(), t = stock.shift(); events.push({ kind: 'DealTile', seat: 1, tile: t, remaining: --remaining, doras: [first.doras[0], extraDora] }); }
    events.push({ kind: 'DiscardTile', seat: 1, tile: discarded, tsumogiri: false, riichi: false });
    for (const seat of [2, 3]) { const tile = stock.shift(); events.push({ kind: 'DealTile', seat, tile, remaining: --remaining }, { kind: 'DiscardTile', seat, tile, tsumogiri: true, riichi: false }); }
    events.push({ kind: 'DealTile', seat: 0, tile: '1z', remaining: --remaining }, terminal);
    const out = convert(observation(events)); assert.equal(out.rounds.length, 1, JSON.stringify(out.rejected));
    const log = out.rounds[0].json.log[0], code = log[8][0];
    assert.equal(code, meldType === 0 ? 'c141213' : meldType === 1 ? 'p121212' : 'm12121212');
    assert.equal(log[9][0], meldType === 2 ? 0 : N.tile(discarded));
  }
});
test('concealed kan and replacement draw preserve all four tile identities', () => {
  const o = fixture(), first = o.replayRecords[0], terminal = o.replayRecords[2];
  const at = first.hands[1].indexOf('1m'); first.hands[1][at] = unused(o)[0];
  const extraDora = unused(o).find(t => t !== '1m');
  const w = terminal.winners[0]; Object.assign(w, { han: 2, fu: 60, pointTsumoNonDealer: 2000, fans: [{ name: '门前清自摸和', value: 1 }, { name: '岭上开花', value: 1 }] });
  terminal.deltas = [6000, -2000, -2000, -2000]; terminal.scores = [31000, 23000, 23000, 23000];
  const out = convert(observation([first, { kind: 'DealTile', seat: 0, tile: '1m', remaining: 69 },
    { kind: 'AnGangAddGang', seat: 0, meldType: 3, tile: '1m', doras: [first.doras[0], extraDora] },
    { kind: 'DealTile', seat: 0, tile: '1z', remaining: 68 }, terminal]));
  assert.equal(out.rounds.length, 1, JSON.stringify(out.rejected)); const log = out.rounds[0].json.log[0];
  assert.deepEqual(log[5], [11, 41]); assert.deepEqual(log[6], ['111111a11']); assert.equal(log[2].length, 2);
});
test('riichi, its exact acceptance and explicit ura are retained', () => {
  const o = fixture(), first = o.replayRecords[0], terminal = o.replayRecords[2], stock = unused(o);
  const tile = stock.shift(), events = [first, { kind: 'DealTile', seat: 0, tile, remaining: 69 }, { kind: 'DiscardTile', seat: 0, tile, tsumogiri: true, riichi: true }];
  for (const seat of [1, 2, 3]) {
    const tile = stock.shift(); events.push({ kind: 'DealTile', seat, tile, remaining: 69 - seat, ...(seat === 1 ? { riichiSuccess: { seat: 0, failed: false, score: 24000, sticks: 1 } } : {}) }, { kind: 'DiscardTile', seat, tile, tsumogiri: true, riichi: false });
  }
  terminal.oldScores = [24000, 25000, 25000, 25000]; terminal.deltas = [4000, -1000, -1000, -1000]; terminal.scores = [28000, 24000, 24000, 24000];
  Object.assign(terminal.winners[0], { han: 2, pointTsumoNonDealer: 1000, uraDoras: [stock.shift()], fans: [{ name: '门前清自摸和', value: 1 }, { name: '立直', value: 1 }] });
  events.push({ kind: 'DealTile', seat: 0, tile: '1z', remaining: 65 }, terminal);
  const out = convert(observation(events)); assert.equal(out.rounds.length, 1, JSON.stringify(out.rejected));
  assert.deepEqual(out.rounds[0].json.log[0][6], ['r60']); assert.equal(out.rounds[0].json.log[0][3].length, 1);
  events[3].riichiSuccess.score = 23000; rejection(observation(events), /立直分数/);
});
test('artificial protobuf replay flows through protocol decoder, with honba and sticks cross-checked', () => {
  function decoded({ name = true, payment = 500, tsumo = true } = {}) {
    const first = fixture().replayRecords[0];
    const opening = F.cat(F.n(1, 0), F.n(2, 0), F.n(3, 2), F.t(4, '7z'), F.packed(5, first.scores), F.n(6, 1), ...first.hands.map((h, i) => F.strings(7 + i, h)), F.n(15, 70));
    const draw = F.cat(F.n(1, 0), F.t(2, '1z'), F.n(3, 69));
    const fan = F.cat(...(name ? [F.t(1, '门前清自摸和')] : []), F.n(2, 1), F.n(3, 1));
    const winner = F.cat(F.t(3, '1z'), F.n(4, 0), ...(tsumo ? [F.n(5, 1)] : []), F.n(6, 1), F.n(11, 1), F.b(12, fan), F.n(13, 30), F.n(17, payment));
    const ending = F.cat(F.b(1, winner), F.packed(2, first.scores), F.packed(3, [3100, -700, -700, -700]), F.packed(5, [28100, 24300, 24300, 24300]));
    const data = F.wrap('.lq.GameDetailRecords', F.cat(...[['RecordNewRound', opening], ['RecordDealTile', draw], ['RecordHule', ending]].map(([n, b]) => F.b(1, F.wrap('.lq.' + n, b)))));
    return { format: 'mj-observer-v1', mode: 'replay', replayRecords: P.replay(data) };
  }
  for (const payment of [500, 700]) {
    const o = decoded({ payment }), out = convert(o);
    assert.equal(out.rounds.length, 1, JSON.stringify(out.rejected));
    assert.equal(o.replayRecords[2].winners[0].yakuman, false); assert.equal(o.replayRecords[2].winners[0].pointRon, null);
    const log = out.rounds[0].json.log[0]; assert.deepEqual(log[0], [0, 2, 1]);
    assert.equal(log[16][2][3], '30符1飜500点∀'); assert.deepEqual(log[16][1], [3100, -700, -700, -700]);
  }
  rejection(decoded({ name: false }), /役种/);
  rejection(decoded({ payment: 600 }), /结算不一致/);
  rejection(decoded({ tsumo: false }), /最后动作/);
});
test('added kan retains original pon direction and inserts the actual added tile', () => {
  const south = ['2m', '2m', '3p', '4p', '5p', '6s', '7s', '8s', '6m', '7m', '8m', '1z', '1z'];
  const o = fixture(south), first = o.replayRecords[0], terminal = o.replayRecords[2];
  const free = unused(o);
  for (const h of first.hands.slice(2)) { const i = h.indexOf('5m'); if (i >= 0) { h[i] = free.shift(); break; } }
  for (const h of first.hands.slice(2)) { const i = h.indexOf('2m'); if (i >= 0) { h[i] = free.shift(); break; } }
  first.hands[0][first.hands[0].indexOf('2m')] = '5m';
  const stock = unused(o); stock.splice(stock.indexOf('2m'), 1); stock.splice(stock.indexOf('2m'), 1);
  const events = [first, { kind: 'DealTile', seat: 0, tile: '2m', remaining: 69 }, { kind: 'DiscardTile', seat: 0, tile: '2m', tsumogiri: true, riichi: false },
    { kind: 'ChiPengGang', seat: 1, meldType: 1, tiles: ['2m', '2m', '2m'], froms: [1, 1, 0] }, { kind: 'DiscardTile', seat: 1, tile: '1z', tsumogiri: false, riichi: false }];
  let remaining = 69;
  for (const seat of [2, 3, 0]) { const tile = stock.shift(); events.push({ kind: 'DealTile', seat, tile, remaining: --remaining }, { kind: 'DiscardTile', seat, tile, tsumogiri: true, riichi: false }); }
  const extraDora = stock.shift();
  events.push({ kind: 'DealTile', seat: 1, tile: '2m', remaining: --remaining }, { kind: 'AnGangAddGang', seat: 1, meldType: 2, tile: '2m', doras: [first.doras[0], extraDora] }, { kind: 'DealTile', seat: 1, tile: '1z', remaining: --remaining });
  Object.assign(terminal.winners[0], { seat: 1, han: 1, fu: 40, fans: [{ name: '岭上开花', value: 1 }], pointTsumoNonDealer: 400, pointTsumoDealer: 700 });
  terminal.deltas = [-700, 1500, -400, -400]; terminal.scores = [24300, 26500, 24600, 24600]; events.push(terminal);
  const out = convert(observation(events)); assert.equal(out.rounds.length, 1, JSON.stringify(out.rejected));
  const log = out.rounds[0].json.log[0]; assert.deepEqual(log[9], [41, 'k12121212']); assert.equal(log[8][0], 'p121212');
});
test('complete exhaustive draw exports only explicit tenpai settlements', () => {
  const o = fixture(), first = o.replayRecords[0], pool = unused(o), events = [first];
  for (let i = 0; i < 70; i++) { const seat = i % 4, tile = pool.shift(); events.push({ kind: 'DealTile', seat, tile, remaining: 69 - i }, { kind: 'DiscardTile', seat, tile, tsumogiri: true, riichi: false }); }
  events.push({ kind: 'NoTile', nagashi: false, tenpai: [true, false, false, false], oldScores: [25000, 25000, 25000, 25000], deltas: [3000, -1000, -1000, -1000], scores: [28000, 24000, 24000, 24000], settlementUnknown: false, hasHuleHistory: false });
  const out = convert(observation(events)); assert.equal(out.rounds.length, 1, JSON.stringify(out.rejected));
  assert.deepEqual(out.rounds[0].json.log[0][16], ['流局', [3000, -1000, -1000, -1000]]);
  events.at(-1).settlementUnknown = true; rejection(observation(events), /资料不足/);
});
