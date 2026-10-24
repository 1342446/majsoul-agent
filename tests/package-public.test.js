const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { join } = require('node:path');
const root = join(__dirname, '..');
const python = ['python3', 'python'].find(command => spawnSync(command, ['--version'], { encoding: 'utf8' }).status === 0);
function runPython(source) {
  const result = spawnSync(python, ['-c', source], { cwd: root, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return result.stdout;
}
const load = `
import sys, importlib.util, json, tempfile, subprocess
from pathlib import Path
from zipfile import ZipFile
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('packager', 'scripts/package-public.py')
packager = importlib.util.module_from_spec(spec)
spec.loader.exec_module(packager)
`;
test('public source allowlist and ZIP retain npm lock, runtime source and full licenses', { skip: !python && 'Python is not installed' }, () => {
  runPython(load + `
files = packager.allowed_files()
names = {path.relative_to(packager.ROOT).as_posix() for path in files}
required = {'package.json', 'package-lock.json', 'licenses/pi-LICENSE.txt', 'licenses/typebox-LICENSE.txt', 'licenses/SOURCES.md', 'extension/pi-runtime.js', 'scripts/pi-runtime-entry.mjs', 'scripts/bundle-pi-runtime.mjs'}
assert required <= names, required - names
assert not any(part in {'.git', 'node_modules', 'dist', 'research'} for name in names for part in Path(name).parts)
with tempfile.TemporaryDirectory(prefix='majsoul-source-test-') as directory:
    archive = Path(directory) / 'source.zip'
    packager.write_zip(archive, [(path, path.relative_to(packager.ROOT).as_posix()) for path in files])
    with ZipFile(archive) as result:
        assert required <= set(result.namelist())
        for name in required:
            assert result.read(name) == (packager.ROOT / name).read_bytes()
`);
});
test('legacy base-ref snapshots keep committed dependency-free package and scripts coherent', { skip: !python && 'Python is not installed' }, () => {
  runPython(load + `
with tempfile.TemporaryDirectory(prefix='majsoul-legacy-test-') as directory:
    base = Path(directory)
    source, destination = base / 'repo', base / 'snapshot'
    source.mkdir(); destination.mkdir()
    for name in packager.ROOT_FILES:
        if name != 'package-lock.json':
            (source / name).write_text('legacy document\\n', encoding='utf-8')
    (source / 'VALIDATION.md').write_text('# Validation\\n\\n## 0.2.1 archived\\nEvidence\\n', encoding='utf-8')
    package = {'name': 'legacy-observer', 'version': '0.2.0', 'scripts': {'check': 'node scripts/check.mjs'}}
    (source / 'package.json').write_text(json.dumps(package), encoding='utf-8')
    for name in ['extension/profiles', 'extension/tiles', 'scripts', 'agent', 'tests', 'docs', 'licenses', '.github']:
        (source / name).mkdir(parents=True, exist_ok=True)
    (source / 'scripts/check.mjs').write_text('// committed legacy check\\n', encoding='utf-8')
    (source / 'agent/review.cjs').write_text('// committed legacy CLI\\n', encoding='utf-8')
    (source / 'extension/tiles/1m.svg').write_text('<svg/>', encoding='utf-8')
    manifest = {'version': '0.2.0', 'web_accessible_resources': []}
    for name in ['extension/manifest.json', 'extension/profiles/agent.json', 'extension/profiles/collector.json']:
        (source / name).write_text(json.dumps(manifest), encoding='utf-8')
    subprocess.run(['git', 'init', '-q'], cwd=source, check=True)
    subprocess.run(['git', 'add', '.'], cwd=source, check=True)
    subprocess.run(['git', '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'legacy fixture'], cwd=source, check=True)
    # Current preparation contains Pi; it must not leak into the legacy runtime.
    (source / 'package.json').write_text(json.dumps(dict(package, dependencies={'@earendil-works/pi-agent-core': '1.4.0'})), encoding='utf-8')
    (source / 'package-lock.json').write_text('{}', encoding='utf-8')
    (source / 'scripts/check.mjs').write_text("import 'esbuild';\\n", encoding='utf-8')
    (source / 'licenses/current.txt').write_text('Current license', encoding='utf-8')
    packager.ROOT = source
    packager.stable_snapshot(destination, 'HEAD', '0.2.1')
    snapshot_package = json.loads((destination / 'package.json').read_text(encoding='utf-8'))
    lock = json.loads((destination / 'package-lock.json').read_text(encoding='utf-8'))
    assert 'dependencies' not in snapshot_package
    assert lock['version'] == lock['packages']['']['version'] == '0.2.1'
    assert set(lock['packages']) == {''}
    assert (destination / 'scripts/check.mjs').read_text(encoding='utf-8') == '// committed legacy check\\n'
    assert (destination / 'agent/review.cjs').exists()
    assert (destination / 'licenses/current.txt').exists()
    for name in ['extension/manifest.json', 'extension/profiles/agent.json', 'extension/profiles/collector.json']:
        assert json.loads((destination / name).read_text(encoding='utf-8'))['version'] == '0.2.1'
    subprocess.run(['git', 'add', 'package.json'], cwd=source, check=True)
    subprocess.run(['git', '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'dependencies without lock fixture'], cwd=source, check=True)
    rejected = base / 'rejected'; rejected.mkdir()
    try:
        packager.stable_snapshot(rejected, 'HEAD', '0.2.1')
    except ValueError as problem:
        assert 'no committed package-lock.json' in str(problem)
    else:
        raise AssertionError('Dependency-bearing ref without lockfile was accepted')
`);
});

test('base-ref dependency preparation installs only locked dependent snapshots in their own directory', { skip: !python && 'Python is not installed' }, () => {
  runPython(load + `
from unittest.mock import patch
with tempfile.TemporaryDirectory(prefix='majsoul-snapshot-install-test-') as directory:
    destination = Path(directory)
    package = destination / 'package.json'
    package.write_text(json.dumps({'name': 'legacy-observer', 'version': '0.2.1'}), encoding='utf-8')
    with patch.object(packager.subprocess, 'run') as run, patch.object(packager.shutil, 'which', return_value='/fixture/npm'):
        packager.install_snapshot_dependencies(destination)
        run.assert_not_called()
        package.write_text(json.dumps({'name': 'snapshot', 'version': '0.6.0', 'devDependencies': {'esbuild': '0.25.12'}}), encoding='utf-8')
        try:
            packager.install_snapshot_dependencies(destination)
        except ValueError as problem:
            assert 'package-lock.json' in str(problem)
        else:
            raise AssertionError('Install accepted an unlocked snapshot')
        run.assert_not_called()
        (destination / 'package-lock.json').write_text('{}', encoding='utf-8')
        packager.install_snapshot_dependencies(destination)
        run.assert_called_once_with(['/fixture/npm', 'ci', '--ignore-scripts', '--no-audit', '--no-fund'], cwd=destination, check=True)
        run.side_effect = subprocess.CalledProcessError(1, ['npm', 'ci'])
        try:
            packager.install_snapshot_dependencies(destination)
        except subprocess.CalledProcessError:
            pass
        else:
            raise AssertionError('Failed dependency install did not stop preparation')
`);
});
