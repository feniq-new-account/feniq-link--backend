#!/usr/bin/env bash
# نسخة احتياطية مشفّرة لقاعدة البيانات.
#
#   MONGODB_URI=... BACKUP_ENCRYPTION_KEY=... backend/scripts/backup/backup.sh [مجلد-الإخراج]
#
# يكتب ملفاً واحداً: feniq-db-<التاريخ>.archive.gz.gpg (mongodump --archive --gzip
# مشفّراً بـ GPG/AES-256 بكلمة السر BACKUP_ENCRYPTION_KEY) وبجانبه .sha256.
# الملف غير المشفّر لا يُكتب على القرص أبداً: الـdump يمرّ مباشرة إلى التشفير.
#
# يستعمل mongodump المثبّت إن وُجد، وإلا صورة Docker الرسمية mongo:8.0.
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
file="$out_dir/feniq-db-$stamp.archive.gz.gpg"

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=mongo-tool.sh
source "$script_dir/mongo-tool.sh"

echo "Dumping and encrypting to $file ..."
# The passphrase goes in on fd 3, never on the command line (where `ps` would
# show it) and never in a file.
mongo_tool mongodump --uri="$MONGODB_URI" --archive --gzip --quiet \
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
