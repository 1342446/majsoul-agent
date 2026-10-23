(function (root) {
  'use strict';
  const scriptUrl = typeof document !== 'undefined' ? document.currentScript?.src : '';
  function start() {
    if (document.getElementById('mj-observer-host')) return null;
    const ports = root.MJCollectorBrowser.create({ window: root.window, scriptUrl: scriptUrl });
    const controller = root.MJCollectorController.create(ports);
    const hints = root.MJHandHints.create({ onCalibrationChange(state) {
      analysis.render();
      if (!state.editing) document.getElementById('mj-agent-host')?.shadowRoot?.querySelector('#analysis-calibrate')?.focus({ preventScroll: true });
    } });
    const hintHooks = { onHints: value => hints.update(value) };
    const panel = root.MJCollectorPanel.create({ controller, title: '雀魂牌局获取器', tileBase: ports.tileBase, collapsed: true });
    const analysis = root.MJFloatingPanel.create({ id: 'mj-agent-host', title: 'Majsoul AI Analysis & Review Agent', positionKey: 'mj-agent-panel-position-v1',
      onRender(container, render) {
        const view = controller.getView(), state = view.state, S = root.__MJ_OBSERVER_STATE_V1__;
        const selfHand = (state.source === 'replay' ? state.players[state.selfSeat]?.hand : state.selfHand) || [];
        const drawnTile = state.drawnTiles[state.selfSeat] || null;
        const hand = S.handLayout(selfHand, drawnTile);
        const calibration = hints.getCalibrationState();
        const analysisView = {
          snapshot: selection => root.MJCollectorSnapshot.snapshot(state, selection),
          engineRequest: selection => {
            if (!selection.game || selection.rivers !== 'all' || !selection.hand) throw new Error('专业引擎需要授权对局信息、全部牌河和自家手牌。');
            return root.MJMjaiAdapter.fromObservation(controller.exportData(), { seat: state.selfSeat, hand: true });
          },
          seatLabels: state.players.slice(0, state.scores.length === 3 ? 3 : 4).map((_, i) => S.seatWind(state, i) + '家'),
          phase: state.phase, round: state.round, selfSeat: state.selfSeat,
          selfHand: hand.tiles.concat(hand.drawn ? [hand.drawn] : []), drawnTile: hand.drawn,
          riichiLabels: view.historical ? [] : S.opponentRiichi(state).map(i => S.seatWind(state, i) + '家'),
          hintsReady: calibration.available, hintsCalibrated: calibration.calibrated,
          recordCount: view.recordCount,
          onMode: mode => controller.setMode(mode), onCursor: cursor => controller.setCursor(cursor),
          onRoundStart: () => controller.roundStart(), onSelfSeat: seat => controller.setSelfSeat(seat),
          onCollector: () => panel.open(), onHistory: () => panel.open({ history: true }),
          onCalibrateHints: () => { hints.startCalibration(); }
        };
        root.MJAnalysisPanel.mount(container, analysisView, {
          mode: view.historical ? 'history' : view.mode, historyView: view.historyView,
          replayRevision: view.mode === 'replay' ? view.replayRevision : null,
          cursor: !view.historical && view.mode === 'replay' ? view.cursor : null
        }, render, hintHooks);
        const replaySlot = document.createElement('div');
        replaySlot.dataset.nagaSlot = '';
        container.appendChild(replaySlot);
        root.MJNagaPanel.mount(replaySlot, {
          mode: view.historical ? 'history' : view.mode,
          recordCount: view.recordCount, replayRevision: view.replayRevision,
          exportReplay: () => controller.exportData()
        }, render);
      }
    });
    panel.mount(); analysis.mount();
    // The analysis renderer invalidates stale hints synchronously with each state change.
    const unsubscribe = controller.subscribe(() => analysis.render());
    const disconnect = ports.connect(controller);
    return { controller, panel, analysis, hints, destroy() { disconnect(); unsubscribe(); root.MJAnalysisPanel.destroy?.(); root.MJNagaPanel.destroy(); hints.destroy(); analysis.destroy(); panel.destroy(); } };
  }
  root.MJAgentApp = { start };
  if (typeof document !== 'undefined') {
    if (document.documentElement) start(); else document.addEventListener('DOMContentLoaded', start, { once: true });
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
