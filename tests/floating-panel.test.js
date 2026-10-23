const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function fixture({ cached = false } = {}) {
  function element() {
    const events = new Map();
    return { style: {}, dataset: {}, scrollTop: 0,
      addEventListener(type, fn) { if (!events.has(type)) events.set(type, new Set()); events.get(type).add(fn); },
      removeEventListener(type, fn) { events.get(type)?.delete(fn); },
      emit(type, event = {}) { for (const fn of [...(events.get(type) || [])]) fn(event); },
      listener(type) { return [...(events.get(type) || [])][0]; },
      setAttribute() {}, remove() { this.removed = true; }, hasPointerCapture() { return false; }
    };
  }
  const links = [element(), element()];
  links.forEach(link => { link.sheet = cached ? {} : null; });
  const nodes = Object.fromEntries(['strong', 'section', '.body', 'header', '[data-theme-toggle]', '[aria-expanded]'].map(key => [key, element()]));
  const shadow = { innerHTML: '', querySelector: key => nodes[key], querySelectorAll: () => links };
  const hosts = [], reveals = [];
  let rectReads = 0, resize;
  const doc = { documentElement: { appendChild(host) { hosts.push(host); reveals.push(host.style.visibility); } },
    getElementById: () => null, addEventListener() {}, removeEventListener() {},
    createElement() {
      return Object.assign(element(), { attachShadow: () => shadow,
        getBoundingClientRect() { rectReads++; return { left: 500, top: 500, width: 200, height: links.every(link => link.sheet) ? 240 : 1400 }; }
      });
    }
  };
  const context = { document: doc, innerWidth: 1000, innerHeight: 800,
    localStorage: { getItem: () => JSON.stringify({ left: 500, top: 500 }), setItem() {} },
    window: { addEventListener() {}, removeEventListener() {} },
    ResizeObserver: class { constructor(fn) { resize = fn; } observe() {} disconnect() {} }
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../extension/panel-theme.js'), 'utf8'), context);
  vm.runInNewContext(fs.readFileSync(require.resolve('../extension/floating-panel.js'), 'utf8'), context);
  let renders = 0;
  const panel = context.MJFloatingPanel.create({ id: 'test-panel', title: 'Test', positionKey: 'test-position', onRender() { renders++; } });
  const host = panel.mount();
  return { panel, host, links, hosts, reveals, nodes, resize: () => resize(), rectReads: () => rectReads, renders: () => renders,
    load(index) { links[index].sheet = {}; links[index].emit('load'); } };
}

test('first display waits for all styles and preserves saved position despite the temporary unstyled height', () => {
  const p = fixture();
  assert.deepEqual(p.reveals, ['hidden']);
  assert.equal(p.host.style.visibility, 'hidden'); assert.equal(p.rectReads(), 0);
  p.resize(); p.panel.render(); assert.equal(p.rectReads(), 0);
  p.load(0); assert.equal(p.host.style.visibility, 'hidden');
  p.load(1); assert.equal(p.host.style.visibility, 'visible');
  assert.equal(p.host.style.left, '500px'); assert.equal(p.host.style.top, '500px');
  p.nodes['.body'].scrollTop = 90; p.panel.render();
  assert.equal(p.host.style.visibility, 'visible'); assert.equal(p.nodes['.body'].scrollTop, 90);
  p.panel.destroy();
});

test('cached styles display immediately and a failed style never leaves the panel hidden forever', () => {
  const cached = fixture({ cached: true }); assert.equal(cached.host.style.visibility, 'visible'); cached.panel.destroy();
  const failed = fixture(); failed.load(0); failed.links[1].emit('error');
  assert.equal(failed.host.style.visibility, 'visible'); failed.panel.destroy();
});

test('late stylesheet callbacks cannot reveal a destroyed panel or its replacement', () => {
  const p = fixture(), late = p.links[1].listener('load');
  p.panel.destroy(); assert.equal(p.host.removed, true);
  late(); assert.equal(p.host.style.visibility, 'hidden');
  const next = p.panel.mount(); late(); assert.equal(next.style.visibility, 'hidden');
  p.load(0); p.load(1); assert.equal(next.style.visibility, 'visible');
  p.panel.destroy();
});
