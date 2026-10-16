#!/usr/bin/env python3
"""Smoke-test actual reference homepages, two disposable containers at a time."""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import json
from pathlib import Path
import urllib.error
import urllib.request

from replay_runtime import ReplayRuntime, docker, node_bundle
from task_store import TaskStore


def check(store, references, output):
    runtime = ReplayRuntime(store, references, namespace='checks')
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

    def one(task):
        item = None
        try:
            source = references / task / 'src'
            if 'image = "node:' in (references / task / 'website.toml').read_text():
                source = node_bundle(task, source, store.cache.parent)
            item = runtime.start('homepage-check:' + task, source, reference=True)
            with opener.open(item['url'], timeout=15) as response:
                body = response.read(4096)
                return {'task': task, 'status': response.status,
                        'html': 'text/html' in response.headers.get('Content-Type', ''), 'bytes_read': len(body)}
        except Exception as error:
            return {'task': task, 'status': 'error', 'message': str(error)[:240]}
        finally:
            if item:
                docker('rm', '-f', item['name'])

    results = []
    try:
        with ThreadPoolExecutor(max_workers=2) as pool:
            futures = [pool.submit(one, task) for task in store.index['tasks']]
            for future in as_completed(futures):
                results.append(future.result())
                output.write_text(json.dumps({'checked': len(results), 'total': len(futures), 'results': results}))
        return results
    finally:
        runtime.pool.shutdown(wait=True)
        docker('network', 'rm', runtime.NETWORK)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--task-index', type=Path, required=True)
    parser.add_argument('--task-cache', type=Path, required=True)
    parser.add_argument('--references', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    store = TaskStore(args.task_index, args.task_cache)
    try:
        results = check(store, args.references, args.output)
        failures = [r for r in results if r['status'] != 200 or not r.get('html')]
        print(json.dumps({'checked': len(results), 'failures': failures}))
    finally:
        store.pool.shutdown(wait=True)
