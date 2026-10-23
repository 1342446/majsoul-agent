(function (root) {
  'use strict';
  const STORAGE_KEY = 'mj-hand-hints-calibration-v1';
  const validTile = t => typeof t === 'string' && /^(?:[1-9][mps]|0[mps]|[1-7]z)$/.test(t);
  const baseTile = t => typeof t === 'string' ? t.replace(/^0/, '5') : t;
  function sortHand(hand, drawnTile) {
    if (!Array.isArray(hand) || !hand.length || hand.length > 14 || !hand.every(validTile) || (drawnTile != null && !validTile(drawnTile))) return null;
    const body = hand.slice();
    if (drawnTile != null) {
      const i = body.lastIndexOf(drawnTile);
      if (i < 0) return null;
      body.splice(i, 1);
    }
    body.sort((a, b) => 'mpsz'.indexOf(a[1]) - 'mpsz'.indexOf(b[1]) || Number(baseTile(a)[0]) - Number(baseTile(b)[0]) || Number(b[0] === '0') - Number(a[0] === '0'));
    return { body, drawn: drawnTile ?? null };
  }
  function validCalibration(c) {
    return !!c && c.version === 1 && ['x', 'y', 'width', 'height'].every(k => Number.isFinite(c[k])) && c.x >= 0 && c.y >= 0 && c.width >= .14 && c.height >= .025 && c.x + c.width <= 1.000001 && c.y + c.height <= 1.000001;
  }
  // Calibration spans thirteen body slots + a 0.2-slot gap + a drawn slot.
  // Shorter concealed hands stay left-aligned; tile width never changes with tile count.
  function layoutHand(hand, drawnTile, calibration, canvas) {
    const sorted = sortHand(hand, drawnTile);
    if (!sorted || !validCalibration(calibration) || !canvas || ![canvas.left, canvas.top, canvas.width, canvas.height].every(Number.isFinite) || canvas.width <= 0 || canvas.height <= 0) return [];
    const w = calibration.width * canvas.width / 14.2;
    const x = canvas.left + calibration.x * canvas.width, y = canvas.top + calibration.y * canvas.height;
    return sorted.body.map((tile, i) => ({ tile, x: x + i * w, y, width: w, height: calibration.height * canvas.height, drawn: false })).concat(sorted.drawn ? [{ tile: sorted.drawn, x: x + (sorted.body.length + .2) * w, y, width: w, height: calibration.height * canvas.height, drawn: true }] : []);
  }
  function hintsFor(value, slots) {
    return slots.flatMap(slot => {
      const suggested = validTile(value?.decision?.tile) && slot.tile === value.decision.tile;
      const opponents = (value?.danger || []).filter(d => baseTile(d.tile) === baseTile(slot.tile)).flatMap(d => d.opponents || []).filter(o => o.level === 'high');
      if (!suggested && !opponents.length) return [];
      const details = opponents.map(o => `${value.seatLabels?.[o.seat] || '座位 ' + o.seat}：危险；${(o.reasons || []).join('；')}`).join('\n');
      return [{ ...slot, suggested, opponents, label: suggested ? '建议打' : '危险', description: [suggested ? (value.decision.reasons || []).join('；') : '', details].filter(Boolean).join('\n') }];
    });
  }
  function create(options = {}) {
    const doc = options.document || root.document, win = options.window || root.window;
    const host = doc.createElement('div');
    host.setAttribute('data-mj-hand-hints', '');
    host.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;margin:0;padding:0;border:0;background:transparent;overflow:visible;pointer-events:none;z-index:2147483645;';
    const shadow = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
    const style = doc.createElement('style');
    style.textContent = ':host{all:initial}:host::backdrop{background:transparent;pointer-events:none}*{box-sizing:border-box}.marker{position:fixed;pointer-events:none!important;border:2px solid #ef9b8f;border-radius:5px;background:rgba(239,155,143,.12);font:600 12px/1.4 sans-serif;color:#fff}.marker.suggest{border-color:#8bd4d1;background:rgba(139,212,209,.13)}.label{position:absolute;bottom:100%;left:0;white-space:nowrap;background:#20272d;padding:2px 4px;border-radius:3px;pointer-events:none}.suggest .label{background:#20272d}.shield{position:fixed;inset:0;background:rgba(0,0,0,.25);pointer-events:auto;touch-action:none}.region{position:fixed;border:2px dashed #8bd4d1;display:flex;align-items:stretch;touch-action:none;cursor:move}.slot{flex:1;border-right:1px solid #8bd4d1;background:rgba(10,40,35,.45);color:#fff;font:12px sans-serif;display:grid;place-items:center;pointer-events:none}.handle{position:absolute;background:#8bd4d1;touch-action:none}.left,.right{width:12px;top:0;bottom:0;cursor:ew-resize}.left{left:-7px}.right{right:-7px}.bottom{height:12px;left:0;right:0;bottom:-7px;cursor:ns-resize}.tools{position:fixed;top:16px;left:50%;transform:translateX(-50%);max-width:90vw;background:#20272d;color:#fff;padding:12px;border-radius:8px;font:14px/1.6 sans-serif;pointer-events:auto}.tools button{font:inherit;margin:5px;padding:4px 10px;cursor:pointer}';
    shadow.appendChild(style);
    const markers = doc.createElement('div'); markers.style.pointerEvents = 'none'; shadow.appendChild(markers);
    (doc.body || doc.documentElement).appendChild(host);
    let calibration = null, value = null, editor = null, draft = null, destroyed = false, canvasElement = null;
    let observedCanvas = null, observedRect = null, returnFocus = null;
    const rectKey = r => [r.left, r.top, r.width, r.height].join(',');
    const resizeObserver = win.ResizeObserver ? new win.ResizeObserver(() => {
      const nextRect = observedCanvas ? rectKey(observedCanvas.getBoundingClientRect()) : null;
      // ResizeObserver always delivers once after observe(), even without a resize.
      // Preserve an editor opened before that initial notification arrives.
      if (nextRect === observedRect) { render(); return; }
      observedRect = nextRect; refresh();
    }) : null;
    try { const stored = JSON.parse(win.localStorage.getItem(STORAGE_KEY)); if (validCalibration(stored)) calibration = stored; } catch (_) { /* Storage is optional. */ }
    function canvasRect() {
      const candidates = Array.from(doc.querySelectorAll('canvas')).filter(c => {
        const r = c.getBoundingClientRect(), s = win.getComputedStyle?.(c);
        return r.width >= 500 && r.height >= 280 && r.right > 0 && r.bottom > 0 && r.left < win.innerWidth && r.top < win.innerHeight && s?.display !== 'none' && s?.visibility !== 'hidden' && s?.opacity !== '0' && (!c.checkVisibility || c.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }));
      });
      // A single large visible canvas is the only supported surface. Ambiguity hides hints.
      if (candidates.length !== 1) { canvasElement = null; return null; }
      canvasElement = candidates[0];
      if (observedCanvas !== canvasElement) { resizeObserver?.disconnect(); observedCanvas = canvasElement; observedRect = rectKey(canvasElement.getBoundingClientRect()); resizeObserver?.observe(canvasElement); }
      return canvasElement.getBoundingClientRect();
    }
    function render() {
      markers.replaceChildren();
      if (destroyed || editor || !value || !calibration) return;
      const rect = canvasRect(); if (!rect) return;
      for (const h of hintsFor(value, layoutHand(value.hand, value.drawnTile, calibration, rect))) {
        const marker = doc.createElement('div'); marker.className = 'marker' + (h.suggested ? ' suggest' : '');
        marker.style.cssText = `left:${h.x}px;top:${h.y}px;width:${h.width}px;height:${h.height}px;pointer-events:none;`;
        marker.setAttribute('role', 'img'); marker.setAttribute('aria-label', `${h.tile} ${h.label} ${h.description}`);
        const label = doc.createElement('span'); label.className = 'label'; label.textContent = h.label; label.style.pointerEvents = 'none'; marker.appendChild(label); markers.appendChild(marker);
      }
    }
    function save() { try { if (calibration) win.localStorage.setItem(STORAGE_KEY, JSON.stringify(calibration)); else win.localStorage.removeItem(STORAGE_KEY); } catch (_) { /* Still works for this page. */ } }
    function getCalibrationState() { return { calibrated: validCalibration(calibration), available: !!canvasRect(), editing: !!editor, calibration: calibration ? { ...calibration } : null }; }
    // Notify only on explicit editor transitions/reset, never on paint or status reads.
    function notifyCalibration() { if (!destroyed) options.onCalibrationChange?.(getCalibrationState()); }
    function closeEditor() { editor?.remove(); editor = null; draft = null; const target = returnFocus; returnFocus = null; render(); target?.focus?.({ preventScroll: true }); notifyCalibration(); }
    function startCalibration() {
      if (destroyed) return false;
      const rect = canvasRect(); if (!rect) return false;
      if (editor) return true;
      const editingCanvas = canvasElement;
      returnFocus = doc.activeElement;
      while (returnFocus?.shadowRoot?.activeElement) returnFocus = returnFocus.shadowRoot.activeElement;
      draft = { ...(calibration || { version: 1, x: .12, y: .78, width: .74, height: .16 }) };
      markers.replaceChildren(); editor = doc.createElement('div'); editor.className = 'shield'; editor.setAttribute('role', 'dialog'); editor.setAttribute('aria-modal', 'true'); editor.setAttribute('aria-label', '校准手牌提示');
      editor.addEventListener('click', e => { e.stopPropagation(); });
      const tools = doc.createElement('div'); tools.className = 'tools';
      const text = doc.createElement('div'); text.textContent = '校准手牌提示：拖动框覆盖手牌，以 13 张主体 + 间隔 + 摸牌位为宽度。左右边调整宽度，底边调整高度。聚焦框后方向键移动，Shift + 方向键缩放，Esc 取消，Tab 切换按钮。副露后从框左侧开始排列。仅手动确认后显示提示。'; tools.appendChild(text);
      const region = doc.createElement('div'); region.className = 'region'; region.setAttribute('tabindex', '0'); region.setAttribute('role', 'group'); region.setAttribute('aria-label', '手牌校准区域，方向键移动，Shift 加方向键缩放');
      const focusables = [region];
      for (let i = 0; i < 14; i++) { const s = doc.createElement('span'); s.className = 'slot'; s.textContent = i === 13 ? '摸牌' : String(i + 1); if (i === 13) s.style.marginLeft = '1.4%'; region.appendChild(s); }
      function paint() { const r = canvasRect(); if (!r || canvasElement !== editingCanvas) { closeEditor(); return; } region.style.left = r.left + draft.x * r.width + 'px'; region.style.top = r.top + draft.y * r.height + 'px'; region.style.width = draft.width * r.width + 'px'; region.style.height = draft.height * r.height + 'px'; }
      region.addEventListener('keydown', e => {
        const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
        if (!direction) return; e.preventDefault(); e.stopPropagation();
        const r = canvasRect(); if (!r) { closeEditor(); return; }
        const dx = direction[0] * 2 / r.width, dy = direction[1] * 2 / r.height;
        if (e.shiftKey) { draft.width = Math.max(.14, Math.min(1 - draft.x, draft.width + dx)); draft.height = Math.max(.025, Math.min(1 - draft.y, draft.height + dy)); }
        else { draft.x = Math.max(0, Math.min(1 - draft.width, draft.x + dx)); draft.y = Math.max(0, Math.min(1 - draft.height, draft.y + dy)); }
        paint();
      });
      editor.addEventListener('keydown', e => {
        if (e.key !== 'Tab') return; e.preventDefault(); e.stopPropagation();
        const focused = shadow.activeElement || doc.activeElement, i = focusables.indexOf(focused);
        focusables[(i + (e.shiftKey ? -1 : 1) + focusables.length) % focusables.length].focus?.({ preventScroll: true });
      });
      function drag(element, kind) {
        element.addEventListener('pointerdown', e => {
          if (e.button !== 0) return; e.preventDefault(); e.stopPropagation();
          const r = canvasRect(); if (!r) return;
          const initial = { ...draft }, px = e.clientX, py = e.clientY;
          element.setPointerCapture?.(e.pointerId);
          const move = ev => {
            ev.preventDefault(); ev.stopPropagation(); const dx = (ev.clientX - px) / r.width, dy = (ev.clientY - py) / r.height;
            if (kind === 'move') { draft.x = Math.max(0, Math.min(1 - initial.width, initial.x + dx)); draft.y = Math.max(0, Math.min(1 - initial.height, initial.y + dy)); }
            if (kind === 'left') { draft.x = Math.max(0, Math.min(initial.x + initial.width - .14, initial.x + dx)); draft.width = initial.x + initial.width - draft.x; }
            if (kind === 'right') draft.width = Math.max(.14, Math.min(1 - initial.x, initial.width + dx));
            if (kind === 'bottom') draft.height = Math.max(.025, Math.min(1 - initial.y, initial.height + dy)); paint();
          };
          const end = ev => { ev.stopPropagation(); element.removeEventListener('pointermove', move); element.removeEventListener('pointerup', end); element.removeEventListener('pointercancel', end); };
          element.addEventListener('pointermove', move); element.addEventListener('pointerup', end); element.addEventListener('pointercancel', end);
        });
      }
      drag(region, 'move');
      for (const side of ['left', 'right', 'bottom']) { const h = doc.createElement('div'); h.className = 'handle ' + side; region.appendChild(h); drag(h, side); }
      const button = (label, fn) => { const b = doc.createElement('button'); b.type = 'button'; b.textContent = label; b.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); fn(); }); tools.appendChild(b); focusables.push(b); };
      button('确认', () => { const r = canvasRect(); if (!r || canvasElement !== editingCanvas || !validCalibration(draft)) { closeEditor(); return; } calibration = { ...draft }; save(); closeEditor(); });
      button('取消', closeEditor); button('重置', () => { calibration = null; save(); closeEditor(); });
      editor.appendChild(region); editor.appendChild(tools); shadow.appendChild(editor); paint(); region.focus?.({ preventScroll: true }); notifyCalibration(); return !!editor;
    }
    const refresh = () => { if (editor) closeEditor(); else render(); };
    const keydown = e => { if (editor && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeEditor(); } };
    const fullscreen = () => {
      if (typeof host.showPopover === 'function') {
        if (doc.fullscreenElement) {
          host.setAttribute('popover', 'manual');
          if (!host.matches(':popover-open')) host.showPopover();
        } else if (host.hasAttribute('popover')) {
          host.hidePopover(); host.removeAttribute('popover');
        }
      }
      refresh();
    };
    win.addEventListener('resize', refresh); win.addEventListener('scroll', refresh, true); doc.addEventListener('fullscreenchange', fullscreen); doc.addEventListener('keydown', keydown, true);
    fullscreen();
    // Observe surface visibility/replacement without reading any game state.
    const observer = win.MutationObserver ? new win.MutationObserver(records => { if (records.some(r => r.target !== host && !host.contains(r.target))) render(); }) : null;
    observer?.observe(doc.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class', 'hidden', 'width', 'height'] });
    return {
      update(next) { value = next; render(); }, startCalibration,
      resetCalibration() { calibration = null; save(); closeEditor(); },
      getCalibrationState,
      destroy() { if (destroyed) return; destroyed = true; observer?.disconnect(); resizeObserver?.disconnect(); win.removeEventListener('resize', refresh); win.removeEventListener('scroll', refresh, true); doc.removeEventListener('fullscreenchange', fullscreen); doc.removeEventListener('keydown', keydown, true); host.remove(); returnFocus?.focus?.({ preventScroll: true }); returnFocus = null; editor = null; draft = null; value = null; }
    };
  }
  const api = { create, sortHand, layoutHand, hintsFor, validCalibration, STORAGE_KEY };
  root.MJHandHints = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
