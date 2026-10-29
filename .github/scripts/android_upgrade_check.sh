#!/usr/bin/env bash
# Ephemeral emulator only. No users or production database are touched.
set -euo pipefail
mkdir -p apk/evidence
prior=apk/baseline/feniq-prelaunch-universal.apk
current=apk/current/app-release.apk
build_tools=$(find "${ANDROID_HOME:?}/build-tools" -mindepth 1 -maxdepth 1 -type d | sort -V | tail -1)
expected=$(tr -d ' :\r\n' < .github/android-certificate.sha256 | tr 'a-f' 'A-F')
cert_of() { "$build_tools/apksigner" verify --print-certs "$1" | sed -n 's/^.*certificate SHA-256 digest: //p' | head -1 | tr 'a-f' 'A-F'; }
code_of() { "$build_tools/aapt2" dump badging "$1" | sed -n "s/^package:.*versionCode='\([0-9]*\)'.*/\1/p"; }
[ "$(cert_of "$prior")" = "$expected" ]
[ "$(cert_of "$current")" = "$expected" ]
prior_code=$(code_of "$prior")
current_code=$(code_of "$current")
[ "$current_code" -gt "$prior_code" ]
[ "$("$build_tools/aapt2" dump packagename "$current")" = com.feniq.link ]
"$build_tools/zipalign" -c -P 16 4 "$current"
"$build_tools/aapt2" dump badging "$current" > apk/evidence/current-badging.txt
for abi in arm64-v8a armeabi-v7a x86_64; do
  grep -q "'$abi'" apk/evidence/current-badging.txt
done
(cd apk/baseline && sha256sum -c SHA256SUMS)
current_digest=$(jq -r .sha256 apk/current/release.json)
[ "$(sha256sum "$current" | cut -d ' ' -f 1)" = "$current_digest" ]
adb root
adb wait-for-device
# Prevent the review install from contacting any application server.
adb shell svc wifi disable
adb shell svc data disable
adb install "$prior" | tee apk/evidence/baseline-install.txt
adb shell am start -W -n com.feniq.link/.MainActivity > apk/evidence/baseline-launch.txt
grep -q 'Status: ok' apk/evidence/baseline-launch.txt
adb shell am force-stop com.feniq.link
support=/data/user/0/com.feniq.link/files
# Same folder and JSON envelope as OfflineStore. This probes OS retention,
# not a logged-in pharmacist's complete catalog/UI (covered in Flutter tests).
cat > apk/evidence/private-storage-probe.json <<'JSON'
{"savedAt":"2026-10-29T00:00:00.000Z","data":{"probe":"permanent-catalog-upgrade","version":1,"pharmacyId":"test-only","products":[{"name":"Offline sample","price":1250}]}}
JSON
adb shell "mkdir -p $support/offline /data/user/0/com.feniq.link/cache"
app_uid=$(adb shell stat -c %u /data/user/0/com.feniq.link | tr -d '\r')
adb push apk/evidence/private-storage-probe.json "$support/offline/release_upgrade_probe.json"
adb shell "chown -R $app_uid:$app_uid $support"
adb shell 'echo cache-only > /data/user/0/com.feniq.link/cache/release_probe'
# Clear only cache directories. Private files and databases are excluded.
adb shell 'rm -rf /data/user/0/com.feniq.link/cache/* /data/user/0/com.feniq.link/code_cache/*'
adb exec-out cat "$support/offline/release_upgrade_probe.json" > apk/evidence/after-clear-cache.json
cmp apk/evidence/private-storage-probe.json apk/evidence/after-clear-cache.json
adb install -r "$current" | tee apk/evidence/upgrade-install.txt
adb exec-out cat "$support/offline/release_upgrade_probe.json" > apk/evidence/after-upgrade.json
cmp apk/evidence/private-storage-probe.json apk/evidence/after-upgrade.json
adb logcat -c
adb shell am start -W -n com.feniq.link/.MainActivity > apk/evidence/upgraded-launch.txt
grep -q 'Status: ok' apk/evidence/upgraded-launch.txt
sleep 8
adb shell pidof com.feniq.link > apk/evidence/upgraded-pid.txt
test -s apk/evidence/upgraded-pid.txt
adb logcat -d -b crash > apk/evidence/upgraded-crashes.txt
if grep -q 'Process: com.feniq.link' apk/evidence/upgraded-crashes.txt; then cat apk/evidence/upgraded-crashes.txt; exit 1; fi
adb exec-out screencap -p > apk/evidence/upgraded-startup.png
jq -n --argjson previous "$prior_code" --argjson current "$current_code" --arg cert "$expected" --arg sha "$current_digest" \
  '{previousBuild:$previous,currentBuild:$current,certificateSha256:$cert,sha256:$sha,signatureVerified:true,upgradeWithoutUninstall:true,privateFileSurvivedCacheClear:true,privateFileSurvivedUpgrade:true,launchVerified:true,scope:"Emulator storage probe; not a physical-phone or logged-in full-catalog test",publication:false}' > apk/evidence/validation.json
cat apk/evidence/validation.json
