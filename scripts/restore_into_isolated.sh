#!/usr/bin/env bash
set -euo pipefail

# Import out/*.sql into isolated databases with suffix _restore
# Usage: ./scripts/restore_into_isolated.sh

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$ROOT_DIR/out"

if [ ! -d "$OUT_DIR" ]; then
  echo "out/ directory not found at $OUT_DIR" >&2
  exit 1
fi

DBS=(db_auth db_erp db_payment db_router db_bot)

echo "Creating isolated restore DBs and importing dumps from $OUT_DIR"

for base in "${DBS[@]}"; do
  db="${base}_restore"
  file="$OUT_DIR/${base}.sql"
  echo "Preparing $db"
  docker compose exec -T postgres-db psql -U ${POSTGRES_USER:-admin_mikrotik} -d postgres -c "DROP DATABASE IF EXISTS \"$db\"; CREATE DATABASE \"$db\";" >/dev/null
  if [ -f "$file" ]; then
    echo "Importing $(basename "$file") -> $db"
    docker compose exec -T postgres-db psql -U ${POSTGRES_USER:-admin_mikrotik} -d "$db" < "$file" || true
  else
    echo "No dump for $base (expected $file), skipping import"
  fi
done

echo "Isolated restore complete. Use *_restore DBs for inspection.
Example: docker compose exec -T postgres-db psql -U admin_mikrotik -d db_auth_restore -c 'SELECT count(*) FROM users;'
"
