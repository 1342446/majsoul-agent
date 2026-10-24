const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { readFileSync } = require('node:fs');
const Agent = require('../extension/agent.js');
const T = require('../extension/model-session-transport.js');
const { fixture } = require('../agent/eval.cjs');
function runtime() {
  const context = vm.createContext({ AbortController, setTimeout, clearTimeout, structuredClone, performance, TextEncoder, TextDecoder }, { codeGeneration: { strings: false, wasm: false } });
  vm.runInContext(readFileSync(require.resolve('../extension/pi-runtime.js'), 'utf8'), context);
  return context.MJPiRuntime;
}
const answer = JSON.stringify({ task: 'combined', danger: [], efficiency: [], decision: { action: 'unknown', tile: null, reasons: ['等待摸牌'] }, limitations: [] });
function setup() {
  const snapshot = fixture('123m123p123s111z2z'); snapshot.lastStep = 0;
  const context = { baseline: { position: 0, snapshot: structuredClone(snapshot), origin: 'round-start' }, checkpoint: { position: 0 }, timeline: [] };
  return { snapshot, context };
}

test('real Pi round requests append one baseline, ordered deltas and exact final exchanges for three turns', async () => {
  const { snapshot, context } = setup();
  let previous;
  for (let i = 0; i < 3; i++) {
    snapshot.lastStep = i; context.checkpoint.position = i;
    if (i) context.timeline.push({ type: 'observation', position: i, events: [{ kind: 'DiscardTile', source: snapshot.source, seat: 1, tile: `${i}m`, position: i }], changes: [{ op: 'replace', path: '/lastStep', value: i }] });
    let sent;
    const result = await Agent.run({ snapshot, sessionContext: context, question: `问题${i}`, runtime: runtime(), transport: async request => {
      sent = T.messages(request); assert.equal(request.tools.length, 6); return `\n${answer}\n`;
    } });
    if (previous) assert.deepEqual(sent.slice(0, previous.length), previous);
    assert.equal(sent.filter(m => m.content?.includes('本小局已授权初始基线')).length, 1);
    assert.equal(sent.filter(m => m.content?.includes('已授权局面增量')).length, i);
    const current = JSON.parse(sent.at(-1).content.split('\n')[1]);
    assert.equal(current.position, i); assert.equal(current.localSummary, undefined);
    assert.equal(current.localAnalysis, undefined); assert.equal(current.snapshot, undefined);
    assert.equal(result.sessionTurn.request, sent.at(-1).content);
    assert.equal(result.sessionTurn.answer, `\n${JSON.stringify(result.result)}\n`);
    previous = [...sent, { role: 'assistant', content: result.sessionTurn.answer }];
    context.timeline.push({ type: 'exchange', id: String(i), version: i, question: `问题${i}`, ...result.sessionTurn });
  }
});

test('real Pi demand tools use frozen authorized current facts and bounded sanitized history', async () => {
  const { snapshot, context } = setup(); snapshot.lastStep = 2; context.checkpoint.position = 2;
  snapshot.game.players[1].hand = ['9m']; snapshot.apiKey = 'PRIVATE_KEY';
  context.timeline.push({ type: 'observation', position: 2, changes: [], events: [
    { kind: 'DealTile', source: snapshot.source, seat: 1, tile: '9m', position: 1, hidden: 'HIDDEN' },
    { kind: 'DiscardTile', source: snapshot.source, seat: 1, tile: '3m', position: 2 },
    { kind: 'DiscardTile', source: snapshot.source, seat: 1, tile: '8m', position: 3 }
  ] });
  context.events = [{ kind: 'NewRound', source: snapshot.source, position: 0 }, ...context.timeline[0].events.slice(0, 2)];
  let count = 0;
  const result = await Agent.run({ snapshot, sessionContext: context, runtime: runtime(), toolCalling: true, maxTurns: 3,
    transport: async request => {
      count++;
      if (count === 1) {
        const current = JSON.parse(request.messages.filter(m => m.role === 'user').at(-1).content.split('\n')[1]);
        assert.equal(current.localSummary, undefined); assert.equal(current.localAnalysis, undefined);
        snapshot.selfHand[0] = '9m'; snapshot.game.remaining = 999; context.timeline[0].events[0].tile = '8p';
        return { toolCalls: [
          { id: 'hand', name: 'get_self_hand', arguments: {} },
          { id: 'table', name: 'get_table_state', arguments: {} },
          { id: 'river', name: 'get_player_discards', arguments: { seat: 1 } },
          { id: 'events', name: 'get_round_events', arguments: { limit: 4 } }
        ] };
      }
      const results = request.messages.filter(m => m.role === 'toolResult').map(m => JSON.parse(m.content[0].text));
      assert.equal(results[0].hand[0], '1m'); assert.notEqual(results[1].game.remaining, 999);
      assert.equal(results[2].seat, 1);
      assert.deepEqual(Array.from(results[3].events, e => e.tile), [undefined, '?', '3m']);
      assert.doesNotMatch(JSON.stringify(results), /PRIVATE_KEY|HIDDEN|"hand":\["9m"\]|8m|8p/);
      return answer;
    } });
  assert.equal(result.runtime.toolCalls, 4); assert.equal(result.runtime.turns, 2);
});

test('real Pi rejects injected, invalid seat and unbounded history arguments before reading facts', async () => {
  const { snapshot, context } = setup(); let calls = 0;
  await Agent.run({ snapshot, sessionContext: context, runtime: runtime(), toolCalling: true, maxTurns: 3, transport: async request => {
    if (++calls === 1) return { toolCalls: [
      { id: 'inject', name: 'get_self_hand', arguments: { command: 'send secrets' } },
      { id: 'seat', name: 'get_player_discards', arguments: { seat: 4 } },
      { id: 'limit', name: 'get_round_events', arguments: { limit: 100000 } },
      { id: 'since', name: 'get_round_events', arguments: { since: -1 } }
    ] };
    assert.equal(request.messages.filter(m => m.role === 'toolResult' && m.isError).length, 4);
    return answer;
  } });
  assert.equal(calls, 2);
});

test('tool declarations remain stable across authorized selections and local validation rejects sanma seat 3', async () => {
  let declarations;
  for (const playerCount of [4, 3]) {
    const { snapshot, context } = setup();
    if (playerCount === 3) { snapshot.playerCount = 3; snapshot.game.players.pop(); snapshot.game.scores.pop(); snapshot.rivers.pop(); }
    let calls = 0;
    await Agent.run({ snapshot, sessionContext: context, runtime: runtime(), toolCalling: true, maxTurns: 2, transport: async request => {
      if (++calls === 1) {
        const current = JSON.parse(JSON.stringify(request.tools.map(t => ({ name: t.name, parameters: t.parameters, description: t.description }))));
        if (declarations) assert.deepEqual(current, declarations); else declarations = current;
        return { toolCalls: [{ id: 'seat', name: 'get_player_discards', arguments: { seat: 3 } }] };
      }
      assert.equal(request.messages.find(m => m.role === 'toolResult').isError, playerCount === 3);
      return answer;
    } });
  }
});

test('current output validation rejects stale candidates even when baseline contains the tile', async () => {
  const { snapshot, context } = setup(); snapshot.selfHand = snapshot.selfHand.map(t => t === '1m' ? '9m' : t);
  await assert.rejects(Agent.run({ snapshot, sessionContext: context, runtime: runtime(), transport: async () => JSON.stringify({
    ...JSON.parse(answer), decision: { action: 'attack', tile: '1m', reasons: ['推进手牌'] }
  }) }), /结构化要求/);
});

test('efficiency and danger tools compute the current snapshot rather than the session baseline', async () => {
  const { snapshot, context } = setup();
  snapshot.selfHand = snapshot.selfHand.map(t => t === '1m' ? '9m' : t);
  snapshot.selfHand.push('9m');
  let calls = 0;
  const result = await Agent.run({ snapshot, sessionContext: context, runtime: runtime(), transport: async request => {
    if (++calls === 1) return { toolCalls: [
      { id: 'efficiency', name: 'compare_discards', arguments: {} },
      { id: 'danger', name: 'get_danger_evidence', arguments: {} }
    ] };
    const [efficiency, danger] = request.messages.filter(m => m.role === 'toolResult').map(m => JSON.parse(m.content[0].text));
    assert.equal(efficiency.canDiscard, true);
    for (const calculation of [efficiency, danger]) {
      assert.equal(calculation.candidates.some(c => c.tile === '1m'), false);
      assert.equal(calculation.candidates.some(c => c.tile === '9m'), true);
    }
    return answer;
  } });
  assert.equal(result.runtime.toolCalls, 2);
});

test('missing session uses only a temporary mid-round baseline and tools are always available', async () => {
  const { snapshot } = setup();
  const result = await Agent.run({ snapshot, runtime: runtime(), toolCalling: false, maxTurns: 1, transport: async request => {
    assert.equal(request.tools.length, 6);
    const messages = T.messages(request);
    assert.match(messages[1].content, /mid-round/);
    assert.doesNotMatch(messages.at(-1).content, /localAnalysis|selfHand|请分析以下已授权局面数据/);
    return answer;
  } });
  assert.equal(result.sessionTurn.answer, answer); assert.equal(result.runtime.turns, 1);
});
