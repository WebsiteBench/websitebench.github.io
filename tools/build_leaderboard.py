"""Derive all leaderboard views from the exact canonical Waffle selection.

Scores pool passed/total test counts, following the paper's Table 1 definition.
Missing results are excluded, with coverage shown;
resource/accuracy Pareto coordinates always use the same paired task subset.
"""
import csv
import json
import re
from pathlib import Path
from statistics import mean

from build_unified_catalog import read, write, write_site, fraction

SCORES = {'overall': None, 'request': 'T1', 'browser': 'T2', 'system': 'T3'}
RESOURCES = ('cost', 'tokens', 'turns')


def number(value):
    text = str(value or '').strip().replace(',', '').replace('$', '')
    match = re.fullmatch(r'(\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)\s*([kKmMbB]?)', text)
    if not match:
        return None
    value = float(match[1]) * {'': 1, 'k': 1e3, 'm': 1e6, 'b': 1e9}[match[2].lower()]
    return value if value >= 0 and value < float('inf') else None


def unique(values):
    values = {v for v in values if v is not None}
    return values.pop() if len(values) == 1 else None


def task_record(root, task, model, entry):
    row = dict(task_id=task['id'], model_id=model['id'], context=entry['label'], status=entry['status'],
               source=entry['source_url'], run_id=entry['run'], failure_kind=entry.get('failure_kind'),
               metrics={k: None for k in (*SCORES, *RESOURCES)}, counts={k: None for k in SCORES})
    if entry['status'] != 'scored':
        return row
    path = entry['source_url'].split('/blob/main/', 1)[1]
    score = read(root / path)
    provenance = read(root / Path(path).parent / 'provenance.json')
    row['metrics']['overall'] = 100 * score['passed'] / score['total']
    row['counts']['overall'] = dict(passed=score['passed'], total=score['total'])
    for key, group in SCORES.items():
        value = fraction(score.get('groups', {}).get(group)) if group else None
        if value:
            row['metrics'][key] = 100 * value[0] / value[1]
            row['counts'][key] = dict(passed=value[0], total=value[1])
    # Only resources explicitly published with the selected fraction and context.
    # Old rows, duplicate disagreements, missing usage and trace step counts are
    # never silently used to populate these fields.
    publications = [p for p in provenance.get('current_publications', [])
                    if p['source_cell'] in score['source_cells'] and p['fields'].get('score') == score['fraction']]
    row['resource_sources'] = [dict(source_cell=p['source_cell'], source=p['source_sheet']) for p in publications]
    fields = [p['fields'] for p in publications]
    values = row['metrics']
    values['cost'] = unique(number(f.get('cost (USD)')) for f in fields)
    if model['id'] == 'grok':
        explicit = unique(number(v) for note in score.get('qualifications', []) for v in re.findall(r'官方等价 USD=([\d.]+)', note))
        if explicit is not None:
            values['cost'] = explicit
            row['cost_basis'] = 'source-declared official-price equivalent'
    values['tokens'] = unique((number(f.get('Input tokens')) + number(f.get('Output tokens'))) / 1e6
                              for f in fields if number(f.get('Input tokens')) is not None and number(f.get('Output tokens')) is not None)
    values['turns'] = unique(number(f.get('Turns')) for f in fields)
    row['resource_qualification'] = 'Reported values; published estimates, partial usage and source limitations remain applicable. No missing value is filled with zero.'
    return row


def pool(rows, key):
    known = [r['counts'][key] for r in rows if r['counts'][key] is not None]
    passed, total = sum(c['passed'] for c in known), sum(c['total'] for c in known)
    return dict(passed=passed, total=total, percentage=100 * passed / total if total else None, count=len(known))


def summarize(model, rows, total):
    current = dict(model, group='open' if model['id'] in ('glm', 'kimi', 'deepseek', 'qwen') else 'frontier', total_tasks=total)
    current['coverage'] = {}
    current['score_counts'] = {}
    for key in SCORES:
        pooled = pool(rows, key)
        current[key] = pooled['percentage']
        current['coverage'][key] = pooled['count']
        current['score_counts'][key] = dict(passed=pooled['passed'], total=pooled['total'])
    for key in RESOURCES:
        values = [r['metrics'][key] for r in rows if r['metrics'][key] is not None]
        current[key] = mean(values) if values else None
        current['coverage'][key] = len(values)
    current['costStr'] = f"${current['cost']:.2f}" if current['cost'] is not None else '—'
    labels = sorted({r['context'] for r in rows if r['status'] == 'scored' and r['context'] != 'RECORDED'})
    current['context_label'] = ' / '.join(labels) or 'Recorded'
    current['pareto'] = {}
    for resource in RESOURCES:
        current['pareto'][resource] = {}
        for score in SCORES:
            paired = [r for r in rows if r['metrics'][resource] is not None and r['metrics'][score] is not None]
            pooled = pool(paired, score)
            current['pareto'][resource][score] = dict(resource_mean=mean(r['metrics'][resource] for r in paired) if paired else None,
                score_mean=pooled['percentage'], passed=pooled['passed'], total=pooled['total'], count=len(paired), task_ids=[r['task_id'] for r in paired])
    return current


def build(root):
    root = Path(root)
    waffle = read(root / 'site/waffle.json')
    cohort = read(root / 'sources/cohort.json')
    total = len(cohort['tasks'])
    export = dict(schema_version=2, cohort_id=cohort.get('cohort_id'), total_tasks=total, default_view='overview',
        aggregation='Test-pooled: 100 × sum(passed tests) / sum(total tests), for Overall and each test category. Missing/invalid results are excluded, not zero. Coverage is shown for every metric.',
        score_scope='Current 70-task catalog with updated run/context selections; not the paper Table 1 frozen 74-task snapshot. The paper reports GPT 5.6 Sol; this catalog reports GPT 6.1 Sol.',
        resources='Means of reported resource values bound to the selected score/context; estimates and partial usage remain qualified. Pareto accuracy and resources use the same paired task subset.', views={})
    all_rows = {}
    for view in ('overview', '1m', '200k'):
        records, models = [], []
        for model in waffle['models']:
            rows = [task_record(root, task, model, task['results'][model['id']]['contexts'][view if model['variable_context'] else 'recorded']) for task in waffle['tasks']]
            records.extend(rows)
            models.append(summarize(model, rows, total))
        export['views'][view] = sorted(models, key=lambda m: (-(m['overall'] if m['overall'] is not None else -1), m['name']))
        all_rows[view] = records
        with (root / f'site/leaderboard-{view}.csv').open('w') as stream:
            columns = ['model', 'context', 'tasks', *SCORES, *RESOURCES, *(k + '_coverage' for k in (*SCORES, *RESOURCES))]
            writer = csv.DictWriter(stream, fieldnames=columns, lineterminator='\n'); writer.writeheader()
            for m in export['views'][view]:
                writer.writerow(dict(model=m['name'], context=m['context_label'], tasks=total,
                    **{k:m[k] for k in (*SCORES, *RESOURCES)}, **{k+'_coverage':m['coverage'][k] for k in (*SCORES, *RESOURCES)}))
    write_site(root / 'site/leaderboard-views.json', export)
    write_site(root / 'site/leaderboard.json', export['views']['overview'])
    (root / 'site/leaderboard.csv').write_bytes((root / 'site/leaderboard-overview.csv').read_bytes())
    write(root / 'data/leaderboard-inputs.json', dict(cohort_id=cohort.get('cohort_id'), views=all_rows))
    write(root / 'sources/leaderboard-policy.json', dict(
        aggregation='test_pooled', percentage_formula='100 * sum(passed tests) / sum(total tests)',
        score_categories=SCORES, missing='Exclude missing/invalid records; do not assign zero.',
        resources='Arithmetic mean per task, preserving partial/estimated usage qualifications.',
        pareto='Resource mean and pooled score use the identical paired task subset.',
        active_tasks=total, paper_tasks=74, paper_snapshot_reproduced=False,
        scope=export['score_scope'], inputs='data/leaderboard-inputs.json'))
    return export
