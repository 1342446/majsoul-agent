(function (root) {
  'use strict';
  const CHANNEL = 'mj-observer-v1';
  function create(options = {}) {
    const win = options.window || window, chromeApi = options.chrome || root.chrome;
    const local = options.localStorage || win.localStorage;
    const extension = !!chromeApi?.runtime?.id;
    const key = 'mj-observer-offline-history-v1';
    const storage = {
      async load() {
        if (!extension) return JSON.parse(local.getItem(key) || '[]');
        const response = await chromeApi.runtime.sendMessage({ type: 'history:load' });
        if (!response?.ok) throw new Error('History load failed');
        return response.matches;
      },
      async save(match, matches) {
        if (!extension) { local.setItem(key, JSON.stringify(matches)); return; }
        const response = await chromeApi.runtime.sendMessage({ type: 'history:save', match });
        if (!response?.ok) throw new Error('History save failed');
      }
    };
    return { storage, clock: Date.now, id: () => root.crypto.randomUUID(),
      async hash(text) {
        const bytes = new Uint8Array(await root.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
        return Array.from(bytes, x => x.toString(16).padStart(2, '0')).join('');
      },
      tileBase: extension ? chromeApi.runtime.getURL('tiles/') : new URL('../tiles/', options.scriptUrl || win.location.href).href,
      connect(controller) {
        const seen = new Set();
        function onMessage(event) {
          const m = event.data;
          if (event.source !== win || event.origin !== win.location.origin || m?.channel !== CHANNEL || m.type === 'hello') return;
          if (typeof m.epoch !== 'string' || !Number.isSafeInteger(m.sequence)) return;
          const identity = m.epoch + ':' + m.sequence;
          if (seen.has(identity)) return;
          seen.add(identity); if (seen.size > 5000) seen.delete(seen.values().next().value);
          controller.receive({ type: m.type, payload: m.payload });
        }
        win.addEventListener('message', onMessage);
        win.postMessage({ channel: CHANNEL, type: 'hello' }, win.location.origin);
        return () => win.removeEventListener('message', onMessage);
      }
    };
  }
  const api = { create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.MJCollectorBrowser = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
