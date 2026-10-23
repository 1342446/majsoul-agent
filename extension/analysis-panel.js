(function () {
  'use strict';
  const available = typeof chrome !== 'undefined' && !!chrome.runtime?.id;
  const selection = { game: true, rivers: 'all', hand: true };
  const defaults = () => ({ danger: true, efficiency: true, strategy: true, automatic: false, useModel: false, consent: false, modelFromTurn: 1, interval: 8, limit: 20 });
  // Turn policy uses observed own discards; it does not infer unobserved earlier turns.
  let previousDiscards = 0;
  let preferences = defaults(), preferencesLoaded = false, autoTimer = null, lastPosition = '', pendingFingerprint = '', lastAutoKey = '', roundKey = '', autoCalls = 0, lastModelAt = 0;
  function selectedTask() { return preferences.strategy || (preferences.danger && preferences.efficiency) ? 'combined' : preferences.danger ? 'danger' : 'efficiency'; }
  function hasFeatures() { return preferences.danger || preferences.efficiency || preferences.strategy; }
  function turnNumber(data) { return (data?.rivers?.find(r => r.seat === data.selfSeat)?.discards.length || 0) + 1; }
  function usesModel(data) { return preferences.useModel && turnNumber(data) >= preferences.modelFromTurn; }
  function cancelWork() {
    if (autoTimer !== null) clearTimeout(autoTimer); autoTimer = null;
    requestId++;
    if (busy && available) send({ type: 'model:cancel' }).catch(() => {});
    busy = false; pendingFingerprint = '';
  }
  function savePreferences() {
    if (available) send({ type: 'model:preferences', preferences: { ...preferences } }).then(response => {
      if (!response?.ok) { failure = '偏好未保存，请重试。'; repaint?.(); }
    }).catch(() => { failure = '偏好未保存，请刷新扩展。'; repaint?.(); });
  }
  function changePreferences(patch) {
    cancelWork(); preferences = { ...preferences, ...patch }; task = selectedTask(); result = null; failure = ''; lastAutoKey = ''; preparationKey = ''; preparation = null;
    savePreferences(); repaint?.();
  }
  function localResponse(data) {
    const local = MJAnalysis.prepare(data, task).data.localAnalysis;
    const candidates = [...(local.efficiency?.candidates || [])].sort((a, b) => a.shanten - b.shanten || b.totalUnseenUpperBound - a.totalUnseenUpperBound);
    const best = local.efficiency?.shanten === -1 ? null : candidates[0];
    return { ok: true, model: '本地分析 · 未调用模型', localAnalysis: local,
      result: { task, danger: (local.danger?.candidates || []).map(c => ({ tile: c.tile, opponents: c.opponents.map(o => ({ seat: o.seat, level: o.genbutsu ? 'safe' : 'unknown', reasons: [o.genbutsu ? '该对手牌河已有此牌（现物）' : '无法仅凭本地规则确定危险等级', ...(o.sujiReferences.length ? ['筋参考：' + o.sujiReferences.map(MJSnapshotContract.label).join('、')] : []), ...(o.kabeReferences.length ? ['壁参考：' + o.kabeReferences.map(MJSnapshotContract.label).join('、')] : [])] })) })),
      efficiency: candidates.map(c => ({ tile: c.tile, reasons: [`${c.shanten} 向听，有效牌未见合计上界 ${c.totalUnseenUpperBound} 枚`] })), decision: { action: 'unknown', tile: data.phase === 'playing' && best ? best.tile : null, reasons: [best ? `仅按牌效率比较：打出${MJSnapshotContract.label(best.tile)}后 ${best.shanten} 向听，有效牌未见合计 ≤${best.totalUnseenUpperBound} 枚；未综合放铳风险。` : local.efficiency?.shanten === -1 ? '当前手牌已成和牌形；是否可以和牌还需确认役种与规则。' : '本地分析提供确定性依据，不生成综合攻守结论。'] },
      limitations: local.danger?.limitations || [] } };
  }
  async function runAnalysis(automatic = false) {
    if (busy || !hasFeatures()) return;
    const id = ++requestId;
    try {
      const data = snapshot(), external = usesModel(data);
      if (external && (!available || !enabled || !preferences.consent)) throw new Error('请先接入并开启模型，并确认数据授权。');
      const actualProvider = external ? provider : 'local';
      const extra = external && provider === 'mjai' ? { engineRequest: engineRequest() } : {};
      const captured = fingerprint(), seatLabels = current.seatLabels.slice();
      pendingFingerprint = captured; busy = true; failure = '';
      if (automatic && external) { autoCalls++; lastModelAt = Date.now(); }
      repaint?.();
      const response = external ? await send({ type: 'model:analyze', provider, task, snapshot: data, ...extra }) : localResponse(data);
      if (id !== requestId || captured !== fingerprint()) return;
      if (!response?.ok) throw new Error(response?.error || '分析失败，请重试。');
      // A combined backend request may supply extra sections; display only enabled help.
      if (!preferences.danger) response.result.danger = [];
      if (!preferences.efficiency) { response.result.efficiency = []; if (response.localAnalysis) delete response.localAnalysis.efficiency; }
      if (!preferences.strategy && task === 'combined') response.result.decision = localResponse(data).result.decision;
      if (actualProvider === 'local' && !preferences.efficiency) response.result.decision = { action: 'unknown', tile: null, reasons: [preferences.strategy ? '综合攻守解释需要模型；本地仅提供已开启的确定性依据。' : '本地仅提供危险牌依据，不生成弃牌建议。'] };
      focusTile = null;
      result = { ...response, actualProvider, seatLabels, positionPhase: data.phase, fingerprint: captured, time: new Date().toLocaleTimeString('zh-CN') };
    } catch (e) { if (id === requestId) failure = e.message; }
    finally { if (id === requestId) { busy = false; pendingFingerprint = ''; repaint?.(); } }
  }
  function scheduleAnalysis(data) {
    if (autoTimer !== null) clearTimeout(autoTimer); autoTimer = null;
    if (!preferencesLoaded || !preferences.automatic || busy || !hasFeatures() || context?.mode !== 'live' || current.phase !== 'playing' || !data) return;
    const local = MJAnalysis.prepare(data, 'combined').data.localAnalysis.efficiency;
    if (!Number.isInteger(data.selfSeat) || data.game?.recentActor !== data.selfSeat || !local?.canDiscard) return;
    const key = fingerprint(); if (lastAutoKey === key) return;
    const external = usesModel(data);
    if (external && (!enabled || !preferences.consent || !available || autoCalls >= preferences.limit)) return;
    const delay = external ? Math.max(350, preferences.interval * 1000 - (Date.now() - lastModelAt)) : 100;
    autoTimer = setTimeout(() => { autoTimer = null; if (key !== fingerprint()) return; lastAutoKey = key; runAnalysis(true); }, delay);
  }
  let task = 'combined', enabled = false, busy = false, result = null, failure = '', preview = false, provider = 'chat';
  let focusTile = null, hooks = {}, detailsState = {}, current, context, repaint, requestId = 0, lifecycle = 0, connected = false;
  const send = message => chrome.runtime.sendMessage(message);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const tileBase = available ? chrome.runtime.getURL('tiles/') : new URL('tiles/', document.currentScript?.src || new URL('../extension/analysis-panel.js', location.href)).href;
  const styleUrl = available ? chrome.runtime.getURL('analysis-panel.css') : new URL('analysis-panel.css', document.currentScript?.src || new URL('../extension/analysis-panel.js', location.href)).href;
  const rendered = new WeakMap();
  const face = t => /^(?:[0-9][mps]|[1-7]z)$/.test(t) ? `<img class="analysis-tile" src="${escape(tileBase + t + '.svg')}" alt="${escape(MJSnapshotContract.label(t))}" title="${escape(MJSnapshotContract.label(t))}">` : escape(t);
  const reasons = values => (values || []).map(escape).join('；');
  const actionNames = { attack: '进攻', defend: '回避', fold: '弃和', unknown: '暂无法判断' };
  const riskNames = { safe: '现物', low: '较低', medium: '中等', high: '较高', unknown: '未知' };
  const decisionLabel = response => response?.actualProvider === 'local' ? '本地分析' : ({ reach: '立直意向', none: '跳过响应' })[response?.engine?.action?.type] || actionNames[response?.result?.decision?.action] || '暂无法判断';
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
    if (task !== 'combined') throw new Error('本地 mjai 仅支持综合决策，请开启攻守建议。');
    return current.engineRequest(selection);
  }
  let preparationKey = '', preparation = null, preparationError = '', preparationBusy = false;
  function requestPreparation(data) {
    const generation = lifecycle, taskAtRequest = task, external = usesModel(data), extra = { provider: external ? provider : 'local', ...(external && provider === 'mjai' ? { engineRequest: engineRequest() } : {}) }, key = JSON.stringify([taskAtRequest, data, extra]);
    if (key === preparationKey) return;
    preparationKey = key; preparation = null; preparationError = ''; preparationBusy = true;
    const pending = available && external ? send({ type: 'model:prepare', task: taskAtRequest, snapshot: data, ...extra }) : new Promise(resolve => setTimeout(() => {
      try { resolve({ ok: true, data: MJAnalysis.prepare(data, taskAtRequest).data }); } catch (e) { resolve({ ok: false, error: e.message }); }
    }, 0));
    pending.then(response => { if (key !== preparationKey || generation !== lifecycle) return;
      if (!response?.ok) preparationError = response?.error || '无法整理局面数据。'; else preparation = response.data;
    }).catch(e => { if (key === preparationKey && generation === lifecycle) preparationError = e.message; }).finally(() => { if (key === preparationKey && generation === lifecycle) { preparationBusy = false; repaint?.(); } });
  }
  function fingerprint() { try { return JSON.stringify({ provider, preferences, task, context, round: current.round, phase: current.phase, hand: current.selfHand, drawnTile: current.drawnTile, snapshot: snapshot() }); } catch (_) { return ''; } }
  async function refresh() {
    if (!available) return;
    const generation = lifecycle;
    try { const status = await send({ type: 'model:status' });
      if (generation !== lifecycle) return;
      const nextProvider = status?.provider === 'mjai' ? 'mjai' : 'chat';
      if (enabled !== !!status?.enabled || provider !== nextProvider) { result = null; preparationKey = ''; preparation = null; }
      if (!preferencesLoaded) { preferences = { ...defaults(), ...status?.preferences }; preferencesLoaded = true; task = selectedTask(); }
      provider = nextProvider;
      enabled = !!status?.enabled; }
    catch (_) { if (generation !== lifecycle) return; enabled = false; preferencesLoaded = true; }
    repaint?.();
  }
  function configChanged(changes, area) {
    if (area === 'local' && changes.modelConfig) { cancelWork(); result = null; hooks.onHints?.(null); refresh(); }
  }
  function connect() {
    if (!available) { preferencesLoaded = true; return; }
    if (connected) return;
    connected = true;
    chrome.storage.onChanged.addListener(configChanged);
    window.addEventListener('focus', refresh);
    refresh();
  }
  function destroy() {
    cancelWork(); preferences = defaults(); preferencesLoaded = false; lastPosition = ''; lastAutoKey = ''; roundKey = ''; previousDiscards = 0; autoCalls = 0; lastModelAt = 0;
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
    selection.game = true; selection.rivers = 'all'; selection.hand = true; task = 'combined';
  }
  function mount(container, analysisView, position, render, nextHooks = {}) {
    let content = container.querySelector('[data-analysis-content]');
    if (!content) {
      container.innerHTML = `<link rel="stylesheet" href="${escape(styleUrl)}"><div data-analysis-content></div>`;
      content = container.querySelector('[data-analysis-content]');
    }
    container = content;
    const oldScroll = container.querySelector?.('.analysis')?.scrollTop || 0;
    for (const detail of container.querySelectorAll?.('details[data-section]') || []) detailsState[detail.dataset.section] = detail.open;
    if (hooks.onHints && hooks.onHints !== nextHooks.onHints) hooks.onHints(null);
    hooks = nextHooks;
    const sourceChanged = context && (context.mode !== position?.mode || context.replayRevision !== position?.replayRevision || JSON.stringify(context.historyView) !== JSON.stringify(position?.historyView));
    const cursorChanged = context && context.cursor !== position?.cursor;
    if (sourceChanged || cursorChanged) {
      requestId++;
      if (busy && available) send({ type: 'model:cancel' }).catch(() => {});
      busy = false; failure = ''; preparationKey = ''; preparation = null; preparationError = ''; preparationBusy = false;
      if (sourceChanged) { result = null; focusTile = null; }
    }
    current = analysisView; context = { ...position }; repaint = render;
    connect();
    const positionKey = fingerprint();
    if (pendingFingerprint && pendingFingerprint !== positionKey) cancelWork();
    if (lastPosition !== positionKey) { lastPosition = positionKey; if (autoTimer !== null) clearTimeout(autoTimer); autoTimer = null; }
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
    const activeResult = (live || context?.mode === 'replay') && !stale ? r : null;
    const kind = tile => String(tile).replace(/^0([mps])$/, '5$1');
    const drawnIndex = current.drawnTile ? hand.lastIndexOf(current.drawnTile) : -1;
    const handFace = (tile, index) => {
      const suggested = !!activeResult?.decision.tile && activeResult.decision.tile === tile;
      const dangerous = !!activeResult?.danger.some(d => kind(d.tile) === kind(tile) && d.opponents.some(o => o.level === 'high'));
      const label = [MJSnapshotContract.label(tile), index === drawnIndex ? '摸牌' : '', suggested ? '建议' : '', dangerous ? '高危' : ''].filter(Boolean).join(' · ');
      return `<span class="analysis-hand-tile${suggested ? ' is-suggested' : ''}${dangerous ? ' is-dangerous' : ''}" aria-label="${escape(label)}" title="${escape(label)}">${face(tile)}</span>`;
    };
    const handHtml = `<div class="analysis-hand-tiles" style="--hand-count:${Math.max(hand.length, 1)};--concealed-count:${Math.max(hand.length - (drawnIndex >= 0 ? 1 : 0), 1)}"><div class="analysis-hand-concealed">${hand.map((tile, i) => i !== drawnIndex ? handFace(tile, i) : '').join('')}</div>${drawnIndex >= 0 ? `<div class="analysis-hand-drawn">${handFace(hand[drawnIndex], drawnIndex)}</div>` : ''}</div>`;
    const handSection = hand.length ? `<div class="analysis-hand" aria-label="当前自家手牌"><small class="muted">当前自家手牌</small>${handHtml}</div>` : '';
    const focusTiles = [...new Set([r?.decision.tile, ...candidateTiles])].filter(Boolean);
    if (!focusTiles.includes(focusTile)) focusTile = r?.decision.tile || focusTiles[0] || null;
    const focusedDanger = (r?.danger || []).filter(d => kind(d.tile) === kind(focusTile)).flatMap(d => d.opponents.map(o => `${result.seatLabels?.[o.seat] || ('座位 ' + o.seat)} · ${riskNames[o.level] || '未知'}：${(o.reasons || []).join('；')}`));
    const focusedEfficiency = (r?.efficiency || []).filter(e => e.tile === focusTile).flatMap(e => e.reasons || []);
    const focusSummary = focusTile ? `<div class="analysis-focus" aria-label="候选牌解释"><small>${escape(MJSnapshotContract.label(focusTile))} · ${focusTile === r?.decision.tile ? '首选建议' : '候选解释'}</small><p>${escape([...focusedDanger, ...focusedEfficiency].join('；') || '暂无该牌的额外解释，请展开详细分析查看完整依据。')}</p></div>` : '';
    const candidateHtml = focusTiles.length ? `<div class="analysis-candidates"><span class="muted">比较</span>${focusTiles.map((tile, index) => `<button id="model-candidate-${index}" data-candidate-tile="${escape(tile)}" aria-pressed="${tile === focusTile}" aria-label="查看${escape(MJSnapshotContract.label(tile))}的风险和效率理由">${face(tile)}</button>`).join('')}</div>${focusSummary}` : '';
    const roundLabel = current.round ? `${['东', '南', '西', '北'][current.round.wind] || '东'}${Number(current.round.index) + 1}局` : '等待开局';
    const selfLabel = Number.isInteger(current.selfSeat) ? current.seatLabels[current.selfSeat] : '';
    const replay = context?.mode === 'replay', recordCount = current.recordCount || 0, cursor = context?.cursor || 0;
    const modeControls = typeof current.onMode === 'function' ? `<div class="analysis-modes" role="group" aria-label="分析模式"><button id="analysis-mode-live" aria-pressed="${context?.mode === 'live'}">实时对局</button><button id="analysis-mode-replay" aria-pressed="${replay}">牌谱复盘</button></div>` : '';
    const replayControls = replay ? `<div class="analysis-replay">
      ${recordCount ? `<div class="analysis-replay-heading"><label>复盘视角 <select id="analysis-replay-seat" aria-label="复盘视角"><option value="">请选择</option>${current.seatLabels.map((label, i) => `<option value="${i}">${escape(label)}</option>`).join('')}</select></label><span class="muted">事件 ${cursor} / ${recordCount}</span></div>
      <input id="analysis-replay-cursor" aria-label="复盘事件游标" type="range" min="0" max="${recordCount}" value="${cursor}">
      <div class="controls"><button id="analysis-replay-start">本局开局</button><button id="analysis-replay-prev" ${cursor <= 0 ? 'disabled' : ''}>上一事件</button><button id="analysis-replay-next" ${cursor >= recordCount ? 'disabled' : ''}>下一事件</button></div>
      <p class="muted">按所选事件分析，游标需手动与游戏画面对齐。</p>` : '<p class="muted">请在雀魂中打开牌谱，载入后可选择视角和分析位置。</p>'}
      </div>` : '';

    const settings = `<div class="controls"><button id="model-settings" ${!available ? 'disabled' : ''}>模型设置</button><button id="model-refresh" ${!available ? 'disabled' : ''}>刷新设置状态</button></div>
      ${preferences.useModel && provider === 'mjai' ? '<p class="muted">当前来源：自选本地 mjai 引擎。需授权对局、全部公开牌河、自家手牌及本局动作顺序；仅支持无副露四麻决策。</p>' : ''}
      <label>模型调用时机 <select id="model-from-turn"><option value="1">每巡</option><option value="7">第 N 巡起</option></select></label>
      ${preferences.modelFromTurn > 1 ? `<label>开始巡数 <input id="model-turn-number" type="number" min="2" max="18" value="${preferences.modelFromTurn}"></label>` : ''}
      <p class="muted">巡数按自家牌河张数加一计算；达到设定巡数前使用本地分析。复盘仅手动分析。</p>
      <label>模型最小调用间隔（秒） <input id="model-interval" type="number" min="1" max="60" value="${preferences.interval}"></label>
      <label>每局自动模型调用上限 <input id="model-limit" type="number" min="1" max="100" value="${preferences.limit}"></label>
      <p class="muted">本局已自动调用 ${autoCalls} / ${preferences.limit} 次。手动分析不受自动调用上限限制。</p>
      ${preferences.useModel ? `<p class="muted">模型分析会向你配置的服务发送对局公开信息与自家手牌，可能产生费用。不发送对手暗牌或账号凭据。</p><button id="model-consent">${preferences.consent ? '撤回模型数据授权' : '同意以上数据用于模型分析'}</button>` : '<p class="muted">当前仅本地分析，不向模型接口发送数据。提供向听、进张及现物／筋／壁依据；综合攻守解释需要模型。</p>'}
      <div class="analysis-calibration"><button id="analysis-calibrate" ${current.hintsReady ? '' : 'disabled'}>${current.hintsCalibrated ? '重新校准手牌提示' : '校准手牌提示'}</button><p class="muted">${current.hintsReady ? '首次使用需校准手牌位置；可随时重新校准。' : '进入游戏牌桌后可校准手牌提示。'}</p></div><button id="model-preview">${preview ? '收起' : '查看'}分析数据</button>${preview ? `<pre>${escape(payload || error)}</pre>` : ''}${error ? `<p class="warn">${escape(error)}</p>` : ''}`;
    const markup = `<section class="analysis" aria-label="模型分析">
      ${modeControls}${replayControls}
      <div class="analysis-switches" role="group" aria-label="辅助功能">
      <label><input id="model-auto" type="checkbox" ${preferences.automatic ? 'checked' : ''}> 自动分析</label>
      <label><input id="model-use" type="checkbox" ${preferences.useModel ? 'checked' : ''}> 调用模型</label>
      ${[['danger', '危险牌提示'], ['efficiency', '手牌建议'], ['strategy', '攻守建议']].map(([key, label]) => `<label><input id="feature-${key}" type="checkbox" ${preferences[key] ? 'checked' : ''}> ${label}</label>`).join('')}
      <button id="model-preset">综合辅助</button></div>
      <header class="analysis-heading"><strong>${escape(roundLabel)}${selfLabel ? ` · ${replay ? '视角' : '自家'}${escape(selfLabel)}` : ''}</strong><span class="analysis-state">${busy ? '分析中' : !preferences.useModel ? '仅本地分析' : preferences.automatic ? '自动分析' : '手动分析'}</span></header>
      ${(current.riichiLabels || []).length ? `<p class="analysis-riichi">${replay ? '已立直' : '立直警戒'} · ${(current.riichiLabels || []).map(escape).join(' · ')}</p>` : ''}
      <div class="analysis-main" role="status" aria-live="polite">
      ${stale ? '<p class="warn analysis-stale">局面或分析功能已变化，以下为旧结果，请重新分析。</p>' : ''}
      ${r ? `<div class="analysis-decision"><span>${escape(decisionLabel(result))}</span>${r.decision.tile ? face(r.decision.tile) : ''}<p>${escape(r.decision.reasons?.[0] || '请结合当前局面判断。')}</p></div>${candidateHtml}` : `<div class="analysis-empty"><strong>${busy ? '正在读取所选局面…' : !current.round ? '等待开局数据' : preferences.automatic ? '等待自己的出牌决策' : '点击分析当前局面'}</strong><p class="muted">${!hasFeatures() ? '请至少开启一项辅助功能。' : preferences.useModel ? !preferences.consent ? '请展开设置，确认模型数据授权。' : !enabled ? '请在模型设置中接入并开启模型。' : `第 ${preferences.modelFromTurn} 巡起调用模型，此前使用本地分析。` : '仅本地计算，不调用模型。'}</p></div>`}
      ${replay ? '' : current.phase !== 'playing' || context?.mode !== 'live' ? '<p class="muted">历史或结算局面 · 仅作复盘</p>' : ''}
      ${failure ? `<p class="warn">${escape(failure)}</p>` : ''}
      </div>
      <div class="analysis-actions"><button id="model-run" ${busy || !!error || !hasFeatures() || !preferencesLoaded ? 'disabled' : ''}>${busy ? '正在分析…' : replay ? '分析所选局面' : '分析当前局面'}</button>${busy ? '<button id="model-cancel">取消</button>' : ''}</div>
      ${disclosure('reasons', '详细分析', `${handSection}${r ? `${resultHtml(result)}${localHtml(result.localAnalysis, result.positionPhase)}<p class="analysis-meta muted">${escape(result.model)} · ${escape(result.time)}${stale ? ' · 旧结果' : ' · 对应分析时快照'}</p>` : '<p class="muted">尚未生成分析结果。</p>'}`)}
      ${disclosure('controls', '分析设置 · 调用时机与数据授权', settings)}
      <footer class="analysis-footer"><button id="analysis-collector">牌局获取器</button><button id="analysis-history">整场记录</button></footer>
      </section>`;
    // Native disclosure toggles already update the DOM; do not rebuild the form
    // on the next status update just to reflect the same open attribute.
    const renderKey = markup.replace(/(<details data-section="[^"]+")\s*(?:open)?\s*>/g, '$1>');
    if (rendered.get(container) !== renderKey) { container.innerHTML = markup; rendered.set(container, renderKey); }
    const $ = id => container.querySelector('#' + id);
    if (modeControls) {
      $('analysis-mode-live').onclick = () => current.onMode('live');
      $('analysis-mode-replay').onclick = () => current.onMode('replay');
    }
    if (replay && recordCount) {
      $('analysis-replay-seat').value = Number.isInteger(current.selfSeat) ? String(current.selfSeat) : '';
      $('analysis-replay-seat').onchange = e => current.onSelfSeat?.(e.target.value === '' ? null : Number(e.target.value));
      $('analysis-replay-cursor').onchange = e => current.onCursor?.(Number(e.target.value));
      $('analysis-replay-start').onclick = () => current.onRoundStart?.();
      $('analysis-replay-prev').onclick = () => { if (cursor > 0) current.onCursor?.(cursor - 1); };
      $('analysis-replay-next').onclick = () => { if (cursor < recordCount) current.onCursor?.(cursor + 1); };
    }
    const section = container.querySelector('.analysis'); if (section) section.scrollTop = oldScroll;
    for (const detail of container.querySelectorAll?.('details[data-section]') || []) { detail.open = !!detailsState[detail.dataset.section]; detail.ontoggle = () => { detailsState[detail.dataset.section] = detail.open; }; }
    focusTiles.forEach((tile, index) => { $('model-candidate-' + index).onclick = () => { focusTile = tile; render(); }; });
    $('analysis-calibrate').onclick = () => { if (current?.hintsReady) current.onCalibrateHints?.(); };
    $('analysis-collector').onclick = () => current?.onCollector?.();
    $('analysis-history').onclick = () => current?.onHistory?.();
    $('model-settings').onclick = event => { if (event.isTrusted) send({ type: 'model:settings' }).catch(() => { failure = '扩展连接失效，请刷新游戏。'; render(); }); };
    $('model-refresh').onclick = refresh;
    for (const key of ['danger', 'efficiency', 'strategy']) $('feature-' + key).onchange = e => { if (e.isTrusted) changePreferences({ [key]: e.target.checked }); };
    $('model-auto').onchange = e => { if (e.isTrusted) changePreferences({ automatic: e.target.checked }); };
    $('model-use').onchange = e => { if (e.isTrusted) changePreferences({ useModel: e.target.checked }); };
    $('model-preset').onclick = e => { if (e.isTrusted) changePreferences({ danger: true, efficiency: true, strategy: true }); };
    if (preferences.useModel) $('model-consent').onclick = e => { if (e.isTrusted) changePreferences({ consent: !preferences.consent }); };
    $('model-from-turn').value = preferences.modelFromTurn === 1 ? '1' : '7';
    $('model-from-turn').onchange = e => { if (e.isTrusted) changePreferences({ modelFromTurn: Number(e.target.value) === 1 ? 1 : 7 }); };
    for (const [id, key, min, max] of [['model-turn-number', 'modelFromTurn', 2, 18], ['model-interval', 'interval', 1, 60], ['model-limit', 'limit', 1, 100]]) {
      if (key === 'modelFromTurn' && preferences.modelFromTurn === 1) continue;
      $(id).onchange = e => { if (e.isTrusted) changePreferences({ [key]: Math.min(max, Math.max(min, Math.trunc(Number(e.target.value)) || min)) }); };
    }
    $('model-preview').onclick = () => { preview = !preview; render(); };
    if (busy) $('model-cancel').onclick = event => { if (event.isTrusted) { cancelWork(); failure = '已取消分析。'; render(); } };
    $('model-run').onclick = event => { if (event.isTrusted && preferencesLoaded) { lastAutoKey = fingerprint(); return runAnalysis(); } };
    if (selectedSnapshot && context?.mode === 'live') {
      const nextRound = JSON.stringify([ selectedSnapshot.game?.round, selectedSnapshot.game?.honba]);
      if (nextRound !== roundKey || (selectedSnapshot.rivers?.find(r => r.seat === selectedSnapshot.selfSeat)?.discards.length || 0) < previousDiscards) { roundKey = nextRound; autoCalls = 0; lastAutoKey = ''; }
      previousDiscards = selectedSnapshot.rivers?.find(r => r.seat === selectedSnapshot.selfSeat)?.discards.length || 0;
    }
    try { scheduleAnalysis(selectedSnapshot); } catch (_) { /* Missing or invalid hands wait for a valid decision. */ }
  }
  globalThis.MJAnalysisPanel = { mount, destroy };
})();
