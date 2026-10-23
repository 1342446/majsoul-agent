(function (root) {
  'use strict';
  const tile = t => typeof t === 'string' && /^(?:[0-9][mps]|[1-7]z|\?)$/.test(t) ? t : '?';
  function cleanTurnProgress(raw, count) {
    const known = raw?.status === 'known' && raw.source === 'events' && Array.isArray(raw.bySeat)
      && raw.bySeat.length === count && raw.bySeat.every(n => Number.isInteger(n) && n >= 1 && n <= 145);
    const reasons = ['missing_start', 'event_gap', 'missing_sequence', 'unsupported_event', 'collection_error', 'disconnected', 'invalid_event', 'legacy'];
    return { status: known ? 'known' : 'unknown', source: 'events', bySeat: known ? raw.bySeat.slice() : Array(count).fill(null), reason: known ? null : reasons.includes(raw?.reason) ? raw.reason : 'legacy' };
  }
  // Whitelist again at the worker boundary: never trust extra fields from a page message.
  function cleanSnapshot(raw) {
    if (!raw || raw.format !== 'mj-analysis-v1') throw new Error('局面数据格式无效。');
    const count = raw.playerCount === 3 || raw.game?.scores?.length === 3 ? 3 : 4;
    const flags = value => typeof value === 'boolean' ? value : null;
    const tiles = value => { if (!Array.isArray(value) || value.length > 144) throw new Error('牌数据无效。'); return value.map(tile); };
    const data = { format: raw.format, playerCount: count, source: ['live', 'replay'].includes(raw.source) ? raw.source : 'unknown', complete: raw.complete === true,
      phase: ['playing', 'ended', 'waiting'].includes(raw.phase) ? raw.phase : 'unknown', selfSeat: Number.isInteger(raw.selfSeat) && raw.selfSeat >= 0 && raw.selfSeat < count ? raw.selfSeat : null,
      lastStep: Number.isInteger(raw.lastStep) ? raw.lastStep : null,
      warnings: Array.isArray(raw.warnings) ? raw.warnings.filter(x => typeof x === 'string').slice(0, 8).map(x => x.slice(0, 500)) : [] };
    const number = value => Number.isFinite(value) ? value : null;
    if (raw.game) {
      const g = raw.game;
      if (!Array.isArray(g.players) || g.players.length !== count || !Array.isArray(g.scores) || g.scores.length !== count) throw new Error('对局玩家数据无效。');
      data.game = { turnProgress: cleanTurnProgress(g.turnProgress, count), round: { wind: number(g.round?.wind), index: number(g.round?.index) }, honba: number(g.honba), sticks: number(g.sticks), remaining: number(g.remaining),
        doras: tiles(g.doras), scores: g.scores.map(number), recentActor: number(g.recentActor), players: g.players.map((p, seat) => {
          if (!Array.isArray(p.melds) || p.melds.length > 4) throw new Error('副露数据无效。');
          return { seat, riichi: flags(p.riichi), norths: Number.isInteger(p.norths) && p.norths >= 0 && p.norths <= 4 ? p.norths : null,
            melds: p.melds.map(m => ({ type: number(m.type), tiles: tiles(m.tiles), froms: Array.isArray(m.froms) ? m.froms.map(x => Number.isInteger(x) && x >= 0 && x < count ? x : null).slice(0, 4) : [] })) };
        }) };
    }
    if (raw.rivers !== undefined) {
      if (!Array.isArray(raw.rivers) || raw.rivers.length > count) throw new Error('牌河数据无效。');
      const seen = new Set();
      data.rivers = raw.rivers.map(r => {
        if (!Number.isInteger(r.seat) || r.seat < 0 || r.seat >= count || seen.has(r.seat) || !Array.isArray(r.discards) || r.discards.length > 144) throw new Error('牌河座位或数据无效。');
        seen.add(r.seat);
        return { seat: r.seat, discards: r.discards.map(d => ({ tile: tile(d.tile), tsumogiri: flags(d.tsumogiri), riichi: flags(d.riichi), called: flags(d.called) })) };
      });
    }
    if (raw.selfHand !== undefined) {
      if (data.selfSeat === null) throw new Error('发送手牌前，请先选择自家座位。');
      data.selfHand = tiles(raw.selfHand);
      data.selfDrawnTile = raw.selfDrawnTile && tile(raw.selfDrawnTile) !== '?' ? tile(raw.selfDrawnTile) : null;
      if (data.selfHand.length > 14) throw new Error('自家手牌数量无效。');
    }
    if (!data.game && !data.rivers?.length && !data.selfHand) throw new Error('请至少选择一种发送数据。');
    return data;
  }
  function label(value) {
    const t = tile(value);
    if (t === '?') return '未知';
    if (t.endsWith('z')) return ['东', '南', '西', '北', '白', '发', '中'][Number(t[0]) - 1];
    return (t[0] === '0' ? '赤5' : t[0]) + ({ m: '万', p: '筒', s: '索' }[t[1]]);
  }
  const api = { cleanTurnProgress, tile, label, cleanSnapshot };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MJSnapshotContract = api;
})(globalThis);
