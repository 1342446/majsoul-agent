"""Build allowlisted public-source and extension ZIPs, without private Git history."""
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED
import hashlib
import json
import re
import argparse
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parent.parent
ROOT_FILES = [
    '.gitignore', '.gitattributes', 'LICENSE', 'README.md', 'README.en.md', 'README.ja.md', 'CHANGELOG.md', 'CONTRIBUTING.md',
    'SECURITY.md', 'THIRD_PARTY_NOTICES.md', 'ARCHITECTURE.md', 'VALIDATION.md', 'package.json'
]
SOURCE_DIRS = ['extension', 'agent', 'tests', 'scripts', '.github', 'docs']
SECRET_PATTERNS = [
    rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----',
    rb'\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{24,}|ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|AKIA[0-9A-Z]{16})\b'
]


def inside(path, parent):
    try:
        path.relative_to(parent)
        return True
    except ValueError:
        return False


def allowed_files():
    files = [ROOT / name for name in ROOT_FILES]
    for directory in SOURCE_DIRS:
        for path in sorted((ROOT / directory).rglob('*')):
            if '__pycache__' in path.parts:
                continue
            if any(part in {'.git', 'research', 'node_modules', 'dist'} for part in path.relative_to(ROOT).parts):
                raise ValueError('Excluded private/generated directory: ' + path.relative_to(ROOT).as_posix())
            if path.is_symlink():
                raise ValueError('Symlinks are not allowed: ' + path.relative_to(ROOT).as_posix())
            if path.is_file():
                files.append(path)
    for path in files:
        if not path.is_file() or path.is_symlink() or not inside(path.resolve(), ROOT):
            raise ValueError('Missing or invalid source file: ' + str(path.relative_to(ROOT)))
        if path.suffix.lower() in {'.zip', '.har', '.jsonl', '.pem', '.key', '.log'} or path.name.startswith('.env'):
            raise ValueError('Private or generated file type: ' + path.relative_to(ROOT).as_posix())
        data = path.read_bytes()
        if any(re.search(pattern, data) for pattern in SECRET_PATTERNS):
            raise ValueError('Credential-like content; inspect locally: ' + path.relative_to(ROOT).as_posix())
    return files


def write_zip(destination, entries):
    temporary = destination.with_suffix('.tmp')
    with ZipFile(temporary, 'w', ZIP_DEFLATED) as archive:
        for path, name in sorted(entries, key=lambda item: item[1]):
            info = ZipInfo(name, date_time=(2020, 1, 1, 0, 0, 0))
            info.compress_type = ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, path.read_bytes())
    temporary.replace(destination)


def verify():
    subprocess.run(['node', str(ROOT / 'scripts/check.mjs')], check=True)
    tests = sorted(str(path.relative_to(ROOT)) for path in (ROOT / 'tests').glob('*.test.js'))
    result = subprocess.run(['node', '--test', *tests], cwd=ROOT, capture_output=True, text=True, encoding='utf-8')
    if result.returncode:
        raise RuntimeError(result.stdout + result.stderr)
    print('\n'.join(result.stdout.splitlines()[-8:]).encode('ascii', errors='replace').decode('ascii'))


def stable_snapshot(destination, ref, version='0.2.1'):
    """Project committed runtime/tests plus this preparation's assets and documents."""
    def committed(path):
        return subprocess.check_output(['git', 'show', ref + ':' + path], cwd=ROOT)
    paths = subprocess.check_output(['git', 'ls-tree', '-r', '-z', '--name-only', ref, '--', 'extension', 'tests'], cwd=ROOT).decode().split('\0')
    for relative in filter(None, paths):
        if relative.startswith('extension/tiles/'):
            continue
        path = destination / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(committed(relative))
    for name in ROOT_FILES:
        data = committed(name) if name == 'ARCHITECTURE.md' else (ROOT / name).read_bytes()
        if name == 'VALIDATION.md':
            current = data.decode('utf-8').replace('\r\n', '\n')
            start = current.index('## 0.2.1 ')
            end = current.find('\n## ', start + 1)
            section = current[start:end if end >= 0 else len(current)].strip()
            data = committed(name).decode('utf-8').replace('\r\n', '\n').replace('\n\n', '\n\n' + section + '\n\n', 1).encode('utf-8')
        (destination / name).write_bytes(data)
    package_path = destination / 'package.json'
    package = json.loads(package_path.read_text(encoding='utf-8'))
    package['version'] = version
    package_path.write_text(json.dumps(package, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    for name in ['scripts', 'docs', '.github']:
        shutil.copytree(ROOT / name, destination / name, ignore=shutil.ignore_patterns('__pycache__'))
    shutil.copytree(ROOT / 'extension/tiles', destination / 'extension/tiles')
    for path in (destination / 'extension').glob('*.js'):
        content = path.read_text(encoding='utf-8')
        path.write_text(content.replace("t + '.svg'", "t + '.svg'"), encoding='utf-8')
    manifest_path = destination / 'extension/manifest.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    manifest['version'] = json.loads((destination / 'package.json').read_text(encoding='utf-8'))['version']
    for resource in manifest['web_accessible_resources']:
        resource['resources'] = [name.replace('tiles/*.svg', 'tiles/*.svg') for name in resource['resources']]
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def main(output=None):
    verify()
    files = allowed_files()
    manifest = json.loads((ROOT / 'extension/manifest.json').read_text(encoding='utf-8'))
    package = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))
    version = manifest['version']
    if version != package['version'] or not re.fullmatch(r'\d+\.\d+\.\d+', version):
        raise ValueError('Invalid or inconsistent version')
    if not re.search(r'\*\*' + re.escape(version) + r'(?:\s|\*\*)', (ROOT / 'README.md').read_text(encoding='utf-8')):
        raise ValueError('README must describe the selected snapshot version')
    tiles = ROOT / 'extension/tiles'
    if len(list(tiles.glob('*.svg'))) != 37 or any(tiles.glob('*.png')):
        raise ValueError('Expected 37 original SVG tiles and no legacy PNG tiles')
    if not (ROOT / 'docs/images/observer-preview.png').is_file():
        raise ValueError('Missing synthetic public preview')
    output = output or ROOT / 'dist'
    output.mkdir(exist_ok=True)
    agent_project = (ROOT / 'extension/agent.js').is_file()
    project = 'majsoul-agent' if agent_project else 'majsoul-observer'
    source = output / (project + '-source-' + version + '.zip')
    write_zip(source, [(path, project + '/' + path.relative_to(ROOT).as_posix()) for path in files])
    archives = [source]
    if agent_project:
        subprocess.run(['node', str(ROOT / 'scripts/build-extensions.mjs'), str(output)], check=True)
        for profile in ['agent', 'collector']:
            directory = output / ('majsoul-' + profile + '-' + version)
            archive = Path(str(directory) + '.zip')
            write_zip(archive, [(path, path.relative_to(directory).as_posix()) for path in directory.rglob('*') if path.is_file()])
            archives.append(archive)
    else:
        extension = output / ('majsoul-observer-' + version + '.zip')
        extension_files = [(path, path.relative_to(ROOT / 'extension').as_posix()) for path in files if inside(path, ROOT / 'extension')]
        extension_files += [(ROOT / name, name) for name in ['LICENSE', 'THIRD_PARTY_NOTICES.md']]
        write_zip(extension, extension_files)
        archives.append(extension)
    checksums = []
    for path in archives:
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        checksums.append(digest + '  ' + path.name)
        print(path.name + ': ' + digest)
    (output / ('SHA256SUMS-' + version + '.txt')).write_text('\n'.join(checksums) + '\n', encoding='utf-8')
    print('Source snapshot has no .git, research data, old archives or commit author metadata.')
    print('Pattern scanning is limited; review before publication.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base-ref', help='Read runtime and tests from a committed ref, excluding concurrent feature work')
    parser.add_argument('--snapshot-version', default='0.2.1', help='Version for an isolated base-ref snapshot')
    args = parser.parse_args()
    if args.base_ref:
        output = ROOT / 'dist'
        with tempfile.TemporaryDirectory(prefix='majsoul-public-') as folder:
            destination = Path(folder)
            stable_snapshot(destination, args.base_ref, args.snapshot_version)
            ROOT = destination
            main(output)
    else:
        main()
