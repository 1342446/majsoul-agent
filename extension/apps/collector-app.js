(function (root) {
  'use strict';
  const scriptUrl = typeof document !== 'undefined' ? document.currentScript?.src : '';
  function start() {
    if (document.getElementById('mj-observer-host')) return null;
    const ports = root.MJCollectorBrowser.create({ window: root.window, scriptUrl: scriptUrl });
    const controller = root.MJCollectorController.create(ports);
    const panel = root.MJCollectorPanel.create({ controller, title: '雀魂牌局获取器', tileBase: ports.tileBase,
    });
    panel.mount();
    const disconnect = ports.connect(controller);
    return { controller, panel, destroy() { disconnect(); panel.destroy(); } };
  }
  root.MJCollectorApp = { start };
  if (typeof document !== 'undefined') {
    if (document.documentElement) start(); else document.addEventListener('DOMContentLoaded', start, { once: true });
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
