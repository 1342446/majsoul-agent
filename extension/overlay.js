(function (root) {
  'use strict';
  function create(options) {
  const { controller } = options;
  const S = root.__MJ_OBSERVER_STATE_V1__;
  let host, shadow, theme, collapsed = options.collapsed !== false;
  const detailsState = new Map();
  const cleanup = [];
  let currentView, mode, live, replayState, recordCount, recentEvents, cursor, diagnostics, stats, connections, historyMatches, historyMatchId, historyView, historyWarning;
  function refreshView() {
    const v = currentView = controller.getView();
    ({ mode, live, replayState, recordCount, recentEvents, cursor, diagnostics, stats, historyMatches, historyMatchId, historyView, historyWarning } = v);
    connections = new Map(v.connections);
  }
  function viewedState() { return currentView.historical; }
  const positionStorageKey = 'mj-observer-panel-position-v1';
  let panelPosition = null, panelDrag = null;
  function savePanelPosition() {
    try { localStorage.setItem(positionStorageKey, JSON.stringify(panelPosition)); } catch (_) {}
  }
  function placePanel(position) {
    if (!host) return;
    const rect = host.getBoundingClientRect(), margin = 8;
    position ||= { left: 14, top: innerHeight * .4 };
    panelPosition = {
      left: Math.max(margin, Math.min(position.left, innerWidth - rect.width - margin)),
      top: Math.max(margin, Math.min(position.top, innerHeight - rect.height - margin))
    };
    Object.assign(host.style, { left: panelPosition.left + 'px', top: panelPosition.top + 'px', right: 'auto' });
  }
  function enablePanelDragging() {
    try {
      const saved = JSON.parse(localStorage.getItem(positionStorageKey));
      if (saved && Number.isFinite(saved.left) && Number.isFinite(saved.top)) panelPosition = saved;
    } catch (_) {}
    shadow.addEventListener('pointerdown', event => {
      const path = event.composedPath();
      if (event.button !== 0 || !event.isPrimary || !path.includes(shadow.querySelector('header')) ||
          path.some(node => node instanceof Element && node.matches('button,select,input,a'))) return;
      const rect = host.getBoundingClientRect();
      panelDrag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
      host.setPointerCapture(event.pointerId);
      host.dataset.dragging = 'true';
      event.preventDefault();
    });
    host.addEventListener('pointermove', event => {
      if (!panelDrag || panelDrag.id !== event.pointerId) return;
      placePanel({ left: panelDrag.left + event.clientX - panelDrag.x, top: panelDrag.top + event.clientY - panelDrag.y });
      event.preventDefault();
    });
    function finishDrag(event) {
      if (!panelDrag || (event?.pointerId !== undefined && event.pointerId !== panelDrag.id)) return;
      const id = panelDrag.id;
      panelDrag = null; delete host.dataset.dragging;
      if (host.hasPointerCapture(id)) host.releasePointerCapture(id);
      if (panelPosition) savePanelPosition();
    }
    host.addEventListener('pointerup', finishDrag);
    host.addEventListener('pointercancel', finishDrag);
    host.addEventListener('lostpointercapture', finishDrag);
    const onBlur = () => finishDrag();
    const onResize = () => { placePanel(panelPosition); if (panelPosition) savePanelPosition(); };
    window.addEventListener('blur', onBlur);
    window.addEventListener('resize', onResize);
    const fullscreen = () => {
      if (typeof host.showPopover !== 'function') return;
      if (document.fullscreenElement) {
        host.setAttribute('popover', 'manual');
        if (!host.matches(':popover-open')) host.showPopover();
      } else if (host.hasAttribute('popover')) {
        host.hidePopover(); host.removeAttribute('popover');
      }
      placePanel(panelPosition);
    };
    document.addEventListener('fullscreenchange', fullscreen);
    cleanup.push(() => window.removeEventListener('blur', onBlur), () => window.removeEventListener('resize', onResize), () => document.removeEventListener('fullscreenchange', fullscreen));
    const observer = new ResizeObserver(() => {
      if (!panelPosition || panelDrag) return;
      const previous = panelPosition;
      placePanel(previous);
      if (previous.left !== panelPosition.left || previous.top !== panelPosition.top) savePanelPosition();
    });
    observer.observe(host); cleanup.push(() => observer.disconnect());
    fullscreen();
  }
  const suits = ['东', '南', '西', '北'];
  const windName = wind => suits.includes(wind) ? wind + '家' : '座风待定';
  const eventNames = { NewRound: '开局', DealTile: '摸牌', DiscardTile: '弃牌', ChiPengGang: '吃碰杠', AnGangAddGang: '暗杠/加杠',
    BaBei: '拔北', Hule: '和牌', NoTile: '荒牌流局', LiuJu: '途中流局', MJStart: '对局开始', Unsupported: '未支持事件' };
  const esc = x => String(x ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const tileBase = options.tileBase || 'tiles/';
  const tileHtml = t => /^(?:[0-9][mps]|[1-7]z)$/.test(t)
    ? `<img class="tile" src="${esc(tileBase + t + '.svg')}" alt="${esc(S.label(t))}" title="${esc(S.label(t) + ' (' + t + ')')}" draggable="false">`
    : '<span class="tile unknown" role="img" aria-label="未知牌" title="未知牌">?</span>';
  const handHtml = ts => ts.length ? ts.map(tileHtml).join('') : '<span class="muted">尚无数据</span>';
  function playerHandHtml(hand, drawnTile) {
    const layout = S.handLayout(hand, drawnTile);
    return (layout.tiles.length ? layout.tiles.map(tileHtml).join('') : layout.drawn ? '' : handHtml([]))
      + (layout.drawn ? '<span class="drawn-tile" title="刚摸的牌">' + tileHtml(layout.drawn) + '</span>' : '');
  }
  const discardMethod = t => t.tsumogiri === true ? '摸切' : t.tsumogiri === false ? '手切' : '切牌方式未知';
  function riverHtml(player, label) {
    return `<div class="river tiles" aria-label="${esc(label)}" style="margin-top:5px">${player.discards.length ? player.discards.map(t => `<span class="${t.called ? 'called' : ''} ${t.riichi ? 'riichi' : ''}" title="${t.called ? '已被鸣牌；' : ''}${discardMethod(t)}">${tileHtml(t.tile)}<small>${t.called ? '已鸣' : t.riichi ? '立直' : discardMethod(t)}</small></span>`).join('') : '<span class="muted">牌河：空 / 尚未采集</span>'}</div>`;
  }
  const roundText = s => s.round ? `${suits[s.round.wind] || '?'}${s.round.index + 1}局` : '等待开局';
  const resultText = s => !s.result ? '进行中' : s.result.kind === 'Hule'
    ? s.result.winners.map(w => windName(S.seatWind(s, w.seat)) + (w.tsumo ? '自摸' : '荣和')).join('、') || '和牌'
    : s.result.kind === 'NoTile' ? (s.result.nagashi ? '流局满贯' : '荒牌流局') : s.result.kind === 'LiuJu' ? '途中流局' : '结果未采集';
  function resultHtml(s) {
    if (!s.result) return '';
    const r = s.result;
    return `<section class="round-result" aria-label="本局结果"><h3>本局结果：${esc(resultText(s))}</h3>
      ${r.winners.map(w => `<p>${esc(windName(S.seatWind(s, w.seat)))} ${tileHtml(w.tile)}${w.han ? ' · ' + w.han + ' 番' : ''}${w.fu ? ' · ' + w.fu + ' 符' : ''}</p>`).join('')}
      ${r.scoresKnown ? '<table class="score-table"><thead><tr><th>座风</th><th>结算点数</th><th>本局净变化</th></tr></thead><tbody>' + r.scores.map((score, i) => `<tr><td>${S.seatWind(s, i)}${s.selfSeat === i ? ' · 自家' : ''}</td><td>${score}</td><td>${r.deltas[i] === undefined ? '—' : (r.deltas[i] > 0 ? '+' : '') + r.deltas[i]}</td></tr>`).join('') + '</tbody></table><p class="muted">净变化包含本局立直扣点。</p>' : '<p class="warn">结算点数未获得，后续开局可补齐。</p>'}
      </section>`;
  }
  function historyHtml() {
    const selected = historyMatches.find(m => m.id === historyMatchId) || historyMatches[0];

    const label = m => (m.source === 'replay' ? '牌谱' : '实时对局') + ' · ' + new Date(m.startedAt).toLocaleString('zh-CN', { hour12: false }) + ' · ' + m.rounds.length + '局';
    return `<details id="round-history"><summary>整场记录${selected ? ' · ' + selected.rounds.length + '局' : ''}</summary>
      ${historyWarning ? '<p class="warn">' + esc(historyWarning) + '</p>' : ''}
      <p class="muted">本地保存最近20场；按小局和本场数查看结算快照。刷新后可查看已保存结果。</p>
      ${selected ? `<select id="history-match" aria-label="选择整场记录">${historyMatches.map(m => `<option value="${esc(m.id)}" ${m.id === selected.id ? 'selected' : ''}>${esc(label(m))}</option>`).join('')}</select>
      ${selected.closed ? '<p class="muted">已收到整场结束标记。</p>' : ''}${selected.droppedRounds ? '<p class="warn">仅保留本场最近100局。</p>' : ''}
      <ol class="history-rounds">${selected.rounds.map(r => `<li><span>${roundText(r.snapshot)} · ${r.snapshot.honba}本场<br>${esc(resultText(r.snapshot))}</span><button data-history-round="${esc(r.key)}">查看</button></li>`).join('')}</ol>` : '<p class="muted">尚无已记录的结算。未采集到的历史对局无法自动补回。</p>'}</details>`;
  }
  function eventHtml(e) {
    const text = `${e.step !== undefined ? '#' + e.step + ' ' : ''}${e.seat !== undefined ? windName(e.seatWind) + ' ' : ''}${eventNames[e.kind] || e.kind}`;
    return esc(text) + (e.tile ? ' ' + tileHtml(e.tile) : '') + (e.tiles ? ' ' + e.tiles.map(tileHtml).join(' ') : '')
      + (e.riichi ? ' · 立直' : '') + (e.kind === 'DiscardTile' ? ' · ' + discardMethod(e) : '');
  }
  function exportData() {
    const data = controller.exportData();
    if (options.onExport) return options.onExport(data);
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = `majsoul-observation-${Date.now()}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const css = `
    :host{all:initial;color:var(--mj-text, #f0f2f1);font:13px/1.5 "Microsoft YaHei UI","Microsoft YaHei",sans-serif}:host::backdrop{background:transparent;pointer-events:none}
    *{box-sizing:border-box}button,select,input{font:inherit}button,select{cursor:pointer}
    button{background:var(--mj-surface, #2b343b);border:1px solid var(--mj-border, #46515a);color:var(--mj-text, #f0f2f1);border-radius:5px;padding:5px 9px}
    button:hover{background:var(--mj-hover, #3a454e)}button:focus-visible,select:focus-visible,input:focus-visible,summary:focus-visible{outline:3px solid var(--mj-accent, #8bd4d1);outline-offset:2px}
    button:disabled{cursor:default;opacity:.45}.shell{display:flex;flex-direction:column;max-height:calc(100dvh - 16px);width:min(430px,calc(100vw - 24px));background:var(--mj-bg, #20272d);border:1px solid var(--mj-border, #46515a);border-radius:9px;box-shadow:0 8px 28px #0004;overflow:hidden}
    header{display:flex;flex:none;align-items:center;gap:10px;background:var(--mj-surface, #2b343b);color:var(--mj-text, #f0f2f1);padding:10px 12px;cursor:grab;user-select:none;touch-action:none}:host([data-dragging]) header{cursor:grabbing}header strong{font-size:14px;flex:1}header button{padding:2px 8px;color:var(--mj-text, #f0f2f1);background:transparent;border-color:var(--mj-border, #46515a)}
    .body{padding:12px;min-height:0;overflow:auto}.controls{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.controls select{padding:5px;color:var(--mj-text, #f0f2f1);background:var(--mj-bg, #20272d);border:1px solid var(--mj-border, #46515a);border-radius:5px;max-width:100%}
    .status{margin:10px 0;padding:8px 10px;background:var(--mj-surface, #2b343b);border-left:3px solid var(--mj-accent, #8bd4d1)}.status.bad{background:var(--mj-warning-bg, #3b3028);border-color:var(--mj-warn, #ef9b8f)}
    .muted{color:var(--mj-muted, #b5bfc5)}.meta{display:flex;gap:12px;flex-wrap:wrap}.round{font-size:21px;font-weight:700;color:var(--mj-text, #f0f2f1)}.meta span{white-space:nowrap}
    .dora-row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
    .riichi-alert{margin:10px 0;padding:10px 12px;background:var(--mj-alert-bg, #3a2d2c);border:2px solid var(--mj-warn, #ef9b8f);border-radius:6px;color:var(--mj-warn, #ef9b8f);font-weight:700;font-size:15px}.drawn-tile{display:inline-flex;margin-left:10px}
    .round-result{margin:10px 0;padding:8px;background:var(--mj-surface, #2b343b);border-left:3px solid var(--mj-accent, #8bd4d1)}.round-result h3{margin-top:0}.score-table{width:100%;border-collapse:collapse;font-size:12px}.score-table th,.score-table td{padding:4px;text-align:right;border-bottom:1px solid var(--mj-border, #46515a)}.score-table th:first-child,.score-table td:first-child{text-align:left}.history-rounds{padding-left:20px}.history-rounds li{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:1px solid var(--mj-border, #46515a)}#history-match{max-width:100%;padding:5px}.history-view{padding:8px;margin:8px 0;background:var(--mj-warning-bg, #3b3028)}
    h3{font-size:13px;margin:12px 0 5px}p{margin:6px 0}.tiles{display:flex;gap:3px;flex-wrap:wrap;align-items:flex-start}.tile{display:inline-block;flex:none;width:23px;height:37px;padding:0;object-fit:contain;vertical-align:middle;border-radius:2px}.tile.unknown{display:inline-flex;align-items:center;justify-content:center;background:var(--mj-surface, #2b343b);border:1px solid var(--mj-border, #46515a);color:var(--mj-muted, #b5bfc5);font-size:18px}.river>span{position:relative}.called:after{content:'';position:absolute;left:2px;right:2px;top:18px;border-top:2px solid var(--mj-muted, #b5bfc5);transform:rotate(-35deg);pointer-events:none}.river small{display:block;text-align:center;font-size:9px;line-height:12px;color:var(--mj-muted, #b5bfc5)}.riichi .tile{outline:2px solid var(--mj-warn, #ef9b8f);outline-offset:1px}.events .tile{width:20px;height:32px}.player{border-top:1px solid var(--mj-border, #46515a);margin-top:10px;padding-top:8px}.player-head{display:flex;justify-content:space-between;gap:10px}.player-head b{color:var(--mj-text, #f0f2f1)}
    details{margin-top:12px}summary{cursor:pointer;font-weight:700}.events{list-style:none;padding:0;margin:6px 0}.events li{padding:5px 0;border-bottom:1px solid var(--mj-border, #46515a);font-size:12px;overflow-wrap:anywhere}.warn{color:var(--mj-warn, #ef9b8f)}.slider{width:100%;accent-color:var(--mj-accent, #8bd4d1)}.replay-controls{margin-top:10px;padding:8px;background:var(--mj-surface, #2b343b)}.foot{margin-top:12px;font-size:11px;color:var(--mj-muted, #b5bfc5)}.badge{background:var(--mj-surface, #2b343b);border-radius:3px;padding:1px 5px}.pill{width:auto}.pill header{gap:8px;padding:8px 11px}.pill header strong{font-size:12px}.pill header button{font-size:11px}.body{overscroll-behavior:contain}select{color:var(--mj-text, #f0f2f1);background:var(--mj-surface, #2b343b)}#history-match{background:var(--mj-surface, #2b343b);color:var(--mj-text, #f0f2f1);border:1px solid var(--mj-border, #46515a);border-radius:4px}header .indicator{width:8px;height:8px;background:#d7b565;border-radius:50%}.connected .indicator{background:#70d4c0}
    ${root.MJPanelTheme.css}
  `;
  function render() {
    if (!shadow) return;
    refreshView();
    const oldScroll = shadow.querySelector('.body')?.scrollTop || 0;
    shadow.querySelectorAll('details[id]').forEach(d => detailsState.set(d.id, d.open));
    const historical = viewedState();
    const s = historical || (mode === 'live' ? live : replayState);
    const displayLive = historical ? s.source === 'live' : mode === 'live';
    const riichiOpponents = historical ? [] : S.opponentRiichi(s);
    const riichiAlert = riichiOpponents.length ? `<div class="riichi-alert" role="status">对手立直：${riichiOpponents.map(i => windName(S.seatWind(s, i))).join('、')}</div>`
      : s.phase === 'playing' && s.selfSeat === null && s.players.some(p => p.riichi) ? '<p class="warn">选择自家座风后显示对手立直提示。</p>' : '';
    const connected = [...connections.values()].includes('open');
    const statusText = historical ? '正在查看历史结算快照 · 当前牌局继续采集' : mode === 'replay' ? (recordCount ? '牌谱已解析 · 游标需手动与画面对齐' : '等待载入牌谱，请重新打开牌谱') :
      (live.round ? (live.phase === 'ended' ? '本局已结束' : '已接收开局 · 持续采集中') : connected ? '连接已建立 · 等待牌局数据' : '采集器就绪 · 等待新连接');
    const items = recentEvents;
    const selfRiver = s.selfSeat === null ? '<p class="muted">自家座位未识别，暂无法确定牌河。</p>' : riverHtml(s.players[s.selfSeat], '自家牌河');
    const playerHtml = s.players.slice(0, s.scores.length === 3 ? 3 : 4).map((p, i) => `<div class="player">
      <div class="player-head"><b>${S.seatWind(s, i)}${s.selfSeat === i ? ' · 自家' : ''}${p.riichi ? ' · 立直' : ''}</b><span>${esc(s.scores[i] ?? '—')} 点${p.norths ? ' · 拔北' + p.norths : ''}</span></div>
      ${!displayLive ? '<div class="tiles">' + playerHandHtml(p.hand, s.drawnTiles[i]) + '</div>' : ''}
      ${displayLive && s.selfSeat === i ? '' : riverHtml(p, S.seatWind(s, i) + '家牌河')}
      ${p.melds.length ? '<div class="tiles" style="margin-top:5px">副露 ' + p.melds.map(m => '<span>' + m.tiles.map(tileHtml).join('') + '</span>').join(' ') + '</div>' : ''}</div>`).join('');
    shadow.innerHTML = `<style>${css}</style><section class="shell ${collapsed ? 'pill' : ''} ${connected ? 'connected' : ''}" aria-label="雀魂牌局观察器">
      <header title="拖动标题栏移动面板"><span class="indicator"></span><strong>${esc(collapsed ? '牌局' : options.title || '雀魂牌局获取器')}</strong><button type="button" data-theme-toggle></button><button id="collapse" aria-label="${options.dismissible ? '关闭面板' : collapsed ? '展开面板' : '收起面板'}">${options.dismissible ? '关闭' : collapsed ? '展开' : '收起'}</button></header>
      ${collapsed ? '' : `<div class="body"><div class="controls"><select id="mode" aria-label="数据来源"><option value="live" ${mode === 'live' ? 'selected' : ''}>实时消息</option><option value="replay" ${mode === 'replay' ? 'selected' : ''}>牌谱记录</option></select>
      <select id="seat" aria-label="自家座风" ${s.round && !historical ? '' : 'disabled'}><option value="" ${s.selfSeat === null ? 'selected' : ''}>自家：${mode === 'replay' ? '请选择' : '待识别'}</option>${s.round ? s.players.slice(0, s.scores.length === 3 ? 3 : 4).map((_, i) => `<option value="${i}" ${s.selfSeat === i ? 'selected' : ''}>自家：${S.seatWind(s, i)}</option>`).join('') : ''}</select><button id="export">导出核对记录</button></div>
      ${historical ? '<div class="history-view">历史记录 · ' + roundText(s) + ' · ' + s.honba + '本场 <button id="history-return">返回当前牌局</button></div>' : ''}
      <div class="status">${esc(statusText)}</div>
      ${riichiAlert}
      ${historyHtml()}${resultHtml(s)}
      <div class="meta"><b class="round">${esc(roundText(s))}</b><span>${s.honba} 本场</span><span>${s.sticks} 立直棒</span><span>余 ${s.remaining ?? '—'} 张</span></div>
      <p class="muted">${s.turnProgress?.status === 'known' && Number.isInteger(s.selfSeat) ? `下次自家打牌 · 第 ${s.turnProgress.bySeat[s.selfSeat]} 次 · 事件计数` : '巡目未知 · 未确认连续采集或自家座位'}</p>
      <div class="dora-row"><div><h3>宝牌指示牌</h3><div class="tiles" aria-label="宝牌指示牌">${handHtml(s.doras)}</div></div>
      <div><h3>宝牌</h3><div class="tiles" aria-label="宝牌">${handHtml(S.doraTiles(s))}</div></div></div>
      ${displayLive ? '<h3>自家手牌</h3><div class="tiles">' + playerHandHtml(s.selfHand, s.drawnTiles[s.selfSeat]) + '</div><h3>自家牌河</h3>' + selfRiver : historical ? '' : `<div class="replay-controls"><p>独立牌谱游标 ${cursor} / ${recordCount}，不会控制游戏。</p><input class="slider" id="cursor" aria-label="牌谱记录游标" type="range" min="0" max="${recordCount}" value="${cursor}"><div class="controls"><button id="start" ${!recordCount ? 'disabled' : ''}>本局开局</button><button id="prev" ${cursor === 0 ? 'disabled' : ''}>上一事件</button><button id="next" ${cursor >= recordCount ? 'disabled' : ''}>下一事件</button></div></div>`}
      ${playerHtml}
      <div id="extension-slot"></div>
      <details id="recent-events"><summary>最近事件</summary><ol class="events">${items.length ? items.map(e => '<li>' + eventHtml(e) + '</li>').join('') : historical ? '<li class="muted">历史记录保存结算快照，不含逐事件回放。</li>' : '<li class="muted">尚未收到牌局事件。安装后刷新游戏，再打开牌谱或练习局。</li>'}</ol></details>
      <details id="collector-status"><summary>采集状态 ${stats.gameEvents || 0} 条动作 / ${stats.errors || 0} 次失败</summary><p class="muted">已观察 ${stats.sockets || 0} 个连接；接收 ${stats.incoming || 0} 帧；牌谱 ${stats.replayRecords || 0} 条。</p>${s.warnings.map(w => '<p class="muted">' + esc(w) + '</p>').join('')}<ol class="events">${diagnostics.slice(-8).reverse().map(d => '<li>' + esc(d.stage + '：' + d.message) + '</li>').join('')}</ol></details>
      </div>`}</section>`;
    theme.bind(shadow.querySelector('[data-theme-toggle]'));
    shadow.getElementById('collapse').onclick = () => { if (options.dismissible) { unmount(); return; } collapsed = !collapsed; render(); };
    placePanel(panelPosition);
    if (collapsed) return;
    shadow.querySelector('.body').scrollTop = oldScroll;
    shadow.querySelectorAll('details[id]').forEach(d => { if (detailsState.has(d.id)) d.open = detailsState.get(d.id); });
    options.extensionSlot?.(shadow.getElementById('extension-slot'), currentView, render);
    shadow.getElementById('export').onclick = exportData;
    shadow.getElementById('mode').onchange = e => { controller.setMode(e.target.value); };
    const historySelect = shadow.getElementById('history-match');
    if (historySelect) historySelect.onchange = e => { controller.selectMatch(e.target.value); };
    shadow.querySelectorAll('[data-history-round]').forEach(button => { button.onclick = () => {
      controller.viewRound(historyMatchId || historyMatches[0]?.id, button.dataset.historyRound);
    }; });
    const historyReturn = shadow.getElementById('history-return');
    if (historyReturn) historyReturn.onclick = () => { controller.returnToCurrent(); };
    const seat = shadow.getElementById('seat');
    if (seat) seat.onchange = e => {
      const selected = e.target.value === '' ? null : Number(e.target.value);
      controller.setSelfSeat(selected);
    };
    if (mode === 'replay' && !historical) {
      shadow.getElementById('cursor').onchange = e => controller.setCursor(e.target.value);
      shadow.getElementById('prev').onclick = () => controller.previous();
      shadow.getElementById('next').onclick = () => controller.next();
      shadow.getElementById('start').onclick = () => controller.roundStart();
    }
  }

  let renderTimer;
  const unsubscribe = controller.subscribe(() => { if (!renderTimer) renderTimer = setTimeout(() => { renderTimer = null; render(); }, 150); });
  function mount(container = document.documentElement) {
    if (host || !container || document.getElementById('mj-observer-host')) return;
    host = document.createElement('div'); host.id = 'mj-observer-host';
    Object.assign(host.style, { position: 'fixed', inset: 'auto', left: '14px', top: '40%', zIndex: '2147483647', margin: '0', padding: '0', border: '0', background: 'transparent', overflow: 'visible' });
    theme = root.MJPanelTheme.attach(host);
    cleanup.push(() => theme.destroy());
    shadow = host.attachShadow({ mode: 'open' }); container.appendChild(host);
    enablePanelDragging(); render();
    return host;
  }
  function unmount() {
    cleanup.splice(0).forEach(fn => fn()); clearTimeout(renderTimer); renderTimer = null;
    host?.remove(); host = null; shadow = null; theme = null; panelDrag = null;
  }
  return { mount, render, open({ history = false } = {}) { collapsed = false; if (!host) mount(); else render(); if (history) { const details = shadow?.getElementById('round-history'); if (details) { details.open = true; detailsState.set('round-history', true); details.scrollIntoView({ block: 'nearest' }); } } },
    destroy() { unsubscribe(); unmount(); },
    renderers: { riverHtml, eventHtml } };
  }
  root.MJCollectorPanel = { create };
})(typeof globalThis !== 'undefined' ? globalThis : this);
