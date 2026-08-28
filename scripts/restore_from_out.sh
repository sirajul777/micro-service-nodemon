#!/usr/bin/env bash
set -euo pipefail

# Restores SQL dumps from the `out/` folder into the running postgres container.
# Usage: ./scripts/restore_from_out.sh

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$ROOT_DIR/out"
PG_USER="${POSTGRES_USER:-admin_mikrotik}"
MANIFEST="$OUT_DIR/migration_row_counts.tsv"

if [ ! -d "$OUT_DIR" ]; then
  echo "out/ directory not found at $OUT_DIR" >&2
  exit 1
fi

if [ ! -f "$MANIFEST" ]; then
  echo "migration row-count manifest not found at $MANIFEST" >&2
  echo "Run scripts/migrate-sqlite-to-pg.sh first." >&2
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
echo "Restore complete. Verifying restored row counts against source manifest..."

failures=0

while IFS=$'\t' read -r db target source expected; do
  case "$db" in
    ""|\#*) continue ;;
  esac

  actual="$(compose_psql "$db" -Atc "SELECT COUNT(*) FROM \"$target\";")"

  if [ "$actual" = "$expected" ]; then
    printf '  %-12s %-28s source=%-8s target=%-8s ✓\n' "$db" "$target" "$expected" "$actual"
  else
    printf '  %-12s %-28s source=%-8s target=%-8s ✗\n' "$db" "$target" "$expected" "$actual"
    failures=$((failures + 1))
  fi
done < "$MANIFEST"

echo
echo "Important tables:"
for spec in \
  'db_payment payment_config' \
  'db_payment voucher_orders' \
  'db_payment payhook_callback_logs'; do
  read -r db table <<< "$spec"
  count="$(compose_psql "$db" -Atc "SELECT COUNT(*) FROM \"$table\";")"
  printf '  %-12s %-28s %s\n' "$db" "$table" "$count"
done

if [ "$failures" -ne 0 ]; then
  echo
  echo "ERROR: $failures row-count verification(s) failed." >&2
  exit 1
fi

echo
echo "✔ Restore + source-vs-target row-count verification complete."
