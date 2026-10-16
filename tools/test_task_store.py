"""Regression tests for the lazy trace store and archive trust boundaries."""
import base64
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest

from replay_runtime import ReplayRuntime
from task_store import TaskStore, read_json


class TraceStoreTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.uid = 'a' * 24
        self.source = self.root / 'trajectory.json'
        self.source.write_text(json.dumps({'schema_version': 'ATIF-v1.7',
            'agent': {'model_name': 'example'}, 'steps': [
                {'step_id': 1, 'source': 'user', 'message': '<script>unsafe()</script>'},
                {'step_id': 2, 'source': 'agent', 'message': [{'type': 'image',
                  'file': {'base64': base64.b64encode(b'png fixture').decode(), 'mime_type': 'image/png'}}],
                  'reasoning_content': 'long output ' * 3000,
                  'observation': {'results': [{'content': json.dumps({'type': 'image', 'source': {
                    'type': 'base64', 'data': base64.b64encode(b'png fixture').decode()}}) + '\n\n' + json.dumps({'width': 100})}]},
                  'tool_calls': [{'function_name': 'browser.open', 'arguments': {'key': 'hf_' + 'z' * 30}}]},
            ], 'subagent_trajectories': [{'trajectory_id': 'child', 'schema_version': 'ATIF-v1.7',
                 'agent': {'name': 'Child'}, 'steps': [{'step_id': 1, 'source': 'agent', 'message': 'child result'}]}]}))
        self.record = {'task': 'example', 'model': 'example', 'public': {'id': self.uid},
                       'trace': {'trajectory': {'path': str(self.source)}}}
        index = self.root / 'index.json'
        index.write_text(json.dumps({'runs': {self.uid: self.record}}))
        self.store = TaskStore(index, self.root / 'cache')

    def tearDown(self):
        self.store.pool.shutdown(wait=True)
        self.temp.cleanup()

    def test_step_payloads_separate_media_and_long_output(self):
        self.store.build(self.uid)
        directory = self.store.directory(self.uid)
        manifest = read_json(directory / 'manifest.json')
        self.assertEqual(len(manifest['documents']), 2)
        self.assertNotIn('long output', json.dumps(manifest))
        step = read_json(directory / manifest['documents'][0]['steps'][1]['url'].rsplit('/', 1)[1])
        self.assertIn('_wb_text', step['reasoning_content'])
        self.assertTrue(step['message'][0]['source']['path'].endswith('.png'))
        self.assertNotIn('base64', json.dumps(step))
        self.assertEqual(step['observation']['results'][0]['content'][0]['type'], 'image')
        self.assertNotIn('hf_zzzz', json.dumps(step))
        result = self.store.search(self.uid, 'main', 'long output', 'agent')
        self.assertEqual(result['positions'], [1])
        first_name = manifest['documents'][0]['steps'][0]['url'].rsplit('/', 1)[1]
        self.assertEqual(read_json(directory / first_name)['message'], '<script>unsafe()</script>')
        self.assertEqual(self.store.prepare(self.uid)['status'], 'ready')

    def test_private_raw_files_and_traversal_are_not_served(self):
        self.store.build(self.uid)
        for name in ('source.json', 'source.json.copying', 'build.lock', 'manifest.tmp', 'main-search.json', 'media-index.json', '../trajectory.json', '/etc/passwd'):
            with self.assertRaises(FileNotFoundError):
                self.store.file(self.uid, name)
        manifest = read_json(self.store.directory(self.uid) / 'manifest.json')
        first_name = manifest['documents'][0]['steps'][0]['url'].rsplit('/', 1)[1]
        self.assertTrue(self.store.file(self.uid, first_name).is_file())

    def test_replay_extraction_never_creates_archive_links(self):
        archive = self.root / 'candidate.tar.gz'
        with tarfile.open(archive, 'w:gz') as tar:
            for name, content in [('artifacts/app/repo/server.py', b'print("fixture")'),
                                  ('artifacts/app/repo/../../escape.py', b'bad')]:
                info = tarfile.TarInfo(name);info.size = len(content);tar.addfile(info, io.BytesIO(content))
            symlink = tarfile.TarInfo('artifacts/app/repo/leak')
            symlink.type = tarfile.SYMTYPE;symlink.linkname = '/etc/passwd';tar.addfile(symlink)
        runtime = object.__new__(ReplayRuntime)
        runtime.cache = self.root / 'websites';runtime.cache.mkdir()
        runtime.store = self.store
        import threading
        runtime.extract_lock = threading.Lock()
        binding = {'candidate': {'sample_files': ['artifacts/app/repo/server.py']},
                   'trajectory': {'path': str(archive)}}
        result = runtime.extract(binding, self.uid)
        self.assertEqual((result / 'server.py').read_text(), 'print("fixture")')
        self.assertFalse((result / 'leak').exists())
        self.assertFalse((self.root / 'escape.py').exists())

    def test_shared_archive_resolves_original_hardlinked_bytes_once(self):
        archive = self.root / 'imports/grok-archives/site/archives/guest-fixture.tar.gz'
        archive.parent.mkdir(parents=True)
        code_root = 'original/task/artifacts/app/repo/'
        links = {code_root + 'server.py': 'deduplicated/server.py',
                 'original/task/agent/trajectory.json': 'deduplicated/trajectory.json'}
        report = archive.parents[3] / 'guest-fixture-opened.json'
        report.write_text(json.dumps({'hardlinks': links}))
        with tarfile.open(archive, 'w:gz') as tar:
            for name, content in [('deduplicated/server.py', b'original bytes'),
                                  ('deduplicated/trajectory.json', self.source.read_bytes())]:
                info = tarfile.TarInfo(name);info.size = len(content);tar.addfile(info, io.BytesIO(content))
            for name, target in links.items():
                info = tarfile.TarInfo(name);info.type = tarfile.LNKTYPE;info.linkname = target;tar.addfile(info)
        self.record['trace'] = {'model': 'example', 'trajectory': {'path': str(archive),
            'archive_members': [{'model': 'example', 'member': 'original/task/agent/trajectory.json',
                                 'hardlink_target': 'deduplicated/trajectory.json'}]}}
        self.record['candidate'] = {'candidate': {'sample_files': [code_root + 'server.py']}}
        self.store.records[self.uid] = self.record
        self.store.bundles.prepare(archive)
        code = self.store.cache.parent / 'websites' / self.uid / 'server.py'
        self.assertEqual(code.read_bytes(), b'original bytes')
        self.assertFalse(code.is_symlink())
        self.assertEqual((self.store.directory(self.uid) / 'source.json').read_bytes(), self.source.read_bytes())


if __name__ == '__main__':
    unittest.main()
