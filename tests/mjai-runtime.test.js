'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const http = require('node:http');
const { createRunner } = require('../agent/mjai-process.cjs');
const { createEngineServer, startEngineServer } = require('../agent/engine-server.cjs');
const bot = path.join(__dirname, 'fixtures/mjai-bot.cjs');
const config = (mode = 'ok', extra = {}) => ({ command: process.execPath, args: [bot, mode], timeoutMs: 3000, ...extra });
const request = () => ({ format: 'majsoul-mjai-v1', seat: 0, events: [
  { type: 'start_game', id: 0, names: [0, 1, 2, 3].map(n => 'Player ' + n) },
  { type: 'start_kyoku', bakaze: 'E', dora_marker: '1m', kyoku: 1, honba: 0, kyotaku: 0, oya: 0,
    scores: [25000, 25000, 25000, 25000], tehais: [Array(13).fill('1m'), ...Array.from({ length: 3 }, () => Array(13).fill('?'))] },
  { type: 'tsumo', actor: 0, pai: '9p' }
] });
async function serve(t, options = {}) {
  const result = createEngineServer({ runner: createRunner(config()), token: 'test-secret', ...options });
  await new Promise(resolve => result.server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { result.server.closeAllConnections(); result.server.close(resolve); }));
  return { ...result, url: `http://127.0.0.1:${result.server.address().port}` };
}
const send = (url, body, headers = {}, route = '/analyze') => fetch(url + route, { method: 'POST', headers: { Authorization: 'Bearer test-secret', 'Content-Type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });

test('mjai runtime sends one event array and kills persistent bot after a response', async () => {
  const runner = createRunner(config());
  const result = await runner.infer(request());
  assert.deepEqual(result, { action: { type: 'dahai', actor: 0, pai: '9p', tsumogiri: true } });
  assert.deepEqual(await runner.infer(request()), result);
  assert.throws(() => createRunner({ command: 'node', args: [], shell: true }));
  await assert.rejects(runner.infer({ ...request(), command: 'malicious' }));
});

test('mjai runtime bounds failures and never exposes process stderr/stdout', async () => {
  for (const mode of ['exit', 'bad', 'large', 'stderr', 'partial']) {
    await assert.rejects(createRunner(config(mode, { maxOutputBytes: 1024 })).infer(request()), error => {
      assert.equal(error.message, 'Engine inference failed');
      assert.equal(String(error).includes('SECRET_TOKEN'), false);
      return true;
    });
  }
  await assert.rejects(createRunner({ command: path.join(__dirname, 'nonexistent-bot'), args: [] }).infer(request()), { code: 'SPAWN_FAILED' });
  await assert.rejects(createRunner(config('hang', { timeoutMs: 100 })).infer(request()), { code: 'TIMEOUT' });
  await assert.rejects(createRunner(config('ok', { maxInputBytes: 10 })).infer(request()), { code: 'INPUT_LIMIT' });
});

test('mjai runtime honors cancellation before and during inference', async () => {
  const before = new AbortController(); before.abort();
  await assert.rejects(createRunner(config()).infer(request(), { signal: before.signal }), { name: 'AbortError' });
  const during = new AbortController();
  const promise = createRunner(config('hang')).infer(request(), { signal: during.signal });
  setTimeout(() => during.abort(), 100);
  await assert.rejects(promise, { name: 'AbortError' });
});

test('HTTP bridge authenticates, rejects origins and paths, and returns only the action', async t => {
  const { url } = await serve(t);
  assert.equal((await send(url, request(), { Authorization: '' })).status, 401);
  assert.equal((await send(url, request(), { Authorization: 'Bearer wrong' })).status, 401);
  assert.equal((await send(url, request(), { Origin: 'https://evil.test' })).status, 403);
  assert.equal((await send(url, request(), {}, '/analyze?token=test-secret')).status, 404);
  assert.equal((await send(url, request(), {}, '/other')).status, 404);
  const response = await send(url, request(), { Origin: 'chrome-extension://' + 'a'.repeat(32) });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), 'chrome-extension://' + 'a'.repeat(32));
  assert.deepEqual(await response.json(), { action: { type: 'dahai', actor: 0, pai: '9p', tsumogiri: true } });
});

test('HTTP rejects arbitrary executable fields, invalid JSON and oversized bodies', async t => {
  const { url } = await serve(t, { maxBodyBytes: 2048 });
  assert.equal((await send(url, { ...request(), command: process.execPath })).status, 400);
  const injected = request(); injected.events[2].apiKey = 'SECRET';
  assert.equal((await send(url, injected)).status, 400);
  assert.equal((await send(url, '{')).status, 400);
  assert.equal((await send(url, ' '.repeat(2049))).status, 413);
  assert.equal((await send(url, request(), { 'Content-Type': 'text/plain' })).status, 415);
});

test('HTTP process failures use generic responses and disconnect cancels inference', async t => {
  const { url } = await serve(t, { runner: createRunner(config('bad')) });
  const response = await send(url, request());
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: 'Engine request failed' });
  let started, cancelled;
  const began = new Promise(resolve => { started = resolve; });
  const aborted = new Promise(resolve => { cancelled = resolve; });
  const other = await serve(t, { runner: { infer: (_raw, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => { cancelled(); reject(new Error()); }, { once: true }); started();
  }) } });
  const connection = http.request(other.url + '/analyze', { method: 'POST', headers: { Authorization: 'Bearer test-secret', 'Content-Type': 'application/json' } });
  connection.on('error', () => {}); connection.end(JSON.stringify(request()));
  await began; connection.destroy();
  await Promise.race([aborted, new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('No cancellation')), 2000); timer.unref(); })]);
});

test('HTTP defaults to a generated token and start binds only loopback', async t => {
  const result = await startEngineServer({ config: config(), port: 0 });
  t.after(() => new Promise(resolve => result.server.close(resolve)));
  assert.equal(result.server.address().address, '127.0.0.1');
  assert.match(result.token, /^[a-f0-9]{64}$/);
  assert.throws(() => createEngineServer({ runner: createRunner(config()), token: '' }));
});

test('HTTP permits one inference, rejects concurrent requests without queuing and releases after success/failure', { timeout: 5000 }, async t => {
  let release, started, calls = 0;
  const began = new Promise(resolve => { started = resolve; });
  const { url } = await serve(t, { runner: { infer: () => {
    calls++;
    if (calls === 1) return new Promise(resolve => { release = resolve; started(); });
    if (calls === 2) throw new Error('PRIVATE_FAILURE');
    return Promise.resolve({ action: { type: 'none' } });
  } } });
  const first = send(url, request());
  await began;
  // Validation still runs before the busy check; rejected requests consume no slot.
  assert.equal((await send(url, { ...request(), command: 'arbitrary' })).status, 400);
  const concurrent = await send(url, request());
  assert.equal(concurrent.status, 429);
  assert.deepEqual(await concurrent.json(), { error: 'Engine is busy' });
  assert.equal(calls, 1);
  release({ action: { type: 'none' } });
  assert.equal((await first).status, 200);
  assert.equal(calls, 1); // A busy request was discarded rather than queued.
  const failed = await send(url, request());
  assert.equal(failed.status, 502);
  assert.deepEqual(await failed.json(), { error: 'Engine request failed' });
  assert.equal((await send(url, request())).status, 200);
  assert.equal(calls, 3);
});

test('HTTP holds the slot through disconnect cleanup and releases when cancellation settles', { timeout: 5000 }, async t => {
  let started, cancelled, finishCleanup, calls = 0;
  const began = new Promise(resolve => { started = resolve; });
  const aborted = new Promise(resolve => { cancelled = resolve; });
  const { url } = await serve(t, { runner: { infer: (_raw, { signal }) => {
    calls++;
    if (calls > 1) return Promise.resolve({ action: { type: 'none' } });
    return new Promise((resolve, reject) => {
      finishCleanup = () => reject(new Error('Cancelled'));
      signal.addEventListener('abort', cancelled, { once: true });
      started();
    });
  } } });
  const connection = http.request(url + '/analyze', { method: 'POST', headers: { Authorization: 'Bearer test-secret', 'Content-Type': 'application/json' } });
  connection.on('error', () => {}); connection.end(JSON.stringify(request()));
  await began; connection.destroy(); await aborted;
  assert.equal((await send(url, request())).status, 429);
  assert.equal(calls, 1);
  finishCleanup();
  assert.equal((await send(url, request())).status, 200);
  assert.equal(calls, 2);
});
