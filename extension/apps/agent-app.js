(function (root) {
  'use strict';
  const scriptUrl = typeof document !== 'undefined' ? document.currentScript?.src : '';
  function start() {
    if (document.getElementById('mj-observer-host')) return null;
    const ports = root.MJCollectorBrowser.create({ window: root.window, scriptUrl: scriptUrl });
    const controller = root.MJCollectorController.create(ports);
    const panel = root.MJCollectorPanel.create({ controller, title: 'Majsoul Agent', tileBase: ports.tileBase,
      extensionSlot(container, view, render) {
        const state = view.state;
        const analysisView = {
          snapshot: selection => root.MJCollectorSnapshot.snapshot(state, selection),
          seatLabels: state.players.slice(0, state.scores.length === 3 ? 3 : 4).map((_, i) => root.__MJ_OBSERVER_STATE_V1__.seatWind(state, i)),
          phase: state.phase, round: state.round
        };
        root.MJAnalysisPanel.mount(container, analysisView, {
          mode: view.historical ? 'history' : view.mode, historyView: view.historyView,
          cursor: !view.historical && view.mode === 'replay' ? view.cursor : null
        }, render);
      },
    });
    panel.mount();
    const disconnect = ports.connect(controller);
    return { controller, panel, destroy() { disconnect(); root.MJAnalysisPanel.destroy?.(); panel.destroy(); } };
  }
  root.MJAgentApp = { start };
  if (typeof document !== 'undefined') {
    if (document.documentElement) start(); else document.addEventListener('DOMContentLoaded', start, { once: true });
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
