const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, readFileSync, existsSync, readdirSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const vm = require('node:vm');

test('collector installs without model files, optional model hosts or settings; full Agent keeps them', async () => {
  const { buildExtensions } = await import('../scripts/build-extensions.mjs');
  const temporary = mkdtempSync(join(tmpdir(), 'majsoul-profiles-'));
  try {
    const [agent, collector] = buildExtensions(temporary);
    for (const directory of [agent, collector]) {
      const manifest = JSON.parse(readFileSync(join(directory, 'manifest.json')));
      for (const group of manifest.content_scripts) for (const script of group.js) assert.ok(existsSync(join(directory, script)));
      assert.ok(existsSync(join(directory, manifest.background.service_worker)));
      assert.equal(readdirSync(join(directory, 'tiles')).filter(n => n.endsWith('.svg')).length, 37);
    }
    const manifest = JSON.parse(readFileSync(join(collector, 'manifest.json')));
    assert.equal('options_ui' in manifest, false); assert.equal('optional_host_permissions' in manifest, false);
    assert.deepEqual(manifest.permissions, ['storage']);
    for (const file of ['collector/controller.js', 'collector/browser-adapter.js', 'overlay.js']) {
      assert.ok(existsSync(join(collector, file)), file);
      assert.ok(existsSync(join(agent, file)), file);
    }
    assert.ok(existsSync(join(collector, 'apps/collector-app.js')));
    assert.equal(existsSync(join(collector, 'apps/agent-app.js')), false);
    assert.ok(existsSync(join(agent, 'apps/agent-app.js')));
    assert.equal(existsSync(join(agent, 'apps/collector-app.js')), false);
    for (const script of ['contracts/snapshot.js', 'collector/snapshot-adapter.js', 'adapters/model-endpoint.js', 'adapters/mjai.js', 'adapters/engine-endpoint.js', 'contracts/engine-result.js', 'engine-agent.js', 'analysis.js', 'analysis-panel.js', 'analysis-panel.css', 'hand-hints.js', 'floating-panel.js', 'mahjong-analysis.js', 'agent.js', 'harness.js', 'background.js', 'options.html']) {
      assert.equal(existsSync(join(collector, script)), false, script);
      assert.ok(existsSync(join(agent, script)), script);
    }
    const listeners = [], context = { URL, chrome: { runtime: { id: 'collector', onMessage: { addListener: fn => listeners.push(fn) } },
      storage: { local: { setAccessLevel() {} } } } };
    context.importScripts = (...files) => files.forEach(file => vm.runInNewContext(readFileSync(join(collector, file), 'utf8'), context));
    vm.runInNewContext(readFileSync(join(collector, 'collector-background.js'), 'utf8'), context);
    assert.equal(listeners.length, 1);
    assert.equal(listeners[0]({ type: 'model:analyze' }, {}, () => { throw new Error('Unexpected model response'); }), undefined);
  } finally { rmSync(temporary, { recursive: true, force: true }); }
});
