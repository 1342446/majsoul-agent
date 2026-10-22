(function () {
  'use strict';
  if (document.getElementById('mj-observer-host')) return;
  const S = globalThis.__MJ_OBSERVER_STATE_V1__, CHANNEL = 'mj-observer-v1';
  let host, shadow, mode = 'live', collapsed = false, live = S.initial(), replayState = S.initial('replay');
  let records = [], cursor = 0, replaySelfSeat = null, log = [], diagnostics = [], seen = new Set(), stats = {}, connections = new Map();
  const suits = ['东', '南', '西', '北'];
  const windName = wind => suits.includes(wind) ? wind + '家' : '座风待定';
  const eventNames = { NewRound: '开局', DealTile: '摸牌', DiscardTile: '弃牌', ChiPengGang: '吃碰杠', AnGangAddGang: '暗杠/加杠',
    BaBei: '拔北', Hule: '和牌', NoTile: '荒牌流局', LiuJu: '途中流局', MJStart: '对局开始', Unsupported: '未支持事件' };
  const esc = x => String(x ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const tileBase = typeof chrome !== 'undefined' && chrome.runtime?.getURL
    ? chrome.runtime.getURL('tiles/') : new URL('tiles/', document.currentScript?.src || new URL('../extension/overlay.js', location.href)).href;
  const tileHtml = t => /^(?:[0-9][mps]|[1-7]z)$/.test(t)
    ? `<img class="tile" src="${esc(tileBase + t + '.svg')}" alt="${esc(S.label(t))}" title="${esc(S.label(t) + ' (' + t + ')')}" draggable="false">`
    : '<span class="tile unknown" role="img" aria-label="未知牌" title="未知牌">?</span>';
  const handHtml = ts => ts.length ? ts.map(tileHtml).join('') : '<span class="muted">尚无数据</span>';
  function playerHandHtml(hand, drawnTile) {
    const layout = S.handLayout(hand, drawnTile);
    return (layout.tiles.length ? layout.tiles.map(tileHtml).join('') : layout.drawn ? '' : handHtml([]))
      + (layout.drawn ? '<span class="drawn-tile" title="刚摸的牌">' + tileHtml(layout.drawn) + '</span>' : '');
  }
  function riverHtml(player, label) {
    return `<div class="river tiles" aria-label="${esc(label)}" style="margin-top:5px">${player.discards.length ? player.discards.map(t => `<span class="${t.called ? 'called' : ''} ${t.riichi ? 'riichi' : ''}" title="${t.called ? '已被鸣牌；' : ''}${t.tsumogiri ? '摸切' : '手切'}">${tileHtml(t.tile)}<small>${t.called ? '已鸣' : t.riichi ? '立直' : t.tsumogiri ? '摸切' : '手切'}</small></span>`).join('') : '<span class="muted">牌河：空 / 尚未采集</span>'}</div>`;
  }
  const roundText = s => s.round ? `${suits[s.round.wind] || '?'}${s.round.index + 1}局` : '等待开局';
  function eventHtml(e) {
    const text = `${e.step !== undefined ? '#' + e.step + ' ' : ''}${e.seat !== undefined ? windName(e.seatWind) + ' ' : ''}${eventNames[e.kind] || e.kind}`;
    return esc(text) + (e.tile ? ' ' + tileHtml(e.tile) : '') + (e.tiles ? ' ' + e.tiles.map(tileHtml).join(' ') : '')
      + (e.riichi ? ' · 立直' : '') + (e.tsumogiri ? ' · 摸切' : '');
  }
  function recalculate() {
    replayState = S.initial('replay', replaySelfSeat);
    for (let i = 0; i < cursor; i++) replayState = S.apply(replayState, records[i]);
  }
  function exportData() {
    const data = { format: 'mj-observer-v1', exportedAt: new Date().toISOString(), mode, stats,
      state: mode === 'live' ? live : replayState, replayCursor: cursor, events: log, replayRecords: records, diagnostics,
      note: '仅牌局字段；牌谱游标独立于游戏画面。桥接数据仅供核对，不能作为可信证明。' };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = `majsoul-observation-${Date.now()}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const css = `
    :host{all:initial;color:#19344a;font:13px/1.5 "Microsoft YaHei UI","Microsoft YaHei",sans-serif}
    *{box-sizing:border-box}button,select,input{font:inherit}button,select{cursor:pointer}
    button{background:#edf3f7;border:1px solid #c4d4df;color:#19344a;border-radius:5px;padding:5px 9px}
    button:hover{background:#dbe9f1}button:focus-visible,select:focus-visible,input:focus-visible,summary:focus-visible{outline:3px solid #ba841b;outline-offset:2px}
    button:disabled{cursor:default;opacity:.45}.shell{width:min(390px,calc(100vw - 24px));background:#f9fcff;border:1px solid #9db4c4;border-radius:9px;box-shadow:0 8px 28px #0004;overflow:hidden}
    header{display:flex;align-items:center;gap:10px;background:#214764;color:#fff;padding:10px 12px}header strong{font-size:15px;flex:1}header button{padding:2px 8px;color:#fff;background:transparent;border-color:#7293ac}
    .body{padding:12px;max-height:min(76vh,760px);overflow:auto}.controls{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.controls select{padding:5px;color:#19344a;background:white;border:1px solid #b4c9d8;border-radius:5px;max-width:100%}
    .status{margin:10px 0;padding:8px 10px;background:#e5f0f3;border-left:3px solid #24838a}.status.bad{background:#fff2d7;border-color:#b67d10}
    .muted{color:#607786}.meta{display:flex;gap:12px;flex-wrap:wrap}.round{font-size:21px;font-weight:700;color:#214764}.meta span{white-space:nowrap}
    .riichi-alert{margin:10px 0;padding:10px 12px;background:#fff0ec;border:2px solid #b44335;border-radius:6px;color:#962e25;font-weight:700;font-size:15px}.drawn-tile{display:inline-flex;margin-left:10px}
    h3{font-size:13px;margin:12px 0 5px}p{margin:6px 0}.tiles{display:flex;gap:3px;flex-wrap:wrap;align-items:flex-start}.tile{display:inline-block;flex:none;width:23px;height:37px;padding:0;object-fit:contain;vertical-align:middle;border-radius:2px}.tile.unknown{display:inline-flex;align-items:center;justify-content:center;background:#e1e9ee;border:1px solid #91a6b5;color:#536b7c;font-size:18px}.river>span{position:relative}.called:after{content:'';position:absolute;left:2px;right:2px;top:18px;border-top:2px solid #5f7281;transform:rotate(-35deg);pointer-events:none}.river small{display:block;text-align:center;font-size:9px;line-height:12px;color:#607786}.riichi .tile{outline:2px solid #b23d3a;outline-offset:1px}.events .tile{width:20px;height:32px}.player{border-top:1px solid #dae5ed;margin-top:10px;padding-top:8px}.player-head{display:flex;justify-content:space-between;gap:10px}.player-head b{color:#214764}
    details{margin-top:12px}summary{cursor:pointer;font-weight:700}.events{list-style:none;padding:0;margin:6px 0}.events li{padding:5px 0;border-bottom:1px solid #e3ebf0;font-size:12px;overflow-wrap:anywhere}.warn{color:#966311}.slider{width:100%;accent-color:#24838a}.replay-controls{margin-top:10px;padding:8px;background:#eaf1f7}.foot{margin-top:12px;font-size:11px;color:#607786}.badge{background:#dcecf0;border-radius:3px;padding:1px 5px}.pill{width:auto}header .indicator{width:8px;height:8px;background:#d7b565;border-radius:50%}.connected .indicator{background:#70d4c0}
  `;
  function render() {
    if (!shadow) return;
    const oldScroll = shadow.querySelector('.body')?.scrollTop || 0;
    const oldDetails = [...shadow.querySelectorAll('details')].map(d => d.open);
    const s = mode === 'live' ? live : replayState;
    const riichiOpponents = S.opponentRiichi(s);
    const riichiAlert = riichiOpponents.length ? `<div class="riichi-alert" role="status">对手立直：${riichiOpponents.map(i => windName(S.seatWind(s, i))).join('、')}</div>`
      : s.phase === 'playing' && s.selfSeat === null && s.players.some(p => p.riichi) ? '<p class="warn">选择自家座风后显示对手立直提示。</p>' : '';
    const connected = [...connections.values()].includes('open');
    const statusText = mode === 'replay' ? (records.length ? '牌谱已解析 · 游标需手动与画面对齐' : '等待载入牌谱，请重新打开牌谱') :
      (live.complete ? '已接收开局 · 请与画面核对' : live.round ? '已接收开局 · 状态待核对' : connected ? '连接已建立 · 等待完整开局' : '采集器就绪 · 等待新连接');
    const items = mode === 'live' ? log.slice(-12).reverse() : records.slice(Math.max(0, cursor - 8), cursor).reverse();
    const selfRiver = s.selfSeat === null ? '<p class="muted">自家座位未识别，暂无法确定牌河。</p>' : riverHtml(s.players[s.selfSeat], '自家牌河');
    const playerHtml = s.players.slice(0, s.scores.length === 3 ? 3 : 4).map((p, i) => `<div class="player">
      <div class="player-head"><b>${S.seatWind(s, i)}${s.selfSeat === i ? ' · 自家' : ''}${p.riichi ? ' · 立直' : ''}</b><span>${esc(s.scores[i] ?? '—')} 点${p.norths ? ' · 拔北' + p.norths : ''}</span></div>
      ${mode === 'replay' ? '<div class="tiles">' + playerHandHtml(p.hand, s.drawnTiles[i]) + '</div>' : ''}
      ${mode === 'live' && s.selfSeat === i ? '' : riverHtml(p, S.seatWind(s, i) + '家牌河')}
      ${p.melds.length ? '<div class="tiles" style="margin-top:5px">副露 ' + p.melds.map(m => '<span>' + m.tiles.map(tileHtml).join('') + '</span>').join(' ') + '</div>' : ''}</div>`).join('');
    shadow.innerHTML = `<style>${css}</style><section class="shell ${collapsed ? 'pill' : ''} ${connected ? 'connected' : ''}" aria-label="雀魂牌局观察器">
      <header><span class="indicator"></span><strong>牌局观察器</strong><button id="collapse" aria-label="${collapsed ? '展开面板' : '收起面板'}">${collapsed ? '展开' : '收起'}</button></header>
      ${collapsed ? '' : `<div class="body"><div class="controls"><select id="mode" aria-label="数据来源"><option value="live" ${mode === 'live' ? 'selected' : ''}>实时消息</option><option value="replay" ${mode === 'replay' ? 'selected' : ''}>牌谱记录</option></select>
      <select id="seat" aria-label="自家座风" ${s.round ? '' : 'disabled'}><option value="" ${s.selfSeat === null ? 'selected' : ''}>自家：${mode === 'replay' ? '请选择' : '待识别'}</option>${s.round ? s.players.slice(0, s.scores.length === 3 ? 3 : 4).map((_, i) => `<option value="${i}" ${s.selfSeat === i ? 'selected' : ''}>自家：${S.seatWind(s, i)}</option>`).join('') : ''}</select><button id="export">导出核对记录</button></div>
      <div class="status ${s.complete ? '' : 'bad'}">${esc(statusText)}</div>
      ${riichiAlert}
      <div class="meta"><b class="round">${esc(roundText(s))}</b><span>${s.honba} 本场</span><span>${s.sticks} 立直棒</span><span>余 ${s.remaining ?? '—'} 张</span></div>
      <p class="muted">${s.phase === 'ended' ? '本局已结束' : s.turn === null ? '当前座风待识别' : '最近动作：' + windName(S.seatWind(s, s.turn))} · ${s.complete ? '事件连续' : '状态待核对'}</p>
      <h3>宝牌指示牌</h3><div class="tiles" aria-label="宝牌指示牌">${handHtml(s.doras)}</div>
      <h3>宝牌</h3><div class="tiles" aria-label="宝牌">${handHtml(S.doraTiles(s))}</div>
      ${mode === 'live' ? '<h3>自家手牌</h3><div class="tiles">' + playerHandHtml(s.selfHand, s.drawnTiles[s.selfSeat]) + '</div><h3>自家牌河</h3>' + selfRiver + (s.selfSeat === null ? '<p class="warn">自家座位未识别，后续手牌变化可能不完整。</p>' : '') : `<div class="replay-controls"><p>独立牌谱游标 ${cursor} / ${records.length}，不会控制游戏。</p><input class="slider" id="cursor" aria-label="牌谱记录游标" type="range" min="0" max="${records.length}" value="${cursor}"><div class="controls"><button id="start" ${!records.length ? 'disabled' : ''}>本局开局</button><button id="prev" ${cursor === 0 ? 'disabled' : ''}>上一事件</button><button id="next" ${cursor >= records.length ? 'disabled' : ''}>下一事件</button></div></div>`}
      ${s.warnings.map(w => '<p class="warn">' + esc(w) + '</p>').join('')}${playerHtml}
      <details open><summary>最近事件</summary><ol class="events">${items.length ? items.map(e => '<li>' + eventHtml(e) + '</li>').join('') : '<li class="muted">尚未收到牌局事件。安装后刷新游戏，再打开牌谱或练习局。</li>'}</ol></details>
      <details><summary>采集状态 ${stats.gameEvents || 0} 条动作 / ${stats.errors || 0} 次失败</summary><p class="muted">已观察 ${stats.sockets || 0} 个连接；接收 ${stats.incoming || 0} 帧；牌谱 ${stats.replayRecords || 0} 条。</p><ol class="events">${diagnostics.slice(-8).reverse().map(d => '<li>' + esc(d.stage + '：' + d.message) + '</li>').join('')}</ol></details>
      <p class="foot">东南西北表示本局座风，随庄家轮转，并非固定屏幕方位。数据仅供核对，牌谱四家手牌不代表实战暗牌可见。导出不含账号、令牌或原始消息。</p></div>`}</section>`;
    shadow.getElementById('collapse').onclick = () => { collapsed = !collapsed; render(); };
    if (collapsed) return;
    shadow.querySelector('.body').scrollTop = oldScroll;
    [...shadow.querySelectorAll('details')].forEach((d, i) => { if (oldDetails[i] !== undefined) d.open = oldDetails[i]; });
    shadow.getElementById('export').onclick = exportData;
    shadow.getElementById('mode').onchange = e => { mode = e.target.value; render(); };
    const seat = shadow.getElementById('seat');
    if (seat) seat.onchange = e => {
      const selected = e.target.value === '' ? null : Number(e.target.value);
      if (mode === 'replay') { replaySelfSeat = selected; recalculate(); render(); return; }
      live = S.selectSelfSeat(live, selected); render();
    };
    if (mode === 'replay') {
      shadow.getElementById('cursor').onchange = e => { cursor = Number(e.target.value); recalculate(); render(); };
      shadow.getElementById('prev').onclick = () => { cursor = Math.max(0, cursor - 1); recalculate(); render(); };
      shadow.getElementById('next').onclick = () => { cursor = Math.min(records.length, cursor + 1); recalculate(); render(); };
      shadow.getElementById('start').onclick = () => {
        let i = Math.max(0, cursor - 1); while (i > 0 && records[i].kind !== 'NewRound') i--;
        cursor = records[i]?.kind === 'NewRound' ? i + 1 : 0; recalculate(); render();
      };
    }
  }
  // Rendering is throttled so a burst of records does not stall the game.
  let renderTimer;
  function schedule() { if (!renderTimer) renderTimer = setTimeout(() => { renderTimer = null; render(); }, 150); }
  window.addEventListener('message', event => {
    const m = event.data;
    if (event.source !== window || event.origin !== location.origin || m?.channel !== CHANNEL || m.type === 'hello') return;
    if (typeof m.epoch !== 'string' || !Number.isSafeInteger(m.sequence)) return;
    const key = m.epoch + ':' + m.sequence;
    if (seen.has(key)) return;
    seen.add(key); if (seen.size > 5000) seen.delete(seen.values().next().value);
    try {
      if (m.type === 'event' && m.payload?.source === 'live' && typeof m.payload.kind === 'string') {
        live = S.apply(live, m.payload); log.push({ ...m.payload, ...(m.payload.seat === undefined ? {} : { seatWind: S.seatWind(live, m.payload.seat) }), observedAt: new Date().toISOString() });
        if (log.length > 1000) log.shift();
      } else if (m.type === 'replay' && Array.isArray(m.payload?.records) && m.payload.records.length <= 25000) {
        replaySelfSeat = null;
        records = S.withSeatWinds(m.payload.records); cursor = records.findIndex(e => e.kind === 'NewRound') + 1;
        mode = 'replay'; recalculate();
      } else if (m.type === 'status') stats = m.payload || {};
      else if (m.type === 'diagnostic') {
        diagnostics.push(m.payload); if (diagnostics.length > 60) diagnostics.shift();
        if (['动作解码', '消息读取', '牌局响应', '断线恢复'].includes(m.payload?.stage)) {
          live.complete = false;
          if (!live.warnings.includes('采集发生错误，请检查采集状态并重新从开局采集')) live.warnings.push('采集发生错误，请检查采集状态并重新从开局采集');
        }
      }
      else if (m.type === 'connection') connections.set(m.payload.socketId, m.payload.state);
      schedule();
    } catch (_) { diagnostics.push({ stage: '局面更新', message: '事件字段不符合预期，当前显示可能不完整。' }); schedule(); }
  });
  function mount() {
    if (!document.documentElement) return;
    host = document.createElement('div'); host.id = 'mj-observer-host';
    Object.assign(host.style, { position: 'fixed', right: '12px', top: '12px', zIndex: '2147483647' });
    shadow = host.attachShadow({ mode: 'open' }); document.documentElement.appendChild(host); render();
    window.postMessage({ channel: CHANNEL, type: 'hello' }, location.origin);
  }
  if (document.documentElement) mount(); else document.addEventListener('DOMContentLoaded', mount, { once: true });
})();
