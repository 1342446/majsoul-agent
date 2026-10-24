(function (root) {
  'use strict';
  // Persist numeric accounting and fixed metadata only. Never retain prompts or credentials.
  function create({ storage, key = 'agentRunsV1' }) {
    let queue = Promise.resolve(), generation = 0;
    const serial = work => { const next = queue.then(work); queue = next.catch(() => {}); return next; };
    function append(record, epoch = generation) { return serial(async () => {
      if (epoch !== generation || !storage?.set) return;
      const saved = (await storage.get(key))?.[key];
      if (epoch !== generation) return;
      const id = typeof record.id === 'string' ? record.id.slice(0, 128) : null;
      const runs = Array.isArray(saved) ? saved.filter(item => !id || item.id !== id).slice(-99) : [];
      const number = n => typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null;
      const fields = ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'reasoningTokens', 'uncachedInputTokens'];
      const usage = Object.fromEntries(fields.map(k => [k, number(record.usage?.[k])]));
      const costs = ['inputCost', 'outputCost', 'cacheReadCost', 'cacheWriteCost', 'totalCost'];
      runs.push({ id, at: Date.now(), status: ['completed', 'failed', 'cancelled'].includes(record.status) ? record.status : 'failed',
        mode: record.mode === 'round' ? 'round' : 'snapshot', lane: record.lane === 'live' ? 'live' : 'manual-review',
        elapsedMs: number(record.elapsedMs), calls: number(record.calls), usage,
        cost: { currency: typeof record.cost?.currency === 'string' ? record.cost.currency.slice(0, 12) : null, ...Object.fromEntries(costs.map(k => [k, number(record.cost?.[k])])) } });
      await storage.set({ [key]: runs });
    }); }
    function clear() { generation++; return serial(async () => { if (storage?.set) await storage.set({ [key]: [] }); }); }
    function list() { return serial(async () => {
      const saved = (await storage.get(key))?.[key];
      return (Array.isArray(saved) ? saved.slice(-100) : []).map(record => {
        const numeric = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
        const usage = Object.fromEntries(['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'reasoningTokens', 'uncachedInputTokens'].map(k => [k, numeric(record.usage?.[k])]));
        const cost = Object.fromEntries(['inputCost', 'outputCost', 'cacheReadCost', 'cacheWriteCost', 'totalCost'].map(k => [k, numeric(record.cost?.[k])]));
        return { at: numeric(record.at), status: ['completed', 'failed', 'cancelled'].includes(record.status) ? record.status : 'failed',
          mode: record.mode === 'round' ? 'round' : 'snapshot', lane: record.lane === 'live' ? 'live' : 'manual-review',
          elapsedMs: numeric(record.elapsedMs), calls: numeric(record.calls), usage,
          cost: { ...cost, currency: typeof record.cost?.currency === 'string' ? record.cost.currency.slice(0, 12) : null } };
      });
    }); }
    return { append, clear, list, epoch: () => generation };
  }
  const api = { create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MJRunStore = api;
})(globalThis);
