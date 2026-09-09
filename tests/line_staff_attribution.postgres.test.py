#!/usr/bin/env python3
"""The professional is attributed PER LINE, so a shared ticket splits between them (sales#273).

Since sales#179 every sale says who attended — but on the HEADER, one `staff_id` for the whole
ticket. In a salon that is the normal case, not the corner one: Ana does the cut, Marta does the
colour, and the client pays ONCE. With the attribution on the header the whole ticket lands on one
of them, so the per-professional close cannot cuadrar and neither can the commission built on top
of it. That is the half of sales#273 that was still open.

The money ties out exactly, and that is not a coincidence: sales#113 already PRORATES the
ticket-wide discount across the lines, so `sale.total` IS the sum of `line_total` and
`sale.subtotal` IS the sum of `net_amount`. Splitting the report by line therefore adds up to the
same figures the till charged — no discount evaporates and none is counted twice.

What is under test, and why each point is here:

  1. THE COLUMN AND THE DOOR. `sales._insert_line` is the command the handler emits for EVERY line.
     It has to bind `:staff_id` and the row has to come out holding it, per line, in the same
     ticket. A column that only ever sees one value per sale is the header again.

  2. THE SPLIT — the acceptance criterion. One sale, two lines, two professionals →
     `sales.by_staff` returns TWO rows, each carrying the money of ITS OWN lines. Before this
     change it returned ONE row with the whole ticket, which is the bug.

  3. IT STILL ADDS UP. The two rows sum back to the sale's own total and subtotal. A report that
     splits but does not reconcile is worse than one that does not split.

  4. `sales_count` COUNTS TICKETS, NOT LINES. Two lines of the same professional on one ticket is
     one sale for them; counting lines would inflate every average ticket in the close.

  5. THE WAY BACK for the OLD ROWS — regression. Every line written before this migration has
     `staff_id` NULL. Those fall back to the sale's header attribution, so yesterday's close
     reports exactly what it reported yesterday instead of emptying itself.

  6. THE NEGATIVE CONTROL. A line with no attribution on either side stays INVISIBLE to the report
     (there is no "unknown" bucket), which is the behaviour sales#179 chose and this must not widen.

  7. TENANCY, with a LIVE neighbour. Two hubs, an attributed sale in each, seeded through the
     enforcing door: the report may not show the neighbour's line. A scoping test seeded with a
     helper, or without a neighbour, proves nothing.

Usage: tests/line_staff_attribution.postgres.test.py
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
DB = f"sales_line_staff_test_{os.getpid()}"
HUB = "hub-test"
OTHER_HUB = "hub-neighbour"

CASHIER = "u-cashier"
ANA = "staff-ana"
MARTA = "staff-marta"
NEIGHBOUR_STAFF = "staff-next-door"

DAY = "20260825"
NOW = "2026-08-25T10:00:00+00:00"

MANIFEST = json.loads((MODULE_DIR / "module.json").read_text())

failures: list[str] = []


def check(label: str, got, want) -> None:
    if got != want:
        failures.append(f"{label} — expected [{want}], got [{got}]")
        print(f"  FAIL: {label} — expected [{want}], got [{got}]")
    else:
        print(f"  ok: {label} = {got}")


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
    return psql(["-tAc", sql], db=DB).strip()


# ── The runtime, in miniature ────────────────────────────────────────────────────────────

PARAM = re.compile(r"(?<!:):([a-z_][a-z0-9_]*)", re.IGNORECASE)
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


def bind(sql: str, params: dict) -> str:
    """Single pass over the `:name` placeholders — a value that itself contains a colon (an ISO
    timestamp) must never be rescanned. `:name` inside a comment is left alone."""
    spans = comment_spans(sql)

    def in_comment(pos: int) -> bool:
        return any(a <= pos < b for a, b in spans)

    return PARAM.sub(
        lambda m: (m.group(0) if in_comment(m.start()) else literal(params.get(m.group(1)))),
        sql,
    )


def lower_shims(sql: str) -> str:
    """Apply the two portable helpers these files use, the way the runtime's translator does
    (`crates/db/src/lib.rs`): `erp_date(x)` → `((x)::date)` and `erp_pad(v, n)` → `lpad(...)`."""
    for token, render in (
        ("erp_date(", lambda args: f"((({args})::date))"),
        ("erp_pad(", lambda args: _pad(args)),
    ):
        sql = _expand(sql, token, render)
    return sql


def _pad(args: str) -> str:
    """`width` is a MINIMUM, never a ceiling (ERPlora/hub#1393). The bare `lpad` of Postgres imposes
    an EXACT width and CUTS the overflow, which is how the 10.000th sale of the day collided with
    the 1.000th and the till stopped charging (sales#241). A miniature runtime that keeps the old
    rendering is a mirror that puts the bug back where nobody would look — the tests."""
    value, width = _split_top_level(args)
    text = f"CAST({value} AS TEXT)"
    return f"lpad({text}, greatest({width}, length({text})), '0')"


def _split_top_level(args: str) -> tuple[str, str]:
    depth = 0
    for i, ch in enumerate(args):
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        elif ch == "," and depth == 0:
            return args[:i].strip(), args[i + 1 :].strip()
    return args.strip(), "4"


def _expand(sql: str, token: str, render) -> str:
    out, i = [], 0
    spans = comment_spans(sql)
    while True:
        j = sql.find(token, i)
        if j < 0:
            out.append(sql[i:])
            break
        if any(a <= j < b for a, b in spans):
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
        out.append(render(sql[j + len(token) : k - 1]))
        i = k
    return "".join(out)


def run_command(name: str, payload: dict, hub: str = HUB, user: str = CASHIER) -> None:
    cmd = MANIFEST["commands"].get(name)
    if cmd is None:
        raise RuntimeError(f"command `{name}` is not declared in module.json")
    files = cmd.get("sql")
    if not files:
        raise RuntimeError(f"command `{name}` declares no sql[]")
    params = dict(payload)
    params.setdefault("hub_id", hub)
    params.setdefault("current_user_id", user)
    params.setdefault("now", NOW)
    script = ["BEGIN;"]
    for rel in files:
        path = MODULE_DIR / rel
        if not path.exists():
            raise RuntimeError(f"`{name}` declares `{rel}`, which does not exist")
        script.append(bind(lower_shims(path.read_text()), params))
    script.append("COMMIT;")
    psql([], db=DB, stdin="\n".join(script))


def run_query(name: str, params: dict, hub: str = HUB) -> list[dict]:
    spec = MANIFEST["queries"].get(name)
    if spec is None:
        failures.append(f"query `{name}` is not declared in module.json")
        return []
    sql = lower_shims((MODULE_DIR / spec["sql"]).read_text().strip().rstrip(";"))
    bound = bind(sql, {**params, "hub_id": hub, "limit": 50, "offset": 0})
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


# ── Fixtures — every row goes in through the ENFORCING door ──────────────────────────────

HEADER_DEFAULTS = {
    "status": "completed",
    "subtotal": 0,
    "tax_amount": 0,
    "tax_breakdown": "[]",
    "discount_amount": 0,
    "discount_percent": 0,
    "gift_total": 0,
    "payment_method_id": None,
    "payment_method_name": "Cash",
    "amount_tendered": 0,
    "change_due": 0,
    "customer_id": None,
    "customer_name": "",
    "notes": "",
    "source_module": "pos",
    "channel": "",
    "order_id": None,
    "appointment_id": None,
    "document_type": "ticket",
}

LINE_DEFAULTS = {
    "product_id": None,
    "product_name": "",
    "product_sku": "",
    "is_service": 1,
    "quantity": 1_000_000,
    "unit_price": 0,
    "discount_percent": 0.0,
    "tax_rate": 0.0,
    "tax_class_name": "",
    "tax_category_key": "",
    "tax_country_code": "ES",
    "tax_region_code": "",
    "tax_rule_id": None,
    "is_gift": 0,
    "gift_reason": "",
    "is_covered": 0,
    "category_id": None,
    "modifiers": "[]",
    "notes": "",
    "combo_group_ref": None,
    "combo": "{}",
    "parent_line_ref": None,
    "unit_code": "unit",
    "unit_name": "unit",
    "factor_num": 1,
    "factor_den": 1,
    "increment_value": 0,
    "price_quantity_value": 1_000_000,
    "pricing_unit_code": "unit",
    "pricing_unit_name": "unit",
    "pricing_factor_num": 1,
    "pricing_factor_den": 1,
}


def sell(sale_id: str, lines: list[tuple], header_staff=None, hub: str = HUB) -> None:
    """One completed sale with its lines, written through the SAME commands, in the same order,
    that the handler emits on every checkout. `lines` = (line_id, staff_id, net, tax).

    The header totals are the SUM of the lines, which is what the handler guarantees: sales#113
    prorates the ticket-wide discount onto the lines, so `total` is `SUM(line_total)`."""
    run_command("sales._bump_counter", {"new_id": f"{sale_id}-counter", "day": DAY}, hub)
    net_total = sum(net for _, _, net, _ in lines)
    tax_total = sum(tax for _, _, _, tax in lines)
    header = dict(HEADER_DEFAULTS)
    header.update({
        "sale_id": sale_id,
        "day": DAY,
        "idempotency_key": f"idem-{sale_id}",
        "subtotal": net_total,
        "tax_amount": tax_total,
        "total": net_total + tax_total,
        "staff_id": header_staff,
    })
    run_command("sales._insert_sale", header, hub)
    for line_id, staff_id, net, tax in lines:
        row = dict(LINE_DEFAULTS)
        row.update({
            "line_id": line_id,
            "sale_id": sale_id,
            "staff_id": staff_id,
            "product_name": line_id,
            "unit_price": net + tax,
            "net_amount": net,
            "tax_amount": tax,
            "line_total": net + tax,
        })
        run_command("sales._insert_line", row, hub)


def by_staff(hub: str = HUB) -> dict:
    rows = run_query("sales.by_staff", {"date_from": DAY, "date_to": DAY}, hub)
    return {r["staff_id"]: r for r in rows}


# ── The battery ──────────────────────────────────────────────────────────────────────────


def main() -> int:
    psql(["-c", f'DROP DATABASE IF EXISTS "{DB}"'])
    psql(["-c", f'CREATE DATABASE "{DB}"'])
    try:
        load_migrations()

        print("\n1 · the door binds the professional PER LINE")
        # Ana cuts (30,00 + 21% = 36,30), Marta colours (50,00 + 21% = 60,50). One ticket.
        sell("s-shared", [("l-cut", ANA, 3000, 630), ("l-colour", MARTA, 5000, 1050)], header_staff=ANA)
        check(
            "the two lines of one ticket hold two different professionals",
            # Ordered by the PROFESSIONAL, not by the line id: what is under test is that the two
            # lines of one ticket hold two different people, not how the fixture named them.
            q("SELECT string_agg(staff_id, ',' ORDER BY staff_id) FROM sales_sale_item WHERE sale_id = 's-shared'"),
            f"{ANA},{MARTA}",
        )

        print("\n2 · the report SPLITS the shared ticket — the acceptance criterion")
        rows = by_staff()
        check("both professionals appear", sorted(rows), sorted([ANA, MARTA]))
        check("Ana is paid her cut, not the whole ticket", rows.get(ANA, {}).get("gross_total"), 3630)
        check("Marta is paid her colour", rows.get(MARTA, {}).get("gross_total"), 6050)
        check("and the taxable base splits with it", rows.get(ANA, {}).get("net_total"), 3000)
        check("Marta's base too", rows.get(MARTA, {}).get("net_total"), 5000)

        print("\n3 · and it still ADDS UP to the ticket")
        check(
            "the two rows sum back to the sale's total",
            sum(r["gross_total"] for r in rows.values()),
            int(q("SELECT total FROM sales_sale WHERE id = 's-shared'")),
        )
        check(
            "and to its taxable base",
            sum(r["net_total"] for r in rows.values()),
            int(q("SELECT subtotal FROM sales_sale WHERE id = 's-shared'")),
        )

        print("\n4 · `sales_count` counts TICKETS, not lines")
        sell("s-two-of-hers", [("l-a", ANA, 1000, 210), ("l-b", ANA, 2000, 420)], header_staff=ANA)
        rows = by_staff()
        check(
            "two lines of the same professional on one ticket is ONE sale for her",
            rows.get(ANA, {}).get("sales_count"),
            2,  # s-shared + s-two-of-hers
        )
        check("and her money is the sum of all her lines", rows.get(ANA, {}).get("gross_total"), 3630 + 1210 + 2420)

        print("\n5 · REGRESSION — a line written BEFORE the migration falls back to the header")
        # Every pre-existing line has `staff_id` NULL: yesterday's close must report what it did
        # yesterday, not empty itself.
        sell("s-legacy", [("l-old", None, 4000, 840)], header_staff=MARTA)
        rows = by_staff()
        check(
            "the old ticket is still attributed to the professional on its header",
            rows.get(MARTA, {}).get("gross_total"),
            6050 + 4840,
        )

        print("\n6 · NEGATIVE CONTROL — no attribution on either side stays invisible")
        sell("s-anon", [("l-anon", None, 9999, 0)], header_staff=None)
        rows = by_staff()
        check("no `unknown` bucket appears", sorted(rows), sorted([ANA, MARTA]))
        check(
            "and the unattributed money is in NO row",
            sum(r["gross_total"] for r in rows.values()),
            3630 + 1210 + 2420 + 6050 + 4840,
        )

        print("\n7 · TENANCY — a live neighbour hub is not visible")
        sell("s-neighbour", [("l-n", NEIGHBOUR_STAFF, 7000, 1470)], header_staff=NEIGHBOUR_STAFF, hub=OTHER_HUB)
        rows = by_staff()
        check("the neighbour's professional is not in our report", NEIGHBOUR_STAFF in rows, False)
        check(
            "and the neighbour has his own, seeded through the same door",
            by_staff(OTHER_HUB).get(NEIGHBOUR_STAFF, {}).get("gross_total"),
            8470,
        )
    finally:
        psql(["-c", f'DROP DATABASE IF EXISTS "{DB}" WITH (FORCE)'])

    print()
    if failures:
        print(f"FAILED ({len(failures)}):")
        for f in failures:
            print(f"  · {f}")
        return 1
    print("PASS — the professional is attributed per line and the close cuadra")
    return 0


if __name__ == "__main__":
    sys.exit(main())
