'use strict';
const readline = require('node:readline');
const mode = process.argv[2] || 'ok';
readline.createInterface({ input: process.stdin }).once('line', line => {
  const events = JSON.parse(line);
  if (mode === 'hang') { setInterval(() => {}, 1000); return; }
  if (mode === 'exit') { process.stderr.write('SECRET_TOKEN'); process.exit(3); }
  if (mode === 'bad') { console.log('SECRET_TOKEN'); return; }
  if (mode === 'large') { console.log('x'.repeat(100000)); return; }
  if (mode === 'stderr') { process.stderr.write('SECRET_TOKEN'.repeat(10000)); setInterval(() => {}, 1000); return; }
  if (mode === 'partial') { process.stdout.write('{"type":"none"}'); return; }
  console.log(JSON.stringify({ type: 'dahai', actor: events[0].id, pai: events.at(-1).pai, tsumogiri: true }));
  setInterval(() => {}, 1000);
});
