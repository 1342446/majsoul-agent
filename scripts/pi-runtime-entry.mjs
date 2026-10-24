import { runAgentLoop } from '@earendil-works/pi-agent-core';
import { getCurrentTools, getCurrentSystemPrompt } from '@earendil-works/pi-ai/utils/transcript';

export const version = 'pi-agent-core@1.4.0';
const emptyUsage = () => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } });
function error(message, code) { return Object.assign(new Error(message), { code }); }
function bounded(value, fallback, maximum) {
  return Number.isFinite(value) && value > 0 ? Math.min(Math.floor(value), maximum) : fallback;
}
function checked(promise, signal) {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason || error('Pi run cancelled', 'ABORTED'));
    if (signal.aborted) return abort();
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve(promise).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}
function assistantMessage(value, model) {
  const response = typeof value === 'string' ? { text: value } : value || {};
  const content = response.content || [
    ...(response.text == null ? [] : [{ type: 'text', text: response.text }]),
    ...(response.toolCalls || []).map((call, index) => ({ type: 'toolCall', id: call.id || `call-${index}`, name: call.name, arguments: call.arguments || {} }))
  ];
  const usage = { ...emptyUsage(), ...response.usage };
  if (!Number.isFinite(response.usage?.totalTokens)) usage.totalTokens = (usage.input || 0) + (usage.output || 0) + (usage.cacheRead || 0) + (usage.cacheWrite || 0);
  return { ...response, role: 'assistant', content, api: model.api, provider: model.provider, model: model.id,
    usage, stopReason: response.stopReason || (content.some(item => item.type === 'toolCall') ? 'toolUse' : 'stop'), timestamp: Date.now() };
}

/** Run the upstream Pi loop. The host owns permissions, credentials and transport. */
export async function run(options = {}) {
  if (typeof options.transport !== 'function') throw error('Pi transport is required', 'TRANSPORT_REQUIRED');
  const budget = options.budget || {};
  const limits = { turns: bounded(budget.maxTurns, 6, 20), tools: bounded(budget.maxToolCalls, 12, 60),
    tokens: bounded(budget.maxTokens, 16000, 200000), timeout: bounded(budget.timeoutMs, 60000, 300000) };
  const controller = new AbortController(), signal = controller.signal;
  const abort = () => controller.abort(options.signal.reason || error('Pi run cancelled', 'ABORTED'));
  options.signal?.addEventListener('abort', abort, { once: true });
  if (options.signal?.aborted) abort();
  const timer = setTimeout(() => controller.abort(error('Pi time budget exceeded', 'TIME_BUDGET')), limits.timeout);
  let turns = 0, toolCalls = 0, usage = emptyUsage();
  const model = { id: 'configured-model', name: 'Configured model', api: 'openai-completions', provider: 'custom', ...options.model };
  const tools = (options.tools || []).map(tool => ({ ...tool, label: tool.label || tool.name,
    execute: async (id, args, toolSignal, update) => {
      if (signal.aborted) throw signal.reason;
      return checked(tool.execute(id, args, toolSignal, update), signal);
    } }));
  const messages = [...(options.messages || [])];
  if (options.systemPrompt) messages.unshift({ role: 'system', content: options.systemPrompt, timestamp: Date.now() });
  const streamFn = async (selectedModel, context) => {
    if (signal.aborted) throw signal.reason;
    if (turns >= limits.turns) throw error('Pi turn budget exceeded', 'TURN_BUDGET');
    if (usage.totalTokens >= limits.tokens) throw error('Pi token budget exceeded', 'TOKEN_BUDGET');
    turns++;
    const finalTurn = turns === limits.turns;
    const response = assistantMessage(await checked(options.transport({
      model: selectedModel, messages: context.messages, systemPrompt: getCurrentSystemPrompt(context.messages),
      tools: finalTurn ? [] : getCurrentTools(context.messages), signal, maxTokens: limits.tokens - usage.totalTokens, finalTurn
    }), signal), model);
    for (const key of ['input', 'output', 'cacheRead', 'cacheWrite', 'totalTokens']) usage[key] += Number(response.usage[key]) || 0;
    const calls = response.content.filter(item => item.type === 'toolCall').length;
    if (finalTurn && calls) throw error('Pi final turn must return an answer', 'TURN_BUDGET');
    if (!tools.length && calls) throw error('This API does not support tool calls', 'TOOLS_UNAVAILABLE');
    if (toolCalls + calls > limits.tools) throw error('Pi tool budget exceeded', 'TOOL_BUDGET');
    if (usage.totalTokens > limits.tokens) throw error('Pi token budget exceeded', 'TOKEN_BUDGET');
    toolCalls += calls;
    return { result: async () => response, async *[Symbol.asyncIterator]() { yield { type: 'done', message: response }; } };
  };
  try {
    const result = await checked(runAgentLoop([], { messages, tools }, {
      model, convertToLlm: items => items, toolExecution: 'sequential',
      finishTurn: () => !tools.length ? { action: 'end' } : undefined
    }, async event => { if (options.onEvent) await options.onEvent(event); }, signal, streamFn), signal);
    const allMessages = [...messages, ...result];
    const assistant = [...allMessages].reverse().find(item => item.role === 'assistant');
    if (assistant?.stopReason === 'error' || assistant?.stopReason === 'aborted') throw error(assistant.errorMessage || 'Pi model failed', assistant.stopReason === 'aborted' ? 'ABORTED' : 'MODEL_ERROR');
    return { messages: allMessages, assistant, text: (assistant?.content || []).filter(item => item.type === 'text').map(item => item.text).join(''), usage, turns, toolCalls, stopReason: assistant?.stopReason || 'stop' };
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', abort);
  }
}
