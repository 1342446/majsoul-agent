const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const A = require('../extension/analysis.js');
const S = require('../extension/state.js');
const C = require('../extension/collector/snapshot-adapter.js');
const Contract = require('../extension/contracts/snapshot.js');
const flush = () => new Promise(resolve => setImmediate(resolve));
function panel(options = {}) {
  let mount, configChanged, resolveAnalysis; const messages = [], elements = new Map(), hints = [], details = [{ dataset: { section: 'controls' }, open: false }], section = { scrollTop: 0 };
  const position = { mode: 'live' }; let collectorCalls = 0, historyCalls = 0, calibrateCalls = 0;
  const container = { innerHTML: '', querySelectorAll() { return details; }, querySelector(id) { if (id === '.analysis') return section; if (!elements.has(id)) elements.set(id, {}); return elements.get(id); } };
  const state = S.initial('live', 1); Object.assign(state, { round: { wind: 0, index: 0 }, scores: [25000,25000,25000,25000], phase: 'playing', selfHand: ['1m','2m','3m','4m','5m','6m','7m','8m','9m','1s','2s','3s','4z','4z'] });
  const context = { MJAnalysis: A, MJSnapshotContract: Contract, URL, setTimeout,
    document: { currentScript: { src: 'https://fixture/extension/analysis-panel.js' } }, location: { href: 'https://fixture/tests/preview.html' }, window: { addEventListener() {}, removeEventListener() {} },
    chrome: { runtime: { id: 'fixture', getURL: p => 'chrome-extension://fixture/' + p, sendMessage: async m => {
      messages.push(m); if (m.type === 'model:status') return { enabled: true };
      if (m.type === 'model:prepare') return { ok: true, data: A.prepare(m.snapshot, m.task).data };
      if (m.type === 'model:analyze') return new Promise(resolve => { resolveAnalysis = resolve; }); return { ok: true };
    } }, storage: { onChanged: { addListener: fn => { configChanged = fn; }, removeListener() {} } } } };
  if (options.offline) delete context.chrome;
  vm.runInNewContext(fs.readFileSync(require.resolve('../extension/analysis-panel.js'), 'utf8'), context);
  const render = () => context.MJAnalysisPanel.mount(container, { snapshot: selection => C.snapshot(state, selection), seatLabels: state.players.map((_, seat) => S.seatWind(state, seat) + '家 · 座位 ' + seat), phase: state.phase, round: state.round, selfSeat: state.selfSeat, hintsReady: options.hintsReady !== false, hintsCalibrated: !!options.hintsCalibrated, selfHand: state.selfHand, drawnTile: state.drawnTiles[state.selfSeat], riichiLabels: options.riichiLabels || [], onCollector: () => collectorCalls++, onHistory: () => historyCalls++, onCalibrateHints: () => calibrateCalls++ }, position, render, { onHints: value => hints.push(value) });
  render();
  return { render, state, messages, hints, position, details, section, calls: () => [collectorCalls, historyCalls, calibrateCalls], destroy: () => context.MJAnalysisPanel.destroy(), element: id => elements.get('#' + id), html: () => container.innerHTML, configChanged: () => configChanged({ modelConfig: {} }, 'local'), resolve: value => resolveAnalysis(value) };
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


const modelResult = () => ({ ok: true, model: 'fixture', result: { danger: [{ tile: '1m', opponents: [{ seat: 2, level: 'high', reasons: ['警戒'] }] }], efficiency: [{ tile: '2m', reasons: ['候选'] }], decision: { action: 'attack', tile: '1m', reasons: ['测试结论'] }, limitations: ['仅供参考'] } });

test('hints only describe the matching live hand and never alter sending authorization', async () => {
  const p = panel(); await flush();
  assert.equal(p.hints.at(-1), null);
  const pending = p.element('model-run').onclick({ isTrusted: true }); await flush();
  assert.equal(p.messages.find(m => m.type === 'model:analyze').snapshot.selfHand, undefined);
  p.resolve(modelResult()); await pending;
  const value = p.hints.at(-1);
  assert.deepEqual(Array.from(value.hand), p.state.selfHand);
  assert.notEqual(value.hand, p.state.selfHand);
  assert.equal(value.decision.tile, '1m');
  p.position.mode = 'history'; p.render(); assert.equal(p.hints.at(-1), null);
  p.position.mode = 'live'; p.render(); assert.ok(p.hints.at(-1));
  p.state.selfHand[0] = '9s'; p.render(); assert.equal(p.hints.at(-1), null);
  assert.match(p.html(), /旧结果/);
  p.destroy(); assert.equal(p.hints.at(-1), null);
});

test('scope and task changes retain clearly stale output while clearing hints', async () => {
  const p = panel(); await flush();
  const pending = p.element('model-run').onclick({ isTrusted: true }); await flush(); p.resolve(modelResult()); await pending;
  p.element('model-rivers').onchange({ target: { value: 'none' } });
  assert.match(p.html(), /旧结果/); assert.match(p.html(), /测试结论/); assert.equal(p.hints.at(-1), null);
  p.element('model-task').onchange({ target: { value: 'danger' } });
  assert.match(p.html(), /旧结果/); assert.match(p.html(), /测试结论/); assert.equal(p.hints.at(-1), null);
});

test('disclosures and scroll persist and utility entry points call supplied callbacks', async () => {
  const p = panel({ riichiLabels: ['南家', '<西家>'] }); await flush();
  p.details[0].open = true; p.details[0].ontoggle(); p.section.scrollTop = 128;
  p.state.lastStep++; p.render();
  assert.equal(p.details[0].open, true); assert.equal(p.section.scrollTop, 128);
  assert.match(p.html(), /data-section="controls" open/);
  assert.match(p.html(), /立直警戒 · 南家 · &lt;西家&gt;/);
  for (const id of ['analysis-collector', 'analysis-history', 'analysis-calibrate']) p.element(id).onclick();
  assert.deepEqual(p.calls(), [1, 1, 1]);
  assert.equal(p.messages.some(m => m.type === 'model:analyze'), false);
});


test('styles resolve inside the panel for extension and offline shadow roots', async () => {
  const extension = panel(); await flush();
  assert.match(extension.html(), /<link rel="stylesheet" href="chrome-extension:\/\/fixture\/analysis-panel.css">/);
  const offline = panel({ offline: true });
  assert.match(offline.html(), /<link rel="stylesheet" href="https:\/\/fixture\/extension\/analysis-panel.css">/);
  await offline.element('model-run').onclick({ isTrusted: true });
  assert.equal(offline.messages.length, 0);
});


test('round and seat identify the hand, drawn tile separates and current results annotate tile kinds', async () => {
  const p = panel(); await flush();
  p.state.drawnTiles[p.state.selfSeat] = '4z'; p.render();
  assert.match(p.html(), /东1局 · 自家/);
  assert.match(p.html(), /class="analysis-hand-drawn"/);
  assert.match(p.html(), /--hand-count:14;--concealed-count:13/);
  const pending = p.element('model-run').onclick({ isTrusted: true }); await flush(); p.resolve(modelResult()); await pending;
  assert.match(p.html(), /aria-label="[^"<>]*建议[^"<>]*高危"/);
  p.state.lastStep++; p.render();
  assert.doesNotMatch(p.html(), /class="analysis-hand-tile is-/);
  assert.match(p.html(), /旧结果/);
});

test('waiting snapshot errors stay in settings and calibration only runs with a game canvas', async () => {
  const p = panel({ hintsReady: false, hintsCalibrated: true }); await flush();
  p.state.round = null; p.render();
  const main = p.html().split('<div class="analysis-main"')[1].split('<div class="analysis-actions"')[0];
  assert.match(main, /等待开局数据/);
  assert.doesNotMatch(main, /请先等待开局数据/);
  assert.match(p.html(), /id="analysis-calibrate" disabled>重新校准手牌提示/);
  assert.match(p.html(), /进入游戏牌桌后可校准手牌提示/);
  p.element('analysis-calibrate').onclick(); assert.deepEqual(p.calls(), [0, 0, 0]);
  const styles = fs.readFileSync(require.resolve('../extension/analysis-panel.css'), 'utf8');
  assert.match(styles, /grid-template-columns:repeat\(var\(--concealed-count\),minmax\(0,1fr\)\)/);
  assert.doesNotMatch(styles, /analysis-hand[^}]*flex-wrap:wrap/);
});


test('suggested tiles distinguish red fives while danger applies to their shared tile kind', async () => {
  const p = panel(); await flush();
  p.state.selfHand = ['0m', '5m']; p.render();
  const pending = p.element('model-run').onclick({ isTrusted: true }); await flush();
  const response = modelResult(); response.result.decision.tile = '5m'; response.result.danger[0].tile = '5m';
  p.resolve(response); await pending;
  const red = p.html().match(/<span class="analysis-hand-tile[^>]*aria-label="[^"]*"[^>]*><img[^>]*src="[^"]*0m\.svg"/)[0];
  const normal = p.html().match(/<span class="analysis-hand-tile[^>]*aria-label="[^"]*"[^>]*><img[^>]*src="[^"]*5m\.svg"/)[0];
  assert.match(red, /is-dangerous/); assert.doesNotMatch(red, /is-suggested|建议/);
  assert.match(normal, /is-suggested is-dangerous/); assert.match(normal, /建议/);
  const styles = fs.readFileSync(require.resolve('../extension/analysis-panel.css'), 'utf8');
  const rootRule = styles.match(/\.analysis\{[^}]*\}/)[0];
  assert.doesNotMatch(rootRule, /max-height|overflow/);
  assert.match(styles, /analysis-hand-concealed\{[^}]*min-width:0/);
});


test('compact summary keeps hand and metadata folded while candidates switch explanation without requests', async () => {
  const p = panel(); await flush();
  const pending = p.element('model-run').onclick({ isTrusted: true }); await flush();
  p.resolve(modelResult()); await pending;
  const main = () => p.html().split('<div class="analysis-main"')[1].split('<div class="analysis-actions"')[0];
  const focus = () => p.html().split('<div class="analysis-focus"')[1].split('</div>')[0];
  assert.doesNotMatch(main(), /analysis-hand|analysis-meta/);
  assert.match(p.html(), /<details data-section="reasons"[^>]*><summary>详细分析<\/summary><div class="analysis-hand"/);
  assert.doesNotMatch(p.html(), /data-section="local"/);
  assert.match(p.html(), /id="model-run"[^>]*>分析当前局面<\/button>/);
  assert.match(focus(), /首选建议/); assert.match(focus(), /较高/); assert.match(focus(), /警戒/);
  const originalDecision = p.hints.at(-1).decision;
  const requests = p.messages.length;
  p.element('model-candidate-1').onclick();
  assert.match(p.html(), /data-candidate-tile="2m" aria-pressed="true"/);
  assert.match(focus(), /候选解释/); assert.match(focus(), /候选/);
  assert.equal(p.messages.length, requests);
  assert.equal(p.hints.at(-1).decision, originalDecision);
  assert.equal(p.hints.at(-1).decision.tile, '1m');
  assert.match(main(), /analysis-decision[^]*1m\.svg/);
});
