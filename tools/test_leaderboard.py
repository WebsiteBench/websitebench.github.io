"""Protect cohort exclusions, context selection and auditable aggregation."""
from collections import Counter
import json
from pathlib import Path
import unittest
from build_leaderboard import summarize, number
ROOT=Path(__file__).resolve().parents[1]

class LeaderboardTests(unittest.TestCase):
    def test_test_pooled_score_differs_from_task_average_and_preserves_zero(self):
        metrics=['overall','request','browser','system','cost','tokens','turns']
        rows=[dict(task_id=str(i),context='1M',status='scored' if value is not None else 'missing',metrics={k:value if k=='overall' else None for k in metrics}) for i,value in enumerate([0,9,None])]
        for row,counts in zip(rows,[dict(passed=0,total=10),dict(passed=9,total=100),None]):
            row['counts']={key:counts if key=='overall' else None for key in ['overall','request','browser','system']}
        result=summarize(dict(id='example'),rows,3)
        self.assertAlmostEqual(result['overall'],100*9/110)
        self.assertNotEqual(result['overall'],4.5)
        self.assertEqual(result['score_counts']['overall'],dict(passed=9,total=110))
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
                scores=[e for e in entries if e['status']=='scored']
                self.assertEqual(model['coverage']['overall'],len(scores))
                self.assertAlmostEqual(model['overall'],100*sum(e['passed'] for e in scores)/sum(e['total'] for e in scores))
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

    def test_pareto_pools_tests_only_for_tasks_with_paired_resource_data(self):
        rows=[]
        for task,passed,total,cost in [('small',0,10,1),('large',9,100,3),('no-cost',1,1,None)]:
            metrics={key:None for key in ['overall','request','browser','system','cost','tokens','turns']}
            metrics.update(overall=100*passed/total,cost=cost)
            counts={key:None for key in ['overall','request','browser','system']}
            counts['overall']=dict(passed=passed,total=total)
            rows.append(dict(task_id=task,context='1M',status='scored',metrics=metrics,counts=counts))
        result=summarize(dict(id='example'),rows,3)
        self.assertAlmostEqual(result['overall'],100*10/111)
        profile=result['pareto']['cost']['overall']
        self.assertEqual(profile['task_ids'],['small','large'])
        self.assertEqual(profile['resource_mean'],2)
        self.assertAlmostEqual(profile['score_mean'],100*9/110)
