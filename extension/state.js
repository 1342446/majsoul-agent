(function (root) {
  'use strict';
  const canonical = tile => /^0[mps]$/.test(tile) ? '5' + tile[1] : tile;
  function initial(source = 'live', selfSeat = null) {
    return { source, selfSeat, phase: 'waiting', round: null, honba: 0, sticks: 0, remaining: null,
      doras: [], turn: null, selfHand: [], scores: [], complete: false, lastStep: null,
      players: Array.from({ length: 4 }, () => ({ hand: [], discards: [], melds: [], riichi: false, norths: 0 })), warnings: [] };
  }
  function warn(s, text) { if (!s.warnings.includes(text)) s.warnings.push(text); if (s.warnings.length > 8) s.warnings.shift(); }
  function remove(s, hand, tile, allowEquivalent = false) {
    let i = hand.indexOf(tile);
    if (i < 0 && allowEquivalent) i = hand.findIndex(t => canonical(t) === canonical(tile));
    if (i < 0) i = hand.indexOf('?');
    if (i >= 0) hand.splice(i, 1);
    else { s.complete = false; warn(s, '手牌更新不一致，需重新采集开局或核对座位'); }
  }
  function apply(state, e) {
    let s = structuredClone(state);
    if (e.source !== s.source) return s;
    if (e.kind === 'NewRound') {
      s = initial(e.source, s.selfSeat);
      if (e.source === 'live' && e.operation?.types?.length) s.selfSeat = e.operation.seat;
      s.phase = 'playing'; s.round = { wind: e.wind, index: e.round };
      s.honba = e.honba; s.sticks = e.sticks; s.scores = e.scores.slice();
      s.remaining = e.remaining; s.doras = e.doras.slice(); s.complete = true;
      s.turn = e.round;
      if (e.hands) e.hands.forEach((h, i) => { s.players[i].hand = h.slice(); });
      else s.selfHand = e.hand.slice();
    } else {
      if (e.step !== undefined && s.lastStep !== null && e.step <= s.lastStep) return s;
      if (e.step !== undefined && s.lastStep !== null && e.step > s.lastStep + 1) {
        s.complete = false; warn(s, '动作序号有缺口，当前局面可能不完整');
      }
      if (!s.complete && e.kind !== 'MJStart') warn(s, '未获得完整开局，请从开局采集');
      if (e.source === 'live' && e.operation?.types?.length) {
        if (s.selfSeat !== null && s.selfSeat !== e.operation.seat) warn(s, '操作提示座位与所选座位不同');
        else s.selfSeat = e.operation.seat;
      }
      const p = s.players[e.seat];
      const hand = e.source === 'replay' ? p?.hand : (e.seat === s.selfSeat ? s.selfHand : null);
      if (e.source === 'live' && s.selfSeat === null && ['DealTile', 'DiscardTile', 'ChiPengGang', 'AnGangAddGang', 'BaBei'].includes(e.kind)) {
        s.complete = false; warn(s, '自家座位尚未识别，手牌变化未完整追踪');
      }
      if (e.kind === 'DealTile') {
        s.turn = e.seat; if (hand) hand.push(e.tile);
      } else if (e.kind === 'DiscardTile') {
        s.turn = e.seat;
        if (hand) remove(s, hand, e.tile);
        p.discards.push({ tile: e.tile, riichi: e.riichi, tsumogiri: e.tsumogiri, called: false });
        if (e.riichi) p.riichi = true;
      } else if (e.kind === 'ChiPengGang') {
        s.turn = e.seat;
        p.melds.push({ type: e.meldType, tiles: e.tiles.slice(), froms: e.froms.slice() });
        if (e.froms.length !== e.tiles.length) { s.complete = false; warn(s, '副露来源字段缺失，未扣除手牌'); }
        else e.tiles.forEach((t, i) => {
          if (e.froms[i] === e.seat) { if (hand) remove(s, hand, t); }
          else {
            const river = s.players[e.froms[i]]?.discards;
            const last = river?.at(-1);
            if (last && last.tile === t && !last.called) last.called = true;
            else { s.complete = false; warn(s, '副露与牌河不一致'); }
          }
        });
      } else if (e.kind === 'AnGangAddGang') {
        s.turn = e.seat;
        // Liqi meld type: 2 = added kan, 3 = concealed kan.
        if (e.meldType === 2) {
          const meld = p.melds.find(m => m.tiles.length === 3 && m.tiles.every(t => canonical(t) === canonical(e.tile)));
          if (meld) { meld.tiles.push(e.tile); meld.type = 2; if (hand) remove(s, hand, e.tile); }
          else { s.complete = false; warn(s, '加杠未找到原碰牌'); }
        } else if (e.meldType === 3) {
          const removed = [];
          for (let i = 0; i < 4; i++) {
            const t = hand?.find(t => canonical(t) === canonical(e.tile)) || e.tile;
            removed.push(t); if (hand) remove(s, hand, t, true);
          }
          p.melds.push({ type: 3, tiles: removed, froms: [] });
        } else { s.complete = false; warn(s, '未知杠类型 ' + e.meldType); }
      } else if (e.kind === 'BaBei') {
        p.norths++; if (hand) remove(s, hand, '4z');
      } else if (['Hule', 'NoTile', 'LiuJu'].includes(e.kind)) s.phase = 'ended';
      else if (e.kind === 'Unsupported') { s.complete = false; warn(s, '未支持事件：' + e.name); }
    }
    if (e.remaining !== undefined && e.remaining !== null) s.remaining = e.remaining;
    if (e.doras?.length) s.doras = e.doras.slice();
    if (e.scores?.length) s.scores = e.scores.slice();
    if (e.sticks !== undefined && e.sticks !== null) s.sticks = e.sticks;
    if (e.riichiSuccess && !e.riichiSuccess.failed) {
      const r = e.riichiSuccess; s.scores[r.seat] = r.score; s.sticks = r.sticks; s.players[r.seat].riichi = true;
    }
    if (e.step !== undefined) s.lastStep = e.step;
    return s;
  }
  function label(tile) {
    if (tile === '?') return '未知';
    if (tile?.endsWith('z')) return ['东', '南', '西', '北', '白', '发', '中'][Number(tile[0]) - 1] || '未知';
    const suit = { m: '万', p: '筒', s: '索' }[tile?.[1]];
    return suit ? (tile[0] === '0' ? '赤5' : tile[0]) + suit : '未知';
  }
  function seatWind(state, seat) {
    if (!state.round || !Number.isInteger(seat)) return '座风待定';
    const count = state.scores.length === 3 ? 3 : 4;
    if (seat < 0 || seat >= count) return '座风待定';
    return ['东', '南', '西', '北'][(seat - state.round.index + count) % count];
  }
  function withSeatWinds(events) {
    let context = initial('replay');
    return events.map(e => {
      if (e.kind === 'NewRound') context = { round: { index: e.round }, scores: e.scores };
      return e.seat === undefined ? { ...e } : { ...e, seatWind: seatWind(context, e.seat) };
    });
  }
  const api = { initial, apply, label, seatWind, withSeatWinds };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.defineProperty(root, '__MJ_OBSERVER_STATE_V1__', { value: api });
})(typeof globalThis !== 'undefined' ? globalThis : this);
