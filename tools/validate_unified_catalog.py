"""Validate the canonical tree before publishing its immutable HF revision."""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path, PurePosixPath
import re

import pyarrow.parquet as pq


def read(path):
    return json.loads(path.read_text())


def validate(root):
    catalog = read(root / 'catalog.json')
    copies = read(root / 'sources/tree-copies.json')
    destinations = {c['destination']: c for c in copies}
    assert len(copies) == len(destinations)
    source_materials = {m['path']: m for m in pq.read_table(root / 'data/materials.parquet').to_pylist()}
    for copy in copies:
        material = source_materials[copy['source']]
        assert (copy['sha256'], copy['bytes']) == (material['sha256'], material['bytes'])
        assert not PurePosixPath(copy['destination']).is_absolute() and '..' not in PurePosixPath(copy['destination']).parts
    pairs = catalog['pairs']
    assert len(pairs) == len({(p['task_id'], p['model_id']) for p in pairs}) == 666
    assert len({p['task_id'] for p in pairs}) == 74 and len({p['model_id'] for p in pairs}) == 9
    note_pairs = set()
    entries = []
    for pair in pairs:
        assert len(pair['contexts']) == len({e['context'] for e in pair['contexts']})
        for entry in pair['contexts']:
            entries.append(entry)
            score = read(root / entry['files']['score'])
            assert entry['score'] == score
            assert (score['task_id'], score['model_id'], score['context']) == (pair['task_id'], pair['model_id'], entry['context'])
            if score['status'] == 'scored':
                assert 0 <= score['passed'] <= score['total'] and score['total'] > 0
                assert score['fraction'] == f"{score['passed']}/{score['total']}"
                assert score['comparable'] and score['metric'] == 'reported_test_pass_fraction'
                assert abs(score['pass_rate'] - score['passed'] / score['total']) < 1e-12
            else:
                assert score['fraction'] is None and score['passed'] is None and score['total'] is None
            for path in entry['files'].values():
                assert (root / path).is_file() or path in destinations, path
            provenance = read(root / entry['directory'] / 'provenance.json')
            if provenance.get('matrix_cell_note'):
                note_pairs.add((pair['task_id'], pair['model_id']))
            for kind, material in provenance['material_integrity'].items():
                assert destinations[entry['files'][kind]]['sha256'] == material['sha256']
            evaluation = score['evaluation_material_id']
            if evaluation:
                material = next(m for m in source_materials.values() if m['id'] == evaluation)
                meta = json.loads(material['evaluation_metadata'])
                assert meta['status'] == 'VALID_RUN' and meta['scorable'] and meta['scoring_version'] == 'equal-case-v1'
                assert meta['score'] == score['fraction']
            if score.get('historical_score_path'):
                assert score['status'] == 'needs_current_evaluation'
                assert read(root / score['historical_score_path'])['fraction'] is not None
    assert len(note_pairs) == 666, len(note_pairs)
    migration = read(root / 'sources/workbook-migration.json')
    assert migration['official_records'] == len(migration['records']) == 959
    assert len(migration['cell_notes']) == 1170
    assert sum(k.startswith('old-Missing traces!') for k in migration['cell_notes']) == 934
    scores = pq.read_table(root / 'data/scores.parquet').to_pylist()
    assert len(scores) == len(entries) and Counter(s['status'] for s in scores) == Counter(e['score_status'] for e in entries)
    waffle = read(root / 'site/waffle.json')
    matrix_counts = {}
    lookup = {(p['task_id'], p['model_id']): p for p in pairs}
    for ctx in ('1m', '200k'):
        states = []
        for task in waffle['tasks']:
            assert len(task['results']) == 9
            for model in waffle['models']:
                value = task['results'][model['id']]['contexts'][ctx if model['variable_context'] else 'recorded']
                states.append(value['status'])
                if value['status'] == 'scored':
                    matching = [e for e in lookup[task['id'], model['source_id']]['contexts'] if e['fraction'] == value['value'] and (not model['variable_context'] or e['context'] == ctx)]
                    assert len(matching) == 1 and matching[0]['score']['comparable']
                    assert value['run'] == matching[0]['recording_id']
        assert len(states) == 666
        matrix_counts[ctx] = dict(Counter(states))
        view_missing = root / f'missing/scores-{ctx}.json'
        if view_missing.is_file():
            assert len(read(view_missing)) == sum(state != 'scored' for state in states)
    forbidden = re.compile(r'\bhf_[A-Za-z0-9]{20,256}\b|\bsk-[A-Za-z0-9_-]{20,256}\b|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|/home/dongfu/|/root/|/tmp/')
    scanned = 0
    for path in root.rglob('*'):
        if not path.is_file():
            continue
        if path.suffix == '.py':
            # Validator source contains the literal forbidden-path patterns.
            # Source code is not a published data value.
            continue
        text = json.dumps(pq.read_table(path).to_pylist(), ensure_ascii=False) if path.suffix == '.parquet' else path.read_text()
        assert not forbidden.search(text), str(path.relative_to(root))
        scanned += 1
    manifest = read(root / 'manifest-v2.json')
    for name, digest in manifest['site_sha256'].items():
        assert hashlib.sha256((root / 'site' / name).read_bytes()).hexdigest() == digest
    return dict(valid=True, official_pairs=666, contexts=len(entries), copied_materials=len(copies), original_matrix_notes_preserved=len(note_pairs),
                score_statuses=dict(Counter(e['score_status'] for e in entries)), matrix=matrix_counts, metadata_files_scanned=scanned)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(validate(args.root)))
