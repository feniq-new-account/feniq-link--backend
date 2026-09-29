#!/bin/bash
# Prepares a Claude Code on the web session: Flutter SDK (same minor as CI,
# .github/workflows/android-apk.yml) plus the npm deps of backend/ and web/,
# so tests, `flutter analyze` and the Dart MCP server work from the first turn.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

FLUTTER_VERSION="3.35.7"
FLUTTER_SHA256="146df531f9ac6a11a918013c1a70faafc053d4811c8cb69a413fd70748d51c3d"
FLUTTER_HOME="/opt/flutter"
ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"

if [ ! -x "$FLUTTER_HOME/bin/flutter" ] || ! grep -q "\"frameworkVersion\": \"$FLUTTER_VERSION\"" "$FLUTTER_HOME/bin/cache/flutter.version.json" 2>/dev/null; then
  archive="$(mktemp -d)/flutter.tar.xz"
  curl -sSfL "https://storage.googleapis.com/flutter_infra_release/releases/stable/linux/flutter_linux_${FLUTTER_VERSION}-stable.tar.xz" -o "$archive"
  echo "$FLUTTER_SHA256  $archive" | sha256sum -c - >/dev/null
  rm -rf "$FLUTTER_HOME"
  tar -xJf "$archive" -C /opt
  rm -f "$archive"
fi

git config --global --add safe.directory "$FLUTTER_HOME" 2>/dev/null || true
export PATH="$FLUTTER_HOME/bin:$PATH"
flutter config --no-analytics >/dev/null 2>&1 || true
dart --disable-analytics >/dev/null 2>&1 || true
flutter --version >/dev/null

if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo "export PATH=\"$FLUTTER_HOME/bin:\$PATH\"" >> "$CLAUDE_ENV_FILE"
fi

(cd "$ROOT/phoenix" && flutter pub get >/dev/null)
(cd "$ROOT/backend" && npm install --no-audit --no-fund >/dev/null)
(cd "$ROOT/web" && npm install --no-audit --no-fund >/dev/null)

# Code knowledge graph (AST only, ~10s): graphify-out/graph.json for
# `graphify query "..."`. See tools/graph/build.py and FEATURE_MAP.md.
python3 -c "import graphify" 2>/dev/null || python3 -m pip install -q graphifyy >/dev/null 2>&1 || python3 -m pip install -q --break-system-packages graphifyy >/dev/null
(cd "$ROOT" && python3 tools/graph/build.py >/dev/null 2>&1) || echo "graph build failed (non-fatal)" >&2
