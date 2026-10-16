#!/usr/bin/env python3
"""Prepare a trace for static object storage, without uploading or publishing.

Only objects reachable from the viewer manifest are copied. Raw source JSON,
server search indexes and inspection reports are never copied. Logs can still
contain sensitive text; inspect the export before making it public.
Provider-specific extra fields are omitted by default. Review exported contents
before making them public; this command does not grant publication approval.
"""
import argparse
import json
from pathlib import Path
import re
import shutil
import time

from task_store import TaskStore, read_json, write_json


def export(store, uid, output, base, include_provider=False):
    while True:
        result = store.prepare(uid)
        if result['status'] == 'ready':
            break
        if result['status'] not in ('preparing', 'busy'):
            raise ValueError(result.get('message', 'Trace unavailable'))
        time.sleep(.2)
    destination = output / uid
    if destination.exists() and any(destination.iterdir()):
        raise ValueError('Choose a fresh export directory so old objects cannot be published accidentally.')
    destination.mkdir(parents=True, exist_ok=True)
    prefix = '/_preview_runtime/task-data/' + uid + '/'
    published = base.rstrip('/') + '/' + uid + '/'
    pending, copied = set(), set()

    def rewrite(value):
        if isinstance(value, list):
            return [rewrite(v) for v in value]
        if not isinstance(value, dict):
            return value
        result = {}
        for key, item in value.items():
            if key == '_wb_extra' and not include_provider:
                continue
            if key in ('url', 'path', '_wb_text', '_wb_extra') and isinstance(item, str) and item.startswith(prefix):
                name = item[len(prefix):]
                if not re.fullmatch(r'[\w.-]+', name):
                    raise ValueError('Invalid derived object')
                pending.add(name)
                result[key] = published + name
            else:
                result[key] = rewrite(item)
        return result

    manifest = rewrite(result['manifest'])
    while pending:
        name = pending.pop()
        if name in copied:
            continue
        path = store.file(uid, name)
        if name.endswith('.json'):
            write_json(destination / name, rewrite(read_json(path)))
        else:
            shutil.copyfile(path, destination / name)
        copied.add(name)
    manifest['storage'] = published
    write_json(destination / 'manifest.json', manifest)
    return {'objects': len(copied) + 1, 'bytes': sum(p.stat().st_size for p in destination.iterdir() if p.is_file())}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--index', type=Path, required=True)
    parser.add_argument('--cache', type=Path, required=True)
    parser.add_argument('--run', required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--base', required=True, help='Future CDN base URL, or a relative URL for local inspection')
    parser.add_argument('--include-provider-fields', action='store_true')
    args = parser.parse_args()
    store = TaskStore(args.index, args.cache)
    try:
        print(json.dumps(export(store, args.run, args.output, args.base, args.include_provider_fields)))
    finally:
        store.pool.shutdown(wait=True)
