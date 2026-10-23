const { test } = require('node:test');
const assert = require('node:assert/strict');
const H = require('../extension/hand-hints.js');
const calibration = { version: 1, x: .1, y: .7, width: .71, height: .15 };
const canvasRect = { left: 100, top: 50, width: 1000, height: 600, right: 1100, bottom: 650 };

test('hand sorting preserves duplicates, red fives and an exact separate drawn tile', () => {
  const hand = ['7z', '0m', '5p', '1s', '5m', '5m', '0m'];
  assert.deepEqual(H.sortHand(hand, '0m'), { body: ['0m', '5m', '5m', '5p', '1s', '7z'], drawn: '0m' });
  assert.equal(hand.length, 7);
  assert.equal(H.sortHand(['1m'], '2m'), null);
  for (const invalid of [[], ['?'], ['0z'], null]) assert.equal(H.sortHand(invalid, null), null);
});

test('short concealed hands retain calibrated width and a separated drawn slot', () => {
  const long = H.layoutHand(Array(13).fill('1m').concat('2m'), '2m', calibration, canvasRect);
  const short = H.layoutHand(['1m', '1m', '2m', '3m', '4m'], '4m', calibration, canvasRect);
  assert.equal(short[0].width, long[0].width);
  assert.equal(short[0].x, long[0].x);
  assert.ok(Math.abs(short[4].x - (short[0].x + 4.2 * short[0].width)) < 1e-8);
  assert.equal(short[4].drawn, true);
  assert.deepEqual(H.layoutHand(['?'], null, calibration, canvasRect), []);
  assert.deepEqual(H.layoutHand(['1m'], null, { ...calibration, x: .9 }, canvasRect), []);
  assert.deepEqual(H.layoutHand(['1m'], null, calibration, null), []);
});

test('suggestions match exact red status while high danger covers all same-type copies', () => {
  const value = { decision: { tile: '5m', reasons: ['效率'] }, danger: [{ tile: '0m', opponents: [{ seat: 2, level: 'high', reasons: ['立直'] }, { seat: 1, level: 'low', reasons: [] }] }], seatLabels: ['东', '南', '西'] };
  const hints = H.hintsFor(value, H.layoutHand(['0m', '5m', '5m', '6m'], null, calibration, canvasRect));
  assert.equal(hints.length, 3);
  assert.equal(hints[0].label, '危险');
  assert.ok(hints.slice(1).every(h => h.label === '建议打'));
  assert.ok(hints.every(h => h.opponents.length === 1 && h.description.includes('西：危险；立直')));
  const redOnly = H.hintsFor({ decision: { tile: '0m', reasons: [] } }, [{ tile: '5m' }, { tile: '0m' }, { tile: '0m' }]);
  assert.deepEqual(redOnly.map(h => h.tile), ['0m', '0m']);
  assert.equal(H.hintsFor({ danger: value.danger }, [{ tile: '5m' }])[0].label, '危险');
});

function fixture(stored = calibration, withResizeObserver = false, onCalibrationChange) {
  class Element {
    constructor(tag) { this.tagName = tag; this.style = {}; this.children = []; this.attributes = {}; this.events = {}; }
    appendChild(c) { this.children.push(c); c.parent = this; return c; }
    replaceChildren() { this.children = []; }
    setAttribute(k, v) { this.attributes[k] = v; }
    attachShadow() { this.shadowRoot = new Element('shadow'); return this.shadowRoot; }
    addEventListener(k, fn) { this.events[k] = fn; }
    removeEventListener(k) { delete this.events[k]; }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(c => c !== this); }
    contains(c) { return c === this || this.children.some(child => child.contains(c)); }
    getBoundingClientRect() { return canvasRect; }
    focus() { document.activeElement = this; }
  }
  const body = new Element('body'), events = {};
  let canvases = [new Element('canvas')], saved = stored == null ? null : JSON.stringify(stored), resizeCallback;
  const document = { body, documentElement: body, createElement: t => new Element(t), querySelectorAll: () => canvases, addEventListener(k, fn) { events[k] = fn; }, removeEventListener(k) { delete events[k]; } };
  const window = { innerWidth: 1200, innerHeight: 800, getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' }), localStorage: { getItem: () => saved, setItem: (_, v) => { saved = v; }, removeItem: () => { saved = null; } }, addEventListener(k, fn) { events[k] = fn; }, removeEventListener(k) { delete events[k]; } };
  if (withResizeObserver) window.ResizeObserver = class { constructor(fn) { resizeCallback = fn; } observe() {} disconnect() {} };
  const trigger = new Element('button'); document.activeElement = trigger;
  const api = H.create({ document, window, onCalibrationChange });
  const host = body.children[0], shadow = host.shadowRoot, markers = shadow.children[1];
  return { api, host, shadow, markers, events, document, trigger, addCanvas: () => canvases.push(new Element('canvas')), clearCanvas: () => { canvases = []; }, saved: () => saved, resizeObserved: () => resizeCallback(), setRect: rect => { canvases[0].getBoundingClientRect = () => rect; } };
}
const result = { hand: ['1m', '1m', '2m'], drawnTile: '2m', decision: { tile: '1m', reasons: [] }, danger: [] };

test('normal hints cannot intercept game clicks; null, unknown tiles and ambiguous/missing canvas hide immediately', () => {
  const f = fixture(); f.api.update(result);
  assert.match(f.host.style.cssText, /pointer-events:none/);
  assert.equal(f.markers.style.pointerEvents, 'none');
  assert.equal(f.markers.children.length, 2);
  assert.ok(f.markers.children.every(m => /pointer-events:none/.test(m.style.cssText) && m.children[0].style.pointerEvents === 'none'));
  assert.match(f.markers.children[0].attributes['aria-label'], /建议打/);
  f.api.update(null); assert.equal(f.markers.children.length, 0);
  f.api.update({ ...result, hand: ['?'] }); assert.equal(f.markers.children.length, 0);
  f.addCanvas(); f.api.update(result); assert.equal(f.markers.children.length, 0);
  assert.equal(f.api.startCalibration(), false);
  assert.equal(f.api.getCalibrationState().calibrated, true);
  f.clearCanvas(); f.api.update(result); assert.equal(f.markers.children.length, 0);
  f.api.destroy(); assert.equal(f.host.parent.children.length, 0);
});

test('uncalibrated UI requires explicit confirm; cancel and reset do not retain a draft', () => {
  const f = fixture(null); f.api.update(result); assert.equal(f.markers.children.length, 0);
  assert.equal(f.api.startCalibration(), true);
  let editor = f.shadow.children.at(-1), tools = editor.children[1];
  const click = b => b.events.click({ preventDefault() {}, stopPropagation() {} });
  click(tools.children.find(b => b.textContent === '取消'));
  assert.equal(f.api.getCalibrationState().calibrated, false);
  f.api.startCalibration(); editor = f.shadow.children.at(-1); tools = editor.children[1];
  click(tools.children.find(b => b.textContent === '确认'));
  assert.equal(f.api.getCalibrationState().calibrated, true);
  assert.equal(f.markers.children.length, 2);
  assert.deepEqual(Object.keys(JSON.parse(f.saved())).sort(), ['height', 'version', 'width', 'x', 'y']);
  f.api.resetCalibration(); assert.equal(f.saved(), null); assert.equal(f.markers.children.length, 0);
});

test('invalid saved calibration is ignored and resize/fullscreen recompute active markers', () => {
  const invalid = fixture({ ...calibration, width: Infinity }); invalid.api.update(result); assert.equal(invalid.markers.children.length, 0);
  const f = fixture(); f.api.update(result); f.events.resize(); assert.equal(f.markers.children.length, 2);
  f.events.fullscreenchange(); assert.equal(f.markers.children.length, 2);
  f.api.startCalibration(); f.events.resize(); assert.equal(f.api.getCalibrationState().editing, false);
});

test('calibration drag and edge resize stay on canvas and confirm changed geometry', () => {
  const f = fixture(); f.api.startCalibration();
  const editor = f.shadow.children.at(-1), region = editor.children[0], tools = editor.children[1];
  const pointer = (x, y) => ({ button: 0, pointerId: 1, clientX: x, clientY: y, preventDefault() {}, stopPropagation() {} });
  region.events.pointerdown(pointer(100, 100)); region.events.pointermove(pointer(-1000, -1000)); region.events.pointerup(pointer(0, 0));
  const right = region.children.find(c => c.className === 'handle right');
  right.events.pointerdown(pointer(100, 100)); right.events.pointermove(pointer(10000, 100)); right.events.pointerup(pointer(10000, 100));
  tools.children.find(b => b.textContent === '确认').events.click(pointer(0, 0));
  const saved = JSON.parse(f.saved());
  assert.equal(saved.x, 0); assert.equal(saved.y, 0); assert.equal(saved.width, 1);
  assert.equal(H.validCalibration(saved), true);
});

test('initial ResizeObserver delivery preserves calibration editor, actual resize cancels it', () => {
  const f = fixture(null, true);
  assert.equal(f.api.startCalibration(), true);
  f.resizeObserved(); assert.equal(f.api.getCalibrationState().editing, true);
  f.setRect({ ...canvasRect, width: 1100, right: 1200 });
  f.resizeObserved(); assert.equal(f.api.getCalibrationState().editing, false);
  assert.equal(f.api.getCalibrationState().calibrated, false);
});

test('calibration supports keyboard movement, resizing, focus return and transition-only callbacks', () => {
  const changes = [], f = fixture(null, false, state => changes.push(state));
  f.api.startCalibration();
  const editor = f.shadow.children.at(-1), region = editor.children[0], tools = editor.children[1];
  assert.equal(region.attributes.tabindex, '0'); assert.equal(f.document.activeElement, region);
  const key = (key, shiftKey = false) => ({ key, shiftKey, preventDefault() {}, stopPropagation() {} });
  region.events.keydown(key('ArrowRight')); region.events.keydown(key('ArrowDown'));
  region.events.keydown(key('ArrowRight', true)); region.events.keydown(key('ArrowDown', true));
  editor.events.keydown(key('Tab')); assert.equal(f.document.activeElement, tools.children[1]);
  editor.events.keydown(key('Tab', true)); assert.equal(f.document.activeElement, region);
  f.api.getCalibrationState(); f.api.update(result); assert.equal(changes.length, 1);
  tools.children.find(b => b.textContent === '确认').events.click(key('Enter'));
  const saved = JSON.parse(f.saved());
  assert.ok(Math.abs(saved.x - .122) < 1e-8); assert.ok(Math.abs(saved.width - .742) < 1e-8);
  assert.ok(saved.y > .78 && saved.height > .16);
  assert.equal(f.document.activeElement, f.trigger);
  assert.equal(changes.length, 2); assert.equal(changes[1].calibrated, true); assert.equal(changes[1].editing, false);
  f.api.startCalibration(); f.events.keydown(key('Escape'));
  assert.equal(f.document.activeElement, f.trigger); assert.equal(changes.length, 4);
  f.api.resetCalibration(); assert.equal(changes.length, 5); assert.equal(changes[4].calibrated, false);
  assert.match(f.shadow.children[0].textContent, /#8bd4d1/); assert.match(f.shadow.children[0].textContent, /#ef9b8f/); assert.match(f.shadow.children[0].textContent, /#20272d/);
});
