const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const S = require('../extension/state.js'), H = require('../extension/history.js');
const C = require('../extension/collector/controller.js');
const B = require('../extension/collector/browser-adapter.js');
const read = path => fs.readFileSync(require.resolve('../extension/' + path), 'utf8');
function surface() {
  const handlers = new Map(), sent = [];
  const window = { location: { origin: 'https://game.maj-soul.com', href: 'https://game.maj-soul.com/' },
    localStorage: { getItem: () => null, setItem() {} },
    addEventListener: (type, fn) => handlers.set(type, fn), removeEventListener: type => handlers.delete(type),
    postMessage: message => sent.push(message) };
  return { window, handlers, sent };
}
test('browser boundary validates source/origin/envelope, deduplicates, handshakes and releases listener', async () => {
  const { window, handlers, sent } = surface();
  const ports = B.create({ window }); const c = C.create({ state: S, history: H, storage: ports.storage });
  const disconnect = ports.connect(c);
  assert.equal(sent[0].type, 'hello');
  const message = { channel: 'mj-observer-v1', epoch: 'test', sequence: 1, type: 'status', payload: { incoming: 7 } };
  const emit = (more = {}, data = message) => handlers.get('message')({ source: window, origin: window.location.origin, data, ...more });
  emit({ source: {} }); emit({ origin: 'https://evil.example' });
  emit({}, { ...message, sequence: '1' }); assert.equal(c.getView().stats.incoming, undefined);
  emit(); assert.equal(c.getView().stats.incoming, 7);
  emit({}, { ...message, payload: { incoming: 99 } }); assert.equal(c.getView().stats.incoming, 7);
  disconnect(); assert.equal(handlers.has('message'), false); await c.ready;
});
test('collector composition mounts without loading any model capability', () => {
  const { window } = surface(); let mounted = 0, configured;
  const context = { window, URL, __MJ_OBSERVER_STATE_V1__: S, MJHistory: H, MJCollectorController: C,
    MJCollectorBrowser: B, document: { documentElement: {}, currentScript: { src: 'https://example.test/extension/apps/collector-app.js' }, getElementById: () => null },
    MJCollectorPanel: { create(options) { configured = options; return { mount() { mounted++; }, destroy() {} }; } } };
  vm.runInNewContext(read('collector/controller.js'), context);
  vm.runInNewContext(read('collector/browser-adapter.js'), context);
  vm.runInNewContext(read('apps/collector-app.js'), context);
  assert.equal(mounted, 1); assert.equal(configured.title, '雀魂牌局获取器');
  assert.equal(configured.extensionSlot, undefined); assert.equal(configured.controller.getView().mode, 'live');
});
test('agent composition keeps collection, floating analysis and hand hints on independent surfaces', () => {
  const { window } = surface(); let configured, floating, mounted, opens = [], hints = [], renders = 0;
  let naga;
  const draw = () => { renders++; floating.onRender({ appendChild() {} }, draw); };
  const context = { window, URL, __MJ_OBSERVER_STATE_V1__: S, MJHistory: H, MJCollectorController: C,
    MJCollectorBrowser: B, document: { documentElement: {}, currentScript: { src: 'https://example.test/extension/apps/agent-app.js' }, getElementById: () => null, createElement: () => ({ dataset: {} }) },
    MJCollectorPanel: { create(options) { configured = options; return { mount() {}, open(value) { opens.push(value); }, destroy() {} }; } },
    MJFloatingPanel: { create(options) { floating = options; return { mount: draw, render: draw, destroy() {} }; } },
    MJHandHints: { create() { return { update(value) { hints.push(value); }, getCalibrationState: () => ({ available: true, calibrated: false }), startCalibration() {}, destroy() {} }; } },
    MJCollectorSnapshot: { snapshot(state, selection) { return { phase: state.phase, selected: selection.game }; } },
    MJAnalysisPanel: { mount(...args) { mounted = args; } },
    MJNagaPanel: { mount(container, options) { naga = options; } } };
  vm.runInNewContext(read('collector/controller.js'), context);
  vm.runInNewContext(read('collector/browser-adapter.js'), context);
  vm.runInNewContext(read('apps/agent-app.js'), context);
  assert.equal(configured.extensionSlot, undefined); assert.equal(configured.collapsed, true);
  assert.equal(floating.id, 'mj-agent-host'); assert.equal(floating.title, 'Majsoul AI Analysis & Review Agent');
  const view = mounted[1];
  assert.equal('players' in view, false); assert.equal('state' in view, false);
  assert.deepEqual(view.snapshot({ game: true }), { phase: 'waiting', selected: true });
  assert.equal(mounted[2].mode, 'live');
  view.onCollector(); view.onHistory(); assert.equal(opens.length, 2); assert.equal(opens[1].history, true);
  mounted[4].onHints({ hand: ['1m'] }); assert.equal(hints[0].hand[0], '1m');
  const before = renders; configured.controller.receive({ type: 'status', payload: { gameEvents: 1 } });
  assert.equal(renders, before + 1);
  assert.equal(naga.mode, 'live'); assert.equal(naga.recordCount, 0); assert.equal(naga.replayRevision, 0);
  // Full replay data is only pulled by an explicit export command, never by rendering.
  assert.equal(typeof naga.exportReplay, 'function');
  assert.equal(naga.exportReplay().format, 'mj-observer-v1');
});
test('presentation module loads with no DOM and never mounts automatically', () => {
  const context = {}; vm.runInNewContext(read('overlay.js'), context);
  assert.equal(typeof context.MJCollectorPanel.create, 'function');
});
