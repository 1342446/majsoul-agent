(function (root) {
  'use strict';
  const C = typeof module !== 'undefined' && module.exports ? require('./contracts/snapshot.js') : root.MJSnapshotContract;
  const clone = value => structuredClone(value);
  const canonical = value => JSON.stringify(value && typeof value === 'object'
    ? Array.isArray(value) ? value.map(v => JSON.parse(canonical(v) ?? 'null'))
      : Object.fromEntries(Object.keys(value).sort().filter(k => value[k] !== undefined).map(k => [k, JSON.parse(canonical(value[k]) ?? 'null')])) : value);
  // The configuration itself is never retained. Callers provide only a public revision/selection.
  function publicConfig(config = {}) {
    return Object.fromEntries(['revision', 'memoryVersion', 'selection', 'mode', 'promptVersion', 'temperature', 'maxTokens'].filter(k => config[k] !== undefined).map(k => [k, config[k]]));
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
    const maxSessions = bound('sessions', 12, 32), maxCheckpoints = bound('checkpoints', 8, 32), maxExchanges = bound('exchanges', 64, 128), maxEvents = bound('events', 512, 1024);
    const maxBytes = bound('bytes', 2000000, 2000000);
    const nonce = short(instanceId) || (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`);
    let data = { schema: 2, sessions: [], next: 1, active: {} }, ready = null, writes = Promise.resolve(), pendingCleanup = false;
    const escapePath = key => String(key).replace(/~/g, '~0').replace(/\//g, '~1');
    function delta(before, after, path = '') {
      if (canonical(before) === canonical(after)) return [];
      if (Array.isArray(before) && Array.isArray(after)) {
        if (before.length <= after.length && before.every((v, i) => canonical(v) === canonical(after[i]))) {
          return after.slice(before.length).map(value => ({ op: 'add', path: path + '/-', value: clone(value) }));
        }
        if (before.length === after.length) {
          const changes = before.flatMap((value, i) => delta(value, after[i], path + '/' + i));
          // Object arrays (players, rivers) and scores retain precise independent facts.
          if (before.some(v => v && typeof v === 'object') || path === '/game/scores') return changes;
          const replace = [{ op: 'replace', path, value: clone(after) }];
          return canonical(changes).length <= canonical(replace).length ? changes : replace;
        }
        return [{ op: 'replace', path, value: clone(after) }];
      }
      if (before && after && typeof before === 'object' && typeof after === 'object' && !Array.isArray(before) && !Array.isArray(after)) {
        return [...new Set([...Object.keys(before), ...Object.keys(after)])].sort().flatMap(key => {
          const child = path + '/' + escapePath(key);
          if (!(key in after)) return [{ op: 'remove', path: child }];
          if (!(key in before)) return [{ op: 'add', path: child, value: clone(after[key]) }];
          return delta(before[key], after[key], child);
        });
      }
      return [{ op: 'replace', path, value: clone(after) }];
    }
    function apply(snapshot, changes) {
      const next = clone(snapshot);
      if (!Array.isArray(changes) || changes.length > 4096) throw new Error('Invalid snapshot changes');
      const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
      for (const c of changes) {
        if (!c || typeof c.path !== 'string' || !c.path.startsWith('/') || !['add', 'replace', 'remove'].includes(c.op)) throw new Error('Invalid snapshot changes');
        const parts = c.path.slice(1).split('/').map(part => {
          if (/~(?![01])/.test(part)) throw new Error('Invalid snapshot path');
          const key = part.replace(/~1/g, '/').replace(/~0/g, '~');
          if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new Error('Invalid snapshot path');
          return key;
        });
        if (parts.length > 16) throw new Error('Invalid snapshot depth');
        let parent = next;
        for (const key of parts.slice(0, -1)) {
          if (!parent || typeof parent !== 'object' || !own(parent, key)) throw new Error('Invalid snapshot path');
          parent = parent[key];
        }
        if (!parent || typeof parent !== 'object') throw new Error('Invalid snapshot path');
        const key = parts.at(-1);
        if (Array.isArray(parent)) {
          if (key !== '-' && !/^(0|[1-9][0-9]*)$/.test(key)) throw new Error('Invalid snapshot index');
          const index = key === '-' && c.op === 'add' ? parent.length : Number(key);
          if (!Number.isSafeInteger(index) || index < 0 || index > parent.length || (c.op !== 'add' && index === parent.length)) throw new Error('Invalid snapshot index');
          if (c.op === 'add') parent.splice(index, 0, clone(c.value));
          else if (c.op === 'remove') parent.splice(index, 1);
          else parent[index] = clone(c.value);
        } else {
          if (c.op !== 'add' && !own(parent, key)) throw new Error('Invalid snapshot path');
          if (c.op === 'remove') delete parent[key]; else parent[key] = clone(c.value);
        }
      }
      return C.cleanSnapshot(next);
    }
    function latest(s) {
      let snapshot = s.baseline.snapshot;
      for (const e of s.timeline) if (e.type === 'observation') snapshot = apply(snapshot, e.changes);
      return snapshot;
    }
    function cleanExchange(e) {
      if (!e || typeof e.id !== 'string' || !Number.isSafeInteger(e.version)) throw new Error('Invalid exchange');
      return { type: 'exchange', id: e.id.slice(0, 200), version: e.version,
        question: typeof e.question === 'string' ? e.question : '', answer: typeof e.answer === 'string' ? e.answer : '',
        ...(typeof e.request === 'string' ? { request: e.request } : {}) };
    }
    async function initialize() {
      if (!ready) ready = (async () => {
        if (!storage) return;
        const loaded = (await storage.get(storageKey))?.[storageKey];
        // Schema 1 rolling tails cannot prove a complete conversational prefix.
        if (loaded?.schema !== 2 || !Array.isArray(loaded.sessions) || !Number.isSafeInteger(loaded.next) || JSON.stringify(loaded).length * 3 > maxBytes) return;
        data.next = Math.max(1, loaded.next);
        data.sessions = loaded.sessions.slice(-maxSessions).flatMap(s => {
          try {
            if (typeof s.key !== 'string' || !/^[0-9a-f]{2,16}$/.test(s.key) || typeof s.id !== 'string' || !Number.isSafeInteger(s.version) || !Array.isArray(s.timeline)) return [];
            const baseline = { position: Number.isInteger(s.baseline.position) ? s.baseline.position : null,
              snapshot: C.cleanSnapshot(s.baseline.snapshot), origin: ['round-start', 'mid-round', 'checkpoint'].includes(s.baseline.origin) ? s.baseline.origin : 'checkpoint',
              ...(short(s.baseline.reason) ? { reason: short(s.baseline.reason) } : {}) };
            let snapshot = baseline.snapshot, position = baseline.position;
            const timeline = s.timeline.map(entry => {
              if (entry.type === 'exchange') {
                if (entry.version > s.version) throw new Error('Invalid exchange version');
                return cleanExchange(entry);
              }
              if (entry.type !== 'observation' || !Number.isInteger(entry.position) || position === null || entry.position <= position) throw new Error('Invalid observation order');
              const next = apply(snapshot, entry.changes);
              const events = cleanEvents(entry.events, next).filter(e => e.position > position && e.position <= entry.position);
              const result = { type: 'observation', position: entry.position, events, changes: delta(snapshot, next) };
              snapshot = next; position = entry.position; return result;
            });
            const prefixEvents = cleanEvents(s.prefixEvents, baseline.snapshot).filter(e => baseline.position !== null && e.position <= baseline.position);
            if (prefixEvents.length + timeline.reduce((n, e) => n + (e.events?.length || 0), 0) > maxEvents || timeline.filter(e => e.type === 'exchange').length > maxExchanges) return [];
            return [{ key: s.key, id: s.id, version: s.version, branch: Number.isInteger(s.branch) ? s.branch : 0,
              scope: short(s.scope) || '', lane: s.lane === 'manual-review' ? 'manual-review' : 'live', baseline, timeline, prefixEvents, needsCheckpoint: s.needsCheckpoint === true,
              checkpoint: { version: s.version, position } }];
          } catch (_) { return []; }
        });
        for (const s of data.sessions) if (loaded.active?.[activeKey(s.scope, s.lane)] === s.id) data.active[activeKey(s.scope, s.lane)] = s.id;
        if (size() > maxBytes) data = { schema: 2, sessions: [], next: data.next, active: {} };
      })();
      await ready;
    }
    function serial(work) {
      const operation = writes.then(async () => { await initialize(); if (pendingCleanup) await flushCleanup(); return work(); });
      writes = operation.catch(() => {}); return operation;
    }
    const size = () => JSON.stringify(data).length * 3;
    function evictInactive(keep) {
      while (size() > maxBytes && data.sessions.some(s => s !== keep)) data.sessions.splice(data.sessions.findIndex(s => s !== keep), 1);
      const ids = new Set(data.sessions.map(s => s.id));
      for (const key of Object.keys(data.active)) if (!ids.has(data.active[key])) delete data.active[key];
    }
    async function save() {
      if (size() > maxBytes) throw new Error('Round context exceeds local storage budget');
      if (storage) await storage.set({ [storageKey]: clone(data) });
    }
    async function flushCleanup() {
      let failure;
      for (let attempt = 0; attempt < 3; attempt++) {
        try { await save(); pendingCleanup = false; return; } catch (error) { failure = error; }
      }
      const error = new Error('Cancelled exchange cleanup could not be persisted; context is unavailable until storage recovers.');
      error.name = 'StorageRollbackError'; error.cause = failure; throw error;
    }
    const handleFor = s => ({ id: s.id, version: s.version, branch: s.branch });
    function current(handle) { return data.sessions.find(s => s.id === handle?.id && data.active[activeKey(s.scope, s.lane)] === s.id && s.version === handle.version && s.branch === handle.branch); }
    function cleanEvents(events, snapshot) {
      if (!Array.isArray(events)) return [];
      if (events.length > 4096) throw new Error('Event window exceeds the context input limit');
      const seen = new Set();
      const kinds = ['NewRound', 'DealTile', 'DiscardTile', 'ChiPengGang', 'AnGangAddGang', 'BaBei', 'Hule', 'NoTile', 'LiuJu'];
      return events.flatMap(e => {
        if (!e || !kinds.includes(e.kind) || e.source !== snapshot.source) return [];
        const position = Number.isInteger(e.recordIndex) ? e.recordIndex + (snapshot.source === 'replay' ? 1 : 0) : Number.isInteger(e.step) ? e.step : Number.isInteger(e.position) ? e.position : null;
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
      }).filter(event => { const key = canonical(event); if (seen.has(key)) return false; seen.add(key); return true; }).sort((a, b) => a.position - b.position);
    }
    async function observe(input) { return serial(async () => {
      if (Array.isArray(input.events) && input.events.length > 4096) throw new Error('Event window exceeds the context input limit');
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
      const key = hash(dimensions);
      const before = clone(data);
      try {
        let s = data.sessions.find(s => s.key === key);
        if (!s) { s = { key, id: `round-${nonce}-${data.next++}`, version: 0, branch: 0, scope, lane, baseline: null, timeline: [], prefixEvents: [], needsCheckpoint: false, checkpoint: null }; data.sessions.push(s); }
        const position = Number.isInteger(input.position) ? input.position : snapshot.lastStep;
        const last = s.checkpoint, previous = s.baseline ? latest(s) : null;
        const same = last && canonical(previous) === canonical(snapshot) && last.position === position;
        const rawEvents = Array.isArray(input.events) ? input.events.filter(e => e && typeof e === 'object') : [];
        const events = cleanEvents(rawEvents, snapshot).filter(e => position !== null && e.position <= position);
        const observations = s.timeline.filter(e => e.type === 'observation');
        const exchanges = s.timeline.filter(e => e.type === 'exchange');
        let reason = s.needsCheckpoint ? 'unrecorded-exchange' : null;
        if (last && !same && (position === null || last.position === null || position <= last.position)) reason = 'rewind-or-conflict';
        // Window bounds describe coverage, never assume consecutive supported event steps.
        const eventPosition = e => Number.isInteger(e.recordIndex) ? e.recordIndex + (snapshot.source === 'replay' ? 1 : 0) : e.step ?? e.position;
        const firstNew = rawEvents.filter(e => Number.isInteger(eventPosition(e)) && eventPosition(e) > last?.position).sort((a, b) => eventPosition(a) - eventPosition(b))[0];
        const predecessor = firstNew?.previousPosition ?? firstNew?.previousStep;
        if (last && position > last.position && input.historyComplete !== true &&
          ((Number.isInteger(input.eventWindowStart) && input.eventWindowStart > last.position) ||
          (Number.isInteger(predecessor) && predecessor > last.position))) reason = 'event-window-gap';
        const fresh = events.filter(e => last && e.position > last.position);
        if (last && !reason && (exchanges.length >= maxExchanges ||
          s.prefixEvents.length + observations.reduce((n, e) => n + e.events.length, 0) + fresh.length > maxEvents)) reason = 'checkpoint-rotation';
        function rebase(why) {
          if (s.baseline) s.branch++;
          const start = !why && position !== null && events.some(e => e.kind === 'NewRound' && e.position === position);
          s.baseline = { position, snapshot, origin: why ? 'checkpoint' : start ? 'round-start' : 'mid-round', ...(why ? { reason: why } : {}) };
          s.timeline = []; s.needsCheckpoint = false;
          // Tool-only captured history is not replayed as observations before this baseline.
          s.prefixEvents = events.length <= maxEvents ? events : [];
        }
        if (!s.baseline || reason) rebase(reason);
        else if (!same) s.timeline.push({ type: 'observation', position, events: fresh, changes: delta(previous, snapshot) });
        if (!same || reason || !last) { s.version++; s.checkpoint = { version: s.version, position }; }
        data.sessions = data.sessions.filter(x => x !== s).concat(s).slice(-maxSessions);
        data.active[activeKey(scope, lane)] = s.id;
        evictInactive(s);
        if (size() > maxBytes && s.timeline.length) { rebase('byte-budget'); evictInactive(s); }
        await save(); return clone(handleFor(s));
      } catch (error) { data = before; throw error; }
    }); }
    async function appendExchange(handle, exchange, { signal } = {}) { return serial(async () => {
      const cancelled = () => { const error = new Error('Exchange storage cancelled'); error.name = 'AbortError'; return error; };
      if (signal?.aborted) throw cancelled();
      const s = current(handle); if (!s) return false;
      const id = short(exchange?.id); if (!id) throw new Error('Exchange requires a stable id');
      if (s.timeline.some(e => e.type === 'exchange' && e.id === id)) return true;
      // Do not rotate this run's prefix. A rejected successful answer requires the next observation to rebase.
      const before = clone(data);
      try {
        const refused = s.needsCheckpoint || s.timeline.filter(e => e.type === 'exchange').length >= maxExchanges;
        if (!refused) s.timeline.push(cleanExchange({ ...exchange, id, version: s.version }));
        if (refused || size() > maxBytes) {
          if (!refused) s.timeline.pop();
          s.needsCheckpoint = true;
          await save(); return false;
        }
        await save();
        if (signal?.aborted) {
          data = before; pendingCleanup = true;
          await flushCleanup(); throw cancelled();
        }
      } catch (error) { data = before; throw error; }
      return true;
    }); }
    async function removeExchange(handle, id) { return serial(async () => {
      const s = data.sessions.find(s => s.id === handle?.id);
      if (!s) return false;
      const before = clone(data), count = s.timeline.length;
      s.timeline = s.timeline.filter(e => !(e.type === 'exchange' && e.id === id && e.version === handle.version));
      if (count !== s.timeline.length) { try { await save(); } catch (error) { data = before; throw error; } }
      return count !== s.timeline.length;
    }); }
    async function getContext(handle) { return serial(() => {
      const s = current(handle); if (!s) return null;
      let snapshot = s.baseline.snapshot;
      const checkpoints = [{ version: s.version - s.timeline.filter(e => e.type === 'observation').length, position: s.baseline.position, snapshot }];
      for (const e of s.timeline) if (e.type === 'observation') {
        snapshot = apply(snapshot, e.changes);
        checkpoints.push({ version: checkpoints.at(-1).version + 1, position: e.position, snapshot });
      }
      checkpoints.at(-1).version = s.version;
      return clone({ ...handleFor(s), lane: s.lane, baseline: s.baseline, timeline: s.timeline,
        checkpoint: { ...s.checkpoint, snapshot }, checkpoints: checkpoints.slice(-maxCheckpoints),
        events: [...s.prefixEvents, ...s.timeline.filter(e => e.type === 'observation').flatMap(e => e.events)],
        exchanges: s.timeline.filter(e => e.type === 'exchange').map(({ type, ...e }) => e) });
    }); }
    async function isCurrent(handle) { return serial(() => !!current(handle)); }
    async function reset() { return serial(async () => {
      const before = clone(data);
      data.sessions = []; data.active = {};
      try { await save(); } catch (error) { data = before; throw error; }
    }); }
    return { observe, appendExchange, removeExchange, getContext, isCurrent, reset };
  }
  const api = { createStore };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MJRoundContext = api;
})(globalThis);
