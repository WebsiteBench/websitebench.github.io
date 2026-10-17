"""Exercise the source conflicts that previously produced misleading coverage."""
import unittest

from build_unified_catalog import choose_score, context


def row(**fields):
    return dict(source_row=2, source_cell='N2', fields=fields)


def old(value, status='scored'):
    return dict(raw_value=value, status=status, source_cell='O9', total=int(value.split('/')[1]) if value else None)


class UnifiedCatalogTests(unittest.TestCase):
    def test_new_publication_replaces_old_value_without_maximum_selection(self):
        score = choose_score([row(score='0/1783', feedbacks='5dcebb73有效；原run')], [old('159/1783')], [], '1m')
        self.assertEqual((score['status'], score['passed'], score['total']), ('scored', 0, 1783))

    def test_current_invalid_or_closed_result_does_not_inherit_old_score(self):
        for reason in ['INVALID_RUN，成绩留空，非零分', '评测无效；该版本保留无分']:
            score = choose_score([row(feedbacks=reason)], [old('39/700')], [], '200k')
            self.assertEqual(score['status'], 'invalid')
            self.assertIsNone(score['passed'])

    def test_unexecuted_placeholder_does_not_withdraw_a_published_result(self):
        score = choose_score([row(**{'model name': 'gpt-6.1-sol', '负责人': 'owner'})], [old('106/765')], [], '258k')
        self.assertEqual(score['fraction'], '106/765')
        self.assertTrue(score['placeholder_row'])

    def test_legacy_metric_is_preserved_but_not_compared(self):
        score = choose_score([row(score='340/1000', feedbacks='原版1000case，T2为functional_passed，非5dce新版')], [], [], '200k')
        self.assertEqual(score['fraction'], '340/1000')
        self.assertEqual(score['metric'], 'legacy_reported_fraction')
        self.assertFalse(score['comparable'])

    def test_duplicate_rows_do_not_create_extra_scores(self):
        score = choose_score([row(score='192/393'), row(score='192/393')], [], [], '1m')
        self.assertEqual(score['fraction'], '192/393')
        conflict = choose_score([row(score='192/393'), row(score='190/393')], [], [], '1m')
        self.assertEqual(conflict['status'], 'conflict')
        self.assertIsNone(conflict['passed'])

    def test_rounding_does_not_merge_distinct_contexts(self):
        self.assertEqual(context('258.4K'), context('258k-xhigh'))
        self.assertNotEqual(context('1M'), context('200k'))
        self.assertEqual(context('未记录'), 'recorded')


if __name__ == '__main__':
    unittest.main()
