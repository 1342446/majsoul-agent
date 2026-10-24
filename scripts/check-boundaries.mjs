import { readFileSync, readdirSync } from 'node:fs';
import { posix, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const providers = {
  __MJ_OBSERVER_PROTOCOL_V1__: 'protocol.js', __MJ_OBSERVER_CAPTURE_V1__: 'capture.js',
  __MJ_OBSERVER_STATE_V1__: 'state.js', MJHistory: 'history.js', MJMahjongAnalysis: 'mahjong-analysis.js',
  MJSnapshotContract: 'contracts/snapshot.js', MJCollectorSnapshot: 'collector/snapshot-adapter.js',
  MJModelEndpoint: 'adapters/model-endpoint.js', MJAnalysis: 'analysis.js', MJHarness: 'harness.js', MJAgent: 'agent.js',
  MJPiRuntime: 'pi-runtime.js', MJRoundContext: 'round-context.js', MJModelUsage: 'model-usage.js',
  MJModelSessionTransport: 'model-session-transport.js', MJRunStore: 'agent-run-store.js',
  MJUserMemoryWorker: 'user-memory-worker.js', MJUserMemory: 'user-memory.js', MJUserMemoryAgent: 'user-memory-agent.js', MJUserMemoryCapture: 'user-memory-capture.js',
  MJMjaiAdapter: 'adapters/mjai.js', MJEngineEndpoint: 'adapters/engine-endpoint.js',
  MJNagaReplay: 'adapters/naga-replay.js', MJNagaPanel: 'naga-panel.js',
  MJEngineAgent: 'engine-agent.js', MJEngineResult: 'contracts/engine-result.js',
  MJPanelTheme: 'panel-theme.js', MJAnalysisPanel: 'analysis-panel.js', MJFloatingPanel: 'floating-panel.js', MJHandHints: 'hand-hints.js', MJCollectorController: 'collector/controller.js',
  MJCollectorBrowser: 'collector/browser-adapter.js', MJCollectorPanel: 'overlay.js', MJCollectorApp: 'apps/collector-app.js', MJAgentApp: 'apps/agent-app.js'
};
// Small lexical scanner: comments/string text are ignored, template expressions are scanned.
// This deliberately supports only static project references, not arbitrary JavaScript resolution.
export function tokens(source) {
  const out = []; let i = 0;
  function scan(templateExpression = false) {
    let depth = 0;
    while (i < source.length) {
      const c = source[i];
      if (/\s/.test(c)) { i++; continue; }
      if (source.startsWith('//', i)) { i = source.indexOf('\n', i); if (i < 0) i = source.length; continue; }
      if (source.startsWith('/*', i)) { const end = source.indexOf('*/', i + 2); if (end < 0) throw new Error('Unterminated comment'); i = end + 2; continue; }
      if (c === '/' && (!out.length || ['=', '(', '[', ':', ',', '!', '?', '>', ';', 'return'].includes(out.at(-1).value))) {
        i++; let characterClass = false;
        while (i < source.length) {
          if (source[i] === '\\') { i += 2; continue; }
          if (source[i] === '[') characterClass = true;
          if (source[i] === ']') characterClass = false;
          if (source[i++] === '/' && !characterClass) break;
        }
        while (/[a-z]/i.test(source[i] || '') && i < source.length) i++;
        continue;
      }
      if (c === '"' || c === "'") {
        let value = ''; const quote = c; i++;
        while (i < source.length && source[i] !== quote) { if (source[i] === '\\') { value += source[i++] + source[i++]; } else value += source[i++]; }
        i++; out.push({ type: 'string', value }); continue;
      }
      if (c === '`') {
        i++;
        while (i < source.length) {
          if (source[i] === '\\') { i += 2; continue; }
          if (source[i] === '`') { i++; break; }
          if (source.startsWith('${', i)) { i += 2; scan(true); } else i++;
        }
        continue;
      }
      const word = source.slice(i).match(/^[A-Za-z_$][\w$]*/);
      if (word) { out.push({ type: 'id', value: word[0] }); i += word[0].length; continue; }
      if (templateExpression && c === '}' && depth === 0) { i++; return; }
      if (c === '{') depth++;
      if (c === '}') depth--;
      out.push({ type: 'punct', value: c }); i++;
    }
  }
  scan(); return out;
}
export function dependencies(file, source) {
  if (file === 'pi-runtime.js') { checkPiBundle(source); return []; }
  const ts = tokens(source), result = new Set();
  const add = name => {
    if (!name.startsWith('.')) throw new Error(`${file}: only relative static module references are supported: ${name}`);
    const target = posix.normalize(posix.join(posix.dirname(file), name));
    if (target.startsWith('../')) throw new Error(`${file}: dependency escapes extension`);
    result.add(target);
  };
  for (let i = 0; i < ts.length; i++) {
    const t = ts[i];
    if (t.type === 'id' && /^(?:MJ[A-Z]|__MJ_OBSERVER_)/.test(t.value) && !Object.hasOwn(providers, t.value) && ts[i+1]?.value !== ':') throw new Error(`${file}: undeclared project global ${t.value}`);
    if (t.type === 'id' && Object.hasOwn(providers, t.value) && providers[t.value] !== file) result.add(providers[t.value]);
    if (t.type === 'string' && Object.hasOwn(providers, t.value) && ['root', 'globalThis', 'window'].includes(ts[i-2]?.value) && ts[i-1]?.value === '[' && providers[t.value] !== file) result.add(providers[t.value]);
    if (t.type !== 'id') continue;
    if (['require', 'importScripts'].includes(t.value) && ts[i+1]?.value === '(') {
      let j = i + 2;
      do {
        if (ts[j]?.type !== 'string') throw new Error(`${file}: dynamic ${t.value} is unsupported`);
        add(t.value === 'importScripts' && !ts[j].value.startsWith('.') ? './' + ts[j].value : ts[j].value); j++;
        if (ts[j]?.value !== ',') break;
        j++;
      } while (true);
      if (ts[j]?.value !== ')') throw new Error(`${file}: dynamic ${t.value} is unsupported`);
    }
    if (t.value === 'import' || t.value === 'export') {
      if (t.value === 'import' && ts[i+1]?.value === '(') {
        if (ts[i+2]?.type !== 'string' || ts[i+3]?.value !== ')') throw new Error(`${file}: dynamic import is unsupported`);
        add(ts[i+2].value);
      } else if (t.value === 'import' && ts[i+1]?.type === 'string') add(ts[i+1].value);
      else { for (let j = i + 1; j < ts.length && ts[j].value !== ';'; j++) if (ts[j].value === 'from' && ts[j+1]?.type === 'string') { add(ts[j+1].value); break; } }
    }
  }
  return [...result];
}
const browser = new Set(['document', 'window', 'chrome', 'localStorage', 'sessionStorage', 'WebSocket', 'fetch', 'XMLHttpRequest', 'location', 'navigator']);
export const agentOnlyModules = ['pi-runtime.js', 'round-context.js', 'model-usage.js', 'model-session-transport.js', 'agent-run-store.js', 'user-memory.js', 'user-memory-agent.js', 'user-memory-capture.js', 'user-memory-worker.js'];
// Only this generated vendor artifact bypasses project-global resolution. It has
// its own stricter capability check and is checked against a reproducible build.
export function checkPiBundle(source) {
  if (!source.startsWith('var MJPiRuntime = (() => {') || !source.includes('@earendil-works/pi-agent-core/dist/agent-loop.js')) throw new Error('pi-runtime.js: expected standalone Pi bundle');
  const ts = tokens(source);
  for (let i = 0; i < ts.length; i++) {
    const token = ts[i];
    if (token.type !== 'id') continue;
    if (['eval', 'require', 'import', 'export', 'importScripts', ...browser].includes(token.value)) throw new Error('pi-runtime.js: forbidden capability ' + token.value);
    if (token.value === 'Function' && ts[i+1]?.value === '(') throw new Error('pi-runtime.js: dynamic code is forbidden');
  }
}
export function workerImports(source) {
  const ts = tokens(source), files = [];
  for (let i = 0; i < ts.length; i++) if (ts[i].value === 'importScripts' && ts[i+1]?.value === '(') {
    for (let j = i + 2; ts[j] && ts[j].value !== ')'; j++) if (ts[j].type === 'string') files.push(ts[j].value);
  }
  return files;
}
export function checkSourceBoundary(file, source) {
  const deps = dependencies(file, source), ids = tokens(source).filter(t => t.type === 'id').map(t => t.value);
  if (file.startsWith('collector/') && deps.some(dep => [...agentOnlyModules, 'analysis.js', 'analysis-panel.js', 'naga-panel.js', 'adapters/naga-replay.js', 'hand-hints.js', 'agent.js', 'engine-agent.js', 'harness.js', 'adapters/model-endpoint.js', 'adapters/mjai.js', 'adapters/engine-endpoint.js', 'contracts/engine-result.js', 'mahjong-analysis.js'].includes(dep))) throw new Error(`${file}: collector must not depend on analysis/model layers`);
  let allowed = null, pure = false;
  if (file.startsWith('contracts/')) { allowed = new Set(); pure = true; }
  else if (file === 'user-memory.js') { allowed = new Set(['contracts/snapshot.js']); pure = true; }
  else if (file === 'user-memory-agent.js') { allowed = new Set(['user-memory.js', 'harness.js']); pure = true; }
  else if (file === 'user-memory-capture.js') { allowed = new Set(); pure = true; }
  else if (file === 'round-context.js') { allowed = new Set(['contracts/snapshot.js']); pure = true; }
  else if (['model-usage.js', 'model-session-transport.js', 'agent-run-store.js'].includes(file)) { allowed = new Set(); pure = true; }
  else if (file === 'harness.js') { allowed = new Set(); pure = true; }
  else if (file === 'agent.js') { allowed = new Set(['analysis.js', 'mahjong-analysis.js', 'harness.js', 'contracts/snapshot.js']); pure = true; }
  else if (file === 'engine-agent.js') { allowed = new Set(['harness.js', 'contracts/snapshot.js', 'contracts/engine-result.js', 'mahjong-analysis.js', 'adapters/mjai.js']); pure = true; }
  else if (file === 'adapters/mjai.js' || file === 'adapters/naga-replay.js') { allowed = new Set(); pure = true; }
  else if (file === 'analysis.js' || file === 'mahjong-analysis.js') { allowed = new Set(['contracts/snapshot.js', 'mahjong-analysis.js']); pure = true; }
  else if (file === 'state.js' || file === 'history.js' || file === 'collector/controller.js' || file === 'collector/snapshot-adapter.js' || file.startsWith('collector/core/')) {
    allowed = new Set(['state.js', 'history.js', 'contracts/snapshot.js']); pure = true;
  }
  else if (['overlay.js', 'analysis-panel.js', 'naga-panel.js', 'floating-panel.js', 'hand-hints.js'].includes(file)) {
    const ts = tokens(source);
    for (let i = 0; i < ts.length; i++) if (['root', 'globalThis', 'window'].includes(ts[i].value) && ts[i+1]?.value === '[' && ts[i+2]?.type !== 'string') throw new Error(`${file}: dynamic UI global access is forbidden`);
    if (deps.includes('agent.js') || deps.includes('engine-agent.js')) throw new Error(`${file}: UI must not depend on Agent`);
    if (file === 'overlay.js' && deps.some(d => [...agentOnlyModules, 'analysis.js', 'analysis-panel.js', 'naga-panel.js', 'adapters/naga-replay.js', 'hand-hints.js', 'adapters/model-endpoint.js'].includes(d))) throw new Error(`${file}: collector UI must not depend on analysis`);
    if (file === 'floating-panel.js') allowed = new Set(['panel-theme.js']);
    if (file === 'hand-hints.js') allowed = new Set();
  }
  if (allowed) for (const dependency of deps) if (!allowed.has(dependency)) throw new Error(`${file}: forbidden dependency ${dependency}`);
  if (pure) {
    for (const id of ids) if (browser.has(id)) throw new Error(`${file}: browser capability ${id} is forbidden`);
    if (ids.some(id => ['eval', 'Function'].includes(id))) throw new Error(`${file}: dynamic code is forbidden`);
    const ts = tokens(source);
    for (let i = 0; i < ts.length; i++) if (['root', 'globalThis'].includes(ts[i].value) && ts[i+1]?.value === '[') throw new Error(`${file}: computed global access is forbidden`);
  }
  return deps;
}
export function jsFiles(directory, prefix = '') {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? jsFiles(join(directory, entry.name), prefix + entry.name + '/') : entry.name.endsWith('.js') ? [prefix + entry.name] : []);
}
export function checkBoundaries(sourceRoot = fileURLToPath(new URL('../extension/', import.meta.url))) {
  for (const file of jsFiles(sourceRoot)) checkSourceBoundary(file, readFileSync(join(sourceRoot, file), 'utf8'));
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) { checkBoundaries(); console.log('Static architecture boundaries verified.'); }
