/* Bounded professional-engine workflow. Only sanitized DTOs cross the boundary. */
(function (root) {
  'use strict';
  const node = typeof module !== 'undefined' && module.exports;
  const H = node ? require('./harness.js') : root.MJHarness;
  const S = node ? require('./contracts/snapshot.js') : root.MJSnapshotContract;
  const R = node ? require('./contracts/engine-result.js') : root.MJEngineResult;
  const L = node ? require('./mahjong-analysis.js') : root.MJMahjongAnalysis;
  function validateSnapshot(snapshot, request) {
    if (!snapshot.complete || snapshot.phase !== 'playing' || snapshot.playerCount !== 4 ||
        !snapshot.selfHand?.length || snapshot.selfHand.some(t => !/^(?:[1-9][mps]|0[mps]|[1-7]z)$/.test(t)) ||
        snapshot.selfSeat !== request.seat || !snapshot.game) throw new Error('专业引擎需要完整四人对局、自家手牌和一致座位。');
    const localAnalysis = L.analyze(snapshot);
    if (localAnalysis.efficiency.status !== 'available') throw new Error('当前自家手牌无法通过本地合法性校验。');
    // Replay the authorized self hand, never inspect collector state or opponent concealed tiles.
    const start = request.events[1], scores = start.scores.slice(), doras = [R.fromMjai(start.dora_marker)];
    let sticks = start.kyotaku;
    const rivers = Array.from({ length: 4 }, (_, seat) => ({ seat, discards: [] }));
    let hand = null, drawn = null, nextActor = start.oya, pendingDiscard = null, lastDiscardActor = null;
    const reached = new Set(), accepted = new Set();
    const remove = pai => { const tile = R.fromMjai(pai), index = hand.indexOf(tile); if (index < 0) throw new Error('引擎事件与自家手牌不一致。'); hand.splice(index, 1); };
    for (const event of request.events) {
      if (['chi', 'pon', 'daiminkan', 'ankan', 'kakan', 'end_kyoku', 'end_game'].includes(event.type)) throw new Error('当前适配仅支持无副露且未结束的本局决策。');
      if (event.type === 'tsumo') {
        if (pendingDiscard !== null || event.actor !== nextActor || reached.size !== accepted.size) throw new Error('引擎事件动作顺序或立直成立信息不连续。');
        pendingDiscard = event.actor;
        lastDiscardActor = null;
      }
      if (event.type === 'reach') {
        if (event.actor !== pendingDiscard || reached.has(event.actor)) throw new Error('立直事件顺序无效。');
        reached.add(event.actor);
      }
      if (event.type === 'reach_accepted') {
        if (!reached.has(event.actor) || accepted.has(event.actor) || lastDiscardActor !== event.actor || pendingDiscard !== null) throw new Error('立直成立事件顺序无效。');
        accepted.add(event.actor);
        scores[event.actor] -= 1000; sticks++;
      }
      if (event.type === 'dora') doras.push(R.fromMjai(event.dora_marker));
      if (event.type === 'dahai') {
        if (event.actor !== pendingDiscard || (accepted.has(event.actor) && !event.tsumogiri)) throw new Error('引擎事件缺少对应摸牌或立直后未摸切。');
        pendingDiscard = null; nextActor = (event.actor + 1) % 4;
        lastDiscardActor = event.actor;
        rivers[event.actor].discards.push({ tile: R.fromMjai(event.pai), tsumogiri: event.tsumogiri, riichi: reached.has(event.actor) && !accepted.has(event.actor), called: false });
      }
      if (event.type === 'start_kyoku') hand = event.tehais[request.seat].map(R.fromMjai);
      else if (event.actor === request.seat && hand) {
        if (event.type === 'tsumo') { drawn = R.fromMjai(event.pai); hand.push(drawn); }
        if (event.type === 'dahai') {
          if ((accepted.has(event.actor) && !event.tsumogiri) || (event.tsumogiri && R.fromMjai(event.pai) !== drawn)) throw new Error('摸切事件与摸牌或立直状态不一致。');
          remove(event.pai); drawn = null;
        }
      }
    }
    if (!hand || JSON.stringify([...hand].sort()) !== JSON.stringify([...snapshot.selfHand].sort())) throw new Error('引擎事件与当前自家手牌不一致。');
    if (snapshot.game.players.some(p => p.melds.length || p.riichi === null || p.riichi !== reached.has(p.seat))) throw new Error('引擎事件与当前副露或立直状态不一致。');
    if (drawn !== snapshot.selfDrawnTile) throw new Error('引擎事件与当前摸牌不一致。');
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    if (snapshot.game.round.wind !== ['E', 'S', 'W', 'N'].indexOf(start.bakaze) || snapshot.game.round.index !== start.kyoku - 1 ||
        snapshot.game.honba !== start.honba || snapshot.game.sticks !== sticks || !same(snapshot.game.scores, scores) || !same(snapshot.game.doras, doras)) {
      throw new Error('引擎事件与当前局数、点数或宝牌不一致。');
    }
    if (!Array.isArray(snapshot.rivers) || snapshot.rivers.length !== 4 || rivers.some(r => {
      const actual = snapshot.rivers.find(x => x.seat === r.seat);
      return !actual || !same(actual.discards, r.discards);
    })) throw new Error('引擎事件与当前公开有序牌河不一致。');
    return localAnalysis;
  }
  async function run({ snapshot, request, infer, signal, timeoutMs, onEvent }) {
    if (typeof infer !== 'function') throw new Error('缺少专业引擎传输。');
    const adapter = node ? require('./adapters/mjai.js') : root.MJMjaiAdapter;
    if (!adapter) throw new Error('专业引擎协议适配器未加载。');
    // Snapshot synchronously so edits during an asynchronous inference cannot change validation.
    const input = { snapshot: S.cleanSnapshot(snapshot), request: adapter.validateRequest(request) };
    const tools = {
      'request.validate': value => ({ ...value, localAnalysis: validateSnapshot(value.snapshot, value.request) }),
      'engine.infer': async (value, context) => {
        const payload = JSON.parse(JSON.stringify(value.request));
        return { ...value, response: await infer(payload, context) };
      },
      'engine.validate': value => ({ ...R.validateResult(value.response, value), localAnalysis: value.localAnalysis })
    };
    const { output, trace } = await H.run({ steps: ['request.validate', 'engine.infer', 'engine.validate'], tools, input, signal, timeoutMs, onEvent });
    return { ...output, trace };
  }
  const api = { run };
  if (node) module.exports = api;
  else root.MJEngineAgent = api;
})(globalThis);
