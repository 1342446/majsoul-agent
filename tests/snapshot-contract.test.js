const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const C = require('../extension/contracts/snapshot.js');
const Agent = require('../extension/agent.js');

test('turn progress validates every seat, strips extras and copies independently', () => {
  const raw = { status: 'known', source: 'events', bySeat: [1,7,3], secret: 'PRIVATE' };
  const clean = C.cleanTurnProgress(raw, 3);
  assert.deepEqual(clean, { status: 'known', source: 'events', bySeat: [1,7,3], reason: null });
  raw.bySeat[0] = 8; assert.equal(clean.bySeat[0], 1);
  for (const invalid of [undefined, { ...raw, status: 'unknown' }, { ...raw, bySeat: [1,2] },
    { ...raw, bySeat: [1,0,2] }, { ...raw, bySeat: [1,2,146] }, { ...raw, source: 'guess' }]) {
    assert.deepEqual(C.cleanTurnProgress(invalid, 3).bySeat, [null,null,null]);
  }
  const snapshot = foreignSnapshot(); snapshot.turnProgress = raw;
  assert.equal('turnProgress' in C.cleanSnapshot(snapshot), false);
});

// An unrelated collector needs only this public DTO; no observer state or replay events.
function foreignSnapshot() {
  return { format: 'mj-analysis-v1', playerCount: 3, source: 'foreign-collector',
    phase: 'playing', selfSeat: null, warnings: [],
    rivers: [{ seat: 2, discards: [{ tile: '0p', tsumogiri: null, riichi: false, called: false }] }] };
}

test('a foreign collector DTO drives the agent without any observer modules', async () => {
  const context = { setTimeout, clearTimeout, AbortController, performance };
  for (const file of ['contracts/snapshot.js', 'mahjong-analysis.js', 'analysis.js', 'harness.js', 'agent.js']) {
    vm.runInNewContext(fs.readFileSync(require.resolve('../extension/' + file), 'utf8'), context);
  }
  const output = await context.MJAgent.run({ snapshot: foreignSnapshot(), task: 'danger', localOnly: true });
  assert.equal(output.task, 'danger');
  assert.equal(output.result, null);
  assert.equal(context.MJCollectorSnapshot, undefined);
  assert.equal(context.__MJ_OBSERVER_STATE_V1__, undefined);
  assert.equal(output.trace.status, 'completed');
});

test('contract preserves selected scopes and unknown discard flags while stripping unknown data', async () => {
  const raw = foreignSnapshot();
  raw.players = [{ hand: ['SECRET'] }]; raw.apiKey = 'PRIVATE';
  raw.selfDrawnTile = '9s'; raw.collectorMetadata = { hiddenHands: ['HIDDEN'] };
  const clean = C.cleanSnapshot(raw);
  assert.equal(clean.source, 'unknown');
  assert.equal(clean.rivers[0].discards[0].tsumogiri, null);
  assert.equal('game' in clean, false);
  assert.equal('selfHand' in clean, false);
  assert.equal('selfDrawnTile' in clean, false);
  let transported;
  await Agent.run({ snapshot: raw, task: 'danger', explain: async prepared => {
    transported = JSON.stringify(prepared);
    assert.equal('selfDrawnTile' in prepared.data.danger, false);
    assert.equal('selfHand' in prepared.data.danger, false);
    return { task: 'danger', danger: [], efficiency: [], decision: { action: 'unknown', tile: null, reasons: ['仅分析已授权牌河'] }, limitations: [] };
  } });
  assert.doesNotMatch(transported, /SECRET|PRIVATE|HIDDEN/);
  assert.deepEqual(raw.players, [{ hand: ['SECRET'] }]);
});

test('tile normalization and whitelist copies cannot smuggle objects or mutable data', () => {
  assert.equal(C.tile({ toString: () => '1m', hidden: 'PRIVATE' }), '?');
  const raw = foreignSnapshot(), clean = C.cleanSnapshot(raw);
  raw.rivers[0].discards[0].tile = '9m';
  assert.equal(clean.rivers[0].discards[0].tile, '0p');
  assert.equal(C.label('0p'), '赤5筒');
  assert.equal(C.label('?'), '未知');
});
