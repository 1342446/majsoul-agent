/* Engine output is data, never renderer markup or a model-defined schema. */
(function (root) {
  'use strict';
  const fail = () => { throw new Error('专业引擎结果无效或当前动作不受支持。'); };
  const fromMjai = value => {
    if (typeof value !== 'string') return null;
    if (/^[1-9][mps]$/.test(value)) return value;
    if (/^5[mps]r$/.test(value)) return '0' + value[1];
    return ({ E: '1z', S: '2z', W: '3z', N: '4z', P: '5z', F: '6z', C: '7z' })[value] || null;
  };
  // Bound traversal before serialization, including objects supplied directly by a local transport.
  function bounded(value, depth = 0, budget = { nodes: 0, chars: 0 }, seen = new Set()) {
    if (++budget.nodes > 16000 || depth > 12) fail();
    if (typeof value === 'number' && !Number.isFinite(value)) fail();
    if (typeof value === 'string') { budget.chars += value.length; if (budget.chars > 65536) fail(); }
    if (value && typeof value === 'object') {
      if (seen.has(value) || (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) fail();
      seen.add(value);
      const keys = Object.keys(value);
      if (keys.length > 4096) fail();
      for (const key of keys) { budget.chars += key.length; if (budget.chars > 65536) fail(); bounded(value[key], depth + 1, budget, seen); }
      seen.delete(value);
    } else if (!['undefined', 'boolean', 'number', 'string', 'object'].includes(typeof value)) fail();
  }
  function validateResult(raw, { snapshot, request, localAnalysis }) {
    bounded(raw);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !raw.action || typeof raw.action !== 'object' || Array.isArray(raw.action)) fail();
    const a = raw.action, seat = snapshot.selfSeat, efficiency = localAnalysis.efficiency;
    for (const meta of [raw.meta, a.meta]) {
      if (meta?.q_values !== undefined && (!Array.isArray(meta.q_values) || meta.q_values.some(q => typeof q !== 'number' || !Number.isFinite(q)))) fail();
    }
    const last = [...request.events].reverse().find(e => !['dora', 'reach_accepted'].includes(e.type));
    const own = snapshot.game?.players[seat];
    const turn = last?.actor === seat && last.type === 'tsumo';
    const legalDiscard = t => turn && efficiency.status === 'available' && efficiency.canDiscard === true &&
      snapshot.selfHand.includes(t) && efficiency.candidates.some(c => c.tile === t);
    const reasons = [], limitations = ['引擎策略分值不是放铳概率；此结果仅供参考，不会自动执行动作。'];
    let tile = null, action;
    if (a.type === 'dahai') {
      tile = fromMjai(a.pai);
      if (a.actor !== seat || !tile || !legalDiscard(tile) || typeof a.tsumogiri !== 'boolean') fail();
      if (a.tsumogiri && (last.type !== 'tsumo' || fromMjai(last.pai) !== tile || snapshot.selfDrawnTile !== tile)) fail();
      if (!a.tsumogiri && tile === snapshot.selfDrawnTile && snapshot.selfHand.filter(t => t === tile).length === 1) fail();
      if (own.riichi === true && (!a.tsumogiri || tile !== snapshot.selfDrawnTile)) fail();
      action = { type: 'dahai', actor: seat, pai: a.pai, tsumogiri: a.tsumogiri };
      reasons.push('专业引擎建议弃牌，已通过当前手牌与本地合法候选校验。');
    } else if (a.type === 'reach') {
      if (a.actor !== seat || !turn || last.type !== 'tsumo' || own.riichi !== false || own.melds.length ||
          !(snapshot.game.scores[seat] >= 1000) || !(snapshot.game.remaining >= 4) ||
          !efficiency.candidates.some(c => c.shanten === 0 && legalDiscard(c.tile))) fail();
      action = { type: 'reach', actor: seat };
      reasons.push('专业引擎建议宣告立直；尚未返回可确定的立直弃牌，具体弃牌为空。');
      limitations.push('立直宣告与弃牌是两个动作，需用户确认具体弃牌。');
    } else if (a.type === 'none') {
      if (a.actor !== undefined && a.actor !== seat) fail();
      if (!last || !['dahai', 'kakan', 'ankan'].includes(last.type) || last.actor === seat) fail();
      action = { type: 'none', actor: seat };
      reasons.push('专业引擎建议跳过当前响应。');
    } else fail();
    // No implicit action-index mapping: different engines use different Q-vector layouts.
    if (a.meta?.q_values !== undefined || raw.meta?.q_values !== undefined) limitations.push('未提供可验证的动作索引映射，未展示 Q 值候选。');
    return {
      result: { task: 'combined', danger: [], efficiency: [], decision: { action: tile ? 'attack' : 'unknown', tile, reasons }, limitations },
      engine: { format: 'majsoul-engine-result-v1', action, candidates: [] }
    };
  }
  const api = { validateResult, fromMjai };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MJEngineResult = api;
})(globalThis);
