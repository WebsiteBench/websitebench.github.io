"""Bind verified website exports to their exact recorded trajectory identity."""
import json
from pathlib import Path
from urllib.parse import quote


def attach(public, private, source):
    source = Path(source)
    metadata = json.loads((source / 'repo-metadata.json').read_text())
    progress = json.loads((source / 'download-progress.json').read_text())
    if not progress.get('complete') or progress['revision'] != metadata['revision']:
        raise ValueError('Website artifact download and integrity checks must finish before import.')
    repository = source / 'repository'
    index = json.loads((repository / 'WEBSITE_ARTIFACTS_INDEX.json').read_text())
    items = {i['destination']: i for i in index['items']}
    files = {f['path']: f for f in metadata['files']}
    records = {r['id']: r for t in public['tasks'] for m in t['models'].values() for r in m['runs']}
    models = {m['id']: m['source_id'] for m in public['models']}
    base = 'https://huggingface.co/datasets/' + metadata['repo_id']
    report = {'matched_contexts': 0, 'agent_bindings': 0, 'reference_bindings': 0, 'mismatches': []}

    for uid, record in private['runs'].items():
        trace = record['trace']
        trajectory = Path(trace.get('trajectory', {}).get('path', ''))
        layout_path = trajectory.parent / 'path-layout.json'
        if not trajectory.is_file() or not layout_path.is_file():
            continue
        layout = json.loads(layout_path.read_text())
        destination = layout.get('destination')
        item = items.get(destination)
        if not item:
            continue
        if (item['task'], item['model'], item['selected_run']) != (
                record['task'], models[record['model']], layout.get('source_run')):
            report['mismatches'].append({'record': uid, 'destination': destination})
            continue
        manifest_path = repository / destination / 'website-artifacts.json'
        manifest = json.loads(manifest_path.read_text())
        if any(manifest.get(k) != item.get(k) for k in ('destination', 'task', 'model', 'context', 'effort', 'selected_run')):
            raise ValueError('Artifact manifest does not agree with its index: ' + destination)
        report['matched_contexts'] += 1
        info = records[uid]
        for role, field in (('agent', 'website_artifact'), ('reference', 'reference_artifact')):
            artifact = manifest['artifacts'][role]
            if artifact['status'] != 'available':
                continue
            filename = artifact['archive_filename']
            relative = destination + '/' + filename
            archive = repository / relative
            file = files[relative]
            if not archive.is_file() or archive.stat().st_size != file['size'] or not file.get('lfs'):
                raise ValueError('Verified artifact is unavailable locally: ' + relative)
            root = 'repo/' if role == 'agent' else 'environment/reference/'
            members = [f for f in artifact.get('files', []) if f['path'].startswith(root)]
            if not members:
                continue
            sha = file['lfs']['sha256']
            source_url = base + '/blob/' + metadata['revision'] + '/' + quote(relative, safe='/')
            binding = {'id': 'website-artifact:' + sha, 'source': source_url,
                       'source_revision': metadata['revision'], 'run_id': item['selected_run'],
                       'trajectory': {'path': str(archive.resolve())},
                       'candidate': {'archive_root': root, 'archive_sha256': sha,
                                     'code_file_count': len(members),
                                     'sample_files': [f['path'] for f in members[:15]]}}
            record['candidate' if role == 'agent' else 'reference_artifact'] = binding
            info[field] = {'url': base + '/resolve/' + metadata['revision'] + '/' + quote(relative, safe='/') + '?download=true',
                           'manifest': base + '/blob/' + metadata['revision'] + '/' + destination + '/website-artifacts.json',
                           'sha256': sha, 'bytes': file['size'], 'files': len(members),
                           'selected_run': item['selected_run']}
            if role == 'agent':
                info['code'] = True
            report['agent_bindings' if role == 'agent' else 'reference_bindings'] += 1
        record['public'] = info
    for task in public['tasks']:
        for model in task['models'].values():
            model['code'] = bool(model['code'] or any(r.get('code') for r in model['runs']))
    public['website_artifact_source'] = {'repo': metadata['repo_id'], 'revision': metadata['revision']}
    return report
