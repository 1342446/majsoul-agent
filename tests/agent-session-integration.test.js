const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { webcrypto } = require('node:crypto');

const extension = path.resolve(__dirname, '../extension');
const copy = value => structuredClone(value);
const validResult = (reason = 'SAFE_ANSWER') => ({ task: 'combined', danger: [], efficiency: [],
  decision: { action: 'unknown', tile: null, reasons: [reason] }, limitations: ['测试局面不完整。'] });
const reply = (reason, usage = { prompt_tokens: 100, completion_tokens: 20, prompt_tokens_details: { cached_tokens: 0 } }) => ({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(validResult(reason)) } }], usage });
function position(step = 1) {
  return { format: 'mj-analysis-v1', playerCount: 4, source: 'live', complete: true, phase: 'playing', selfSeat: 0, lastStep: step,
    game: { round: { wind: 0, index: 0 }, honba: 0, sticks: 0, remaining: 69 - step, doras: ['1m'], scores: [25000,25000,25000,25000],
      players: Array.from({ length: 4 }, (_, seat) => ({ seat, melds: [], riichi: false, norths: 0, hand: ['7z'], token: 'OPPONENT_SECRET' })) },
    selfHand: ['1m'], selfDrawnTile: null, rivers: [{ seat: 0, discards: [] }] };
}
function storage(initial = {}) {
  const values = copy(initial);
  return { values,
    async setAccessLevel() {},
    async get(keys) {
      if (keys === null || keys === undefined) return copy(values);
      if (typeof keys === 'string') return copy({ [keys]: values[keys] });
      if (Array.isArray(keys)) return copy(Object.fromEntries(keys.map(key => [key, values[key]])));
      return copy(Object.fromEntries(Object.entries(keys).map(([key, fallback]) => [key, values[key] ?? fallback])));
    },
    async set(next) { Object.assign(values, copy(next)); },
    async remove(keys) { for (const key of [].concat(keys)) delete values[key]; }
  };
}
function worker({ local = storage(), config = {}, responses = [] } = {}) {
  local.values.modelConfig = { enabled: true, provider: 'chat', endpoint: 'https://provider.example/v1/chat/completions',
    model: 'mock-model', apiKey: 'API_SECRET', contextMode: 'round', toolCalling: false,
    pricing: { currency: 'USD', input: 2, output: 4, cacheRead: 0.5, cacheWrite: 2 }, ...local.values.modelConfig, ...config };
  const listeners = [], requests = [], changed = [];
  let context;
  context = vm.createContext({ AbortController, DOMException, Response, TextEncoder, TextDecoder, Uint8Array, URL,
    setTimeout, clearTimeout, structuredClone, crypto: webcrypto, performance,
    chrome: { storage: { local, onChanged: { addListener: listener => changed.push(listener) } },
      runtime: { id: 'extension-id', getURL: file => 'chrome-extension://extension-id/' + file,
        openOptionsPage() {}, onMessage: { addListener: listener => listeners.push(listener) } },
      permissions: { contains: async () => true }, tabs: { query: async () => [], sendMessage: async () => {} } },
    importScripts(...files) { for (const file of files) vm.runInContext(fs.readFileSync(path.join(extension, file), 'utf8'), context, { filename: file }); },
    fetch: async (url, options) => {
      const request = { url, options, body: JSON.parse(options.body) }; requests.push(request);
      const next = responses.length ? responses.shift() : reply();
      const value = typeof next === 'function' ? await next(request) : next;
      if (value instanceof Error) throw value;
      return value instanceof Response ? value : new Response(JSON.stringify(value), { status: 200 });
    }
  }, { codeGeneration: { strings: false, wasm: false } });
  vm.runInContext(fs.readFileSync(path.join(extension, 'background.js'), 'utf8'), context, { filename: 'background.js' });
  const game = { id: 'extension-id', tab: { id: 7 }, frameId: 0, url: 'https://game.maj-soul.com/1/' };
  const options = { id: 'extension-id', url: 'chrome-extension://extension-id/options.html' };
  const call = (message, sender = game) => new Promise(resolve => {
    let asynchronous = false, responded = false;
    const respond = value => { responded = true; resolve(copy(value)); };
    for (const listener of listeners) if (listener(message, sender, respond) === true) asynchronous = true;
    if (!asynchronous && !responded) resolve(undefined);
  });
  const analyze = (step = 1, more = {}) => call({ type: 'model:analyze', task: 'combined', provider: 'chat', snapshot: position(step),
    lane: 'manual-review', context: { identity: { matchId: 'm1', roundStartId: 'r1', viewId: 'v1' }, position: step }, ...more });
  return { local, requests, call, analyze, game, options, changed };
}
const persisted = w => JSON.stringify({ sessions: w.local.values.agentRoundContextV1, runs: w.local.values.agentRunsV1 });
const toolReply = (name = 'get_current_position', usage = { prompt_tokens: 100, completion_tokens: 10 }) => ({
  choices: [{ finish_reason: 'tool_calls', message: { content: null, tool_calls: [{ id: 'inspect-1', type: 'function', function: { name, arguments: '{}' } }] } }], usage });
async function until(predicate) {
  for (let i = 0; i < 100; i++) { if (predicate()) return; await new Promise(resolve => setImmediate(resolve)); }
  assert.fail('Worker did not reach expected asynchronous checkpoint');
}

test('actual MV3 bundle defaults to a single compatibility call without tool declarations', async () => {
  const w = worker({ config: { contextMode: 'snapshot' }, responses: [reply()] });
  const result = await w.analyze();
  assert.equal(result.ok, true); assert.equal(w.requests.length, 1);
  assert.ok(!w.requests[0].body.tools?.length);
  assert.equal(result.usage.inputTokens, 100); assert.equal(result.usage.outputTokens, 20);
  assert.ok(result.cost.totalCost > 0);
  assert.equal(result.runtime.name, 'pi'); assert.equal(result.runtime.turns, 1);
  assert.doesNotMatch(persisted(w), /API_SECRET|OPPONENT_SECRET|Authorization|provider\.example/);
});

test('manual round context survives a worker restart; realtime does not replay assistant answers', async () => {
  const w = worker({ responses: [reply('PAST_ANSWER')] });
  const first = await w.analyze(1, { question: 'EARLIER_QUESTION' });
  assert.equal(first.ok, true); assert.ok(first.session.id);
  const restored = worker({ local: w.local, responses: [reply('NEXT_ANSWER'), reply('LIVE_ANSWER')] });
  const next = await restored.analyze(2, { question: 'FOLLOWUP_QUESTION' });
  assert.equal(next.ok, true); assert.equal(next.session.id, first.session.id);
  assert.match(JSON.stringify(restored.requests[0].body.messages), /PAST_ANSWER|EARLIER_QUESTION/);
  assert.match(JSON.stringify(restored.requests[0].body.messages), /FOLLOWUP_QUESTION/);
  assert.equal((await restored.analyze(2, { lane: 'live' })).ok, true);
  assert.doesNotMatch(JSON.stringify(restored.requests[1].body.messages), /PAST_ANSWER|NEXT_ANSWER/);
});

test('replay rewind and authorization changes do not send future or unselected information', async () => {
  const w = worker({ responses: [reply('FUTURE_ANSWER'), reply(), reply()] });
  const future = await w.analyze(8);
  assert.equal(future.ok, true);
  const rewind = await w.analyze(2);
  assert.equal(rewind.ok, true); assert.ok(rewind.session.branch > future.session.branch);
  assert.doesNotMatch(JSON.stringify(w.requests[1].body), /FUTURE_ANSWER|OPPONENT_SECRET/);
  const selected = position(3); delete selected.game; delete selected.selfHand;
  assert.equal((await w.analyze(3, { snapshot: selected })).ok, true);
  const sent = JSON.stringify(w.requests[2].body);
  assert.doesNotMatch(sent, /FUTURE_ANSWER|OPPONENT_SECRET|25000|selfHand":\["1m/);
});

test('manual tools execute through the actual Pi bundle with two calls and aggregate accounting', async () => {
  const w = worker({ config: { toolCalling: true }, responses: [toolReply(), reply('TOOL_ANSWER', { prompt_tokens: 200, completion_tokens: 30 })] });
  const result = await w.analyze();
  assert.equal(result.ok, true); assert.equal(w.requests.length, 2);
  assert.equal(result.runtime.turns, 2); assert.equal(result.runtime.toolCalls, 1);
  assert.equal(result.usage.inputTokens, 300); assert.equal(result.usage.outputTokens, 40);
  assert.ok(w.requests[0].body.tools.some(tool => tool.function.name === 'get_current_position'));
  const messages = w.requests[1].body.messages;
  assert.ok(messages.some(message => message.role === 'assistant' && message.tool_calls?.[0].id === 'inspect-1'));
  const tool = messages.find(message => message.role === 'tool');
  assert.equal(tool.tool_call_id, 'inspect-1'); assert.match(tool.content, /mj-analysis-v1/);
  assert.doesNotMatch(JSON.stringify(messages), /OPPONENT_SECRET|API_SECRET|7z/);
  assert.equal(w.local.values.agentRunsV1.at(-1).calls, 2);
});

test('round-history tool on a replay branch excludes future checkpoints and unauthorized events', async () => {
  const w = worker({ config: { toolCalling: true }, responses: [reply('FUTURE_TOOL_ANSWER'), toolReply('get_round_history'), reply()] });
  const analyze = (step, events) => w.analyze(step, { snapshot: { ...position(step), source: 'replay', lastStep: null },
    context: { identity: { matchId: 'replay-1', roundStartId: 'round-1', viewId: 'review' }, position: step, events } });
  assert.equal((await analyze(8, [{ kind: 'DiscardTile', source: 'replay', recordIndex: 8, seat: 0, tile: '8s' }])).ok, true);
  assert.equal((await analyze(2, [
    { kind: 'DiscardTile', source: 'replay', recordIndex: 2, seat: 0, tile: '2m' },
    { kind: 'DiscardTile', source: 'replay', recordIndex: 2, seat: 1, tile: '9m' },
    { kind: 'DealTile', source: 'replay', recordIndex: 2, seat: 1, tile: '7z' }
  ])).ok, true);
  const sent = JSON.stringify(w.requests[2].body.messages);
  assert.doesNotMatch(sent, /FUTURE_TOOL_ANSWER|OPPONENT_SECRET|API_SECRET|8s|9m|7z/);
  const tool = w.requests[2].body.messages.find(message => message.role === 'tool');
  const history = JSON.parse(tool.content);
  assert.equal(history.checkpoints.length, 1); assert.equal(history.checkpoints[0].position, 2);
  assert.ok(history.events.some(event => event.tile === '2m'));
});

test('realtime tool setting retains one-call budget, and default APIs receive no tools', async () => {
  for (const [config, lane] of [[{ toolCalling: true }, 'live'], [{ toolCalling: false }, 'manual-review']]) {
    const w = worker({ config, responses: [toolReply()] });
    const result = await w.analyze(1, { lane });
    assert.equal(result.ok, false); assert.equal(w.requests.length, 1);
    assert.ok(!w.requests[0].body.tools?.length);
    assert.doesNotMatch(JSON.stringify(result.trace || {}), /API_SECRET|OPPONENT_SECRET|mj-analysis-v1/);
  }
});

test('malformed and HTTP failure runs retain known usage without entering conversation history', async () => {
  const malformed = { choices: [{ message: { content: '{"task":"combined","note":"INVALID_PAST_ANSWER"}' } }], usage: { prompt_tokens: 44, completion_tokens: 11 } };
  const w = worker({ responses: [malformed, reply()] });
  const failed = await w.analyze();
  assert.equal(failed.ok, false); assert.equal(failed.usage.inputTokens, 44);
  const run = w.local.values.agentRunsV1.at(-1);
  assert.equal(run.status, 'failed'); assert.equal(run.usage.outputTokens, 11);
  assert.doesNotMatch(JSON.stringify(run), /INVALID_PAST_ANSWER|API_SECRET|OPPONENT_SECRET/);
  assert.equal((await w.analyze(2)).ok, true);
  assert.doesNotMatch(JSON.stringify(w.requests[1].body.messages), /INVALID_PAST_ANSWER/);
  const network = worker({ responses: [new Response('{"error":"PRIVATE_RESPONSE"}', { status: 503 })] });
  const rejected = await network.analyze();
  assert.equal(rejected.ok, false); assert.equal(network.local.values.agentRunsV1.at(-1).status, 'failed');
  assert.equal(network.local.values.agentRunsV1.at(-1).usage.inputTokens, null);
  assert.doesNotMatch(persisted(network), /PRIVATE_RESPONSE|API_SECRET|OPPONENT_SECRET/);
});

test('unknown usage on a failed later tool turn does not become a known partial total', async () => {
  const w = worker({ config: { toolCalling: true }, responses: [
    toolReply('get_current_position', { prompt_tokens: 100, completion_tokens: 10, prompt_tokens_details: { cached_tokens: 0 } }),
    new Response('{}', { status: 503 })
  ] });
  const result = await w.analyze();
  assert.equal(result.ok, false); assert.equal(result.calls, 2);
  assert.equal(result.usage.inputTokens, null); assert.equal(result.usage.outputTokens, null); assert.equal(result.cost.totalCost, null);
  const run = w.local.values.agentRunsV1.at(-1);
  assert.equal(run.calls, 2); assert.equal(run.usage.inputTokens, null); assert.equal(run.cost.totalCost, null);
});

test('clear and cancel during final accounting persistence suppress a late successful result', async () => {
  for (const action of ['agent:clear-data', 'model:cancel']) {
    const local = storage(), original = local.set.bind(local);
    let release, held = false;
    const gate = new Promise(resolve => { release = resolve; });
    local.set = async next => {
      if (next.agentRunsV1?.length && !held) { held = true; await gate; }
      return original(next);
    };
    const w = worker({ local, responses: [reply('LATE_SUCCESS')] });
    const pending = w.analyze(); await until(() => held);
    const requested = w.call({ type: action }, action === 'agent:clear-data' ? w.options : w.game);
    await new Promise(resolve => setImmediate(resolve)); release();
    assert.equal((await requested).ok, true);
    const result = await pending;
    assert.equal(result.ok, false); assert.match(result.error, /取消|超时/);
    assert.doesNotMatch(JSON.stringify(result), /LATE_SUCCESS/);
    if (action === 'agent:clear-data') {
      assert.equal(local.values.agentRunsV1.length, 0);
      assert.equal(local.values.agentRoundContextV1.sessions.length, 0);
    } else {
      assert.doesNotMatch(JSON.stringify(local.values.agentRoundContextV1), /LATE_SUCCESS/);
      assert.equal((await w.analyze(2)).ok, true);
      assert.doesNotMatch(JSON.stringify(w.requests[1].body.messages), /LATE_SUCCESS/);
    }
  }
});

test('cancellation during exchange persistence rolls back the answer and preserves earlier conversation', async () => {
  const local = storage(), w = worker({ local, responses: [reply('KEEP_PRIOR_ANSWER'), reply('CANCEL_DURING_SAVE'), reply()] });
  assert.equal((await w.analyze()).ok, true);
  const original = local.set.bind(local);
  let held = false, release;
  const gate = new Promise(resolve => { release = resolve; });
  local.set = async next => {
    if (!held && JSON.stringify(next.agentRoundContextV1 || {}).includes('CANCEL_DURING_SAVE')) { held = true; await gate; }
    await original(next);
  };
  const pending = w.analyze(2); await until(() => held);
  assert.equal((await w.call({ type: 'model:cancel' })).ok, true);
  release();
  const cancelled = await pending;
  assert.equal(cancelled.ok, false); assert.doesNotMatch(JSON.stringify(cancelled), /CANCEL_DURING_SAVE/);
  assert.doesNotMatch(JSON.stringify(local.values.agentRoundContextV1), /CANCEL_DURING_SAVE/);
  assert.match(JSON.stringify(local.values.agentRoundContextV1), /KEEP_PRIOR_ANSWER/);
  const restored = worker({ local, responses: [reply()] });
  assert.equal((await restored.analyze(3)).ok, true);
  assert.doesNotMatch(JSON.stringify(restored.requests[0].body.messages), /CANCEL_DURING_SAVE/);
  assert.match(JSON.stringify(restored.requests[0].body.messages), /KEEP_PRIOR_ANSWER/);
});

test('manual tool turn budget fails safely and stores no provider/tool payload in traces', async () => {
  const w = worker({ config: { toolCalling: true }, responses: [toolReply(), toolReply(), toolReply()] });
  const result = await w.analyze();
  assert.equal(result.ok, false); assert.equal(w.requests.length, 3);
  assert.ok(!w.requests[2].body.tools?.length);
  assert.equal(w.local.values.agentRunsV1.at(-1).status, 'failed');
  assert.doesNotMatch(JSON.stringify(result.trace || {}), /API_SECRET|OPPONENT_SECRET|mj-analysis-v1|selfHand/);
});

test('only trusted options clear local data; clear aborts pending and prevents late repopulation', async () => {
  const w = worker({ responses: [reply('SAVED_ANSWER'), request => new Promise((resolve, reject) => {
    request.options.signal.addEventListener('abort', () => reject(new DOMException('cancelled', 'AbortError')), { once: true });
  })] });
  assert.equal((await w.analyze()).ok, true);
  const before = persisted(w);
  assert.equal(await w.call({ type: 'agent:clear-data' }), undefined);
  assert.equal(persisted(w), before);
  assert.equal(await w.call({ type: 'agent:clear-data' }, { ...w.options, id: 'other' }), undefined);
  const pending = w.analyze(2);
  await until(() => w.requests.length === 2);
  assert.equal((await w.call({ type: 'agent:clear-data' }, w.options)).ok, true);
  const cancelled = await pending;
  assert.equal(cancelled.ok, false); assert.match(cancelled.error, /取消|超时/);
  assert.deepEqual(w.local.values.agentRunsV1 || [], []);
  assert.equal(w.local.values.agentRoundContextV1?.sessions?.length || 0, 0);
  assert.doesNotMatch(JSON.stringify(cancelled.trace || {}), /SAVED_ANSWER|API_SECRET|OPPONENT_SECRET/);
  const restart = worker({ local: w.local, responses: [reply()] });
  assert.equal((await restart.analyze(3)).ok, true);
  assert.doesNotMatch(JSON.stringify(restart.requests[0].body.messages), /SAVED_ANSWER/);
});

test('usage export is restricted to trusted options and strips unsolicited stored payload fields', async () => {
  const w = worker({ responses: [reply()] });
  assert.equal((await w.analyze()).ok, true);
  const record = w.local.values.agentRunsV1[0];
  Object.assign(record, { apiKey: 'INJECTED_SECRET', endpoint: 'https://private.example/', prompt: 'RAW_PRIVATE_PROMPT',
    modelConfig: { apiKey: 'NESTED_SECRET' }, response: { content: 'RAW_PRIVATE_RESPONSE' } });
  record.usage.prompt = 'NESTED_PRIVATE_PROMPT'; record.cost.apiKey = 'COST_SECRET';
  for (const sender of [w.game, { ...w.options, id: 'foreign-extension' }, { ...w.options, url: 'chrome-extension://extension-id/other.html' }]) {
    assert.equal(await w.call({ type: 'agent:usage' }, sender), undefined);
  }
  const exported = await w.call({ type: 'agent:usage' }, w.options);
  assert.equal(exported.ok, true); assert.equal(exported.records.length, 1);
  const output = exported.records[0];
  assert.equal(output.usage.inputTokens, 100); assert.equal(output.usage.outputTokens, 20);
  assert.equal(output.mode, 'round'); assert.equal(output.status, 'completed'); assert.ok(output.cost.totalCost > 0);
  assert.deepEqual(Object.keys(output).sort(), ['at','calls','cost','elapsedMs','lane','mode','status','usage']);
  assert.deepEqual(Object.keys(output.usage).sort(), ['cacheReadTokens','cacheWriteTokens','inputTokens','outputTokens','reasoningTokens','uncachedInputTokens']);
  assert.doesNotMatch(JSON.stringify(exported), /SECRET|PRIVATE|private\.example|apiKey|prompt|endpoint|modelConfig|response/);
});

test('configuration changes cancel pending analysis and clear sessions while preserving comparison accounting', async () => {
  const w = worker({ responses: [reply('PRIOR_ROUND_ANSWER'), request => new Promise((resolve, reject) => {
    request.options.signal.addEventListener('abort', () => reject(new DOMException('cancelled', 'AbortError')), { once: true });
  }), reply('SNAPSHOT_ANSWER')] });
  assert.equal((await w.analyze()).ok, true);
  const previous = copy(w.local.values.agentRunsV1[0]);
  const pending = w.analyze(2); await until(() => w.requests.length === 2);
  const config = { ...w.local.values.modelConfig, contextMode: 'snapshot', apiKey: 'NEW_CONFIG_SECRET' };
  w.local.values.modelConfig = config;
  await Promise.all(w.changed.map(listener => listener({ modelConfig: { newValue: copy(config) } }, 'local')));
  const cancelled = await pending;
  assert.equal(cancelled.ok, false); assert.match(cancelled.error, /取消|超时/);
  assert.equal(w.local.values.agentRoundContextV1.sessions.length, 0);
  assert.ok(w.local.values.agentRunsV1.some(record => JSON.stringify(record) === JSON.stringify(previous)));
  assert.equal((await w.analyze(3)).ok, true);
  const exported = await w.call({ type: 'agent:usage' }, w.options);
  assert.ok(exported.records.some(record => record.mode === 'round' && record.status === 'completed'));
  assert.ok(exported.records.some(record => record.mode === 'snapshot' && record.status === 'completed'));
  assert.doesNotMatch(JSON.stringify(exported), /PRIOR_ROUND_ANSWER|SNAPSHOT_ANSWER|NEW_CONFIG_SECRET|API_SECRET/);
  assert.doesNotMatch(JSON.stringify(w.requests[2].body.messages), /PRIOR_ROUND_ANSWER/);
});
