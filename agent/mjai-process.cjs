'use strict';
const { spawn } = require('node:child_process');
const { StringDecoder } = require('node:string_decoder');
const Mjai = require('../extension/adapters/mjai.js');

function failure(code) {
  const error = new Error(code === 'ABORTED' ? 'Engine request cancelled' : 'Engine inference failed');
  error.code = code;
  if (code === 'ABORTED') error.name = 'AbortError';
  return error;
}

function validateConfig(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config) ||
      Object.keys(config).some(key => !['command', 'args', 'timeoutMs', 'maxOutputBytes', 'maxInputBytes'].includes(key)) ||
      typeof config.command !== 'string' || !config.command.trim() || config.command.includes('\0') ||
      !Array.isArray(config.args) || config.args.some(arg => typeof arg !== 'string' || arg.includes('\0'))) {
    throw new Error('Invalid engine configuration');
  }
  const result = { command: config.command, args: [...config.args], timeoutMs: 15000, maxOutputBytes: 65536, maxInputBytes: 2 * 1024 * 1024 };
  for (const key of ['timeoutMs', 'maxOutputBytes', 'maxInputBytes']) {
    if (config[key] !== undefined) {
      if (!Number.isSafeInteger(config[key]) || config[key] < 1 || config[key] > (key === 'timeoutMs' ? 300000 : 16 * 1024 * 1024)) throw new Error('Invalid engine configuration');
      result[key] = config[key];
    }
  }
  return result;
}

// No process output or command arguments are included in public errors.
function createRunner(config) {
  const options = validateConfig(config);
  return {
    async infer(raw, { signal } = {}) {
      const request = Mjai.validateRequest(raw);
      const input = Buffer.from(JSON.stringify(request.events) + '\n');
      if (input.length > options.maxInputBytes) throw failure('INPUT_LIMIT');
      if (signal?.aborted) throw failure('ABORTED');
      return new Promise((resolve, reject) => {
        let child, timer, settled = false, bytes = 0, stdout = '';
        const decoder = new StringDecoder('utf8');
        const finish = (error, action) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          signal?.removeEventListener('abort', abort);
          const complete = () => error ? reject(error) : resolve({ action });
          if (!child?.pid) { complete(); return; }
          if (process.platform === 'win32') {
            // taskkill also terminates Python workers spawned by the configured bot.
            const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { shell: false, windowsHide: true, stdio: 'ignore' });
            let done = false;
            const end = () => { if (done) return; done = true; clearTimeout(cleanupTimer); child.kill(); complete(); };
            const cleanupTimer = setTimeout(end, 2000);
            killer.once('error', end); killer.once('close', end);
          } else if (child.exitCode !== null || child.signalCode !== null) {
            try { process.kill(-child.pid, 'SIGKILL'); } catch {}
            complete();
          } else {
            try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
            child.once('close', complete);
          }
        };
        const abort = () => finish(failure('ABORTED'));
        try {
          child = spawn(options.command, options.args, { shell: false, windowsHide: true,
            detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'] });
        } catch { finish(failure('SPAWN_FAILED')); return; }
        timer = setTimeout(() => finish(failure('TIMEOUT')), options.timeoutMs);
        child.once('error', () => finish(failure('SPAWN_FAILED')));
        child.once('close', () => { if (!settled) finish(failure('EARLY_EXIT')); });
        child.stdin.on('error', () => finish(failure('INPUT_FAILED')));
        signal?.addEventListener('abort', abort, { once: true });
        if (signal?.aborted) { abort(); return; }
        child.stderr.on('data', chunk => { bytes += chunk.length; if (bytes > options.maxOutputBytes) finish(failure('OUTPUT_LIMIT')); });
        child.stdout.on('data', chunk => {
          if (settled) return;
          bytes += chunk.length;
          if (bytes > options.maxOutputBytes) { finish(failure('OUTPUT_LIMIT')); return; }
          stdout += decoder.write(chunk);
          const newline = stdout.indexOf('\n');
          if (newline < 0) return;
          try {
            const action = JSON.parse(stdout.slice(0, newline));
            if (!action || Array.isArray(action) || typeof action !== 'object' || typeof action.type !== 'string' || !action.type || stdout.slice(newline + 1).trim()) throw new Error();
            finish(null, action);
          } catch { finish(failure('INVALID_OUTPUT')); }
        });
        child.stdin.end(input);
      });
    }
  };
}

module.exports = { createRunner, validateConfig };
