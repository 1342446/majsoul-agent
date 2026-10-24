import { build } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';
import { checkPiBundle } from './check-boundaries.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
export async function bundlePiRuntime({ check = false } = {}) {
  const result = await build({
    absWorkingDir: root, entryPoints: ['scripts/pi-runtime-entry.mjs'],
    outfile: 'extension/pi-runtime.js', bundle: true, platform: 'browser',
    format: 'iife', globalName: 'MJPiRuntime', target: 'chrome120',
    legalComments: 'inline', metafile: true, write: false,
    alias: {
      'typebox/compile': fileURLToPath(new URL('./pi-schema-interpreter.mjs', import.meta.url))
    },
    plugins: [{ name: 'exact-pi-entry', setup(builder) {
      // esbuild alias also matches subpaths; only replace the bare root import.
      builder.onResolve({ filter: /^@earendil-works\/pi-ai$/ }, () => ({ path: fileURLToPath(new URL('./pi-ai-browser.mjs', import.meta.url)) }));
    } }]
  });
  const source = result.outputFiles[0].text;
  checkPiBundle(source);
  if (/\beval\s*\(|\bFunction\s*\(|\bimport\s*\(|\brequire\s*\(|\bnode:/.test(source)) throw new Error('Pi runtime contains forbidden MV3 code');
  const inputs = Object.keys(result.metafile.inputs);
  if (inputs.some(file => /(?:\/auth\/|\/providers\/|\/compile\/)/.test(file))) throw new Error('Pi runtime includes a forbidden dependency');
  const bundledPackages = [...new Set(Object.values(result.metafile.outputs).flatMap(output => Object.entries(output.inputs)
    .filter(([, info]) => info.bytesInOutput > 0)
    .map(([file]) => file.match(/^node_modules\/(\@[^/]+\/[^/]+|[^/]+)\//)?.[1]).filter(Boolean)))].sort();
  const licensedPackages = ['@earendil-works/pi-agent-core', '@earendil-works/pi-ai', 'typebox'];
  if (bundledPackages.some(name => !licensedPackages.includes(name))) throw new Error('Pi bundle contains an unreviewed third-party license: ' + bundledPackages.join(', '));
  const output = new URL('../extension/pi-runtime.js', import.meta.url);
  if (check) {
    if (readFileSync(output, 'utf8').replace(/\r\n/g, '\n') !== source) throw new Error('Pi bundle differs from source; run npm run pi:bundle and commit extension/pi-runtime.js');
  } else writeFileSync(output, source);
  return { bytes: Buffer.byteLength(source), inputs, bundledPackages };
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const result = await bundlePiRuntime({ check: process.argv.includes('--check') });
  console.log(`Pi browser runtime: ${result.bytes} bytes; ${result.inputs.length} audited inputs.`);
}
