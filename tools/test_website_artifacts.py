import hashlib
import io
import json
from pathlib import Path
import tarfile
import tempfile
import threading
import subprocess
import sys
from types import SimpleNamespace
import unittest

from replay_runtime import ReplayRuntime, SPARSE_COPY, source_bytes, saved_build
from website_artifacts import attach


class ArtifactTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.destination = 'medium/qwen3.8-max/1m-max'
        self.leaf = self.root / 'repository' / self.destination
        self.leaf.mkdir(parents=True)
        self.archive = self.leaf / 'agent-website.tar.gz'
        with tarfile.open(self.archive, 'w:gz') as tar:
            entry = tarfile.TarInfo('repo/server.py')
            raw = b'print("recorded website")'
            entry.size = len(raw)
            tar.addfile(entry, io.BytesIO(raw))
        self.sha = hashlib.sha256(self.archive.read_bytes()).hexdigest()
        self.save('repo-metadata.json', {'repo_id': 'TIGER-Lab/WebsiteBenchArtifacts', 'revision': 'a' * 40,
                                       'files': [{'path': self.destination + '/agent-website.tar.gz', 'size': self.archive.stat().st_size, 'lfs': {'sha256': self.sha}}]})
        self.save('download-progress.json', {'complete': True, 'revision': 'a' * 40})
        self.item = dict(destination=self.destination, task='medium', model='qwen3.8-max', context='1m', effort='max', selected_run='author-medium__abcdefg')
        self.save('repository/WEBSITE_ARTIFACTS_INDEX.json', {'items': [self.item]})
        self.save('repository/' + self.destination + '/website-artifacts.json', dict(self.item, artifacts={
            'agent': {'status': 'available', 'archive_filename': self.archive.name, 'files': [{'path': 'repo/server.py', 'type': 'file', 'size': len(raw)}]},
            'reference': {'status': 'source_export_unavailable'}}))
        self.save('trace/trajectory.json', {'steps': []})
        self.save('trace/path-layout.json', {'destination': self.destination, 'source_run': self.item['selected_run']})
        self.info = {'id': 'recorded-context-1', 'code': False}
        self.public = {'models': [{'id': 'qwen', 'source_id': 'qwen3.8-max'}], 'tasks': [{'id': 'medium', 'models': {'qwen': {'runs': [self.info], 'code': False}}}]}
        self.record = {'task': 'medium', 'model': 'qwen', 'public': self.info, 'candidate': None,
                       'trace': {'run_id': 'medium__abcdefg', 'trajectory': {'path': str(self.root / 'trace/trajectory.json')}}}
        self.private = {'runs': {self.info['id']: self.record}}

    def save(self, name, value):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(value))

    def test_exact_provenance_binds_archive_and_public_download_without_local_paths(self):
        report = attach(self.public, self.private, self.root)
        self.assertEqual(report['agent_bindings'], 1)
        self.assertEqual(self.record['candidate']['candidate']['archive_sha256'], self.sha)
        self.assertEqual(self.record['candidate']['candidate']['archive_root'], 'repo/')
        self.assertTrue(self.info['code'])
        self.assertIn('/resolve/' + 'a' * 40 + '/', self.info['website_artifact']['url'])
        self.assertNotIn(str(self.root), json.dumps(self.public))

    def test_another_selected_run_does_not_replace_existing_candidate(self):
        old = self.record['candidate'] = {'id': 'existing-verified-export'}
        self.save('trace/path-layout.json', {'destination': self.destination, 'source_run': 'another-run'})
        report = attach(self.public, self.private, self.root)
        self.assertEqual(report['agent_bindings'], 0)
        self.assertIs(self.record['candidate'], old)
        self.assertEqual(len(report['mismatches']), 1)

    def test_incomplete_download_cannot_be_imported(self):
        self.save('download-progress.json', {'complete': False, 'revision': 'a' * 40})
        with self.assertRaises(ValueError):
            attach(self.public, self.private, self.root)

    def test_replay_checks_archive_hash_and_uses_a_distinct_cache(self):
        attach(self.public, self.private, self.root)
        runtime = ReplayRuntime.__new__(ReplayRuntime)
        runtime.cache = self.root / 'cache'
        runtime.cache.mkdir()
        runtime.extract_lock = threading.Lock()
        runtime.store = SimpleNamespace(bundles=SimpleNamespace(prepare=lambda _: None))
        stale = runtime.cache / self.info['id']
        stale.mkdir()
        (stale / '.complete').write_text('old export')
        result = runtime.extract(self.record['candidate'], self.info['id'])
        self.assertNotEqual(result, stale)
        self.assertEqual((result / 'server.py').read_text(), 'print("recorded website")')
        self.record['candidate']['candidate']['archive_sha256'] = 'f' * 64
        with self.assertRaisesRegex(ValueError, 'SHA256'):
            runtime.extract(self.record['candidate'], self.info['id'])

    def test_large_project_assets_are_shared_while_entry_scripts_remain_writable(self):
        source, output = self.root / 'large-project', self.root / 'working-copy'
        (source / 'assets').mkdir(parents=True)
        (source / 'assets/site.css').write_text('body{}')
        (source / 'server.py').write_text('original entry point')
        with (source / 'large.db').open('wb') as f:
            f.truncate(9 * 1024 * 1024)
        subprocess.run([sys.executable, '-c', SPARSE_COPY, str(source), str(output)], check=True)
        self.assertTrue((output / 'assets').is_symlink())
        self.assertTrue((output / 'large.db').is_symlink())
        self.assertFalse((output / 'server.py').is_symlink())
        (output / 'server.py').write_text('runtime wrapper')
        self.assertEqual((source / 'server.py').read_text(), 'original entry point')
        self.assertEqual((output / 'assets/site.css').read_text(), 'body{}')

    def test_node_reference_plain_completion_marker_still_allows_size_detection(self):
        source = self.root / 'node-reference'
        source.mkdir()
        (source / '.complete').write_text('reference-build-key')
        (source / 'server.js').write_text('node server')
        self.assertEqual(source_bytes(source), len('reference-build-keynode server'))

    def test_retained_reference_build_preserves_compiled_paths_and_rejects_traversal(self):
        bundle = self.root / 'standalone.tar.gz'
        with tarfile.open(bundle, 'w:gz') as tar:
            raw = b'compiled reference'
            entry = tarfile.TarInfo('dist/standalone/server.js'); entry.size = len(raw)
            tar.addfile(entry, io.BytesIO(raw))
        destination = self.root / 'saved/notion'
        self.assertEqual(saved_build(bundle, destination), (1, len(raw)))
        self.assertEqual((destination / 'dist/standalone/server.js').read_bytes(), raw)
        with tarfile.open(bundle, 'w:gz') as tar:
            entry = tarfile.TarInfo('../escape'); entry.size = len(raw)
            tar.addfile(entry, io.BytesIO(raw))
        with self.assertRaises(ValueError):
            saved_build(bundle, destination)
        self.assertFalse((destination.parent / 'escape').exists())


if __name__ == '__main__':
    unittest.main()
