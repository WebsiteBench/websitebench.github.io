"""Materialize all original Grok runs in a host archive in one sequential read.

The source archives are deduplicated with tar hard links. Resolve those links
using the verified inspection index, and copy bytes rather than creating links.
This avoids rescanning multi-GB gzip files whenever a different task is selected.
"""
import gzip
import hashlib
import fcntl
import json
from pathlib import Path, PurePosixPath
import shutil
import threading


class ArchiveBundles:
    def __init__(self, store):
        self.store = store
        self.locks = {}
        self.lock = threading.Lock()

    def prepare(self, archive):
        if not archive.name.startswith('guest-') or not archive.name.endswith('.tar.gz'):
            return
        report_path = archive.parents[3] / (archive.name.removesuffix('.tar.gz') + '-opened.json')
        if not report_path.is_file():
            return
        with self.lock:
            lock = self.locks.setdefault(str(archive), threading.Lock())
        with lock:
            lock_path = self.store.cache.parent / ('archive-' + hashlib.sha256(str(archive).encode()).hexdigest()[:24] + '.lock')
            with lock_path.open('w') as file_lock:
                fcntl.flock(file_lock, fcntl.LOCK_EX)
                return self._prepare(archive, report_path)

    def _prepare(self, archive, report_path):
        from task_store import open_tar, read_json
        identity = str(archive.resolve()) + ':' + str(archive.stat().st_size) + ':' + ','.join(sorted(self.store.records))
        marker = self.store.cache.parent / ('bundle-' + hashlib.sha256(identity.encode()).hexdigest()[:24] + '.complete')
        if marker.exists():
            return
        report = read_json(report_path)
        links = report.get('hardlinks', {})

        def canonical(name):
            seen = set()
            while name in links:
                if name in seen:
                    raise ValueError('Cyclic archive link')
                seen.add(name)
                name = links[name]
            return name

        exact, roots, code_dirs, traces = {}, [], {}, {}

        def add(name, destination, decompress=False):
            exact.setdefault(canonical(name), []).append((destination, decompress))

        for uid, record in self.store.records.items():
            trace = record['trace']
            if trace.get('trajectory', {}).get('path') != str(archive):
                continue
            member = next((m for m in trace['trajectory'].get('archive_members', [])
                           if m.get('model') == trace['model']), None)
            if member:
                destination = self.store.directory(uid)
                destination.mkdir(parents=True, exist_ok=True)
                output = destination / 'source.json'
                add(member.get('hardlink_target') or member['member'], output,
                    member['member'].endswith('.gz'))
                traces[uid] = output
                # Media are fetched separately by the viewer after conversion.
                roots.append((member['member'].rsplit('/', 1)[0] + '/media/', destination / 'media'))
            binding = record.get('candidate')
            if binding:
                first = next((name for name in binding['candidate'].get('sample_files', []) if 'artifacts/app/repo/' in name), None)
                if first:
                    root = first[:first.index('artifacts/app/repo/') + len('artifacts/app/repo/')]
                    destination = self.store.cache.parent / 'websites' / uid
                    destination.mkdir(parents=True, exist_ok=True)
                    roots.append((root, destination))
                    code_dirs[uid] = destination

        def destinations(name):
            found = list(exact.get(name, []))
            for prefix, root in roots:
                if not name.startswith(prefix):
                    continue
                relative = PurePosixPath(name[len(prefix):])
                if relative.parts and not relative.is_absolute() and '..' not in relative.parts:
                    found.append((root.joinpath(*relative.parts), False))
            return found

        # The link's physical target may occur earlier than its alias.
        for alias in links:
            for destination, decompress in destinations(alias):
                add(alias, destination, decompress)
        copied = set()
        total = 0
        with open_tar(archive) as source:
            for entry in source:
                if not entry.isfile():
                    continue
                name = entry.name.removeprefix('./')
                outputs = list(dict.fromkeys(destinations(name)))
                if not outputs:
                    continue
                total += entry.size
                if entry.size > 1024 * 1024 * 1024 or total > 8 * 1024 * 1024 * 1024:
                    raise ValueError('Archive materialization exceeds its size limit')
                with source.extractfile(entry) as data:
                    # Read a member once even if several aliases use it.
                    first = outputs[0][0]
                    first.parent.mkdir(parents=True, exist_ok=True)
                    raw = first.with_name(first.name + '.copying')
                    with raw.open('wb') as output:
                        shutil.copyfileobj(data, output)
                    for destination, decompress in outputs:
                        if destination in copied:
                            continue
                        destination.parent.mkdir(parents=True, exist_ok=True)
                        if decompress:
                            with gzip.open(raw, 'rb') as stream, destination.open('wb') as output:
                                shutil.copyfileobj(stream, output)
                        else:
                            shutil.copyfile(raw, destination)
                        destination.chmod(0o755 if entry.mode & 0o111 else 0o644)
                        copied.add(destination)
                    raw.unlink()
        for uid, destination in code_dirs.items():
            count = sum(p.is_file() for p in destination.rglob('*'))
            if count:
                (destination / '.complete').write_text(json.dumps({'files': count, 'archive_cache': True}))
        if not all(p.is_file() for p in traces.values()):
            raise ValueError('An original trajectory could not be materialized')
        marker.write_text(json.dumps({'runs': len(traces), 'copied_files': len(copied)}))
