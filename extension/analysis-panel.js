(function () {
  'use strict';
  const available = typeof chrome !== 'undefined' && !!chrome.runtime?.id;
  const selection = { game: true, rivers: 'all', hand: false };
  let task = 'combined', enabled = false, busy = false, result = null, failure = '', preview = false, provider = 'chat';
  let focusTile = null, hooks = {}, detailsState = {}, current, context, repaint, requestId = 0, lifecycle = 0, connected = false;
  const send = message => chrome.runtime.sendMessage(message);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const tileBase = available ? chrome.runtime.getURL('tiles/') : new URL('tiles/', document.currentScript?.src || new URL('../extension/analysis-panel.js', location.href)).href;
  const styleUrl = available ? chrome.runtime.getURL('analysis-panel.css') : new URL('analysis-panel.css', document.currentScript?.src || new URL('../extension/analysis-panel.js', location.href)).href;
  const face = t => /^(?:[0-9][mps]|[1-7]z)$/.test(t) ? `<img class="analysis-tile" src="${escape(tileBase + t + '.svg')}" alt="${escape(MJSnapshotContract.label(t))}" title="${escape(MJSnapshotContract.label(t))}">` : escape(t);
  const reasons = values => (values || []).map(escape).join('；');
  const actionNames = { attack: '进攻', defend: '回避', fold: '弃和', unknown: '暂无法判断' };
  const riskNames = { safe: '现物', low: '较低', medium: '中等', high: '较高', unknown: '未知' };
  const decisionLabel = response => ({ reach: '立直意向', none: '跳过响应' })[response?.engine?.action?.type] || actionNames[response?.result?.decision?.action] || '暂无法判断';
  function resultHtml(response) {
    const r = response.result;
    if (!r) return '';
    return `${r.danger.length ? '<h4>逐对手危险牌</h4>' + r.danger.map(d => `<div class="analysis-card">${face(d.tile)}${d.opponents.map(o => `<p>${escape(response.seatLabels?.[o.seat] || ('座位 ' + o.seat))} · ${escape(riskNames[o.level])}：${reasons(o.reasons)}</p>`).join('')}</div>`).join('') : ''}
      ${r.efficiency.length ? '<h4>牌效率解释</h4>' + r.efficiency.map(e => `<div class="analysis-card">${face(e.tile)} ${reasons(e.reasons)}</div>`).join('') : ''}
      <h4>建议</h4><p>${escape(decisionLabel(response))} ${r.decision.tile ? face(r.decision.tile) : ''} ${reasons(r.decision.reasons)}</p>
      ${r.limitations.length ? `<p class="warn">${reasons(r.limitations)}</p>` : ''}
      ${response.trace ? `<details data-section="trace"><summary>Agent 运行记录</summary><ol>${response.trace.events.map(event => `<li>${escape(event.tool)} · ${escape(event.status)} · ${escape(event.elapsedMs)} ms</li>`).join('')}</ol></details>` : ''}`;
  }
  function localHtml(local, phase) {
    const e = local?.efficiency;
    if (!e) return '';
    if (e.status !== 'available') return `<h4>本地牌效率</h4><p class="muted">${reasons(e.reasons)}</p>`;
    const entry = c => `<tr><td>${c.tile ? face(c.tile) : '当前手牌'}</td><td>${escape(c.shanten)}</td><td>${c.effectiveTiles.map(t => `${face(t.tile)} ${t.unseenUpperBound === 0 ? '已见耗尽' : '≤' + escape(t.unseenUpperBound)}`).join(' ') || '无'}</td><td>≤${escape(c.totalUnseenUpperBound)}</td></tr>`;
    return `<h4>本地牌效率计算</h4><p>${phase !== 'playing' ? '结算或历史局面的数学比较，不是当前出牌建议' : e.canDiscard ? '各候选弃牌后的比较' : '当前不提供弃牌建议；等待摸牌或确认立直摸牌。'} · ${e.shanten === -1 ? '和牌型' : escape(e.shanten) + ' 向听'}</p>
      ${e.reasons?.length ? `<p>${reasons(e.reasons)}</p>` : ''}
      <table><thead><tr><th>弃牌</th><th>向听</th><th>有效牌 / 未见上界</th><th>合计上界</th></tr></thead><tbody>${e.candidates.map(entry).join('')}${e.current ? entry(e.current) : ''}</tbody></table><p class="muted">未见枚数为上界，不代表牌山剩余枚数。${e.visibleTiles.partial ? '已见牌范围不完整。' : ''}</p>`;
  }
  function snapshot() { return current.snapshot(selection); }
  function engineRequest() {
    if (!selection.game || selection.rivers !== 'all' || !selection.hand) throw new Error('专业引擎需要授权对局信息、全部公开牌河及自家手牌。');
    if (typeof current.engineRequest !== 'function') throw new Error('当前输入不支持专业引擎事件，请重新加载扩展。');
    if (task !== 'combined') throw new Error('专业引擎仅支持综合决策，请选择综合攻守。');
    return current.engineRequest(selection);
  }
  let preparationKey = '', preparation = null, preparationError = '', preparationBusy = false;
  function requestPreparation(data) {
    const generation = lifecycle, taskAtRequest = task, extra = { provider, ...(provider === 'mjai' ? { engineRequest: engineRequest() } : {}) }, key = JSON.stringify([taskAtRequest, data, extra]);
    if (key === preparationKey) return;
    preparationKey = key; preparation = null; preparationError = ''; preparationBusy = true;
    const pending = available ? send({ type: 'model:prepare', task: taskAtRequest, snapshot: data, ...extra }) : new Promise(resolve => setTimeout(() => {
      try { resolve({ ok: true, data: MJAnalysis.prepare(data, taskAtRequest).data }); } catch (e) { resolve({ ok: false, error: e.message }); }
    }, 0));
    pending.then(response => { if (key !== preparationKey || generation !== lifecycle) return;
      if (!response?.ok) preparationError = response?.error || '无法整理局面数据。'; else preparation = response.data;
    }).catch(e => { if (key === preparationKey && generation === lifecycle) preparationError = e.message; }).finally(() => { if (key === preparationKey && generation === lifecycle) { preparationBusy = false; repaint?.(); } });
  }
  function fingerprint() { try { return JSON.stringify({ provider, task, context, round: current.round, phase: current.phase, hand: current.selfHand, drawnTile: current.drawnTile, snapshot: snapshot() }); } catch (_) { return ''; } }
  async function refresh() {
    if (!available) return;
    const generation = lifecycle;
    try { const status = await send({ type: 'model:status' });
      if (generation !== lifecycle) return;
      const nextProvider = status?.provider === 'mjai' ? 'mjai' : 'chat';
      if (enabled !== !!status?.enabled || provider !== nextProvider) { result = null; preparationKey = ''; preparation = null; }
      provider = nextProvider;
      enabled = !!status?.enabled; }
    catch (_) { if (generation !== lifecycle) return; enabled = false; }
    repaint?.();
  }
  function configChanged(changes, area) {
    if (area === 'local' && changes.modelConfig) { requestId++; busy = false; result = null; hooks.onHints?.(null); send({ type: 'model:cancel' }).catch(() => {}); refresh(); }
  }
  function connect() {
    if (!available || connected) return;
    connected = true;
    chrome.storage.onChanged.addListener(configChanged);
    window.addEventListener('focus', refresh);
    refresh();
  }
  function destroy() {
    hooks.onHints?.(null); hooks = {}; detailsState = {}; focusTile = null;
    lifecycle++; requestId++;
    if (available && connected) {
      chrome.storage.onChanged.removeListener(configChanged);
      window.removeEventListener('focus', refresh);
      if (busy) send({ type: 'model:cancel' }).catch(() => {});
    }
    connected = false; enabled = false; busy = false; result = null; failure = ''; preview = false; provider = 'chat';
    current = null; context = null; repaint = null;
    preparationKey = ''; preparation = null; preparationError = ''; preparationBusy = false;
    selection.game = true; selection.rivers = 'all'; selection.hand = false; task = 'combined';
  }
  function mount(container, analysisView, position, render, nextHooks = {}) {
    const oldScroll = container.querySelector?.('.analysis')?.scrollTop || 0;
    for (const detail of container.querySelectorAll?.('details[data-section]') || []) detailsState[detail.dataset.section] = detail.open;
    if (hooks.onHints && hooks.onHints !== nextHooks.onHints) hooks.onHints(null);
    hooks = nextHooks;
    current = analysisView; context = position; repaint = render;
    connect();
    const stale = !!result && result.fingerprint !== fingerprint();
    const live = context?.mode === 'live' && current.phase === 'playing';
    let selectedSnapshot = null;
    try { selectedSnapshot = snapshot(); } catch (_) {}
    const hintHand = current.selfHand || selectedSnapshot?.selfHand;
    hooks.onHints?.(live && !stale && result?.result && Array.isArray(hintHand) && hintHand.length ? {
      hand: hintHand.slice(), drawnTile: current.drawnTile ?? selectedSnapshot?.selfDrawnTile ?? null, decision: result.result.decision,
      danger: result.result.danger, seatLabels: result.seatLabels.slice()
    } : null);
    let payload = '', error = '';
    try { const raw = snapshot(); if (preview) requestPreparation(raw); payload = preparation ? JSON.stringify(preparation, null, 2) : '正在整理实际发送的数据…'; } catch (e) { error = e.message; }
    if (preview && preparationError) error = preparationError;
    const disclosure = (key, label, content) => `<details data-section="${key}" ${detailsState[key] ? 'open' : ''}><summary>${label}</summary>${content}</details>`;
    const r = result?.result;
    const candidateTiles = [...new Set([...(r?.efficiency || []).map(e => e.tile), ...(r?.danger || []).map(d => d.tile)])].filter(t => t && t !== r?.decision?.tile).slice(0, 3);
    const hand = Array.isArray(current.selfHand) ? current.selfHand : [];
    const activeResult = live && !stale ? r : null;
    const kind = tile => String(tile).replace(/^0([mps])$/, '5$1');
    const drawnIndex = current.drawnTile ? hand.lastIndexOf(current.drawnTile) : -1;
    const handFace = (tile, index) => {
      const suggested = !!activeResult?.decision.tile && activeResult.decision.tile === tile;
      const dangerous = !!activeResult?.danger.some(d => kind(d.tile) === kind(tile) && d.opponents.some(o => o.level === 'high'));
      const label = [MJSnapshotContract.label(tile), index === drawnIndex ? '摸牌' : '', suggested ? '建议' : '', dangerous ? '高危' : ''].filter(Boolean).join(' · ');
      return `<span class="analysis-hand-tile${suggested ? ' is-suggested' : ''}${dangerous ? ' is-dangerous' : ''}" aria-label="${escape(label)}" title="${escape(label)}">${face(tile)}</span>`;
    };
    const handHtml = `<div class="analysis-hand-tiles" style="--hand-count:${Math.max(hand.length, 1)};--concealed-count:${Math.max(hand.length - (drawnIndex >= 0 ? 1 : 0), 1)}"><div class="analysis-hand-concealed">${hand.map((tile, i) => i !== drawnIndex ? handFace(tile, i) : '').join('')}</div>${drawnIndex >= 0 ? `<div class="analysis-hand-drawn">${handFace(hand[drawnIndex], drawnIndex)}</div>` : ''}</div>`;
    const handSection = hand.length ? `<div class="analysis-hand" aria-label="当前自家手牌"><small class="muted">当前手牌 · 仅本地展示</small>${handHtml}</div>` : '';
    const focusTiles = [...new Set([r?.decision.tile, ...candidateTiles])].filter(Boolean);
    if (!focusTiles.includes(focusTile)) focusTile = r?.decision.tile || focusTiles[0] || null;
    const focusedDanger = (r?.danger || []).filter(d => kind(d.tile) === kind(focusTile)).flatMap(d => d.opponents.map(o => `${result.seatLabels?.[o.seat] || ('座位 ' + o.seat)} · ${riskNames[o.level] || '未知'}：${(o.reasons || []).join('；')}`));
    const focusedEfficiency = (r?.efficiency || []).filter(e => e.tile === focusTile).flatMap(e => e.reasons || []);
    const focusSummary = focusTile ? `<div class="analysis-focus" aria-label="候选牌解释"><small>${escape(MJSnapshotContract.label(focusTile))} · ${focusTile === r?.decision.tile ? '首选建议' : '候选解释'}</small><p>${escape([...focusedDanger, ...focusedEfficiency].join('；') || '暂无该牌的额外解释，请展开详细分析查看完整依据。')}</p></div>` : '';
    const candidateHtml = focusTiles.length ? `<div class="analysis-candidates"><span class="muted">比较</span>${focusTiles.map((tile, index) => `<button id="model-candidate-${index}" data-candidate-tile="${escape(tile)}" aria-pressed="${tile === focusTile}" aria-label="查看${escape(MJSnapshotContract.label(tile))}的风险和效率理由">${face(tile)}</button>`).join('')}</div>${focusSummary}` : '';
    const roundLabel = current.round ? `${['东', '南', '西', '北'][current.round.wind] || '东'}${Number(current.round.index) + 1}局` : '等待开局';
    const selfLabel = Number.isInteger(current.selfSeat) ? current.seatLabels[current.selfSeat] : '';

    const settings = `<div class="controls"><button id="model-settings" ${!available ? 'disabled' : ''}>模型设置</button><button id="model-refresh" ${!available ? 'disabled' : ''}>刷新设置状态</button></div>
      ${provider === 'mjai' ? '<p class="muted">当前来源：自选本地 mjai 引擎。需授权对局、全部公开牌河、自家手牌及本局动作顺序；仅支持无副露四麻决策。</p>' : ''}
      <label><input id="model-game" type="checkbox" ${selection.game ? 'checked' : ''}> 对局信息（点数、宝牌、副露、立直等）</label>
      <label>发送牌河 <select id="model-rivers"><option value="none">不发送</option><option value="all">所有玩家</option>${current.seatLabels.map((label, i) => `<option value="${i}">${escape(label)}</option>`).join('')}</select></label>
      <label><input id="model-hand" type="checkbox" ${selection.hand ? 'checked' : ''}> 授权发送自家手牌（需选定自家座位）</label>
      <label>分析内容 <select id="model-task"><option value="combined">综合攻守</option><option value="danger">危险牌</option><option value="efficiency">牌效率</option></select></label>
      <p class="muted">${selection.hand ? '点击分析时发送已授权的数据。' : '未发送自家手牌：不能建议具体弃牌。'}</p>
      <div class="analysis-calibration"><button id="analysis-calibrate" ${current.hintsReady ? '' : 'disabled'}>${current.hintsCalibrated ? '重新校准手牌提示' : '校准手牌提示'}</button><p class="muted">${current.hintsReady ? '首次使用需校准手牌位置；可随时重新校准。' : '进入游戏牌桌后可校准手牌提示。'}</p></div><button id="model-preview">${preview ? '收起' : '预览'}发送数据</button>${preview ? `<pre>${escape(payload || error)}</pre>` : ''}${error ? `<p class="warn">${escape(error)}</p>` : ''}`;
    container.innerHTML = `<link rel="stylesheet" href="${escape(styleUrl)}"><section class="analysis" aria-label="模型分析">
      <header class="analysis-heading"><strong>${escape(roundLabel)}${selfLabel ? ` · 自家${escape(selfLabel)}` : ''}</strong><span class="analysis-state">${busy ? '分析中' : enabled ? '手动分析' : '模型未开启'}</span></header>
      ${(current.riichiLabels || []).length ? `<p class="analysis-riichi">立直警戒 · ${(current.riichiLabels || []).map(escape).join(' · ')}</p>` : ''}
      <div class="analysis-main" role="status" aria-live="polite">
      ${stale ? '<p class="warn analysis-stale">局面或发送范围已变化，以下为旧结果，请重新分析。</p>' : ''}
      ${r ? `<div class="analysis-decision"><span>${escape(decisionLabel(result))}</span>${r.decision.tile ? face(r.decision.tile) : ''}<p>${escape(r.decision.reasons?.[0] || '请结合当前局面判断。')}</p></div>${candidateHtml}` : `<div class="analysis-empty"><strong>${busy ? '正在读取所选局面…' : !current.round ? '等待开局数据' : '查看局面，再决定是否分析'}</strong><p class="muted">${!available ? '离线演示不发送模型请求。' : enabled ? '仅在你点击分析时发送所选数据。' : '在分析设置中接入自己的模型。'}</p></div>`}
      ${current.phase !== 'playing' || context?.mode !== 'live' ? '<p class="muted">历史或结算局面 · 仅作复盘</p>' : ''}
      ${failure ? `<p class="warn">${escape(failure)}</p>` : ''}
      </div>
      <div class="analysis-actions"><button id="model-run" ${!enabled || busy || !!error ? 'disabled' : ''}>${busy ? '正在分析…' : '分析当前局面'}</button>${busy ? '<button id="model-cancel">取消</button>' : ''}</div>
      ${disclosure('reasons', '详细分析', `${handSection}${r ? `${resultHtml(result)}${localHtml(result.localAnalysis, result.positionPhase)}<p class="analysis-meta muted">${escape(result.model)} · ${escape(result.time)}${stale ? ' · 旧结果' : ' · 对应分析时快照'}</p>` : '<p class="muted">尚未生成分析结果。</p>'}`)}
      ${disclosure('controls', '分析设置 · 发送范围', settings)}
      <footer class="analysis-footer"><button id="analysis-collector">牌局获取器</button><button id="analysis-history">整场记录</button></footer>
      </section>`;
    const $ = id => container.querySelector('#' + id);
    const section = container.querySelector('.analysis'); if (section) section.scrollTop = oldScroll;
    for (const detail of container.querySelectorAll?.('details[data-section]') || []) { detail.open = !!detailsState[detail.dataset.section]; detail.ontoggle = () => { detailsState[detail.dataset.section] = detail.open; }; }
    focusTiles.forEach((tile, index) => { $('model-candidate-' + index).onclick = () => { focusTile = tile; render(); }; });
    $('analysis-calibrate').onclick = () => { if (current?.hintsReady) current.onCalibrateHints?.(); };
    $('analysis-collector').onclick = () => current?.onCollector?.();
    $('analysis-history').onclick = () => current?.onHistory?.();
    $('model-rivers').value = selection.rivers; $('model-task').value = task;
    $('model-settings').onclick = event => { if (event.isTrusted) send({ type: 'model:settings' }).catch(() => { failure = '扩展连接失效，请刷新游戏。'; render(); }); };
    $('model-refresh').onclick = refresh;
    for (const [id, key] of [['model-game', 'game'], ['model-hand', 'hand']]) $(id).onchange = e => { selection[key] = e.target.checked; render(); };
    $('model-rivers').onchange = e => { selection.rivers = e.target.value; render(); };
    $('model-task').onchange = e => { task = e.target.value; requestId++; if (busy) send({ type: 'model:cancel' }).catch(() => {}); busy = false; render(); };
    $('model-preview').onclick = () => { preview = !preview; render(); };
    if (busy) $('model-cancel').onclick = () => {
      requestId++; busy = false; failure = '已取消分析。';
      send({ type: 'model:cancel' }).catch(() => {}); render();
    };
    $('model-run').onclick = async event => {
      if (!event.isTrusted || !enabled || busy || !available) return;
      const id = ++requestId;
      try {
        const data = snapshot(), extra = provider === 'mjai' ? { engineRequest: engineRequest() } : {}, captured = fingerprint(), seatLabels = current.seatLabels.slice(); busy = true; failure = ''; render();
        const response = await send({ type: 'model:analyze', provider, task, snapshot: data, ...extra });
        if (id !== requestId) return;
        if (!response?.ok) throw new Error(response?.error || '模型请求失败，请刷新设置状态后重试。');
        focusTile = null;
        result = { ...response, seatLabels, positionPhase: data.phase, fingerprint: captured, time: new Date().toLocaleTimeString('zh-CN') };
      } catch (e) { if (id === requestId) failure = e.message; }
      finally { if (id === requestId) { busy = false; render(); } }
    };
  }
  globalThis.MJAnalysisPanel = { mount, destroy };
})();
