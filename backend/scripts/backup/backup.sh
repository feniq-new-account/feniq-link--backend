#!/usr/bin/env bash
# نسخة احتياطية مشفّرة لقاعدة البيانات.
#
#   MONGODB_URI=... BACKUP_ENCRYPTION_KEY=... backend/scripts/backup/backup.sh [مجلد-الإخراج]
#
# يكتب snapshot BSON بصيغة JSONL مضغوطة ومشفّرة GPG/AES-256 وبجانبها .sha256.
# جلسة snapshot واحدة تمنع اختلاف زمن قراءة المجموعات؛ لا fallback لقراءات متحركة.
# لا تُكتب البيانات غير المشفّرة على القرص؛ Node 24 وnpm ci وgpg مطلوبة.
# يُشغَّل يومياً من .github/workflows/db-backup.yml؛ الاسترجاع: restore.sh.
set -euo pipefail

: "${MONGODB_URI:?MONGODB_URI is required (the database to back up).}"
: "${BACKUP_ENCRYPTION_KEY:?BACKUP_ENCRYPTION_KEY is required (the passphrase the backup is encrypted with).}"
if [ "${#BACKUP_ENCRYPTION_KEY}" -lt 20 ]; then
  echo "BACKUP_ENCRYPTION_KEY must be at least 20 characters. Generate one with: openssl rand -base64 32" >&2
  exit 1
fi

out_dir="${1:-.}"
mkdir -p "$out_dir"
stamp="$(date -u +%Y-%m-%dT%H%MZ)"
file="$out_dir/feniq-db-$stamp.snapshot.jsonl.gz.gpg"

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=mongo-tool.sh


trap 'rm -f "$file" "$file.sha256"' ERR
echo "Taking a consistent snapshot and encrypting to $file ..."
# The passphrase goes in on fd 3, never on the command line (where `ps` would
# show it) and never in a file.
node "$script_dir/snapshot.js" dump \
  | gpg --batch --yes --quiet --pinentry-mode loopback \
        --symmetric --cipher-algo AES256 \
        --passphrase-fd 3 --output "$file" 3<<<"$BACKUP_ENCRYPTION_KEY"

size=$(wc -c <"$file")
if [ "$size" -lt 100 ]; then
  echo "Backup file is suspiciously small ($size bytes) - treating as a failure." >&2
  exit 1
fi
(cd "$out_dir" && sha256sum "$(basename "$file")" >"$(basename "$file").sha256")
echo "OK: $file ($size bytes)"
