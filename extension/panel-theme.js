/* Shared presentation preference; independent of game state and analysis. */
(function (root) {
  'use strict';
  const key = 'mj-panel-theme-v1', listeners = new Set();
  const icons = {
    light: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/>',
    dark: '<path d="M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z"/>'
  };
  const normalize = value => value === 'light' ? 'light' : 'dark';
  function read() { try { return normalize(localStorage.getItem(key)); } catch (_) { return 'dark'; } }
  let theme = read();
  function update(value) { theme = normalize(value); for (const listener of listeners) listener(); }
  function storage(event) { if (event.key === key || event.key === null) update(read()); }
  function toggle() {
    update(theme === 'dark' ? 'light' : 'dark');
    try { localStorage.setItem(key, theme); } catch (_) { /* The current page still supports switching. */ }
  }
  function attach(host) {
    if (!listeners.size) { theme = read(); window.addEventListener('storage', storage); }
    let button;
    const apply = () => {
      host.dataset.theme = theme;
      if (!button) return;
      const next = theme === 'dark' ? '白天' : '黑夜';
      button.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${icons[theme]}</svg>`;
      button.setAttribute('aria-label', '切换到' + next + '模式');
      button.title = '切换到' + next + '模式';
    };
    listeners.add(apply); apply();
    return {
      bind(nextButton) { if (button) button.onclick = null; button = nextButton; button.onclick = toggle; apply(); },
      destroy() { if (button) button.onclick = null; listeners.delete(apply); if (!listeners.size) window.removeEventListener('storage', storage); }
    };
  }
  const css = `
    :host{--mj-bg:#20272d;--mj-surface:#2b343b;--mj-text:#f0f2f1;--mj-muted:#b5bfc5;--mj-border:#46515a;--mj-hover:#3a454e;--mj-accent:#8bd4d1;--mj-warn:#ef9b8f;--mj-warning-bg:#3b3028;--mj-alert-bg:#3a2d2c;--mj-scheme:dark;color-scheme:var(--mj-scheme)}
    :host([data-theme="light"]){--mj-bg:#f7f9fa;--mj-surface:#edf2f4;--mj-text:#24353e;--mj-muted:#536771;--mj-border:#becdd4;--mj-hover:#dde7eb;--mj-accent:#126e72;--mj-warn:#ae382d;--mj-warning-bg:#fff1dc;--mj-alert-bg:#fff0ed;--mj-scheme:light}
    header button[data-theme-toggle]{display:inline-flex;align-items:center;justify-content:center;flex:none;width:28px;height:28px;padding:0;border:0;border-radius:5px;background:transparent;cursor:pointer}
    header button[data-theme-toggle]:hover{background:var(--mj-hover);color:var(--mj-text)}
    header button[data-theme-toggle] svg{display:block;pointer-events:none}
  `;
  root.MJPanelTheme = { attach, css };
})(typeof globalThis !== 'undefined' ? globalThis : this);
