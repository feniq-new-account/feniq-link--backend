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

    old_releases = previous / "releases"
    if old_releases.is_dir():
        shutil.copytree(old_releases, output / "releases")

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
        build = str(release.get("build", ""))
        version_name = release.get("versionName", "")
        if not re.fullmatch(r"[1-9][0-9]{0,9}", build) or int(build) > 2100000000:
            raise ValueError("Invalid Android build number")
        if not re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+", version_name):
            raise ValueError("Missing verified Android version name")
        digest = hashlib.sha256(candidate.read_bytes()).hexdigest()
        if release.get("sha256") != digest:
            raise ValueError("APK digest differs from the verified build manifest")
        if int(build) == int(version.get("build") or 0) and version.get("sha256") != digest:
            raise ValueError("A published build number cannot identify different APK bytes")
        if int(build) >= int(version.get("build") or 0):
            shutil.copy2(candidate, output / "feniq.apk")
            filename = f"releases/{build}-{digest[:12]}.apk"
            (output / "releases").mkdir(exist_ok=True)
            shutil.copy2(candidate, output / filename)
            version = {"apk": True, "build": build, "versionName": version_name,
                       "file": filename, "applicationId": APPLICATION_ID, "date": release["date"],
                       "size": candidate.stat().st_size, "sha256": digest,
                       "certificateSha256": release["certificateSha256"]}
    elif candidate.is_file():
        print("::warning::APK has no verified release manifest; retaining the previous download.")

    if not version.get("apk"):
        raise ValueError("No usable Android download; retain the existing publication")
    (output / "version.json").write_text(json.dumps(version) + "\n")
    return version


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("source", "apk", "previous", "output"):
        parser.add_argument("--" + name, type=Path, required=True)
    parser.add_argument("--expected-cert", required=True)
    args = parser.parse_args()
    assemble(args.source, args.apk, args.previous, args.output, args.expected_cert)
