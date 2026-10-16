#!/usr/bin/env python3
"""Export published per-context scores from the same ledger as the task browser.

Scores do not depend on whether a trace has been downloaded. Missing scores stay
missing; contexts are never averaged, maximized, or called final selections.
"""
import argparse
import csv
import hashlib
import json
from pathlib import Path
import re

from build_task_index import ALIASES, context_key

ROOT = Path(__file__).resolve().parents[1]
VARIABLE_MODELS = {'glm', 'deepseek', 'qwen'}


def context_id(value):
    size = context_key(value)
    return '1m' if size == 1000 else '200k' if size == 200 else 'recorded'


def score_record(sheet):
    context = context_id(sheet.get('context'))
    comments = sheet.get('comments', {})
    record = {'context': context, 'label': sheet.get('context') or 'Recorded context',
              'cell': sheet['cell'], 'value': sheet.get('score'), 'status': 'missing'}
    # These are source annotations about withdrawn scores, not commands. Preserve
    # the citation and the correction instead of plotting the retracted value.
    if '恢复原有 200k 行归属' in comments.get('F', ''):
        record.update(context='200k', label='200K', status='withdrawn',
                      note='Source comment withdraws this score: the scored artifact used 1M, not 200K.')
        return record
    if '上下文待确认' in comments.get('F', ''):
        record.update(context_unverified=True,
                      note='The source does not verify a context limit for this evaluation.')
    value = str(sheet.get('score') or '')
    if value:
        match = re.fullmatch(r'(\d+)/(\d+)', value)
        if match and 0 <= int(match[1]) <= int(match[2]) and int(match[2]) > 0:
            record.update(status='scored', passed=int(match[1]), total=int(match[2]))
        else:
            record.update(status='invalid', note='The source cell does not contain a valid passed/total fraction.')
    return record


def select_record(records, context, variable):
    """Select an explicit context, retaining conflicts rather than picking a score."""
    candidates = [r for r in records if not variable or r['context'] == context]
    scored = [r for r in candidates if r['status'] == 'scored']
    distinct = {(r['passed'], r['total']) for r in scored}
    if len(distinct) > 1:
        return {'status': 'conflict', 'cells': [r['cell'] for r in candidates]}
    if scored:
        return dict(scored[0], cells=[r['cell'] for r in scored])
    if candidates:
        chosen = next((r for r in candidates if r['status'] in ('withdrawn', 'invalid')), candidates[0])
        return dict(chosen, cells=[r['cell'] for r in candidates])
    return {'status': 'missing', 'cells': []}


def build(ledger, materials):
    assert len(ledger['tasks']) == 74 and len(ledger['rows']) == 666
    assert {m['source_id'] for m in materials['models']} == set(ALIASES)
    catalog = {t['id']: t for t in materials['tasks']}
    rows = {(r['task'], r['model']): r for r in ledger['rows']}
    models = [dict(m, variable_context=m['id'] in VARIABLE_MODELS) for m in materials['models']]
    result = {'version': 1, 'updated': ledger['generated_at'],
              'source': {'workbook': 'WebsiteBenchHarbor (2).xlsx', 'sheet': 'run_result_clean'},
              'models': models, 'tasks': []}
    for task_id in ledger['tasks']:
        task = catalog[task_id]
        exported = {'id': task_id, 'name': task['name'], 'results': {}}
        for model in models:
            row = rows[(task_id, model['source_id'])]
            records = [score_record(s) for s in row['clean_sheet_rows']]
            # Repaired-score provenance belongs to this pair, not to unrelated runs.
            repaired = row.get('evaluation_review', {}).get('status') == 'current_repaired'
            by_context = {}
            contexts = ('1m', '200k') if model['variable_context'] else ('recorded',)
            for context in contexts:
                selected = select_record(records, context, model['variable_context'])
                runs = task['models'][model['id']]['runs']
                matches = [r for r in runs if not model['variable_context'] or context_id(r['context']) == context]
                # Bind only a unique matching trace; never guess among runs.
                if len(matches) == 1:
                    selected['run'] = matches[0]['id']
                if repaired and selected['status'] == 'scored':
                    selected['repaired'] = True
                by_context[context] = selected
            exported['results'][model['id']] = {'contexts': by_context, 'records': records}
        result['tasks'].append(exported)
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--master', type=Path, required=True)
    parser.add_argument('--materials', type=Path, default=ROOT / 'data/task-materials.json')
    parser.add_argument('--workbook', type=Path)
    args = parser.parse_args()
    data = build(json.loads(args.master.read_text()), json.loads(args.materials.read_text()))
    if args.workbook:
        data['source']['sha256'] = hashlib.sha256(args.workbook.read_bytes()).hexdigest()
    (ROOT / 'data/waffle.json').write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n')
    for context in ('1m', '200k'):
        with (ROOT / f'data/waffle-{context}.csv').open('w', newline='') as stream:
            writer = csv.writer(stream, lineterminator='\n')
            writer.writerow(['task', 'website', 'model', 'context', 'passed', 'total', 'pass_rate_pct', 'status', 'source', 'note'])
            for task in data['tasks']:
                for model in data['models']:
                    entry = task['results'][model['id']]['contexts'][context if model['variable_context'] else 'recorded']
                    scored = entry['status'] == 'scored'
                    writer.writerow([task['id'], task['name'], model['name'],
                                     context.upper() if model['variable_context'] else entry.get('label', 'Recorded context'),
                                     entry.get('passed', ''), entry.get('total', ''),
                                     100 * entry['passed'] / entry['total'] if scored else '', entry['status'],
                                     'run_result_clean!' + ','.join(entry['cells']),
                                     '; '.join(filter(None, [entry.get('note'), 'Score is for a repaired candidate' if entry.get('repaired') else None]))])
        states = [t['results'][m['id']]['contexts'][context if m['variable_context'] else 'recorded']['status']
                  for t in data['tasks'] for m in data['models']]
        print(json.dumps({'context': context, 'tasks': len(data['tasks']), 'models': len(data['models']),
                          'scores': states.count('scored'), 'unscored': len(states) - states.count('scored')}))
