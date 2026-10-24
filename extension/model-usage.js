(function (root) {
  'use strict';
  // Extract numeric accounting only; callers must never retain provider responses here.
  const fields = ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'reasoningTokens', 'uncachedInputTokens'];
  const number = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
  const first = (...values) => values.map(number).find(value => value !== null) ?? null;
  const optional = (object, key) => Object.hasOwn(object, key) ? number(object[key]) : 0;
  function normalizeUsage(raw, { format } = {}) {
    const candidate = raw?.usage && typeof raw.usage === 'object' ? raw.usage : raw;
    const u = candidate && typeof candidate === 'object' && !Array.isArray(candidate) ? candidate : {};
    const result = Object.fromEntries(fields.map(key => [key, null]));
    const kind = format || ('cacheRead' in u || 'cacheWrite' in u ? 'pi' : 'cache_read_input_tokens' in u || 'cache_creation_input_tokens' in u ? 'anthropic' : 'prompt_tokens' in u ? 'chat' : 'input_tokens' in u ? 'responses' : 'unknown');
    if (kind === 'pi') {
      result.cacheReadTokens = number(u.cacheRead);
      result.cacheWriteTokens = number(u.cacheWrite);
      const input = number(u.input);
      if (input !== null && result.cacheReadTokens !== null && result.cacheWriteTokens !== null) result.inputTokens = input + result.cacheReadTokens + result.cacheWriteTokens;
      result.outputTokens = number(u.output);
      result.reasoningTokens = first(u.reasoningTokens, u.reasoning);
    } else if (kind === 'anthropic') {
      result.cacheReadTokens = number(u.cache_read_input_tokens);
      result.cacheWriteTokens = number(u.cache_creation_input_tokens);
      const input = number(u.input_tokens);
      if (input !== null && result.cacheReadTokens !== null && result.cacheWriteTokens !== null) result.inputTokens = input + result.cacheReadTokens + result.cacheWriteTokens;
      result.outputTokens = number(u.output_tokens);
      // Anthropic output includes thinking but does not report its separate token count.
    } else if (['chat', 'openai', 'openai-chat', 'deepseek', 'responses', 'openai-responses'].includes(kind)) {
      result.inputTokens = first(u.prompt_tokens, u.input_tokens);
      result.outputTokens = first(u.completion_tokens, u.output_tokens);
      result.cacheReadTokens = first(u.prompt_cache_hit_tokens, u.prompt_tokens_details?.cached_tokens, u.input_tokens_details?.cached_tokens);
      // OpenAI chat/Responses and DeepSeek expose no separately billed cache-write
      // counter. A provider extension may explicitly supply one; absent means N/A.
      result.cacheWriteTokens = optional(u, 'cache_creation_input_tokens');
      result.reasoningTokens = first(u.completion_tokens_details?.reasoning_tokens, u.output_tokens_details?.reasoning_tokens);
    }
    if ([result.inputTokens, result.cacheReadTokens, result.cacheWriteTokens].every(value => value !== null)) {
      const uncached = result.inputTokens - result.cacheReadTokens - result.cacheWriteTokens;
      if (uncached >= 0) result.uncachedInputTokens = uncached;
      else {
        // Contradictory accounting cannot support a cache discount or a cost estimate.
        result.cacheReadTokens = null; result.cacheWriteTokens = null;
      }
    }
    return result;
  }
  function estimateCost(usage, pricing = {}) {
    pricing = pricing || {};
    const currency = typeof pricing.currency === 'string' && pricing.currency.trim() ? pricing.currency.trim() : null;
    const component = (tokens, rate) => number(tokens) === 0 ? 0 : number(tokens) !== null && number(rate) !== null && currency ? tokens * rate / 1e6 : null;
    const cost = {
      currency,
      inputCost: component(usage?.uncachedInputTokens, pricing.input),
      outputCost: component(usage?.outputTokens, pricing.output),
      cacheReadCost: component(usage?.cacheReadTokens, pricing.cacheRead),
      cacheWriteCost: component(usage?.cacheWriteTokens, pricing.cacheWrite)
    };
    const parts = [cost.inputCost, cost.outputCost, cost.cacheReadCost, cost.cacheWriteCost];
    cost.totalCost = currency && parts.every(value => value !== null) ? parts.reduce((sum, value) => sum + value, 0) : null;
    return cost;
  }
  function summarize(records) {
    const list = Array.isArray(records) ? records : [];
    // Unknown records remain unknown in totals; they are never silently counted as zero.
    const usage = Object.fromEntries(fields.map(key => [key, list.every(record => number(record?.usage?.[key]) !== null) ? list.reduce((sum, record) => sum + record.usage[key], 0) : null]));
    const currencies = new Map();
    let unknownCostRequests = 0;
    for (const record of list) {
      const cost = record?.cost;
      if (!cost?.currency || number(cost.totalCost) === null) { unknownCostRequests++; continue; }
      currencies.set(cost.currency, (currencies.get(cost.currency) || 0) + cost.totalCost);
    }
    return { requests: list.length, usage, cost: { byCurrency: Object.fromEntries(currencies), unknownRequests: unknownCostRequests } };
  }
  const api = { normalizeUsage, estimateCost, summarize };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MJModelUsage = api;
})(globalThis);
