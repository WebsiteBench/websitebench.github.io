"""Bounded, on-demand Docker replay of real archived website code.

No model program runs on the host. Extraction rejects links and traversal;
containers have no external network, no host ports, read-only mounts and a
bounded writable tmpfs. A missing dependency is reported, never repaired here.
"""
from concurrent.futures import ThreadPoolExecutor
import hashlib
import fcntl
import json
from pathlib import Path, PurePosixPath
import re
import shutil
import secrets
import os
import subprocess
import tarfile
import threading
import time
import urllib.request

from task_store import material_archive, open_tar, read_json, write_json

SPARSE_COPY = '''from pathlib import Path
import os, shutil, sys
source, destination = map(Path, sys.argv[1:])
destination.mkdir(parents=True, exist_ok=True)
for item in source.iterdir():
    if item.name == '.complete':
        continue
    target = destination / item.name
    if item.is_dir() or item.stat().st_size > 8 * 1024 * 1024 and item.name != 'executable':
        os.symlink(str(item), target, target_is_directory=item.is_dir())
    else:
        shutil.copy2(item, target)
'''

def source_bytes(source):
    complete = source / '.complete'
    if complete.is_file():
        try:
            metadata = read_json(complete)
            if isinstance(metadata, dict) and isinstance(metadata.get('bytes'), int):
                return metadata['bytes']
        except (ValueError, OSError):
            pass
    return sum(path.stat().st_size for path in source.rglob('*') if path.is_file())

def saved_build(archive, destination):
    """Unpack a retained reference build without running a build command."""
    count = size = 0
    with open_tar(archive) as source:
        for entry in source:
            relative = PurePosixPath(entry.name.removeprefix('./'))
            if relative.is_absolute() or '..' in relative.parts or entry.issym() or entry.islnk():
                raise ValueError('Invalid retained reference build member')
            if not entry.isfile():
                continue
            size += entry.size; count += 1
            if size > 2 * 1024 * 1024 * 1024 or count > 100000:
                raise ValueError('The retained reference build exceeds its size limit')
            target = destination.joinpath(*relative.parts)
            target.parent.mkdir(parents=True, exist_ok=True)
            with source.extractfile(entry) as data, target.open('wb') as output:
                shutil.copyfileobj(data, output)
            target.chmod(0o755 if entry.mode & 0o111 else 0o644)
    return count, size


def docker(*args, timeout=30):
    result = subprocess.run(['docker', *args], capture_output=True, text=True, timeout=timeout)
    if result.returncode:
        raise RuntimeError('Container operation failed')
    return result.stdout.strip()


def reference_key(task, source):
    digest = hashlib.sha256()
    for path in sorted(source.rglob('*')):
        if path.is_file() and not any(part.startswith('.') for part in path.relative_to(source).parts):
            digest.update(str(path.relative_to(source)).encode())
            digest.update(path.read_bytes())
    return 'websitebench-reference-' + task + '-' + digest.hexdigest()[:12]


def node_bundle(task, source, cache):
    """Compile trusted reference source once, in a bounded build container.

Keep the standalone bundle rather than one large Docker image per task. The
shared npm cache is outside the public site and is never mounted in a replay.
"""
    key = reference_key(task, source)
    base = cache / 'references'
    base.mkdir(parents=True, exist_ok=True)
    destination = base / key
    with (base / (key + '.lock')).open('w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        if (destination / '.complete').is_file():
            return destination
        work = base / (key + '-' + secrets.token_hex(4))
        work.mkdir()
        snapshot = work / 'snapshot'
        snapshot.mkdir()
        for name in ('clone', 'backend', 'runtime-support', 'profile.json', 'run.sh'):
            item = source / name
            if item.is_dir():
                shutil.copytree(item, snapshot / name, symlinks=True)
            else:
                shutil.copy2(item, snapshot / name)
        output = work / 'output';output.mkdir()
        npm = base / 'npm-cache';npm.mkdir(exist_ok=True)
        script = '''set -eu
cp -R /input/clone /work/clone
cd /work/clone
npm ci --no-audit --no-fund
npm run build
mkdir -p /work/site
if [ -d .next/standalone ]; then
 cp -a .next/standalone /work/site/standalone
 mkdir -p /work/site/standalone/.next
 cp -a .next/static /work/site/standalone/.next/static
 cp -a public /work/site/standalone/public
else cp -a dist/standalone /work/site/standalone; fi
cp -a /input/backend /input/runtime-support /input/profile.json /input/run.sh /work/site/
'''
        log = base / (key + '.log')
        with log.open('w') as logs:
            command = ['docker', 'run', '--rm', '--name', key + '-build',
                '--label', 'websitebench.reference-build=true', '--read-only', '--cap-drop=ALL',
                '--security-opt', 'no-new-privileges', '--memory', '4g', '--cpus', '2', '--pids-limit', '256',
                '--user', f'{os.getuid()}:{os.getgid()}', '--tmpfs', '/tmp:rw,exec,nosuid,nodev,size=1073741824,mode=1777',
                '--mount', f'type=bind,source={snapshot.resolve()},target=/input,readonly',
                '--mount', f'type=bind,source={output.resolve()},target=/work',
                '--mount', f'type=bind,source={npm.resolve()},target=/npm',
                '-e', 'HOME=/tmp/home', '-e', 'NPM_CONFIG_CACHE=/npm', '-e', 'NEXT_TELEMETRY_DISABLED=1',
                '-e', 'CIRCLE_NODE_TOTAL=3', '-e', 'RAYON_NUM_THREADS=2', '-e', 'TOKIO_WORKER_THREADS=2',
                '-e', 'UV_THREADPOOL_SIZE=2',
                '-e', 'NODE_OPTIONS=--max-old-space-size=2048', 'websitebench-replay:local', 'bash', '-c', script]
            try:
                result = subprocess.run(command, stdout=logs, stderr=subprocess.STDOUT, timeout=600)
            except subprocess.TimeoutExpired:
                docker('rm', '-f', key + '-build')
                raise ValueError('The reference build timed out. Retry after checking the build log.') from None
        if result.returncode:
            shutil.rmtree(work, ignore_errors=True)
            raise ValueError('The reference build did not complete. Its source remains unchanged.')
        (output / 'site').replace(destination)
        (destination / '.complete').write_text(key)
        shutil.rmtree(work)
        return destination


class ReplayRuntime:
    IMAGE = 'websitebench-replay:local'
    NETWORK = 'websitebench-task-replays'
    LIMIT = 6
    TTL = 600

    def __init__(self, store, references, namespace='task'):
        if not re.fullmatch(r'[a-z0-9-]+', namespace):
            raise ValueError('Invalid runtime namespace')
        self.NETWORK = 'websitebench-' + namespace + '-replays'
        self.label = 'websitebench.' + namespace + '-replay=true'
        self.prefix = 'websitebench-' + namespace + '-'
        self.store, self.references = store, Path(references)
        self.cache = store.cache.parent / 'websites'
        self.cache.mkdir(parents=True, exist_ok=True)
        self.pool = ThreadPoolExecutor(max_workers=2, thread_name_prefix='website-replay')
        self.jobs, self.instances = {}, {}
        self.failures = {}
        self.wanted, self.progress = {}, {}
        self.lock, self.extract_lock = threading.RLock(), threading.Lock()
        self.build_locks = {}
        self.source_sizes = {}
        version = subprocess.run(['git', '-C', str(self.references), 'rev-parse', '--short=8', 'HEAD'],
                                 capture_output=True, text=True, timeout=5)
        self.reference_version = version.stdout.strip() if version.returncode == 0 else None
        snapshot = self.references / '.snapshot.json'
        if snapshot.is_file():
            self.reference_version = read_json(snapshot)['revision'][:8]
        try:
            docker('network', 'inspect', self.NETWORK)
        except RuntimeError:
            docker('network', 'create', '--internal', '--label', self.label, self.NETWORK)
        # Only containers carrying our exact label are managed by this service.
        stale = docker('ps', '-aq', '--filter', 'label=' + self.label).split()
        if stale:
            docker('rm', '-f', *stale)
        threading.Thread(target=self.reap, daemon=True).start()

    def reap(self):
        while True:
            time.sleep(30)
            with self.lock:
                for key, value in list(self.instances.items()):
                    if time.monotonic() - value['used'] > self.TTL:
                        self.remove(key)

    def remove(self, key):
        item = self.instances.pop(key, None)
        if item:
            try:
                docker('rm', '-f', item['name'])
            except (RuntimeError, subprocess.TimeoutExpired):
                pass

    def touch(self, key):
        with self.lock:
            if key in self.instances:
                self.instances[key]['used'] = time.monotonic()
                return True
        return False

    def prepare(self, uid, client, reset=False):
        record = self.record(uid)
        if not record:
            return {'status': 'unavailable', 'message': 'This recorded context is unavailable.'}
        reference_revision = (record['reference_artifact']['source_revision'][:8]
                              if record.get('reference_artifact') else self.reference_version)
        if not re.fullmatch(r'[a-zA-Z0-9_-]{12,64}', client):
            return {'status': 'error', 'message': 'Invalid preview session.'}
        key = client + ':' + uid
        with self.lock:
            self.wanted[client] = uid
            for pending_key, pending in list(self.jobs.items()):
                if pending_key.startswith(client + ':') and pending_key != key and pending.cancel():
                    self.jobs.pop(pending_key, None)
            if reset:
                preparing = self.jobs.get(key)
                if preparing and not preparing.done():
                    return {'status': 'preparing', 'message': 'The archived websites are still starting…'}
                self.failures.pop(key, None)
                for role in ('reference', 'candidate'):
                    self.remove(key + ':' + role)
                # Ignore a repeated reset while a preparation is still running.
                if key in self.jobs and self.jobs[key].done():
                    self.jobs.pop(key)
            ref = self.instances.get(key + ':reference')
            model = self.instances.get(key + ':candidate')
            if ref and model:
                ref['used'] = model['used'] = time.monotonic()
                return {'status': 'ready', 'run': record['public'],
                        'reference_revision': reference_revision,
                        'services': {'reference': ref, 'candidate': model}}
            if ref and key in self.failures:
                ref['used'] = time.monotonic()
                return {'status': 'partial', 'run': record['public'], 'services': {'reference': ref},
                        'reference_revision': reference_revision,
                        'message': self.failures[key]}
            future = self.jobs.get(key)
            if future and future.done():
                try:
                    future.result()
                except Exception as error:
                    return {'status': 'unavailable', 'message': str(error)[:240]}
                self.jobs.pop(key, None)
            if key not in self.jobs:
                if sum(not job.done() for job in self.jobs.values()) >= 4:
                    return {'status': 'busy', 'message': 'Other websites are starting. Retry in a moment.'}
                self.jobs[key] = self.pool.submit(self.start_pair, uid, client)
        return {'status': 'preparing', 'message': self.progress.get(key, 'Starting the archived websites…')}

    def record(self, uid):
        if uid.startswith('reference-') and uid.removeprefix('reference-') in self.store.index['tasks']:
            return {'task': uid.removeprefix('reference-'), 'candidate': None,
                    'public': {'id': uid}, 'reference_only': True}
        return self.store.records.get(uid)

    def extract(self, binding, uid):
        fingerprint = binding['candidate'].get('archive_sha256')
        if fingerprint and not re.fullmatch(r'[a-f0-9]{64}', fingerprint):
            raise ValueError('Invalid website archive checksum')
        root_key = hashlib.sha256(binding['candidate'].get('archive_root', '').encode()).hexdigest()[:8]
        prebuilt = binding['candidate'].get('prebuilt_member')
        if prebuilt:
            if prebuilt != 'solution/site/implementation/standalone.tar.gz' or not re.fullmatch(r'[a-z0-9][a-z0-9-]{0,100}', binding['candidate'].get('prebuilt_task', '')):
                raise ValueError('Invalid retained reference build binding')
            root_key = hashlib.sha256((root_key + prebuilt + binding['candidate']['prebuilt_task'] + ':layout-v2').encode()).hexdigest()[:8]
        destination = self.cache / ('export-' + fingerprint[:24] + '-' + root_key if fingerprint else uid)
        if (destination / '.complete').is_file():
            return destination
        with self.extract_lock:
            if (destination / '.complete').is_file():
                return destination
            files = binding['candidate'].get('sample_files', [])
            first = next((name for name in files if '/artifacts/app/repo/' in '/' + name), None)
            explicit_root = binding['candidate'].get('archive_root')
            if explicit_root:
                path = PurePosixPath(explicit_root)
                if path.is_absolute() or '..' in path.parts or not path.parts:
                    raise ValueError('Invalid website archive root')
                root = str(path).rstrip('/') + '/'
            elif first:
                root = first[:first.index('artifacts/app/repo/') + len('artifacts/app/repo/')]
            elif files and files[0].startswith('candidate/'):
                root = 'candidate/'
            else:
                raise ValueError('Website code found; its launch layout needs a replay recipe.')
            archive = material_archive(binding)
            self.store.bundles.prepare(archive)
            if (destination / '.complete').is_file():
                return destination
            if not archive.is_file():
                raise ValueError('The website archive is unavailable locally.')
            if fingerprint:
                digest = hashlib.sha256()
                with archive.open('rb') as stream:
                    for block in iter(lambda: stream.read(4 * 1024 * 1024), b''):
                        digest.update(block)
                if digest.hexdigest() != fingerprint:
                    raise ValueError('The website archive failed its SHA256 check.')
            temporary = self.cache / (uid + '.building')
            if temporary.exists():
                shutil.rmtree(temporary)
            temporary.mkdir()
            size, count, pending_links = 0, 0, []
            try:
                with open_tar(archive) as source:
                    for entry in source:
                        name = entry.name.removeprefix('./')
                        if prebuilt and name == prebuilt:
                            if not entry.isfile():
                                raise ValueError('The retained reference build is not a file')
                            with source.extractfile(entry) as data, (temporary / '.saved-build.tar.gz').open('wb') as output:
                                shutil.copyfileobj(data, output)
                            continue
                        if not name.startswith(root):
                            continue
                        relative = PurePosixPath(name[len(root):])
                        if relative.is_absolute() or '..' in relative.parts or not relative.parts:
                            continue
                        target = temporary.joinpath(*relative.parts)
                        if entry.islnk():
                            # Resolve archive hard links as regular files after
                            # their target has been read, never as host links.
                            pending_links.append((target, entry.linkname.removeprefix('./')))
                            continue
                        if not entry.isfile():
                            continue
                        size += entry.size
                        count += 1
                        if size > (8 * 1024 * 1024 * 1024 if fingerprint else 768 * 1024 * 1024) or count > (100000 if fingerprint else 30000):
                            raise ValueError('This website exceeds the local replay size limit.')
                        target.parent.mkdir(parents=True, exist_ok=True)
                        with source.extractfile(entry) as stream, target.open('wb') as output:
                            shutil.copyfileobj(stream, output)
                        target.chmod(0o755 if entry.mode & 0o111 else 0o644)
                if pending_links:
                    # Only accept hard links within this exact candidate root.
                    for target, link in pending_links:
                        if not link.startswith(root):
                            raise ValueError('Archive uses a shared hard-linked artifact; a materialized replay bundle is needed.')
                        relative = PurePosixPath(link[len(root):])
                        if '..' in relative.parts:
                            raise ValueError('Invalid archive link')
                        original = temporary.joinpath(*relative.parts)
                        if original.is_file():
                            target.parent.mkdir(parents=True, exist_ok=True)
                            shutil.copy2(original, target)
                        else:
                            raise ValueError('An archived code file could not be resolved.')
                if not count:
                    raise ValueError('The archive has no files at the recorded website path.')
                if prebuilt:
                    retained = temporary / '.saved-build.tar.gz'
                    if not retained.is_file():
                        raise ValueError('The reference package has no retained build at its recorded path')
                    built_files, built_bytes = saved_build(retained, temporary / '_saved_build' / binding['candidate']['prebuilt_task'])
                    build_root = temporary / '_saved_build' / binding['candidate']['prebuilt_task']
                    if (build_root / 'server.js').is_file() and not (temporary / 'standalone').exists():
                        (temporary / 'standalone').symlink_to(Path('_saved_build') / binding['candidate']['prebuilt_task'], target_is_directory=True)
                    count += built_files; size += built_bytes; retained.unlink()
                (temporary / '.complete').write_text(json.dumps({'files': count, 'bytes': size, 'source': binding.get('source')}))
                for directory in temporary.rglob('*'):
                    if directory.is_dir():
                        directory.chmod(0o755)
                temporary.replace(destination)
                return destination
            except Exception:
                shutil.rmtree(temporary, ignore_errors=True)
                raise

    def start_pair(self, uid, client):
        if self.wanted.get(client) != uid:
            return
        record = self.record(uid)
        reference = (self.extract(record['reference_artifact'], uid + '-reference')
                     if record.get('reference_artifact') else self.references / record['task'] / 'src')
        if not reference.is_dir():
            raise ValueError('The reference website is not installed for this task.')
        key = client + ':' + uid
        self.progress[key] = 'Preparing the reference website…'
        config = reference.parent / 'website.toml'
        node_reference = config.is_file() and 'image = "node:' in config.read_text()
        if node_reference:
            reference = node_bundle(record['task'], reference, self.cache.parent)
        if self.wanted.get(client) != uid:
            return
        ref = self.start(key + ':reference', reference, reference=True)
        with self.lock:
            self.instances[key + ':reference'] = ref
        try:
            if self.wanted.get(client) != uid:
                with self.lock:
                    self.remove(key + ':reference')
                return
            self.progress[key] = 'Opening the saved model website…'
            if not record.get('candidate'):
                raise ValueError('No recorded model run is connected for this selection.' if record.get('reference_only')
                                 else 'No website code is bound to this recorded context. Its trajectory is available.')
            candidate = self.extract(record['candidate'], uid)
            item = self.start(key + ':candidate', candidate)
            with self.lock:
                self.instances[key + ':candidate'] = item
                if self.wanted.get(client) != uid:
                    self.remove(key + ':reference')
                    self.remove(key + ':candidate')
        except Exception as error:
            with self.lock:
                self.failures[key] = str(error)[:240]

    def start(self, key, source, reference=False):
        with self.lock:
            # Keep the current pair together when choosing an idle victim.
            while len(self.instances) >= self.LIMIT:
                eligible = [(k, v) for k, v in self.instances.items() if k.rsplit(':', 1)[0] != key.rsplit(':', 1)[0]]
                if not eligible:
                    raise ValueError('Preview capacity reached. Close another preview and retry.')
                victim = min(eligible, key=lambda pair: pair[1]['used'])[0].rsplit(':', 1)[0]
                self.remove(victim + ':reference')
                self.remove(victim + ':candidate')
            name = self.prefix + hashlib.sha256(key.encode()).hexdigest()[:16]
            # Work on a private tmpfs copy; the downloaded source is immutable.
            launch = '''set -eu
mkdir -p /app/repo
cp -R /source/. /app/repo/
cd /app/repo
if [ -f compile.sh ]; then bash compile.sh; fi
if [ -f executable ]; then chmod +x executable; exec ./executable; fi
if [ -f server.py ]; then exec python server.py; fi
if [ -f app.py ]; then exec python app.py; fi
if [ -f server.js ]; then exec node server.js; fi
if [ -f server.mjs ]; then exec node server.mjs; fi
if [ -f run.sh ]; then exec sh run.sh; fi
if [ -f index.html ]; then exec python -m http.server 8080 --bind 0.0.0.0; fi
echo 'No supported entry point' >&2
exit 42'''
            cache_key = str(source.resolve())
            if cache_key not in self.source_sizes:
                self.source_sizes[cache_key] = source_bytes(source)
            if not reference and self.source_sizes[cache_key] > 384 * 1024 * 1024:
                setup = "python - /source /app/repo <<'WB_COPY'\n" + SPARSE_COPY + 'WB_COPY\n'
                launch = launch.replace('cp -R /source/. /app/repo/\n', setup)
                launch = launch.replace('if [ -f compile.sh ]; then', 'if [ ! -f executable ] && [ -f compile.sh ]; then')
            if reference and (source / 'harbor_entry.py').is_file():
                if self.source_sizes[cache_key] > 384 * 1024 * 1024:
                    # Frozen reference assets are immutable. Serve large trees
                    # directly from disk instead of copying them into RAM.
                    launch = 'cd /source; exec python /source/harbor_entry.py'
            docker('run', '-d', '--name', name, '--label', self.label,
                   '--network', self.NETWORK, '--read-only', '--cap-drop=ALL',
                   '--security-opt', 'no-new-privileges', '--user', '65534:65534',
                   '--memory', '1g', '--cpus', '1', '--pids-limit', '128',
                   '--tmpfs', '/tmp:rw,exec,nosuid,nodev,size=268435456,mode=1777',
                   '--tmpfs', '/app:rw,exec,nosuid,nodev,size=805306368,mode=1777',
                   '--mount', f'type=bind,source={source.resolve()},target=/source,readonly',
                   '-e', 'HOST=0.0.0.0', '-e', 'PORT=8080', '-e', 'DATA_DIR=/tmp/data',
                   '-e', 'SEED=0', '-e', 'TZ=UTC', '-e', 'PYTHONDONTWRITEBYTECODE=1',
                   *(['-e', 'WEBSITEBENCH_NODE_REFERENCE_BUILD_ROOT=/source/_saved_build'] if reference else []),
                   self.IMAGE, 'bash', '-c', launch)
        try:
            info = json.loads(docker('inspect', name))[0]
            ip = info['NetworkSettings']['Networks'][self.NETWORK]['IPAddress']
            url = 'http://' + ip + ':8080'
            opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
            deadline = time.monotonic() + 70
            while time.monotonic() < deadline:
                try:
                    response = opener.open(url, timeout=2)
                    response.close()
                    return {'key': key, 'name': name, 'url': url, 'generation': secrets.token_hex(12), 'used': time.monotonic()}
                except urllib.error.HTTPError:
                    # A server returning 404 at / is still a running original.
                    return {'key': key, 'name': name, 'url': url, 'generation': secrets.token_hex(12), 'used': time.monotonic()}
                except OSError:
                    if docker('inspect', '-f', '{{.State.Running}}', name) != 'true':
                        logs = subprocess.run(['docker', 'logs', '--tail', '50', name], capture_output=True, text=True)
                        if 'SyntaxError' in logs.stderr:
                            raise ValueError('The archived source contains a syntax error' + (' after redaction' if '[REDACTED]' in logs.stderr else '') + '. The trajectory is available; this website cannot run unchanged.')
                        if 'ModuleNotFoundError' in logs.stderr:
                            raise ValueError('The archived website needs an additional runtime dependency. Its trajectory is available.')
                        raise ValueError('The archived website did not start in the replay environment. Its code has not been modified.')
                    time.sleep(.5)
            raise ValueError('The archived website did not respond in time.')
        except Exception:
            try:
                (self.cache / (name + '.log')).write_text(docker('logs', '--tail', '50', name))
                # docker writes stderr logs to stderr; retain those privately too.
                result = subprocess.run(['docker', 'logs', '--tail', '50', name], capture_output=True, text=True)
                (self.cache / (name + '.log')).write_text(result.stdout + result.stderr)
                docker('rm', '-f', name)
            except RuntimeError:
                pass
            raise
