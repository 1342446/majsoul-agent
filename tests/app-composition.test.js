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
  const body = { children: [], appendChild(node) { this.children.push(node); }, querySelector(selector) { return this.children.find(node => selector === '[data-analysis-slot]' ? 'analysisSlot' in node.dataset : 'nagaSlot' in node.dataset); } };
  const draw = () => { renders++; floating.onRender(body, draw); };
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
  assert.equal(floating.id, 'mj-agent-host'); assert.equal(floating.title, 'Majsoul Agent');
  const view = mounted[1];
  assert.equal('players' in view, false); assert.equal('state' in view, false);
  assert.deepEqual(view.snapshot({ game: true }), { phase: 'waiting', selected: true });
  assert.equal(mounted[2].mode, 'live');
  view.onCollector(); view.onHistory(); assert.equal(opens.length, 2); assert.equal(opens[1].history, true);
  mounted[4].onHints({ hand: ['1m'] }); assert.equal(hints[0].hand[0], '1m');
  const before = renders; configured.controller.receive({ type: 'status', payload: { gameEvents: 1 } });
  assert.equal(renders, before + 1);
  assert.equal(body.children.length, 2); assert.equal(mounted[0], body.children[0]);
  assert.equal(naga.mode, 'live'); assert.equal(naga.recordCount, 0); assert.equal(naga.replayRevision, 0);
  // Full replay data is only pulled by an explicit export command, never by rendering.
  assert.equal(typeof naga.exportReplay, 'function');
  assert.equal(naga.exportReplay().format, 'mj-observer-v1');
  const liveHand = ['1m','2m','3m','4m','5m','6m','7m','8m','9m','1p','2p','3p','4p'];
  const replayHand = ['5p','6p','7p','1s','2s','3s','4s','5s','6s','7s','8s','9s','1z'];
  const round = { kind: 'NewRound', source: 'live', step: 0, wind: 0, round: 0, honba: 0, sticks: 0, remaining: 69, doras: ['1p'], scores: [25000,25000,25000,25000], hand: liveHand, operation: { seat: 1, types: [1] } };
  configured.controller.receive({ type: 'event', payload: round });
  configured.controller.receive({ type: 'replay', payload: { records: [
    { ...round, source: 'replay', hand: undefined, hands: [replayHand,replayHand,replayHand,replayHand] },
    { kind: 'DealTile', source: 'replay', step: 1, seat: 0, tile: '2z' }
  ] } });
  assert.equal(mounted[2].mode, 'replay'); assert.equal(mounted[1].recordCount, 2);
  mounted[1].onSelfSeat(0);
  assert.deepEqual(Array.from(mounted[1].selfHand), replayHand);
  mounted[1].onCursor(2); assert.equal(mounted[1].drawnTile, '2z');
  mounted[1].onCursor(1); assert.equal(mounted[1].selfHand.includes('2z'), false);
  mounted[1].onMode('live'); assert.equal(mounted[2].mode, 'live');
  assert.deepEqual(Array.from(mounted[1].selfHand), liveHand);
  configured.controller.receive({ type: 'event', payload: { kind: 'DealTile', source: 'live', step: 1, seat: 1, tile: '8p' } });
  mounted[1].onMode('replay'); assert.equal(mounted[2].cursor, 1);
  assert.deepEqual(Array.from(mounted[1].selfHand), replayHand);
  mounted[1].onMode('live'); assert.equal(mounted[1].drawnTile, '8p');
});
test('presentation module loads with no DOM and never mounts automatically', () => {
  const context = {}; vm.runInNewContext(read('overlay.js'), context);
  assert.equal(typeof context.MJCollectorPanel.create, 'function');
});
