#!/usr/bin/env python3
"""The sales history's search box answers the word on the SCREEN, or it does not offer it
(sales#263) — runs against a REAL Postgres 18 in Docker.

The symptom: the search box at the top of the sales history searched three dimensions —
`sale_number`, `customer_name` and `payment_method_name`. The first two behave. The third
could not: every row reads «Efectivo» / «Tarjeta», and typing «Efectivo» answered ZERO.

Why it happens: the list engine composes the box as one OR of LIKEs over the STORED columns
(`crates/runtime/src/queries.rs`):

    (CAST(sub.sale_number AS TEXT) LIKE '%' || :search || '%' OR … OR
     CAST(sub.payment_method_name AS TEXT) LIKE '%' || :search || '%')

and the stored payment name is the CANONICAL seed name (`Cash`/`Card`, ADR-0055/sales#108),
while the cell paints it through the catalogue (`payMethodDisplayName`, `ui/lib/pay-icons.ts`).
So the only word that made that branch answer was the one nobody can read on screen, and the
only word the user CAN read made the whole list come back empty, without a word — the very
trap sales#181 removed from the picker and sales#260 from its text fallback.

The fix is the one every reference makes (Square, Shopify, WooCommerce, Odoo, Toast,
Lightspeed, Business Central, Clover — none puts payment method in the free-text box, all put
it in a picker): `payment_method_name` leaves `list.search`. The dimension is not lost — the
column keeps its picker (sales#181) and its sort. And the screen already promised exactly
this: `ui.searchSalePlaceholder` reads «Buscar número o cliente…», never «forma de pago».

This harness reproduces the engine faithfully: it wraps `queries/list.sql` exactly as
`queries.rs` does (`SELECT sub.* FROM (<base>) AS sub WHERE (<OR of LIKEs>) …`) and binds the
`:search` parameter the way the driver does (a JSON string → TEXT).

Usage: tests/search_box.postgres.test.py
  Uses the `erplora-test-pg-5433` container by default (override: SALES_TEST_PG_CONTAINER).
  Creates a scratch database and DROPS it at the end, pass or fail.
"""

import json
import os
import pathlib
import re
import subprocess
import sys

MODULE_DIR = pathlib.Path(__file__).resolve().parent.parent
CONTAINER = os.environ.get("SALES_TEST_PG_CONTAINER", "erplora-test-pg-5433")
DB = f"sales_search_box_test_{os.getpid()}"
HUB = "hub-test"
OTHER_HUB = "hub-neighbour"

MANIFEST = json.loads((MODULE_DIR / "module.json").read_text())
LIST = MANIFEST["queries"]["sales.list"]

#: The canonical name the factory seed writes, and the word the screen shows for it. The pair is
#: the whole bug: the box compared against the left column while the user reads the right one.
SEEDED_NAME = "Cash"
WHAT_THE_SCREEN_SHOWS = "Efectivo"

failures: list[str] = []


# ── Postgres plumbing (same shape as list_range.postgres.test.py) ─────────────────────────


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
    never a ceiling, so a value longer than the pad survives whole (sales#241)."""
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


def lower_portable(sql: str) -> str:
    """Apply the shims this query needs, the way the runtime's translator does: `erp_date` for the
    day the range filter compares against (sales#125) and `erp_pad` for the «Nº» sort key
    (sales#243). A shim this harness does not know about does not fail quietly — Postgres refuses
    the whole query with «function … does not exist»."""
    return _expand(
        _expand(sql, "erp_date(", lambda a: f"((({a})::date))"), "erp_pad(", _pad
    )


# ── The search box, in miniature (crates/runtime/src/queries.rs, lines 475-484) ───────────


def run_search(term: str, columns: list[str] | None = None) -> list[str]:
    """Execute `sales.list` with `search=<term>` exactly as the runtime does: one parenthesised
    OR of `LIKE '%term%'` over EVERY column the manifest lists in `list.search`, cast to TEXT.

    `columns` overrides the manifest — used only to reproduce the OLD contract once the manifest
    has been fixed, so the red evidence stays runnable and does not become a story.
    """
    searched = columns if columns is not None else LIST["list"]["search"]
    params = {"hub_id": HUB, "search": term, "limit": "50", "offset": "0"}
    likes = " OR ".join(
        f"CAST(sub.{c} AS TEXT) LIKE '%' || CAST(:search AS TEXT) || '%'"
        for c in searched
    )
    base = lower_portable((MODULE_DIR / LIST["sql"]).read_text().strip().rstrip(";"))
    sql = (
        f"SELECT sub.id FROM ( {base} ) AS sub WHERE ({likes}) "
        f"ORDER BY sub.created_at desc LIMIT :limit OFFSET :offset"
    )
    raw = psql(["-tAc", bind(sql, params)], db=DB)
    return sorted(line.strip() for line in raw.splitlines() if line.strip())


def check(label: str, expected, actual) -> None:
    if expected != actual:
        failures.append(f"{label} — expected [{expected}], got [{actual}]")
        print(f"  FAIL: {label} — expected [{expected}], got [{actual}]")
    else:
        print(f"  ok: {label} = {expected}")


# ── Fixtures ─────────────────────────────────────────────────────────────────────────────


def insert_sale(
    sale_id: str, number: str, method: str, customer: str, hub: str = HUB
) -> None:
    psql(
        [
            "-c",
            "INSERT INTO sales_sale (id, hub_id, sale_number, status, subtotal, tax_amount, "
            "total, payment_method_name, customer_name, channel, is_deleted, created_by, "
            f"updated_by, created_at, updated_at) VALUES ('{sale_id}', '{hub}', '{number}', "
            f"'completed', 100, 21, 121, '{method}', '{customer}', 'pos', 0, 'u1', 'u1', "
            "'2026-09-04T10:00:00+00:00', '2026-09-04T10:00:00+00:00')",
        ],
        db=DB,
    )


def load_migrations() -> None:
    for mig in sorted((MODULE_DIR / "migrations" / "postgres").glob("*.sql")):
        psql(
            [],
            db=DB,
            stdin=DDL_TOKEN.sub(
                lambda m: DDL_TYPES[m.group(1).upper()], mig.read_text()
            ),
        )


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

        # A cash sale and a card sale of the same day, plus a neighbour hub's cash sale that must
        # never leak whatever the box is asked.
        insert_sale("s-cash", "V-0001", SEEDED_NAME, "Ana Ruiz")
        insert_sale("s-card", "V-0002", "Card", "Bruno Gil")
        insert_sale("s-neighbour", "V-9999", SEEDED_NAME, "Ana Ruiz", hub=OTHER_HUB)

        searched = LIST["list"]["search"]

        # ── The reproduction, always: the OLD contract, run for real ──────────────────────
        # It stays runnable after the fix (the columns are passed in) so this file keeps SHOWING
        # the defect instead of narrating it.
        legacy = ["sale_number", "payment_method_name", "customer_name"]
        check(
            f"REPRODUCTION — with `payment_method_name` searched, «{WHAT_THE_SCREEN_SHOWS}» "
            f"(the word every row shows) finds NOTHING",
            [],
            run_search(WHAT_THE_SCREEN_SHOWS, columns=legacy),
        )
        check(
            f"REPRODUCTION — and only «{SEEDED_NAME}» (the word nobody reads on screen) answers",
            ["s-cash"],
            run_search(SEEDED_NAME, columns=legacy),
        )

        # ── The contract ─────────────────────────────────────────────────────────────────
        if "payment_method_name" in searched:
            failures.append(
                "`sales.list` still lists `payment_method_name` in `list.search`: the box searches "
                "the STORED name (`Cash`) while every row shows the translated one («Efectivo»), so "
                "the dimension can only be found by a word that is nowhere on screen. Drop it from "
                "`list.search` — the column keeps its picker (sales#181) and its sort, which is "
                "where all eight market references put payment method."
            )
            print("  FAIL: `sales.list` no longer searches `payment_method_name`")
        else:
            check(
                "the box searches number and customer, and only those",
                ["customer_name", "sale_number"],
                sorted(searched),
            )

            # What still works — the two dimensions the placeholder promises.
            check(
                "the sale number still finds its sale", ["s-cash"], run_search("V-0001")
            )
            check(
                "a fragment of the customer still finds the sale",
                ["s-cash"],
                run_search("Ana"),
            )

            # The regression this file exists for: the dimension left the box WHOLE. Half of it
            # (answering to `Cash` but not to «Efectivo») is what made the empty list a lie.
            check(
                f"«{SEEDED_NAME}» no longer half-answers in the box",
                [],
                run_search(SEEDED_NAME),
            )
            check(
                f"and neither does «{WHAT_THE_SCREEN_SHOWS}»",
                [],
                run_search(WHAT_THE_SCREEN_SHOWS),
            )

            # Tenancy holds whatever the box is asked.
            check("another hub's sale never appears", [], run_search("V-9999"))
    finally:
        psql(["-c", f"DROP DATABASE IF EXISTS {DB} WITH (FORCE)"])

    print()
    if failures:
        print(f" Sales search box: {len(failures)} FAILURES")
        for f in failures:
            print(f"  - {f}")
        return 1
    print(" Sales search box: all green")
    return 0


if __name__ == "__main__":
    sys.exit(main())
