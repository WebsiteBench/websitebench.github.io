"""Check that the pages, data files and exports agree on the 70 released tasks."""
from collections import Counter
import csv
import html
import json
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data'
VIEWS = ('overview', '1m', '200k')


def load(name):
    return json.loads((DATA / name).read_text(encoding='utf-8'))


def rows(name):
    with (DATA / name).open(newline='', encoding='utf-8') as handle:
        return list(csv.DictReader(handle))


def entry(task, model, view):
    return task['results'][model['id']]['contexts'][view if model['variable_context'] else 'recorded']


def case_count(task):
    """A task's hidden test count: the total used by most of its scored results."""
    totals = Counter(e['total'] for result in task['results'].values()
                     for e in result['contexts'].values() if e['status'] == 'scored')
    return totals.most_common(1)[0][0]


def inline_json(page, element_id):
    text = (ROOT / page).read_text(encoding='utf-8')
    match = re.search(rf'<script type="application/json" id="{element_id}">(.*?)</script>', text, re.S)
    return json.loads(match.group(1))


class SiteDataTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.cohort = load('cohort.json')
        cls.waffle = load('waffle.json')
        cls.board = load('leaderboard-views.json')
        cls.materials = load('task-materials.json')
        cls.ids = [t['id'] for t in cls.cohort['tasks']]

    def test_every_view_covers_the_same_70_tasks(self):
        self.assertEqual(len(self.ids), 70)
        self.assertEqual(len(set(self.ids)), 70)
        expected = sorted(self.ids)
        sources = {
            'waffle': [t['id'] for t in self.waffle['tasks']],
            'task materials': [t['id'] for t in self.materials['tasks']],
            'evaluated tasks': load('evaluated-tasks.json'),
            'task catalog': [t['id'] for t in load('task-catalog.json')['tasks']],
        }
        sources.update({f'waffle-{view}.csv': sorted({r['task_id'] for r in rows(f'waffle-{view}.csv')}) for view in VIEWS})
        for name, ids in sources.items():
            with self.subTest(name):
                self.assertEqual(sorted(ids), expected)
        self.assertEqual(self.board['total_tasks'], 70)
        self.assertEqual({m['id'] for m in self.waffle['models']}, {m['id'] for m in self.cohort['models']})

    def test_leaderboard_pools_the_per_task_test_counts(self):
        for view in VIEWS:
            for model in self.board['views'][view]:
                scored = [e for t in self.waffle['tasks'] for e in [entry(t, model, view)] if e['status'] == 'scored']
                passed, total = sum(e['passed'] for e in scored), sum(e['total'] for e in scored)
                with self.subTest(view=view, model=model['id']):
                    self.assertEqual(model['coverage']['overall'], len(scored))
                    self.assertEqual(model['score_counts']['overall'], {'passed': passed, 'total': total})
                    self.assertAlmostEqual(model['overall'], 100 * passed / total)
                    for profiles in model['pareto'].values():
                        for profile in profiles.values():
                            self.assertEqual(profile['count'], len(profile['task_ids']))
                            self.assertLessEqual(set(profile['task_ids']), set(self.ids))
        self.assertEqual(load('leaderboard.json'), self.board['views']['overview'])

    def test_csv_exports_match_the_json(self):
        models = {m['name']: m for m in self.waffle['models']}
        tasks = {t['id']: t for t in self.waffle['tasks']}
        for view in VIEWS:
            board = rows(f'leaderboard-{view}.csv')
            self.assertEqual([r['model'] for r in board], [m['name'] for m in self.board['views'][view]])
            for row, model in zip(board, self.board['views'][view]):
                self.assertAlmostEqual(float(row['overall']), model['overall'])
            per_task = rows(f'waffle-{view}.csv')
            self.assertEqual(len(per_task), len(tasks) * len(models))
            for row in per_task:
                e = entry(tasks[row['task_id']], models[row['model']], view)
                with self.subTest(view=view, task=row['task_id'], model=row['model']):
                    self.assertEqual(row['status'], e['status'])
                    if e['status'] == 'scored':
                        self.assertEqual((int(row['passed']), int(row['total'])), (e['passed'], e['total']))
        self.assertEqual((DATA / 'leaderboard.csv').read_text(), (DATA / 'leaderboard-overview.csv').read_text())

    def test_waffle_cells_link_to_recorded_runs(self):
        runs = {(t['id'], model): {r['id'] for r in value['runs']}
                for t in self.materials['tasks'] for model, value in t['models'].items()}
        for task in self.waffle['tasks']:
            for model, result in task['results'].items():
                for e in result['contexts'].values():
                    if e.get('run'):
                        self.assertIn(e['run'], runs[(task['id'], model)])

    def test_records_carry_only_published_fields(self):
        self.assertEqual(set(self.cohort), {'tasks', 'models', 'cohort_id'})
        for task in self.waffle['tasks']:
            for result in task['results'].values():
                for e in result['contexts'].values():
                    self.assertLessEqual(set(e), {'status', 'passed', 'total', 'value', 'label', 'context', 'run', 'failure_kind'})
        for task in self.materials['tasks']:
            for value in task['models'].values():
                for run in value['runs']:
                    self.assertLessEqual(set(run), {'id', 'context', 'scores', 'score_note', 'code'})
                    for score in run['scores']:
                        self.assertLessEqual(set(score), {'value', 'context'})

    def test_pages_embed_the_current_data(self):
        self.assertEqual(inline_json('index.html', 'waffle-data'), self.waffle)
        self.assertEqual(inline_json('index.html', 'leaderboard-data'), self.board)
        bibtex = (ROOT / 'CITATION.bib').read_text(encoding='utf-8').strip()
        page_text = (ROOT / 'index.html').read_text(encoding='utf-8')
        code = re.search(r'<pre[^>]*id="bibtex"[^>]*><code>(.*?)</code></pre>', page_text, re.S).group(1)
        self.assertEqual(html.unescape(code), bibtex)
        names = re.findall(r'<li><a href="tasks.html\?task=[^"]+">([^<]+)</a></li>', page_text)
        self.assertEqual(sorted(html.unescape(n) for n in names), sorted(t['name'] for t in self.cohort['tasks']))

    def test_headline_numbers_match_the_data(self):
        tests = sum(case_count(t) for t in self.waffle['tasks'])
        best = max(m['overall'] for m in self.board['views']['overview'])
        for name in ('CITATION.cff', 'llms.txt'):
            text = (ROOT / name).read_text(encoding='utf-8')
            with self.subTest(name):
                self.assertIn(f'{len(self.ids)} ', text)
                self.assertIn(f'{tests:,} hidden tests', text)
        self.assertIn(f'{best:.1f}%', (ROOT / 'llms.txt').read_text(encoding='utf-8'))
        page = (ROOT / 'index.html').read_text(encoding='utf-8')
        self.assertIn(f'<span data-fact="tests">{tests:,}</span>', page)
        self.assertIn(f'<em data-fact="best-overall">{best:.1f}%</em>', page)
        card = (ROOT / 'tools/og.html').read_text(encoding='utf-8')
        self.assertIn(f'id="og-task-count">{len(self.ids)}<', card)
        self.assertIn(f'id="og-best-score">{best:.1f}%<', card)

    def test_demo_shows_one_real_run_with_its_leaderboard_result(self):
        demo = load('demo-task.json')
        self.assertIn(demo['task'], self.ids)
        self.assertEqual(demo['threshold'], 0.75)
        run = demo['run']
        self.assertEqual(sum(g[0] for g in run['groups'].values()), run['passed'])
        self.assertEqual(sum(g[1] for g in run['groups'].values()), run['total'])
        model = next(m for m in self.waffle['models'] if m['name'] == demo['model'])
        task = next(t for t in self.waffle['tasks'] if t['id'] == demo['task'])
        published = task['results'][model['id']]['contexts']['recorded']
        self.assertEqual(published['total'], run['total'])
        self.assertEqual(published['passed'], run['passed'])

        pages = {p['id']: p for p in demo['pages']}
        markers = {m['test']: m for m in demo['markers'] if 'test' in m}
        for page in demo['pages']:
            sizes = ('780',) if page.get('phone') else ('1240', '2480')
            for side in ('reference', 'rebuild'):
                for size in sizes:
                    with self.subTest(page=page['id'], side=side, size=size):
                        self.assertTrue((ROOT / f"assets/previews/{demo['task']}/{page['id']}-{side}-{size}.webp").is_file())
        for marker in demo['markers']:
            with self.subTest(marker=marker['n']):
                self.assertIn(marker['page'], pages)
                self.assertTrue(0 <= marker['x'] <= 100 and 0 <= marker['y'] <= 100)

        manifest = (ROOT / 'index.html').read_text(encoding='utf-8')
        rows = re.findall(r'<li class="dt-row (ok|bad)" data-test="([^"]+)">', manifest)
        self.assertEqual(len(rows), len(demo['tests']))
        for test, (status, case_id) in zip(demo['tests'], rows):
            with self.subTest(case=test['id']):
                self.assertEqual(case_id, test['id'])
                passed = test['functional'] and test.get('ssim', 1.0) >= demo['threshold']
                self.assertEqual(status, 'ok' if passed else 'bad')
                self.assertTrue(test['id'].startswith(demo['task'] + '-'))
                if 'ssim' in test:
                    shown = float(re.search(r'similarity (\d\.\d+)', test['detail']).group(1))
                    self.assertLess(abs(shown - test['ssim']), 1.1e-4)
                    self.assertEqual('below' in test['detail'], not passed)
                if 'page' in test:
                    self.assertIn(test['page'], pages)
                if test['id'] in markers:
                    self.assertEqual(markers[test['id']]['page'], test['page'])
        self.assertEqual(inline_json('index.html', 'demo-data'), demo)

        for name in ('index.html', 'assets/js/site.js', 'assets/css/site.css', 'llms.txt', 'README.md'):
            text = (ROOT / name).read_text(encoding='utf-8').lower()
            with self.subTest(name):
                self.assertNotIn('illustrative', text)
                self.assertNotIn('mock', text)


if __name__ == '__main__':
    unittest.main()
