import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("assemble_site", Path(__file__).with_name("assemble-site.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class PublicationTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.source, self.apk, self.old, self.out = [self.root / name for name in ("site", "apk", "old", "dist")]
        for path in (self.source, self.apk, self.old):
            path.mkdir()
        (self.source / "index.html").write_text("updated website")
        (self.old / "feniq.apk").write_bytes(b"last good download")
        (self.old / "version.json").write_text(json.dumps({"apk": True, "build": "1005"}))
        self.cert = "AB" * 32

    def run_assembly(self):
        return module.assemble(self.source, self.apk, self.old, self.out, self.cert)

    def candidate(self, **changes):
        data = b"verified APK"
        (self.apk / "app-release.apk").write_bytes(data)
        manifest = {"apiBaseUrl": module.PRODUCTION_API, "applicationId": module.APPLICATION_ID,
                    "certificateSha256": self.cert, "sha256": hashlib.sha256(data).hexdigest(),
                    "build": "1006", "date": "2026-10-27", **changes}
        (self.apk / "release.json").write_text(json.dumps(manifest))

    def test_expired_artifact_preserves_previous_download(self):
        self.assertTrue(self.run_assembly()["apk"])
        self.assertEqual((self.out / "feniq.apk").read_bytes(), b"last good download")

    def test_staging_api_and_wrong_certificate_are_rejected(self):
        self.candidate(apiBaseUrl="https://staging.example/api")
        with self.assertRaises(ValueError):
            self.run_assembly()
        import shutil
        shutil.rmtree(self.out)
        self.candidate(certificateSha256="CD" * 32)
        with self.assertRaises(ValueError):
            self.run_assembly()

    def test_verified_newer_production_apk_replaces_download(self):
        self.candidate()
        self.assertEqual(self.run_assembly()["build"], "1006")
        self.assertEqual((self.out / "feniq.apk").read_bytes(), b"verified APK")

    def test_older_apk_cannot_downgrade_public_download(self):
        self.candidate(build="1004")
        self.assertEqual(self.run_assembly()["build"], "1005")

    def test_tampered_apk_is_rejected(self):
        self.candidate(sha256="0" * 64)
        with self.assertRaises(ValueError):
            self.run_assembly()

    def test_unsigned_legacy_artifact_keeps_last_good(self):
        (self.apk / "app-release.apk").write_bytes(b"unverified")
        self.assertEqual(self.run_assembly()["build"], "1005")


if __name__ == "__main__":
    unittest.main()
