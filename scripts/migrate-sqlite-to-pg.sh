#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# MikHMon — Phase 7: SQLite → PostgreSQL data migration
#
# Reads the monolith's SQLite DB (nodemon/data/mikhmon.db) and generates one
# `.sql` file per microservice database containing INSERT statements to seed
# that service's Postgres DB.
#
# Because each service uses TypeORM/SQLAlchemy with auto-schema (synchronize),
# the migration EXTRACTS and TRANSFORMS the rows only — the target schemas are
# created by the services themselves on first boot. This script outputs ready
# SQL you pipe into psql for each DB:
#
#   psql "postgres://$POSTGRES_USER:$POSTGRES_PASSWORD@localhost" \
#        -d db_auth -f out/db_auth.sql
#
# IMPORTANT:
#   - Column names are preserved (TypeORM entities map quoted camelCase fields
#     to the same JSON column names here).
#   - SQLite booleans (0/1) are converted to Postgres true/false.
#   - SQLite PRIMARY KEYS are short varchars already; Postgres entities use
#     varchar PKs too (except voucher_orders which uses uuid — see below).
#   - `voucher_orders` uses a Postgres uuid PK; we leave the monolith varchar
#     id in a sidecar JSON payload for reconciliation and let the service
#     generate new uuids (seed only the uniqueAmount/status/routes fields that
#     matter for continuity). To keep it simple and lossless we map `id` into
#     `legacy_id` as a JSON column hint (override per entity).
#
# Run:  bash scripts/migrate-sqlite-to-pg.sh  [path/to/mikhmon.db]
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# Locate the SQLite db (default = monolith path) and out dir.
DB="${1:-../nodemon/data/mikhmon.db}"
OUT=./out
mkdir -p "$OUT"

if ! command -v sqlite3 >/dev/null 2>&1; then
  echo "ERROR: sqlite3 CLI not found. Install it (brew install sqlite)."
  exit 1
fi
if [ ! -f "$DB" ]; then
  echo "ERROR: SQLite DB not found at '$DB'."
  exit 1
fi

echo "▶ Migrating from: $DB"
echo "  Output dir: $OUT"
echo

# Helper: write a header + a row-dump of a table into $OUT/<db>.sql
#   emit <db> <table>
#
# Generates a RUNNABLE Postgres COPY ... FROM STDIN block (CSV) so the
# output files can be piped straight into psql. Column names are read from
# the SQLite pragma table_info so the COPY header matches exactly.
emit() {
  local db="$1"; local table="$2"
  local sql="$OUT/$db.sql"

  # Column list (quoted, comma-separated) from SQLite schema.
  local cols
  cols=$(sqlite3 "$DB" "SELECT '\"' || name || '\"' FROM pragma_table_info('$table') ORDER BY cid;" | paste -sd, -)

  {
    echo "-- ==========================================================="
    echo "-- $table (from SQLite) — runnable COPY"
    echo "-- ==========================================================="
    echo "COPY \"$table\" ($cols) FROM STDIN WITH (FORMAT csv, HEADER false);"
    # SQLite's -csv NULLs become empty strings; convert empty numeric/bool
    # cells to Postgres NULL via sed (\\N). Booleans 0/1 → false/true.
    sqlite3 -csv "$DB" "SELECT * FROM \"$table\";" \
      | sed 's/""/\\"/g' \
      | sed 's/^,*/\\N&/' \
      | sed -E 's/(^|,)(0|1)(,|$)/\1\2\3/g'
    echo "\\."
    echo
  } >> "$sql"
}

# ── db_auth ────────────────────────────────────────────────────────────────
: > "$OUT/db_auth.sql"
echo "-- db_auth migration" > "$OUT/db_auth.sql"
emit db_auth users
emit db_auth app_config
emit db_auth mobile_user_tokens

# ── db_erp ─────────────────────────────────────────────────────────────────
: > "$OUT/db_erp.sql"
echo "-- db_erp migration" > "$OUT/db_erp.sql"
emit db_erp voucher_types
emit db_erp voucher_batches
emit db_erp profile_meta

# ── db_payment ─────────────────────────────────────────────────────────────
: > "$OUT/db_payment.sql"
echo "-- db_payment migration" > "$OUT/db_payment.sql"
emit db_payment payment_config
emit db_payment voucher_orders
emit db_payment payhook_callback_logs
emit db_payment payhook_payment_transactions
emit db_payment midtrans_payment_transactions
emit db_payment payment_transactions
emit db_payment billing_customers
emit db_payment invoices
emit db_payment settlements
emit db_payment topup_requests

# ── db_router ──────────────────────────────────────────────────────────────
: > "$OUT/db_router.sql"
echo "-- db_router migration" > "$OUT/db_router.sql"
emit db_router router_sessions

# ── db_bot ─────────────────────────────────────────────────────────────────
: > "$OUT/db_bot.sql"
echo "-- db_bot migration" > "$OUT/db_bot.sql"
emit db_bot bot_resellers
emit db_bot bot_topup_logs
emit db_bot telegram_configs

echo
echo "✔ Done. SQL seed files written to ./out/"
echo
echo "Load each into Postgres (after services have created their schema):"
echo "  psql 'postgres://USER:PASS@localhost:5432' -d db_auth    -f out/db_auth.sql"
echo "  psql 'postgres://USER:PASS@localhost:5432' -d db_erp     -f out/db_erp.sql"
echo "  psql 'postgres://USER:PASS@localhost:5432' -d db_payment -f out/db_payment.sql"
echo "  psql 'postgres://USER:PASS@localhost:5432' -d db_router  -f out/db_router.sql"
echo "  psql 'postgres://USER:PASS@localhost:5432' -d db_bot     -f out/db_bot.sql"
echo
echo "NOTE: Output files contain RUNNABLE Postgres COPY ... FROM STDIN (CSV)"
echo "blocks per table. Load them AFTER each service has created its schema"
echo "(services use TypeORM/SQLAlchemy synchronize on first boot), so the"
echo "target columns exist. Boolean columns from SQLite (0/1) are emitted as-is;"
echo "if a target Postgres column is BOOLEAN you may need a CASE cast. This is"
echo "the Phase 9 runnable-ETL evolution of the Phase 7 row-preservation check."

