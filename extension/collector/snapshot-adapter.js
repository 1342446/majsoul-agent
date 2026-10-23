(function (root) {
  'use strict';
  const C = typeof module !== 'undefined' && module.exports ? require('../contracts/snapshot.js') : root.MJSnapshotContract;
  const { tile } = C;
  function snapshot(s, selection) {
    if (!s.round) throw new Error('请先等待开局数据。');
    const count = s.scores.length === 3 ? 3 : 4;
    const data = { format: 'mj-analysis-v1', playerCount: count, source: s.source, complete: s.complete, phase: s.phase,
      selfSeat: s.selfSeat, lastStep: s.lastStep, warnings: s.warnings.slice(0, 8) };
    if (selection.game) {
      data.game = { round: { wind: s.round.wind, index: s.round.index }, honba: s.honba, sticks: s.sticks,
        remaining: s.remaining, doras: s.doras.map(tile), scores: s.scores.slice(0, count), recentActor: s.turn,
        players: s.players.slice(0, count).map((p, seat) => ({ seat, riichi: !!p.riichi, norths: p.norths,
          melds: p.melds.map(m => ({ type: m.type, tiles: m.tiles.map(tile), froms: (m.froms || []).slice() })) })) };
    }
    const seats = selection.rivers === 'all' ? Array.from({ length: count }, (_, i) => i)
      : selection.rivers === 'none' ? [] : [Number(selection.rivers)];
    if (seats.some(i => !Number.isInteger(i) || i < 0 || i >= count)) throw new Error('请选择有效的牌河座位。');
    if (seats.length) data.rivers = seats.map(seat => ({ seat, discards: s.players[seat].discards.map(d => ({
      tile: tile(d.tile), tsumogiri: typeof d.tsumogiri === 'boolean' ? d.tsumogiri : null, riichi: !!d.riichi, called: !!d.called })) }));
    if (selection.hand) {
      if (!Number.isInteger(s.selfSeat) || s.selfSeat < 0 || s.selfSeat >= count) throw new Error('发送手牌前，请先选择自家座位。');
      data.selfHand = (s.source === 'replay' ? s.players[s.selfSeat].hand : s.selfHand).map(tile);
      data.selfDrawnTile = s.drawnTiles?.[s.selfSeat] ? tile(s.drawnTiles[s.selfSeat]) : null;
    }
    if (!selection.game && !seats.length && !selection.hand) throw new Error('请至少选择一种发送数据。');
    return C.cleanSnapshot(data);
  }
  const api = { snapshot };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MJCollectorSnapshot = api;
})(globalThis);
