const { test } = require('node:test');
const assert = require('node:assert/strict');
const U = require('../extension/model-usage.js');

test('OpenAI chat, Responses and DeepSeek normalize cache hits and reasoning without retaining response content', () => {
  const chat = U.normalizeUsage({ choices: [{ message: { content: 'PRIVATE' } }], usage: { prompt_tokens: 1000, completion_tokens: 200, prompt_tokens_details: { cached_tokens: 800 }, completion_tokens_details: { reasoning_tokens: 150 } } });
  assert.deepEqual(chat, { inputTokens: 1000, outputTokens: 200, cacheReadTokens: 800, cacheWriteTokens: 0, reasoningTokens: 150, uncachedInputTokens: 200 });
  assert.deepEqual(U.normalizeUsage({ input_tokens: 1000, output_tokens: 200, input_tokens_details: { cached_tokens: 800 }, output_tokens_details: { reasoning_tokens: 150 } }), chat);
  assert.deepEqual(U.normalizeUsage({ prompt_tokens: 1000, completion_tokens: 200, prompt_cache_hit_tokens: 800, completion_tokens_details: { reasoning_tokens: 150 } }), chat);
  assert.equal(JSON.stringify(chat).includes('PRIVATE'), false);
});

test('Anthropic and Pi add cached reads and writes to their uncached input count', () => {
  const expected = { inputTokens: 1000, outputTokens: 200, cacheReadTokens: 700, cacheWriteTokens: 100, reasoningTokens: null, uncachedInputTokens: 200 };
  assert.deepEqual(U.normalizeUsage({ input_tokens: 200, output_tokens: 200, cache_read_input_tokens: 700, cache_creation_input_tokens: 100 }, { format: 'anthropic' }), expected);
  assert.deepEqual(U.normalizeUsage({ input: 200, output: 200, cacheRead: 700, cacheWrite: 100, cost: { total: 99 }, totalTokens: 1200 }, { format: 'pi' }), expected);
});

test('unknown and malformed token values remain unknown, while explicit zeros stay zero', () => {
  const missing = U.normalizeUsage(null);
  assert.ok(Object.values(missing).every(value => value === null));
  const malformed = U.normalizeUsage({ prompt_tokens: '1000', completion_tokens: -1, prompt_tokens_details: { cached_tokens: Infinity } });
  assert.equal(malformed.inputTokens, null); assert.equal(malformed.outputTokens, null);
  assert.equal(malformed.cacheReadTokens, null);
  assert.equal(U.normalizeUsage({ prompt_tokens: 100, prompt_tokens_details: { cached_tokens: '80' } }).cacheReadTokens, null);
  assert.equal(U.normalizeUsage({ input_tokens: 20, cache_read_input_tokens: null }, { format: 'anthropic' }).cacheReadTokens, null);
  assert.deepEqual(U.normalizeUsage('not usage'), missing);
  assert.equal(U.normalizeUsage({ prompt_tokens: 100 }).cacheReadTokens, null);
  assert.equal(U.normalizeUsage({ prompt_tokens: 100 }).uncachedInputTokens, null);
  const zero = U.normalizeUsage({ prompt_tokens: 0, completion_tokens: 0, prompt_tokens_details: { cached_tokens: 0 } });
  assert.equal(zero.inputTokens, 0); assert.equal(zero.uncachedInputTokens, 0);
  const contradiction = U.normalizeUsage({ prompt_tokens: 10, completion_tokens: 1, prompt_cache_hit_tokens: 11 });
  assert.equal(contradiction.uncachedInputTokens, null);
  assert.equal(contradiction.cacheReadTokens, null);
});

test('per-million pricing separates uncached/cache costs and counts reasoning only in output', () => {
  const usage = U.normalizeUsage({ input: 200000, output: 200000, cacheRead: 700000, cacheWrite: 100000, reasoningTokens: 150000 }, { format: 'pi' });
  const cost = U.estimateCost(usage, { currency: 'USD', input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 });
  assert.deepEqual(cost, { currency: 'USD', inputCost: 0.4, outputCost: 2, cacheReadCost: 0.14, cacheWriteCost: 0.25, totalCost: 2.79 });
  assert.equal(U.estimateCost(usage, { currency: 'USD', input: 2, output: 10 }).totalCost, null);
  assert.equal(U.estimateCost(usage, { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 }).totalCost, null);
  assert.equal(U.estimateCost(U.normalizeUsage(null), { currency: 'USD', input: 0, output: 0 }).totalCost, null);
  assert.equal(U.estimateCost(U.normalizeUsage({ prompt_tokens: 100, completion_tokens: 50 }), { currency: 'USD', input: 0, output: 0 }).totalCost, null);
  assert.equal(U.estimateCost(U.normalizeUsage({ prompt_tokens: 100, completion_tokens: 50, prompt_tokens_details: { cached_tokens: 0 } }), { currency: 'USD', input: 0, output: 0 }).totalCost, 0);
});

test('summaries retain unknown usage and separate currencies without assuming exchange rates', () => {
  const usage = U.normalizeUsage({ prompt_tokens: 100, completion_tokens: 50 });
  const summary = U.summarize([
    { usage, cost: { currency: 'USD', totalCost: 1 } },
    { usage, cost: { currency: 'CNY', totalCost: 2 } },
    { usage: U.normalizeUsage(null), cost: { currency: 'USD', totalCost: null } }
  ]);
  assert.equal(summary.requests, 3); assert.equal(summary.usage.inputTokens, null);
  assert.deepEqual(summary.cost, { byCurrency: { USD: 1, CNY: 2 }, unknownRequests: 1 });
  assert.equal(U.summarize([{ usage }, { usage }]).usage.inputTokens, 200);
});
