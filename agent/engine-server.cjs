'use strict';
const http = require('node:http');
const fs = require('node:fs');
const crypto = require('node:crypto');
const Mjai = require('../extension/adapters/mjai.js');
const { createRunner } = require('./mjai-process.cjs');

function createEngineServer({ runner, token = crypto.randomBytes(32).toString('hex'), maxBodyBytes = 2 * 1024 * 1024 } = {}) {
  if (!runner || typeof runner.infer !== 'function' || typeof token !== 'string' || !token.trim() || /[\r\n]/.test(token)) throw new Error('Invalid server configuration');
  const secret = Buffer.from('Bearer ' + token);
  let busy = false;
  const server = http.createServer(async (req, res) => {
    const origin = req.headers.origin;
    const extensionOrigin = typeof origin === 'string' && /^chrome-extension:\/\/[a-p]{32}$/.test(origin);
    const reply = (status, value) => {
      if (res.destroyed || res.writableEnded) return;
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...(extensionOrigin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}) });
      res.end(JSON.stringify(value));
    };
    if (origin !== undefined && !extensionOrigin) { reply(403, { error: 'Origin rejected' }); return; }
    if (req.url !== '/analyze') { reply(404, { error: 'Not found' }); return; }
    if (req.method === 'OPTIONS' && extensionOrigin) {
      res.writeHead(204, { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', Vary: 'Origin' }); res.end(); return;
    }
    if (req.method !== 'POST') { reply(405, { error: 'Method not allowed' }); return; }
    const given = Buffer.from(req.headers.authorization || '');
    if (given.length !== secret.length || !crypto.timingSafeEqual(given, secret)) { reply(401, { error: 'Unauthorized' }); return; }
    if (req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') { reply(415, { error: 'Expected JSON' }); return; }
    const controller = new AbortController();
    req.on('aborted', () => controller.abort());
    res.on('close', () => { if (!res.writableEnded) controller.abort(); });
    const chunks = []; let bytes = 0;
    try {
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > maxBodyBytes) { reply(413, { error: 'Request too large' }); controller.abort(); return; }
        chunks.push(chunk);
      }
      let request;
      try { request = Mjai.validateRequest(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reply(400, { error: 'Invalid request' }); return; }
      if (controller.signal.aborted) return;
      if (busy) { reply(429, { error: 'Engine is busy' }); return; }
      busy = true;
      try {
        const result = await runner.infer(request, { signal: controller.signal });
        reply(200, { action: result.action });
      } finally { busy = false; }
    } catch { reply(502, { error: 'Engine request failed' }); }
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 10000;
  return { server, token };
}

async function startEngineServer({ config, port = 17341, token } = {}) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid port');
  const result = createEngineServer({ runner: createRunner(config), token });
  await new Promise((resolve, reject) => { result.server.once('error', reject); result.server.listen(port, '127.0.0.1', resolve); });
  return result;
}

module.exports = { createEngineServer, startEngineServer };
if (require.main === module) {
  (async () => {
    const args = process.argv.slice(2), options = { token: process.env.MJAI_ENGINE_TOKEN };
    if (args.includes('--help')) { console.log('Usage: npm run engine:serve -- --config runtime.json [--port 17341] [--token TOKEN]\nToken may also be set with MJAI_ENGINE_TOKEN. The server listens only on 127.0.0.1.'); return; }
    while (args.length) {
      const flag = args.shift();
      if (!['--config', '--port', '--token'].includes(flag) || !args.length) throw new Error();
      const value = args.shift(); options[flag.slice(2)] = flag === '--port' ? Number(value) : value;
    }
    if (!options.config || fs.statSync(options.config).size > 65536) throw new Error();
    options.config = JSON.parse(fs.readFileSync(options.config, 'utf8'));
    const { server, token } = await startEngineServer(options);
    console.log(`Engine bridge: http://127.0.0.1:${server.address().port}/analyze`);
    console.log(`Bearer token: ${token}`);
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close());
  })().catch(() => { console.error('Engine server failed: check runtime configuration and port.'); process.exitCode = 1; });
}
