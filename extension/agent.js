/* Analysis Agent: task planning and tool wiring; transport stays outside the agent. */
(function (root) {
  'use strict';
  const A = typeof module !== 'undefined' && module.exports ? require('./analysis.js') : root.MJAnalysis;
  const H = typeof module !== 'undefined' && module.exports ? require('./harness.js') : root.MJHarness;
  async function run({ snapshot, task = 'combined', explain, localOnly = false, signal, timeoutMs, onEvent }) {
    task = A.normalizeTask(task);
    if (!localOnly && typeof explain !== 'function') throw new Error('A model transport is required');
    // Freeze the input in time before any asynchronous tool can run.
    const input = A.cleanSnapshot(snapshot);
    const steps = ['snapshot.validate', 'analysis.prepare'];
    if (!localOnly) steps.push('model.explain', 'result.validate');
    const tools = {
      'snapshot.validate': value => A.cleanSnapshot(value),
      'analysis.prepare': value => A.prepare(value, task),
      'model.explain': async (prepared, context) => ({ prepared, content: await explain(prepared, context) }),
      'result.validate': ({ prepared, content }) => ({ result: A.parseResult(content, prepared), prepared })
    };
    const { output, trace } = await H.run({ steps, tools, input, signal, timeoutMs, onEvent });
    const prepared = localOnly ? output : output.prepared;
    return { task, result: localOnly ? null : output.result, localAnalysis: prepared.data.localAnalysis, trace };
  }
  const api = { run };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MJAgent = api;
})(globalThis);
