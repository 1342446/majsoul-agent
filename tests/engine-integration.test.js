'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const State = require('../extension/state.js');
const Snapshot = require('../extension/collector/snapshot-adapter.js');
const Mjai = require('../extension/adapters/mjai.js');
const { startEngineServer } = require('../agent/engine-server.cjs');

function input() {
  const hand = ['1m','2m','3m','1p','2p','3p','1s','2s','3s','1z','1z','1z','2z'];
  const events = [
    { kind: 'NewRound', source: 'live', step: 0, wind: 0, round: 0, honba: 0, sticks: 0,
      scores: [25000,25000,25000,25000], remaining: 70, doras: ['4p'], hand },
    { kind: 'DealTile', source: 'live', step: 1, seat: 0, tile: '9p', remaining: 69 }
  ];
  const state = events.reduce((s,e) => State.apply(s,e), State.initial('live',0));
  const snapshot = Snapshot.snapshot(state, { game: true, rivers: 'all', hand: true });
  const request = Mjai.fromObservation({ format: 'mj-observer-v1', mode: 'live', state, events }, { hand: true });
  return { snapshot, engineRequest: request, task: 'combined', type: 'model:analyze', provider: 'mjai' };
}
function worker(config, fetcher = fetch, permission = true, schedule = {}) {
  const listeners = [], requests = []; let changed;
  const context = vm.createContext({ URL, TextEncoder, TextDecoder, Uint8Array, AbortController, DOMException, structuredClone, performance, setTimeout, clearTimeout,
    chrome: { storage: { local: { setAccessLevel() {}, get: schedule.get || (async () => ({ modelConfig: config })) }, onChanged: { addListener(fn) { changed = fn; } } },
      permissions: { contains: schedule.contains || (async () => permission) }, runtime: { id: 'fixture', onMessage: { addListener(fn) { listeners.push(fn); } } } },
    fetch: async (...args) => { requests.push(args); return fetcher(...args); }
  });
  context.importScripts = (...files) => files.forEach(file => vm.runInContext(fs.readFileSync(path.join(__dirname,'../extension',file),'utf8'),context));
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../extension/background.js'),'utf8'),context);
  const sender = { id: 'fixture', tab: { id: 7 }, frameId: 0, url: 'https://game.maj-soul.com/1/' };
  const call = (message, from = sender) => new Promise(resolve => { if (listeners.at(-1)(message,from,value => resolve(structuredClone(value))) !== true) resolve(undefined); });
  return { call, requests, changed: (...args) => changed(...args), sender };
}
const configured = endpoint => ({ enabled: true, provider: 'mjai', model: 'mjai', endpoint, apiKey: 'test-engine-token' });

test('extension worker -> authenticated loopback bridge -> actual child process -> validated engine advice', async t => {
  const { server } = await startEngineServer({ port: 0, token: 'test-engine-token', config: {
    command: process.execPath, args: [path.join(__dirname,'fixtures/mjai-bot.cjs')], timeoutMs: 3000
  } });
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const endpoint = `http://127.0.0.1:${server.address().port}/analyze`, w = worker(configured(endpoint));
  const status = await w.call({ type: 'model:status' });
  assert.equal(status.provider, 'mjai'); assert.equal('apiKey' in status, false);
  const response = await w.call(input());
  assert.equal(response.ok, true, response.error);
  assert.equal(response.result.decision.tile, '9p'); assert.equal(response.engine.action.type, 'dahai');
  assert.deepEqual(Array.from(response.result.danger), []);
  assert.equal(response.trace.events.filter(e => e.status === 'completed').length, 3);
  assert.equal(JSON.stringify(response).includes('test-engine-token'), false);
  const [, options] = w.requests[0];
  assert.equal(options.headers.Authorization, 'Bearer test-engine-token');
  assert.equal(options.credentials, 'omit'); assert.equal(options.redirect, 'error');
  const sent = JSON.parse(options.body);
  assert.equal(sent.format, 'majsoul-mjai-v1'); assert.equal('snapshot' in sent, false);
  assert.equal('messages' in sent, false); assert.equal('apiKey' in sent, false);
  assert.ok(sent.events[1].tehais[1].every(t => t === '?'));
});

test('mjai stays opt-in and validates identity, permission, consent, context and local endpoint before network', async () => {
  for (const options of [
    { config: { enabled: false } }, { permission: false }, { config: { apiKey: '' } },
    { config: { endpoint: 'https://other.test/analyze' } }, { change: m => { delete m.snapshot.selfHand; } },
    { change: m => { m.task = 'danger'; } }, { change: m => { m.snapshot.game.round.index++; } },
    { change: m => { m.engineRequest.events[1].tehais[1][0] = '9m'; } }
  ]) {
    const w = worker({ ...configured('http://127.0.0.1:17341/analyze'), ...options.config }, () => { throw new Error('Unexpected network'); }, options.permission);
    const message = input(); options.change?.(message);
    const result = await w.call(message); assert.equal(result.ok, false); assert.equal(w.requests.length, 0);
  }
  const w = worker(configured('http://127.0.0.1:17341/analyze'));
  assert.equal(await w.call(input(), { ...w.sender, frameId: 1 }), undefined);
  assert.equal(w.requests.length, 0);
});

test('engine preview is the actual scrubbed request and performs no inference; cancellation drops the request', async () => {
  const w = worker(configured('http://127.0.0.1:17341/analyze'), async (_url, options) => new Promise((resolve,reject) => {
    options.signal.addEventListener('abort', () => reject(new DOMException('cancelled','AbortError')), { once: true });
  }));
  const preview = await w.call({ ...input(), type: 'model:prepare', provider: 'mjai' });
  assert.equal(preview.ok, true); assert.equal(preview.data.format, 'majsoul-mjai-v1'); assert.equal(w.requests.length, 0);
  const pending = w.call(input()); await new Promise(resolve => setImmediate(resolve));
  assert.equal(w.requests.length, 1);
  await w.call({ type: 'model:cancel' }); assert.match((await pending).error, /取消/);
});

test('worker refuses provider changes before preflight, including stale local-engine UI against remote chat settings', async () => {
  const chat = { enabled: true, provider: 'chat', model: 'chat-model', endpoint: 'https://provider.example/v1/chat/completions', apiKey: 'chat-key' };
  for (const [config, provider] of [[chat, 'mjai'], [configured('http://127.0.0.1:17341/analyze'), 'chat'], [configured('http://127.0.0.1:17341/analyze'), undefined]]) {
    const w = worker(config, () => { throw new Error('Unexpected provider request'); });
    const message = input(); message.provider = provider;
    const response = await w.call(message);
    assert.equal(response.ok, false); assert.match(response.error, /服务已变化/); assert.equal(w.requests.length, 0);
  }
});

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

test('cancel during deferred storage or permissions prevents all network and releases the reserved tab slot', async () => {
  for (const stage of ['storage', 'permission']) {
    const config = configured('http://127.0.0.1:17341/analyze'), entered = deferred(), release = deferred();
    let blocked = false;
    const schedule = stage === 'storage' ? { get: async () => {
      if (!blocked) { blocked = true; entered.resolve(); await release.promise; }
      return { modelConfig: config };
    } } : { contains: async () => {
      if (!blocked) { blocked = true; entered.resolve(); await release.promise; }
      return true;
    } };
    const w = worker(config, async () => new Response(JSON.stringify({ action: { type: 'dahai', actor: 0, pai: '9p', tsumogiri: true } })), true, schedule);
    const pending = w.call(input()); await entered.promise;
    assert.match((await w.call(input())).error, /正在进行/);
    assert.equal(w.requests.length, 0);
    await w.call({ type: 'model:cancel' }); release.resolve();
    const cancelled = await pending;
    assert.equal(cancelled.ok, false); assert.match(cancelled.error, /取消/); assert.equal(w.requests.length, 0);
    const next = await w.call(input());
    assert.equal(next.ok, true, next.error); assert.equal(w.requests.length, 1);
  }
});

test('configuration changes during storage preflight cancel before permissions or network', async () => {
  const config = configured('http://127.0.0.1:17341/analyze'), entered = deferred(), release = deferred();
  let permissionChecks = 0;
  const w = worker(config, () => { throw new Error('Unexpected network'); }, true, {
    get: async () => { entered.resolve(); await release.promise; return { modelConfig: config }; },
    contains: async () => { permissionChecks++; return true; }
  });
  const pending = w.call(input()); await entered.promise;
  w.changed({ modelConfig: { newValue: undefined } }, 'local'); release.resolve();
  assert.match((await pending).error, /取消/); assert.equal(permissionChecks, 0); assert.equal(w.requests.length, 0);
});
