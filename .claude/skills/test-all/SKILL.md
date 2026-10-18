---
name: test-all
description: Run every Feniq test suite (backend, web, phoenix) with the right flags and report the result in two lines. Use when the owner asks to "run the tests", "شغّل الاختبارات", or before opening/merging a PR.
---

# Run all Feniq tests

Run the three suites from the repo root. Run them in parallel when you can
(separate Bash calls), since phoenix is the slowest.

1. **Backend** (in-memory MongoDB; both variables only need to exist):
   ```bash
   cd backend && MONGODB_URI=${MONGODB_URI:-mongodb://127.0.0.1:27017/unused} \
     JWT_SECRET=${JWT_SECRET:-$(openssl rand -hex 32)} \
     node --test --test-concurrency=4 "test/**/*.test.js" 2>&1 | tail -15
   ```
   `--test-concurrency=4`: the default (one per core) breaks setup on 16-core
   machines.
2. **Web**: `cd web && npx vitest run 2>&1 | tail -8`, then `npx oxlint src | tail -3`
   (warnings are fine, errors are not).
3. **Phoenix**: `cd phoenix && flutter test --reporter=failures-only 2>&1 | tail -25`.
   If `flutter` is missing, say so; on a cloud session the SessionStart hook
   installs it.

If a suite fails, rerun only the failing file once to rule out a flake, then
show the failing test name and its first error line.

## Report

Two lines in Arabic, then details only for failures:

```
✅ السيرفر 1363/1363 · ✅ الويب 458/458 · ✅ الموبايل 1259/1259
جاهز للدمج
```

Use ❌ and the failing count when something fails, and never call a red suite
green. If a failure also happens on `main`, say «قديمة، مش من هالتعديل».
