const { test } = require('node:test');
const assert = require('node:assert/strict');
const Agent = require('../extension/engine-agent.js');
const { fixture } = require('../agent/eval.cjs');
const M = require('../extension/adapters/mjai.js');

function context() {
  const snapshot = fixture('123m123p123s111z2z9m');
  snapshot.selfDrawnTile = '9m';
  snapshot.game.doras = ['4p'];
  const request = { format: 'majsoul-mjai-v1', seat: 0, events: [
    { type: 'start_game', id: 0, names: [0, 1, 2, 3].map(i => 'Player ' + i) },
    { type: 'start_kyoku', bakaze: 'E', dora_marker: '4p', kyoku: 1, honba: 0, kyotaku: 0, oya: 0,
      scores: [25000, 25000, 25000, 25000], tehais: [snapshot.selfHand.slice(0, -1).map(M.tile), ...Array.from({ length: 3 }, () => Array(13).fill('?'))] },
    { type: 'tsumo', actor: 0, pai: '9m' }
  ] };
  return { snapshot, request };
}
const discard = (extra = {}) => ({ action: { type: 'dahai', actor: 0, pai: '9m', tsumogiri: true, ...extra } });

test('bounded engine validates a discard and emits only whitelisted results and metadata traces', async () => {
  const c = context(); c.snapshot.apiKey = 'SECRET';
  const result = await Agent.run({ ...c, infer: async request => { assert.equal(JSON.stringify(request).includes('SECRET'), false); return discard({ meta: { q_values: [1, 9, -2], mask: [true, true, false], secret: 'SECRET' } }); } });
  assert.equal(result.result.decision.tile, '9m');
  assert.equal(result.engine.format, 'majsoul-engine-result-v1');
  assert.deepEqual(result.engine.candidates, []);
  assert.deepEqual(result.result.danger, []);
  assert.match(result.result.limitations.join(' '), /不是放铳概率/);
  assert.deepEqual(result.trace.events.filter(e => e.status === 'completed').map(e => e.tool), ['request.validate', 'engine.infer', 'engine.validate']);
  assert.equal(JSON.stringify(result).includes('SECRET'), false);
});

test('engine rejects illegal, unsupported, overlarge, and nonfinite responses', async () => {
  for (const response of [discard({ pai: '8m' }), discard({ actor: 1 }), discard({ pai: '<img>' }),
    { action: { type: 'hora', actor: 0 } }, discard({ meta: { q_values: [NaN] } }), discard({ meta: { q_values: [Infinity] } }),
    discard({ meta: { q_values: ['0.8'] } }), discard({ meta: { text: 'x'.repeat(65537) } })]) {
    await assert.rejects(Agent.run({ ...context(), infer: async () => response }), /结果无效/);
  }
});

test('engine never infers for incomplete, mismatched, or out-of-order contexts', async () => {
  let calls = 0;
  for (const edit of [c => { c.snapshot.complete = false; }, c => { c.request.seat = 1; c.request.events[0].id = 1; },
    c => { c.snapshot.selfHand[0] = '8m'; }, c => { c.snapshot.selfDrawnTile = '1m'; },
    c => { c.request.events.push({ type: 'tsumo', actor: 0, pai: '1m' }); }]) {
    const c = context(); edit(c);
    await assert.rejects(Agent.run({ ...c, infer: async () => { calls++; return discard(); } }));
  }
  assert.equal(calls, 0);
});

test('same hand cannot authorize a different public situation or ambiguous handcut', async () => {
  let calls = 0;
  for (const edit of [s => s.game.round.wind++, s => s.game.round.index++, s => s.game.honba++,
    s => s.game.sticks++, s => s.game.scores[1]--, s => s.game.doras.push('9s'),
    s => s.rivers[1].discards.push({ tile: '8p', tsumogiri: true, riichi: false, called: false })]) {
    const c = context(); edit(c.snapshot);
    await assert.rejects(Agent.run({ ...c, infer: async () => { calls++; return discard(); } }));
  }
  assert.equal(calls, 0);
  await assert.rejects(Agent.run({ ...context(), infer: async () => discard({ tsumogiri: false }) }));
});

test('trailing dora metadata preserves the current draw trigger', async () => {
  const c = context();
  c.request.events.push({ type: 'dora', dora_marker: '7p' }); c.snapshot.game.doras.push('7p');
  const output = await Agent.run({ ...c, infer: async () => discard() });
  assert.equal(output.result.decision.tile, '9m');
});

test('trailing reach acceptance preserves opponent discard trigger and requires score and stick updates', async () => {
  const c = context();
  c.request.events.push({ type: 'dahai', actor: 0, pai: '9m', tsumogiri: true }, { type: 'tsumo', actor: 1, pai: '?' },
    { type: 'reach', actor: 1 }, { type: 'dahai', actor: 1, pai: '8p', tsumogiri: true }, { type: 'reach_accepted', actor: 1 });
  c.snapshot.selfHand.pop(); c.snapshot.selfDrawnTile = null;
  c.snapshot.rivers[0].discards.push({ tile: '9m', tsumogiri: true, riichi: false, called: false });
  c.snapshot.rivers[1].discards.push({ tile: '8p', tsumogiri: true, riichi: true, called: false });
  c.snapshot.game.players[1].riichi = true;
  await assert.rejects(Agent.run({ ...c, infer: async () => ({ action: { type: 'none' } }) }));
  c.snapshot.game.scores[1] -= 1000; c.snapshot.game.sticks++;
  const output = await Agent.run({ ...c, infer: async () => ({ action: { type: 'none' } }) });
  assert.equal(output.engine.action.type, 'none');
});

test('reach leaves the not-yet-selected declaration discard empty', async () => {
  const output = await Agent.run({ ...context(), infer: async () => ({ action: { type: 'reach', actor: 0 } }) });
  assert.equal(output.engine.action.type, 'reach');
  assert.equal(output.result.decision.tile, null);
  assert.match(output.result.decision.reasons.join(''), /尚未返回/);
});

test('riichi only allows the verified drawn tile as a tsumogiri discard', async () => {
  const c = context();
  c.request.events.push({ type: 'reach', actor: 0 }, { type: 'dahai', actor: 0, pai: '9m', tsumogiri: true }, { type: 'reach_accepted', actor: 0 });
  for (const actor of [1, 2, 3]) c.request.events.push({ type: 'tsumo', actor, pai: '?' }, { type: 'dahai', actor, pai: '8p', tsumogiri: true });
  c.request.events.push({ type: 'tsumo', actor: 0, pai: '9p' });
  c.snapshot.selfHand[c.snapshot.selfHand.length - 1] = '9p'; c.snapshot.selfDrawnTile = '9p';
  c.snapshot.game.players[0].riichi = true;
  c.snapshot.game.scores[0] -= 1000; c.snapshot.game.sticks = 1;
  c.snapshot.rivers[0].discards.push({ tile: '9m', tsumogiri: true, riichi: true, called: false });
  for (const actor of [1, 2, 3]) c.snapshot.rivers[actor].discards.push({ tile: '8p', tsumogiri: true, riichi: false, called: false });
  await assert.rejects(Agent.run({ ...c, infer: async () => discard({ pai: '1m', tsumogiri: false }) }));
  await assert.rejects(Agent.run({ ...c, infer: async () => discard({ pai: '9p', tsumogiri: false }) }));
  const output = await Agent.run({ ...c, infer: async () => discard({ pai: '9p' }) });
  assert.equal(output.result.decision.tile, '9p');
});

test('timeout cancels inference without leaking payloads into the failure trace', async () => {
  await assert.rejects(Agent.run({ ...context(), timeoutMs: 15, infer: async () => new Promise(() => {}) }), error => {
    assert.equal(error.name, 'AbortError');
    assert.equal(error.runTrace.status, 'cancelled');
    assert.equal(error.runTrace.events.some(e => e.tool === 'engine.validate'), false);
    return true;
  });
});

test('none only passes an opponent discard response opportunity', async () => {
  await assert.rejects(Agent.run({ ...context(), infer: async () => ({ action: { type: 'none' } }) }));
  const c = context();
  c.request.events.push({ type: 'dahai', actor: 0, pai: '9m', tsumogiri: true }, { type: 'tsumo', actor: 1, pai: '?' }, { type: 'dahai', actor: 1, pai: '8p', tsumogiri: true });
  c.snapshot.selfHand.pop(); c.snapshot.selfDrawnTile = null;
  c.snapshot.rivers[0].discards.push({ tile: '9m', tsumogiri: true, riichi: false, called: false });
  c.snapshot.rivers[1].discards.push({ tile: '8p', tsumogiri: true, riichi: false, called: false });
  const output = await Agent.run({ ...c, infer: async () => ({ action: { type: 'none' } }) });
  assert.equal(output.engine.action.type, 'none');
  assert.equal(output.result.decision.tile, null);
});
