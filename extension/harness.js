/* Bounded workflow runner. Traces contain tool metadata, never payloads or credentials. */
(function (root) {
  'use strict';
  async function run({ steps, tools, input, signal, maxSteps = 6, timeoutMs = 25000, onEvent }) {
    if (!Array.isArray(steps) || !steps.length || steps.length > maxSteps || maxSteps > 16 ||
        !Number.isInteger(maxSteps) || !Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 120000) {
      throw new Error('Invalid harness execution budget');
    }
    for (const name of steps) {
      if (typeof name !== 'string' || !/^[a-z]+\.[a-z]+$/.test(name) ||
          !Object.hasOwn(tools, name) || typeof tools[name] !== 'function') throw new Error('Tool is not registered');
    }
    const controller = new AbortController(), trace = [];
    const abort = () => controller.abort();
    if (signal?.aborted) abort();
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, timeoutMs), started = Date.now();
    const emit = (tool, status) => {
      const event = { step: trace.length + 1, tool, status, elapsedMs: Date.now() - started };
      trace.push(event);
      // Observers cannot interrupt tool execution or change the trace.
      try { onEvent?.({ ...event }); } catch (_) {}
    };
    const check = () => { if (controller.signal.aborted) { const e = new Error('Run cancelled or timed out'); e.name = 'AbortError'; throw e; } };
    let value = input;
    try {
      for (const name of steps) {
        check(); emit(name, 'started');
        let cancel;
        try {
          const interrupted = new Promise((_, reject) => {
            cancel = () => { const e = new Error('Run cancelled or timed out'); e.name = 'AbortError'; reject(e); };
            controller.signal.addEventListener('abort', cancel, { once: true });
          });
          const operation = Promise.resolve().then(() => { check(); return tools[name](value, { signal: controller.signal }); });
          value = await Promise.race([operation, interrupted]);
          check(); emit(name, 'completed');
        } catch (error) {
          emit(name, controller.signal.aborted ? 'cancelled' : 'failed');
          throw error;
        } finally { controller.signal.removeEventListener('abort', cancel); }
      }
      return { output: value, trace: { format: 'majsoul-run-v1', status: 'completed', events: trace } };
    } catch (error) {
      // No tool arguments, model content or error text enter the trace.
      error.runTrace = { format: 'majsoul-run-v1', status: controller.signal.aborted ? 'cancelled' : 'failed', events: trace };
      throw error;
    } finally {
      clearTimeout(timer); signal?.removeEventListener('abort', abort);
      controller.abort();
    }
  }
  const api = { run };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MJHarness = api;
})(globalThis);
