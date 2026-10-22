(function (root) {
  'use strict';
  const tile = t => /^(?:[0-9][mps]|[1-7]z|\?)$/.test(t) ? t : '?';
  function snapshot(s, selection) {
    if (!s.round) throw new Error('请先等待开局数据。');
    const count = s.scores.length === 3 ? 3 : 4;
    const data = { format: 'mj-analysis-v1', source: s.source, complete: s.complete, phase: s.phase,
      selfSeat: s.selfSeat, lastStep: s.lastStep, warnings: s.warnings.slice(0, 8) };
    if (selection.game) {
      data.game = { round: { wind: s.round.wind, index: s.round.index }, honba: s.honba, sticks: s.sticks,
        remaining: s.remaining, doras: s.doras.map(tile), scores: s.scores.slice(0, count), recentActor: s.turn,
        players: s.players.slice(0, count).map((p, seat) => ({ seat, riichi: !!p.riichi, norths: p.norths,
          melds: p.melds.map(m => ({ type: m.type, tiles: m.tiles.map(tile) })) })) };
    }
    const seats = selection.rivers === 'all' ? Array.from({ length: count }, (_, i) => i)
      : selection.rivers === 'none' ? [] : [Number(selection.rivers)];
    if (seats.some(i => !Number.isInteger(i) || i < 0 || i >= count)) throw new Error('请选择有效的牌河座位。');
    if (seats.length) data.rivers = seats.map(seat => ({ seat, discards: s.players[seat].discards.map(d => ({
      tile: tile(d.tile), tsumogiri: !!d.tsumogiri, riichi: !!d.riichi, called: !!d.called })) }));
    if (selection.hand) {
      if (!Number.isInteger(s.selfSeat) || s.selfSeat < 0 || s.selfSeat >= count) throw new Error('发送手牌前，请先选择自家座位。');
      data.selfHand = (s.source === 'replay' ? s.players[s.selfSeat].hand : s.selfHand).map(tile);
    }
    if (!selection.game && !seats.length && !selection.hand) throw new Error('请至少选择一种发送数据。');
    return data;
  }
  function endpoint(value) {
    let u; try { u = new URL(value); } catch (_) { throw new Error('请输入完整的接口地址。'); }
    if (u.username || u.password || u.search || u.hash || !(u.protocol === 'https:' ||
      (u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname)))) throw new Error('接口须使用 HTTPS；本机 localhost / 127.0.0.1 可使用 HTTP，且不能包含账号、查询或片段。');
    if (!u.pathname.endsWith('/chat/completions')) throw new Error('请输入完整的 /chat/completions 接口地址。');
    return u;
  }
  // Chrome match patterns use hostnames without ports; the actual fetch retains the port.
  function permissionOrigin(value) {
    const u = endpoint(value);
    return u.protocol + '//' + u.hostname + '/*';
  }
  const systemPrompt = '你是日式立直麻将复盘助手。仅根据用户提供的数据分析，不能假设知道对手暗牌或牌山。m/p/s 为万/筒/索，z 的1至7为东南西北白发中，0为赤五，?为未知；座位为协议编号，局数从0起。recentActor只是最近动作座位，不代表轮到谁。数据缺失或不连续必须说明。用简体中文，按用户选择的任务输出危险牌或出牌建议；危险牌需说明针对的对手、理由和不确定性，出牌建议需说明理由；两者都请求时先危险牌再出牌建议。无自家手牌时不能给确定的出牌建议，建议只能来自自家手牌。不要声称精确放铳概率。内容仅作参考，不操作游戏。';
  const api = { snapshot, endpoint, permissionOrigin, systemPrompt };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MJAnalysis = api;
})(globalThis);
