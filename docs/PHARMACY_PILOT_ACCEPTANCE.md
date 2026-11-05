# Feniq Link: Pharmacy pilot acceptance gates

Scope: non-financial Flutter pharmacy readiness. CI passing alone does not verify live API, phone hardware or APK upgrades. No deployment or checkout enablement is authorized here.

## Code, server and APK
- [ ] Release SHA has green CI and required PRs merged.
- [ ] Record app ID, version name, build number, signing fingerprint and APK SHA-256.
- [ ] Verify the real deployed API health endpoint and database connectivity without exposing credentials.
- [ ] Validate the update manifest, HTTPS immutable APK URL, certificate, digest, size and download.
- [ ] Install on a physical Android phone; reboot, relaunch, and upgrade over an older build without deleting data.
- [ ] Verify optional and mandatory Android update behavior per configured role.

## Pharmacy access tests
- [ ] Register valid pharmacy with Syrian phone, area type and address; OTP intentionally disabled.
- [ ] Skip map; confirm saved location remains absent rather than (0,0).
- [ ] Invalid and oversized signup fields return controlled client errors.
- [ ] Duplicate phone does not log into an existing account.
- [ ] Test syndicate match, unmatched pending approval, manual approval and Telegram alerts.
- [ ] Pending pharmacy may check status and edit own profile, but not browse warehouses.
- [ ] After admin approval, existing session can browse; blocked and deleted accounts are restricted.
- [ ] Confirm Arabic messages, accessibility text scaling, and screen transitions.

## Support and network resilience
- [ ] Forgot password opens human WhatsApp support; fallback contact number can be copied.
- [ ] Admin reset forces password change and invalidates previous sessions.
- [ ] Test loss and restoration of network during signup, login and status refresh.
- [ ] Test app resume, force-close/restart and expired sessions on a real device.

## Pharmacy licence: implementation gap
The backend pharmacy schema has reserved licenseNumber/licenseImage fields, but there is not yet a verified upload/review/deadline flow. Do not store official documents in publicly accessible catalog or banner image storage.
- [ ] Decide whether a limited pilot without licence enforcement is lawful and acceptable; otherwise treat the missing workflow as launch-blocking.
- [ ] Add private storage and authenticated, validated file upload, with administrator-only document access.
- [ ] Add submission/review status, approval timestamp, 14-day deadline and audit trail.
- [ ] Enforce expiry only on new-order capability, never browsing. This intersects ordering and remains Codex-owned.
- [ ] Test reupload, appeals, and denial of other pharmacies' access to private files.

## Limited pilot
- [ ] Get operator signoff for security, legal/privacy and backup/recovery gates.
- [ ] Test with 5–10 consenting pharmacies; log device, OS, build, steps to reproduce and defect owner.
- [ ] Expand only after no critical signup, session or approval defects remain.

## Reserved for Codex
Financial accounts and permissions, checkout/order financial effects, pricing, discounts, commission, payment, collections, debt, statements and settlements.
