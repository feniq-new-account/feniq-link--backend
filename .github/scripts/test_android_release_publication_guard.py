"""Regression guard: an APK build must not silently replace test-latest.

Runs under the existing 'Website publication safeguards' Python unittest job.
This intentionally uses only the standard library; no YAML dependency in CI.
"""
from pathlib import Path
import re
import unittest

WORKFLOW = Path(__file__).resolve().parents[1] / "workflows" / "android-apk.yml"


class AndroidReleasePublicationGuardTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = WORKFLOW.read_text(encoding="utf-8")

    def test_publish_switch_is_explicit_boolean_and_defaults_off(self):
        match = re.search(
            r"(?ms)^      publish_test_release:\n(?P<body>(?:^        .*\n)+)",
            self.source,
        )
        self.assertIsNotNone(match, "missing manual publication input")
        body = match.group("body")
        self.assertRegex(body, r"(?m)^        type: boolean$")
        self.assertRegex(body, r"(?m)^        default: false$")
        self.assertRegex(body, r"(?m)^        required: false$")

    def test_all_fixed_download_steps_require_explicit_manual_main_opt_in(self):
        for name in (
            "Prepare universal phone APK",
            "Build emulator APK (x86_64)",
            "Publish to the test-latest release",
        ):
            with self.subTest(step=name):
                step = re.search(
                    r"(?ms)^      - name: " + re.escape(name)
                    + r"\n(?P<body>.*?)(?=^      - (?:name:|uses:)|^  upgrade-validation:|\Z)",
                    self.source,
                )
                self.assertIsNotNone(step, f"missing step {name}")
                gate = re.search(r"(?m)^        if: (.+)$", step.group("body"))
                self.assertIsNotNone(gate, f"missing if gate on {name}")
                condition = gate.group(1)
                for requirement in (
                    "github.event_name == 'workflow_dispatch'",
                    "inputs.publish_test_release == true",
                    "github.ref == 'refs/heads/main'",
                    "steps.signing.outputs.artifact == 'feniq-apk'",
                ):
                    self.assertIn(requirement, condition)

    def test_no_other_step_can_modify_fixed_release(self):
        self.assertEqual(self.source.count("gh release upload test-latest"), 1)
        self.assertEqual(self.source.count("gh release edit test-latest"), 1)
        self.assertEqual(self.source.count("gh release create test-latest"), 1)
        self.assertIn("name: ${{ steps.signing.outputs.artifact }}", self.source)
        self.assertIn("name: Verify signature", self.source)


    def test_website_has_no_automatic_deployment_triggers(self):
        website = (WORKFLOW.parent / "site-deploy.yml").read_text(encoding="utf-8")
        triggers = website.split("\non:\n", 1)[1].split("\npermissions:", 1)[0]
        self.assertIn("workflow_dispatch:", triggers)
        self.assertIn("apk_run_id:", triggers)
        self.assertNotRegex(triggers, r"(?m)^  push:")
        self.assertNotRegex(triggers, r"(?m)^  workflow_run:")

    def test_website_must_select_a_proven_manual_main_signed_artifact(self):
        website = (WORKFLOW.parent / "site-deploy.yml").read_text(encoding="utf-8")
        self.assertIn("APPROVED_RUN_ID: ${{ inputs.apk_run_id }}", website)
        self.assertIn('if [ -z "$APPROVED_RUN_ID" ]; then', website)
        self.assertIn('echo "id=$APPROVED_RUN_ID" >> "$GITHUB_OUTPUT"', website)
        for field in (".name", ".event", ".head_branch", ".status", ".conclusion"):
            self.assertIn(field, website)
        self.assertIn('.name == "feniq-apk" and .expired == false', website)
        self.assertNotIn("gh run list", website)
        self.assertNotIn("continue-on-error: true", website)


if __name__ == "__main__":
    unittest.main()
