"""Input and evidence safety tests; no emulator, credentials or network required."""
import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('review', Path(__file__).with_name('android_interactive_review.py'))
review = importlib.util.module_from_spec(spec)
spec.loader.exec_module(review)


class ReviewSafety(unittest.TestCase):
    def test_only_bounded_ui_commands_are_accepted(self):
        for action in [
            {'op': 'shell', 'value': 'curl example.org'},
            {'op': 'tap', 'x': True, 'y': 10},
            {'op': 'tap', 'x': 720, 'y': 0},
            {'op': 'swipe', 'x1': 1, 'y1': 1, 'x2': 2, 'y2': 2, 'duration': 9999},
            {'op': 'wait', 'seconds': 3600},
            {'op': 'credential', 'role': 'production', 'field': 'password'},
            {'op': 'key', 'value': 'POWER'},
            {'op': 'network', 'enabled': 1},
            {'op': 'text', 'value': 'line\nbreak'},
        ]:
            with self.subTest(action=action), self.assertRaises(ValueError):
                review.validated({'id': 1, 'actions': [action]})
        with self.assertRaises(ValueError):
            review.validated({'id': 1, 'actions': [{'op': 'snapshot'}] * 13})
        self.assertEqual(review.validated({'id': 1, 'actions': [{'op': 'credential', 'role': 'pharmacy', 'field': 'password'}]})[0]['role'], 'pharmacy')

    def test_text_is_quoted_for_android_shell(self):
        instance = review.Review.__new__(review.Review)
        with patch.object(instance, 'adb') as adb:
            instance.text("a'b;$(echo unsafe) & x")
        quoted = adb.call_args.args[-1]
        import shlex
        self.assertEqual(shlex.split(quoted), ["a'b;$(echo%sunsafe)%s&%sx"])

    def test_password_entry_never_captures_screen_or_ui(self):
        instance = review.Review.__new__(review.Review)
        instance.secret_entry = True
        instance.accounts = {'pharmacy': {'password': 'private-fixture-password'}}
        instance.screen = None
        instance.session = '123-1'
        instance.last_id = 1
        instance.history = [{'id': 1, 'ops': ['credential'], 'error': None}]
        instance.head = None
        instance.evidence = 'qa/android-evidence-123-1'
        blobs = []
        def blob(value, binary=False):
            blobs.append(value)
            return 'sha'
        instance.blob = blob
        instance.create_ref = lambda *args: ('head', 'tree')
        with patch.object(instance, 'adb') as adb:
            instance.screen_state()
        adb.assert_not_called()
        self.assertNotIn('private-fixture-password', json.dumps(blobs))
        self.assertIn('credential-entry-suppressed', json.dumps(blobs))

    def test_production_fixture_is_rejected_before_adb_or_github(self):
        with patch.dict('os.environ', {'GITHUB_REPOSITORY': 'owner/repo', 'FENIQ_UI_SESSION': '123-1', 'FENIQ_ACCEPTANCE_OUTPUT': '/tmp/not-read'}), patch.object(Path, 'read_text', return_value=json.dumps({'environment': 'production', 'api': 'https://example.org/api'})):
            with self.assertRaisesRegex(ValueError, 'LOCAL_FIXTURE_REQUIRED'):
                review.Review()


if __name__ == '__main__':
    unittest.main()
