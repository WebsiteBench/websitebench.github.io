"""Guard the distinctions that previously made published Waffle scores disappear."""
import json
from pathlib import Path
import unittest

from build_waffle import score_record, select_record
from annotation_scores import supplement


class WaffleTests(unittest.TestCase):
    def test_qwen_active_rows_match_the_original_74_row_200k_table(self):
        root = Path(__file__).resolve().parents[1]
        expected = json.loads((root / 'tools/fixtures/qwen-200k-book1.json').read_text())
        data = json.loads((root / 'data/waffle.json').read_text())
        self.assertEqual(len(expected['results']), 74)
        self.assertEqual(sum(value is not None for value in expected['results'].values()), 71)
        for task in data['tasks']:
            entry = task['results']['qwen']['contexts']['overview']
            self.assertEqual(entry['value'], expected['results'][task['id']], task['id'])
            self.assertEqual(entry['label'], '200K')
        amazon = next(t for t in data['tasks'] if t['id'] == 'amazon')['results']['qwen']['contexts']
        self.assertEqual((amazon['overview']['passed'], amazon['overview']['total']), (402, 1025))
        self.assertEqual(amazon['1m']['status'], 'missing')

    def test_overview_selects_the_declared_context_instead_of_the_higher_score(self):
        data = json.loads((Path(__file__).resolve().parents[1] / 'data/waffle.json').read_text())
        medium = next(t for t in data['tasks'] if t['id'] == 'medium')['results']['qwen']['contexts']
        self.assertEqual(medium['overview']['value'], medium['200k']['value'])
        self.assertLess(medium['overview']['passed'], medium['1m']['passed'])

    def test_latest_note_fills_a_blank_only_for_the_bound_recording(self):
        note=dict(recording_id='current-run',score='192/393',passed=192,total=393,
                  context='1m',source_cell='B61',source_url='https://example.test/note',id='note-B61')
        missing=dict(status='missing',run='current-run',cells=['O845'])
        value=supplement(missing,[note])
        self.assertEqual((value['passed'],value['total'],value['source_sheet'],value['cells']),
                         (192,393,'old-Missing traces (note)',['B61']))
        self.assertEqual(supplement(dict(missing,run='another-run'),[note]),dict(missing,run='another-run'))
        for state in ['scored','withdrawn','invalid']:
            original=dict(missing,status=state)
            self.assertEqual(supplement(original,[note]),original)

    def test_amazon_and_notion_current_notes_supersede_old_blank_cells(self):
        data=json.loads((Path(__file__).resolve().parents[1]/'data/waffle.json').read_text())
        for task,passed,total in [('amazon',582,1025),('notion',192,393)]:
            entry=next(t for t in data['tasks'] if t['id']==task)['results']['opus55']['contexts']['recorded']
            self.assertEqual((entry['passed'],entry['total'],entry['source_type']), (passed,total,'hf_canonical'))
            self.assertTrue(entry['source_url'].endswith(f'benchmark/{task}/claude-opus-5-5/1m/score.json'))
    def test_contexts_do_not_select_the_best_score(self):
        records = [score_record({'context': '1M', 'cell': 'O1', 'score': '0/347'}),
                   score_record({'context': '200k', 'cell': 'O2', 'score': '80/347'})]
        self.assertEqual(select_record(records, '1m', True)['passed'], 0)
        self.assertEqual(select_record(records, '200k', True)['passed'], 80)
        self.assertEqual(select_record(records, '1m', True)['status'], 'scored')

    def test_missing_is_not_zero_and_conflicting_scores_are_not_chosen(self):
        missing = score_record({'context': '1M', 'cell': 'O1', 'score': None})
        self.assertEqual(missing['status'], 'missing')
        self.assertNotIn('passed', missing)
        records = [score_record({'context': '1M', 'cell': 'O2', 'score': '0/100'}),
                   score_record({'context': '1M', 'cell': 'O3', 'score': '90/100'})]
        self.assertEqual(select_record(records, '1m', True)['status'], 'conflict')

    def test_withdrawn_and_malformed_source_cells_are_not_plotted(self):
        source = {'context': '1M', 'cell': 'O1056', 'score': "0/531'0/531o",
                  'comments': {'F': '恢复原有 200k 行归属。此前分数已撤回。'}}
        record = score_record(source)
        self.assertEqual((record['context'], record['status']), ('200k', 'withdrawn'))
        self.assertNotIn('passed', record)
        self.assertEqual(score_record(dict(source, comments={}))['status'], 'invalid')

    def test_context_verification_does_not_hide_a_published_score(self):
        record = score_record({'context': '1M', 'cell': 'O4', 'score': '17/668',
                               'comments': {'F': '上下文待确认：原始配置未记录上限。'}})
        self.assertEqual((record['context'], record['status']), ('1m', 'scored'))
        self.assertTrue(record['context_unverified'])

    def test_current_public_cohort_and_score_citations(self):
        data = json.loads((Path(__file__).resolve().parents[1] / 'data/waffle.json').read_text())
        self.assertEqual(len({t['id'] for t in data['tasks']}), 70)
        self.assertFalse({'untappd','roomsketcher','workable','edx'} & {t['id'] for t in data['tasks']})
        self.assertNotIn('samsung', {t['id'] for t in data['tasks']})
        model_ids = {m['id'] for m in data['models']}
        self.assertEqual(len(model_ids), 9)
        self.assertIn('sol61', model_ids)
        self.assertNotIn('sol', model_ids)
        medium = next(t for t in data['tasks'] if t['id'] == 'medium')['results']['qwen']['contexts']
        self.assertEqual((medium['1m']['passed'], medium['1m']['total']), (61, 650))
        self.assertEqual((medium['200k']['passed'], medium['200k']['total']), (56, 650))
        self.assertNotEqual(medium['1m']['run'], medium['200k']['run'])
        for task in data['tasks']:
            self.assertEqual(set(task['results']), model_ids)
            for result in task['results'].values():
                for entry in result['contexts'].values():
                    if entry['status'] == 'scored':
                        self.assertTrue(entry['source_url'].startswith('https://huggingface.co/datasets/TIGER-Lab/WebsiteBenchArtifacts/'))
                        self.assertTrue(0 <= entry['passed'] <= entry['total'])


if __name__ == '__main__':
    unittest.main()
