const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { readFileSync } = require('node:fs');
function runtime() {
  const context = vm.createContext({ AbortController, setTimeout, clearTimeout, structuredClone, performance, TextEncoder, TextDecoder }, { codeGeneration: { strings: false, wasm: false } });
  vm.runInContext(readFileSync(require.resolve('../extension/pi-runtime.js'), 'utf8'), context);
  return context.MJPiRuntime;
}
const user = () => [{ role: 'user', content: 'analyze', timestamp: 0 }];
const tool = execute => ({ name: 'inspect', description: 'Read current hand', parameters: { type: 'object', properties: { seat: { type: 'integer' } }, required: ['seat'], additionalProperties: false }, execute });
test('real Pi loop runs a validated tool and preserves assistant/tool history under MV3 CSP', async () => {
  const events = [], requests = [];
  const result = await runtime().run({ messages: user(), systemPrompt: 'JSON only', tools: [tool(async (id, args) => {
    assert.equal(args.seat, 0); return { content: [{ type: 'text', text: '{"hand":[]}' }], details: { seat: args.seat } };
  })], budget: { maxTurns: 3 }, onEvent: event => events.push(event.type), transport: async request => {
    requests.push(request);
    return requests.length === 1 ? { toolCalls: [{ id: 't1', name: 'inspect', arguments: { seat: 0 } }], usage: { input: 2, output: 3 } } : { text: '{"ok":true}', usage: { totalTokens: 4 } };
  } });
  assert.equal(result.text, '{"ok":true}'); assert.equal(result.turns, 2); assert.equal(result.toolCalls, 1); assert.equal(result.usage.totalTokens, 9);
  assert.equal(requests[0].tools[0].name, 'inspect');
  const history = requests[1].messages;
  assert.equal(history.find(m => m.role === 'assistant').content[0].id, 't1');
  assert.equal(history.find(m => m.role === 'toolResult').toolCallId, 't1');
  assert.equal(history.find(m => m.role === 'toolResult').content[0].text, '{"hand":[]}');
  assert.ok(events.includes('tool_execution_end')); assert.ok(events.includes('agent_end'));
});
test('invalid and unknown tools become Pi error results without executing', async () => {
  let executed = 0, requests = 0;
  const result = await runtime().run({ messages: user(), tools: [tool(async () => { executed++; })], transport: async request => {
    requests++;
    if (requests === 1) return { toolCalls: [{ id: 'a', name: 'inspect', arguments: { seat: 'wrong' } }, { id: 'b', name: 'delete', arguments: {} }] };
    assert.equal(request.messages.filter(m => m.role === 'toolResult' && m.isError).length, 2);
    return { text: 'safe answer' };
  } });
  assert.equal(executed, 0); assert.equal(result.text, 'safe answer');
});
test('no-tools compatibility calls transport once and returns JSON text', async () => {
  let calls = 0;
  const result = await runtime().run({ messages: user(), transport: async request => { calls++; assert.equal(request.tools.length, 0); return '{"legacy":true}'; } });
  assert.equal(calls, 1); assert.equal(result.text, '{"legacy":true}');
});
test('last turn disables tools and tool/token budgets prevent execution', async () => {
  let executed = 0;
  const tools = [tool(async () => { executed++; return { content: [] }; })];
  await assert.rejects(runtime().run({ messages: user(), tools, budget: { maxTurns: 1 }, transport: async request => {
    assert.equal(request.finalTurn, true); assert.equal(request.tools.length, 0);
    return { toolCalls: [{ id: 'a', name: 'inspect', arguments: { seat: 0 } }] };
  } }), { code: 'TURN_BUDGET' });
  await assert.rejects(runtime().run({ messages: user(), tools, budget: { maxToolCalls: 1 }, transport: async () => ({ toolCalls: [0, 1].map(id => ({ id: String(id), name: 'inspect', arguments: { seat: 0 } })) }) }), { code: 'TOOL_BUDGET' });
  await assert.rejects(runtime().run({ messages: user(), tools, budget: { maxTokens: 1 }, transport: async () => ({ usage: { totalTokens: 2 }, toolCalls: [{ id: 'a', name: 'inspect', arguments: { seat: 0 } }] }) }), { code: 'TOKEN_BUDGET' });
  assert.equal(executed, 0);
});
test('cancel and timeout settle even when a transport ignores AbortSignal', async () => {
  const controller = new AbortController();
  const pending = runtime().run({ messages: user(), signal: controller.signal, transport: () => new Promise(() => {}) });
  controller.abort(new Error('cancelled')); await assert.rejects(pending, /cancelled/);
  await assert.rejects(runtime().run({ messages: user(), budget: { timeoutMs: 10 }, transport: () => new Promise(() => {}) }), { code: 'TIME_BUDGET' });
});

test('DeepSeek tool reasoning is replayed within one run and excluded from final results and accounting', async () => {
  const T = require('../extension/model-session-transport.js');
  const Agent = require('../extension/agent.js');
  const U = require('../extension/model-usage.js');
  const { fixture } = require('../agent/eval.cjs');
  const requests = [], usage = [];
  const sentinel = 'PRIVATE_TOOL_REASONING';
  const answer = JSON.stringify({ task: 'combined', danger: [], efficiency: [], decision: { action: 'unknown', tile: null, reasons: ['等待摸牌'] }, limitations: [] });
  const result = await Agent.run({ snapshot: fixture('123m123p123s111z2z'), runtime: runtime(), maxTurns: 3, toolCalling: true,
    transport: async request => {
      const body = T.body(request, { model: 'deepseek-chat' }, { thinking: { type: 'enabled' } });
      requests.push(body);
      const turn = requests.length;
      const data = { usage: { prompt_tokens: 10, completion_tokens: 20 }, choices: [{ finish_reason: turn < 3 ? 'tool_calls' : 'stop', message: {
        content: turn < 3 ? null : answer, reasoning_content: `${sentinel}_${turn}`,
        ...(turn < 3 ? { tool_calls: [{ id: `call-${turn}`, type: 'function', function: { name: 'get_self_hand', arguments: '{}' } }] } : {})
      } }] };
      usage.push(U.normalizeUsage(data));
      return T.result(data, request.tools.length > 0);
    } });
  assert.equal(requests.length, 3);
  assert.equal(requests[0].thinking.type, 'enabled');
  assert.equal(requests[1].messages.find(item => item.tool_calls)?.reasoning_content, `${sentinel}_1`);
  assert.deepEqual(requests[2].messages.filter(item => item.tool_calls).map(item => item.reasoning_content), [`${sentinel}_1`, `${sentinel}_2`]);
  assert.equal(requests[2].messages.filter(item => item.role === 'tool').length, 2);
  assert.equal(JSON.stringify(result).includes(sentinel), false);
  assert.equal(JSON.stringify(U.summarize(usage.map(item => ({ usage: item })))).includes(sentinel), false);
  const final = T.result({ choices: [{ message: { content: answer, reasoning_content: sentinel } }] });
  assert.deepEqual(final, { text: answer });
  // Round history persists final answers, not a Pi transcript. A later run's
  // ordinary assistant history must not reintroduce a provider reasoning field.
  const subsequent = T.messages({ systemPrompt: '', messages: [{ role: 'assistant', content: answer, reasoning_content: sentinel }] });
  assert.equal(JSON.stringify(subsequent).includes(sentinel), false);
});
