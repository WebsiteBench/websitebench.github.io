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


def load(name):
    return json.loads((DATA / name).read_text(encoding='utf-8'))


def rows(name):
    with (DATA / name).open(newline='', encoding='utf-8') as handle:
        return list(csv.DictReader(handle))


def entry(task, model):
    return task['results'][model['id']]


def case_count(task):
    """A task's hidden test count: the total used by most of its scored results."""
    totals = Counter(e['total'] for e in task['results'].values() if e['status'] == 'scored')
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
            'waffle-overview.csv': sorted({r['task_id'] for r in rows('waffle-overview.csv')}),
        }
        for name, ids in sources.items():
            with self.subTest(name):
                self.assertEqual(sorted(ids), expected)
        self.assertEqual(self.board['total_tasks'], 70)
        self.assertEqual({m['id'] for m in self.waffle['models']}, {m['id'] for m in self.cohort['models']})

    def test_leaderboard_pools_the_per_task_test_counts(self):
        for model in self.board['models']:
            scored = [e for t in self.waffle['tasks'] for e in [entry(t, model)] if e['status'] == 'scored']
            passed, total = sum(e['passed'] for e in scored), sum(e['total'] for e in scored)
            with self.subTest(model=model['id']):
                self.assertEqual(model['score_counts']['overall'], {'passed': passed, 'total': total})
                self.assertAlmostEqual(model['overall'], 100 * passed / total)
        self.assertEqual(load('leaderboard.json'), self.board['models'])

    def test_public_data_has_no_coverage_counts(self):
        banned = {'coverage', 'pareto', 'costStr', 'total_tasks'}
        for model in self.board['models']:
            with self.subTest(model=model['id']):
                self.assertFalse(banned & set(model))
        self.assertEqual(list(rows('leaderboard-overview.csv')[0]), ['model', 'overall', 'request', 'browser', 'system', 'cost', 'tokens_millions', 'turns'])
        self.assertNotIn('Coverage', self.board['aggregation'])

    def test_csv_exports_match_the_json(self):
        models = {m['name']: m for m in self.waffle['models']}
        tasks = {t['id']: t for t in self.waffle['tasks']}
        board = rows('leaderboard-overview.csv')
        self.assertEqual([r['model'] for r in board], [m['name'] for m in self.board['models']])
        for row, model in zip(board, self.board['models']):
            self.assertAlmostEqual(float(row['overall']), model['overall'])
        per_task = rows('waffle-overview.csv')
        self.assertEqual(len(per_task), len(tasks) * len(models))
        for row in per_task:
            e = entry(tasks[row['task_id']], models[row['model']])
            with self.subTest(task=row['task_id'], model=row['model']):
                self.assertEqual(row['status'], e['status'])
                if e['status'] == 'scored':
                    self.assertEqual((int(row['passed']), int(row['total'])), (e['passed'], e['total']))
        self.assertEqual((DATA / 'leaderboard.csv').read_text(), (DATA / 'leaderboard-overview.csv').read_text())

    def test_waffle_cells_link_to_recorded_runs(self):
        runs = {(t['id'], model): {r['id'] for r in value['runs']}
                for t in self.materials['tasks'] for model, value in t['models'].items()}
        for task in self.waffle['tasks']:
            for model, e in task['results'].items():
                if e.get('run'):
                    self.assertIn(e['run'], runs[(task['id'], model)])

    def test_previews_show_recorded_runs_and_existing_images(self):
        runs = {t['id']: {r['id'] for value in t['models'].values() for r in value['runs']} for t in self.materials['tasks']}
        for task, value in load('task-previews.json')['tasks'].items():
            self.assertIn(task, self.ids)
            for view in value['views']:
                self.assertEqual({'id', 'label', 'route', 'viewport', 'reference', 'runs'}, set(view))
                images = [view['reference']['image']] + [shot['image'] for shot in view['runs'].values() if 'image' in shot]
                with self.subTest(task=task, view=view['id']):
                    self.assertLessEqual(set(view['runs']), runs[task])
                    for image in images:
                        self.assertTrue((ROOT / image).is_file(), image)

    def test_records_carry_only_published_fields(self):
        self.assertEqual(set(self.cohort), {'tasks', 'models', 'cohort_id'})
        for task in self.waffle['tasks']:
            for e in task['results'].values():
                self.assertLessEqual(set(e), {'status', 'passed', 'total', 'value', 'run', 'failure_kind'})
        for task in self.materials['tasks']:
            for value in task['models'].values():
                for run in value['runs']:
                    self.assertLessEqual(set(run), {'id', 'scores', 'score_note', 'code', 'failure_kind'})
                    for score in run['scores']:
                        self.assertLessEqual(set(score), {'value'})

    def test_pages_embed_the_current_data(self):
        self.assertEqual(inline_json('index.html', 'waffle-data'), self.waffle)
        self.assertEqual(inline_json('index.html', 'leaderboard-data'), self.board)
        bibtex = (ROOT / 'CITATION.bib').read_text(encoding='utf-8').strip()
        page_text = (ROOT / 'index.html').read_text(encoding='utf-8')
        sheet = (ROOT / 'tasks.html').read_text(encoding='utf-8')
        code = re.search(r'<pre[^>]*id="bibtex"[^>]*><code>(.*?)</code></pre>', page_text, re.S).group(1)
        self.assertEqual(html.unescape(code), bibtex)
        names = re.findall(r'<span class="task-card-name" title="[^"]*">([^<]+)</span>', sheet)
        self.assertEqual(sorted(html.unescape(n) for n in names), sorted(t['name'] for t in self.cohort['tasks']))

    def test_headline_numbers_match_the_data(self):
        tests = sum(case_count(t) for t in self.waffle['tasks'])
        best = max(m['overall'] for m in self.board['models'])
        for name in ('CITATION.cff', 'llms.txt'):
            text = (ROOT / name).read_text(encoding='utf-8')
            with self.subTest(name):
                self.assertIn(f'{len(self.ids)} ', text)
                self.assertIn(f'{tests:,} hidden tests', text)
        self.assertIn(f'{best:.1f}%', (ROOT / 'llms.txt').read_text(encoding='utf-8'))
        page = ''.join((ROOT / name).read_text(encoding='utf-8') for name in ('index.html', 'eval.html', 'analysis.html'))
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
        self.assertEqual((demo['task'], demo['model']), ('ubereats', 'Qwen 3.8 Max'))
        self.assertEqual((run['recording'], run['passed'], run['total']), ('a1f93a9dd1349a75ab750e80', 39, 338))
        self.assertEqual(run['groups'], {'request': [9, 50], 'browser': [17, 209], 'system': [13, 79]})
        # The demo, the Waffle and the leaderboard all read this one result.
        result = entry(task, model)
        self.assertEqual((result['run'], result['total'], result['passed']), (run['recording'], run['total'], run['passed']))
        materials = next(t for t in load('task-materials.json')['tasks'] if t['id'] == demo['task'])
        row = next(r for r in materials['models'][model['id']]['runs'] if r['id'] == run['recording'])
        self.assertEqual(row['scores'][0]['value'], f"{run['passed']}/{run['total']}")

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

        manifest = (ROOT / 'eval.html').read_text(encoding='utf-8')
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
        self.assertEqual(inline_json('eval.html', 'demo-data'), demo)
        for stale in ('Amazon (local copy)', 'demo-data">{"task":"amazon"'):
            self.assertNotIn(stale, manifest)
        for text in (f"<b>{demo['site']}</b><span>{demo['model']}</span>", f'<span class="side side-cand" aria-hidden="true">{demo["model"]}</span>', '<span class="side side-ref" aria-hidden="true">Reference</span>'):
            self.assertIn(text, manifest)

        for name in ('index.html', 'eval.html', 'assets/js/site.js', 'assets/css/site.css', 'llms.txt', 'README.md'):
            text = (ROOT / name).read_text(encoding='utf-8').lower()
            with self.subTest(name):
                self.assertNotIn('illustrative', text)
                self.assertNotIn('mock', text)


class VisibilityTests(unittest.TestCase):
    ORIGIN = 'https://website-bench.com'

    @classmethod
    def setUpClass(cls):
        cls.names = sorted(p.name for p in (ROOT / 'task').glob('*.html'))
        cls.sitemap = re.findall(r'<loc>([^<]+)</loc>', (ROOT / 'sitemap.xml').read_text(encoding='utf-8'))
        cls.llms = (ROOT / 'llms.txt').read_text(encoding='utf-8')

    def test_every_task_has_a_static_page_in_the_sitemap(self):
        self.assertEqual(len(self.names), 70)
        self.assertEqual(len(self.sitemap), 75)
        for name in self.names:
            with self.subTest(name):
                slug = name[:-5]
                text = (ROOT / 'task' / name).read_text(encoding='utf-8')
                self.assertIn(f'<link rel="canonical" href="{self.ORIGIN}/task/{slug}">', text)
                self.assertIn(f'{self.ORIGIN}/task/{slug}', self.sitemap)
                self.assertEqual(len(re.findall(r'<h1\b', text)), 1)
                self.assertNotIn('<option', re.search(r'<h1\b.*?</h1>', text, re.S).group(0))
                self.assertNotIn('No result', text)

    def test_no_served_data_has_a_context_field(self):
        for path in ROOT.rglob('*.csv'):
            with self.subTest(path.name), path.open(newline='', encoding='utf-8') as handle:
                self.assertFalse([column for column in next(csv.reader(handle)) if 'context' in column.lower()])
        for path in DATA.glob('*.json'):
            with self.subTest(path.name):
                self.assertNotRegex(path.read_text(encoding='utf-8'), r'"(contexts?|records|default_view)"')

    def test_no_context_or_hidden_files_are_published(self):
        self.assertFalse((ROOT / 'hidden-contexts').exists())
        self.assertIn('Eight models', self.llms)
        self.assertNotRegex(self.llms, r'Nine models|\.html|visual artifacts')
        for page in ('index.html', 'run.html', 'tasks.html', 'eval.html', 'analysis.html'):
            with self.subTest(page):
                text = (ROOT / page).read_text(encoding='utf-8')
                self.assertIn('application/ld+json', text)
                self.assertIn('twitter:image', text)
                self.assertNotIn('#0D1015', text)
                self.assertNotIn('#22252E', text)


if __name__ == '__main__':
    unittest.main()
