#!/usr/bin/env python3
"""A line an EXTERNAL tender already paid (sales#162 / ADR-0386), against a REAL Postgres 18.

The handler's unit tests prove the arithmetic: a `covered` line is worth net/tax/total = 0 and the
rest of the ticket is charged normally. What they cannot prove is that the line SURVIVES — that the
column exists in a hub's database, that the door the handler emits still binds with one more
parameter, and that the mark comes back out through the query the ticket reads. Those are schema
facts, and a schema fact is only checked by running it.

What is under test, and why each point is here:

  1. THE COLUMN. `sales_sale_item.is_covered`, additive and NOT NULL DEFAULT 0. Additive because
     every sale already written was paid with money, which is the truth. A `line_total = 0` with no
     mark is indistinguishable from a pricing mistake or from a comp, and then the paper has
     nothing to explain to the customer.

  2. THE DOOR. `sales._insert_line` is the command the handler emits for EVERY line of EVERY sale.
     Adding a parameter to it is the riskiest edit in this change: a statement Postgres cannot
     PREPARE is a command that does not exist in any hub (ADR-0154), and it would take down not the
     voucher but the whole checkout.

  3. THE WAY BACK. `sales.lines` is the door the ticket and its reprint read. The mark has to come
     out of it or the paper cannot say «Ya pagado», and a customer reads «0,00» as an error.

  4. TENANCY, with a LIVE neighbour. Two hubs, the same sale id, one covered line each: reading
     through `sales.lines` must never show the neighbour's. Seeded through the enforcing door —
     a scoping test seeded with a helper, or without a neighbour, proves nothing.

  5. THE MONEY. A covered line and a charged line in the same sale: only the charged one carries
     amounts. This is the sentence the customer cares about — the haircut is on the ticket, it is
     not charged again, and the shampoo is charged in full.

Fiscally the zeroes are the point, not a rounding: a voucher of N sessions is UNIVALENT, the record
came out when the voucher was SOLD with the service's VAT, and the supply made in exchange for it
«shall not be regarded as an independent transaction» (art. 30 ter.1, Directive 2006/112/CE). Base
0 and quota 0 is what stops this being double taxation.

Usage: tests/covered_line.postgres.test.py
  Uses the `erplora-test-pg-5433` container by default (override: SALES_TEST_PG_CONTAINER; the
  toolkit sets it per CI job). Creates a scratch database and DROPS it at the end, pass or fail.
  It NEVER skips itself: a battery that goes green because it could not reach Postgres is worse
  than no battery at all.
"""

import json
import os
import pathlib
import re
import subprocess
import sys

MODULE_DIR = pathlib.Path(__file__).resolve().parent.parent
CONTAINER = os.environ.get("SALES_TEST_PG_CONTAINER", "erplora-test-pg-5433")
DB = f"sales_covered_line_test_{os.getpid()}"
HUB = "hub-test"
OTHER_HUB = "hub-neighbour"
USER = "u-cashier"
SALE = "sale-1"
OTHER_SALE = "sale-next-door"

MANIFEST = json.loads((MODULE_DIR / "module.json").read_text())

failures: list[str] = []


def check(label: str, got, want) -> None:
    if got != want:
        failures.append(f"{label}: got {got!r}, want {want!r}")
        print(f"  ✗ {label}: got {got!r}, want {want!r}")
    else:
        print(f"  ✓ {label}")


# ── Postgres plumbing ────────────────────────────────────────────────────────────────────


def psql(args: list[str], db: str | None = None, stdin: str | None = None) -> str:
    cmd = ["docker", "exec", "-i", CONTAINER, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres"]
    if db:
        cmd += ["-d", db]
    cmd += args
    res = subprocess.run(cmd, input=stdin, capture_output=True, text=True)
    if res.returncode != 0:
        raise RuntimeError(res.stderr.strip() or res.stdout.strip())
    return res.stdout


def q(sql: str) -> str:
    """Scalar query. A missing relation/column is a RED result, not a crash: the run must report
    every acceptance point, not stop at the first one."""
    try:
        return psql(["-tAc", sql], db=DB).strip()
    except RuntimeError as exc:
        return f"<sql error: {str(exc).splitlines()[0]}>"


def qi(sql: str) -> int:
    raw = q(sql)
    try:
        return int(raw)
    except ValueError:
        return -1


# ── The runtime, in miniature ────────────────────────────────────────────────────────────

PARAM = re.compile(r":([a-z_][a-z0-9_]*)", re.IGNORECASE)
# Portable type subset → native Postgres type (ADR-0007 §4b, `shim_ddl_types`). Without this the
# money columns land as int4 instead of BIGINT and the harness would not run production's schema.
DDL_TYPES = {"INTEGER": "BIGINT", "REAL": "DOUBLE PRECISION", "BLOB": "BYTEA", "TEXT": "TEXT"}
DDL_TOKEN = re.compile(r"\b(INTEGER|REAL|BLOB)\b", re.IGNORECASE)


def literal(value) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, (list, dict)):
        value = json.dumps(value, separators=(",", ":"))
    return "'" + str(value).replace("'", "''") + "'"


def bind(sql: str, params: dict) -> str:
    """Single pass over the `:name` placeholders — a value that itself contains a colon (an ISO
    timestamp) must never be rescanned. `:name` inside a comment is left alone, like the runtime's
    translator does."""

    def comment_spans(text: str) -> list[tuple[int, int]]:
        spans, i, n = [], 0, len(text)
        while i < n:
            if text.startswith("--", i):
                j = text.find("\n", i)
                j = n if j < 0 else j
                spans.append((i, j))
                i = j
            elif text.startswith("/*", i):
                j = text.find("*/", i)
                j = n if j < 0 else j + 2
                spans.append((i, j))
                i = j
            else:
                i += 1
        return spans

    spans = comment_spans(sql)

    def in_comment(pos: int) -> bool:
        return any(a <= pos < b for a, b in spans)

    return PARAM.sub(
        lambda m: (m.group(0) if in_comment(m.start()) else literal(params.get(m.group(1)))),
        sql,
    )


def run_command(name: str, payload: dict, hub: str = HUB, now: str = "2026-08-24T10:00:00+00:00"):
    """Execute a manifest command's `sql[]` the way the runtime does: one transaction, system
    params injected. Returns (ok, error)."""
    cmd = MANIFEST["commands"].get(name)
    if cmd is None:
        return False, f"command `{name}` is not declared in module.json"
    files = cmd.get("sql")
    if not files:
        return False, f"command `{name}` declares no sql[] (handler `{cmd.get('handler')}`)"

    params = dict(payload)
    params.setdefault("hub_id", hub)
    params.setdefault("current_user_id", USER)
    params.setdefault("now", now)

    script = ["BEGIN;"]
    for rel in files:
        path = MODULE_DIR / rel
        if not path.exists():
            return False, f"`{name}` declares `{rel}`, which does not exist"
        script.append(bind(path.read_text(), params))
    script.append("COMMIT;")
    try:
        psql([], db=DB, stdin="\n".join(script))
        return True, ""
    except RuntimeError as exc:
        return False, str(exc).splitlines()[0]


def run_query(name: str, params: dict, hub: str = HUB) -> list[dict]:
    """Execute a manifest query the way the runtime does, returning rows as dicts."""
    spec = MANIFEST["queries"].get(name)
    if spec is None:
        failures.append(f"query `{name}` is not declared in module.json")
        return []
    sql = (MODULE_DIR / spec["sql"]).read_text().strip().rstrip(";")
    bound = bind(sql, {**params, "hub_id": hub})
    try:
        raw = psql(["-tAc", f"SELECT json_agg(t) FROM ({bound}) t"], db=DB).strip()
    except RuntimeError as exc:
        failures.append(f"query `{name}` failed: {str(exc).splitlines()[0]}")
        return []
    return json.loads(raw) if raw and raw != "" else []


def load_migrations() -> None:
    for mig in sorted((MODULE_DIR / "migrations" / "postgres").glob("*.sql")):
        sql = DDL_TOKEN.sub(lambda m: DDL_TYPES[m.group(1).upper()], mig.read_text())
        psql([], db=DB, stdin=sql)


def seed_sale(sale_id: str = SALE, hub: str = HUB) -> None:
    psql(
        ["-c", bind(
            "INSERT INTO sales_sale (id, hub_id, sale_number, status, total, is_deleted, created_at, updated_at)"
            " VALUES (:id, :hub_id, '20260824-0001', 'completed', 12100, 0, :now, :now)",
            {"id": sale_id, "hub_id": hub, "now": "2026-08-24T10:00:00+00:00"},
        )],
        db=DB,
    )


# ── the line as the handler emits it ─────────────────────────────────────────────────────

# Every parameter `sales._insert_line` binds, with the frozen unit context (ADR-0147 §2.4). Written
# out in full on purpose: this is the payload shape the handler produces, so if the command grows a
# parameter and the handler does not, or the other way round, this test is where it shows.
def line_params(line_id: str, sale_id: str, **over) -> dict:
    params = {
        "line_id": line_id,
        "sale_id": sale_id,
        "product_id": "s-corte",
        "product_name": "Corte",
        "product_sku": "",
        "is_service": 1,
        "quantity": 1_000_000,
        "unit_price": 1800,
        "discount_percent": 0.0,
        "tax_rate": 21.0,
        "tax_class_name": "",
        "tax_category_key": "service.generic",
        "tax_country_code": "ES",
        "tax_region_code": "",
        "tax_rule_id": None,
        "is_gift": 0,
        "gift_reason": "",
        "is_covered": 0,
        "category_id": None,
        "modifiers": "",
        "net_amount": 1488,
        "tax_amount": 312,
        "line_total": 1800,
        "unit_code": "ud",
        "unit_name": "unidad",
        "factor_num": 1,
        "factor_den": 1,
        "increment_value": 1_000_000,
        "price_quantity_value": 1_000_000,
        "pricing_unit_code": "ud",
        "pricing_unit_name": "unidad",
        "pricing_factor_num": 1,
        "pricing_factor_den": 1,
    }
    params.update(over)
    return params


# ── 1 · the column ───────────────────────────────────────────────────────────────────────


def test_the_line_can_record_that_another_tender_paid_it() -> None:
    print("\n1 · sales_sale_item.is_covered exists, additive and NOT NULL DEFAULT 0")
    check(
        "column `is_covered`",
        q(
            "SELECT count(*) FROM information_schema.columns"
            " WHERE table_name='sales_sale_item' AND column_name='is_covered'"
        ),
        "1",
    )
    check(
        "`is_covered` is NOT NULL",
        q(
            "SELECT is_nullable FROM information_schema.columns"
            " WHERE table_name='sales_sale_item' AND column_name='is_covered'"
        ),
        "NO",
    )
    # A sale written before this migration was paid with money, and that is what the default says.
    check(
        "defaults to 0, so every line already written stays charged",
        q(
            "SELECT column_default FROM information_schema.columns"
            " WHERE table_name='sales_sale_item' AND column_name='is_covered'"
        ),
        "0",
    )


# ── 2 · the door the handler actually calls ──────────────────────────────────────────────


def test_the_insert_line_command_still_binds_with_the_new_parameter() -> None:
    print("\n2 · sales._insert_line binds and inserts, covered and not")
    seed_sale()
    ok, err = run_command("sales._insert_line", line_params("line-corte", SALE, is_covered=1,
                                                            net_amount=0, tax_amount=0, line_total=0))
    check("`sales._insert_line` runs the way the runtime runs it", (ok, err), (True, ""))
    ok, err = run_command(
        "sales._insert_line",
        line_params("line-champu", SALE, product_id="p-champu", product_name="Champú",
                    is_service=0, unit_price=900, net_amount=744, tax_amount=156, line_total=900),
    )
    check("a plain line still goes in untouched", (ok, err), (True, ""))
    check("the covered line is marked", qi(
        "SELECT is_covered FROM sales_sale_item WHERE id='line-corte'"), 1)
    check("the charged line is not", qi(
        "SELECT is_covered FROM sales_sale_item WHERE id='line-champu'"), 0)


# ── 3 · the way back, and 4 · tenancy with a live neighbour ──────────────────────────────


def test_the_mark_comes_back_out_and_never_crosses_hubs() -> None:
    print("\n3-4 · sales.lines returns the mark, and only this hub's")
    # The NEIGHBOUR is real and alive: its own hub, its own sale, its own covered line, written
    # through the same enforcing door. Without a live neighbour this would be a scoping test that
    # passes because there is nothing to leak — which proves nothing at all.
    seed_sale(sale_id=OTHER_SALE, hub=OTHER_HUB)
    ok, err = run_command(
        "sales._insert_line",
        line_params("line-corte-vecino", OTHER_SALE, product_name="Corte del vecino", is_covered=1,
                    net_amount=0, tax_amount=0, line_total=0),
        hub=OTHER_HUB,
    )
    check("the neighbour's covered line is really written", (ok, err), (True, ""))

    rows = run_query("sales.lines", {"sale_id": SALE})
    names = sorted(r["product_name"] for r in rows)
    check("this hub sees its two lines and no more", names, ["Champú", "Corte"])
    covered = {r["product_name"]: r["is_covered"] for r in rows}
    check("the mark travels to the door the ticket reads", covered.get("Corte"), 1)
    check("and the charged line is not marked", covered.get("Champú"), 0)

    # Positive control FIRST: the neighbour's line is reachable when the hub is its own, so the
    # empty result below is the scoping filter working and not a query that returns nothing.
    mine = run_query("sales.lines", {"sale_id": OTHER_SALE}, hub=OTHER_HUB)
    check("control: the neighbour's line IS readable by the neighbour", len(mine), 1)
    leaked = run_query("sales.lines", {"sale_id": OTHER_SALE})
    check("and never by us, even asking for its sale by id", leaked, [])


# ── 5 · the money ────────────────────────────────────────────────────────────────────────


def test_only_the_uncovered_line_carries_money() -> None:
    print("\n5 · the covered line is on the ticket and is worth nothing")
    row = run_query("sales.lines", {"sale_id": SALE})
    corte = next((r for r in row if r["product_name"] == "Corte"), {})
    check("the haircut IS on the ticket — the customer did get it", bool(corte), True)
    check("unit price kept, so the paper can show what it was worth", corte.get("unit_price"), 1800)
    check("base 0: the VAT came out when the voucher was SOLD", corte.get("net_amount"), 0)
    check("quota 0: charging it again would be double taxation", corte.get("tax_amount"), 0)
    check("and nothing is charged for it", corte.get("line_total"), 0)
    check(
        "the rest of the ticket is charged in full",
        qi("SELECT sum(line_total) FROM sales_sale_item WHERE hub_id='" + HUB + "'"),
        900,
    )
    # It is NOT a comp and NOT a discount: those two are the wrong models and both lie in the books.
    check("not a comp", qi("SELECT is_gift FROM sales_sale_item WHERE id='line-corte'"), 0)
    check(
        "not a discount",
        q("SELECT discount_percent FROM sales_sale_item WHERE id='line-corte'"),
        "0",
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
        test_the_line_can_record_that_another_tender_paid_it()
        test_the_insert_line_command_still_binds_with_the_new_parameter()
        test_the_mark_comes_back_out_and_never_crosses_hubs()
        test_only_the_uncovered_line_carries_money()
    finally:
        psql(["-c", f"DROP DATABASE IF EXISTS {DB} WITH (FORCE)"])

    print()
    if failures:
        print(f"FAILED — {len(failures)} assertion(s):")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("PASS — a line another tender paid is on the ticket, worth nothing, and never crosses hubs (sales#162)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
