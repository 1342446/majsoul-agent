const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, writeFileSync, mkdirSync, rmSync, cpSync, readFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

test('architecture rules reject forbidden static and browser-global dependencies', async () => {
  const { checkSourceBoundary } = await import('../scripts/check-boundaries.mjs');
  const cases = [
    ['collector/controller.js', "require('../analysis.js')"],
    ['collector/core/new-module.js', 'globalThis.MJAgent.run({})'],
    ['collector/snapshot-adapter.js', 'root.MJHarness.run({})'],
    ['collector/browser-adapter.js', 'root.MJModelEndpoint.endpoint(url)'],
    ['collector/controller.js', "import { run } from '../agent.js';"],
    ['collector/controller.js', "export { run } from '../agent.js';"],
    ['collector/controller.js', "importScripts('../analysis.js')"],
    ['agent.js', "require('./state.js')"],
    ['agent.js', 'chrome.storage.local.get()'],
    ['agent.js', 'document.createElement("p")'],
    ['agent.js', "globalThis['chrome'].runtime"],
    ['agent.js', "const name = 'MJCollectorController'; globalThis[name]"],
    ['contracts/snapshot.js', 'root.MJMahjongAnalysis.analyze({})'],
    ['harness.js', 'root.MJSnapshotContract.cleanSnapshot({})'],
    ['harness.js', "fetch('https://example.com')"],
    ['overlay.js', 'root.MJAgent.run({})'],
    ['analysis-panel.js', "root['MJAgent'].run({})"],
    ['overlay.js', 'root.MJAnalysis.prepare({})'],
    ['overlay.js', 'root.MJHandHints.create()'],
    ['collector/controller.js', 'root.MJHandHints.create()'],
    ['collector/controller.js', 'root.MJNagaReplay.fromObservation({})'],
    ['collector/browser-adapter.js', 'root.MJNagaPanel.mount()'],
    ['overlay.js', 'root.MJNagaPanel.mount()'],
    ['adapters/naga-replay.js', 'document.createElement("a")'],
    ['adapters/naga-replay.js', 'fetch(url)'],
    ['adapters/naga-replay.js', 'root.MJCollectorController.create()'],
    ['hand-hints.js', 'root.MJAgent.run()'],
    ['hand-hints.js', 'root.MJCollectorController.create()'],
    ['floating-panel.js', 'root.MJAnalysisPanel.mount()'],
    ['collector/controller.js', 'root.MJUnknownFutureModule.run()'],
    ['collector/controller.js', 'require(path)'],
    ['collector/controller.js', 'importScripts(path)'],
    ['collector/controller.js', 'import(path)']
  ];
  for (const name of ['MJPiRuntime', 'MJRoundContext', 'MJModelUsage', 'MJModelSessionTransport', 'MJRunStore']) {
    cases.push(['collector/browser-adapter.js', `root.${name}.run()`]);
    cases.push(['overlay.js', `root.${name}.run()`]);
    cases.push(['agent.js', `root.${name}.run()`]);
  }
  for (const file of ['round-context.js', 'model-usage.js', 'model-session-transport.js', 'agent-run-store.js']) {
    cases.push([file, 'chrome.storage.local.get()']);
    cases.push([file, 'fetch(url)']);
    cases.push([file, 'root.MJPiRuntime.run()']);
  }
  for (const [file, source] of cases) assert.throws(() => checkSourceBoundary(file, source), undefined, `${file}: ${source}`);
});

test('Pi vendor bundle has a separate precise capability check', async () => {
  const { dependencies, checkPiBundle } = await import('../scripts/check-boundaries.mjs');
  const bundle = readFileSync(join(__dirname, '../extension/pi-runtime.js'), 'utf8');
  assert.deepEqual(dependencies('pi-runtime.js', bundle), []);
  for (const injected of ['fetch(url)', 'eval(code)', 'Function(code)', 'import(url)', 'chrome.runtime.sendMessage()', 'importScripts(url)']) {
    assert.throws(() => checkPiBundle(bundle + '\n' + injected), /forbidden|dynamic/);
  }
  assert.throws(() => dependencies('pi-runtime.js', 'var arbitrary = 1;'), /expected standalone/);
  assert.throws(() => dependencies('unregistered-vendor.js', 'root.MJUnknown.run()'), /undeclared project global/);
});

test('lexical rules ignore comment/string/regex text and scan template expressions', async () => {
  const { checkSourceBoundary, dependencies, workerImports } = await import('../scripts/check-boundaries.mjs');
  assert.deepEqual(checkSourceBoundary('harness.js', `// MJAgent.run(); document\n/* importScripts('agent.js') */\nconst text = 'MJAgent chrome'; const pattern = /MJAgent["']/; const t = \`MJAgent text\`;`), []);
  assert.throws(() => checkSourceBoundary('collector/controller.js', 'const text = `${root.MJAgent.run()}`'));
  assert.deepEqual(dependencies('agent.js', "import { prepare } from './analysis.js';"), ['analysis.js']);
  assert.deepEqual(dependencies('agent.js', "import('./analysis.js')"), ['analysis.js']);
  assert.deepEqual(workerImports("// importScripts('agent.js')\nimportScripts('history.js', 'history-storage.js');"), ['history.js', 'history-storage.js']);
});

test('profile validation rejects missing transitive resources and wrong script/worker order', async () => {
  const { validateProfile } = await import('../scripts/build-extensions.mjs');
  const temporary = mkdtempSync(join(tmpdir(), 'majsoul-closure-'));
  const manifest = { content_scripts: [{ js: ['history.js', 'history-storage.js'] }], web_accessible_resources: [] };
  try {
    writeFileSync(join(temporary, 'history.js'), 'globalThis.MJHistory = {};');
    writeFileSync(join(temporary, 'history-storage.js'), 'MJHistory.merge();');
    assert.deepEqual(validateProfile(temporary, manifest), ['history-storage.js', 'history.js']);
    assert.throws(() => validateProfile(temporary, { ...manifest, content_scripts: [{ js: ['history-storage.js', 'history.js'] }] }), /requires history.js before/);
    writeFileSync(join(temporary, 'worker.js'), "importScripts('history-storage.js', 'history.js');");
    assert.throws(() => validateProfile(temporary, { ...manifest, background: { service_worker: 'worker.js' } }), /worker dependency history.js/);
    writeFileSync(join(temporary, 'worker.js'), "importScripts('history.js', 'history-storage.js');");
    assert.ok(validateProfile(temporary, { ...manifest, background: { service_worker: 'worker.js' } }).includes('worker.js'));
    writeFileSync(join(temporary, 'history.js'), "require('./missing.js'); globalThis.MJHistory = {};");
    assert.throws(() => validateProfile(temporary, manifest), /Missing resource: missing.js/);
    assert.throws(() => validateProfile(temporary, { content_scripts: [{ js: ['../outside.js'] }] }), /Unsafe extension resource/);
  } finally { rmSync(temporary, { recursive: true, force: true }); }
});

test('source check enforces explicit default Agent profile equality', async () => {
  const { checkProfiles } = await import('../scripts/build-extensions.mjs');
  const temporary = mkdtempSync(join(tmpdir(), 'majsoul-profile-drift-'));
  try {
    mkdirSync(join(temporary, 'profiles'));
    for (const name of ['agent', 'collector']) cpSync(join(__dirname, '../extension/profiles', name + '.json'), join(temporary, 'profiles', name + '.json'));
    const manifest = JSON.parse(readFileSync(join(temporary, 'profiles/agent.json'), 'utf8'));
    manifest.permissions.push('tabs');
    writeFileSync(join(temporary, 'manifest.json'), JSON.stringify(manifest));
    assert.throws(() => checkProfiles(temporary), /Default manifest differs/);
  } finally { rmSync(temporary, { recursive: true, force: true }); }
});

test('collector profile closure rejects an explicitly exposed Pi bundle', async () => {
  const { checkProfiles } = await import('../scripts/build-extensions.mjs');
  const temporary = mkdtempSync(join(tmpdir(), 'majsoul-collector-pi-'));
  try {
    cpSync(join(__dirname, '../extension'), temporary, { recursive: true });
    const path = join(temporary, 'profiles/collector.json');
    const manifest = JSON.parse(readFileSync(path, 'utf8'));
    manifest.web_accessible_resources = [...(manifest.web_accessible_resources || []), { resources: ['pi-runtime.js'], matches: ['https://game.maj-soul.com/*'] }];
    writeFileSync(path, JSON.stringify(manifest));
    assert.throws(() => checkProfiles(temporary), /Collector dependency closure contains analysis\/model files/);
  } finally { rmSync(temporary, { recursive: true, force: true }); }
});
