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
  let mount, configChanged, resolveAnalysis, timerId = 0; const timers = new Map(); const messages = [], elements = new Map(), hints = [], details = [{ dataset: { section: 'controls' }, open: false }], section = { scrollTop: 0 };
  const position = { mode: 'live' }; let collectorCalls = 0, historyCalls = 0, calibrateCalls = 0, roundStartCalls = 0;
  const content = { innerHTML: '', querySelectorAll() { return details; }, querySelector(id) { if (id === '.analysis') return section; if (!elements.has(id)) elements.set(id, {}); return elements.get(id); } };
  const container = { innerHTML: '', querySelector(id) { return id === '[data-analysis-content]' ? (this.innerHTML.includes('data-analysis-content') ? content : null) : content.querySelector(id); } };
  const state = S.initial('live', 1); Object.assign(state, { round: { wind: 0, index: 0 }, scores: [25000,25000,25000,25000], phase: 'playing', selfHand: ['1m','2m','3m','4m','5m','6m','7m','8m','9m','1s','2s','3s','4z','4z'] });
  if (options.turnProgress) state.turnProgress = structuredClone(options.turnProgress);
  const context = { MJAnalysis: A, MJSnapshotContract: Contract, URL, setTimeout: options.manualTimers ? (fn, delay) => { const id = ++timerId; timers.set(id, { fn, delay }); return id; } : setTimeout,
    clearTimeout: options.manualTimers ? id => timers.delete(id) : clearTimeout,
    document: { currentScript: { src: 'https://fixture/extension/analysis-panel.js' } }, location: { href: 'https://fixture/tests/preview.html' }, window: { addEventListener() {}, removeEventListener() {} },
    chrome: { runtime: { id: 'fixture', getURL: p => 'chrome-extension://fixture/' + p, sendMessage: async m => {
      messages.push(m); if (m.type === 'model:status') return options.status ? options.status() : { enabled: true, provider: options.provider || 'chat', preferences: options.preferences || { useModel: true, consent: true } };
      if (m.type === 'model:prepare') return { ok: true, data: m.provider === 'mjai' ? m.engineRequest : A.prepare(m.snapshot, m.task).data };
      if (m.type === 'model:analyze') return new Promise(resolve => { resolveAnalysis = resolve; }); return { ok: true };
    }, onMessage: { addListener: fn => { configChanged = fn; }, removeListener: fn => { if (configChanged === fn) configChanged = null; } } } } };
  if (options.offline) delete context.chrome;
  vm.runInNewContext(fs.readFileSync(require.resolve('../extension/analysis-panel.js'), 'utf8'), context);
  const render = () => context.MJAnalysisPanel.mount(container, { snapshot: selection => C.snapshot(state, selection), engineRequest: options.engineRequest, seatLabels: state.players.map((_, seat) => S.seatWind(state, seat) + '家 · 座位 ' + seat), phase: state.phase, round: state.round, selfSeat: state.selfSeat, hintsReady: options.hintsReady !== false, hintsCalibrated: !!options.hintsCalibrated, selfHand: state.selfHand, drawnTile: state.drawnTiles[state.selfSeat], riichiLabels: options.riichiLabels || [], recordCount: options.recordCount || 0,
    onMode: mode => { position.mode = mode; position.cursor = mode === 'replay' ? 1 : null; render(); },
    onCursor: cursor => { position.cursor = cursor; render(); }, onSelfSeat: seat => { state.selfSeat = seat; render(); }, onRoundStart: () => roundStartCalls++,
    onCollector: () => collectorCalls++, onHistory: () => historyCalls++, onCalibrateHints: () => calibrateCalls++ }, position, render, { onHints: value => hints.push(value) });
  render();
  return { timers, fireTimer: () => { const [id, timer] = timers.entries().next().value; timers.delete(id); return timer.fn(); }, render, state, messages, hints, position, details, section, calls: () => [collectorCalls, historyCalls, calibrateCalls], roundStartCalls: () => roundStartCalls, destroy: () => context.MJAnalysisPanel.destroy(), element: id => elements.get('#' + id), html: () => container.innerHTML.replace('<div data-analysis-content></div>', '<div data-analysis-content>' + content.innerHTML + '</div>'), configChanged: (sender = { id: 'fixture' }) => configChanged?.({ type: 'model:config-changed' }, sender), resolve: value => resolveAnalysis(value) };
}
test('global preview and request use combined data regardless of automatic features, and escape model text', async () => {
  const p = panel(); await flush();
  p.element('feature-strategy').onchange({ isTrusted: true, target: { checked: false } }); p.element('feature-danger').onchange({ isTrusted: true, target: { checked: false } }); p.element('model-preview').onclick(); await flush();
  assert.match(p.html(), /mj-analysis-v2/); assert.match(p.html(), /candidateMeaning/);
  const pending = p.element('model-run').onclick({ isTrusted: true }); await flush();
  const req = p.messages.find(m => m.type === 'model:analyze'), prep = A.prepare(req.snapshot, req.task);
  assert.equal(req.provider, 'chat'); assert.equal('engineRequest' in req, false);
  p.resolve({ ok: true, model: '<mock>', localAnalysis: prep.data.localAnalysis, result: { task: 'efficiency', danger: [], efficiency: [{ tile: '1m', reasons: ['<img onerror=bad>'] }], decision: { action: 'attack', tile: '1m', reasons: ['测试'] }, limitations: [] } });
  await pending; assert.match(p.html(), /<table>/); assert.match(p.html(), /1m\.svg/); assert.match(p.html(), /&lt;img onerror=bad&gt;/); assert.doesNotMatch(p.html(), /<img onerror/);
  assert.equal(req.task, 'combined');
  const saved = globalSection(p);
  p.state.lastStep++; p.render(); assert.equal(globalSection(p), saved);
});
test('panel cancellation discards delayed model results and synthetic clicks send no request', async () => {
  const p = panel(); await flush(); await p.element('model-run').onclick({ isTrusted: false });
  assert.equal(p.messages.some(m => m.type === 'model:analyze'), false);
  const pending = p.element('model-run').onclick({ isTrusted: true }); await flush();
  assert.match(p.html(), /正在分析，请先不要出牌/);
  assert.equal((p.html().match(/正在分析/g) || []).length, 1);
  p.element('model-cancel').onclick({ isTrusted: true });
  p.resolve({ ok: true, model: 'late', result: { danger: [], efficiency: [], decision: { action: 'unknown', tile: null, reasons: ['late-result'] }, limitations: [] } });
  await pending; assert.doesNotMatch(p.html(), /late-result|正在分析，请先不要出牌/); assert.match(p.html(), /已取消分析/);
});

test('configuration changes cancel pending global analysis', async () => {
  for (const change of [p => p.configChanged(), p => p.element('model-use').onchange({ isTrusted: true, target: { checked: false } })]) {
    const p = panel(); await flush(); const pending = p.element('model-run').onclick({ isTrusted: true }); await flush();
    change(p); p.resolve({ ok: true, model: 'late', result: { danger: [], efficiency: [], decision: { action: 'unknown', tile: null, reasons: ['late-old-task'] }, limitations: [] } });
    await pending; assert.doesNotMatch(p.html(), /late-old-task/); assert.equal(p.messages.some(m => m.type === 'model:cancel'), true);
  }
});

test('destroy cancels pending work and remount reloads configuration with default authorization', async () => {
  const p = panel(); await flush();

  const pending = p.element('model-run').onclick({ isTrusted: true }); await flush();
  p.destroy();
  const oldHtml = p.html(), statusCalls = p.messages.filter(m => m.type === 'model:status').length;
  p.resolve({ ok: true, model: 'late', result: { danger: [], efficiency: [], decision: { action: 'unknown', tile: null, reasons: ['destroyed-result'] }, limitations: [] } });
  await pending; assert.equal(p.html(), oldHtml);
  assert.equal(p.messages.some(m => m.type === 'model:cancel'), true);
  p.render(); await flush();
  assert.equal(p.messages.filter(m => m.type === 'model:status').length, statusCalls + 1);
  assert.doesNotMatch(p.html(), /destroyed-result/);
  assert.match(p.html(), /调用模型/);
  assert.doesNotMatch(p.html(), /正在分析/);
});

test('background notifications refresh model availability and provider without storage events or focus', async () => {
  let status = { enabled: false, preferences: { useModel: true, consent: true } };
  const p = panel({ status: () => status }); await flush();
  assert.match(p.html(), /请在模型设置中接入并开启模型/);
  status = { ...status, enabled: true, provider: 'mjai' };
  p.configChanged(); await flush();
  assert.doesNotMatch(p.html(), /请在模型设置中接入并开启模型/);
  assert.match(p.html(), /本地 mjai：/);
  status = { ...status, enabled: false };
  p.configChanged(); await flush();
  assert.match(p.html(), /请在模型设置中接入并开启模型/);
  const count = p.messages.length;
  p.configChanged({ id: 'other' }); p.configChanged({ id: 'fixture', tab: { id: 7 } }); await flush();
  assert.equal(p.messages.length, count);
  p.destroy(); p.configChanged(); await flush();
  assert.equal(p.messages.length, count);
});

test('late status responses cannot overwrite configuration refreshed by a background notification', async () => {
  for (const failOld of [false, true]) {
    const pending = [];
    const p = panel({ status: () => new Promise((resolve, reject) => pending.push({ resolve, reject })) });
    p.configChanged();
    pending[1].resolve({ enabled: true, preferences: { useModel: true, consent: true } }); await flush();
    if (failOld) pending[0].reject(new Error('Old request failed'));
    else pending[0].resolve({ enabled: false });
    await flush();
    assert.doesNotMatch(p.html(), /请在模型设置中接入并开启模型/);
    assert.match(p.html(), /id="model-use"[^>]*checked/);
    assert.doesNotMatch(p.html(), /此前使用本地分析/);
    p.destroy();
  }
});


const modelResult = () => ({ ok: true, model: 'fixture', result: { danger: [{ tile: '1m', opponents: [{ seat: 2, level: 'high', reasons: ['警戒'] }] }], efficiency: [{ tile: '2m', reasons: ['候选'] }], decision: { action: 'attack', tile: '1m', reasons: ['测试结论'] }, limitations: ['仅供参考'] } });
const globalSection = p => p.html().split('<section class="analysis-global"')[1].split('</section>')[0];
const automaticPanel = (options = {}) => panel({ ...options, manualTimers: true, preferences: { automatic: true, useModel: true, ...options.preferences } });
async function automaticResult(p, response = modelResult()) {
  p.state.turn = p.state.selfSeat; p.render(); p.fireTimer(); await flush();
  p.resolve(response); await flush();
}

test('hints only describe the matching live hand and never alter sending authorization', async () => {
  const p = automaticPanel(); await flush();
  assert.equal(p.hints.at(-1), null);
  await automaticResult(p);
  assert.deepEqual(Array.from(p.messages.find(m => m.type === 'model:analyze').snapshot.selfHand), p.state.selfHand);
  const value = p.hints.at(-1);
  assert.deepEqual(Array.from(value.hand), p.state.selfHand);
  assert.notEqual(value.hand, p.state.selfHand);
  assert.equal(value.decision.tile, '1m');
  p.position.mode = 'history'; p.render(); assert.equal(p.hints.at(-1), null);
  p.position.mode = 'live'; p.render(); assert.equal(p.hints.at(-1), null);
  p.state.lastStep++; await automaticResult(p);
  p.state.selfHand[0] = '9s'; p.render(); assert.equal(p.hints.at(-1), null);
  assert.match(p.html(), /旧结果/);
  p.destroy(); assert.equal(p.hints.at(-1), null);
});

test('visible mode switch exposes replay navigation and preserves global analysis', async () => {
  const p = panel({ recordCount: 3 }); await flush();
  const pending = p.element('model-run').onclick({ isTrusted: true }); await flush(); p.resolve(modelResult()); await pending;
  assert.equal(p.hints.at(-1), null);
  const requests = p.messages.filter(m => m.type === 'model:analyze').length;
  p.element('analysis-mode-replay').onclick();
  assert.equal(p.position.mode, 'replay');
  assert.match(p.html(), /id="analysis-mode-replay" aria-pressed="true"/);
  assert.match(p.html(), /事件 1 \/ 3/); assert.match(p.html(), /分析所选局面/);
  assert.match(globalSection(p), /测试结论/); assert.equal(p.hints.at(-1), null);
  p.element('analysis-replay-next').onclick(); assert.equal(p.position.cursor, 2);
  p.element('analysis-replay-prev').onclick(); assert.equal(p.position.cursor, 1);
  p.element('analysis-replay-cursor').onchange({ target: { value: '3' } }); assert.equal(p.position.cursor, 3);
  p.element('analysis-replay-start').onclick(); assert.equal(p.roundStartCalls(), 1);
  p.element('analysis-replay-seat').onchange({ target: { value: '2' } }); assert.equal(p.state.selfSeat, 2);
  const review = p.element('model-run').onclick({ isTrusted: true }); await flush(); p.resolve(modelResult()); await review;
  assert.match(globalSection(p), /测试结论/); assert.equal(p.hints.at(-1), null);
  p.element('analysis-mode-live').onclick(); assert.match(globalSection(p), /测试结论/); assert.doesNotMatch(p.html(), /analysis-replay-heading/);
  assert.equal(p.messages.filter(m => m.type === 'model:analyze').length, requests + 1);
});

test('global requests finish for their captured replay position after mode, replacement or cursor changes', async () => {
  for (const change of [p => p.element('analysis-mode-live').onclick(), p => { p.position.replayRevision = 2; p.render(); }, p => p.element('analysis-replay-next').onclick()]) {
    const p = panel({ recordCount: 3 }); await flush(); p.element('analysis-mode-replay').onclick();
    const pending = p.element('model-run').onclick({ isTrusted: true }); await flush();
    change(p); p.resolve(modelResult()); await pending;
    assert.match(globalSection(p), /测试结论/); assert.doesNotMatch(p.html(), /正在分析…/);
    assert.equal(p.messages.some(m => m.type === 'model:cancel'), false);
    assert.match(globalSection(p), /牌谱[^]*事件 1/);
    assert.equal(p.hints.at(-1), null);
  }
});

test('empty replay explains how to load records and never substitutes the live result', async () => {
  const p = panel(); await flush(); p.element('analysis-mode-replay').onclick();
  assert.match(p.html(), /请在雀魂中打开牌谱/);
  assert.doesNotMatch(p.html(), /id="analysis-replay-cursor"/);
});

test('feature changes preserve global output without creating live hints', async () => {
  const p = panel(); await flush();
  const pending = p.element('model-run').onclick({ isTrusted: true }); await flush(); p.resolve(modelResult()); await pending;
  p.element('feature-danger').onchange({ isTrusted: true, target: { checked: false } });
  assert.match(globalSection(p), /测试结论/); assert.equal(p.hints.at(-1), null);
});

test('disclosures and scroll persist and utility entry points call supplied callbacks', async () => {
  const p = panel({ riichiLabels: ['南家', '<西家>'] }); await flush();
  p.details[0].open = true; p.details[0].ontoggle(); p.section.scrollTop = 128;
  const previousHtml = p.html();
  p.state.lastStep++; p.render();
  assert.equal(p.details[0].open, true); assert.equal(p.section.scrollTop, 128);
  assert.equal(p.details[0].open, true);
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
  const p = automaticPanel(); await flush();
  p.state.drawnTiles[p.state.selfSeat] = '4z'; p.render();
  assert.match(p.html(), /东1局 · 南家/);
  assert.match(p.html(), /class="analysis-hand-drawn"/);
  assert.match(p.html(), /--hand-count:14;--concealed-count:13/);
  await automaticResult(p);
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
  const p = automaticPanel(); await flush();
  p.state.selfHand = ['0m', '5m', ...p.state.selfHand.slice(2)]; p.render();
  const response = modelResult(); response.result.decision.tile = '5m'; response.result.danger[0].tile = '5m';
  await automaticResult(p, response);
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
  const p = automaticPanel(); await flush();
  const response = modelResult(); response.result.decision.action = 'defend';
  await automaticResult(p, response);
  const main = () => p.html().split('<div class="analysis-main"')[1].split('<details data-section="reasons"')[0];
  const focus = () => p.html().split('<div class="analysis-focus"')[1].split('</div>')[0];
  assert.doesNotMatch(main(), /analysis-hand|analysis-meta/);
  assert.match(p.html(), /<details data-section="reasons"[^>]*><summary>详细分析<\/summary><div class="analysis-hand"/);
  assert.doesNotMatch(p.html(), /data-section="local"/);
  assert.match(p.html(), /id="model-run"[^>]*>分析当前局面<\/button>/);
  assert.match(focus(), /首选建议/); assert.match(focus(), /较高/); assert.match(focus(), /警戒/);
  assert.match(main(), /防守 · 建议打<\/span>[^]*1m\.svg/); assert.doesNotMatch(main(), /回避/);
  const explanation = p.element('model-focus-text');
  explanation.scrollHeight = 180; explanation.clientHeight = 96; p.render();
  assert.equal(p.element('model-focus-toggle').hidden, false);
  p.element('model-focus-toggle').onclick();
  assert.match(p.html(), /analysis-focus is-expanded/);
  assert.match(p.html(), /id="model-focus-toggle" aria-expanded="true"/);
  p.render(); assert.match(p.html(), /analysis-focus is-expanded/);
  p.element('model-focus-toggle').onclick();
  assert.doesNotMatch(p.html(), /analysis-focus is-expanded/);
  p.element('model-focus-toggle').onclick();
  const originalDecision = p.hints.at(-1).decision;
  const requests = p.messages.length;
  p.element('model-candidate-1').onclick();
  assert.doesNotMatch(p.html(), /analysis-focus is-expanded/);
  explanation.scrollHeight = 20; explanation.clientHeight = 20; p.render();
  assert.equal(p.element('model-focus-toggle').hidden, true);
  assert.match(p.html(), /data-candidate-tile="2m" aria-pressed="true"/);
  assert.match(focus(), /候选解释/); assert.match(focus(), /候选/);
  assert.equal(p.messages.length, requests);
  assert.equal(p.hints.at(-1).decision, originalDecision);
  assert.equal(p.hints.at(-1).decision.tile, '1m');
  assert.match(main(), /analysis-decision[^]*1m\.svg/);
});

test('enabling model calls needs no separate consent, including legacy consent=false', async () => {
  const p = panel({ provider: 'mjai', preferences: { useModel: true, consent: false }, engineRequest: () => ({ events: [] }) }); await flush();
  assert.doesNotMatch(p.html(), /id="model-consent"|确认模型数据授权/);
  const pending = p.element('model-run').onclick({ isTrusted: true }); await flush();
  assert.equal(p.messages.some(m => m.type === 'model:analyze'), true);
  p.resolve(modelResult()); await pending; p.destroy();
});

test('engine preview matches its input and provider switching retains the saved global result', async () => {
  const options = { provider: 'mjai', engineRequest: () => ({ format: 'majsoul-mjai-v1', seat: 0, events: [{ type: 'tsumo', actor: 0, pai: '9p' }] }) };
  const p = panel(options); await flush();

  p.element('model-preview').onclick(); await flush();
  assert.match(p.html(), /majsoul-mjai-v1/); assert.doesNotMatch(p.html(), /mj-analysis-v2/);
  assert.equal(p.messages.some(m => m.type === 'model:analyze'), false);
  const pending = p.element('model-run').onclick({ isTrusted: true }); await flush();
  const sent = p.messages.find(m => m.type === 'model:analyze');
  assert.equal(sent.provider, 'mjai');
  assert.deepEqual(sent.engineRequest, options.engineRequest());
  const response = modelResult(); response.engine = { action: { type: 'reach', actor: 0 } };
  response.result.decision = { action: 'unknown', tile: null, reasons: ['engine-reach'] };
  p.resolve(response); await pending;
  assert.match(globalSection(p), /立直意向/);
  options.provider = 'chat'; p.configChanged(); await flush();
  assert.match(globalSection(p), /engine-reach/);
  assert.equal(p.hints.at(-1), null);
});

test('engine skip action is shown in the global result', async () => {
  const p = panel({ provider: 'mjai', engineRequest: () => ({ events: [] }) }); await flush();

  const pending = p.element('model-run').onclick({ isTrusted: true }); await flush();
  const response = modelResult(); response.engine = { action: { type: 'none' } };
  response.result.decision = { action: 'unknown', tile: null, reasons: [] };
  p.resolve(response); await pending;
  assert.match(globalSection(p), /跳过响应/);
});

const toggle = (p, id, checked) => p.element(id).onchange({ isTrusted: true, target: { checked } });

test('default local mode computes hand and danger without any model request, including preview', async () => {
  const p = panel({ preferences: {} }); await flush();
  p.element('model-preview').onclick(); await new Promise(resolve => setTimeout(resolve, 10));
  await p.element('model-run').onclick({ isTrusted: true });
  assert.match(p.html(), /本地分析 · 未调用模型/); assert.match(p.html(), /向听/); assert.match(p.html(), /<table>/);
  assert.equal(p.messages.some(m => ['model:analyze', 'model:prepare'].includes(m.type)), false);
  assert.doesNotMatch(p.html(), /id="model-(game|hand|rivers|task)"/);
});

test('automatic decisions merge features once, do not repeat on repaint, and cancel on the next position', async () => {
  const p = panel({ manualTimers: true, preferences: { automatic: true, useModel: true, consent: true } }); await flush();
  p.state.turn = p.state.selfSeat; p.state.lastStep = 1; p.render();
  assert.equal(p.timers.size, 1); p.fireTimer(); await flush();
  assert.match(p.html(), /正在分析，请先不要出牌/);
  assert.equal((p.html().match(/正在分析/g) || []).length, 1);
  assert.equal(p.messages.filter(m => m.type === 'model:analyze').length, 1);
  assert.equal(p.messages.find(m => m.type === 'model:analyze').task, 'combined');
  p.resolve(modelResult()); await flush(); p.render(); assert.equal(p.timers.size, 0);
  assert.doesNotMatch(p.html(), /正在分析，请先不要出牌/);
  p.state.lastStep = 2; p.render(); assert.ok([...p.timers.values()][0].delay > 7000); p.fireTimer(); await flush();
  assert.match(p.html(), /正在分析，请先不要出牌/);
  assert.doesNotMatch(p.html(), /局面或分析功能已变化，以下为旧结果，请重新分析/);
  assert.equal((p.html().match(/正在分析/g) || []).length, 1);
  p.state.turn = (p.state.selfSeat + 1) % 4; p.state.lastStep = 3; p.render();
  p.resolve(modelResult()); await flush();
  assert.equal(p.messages.some(m => m.type === 'model:cancel'), true);
  assert.equal(p.hints.at(-1), null); assert.equal(p.timers.size, 0);
  p.destroy();
});

test('model threshold uses local analysis before the selected turn and model analysis starting at it', async () => {
  const p = panel({ manualTimers: true, preferences: { automatic: true, useModel: true, consent: true, modelFromTurn: 7 }, turnProgress: { status: 'known', source: 'events', bySeat: [1,1,1,1], reason: null } }); await flush();
  p.state.turn = p.state.selfSeat; p.state.lastStep = 1; p.render(); p.fireTimer(); await flush();
  assert.equal(p.messages.some(m => m.type === 'model:analyze'), false);
  assert.match(p.html(), /本地分析 · 未调用模型/);
  p.state.players[p.state.selfSeat].discards = Array.from({ length: 6 }, (_, i) => ({ tile: `${i + 1}p` }));
  p.state.turnProgress.bySeat[p.state.selfSeat] = 7;
  p.state.lastStep = 7; p.render(); p.fireTimer(); await flush();
  assert.equal(p.messages.filter(m => m.type === 'model:analyze').length, 1);
  p.resolve(modelResult()); await flush(); p.destroy();
});

test('model off, replay and disabled features suppress automatic model calls', async () => {
  const p = panel({ manualTimers: true, preferences: { automatic: true, useModel: true, consent: true } }); await flush();
  p.state.turn = p.state.selfSeat; p.render();
  toggle(p, 'model-use', false); p.fireTimer(); await flush();
  assert.equal(p.messages.some(m => m.type === 'model:analyze'), false);
  toggle(p, 'model-use', true); assert.equal(p.timers.size, 1);
  p.element('analysis-mode-replay').onclick(); assert.equal(p.timers.size, 0);
  for (const key of ['danger', 'efficiency', 'strategy']) toggle(p, 'feature-' + key, false);
  assert.equal(p.timers.size, 0); assert.equal(p.messages.some(m => m.type === 'model:analyze'), false);
  p.destroy();
});

test('automatic model cap stops further requests but manual analysis remains available', async () => {
  const p = panel({ manualTimers: true, preferences: { automatic: true, useModel: true, consent: true, limit: 1 } }); await flush();
  p.state.turn = p.state.selfSeat; p.state.lastStep = 1; p.render(); p.fireTimer(); await flush(); p.resolve(modelResult()); await flush();
  p.state.lastStep = 2; p.render(); assert.equal(p.timers.size, 0);
  const pending = p.element('model-run').onclick({ isTrusted: true }); await flush();
  assert.equal(p.messages.filter(m => m.type === 'model:analyze').length, 2); p.resolve(modelResult()); await pending; p.destroy();
});

test('disabling strategic advice retains mathematical discard comparison and saved feature settings', async () => {
  const p = panel({ preferences: { useModel: false } }); await flush();
  p.state.selfHand[13] = '5z'; p.render();
  toggle(p, 'feature-strategy', false);
  await p.element('model-run').onclick({ isTrusted: true });
  assert.match(globalSection(p), /仅按牌效率比较/); assert.equal(p.hints.at(-1), null);
  const saved = p.messages.find(m => m.type === 'model:preferences'); assert.equal(saved.preferences.strategy, false);
  assert.equal(saved.preferences.danger, true); assert.equal(saved.preferences.efficiency, true);
  p.destroy();
});

test('local completed shape is identified without recommending a discard', async () => {
  const p = panel({ preferences: {} }); await flush();
  await p.element('model-run').onclick({ isTrusted: true });
  assert.match(globalSection(p), /当前手牌已成和牌形/); assert.equal(p.hints.at(-1), null);
  p.destroy();
});

test('unknown collector turns never cross a turn threshold from river length, but every-turn mode still works', async () => {
  const p = panel({ manualTimers: true, preferences: { automatic: true, useModel: true, consent: true, modelFromTurn: 7 } }); await flush();
  p.state.turn = p.state.selfSeat;
  p.state.players[p.state.selfSeat].discards = Array.from({ length: 12 }, (_, i) => ({ tile: `${i % 9 + 1}p` }));
  p.render(); assert.match(p.html(), /巡目未知/);
  p.fireTimer(); await flush();
  assert.equal(p.messages.some(m => m.type === 'model:analyze'), false);
  const globalPending = p.element('model-run').onclick({ isTrusted: true }); await flush();
  assert.equal(p.messages.filter(m => m.type === 'model:analyze').length, 1);
  p.resolve(modelResult()); await globalPending;
  p.element('model-from-turn').onchange({ isTrusted: true, target: { value: '1' } });
  p.fireTimer(); await flush(); assert.equal(p.messages.filter(m => m.type === 'model:analyze').length, 2);
  p.resolve(modelResult()); await flush(); p.destroy();
});

test('loss of turn confidence cancels pending threshold requests and discards delayed results', async () => {
  const p = panel({ manualTimers: true, preferences: { automatic: true, useModel: true, consent: true, modelFromTurn: 7 }, turnProgress: { status: 'known', source: 'events', bySeat: [7,7,7,7], reason: null } }); await flush();
  p.state.turn = p.state.selfSeat; p.render(); p.fireTimer(); await flush();
  p.state.turnProgress = { status: 'unknown', source: 'events', bySeat: [null,null,null,null], reason: 'event_gap' }; p.render();
  p.resolve(modelResult()); await flush();
  assert.equal(p.messages.some(m => m.type === 'model:cancel'), true);
  assert.doesNotMatch(p.html(), /测试结论/); assert.equal(p.hints.at(-1), null);
  p.fireTimer(); await flush(); assert.equal(p.messages.filter(m => m.type === 'model:analyze').length, 1); p.destroy();
});

test('global result survives draws, new rounds, feature changes, configuration changes and automatic updates', async () => {
  const p = automaticPanel(); await flush();
  const pending = p.element('model-run').onclick({ isTrusted: true }); await flush();
  const response = modelResult(); response.result.decision.reasons = ['保留的全局结论'];
  response.result.decision.action = 'defend';
  p.resolve(response); await pending;
  assert.match(globalSection(p), /防守 · 建议打<\/span>[^]*1m\.svg/);
  const savedHand = p.state.selfHand.slice();
  assert.equal(p.hints.at(-1), null);
  p.state.selfHand[0] = '9p'; p.state.lastStep = 1; p.render();
  assert.match(globalSection(p), /保留的全局结论/);
  assert.match(globalSection(p), /分析时手牌[^]*1m\.svg/);
  p.state.round.index = 1; p.state.lastStep = 2; p.render();
  assert.match(globalSection(p), /东1局/);
  assert.deepEqual(savedHand.slice(0, 1), ['1m']);
  toggle(p, 'feature-efficiency', false);
  p.configChanged(); await flush();
  assert.match(globalSection(p), /保留的全局结论/);
  await automaticResult(p);
  assert.equal(p.hints.at(-1).decision.tile, '1m');
  assert.match(globalSection(p), /保留的全局结论/);
  assert.doesNotMatch(globalSection(p), /测试结论/);
  p.destroy();
});

test('manual global analysis captures input and finishes after live changes with all automatic features off', async () => {
  const p = panel({ preferences: { useModel: true, danger: false, efficiency: false, strategy: false, modelFromTurn: 7 } }); await flush();
  const pending = p.element('model-run').onclick({ isTrusted: true }); await flush();
  const request = p.messages.find(m => m.type === 'model:analyze');
  assert.equal(request.task, 'combined');
  assert.equal(request.snapshot.selfHand[0], '1m');
  p.state.selfHand[0] = '9p'; p.state.round.index = 1; p.state.lastStep = 3; p.render();
  toggle(p, 'feature-danger', true);
  p.resolve(modelResult()); await pending;
  assert.equal(p.messages.some(m => m.type === 'model:cancel'), false);
  assert.match(globalSection(p), /东1局[^]*测试结论/);
  assert.match(globalSection(p), /警戒/);
  assert.equal(p.hints.at(-1), null);
  p.destroy();
});

test('global analysis after discarding prioritizes in-progress status over stale automatic output', async () => {
  const p = automaticPanel(); await flush(); await automaticResult(p);
  const pending = p.element('model-run').onclick({ isTrusted: true }); await flush();
  p.state.selfHand.pop(); p.state.turn = 2; p.state.lastStep = 2; p.render();
  assert.match(p.html(), /正在分析，请先不要出牌/);
  assert.doesNotMatch(p.html(), /局面或分析功能已变化，以下为旧结果，请重新分析/);
  assert.equal(p.hints.at(-1), null);
  p.resolve(modelResult()); await pending;
  assert.match(globalSection(p), /测试结论/);
  assert.doesNotMatch(p.html(), /正在分析/);
  p.destroy();
});

test('retry keeps the previous global result during loading, failure and cancellation and replaces only on success', async () => {
  const p = panel(); await flush();
  let pending = p.element('model-run').onclick({ isTrusted: true }); await flush(); p.resolve(modelResult()); await pending;
  pending = p.element('model-run').onclick({ isTrusted: true }); await flush();
  assert.match(globalSection(p), /测试结论/);
  p.resolve({ ok: false, error: '服务暂不可用' }); await pending;
  assert.match(globalSection(p), /测试结论[^]*服务暂不可用/);
  pending = p.element('model-run').onclick({ isTrusted: true }); await flush();
  p.element('model-cancel').onclick({ isTrusted: true });
  const replacement = modelResult(); replacement.result.decision.reasons = ['新全局结论'];
  p.resolve(replacement); await pending;
  assert.match(globalSection(p), /测试结论/); assert.doesNotMatch(globalSection(p), /新全局结论/);
  pending = p.element('model-run').onclick({ isTrusted: true }); await flush(); p.resolve(replacement); await pending;
  assert.match(globalSection(p), /新全局结论/); assert.doesNotMatch(globalSection(p), /测试结论|服务暂不可用/);
  p.destroy();
});
