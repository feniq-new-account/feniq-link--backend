#!/usr/bin/env bash
# استرجاع نسخة احتياطية صنعها backup.sh.
#
#   BACKUP_ENCRYPTION_KEY=... backend/scripts/backup/restore.sh <ملف.gpg> <رابط-القاعدة-الهدف> [خيارات]
#
# الخيارات:
#   --from-db NAME  اسم القاعدة داخل النسخة (الافتراضي feniq، كما في رابط Atlas).
#   --to-db NAME    استرجاع إلى قاعدة باسم آخر (للتجربة بجانب الأصل دون لمسه).
#                   بدونه يُسترجع إلى نفس الاسم.
#   --drop          احذف كل مجموعة قبل استرجاعها (استرجاع كامل فوق بيانات قائمة).
#                   بدونه تُضاف الوثائق الناقصة فقط ولا تُستبدل الموجودة.
#   --yes           لا تسأل للتأكيد (للتشغيل الآلي). بدونه يُطلب كتابة اسم القاعدة الهدف.
#
# أمثلة:
#   # تجربة آمنة على قاعدة محلية:
#   restore.sh feniq-db-2026-10-04T0023Z.archive.gz.gpg mongodb://127.0.0.1:27017 --to-db feniq_restore_test
#   # كارثة حقيقية — استرجاع كامل إلى Atlas:
#   restore.sh feniq-db-....gpg "mongodb+srv://feniq:PASS@cluster0.xxx.mongodb.net" --drop
set -euo pipefail

usage() { sed -n '2,20p' "$0" >&2; exit 2; }

[ $# -ge 2 ] || usage
file="$1"; target_uri="$2"; shift 2
from_db="feniq"; to_db=""; drop=0; yes=0
while [ $# -gt 0 ]; do
  case "$1" in
    --from-db) from_db="$2"; shift 2 ;;
    --to-db) to_db="$2"; shift 2 ;;
    --drop) drop=1; shift ;;
    --yes) yes=1; shift ;;
    *) echo "Unknown option: $1" >&2; usage ;;
  esac
done
to_db="${to_db:-$from_db}"

: "${BACKUP_ENCRYPTION_KEY:?BACKUP_ENCRYPTION_KEY is required (the passphrase the backup was encrypted with).}"
[ -f "$file" ] || { echo "No such file: $file" >&2; exit 1; }

if [ -f "$file.sha256" ]; then
  (cd "$(dirname "$file")" && sha256sum --check --quiet "$(basename "$file").sha256") \
    || { echo "Checksum mismatch - the backup file is corrupted." >&2; exit 1; }
  echo "Checksum OK."
fi

if [ "$yes" -ne 1 ]; then
  echo "About to restore $(basename "$file") into database '$to_db'$([ $drop -eq 1 ] && echo ' (DROPPING its existing collections first)')."
  read -r -p "Type the target database name to continue: " answer
  [ "$answer" = "$to_db" ] || { echo "Cancelled."; exit 1; }
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=mongo-tool.sh
source "$script_dir/mongo-tool.sh"

args=(--uri="$target_uri" --archive --gzip --nsInclude="$from_db.*")
if [ "$to_db" != "$from_db" ]; then
  args+=(--nsFrom="$from_db.*" --nsTo="$to_db.*")
fi
[ "$drop" -eq 1 ] && args+=(--drop)

echo "Decrypting and restoring into '$to_db' ..."
gpg --batch --quiet --pinentry-mode loopback --decrypt \
    --passphrase-fd 3 "$file" 3<<<"$BACKUP_ENCRYPTION_KEY" \
  | if [[ "$file" == *.snapshot.jsonl.gz.gpg ]]; then
      RESTORE_MONGODB_URI="$target_uri" RESTORE_DB="$to_db" RESTORE_DROP="$drop" node "$script_dir/snapshot.js" restore
    else
      mongo_tool mongorestore "${args[@]}"
    fi
echo "OK: restored into '$to_db'."
