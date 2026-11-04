#!/usr/bin/env python3
"""Assemble the site while retaining the last usable Android download."""
import argparse
import hashlib
import json
import re
import shutil
from pathlib import Path

PRODUCTION_API = "https://feniq-connect-api.onrender.com/api"
APPLICATION_ID = "com.feniq.link"


def fingerprint(value):
    return value.replace(":", "").replace(" ", "").upper()


def assemble(source, apk, previous, output, expected_cert):
    shutil.copytree(source, output)
    version = {"apk": False}
    old_apk = previous / "feniq.apk"
    old_version = previous / "version.json"
    if old_apk.is_file():
        # A malformed previous manifest must not silently delete the old APK.
        version = json.loads(old_version.read_text())
        if not version.get("apk"):
            raise ValueError("The previous APK has no usable version manifest")
        shutil.copy2(old_apk, output / "feniq.apk")

    candidate = apk / "app-release.apk"
    manifest = apk / "release.json"
    if candidate.is_file() and manifest.is_file():
        release = json.loads(manifest.read_text())
        expected = fingerprint(expected_cert)
        if not re.fullmatch(r"[0-9A-F]{64}", expected):
            raise ValueError("ANDROID_CERT_SHA256 must contain the production signing fingerprint")
        if release.get("apiBaseUrl") != PRODUCTION_API or release.get("applicationId") != APPLICATION_ID:
            raise ValueError("Refusing to publish an APK for a different API or application id")
        if fingerprint(release.get("certificateSha256", "")) != expected:
            raise ValueError("Refusing to publish an APK signed by a different certificate")
        digest = hashlib.sha256(candidate.read_bytes()).hexdigest()
        if release.get("sha256") != digest:
            raise ValueError("APK digest differs from the verified build manifest")
        if int(release["build"]) >= int(version.get("build") or 0):
            shutil.copy2(candidate, output / "feniq.apk")
            version = {"apk": True, "build": release["build"], "date": release["date"],
                       "size": candidate.stat().st_size, "sha256": digest,
                       "certificateSha256": release["certificateSha256"]}
    elif candidate.is_file():
        print("::warning::APK has no verified release manifest; retaining the previous download.")

    (output / "version.json").write_text(json.dumps(version) + "\n")
    return version


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("source", "apk", "previous", "output"):
        parser.add_argument("--" + name, type=Path, required=True)
    parser.add_argument("--expected-cert", required=True)
    args = parser.parse_args()
    assemble(args.source, args.apk, args.previous, args.output, args.expected_cert)
