#!/usr/bin/env python3
"""«Hoy»/«7 días»/«30 días» include the CURRENT day in the sales history (sales#125) — runs
against a REAL Postgres 18 in Docker.

The symptom: the range segment of `erp-sales-list` always came back EMPTY for today (and the
last day of every range), while the KPI cards — fed by `sales.stats` — did show today's money,
on the same screen. Two implementations of «up to today», two answers.

Why it happens: the list range filter was declared on `created_at`, a TIMESTAMP, and the hub's
list engine compares the raw column (`crates/runtime/src/queries.rs`, FilterOp::Range):

    sub.created_at <= :f_created_at_to

The screen sends ISO DAYS (`2026-08-22`), so «up to today» means `<= 2026-08-22 00:00:00` and
every sale charged after midnight — all of them — is cut. `sales.stats` compares by DATE PART
(`erp_date`), which is why it never had the bug.

The fix is module-side, with the same pattern stats already uses (ADR-0007's portable
`erp_date`): `queries/list.sql` projects the DATE PART of `created_at` as a TEXT column
`erp_date`, and the range filter is declared on THAT column — comparing days with days, both
ends inclusive. TEXT (not `date`) because the engine's Range predicate binds the caller's
value as TEXT and Postgres has no `date <= text` operator — a `date` projection would make the
query ERROR instead of filter.

This harness reproduces the engine faithfully: it wraps `queries/list.sql` exactly as
`queries.rs` does (`SELECT sub.*, COUNT(*) OVER() AS _total FROM (<base>) AS sub WHERE …`) and
binds the filter the way the driver does (a JSON string → TEXT).

Usage: tests/list_range.postgres.test.py
  Uses the `erplora-test-pg-5433` container by default (override: SALES_TEST_PG_CONTAINER).
  Creates a scratch database and DROPS it at the end, pass or fail.
"""

import json
import os
import pathlib
import re
import subprocess
import sys
import uuid

MODULE_DIR = pathlib.Path(__file__).resolve().parent.parent
CONTAINER = os.environ.get("SALES_TEST_PG_CONTAINER", "erplora-test-pg-5433")
DB = f"sales_list_range_test_{os.getpid()}"
HUB = "hub-test"
OTHER_HUB = "hub-neighbour"

MANIFEST = json.loads((MODULE_DIR / "module.json").read_text())
LIST = MANIFEST["queries"]["sales.list"]

failures: list[str] = []


# ── Postgres plumbing (same as split_merge.postgres.test.py) ──────────────────────────────


def psql(args: list[str], db: str | None = None, stdin: str | None = None) -> str:
    cmd = [
        "docker",
        "exec",
        "-i",
        CONTAINER,
        "psql",
        "-v",
        "ON_ERROR_STOP=1",
        "-U",
        "postgres",
    ]
    if db:
        cmd += ["-d", db]
    cmd += args
    res = subprocess.run(cmd, input=stdin, capture_output=True, text=True)
    if res.returncode != 0:
        raise RuntimeError(res.stderr.strip() or res.stdout.strip())
    return res.stdout


PARAM = re.compile(r"(?<!:):([a-z_][a-z0-9_]*)", re.IGNORECASE)
DDL_TYPES = {
    "INTEGER": "BIGINT",
    "REAL": "DOUBLE PRECISION",
    "BLOB": "BYTEA",
    "TEXT": "TEXT",
}
DDL_TOKEN = re.compile(r"\b(INTEGER|REAL|BLOB)\b", re.IGNORECASE)


def literal(value) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, (int, float)):
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"


def bind(sql: str, params: dict) -> str:
    return PARAM.sub(lambda m: literal(params.get(m.group(1))), sql)


def _expand(sql: str, token: str, render) -> str:
    """Textual substitution anchored on balanced parentheses, recursive on the argument — the same
    scan the runtime's translator does (`crates/db/src/lib.rs`), and like it, blind to a token
    inside a `--` comment."""
    out, i = [], 0
    while True:
        j = sql.find(token, i)
        if j < 0:
            out.append(sql[i:])
            break
        # Skip an occurrence inside a comment — the translator leaves those alone too.
        line_start = sql.rfind("\n", 0, j) + 1
        if sql[line_start:j].lstrip().startswith("--"):
            out.append(sql[i : j + len(token)])
            i = j + len(token)
            continue
        depth, k = 1, j + len(token)
        while k < len(sql) and depth:
            if sql[k] == "(":
                depth += 1
            elif sql[k] == ")":
                depth -= 1
            k += 1
        out.append(sql[i:j])
        out.append(render(_expand(sql[j + len(token) : k - 1], token, render)))
        i = k
    return "".join(out)


def _pad(args: str) -> str:
    """`erp_pad(value, width)` the way the runtime emits it since hub#1393: the width is a FLOOR,
    never a ceiling, so a value longer than the pad survives whole (that ceiling is what stopped
    the till charging in sales#241)."""
    depth = 0
    for i, ch in enumerate(args):
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        elif ch == "," and depth == 0:
            value, width = args[:i].strip(), args[i + 1 :].strip()
            return f"lpad(({value})::text, greatest({width}, length(({value})::text)), '0')"
    raise AssertionError(f"erp_pad takes two arguments, got: {args}")


def lower_erp_date(sql: str) -> str:
    """Apply the shims this query needs, the way the runtime's translator does. Modules write the
    portable subset; Postgres receives the native expressions.

    Two of them, not one: `erp_date(x)` → `((x)::date)` for the day the range filter compares
    against (sales#125), and `erp_pad` for the synthetic sort key of the «Nº» column (sales#243).
    A shim this harness does not know about does not fail loudly — Postgres refuses the whole
    query with «function erp_pad does not exist», which is how this one announced itself."""
    return _expand(
        _expand(sql, "erp_date(", lambda arg: f"((({arg})::date))"),
        "erp_pad(",
        _pad,
    )


# ── The list engine, in miniature (crates/runtime/src/queries.rs) ─────────────────────────


def run_list(filters: dict, sort: str = "created_at", dir_: str = "desc") -> list[str]:
    """Execute `sales.list` the way the runtime does: wrap the base SQL as a derived table and
    append the WHERE of every declared filter whose params came in, the ORDER BY and the LIMIT.

    `filters` maps column → {'from': ..} / {'to': ..} / value, exactly the wire params the SDK
    flattens (`f_<col>_from`, `f_<col>_to`, `f_<col>`). Only the outer projection is trimmed to
    `sub.id` — the WHERE predicate is what is under test, and `sub.*` would only add parsing
    fragility around psql's `|`-separated tuples."""
    spec = LIST["list"]
    params: dict[str, str] = {"hub_id": HUB, "limit": "50", "offset": "0"}
    conds: list[str] = []
    for col, f in spec["filters"].items():
        op = f["op"]
        if op == "range":
            if "from" in filters.get(col, {}):
                params[f"f_{col}_from"] = str(filters[col]["from"])
                conds.append(f"sub.{col} >= :f_{col}_from")
            if "to" in filters.get(col, {}):
                params[f"f_{col}_to"] = str(filters[col]["to"])
                conds.append(f"sub.{col} <= :f_{col}_to")
        elif col in filters:
            params[f"f_{col}"] = str(filters[col])
            predicate = (
                f"CAST(sub.{col} AS TEXT) LIKE '%' || CAST(:f_{col} AS TEXT) || '%'"
                if op == "like"
                else f"CAST(sub.{col} AS TEXT) = CAST(:f_{col} AS TEXT)"
            )
            conds.append(predicate)

    # The base SQL is lowered from the portable subset (`erp_date`) the way the runtime's
    # translator does; the named params of the wrap (and the base's `:hub_id`) are bound after.
    base = lower_erp_date((MODULE_DIR / LIST["sql"]).read_text().strip().rstrip(";"))
    where = f" WHERE {' AND '.join(conds)}" if conds else ""
    sql = (
        f"SELECT sub.id FROM ( {base} ) AS sub{where} "
        f"ORDER BY sub.{sort} {dir_} LIMIT :limit OFFSET :offset"
    )
    raw = psql(["-tAc", bind(sql, params)], db=DB)
    return [line.strip() for line in raw.splitlines() if line.strip()]


def row_ids(rows: list[str]) -> list[str]:
    return rows


# ── Assertions ───────────────────────────────────────────────────────────────────────────


def check(label: str, expected, actual):
    if expected != actual:
        failures.append(f"{label} — expected [{expected}], got [{actual}]")
        print(f"  FAIL: {label} — expected [{expected}], got [{actual}]")
    else:
        print(f"  ok: {label} = {expected}")


# ── Fixtures ─────────────────────────────────────────────────────────────────────────────

TODAY = "2026-08-22"
YESTERDAY = "2026-08-21"
EIGHT_DAYS_AGO = "2026-08-14"


def insert_sale(sale_id: str, day: str, hour: str, hub: str = HUB) -> None:
    psql(
        [
            "-c",
            "INSERT INTO sales_sale (id, hub_id, sale_number, status, subtotal, tax_amount, "
            "total, payment_method_name, customer_name, channel, is_deleted, created_by, "
            "updated_by, created_at, updated_at) VALUES "
            f"('{sale_id}', '{hub}', 'T-{sale_id}', 'completed', 100, 21, 121, 'Cash', '', 'pos', "
            f"0, 'u1', 'u1', '{day}T{hour}+00:00', '{day}T{hour}+00:00')",
        ],
        db=DB,
    )


def load_migrations() -> None:
    for mig in sorted((MODULE_DIR / "migrations" / "postgres").glob("*.sql")):
        sql = DDL_TOKEN.sub(lambda m: DDL_TYPES[m.group(1).upper()], mig.read_text())
        psql([], db=DB, stdin=sql)


def main() -> int:
    running = subprocess.run(
        ["docker", "inspect", "-f", "{{.State.Running}}", CONTAINER],
        capture_output=True,
        text=True,
    )
    if "true" not in running.stdout:
        subprocess.run(["docker", "start", CONTAINER], capture_output=True)

    psql(["-c", f"DROP DATABASE IF EXISTS {DB} WITH (FORCE)"])
    psql(["-c", f"CREATE DATABASE {DB}"])
    try:
        load_migrations()

        # The shift under test: yesterday's late sale, today's sales (one right after
        # midnight, one at noon — «after 00:00» is the whole bug), a stale one out of range,
        # and a neighbour hub's sale that must never leak.
        insert_sale("s-yesterday", YESTERDAY, "23:05:00")
        insert_sale("s-today-0007", TODAY, "00:07:00")
        insert_sale("s-today-1300", TODAY, "13:00:00")
        insert_sale("s-old", EIGHT_DAYS_AGO, "10:00:00")
        insert_sale("s-neighbour", TODAY, "12:00:00", hub=OTHER_HUB)

        date_filter = LIST["list"]["filters"].get("erp_date")
        if date_filter is None or date_filter.get("op") != "range":
            failures.append(
                "module.json must declare the list range filter on `erp_date` (the projected "
                "date part), not on the raw `created_at` timestamp"
            )
            print("  FAIL: sales.list declares an `erp_date` range filter")
            # Reproduce the symptom with the OLD contract (filter on the raw timestamp) so the
            # red run shows the empty screen, not just the missing declaration.
            legacy = LIST["list"]["filters"].get("created_at", {}).get("op")
            if legacy == "range":
                spec_saved = LIST["list"]["filters"]
                LIST["list"]["filters"] = {"created_at": {"op": "range"}}
                legacy_rows = run_list({"created_at": {"from": TODAY, "to": TODAY}})
                LIST["list"]["filters"] = spec_saved
                check(
                    "REPRODUCTION with the raw-timestamp filter: «hoy» comes back empty",
                    ["s-today-1300", "s-today-0007"],
                    row_ids(legacy_rows),
                )
        else:
            # «Hoy» — the range the screen opens on. RED before the fix: with the filter on
            # `created_at`, `sub.created_at <= '2026-08-22'` cuts everything after midnight.
            today_rows = run_list({"erp_date": {"from": TODAY, "to": TODAY}})
            check(
                "«hoy» returns today's sales — the one at 13:00 was the one being cut",
                ["s-today-1300", "s-today-0007"],
                row_ids(today_rows),
            )

            # «7 días» — both ends inclusive, days compared as days.
            week_rows = run_list({"erp_date": {"from": "2026-08-16", "to": TODAY}})
            check(
                "«7 días» spans whole days, today included, the 14th excluded",
                ["s-today-1300", "s-today-0007", "s-yesterday"],
                row_ids(week_rows),
            )

            # The neighbour hub never leaks, whatever the filter.
            check(
                "another hub's sales never appear",
                False,
                "s-neighbour" in row_ids(week_rows),
            )

            # Only the upper bound (the table's own date picker sends both, the API may send one).
            up_to_today = run_list({"erp_date": {"to": TODAY}})
            check(
                "the upper bound alone still includes today",
                ["s-today-1300", "s-today-0007", "s-yesterday", "s-old"],
                row_ids(up_to_today),
            )
    finally:
        psql(["-c", f"DROP DATABASE IF EXISTS {DB} WITH (FORCE)"])

    print()
    if failures:
        print(f" Sales list range: {len(failures)} FAILURES")
        for f in failures:
            print(f"  - {f}")
        return 1
    print(" Sales list range: all green")
    return 0


if __name__ == "__main__":
    sys.exit(main())
