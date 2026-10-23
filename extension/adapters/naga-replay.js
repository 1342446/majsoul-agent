/* Independent, offline Tenhou JSON writer. Format reference: https://tenhou.net/mjlog.html
 * No game names, wall, account IDs, network, DOM or extension APIs are exported. */
(function (root) {
  'use strict';
  const FORMAT = 'majsoul-naga-export-v1';
  const fail = m => { throw new Error(m); };
  const int = (n, a = 0, b = 1000000) => Number.isSafeInteger(n) && n >= a && n <= b;
  const seat = n => int(n, 0, 3);
  const vector = v => Array.isArray(v) && v.length === 4 && v.every(n => int(n, -1000000));
  const base = n => n > 50 ? (n - 50) * 10 + 5 : n;
  function tile(t) {
    if (typeof t !== 'string' || !/^(?:[1-9][mps]|0[mps]|[1-7]z)$/.test(t)) fail('未知或缺失牌名');
    const suit = 'mpsz'.indexOf(t[1]) + 1;
    return t[0] === '0' ? 50 + suit : suit * 10 + Number(t[0]);
  }
  const YAKU = Object.freeze({
    '立直': '立直', '双立直': 'ダブル立直', '一发': '一発', '一発': '一発',
    '门前清自摸和': '門前清自摸和', '門前清自摸和': '門前清自摸和', '断幺九': '断幺九',
    '平和': '平和', '一杯口': '一盃口', '一盃口': '一盃口', '两杯口': '二盃口',
    '岭上开花': '嶺上開花', '抢杠': '槍槓', '海底摸月': '海底摸月', '河底捞鱼': '河底撈魚',
    '役牌 白': '役牌 白', '役牌 发': '役牌 發', '役牌 中': '役牌 中',
    '自风 东': '自風 東', '自风 南': '自風 南', '自风 西': '自風 西', '自风 北': '自風 北',
    '场风 东': '場風 東', '场风 南': '場風 南', '场风 西': '場風 西', '场风 北': '場風 北',
    '三色同顺': '三色同順', '一气通贯': '一気通貫', '混全带幺九': '混全帯幺九',
    '七对子': '七対子', '对对和': '対々和', '三暗刻': '三暗刻', '三杠子': '三槓子',
    '三色同刻': '三色同刻', '混老头': '混老頭', '小三元': '小三元',
    '纯全带幺九': '純全帯幺九', '混一色': '混一色', '清一色': '清一色',
    '宝牌': 'ドラ', '赤宝牌': '赤ドラ', '里宝牌': '裏ドラ',
    '国士无双': '国士無双', '四暗刻': '四暗刻', '大三元': '大三元', '小四喜': '小四喜',
    '大四喜': '大四喜', '字一色': '字一色', '绿一色': '緑一色', '清老头': '清老頭',
    '四杠子': '四槓子', '九莲宝灯': '九蓮宝燈', '天和': '天和', '地和': '地和'
  });
  function yakuName(name) {
    if (typeof name !== 'string') return null;
    if (Object.values(YAKU).includes(name)) return name;
    const key = name.replace(/[:：]/g, ' ');
    return Object.hasOwn(YAKU, key) ? YAKU[key] : null;
  }
  function completeHand(tiles, openMelds) {
    const counts = new Map(); tiles.map(base).forEach(t => counts.set(t, (counts.get(t) || 0) + 1));
    if (!openMelds && tiles.length === 14) {
      if (counts.size === 7 && [...counts.values()].every(n => n === 2)) return true;
      const terminals = [11, 19, 21, 29, 31, 39, 41, 42, 43, 44, 45, 46, 47];
      if (counts.size === 13 && terminals.every(t => counts.has(t))) return true;
    }
    if (tiles.length !== 14 - 3 * openMelds) return false;
    function groups() {
      const t = [...counts.keys()].sort((a, b) => a - b).find(t => counts.get(t));
      if (t === undefined) return true;
      const n = counts.get(t);
      if (n >= 3) { counts.set(t, n - 3); if (groups()) { counts.set(t, n); return true; } counts.set(t, n); }
      if (t < 40 && t % 10 <= 7 && counts.get(t + 1) && counts.get(t + 2)) {
        for (const x of [t, t + 1, t + 2]) counts.set(x, counts.get(x) - 1);
        const ok = groups(); for (const x of [t, t + 1, t + 2]) counts.set(x, counts.get(x) + 1); if (ok) return true;
      }
      return false;
    }
    for (const [t, n] of counts) if (n >= 2) { counts.set(t, n - 2); const ok = groups(); counts.set(t, n); if (ok) return true; }
    return false;
  }
  function convert(records, rules) {
    const first = records[0], dealer = first.round;
    if (!seat(dealer) || !int(first.wind, 0, 3) || !int(first.honba, 0, 100) || !int(first.sticks, 0, 100) || !vector(first.scores)) fail('仅支持完整四麻开局');
    if (!Array.isArray(first.hands) || first.hands.length !== 4 || first.hands.some((h, i) => !Array.isArray(h) || (h.length !== 13 && !(i === dealer && h.length === 14)))) fail('缺少四家完整配牌');
    const hands = first.hands.map(h => h.map(tile)), initial = hands.map(h => h.slice()), draws = [[], [], [], []], discards = [[], [], [], []];
    const seen = new Map(), reds = new Map();
    function reveal(t) {
      const b = base(t), n = (seen.get(b) || 0) + 1; seen.set(b, n);
      if (n > 4) fail('牌数量超过四张');
      if (t > 50) { const r = (reds.get(t) || 0) + 1; reds.set(t, r); if (!rules.redFives || r > 1) fail('赤五数量与规则不符'); }
      if (b % 10 === 5 && b < 40 && rules.redFives && n - (reds.get(50 + Math.floor(b / 10)) || 0) > 3) fail('普通五数量与赤牌规则不符');
    }
    hands.flat().forEach(reveal);
    let doras = [], ura = [], actor = dealer, phase = 'draw', last = null, drawn = null, ended = false, result;
    let scores = first.scores.slice(), sticks = first.sticks, pending = null, remaining = first.remaining;
    const reached = new Set(), melds = [[], [], [], []];
    function remove(s, ts) { for (const t of ts) { const at = hands[s].indexOf(t); if (at < 0) fail('手牌与动作不一致'); hands[s].splice(at, 1); } }
    function dora(e) {
      if (!Array.isArray(e.doras) || !e.doras.length) return;
      const ds = e.doras.map(tile);
      if (ds.length > 5 || ds.length < doras.length || doras.some((t, i) => t !== ds[i])) fail('宝牌指示牌不连续');
      ds.slice(doras.length).forEach(reveal); doras = ds;
    }
    dora(first); if (doras.length !== 1) fail('开局缺少唯一宝牌');
    if (hands[dealer].length === 14) {
      // A tsumogiri first discard identifies the included dealer draw without
      // guessing the ordering of the fourteen tiles in a provider array.
      const e = records[1];
      if (e?.kind !== 'DiscardTile' || e.seat !== dealer || e.tsumogiri !== true) fail('14张庄家配牌缺少可证明的首摸（首弃须摸切）');
      drawn = tile(e.tile); const at = initial[dealer].indexOf(drawn);
      if (at < 0) fail('庄家首摸不在配牌'); initial[dealer].splice(at, 1); draws[dealer].push(drawn); phase = 'discard';
    }
    function accept(e) {
      const r = e.riichiSuccess;
      if (!r) return;
      if (!seat(r.seat) || typeof r.failed !== 'boolean' || pending !== r.seat) fail('立直成立缺少对应宣言');
      if (!r.failed) { if (r.score !== scores[r.seat] - 1000 || r.sticks !== sticks + 1) fail('立直分数不一致'); scores[r.seat] = r.score; sticks++; }
      pending = null;
    }
    for (let i = 1; i < records.length; i++) {
      const e = records[i]; if (ended) fail('终局后仍有动作'); accept(e); dora(e);
      const s = e.seat;
      if (['DealTile', 'DiscardTile', 'ChiPengGang', 'AnGangAddGang'].includes(e.kind) && !seat(s)) fail('动作座位无效');
      if (e.kind === 'DealTile') {
        if (phase !== 'draw' || s !== actor) fail('摸牌顺序不一致');
        const t = tile(e.tile); reveal(t); hands[s].push(t); draws[s].push(t); drawn = t; phase = 'discard'; last = null;
        if (e.remaining != null) { if (!int(e.remaining, 0, 69) || (remaining != null && e.remaining !== remaining - 1)) fail('牌山余量不连续'); remaining = e.remaining; }
      } else if (e.kind === 'DiscardTile') {
        if (phase !== 'discard' || s !== actor || typeof e.tsumogiri !== 'boolean' || typeof e.riichi !== 'boolean') fail('弃牌顺序或标记不一致');
        const t = tile(e.tile); if (e.tsumogiri && drawn !== t) fail('摸切牌与摸牌不一致');
        if (reached.has(s) && !e.tsumogiri) fail('立直后非摸切'); remove(s, [t]);
        let out = e.tsumogiri ? 60 : t;
        if (e.riichi) { if (reached.has(s) || melds[s].some(m => m.type !== 'ankan') || scores[s] < 1000) fail('立直条件不一致'); reached.add(s); pending = s; out = 'r' + out; }
        discards[s].push(out); last = { seat: s, tile: t }; actor = (s + 1) % 4; phase = 'draw'; drawn = null;
      } else if (e.kind === 'ChiPengGang') {
        if (phase !== 'draw' || !last || last.seat === s || ![0, 1, 2].includes(e.meldType)) fail('副露缺少对应弃牌');
        const ts = e.tiles?.map(tile), from = e.froms;
        if (!ts || ts.length !== (e.meldType === 2 ? 4 : 3) || !Array.isArray(from) || from.length !== ts.length || from.some(x => !seat(x))) fail('副露字段不完整');
        const called = from.map((v, j) => v !== s ? j : -1).filter(j => j >= 0);
        if (called.length !== 1 || from[called[0]] !== last.seat || ts[called[0]] !== last.tile || reached.has(s)) fail('副露来源不一致');
        const taken = ts.filter((_, j) => j !== called[0]).sort((a, b) => base(a) - base(b));
        if (e.meldType === 0) {
          const bs = ts.map(base).sort((a, b) => a - b);
          if (last.seat !== (s + 3) % 4 || bs[0] >= 40 || Math.floor(bs[0] / 10) !== Math.floor(bs[2] / 10) || bs[1] !== bs[0] + 1 || bs[2] !== bs[0] + 2) fail('吃牌不合法');
        } else if (ts.some(t => base(t) !== base(ts[0]))) fail('碰杠牌不一致');
        remove(s, taken); const rel = (last.seat - s + 4) % 4;
        const marker = ['c', 'p', 'm'][e.meldType], pos = e.meldType === 0 ? 0 : rel === 3 ? 0 : rel === 2 ? 1 : ts.length - 1;
        const out = taken.map(String); out.splice(pos, 0, marker + last.tile); const code = out.join(''); draws[s].push(code);
        melds[s].push({ type: marker, tiles: ts, code }); actor = s; last = null; drawn = null;
        if (e.meldType === 2) { discards[s].push(0); phase = 'draw'; } else phase = 'discard';
      } else if (e.kind === 'AnGangAddGang') {
        if (phase !== 'discard' || actor !== s) fail('杠牌时序不一致');
        const t = tile(e.tile), b = base(t);
        if (e.meldType === 3) {
          const ts = hands[s].filter(x => base(x) === b); if (ts.length !== 4) fail('暗杠牌不足'); remove(s, ts);
          discards[s].push(ts.slice(0, 3).join('') + 'a' + ts[3]); melds[s].push({ type: 'ankan', tiles: ts });
        } else if (e.meldType === 2) {
          const m = melds[s].find(m => m.type === 'p' && base(m.tiles[0]) === b); if (!m) fail('加杠缺少原碰');
          remove(s, [t]); discards[s].push(m.code.replace('p', 'k' + t)); m.type = 'k';
        } else fail('未知杠类型');
        last = { seat: s, tile: t, kan: true }; drawn = null; phase = 'draw';
      } else if (e.kind === 'Hule') {
        if (!Array.isArray(e.winners) || !e.winners.length) fail('缺少和牌资料');
        if (e.winners.length !== 1) fail('首版不支持多家和牌：缺少逐家结算');
        const w = e.winners[0];
        if (!seat(w.seat) || typeof w.tsumo !== 'boolean' || typeof w.yakuman !== 'boolean' || w.responsibility?.value || w.responsibility?.seats?.length || e.responsibility) fail('和牌或包牌规则不支持');
        if (w.tsumo ? phase !== 'discard' || actor !== w.seat || drawn !== tile(w.tile) : !last || last.seat === w.seat || last.tile !== tile(w.tile)) fail('和牌与最后动作不一致');
        if (!completeHand(w.tsumo ? hands[w.seat] : hands[w.seat].concat(tile(w.tile)), melds[w.seat].length)) fail('和牌手牌形状不成立');
        if (pending !== null && pending !== last?.seat) fail('未解决的立直宣言');
        if (!Array.isArray(w.fans) || !w.fans.length || w.fans.some(f => !yakuName(f.name) || !int(f.value, 1, 100))) fail('役种缺失或尚不支持');
        if (!int(w.han, 1, 100) || !int(w.fu, 0, 200) || (!w.yakuman && w.fans.reduce((a, f) => a + f.value, 0) !== w.han)) fail('番符资料不一致');
        if (!Array.isArray(w.uraDoras)) fail('缺少明确里宝牌资料');
        ura = w.uraDoras.map(tile); if (ura.length > 5 || (reached.has(w.seat) && ura.length !== doras.length) || (!reached.has(w.seat) && ura.length)) fail('里宝牌数量不一致'); ura.forEach(reveal);
        const ds = e.deltas; if (!vector(ds) || !vector(e.oldScores) || e.oldScores.some((n, j) => n !== scores[j])) fail('缺少一致的和牌结算');
        if (!vector(e.scores) || e.scores.some((n, j) => n !== scores[j] + ds[j])) fail('和牌结算分数不一致');
        const source = w.tsumo ? w.seat : last.seat;
        let points;
        // Provider schemas do not document whether these points include honba.
        // Resolve that solely against the recorded four-seat settlement. Never
        // choose an interpretation from the field name or a sample's outcome.
        function paymentCandidate(includesHonba) {
          const expected = [0, 0, 0, 0], bonus = first.honba * (w.tsumo ? 100 : 300);
          const ron = w.pointRon - (includesHonba ? bonus : 0);
          const child = w.pointTsumoNonDealer - (includesHonba ? bonus : 0);
          const parent = w.pointTsumoDealer - (includesHonba ? bonus : 0);
          if (w.tsumo) {
            if (!int(child, 1) || (w.seat !== dealer && !int(parent, 1))) return null;
            for (let s = 0; s < 4; s++) if (s !== w.seat) { const p = (s === dealer ? parent : child) + bonus; expected[s] -= p; expected[w.seat] += p; }
          } else { if (!int(ron, 1)) return null; expected[source] -= ron + bonus; expected[w.seat] += ron + bonus; }
          expected[w.seat] += sticks * 1000;
          return ds.every((n, j) => n === expected[j]) ? { ron, child, parent } : null;
        }
        if (w.tsumo) {
          if (!int(w.pointTsumoNonDealer, 1) || (w.seat !== dealer && !int(w.pointTsumoDealer, 1))) fail('缺少自摸支付点数');
        } else if (!int(w.pointRon, 1)) fail('缺少荣和点数');
        const choices = [paymentCandidate(false), ...(first.honba ? [paymentCandidate(true)] : [])].filter(Boolean);
        if (choices.length !== 1) fail('和牌支付点数与结算不一致或本场解释不唯一');
        const payment = choices[0]; points = w.tsumo ? w.seat === dealer ? payment.child + '点∀' : payment.child + '-' + payment.parent + '点' : payment.ron + '点';
        const limit = w.yakuman ? '役満' : w.han >= 13 ? '数え役満' : w.han >= 11 ? '三倍満' : w.han >= 8 ? '倍満' : w.han >= 6 ? '跳満' : w.han === 5 || w.fu * Math.pow(2, w.han + 2) >= 2000 ? '満貫' : w.fu + '符' + w.han + '飜';
        result = ['和了', ds.slice(), [w.seat, source, w.seat, limit + points, ...w.fans.map(f => yakuName(f.name) + '(' + (w.yakuman ? '役満' : f.value + '飜') + ')')]];
        ended = true;
      } else if (e.kind === 'NoTile') {
        if (e.nagashi || e.hasHuleHistory || e.settlementUnknown || remaining !== 0 || phase !== 'draw' || pending !== null) fail('流局资料不足或特殊流局尚不支持');
        if (!Array.isArray(e.tenpai) || e.tenpai.length !== 4 || e.tenpai.some(t => typeof t !== 'boolean') || !vector(e.deltas) || !vector(e.oldScores) || e.oldScores.some((n, j) => n !== scores[j])) fail('流局结算不完整');
        const n = e.tenpai.filter(Boolean).length;
        const ds = e.tenpai.map(t => n === 0 || n === 4 ? 0 : t ? 3000 / n : -3000 / (4 - n));
        if (ds.some((v, j) => v !== e.deltas[j]) || !vector(e.scores) || e.scores.some((v, j) => v !== scores[j] + ds[j])) fail('流局听牌罚符不一致');
        result = ['流局', e.deltas.slice()]; ended = true;
      } else if (e.kind === 'LiuJu') fail('首版尚不支持途中流局');
      else fail('未知或不支持的牌谱动作');
    }
    if (!ended) fail('本局记录不完整：缺少终局');
    const kanCount = melds.flat().filter(m => ['m', 'ankan', 'k'].includes(m.type)).length;
    if (doras.length !== 1 + kanCount - (last?.kan && result[0] === '和了' && result[2][0] !== result[2][1] ? 1 : 0)) fail('杠次数与宝牌指示牌数量不一致');
    const log = [[first.wind * 4 + dealer, first.honba, first.sticks], first.scores.slice(), doras, ura];
    for (let s = 0; s < 4; s++) log.push(initial[s].sort((a, b) => a - b), draws[s], discards[s]); log.push(result);
    return { title: ['雀魂本地转换', ''], name: ['Player 1', 'Player 2', 'Player 3', 'Player 4'], rule: { disp: (rules.roundType === 'tonpu' ? '東' : '南') + '喰' + (rules.redFives ? '赤' : ''), aka: rules.redFives ? 1 : 0 }, log: [log] };
  }
  function fromObservation(observation, { rules } = {}) {
    if (!observation || observation.format !== 'mj-observer-v1' || observation.mode !== 'replay' || observation.historyView) fail('仅支持完整本地牌谱，不支持实战或结算快照');
    if (!rules || !['tonpu', 'hanchan'].includes(rules.roundType) || typeof rules.redFives !== 'boolean' || rules.kuitan !== true || Object.keys(rules).some(k => !['roundType', 'redFives', 'kuitan'].includes(k))) fail('请明确确认四麻东风/半庄、赤五及喰断规则');
    const rs = observation.replayRecords;
    if (!Array.isArray(rs) || !rs.length || rs.length > 25000 || JSON.stringify(rs).length > 8 * 1024 * 1024) fail('牌谱为空或超过大小限制');
    rs.forEach((e, i) => { if (!e || e.source !== 'replay' || e.recordIndex !== i) fail('牌谱来源或序号不连续'); });
    if (rs[0].kind !== 'NewRound') fail('牌谱缺少开局');
    const rounds = [], rejected = [];
    for (let start = 0; start < rs.length;) {
      let end = start + 1; while (end < rs.length && rs[end].kind !== 'NewRound') end++;
      const first = rs[start], id = 'round-' + start, label = ['东', '南', '西', '北'][first.wind] + (first.round + 1) + '局 ' + first.honba + '本场';
      try {
        if (end - start > 1000) fail('本局超过动作数量限制');
        const json = convert(rs.slice(start, end), rules), text = JSON.stringify(json);
        const url = 'https://tenhou.net/5/#json=' + encodeURIComponent(text);
        if (url.length > 128 * 1024) fail('本局导出URL过长');
        rounds.push({ id, label, json, text, url });
      } catch (error) { rejected.push({ id, label, reason: error.message }); }
      start = end;
    }
    return { format: FORMAT, rounds, rejected, text: rounds.map(r => r.url).join('\n') };
  }
  const api = { fromObservation, tile };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.MJNagaReplay = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
