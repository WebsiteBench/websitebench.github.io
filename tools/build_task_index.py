#!/usr/bin/env python3
"""Export a small task browser index from the verified material ledger.

The public index contains identities, availability and published score citations.
Private filesystem paths and the large payloads stay in --private-index.
No highest-score selection: contexts remain distinct, and none is called final.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
ALIASES = dict(zip(('claude-opus-5-5', 'claude-opus-5', 'gpt-5.6-luna', 'grok-4.6',
                   'glm-5.3-flash', 'kimi-k3', 'deepseek-v4.1-flash', 'qwen3.8-max', 'gpt-6.1-sol'),
                  ('opus55', 'opus5', 'luna', 'grok', 'glm', 'kimi', 'deepseek', 'qwen', 'sol61')))


def key(value):
    return hashlib.sha256(value.encode()).hexdigest()[:24]


def context_key(value):
    value = str(value).lower()
    match = re.search(r'(\d+(?:\.\d+)?)\s*([mk])', value)
    return float(match[1]) * (1000 if match[2] == 'm' else 1) if match else 0


def build(master_path, private_path, website_artifacts=None, export_legacy_public=False):
    ledger = json.loads(master_path.read_text())
    old = json.loads((ROOT / 'data/task-catalog.json').read_text())
    names = {t['id']: t['name'] for t in old['tasks']}
    names['untappd'] = 'Untappd'
    previous = {m['id']: m for m in old['models']}
    models = []
    for model in ledger['models']:
        alias = ALIASES[model['id']]
        item = dict(previous.get('sol' if alias == 'sol61' else alias, {}))
        item.update(id=alias, source_id=model['id'])
        if alias == 'sol61':
            item.update(name='GPT 6.1 Sol', short='GPT 6.1 Sol')
        models.append(item)
    public = {'version': 1, 'updated': ledger['generated_at'], 'models': models, 'tasks': [],
              'score_source': 'WebsiteBenchHarbor (2).xlsx / run_result_clean',
              'selection_note': 'Recorded contexts are browsable separately; no run is designated final.'}
    private = {'version': 1, 'runs': {}, 'tasks': ledger['tasks']}
    rows = {(r['task'], r['model']): r for r in ledger['rows']}
    for task in ledger['tasks']:
        views = next((t['views'] for t in old['tasks'] if t['id'] == task), [])
        task_public = {'id': task, 'name': names.get(task, task), 'views': views, 'models': {}}
        for model, alias in ALIASES.items():
            row = rows[(task, model)]
            all_runs = row['runs']
            code_runs = [r for r in all_runs if r.get('candidate', {}).get('code_file_count', 0)
                         and not r.get('assisted') and r.get('variant') != 'repaired'
                         and r.get('candidate_variant') != 'repaired']
            traces = [r for r in all_runs if r.get('kind') == '主归档'
                      and Path(r.get('trajectory', {}).get('path', '')).is_file()]
            # The remaining models have actual ATIFs in the opened archive.
            if not traces:
                candidates = [r for r in all_runs if r.get('trajectory', {}).get('archive_members')
                              and not r.get('assisted') and r.get('variant') != 'repaired'
                              and r.get('candidate_variant') != 'repaired']
                # Prefer the hash-bound recovery record, then original generation.
                recovery = next((r for r in all_runs if r['id'].startswith('luna-recovery:')), None)
                chosen = next((r for r in candidates if recovery and r['id'] == recovery.get('verified_by_bulk_run')), None)
                chosen = chosen or next((r for r in candidates if r['id'].startswith('grok-opened:') and r.get('variant') == 'original'), None)
                if chosen or candidates:
                    traces = [chosen or candidates[0]]
            recorded = []
            for trace in traces:
                fingerprint = trace.get('trajectory', {}).get('sha256') or trace.get('source_trajectory_sha256') or trace.get('source_revision') or trace.get('source', '')
                uid = key(trace['id'] + ':' + fingerprint)
                binding = next((r for r in code_runs if r['id'] == trace['id']), None)
                binding = binding or next((r for r in code_runs if r['id'] == trace.get('verified_by_bulk_run')), None)
                if not binding and model == 'gpt-5.6-luna':
                    recovery = next((r for r in all_runs if r['id'].startswith('luna-recovery:')), {})
                    candidate_source = recovery.get('candidate', {}).get('source')
                    binding = next((r for r in code_runs if candidate_source and r.get('source') == candidate_source), None)
                rid = trace.get('run_id')
                if not binding and rid and len(rid) > 6:
                    binding = next((r for r in code_runs if rid in r.get('source', '')
                                    or any(rid in p for p in r.get('candidate', {}).get('sample_files', []))), None)
                if not binding and len(traces) == 1:
                    # A published row may have one unambiguous original artifact.
                    def artifact_identity(run):
                        files = run.get('candidate', {}).get('sample_files', [])
                        first = files[0] if files else ''
                        root = first.split('artifacts/app/repo/')[0] + 'artifacts/app/repo/' if 'artifacts/app/repo/' in first else first.rsplit('/', 1)[0]
                        archive = run.get('trajectory', {}).get('path', '').split('::')[0]
                        return (archive, root)
                    artifacts = {artifact_identity(r) for r in code_runs}
                    if len(artifacts) == 1:
                        binding = code_runs[0]
                context = trace.get('context') or 'Context not recorded'
                scores = []
                for sheet in row.get('clean_sheet_rows', []):
                    if sheet.get('score') and (len(traces) == 1 or
                        abs(context_key(sheet.get('context')) - context_key(context)) < 15):
                        scores.append({'value': sheet['score'], 'cell': sheet['cell'],
                                       'context': sheet.get('context'), 'source': 'run_result_clean',
                                       'verified': bool(sheet.get('score_verified'))})
                info = {'id': uid, 'context': context, 'run_id': rid,
                        'steps': trace.get('trajectory', {}).get('steps'),
                        'bytes': trace.get('trajectory', {}).get('bytes'),
                        'source': trace.get('source'), 'scores': scores,
                        'score_note': 'repaired candidate' if row.get('evaluation_review', {}).get('status') == 'current_repaired' else None,
                        'code': bool(binding), 'final': False}
                recorded.append(info)
                private['runs'][uid] = {'public': info, 'task': task, 'model': alias,
                                        'trace': trace, 'candidate': binding}
            recorded.sort(key=lambda r: (-context_key(r['context']), r['id']))
            task_public['models'][alias] = {'runs': recorded,
                'code': bool(code_runs), 'scores': row.get('score_values', [])}
        public['tasks'].append(task_public)
    if website_artifacts:
        from website_artifacts import attach
        artifact_report = attach(public, private, website_artifacts)
        print(json.dumps({'website_artifacts': artifact_report}))
    from annotation_scores import attach as attach_annotation_scores
    print(json.dumps({'cell_note_scores': attach_annotation_scores(public)}))
    if not export_legacy_public:
        current = json.loads((ROOT / 'data/task-materials.json').read_text())
        current_runs = {r['id']: r for t in current['tasks'] for m in t['models'].values() for r in m['runs']}
        for uid, recording in private['runs'].items():
            if uid in current_runs:
                recording['public'] = current_runs[uid]
    private_path.parent.mkdir(parents=True, exist_ok=True)
    temporary = private_path.with_suffix('.tmp')
    temporary.touch(mode=0o600, exist_ok=True)
    temporary.chmod(0o600)
    temporary.write_text(json.dumps(private, ensure_ascii=False))
    temporary.replace(private_path)
    if export_legacy_public:
        destination = ROOT / 'data/task-materials.json'
        temporary = destination.with_suffix('.tmp')
        temporary.write_text(json.dumps(public, ensure_ascii=False, separators=(',', ':')) + '\n')
        temporary.replace(destination)
    print(json.dumps({'tasks': len(public['tasks']), 'models': len(models),
                      'recorded_contexts': len(private['runs']),
                      'pairs_with_trace': sum(bool(m['runs']) for t in public['tasks'] for m in t['models'].values()),
                      'pairs_with_code': sum(m['code'] for t in public['tasks'] for m in t['models'].values())}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--master', type=Path, required=True)
    parser.add_argument('--private-index', type=Path, required=True)
    parser.add_argument('--website-artifacts', type=Path, help='A fully downloaded and verified website artifact repository')
    parser.add_argument('--export-legacy-public', action='store_true', help='Reproduce the archived pre-HF public index; current website data uses sync_hf_catalog.py')
    args = parser.parse_args()
    build(args.master, args.private_index, args.website_artifacts, args.export_legacy_public)
