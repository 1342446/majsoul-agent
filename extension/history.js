(function (root) {
  'use strict';
  const MAX_MATCHES = 20, MAX_ROUNDS = 100, MAX_STORE_BYTES = 4 * 1024 * 1024;
  const number = (v, fallback = 0) => Number.isSafeInteger(v) && Math.abs(v) <= 100000000 ? v : fallback;
  const numbers = xs => Array.isArray(xs) ? xs.slice(0, 4).map(v => number(v)) : [];
  const tile = t => /^(?:[1-9][mps]|0[mps]|[1-7]z)$/.test(t) ? t : '?';
  const tiles = (xs, max = 20) => Array.isArray(xs) ? xs.slice(0, max).map(tile) : [];
  function snapshot(s) {
    if (!s?.round || !Number.isInteger(s.round.wind) || !Number.isInteger(s.round.index)) throw new Error('记录缺少局数');
    const r = s.result;
    const result = r && ['Hule', 'NoTile', 'LiuJu', 'Interrupted'].includes(r.kind) ? {
      kind: r.kind, reason: r.reason === null ? null : number(r.reason), gameEnded: !!r.gameEnded,
      nagashi: !!r.nagashi, scoresKnown: !!r.scoresKnown, scores: numbers(r.scores), deltas: numbers(r.deltas),
      tenpai: Array.isArray(r.tenpai) ? r.tenpai.slice(0, 4).map(Boolean) : [],
      winners: (Array.isArray(r.winners) ? r.winners : []).filter(w => Number.isInteger(w.seat) && w.seat >= 0 && w.seat < 4).slice(0, 3)
        .map(w => ({ seat: w.seat, tile: tile(w.tile), tsumo: !!w.tsumo, han: number(w.han), fu: number(w.fu) }))
    } : null;
    const count = s.scores?.length === 3 ? 3 : 4, progress = s.turnProgress;
    const turnsKnown = progress?.status === 'known' && progress.source === 'events' && Array.isArray(progress.bySeat)
      && progress.bySeat.length === count && progress.bySeat.every(n => Number.isInteger(n) && n >= 1 && n <= 145);
    const reasons = ['missing_start', 'event_gap', 'missing_sequence', 'unsupported_event', 'collection_error', 'disconnected', 'invalid_event', 'legacy'];
    const turnProgress = { status: turnsKnown ? 'known' : 'unknown', source: 'events', bySeat: turnsKnown ? progress.bySeat.slice() : Array(count).fill(null), reason: turnsKnown ? null : reasons.includes(progress?.reason) ? progress.reason : 'legacy' };
    return { turnProgress, source: s.source === 'replay' ? 'replay' : 'live',
      selfSeat: Number.isInteger(s.selfSeat) && s.selfSeat >= 0 && s.selfSeat < 4 ? s.selfSeat : null,
      phase: s.phase === 'ended' ? 'ended' : 'playing', round: { wind: number(s.round.wind), index: number(s.round.index) },
      honba: number(s.honba), sticks: number(s.sticks), remaining: s.remaining === null ? null : number(s.remaining),
      doras: tiles(s.doras, 10), scores: numbers(s.scores), startScores: numbers(s.startScores),
      turn: Number.isInteger(s.turn) && s.turn >= 0 && s.turn < 4 ? s.turn : null,
      selfHand: tiles(s.selfHand), drawnTiles: Array.from({ length: 4 }, (_, i) => s.drawnTiles?.[i] ? tile(s.drawnTiles[i]) : null),
      complete: !!s.complete, lastStep: s.lastStep === null ? null : number(s.lastStep), seatTrackingIncomplete: !!s.seatTrackingIncomplete,
      warnings: (Array.isArray(s.warnings) ? s.warnings : []).slice(0, 8).map(w => String(w).slice(0, 220)),
      players: Array.from({ length: 4 }, (_, i) => {
        const p = s.players?.[i] || {};
        return { hand: tiles(p.hand), riichi: !!p.riichi, norths: number(p.norths),
          discards: (Array.isArray(p.discards) ? p.discards : []).slice(0, 60).map(d => ({ tile: tile(d.tile), riichi: !!d.riichi, tsumogiri: typeof d.tsumogiri === 'boolean' ? d.tsumogiri : null, called: !!d.called })),
          melds: (Array.isArray(p.melds) ? p.melds : []).slice(0, 4).map(m => ({ type: number(m.type), tiles: tiles(m.tiles, 4), froms: numbers(m.froms) })) };
      }), result };
  }
  const key = s => [s.round.wind, s.round.index, s.honba].join(':');
  function create(source, id, now = Date.now()) {
    return { id, source, startedAt: now, updatedAt: now, closed: false, rounds: [], droppedRounds: 0 };
  }
  function addRound(match, state, now = Date.now(), interrupted = false) {
    const m = structuredClone(match), s = snapshot(state);
    if (interrupted) {
      s.phase = 'ended'; s.complete = false;
      s.result = { kind: 'Interrupted', winners: [], reason: null, tenpai: [], nagashi: false, gameEnded: false, scoresKnown: false, scores: [], deltas: [] };
    }
    if (!s.result) return m;
    const entry = { key: key(s), recordedAt: now, snapshot: s };
    const index = m.rounds.findIndex(r => r.key === entry.key);
    if (index < 0) m.rounds.push(entry); else m.rounds[index] = entry;
    if (m.rounds.length > MAX_ROUNDS) { m.droppedRounds += m.rounds.length - MAX_ROUNDS; m.rounds = m.rounds.slice(-MAX_ROUNDS); }
    m.updatedAt = now; m.closed = !!s.result.gameEnded;
    return m;
  }
  function reconcile(match, scores, now = Date.now()) {
    const m = structuredClone(match), last = m.rounds.at(-1)?.snapshot;
    if (!last?.result || last.result.scoresKnown || scores.length !== last.startScores.length) return m;
    last.scores = numbers(scores); last.result.scores = last.scores.slice(); last.result.scoresKnown = true;
    last.result.deltas = last.scores.map((v, i) => v - last.startScores[i]);
    m.updatedAt = now;
    return m;
  }
  function isNewMatch(match, before, event) {
    if (!match || match.closed || event.kind === 'MJStart') return true;
    if (event.kind !== 'NewRound' || !before.round || before.phase !== 'ended') return false;
    const previous = before.round.wind * 4 + before.round.index, next = event.wind * 4 + event.round;
    return next < previous || (next === previous && event.honba <= before.honba);
  }
  function fromReplay(events, S, id, now = Date.now()) {
    let match = create('replay', id, now), s = S.initial('replay');
    for (const e of events) {
      if (e.kind === 'NewRound' && s.round) {
        if (s.phase !== 'ended') match = addRound(match, s, now, true);
        match = reconcile(match, e.scores, now);
      }
      s = S.apply(s, e);
      if (s.result && ['Hule', 'NoTile', 'LiuJu'].includes(e.kind)) match = addRound(match, s, now);
    }
    if (s.round && s.phase !== 'ended') match = addRound(match, s, now, true);
    return match;
  }
  function sanitizeMatch(raw) {
    if (!raw || typeof raw.id !== 'string' || !/^[a-zA-Z0-9:_-]{1,160}$/.test(raw.id) || !Array.isArray(raw.rounds)) throw new Error('无效的整场记录');
    const m = create(raw.source === 'replay' ? 'replay' : 'live', raw.id, number(raw.startedAt));
    // Timestamps are larger than scores and use their own bounds.
    m.startedAt = Number.isSafeInteger(raw.startedAt) && raw.startedAt > 0 ? raw.startedAt : Date.now();
    m.updatedAt = Number.isSafeInteger(raw.updatedAt) && raw.updatedAt > 0 ? raw.updatedAt : m.startedAt;
    m.closed = !!raw.closed; m.droppedRounds = number(raw.droppedRounds);
    m.rounds = raw.rounds.slice(-MAX_ROUNDS).map(r => {
      const s = snapshot(r.snapshot);
      return { key: key(s), recordedAt: Number.isSafeInteger(r.recordedAt) ? r.recordedAt : m.updatedAt, snapshot: s };
    });
    return m;
  }
  function merge(matches, match) {
    const m = sanitizeMatch(match);
    const all = [...matches.filter(x => x.id !== m.id), m].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_MATCHES);
    while (all.length > 1 && new TextEncoder().encode(JSON.stringify(all)).length > MAX_STORE_BYTES) all.pop();
    return all;
  }
  const api = { create, addRound, reconcile, isNewMatch, fromReplay, snapshot, sanitizeMatch, merge, MAX_MATCHES, MAX_ROUNDS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MJHistory = api;
})(globalThis);
