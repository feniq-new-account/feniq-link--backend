import unittest
from android_review_version import WORKFLOW, MAX_CODE, release_build_number


def history(*numbers):
    return {'workflow_runs': [{'path': WORKFLOW, 'run_number': n} for n in numbers]}


class AndroidReviewVersionTests(unittest.TestCase):
    def test_review_can_update_the_previous_release(self):
        self.assertGreater(release_build_number(history(37, 22)), 1000 + 22)

    def test_next_production_build_can_update_the_review(self):
        self.assertLess(release_build_number(history(37)), 1000 + 38)

    def test_other_workflow_counters_do_not_inflate_the_code(self):
        payload = history(37)
        payload['workflow_runs'].append({'path': 'another.yml', 'run_number': MAX_CODE})
        self.assertEqual(release_build_number(payload), 1037)

    def test_missing_release_history_fails_instead_of_using_pubspec_one(self):
        for payload in ({}, {'workflow_runs': []}):
            with self.subTest(payload=payload), self.assertRaises(ValueError):
                release_build_number(payload)

    def test_invalid_counters_are_rejected(self):
        for number in (None, True, 0, -1, 1.5, '37', MAX_CODE):
            with self.subTest(number=number), self.assertRaises(ValueError):
                release_build_number(history(number))
