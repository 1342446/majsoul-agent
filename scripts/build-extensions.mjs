import { cpSync, mkdirSync, readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
export function buildExtensions(destination = join(root, 'dist')) {
  const source = join(root, 'extension');
  const manifest = JSON.parse(readFileSync(join(source, 'manifest.json'), 'utf8'));
  const common = ['protocol.js', 'capture.js', 'state.js', 'history.js', 'history-storage.js', 'overlay.js', 'tiles'];
  const extra = ['mahjong-analysis.js', 'analysis.js', 'analysis-panel.js', 'harness.js', 'agent.js',
    'background.js', 'options.html', 'options.js', 'options.css'];
  mkdirSync(destination, { recursive: true });
  const outputs = [];
  for (const profile of ['agent', 'collector']) {
    const directory = join(destination, `majsoul-${profile}-${manifest.version}`);
    // Build fresh contents; never recursively remove a user-supplied directory.
    if (existsSync(directory)) renameSync(directory, directory + '.previous-' + Date.now());
    mkdirSync(directory);
    for (const name of [...common, ...(profile === 'agent' ? extra : ['collector-background.js'])]) {
      cpSync(join(source, name), join(directory, name), { recursive: true });
    }
    const config = structuredClone(manifest);
    config.name = profile === 'agent' ? 'Majsoul Agent' : 'Majsoul Collector · 雀魂牌局获取器';
    if (profile === 'collector') {
      config.description = '仅在本地采集、展示和导出雀魂牌局，不包含模型分析。';
      config.content_scripts = config.content_scripts.map(group => ({ ...group, js: group.js.filter(name => common.includes(name)) }));
      config.background.service_worker = 'collector-background.js';
      delete config.options_ui;
      delete config.optional_host_permissions;
    }
    writeFileSync(join(directory, 'manifest.json'), JSON.stringify(config, null, 2) + '\n');
    for (const name of ['LICENSE', 'THIRD_PARTY_NOTICES.md']) cpSync(join(root, name), join(directory, name));
    outputs.push(directory);
  }
  return outputs;
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  for (const path of buildExtensions(process.argv[2])) console.log(path);
}
