(function (root) {
  'use strict';
  const C = typeof module !== 'undefined' && module.exports ? require('./contracts/snapshot.js') : root.MJSnapshotContract;
  const clone = value => structuredClone(value);
  const canonical = value => JSON.stringify(value && typeof value === 'object'
    ? Array.isArray(value) ? value.map(v => JSON.parse(canonical(v) ?? 'null'))
      : Object.fromEntries(Object.keys(value).sort().filter(k => value[k] !== undefined).map(k => [k, JSON.parse(canonical(value[k]) ?? 'null')])) : value);
  // The configuration itself is never retained. Callers provide only a public revision/selection.
  function publicConfig(config = {}) {
    return Object.fromEntries(['revision', 'selection', 'mode', 'promptVersion', 'temperature', 'maxTokens'].filter(k => config[k] !== undefined).map(k => [k, config[k]]));
  }
  function hash(value) {
    const text = canonical(value); let a = 2166136261, b = 5381;
    for (let i = 0; i < text.length; i++) { a = Math.imul(a ^ text.charCodeAt(i), 16777619); b = Math.imul(b, 33) ^ text.charCodeAt(i); }
    return (a >>> 0).toString(16) + (b >>> 0).toString(16);
  }
  const short = (v, n = 200) => typeof v === 'string' ? v.slice(0, n) : null;
  const activeKey = (scope, lane) => scope ? `${scope}:${lane}` : lane;
  function createStore({ storage = null, storageKey = 'agentRoundContextV1', limits = {}, instanceId } = {}) {
    const bound = (name, fallback, max) => Number.isInteger(limits[name]) ? Math.max(1, Math.min(max, limits[name])) : fallback;
    const maxSessions = bound('sessions', 12, 32), maxCheckpoints = bound('checkpoints', 8, 32), maxExchanges = bound('exchanges', 6, 20), maxEvents = bound('events', 64, 256);
    const maxBytes = bound('bytes', 2000000, 2000000);
    const nonce = short(instanceId) || (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`);
    let data = { schema: 1, sessions: [], next: 1, active: {} }, ready = null, writes = Promise.resolve();
    async function initialize() {
      if (!ready) ready = (async () => {
        if (!storage) return;
        const loaded = (await storage.get(storageKey))?.[storageKey];
        if (loaded?.schema !== 1 || !Array.isArray(loaded.sessions) || !Number.isSafeInteger(loaded.next)) return;
        // Only records written by this module are accepted; snapshot cleaning removes injected hidden fields.
        data.next = Math.max(1, loaded.next);
        data.sessions = loaded.sessions.slice(-maxSessions).flatMap(s => {
          try {
            if (typeof s.key !== 'string' || typeof s.id !== 'string' || !Number.isSafeInteger(s.version)) return [];
            const checkpoints = s.checkpoints.slice(-maxCheckpoints).map(p => ({ version: p.version, position: Number.isInteger(p.position) ? p.position : null, snapshot: C.cleanSnapshot(p.snapshot) }));
            return [{ key: s.key, id: s.id, version: s.version, branch: Number.isInteger(s.branch) ? s.branch : 0,
              scope: short(s.scope) || '', lane: s.lane === 'manual-review' ? 'manual-review' : 'live', checkpoints, events: cleanEvents(s.events, checkpoints.at(-1)?.snapshot || {}).filter(e => checkpoints.at(-1)?.position !== null && e.position <= checkpoints.at(-1)?.position),
              exchanges: (s.exchanges || []).slice(-maxExchanges).filter(e => typeof e.id === 'string' && Number.isInteger(e.version) && e.version <= s.version).map(e => ({ id: e.id.slice(0, 200), version: e.version, question: short(e.question, 4000) || '', answer: short(e.answer, 12000) || '' })) }];
          } catch (_) { return []; }
        });
        for (const s of data.sessions) {
          const key = activeKey(s.scope, s.lane);
          if (loaded.active?.[key] === s.id) data.active[key] = s.id;
        }
      })();
      await ready;
    }
    function serial(work) {
      const operation = writes.then(async () => { await initialize(); return work(); });
      writes = operation.catch(() => {}); return operation;
    }
    async function save() {
      // UTF-16 length * 3 is a conservative upper bound for UTF-8 JSON storage bytes.
      const size = () => JSON.stringify(data).length * 3;
      while (size() > maxBytes && data.sessions.length > 1) data.sessions.shift();
      const s = data.sessions[0];
      while (s && size() > maxBytes && s.checkpoints.length > 1) s.checkpoints.shift();
      while (s && size() > maxBytes && s.exchanges.length) s.exchanges.shift();
      while (s && size() > maxBytes && s.events.length) s.events.shift();
      if (size() > maxBytes) throw new Error('小局上下文超过本地存储预算。');
      if (storage) await storage.set({ [storageKey]: clone(data) });
    }
    const handleFor = s => ({ id: s.id, version: s.version, branch: s.branch });
    function current(handle) { return data.sessions.find(s => s.id === handle?.id && data.active[activeKey(s.scope, s.lane)] === s.id && s.version === handle.version && s.branch === handle.branch); }
    function cleanEvents(events, snapshot) {
      if (!Array.isArray(events)) return [];
      const kinds = ['NewRound', 'DealTile', 'DiscardTile', 'ChiPengGang', 'AnGangAddGang', 'BaBei', 'Hule', 'NoTile', 'LiuJu'];
      return events.slice(-maxEvents).flatMap(e => {
        if (!e || !kinds.includes(e.kind) || e.source !== snapshot.source) return [];
        const position = Number.isInteger(e.recordIndex) ? e.recordIndex : Number.isInteger(e.step) ? e.step : Number.isInteger(e.position) ? e.position : null;
        if (position === null) return [];
        if (e.kind === 'DiscardTile' && !snapshot.rivers?.some(r => r.seat === e.seat)) return [];
        if (['ChiPengGang', 'AnGangAddGang', 'BaBei'].includes(e.kind) && !snapshot.game) return [];
        const out = { kind: e.kind, source: e.source, position };
        if (Number.isInteger(e.seat) && e.seat >= 0 && e.seat < snapshot.playerCount) out.seat = e.seat;
        // Only self draws and public discards/calls may retain tiles, even for replay input.
        if (e.kind === 'DealTile') out.tile = e.seat === snapshot.selfSeat && snapshot.selfHand ? C.tile(e.tile) : '?';
        if (e.kind === 'DiscardTile') { out.tile = C.tile(e.tile); for (const k of ['riichi', 'tsumogiri']) if (typeof e[k] === 'boolean') out[k] = e[k]; }
        if (['ChiPengGang', 'AnGangAddGang'].includes(e.kind)) {
          if (Number.isInteger(e.meldType)) out.meldType = e.meldType;
          if (Array.isArray(e.tiles)) out.tiles = e.tiles.slice(0, 4).map(C.tile);
          if (e.tile) out.tile = C.tile(e.tile);
        }
        return [out];
      });
    }
    async function observe(input) { return serial(async () => {
      const snapshot = C.cleanSnapshot(input.snapshot), identity = input.identity || {};
      const lane = input.lane === 'manual-review' ? 'manual-review' : 'live';
      const scope = short(input.scope) || '';
      const round = snapshot.game?.round;
      const stable = !!short(identity.matchId) && !!short(identity.roundStartId);
      const dimensions = { match: short(identity.matchId) || nonce, start: short(identity.roundStartId) || nonce,
        round, honba: snapshot.game?.honba ?? null, view: short(identity.viewId), source: snapshot.source, seat: snapshot.selfSeat,
        ...(scope ? { scope } : {}), lane, provider: short(input.provider), model: short(input.model), task: short(input.task), config: hash(publicConfig(input.config)),
        // Selection is also derived from the actual authorized payload, not only caller metadata.
        selection: { game: !!snapshot.game, hand: snapshot.selfHand !== undefined, rivers: (snapshot.rivers || []).map(r => r.seat).sort() },
        isolated: stable ? null : `${nonce}-${data.next}` };
      const key = canonical(dimensions);
      let s = data.sessions.find(s => s.key === key);
      if (!s) { s = { key, id: `round-${data.next++}`, version: 0, branch: 0, scope, lane, checkpoints: [], events: [], exchanges: [] }; data.sessions.push(s); }
      const position = Number.isInteger(input.position) ? input.position : snapshot.lastStep;
      const last = s.checkpoints.at(-1), same = last && canonical(last.snapshot) === canonical(snapshot) && last.position === position;
      let events = cleanEvents(input.events, snapshot).filter(e => position !== null && e.position <= position);
      if (!same) {
        // A rewind or conflicting same-position state opens a clean branch. No future exchanges survive.
        if (last && (position === null || last.position === null || position <= last.position)) {
          s.branch++; s.checkpoints = []; s.events = []; s.exchanges = [];
        }
        s.version++;
        s.checkpoints.push({ version: s.version, position, snapshot });
        s.checkpoints = s.checkpoints.slice(-maxCheckpoints);
      }
      events = events.filter(e => !s.events.some(old => canonical(old) === canonical(e)));
      if (same && events.length) { s.version++; last.version = s.version; }
      for (const event of events) if (!s.events.some(old => canonical(old) === canonical(event))) s.events.push(event);
      s.events = s.events.slice(-maxEvents);
      data.sessions = data.sessions.filter(x => x !== s).concat(s).slice(-maxSessions);
      data.active[activeKey(scope, lane)] = s.id;
      await save(); return clone(handleFor(s));
    }); }
    async function appendExchange(handle, exchange, { signal } = {}) { return serial(async () => {
      const cancelled = () => { const error = new Error('问答保存已取消。'); error.name = 'AbortError'; return error; };
      if (signal?.aborted) throw cancelled();
      const s = current(handle); if (!s) return false;
      const id = short(exchange?.id); if (!id) throw new Error('问答记录需要稳定 id。');
      if (s.exchanges.some(e => e.id === id)) return true;
      s.exchanges.push({ id, version: s.version, question: short(exchange.question, 4000) || '', answer: short(exchange.answer, 12000) || '' });
      s.exchanges = s.exchanges.slice(-maxExchanges); await save();
      if (signal?.aborted) {
        s.exchanges = s.exchanges.filter(e => !(e.id === id && e.version === handle.version));
        await save(); throw cancelled();
      }
      return true;
    }); }
    async function removeExchange(handle, id) { return serial(async () => {
      // Cleanup must also work after a lane/version change made the original handle stale.
      const s = data.sessions.find(s => s.id === handle?.id);
      if (!s) return false;
      const before = s.exchanges.length;
      s.exchanges = s.exchanges.filter(e => !(e.id === id && e.version === handle.version));
      if (before !== s.exchanges.length) await save();
      return before !== s.exchanges.length;
    }); }
    async function getContext(handle) { return serial(() => {
      const s = current(handle); if (!s) return null;
      return clone({ ...handleFor(s), lane: s.lane, checkpoint: s.checkpoints.at(-1) || null,
        checkpoints: s.checkpoints, events: s.events, exchanges: s.exchanges });
    }); }
    async function isCurrent(handle) { return serial(() => !!current(handle)); }
    async function reset() { return serial(async () => { data.sessions = []; data.active = {}; await save(); }); }
    return { observe, appendExchange, removeExchange, getContext, isCurrent, reset };
  }
  const api = { createStore };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MJRoundContext = api;
})(globalThis);
