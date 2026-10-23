/* Generic movable UI surface. It knows nothing about collection or analysis. */
(function (root) {
  'use strict';
  function create(options) {
    let host, shadow, body, position = null, drag = null, collapsed = false;
    const cleanup = [];
    function save() {
      try { localStorage.setItem(options.positionKey, JSON.stringify(position)); } catch (_) {}
    }
    function place(value = position) {
      if (!host) return;
      const rect = host.getBoundingClientRect();
      value ||= { left: innerWidth - rect.width - 18, top: 18 };
      position = {
        left: Math.max(8, Math.min(value.left, innerWidth - rect.width - 8)),
        top: Math.max(8, Math.min(value.top, innerHeight - rect.height - 8))
      };
      Object.assign(host.style, { left: position.left + 'px', top: position.top + 'px', right: 'auto' });
    }
    function finish(event) {
      if (!drag || (event?.pointerId !== undefined && event.pointerId !== drag.id)) return;
      const id = drag.id; drag = null; delete host.dataset.dragging;
      if (host.hasPointerCapture(id)) host.releasePointerCapture(id);
      save();
    }
    function render() {
      if (!body) return;
      const scroll = body.scrollTop;
      options.onRender(body, render);
      body.scrollTop = scroll;
      place();
    }
    function mount(container = document.documentElement) {
      if (host || document.getElementById(options.id)) return;
      host = document.createElement('div'); host.id = options.id;
      Object.assign(host.style, { position: 'fixed', inset: 'auto', right: '18px', top: '18px', width: 'min(352px, calc(100vw - 16px))', zIndex: '2147483646', margin: '0', padding: '0', border: '0', background: 'transparent', overflow: 'visible' });
      shadow = host.attachShadow({ mode: 'open' });
      shadow.innerHTML = `<style>
        :host{all:initial;font:13px/1.6 "Microsoft YaHei UI","Microsoft YaHei",sans-serif;color:#f0f2f1}:host::backdrop{background:transparent;pointer-events:none}
        *{box-sizing:border-box}.card{display:flex;flex-direction:column;max-height:calc(100dvh - 16px);background:#20272d;border:1px solid #46515a;border-radius:8px;box-shadow:0 8px 30px #0006;overflow:hidden}
        .card>header{display:flex;flex:none;gap:12px;align-items:center;padding:11px 15px 9px;cursor:grab;touch-action:none;user-select:none;border-bottom:1px solid #46515a}
        :host([data-dragging]) .card>header{cursor:grabbing}.card>header strong{flex:1;font:600 14px/1.5 "Segoe UI","Microsoft YaHei UI",sans-serif}
        .card>header button{font:12px/1.5 "Microsoft YaHei UI",sans-serif;color:#b5bfc5;background:none;border:0;padding:3px;cursor:pointer}.card>header button:hover{color:#f0f2f1}button:focus-visible{outline:2px solid #8bd4d1;outline-offset:2px}
        .body{min-height:0;overflow:auto;overscroll-behavior:contain}.body[hidden]{display:none}
      </style><section class="card"><header title="拖动标题栏移动分析卡"><strong></strong><button type="button" aria-expanded="true">收起</button></header><div class="body"></div></section>`;
      shadow.querySelector('strong').textContent = options.title;
      shadow.querySelector('section').setAttribute('aria-label', options.title);
      body = shadow.querySelector('.body');
      const grip = shadow.querySelector('header'), toggle = shadow.querySelector('button');
      toggle.onclick = () => {
        collapsed = !collapsed; body.hidden = collapsed;
        toggle.textContent = collapsed ? '展开' : '收起'; toggle.setAttribute('aria-expanded', String(!collapsed));
        render();
      };
      container.appendChild(host);
      try {
        const saved = JSON.parse(localStorage.getItem(options.positionKey));
        if (saved && Number.isFinite(saved.left) && Number.isFinite(saved.top)) position = saved;
      } catch (_) {}
      grip.addEventListener('pointerdown', event => {
        if (event.button !== 0 || !event.isPrimary || event.target.closest('button')) return;
        const rect = host.getBoundingClientRect();
        drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
        host.setPointerCapture(event.pointerId); host.dataset.dragging = 'true'; event.preventDefault();
      });
      host.addEventListener('pointermove', event => {
        if (!drag || drag.id !== event.pointerId) return;
        place({ left: drag.left + event.clientX - drag.x, top: drag.top + event.clientY - drag.y }); event.preventDefault();
      });
      for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) host.addEventListener(type, finish);
      const resize = () => { place(); if (position) save(); };
      // Reopen in the top layer so even a fullscreen Canvas cannot cover the card.
      const fullscreen = () => {
        if (typeof host.showPopover !== 'function') return;
        if (document.fullscreenElement) {
          host.setAttribute('popover', 'manual');
          if (!host.matches(':popover-open')) host.showPopover();
        } else if (host.hasAttribute('popover')) {
          host.hidePopover(); host.removeAttribute('popover');
        }
        place();
      };
      const blur = () => finish();
      window.addEventListener('resize', resize); window.addEventListener('blur', blur);
      document.addEventListener('fullscreenchange', fullscreen);
      cleanup.push(() => window.removeEventListener('resize', resize), () => window.removeEventListener('blur', blur), () => document.removeEventListener('fullscreenchange', fullscreen));
      const observer = new ResizeObserver(() => { if (!drag) place(); });
      observer.observe(host); cleanup.push(() => observer.disconnect());
      render(); fullscreen(); return host;
    }
    return { mount, render, destroy() { cleanup.splice(0).forEach(fn => fn()); host?.remove(); host = null; shadow = null; body = null; } };
  }
  root.MJFloatingPanel = { create };
})(typeof globalThis !== 'undefined' ? globalThis : this);
