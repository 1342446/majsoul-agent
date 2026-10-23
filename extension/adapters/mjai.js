/* Pure, conservative conversion of observed records to a single-round mjai context. */
(function (root) {
  'use strict';
  const FORMAT = 'majsoul-mjai-v1', MAX_EVENTS = 2000;
  const fail = message => { throw new Error(message); };
  const obj = x => x && typeof x === 'object' && !Array.isArray(x);
  const integer = (x, min, max) => Number.isSafeInteger(x) && x >= min && x <= max;
  const player = x => integer(x, 0, 3);
  const tilePattern = /^(?:[1-9][mps]|5[mps]r|E|S|W|N|P|F|C)$/;
  function tile(t) {
    if (/^[1-7]z$/.test(t)) return ['E', 'S', 'W', 'N', 'P', 'F', 'C'][Number(t[0]) - 1];
    if (/^0[mps]$/.test(t)) return '5' + t[1] + 'r';
    if (/^[1-9][mps]$/.test(t)) return t;
    return fail('未知牌名');
  }
  const base = t => t.replace(/r$/, '');
  const keys = (x, allowed) => { if (!obj(x) || Object.keys(x).some(k => !allowed.includes(k))) fail('存在未允许字段'); };
  const checkTile = (x, unknown = false) => { if (!(typeof x === 'string' && (tilePattern.test(x) || (unknown && x === '?')))) fail('无效 mjai 牌名'); return x; };
  function validateRequest(raw) {
    keys(raw, ['format', 'seat', 'events']);
    if (raw.format !== FORMAT || !player(raw.seat) || !Array.isArray(raw.events) || raw.events.length < 2 || raw.events.length > MAX_EVENTS) fail('无效 mjai 请求');
    let bytes; try { bytes = JSON.stringify(raw).length; } catch (_) { fail('请求不可序列化'); }
    if (bytes > 256 * 1024) fail('mjai 请求过大');
    const seat = raw.seat;
    let started = false, ended = false, gameEnded = false;
    const events = raw.events.map((e, i) => {
      if (!obj(e) || typeof e.type !== 'string') fail('无效事件');
      const schemas = { start_game: ['id', 'names'], start_kyoku: ['bakaze', 'dora_marker', 'kyoku', 'honba', 'kyotaku', 'oya', 'scores', 'tehais'],
        tsumo: ['actor', 'pai'], dahai: ['actor', 'pai', 'tsumogiri'], chi: ['actor', 'target', 'pai', 'consumed'], pon: ['actor', 'target', 'pai', 'consumed'],
        daiminkan: ['actor', 'target', 'pai', 'consumed'], ankan: ['actor', 'consumed'], kakan: ['actor', 'pai', 'consumed'],
        reach: ['actor'], reach_accepted: ['actor'], dora: ['dora_marker'], end_kyoku: [], end_game: [] };
      const schema = schemas[e.type];
      if (!schema) fail('不支持的 mjai 事件');
      keys(e, ['type', ...schema]);
      if (schema.some(k => !Object.hasOwn(e, k))) fail('事件缺少必要字段');
      if (i === 0 && e.type !== 'start_game') fail('缺少 start_game');
      if (i === 1 && e.type !== 'start_kyoku') fail('缺少 start_kyoku');
      if (gameEnded || (ended && e.type !== 'end_game')) fail('结束后存在动作');
      if (e.type === 'start_game') {
        if (i !== 0 || e.id !== seat || !Array.isArray(e.names) || e.names.length !== 4 || e.names.some((n, j) => n !== 'Player ' + j)) fail('无效匿名玩家');
      } else if (e.type === 'start_kyoku') {
        if (i !== 1 || !['E', 'S', 'W', 'N'].includes(e.bakaze) || !integer(e.kyoku, 1, 4) || e.oya !== e.kyoku - 1 || !integer(e.honba, 0, 1000) || !integer(e.kyotaku, 0, 1000)) fail('无效开局');
        checkTile(e.dora_marker);
        if (!Array.isArray(e.scores) || e.scores.length !== 4 || e.scores.some(s => !integer(s, -1000000, 1000000))) fail('仅支持四麻分数');
        if (!Array.isArray(e.tehais) || e.tehais.length !== 4 || e.tehais.some(h => !Array.isArray(h) || h.length !== 13)) fail('开局必须为13张');
        e.tehais.forEach((h, j) => h.forEach(t => { if (j === seat) checkTile(t); else if (t !== '?') fail('禁止对手暗牌'); }));
        started = true;
      } else {
        if (!started) fail('缺少开局');
        if ('actor' in e && !player(e.actor)) fail('无效 actor');
        if ('target' in e && (!player(e.target) || e.target === e.actor)) fail('无效 target');
        if ('pai' in e) { checkTile(e.pai, e.type === 'tsumo' && e.actor !== seat); if (e.type === 'tsumo' && e.actor !== seat && e.pai !== '?') fail('禁止对手摸牌'); }
        if ('tsumogiri' in e && typeof e.tsumogiri !== 'boolean') fail('缺少摸切标记');
        if ('consumed' in e) {
          const count = e.type === 'ankan' ? 4 : ['daiminkan', 'kakan'].includes(e.type) ? 3 : 2;
          if (!Array.isArray(e.consumed) || e.consumed.length !== count) fail('无效 consumed');
          e.consumed.forEach(t => checkTile(t));
          const all = e.type === 'ankan' ? e.consumed : [e.pai, ...e.consumed];
          if (e.type === 'chi') {
            const sorted = all.map(base).sort();
            if (sorted.some(t => !/^[1-9][mps]$/.test(t) || t[1] !== sorted[0][1]) || +sorted[1][0] !== +sorted[0][0] + 1 || +sorted[2][0] !== +sorted[1][0] + 1 || e.target !== (e.actor + 3) % 4) fail('无效 chi');
          } else if (all.some(t => base(t) !== base(all[0]))) fail('副露牌不一致');
        }
        if (e.type === 'dora') checkTile(e.dora_marker);
        if (e.type === 'end_kyoku') ended = true;
        if (e.type === 'end_game') { if (!ended) fail('缺少局结束'); gameEnded = true; }
      }
      // Copy only validated primitives and arrays; never pass caller objects to the bridge.
      const out = { type: e.type };
      schema.forEach(k => { out[k] = Array.isArray(e[k]) ? e[k].map(v => Array.isArray(v) ? v.slice() : v) : e[k]; });
      return out;
    });
    return { format: FORMAT, seat, events };
  }
  function fromObservation(observation, { seat, cursor, hand = false } = {}) {
    if (!obj(observation) || observation.format !== 'mj-observer-v1' || observation.historyView) fail('仅支持当前观察，历史结算快照不支持');
    if (hand !== true) fail('需要明确 hand:true 授权');
    const state = observation.state || {};
    if (seat === undefined) seat = state.selfSeat;
    if (!player(seat) || (observation.mode === 'live' && state.selfSeat != null && state.selfSeat !== seat)) fail('需要确认自家座位');
    if (!['live', 'replay'].includes(observation.mode)) fail('未知观察模式');
    const replay = observation.mode === 'replay', source = replay ? observation.replayRecords : observation.events;
    if (!Array.isArray(source)) fail('缺少事件记录');
    const end = replay ? (cursor === undefined ? observation.replayCursor : cursor) : source.length;
    if (!integer(end, 0, source.length)) fail('无效牌谱游标');
    if (!replay && (state.complete === false || state.seatTrackingIncomplete)) fail('采集不完整');
    let start = end - 1;
    while (start >= 0 && source[start]?.kind !== 'NewRound') start--;
    if (start < 0) fail('缺少本局开局，不能从中途重建');
    const records = source.slice(start, end);
    if (records.length > 1000) fail('本局事件过多');
    const first = records[0];
    if (!Array.isArray(first.scores) || first.scores.length !== 4) fail('unsupported: 仅支持四麻');
    const own = replay ? first.hands?.[seat] : first.hand;
    if (!player(first.round)) fail('无效庄家座位');
    if (!Array.isArray(own) || own.length !== 13) fail('自家开局需13张；14张庄家开局无法可靠分离摸牌，unsupported');
    let initialDealerDraw = false;
    if (replay) {
      if (!Array.isArray(first.hands) || first.hands.length !== 4 || first.hands.some((h, i) => !Array.isArray(h) || (h.length !== 13 && !(i === first.round && i !== seat && h.length === 14)))) fail('开局手牌张数不一致');
      // A recorded opponent dealer's 14 tiles prove that its first draw is
      // already included. Both the thirteen hidden tiles and the draw stay '?';
      // no choice of an actual concealed tile or later record is needed.
      initialDealerDraw = first.hands[first.round].length === 14;
      if (initialDealerDraw && records[1] && (records[1].kind === 'DealTile' ||
          (records[1].kind === 'DiscardTile' && records[1].seat !== first.round))) fail('庄家开局摸牌与首动作不一致');
    } else {
      // Live NewRound exposes only our hand. Infer the hidden initial dealer
      // draw only after the visible first discard confirms it, with the normal
      // four-player opening wall count. Do not inspect events beyond cursor.
      initialDealerDraw = seat !== first.round && first.remaining === 69 &&
        records[1]?.kind === 'DiscardTile' && records[1].seat === first.round;
    }
    if (!Array.isArray(first.doras) || first.doras.length !== 1) fail('缺少唯一开局宝牌');
    let ownHand = own.map(tile), doras = first.doras.map(tile), ended = false, lastStep = null, lastDiscard = null;
    const scores = first.scores.slice(); let sticks = first.sticks;
    const pons = new Map(), pendingReach = new Set(), declaredReach = new Set();
    const events = [{ type: 'start_game', id: seat, names: [0, 1, 2, 3].map(i => 'Player ' + i) },
      { type: 'start_kyoku', bakaze: ['E', 'S', 'W', 'N'][first.wind], dora_marker: doras[0], kyoku: first.round + 1, honba: first.honba, kyotaku: first.sticks, oya: first.round, scores: first.scores.slice(), tehais: [0, 1, 2, 3].map(i => i === seat ? ownHand.slice() : Array(13).fill('?')) }];
    if (initialDealerDraw) events.push({ type: 'tsumo', actor: first.round, pai: '?' });
    function remove(tiles) { for (const t of tiles) { const i = ownHand.indexOf(t); if (i < 0) fail('自家手牌与事件不一致'); ownHand.splice(i, 1); } }
    function accept(e) {
      const r = e.riichiSuccess;
      if (r) {
        if (typeof r.failed !== 'boolean' || !player(r.seat)) fail('立直成立字段缺失');
        if (!r.failed) {
          if (!pendingReach.has(r.seat)) fail('立直成立缺少宣言');
          if (r.score !== scores[r.seat] - 1000 || r.sticks !== sticks + 1) fail('立直成立分数不一致');
          scores[r.seat] = r.score; sticks = r.sticks;
          pendingReach.delete(r.seat); events.push({ type: 'reach_accepted', actor: r.seat });
        }
      }
    }
    function dora(e) {
      if (!e.doras?.length) return;
      const next = e.doras.map(tile);
      if (next.length < doras.length || doras.some((t, i) => t !== next[i]) || next.length > 5) fail('宝牌指示牌不连续');
      next.slice(doras.length).forEach(t => events.push({ type: 'dora', dora_marker: t })); doras = next;
    }
    for (let index = 0; index < records.length; index++) {
      const e = records[index];
      if (!obj(e) || e.source !== (replay ? 'replay' : 'live')) fail('事件来源不一致');
      if (replay) { if (e.recordIndex !== start + index) fail('牌谱序号缺口'); }
      else { if (!integer(e.step, 0, 1000000) || (lastStep !== null && e.step !== lastStep + 1)) fail('动作序号缺口'); lastStep = e.step; }
      if (index === 0) continue;
      if (ended) fail('本局结束后存在动作');
      if (['DealTile', 'DiscardTile', 'ChiPengGang', 'AnGangAddGang'].includes(e.kind) && !player(e.seat)) fail('无效事件座位');
      if (e.kind === 'DealTile') {
        accept(e); dora(e);
        const pai = e.seat === seat ? tile(e.tile) : '?';
        if (e.seat === seat) ownHand.push(pai);
        events.push({ type: 'tsumo', actor: e.seat, pai }); lastDiscard = null;
      } else if (e.kind === 'DiscardTile') {
        if (typeof e.riichi !== 'boolean' || typeof e.tsumogiri !== 'boolean') fail('弃牌必要标记缺失');
        const pai = tile(e.tile);
        if (e.seat === seat) remove([pai]);
        if (e.riichi) { if (declaredReach.has(e.seat)) fail('重复立直'); declaredReach.add(e.seat); pendingReach.add(e.seat); events.push({ type: 'reach', actor: e.seat }); }
        events.push({ type: 'dahai', actor: e.seat, pai, tsumogiri: e.tsumogiri }); dora(e);
        lastDiscard = { actor: e.seat, pai };
      } else if (e.kind === 'ChiPengGang') {
        accept(e);
        const type = ['chi', 'pon', 'daiminkan'][e.meldType];
        if (!type || !Array.isArray(e.tiles) || !Array.isArray(e.froms) || e.tiles.length !== (type === 'daiminkan' ? 4 : 3) || e.froms.length !== e.tiles.length) fail('未知或不完整副露');
        const tiles = e.tiles.map(tile), called = e.froms.map((s, i) => s !== e.seat ? i : -1).filter(i => i >= 0);
        if (called.length !== 1 || e.froms.some(s => !player(s))) fail('副露来源不完整');
        const i = called[0], consumed = tiles.filter((_, j) => j !== i), target = e.froms[i];
        if (!lastDiscard || lastDiscard.actor !== target || lastDiscard.pai !== tiles[i]) fail('副露缺少对应弃牌');
        if (e.seat === seat) remove(consumed);
        events.push({ type, actor: e.seat, target, pai: tiles[i], consumed });
        if (type === 'pon') pons.set(e.seat + ':' + base(tiles[i]), tiles);
        lastDiscard = null; dora(e);
      } else if (e.kind === 'AnGangAddGang') {
        const pai = tile(e.tile), key = e.seat + ':' + base(pai);
        if (e.meldType === 2) {
          const consumed = pons.get(key); if (!consumed) fail('加杠缺少原碰牌');
          if (e.seat === seat) remove([pai]);
          events.push({ type: 'kakan', actor: e.seat, pai, consumed: consumed.slice() }); pons.delete(key);
        } else if (e.meldType === 3) {
          let consumed;
          if (e.seat === seat) { consumed = ownHand.filter(t => base(t) === base(pai)); if (consumed.length !== 4) fail('暗杠手牌不足'); remove(consumed); }
          else { if (/^5[mps]/.test(pai)) fail('对手五暗杠赤牌构成未知，unsupported'); consumed = Array(4).fill(pai); }
          events.push({ type: 'ankan', actor: e.seat, consumed });
        } else fail('未知杠类型');
        lastDiscard = null; dora(e);
      } else if (['Hule', 'NoTile', 'LiuJu'].includes(e.kind)) {
        accept(e); dora(e); events.push({ type: 'end_kyoku' }); if (e.gameEnded === true) events.push({ type: 'end_game' }); ended = true;
      } else fail('unsupported: 未知或不支持动作 ' + String(e.kind));
    }
    return validateRequest({ format: FORMAT, seat, events });
  }
  const api = { fromObservation, validateRequest, tile };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.MJMjaiAdapter = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
