"""Read the exported workbook without running formulas or worksheet instructions.

Audit: python3 tools/import_workbook.py WORKBOOK --audit REPORT.json
Import after choosing the official cohort:
  python3 tools/import_workbook.py WORKBOOK --cohort-json IDS.json --output data/task-results.json
IDs.json must contain exactly 74 unique task IDs. No cohort is guessed from directories.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import posixpath
import re
import zipfile
from collections import Counter
from pathlib import Path
from urllib.parse import unquote, urlparse
import xml.etree.ElementTree as ET

NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main', 'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}
ALIASES = {'claude-opus-5-5[1m]': 'opus55', 'claude opus 5': 'opus5', 'gpt-5.6-sol': 'sol', 'gpt-5.6-luna': 'luna', 'grok-4.6': 'grok', 'glm-5.3-flash': 'glm', 'kimi k3': 'kimi', 'deepseek-v4.1-flash': 'deepseek', 'deepseek-v4-1-flash': 'deepseek', 'deepseek v4.1 flash': 'deepseek', 'qwen3.8-max': 'qwen'}
SHEET = 'Harbor-run-results-1'


def read_sheet(workbook: Path):
    with zipfile.ZipFile(workbook) as archive:
        def text(node):
            return ''.join(t.text or '' for t in node.findall('.//m:t', NS))
        strings = [text(node) for node in ET.fromstring(archive.read('xl/sharedStrings.xml'))] if 'xl/sharedStrings.xml' in archive.namelist() else []
        relations = {r.attrib['Id']: posixpath.normpath(posixpath.join('xl', r.attrib['Target'])) for r in ET.fromstring(archive.read('xl/_rels/workbook.xml.rels'))}
        sheets = ET.fromstring(archive.read('xl/workbook.xml')).find('m:sheets', NS)
        selected = next(s for s in sheets if s.attrib['name'] == SHEET)
        path = relations[selected.attrib['{' + NS['r'] + '}id']]
        tree = ET.fromstring(archive.read(path))
        rows = []
        for row in tree.findall('m:sheetData/m:row', NS):
            values = {}
            for cell in row:
                value = cell.find('m:v', NS)
                value = value.text if value is not None else ''
                kind = cell.attrib.get('t')
                if kind == 's': value = strings[int(value)] if value else ''
                elif kind == 'inlineStr': value = text(cell)
                if value: values[re.sub(r'\d+$', '', cell.attrib['r'])] = value
            if values: rows.append((int(row.attrib['r']), values))
        # Column positions change inside this sheet; each repeated header resets them.
        headers = {}
        records = []
        for number, values in rows:
            if values.get('D') == 'model name':
                headers = {value: column for column, value in values.items()}
                continue
            if values.get('A') and values.get('D'):
                record = {name: values.get(column, '') for name, column in headers.items()}
                record.update(row=number, task='33' if values['A'] == '33.0' else values['A'])
                records.append(record)
        return records, [s.attrib['name'] for s in sheets]


def source_identity(link):
    path = unquote(urlparse(link).path)
    match = re.match(r'/datasets/([^/]+/[^/]+)/(?:tree|blob)/[^/]+/(.+)', path)
    if not match: return link
    repository, path = match.groups()
    # Changing a receipt revision or evaluating again does not create a new agent run.
    path = re.split(r'/evaluations/|/verifier/|/agent/', path)[0]
    path = re.sub(r'/(?:trajectory\.json|trajectory\.jsonl|result\.json|eval\.json)$', '', path)
    return repository + '/' + path


def extract(rows):
    records, conflicts, skipped = {}, [], Counter()
    duplicates = 0
    for row in rows:
        model = ALIASES.get(row.get('model name', '').lower())
        if not model:
            skipped['outside existing nine-model evaluation'] += 1
            continue
        score = row.get('score', '')
        measured = bool(re.fullmatch(r'\d+/\d+', score))
        feedback = row.get('feedbacks', '')
        usage = any(row.get(field) for field in ['latency', 'cost (USD)', 'Input tokens', 'Output tokens', 'Turns'])
        if not measured and (not usage or any(term in feedback for term in ['未启动', 'agent未启动', '未评', 'Kimi未测', 'verifier bundle case总数'])):
            skipped['no actual scored or executed run proven'] += 1
            continue
        task, link, context = row['task'], row.get('轨迹hf link folder/file', ''), row.get('上下文长度', '').lower()
        identity = source_identity(link) if link else f"{task}/{model}/{context}/{row.get('run_number') or 'one-observed-row'}"
        key = task, model, identity
        result = {'id': 'xlsx-' + hashlib.sha256(identity.encode()).hexdigest()[:16], 'status': 'valid' if measured else 'missing'}
        if measured:
            passed, total = map(int, score.split('/'))
            if total <= 0 or not 0 <= passed <= total: raise ValueError(f'Invalid score at row {row["row"]}')
            result.update(overall=100 * passed / total, passed=passed, total=total)
            try:
                reward = float(row.get('reward', ''))
                if 0 <= reward <= 1:
                    result['reward'] = reward
                    if abs(reward - passed / total) > 1e-6:
                        result['metric_note'] = 'Workbook reward differs from the reported passed/total fraction'
            except ValueError:
                pass
            for source, target in [('T1', 'request'), ('T2', 'browser'), ('T3', 'system')]:
                if re.fullmatch(r'\d+/\d+', row.get(source, '')):
                    p, t = map(int, row[source].split('/'))
                    if t <= 0 or not 0 <= p <= t: raise ValueError(f'Invalid group score at row {row["row"]}')
                    result[target] = 100 * p / t
        elif re.search(r'CaseProtocolError|INVALID_RUN|HTTP 400|HTTP 500', feedback):
            result.update(status='invalid', outcome='error')
        provenance = {'source_sheet': SHEET, 'source_row': row['row']}
        if context: provenance['context'] = context
        if link: provenance['source'] = link
        result.update(provenance)
        entry = {'task': task, 'model': model, 'result': result, 'identity': identity, 'contexts': {context} if context else set()}
        if key in records:
            duplicates += 1
            old = records[key]
            if old['contexts'] and context and context not in old['contexts']:
                conflicts.append({'task': task, 'model': model, 'rows': [old['result']['source_row'], row['row']]})
            entry['contexts'].update(old['contexts'])
            if old['result']['status'] == 'valid' and not measured: continue
        if len(entry['contexts']) > 1:
            result['context'] = 'conflicting source labels: ' + ' / '.join(sorted(entry['contexts']))
        records[key] = entry
    candidates = {name: sorted({r['task'] for r in rows if r.get('model name') == name}) for name in ['gpt-5.6-luna', 'grok-4.6']}
    audit = {'source_sheet': SHEET, 'cohort_candidates': candidates, 'candidate_difference': sorted(set(candidates['gpt-5.6-luna']) ^ set(candidates['grok-4.6'])), 'deduplicated_records': len(records), 'duplicate_rows_removed': duplicates, 'context_conflicts': conflicts, 'skipped': dict(skipped)}
    return list(records.values()), audit


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('workbook', type=Path)
    parser.add_argument('--audit', type=Path)
    parser.add_argument('--cohort-json', type=Path)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    rows, sheets = read_sheet(args.workbook)
    records, audit = extract(rows)
    audit['sheets'] = sheets
    audit['workbook_sha256'] = hashlib.sha256(args.workbook.read_bytes()).hexdigest()
    if args.audit:
        args.audit.write_text(json.dumps(audit, ensure_ascii=False, indent=2) + '\n')
    print(f'{len(sheets)} tabs; {len(records)} distinct recorded evaluations; {audit["duplicate_rows_removed"]} duplicate rows removed.')
    if not args.cohort_json:
        print('No import performed: choose the official 74 task IDs first. Candidate discrepancy: ' + ', '.join(audit['candidate_difference']))
        return
    ids = json.loads(args.cohort_json.read_text())
    if not isinstance(ids, list) or len(ids) != 74 or len(set(ids)) != 74 or not all(isinstance(task, str) for task in ids):
        parser.error('The cohort file must contain exactly 74 unique task IDs.')
    if not args.output: parser.error('--output is required for an import.')
    tasks = {task: {'id': task, 'name': task, 'results': {}} for task in ids}
    task_root = Path(__file__).resolve().parents[2] / 'WebsiteBenchHarbor' / 'tasks'
    for task, data in tasks.items():
        definition = task_root / task / 'task.json'
        if definition.is_file():
            parameters = json.loads(definition.read_text()).get('parameters', {})
            data['name'] = re.sub(r'\s+offline(?:\s+(?:clone|harbor|learning))?$', '', parameters.get('DISPLAY', task), flags=re.IGNORECASE)
    selected = 0
    for record in records:
        if record['task'] not in tasks: continue
        tasks[record['task']]['results'].setdefault(record['model'], []).append(record['result'])
        selected += 1
    data = {'scope': 'evaluated_cohort', 'source_workbook_sha256': audit['workbook_sha256'], 'source_sheet': SHEET, 'description': 'Archived workbook candidates, not verified final runs. Different experiments remain in the source archive; the renderer requires an explicit final manifest for ambiguous pairs.', 'purpose': 'workbook_candidates', 'final_accuracy_verified': False, 'cohort_basis': 'GPT 5.6 Luna 74-task list; includes Samsung and Fandango; excludes Untappd, Menufy, and Wegmans', 'metric': 'reported_test_pass_fraction', 'runs': selected, 'tasks': list(tasks.values())}
    args.output.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    print(f'Imported {selected} real records over 74 tasks into {args.output}.')


if __name__ == '__main__': main()
