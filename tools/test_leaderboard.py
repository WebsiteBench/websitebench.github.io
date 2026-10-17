"""Protect cohort exclusions, context selection and auditable aggregation."""
from collections import Counter
import json
from pathlib import Path
import unittest
from build_leaderboard import summarize, number
ROOT=Path(__file__).resolve().parents[1]

class LeaderboardTests(unittest.TestCase):
    def test_available_task_macro_average_preserves_zero_and_missing(self):
        metrics=['overall','request','browser','system','cost','tokens','turns']
        rows=[dict(task_id=str(i),context='1M',status='scored' if value is not None else 'missing',metrics={k:value if k=='overall' else None for k in metrics}) for i,value in enumerate([0,9,None])]
        result=summarize(dict(id='example'),rows,3)
        self.assertEqual(result['overall'],4.5)
        self.assertEqual(result['coverage']['overall'],2)
        self.assertIsNone(result['cost'])
        self.assertEqual(result['pareto']['cost']['overall']['count'],0)

    def test_all_views_match_the_same_70_task_matrix(self):
        waffle=json.loads((ROOT/'data/waffle.json').read_text())
        board=json.loads((ROOT/'data/leaderboard-views.json').read_text())
        ids={t['id'] for t in waffle['tasks']}
        self.assertEqual(len(ids),70)
        self.assertFalse(ids & {'untappd','roomsketcher','workable','edx'})
        for view,models in board['views'].items():
            for model in models:
                entries=[t['results'][model['id']]['contexts'][view if model['variable_context'] else 'recorded'] for t in waffle['tasks']]
                scores=[100*e['passed']/e['total'] for e in entries if e['status']=='scored']
                self.assertEqual(model['coverage']['overall'],len(scores))
                self.assertAlmostEqual(model['overall'],sum(scores)/len(scores))
                for resource,scores in model['pareto'].items():
                    for profile in scores.values():
                        self.assertEqual(profile['count'],len(profile['task_ids']))
                        self.assertTrue(set(profile['task_ids'])<=ids)

    def test_selected_200k_recoveries_and_error_timeout_distinction(self):
        waffle=json.loads((ROOT/'data/waffle.json').read_text())
        for task in ['eatthismuch','eventbrite','fandango','insurify','notion','ratemyprofessors','tripadvisor','warbyparker']:
            values=next(t for t in waffle['tasks'] if t['id']==task)['results']['glm']['contexts']
            self.assertEqual(values['overview']['value'],values['200k']['value'])
            self.assertEqual(values['overview']['label'],'200K')
            self.assertNotEqual(values['1m']['status'],'scored')
        missing=[e for t in waffle['tasks'] for m in waffle['models'] for e in [t['results'][m['id']]['contexts']['overview' if m['variable_context'] else 'recorded']] if e['status']!='scored']
        self.assertEqual(Counter(e['failure_kind'] for e in missing),{'error':5,'timeout':2,'unverified':2})

    def test_resource_parser_keeps_missing_distinct_from_measured_zero(self):
        self.assertEqual(number('97.2M'),97200000)
        self.assertEqual(number('3.04174947E9'),3041749470)
        self.assertEqual(number('0'),0)
        self.assertIsNone(number(''))
        self.assertIsNone(number('unknown'))
