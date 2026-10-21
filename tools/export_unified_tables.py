"""Refresh the published tables and site exports from canonical JSON files.

This operation has no workbook dependency. Download the catalog metadata, edit
the relevant benchmark/.../score.json, and regenerate the derived indexes.
"""
import argparse
from collections import Counter
import csv
import hashlib
import json
from pathlib import Path
import shutil

import pyarrow as pa
import pyarrow.parquet as pq

from build_unified_catalog import export_waffle, read, write, write_site
from build_leaderboard import build as build_leaderboard


def parquet(path, rows):
    keys = list(dict.fromkeys(k for row in rows for k in row))
    pq.write_table(pa.Table.from_pylist([{k: row.get(k) for k in keys} for row in rows]), path, compression='zstd')


def refresh(root, previous):
    catalog = read(root / 'catalog.json')
    pairs = catalog['pairs']
    cohort = read(root / 'sources/cohort.json')
    task_count, model_count = len(cohort['tasks']), len(cohort['models'])
    pair_count = task_count * model_count
    assert len(pairs) == pair_count
    for pair in pairs:
        for entry in pair['contexts']:
            score = read(root / entry['files']['score'])
            assert (score['task_id'], score['model_id'], score['context']) == (entry['task_id'], entry['model_id'], entry['context'])
            entry.update(score=score, score_status=score['status'], fraction=score['fraction'], comparable=score['comparable'], evidence_level=score['evidence_level'])
        pair['scored'] = any(e['score_status'] == 'scored' for e in pair['contexts'])
        write(root / f"benchmark/{pair['task_id']}/{pair['model_id']}/index.json", pair)
    entries = [e for p in pairs for e in p['contexts']]
    summary = catalog['summary']
    summary.update(tasks=task_count, models=model_count, pairs=pair_count, trajectory_pairs=sum(p['trajectory'] for p in pairs), website_pairs=sum(p['website'] for p in pairs), scored_pairs=sum(p['scored'] for p in pairs), score_statuses=dict(Counter(e['score_status'] for e in entries)))
    write(root / 'catalog.json', catalog)
    export_waffle(root, cohort, pairs)
    waffle = read(root / 'site/waffle.json')
    view_coverage = {}
    for context in ('overview', '1m', '200k'):
        missing_scores = []
        for task in waffle['tasks']:
            for model in waffle['models']:
                result = task['results'][model['id']]['contexts'][context if model['variable_context'] else 'recorded']
                if result['status'] != 'scored':
                    missing_scores.append(dict(task_id=task['id'], task=task['name'], model=model['source_id'],
                                               context=result['label'], status=result['status'], failure_kind=result.get('failure_kind'),
                                               reason=result.get('note') or 'No current score bound to this context.', source=result.get('source_url')))
        view_coverage[context] = pair_count - len(missing_scores)
        write(root / f'missing/scores-{context}.json', missing_scores)
    gaps = read(root / 'missing/scores-overview.json')
    write_site(root / 'site/score-gaps.json', gaps)
    gap_text = f'# 当前 {task_count} 题：无有效分数的格子\n\n共 {len(gaps)} 格。浅灰实心格是实际低分或零分；红色是 error，橙色是超时，灰色斜线是无分／待核验。无分不计作零分。\n\n'
    gap_text += '| 题目 | 模型 | 上下文 | 状态 | 原因与来源 |\n|---|---|---|---|---|\n'
    for gap in gaps:
        reason = gap['reason'].split('\n')[0].replace('|', '/')
        gap_text += f"| {gap['task']} | {gap['model']} | {gap['context']} | {gap['failure_kind']} | [{reason}]({gap['source']}) |\n"
    (root / 'missing/score-gaps.md').write_text(gap_text)
    copies = read(root / 'sources/tree-copies.json')
    summary.update(waffle_overview_scored=view_coverage['overview'], waffle_1m_scored=view_coverage['1m'], waffle_200k_scored=view_coverage['200k'], contexts=len(entries),
                   historical_only_scores=sum(e['score_status'] == 'needs_current_evaluation' for e in entries),
                   active_material_aliases=sum(c['destination'].startswith('benchmark/') for c in copies),
                   archived_material_aliases=sum(c['destination'].startswith('history/excluded-tasks/') for c in copies))
    write(root / 'catalog.json', catalog)
    public = read(root / 'site/task-materials.json')
    active_ids = {t['id'] for t in cohort['tasks']}
    public['tasks'] = [t for t in public['tasks'] if t['id'] in active_ids]
    public['cohort_id'] = cohort.get('cohort_id')
    display_models = {m['id']: m for m in waffle['models']}
    display_policy = read(root / 'sources/display-contexts.json')
    for model in public['models']:
        model['default_context'] = display_models[model['id']]['default_context']
    aliases = {m['source_id']: m['id'] for m in public['models']}
    tasks = {t['id']: t for t in public['tasks']}
    for pair in pairs:
        model = tasks[pair['task_id']]['models'][aliases[pair['model_id']]]
        model['display_context'] = display_policy.get('task_overrides', {}).get(pair['model_id'], {}).get(pair['task_id'], display_policy['contexts'].get(pair['model_id'], 'recorded'))
        model['scores'] = list(dict.fromkeys(e['fraction'] for e in pair['contexts'] if e['fraction']))
        for run in model['runs']:
            entry = next((e for e in pair['contexts'] if e['recording_id'] == run['id']), None)
            run['scores'] = [dict(value=entry['fraction'], context=entry['context'], source='HF canonical catalog', cell='',
                                  source_url=f"https://huggingface.co/datasets/{catalog['repo_id']}/blob/main/{entry['files']['score']}",
                                  verified=entry['evidence_level'] != 'published_declaration')] if entry and entry['fraction'] else []
    write_site(root / 'site/task-materials.json', public)
    data = root / 'data'
    data.mkdir(exist_ok=True)
    current_scores = []
    coverage = []
    for pair in pairs:
        for entry in pair['contexts']:
            current_scores.append(dict(entry['score'], score_path=entry['files']['score']))
        coverage.append(dict(task_id=pair['task_id'], task_name=pair['task_name'], model_id=pair['model_id'], model_name=pair['model_name'],
                             trajectory_found=pair['trajectory'], website_found=pair['website'], has_published_score=pair['scored'],
                             metadata_path=f"benchmark/{pair['task_id']}/{pair['model_id']}/index.json"))
        detail = read(previous / f"pairs/{pair['task_id']}/{pair['model_id']}/index.json")
        detail.setdefault('historical_publications', detail.get('published_scores', []))
        detail['published_scores'] = [e['score'] for e in pair['contexts']]
        detail['pair'].update(has_published_score=pair['scored'], score_values=[e['fraction'] for e in pair['contexts'] if e['fraction']], canonical_path=coverage[-1]['metadata_path'])
        detail['pair']['missing_reason'] = '; '.join(text for key, text in [('trajectory', 'No baseline trace located'), ('website', 'No baseline website code located'), ('scored', 'No current valid published score')] if not pair[key])
        detail['score_policy'] = 'Current canonical JSON scores; original publications retained as history. Latest explicit invalid/closed results withdraw stale scores. Empty placeholder rows do not withdraw existing publications.'
        write(root / detail['pair']['metadata_path'], detail)
    parquet(data / 'scores.parquet', current_scores)
    parquet(data / 'pairs.parquet', coverage)
    for name in ('coverage', 'missing-materials', 'missing-scores'):
        selected = coverage if name == 'coverage' else [p for p in coverage if not p['has_published_score']] if name == 'missing-scores' else [p for p in coverage if not p['trajectory_found'] or not p['website_found']]
        with (data / f'{name}.csv').open('w') as stream:
            writer = csv.DictWriter(stream, fieldnames=list(coverage[0]), lineterminator='\n')
            writer.writeheader()
            writer.writerows(selected)
    by_model = []
    for model in cohort['models']:
        selected = [p for p in pairs if p['model_id'] == model['source_id']]
        by_model.append(dict(model=model['name'], tasks=task_count, trajectories=sum(p['trajectory'] for p in selected), websites=sum(p['website'] for p in selected), published_scores=sum(p['scored'] for p in selected)))
    with (data / 'coverage-by-model.csv').open('w') as stream:
        writer = csv.DictWriter(stream, fieldnames=list(by_model[0]), lineterminator='\n')
        writer.writeheader()
        writer.writerows(by_model)
    task_rows = []
    for task in cohort['tasks']:
        selected = [p for p in coverage if p['task_id'] == task['id']]
        old = read(previous / f"tasks/{task['id']}/index.json")
        old['task'].update(pairs_with_published_score=sum(p['has_published_score'] for p in selected))
        for p in old['pairs']:
            current = next(r for r in selected if r['model_id'] == p['model_id'])
            p['has_published_score'] = current['has_published_score']
        write(root / f"tasks/{task['id']}/index.json", old)
        task_rows.append(old['task'])
    parquet(data / 'tasks.parquet', task_rows)
    # Payload and provenance tables are unchanged; the original claims remain
    # downloadable as history rather than appearing as current blank scores.
    for name in ('recordings', 'materials', 'observations'):
        if previous.resolve() != root.resolve():
            shutil.copyfile(previous / f'data/{name}.parquet', data / f'{name}.parquet')
    history = root / 'history'
    history.mkdir(exist_ok=True)
    if not (history / 'previous-score-publications.parquet').is_file():
        shutil.copyfile(previous / 'data/scores.parquet', history / 'previous-score-publications.parquet')
    if not (history / 'previous-catalog-readme.md').is_file():
        shutil.copyfile(previous / 'README.md', history / 'previous-catalog-readme.md')
    status = read(previous / 'status.json')
    status.pop('complete', None)
    status.update(schema_version='2.0.0', pairs_with_published_scores=summary['scored_pairs'], published_score_rows=len(current_scores), canonical_summary=summary,
                  phase='catalog_ready', catalog_ready=True, all_located_materials_uploaded=True,
                  cohort_complete=all(p['trajectory'] and p['website'] and p['scored'] for p in pairs),
                  score_authority=dict(path='benchmark/**/score.json', catalog='catalog.json', migration='sources/workbook-migration.json', policy='Canonical versioned JSON; the workbook is retained only as migration provenance.'))
    write(root / 'status.json', status)
    write(root / 'sources/score-authority.json', status['score_authority'])
    write(root / 'manifest.json', dict(version=2, catalog='catalog.json', status='status.json', root='benchmark', site='site',
                                     tables={n: f'data/{n}.parquet' for n in ('pairs', 'tasks', 'recordings', 'scores', 'materials', 'observations')},
                                     integrity='SHA256SUMS', migration='sources/workbook-migration.json'))
    missing = dict(trajectories='trajectory', websites='website')
    for name, kind in [('missing-trajectories', 'trajectory'), ('missing-websites', 'website'), ('missing-evaluations', 'evaluation')]:
        write(root / f'missing/{name}.json', [dict(task=e['task_id'], model=e['model_id'], context=e['context'], status=e['score_status'], directory=e['directory']) for e in entries if kind in e['missing'] and (kind != 'evaluation' or e['fraction'])])
    write(root / 'missing/unscored.json', [dict(task=e['task_id'], model=e['model_id'], context=e['context'], status=e['score_status'], directory=e['directory']) for e in entries if e['score_status'] != 'scored'])
    for name, key in missing.items():
        write(root / f'missing/{name}.json', [dict(task_id=p['task_id'], task=p['task_name'], model=p['model_id'], directories=[e['directory'] for e in p['contexts']], action='Locate and publish the original material; do not substitute another context.') for p in pairs if not p[key]])
    write(root / 'missing/scores.json', [dict(task_id=p['task_id'], task=p['task_name'], model=p['model_id'], contexts=[dict(context=e['context'], status=e['score_status'], qualifications=e['score']['qualifications']) for e in p['contexts']]) for p in pairs if not p['scored']])
    (root / 'missing/README.md').write_text('# 缺失与无分清单\n\n'
        '- [当前空格的原因，逐格查看](score-gaps.md)。\n'
        f'- [Waffle 默认总览缺分](scores-overview.json)：{pair_count-view_coverage["overview"]} 格，与网页空格逐一对应。Qwen 显示已汇报的 200K 运行；各列标明实际上下文。\n'
        f'- [仅看 1M 时的缺分](scores-1m.json)：{pair_count-view_coverage["1m"]} 格，不能据此断言模型没有成绩。\n'
        f'- [Waffle 200K 视图缺分](scores-200k.json)：{pair_count-view_coverage["200k"]} 格。\n'
        '- [缺轨迹](trajectories.json)、[缺网站代码](websites.json)：按题目与模型列出。\n'
        '- [所有上下文都无有效分数](scores.json)：同一模型在其他上下文有分数时，不会进入这张表。\n\n'
        '缺文件与无有效分数是不同情况。无分记录会保留无效、已结案、仅有旧版等原因，不等于要求重新生成网站。\n')
    task_overview = f'# WebsiteBench: {task_count} tasks × {model_count} models\n\n| Task | Traces | Websites | Current scores |\n|---|---:|---:|---:|\n'
    for task in cohort['tasks']:
        selected = [p for p in pairs if p['task_id'] == task['id']]
        task_url = f"https://huggingface.co/datasets/{catalog['repo_id']}/tree/main/benchmark/{task['id']}"
        task_overview += f"| [{task['name']}]({task_url}) | {sum(p['trajectory'] for p in selected)}/{model_count} | {sum(p['website'] for p in selected)}/{model_count} | {sum(p['scored'] for p in selected)}/{model_count} |\n"
        text = f"# {task['name']}\n\n| Model | Trace | Website | Current published fractions by context |\n|---|---|---|---|\n"
        for pair in selected:
            url = task_url + '/' + pair['model_id']
            scores = '; '.join(e['context'] + ': ' + (e['fraction'] or e['score_status']) for e in pair['contexts'])
            text += f"| [{pair['model_name']}]({url}) | {'✓' if pair['trajectory'] else 'MISSING'} | {'✓' if pair['website'] else 'MISSING'} | {scores} |\n"
        (root / 'benchmark' / task['id'] / 'README.md').write_text(text)
    (root / 'benchmark/README.md').write_text(task_overview)
    copied_paths = {c['destination'] for c in copies}
    original_sums = ''.join(line + '\n' for line in (previous / 'SHA256SUMS').read_text().splitlines()
                            if '  benchmark/' not in line and line.split('  ', 1)[1] not in copied_paths)
    (root / 'SHA256SUMS').write_text(original_sums + ''.join(c['sha256'] + '  ' + c['destination'] + '\n' for c in read(root / 'sources/tree-copies.json')))
    card = '---\nlanguage: [en, zh]\nconfigs:\n'
    for name in ('pairs', 'tasks', 'recordings', 'scores', 'materials', 'observations'):
        card += f'- config_name: {name}\n' + ('  default: true\n' if name == 'pairs' else '') + f'  data_files: data/{name}.parquet\n'
    card += f'\n---\n\n# WebsiteBench\n\n{task_count} tasks × {model_count} models. **Start in [benchmark/](https://huggingface.co/datasets/TIGER-Lab/WebsiteBenchArtifacts/tree/main/benchmark).** Only the current evaluation protocol contributes scores. The versioned JSON files are the current catalog; Excel is no longer a runtime or update dependency.\n\n'
    card += '```text\nbenchmark/<task>/<model>/<context>/\n  score.json                 # published score, metric and verification level\n  trajectory.tar.zst         # ATIF + referenced images\n  website.tar.gz             # generated website (.tar.zst for normalized exports)\n  reference.tar.gz           # exact bound reference, when available\n  evaluation.json.zst         # valid raw evaluation matching the published fraction\n  provenance.json            # run identity, hashes, limitations and prior claims\n```\n\n'
    card += 'An absent material has a **`trajectory.MISSING.json`**, **`website.MISSING.json`**, or **`evaluation.MISSING.json`** in the same folder. A run without a valid score has **`score.UNSCORED.json`**, including the reason. These markers contain no fabricated scores. Different contexts stay in separate folders; folder count is not the number of independent runs.\n\n'
    card += '**200K / 1M are reported context-window settings:** approximately 200,000 / 1,000,000 tokens. They are separate run configurations, independent of the evaluation protocol. A larger context does not guarantee a higher score. A published context label does not by itself verify the runtime limit; configuration limitations remain in each run’s provenance.\n\n'
    card += 'The active cohort excludes **Untappd, RoomSketcher, Workable and edX** for the recorded task/evaluation problems. All four tasks and their materials are preserved under [history/excluded-tasks/](history/excluded-tasks); they contribute to no current score, ranking, plot or coverage count. The exact 70-task list is [sources/cohort.json](sources/cohort.json).\n\n'
    card += '## What needs attention\n\n- [Missing trajectories](missing/trajectories.json) — task/model pairs without a located baseline trace.\n- [Missing website code](missing/websites.json) — task/model pairs without bound baseline code.\n- [No current valid score](missing/scores.json) — includes closed or invalid evaluations; this does not automatically call for a rerun.\n- [Context-level missing materials](missing/missing-trajectories.json) and [unscored contexts](missing/unscored.json) keep context restrictions visible.\n- [One-page coverage](data/coverage-by-model.csv) and [all active pairs](data/coverage.csv).\n\n'
    card += f'The default [Overview missing-score list](missing/scores-overview.json) has {pair_count-view_coverage["overview"]} cells. Overview uses explicit per-model display contexts from [display-contexts.json](sources/display-contexts.json): Qwen uses its reported 200K run; GLM/DeepSeek retain their 1M browsing defaults. Eight explicitly listed GLM tasks use their available 200K publication, as requested; all other GLM selections use the 1M default. No maximum-score selection is used. Mixed columns and individual cells show actual contexts. The [1M-only list](missing/scores-1m.json) ({pair_count-view_coverage["1m"]} cells) and [200K-only list](missing/scores-200k.json) ({pair_count-view_coverage["200k"]} cells) are context-specific comparisons, not a model-wide missing-score claim. The model summary below counts a score in **any** recorded context.\n\n'
    if (root / 'sources/qwen-200k-book1-audit.json').is_file():
        card += '[Book1 Qwen reconciliation](sources/qwen-200k-book1-audit.json) preserves the original 74-task audit: 71 published 200K fractions match the canonical score files; Apple, RoomSketcher and Untappd have no published valid fraction. The blank model-name cell for Apple is explicitly attributed to this single-model sheet.\n\n'
    card += '| Model | Traces | Websites | Published scores (any context) |\n|---|---:|---:|---:|\n'
    for model in by_model:
        card += f"| {model['model']} | {model['trajectories']}/{task_count} | {model['websites']}/{task_count} | {model['published_scores']}/{task_count} |\n"
    card += '\n## Leaderboard\n\n[Table/Pareto data](site/leaderboard-views.json) is recalculated from the exact same 70-task/context selection as Waffle. Overall and T1/T2/T3 pool test counts: 100 × sum(passed) / sum(total); missing/invalid results are not zero. Every metric includes its coverage. Reported resource means preserve estimates/partial-usage qualifications. Resource means and test-pooled Pareto scores use the same task subset. This updated 70-task catalog is not the frozen 74-task Table 1 snapshot. The auditable per-task inputs are in [data/leaderboard-inputs.json](data/leaderboard-inputs.json).\n\n'
    card += '\n## Reading scores\n\n`score.json` separates the reported fraction, T1/T2/T3, scoring protocol, exact recording ID, and evidence level. `published_declaration` means a current source reports the score; `matching_valid_evaluation` means a valid equal-case-v1 evaluation matches it; `selected_run_and_cases_verified` also checks explicit selection and case identities. Duplicate copies of the same evaluation are one piece of score evidence. Original 1000-case / functional-only scores and earlier publications without verified new-protocol evidence live in `history/benchmark/`, never in current score fields or Waffle. Their current folder is marked `needs_current_evaluation`. A missing score is never zero. All recorded raw evaluations, including invalid/old ones, remain separately labelled under `evaluations/`; `evaluation.json.zst` is specifically a valid new-protocol evaluation matching the current fraction.\n\n'
    card += 'The final migration reads all 1,126 Harbor tab records (959 rows within the original 74-task cohort), all 1,170 workbook notes (including all 934 old-Missing traces notes), and existing published claims. Repeated source rows are provenance, not extra runs. Explicit current invalid/closed results supersede stale scores. Empty placeholder rows do not erase existing published results. Original values, source cells and limitations are retained in `provenance.json`, [migration provenance](sources/workbook-migration.json), and [history/](history). No maximum-score selection is used. Rounded Sol context labels 258k/258.4k are one context; original labels remain recorded. Context configuration that was not verified is explicitly identified.\n\n'
    card += '## Website and updates\n\nThe website imports the small, checksummed [site exports](site) at a pinned HF revision. Update the relevant canonical score/material file, regenerate the derived tables/site exports, validate, and publish one catalog revision. There is no need to edit Excel. Large payloads reuse verified blobs; downloading the entire repository is unnecessary. Older source directories and `objects/` remain available as archive paths.\n\n'
    card += '```sh\npython tools/export_unified_tables.py --root .\n# Website checkout:\npython tools/sync_hf_catalog.py --revision <40-character-HF-commit>\nnode tools/prerender.js\n```\n\n'
    card += 'Source presence does not certify that a website launches unchanged. [Known replay limitations](sources/known-replay-limitations.json) and original licensing/attribution still apply. External credentials were redacted during normalization; hashes document the retained bytes. Reference exports are not borrowed across recordings.\n\n## Citation\n\nSee [CITATION.bib](CITATION.bib) and [CITATION.cff](CITATION.cff).\n'
    (root / 'README.md').write_text(card)
    write_site(root / 'site/cohort.json', cohort)
    build_leaderboard(root)
    manifest = read(root / 'manifest-v2.json')
    manifest['site_sha256'] = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in (root / 'site').iterdir()}
    write(root / 'manifest-v2.json', manifest)
    return summary


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, required=True)
    parser.add_argument('--previous', type=Path)
    args = parser.parse_args()
    print(json.dumps(refresh(args.root, args.previous or args.root)))
