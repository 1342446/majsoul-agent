const { test } = require('node:test');
const assert = require('node:assert/strict');
const H = require('../extension/harness.js');
const Agent = require('../extension/agent.js');
const { fixture, evaluate } = require('../agent/eval.cjs');
const { review } = require('../agent/review.cjs');
const P = require('../extension/protocol.js'), F = require('./fixtures.js');

test('harness checks the complete tool plan before executing anything', async () => {
  let calls = 0;
  await assert.rejects(H.run({ steps: ['valid.tool', 'unknown.tool'], tools: { 'valid.tool': () => calls++ } }), /registered/);
  await assert.rejects(H.run({ steps: ['valid.tool'], tools: {}, maxSteps: 0 }), /budget/);
  assert.equal(calls, 0);
});

test('agent runs authorized tools once, validates model content and emits payload-free traces', async () => {
  const snapshot = fixture('123m123p123s111z2z');
  snapshot.apiKey = 'PRIVATE'; snapshot.game.players[1].hand = ['9m'];
  let calls = 0;
  const result = await Agent.run({ snapshot, task: 'combined', explain: async prepared => {
    calls++;
    assert.equal(JSON.stringify(prepared).includes('PRIVATE'), false);
    assert.equal('hand' in prepared.data.danger.game.players[1], false);
    return JSON.stringify({ task: 'combined', danger: [], efficiency: [],
      decision: { action: 'unknown', tile: null, reasons: ['等待摸牌'] }, limitations: [] });
  } });
  assert.equal(calls, 1); assert.equal(result.localAnalysis.efficiency.shanten, 0);
  assert.deepEqual(result.trace.events.filter(e => e.status === 'completed').map(e => e.tool),
    ['snapshot.validate', 'analysis.prepare', 'model.explain', 'result.validate']);
  assert.equal(JSON.stringify(result.trace).includes('PRIVATE'), false);
  assert.equal(JSON.stringify(result.trace).includes('等待摸牌'), false);
  await assert.rejects(Agent.run({ snapshot, explain: async () => '{"arbitrary":"output"}' }), /结构化要求：结果缺少必需字段/);
});

test('abort and timeout settle even if a tool ignores cancellation, and prevent later tools', async () => {
  let late = false;
  const execute = signal => H.run({ steps: ['slow.tool', 'later.tool'], signal, timeoutMs: 20,
    tools: { 'slow.tool': () => new Promise(() => {}), 'later.tool': () => { late = true; } } });
  await assert.rejects(execute(), error => error.name === 'AbortError' && error.runTrace.status === 'cancelled');
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(execute(controller.signal), { name: 'AbortError' });
  assert.equal(late, false);
});

test('tool failures stop the run and trace does not expose arbitrary error text', async () => {
  await assert.rejects(H.run({ steps: ['test.fail'], tools: { 'test.fail': () => { throw new Error('PRIVATE'); } } }), error => {
    assert.equal(error.runTrace.status, 'failed');
    assert.equal(JSON.stringify(error.runTrace).includes('PRIVATE'), false);
    return true;
  });
});

test('replay review honors the cursor, strips opponents hands and excludes future events', async () => {
  const opening = P.decodeEvent('RecordNewRound', F.replayRound(), 'replay');
  const observation = { format: 'mj-observer-v1', mode: 'replay', replayCursor: 1,
    state: { selfSeat: 0, source: 'replay', selfHand: ['9m'] },
    replayRecords: [opening, { source: 'replay', kind: 'DiscardTile', seat: 1, tile: '9m', step: 1 }] };
  const before = JSON.stringify(observation);
  const result = await review(observation, { seat: 0, hand: true });
  assert.equal(result.provenance.appliedEvents, 1);
  assert.equal(result.trace.events.some(e => e.tool === 'model.explain'), false);
  assert.equal(result.result, null);
  const prefix = await review({ ...observation, replayRecords: [opening] }, { seat: 0, hand: true });
  assert.deepEqual(result.localAnalysis, prefix.localAnalysis);
  const noHand = await review(observation);
  assert.notEqual(noHand.localAnalysis.efficiency.status, 'available');
  assert.equal(JSON.stringify(observation), before);
  await assert.rejects(review(observation, { cursor: 3 }), /cursor/);
  await assert.rejects(review(observation, { cursor: 0, hand: true }), /开局/);
});

test('selected historical snapshots are reviewed directly rather than replaced by current replay data', async () => {
  const S = require('../extension/state.js');
  const opening = P.decodeEvent('RecordNewRound', F.replayRound(), 'replay');
  const state = S.apply(S.initial('replay', 0), opening); state.phase = 'ended';
  const result = await review({ format: 'mj-observer-v1', mode: 'replay', historyView: { match: 'test', round: '0' }, state,
    replayRecords: [{ invalid: true }], replayCursor: 1 }, { hand: true });
  assert.equal(result.provenance.mode, 'history');
  assert.equal(result.result, null);
  await assert.rejects(review({ format: 'mj-observer-v1', historyView: {}, state }, { cursor: 0 }), /cursor/);
});

test('evaluation reports measured synthetic regressions, including failures', async () => {
  const good = await evaluate(); assert.equal(good.total, 3); assert.equal(good.passed, 3);
  const bad = await evaluate([{ name: 'deliberate-mismatch', snapshot: fixture('19m19p19s1234567z'), expected: 2 }]);
  assert.equal(bad.passed, 0); assert.equal(bad.results[0].actualShanten, 0);
});
