import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

from prepare_reference_sources import prepare


class ReferenceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.repository = self.root / 'repo'
        self.repository.mkdir()
        subprocess.run(['git', 'init', '-q', str(self.repository)], check=True)
        tasks = [f'task-{i}' for i in range(74)]
        self.catalog = self.root / 'catalog.json'
        self.catalog.write_text(json.dumps({'tasks': [{'id': t} for t in tasks]}))
        for task in tasks:
            directory = self.repository / 'websites' / task
            (directory / 'src').mkdir(parents=True)
            (directory / 'website.toml').write_text('image = "python"\n')
            (directory / 'src/server.py').write_text('original code')
        self.source = self.repository / 'websites/task-0/src'
        self.asset = b'<html>real frozen page</html>'
        self.oid = hashlib.sha256(self.asset).hexdigest()
        (self.source / 'home.html').write_text(f'version https://git-lfs.github.com/spec/v1\noid sha256:{self.oid}\nsize {len(self.asset)}\n')
        (self.source / 'style.css').write_text('body { color: black; }')
        subprocess.run(['git', '-C', str(self.repository), 'add', '.'], check=True)
        subprocess.run(['git', '-C', str(self.repository), '-c', 'user.name=Fixture', '-c',
                        'user.email=fixture@example.test', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'fixture'], check=True)
        (self.source / 'home.html').unlink()
        (self.source / 'style.css').unlink()
        (self.source / 'server.py').write_text('local runtime adapter')
        self.object = self.repository / '.git/lfs/objects' / self.oid[:2] / self.oid[2:4] / self.oid
        self.object.parent.mkdir(parents=True)
        self.object.write_bytes(self.asset)

    def tearDown(self):
        self.temp.cleanup()

    def test_restore_lfs_and_missing_files_preserves_checkout_and_adapter(self):
        output = prepare(self.repository, self.catalog, self.root / 'prepared')
        self.assertEqual((output / 'task-0/src/home.html').read_bytes(), self.asset)
        self.assertEqual((output / 'task-0/src/server.py').read_text(), 'local runtime adapter')
        self.assertEqual((output / 'task-0/src/style.css').read_text(), 'body { color: black; }')
        self.assertFalse((self.source / 'home.html').exists())
        self.assertEqual((self.source / 'server.py').read_text(), 'local runtime adapter')
        self.assertEqual(len(json.loads((output / '.snapshot.json').read_text())['tasks']), 74)
        self.assertEqual(prepare(self.repository, self.catalog, self.root / 'prepared'), output)

    def test_corrupt_same_size_lfs_object_cannot_be_approved(self):
        self.object.write_bytes(b'x' * len(self.asset))
        with self.assertRaisesRegex(ValueError, 'hash mismatch'):
            prepare(self.repository, self.catalog, self.root / 'prepared')
        self.assertFalse(list((self.root / 'prepared').glob('*/.snapshot.json')))


if __name__ == '__main__':
    unittest.main()
