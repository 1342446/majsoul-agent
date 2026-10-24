(function (root) {
  'use strict';
  function create({ send, snapshot }) {
    let enabled = false, trustedSeat = null, generation = 0, requestId = 0, chain = Promise.resolve();
    const status = () => {
      const current = ++requestId;
      return send({ type: 'memory:status' }).then(result => {
        if (current === requestId) { enabled = result?.enabled === true; generation = result?.generation ?? 0; }
      }).catch(() => { if (current === requestId) enabled = false; });
    };
    function record(before, message, after, advice = null) {
      if (enabled && before.mode === 'live' && before.live.phase === 'playing' &&
          ((message.type === 'connection' && message.payload?.state === 'closed') ||
           (message.type === 'diagnostic' && ['动作解码', '消息读取', '牌局响应', '断线恢复'].includes(message.payload?.stage)))) {
        const s = before.live, identity = before.contextIdentity;
        if (identity.matchId && Number.isInteger(s.lastStep)) chain = chain.then(() => send({ type: 'memory:evidence', evidence: {
          source: 'live', generation, matchId: identity.matchId, roundId: `${identity.matchId}:${s.round?.wind}:${s.round?.index}:${s.honba}`,
          position: s.lastStep + 1, kind: 'Interrupted', reliable: false, identityKnown: false
        } })).catch(() => {});
      }
      if (message.type !== 'event' || message.payload?.source !== 'live' || after.mode !== 'live' || after.historical) return;
      const event = message.payload, state = after.live;
      if (event.kind === 'MJStart') { trustedSeat = null; return; }
      if (event.operation?.types?.length && Number.isInteger(event.operation.seat)) trustedSeat = event.operation.seat;
      const identity = after.contextIdentity;
      if (!identity.matchId || !identity.roundStartId || !Number.isInteger(event.step)) return;
      if (event.kind === 'NewRound') chain = chain.then(() => send({ type: 'memory:round-start', identity })).catch(() => {});
      if (!enabled) return;
      const own = event.seat === trustedSeat && trustedSeat === before.live.selfSeat;
      const stableRound = `${identity.matchId}:${state.round?.wind}:${state.round?.index}:${state.honba}`;
      const input = { source: 'live', generation, matchId: identity.matchId, roundId: stableRound, position: event.step, observedAt: Date.now(),
        kind: event.kind, selfSeat: state.selfSeat, identityKnown: trustedSeat !== null && trustedSeat === state.selfSeat,
        reliable: state.complete && state.turnProgress?.status === 'known', gameEnded: state.result?.gameEnded === true };
      if (own && ['DiscardTile', 'ChiPengGang', 'AnGangAddGang', 'BaBei'].includes(event.kind)) {
        if (typeof advice === 'string') input.advice = advice.slice(0, 1000);
        input.actual = { seat: event.seat, tile: event.tile, tiles: event.tiles, riichi: event.riichi };
        try { input.snapshot = snapshot(before.live, { game: true, hand: true, rivers: 'all' }); } catch (_) { input.reliable = false; }
      }
      // Ordered messages preserve action order even if runtime responses resolve out of order.
      chain = chain.then(() => send({ type: 'memory:evidence', evidence: input })).catch(() => {});
    }
    return { record, status, flush: () => chain };
  }
  const api = { create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MJUserMemoryCapture = api;
})(globalThis);
