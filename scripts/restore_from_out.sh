#!/usr/bin/env bash
set -euo pipefail

# Restores SQL dumps from the `out/` folder into the running postgres container.
# Usage: ./scripts/restore_from_out.sh

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$ROOT_DIR/out"

if [ ! -d "$OUT_DIR" ]; then
  echo "out/ directory not found at $OUT_DIR" >&2
  exit 1
fi

echo "Restoring SQL dumps from $OUT_DIR into postgres container..."

run_import() {
  local file="$1"
  local db="$2"
  if [ ! -f "$file" ]; then
    echo "Skipping $file — not found"
    return
  fi
  echo "Importing $(basename "$file") -> $db"
  # Use stdin redirection so psql reads the full file (including COPY with \.)
  docker compose exec -T postgres-db psql -U ${POSTGRES_USER:-admin_mikrotik} -d "$db" < "$file"
}

# Map filenames to target DBs
run_import "$OUT_DIR/db_auth.sql" db_auth
run_import "$OUT_DIR/db_erp.sql" db_erp
run_import "$OUT_DIR/db_payment.sql" db_payment
run_import "$OUT_DIR/db_router.sql" db_router
run_import "$OUT_DIR/db_bot.sql" db_bot

echo "Restore complete."
