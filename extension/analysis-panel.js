(function () {
  'use strict';
  const available = typeof chrome !== 'undefined' && !!chrome.runtime?.id;
  const selection = { game: true, rivers: 'all', hand: false };
  let task = 'combined', enabled = false, busy = false, result = null, failure = '', preview = false;
  let current, context, repaint, requestId = 0, lifecycle = 0, connected = false;
  const send = message => chrome.runtime.sendMessage(message);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const tileBase = available ? chrome.runtime.getURL('tiles/') : new URL('tiles/', document.currentScript?.src || new URL('../extension/analysis-panel.js', location.href)).href;
  const face = t => /^(?:[0-9][mps]|[1-7]z)$/.test(t) ? `<img class="analysis-tile" src="${escape(tileBase + t + '.svg')}" alt="${escape(MJSnapshotContract.label(t))}" title="${escape(MJSnapshotContract.label(t))}">` : escape(t);
  const reasons = values => (values || []).map(escape).join('；');
  const actionNames = { attack: '进攻', defend: '回避', fold: '弃和', unknown: '暂无法判断' };
  const riskNames = { safe: '现物', low: '较低', medium: '中等', high: '较高', unknown: '未知' };
  function resultHtml(response) {
    const r = response.result;
    if (!r) return '';
    return `${r.danger.length ? '<h4>逐对手危险牌</h4>' + r.danger.map(d => `<div class="analysis-card">${face(d.tile)}${d.opponents.map(o => `<p>${escape(response.seatLabels?.[o.seat] || ('座位 ' + o.seat))} · ${escape(riskNames[o.level])}：${reasons(o.reasons)}</p>`).join('')}</div>`).join('') : ''}
      ${r.efficiency.length ? '<h4>牌效率解释</h4>' + r.efficiency.map(e => `<div class="analysis-card">${face(e.tile)} ${reasons(e.reasons)}</div>`).join('') : ''}
      <h4>建议</h4><p>${escape(actionNames[r.decision.action])} ${r.decision.tile ? face(r.decision.tile) : ''} ${reasons(r.decision.reasons)}</p>
      ${r.limitations.length ? `<p class="warn">${reasons(r.limitations)}</p>` : ''}
      ${response.trace ? `<details><summary>Agent 运行记录</summary><ol>${response.trace.events.map(event => `<li>${escape(event.tool)} · ${escape(event.status)} · ${escape(event.elapsedMs)} ms</li>`).join('')}</ol></details>` : ''}`;
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
  let preparationKey = '', preparation = null, preparationError = '', preparationBusy = false;
  function requestPreparation(data) {
    const generation = lifecycle, taskAtRequest = task, key = JSON.stringify([taskAtRequest, data]);
    if (key === preparationKey) return;
    preparationKey = key; preparation = null; preparationError = ''; preparationBusy = true;
    const pending = available ? send({ type: 'model:prepare', task: taskAtRequest, snapshot: data }) : new Promise(resolve => setTimeout(() => {
      try { resolve({ ok: true, data: MJAnalysis.prepare(data, taskAtRequest).data }); } catch (e) { resolve({ ok: false, error: e.message }); }
    }, 0));
    pending.then(response => { if (key !== preparationKey || generation !== lifecycle) return;
      if (!response?.ok) preparationError = response?.error || '无法整理局面数据。'; else preparation = response.data;
    }).catch(e => { if (key === preparationKey && generation === lifecycle) preparationError = e.message; }).finally(() => { if (key === preparationKey && generation === lifecycle) { preparationBusy = false; repaint?.(); } });
  }
  function fingerprint() { try { return JSON.stringify({ task, context, round: current.round, phase: current.phase, snapshot: snapshot() }); } catch (_) { return ''; } }
  async function refresh() {
    if (!available) return;
    const generation = lifecycle;
    try { const status = await send({ type: 'model:status' });
      if (generation !== lifecycle) return;
      if (enabled !== !!status?.enabled) result = null;
      enabled = !!status?.enabled; }
    catch (_) { if (generation !== lifecycle) return; enabled = false; }
    repaint?.();
  }
  function configChanged(changes, area) {
    if (area === 'local' && changes.modelConfig) { requestId++; busy = false; result = null; send({ type: 'model:cancel' }).catch(() => {}); refresh(); }
  }
  function connect() {
    if (!available || connected) return;
    connected = true;
    chrome.storage.onChanged.addListener(configChanged);
    window.addEventListener('focus', refresh);
    refresh();
  }
  function destroy() {
    lifecycle++; requestId++;
    if (available && connected) {
      chrome.storage.onChanged.removeListener(configChanged);
      window.removeEventListener('focus', refresh);
      if (busy) send({ type: 'model:cancel' }).catch(() => {});
    }
    connected = false; enabled = false; busy = false; result = null; failure = ''; preview = false;
    current = null; context = null; repaint = null;
    preparationKey = ''; preparation = null; preparationError = ''; preparationBusy = false;
    selection.game = true; selection.rivers = 'all'; selection.hand = false; task = 'combined';
  }
  function mount(container, analysisView, position, render) {
    current = analysisView; context = position; repaint = render;
    connect();
    const stale = result && result.fingerprint !== fingerprint();
    let payload = '', error = '';
    try { const raw = snapshot(); if (preview) requestPreparation(raw); payload = preparation ? JSON.stringify(preparation, null, 2) : '正在整理实际发送的数据…'; } catch (e) { error = e.message; }
    if (preview && preparationError) error = preparationError;
    container.innerHTML = `<style>
      .analysis{border-top:2px solid #24838a;margin-top:14px;padding-top:8px}.analysis h3{margin:0 0 6px}.analysis label{display:block;margin:7px 0}.analysis select{max-width:100%;padding:4px}.analysis .result{overflow-wrap:anywhere;line-height:1.7;margin-top:8px;padding:8px;background:#e5f0f3;max-height:300px;overflow:auto}.analysis pre{font:11px/1.5 monospace;max-height:180px;overflow:auto;background:#edf3f7;padding:8px;white-space:pre-wrap}.analysis .controls{margin-top:8px}.analysis .analysis-tile{width:27px;height:37px;vertical-align:middle}.analysis h4{margin:8px 0}.analysis .analysis-card{padding:6px;border-bottom:1px solid #b5cbd1}.analysis .analysis-card p{margin:3px 0}.analysis table{width:100%;border-collapse:collapse;font-size:12px}.analysis td,.analysis th{padding:4px;border-bottom:1px solid #b5cbd1;text-align:left}
      </style><section class="analysis" aria-label="模型分析"><h3>模型分析</h3>
      <p class="muted">${!available ? '离线演示不发送模型请求。' : enabled ? '已开启 · 仅点击分析时发送所选数据' : '默认关闭 · 在设置中接入自己的模型'}</p>
      <div class="controls"><button id="model-settings" ${!available ? 'disabled' : ''}>模型设置</button><button id="model-refresh" ${!available ? 'disabled' : ''}>刷新设置状态</button></div>
      <label><input id="model-game" type="checkbox" ${selection.game ? 'checked' : ''}> 对局信息（点数、宝牌、副露、立直等，不含牌河和手牌）</label>
      <label>发送牌河 <select id="model-rivers"><option value="none">不发送</option><option value="all">所有玩家</option>${current.seatLabels.map((label, i) => `<option value="${i}">${escape(label)}</option>`).join('')}</select></label>
      <label><input id="model-hand" type="checkbox" ${selection.hand ? 'checked' : ''}> 自家手牌（需先选定自家座位）</label>
      <label>分析内容 <select id="model-task"><option value="combined">综合攻守</option><option value="danger">危险牌</option><option value="efficiency">牌效率</option></select></label>
      ${error ? `<p class="warn">${escape(error)}</p>` : ''}
      ${!selection.hand ? '<p class="muted">未发送自家手牌：只能分析已选范围，不能建议具体弃牌。</p>' : ''}
      ${preparation?.efficiency?.visibleTiles.partial ? '<p class="muted">已见牌统计不完整；未见枚数仅为上界，不代表牌山剩余枚数。</p>' : ''}
      ${current.phase !== 'playing' ? '<p class="muted">当前为历史或结算局面，分析仅作复盘，不代表轮到自家出牌。</p>' : ''}
      <div class="controls"><button id="model-run" ${!enabled || busy || !!error ? 'disabled' : ''}>${busy ? '正在分析…' : '发送所选数据并分析'}</button><button id="model-preview">${preview ? '收起' : '预览'}发送数据</button>${busy ? '<button id="model-cancel">取消</button>' : ''}</div>
      ${preview ? `<pre>${escape(payload || error)}</pre>` : ''}
      <div role="status" aria-live="polite">${failure ? `<p class="warn">${escape(failure)}</p>` : ''}
      ${result ? `<p class="${stale ? 'warn' : 'muted'}">${stale ? '局面或发送范围已变化，以下为旧结果，请重新分析。' : '对应点击分析时的局面快照'} · ${escape(result.model)} · ${escape(result.time)}</p><div class="result">${localHtml(result.localAnalysis, result.positionPhase)}${resultHtml(result)}</div>` : ''}</div></section>`;
    const $ = id => container.querySelector('#' + id);
    $('model-rivers').value = selection.rivers; $('model-task').value = task;
    $('model-settings').onclick = event => { if (event.isTrusted) send({ type: 'model:settings' }).catch(() => { failure = '扩展连接失效，请刷新游戏。'; render(); }); };
    $('model-refresh').onclick = refresh;
    for (const [id, key] of [['model-game', 'game'], ['model-hand', 'hand']]) $(id).onchange = e => { selection[key] = e.target.checked; render(); };
    $('model-rivers').onchange = e => { selection.rivers = e.target.value; render(); };
    $('model-task').onchange = e => { task = e.target.value; requestId++; if (busy) send({ type: 'model:cancel' }).catch(() => {}); busy = false; result = null; render(); };
    $('model-preview').onclick = () => { preview = !preview; render(); };
    if (busy) $('model-cancel').onclick = () => {
      requestId++; busy = false; failure = '已取消分析。';
      send({ type: 'model:cancel' }).catch(() => {}); render();
    };
    $('model-run').onclick = async event => {
      if (!event.isTrusted) return;
      const id = ++requestId;
      try {
        const data = snapshot(), captured = fingerprint(), seatLabels = current.seatLabels.slice(); busy = true; failure = ''; result = null; render();
        const response = await send({ type: 'model:analyze', task, snapshot: data });
        if (id !== requestId) return;
        if (!response?.ok) throw new Error(response?.error || '模型请求失败，请刷新设置状态后重试。');
        result = { ...response, seatLabels, positionPhase: data.phase, fingerprint: captured, time: new Date().toLocaleTimeString('zh-CN') };
      } catch (e) { if (id === requestId) failure = e.message; }
      finally { if (id === requestId) { busy = false; render(); } }
    };
  }
  globalThis.MJAnalysisPanel = { mount, destroy };
})();
