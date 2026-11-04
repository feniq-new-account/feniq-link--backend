#!/usr/bin/env bash
# Install the exact Android toolchain before Gradle starts. In particular the
# pinned NDK may require the preview license, absent from hosted runner images.
set -euo pipefail
sdk_root="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
: "${sdk_root:?ANDROID_HOME or ANDROID_SDK_ROOT must identify the Android SDK}"
sdkmanager="$sdk_root/cmdline-tools/latest/bin/sdkmanager"
[ -x "$sdkmanager" ] || { echo 'Android SDK manager is unavailable.' >&2; exit 1; }
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ndk_version=$(sed -n 's/^[[:space:]]*ndkVersion = "\([^"]*\)".*/\1/p' "$script_dir/app/build.gradle.kts")
[ -n "$ndk_version" ] || { echo 'Project NDK version is missing.' >&2; exit 1; }
accept_and_run() {
  # yes exits with SIGPIPE when sdkmanager finishes. Check sdkmanager's status
  # rather than ignoring errors or confusing that expected SIGPIPE with failure.
  set +e
  yes | "$sdkmanager" --sdk_root="$sdk_root" "$@"
  result=${PIPESTATUS[1]}
  set -e
  return "$result"
}
accept_and_run --licenses > /dev/null
# Firebase and notification/permission plugins compile against SDK 34 and 35;
# AGP's desugaring tasks also select Build Tools 35 with compileSdk 36.
# Install every required version instead of relying on a hosted runner's cache.
accept_and_run 'platform-tools' 'platforms;android-34' 'platforms;android-35' 'platforms;android-36' 'build-tools;35.0.0' 'build-tools;36.0.0' 'cmake;3.22.1' "ndk;$ndk_version"
