"""One-time source migration and reproducible, file-based WebsiteBench catalog.

Import the final workbook once. Subsequent edits belong in benchmark/**/score.json;
the website consumes the versioned site exports, never the workbook.
Large, already verified material files are copied within the same HF repository.
"""
import argparse
from collections import Counter, defaultdict
import csv
import hashlib
import json
from pathlib import Path
import posixpath
import re
import xml.etree.ElementTree as ET
from zipfile import ZipFile

from import_workbook import read_sheet

NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
REPO = 'TIGER-Lab/WebsiteBenchArtifacts'
ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return json.loads(Path(path).read_text())


def write(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def normalized(value):
    return re.sub('[^a-z0-9]', '', str(value).lower().replace('[1m]', ''))


def context(value):
    match = re.search(r'(\d+(?:\.\d+)?)\s*([mk])', str(value).lower())
    if not match:
        return 'recorded'
    # These source labels refer to the same Sol context configuration; retain
    # their original spellings in provenance, rather than inventing extra runs.
    if match.group(2) == 'k' and float(match.group(1)) in (258, 258.4):
        return '258k'
    return ''.join(match.groups())


def fraction(value):
    match = re.fullmatch(r'(\d+)/(\d+)', str(value or ''))
    if not match:
        return None
    passed, total = map(int, match.groups())
    return (passed, total) if 0 <= passed <= total and total > 0 else None


def clean_text(text):
    text = re.sub(r'\b(?:hf_[A-Za-z0-9]{20,256}|sk-(?:proj-|ant-)?[A-Za-z0-9_-]{25,256}|ghp_[A-Za-z0-9_]{25,256})\b', '[REDACTED_CREDENTIAL]', text)
    return re.sub(r'/(?:home|root|tmp)/[^\s"\u3000，；。]+', '[LOCAL_PATH]', text)


def source_notes(workbook):
    """Read notes as evidence; do not execute formulas or instructions in cells."""
    notes = {}
    with ZipFile(workbook) as archive:
        relationships = {r.attrib['Id']: posixpath.normpath(posixpath.join('xl', r.attrib['Target']))
                         for r in ET.fromstring(archive.read('xl/_rels/workbook.xml.rels'))}
        sheets = ET.fromstring(archive.read('xl/workbook.xml')).find('m:sheets', NS)
        for sheet in sheets:
            sheet_path = relationships[sheet.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']]
            relation_path = posixpath.dirname(sheet_path) + '/_rels/' + posixpath.basename(sheet_path) + '.rels'
            if relation_path not in archive.namelist():
                continue
            for relation in ET.fromstring(archive.read(relation_path)):
                if not relation.attrib['Type'].endswith('/comments'):
                    continue
                name = posixpath.normpath(posixpath.join(posixpath.dirname(sheet_path), relation.attrib['Target']))
                for item in ET.fromstring(archive.read(name)).findall('m:commentList/m:comment', NS):
                    text = ''.join(t.text or '' for t in item.findall('.//m:t', NS))
                    notes[sheet.attrib['name'] + '!' + item.attrib['ref']] = dict(text=clean_text(text), sha256=hashlib.sha256(text.encode()).hexdigest())
    return notes


def matrix_notes(workbook, notes):
    columns = dict(zip('BCEFGHIJK', ('claude-opus-5-5', 'claude-opus-5', 'gpt-5.6-luna', 'grok-4.6',
                                    'glm-5.3-flash', 'kimi-k3', 'deepseek-v4.1-flash', 'qwen3.8-max', 'gpt-6.1-sol')))
    result = {}
    with ZipFile(workbook) as archive:
        strings = [''.join(t.text or '' for t in node.findall('.//m:t', NS)) for node in ET.fromstring(archive.read('xl/sharedStrings.xml'))]
        relations = {r.attrib['Id']: posixpath.normpath(posixpath.join('xl', r.attrib['Target'])) for r in ET.fromstring(archive.read('xl/_rels/workbook.xml.rels'))}
        sheet = next(s for s in ET.fromstring(archive.read('xl/workbook.xml')).find('m:sheets', NS) if s.attrib['name'] == 'old-Missing traces')
        path = relations[sheet.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']]
        for row in ET.fromstring(archive.read(path)).findall('m:sheetData/m:row', NS):
            number = row.attrib['r']
            cell = next((c for c in row if c.attrib.get('r') == 'A' + number), None)
            if cell is None:
                continue
            value = cell.find('m:v', NS)
            if value is None:
                continue
            task = strings[int(value.text)] if cell.attrib.get('t') == 's' else value.text
            task = '33' if task == '33.0' else task
            for column, model in columns.items():
                key = 'old-Missing traces!' + column + number
                if key in notes:
                    result[task, model] = dict(source_cell=key, **notes[key])
    return result


def import_sources(workbook, catalog, output):
    rows, _ = read_sheet(workbook)
    cohort = read(catalog / 'sources/cohort.json')
    model_lookup = {normalized(m['source_id']): m['source_id'] for m in cohort['models']}
    tasks = {t['id'] for t in cohort['tasks']}
    digest = hashlib.sha256(workbook.read_bytes()).hexdigest()
    grouped = defaultdict(list)
    excluded = []
    for row in rows:
        model = model_lookup.get(normalized(row.get('model name', '')))
        if model is None or row['task'] not in tasks:
            excluded.append(dict(source_sheet='Harbor-run-results-1', source_row=row['row'],
                                 reason='Outside the official 74-task / nine-model cohort',
                                 fields={k: clean_text(str(v)) for k, v in row.items()}))
            continue
        entry = dict(id=f"harbor-{digest[:12]}-{row['row']}", task_id=row['task'], model_id=model,
                     context=context(row.get('上下文长度')), source_sheet='Harbor-run-results-1',
                     source_row=row['row'], source_cell=f"N{row['row']}", source_workbook_sha256=digest,
                     fields={k: clean_text(str(v)) for k, v in row.items() if k not in ('row', 'task')})
        grouped[row['task'], model, entry['context']].append(entry)
    imported = dict(version=1, workbook_sha256=digest, source_sheet='Harbor-run-results-1',
                    all_sheet_records=len(rows), official_records=sum(map(len, grouped.values())),
                    records=[entry for entries in grouped.values() for entry in entries],
                    cell_notes=source_notes(workbook))
    write(output / 'sources/workbook-migration.json', imported)
    write(output / 'history/workbook-outside-official-cohort.json', excluded)
    return grouped, cohort, imported


def choose_score(rows, old, notes, ctx):
    values = {r['fields'].get('score') for r in rows if fraction(r['fields'].get('score'))}
    # The declared current Harbor tab replaces stale clean-tab values. Blank
    # current results, including explicitly invalid runs, are never backfilled.
    source = 'Harbor-run-results-1' if rows else 'archived_publication'
    selected_rows = [r for r in rows if r['fields'].get('score') in values] or rows
    qualifications = list(dict.fromkeys(r['fields'].get('feedbacks', '') for r in selected_rows if r['fields'].get('feedbacks')))
    evidence_fields = ('latency', 'cost (USD)', 'Input tokens', 'Output tokens', 'Turns', 'reward',
                       'score', 'T1', 'T2', 'T3', '轨迹hf link folder/file', 'feedbacks')
    placeholder = bool(rows and all(not any(r['fields'].get(k) for k in evidence_fields) for r in rows))
    if not rows or placeholder:
        values = {s['raw_value'] for s in old if s['status'] == 'scored'}
        source = 'retained_publication_placeholder_row' if placeholder else 'archived_publication'
    value = next(iter(values)) if len(values) == 1 else None
    counts = fraction(value)
    status = 'scored' if counts else 'conflict' if len(values) > 1 else 'unscored'
    feedback = '\n'.join(qualifications)
    if not counts and re.search(r'CaseProtocolError|INVALID_RUN|评测无效|未能发布有效评测终态|不满足准入', feedback):
        status = 'invalid'
    elif not counts and re.search(r'保留无分|无分已结案', feedback):
        status = 'closed_unscored'
    if not rows and any(s['status'] == 'withdrawn' for s in old) and not counts:
        status = 'withdrawn'
    # Preserve original 1000-case / functional-only reports as a distinct
    # protocol rather than comparing them with the current strict test metric.
    legacy = bool(counts and counts[1] == 1000 and re.search(r'原版1000|原始1000|非5dce|functional_passed|乘性组合|SSIM归一化', feedback))
    if counts and counts[1] == 1000 and not re.search(r'5dcebb73有效|equal-case-v1|严格', feedback):
        historical = {s.get('total') for s in old if s['status'] == 'scored'}
        legacy = legacy or bool(historical and 1000 not in historical)
    groups = {}
    for name in ('T1', 'T2', 'T3'):
        parts = {r['fields'].get(name) for r in selected_rows if fraction(r['fields'].get(name))}
        groups[name] = next(iter(parts)) if len(parts) == 1 else None
    group_counts = [fraction(v) for v in groups.values()]
    groups_consistent = bool(counts and all(group_counts) and tuple(map(sum, zip(*group_counts))) == counts)
    return dict(schema_version=2, status=status, context=ctx, fraction=value,
                passed=counts[0] if counts else None, total=counts[1] if counts else None,
                pass_rate=counts[0] / counts[1] if counts else None,
                metric='legacy_reported_fraction' if legacy else 'reported_test_pass_fraction',
                comparable=bool(counts and not legacy), protocol='legacy' if legacy else 'current_or_source_declared',
                groups=groups, groups_sum_verified=groups_consistent,
                source=source, source_rows=[r['source_row'] for r in selected_rows],
                source_cells=[s['source_cell'] for s in old if s.get('raw_value') == value] if placeholder or not rows else [r['source_cell'] for r in selected_rows],
                placeholder_row=placeholder,
                qualifications=qualifications, conflicts=sorted(values) if len(values) > 1 else [],
                evidence_level='published_declaration', evaluation_material_id=None,
                candidate_variant='repaired' if any(s.get('candidate_variant') == 'repaired' for s in old) else 'original_or_source_declared',
                note_publication_ids=[n['id'] for n in notes if n['score'] == value])


def build(catalog, workbook, output):
    grouped, cohort, imported = import_sources(workbook, catalog, output)
    cell_notes = matrix_notes(workbook, imported['cell_notes'])
    note_scores = read(catalog / 'sources/annotation-scores.json')['scores']
    copies, folders, pair_entries = [], [], []
    public = read(ROOT / 'data/task-materials.json')
    models = {m['source_id']: m for m in cohort['models']}
    for task in cohort['tasks']:
        for model_id, model in models.items():
            old_pair = read(catalog / f"pairs/{task['id']}/{model_id}/index.json")
            materials = {m['id']: m for m in old_pair['materials']}
            runs = old_pair['current_recordings']
            runs_by_context = {context(r['context']): r for r in runs}
            assert len(runs_by_context) == len(runs), 'Ambiguous current recording'
            declared_contexts = {k[2] for k in grouped if k[:2] == (task['id'], model_id)}
            fixed = model_id not in ('glm-5.3-flash', 'deepseek-v4.1-flash', 'qwen3.8-max')
            if fixed and len(declared_contexts) == 1 and set(runs_by_context) == {'recorded'}:
                # One existing archive, one declared context. Its actual source
                # label is retained and is not claimed to be config-verified.
                runs_by_context = {next(iter(declared_contexts)): runs[0]}
            contexts = set(runs_by_context) | declared_contexts
            if not declared_contexts:
                contexts |= {context(s['context']) for s in old_pair['published_scores']}
            if not contexts:
                contexts = {'recorded'}
            entries = []
            for ctx in sorted(contexts):
                directory = f"benchmark/{task['id']}/{model_id}/{ctx}"
                run = runs_by_context.get(ctx)
                rows = grouped.get((task['id'], model_id, ctx), [])
                old = [s for s in old_pair['published_scores'] if context(s['context']) == ctx
                       or fixed and context(s['context']) == 'recorded' and len(contexts) == 1]
                notes = [n for n in note_scores if (n['task_id'], n['model_id'], context(n['context'])) == (task['id'], model_id, ctx)]
                score = choose_score(rows, old, notes, ctx)
                score.update(task_id=task['id'], model_id=model_id, recording_id=run['recording_id'] if run else None)
                matching = []
                for material_id in (run['evaluation_material_ids'] if run else []):
                    material = materials[material_id]
                    meta = json.loads(material.get('evaluation_metadata') or '{}')
                    if meta.get('status') == 'VALID_RUN' and meta.get('scorable') and meta.get('scoring_version') == 'equal-case-v1' and meta.get('score') == score['fraction']:
                        matching.append(material)
                if matching and score['fraction']:
                    # Multiple copies of the same fraction do not constitute a
                    # score conflict. Prefer case evidence / explicit selection.
                    matching.sort(key=lambda m: ('selected-evaluation' not in ' '.join(m['source_urls']), not json.loads(m.get('evaluation_metadata') or '{}').get('case_results_present'), m['id']))
                    score.update(evidence_level='matching_valid_evaluation', evaluation_material_id=matching[0]['id'],
                                 matching_evaluation_ids=[m['id'] for m in matching], protocol='equal-case-v1')
                selected_note = next((n for n in notes if n['score'] == score['fraction'] and n['evaluation_verified']), None)
                if selected_note:
                    score.update(evidence_level='selected_run_and_cases_verified', evaluation_material_id=selected_note['evaluation_material_id'])
                unverified_fallback = score['source'] in ('archived_publication', 'retained_publication_placeholder_row') and score['evidence_level'] == 'published_declaration'
                if score['fraction'] and (not score['comparable'] or unverified_fallback):
                    historical_path = f"history/{directory}/score.json"
                    write(output / historical_path, score)
                    reason = 'Only a legacy scoring result was located; a current-protocol evaluation is required.' if not score['comparable'] else 'An earlier publication exists, but its new-protocol evaluation has not been verified.'
                    score.update(status='needs_current_evaluation', fraction=None, passed=None, total=None, pass_rate=None,
                                 metric='reported_test_pass_fraction', comparable=False, protocol='equal-case-v1-required',
                                 evidence_level='not_available', evaluation_material_id=None,
                                 historical_score_path=historical_path, qualifications=[reason] + score['qualifications'])
                score_name = 'score.json' if score['status'] == 'scored' else 'score.' + ('CONFLICT' if score['status'] == 'conflict' else 'UNSCORED') + '.json'
                write(output / directory / score_name, score)
                files = dict(score=f'{directory}/{score_name}')
                requested = dict(trajectory=run['trace_material_ids'][0] if run and run['trace_material_ids'] else None,
                                 website=run['website_material_id'] if run else None,
                                 reference=run.get('reference_material_id') if run else None,
                                 evaluation=score['evaluation_material_id'])
                if score['evaluation_material_id']:
                    evaluation_metadata = json.loads(materials[score['evaluation_material_id']].get('evaluation_metadata') or '{}')
                    if evaluation_metadata.get('case_results_id'):
                        requested['case-results'] = evaluation_metadata['case_results_id']
                missing = []
                integrity = {}
                for kind, material_id in requested.items():
                    material = materials.get(material_id)
                    if material and material['status'] == 'available':
                        extension = '.tar.gz' if material['path'].endswith('.tar.gz') else '.tar.zst' if material['path'].endswith('.tar.zst') else '.json.zst'
                        destination = directory + '/' + kind + extension
                        copies.append(dict(source=material['path'], destination=destination, sha256=material['sha256'], bytes=material['bytes'], material_id=material_id))
                        files[kind] = destination
                        integrity[kind] = dict(sha256=material['sha256'], bytes=material['bytes'], material_id=material_id, project_root=material.get('project_root'))
                    else:
                        reason = 'No valid raw evaluation matching this published fraction; see evaluation.index.json for other recorded evaluations' if kind == 'evaluation' else 'No material bound to this exact context and recording'
                        missing.append(kind)
                        files[kind] = directory + '/' + kind + '.MISSING.json'
                        write(output / files[kind], dict(status='missing', reason=reason, task_id=task['id'], model_id=model_id, context=ctx,
                                                        other_context_material_exists=any(m['kind'] == ('trace' if kind == 'trajectory' else kind) for m in materials.values())))
                raw_evaluations = []
                for material_id in run['evaluation_material_ids'] if run else []:
                    material = materials[material_id]
                    if material['status'] != 'available':
                        continue
                    destination = directory + '/evaluations/' + material_id + '.json.zst'
                    copies.append(dict(source=material['path'], destination=destination, sha256=material['sha256'], bytes=material['bytes'], material_id=material_id))
                    raw_evaluations.append(dict(path=destination, sha256=material['sha256'], metadata=json.loads(material.get('evaluation_metadata') or '{}')))
                write(output / directory / 'evaluation.index.json', dict(recorded_evaluations=raw_evaluations,
                      selected_fraction=score['fraction'], matching_evaluation_id=score['evaluation_material_id'],
                      policy='Original, invalid and historical evaluations are evidence; their existence does not make a current score valid.'))
                provenance = dict(recording=run, material_integrity=integrity, current_publications=rows,
                                  previous_publications=old, matching_note_publications=notes,
                                  matrix_cell_note=cell_notes.get((task['id'], model_id)),
                                  recorded_context_label=run['context'] if run else None,
                                  declared_context=ctx,
                                  context_label_matches_recording=bool(run and context(run['context']) == ctx and ctx != 'recorded'),
                                  context_configuration_verified=None,
                                  context_configuration_note='Source-declared context labels; native configuration was not independently checked during this catalog import.',
                                  score_candidate_variant=score['candidate_variant'],
                                  website_candidate_variant='original_recorded_candidate',
                                  earlier_context_publications=[s for s in old_pair['published_scores'] if s not in old],
                                  history_index=old_pair['pair']['metadata_path'],
                                  policy='Blank current results do not inherit obsolete scores; contexts, scoring protocols and repaired candidates remain distinct.')
                write(output / directory / 'provenance.json', provenance)
                entry = dict(task_id=task['id'], task_name=task['name'], model_id=model_id, context=ctx,
                             recording_id=run['recording_id'] if run else None, directory=directory, files=files,
                             score_status=score['status'], fraction=score['fraction'], comparable=score['comparable'],
                             missing=missing, evidence_level=score['evidence_level'], score=score)
                entries.append(entry)
                folders.append(entry)
            pair_summary = dict(task_id=task['id'], task_name=task['name'], model_id=model_id, model_name=model['name'],
                                contexts=entries, trajectory=any('trajectory' not in e['missing'] for e in entries),
                                website=any('website' not in e['missing'] for e in entries),
                                scored=any(e['score_status'] == 'scored' for e in entries))
            pair_entries.append(pair_summary)
            write(output / f"benchmark/{task['id']}/{model_id}/index.json", pair_summary)
            # Replace site scores from this one canonical catalog. Preserve the
            # existing exact recording/code bindings used by the replay viewer.
            task_public = next(t for t in public['tasks'] if t['id'] == task['id'])['models'][model['id']]
            task_public['scores'] = list(dict.fromkeys(e['fraction'] for e in entries if e['fraction']))
            for recorded in task_public['runs']:
                matched = next((e for e in entries if e['recording_id'] == recorded['id']), None)
                recorded['scores'] = []
                if matched and matched['fraction']:
                    recorded['scores'] = [dict(value=matched['fraction'], context=matched['context'], source='HF canonical catalog',
                                              source_url=f"https://huggingface.co/datasets/{REPO}/blob/main/{matched['files']['score']}",
                                              verified=matched['evidence_level'] != 'published_declaration', cell='')]
    public['score_source'] = REPO + ' / benchmark/**/score.json'
    public['selection_note'] = 'Exact recorded contexts; scores and artifact bindings are versioned together in the HF catalog.'
    write_site(output / 'site/task-materials.json', public)
    export_waffle(output, cohort, pair_entries)
    counts = dict(tasks=74, models=9, pairs=len(pair_entries), contexts=len(folders),
                  trajectory_pairs=sum(p['trajectory'] for p in pair_entries), website_pairs=sum(p['website'] for p in pair_entries),
                  scored_pairs=sum(p['scored'] for p in pair_entries), score_statuses=dict(Counter(e['score_status'] for e in folders)),
                  historical_only_scores=sum(bool(e['score'].get('historical_score_path')) for e in folders),
                  files_to_copy=len(copies), imported_rows=imported['official_records'], imported_notes=len(imported['cell_notes']))
    write(output / 'catalog.json', dict(schema_version=2, repo_id=REPO, root='benchmark', summary=counts, pairs=pair_entries))
    for name, selection in [('missing-trajectories', lambda e: 'trajectory' in e['missing']),
                            ('missing-websites', lambda e: 'website' in e['missing']),
                            ('unscored', lambda e: e['score_status'] != 'scored'),
                            ('missing-evaluations', lambda e: bool(e['fraction']) and 'evaluation' in e['missing'])]:
        selected = [dict(task=e['task_id'], model=e['model_id'], context=e['context'], status=e['score_status'], directory=e['directory']) for e in folders if selection(e)]
        write(output / f'missing/{name}.json', selected)
    write(output / 'sources/tree-copies.json', copies)
    write(output / 'manifest-v2.json', dict(schema_version=2, catalog='catalog.json', root='benchmark', site='site', missing='missing',
                                          policy='Edit the canonical JSON files; workbook inputs are frozen migration provenance only.',
                                          site_sha256={p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in (output / 'site').iterdir()}))
    assert len(pair_entries) == 666
    return counts


def write_site(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':')) + '\n')


def export_waffle(output, cohort, pairs):
    prior_path = output / 'site/waffle.json'
    prior = read(prior_path if prior_path.is_file() else ROOT / 'data/waffle.json')
    lookup = {(p['task_id'], p['model_id']): p for p in pairs}
    policy_path = output / 'sources/display-contexts.json'
    policy = read(policy_path) if policy_path.is_file() else {'contexts': {'glm-5.3-flash': '1m', 'deepseek-v4.1-flash': '1m', 'qwen3.8-max': '200k'}}
    models = [dict(m, default_context=policy['contexts'].get(m['source_id'], 'recorded')) for m in prior['models']]
    result = dict(version=2, updated='2026-10-17', cohort_id=cohort.get('cohort_id'), default_view='overview', source=dict(repository=REPO, sheet='HF canonical catalog', path='catalog.json'), models=models, tasks=[])
    for task in cohort['tasks']:
        t = dict(id=task['id'], name=task['name'], results={})
        for model in models:
            entries = lookup[task['id'], model['source_id']]['contexts']
            contexts = {}
            for target in (['1m', '200k', 'overview'] if model['variable_context'] else ['recorded']):
                selected = policy.get('task_overrides', {}).get(model['source_id'], {}).get(task['id'], model['default_context']) if target == 'overview' else target
                candidates = [e for e in entries if e['context'] == selected] if model['variable_context'] else entries
                # Multiple numeric contexts for a fixed-context model require
                # review rather than automatic maximum/first-run selection.
                entry = candidates[0] if len(candidates) == 1 else None
                score = entry['score'] if entry else {}
                state = score.get('status', 'missing')
                if state == 'scored' and not score['comparable']:
                    state = 'incomparable'
                elif state in ('unscored', 'closed_unscored', 'needs_current_evaluation'):
                    state = 'missing'
                contexts[target] = dict(status=state, passed=score.get('passed') if state == 'scored' else None,
                                        total=score.get('total') if state == 'scored' else None,
                                        value=score.get('fraction'), label=entry['context'].upper() if entry else selected.upper(),
                                        context=entry['context'] if entry else selected, cells=[], source_sheet='HF canonical catalog', source_type='hf_canonical',
                                        source_url=f"https://huggingface.co/datasets/{REPO}/blob/main/{entry['files']['score']}" if entry else f"https://huggingface.co/datasets/{REPO}/blob/main/benchmark/{task['id']}/{model['source_id']}/index.json",
                                        run=entry['recording_id'] if entry else None,
                                        repaired=score.get('candidate_variant') == 'repaired',
                                        note=('Legacy scoring protocol; retained separately from the current test pass metric.' if state == 'incomparable' else
                                              '\n'.join(score.get('qualifications', [])))[:2200])
                value = contexts[target]
                reason = '\n'.join(score.get('qualifications', []))
                value['failure_kind'] = None if state == 'scored' else (
                    'timeout' if re.search(r'57600|生成.*(?:超时|预算)|generation.*(?:timeout|budget)', reason, re.I) else
                    'error' if state == 'invalid' or re.search(r'内容拒绝|cyber|CaseProtocolError', reason, re.I) else
                    'unverified' if score.get('status') == 'needs_current_evaluation' else 'unscored')
                if not entry:
                    alternatives = [e for e in entries if e['score_status'] == 'scored']
                    value['note'] = 'No result is registered for this context.' + (' Published in: ' + ', '.join(e['context'].upper() + ' ' + e['fraction'] for e in alternatives) + '.' if alternatives else '')
            t['results'][model['id']] = dict(contexts=contexts, records=[])
        result['tasks'].append(t)
    write_site(output / 'site/waffle.json', result)
    for ctx in ('overview', '1m', '200k'):
        with (output / f'site/waffle-{ctx}.csv').open('w') as stream:
            writer = csv.writer(stream, lineterminator='\n')
            writer.writerow(['task_id', 'task', 'model', 'context', 'passed', 'total', 'test_pass_rate', 'status', 'source', 'note'])
            for task in result['tasks']:
                for model in result['models']:
                    e = task['results'][model['id']]['contexts'][ctx if model['variable_context'] else 'recorded']
                    writer.writerow([task['id'], task['name'], model['name'], e['label'], e['passed'], e['total'],
                                     100 * e['passed'] / e['total'] if e['status'] == 'scored' else '', e['status'], e['source_url'], e['note']])


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--catalog', type=Path, required=True)
    parser.add_argument('--workbook', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(build(args.catalog, args.workbook, args.output)))
