const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const A = require('../extension/analysis.js');
const S = require('../extension/state.js');
const C = require('../extension/collector/snapshot-adapter.js');
const Contract = require('../extension/contracts/snapshot.js');
const flush = () => new Promise(resolve => setImmediate(resolve));
function panel() {
  let mount, configChanged, resolveAnalysis; const messages = [], elements = new Map();
  const container = { innerHTML: '', querySelector(id) { if (!elements.has(id)) elements.set(id, {}); return elements.get(id); } };
  const state = S.initial('live', 1); Object.assign(state, { round: { wind: 0, index: 0 }, scores: [25000,25000,25000,25000], phase: 'playing', selfHand: ['1m','2m','3m','4m','5m','6m','7m','8m','9m','1s','2s','3s','4z','4z'] });
  const context = { MJAnalysis: A, MJSnapshotContract: Contract, URL, setTimeout,
    document: { currentScript: { src: 'https://fixture/extension/analysis-panel.js' } }, location: { href: 'https://fixture/tests/preview.html' }, window: { addEventListener() {}, removeEventListener() {} },
    chrome: { runtime: { id: 'fixture', getURL: p => 'chrome-extension://fixture/' + p, sendMessage: async m => {
      messages.push(m); if (m.type === 'model:status') return { enabled: true };
      if (m.type === 'model:prepare') return { ok: true, data: A.prepare(m.snapshot, m.task).data };
      if (m.type === 'model:analyze') return new Promise(resolve => { resolveAnalysis = resolve; }); return { ok: true };
    } }, storage: { onChanged: { addListener: fn => { configChanged = fn; }, removeListener() {} } } } };
  vm.runInNewContext(fs.readFileSync(require.resolve('../extension/analysis-panel.js'), 'utf8'), context);
  const render = () => context.MJAnalysisPanel.mount(container, { snapshot: selection => C.snapshot(state, selection), seatLabels: state.players.map((_, seat) => S.seatWind(state, seat) + '家 · 座位 ' + seat), phase: state.phase, round: state.round }, { mode: 'live' }, render);
  render();
  return { render, state, messages, destroy: () => context.MJAnalysisPanel.destroy(), element: id => elements.get('#' + id), html: () => container.innerHTML, configChanged: () => configChanged({ modelConfig: {} }, 'local'), resolve: value => resolveAnalysis(value) };
}
test('panel previews task-specific data and escapes model text while rendering tile cards and local table', async () => {
  const p = panel(); await flush(); p.element('model-hand').onchange({ target: { checked: true } });
  p.element('model-task').onchange({ target: { value: 'efficiency' } }); p.element('model-preview').onclick(); await flush();
  assert.match(p.html(), /mj-analysis-v2/); assert.doesNotMatch(p.html(), /tsumogiri/);
  const pending = p.element('model-run').onclick({ isTrusted: true }); await flush();
  const req = p.messages.find(m => m.type === 'model:analyze'), prep = A.prepare(req.snapshot, req.task);
  p.resolve({ ok: true, model: '<mock>', localAnalysis: prep.data.localAnalysis, result: { task: 'efficiency', danger: [], efficiency: [{ tile: '1m', reasons: ['<img onerror=bad>'] }], decision: { action: 'attack', tile: '1m', reasons: ['测试'] }, limitations: [] } });
  await pending; assert.match(p.html(), /<table>/); assert.match(p.html(), /1m\.svg/); assert.match(p.html(), /&lt;img onerror=bad&gt;/); assert.doesNotMatch(p.html(), /<img onerror/);
  p.state.lastStep++; p.render(); assert.match(p.html(), /旧结果/);
});
test('panel cancellation discards delayed model results and synthetic clicks send no request', async () => {
  const p = panel(); await flush(); await p.element('model-run').onclick({ isTrusted: false });
  assert.equal(p.messages.some(m => m.type === 'model:analyze'), false);
  const pending = p.element('model-run').onclick({ isTrusted: true }); await flush();
  p.element('model-cancel').onclick();
  p.resolve({ ok: true, model: 'late', result: { danger: [], efficiency: [], decision: { action: 'unknown', tile: null, reasons: ['late-result'] }, limitations: [] } });
  await pending; assert.doesNotMatch(p.html(), /late-result/); assert.match(p.html(), /已取消分析/);
});

test('task and configuration changes invalidate pending results rather than refilling the panel', async () => {
  for (const change of [p => p.element('model-task').onchange({ target: { value: 'danger' } }), p => p.configChanged()]) {
    const p = panel(); await flush(); const pending = p.element('model-run').onclick({ isTrusted: true }); await flush();
    change(p); p.resolve({ ok: true, model: 'late', result: { danger: [], efficiency: [], decision: { action: 'unknown', tile: null, reasons: ['late-old-task'] }, limitations: [] } });
    await pending; assert.doesNotMatch(p.html(), /late-old-task/); assert.equal(p.messages.some(m => m.type === 'model:cancel'), true);
  }
});

test('destroy cancels pending work and remount reloads configuration with default authorization', async () => {
  const p = panel(); await flush();
  p.element('model-hand').onchange({ target: { checked: true } });
  const pending = p.element('model-run').onclick({ isTrusted: true }); await flush();
  p.destroy();
  const oldHtml = p.html(), statusCalls = p.messages.filter(m => m.type === 'model:status').length;
  p.resolve({ ok: true, model: 'late', result: { danger: [], efficiency: [], decision: { action: 'unknown', tile: null, reasons: ['destroyed-result'] }, limitations: [] } });
  await pending; assert.equal(p.html(), oldHtml);
  assert.equal(p.messages.some(m => m.type === 'model:cancel'), true);
  p.render(); await flush();
  assert.equal(p.messages.filter(m => m.type === 'model:status').length, statusCalls + 1);
  assert.doesNotMatch(p.html(), /destroyed-result/);
  assert.match(p.html(), /未发送自家手牌/);
  assert.doesNotMatch(p.html(), /正在分析/);
});
