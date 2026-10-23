'use strict';
const fs = require('node:fs');
const Mjai = require('../extension/adapters/mjai.js');
const State = require('../extension/state.js');
const CollectorSnapshot = require('../extension/collector/snapshot-adapter.js');
const EngineAgent = require('../extension/engine-agent.js');
const { createRunner } = require('./mjai-process.cjs');

async function review(observation, { seat, cursor, hand = false, config, runner, signal, timeoutMs, onEvent } = {}) {
  const request = Mjai.fromObservation(observation, { seat, cursor, hand });
  let state;
  if (observation.mode === 'replay') {
    const end = cursor === undefined ? observation.replayCursor : cursor;
    // Only reconstruct the currently visible round. Exported state may reflect a
    // different cursor and replayRecords may contain unrevealed future actions.
    let start = end - 1;
    while (start >= 0 && observation.replayRecords[start].kind !== 'NewRound') start--;
    state = State.initial('replay', request.seat);
    for (let i = start; i < end; i++) state = State.apply(state, observation.replayRecords[i]);
  } else {
    state = observation.state;
    if (state?.source !== 'live') throw new Error('实时导出缺少对应局面。');
  }
  const snapshot = CollectorSnapshot.snapshot(state, { game: true, rivers: 'all', hand: true });
  const output = await EngineAgent.run({ snapshot, request,
    infer: (payload, context) => (runner || createRunner(config)).infer(payload, context),
    signal, timeoutMs, onEvent });
  return { format: 'majsoul-engine-review-v1', seat: request.seat,
    engine: output.engine, result: output.result, localAnalysis: output.localAnalysis, trace: output.trace };
}

module.exports = { review };
if (require.main === module) {
  (async () => {
    const args = process.argv.slice(2);
    if (!args.length || args.includes('--help')) { console.log('Usage: npm run engine:review -- export.json --config runtime.json [--seat 0..3] [--cursor N] [--hand]'); return; }
    const file = args.shift(), options = {};
    while (args.length) {
      const flag = args.shift();
      if (flag === '--hand') { options.hand = true; continue; }
      if (!['--seat', '--cursor', '--config'].includes(flag) || !args.length) throw new Error();
      const value = args.shift(); options[flag.slice(2)] = flag === '--config' ? value : Number(value);
    }
    if (!options.config || fs.statSync(options.config).size > 65536 || fs.statSync(file).size > 16 * 1024 * 1024) throw new Error();
    options.config = JSON.parse(fs.readFileSync(options.config, 'utf8'));
    console.log(JSON.stringify(await review(JSON.parse(fs.readFileSync(file, 'utf8')), options), null, 2));
  })().catch(() => { console.error('Engine review failed: check export, seat, cursor, hand and runtime configuration.'); process.exitCode = 1; });
}
