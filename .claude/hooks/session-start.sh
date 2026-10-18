#!/bin/bash
# Installs backend, web and Flutter (phoenix/) dependencies so tests run in Claude Code cloud sessions.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# Backend (npm install also lets mongodb-memory-server fetch its mongod binary)
(cd backend && npm install --no-audit --no-fund)

# Web dashboard
(cd web && npm install --no-audit --no-fund)

# Pharmacy app: same Flutter line as .github/workflows/android-apk.yml (3.35.x);
# a newer SDK rewrites phoenix/pubspec.lock.
FLUTTER_VERSION=3.35.7
FLUTTER_HOME=/opt/flutter-$FLUTTER_VERSION
if [ ! -x "$FLUTTER_HOME/bin/flutter" ]; then
  mkdir -p "$FLUTTER_HOME"
  curl -fsSL "https://storage.googleapis.com/flutter_infra_release/releases/stable/linux/flutter_linux_${FLUTTER_VERSION}-stable.tar.xz" \
    | tar -xJ -C "$FLUTTER_HOME" --strip-components=1
  git config --global --add safe.directory "$FLUTTER_HOME"
fi
export PATH="$FLUTTER_HOME/bin:$PATH"
flutter --disable-analytics >/dev/null 2>&1 || true
(cd phoenix && flutter pub get --enforce-lockfile)
echo "export PATH=\"$FLUTTER_HOME/bin:\$PATH\"" >> "$CLAUDE_ENV_FILE"

# Tests only need these to exist; the suite uses an in-memory database.
{
  echo 'export MONGODB_URI="${MONGODB_URI:-mongodb://127.0.0.1:27017/unused}"'
  echo "export JWT_SECRET=\"\${JWT_SECRET:-$(openssl rand -hex 32)}\""
} >> "$CLAUDE_ENV_FILE"
