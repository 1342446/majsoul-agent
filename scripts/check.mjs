import { checkProfiles } from './build-extensions.mjs';
import { jsFiles } from './check-boundaries.mjs';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const { bundlePiRuntime } = await import('./bundle-pi-runtime.mjs');
await bundlePiRuntime({ check: true });
const manifest = JSON.parse(readFileSync(join(root, 'extension/manifest.json'), 'utf8'));
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
if (manifest.version !== pkg.version) throw new Error('Package and extension versions differ');
for (const group of manifest.content_scripts) for (const path of group.js) {
  if (!existsSync(join(root, 'extension', path))) throw new Error('Missing script: ' + path);
}
if (!existsSync(join(root, 'extension', manifest.background.service_worker))) throw new Error('Missing worker');
checkProfiles();
for (const file of jsFiles(join(root, 'extension'))) {
  execFileSync(process.execPath, ['--check', join(root, 'extension', file)]);
}
for (const file of (existsSync(join(root, 'agent')) ? readdirSync(join(root, 'agent')) : []).filter(name => name.endsWith('.cjs'))) {
  execFileSync(process.execPath, ['--check', join(root, 'agent', file)]);
}
execFileSync(process.execPath, [join(root, 'scripts/generate-tiles.mjs'), '--check'], { stdio: 'inherit' });
const tileFiles = readdirSync(join(root, 'extension/tiles'));
if (tileFiles.some(name => /\.(png|jpe?g|webp)$/i.test(name))) throw new Error('Unexpected raster tile asset');
console.log('Manifest references, script syntax, version and original tile assets verified.');
