(function (root) {
  'use strict';
  const C = typeof module !== 'undefined' && module.exports ? require('./contracts/snapshot.js') : root.MJSnapshotContract;
  const copy = value => structuredClone(value);
  const id = value => typeof value === 'string' && /^[a-zA-Z0-9:_-]{1,240}$/.test(value) ? value : null;
  const text = (value, max = 300) => typeof value === 'string' ? value.trim().slice(0, max) : '';
  const terminal = ['Hule', 'NoTile', 'LiuJu'];
  const actions = ['DiscardTile', 'ChiPengGang', 'AnGangAddGang', 'BaBei'];
  const limits = Object.freeze({ rounds: 3, decisions: 20, matches: 8, jobs: 40, entries: 60, bytes: 3500000 });
  const integer = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;
  const secretText = value => /\bsk-[a-zA-Z0-9_-]{16,}|(?:api.?key|bearer|password|密钥|密码)\s*[:=：]\s*\S+/i.test(value);
  function cleanEntry(e) {
    if (!id(e?.id) || typeof e.text !== 'string' || !e.text.trim() || e.text.length > 300 || secretText(e.text)) throw new Error('Invalid stored memory');
    const out = { id: e.id, text: e.text.trim(), createdAt: integer(e.createdAt) };
    if (e.kind === 'explicit-preference' && e.status === 'confirmed') return { ...out, kind: e.kind, status: 'confirmed' };
    if (!['observation', 'learning-question'].includes(e.kind) || e.status !== 'candidate' || !id(e.matchId) ||
        !Array.isArray(e.evidenceIds) || !e.evidenceIds.length || e.evidenceIds.length > 20 || e.evidenceIds.some(key => !id(key)) ||
        e.samples !== e.evidenceIds.length || !Number.isInteger(e.opportunities) || e.opportunities < e.samples || e.opportunities > 2560 ||
        !['any', 'opponent-riichi'].includes(e.situation) || !['discard', 'riichi', 'call', 'kan', 'north'].includes(e.behavior) ||
        typeof e.context !== 'string' || !e.context.trim() || e.context.length > 200) throw new Error('Invalid stored candidate');
    return { ...out, kind: e.kind, status: 'candidate', context: e.context, matchId: e.matchId, evidenceIds: e.evidenceIds.slice(),
      samples: e.samples, opportunities: e.opportunities, situation: e.situation, behavior: e.behavior, expiresAt: integer(e.expiresAt) };
  }
  function cleanAccounting(raw) {
    const numbers = (value, keys) => Object.fromEntries(keys.map(key => [key, typeof value?.[key] === 'number' && Number.isFinite(value[key]) && value[key] >= 0 ? value[key] : null]));
    return { lane: 'memory', calls: Math.min(1, integer(raw?.calls)), elapsedMs: integer(raw?.elapsedMs),
      usage: numbers(raw?.usage, ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'reasoningTokens', 'uncachedInputTokens']),
      cost: { currency: text(raw?.cost?.currency, 16) || null, ...numbers(raw?.cost, ['inputCost', 'outputCost', 'cacheReadCost', 'cacheWriteCost', 'totalCost']) } };
  }
  const safely = (list, count, clean) => (Array.isArray(list) ? list : []).slice(-count).flatMap(value => { try { return [clean(value)]; } catch (_) { return []; } });
  function restore(saved) {
    const entries = safely(saved.entries, limits.entries, cleanEntry);
    const matches = safely(saved.matches, limits.matches, m => {
      if (!id(m?.id) || m.profile !== 'local-self') throw new Error('Invalid stored match');
      const rounds = safely(m.rounds, 32, r => {
        if (!id(r?.id)) throw new Error('Invalid stored round');
        const decisions = safely(r.decisions, 80, e => {
          const clean = cleanEvidence({ source: 'live', matchId: m.id, roundId: r.id, position: e.position, observedAt: e.observedAt,
            kind: e.actual?.kind, selfSeat: e.actual?.seat, identityKnown: true, reliable: true, snapshot: e.snapshot, actual: e.actual, advice: e.advice });
          if (!clean.snapshot || !clean.reliable) throw new Error('Invalid stored evidence');
          return { id: `${r.id}:${clean.position}`, position: clean.position, observedAt: clean.observedAt, snapshot: clean.snapshot, actual: clean.actual, ...(clean.advice ? { advice: clean.advice } : {}) };
        });
        return { id: r.id, started: r.started === true, reliable: r.reliable === true && decisions.length === r.decisions?.length,
          ended: r.ended === true, last: integer(r.last), decisions };
      });
      return { id: m.id, profile: 'local-self', rounds, identityKnown: m.identityKnown === true, interrupted: m.interrupted === true,
        frozen: m.frozen === true, finishedAt: integer(m.finishedAt), learningRounds: (Array.isArray(m.learningRounds) ? m.learningRounds : []).filter(key => rounds.some(r => r.id === key && r.started && r.ended && r.reliable)).slice(0, 32) };
    });
    const jobs = safely(saved.jobs, limits.jobs, j => {
      if (!id(j?.id) || !id(j.matchId) || j.id !== `memory:${j.matchId}` || !['queued', 'running', 'uncertain', 'expired', 'insufficient', 'completed', 'failed', 'cancelled', 'budget-exceeded'].includes(j.status)) throw new Error('Invalid stored memory job');
      return { id: j.id, matchId: j.matchId, generation: integer(j.generation), status: j.status === 'running' || (j.status === 'queued' && j.calls > 0) ? 'uncertain' : j.status,
        calls: Math.min(1, integer(j.calls)), createdAt: integer(j.createdAt), startedAt: integer(j.startedAt), finishedAt: integer(j.finishedAt), ...(j.accounting ? { accounting: cleanAccounting(j.accounting) } : {}) };
    });
    return { schema: 1, generation: integer(saved.generation), enabled: saved.enabled === true, profile: 'local-self', version: integer(saved.version), entries, matches,
      jobs: [...new Map(jobs.map(job => [job.id, job])).values()],
      pins: safely(saved.pins, 24, p => { if (!id(p?.key)) throw new Error('Invalid pin'); return { key: p.key, version: integer(p.version), entries: safely(p.entries, limits.entries, cleanEntry) }; }) };
  }
  // The only learning input: public table + explicitly authorized own hand before an actual action.
  function cleanEvidence(raw) {
    if (raw?.source !== 'live' || !id(raw?.matchId) || !id(raw?.roundId) || !Number.isSafeInteger(raw.position) || raw.position < 0) throw new Error('Invalid evidence identity');
    const out = { matchId: raw.matchId, roundId: raw.roundId, position: raw.position, kind: raw.kind,
      selfSeat: Number.isInteger(raw.selfSeat) ? raw.selfSeat : null, identityKnown: raw.identityKnown === true,
      reliable: raw.reliable === true, started: raw.started === true, observedAt: Number.isSafeInteger(raw.observedAt) ? raw.observedAt : null, ended: terminal.includes(raw.kind),
      gameEnded: terminal.includes(raw.kind) && raw.gameEnded === true };
    if (raw.kind === 'NewRound') out.started = true;
    if (actions.includes(raw.kind) && raw.actual?.seat === out.selfSeat) {
      const snapshot = C.cleanSnapshot(raw.snapshot);
      if (snapshot.source !== 'live' || snapshot.selfSeat !== out.selfSeat || !snapshot.game || snapshot.rivers?.length !== snapshot.playerCount ||
          !snapshot.selfHand?.length || snapshot.selfHand.includes('?') || !snapshot.complete || snapshot.game.turnProgress.status !== 'known') {
        out.reliable = false;
      } else {
        out.snapshot = snapshot;
        out.actual = { kind: raw.kind, seat: out.selfSeat, tile: C.tile(raw.actual.tile),
          ...(Array.isArray(raw.actual.tiles) ? { tiles: raw.actual.tiles.slice(0, 4).map(C.tile) } : {}),
          ...(typeof raw.actual.riichi === 'boolean' ? { riichi: raw.actual.riichi } : {}) };
        // Advice is separate and never a user's action/preference.
        if (typeof raw.advice === 'string') out.advice = text(raw.advice, 1000);
      }
    }
    return out;
  }
  function validateCandidates(raw, match) {
    if (!raw || !Array.isArray(raw.candidates) || raw.candidates.length > 8) throw new Error('Invalid memory candidates');
    const evidence = new Map(match.rounds.flatMap(r => r.decisions).map(e => [e.id, e]));
    return raw.candidates.map(candidate => {
      const inSituation = e => candidate.situation === 'any' || (candidate.situation === 'opponent-riichi' && e.snapshot.game.players.some(p => p.seat !== e.snapshot.selfSeat && p.riichi));
      const behavior = e => candidate.behavior === 'riichi' ? e.actual.kind === 'DiscardTile' && e.actual.riichi === true
        : ({ discard: 'DiscardTile', call: 'ChiPengGang', kan: 'AnGangAddGang', north: 'BaBei' })[candidate.behavior] === e.actual.kind;
      const opportunities = [...evidence.values()].filter(inSituation).length;
      if (!candidate || !['observation', 'learning-question'].includes(candidate.kind) || typeof candidate.text !== 'string' ||
          !candidate.text.trim() || candidate.text.length > 300 || typeof candidate.context !== 'string' || !candidate.context.trim() || candidate.context.length > 200 ||
          !Array.isArray(candidate.evidenceIds) || !candidate.evidenceIds.length || candidate.evidenceIds.length > 20 ||
          new Set(candidate.evidenceIds).size !== candidate.evidenceIds.length || candidate.evidenceIds.some(key => !evidence.has(key)) ||
          !['any', 'opponent-riichi'].includes(candidate.situation) || !['discard', 'riichi', 'call', 'kan', 'north'].includes(candidate.behavior) ||
          candidate.evidenceIds.some(key => !inSituation(evidence.get(key)) || !behavior(evidence.get(key))) ||
          candidate.opportunities !== opportunities || opportunities < candidate.evidenceIds.length ||
          candidate.samples !== candidate.evidenceIds.length || candidate.matchId !== match.id) throw new Error('Unsubstantiated memory candidate');
      // Sample/opportunity counts are verified, not accepted as provider statistics.
      // No automatic stable traits, numeric confidence, sensitive-person labels, or model instructions.
      if (/api.?key|bearer|password|密钥|密码|人格|性格|政治|宗教|健康|忽略.{0,10}指令|system prompt/i.test(candidate.text + candidate.context)) throw new Error('Unsupported memory content');
      return { kind: candidate.kind, text: candidate.text.trim(), context: candidate.context.trim(), evidenceIds: candidate.evidenceIds.slice(),
        situation: candidate.situation, behavior: candidate.behavior, opportunities, samples: candidate.evidenceIds.length, matchId: match.id, status: 'candidate' };
    });
  }
  function create({ storage, clock = Date.now, storageKey = 'agentUserMemoryV1' } = {}) {
    const blank = () => ({ schema: 1, generation: 0, enabled: false, profile: 'local-self', version: 0, entries: [], matches: [], jobs: [], pins: [] });
    let data = blank(), ready, writes = Promise.resolve(), epoch = 0, cleanup = false;
    async function initialize() {
      if (!ready) ready = (async () => {
        const saved = (await storage?.get(storageKey))?.[storageKey];
        if (saved?.schema === 1 && JSON.stringify(saved).length * 3 <= limits.bytes && Array.isArray(saved.entries) && Array.isArray(saved.matches) && Array.isArray(saved.jobs)) {
          data = restore(saved);
          // The serial cleanup barrier persists sanitation before any new operation.
          // A transient storage failure must not poison the initialization promise.
          cleanup = true;
        }
      })();
      const initializing = ready;
      try { await initializing; } catch (error) { if (ready === initializing) ready = null; throw error; }
    }
    async function save(next) {
      if (JSON.stringify(next).length * 3 > limits.bytes) throw new Error('Memory storage budget exceeded');
      await storage?.set({ [storageKey]: copy(next) });
    }
    function serial(work) {
      const operation = writes.then(async () => { await initialize(); if (cleanup) { await save(data); cleanup = false; } return work(); });
      writes = operation.catch(() => {}); return operation;
    }
    async function commit(next, token = epoch, preserveIntent = false) {
      if (preserveIntent) {
        // User intent survives both later invalidations and a failed disk write.
        // The serial cleanup barrier must persist this state before accepting new work.
        data = next; cleanup = true; await save(data); cleanup = false; return true;
      }
      if (!preserveIntent && token !== epoch) return false;
      await save(next);
      if (!preserveIntent && token !== epoch) return false;
      data = next; return true;
    }
    function prune(next) {
      next.matches = next.matches.slice(-limits.matches); next.jobs = next.jobs.slice(-limits.jobs); next.entries = next.entries.slice(-limits.entries);
      next.pins = next.pins.slice(-24);
      while (JSON.stringify(next).length * 3 > limits.bytes && next.pins.length > 1) next.pins.shift();
      while (JSON.stringify(next).length * 3 > limits.bytes && next.matches.length > 1) next.matches.shift();
    }
    function invalidate(enabled) {
      ++epoch;
      return serial(async () => {
        const next = copy(data); if (typeof enabled === 'boolean') next.enabled = enabled; next.generation++; next.pins = [];
        for (const job of next.jobs) if (['queued', 'running'].includes(job.status)) job.status = 'cancelled';
        next.matches = []; await commit(next, epoch, true); return view();
      });
    }
    function view() { return copy({ enabled: data.enabled, generation: data.generation, version: data.version, entries: data.entries, jobs: data.jobs, thresholds: limits }); }
    function ingest(raw) { return serial(async () => {
      if (!data.enabled || (raw.generation !== undefined && raw.generation !== data.generation)) return { accepted: false };
      const e = cleanEvidence(raw), next = copy(data);
      if (next.jobs.some(j => j.matchId === e.matchId)) return { accepted: false, reason: 'frozen' };
      let match = next.matches.find(m => m.id === e.matchId);
      if (!match) { match = { id: e.matchId, profile: next.profile, rounds: [], identityKnown: false, frozen: false }; next.matches.push(match); }
      match.identityKnown ||= e.identityKnown;
      if (e.kind === 'Interrupted') match.interrupted = true;
      let round = match.rounds.find(r => r.id === e.roundId);
      if (!round) { round = { id: e.roundId, started: false, reliable: true, ended: false, decisions: [], last: -1 }; match.rounds.push(round); }
      if (e.position <= round.last) return { accepted: false, reason: 'duplicate' };
      if (round.last >= 0 && e.position !== round.last + 1) round.reliable = false;
      round.last = e.position; round.started ||= e.started; round.reliable &&= e.reliable; round.ended ||= e.ended;
      if (e.identityKnown && e.actual && e.snapshot) round.decisions.push({ id: `${e.roundId}:${e.position}`, position: e.position, observedAt: e.observedAt, snapshot: e.snapshot, actual: e.actual, ...(e.advice ? { advice: e.advice } : {}) });
      // Bound even unfinished/incomplete matches. An overflow makes the round ineligible.
      if (round.decisions.length > 80) { round.decisions.shift(); round.reliable = false; }
      if (match.rounds.length > 32) { match.rounds.shift(); match.identityKnown = false; }
      if (e.gameEnded) {
        match.frozen = true; match.finishedAt = clock();
        const reliable = match.rounds.filter(r => r.started && r.ended && r.reliable);
        const sufficient = !match.interrupted && match.identityKnown && reliable.length >= limits.rounds && reliable.reduce((n, r) => n + r.decisions.length, 0) >= limits.decisions;
        // Freeze only covered rounds into the model evidence version. Incomplete rounds remain audit evidence.
        match.learningRounds = reliable.map(r => r.id);
        next.jobs.push({ id: `memory:${match.id}`, matchId: match.id, generation: next.generation, status: sufficient ? 'queued' : 'insufficient', calls: 0, createdAt: clock() });
      }
      prune(next); await commit(next); return { accepted: true };
    }); }
    function claim() { return serial(async () => {
      if (!data.enabled) return null;
      const next = copy(data), job = next.jobs.find(j => j.status === 'queued' && j.generation === next.generation);
      if (!job) return null;
      const match = next.matches.find(m => m.id === job.matchId && m.frozen);
      if (!match) { job.status = 'expired'; await commit(next); return null; }
      job.status = 'running'; job.calls = 1; job.startedAt = clock();
      if (!await commit(next)) return null;
      return { job: copy(job), match: { ...copy(match), rounds: copy(match.rounds.filter(r => match.learningRounds.includes(r.id))) }, epoch };
    }); }
    function finish(claimed, raw, accounting, status = 'completed') { return serial(async () => {
      if (claimed.epoch !== epoch || !data.enabled || claimed.job.generation !== data.generation) return false;
      const next = copy(data), job = next.jobs.find(j => j.id === claimed.job.id);
      if (job?.status !== 'running') return false;
      job.status = status; job.finishedAt = clock(); job.accounting = cleanAccounting(accounting);
      if (status === 'completed') {
        const candidates = validateCandidates(raw, claimed.match);
        for (const candidate of candidates) next.entries.push({ ...candidate, id: `${job.id}:${next.version}:${next.entries.length}`, createdAt: clock(), expiresAt: clock() + 90 * 86400000 });
        next.version++;
      }
      prune(next); return commit(next, claimed.epoch);
    }); }
    function edit({ entryId, value, remove = false }) {
      if (secretText(value || '')) return Promise.reject(new Error('记忆只保存解释偏好，请勿填写密钥或密码。'));
      ++epoch;
      return serial(async () => {
        const next = copy(data); next.generation++; next.version++; next.pins = []; next.matches = [];
        for (const j of next.jobs) if (['running', 'queued'].includes(j.status)) j.status = 'cancelled';
        if (entryId) next.entries = next.entries.filter(e => e.id !== entryId);
        if (!remove && text(value)) next.entries.push({ id: `explicit:${next.version}`, kind: 'explicit-preference', text: text(value), status: 'confirmed', createdAt: clock() });
        prune(next); await commit(next, epoch, true); return view();
      });
    }
    function clear() {
      ++epoch;
      return serial(async () => {
        data = { ...blank(), generation: data.generation + 1, version: data.version + 1 };
        cleanup = true; await save(data); cleanup = false; return view();
      });
    }
    function pin(key) { return serial(async () => {
      if (!id(key)) return { version: data.version, entries: [] };
      let pin = data.pins.find(p => p.key === key);
      if (!pin) {
        pin = { key, version: data.version, entries: copy(data.entries.filter(e => !e.expiresAt || e.expiresAt > clock())) };
        const next = copy(data); next.pins.push(pin); next.pins = next.pins.slice(-24);
        prune(next);
        try { if (!await commit(next)) return { version: 0, entries: [] }; }
        catch (_) { return { version: 0, entries: [] }; }
      }
      return copy({ version: pin.version, entries: pin.entries });
    }); }
    return { configure: enabled => invalidate(enabled === true), invalidate: () => invalidate(), ingest, claim, finish, edit, clear, pin, status: () => serial(view), ready: initialize };
  }
  const api = { create, cleanEvidence, validateCandidates, limits };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MJUserMemory = api;
})(globalThis);
