"""Use explicit current cell-note publications without mixing runs or contexts."""
import json
from pathlib import Path

PATH=Path(__file__).resolve().parents[1]/'data/annotation-scores.json'

def load():
    return json.loads(PATH.read_text()).get('scores', []) if PATH.is_file() else []

def supplement(entry, candidates):
    if entry['status'] not in ('missing', 'conflict'):
        return entry
    matches=[s for s in candidates if s['recording_id']==entry.get('run')]
    if len(matches)!=1:
        return entry
    score=matches[0]
    return dict(entry, status='scored', value=score['score'], passed=score['passed'],
                total=score['total'], context=score['context'] if score['context'] in ('1m','200k') else 'recorded',
                label=score['context'].upper(), cells=[score['source_cell']],
                source_sheet='old-Missing traces (note)', source_type='cell_note',
                source_url=score['source_url'], annotation_id=score['id'],
                note='Updated score published in the latest cell note; the clean-tab score was blank.',
                superseded_blank_cells=entry.get('cells', []))

def attach(public):
    corrections=load();models={m['source_id']:m['id'] for m in public['models']};count=0
    for score in corrections:
        task=next(t for t in public['tasks'] if t['id']==score['task_id'])
        model=task['models'][models[score['model_id']]]
        record=next((r for r in model['runs'] if r['id']==score['recording_id']),None)
        if record is None or record['scores']:
            continue
        record['scores'].append(dict(value=score['score'], cell=score['source_cell'],
            context=score['context'].upper(), source='old-Missing traces (note)',
            source_url=score['source_url'], verified=score['evaluation_verified']))
        if score['score'] not in model['scores']:
            model['scores'].append(score['score'])
        count+=1
    if count:
        public['score_source']='run_result_clean + latest old-Missing traces cell notes'
    return count
