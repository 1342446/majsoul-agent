'use strict';
const Agent = require('../extension/agent.js');

function fixture(text) {
  return { format: 'mj-analysis-v1', playerCount: 4, source: 'replay', complete: true,
    phase: 'playing', selfSeat: 0, lastStep: 0, warnings: [],
    selfHand: text.match(/\d+[mpsz]/g).flatMap(group => [...group.slice(0, -1)].map(n => n + group.at(-1))),
    game: { round: { wind: 0, index: 0 }, honba: 0, sticks: 0, remaining: 50, doras: [],
      scores: [25000, 25000, 25000, 25000], recentActor: 0,
      players: Array.from({ length: 4 }, (_, seat) => ({ seat, riichi: false, norths: 0, melds: [] })) },
    rivers: Array.from({ length: 4 }, (_, seat) => ({ seat, discards: [] })) };
}
const cases = [
  { name: 'standard-east-wait', snapshot: fixture('123m123p123s111z2z'), expected: 0 },
  { name: 'seven-pairs-wait', snapshot: fixture('1122m3344p5566s7z'), expected: 0 },
  { name: 'thirteen-orphans-wait', snapshot: fixture('19m19p19s1234567z'), expected: 0 }
];
async function evaluate(inputs = cases) {
  const results = [];
  for (const item of inputs) {
    const run = await Agent.run({ snapshot: item.snapshot, task: 'efficiency', localOnly: true });
    const actual = run.localAnalysis.efficiency.shanten;
    results.push({ name: item.name, passed: actual === item.expected, expectedShanten: item.expected, actualShanten: actual });
  }
  return { format: 'majsoul-eval-v1', scope: 'synthetic local shanten regression; not model quality or playing strength',
    total: results.length, passed: results.filter(r => r.passed).length, results };
}
module.exports = { evaluate, fixture };
if (require.main === module) evaluate().then(result => {
  console.log(JSON.stringify(result, null, 2));
  if (result.passed !== result.total) process.exitCode = 1;
}).catch(() => { console.error('Evaluation failed'); process.exitCode = 1; });
