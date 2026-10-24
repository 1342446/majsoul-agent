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
    { kind: 'DealTile', source: 'live', seat: 0, tile: '9p', position: 1, hidden: 'WRONG_SOURCE' },
    { kind: 'ChiPengGang', source: snapshot.source, seat: 4, tiles: ['9s'], position: 1 },
    { kind: 'DiscardTile', source: snapshot.source, seat: 1, tile: '3m', position: 2 },
    { kind: 'DiscardTile', source: snapshot.source, seat: 1, tile: '8m', position: 3 }
  ] });
  context.events = [{ kind: 'NewRound', source: snapshot.source, position: 0 }, ...context.timeline[0].events.slice(0, -1)];
  let count = 0;
  const result = await Agent.run({ snapshot, sessionContext: context, runtime: runtime(), toolCalling: true, maxTurns: 3,
    transport: async request => {
      count++;
      if (count === 1) {
        const current = JSON.parse(request.messages.filter(m => m.role === 'user').at(-1).content.split('\n')[1]);
        assert.equal(current.localSummary, undefined); assert.equal(current.localAnalysis, undefined);
        const proactive = T.messages(request).map(m => m.content).join('\n');
        const projected = JSON.parse(T.messages(request).at(-2).content.split('\n')[1]);
        assert.deepEqual(projected.events.map(e => e.tile), ['?', '3m']);
        assert.doesNotMatch(proactive, /PRIVATE_KEY|HIDDEN|WRONG_SOURCE|9p|9s|8m|"snapshot"|"changes"|"game"|"rivers"/);
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
    assert.doesNotMatch(messages.at(-1).content, /localAnalysis|请分析以下已授权局面数据/);
    assert.deepEqual(JSON.parse(messages.at(-1).content.split('\n')[1]).currentState.selfHand, snapshot.selfHand);
    return answer;
  } });
  assert.equal(result.sessionTurn.answer, answer); assert.equal(result.runtime.turns, 1);
});


test('current state follows draws, discards, calls, kans, north extraction and same-position questions', async () => {
  const { createStore } = require('../extension/round-context.js');
  const C = require('../extension/contracts/snapshot.js');
  const store = createStore();
  const { snapshot } = setup();
  const original = snapshot.selfHand.slice();
  const events = [];
  let previousMessages, previousPosition = 0;
  const scenarios = [
    { kind: 'NewRound', hand: original, drawn: null },
    { kind: 'DealTile', hand: [...original, '0m'], drawn: '0m', tile: '0m' },
    { kind: 'DiscardTile', hand: original, drawn: null, tile: '0m' },
    { kind: 'ChiPengGang', hand: original.slice(3), drawn: null, tiles: ['1m', '2m', '3m'], meldType: 0 },
    { kind: 'AnGangAddGang', hand: original.slice(7), drawn: null, tiles: ['1z', '1z', '1z', '1z'], meldType: 3 },
    { kind: 'DealTile', hand: [...original.slice(7), '4z'], drawn: '4z', tile: '4z' },
    { kind: 'BaBei', hand: original.slice(7), drawn: null },
    { kind: 'DealTile', hand: [...original.slice(7), '5p'], drawn: '5p', tile: '5p' }
  ];
  for (const [position, scenario] of scenarios.entries()) {
    snapshot.lastStep = position; snapshot.selfHand = scenario.hand; snapshot.selfDrawnTile = scenario.drawn;
    if (scenario.tiles) snapshot.game.players[0].melds.push({ type: scenario.meldType, tiles: scenario.tiles, froms: [] });
    if (scenario.kind === 'BaBei') snapshot.game.players[0].norths++;
    if (scenario.kind === 'DiscardTile') snapshot.rivers[0].discards.push({ tile: scenario.tile });
    events.push({ ...scenario, source: snapshot.source, position, seat: 0 });
    // All event extras, old complete snapshots and patches stay off the model's proactive input.
    const handle = await store.observe({ snapshot, identity: { matchId: 'transition-match', roundStartId: 'transition-round' },
      position, events, historyComplete: true, config: { promptVersion: 3 } });
    const context = await store.getContext(handle);
    assert.deepEqual(context.checkpoint.snapshot, C.cleanSnapshot(snapshot));
    let sent;
    const result = await Agent.run({ snapshot, sessionContext: context, question: '当前怎么打', runtime: runtime(), transport: async request => {
      sent = T.messages(request);
      if (previousMessages) assert.deepEqual(sent.slice(0, previousMessages.length), previousMessages);
      const current = JSON.parse(sent.at(-1).content.split('\n')[1]);
      assert.deepEqual(current.currentState, { position, source: 'replay', playerCount: 4, selfSeat: 0,
        selfHand: scenario.hand, selfDrawnTile: scenario.drawn, phase: 'playing', complete: true });
      assert.equal(current.question, '当前怎么打');
      assert.doesNotMatch(sent.map(m => m.content).join('\n'), /"snapshot"|"changes"|"rivers"|"game"|"localAnalysis"|"remaining"|"scores"/);
      const observation = sent.filter(m => m.role === 'user' && m.content.startsWith('已授权局面增量')).at(-1);
      if (position) {
        const projected = JSON.parse(observation.content.split('\n')[1]);
        assert.equal(projected.events.length, 1);
        assert.equal(projected.events[0].position, position);
        assert.ok(projected.events.every(e => e.position > previousPosition));
      }
      return answer;
    } });
    await store.appendExchange(handle, { id: String(position), ...result.sessionTurn });
    previousMessages = [...sent, { role: 'assistant', content: result.sessionTurn.answer }];
    previousPosition = position;
  }
  // A follow-up without a new observation still supplies the authoritative hand.
  const handle = await store.observe({ snapshot, identity: { matchId: 'transition-match', roundStartId: 'transition-round' },
    position: snapshot.lastStep, events, historyComplete: true, config: { promptVersion: 3 } });
  const context = await store.getContext(handle);
  await Agent.run({ snapshot, sessionContext: context, question: '再解释一下', runtime: runtime(), transport: async request => {
    const sent = T.messages(request);
    assert.deepEqual(sent.slice(0, previousMessages.length), previousMessages);
    const current = JSON.parse(sent.at(-1).content.split('\n')[1]);
    assert.equal(current.question, '再解释一下');
    assert.deepEqual(current.currentState.selfHand, scenarios.at(-1).hand);
    assert.equal(current.currentState.selfDrawnTile, '5p');
    return answer;
  } });
});

test('missing current hand stays null despite old canonical hand and game-side private fields', async () => {
  const { snapshot, context } = setup();
  delete snapshot.selfHand;
  snapshot.selfDrawnTile = '7z'; // An orphan draw is not an authorization grant.
  snapshot.game.players[0].hand = ['7z']; snapshot.game.players[0].drawnTile = '7z';
  context.checkpoint.position = 5; snapshot.lastStep = null;
  context.timeline.push({ type: 'observation', position: 5, changes: [], events: [
    { kind: 'DealTile', source: snapshot.source, seat: 0, tile: '7z', position: 4 },
    { kind: 'DealTile', source: snapshot.source, seat: 1, tile: '6z', position: 5 },
    { kind: 'DiscardTile', source: snapshot.source, seat: 1, tile: '6m', position: 6 }
  ] });
  let calls = 0;
  await Agent.run({ snapshot, sessionContext: context, runtime: runtime(), transport: async request => {
    if (++calls === 1) {
      const messages = T.messages(request);
      const current = JSON.parse(messages.at(-1).content.split('\n')[1]);
      assert.equal(current.currentState.position, 5);
      assert.equal(current.currentState.selfHand, null); assert.equal(current.currentState.selfDrawnTile, null);
      assert.doesNotMatch(messages.map(m => m.content).join('\n'), /"snapshot"|"changes"|"game"|"rivers"/);
      const observation = JSON.parse(messages.at(-2).content.split('\n')[1]);
      assert.deepEqual(observation.events.map(e => e.tile), ['?', '?']);
      assert.doesNotMatch(JSON.stringify(observation), /7z|6z|6m/);
      return { toolCalls: [{ id: 'hand', name: 'get_self_hand', arguments: {} }] };
    }
    const hand = JSON.parse(request.messages.find(m => m.role === 'toolResult').content[0].text);
    assert.equal(hand.hand, null); assert.equal(hand.drawnTile, null);
    return answer;
  } });
});

test('proactive state and tools share frozen input while replay cursor bounds event projection', async () => {
  const { snapshot, context } = setup();
  snapshot.lastStep = null; snapshot.selfHand.push('0p'); snapshot.selfDrawnTile = '0p';
  context.checkpoint.position = 3;
  context.timeline.push({ type: 'observation', position: 3, changes: [], events: [
    { kind: 'DealTile', source: snapshot.source, seat: 0, tile: '0p', position: 3 },
    { kind: 'DiscardTile', source: snapshot.source, seat: 1, tile: '9s', position: 4 }
  ] });
  let calls = 0;
  await Agent.run({ snapshot, sessionContext: context, runtime: runtime(), transport: async request => {
    if (++calls === 1) {
      const messages = T.messages(request);
      const current = JSON.parse(messages.at(-1).content.split('\n')[1]);
      assert.equal(current.currentState.position, 3); assert.equal(current.currentState.selfDrawnTile, '0p');
      assert.doesNotMatch(JSON.stringify(messages), /9s/);
      snapshot.selfHand.fill('9m'); snapshot.selfDrawnTile = '9m'; context.checkpoint.position = 99;
      return { toolCalls: [{ id: 'hand', name: 'get_self_hand', arguments: {} }, { id: 'events', name: 'get_round_events', arguments: {} }] };
    }
    const [hand, history] = request.messages.filter(m => m.role === 'toolResult').map(m => JSON.parse(m.content[0].text));
    assert.equal(hand.drawnTile, '0p'); assert.equal(hand.hand.at(-1), '0p');
    assert.equal(history.position, 3); assert.deepEqual(history.events.map(e => e.position), [3]);
    return answer;
  } });
});
