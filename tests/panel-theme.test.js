const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../extension/panel-theme.js'), 'utf8');
const key = 'mj-panel-theme-v1';

function fixture({ value, blocked = false } = {}) {
  const store = new Map(value === undefined ? [] : [[key, value]]), events = new Map();
  const context = { localStorage: {
    getItem: k => { if (blocked) throw Error('blocked'); return store.get(k) ?? null; },
    setItem: (k, v) => { if (blocked) throw Error('blocked'); store.set(k, v); }
  }, window: { addEventListener: (name, fn) => events.set(name, fn), removeEventListener: name => events.delete(name) } };
  vm.runInNewContext(source, context);
  const surface = () => {
    const host = { dataset: {} }, button = { setAttribute(k, v) { this[k] = v; } };
    const theme = context.MJPanelTheme.attach(host); theme.bind(button);
    return { host, button, theme };
  };
  return { surface, store, events };
}

test('theme changes synchronize surfaces, survive reload and bind replacement controls', () => {
  const f = fixture(), analysis = f.surface(), collector = f.surface();
  assert.equal(analysis.host.dataset.theme, 'dark');
  assert.equal(analysis.button['aria-label'], '切换到白天模式');
  assert.match(analysis.button.innerHTML, /<svg[^>]+aria-hidden="true"/);
  const moon = analysis.button.innerHTML;
  analysis.button.onclick();
  assert.equal(collector.host.dataset.theme, 'light');
  assert.match(collector.button.innerHTML, /<circle/);
  assert.notEqual(collector.button.innerHTML, moon);
  assert.equal(collector.button.title, '切换到黑夜模式');
  assert.equal(f.store.get(key), 'light');
  const replacement = { setAttribute(k, v) { this[k] = v; } };
  collector.theme.bind(replacement);
  assert.equal(collector.button.onclick, null);
  replacement.onclick(); assert.equal(analysis.host.dataset.theme, 'dark');
  assert.equal(fixture({ value: 'light' }).surface().host.dataset.theme, 'light');
  analysis.theme.destroy(); collector.theme.destroy(); assert.equal(f.events.size, 0);
});

test('storage changes update open panels and invalid or unavailable storage remains usable', () => {
  const f = fixture({ value: 'invalid' }), panel = f.surface();
  assert.equal(panel.host.dataset.theme, 'dark');
  f.store.set(key, 'light'); f.events.get('storage')({ key });
  assert.equal(panel.host.dataset.theme, 'light');
  f.store.clear(); f.events.get('storage')({ key: null });
  assert.equal(panel.host.dataset.theme, 'dark');
  panel.theme.destroy();
  const blocked = fixture({ blocked: true }).surface();
  blocked.button.onclick(); assert.equal(blocked.host.dataset.theme, 'light'); blocked.theme.destroy();
});
