const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function fixture(options = {}) {
  const elements = new Map(); let exports = 0, conversions = 0;
  const observation = { mode: 'replay', replayCursor: 2, replayRecords: [{ kind: 'NewRound', data: 'first' }] };
  const view = { mode: 'replay', recordCount: 1, replayRevision: 1, exportReplay: () => { exports++; return observation; } };
  const container = { innerHTML: '', querySelector(selector) {
    if (!elements.has(selector)) elements.set(selector, { focus() { this.focused = true; }, select() { this.selected = true; } });
    return elements.get(selector);
  }, querySelectorAll() { return [this.querySelector('.round-0'), this.querySelector('.round-1')]; } };
  const result = { rounds: [{ id: 'a', label: '东1局 <unsafe>', url: 'https://tenhou.net/5/#json=%7Ba%7D' }, { id: 'b', label: '东2局', url: 'https://tenhou.net/5/#json=%7Bb%7D' }], rejected: [{ label: '南1局', reason: '<缺少终局>' }] };
  const context = { URL, setTimeout, document: { currentScript: { src: 'https://fixture/extension/naga-panel.js' } }, location: { href: 'https://fixture/' }, navigator: { clipboard: { writeText: options.copy || (async () => {}) } }, MJNagaReplay: { fromObservation(input, config) { conversions++; assert.equal(config.rules.kuitan, true); assert.equal(input, observation); return result; } } };
  vm.runInNewContext(fs.readFileSync(require.resolve('../extension/naga-panel.js'), 'utf8'), context);
  const render = () => context.MJNagaPanel.mount(container, view, render);
  const node = id => container.querySelector('#' + id);
  const change = (id, value) => node(id).onchange({ target: { value, checked: value } });
  const enable = () => change('naga-enabled', true);
  const configure = () => { enable(); change('naga-round-type', 'hanchan'); change('naga-red', 'true'); change('naga-kuitan', 'true'); change('naga-confirm', true); };
  const generate = () => node('naga-generate').onclick();
  render();
  return { container, view, observation, context, node, change, enable, configure, generate, render, counts: () => [exports, conversions], html: () => container.innerHTML };
}

test('NAGA is collapsed and disabled by default and requires explicit rule confirmation', () => {
  const p = fixture();
  assert.match(p.html(), /<details class="naga-panel">/);
  assert.match(p.html(), /默认关闭/);
  assert.deepEqual(p.counts(), [0, 0]);
  p.enable(); assert.match(p.html(), /首次使用请逐项选择规则/);
  p.generate(); assert.deepEqual(p.counts(), [0, 0]);
  p.configure(); p.generate();
  assert.equal(p.counts()[1], 1);
  assert.equal(p.counts()[0], 1);
  assert.match(p.html(), /东1局 &lt;unsafe&gt;/);
  assert.match(p.html(), /&lt;缺少终局&gt;/);
  assert.doesNotMatch(p.html(), /<unsafe>|<缺少终局>/);
  assert.match(p.html(), /https:\/\/naga\.dmv\.nico\/naga_report\/order_form\/" target="_blank" rel="noopener noreferrer"/);
  assert.match(p.html(), /全场转换独立于当前游标/);
});

test('cursor movement keeps exports, while a new replay or live/history mode clears them', () => {
  const p = fixture(); p.configure(); p.generate();
  p.observation.replayCursor = 9; p.render(); assert.match(p.html(), /naga-preview/);
  p.render(); p.render(); assert.deepEqual(p.counts(), [1, 1]);
  p.observation.replayRecords[0].data = 'second'; p.view.replayRevision++; p.render(); assert.doesNotMatch(p.html(), /id="naga-preview"/);
  p.generate(); assert.equal(p.counts()[1], 1);
  p.change('naga-confirm', true);
  p.generate(); p.view.mode = 'live'; p.render(); assert.doesNotMatch(p.html(), /id="naga-preview"/);
  const count = p.counts()[1]; p.generate(); assert.equal(p.counts()[1], count);
  p.view.mode = 'history'; p.render(); p.generate(); assert.equal(p.counts()[1], count);
});

test('selected rounds control copied URLs and clipboard errors select a readonly fallback', async () => {
  let copied;
  const p = fixture({ copy: async value => { copied = value; throw new Error('denied'); } });
  p.configure(); p.generate();
  p.container.querySelector('.round-0').onchange({ target: { value: 'a', checked: false } });
  await p.node('naga-copy').onclick();
  assert.equal(copied, 'https://tenhou.net/5/#json=%7Bb%7D');
  assert.match(p.html(), /readonly/); assert.match(p.html(), /自动复制失败/);
  assert.equal(p.node('naga-preview').focused, true); assert.equal(p.node('naga-preview').selected, true);
});

test('destroy and rerender detach old handlers and ignore late clipboard completion', async () => {
  let resolve;
  const p = fixture({ copy: () => new Promise(done => { resolve = done; }) });
  const oldEnabled = p.node('naga-enabled').onchange;
  p.configure(); p.generate();
  oldEnabled({ target: { checked: false } }); assert.match(p.html(), /id="naga-preview"/);
  const pending = p.node('naga-copy').onclick();
  const oldGenerate = p.node('naga-generate').onclick, before = p.counts()[1];
  p.context.MJNagaPanel.destroy(); oldGenerate(); resolve(); await pending;
  assert.equal(p.container.innerHTML, ''); assert.equal(p.counts()[1], before);
  p.render(); assert.match(p.html(), /默认关闭/); assert.doesNotMatch(p.html(), /已复制文本/);
});

test('changing a rule revokes confirmation and clears the previous export', () => {
  const p = fixture(); p.configure(); p.generate();
  p.change('naga-red', 'false'); assert.doesNotMatch(p.html(), /id="naga-preview"/);
  const count = p.counts()[1]; p.generate(); assert.equal(p.counts()[1], count);
  p.change('naga-confirm', true); p.generate(); assert.equal(p.counts()[1], count + 1);
});
