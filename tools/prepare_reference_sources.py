#!/usr/bin/env python3
"""Restore complete references in a private directory without changing checkout.

Retain the local Harbor runtime adapters, restore missing tracked files from the
pinned Git tree, and hydrate LFS pointers from already fetched verified objects.
Download only the accepted task src paths with git lfs fetch before running this.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess


def prepare(repository, catalog, output, fetch=False):
    revision = subprocess.check_output(['git', '-C', str(repository), 'rev-parse', 'HEAD'], text=True).strip()
    tasks = [t['id'] for t in json.loads(catalog.read_text())['tasks']]
    if len(tasks) != 74:
        raise ValueError('Reference browser must use the accepted 74-task cohort.')
    if fetch:
        subprocess.run(['git', '-c', 'lfs.concurrenttransfers=16', '-C', str(repository), 'lfs', 'fetch',
                        'origin', revision, '--include=' + ','.join('websites/' + task + '/src/**' for task in tasks)],
                       check=True, env={**os.environ, 'GIT_TERMINAL_PROMPT': '0'})
    common = subprocess.check_output(['git', '-C', str(repository), 'rev-parse', '--git-common-dir'], text=True).strip()
    gitdir = (repository / common).resolve()
    destination = output / revision[:12]
    destination.mkdir(parents=True, exist_ok=True)
    marker = destination / '.snapshot.json'
    if marker.is_file():
        return destination
    if not (destination / '.sources-copied').is_file():
        for task in tasks:
            source = repository / 'websites' / task / 'src'
            shutil.copytree(source, destination / task / 'src', dirs_exist_ok=True,
                ignore=shutil.ignore_patterns('.websitebench-reference-tls', '__pycache__', 'node_modules', '.next', '.git'))
            shutil.copy2(repository / 'websites' / task / 'website.toml', destination / task / 'website.toml')
        (destination / '.sources-copied').write_text(revision)
    state_file = destination / '.hydration-state.json'
    verified = json.loads(state_file.read_text()) if state_file.exists() else {}
    restored = hydrated = 0
    missing = []
    tree_file = destination / '.tree-index.json'
    if tree_file.exists():
        tree = json.loads(tree_file.read_text())
    else:
        rows = subprocess.check_output(['git', '-C', str(repository), 'ls-tree', '-r', '-l', revision, '--',
            *['websites/' + task + '/src' for task in tasks]], text=True).splitlines()
        tree = []
        for row in rows:
            info, name = row.split('\t', 1)
            mode, kind, oid, size = info.split()
            if kind == 'blob':
                tree.append({'path': name, 'mode': int(mode, 8), 'oid': oid, 'bytes': int(size)})
        tree_file.write_text(json.dumps(tree))
    lfs_file = destination / '.lfs-index.json'
    if lfs_file.exists():
        lfs = json.loads(lfs_file.read_text())
    else:
        blobs = {}
        for item in tree:
            if item['bytes'] < 1024:
                blobs.setdefault(item['oid'], []).append(item['path'])
        lfs = {}
        batch = subprocess.Popen(['git', '-C', str(repository), 'cat-file', '--batch'], stdin=subprocess.PIPE, stdout=subprocess.PIPE)
        try:
            for oid, names in blobs.items():
                batch.stdin.write((oid + '\n').encode()); batch.stdin.flush()
                size = int(batch.stdout.readline().split()[2])
                data = batch.stdout.read(size); batch.stdout.read(1)
                if data.startswith(b'version https://git-lfs.github.com/spec/v1'):
                    actual = re.search(rb'oid sha256:([a-f0-9]{64})', data)[1].decode()
                    length = int(re.search(rb'\nsize (\d+)', data)[1])
                    for name in names:
                        lfs[name] = {'oid': actual, 'size': length}
        finally:
            batch.stdin.close(); batch.stdout.close(); batch.wait()
        lfs_file.write_text(json.dumps(lfs))
    batch = None
    try:
        for item in tree:
            name = item['path']
            parts = PurePosixPath(name).parts
            if len(parts) < 4 or parts[0] != 'websites' or parts[1] not in tasks or '..' in parts:
                continue
            target = destination.joinpath(*parts[1:])
            pointer = lfs.get(name)
            if pointer:
                oid, size = pointer['oid'], pointer['size']
                if verified.get(name) == oid and target.is_file() and target.stat().st_size == size:
                    continue
                obj = gitdir / 'lfs/objects' / oid[:2] / oid[2:4] / oid
                if not obj.is_file() or obj.stat().st_size != size:
                    missing.append(name)
                    continue
                if hashlib.sha256(obj.read_bytes()).hexdigest() != oid:
                    raise ValueError('Reference asset hash mismatch: ' + name)
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(obj, target)
                verified[name] = oid
                hydrated += 1
            elif not target.is_file():
                if batch is None:
                    batch = subprocess.Popen(['git', '-C', str(repository), 'cat-file', '--batch'], stdin=subprocess.PIPE, stdout=subprocess.PIPE)
                batch.stdin.write((item['oid'] + '\n').encode()); batch.stdin.flush()
                length = int(batch.stdout.readline().split()[2])
                data = batch.stdout.read(length); batch.stdout.read(1)
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(data)
                restored += 1
            if target.is_file():
                target.chmod(0o755 if item['mode'] & 0o111 else 0o644)
    finally:
        if batch is not None:
            batch.stdin.close(); batch.stdout.close(); batch.wait()
        state_file.write_text(json.dumps(verified))
    if missing:
        (destination / '.missing-lfs.json').write_text(json.dumps(missing))
        raise ValueError(f'{len(missing)} reference LFS objects are not downloaded yet.')
    (destination / '.missing-lfs.json').unlink(missing_ok=True)
    marker.write_text(json.dumps({'revision': revision, 'tasks': tasks, 'hydrated': len(verified), 'restored': restored}))
    return destination


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repository', type=Path, required=True)
    parser.add_argument('--catalog', type=Path, default=Path(__file__).resolve().parents[1] / 'data/task-materials.json')
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--fetch', action='store_true', help='Fetch only the 74 task src LFS objects first')
    args = parser.parse_args()
    print(prepare(args.repository.resolve(), args.catalog, args.output.resolve(), args.fetch))
