"""CI must forward SDK manager failures while accepting yes's normal SIGPIPE."""
import os
import subprocess
import tempfile
import unittest
from pathlib import Path
SCRIPT = Path(__file__).resolve().parents[2] / 'phoenix/android/install-ci-sdk.sh'

class AndroidSdkTests(unittest.TestCase):
    def run_manager(self, fail):
        with tempfile.TemporaryDirectory() as directory:
            manager = Path(directory) / 'cmdline-tools/latest/bin/sdkmanager'
            manager.parent.mkdir(parents=True)
            manager.write_text('#!/usr/bin/env bash\nif [[ "$*" == *--licenses* ]]; then exit 0; fi\nexit "$INSTALL_RESULT"\n')
            manager.chmod(0o700)
            return subprocess.run(['bash', str(SCRIPT)], env={**os.environ, 'ANDROID_HOME': directory, 'INSTALL_RESULT': str(fail)}, capture_output=True, timeout=10)
    def test_expected_yes_sigpipe_does_not_fail_successful_install(self):
        self.assertEqual(self.run_manager(0).returncode, 0)
    def test_sdk_install_failure_is_not_swallowed(self):
        self.assertEqual(self.run_manager(17).returncode, 17)

if __name__ == '__main__': unittest.main()
