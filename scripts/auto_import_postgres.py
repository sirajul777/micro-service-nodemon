#!/usr/bin/env python3
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

CONTAINER = os.environ.get("POSTGRES_CONTAINER", "ms_postgres_db")
SQL_DIR = Path(os.environ.get("SQL_DIR", "./out"))
POSTGRES_USER = os.environ.get("POSTGRES_USER", "admin_mikrotik")
PSQL = ["docker", "exec", "-i", CONTAINER, "psql", "-U", POSTGRES_USER]

TABLE_RE = re.compile(r'^COPY\s+"(?P<table>[^"]+)"\s+\((?P<cols>[^)]+)\)\s+FROM\s+STDIN', re.MULTILINE)

TABLE_NAME_MAPPING = {
    "bot_topup_logs": "topup_logs",
}

ROUTER_COLUMN_MAPPING = {
    "hotspot_name": "hotspotName",
    "dns_name": "dnsName",
    "reload_interval": "reloadInterval",
    "idle_to": "idleTo",
}


class PgError(Exception):
    pass


def run_cmd(cmd, input_text=None):
    proc = subprocess.run(cmd, input=input_text, text=True, capture_output=True)
    return proc


def check_docker():
    if shutil.which("docker") is None:
        raise PgError("docker not found in PATH")
    proc = run_cmd(["docker", "info"])
    if proc.returncode != 0:
        raise PgError("Docker daemon is not reachable. Start Docker and try again.")


def psql_exec(db, sql):
    cmd = PSQL + ["-d", db, "-v", "ON_ERROR_STOP=1", "-f", "-"]
    proc = run_cmd(cmd, input_text=sql)
    return proc


def db_exists(db):
    proc = run_cmd(PSQL + ["-d", "postgres", "-tc", f"SELECT 1 FROM pg_database WHERE datname='{db}'"])
    return proc.returncode == 0 and proc.stdout.strip() == "1"


def create_db(db):
    print(f"Creating database {db}")
    proc = run_cmd(PSQL + ["-d", "postgres", "-c", f"CREATE DATABASE \"{db}\";"])
    if proc.returncode != 0:
        raise PgError(proc.stderr)


def get_table_columns(db, table):
    sql = (
        "SELECT column_name, data_type FROM information_schema.columns "
        f"WHERE table_name = '{table}' ORDER BY ordinal_position;"
    )
    proc = run_cmd(PSQL + ["-d", db, "-tc", sql])
    if proc.returncode != 0:
        return []
    cols = []
    for line in proc.stdout.splitlines():
        line = line.strip()
        if not line:
            continue
        parts = line.split("|") if "|" in line else line.split()
        if len(parts) >= 2:
            cols.append((parts[0].strip(), parts[1].strip()))
    return cols


def get_primary_key(db, table):
    sql = (
        "SELECT kcu.column_name FROM information_schema.table_constraints tc "
        "JOIN information_schema.key_column_usage kcu "
        "ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema "
        f"WHERE tc.table_name = '{table}' AND tc.constraint_type = 'PRIMARY KEY' "
        "ORDER BY kcu.ordinal_position;"
    )
    proc = run_cmd(PSQL + ["-d", db, "-tc", sql])
    if proc.returncode != 0:
        return []
    return [line.strip() for line in proc.stdout.splitlines() if line.strip()]


def parse_copy_blocks(text):
    return [(m.group("table"), [c.strip().strip('"') for c in m.group("cols").split(",")]) for m in TABLE_RE.finditer(text)]


def pg_cast(expr, data_type):
    if expr is None:
        return expr
    t = data_type.lower()
    if t in {"boolean"}:
        return f"NULLIF({expr}, '')::boolean"
    if t in {"integer", "smallint", "bigint"}:
        return f"NULLIF({expr}, '')::{t}"
    if t in {"real", "double precision", "numeric", "decimal"}:
        return f"NULLIF({expr}, '')::{t}"
    if "timestamp" in t:
        return f"NULLIF({expr}, '')::timestamp"
    if "date" == t:
        return f"NULLIF({expr}, '')::date"
    if "time" in t:
        return f"NULLIF({expr}, '')::time"
    if t in {"json", "jsonb"}:
        return f"NULLIF({expr}, '')::{t}"
    if t == "uuid":
        return f"NULLIF({expr}, '')::uuid"
    return expr


def build_temp_table_sql(table, cols):
    columns = ", ".join(f'"{c}" text' for c in cols)
    return f"DROP TABLE IF EXISTS tmp_{table};\nCREATE TEMP TABLE tmp_{table} ({columns});\n"


def build_merge_sql(db, table, cols):
    real_table = TABLE_NAME_MAPPING.get(table, table)
    target_columns = get_table_columns(db, real_table)
    if not target_columns:
        return f"-- skipping merge for {real_table}: no target table or no columns found\n"

    if real_table == "router_sessions":
        selected = []
        for target_col, data_type in target_columns:
            src_col = ROUTER_COLUMN_MAPPING.get(target_col, target_col)
            if src_col in cols:
                selected.append((target_col, src_col, data_type))
        if not selected:
            return f"-- no matching router_sessions columns found in tmp_{table}\n"
        target_list = ", ".join(f'"{t}"' for t, _, _ in selected)
        source_list = ", ".join(pg_cast(f'"{s}"', dt) for _, s, dt in selected)
        pk = get_primary_key(db, real_table)
        conflict_clause = f" ON CONFLICT ({', '.join(pk)}) DO NOTHING" if pk else ""
        return (
            f"INSERT INTO {real_table} ({target_list})\n"
            f"SELECT {source_list} FROM tmp_{table} t{conflict_clause};\n"
        )

    selected = []
    for target_col, data_type in target_columns:
        if target_col in cols:
            selected.append((target_col, target_col, data_type))
    if not selected:
        return f"-- no matching {real_table} columns found in tmp_{table}\n"
    target_list = ", ".join(f'"{t}"' for t, _, _ in selected)
    source_list = ", ".join(pg_cast(f'"{s}"', dt) for _, s, dt in selected)
    pk = get_primary_key(db, real_table)
    conflict_clause = f" ON CONFLICT ({', '.join(pk)}) DO NOTHING" if pk else ""
    return f"INSERT INTO {real_table} ({target_list})\nSELECT {source_list} FROM tmp_{table} t{conflict_clause};\n"


def load_sql_file(path):
    text = path.read_text()
    blocks = parse_copy_blocks(text)
    if not blocks:
        raise PgError(f"No COPY blocks found in {path}")
    header = ""
    for table, cols in blocks:
        header += build_temp_table_sql(table, cols)
    body = re.sub(r'COPY "([^"]+)"', lambda m: f'COPY "tmp_{m.group(1)}"', text)
    merge_sql = ""
    for table, cols in blocks:
        merge_sql += build_merge_sql(path.stem, table, cols)
    return header + body + "\n" + merge_sql


def main():
    try:
        check_docker()
    except PgError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        sys.exit(1)

    if not SQL_DIR.exists() or not SQL_DIR.is_dir():
        print(f"ERROR: SQL dir {SQL_DIR} not found", file=sys.stderr)
        sys.exit(1)

    sql_files = sorted(SQL_DIR.glob("*.sql"))
    if not sql_files:
        print(f"ERROR: no .sql files found in {SQL_DIR}", file=sys.stderr)
        sys.exit(1)

    for path in sql_files:
        db = path.stem
        print(f"\n---- Processing {path} -> database {db} ----")
        if not db_exists(db):
            create_db(db)
        sql = load_sql_file(path)
        proc = psql_exec(db, sql)
        if proc.returncode != 0:
            print(proc.stdout, end="")
            print(proc.stderr, end="", file=sys.stderr)
            print(f"ERROR importing {db}", file=sys.stderr)
        else:
            print(proc.stdout, end="")
            print(proc.stderr, end="", file=sys.stderr)
            print(f"Finished {db}")

if __name__ == "__main__":
    main()
