"""Private, demand-loaded trace store. Never serve the artifact directory itself.

The browser receives a small timeline and one step at a time. Screenshots and
long tool output are separate objects, fetched only when opened. Derived files
can also be uploaded to object storage; the front end uses the same manifest.
"""
import base64
import fcntl
from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import mimetypes
from pathlib import Path, PurePosixPath
import re
import tarfile
import threading
import time
import sys

try:
    import orjson
except ImportError:
    orjson = None


def read_json(path):
    data = path.read_bytes()
    return orjson.loads(data) if orjson else json.loads(data)


def write_json(path, value):
    data = orjson.dumps(value) if orjson else json.dumps(value, ensure_ascii=False).encode()
    path.write_bytes(data)


def safe_text(value):
    # Defense in depth for source files that predate the archive sanitizer.
    value = re.sub(r'\bhf_[A-Za-z0-9]{20,}\b', '[REDACTED_HF_TOKEN]', value)
    value = re.sub(r'\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{25,}', '[REDACTED_API_KEY]', value)
    return value


def media_string(value):
    """Handle one media JSON value or newline-concatenated provider records."""
    if not value.lstrip().startswith(('{', '[')) or '"type"' not in value[:160]:
        return None
    decoder, rest, parts = json.JSONDecoder(), value.lstrip(), []
    def typed(item):
        return isinstance(item, dict) and item.get('type') in ('image', 'audio', 'text')
    try:
        first, end = decoder.raw_decode(rest)
    except (ValueError, RecursionError):
        return None
    if not (isinstance(first, dict) and first.get('type') in ('image', 'audio')
            or isinstance(first, list) and first and all(typed(p) for p in first)):
        return None
    while True:
        parts.extend(first if isinstance(first, list) else [first])
        rest = rest[end:].lstrip()
        if not rest:
            return parts
        try:
            first, end = decoder.raw_decode(rest)
        except (ValueError, RecursionError):
            parts.append({'type': 'text', 'text': rest})
            return parts
        if not (typed(first) or isinstance(first, list) and all(typed(p) for p in first)):
            first = {'type': 'text', 'text': json.dumps(first, ensure_ascii=False)}


def open_tar(path):
    if path.name.endswith('.zst'):
        import zstandard
        return tarfile.open(fileobj=zstandard.ZstdDecompressor().stream_reader(path.open('rb')), mode='r|')
    return tarfile.open(path, mode='r|*')


def material_archive(binding):
    """Use the already verified/decrypted archive, without downloading again."""
    manifest = binding.get('candidate', {}).get('hash_manifest')
    if manifest and Path(manifest).is_file():
        report = read_json(Path(manifest))
        path = Path(report['local_path'])
        if path.name.endswith('.age'):
            path = Path(manifest).parents[1] / 'decrypted' / (report['key'] + '.tar.zst')
        return path
    return Path(binding.get('trajectory', {}).get('path', '').split('::')[0])


class TaskStore:
    ENCODER_VERSION = 4
    def __init__(self, index, cache):
        self.index = read_json(Path(index))
        self.records = self.index['runs']
        self.cache = Path(cache)
        self.cache.mkdir(parents=True, exist_ok=True)
        self.pool = ThreadPoolExecutor(max_workers=2, thread_name_prefix='trace-index')
        self.jobs = {}
        self.lock = threading.Lock()
        self.search_cache = OrderedDict()
        from archive_bundles import ArchiveBundles
        self.bundles = ArchiveBundles(self)

    def directory(self, uid):
        record = self.records[uid]
        fingerprint = record['trace'].get('trajectory', {}).get('sha256') or record['trace'].get('source_trajectory_sha256') or uid
        return self.cache / ('v2-' + uid + '-' + fingerprint[:12])

    def prepare(self, uid):
        if uid not in self.records:
            return {'status': 'missing', 'message': 'This recorded trajectory is unavailable.'}
        destination = self.directory(uid)
        if (destination / 'manifest.json').is_file():
            manifest = read_json(destination / 'manifest.json')
            if manifest.get('encoder_version') == self.ENCODER_VERSION:
                return {'status': 'ready', 'manifest': manifest}
        with self.lock:
            future = self.jobs.get(uid)
            if future is None:
                if sum(not job.done() for job in self.jobs.values()) >= 8:
                    return {'status': 'busy', 'message': 'Preparing other trajectories. Please retry shortly.'}
                future = self.jobs[uid] = self.pool.submit(self.build, uid)
            if future.done():
                try:
                    future.result()
                except Exception:
                    return {'status': 'error', 'message': 'The archived trajectory could not be prepared.'}
                return {'status': 'ready', 'manifest': read_json(destination / 'manifest.json')}
        return {'status': 'preparing', 'message': 'Preparing the step index. This is cached after the first visit.'}

    def source(self, uid):
        record = self.records[uid]['trace']
        direct = Path(record.get('trajectory', {}).get('path', ''))
        if direct.is_file() and direct.suffix == '.json':
            return direct
        directory = self.directory(uid)
        directory.mkdir(parents=True, exist_ok=True)
        output = directory / 'source.json'
        if output.is_file():
            return output
        members = record.get('trajectory', {}).get('archive_members', [])
        expected_model = record['model']
        member = next((m for m in members if m.get('model') == expected_model), None)
        member = member or next((m for m in members if m.get('schema', '').startswith('ATIF')), None)
        if not member:
            raise ValueError('No ATIF member')
        wanted = (member.get('hardlink_target') or member['member']).removeprefix('./')
        archive = material_archive(record)
        self.bundles.prepare(archive)
        if output.is_file():
            return output
        with open_tar(archive) as source:
            for entry in source:
                if entry.name.lstrip('./') != wanted or not entry.isfile():
                    continue
                stream = source.extractfile(entry)
                import gzip
                if entry.name.endswith('.gz'):
                    stream = gzip.GzipFile(fileobj=stream)
                with output.open('wb') as target:
                    import shutil
                    shutil.copyfileobj(stream, target)
                return output
        raise ValueError('ATIF member not found')

    def build(self, uid):
        directory = self.directory(uid)
        directory.mkdir(parents=True, exist_ok=True)
        with (directory / 'build.lock').open('w') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            if not (directory / 'manifest.json').is_file() or read_json(directory / 'manifest.json').get('encoder_version') != self.ENCODER_VERSION:
                self._build(uid)

    def _build(self, uid):
        started = time.monotonic()
        source = self.source(uid)
        root = read_json(source)
        if not str(root.get('schema_version', '')).startswith('ATIF-v1.') or not isinstance(root.get('steps'), list):
            raise ValueError('Expected ATIF')
        destination = self.directory(uid)
        destination.mkdir(parents=True, exist_ok=True)
        documents, media_files = [], {}
        api = '/_preview_runtime/task-data/' + uid + '/'

        def asset(raw, kind, media_type):
            digest = hashlib.sha256(raw).hexdigest()
            extension = mimetypes.guess_extension(media_type) or '.bin'
            name = digest + extension
            path = destination / name
            if not path.exists():
                path.write_bytes(raw)
            media_files[name] = media_type
            return {'type': kind, 'source': {'path': api + name, 'media_type': media_type}}

        def transform(value, search):
            if isinstance(value, str):
                # Some ATIF producers serialize a media part into result.content.
                # Decode only typed media, never arbitrary JSON tool output.
                parsed = media_string(value)
                if parsed:
                    return transform(parsed, search)
                value = safe_text(value)
                # Do not index image data. Long text stays out of the step payload.
                if len(value) > 24000:
                    name = hashlib.sha256(value.encode()).hexdigest() + '.txt'
                    path = destination / name
                    if not path.exists():
                        path.write_text(value)
                    search.append(value.lower())
                    return {'_wb_text': api + name, 'preview': value[:2000], 'characters': len(value)}
                search.append(value.lower())
                return value
            if isinstance(value, list):
                result, seen = [], set()
                for item in value:
                    part = transform(item, search)
                    if isinstance(part, dict) and part.get('type') in ('image', 'audio'):
                        identity = (part['type'], part.get('source', {}).get('path'))
                        if identity[1] and identity in seen:
                            continue
                        seen.add(identity)
                    result.append(part)
                return result
            if not isinstance(value, dict):
                return value
            if value.get('type') in ('image', 'audio'):
                kind = value['type']
                spec = value.get('source', {})
                file = value.get('file', {})
                media_type = spec.get('media_type') or file.get('mime_type') or file.get('media_type') or ('image/png' if kind == 'image' else 'audio/wav')
                if media_type not in ('image/png', 'image/jpeg', 'image/webp', 'image/gif', 'audio/wav', 'audio/mpeg', 'audio/ogg', 'audio/mp4'):
                    return {'type': 'text', 'text': 'Recorded media format is unsupported.'}
                encoded = file.get('base64') or (spec.get('data') if spec.get('type') == 'base64' else None)
                path = spec.get('path', '')
                if path.startswith('data:') and ';base64,' in path:
                    encoded = path.split(';base64,', 1)[1]
                if encoded:
                    try:
                        return asset(base64.b64decode(re.sub(r'\s+', '', encoded), validate=True), kind, media_type)
                    except (ValueError, TypeError):
                        return {'type': 'text', 'text': 'This recorded media data is incomplete.'}
                if path and not path.startswith(('http:', 'https:', '/')):
                    local = (source.parent / path).resolve()
                    if local.is_relative_to(source.parent.resolve()) and local.is_file() and local.stat().st_size < 32 * 1024 * 1024:
                        return asset(local.read_bytes(), kind, media_type)
                return {'type': kind, 'source': {'path': path, 'media_type': media_type}}
            return {k: transform(v, search) for k, v in value.items()}

        def document(data, parent=None, document_key='main'):
            summaries, search_rows = [], []
            for position, step in enumerate(data['steps']):
                search = []
                # The extra field often embeds the same raw message and base64
                # screenshots a second time. Keep it available, but collapsed.
                slim = {k: v for k, v in step.items() if k != 'extra'}
                converted = transform(slim, search)
                if step.get('extra'):
                    extra = transform(step['extra'], [])
                    name = f'{document_key}-{position + 1}-extra.json'
                    write_json(destination / name, extra)
                    hashed = name[:-5] + '-' + hashlib.sha256((destination / name).read_bytes()).hexdigest()[:16] + '.json'
                    (destination / name).replace(destination / hashed)
                    name = hashed
                    converted['_wb_extra'] = api + name
                name = f'{document_key}-{position + 1}.json'
                write_json(destination / name, converted)
                hashed = name[:-5] + '-' + hashlib.sha256((destination / name).read_bytes()).hexdigest()[:16] + '.json'
                (destination / name).replace(destination / hashed)
                name = hashed
                calls = [c.get('function_name', 'Tool') for c in step.get('tool_calls', [])]
                first_call = next(iter(step.get('tool_calls', [])), {})
                arguments = first_call.get('arguments') or {}
                hint = next((arguments.get(k) for k in ('command', 'cmd', 'url', 'file_path', 'path', 'pattern') if arguments.get(k)), '')
                if isinstance(hint, list):
                    hint = ' '.join(str(v) for v in hint)
                if not isinstance(hint, str):
                    hint = ''
                text = step.get('message', '')
                if isinstance(text, list):
                    text = ' '.join(p.get('text', '') for p in text if p.get('type') == 'text')
                summaries.append({'step_id': step.get('step_id', position + 1), 'position': position,
                                  'source': step.get('source', 'agent'), 'tools': calls,
                                  'label': safe_text((hint or text)[:120]).replace('\n', ' '), 'url': api + name,
                                  'timestamp': step.get('timestamp')})
                search_rows.append('\n'.join(search))
            metadata = {k: v for k, v in data.items() if k not in ('steps', 'subagent_trajectories')}
            documents.append({'key': document_key, 'parent': parent, 'metadata': transform(metadata, []), 'steps': summaries})
            write_json(destination / (document_key + '-search.json'), search_rows)
            for i, child in enumerate(data.get('subagent_trajectories', [])):
                document(child, document_key, document_key + '-' + str(i))

        document(root)
        write_json(destination / 'media-index.json', media_files)
        info = self.records[uid]['public']
        manifest = {'version': 1, 'encoder_version': self.ENCODER_VERSION, 'id': uid, 'run': info, 'documents': documents,
                    'source_bytes': source.stat().st_size,
                    'build_seconds': round(time.monotonic() - started, 2)}
        temporary = destination / 'manifest.tmp'
        write_json(temporary, manifest)
        temporary.replace(destination / 'manifest.json')

    def search(self, uid, document_key, query, role):
        manifest = read_json(self.directory(uid) / 'manifest.json')
        doc = next(d for d in manifest['documents'] if d['key'] == document_key)
        cache_key = uid + ':' + doc['key']
        rows = None
        if query:
            with self.lock:
                rows = self.search_cache.get(cache_key)
                if rows is not None:
                    self.search_cache.move_to_end(cache_key)
            if rows is None:
                rows = read_json(self.directory(uid) / (doc['key'] + '-search.json'))
                size = sys.getsizeof(rows) + sum(sys.getsizeof(row) for row in rows)
                with self.lock:
                    if size <= 64 * 1024 * 1024:
                        self.search_cache[cache_key] = rows
                        while len(self.search_cache) > 2:
                            self.search_cache.popitem(last=False)
        query = query.lower()[:200]
        return {'positions': [i for i, step in enumerate(doc['steps'])
                if (role == 'all' or role == step['source'] or role == 'tools' and step['tools'])
                and (not query or query in rows[i])]}

    def file(self, uid, name):
        if uid not in self.records or not re.fullmatch(r'(?:manifest\.json|main(?:-\d+)*-\d+(?:-extra)?(?:-[a-f0-9]{16})?\.json|[a-f0-9]{64}\.(?:txt|png|jpe?g|webp|gif|wav|mp3|ogg|m4a|mp4))', name):
            raise FileNotFoundError()
        path = self.directory(uid) / name
        if not path.is_file():
            raise FileNotFoundError()
        return path
