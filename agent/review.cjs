'use strict';
const fs = require('node:fs');
const S = require('../extension/state.js');
const CollectorSnapshot = require('../extension/collector/snapshot-adapter.js');
const Agent = require('../extension/agent.js');

async function review(observation, { seat, cursor, hand = false, task = 'combined' } = {}) {
  if (observation?.format !== 'mj-observer-v1') throw new Error('Expected a collector export (mj-observer-v1)');
  let state, provenance;
  if (observation.historyView) {
    if (cursor !== undefined) throw new Error('History snapshots have no replay cursor');
    state = structuredClone(observation.state);
    if (!state || !['live', 'replay'].includes(state.source)) throw new Error('Invalid history snapshot');
    if (seat !== undefined) state = S.selectSelfSeat(state, seat);
    provenance = { mode: 'history', cursor: null, appliedEvents: null };
  } else if (observation.mode === 'replay') {
    const records = observation.replayRecords;
    if (!Array.isArray(records) || records.length > 25000) throw new Error('Invalid replay record count');
    const position = cursor ?? observation.replayCursor;
    if (!Number.isInteger(position) || position < 0 || position > records.length) throw new Error('Invalid replay cursor');
    const selfSeat = seat ?? observation.state?.selfSeat ?? null;
    if (selfSeat !== null && (!Number.isInteger(selfSeat) || selfSeat < 0 || selfSeat > 3)) throw new Error('Invalid seat');
    state = S.initial('replay', selfSeat);
    // Never apply events after the selected cursor or use the exported final state.
    for (const event of records.slice(0, position)) {
      if (event?.source !== 'replay' || typeof event.kind !== 'string') throw new Error('Invalid replay event');
      state = S.apply(state, event);
    }
    state = S.selectSelfSeat(state, selfSeat);
    provenance = { mode: 'replay', cursor: position, appliedEvents: position };
  } else if (observation.mode === 'live') {
    if (cursor !== undefined) throw new Error('Live exports have no replay cursor');
    state = structuredClone(observation.state);
    if (!state || state.source !== 'live') throw new Error('Invalid live snapshot');
    if (seat !== undefined) state = S.selectSelfSeat(state, seat);
    provenance = { mode: 'live', cursor: null, appliedEvents: null };
  } else throw new Error('Unknown collector source');
  const snapshot = CollectorSnapshot.snapshot(state, { game: true, rivers: 'all', hand });
  const result = await Agent.run({ snapshot, task, localOnly: true });
  return { format: 'majsoul-review-v1', provenance, ...result };
}

module.exports = { review };
if (require.main === module) {
  (async () => {
    const args = process.argv.slice(2);
    if (!args.length || args.includes('--help')) {
      console.log('Usage: npm run review -- export.json [--seat 0..3] [--cursor N] [--hand] [--task danger|efficiency|combined]');
      console.log('Offline local analysis only. --hand explicitly includes your own hand; no model request is made.');
      return;
    }
    const options = {}, file = args.shift();
    while (args.length) {
      const flag = args.shift();
      if (flag === '--hand') { options.hand = true; continue; }
      if (!['--seat', '--cursor', '--task'].includes(flag) || !args.length) throw new Error('Invalid command options');
      options[flag.slice(2)] = flag === '--task' ? args.shift() : Number(args.shift());
    }
    if (fs.statSync(file).size > 16 * 1024 * 1024) throw new Error('Export exceeds 16 MiB');
    const result = await review(JSON.parse(fs.readFileSync(file, 'utf8')), options);
    console.log(JSON.stringify(result, null, 2));
  })().catch(() => { console.error('Review failed: check export format, cursor, seat, hand data and task.'); process.exitCode = 1; });
}
