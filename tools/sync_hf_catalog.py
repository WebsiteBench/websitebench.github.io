"""Import verified site exports from one immutable HF catalog revision."""
import argparse
import hashlib
import json
from pathlib import Path
import re
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
REPO = 'TIGER-Lab/WebsiteBenchArtifacts'


def sync(revision, local=None):
    if not re.fullmatch('[a-f0-9]{40}', revision):
        raise ValueError('Use an immutable 40-character HF commit hash')
    base = f'https://huggingface.co/datasets/{REPO}/resolve/{revision}/'

    def fetch(name):
        return (local / name).read_bytes() if local else urlopen(base + name, timeout=60).read()

    manifest_bytes = fetch('manifest-v2.json')
    manifest = json.loads(manifest_bytes)
    assert manifest['schema_version'] == 2
    expected = {'waffle.json', 'task-materials.json', 'waffle-1m.csv', 'waffle-200k.csv'}
    current_exports = {'cohort.json', 'score-gaps.json', 'leaderboard.json', 'leaderboard-views.json', 'leaderboard.csv',
                       'leaderboard-overview.csv', 'leaderboard-1m.csv', 'leaderboard-200k.csv'}
    assert expected <= set(manifest['site_sha256']) <= expected | {'waffle-overview.csv'} | current_exports
    contents = {}
    for name, digest in manifest['site_sha256'].items():
        payload = fetch('site/' + name)
        assert hashlib.sha256(payload).hexdigest() == digest, 'HF catalog checksum mismatch: ' + name
        contents[name] = payload
    waffle = json.loads(contents['waffle.json'])
    assert len(waffle['models']) == 9
    if 'cohort.json' in contents:
        assert current_exports <= contents.keys()
        cohort = json.loads(contents['cohort.json'])
        ids = {t['id'] for t in cohort['tasks']}
        assert len(ids) == 70 and {t['id'] for t in waffle['tasks']} == ids
        assert {t['id'] for t in json.loads(contents['task-materials.json'])['tasks']} == ids
    else:
        assert len(waffle['tasks']) == 74
    if waffle.get('default_view') == 'overview':
        assert 'waffle-overview.csv' in contents
    # Verify every file before changing any checked-in website data.
    for name, payload in contents.items():
        temporary = ROOT / 'data' / (name + '.tmp')
        temporary.write_bytes(payload)
        temporary.replace(ROOT / 'data' / name)
    source = dict(repository=REPO, revision=revision, manifest_sha256=hashlib.sha256(manifest_bytes).hexdigest(), files=manifest['site_sha256'])
    (ROOT / 'data/unified-source.json').write_text(json.dumps(source, indent=2) + '\n')
    return source


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--revision', required=True)
    parser.add_argument('--local', type=Path, help='Read the exact verified release files locally instead of downloading them')
    args = parser.parse_args()
    print(json.dumps(sync(args.revision, args.local)))
