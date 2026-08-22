#!/usr/bin/env bash
set -euo pipefail

# Restores SQL dumps from the `out/` folder into the running postgres container.
# Usage: ./scripts/restore_from_out.sh

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$ROOT_DIR/out"
PG_USER="${POSTGRES_USER:-admin_mikrotik}"

if [ ! -d "$OUT_DIR" ]; then
  echo "out/ directory not found at $OUT_DIR" >&2
  exit 1
fi

compose_psql() {
  local db="$1"
  shift
  docker compose exec -T postgres-db psql -U "$PG_USER" -d "$db" "$@"
}

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
  compose_psql "$db" < "$file"
}

# Map filenames to target DBs
run_import "$OUT_DIR/db_auth.sql" db_auth
run_import "$OUT_DIR/db_erp.sql" db_erp
run_import "$OUT_DIR/db_payment.sql" db_payment
run_import "$OUT_DIR/db_router.sql" db_router
run_import "$OUT_DIR/db_bot.sql" db_bot

echo
echo "Restore complete. Row-count verification:"

run_count() {
  local db="$1"
  local table="$2"
  if compose_psql "$db" -Atc "SELECT to_regclass('$table') IS NOT NULL;" | grep -qx 't'; then
    local count
    count="$(compose_psql "$db" -Atc "SELECT COUNT(*) FROM \"$table\";")"
    printf '  %-12s %-28s %s\n' "$db" "$table" "$count"
  else
    printf '  %-12s %-28s %s\n' "$db" "$table" 'missing'
  fi
}

run_count db_auth users
run_count db_auth app_config
run_count db_erp voucher_types
run_count db_erp voucher_batches
run_count db_erp profile_meta
run_count db_payment payment_config
run_count db_payment voucher_orders
run_count db_payment payhook_callback_logs
run_count db_router router_sessions
run_count db_bot bot_resellers
run_count db_bot topup_logs
run_count db_bot telegram_configs

echo
echo "✔ Restore + row-count verification complete."
