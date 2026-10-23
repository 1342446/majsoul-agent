(function (root) {
  'use strict';
  const allTiles = Array.from({ length: 34 }, (_, i) => i < 27 ? (i % 9 + 1) + 'mps'[Math.floor(i / 9)] : (i - 26) + 'z');
  const canonical = t => typeof t === 'string' && /^0[mps]$/.test(t) ? '5' + t[1] : t;
  const index = t => allTiles.indexOf(canonical(t));
  const legal = (i, count) => i >= 0 && (count !== 3 || i === 0 || i >= 8);
  const calculationCache = new Map(), analysisCache = new Map();
  function countsOf(tiles, count) {
    if (!Array.isArray(tiles)) return null;
    const c = Array(34).fill(0);
    for (const tile of tiles) { const i = index(tile); if (!legal(i, count) || ++c[i] > 4) return null; }
    return c;
  }
  // Complete-hand oracle does not treat an impossible fifth copy as a waiting tile.
  function winning(c, melds) {
    if (!melds) {
      if (c.filter(n => n === 2).length === 7) return true;
      const terminals = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];
      if (terminals.every(i => c[i] > 0) && terminals.some(i => c[i] === 2)) return true;
    }
    function groups() {
      const i = c.findIndex(Boolean); if (i < 0) return true;
      if (c[i] >= 3) { c[i] -= 3; const ok = groups(); c[i] += 3; if (ok) return true; }
      if (i < 27 && i % 9 < 7 && c[i + 1] && c[i + 2]) {
        c[i]--; c[i + 1]--; c[i + 2]--; const ok = groups(); c[i]++; c[i + 1]++; c[i + 2]++; if (ok) return true;
      }
      return false;
    }
    for (let i = 0; i < 34; i++) if (c[i] >= 2) { c[i] -= 2; const ok = groups(); c[i] += 2; if (ok) return true; }
    return false;
  }
  function calculate(c, melds, meldTiles = Array(34).fill(0)) {
    const cacheKey = melds + ':' + c.join('') + ':' + meldTiles.join('');
    if (calculationCache.has(cacheKey)) return calculationCache.get(cacheKey);
    let best = 8;
    const lowerBound = c.reduce((sum, n) => sum + n, 0) + 3 * melds === 14 ? -1 : 0;
    function visit(start, m, t, pair) {
      if (best <= lowerBound) return;
      while (start < 34 && !c[start]) start++;
      if (start === 34) { best = Math.min(best, 8 - 2 * m - Math.min(t, 4 - m) - pair); return; }
      const n = c[start];
      if (m < 4 && n >= 3) { c[start] -= 3; visit(start, m + 1, t, pair); c[start] += 3; }
      if (m < 4 && start < 27 && start % 9 < 7 && c[start + 1] && c[start + 2]) {
        c[start]--; c[start + 1]--; c[start + 2]--; visit(start, m + 1, t, pair); c[start]++; c[start + 1]++; c[start + 2]++;
      }
      if (n >= 2) {
        c[start] -= 2;
        if (!pair) visit(start, m, t, 1);
        if (t < 4 - m) visit(start, m, t + 1, pair);
        c[start] += 2;
      }
      if (t < 4 - m && start < 27) for (const gap of [1, 2]) {
        if (start % 9 + gap < 9 && c[start + gap]) { c[start]--; c[start + gap]--; visit(start, m, t + 1, pair); c[start]++; c[start + gap]++; }
      }
      c[start]--; visit(start, m, t, pair); c[start]++;
    }
    visit(0, melds, 0, 0);
    if (!melds) {
      const pairs = c.filter(n => n >= 2).length, kinds = c.filter(Boolean).length;
      best = Math.min(best, 6 - pairs + Math.max(0, 7 - kinds));
      const terminals = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];
      best = Math.min(best, 13 - terminals.filter(i => c[i]).length - Number(terminals.some(i => c[i] >= 2)));
    }
    if (best === 0) {
      const hasWinningDraw = () => {
        for (let i = 0; i < 34; i++) if (c[i] + meldTiles[i] < 4) { c[i]++; const ok = winning(c, melds); c[i]--; if (ok) return true; }
        return false;
      };
      let liveWait = false;
      if (lowerBound === 0) liveWait = hasWinningDraw();
      else for (let i = 0; i < 34 && !liveWait; i++) if (c[i]) { c[i]--; liveWait = hasWinningDraw(); c[i]++; }
      if (!liveWait) best = 1;
    }
    if (calculationCache.size >= 4096) calculationCache.clear();
    calculationCache.set(cacheKey, best); return best;
  }
  // meldCount alone specifies group count, not tile ownership. Pass ownMeldTiles
  // to account for copies locked in one's exposed/concealed melds. This computes
  // standard shape shanten, with a legal completion check at tenpai; it is not a
  // full draw/discard reachability search for higher shanten values.
  function shanten(tiles, meldCount = 0, playerCount = 4, ownMeldTiles = []) {
    const c = countsOf(tiles, playerCount), exposed = countsOf(ownMeldTiles, playerCount);
    if (!c || !exposed || c.some((n, i) => n + exposed[i] > 4) || ![3, 4].includes(playerCount) || !Number.isInteger(meldCount) || meldCount < 0 || meldCount > 4 || ![13 - 3 * meldCount, 14 - 3 * meldCount].includes(tiles.length)) return null;
    return calculate(c, meldCount, exposed);
  }
  function validMeld(m, count) {
    const c = countsOf(m?.tiles, count);
    if (!c || ![3, 4].includes(m.tiles.length)) return false;
    const ids = m.tiles.map(index).sort((a, b) => a - b);
    return ids.every(i => i === ids[0]) || (count !== 3 && ids.length === 3 && ids[0] < 27 && Math.floor(ids[0] / 9) === Math.floor(ids[2] / 9) && ids[1] === ids[0] + 1 && ids[2] === ids[0] + 2);
  }
  function visibleCounts(s) {
    const counts = Array(34).fill(0), reasons = [];
    let invalid = false;
    let partial = s.complete !== true || !s.game || !s.selfHand || s.rivers?.length !== s.playerCount;
    const add = t => { const i = index(t); if (!legal(i, s.playerCount)) {
      partial = true;
      if (t === '?') reasons.push('已见牌包含未知牌，未见枚数仅为上界');
      else { invalid = true; reasons.push('已见牌包含规则不允许的牌'); }
    } else counts[i]++; };
    (s.selfHand || []).forEach(add); (s.game?.doras || []).forEach(add);
    const calledTokens = [];
    for (const p of s.game?.players || []) {
      for (const m of p.melds || []) {
        if (!(m.tiles || []).includes('?') && !validMeld(m, s.playerCount)) { invalid = true; reasons.push('已见副露结构不合法'); }
        for (const t of m.tiles || []) add(t);
        if (m.type !== 3) {
          const froms = m.froms || [], external = froms.map((from, i) => ({ from, tile: canonical(m.tiles[i]) })).filter(x => Number.isInteger(x.from) && x.from >= 0 && x.from < s.playerCount && x.from !== p.seat && x.tile);
          if (external.length === 1) calledTokens.push({ from: external[0].from, tiles: [external[0].tile] });
          else { partial = true; reasons.push('部分副露来源未知，鸣牌去重仅按每组最多一张保守匹配'); calledTokens.push({ from: null, tiles: (m.tiles || []).map(canonical) }); }
        }
      }
      if (!Number.isInteger(p.norths) || p.norths < 0 || p.norths > 4) partial = true;
      else for (let n = 0; n < p.norths; n++) add('4z');
    }
    for (const r of s.rivers || []) for (const d of r.discards || []) {
      const i = index(d.tile);
      const match = calledTokens.findIndex(token => (token.from === null || token.from === r.seat) && token.tiles.includes(canonical(d.tile)));
      if (d.called === true && s.game && i >= 0 && match >= 0) calledTokens.splice(match, 1);
      else { add(d.tile); if (d.called === true || d.called == null) partial = true; }
    }
    if (counts.some(n => n > 4)) { invalid = true; partial = true; reasons.push('已授权已见牌中同种牌超过四张'); }
    return { counts: Object.fromEntries(allTiles.filter((_, i) => counts[i]).map(t => [t, counts[index(t)]])), partial,
      invalid, reasons: [...new Set(reasons)], meaning: '4减已见数量是未见枚数上界，不是牌山剩余枚数。' };
  }
  function analyze(s) {
    const analysisKey = JSON.stringify(s);
    if (analysisCache.has(analysisKey)) return JSON.parse(analysisCache.get(analysisKey));
    const visibleTiles = visibleCounts(s), hand = s.selfHand;
    const unavailable = reason => ({ status: 'unavailable', reasons: [reason], candidates: [], current: null, visibleTiles });
    let efficiency;
    const own = s.game?.players?.find(p => p.seat === s.selfSeat);
    if (!hand) efficiency = unavailable('未授权自家手牌');
    else if (!own || !Array.isArray(own.melds)) efficiency = unavailable('未授权自家副露信息，无法确认手牌结构');
    else if (own.melds.length > 4 || own.melds.some(m => !validMeld(m, s.playerCount))) efficiency = unavailable('自家副露结构不合法或含未知牌');
    else if (visibleTiles.invalid) efficiency = unavailable(visibleTiles.reasons.join('；'));
    else {
      const melds = own.melds.length, ownMeldTiles = own.melds.flatMap(m => m.tiles), exposed = countsOf(ownMeldTiles, s.playerCount), c = countsOf(hand, s.playerCount), value = shanten(hand, melds, s.playerCount, ownMeldTiles);
      if (value === null) efficiency = unavailable('手牌含未知、超四张、非法牌或数量与副露不符');
      else {
        const cache = new Map();
        const evalCount = () => { const key = c.join(''); if (!cache.has(key)) cache.set(key, calculate(c, melds, exposed)); return cache.get(key); };
        function entry(discard) {
          const base = evalCount(), effectiveTiles = [];
          for (let i = 0; i < 34; i++) if (legal(i, s.playerCount) && c[i] + exposed[i] < 4) {
            c[i]++; const next = evalCount(); c[i]--;
            if (next < base) effectiveTiles.push({ tile: allTiles[i], unseenUpperBound: Math.max(0, 4 - (visibleTiles.counts[allTiles[i]] || 0)) });
          }
          return { ...(discard ? { tile: discard } : {}), shanten: base, effectiveTiles, totalUnseenUpperBound: effectiveTiles.reduce((a, t) => a + t.unseenUpperBound, 0) };
        }
        const fourteen = hand.length === 14 - 3 * melds, riichiAllowed = own.riichi !== true || hand.includes(s.selfDrawnTile);
        const canDiscard = fourteen && riichiAllowed;
        const candidates = canDiscard ? [...new Set(hand)].filter(t => own.riichi !== true || t === s.selfDrawnTile).map(t => { const i = index(t); c[i]--; const result = entry(t); c[i]++; return result; }) : [];
        efficiency = { status: 'available', reasons: own.riichi === true && !riichiAllowed ? ['已立直且摸牌未知，无法给出合法弃牌候选'] : [], handSize: hand.length, meldCount: melds, shanten: value, canDiscard,
          mathDefinition: '普通型、七对子、国士的标准形状向听；零向听额外验证合法和牌进张，排除自家持满四枚的死等待。高向听未做全部后续摸打路径可达性搜索。外部已见耗尽不改变形状向听。',
          candidates, current: fourteen ? null : entry(null), visibleTiles };
      }
    }
    const candidates = [...new Set((hand || allTiles).filter(t => legal(index(t), s.playerCount) && (!hand || own?.riichi !== true || t === s.selfDrawnTile)))];
    const danger = { status: candidates.length && s.rivers?.length ? 'available' : 'unavailable',
      limitations: ['现物仅表示当前快照中该对手不能荣和该牌，不能保证未来或其他对手安全；筋仅参考两面，壁仅限制部分顺子形状，均不代表绝对安全。', ...(visibleTiles.partial ? ['已见牌范围不完整。'] : []), ...visibleTiles.reasons],
      candidates: candidates.map(t => ({ tile: t,
      opponents: Array.from({ length: s.playerCount }, (_, seat) => seat).filter(seat => seat !== s.selfSeat).map(seat => {
        const river = s.rivers?.find(r => r.seat === seat), discarded = new Set((river?.discards || []).map(d => canonical(d.tile))), i = index(t);
        const sujiReferences = i < 27 ? [-3, 3].map(n => i + n).filter(j => j >= 0 && Math.floor(j / 9) === Math.floor(i / 9) && discarded.has(allTiles[j])).map(j => allTiles[j]) : [];
        const sujiCoverage = !sujiReferences.length ? 'none' : i % 9 >= 3 && i % 9 <= 5 && sujiReferences.length < 2 ? 'oneSideOnly' : 'bothSidedOrEdge';
        const kabeReferences = i < 27 && !visibleTiles.invalid ? [-2, -1, 1, 2].map(n => i + n).filter(j => j >= 0 && Math.floor(j / 9) === Math.floor(i / 9) && visibleTiles.counts[allTiles[j]] === 4).map(j => allTiles[j]) : [];
        return { seat, riverAvailable: !!river, genbutsu: discarded.has(canonical(t)), sujiReferences, sujiCoverage, kabeReferences,
          limitations: river ? [] : ['未授权该对手牌河，无法提取其现物和筋。'] };
      }) })) };
    const result = { efficiency, danger };
    if (analysisCache.size >= 8) analysisCache.delete(analysisCache.keys().next().value);
    analysisCache.set(analysisKey, JSON.stringify(result)); return result;
  }
  const api = { canonical, shanten, visibleCounts, analyze };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.MJMahjongAnalysis = api;
})(globalThis);
