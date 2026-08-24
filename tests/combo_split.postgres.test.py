#!/usr/bin/env python3
"""The combo lands in a REAL Postgres 18 as a GROUP OF SIBLING LINES (sales#152 / ADR-0381).

The handler's unit tests prove the apportionment: 6,00 € closed over a 4,50 € sandwich (10 %) and a
2,00 € beer (21 %) is 4,15 € + 1,85 €, the residual cent going to the beer by largest remainder, and
the sum being EXACTLY the closed price. What they cannot prove is that the group SURVIVES the round
trip — that the columns exist in a hub's database, that the door the handler emits still binds with
two more parameters, and that the sibling ref and the frozen snapshot come back out through the
query the ticket reads. Those are schema facts, and a schema fact is only checked by running it.

What is under test, and why each point is here:

  1. THE COLUMNS. `sales_sale_item.combo_group_ref` (nullable) and `combo` (NOT NULL DEFAULT '{}'),
     both additive: every line already written came from no combo, which is the truth.

  2. THE DOOR. `sales._insert_line` is the command the handler emits for EVERY line of EVERY sale.
     Adding parameters to it is the riskiest edit in this change: a statement Postgres cannot
     PREPARE is a command that does not exist in any hub (ADR-0154), and it would take down not
     combos but the whole checkout.

  3. NO PARENT LINE WITH MONEY. The sibling lines add up to the closed price ON THEIR OWN. This is
     the point of the whole design: Odoo's prorated combo shows up at 0 € in the sales report and
     the operator believes it was given away (odoo#187509).

  4. THE WAY BACK. `sales.lines` is the door the ticket and its reprint read. The ref and the
     snapshot have to come out of it or the header of the menu can never be printed — the exact bug
     `modifiers` had until sales#148: charged, written, and unreadable.

  5. TENANCY, with a LIVE neighbour. Two hubs, the same sale id, a combo each, seeded through the
     enforcing door: reading through `sales.lines` must never show the neighbour's. A scoping test
     seeded with a helper, or without a neighbour, proves nothing.

  6. THE INDEX. The siblings are always read together, so `(hub_id, combo_group_ref)` is indexed —
     and the index is scoped by hub, because a combo group is not a global name.

Usage: tests/combo_split.postgres.test.py
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
DB = f"sales_combo_split_test_{os.getpid()}"
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
        # sales#152: every line carries the combo columns, whether it came from a combo or
        # not. They are here because THIS dict is the payload shape the handler produces:
        # leaving them out is how the command and the handler drift apart, and `combo` is
        # NOT NULL, so the drift shows up as a rejected INSERT and not as a wrong number.
        "combo_group_ref": None,
        "combo": "{}",
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




# ── the two sibling lines exactly as the handler emits them ──────────────────────────────

# 6,00 € closed over catalogue prices of 4,50 € (10 %) and 2,00 € (21 %). These are the numbers the
# handler's golden vector produces, written out as literals on purpose: recomputing them here with a
# helper would only prove that the helper agrees with itself.
GROUP_REF = f"{SALE}-0"
SNAPSHOT = {
    "combo_id": "c-merienda",
    "name": "Pack merienda",
    "kitchen_name": "PACK",
    "price": 600,
    "price_charged": 600,
    "supply_kind": "goods",
    "components": [
        {"option_id": "o-sandwich", "source_ref": "p-sandwich", "name": "Bocadillo",
         "tax_category_key": "shop.food", "catalog_price": 450, "share": 415},
        {"option_id": "o-beer", "source_ref": "p-beer", "name": "Cerveza",
         "tax_category_key": "product.generic", "catalog_price": 200, "share": 185},
    ],
}
SNAPSHOT_TEXT = json.dumps(SNAPSHOT, separators=(",", ":"), ensure_ascii=False)


def sibling(line_id: str, sale_id: str, name: str, product: str, price: int,
            rate: float, cat: str, net: int, tax: int, group_ref: str = GROUP_REF) -> dict:
    return line_params(
        line_id, sale_id, product_id=product, product_name=name, is_service=0,
        unit_price=price, line_total=price, net_amount=net, tax_amount=tax,
        tax_rate=rate, tax_category_key=cat, modifiers="[]",
        combo_group_ref=group_ref, combo=SNAPSHOT_TEXT,
    )


# ── 1 · the columns ──────────────────────────────────────────────────────────────────────


def test_the_line_can_record_which_combo_it_came_from() -> None:
    print("\n1 · sales_sale_item.combo_group_ref and .combo exist, additive")
    check("column `combo_group_ref`", q(
        "SELECT count(*) FROM information_schema.columns"
        " WHERE table_name='sales_sale_item' AND column_name='combo_group_ref'"), "1")
    # Nullable ON PURPOSE: a line that came from no combo has no group, and NULL says exactly that.
    check("`combo_group_ref` is nullable — most lines are not part of a combo", q(
        "SELECT is_nullable FROM information_schema.columns"
        " WHERE table_name='sales_sale_item' AND column_name='combo_group_ref'"), "YES")
    check("column `combo`", q(
        "SELECT count(*) FROM information_schema.columns"
        " WHERE table_name='sales_sale_item' AND column_name='combo'"), "1")
    check("`combo` is NOT NULL", q(
        "SELECT is_nullable FROM information_schema.columns"
        " WHERE table_name='sales_sale_item' AND column_name='combo'"), "NO")
    # Every line already written came from no combo, and that is what the default says.
    check("defaults to '{}', so every line already written stays as it was", q(
        "SELECT column_default FROM information_schema.columns"
        " WHERE table_name='sales_sale_item' AND column_name='combo'"), "'{}'::text")


# ── 2 · the door the handler actually calls, and 3 · no parent line ──────────────────────


def test_the_insert_line_command_binds_the_two_new_parameters() -> None:
    print("\n2-3 · sales._insert_line writes the siblings, and there is NO parent line")
    seed_sale()
    ok, err = run_command("sales._insert_line", sibling(
        "line-sandwich", SALE, "Bocadillo", "p-sandwich", 415, 10.0, "shop.food", 377, 38))
    check("`sales._insert_line` runs the way the runtime runs it", (ok, err), (True, ""))
    ok, err = run_command("sales._insert_line", sibling(
        "line-beer", SALE, "Cerveza", "p-beer", 185, 21.0, "product.generic", 153, 32))
    check("and the second sibling goes in the same way", (ok, err), (True, ""))
    # A plain line still goes in untouched: this is the 100 % of sales that have no combo at all.
    ok, err = run_command("sales._insert_line", line_params(
        "line-coffee", SALE, product_id="p-coffee", product_name="Café", is_service=0,
        unit_price=150, line_total=150, net_amount=136, tax_amount=14, tax_rate=10.0,
        modifiers="[]", combo_group_ref=None, combo="{}"))
    check("a line with no combo still goes in untouched", (ok, err), (True, ""))

    check("the two siblings share their group", qi(
        "SELECT count(DISTINCT combo_group_ref) FROM sales_sale_item"
        f" WHERE hub_id='{HUB}' AND combo_group_ref IS NOT NULL"), 1)
    # 🔴 THE POINT OF THE WHOLE DESIGN. Not «almost 600»: exactly 600, out of the siblings alone.
    check("the siblings add up to the closed price, EXACTLY", qi(
        "SELECT sum(line_total) FROM sales_sale_item"
        f" WHERE hub_id='{HUB}' AND combo_group_ref='{GROUP_REF}'"), 600)
    check("and no parent line was written — not even at 0 €", qi(
        "SELECT count(*) FROM sales_sale_item"
        f" WHERE hub_id='{HUB}' AND (product_id='c-merienda' OR (line_total=0 AND combo_group_ref IS NOT NULL))"), 0)
    check("the line that has no combo keeps a NULL group", q(
        "SELECT coalesce(combo_group_ref, '<null>') FROM sales_sale_item WHERE id='line-coffee'"), "<null>")


# ── 4 · the way back, and 5 · tenancy with a live neighbour ──────────────────────────────


def test_the_group_comes_back_out_and_never_crosses_hubs() -> None:
    print("\n4-5 · sales.lines returns the ref and the snapshot, and only this hub's")
    # The NEIGHBOUR is real and alive: its own hub, its own sale, its own combo, written through the
    # same enforcing door. Without a live neighbour this would be a scoping test that passes because
    # there is nothing to leak — which proves nothing at all.
    seed_sale(sale_id=OTHER_SALE, hub=OTHER_HUB)
    ok, err = run_command("sales._insert_line", sibling(
        "line-sandwich-vecino", OTHER_SALE, "Bocadillo del vecino", "p-sandwich", 415, 10.0,
        "shop.food", 377, 38, group_ref=f"{OTHER_SALE}-0"), hub=OTHER_HUB)
    check("the neighbour's combo line is really written", (ok, err), (True, ""))

    rows = run_query("sales.lines", {"sale_id": SALE})
    check("this hub sees its three lines and no more", len(rows), 3)
    by_name = {r["product_name"]: r for r in rows}
    check("the sibling ref travels to the door the ticket reads",
          by_name.get("Bocadillo", {}).get("combo_group_ref"), GROUP_REF)
    check("and both siblings carry the SAME one",
          by_name.get("Cerveza", {}).get("combo_group_ref"), GROUP_REF)
    # The snapshot is what the ticket header is painted from — there is no parent row to read it
    # off. If it did not come back out, the menu could be charged and never printed.
    snap = json.loads(by_name.get("Bocadillo", {}).get("combo") or "{}")
    check("the frozen name of the combo comes back", snap.get("name"), "Pack merienda")
    check("and its closed price, so the header can print it", snap.get("price"), 600)
    check("with the components in the ORDER they were chosen",
          [c["option_id"] for c in snap.get("components", [])], ["o-sandwich", "o-beer"])
    check("a line with no combo comes back with an empty snapshot",
          by_name.get("Café", {}).get("combo"), "{}")

    # Positive control FIRST: the neighbour's line is reachable when the hub is its own, so the
    # empty result below is the scoping filter working and not a query that returns nothing.
    theirs = run_query("sales.lines", {"sale_id": OTHER_SALE}, hub=OTHER_HUB)
    check("control: the neighbour's combo IS readable by the neighbour", len(theirs), 1)
    leaked = run_query("sales.lines", {"sale_id": OTHER_SALE})
    check("and never by us, even asking for its sale by id", leaked, [])


# ── 6 · the index the siblings are read by ───────────────────────────────────────────────


def test_the_siblings_are_indexed_by_hub_and_group() -> None:
    print("\n6 · the group is indexed, and scoped by hub")
    check("index on (hub_id, combo_group_ref)", q(
        "SELECT count(*) FROM pg_indexes WHERE tablename='sales_sale_item'"
        " AND indexdef LIKE '%hub_id%' AND indexdef LIKE '%combo_group_ref%'"), "1")


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
        test_the_line_can_record_which_combo_it_came_from()
        test_the_insert_line_command_binds_the_two_new_parameters()
        test_the_group_comes_back_out_and_never_crosses_hubs()
        test_the_siblings_are_indexed_by_hub_and_group()
    finally:
        psql(["-c", f"DROP DATABASE IF EXISTS {DB} WITH (FORCE)"])

    print()
    if failures:
        print(f"FAILED — {len(failures)} assertion(s):")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("PASS — a combo is a group of sibling lines that add up to the closed price, with no parent row (sales#152)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
