(function (root) {
  'use strict';
  function create({ storage, permissions, fetchModel, busy, runtime, readJson }) {
    const store = root.MJUserMemory.create({ storage });
    let active = null, pumping = false, requested = false;
    const cancel = () => active?.abort();
    async function pump() {
      if (pumping) { requested = true; return; }
      if (busy()) return;
      pumping = true;
      try {
        const { modelConfig: config } = await storage.get('modelConfig');
        if (busy() || !config?.enabled || config.provider === 'mjai') return;
        const url = root.MJModelEndpoint.endpoint(config.endpoint);
        if (!await permissions.contains({ origins: [root.MJModelEndpoint.permissionOrigin(url.href)] }) || busy()) return;
        const controller = new AbortController(); active = controller;
        const claimed = await store.claim();
        if (!claimed) return;
        let usage = root.MJModelUsage.normalizeUsage(null), status = 'failed', candidates = null, calls = 0;
        const started = Date.now();
        try {
          const result = await root.MJUserMemoryAgent.run({ match: claimed.match, runtime, signal: controller.signal,
            transport: async request => {
              if (busy() || controller.signal.aborted || calls) throw new Error('Memory request preempted');
              const { modelConfig: current } = await storage.get('modelConfig');
              if (controller.signal.aborted || busy() || JSON.stringify(current) !== JSON.stringify(config)) throw new Error('Memory configuration changed');
              calls++;
              const body = root.MJModelSessionTransport.body(request, config, { max_tokens: 2048,
                ...(root.MJModelEndpoint.supportsThinking(config.endpoint, config.model) ? { thinking: { type: 'disabled' } } : {}) });
              const response = await fetchModel(url.href, { method: 'POST', signal: request.signal, credentials: 'omit', redirect: 'error',
                headers: { 'Content-Type': 'application/json', ...(config.apiKey ? { Authorization: 'Bearer ' + config.apiKey } : {}) }, body: JSON.stringify(body) });
              if (!response.ok) throw new Error('Memory model HTTP failure');
              const data = await readJson(response, '记忆'); usage = root.MJModelUsage.normalizeUsage(data);
              if (controller.signal.aborted || !await permissions.contains({ origins: [root.MJModelEndpoint.permissionOrigin(url.href)] })) throw new Error('Memory permission changed');
              return { ...root.MJModelSessionTransport.result(data, false), usage: {
                input: usage.uncachedInputTokens ?? usage.inputTokens ?? 0, output: usage.outputTokens ?? 0,
                cacheRead: usage.uncachedInputTokens === null ? 0 : usage.cacheReadTokens ?? 0,
                cacheWrite: usage.cacheWriteTokens ?? 0,
                totalTokens: (usage.inputTokens || 0) + (usage.outputTokens || 0)
              } };
            } });
          candidates = result.candidates; status = 'completed';
        } catch (error) { if (controller.signal.aborted) status = 'cancelled'; else if (error.code === 'MEMORY_INPUT_BUDGET') status = 'budget-exceeded'; }
        await store.finish(claimed, candidates, { lane: 'memory', usage, cost: root.MJModelUsage.estimateCost(usage, config.pricing), calls, elapsedMs: Date.now() - started }, status);
      } catch (_) { /* No automatic retry of a potentially billed request. */ }
      finally {
        active = null; pumping = false;
        if (requested) { requested = false; Promise.resolve().then(pump); }
      }
    }
    return { store, pump, cancel };
  }
  root.MJUserMemoryWorker = { create };
})(globalThis);
