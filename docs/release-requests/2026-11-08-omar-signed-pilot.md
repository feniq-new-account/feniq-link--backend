# Owner-requested signed Android APK — 2026-11-08

Purpose: create a fresh, signed Feniq Link Android APK for Omar to distribute to the first pharmacies. The previous APK has **not** been distributed.

Source: the release/pilot-signed-20261107 branch was fast-forwarded to the latest reviewed main commit 4d186c00f1c33dfb7146c6e16c726a7c8b1cc234 before this build request.
Includes previously merged Flutter warehouse-manager UX and accountant/admin web improvements; web dashboards are already deployed separately.

Security/production boundaries:
- This file only triggers the branch-scoped GitHub Actions signed pilot build. It changes no runtime code or backend.
- Do not publish or replace the existing fixed test-latest URL; keep the new APK under GitHub Actions Artifacts for owner acceptance.
- Must use the permanent Android signer, com.feniq.link, a monotonically increasing versionCode and the production API URL.
- Check workflow success, SHA-256 signing fingerprint, build number and APK artifact before sharing with Omar.
- No change to the published Android release policy, mandatory update thresholds, financial contracts, cash writers or production data.
