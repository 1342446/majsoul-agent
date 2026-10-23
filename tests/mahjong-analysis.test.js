const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../extension/mahjong-analysis');
const tiles = text => text.match(/\d+[mpsz]/g).flatMap(g => [...g.slice(0, -1)].map(n => n + g.at(-1)));
function snapshot(text) {
  return { playerCount: 4, selfSeat: 0, complete: true, selfHand: tiles(text),
    game: { doras: [], players: Array.from({ length: 4 }, (_, seat) => ({ seat, melds: [], norths: 0 })) },
    rivers: Array.from({ length: 4 }, (_, seat) => ({ seat, discards: [] })) };
}
test('ordinary winning hand and single east wait are exact', () => {
  assert.equal(M.shanten(tiles('123m123p123s111z22z')), -1);
  const s = snapshot('123m123p123s111z2z');
  const e = M.analyze(s).efficiency;
  assert.equal(e.shanten, 0); assert.equal(e.canDiscard, false); assert.deepEqual(e.candidates, []);
  assert.deepEqual(e.current.effectiveTiles, [{ tile: '2z', unseenUpperBound: 3 }]);
});
test('seven pairs and thirteen orphans include unique-kind correction', () => {
  assert.equal(M.shanten(tiles('1122m3344p5566s7z')), 0);
  assert.equal(M.shanten(tiles('1122m3344p5566s77z')), -1);
  // Three triples are a better ordinary shape than seven pairs here.
  assert.equal(M.shanten(tiles('1111m2222p3333s4z')), 2);
  assert.equal(M.shanten(tiles('19m19p19s1234567z')), 0);
  assert.equal(M.shanten(tiles('119m19p19s1234567z')), -1);
});
test('open meld and kan reduce concealed structural count by three, special hands disabled', () => {
  const s = snapshot('123p123s111z2z');
  s.game.players[0].melds = [{ tiles: tiles('1111m') }];
  assert.equal(M.analyze(s).efficiency.shanten, 0);
  s.selfHand.push('2z'); assert.equal(M.analyze(s).efficiency.shanten, -1);
  s.selfHand.push('3z'); assert.equal(M.analyze(s).efficiency.status, 'unavailable');
  assert.equal(M.shanten(tiles('1122p3344s55z'), 1), 2);
});
test('four open groups support one or two concealed tiles', () => {
  const s = snapshot('2z'); s.game.players[0].melds = ['123m', '123p', '123s', '111z'].map(x => ({ tiles: tiles(x) }));
  assert.equal(M.analyze(s).efficiency.shanten, 0);
  s.selfHand.push('2z'); assert.equal(M.analyze(s).efficiency.shanten, -1);
});
test('14 tile candidates retain discarded tile in visible count and preserve input', () => {
  const s = snapshot('123m123p123s111z23z'), before = JSON.stringify(s);
  const e = M.analyze(s).efficiency;
  const discard = e.candidates.find(c => c.tile === '3z');
  assert.equal(discard.shanten, 0);
  assert.deepEqual(discard.effectiveTiles, [{ tile: '2z', unseenUpperBound: 3 }]);
  assert.equal(e.visibleTiles.counts['3z'], 1); assert.equal(JSON.stringify(s), before);
});
test('red five and normal five are distinct legal discard choices with canonical counts', () => {
  const s = snapshot('123m123p123s055s22z');
  const e = M.analyze(s).efficiency;
  assert.equal(e.status, 'available'); assert.equal(e.visibleTiles.counts['5s'], 3);
  assert.ok(e.candidates.some(c => c.tile === '0s')); assert.ok(e.candidates.some(c => c.tile === '5s'));
  assert.equal(e.candidates.find(c => c.tile === '0s').shanten, e.candidates.find(c => c.tile === '5s').shanten);
});
test('called river tile and visible meld are counted exactly once', () => {
  const s = snapshot('123m123p123s111z2z');
  s.game.players[1].melds = [{ tiles: tiles('555s'), froms: [1, 1, 2] }];
  s.rivers[2].discards = [{ tile: '0s', called: true }];
  assert.equal(M.visibleCounts(s).counts['5s'], 3); assert.equal(M.visibleCounts(s).partial, false);
  delete s.game; assert.equal(M.visibleCounts(s).counts['5s'], 1); assert.equal(M.visibleCounts(s).partial, true);
});
test('north extraction, dora indicators, and partial authorization are included', () => {
  const s = snapshot('123m123p123s111z2z');
  s.game.players[1].norths = 2; s.game.doras = ['4z'];
  assert.equal(M.visibleCounts(s).counts['4z'], 3);
  s.rivers.pop(); assert.equal(M.visibleCounts(s).partial, true);
});
test('unknown public tiles and incomplete collection retain exact hand math with partial upper bounds', () => {
  const s = snapshot('123m123p123s111z2z');
  s.complete = false; s.game.doras = ['?']; s.game.players[1].norths = null;
  s.game.players[2].melds = [{ tiles: ['?', '?', '?'] }];
  const e = M.analyze(s).efficiency;
  assert.equal(e.status, 'available'); assert.equal(e.shanten, 0);
  assert.equal(e.visibleTiles.partial, true); assert.equal(e.visibleTiles.invalid, false);
});
test('unknown, impossible multiplicity, malformed meld and missing authorization cannot be guessed', () => {
  for (const change of [s => s.selfHand[0] = '?', s => s.selfHand = tiles('11111m123p123s22z'),
    s => s.game.players[0].melds.push({ tiles: tiles('124m') }), s => delete s.game,
    s => delete s.selfHand, s => s.selfHand.pop(), s => s.game.doras = ['1z', '1z']]) {
    const s = snapshot('123m123p123s111z2z'); change(s);
    assert.equal(M.analyze(s).efficiency.status, 'unavailable');
  }
  assert.equal(M.shanten(tiles('123m123p123s111z2z'), 0, 2), null);
});
test('sanma rejects 2-8 man and excludes them from effective draws', () => {
  const s = snapshot('19m123p123s111z22z'); s.playerCount = 3; s.game.players.pop(); s.rivers.pop();
  const e = M.analyze(s).efficiency;
  assert.equal(e.status, 'available'); assert.equal(e.shanten, 1);
  assert.ok(e.current.effectiveTiles.every(t => !/^[2-8]m$/.test(t.tile)));
  s.selfHand[0] = '2m'; assert.equal(M.analyze(s).efficiency.status, 'unavailable');
});
test('defense reports evidence independently by opponent without probabilities', () => {
  const s = snapshot('123m123p123s111z2z'); s.rivers[1].discards = [{ tile: '1m', called: false }];
  s.rivers[2].discards = [{ tile: '4m', called: false }]; s.game.players[3].melds = [{ tiles: tiles('2222m') }];
  // Four visible 2m plus own 2m would be impossible, so use 5m as the wall instead.
  s.game.players[3].melds = [{ tiles: tiles('5555m') }];
  const d = M.analyze(s).danger.candidates.find(c => c.tile === '1m').opponents;
  assert.equal(d[0].genbutsu, true); assert.equal(d[1].genbutsu, false); assert.deepEqual(d[1].sujiReferences, ['4m']);
  assert.match(M.analyze(s).danger.limitations.join(''), /该对手/); assert.equal(JSON.stringify(d).includes('probability'), false);
  assert.deepEqual(M.analyze(s).danger.candidates.find(c => c.tile === '3m').opponents[0].kabeReferences, ['5m']);
});
test('engine remains bounded for dense overlapping suited shapes', () => {
  const start = Date.now();
  for (const text of ['11223344556677m', '11122233344455p', '12334556778999s']) {
    assert.equal(M.analyze(snapshot(text)).efficiency.status, 'available');
  }
  assert.ok(Date.now() - start < 5000);
});
test('called matching consumes one source tile per open meld and never a concealed kan', () => {
  const s = snapshot('123m123p123s111z2z');
  s.game.players[1].melds = [{ type: 3, tiles: tiles('5555s'), froms: [] }];
  s.rivers[2].discards = [{ tile: '5s', called: true }];
  assert.equal(M.visibleCounts(s).counts['5s'], 5); assert.equal(M.visibleCounts(s).invalid, true);
  s.game.players[1].melds = [{ type: 2, tiles: tiles('5555s'), froms: [1, 2, 1] }];
  assert.equal(M.visibleCounts(s).counts['5s'], 4);
  s.rivers[2].discards.push({ tile: '5s', called: true });
  assert.equal(M.visibleCounts(s).counts['5s'], 5);
  s.game.players[1].melds = [{ tiles: tiles('555s'), froms: [] }];
  assert.equal(M.visibleCounts(s).counts['5s'], 4); assert.equal(M.visibleCounts(s).partial, true);
});
test('middle suji marks a single side as partial and both sides explicitly', () => {
  const s = snapshot('123m123p123s055s22z');
  s.rivers[1].discards = [{ tile: '2s', called: false }];
  let d = M.analyze(s).danger.candidates.find(c => c.tile === '5s').opponents[0];
  assert.equal(d.sujiCoverage, 'oneSideOnly');
  s.rivers[1].discards.push({ tile: '8s', called: false });
  d = M.analyze(s).danger.candidates.find(c => c.tile === '5s').opponents[0];
  assert.equal(d.sujiCoverage, 'bothSidedOrEdge'); assert.deepEqual(d.sujiReferences, ['2s', '8s']);
});
test('riichi permits only confirmed drawn tile including exact red identity', () => {
  const s = snapshot('123m123p123s055s22z'); s.game.players[0].riichi = true;
  let a = M.analyze(s); assert.equal(a.efficiency.canDiscard, false); assert.deepEqual(a.efficiency.candidates, []); assert.deepEqual(a.danger.candidates, []);
  s.selfDrawnTile = '0s'; a = M.analyze(s);
  assert.equal(a.efficiency.canDiscard, true); assert.deepEqual(a.efficiency.candidates.map(c => c.tile), ['0s']); assert.deepEqual(a.danger.candidates.map(c => c.tile), ['0s']);
});
test('bounded repeat cache does not expose mutable cached results', () => {
  const s = snapshot('11223344556677m');
  const first = M.analyze(s); first.efficiency.candidates.length = 0;
  const second = M.analyze(s); assert.ok(second.efficiency.candidates.length);
  const start = Date.now(); for (let i = 0; i < 20; i++) M.analyze(s);
  assert.ok(Date.now() - start < 1000);
});
test('red aliases cannot exceed four and opponent hidden hand is never inspected', () => {
  const s = snapshot('123m123p123s055s22z');
  s.game.players[1].hand = ['7z', '7z', '7z', '7z'];
  assert.equal(M.visibleCounts(s).counts['7z'], undefined);
  s.rivers[1].discards = [{ tile: '0s', called: false }, { tile: '5s', called: false }];
  assert.equal(M.analyze(s).efficiency.status, 'unavailable');
  assert.equal(M.visibleCounts(s).counts['5s'], 5);
});
test('sanma cannot accept an exposed sequence even in otherwise legal suits', () => {
  const s = snapshot('19m123p123s111z22z'); s.playerCount = 3; s.game.players.pop(); s.rivers.pop();
  s.game.players[1].melds = [{ tiles: tiles('456p'), froms: [1, 1, 2] }];
  assert.equal(M.visibleCounts(s).invalid, true); assert.equal(M.analyze(s).efficiency.status, 'unavailable');
});
test('four self-held copies cannot form a fifth-copy dead tenpai', () => {
  const dead = tiles('1111m222p333s444z');
  assert.equal(M.shanten(dead), 1);
  for (const suit of 'mps') for (let rank = 1; rank <= 9; rank++) {
    const t = rank + suit; if (dead.filter(x => x === t).length < 4) assert.notEqual(M.shanten([...dead, t]), -1);
  }
  for (let rank = 1; rank <= 7; rank++) assert.notEqual(M.shanten([...dead, rank + 'z']), -1);
  const externallyExhausted = snapshot('123m123p123s111z2z');
  externallyExhausted.rivers[1].discards = Array.from({ length: 3 }, () => ({ tile: '2z', called: false }));
  const e = M.analyze(externallyExhausted).efficiency;
  assert.equal(e.shanten, 0); assert.deepEqual(e.current.effectiveTiles, [{ tile: '2z', unseenUpperBound: 0 }]);
  const openDead = snapshot('1m222p333s444z');
  openDead.game.players[0].melds = [{ tiles: tiles('111m'), froms: [0, 0, 1] }];
  assert.equal(M.analyze(openDead).efficiency.shanten, 1);
  assert.equal(M.shanten(openDead.selfHand, 1, 4, tiles('111m')), 1);
});
test('no hand authorization still gives general danger evidence for legal tile types', () => {
  const s = snapshot('123m123p123s111z2z'); delete s.selfHand;
  s.rivers[1].discards = [{ tile: '1m', called: false }];
  let a = M.analyze(s); assert.equal(a.danger.candidates.length, 34); assert.equal(a.danger.candidates.find(c => c.tile === '1m').opponents[0].genbutsu, true);
  assert.equal(a.efficiency.status, 'unavailable');
  s.playerCount = 3; s.game.players.pop(); s.rivers.pop(); a = M.analyze(s);
  assert.equal(a.danger.candidates.length, 27);
});
