(function (root) {
  'use strict';
  function create(options = {}) {
  const S = options.state || root.__MJ_OBSERVER_STATE_V1__, H = options.history || root.MJHistory;
  const clone = value => JSON.parse(JSON.stringify(value));
  const now = options.clock || Date.now, id = options.id || (() => String(now()) + '-' + (++idSequence));
  let idSequence = 0;
  const storage = options.storage || { load: async () => [], save: async () => {} };
  const hash = options.hash || (async () => id());
  const listeners = new Set();
  let mode = 'live', live = S.initial(), replayState = S.initial('replay');
  let records = [], cursor = 0, replayRevision = 0, replaySelfSeat = null, log = [], diagnostics = [], stats = {}, connections = new Map();
  let historyMatches = [], liveMatch = null, historyMatchId = '', historyView = null, historyWarning = '', historyReady = false;
  const historyDirty = new Map();
  let writeQueue = Promise.resolve();
  function schedule() { for (const listener of listeners) listener(); }
  function viewedState() {
    return historyView ? historyMatches.find(m => m.id === historyView.match)?.rounds.find(r => r.key === historyView.round)?.snapshot : null;
  }
  function saveHistory(match) {
    historyMatches = H.merge(historyMatches, match);
    if (!historyMatchId) historyMatchId = match.id;
    if (!historyReady) { historyDirty.set(match.id, clone(match)); return; }
    const saved = clone(match), matches = clone(historyMatches);
    writeQueue = writeQueue.then(() => storage.save(saved, matches)).catch(() => {
      historyWarning = '本地记录保存失败；当前页面仍可查看，请导出备份。'; schedule();
    });
  }
  async function loadHistory() {
    try {
      const matches = await storage.load();
      if (!Array.isArray(matches)) throw new Error('Invalid history');
      let loaded = [];
      for (const m of matches) { try { loaded = H.merge(loaded, m); } catch (_) {} }
      for (const m of historyMatches) loaded = H.merge(loaded, m);
      historyMatches = loaded;
    } catch (_) { historyWarning = '历史记录读取失败，当前采集不受影响。'; }
    historyReady = true;
    for (const m of historyDirty.values()) saveHistory(m);
    historyDirty.clear(); schedule();
  }
  function newLiveMatch() { return H.create('live', 'live-' + id(), now()); }
  function recordLive(before, event, after) {
    if (event.kind === 'MJStart') {
      if (liveMatch && before.round && before.phase !== 'ended') saveHistory(H.addRound(liveMatch, before, now(), true));
      liveMatch = newLiveMatch(); historyMatchId = liveMatch.id; return;
    }
    if (event.kind === 'NewRound') {
      const newMatch = H.isNewMatch(liveMatch, before, event);
      if (liveMatch && before.round && before.phase !== 'ended' &&
          (before.round.wind !== event.wind || before.round.index !== event.round || before.honba !== event.honba)) {
        liveMatch = H.addRound(liveMatch, before, now(), true);
        saveHistory(liveMatch);
      }
      if (newMatch) { liveMatch = newLiveMatch(); historyMatchId = liveMatch.id; }
      else if (liveMatch.rounds.length) { liveMatch = H.reconcile(liveMatch, event.scores); saveHistory(liveMatch); }
    }
    if (after.round && after.result && ['Hule', 'NoTile', 'LiuJu'].includes(event.kind)) {
      if (!liveMatch) liveMatch = newLiveMatch();
      liveMatch = H.addRound(liveMatch, after, now()); saveHistory(liveMatch);
    }
  }
  let replayHistorySequence = 0, replayTask = Promise.resolve();
  async function recordReplay(events) {
    const sequence = ++replayHistorySequence;
    try {
      const digest = await hash(JSON.stringify(events));
      if (sequence !== replayHistorySequence) return;
      const id = 'replay-' + String(digest);
      saveHistory(H.fromReplay(events, S, id, now())); historyMatchId = id; schedule();
    } catch (_) { historyWarning = '牌谱历史整理失败；当前牌谱游标仍可使用。'; schedule(); }
  }
  function recalculate() {
    replayState = S.initial('replay', replaySelfSeat);
    for (let i = 0; i < cursor; i++) replayState = S.apply(replayState, records[i]);
  }

  function getView() {
    const historical = viewedState();
    const recentEvents = historical ? [] : mode === 'live' ? log.slice(-12).reverse() : records.slice(Math.max(0, cursor - 8), cursor).reverse();
    return clone({ mode, live, replayState, recordCount: records.length, replayRevision, recentEvents, cursor, diagnostics, stats,
      connections: [...connections], historyMatches, historyMatchId, historyView, historyWarning,
      historyReady, historical, state: historical || (mode === 'live' ? live : replayState) });
  }
  function exportData() {
    return clone({ format: 'mj-observer-v1', exportedAt: new Date(now()).toISOString(), mode, stats,
      state: viewedState() || (mode === 'live' ? live : replayState), historyView, historyMatches,
      replayCursor: cursor, events: log, replayRecords: records, diagnostics,
      note: '仅牌局字段；牌谱游标独立于游戏画面。桥接数据仅供核对，不能作为可信证明。' });
  }
  function receive(message) {
    const m = clone(message);
    try {
      if (m.type === 'event' && m.payload?.source === 'live' && typeof m.payload.kind === 'string') {
        const before = live; live = S.apply(live, m.payload); recordLive(before, m.payload, live);
        log.push({ ...m.payload, ...(m.payload.seat === undefined ? {} : { seatWind: S.seatWind(live, m.payload.seat) }), observedAt: new Date(now()).toISOString() });
        if (log.length > 1000) log.shift();
      } else if (m.type === 'replay' && Array.isArray(m.payload?.records) && m.payload.records.length <= 25000) {
        replaySelfSeat = null;
        records = S.withSeatWinds(m.payload.records); cursor = records.findIndex(e => e.kind === 'NewRound') + 1;
        replayRevision++;
        mode = 'replay'; historyView = null; recalculate(); replayTask = recordReplay(records);
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
  }
  function setCursor(value) { cursor = Math.max(0, Math.min(records.length, Math.trunc(Number(value) || 0))); recalculate(); schedule(); }
  function setSelfSeat(value) {
    const max = (mode === 'live' ? live : replayState).scores.length === 3 ? 3 : 4;
    if (value !== null && (!Number.isInteger(value) || value < 0 || value >= max)) throw new Error('Invalid seat');
    if (mode === 'replay') { replaySelfSeat = value; recalculate(); } else live = S.selectSelfSeat(live, value);
    schedule();
  }
  const ready = loadHistory();
  return Object.freeze({ getView, exportData, receive, ready,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    setMode(value) { if (!['live', 'replay'].includes(value)) throw new Error('Invalid mode'); mode = value; historyView = null; schedule(); },
    selectMatch(value) { historyMatchId = value; schedule(); },
    viewRound(match, round) { if (!historyMatches.some(m => m.id === match && m.rounds.some(r => r.key === round))) return; historyView = { match, round }; schedule(); },
    returnToCurrent() { historyView = null; schedule(); }, setSelfSeat, setCursor,
    previous() { setCursor(cursor - 1); }, next() { setCursor(cursor + 1); },
    roundStart() { let i = Math.max(0, cursor - 1); while (i > 0 && records[i].kind !== 'NewRound') i--; setCursor(records[i]?.kind === 'NewRound' ? i + 1 : 0); },
    async flush() { await ready; await replayTask; await writeQueue; }
  });
  }
  const api = { create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.MJCollectorController = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
