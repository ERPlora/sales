#!/usr/bin/env python3
"""Every sale says WHO ATTENDED, and the per-professional report finds them (sales#179).

The handler's unit tests prove the DECISION: with no professional named, `staff_id` is the user
with a session (`context.current_user_id`), and a professional named by the payload — the
appointment, or a transferred check — wins over them. What they cannot prove is that the decision
SURVIVES the round trip: that the door still binds, that the column holds a session user's id as
happily as a `staff_member`'s, and above all that `sales.by_staff` — the report the issue found
EMPTY — comes back with rows once the sales are attributed. Those are schema facts, and a schema
fact is only checked by running it.

What is under test, and why each point is here:

  1. THE DOOR. `sales._insert_sale` is the command the handler emits for EVERY sale. It already
     bound `:staff_id`; what changes is that the handler now hands it a value instead of NULL. The
     row has to come out with the attribution AND with `employee_id` — the two are different
     columns for a reason, and a POS sale where they coincide must not collapse them.

  2. THE TWO ATTRIBUTIONS ARE DIFFERENT PEOPLE. A cashier ringing up someone else's service writes
     `employee_id` = the cashier and `staff_id` = the professional. If the column could not hold
     that difference, the whole per-professional close would be a mirror of the till log.

  3. THE REPORT. `sales.by_staff` filters `staff_id IS NOT NULL`, so before sales#179 it returned
     NOTHING for a counter POS: no per-waiter figures, no basis for tips. With attributed sales it
     groups by person with the totals in cents. This is the acceptance criterion of the issue.

  4. THE WAY BACK. `sales.list` projects `staff_id`, which is what the sales screen and the QA
     report read (`"staff_id": null` is how the bug was seen in the first place).

  5. THE NEGATIVE CONTROL — the bug itself. A sale left with `staff_id` NULL is INVISIBLE to the
     report (it is not even an "unknown" bucket), which is why the fix lives in the handler and
     not in a wider WHERE.

  6. TENANCY, with a LIVE neighbour. Two hubs, a sale attributed in each, seeded through the
     enforcing door: neither the report nor the list may show the neighbour's. A scoping test
     seeded with a helper, or without a neighbour, proves nothing.

What this battery does NOT prove, on purpose: that the handler picks the session user. That is a
decision made in Rust, inside a sandbox with no database, and it is owned by the handler's unit
tests (`sale_without_staff_is_attributed_to_the_session_user` and its controls).

Usage: tests/staff_attribution.postgres.test.py
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
DB = f"sales_staff_attribution_test_{os.getpid()}"
HUB = "hub-test"
OTHER_HUB = "hub-neighbour"

# The person at the till. The runtime injects this id as `:current_user_id`; it is the same
# non-forgeable value the handler reads from `context.current_user_id`.
CASHIER = "u-cashier"
# A professional named by the payload (the appointment's stylist, or the waiter a check was
# transferred to). Opaque to `sales` — it never joins to `staff_member`.
PROFESSIONAL = "staff-7"
# The neighbour hub's own cashier: same shape, another tenant.
NEIGHBOUR_USER = "u-next-door"

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


def q(sql: str) -> str:
    return psql(["-tAc", sql], db=DB).strip()


# ── The runtime, in miniature ────────────────────────────────────────────────────────────

# The lookbehind keeps `::date` — what the `erp_date` shim lowers to — from being read as the
# placeholder `:date`. Without it every lowered query loses its cast and Postgres refuses it.
PARAM = re.compile(r"(?<!:):([a-z_][a-z0-9_]*)", re.IGNORECASE)
# Portable type subset → native Postgres type (ADR-0007 §4b, `shim_ddl_types`).
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
    timestamp) must never be rescanned. `:name` inside a comment is left alone, like the runtime's
    translator does."""
    spans = comment_spans(sql)

    def in_comment(pos: int) -> bool:
        return any(a <= pos < b for a, b in spans)

    return PARAM.sub(
        lambda m: (
            m.group(0) if in_comment(m.start()) else literal(params.get(m.group(1)))
        ),
        sql,
    )


def lower_shims(sql: str) -> str:
    """Apply the two portable helpers these files use, the way the runtime's translator does
    (`crates/db/src/lib.rs`): `erp_date(x)` → `((x)::date)` and `erp_pad(v, n)` → `lpad(...)`.
    Modules write the portable subset; Postgres receives the native form."""
    for token, render in (
        ("erp_date(", lambda args: f"((({args})::date))"),
        ("erp_pad(", lambda args: _pad(args)),
    ):
        sql = _expand(sql, token, render)
    return sql


def _pad(args: str) -> str:
    """`width` is a MINIMUM, never a ceiling (ERPlora/hub#1393). The bare `lpad` of Postgres
    imposes an EXACT width and CUTS the overflow, so `lpad('10000', 4, '0')` came out `'1000'` and
    the 10.000th sale of the day collided with the 1.000th on `uq_sale_number`: the till stopped
    charging (sales#241). A miniature runtime that keeps the old rendering is a mirror that puts
    the bug back where nobody would look — the tests. See `sale_number_width.postgres.test.py`."""
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
    """Execute a manifest command's `sql[]` the way the runtime does: one transaction, system
    params injected. A failure is a failure of the test, not something to swallow."""
    cmd = MANIFEST["commands"].get(name)
    if cmd is None:
        raise RuntimeError(f"command `{name}` is not declared in module.json")
    files = cmd.get("sql")
    if not files:
        raise RuntimeError(
            f"command `{name}` declares no sql[] (handler `{cmd.get('handler')}`)"
        )

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


# ── Fixtures — every sale goes in through the ENFORCING door ─────────────────────────────

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


def sell(
    sale_id: str, staff_id, total: int, hub: str = HUB, user: str = CASHIER
) -> None:
    """One completed sale, written through `sales._bump_counter` + `sales._insert_sale` — the same
    two commands, in the same order, that the handler emits on every checkout."""
    run_command(
        "sales._bump_counter", {"new_id": f"{sale_id}-counter", "day": DAY}, hub, user
    )
    header = dict(HEADER_DEFAULTS)
    header.update(
        {
            "sale_id": sale_id,
            "day": DAY,
            "idempotency_key": f"idem-{sale_id}",
            "subtotal": total,
            "total": total,
            "staff_id": staff_id,
        }
    )
    run_command("sales._insert_sale", header, hub, user)


# ── 1 · the door writes the attribution ──────────────────────────────────────────────────


def test_the_door_writes_who_attended_next_to_who_charged() -> None:
    print("\n1 · sales._insert_sale binds the attribution the handler resolved")
    sell("sale-counter", CASHIER, 1210)
    row = q(
        "SELECT staff_id || '|' || employee_id || '|' || created_by"
        f" FROM sales_sale WHERE id = 'sale-counter'"
    )
    check(
        "counter sale: staff_id | employee_id | created_by",
        row,
        f"{CASHIER}|{CASHIER}|{CASHIER}",
    )


def test_the_two_attributions_can_be_different_people() -> None:
    print("\n2 · the professional who attended is not always the one at the till")
    sell("sale-service", PROFESSIONAL, 4500)
    row = q(
        "SELECT staff_id || '|' || employee_id FROM sales_sale WHERE id = 'sale-service'"
    )
    check("service sale: staff_id | employee_id", row, f"{PROFESSIONAL}|{CASHIER}")


# ── 3 · the report the issue found empty ─────────────────────────────────────────────────


def test_by_staff_comes_back_with_the_day(seeded: bool = True) -> None:
    print("\n3 · sales.by_staff breaks the day down per person")
    rows = run_query(
        "sales.by_staff", {"date_from": "2026-08-25", "date_to": "2026-08-25"}
    )
    by_person = {r["staff_id"]: r for r in rows}
    check("people in the report", sorted(by_person), sorted([CASHIER, PROFESSIONAL]))
    if CASHIER in by_person:
        check(
            "counter sales attributed to the cashier",
            by_person[CASHIER]["sales_count"],
            1,
        )
        check("cashier gross total (cents)", by_person[CASHIER]["gross_total"], 1210)
    if PROFESSIONAL in by_person:
        check(
            "professional gross total (cents)",
            by_person[PROFESSIONAL]["gross_total"],
            4500,
        )


def test_the_sales_list_projects_the_attribution() -> None:
    print("\n4 · sales.list carries staff_id out to the screen")
    rows = run_query("sales.list", {})
    attributed = {r["id"]: r["staff_id"] for r in rows}
    check("counter sale in the list", attributed.get("sale-counter"), CASHIER)
    check("service sale in the list", attributed.get("sale-service"), PROFESSIONAL)
    check(
        "no sale left unattributed", [k for k, v in attributed.items() if v is None], []
    )


# ── 5 · the negative control: the bug itself ─────────────────────────────────────────────


def test_an_unattributed_sale_is_invisible_to_the_report() -> None:
    """The bug, reproduced at SQL level. A sale written with `staff_id` NULL — what every counter
    checkout wrote before sales#179 — does not show up in `sales.by_staff` as an "unknown" bucket:
    it is not in the day at all, because the query filters `staff_id IS NOT NULL`. That is why the
    fix has to be that the handler never hands NULL to the door, and not a change of this WHERE:
    widening it would invent a person called `null` in the per-waiter close."""
    print("\n5 · a sale nobody attended never reaches the per-person report")
    before = run_query(
        "sales.by_staff", {"date_from": "2026-08-25", "date_to": "2026-08-25"}
    )
    sell("sale-unattributed", None, 700)
    check(
        "the unattributed sale exists",
        q(
            "SELECT COALESCE(staff_id, 'NULL') FROM sales_sale WHERE id = 'sale-unattributed'"
        ),
        "NULL",
    )
    after = run_query(
        "sales.by_staff", {"date_from": "2026-08-25", "date_to": "2026-08-25"}
    )
    check("it adds nobody to the report", len(after), len(before))
    check(
        "and its money is nowhere in it",
        sum(r["gross_total"] for r in after),
        sum(r["gross_total"] for r in before),
    )


# ── 6 · tenancy, with a LIVE neighbour ───────────────────────────────────────────────────


def test_a_neighbour_hub_never_shows_up() -> None:
    print("\n6 · the neighbour hub attributes its own sales and stays out of ours")
    sell("sale-next-door", NEIGHBOUR_USER, 9900, hub=OTHER_HUB, user=NEIGHBOUR_USER)
    # Positive control: the neighbour's row IS there, so an empty result below means scoping,
    # not a fixture that never landed.
    check(
        "the neighbour's sale exists",
        q(f"SELECT staff_id FROM sales_sale WHERE hub_id = '{OTHER_HUB}'"),
        NEIGHBOUR_USER,
    )
    rows = run_query(
        "sales.by_staff", {"date_from": "2026-08-25", "date_to": "2026-08-25"}
    )
    check(
        "neighbour absent from our report",
        [r for r in rows if r["staff_id"] == NEIGHBOUR_USER],
        [],
    )
    listed = run_query("sales.list", {})
    check(
        "neighbour absent from our list",
        [r for r in listed if r["id"] == "sale-next-door"],
        [],
    )
    # And the mirror: read as the neighbour, our sales are the ones that disappear.
    theirs = run_query(
        "sales.by_staff",
        {"date_from": "2026-08-25", "date_to": "2026-08-25"},
        hub=OTHER_HUB,
    )
    check(
        "the neighbour sees exactly their own",
        [r["staff_id"] for r in theirs],
        [NEIGHBOUR_USER],
    )


# ── Runner ───────────────────────────────────────────────────────────────────────────────


def main() -> int:
    print(
        f"Postgres battery · staff attribution (sales#179) · db {DB} · container {CONTAINER}"
    )
    psql(["-c", f'CREATE DATABASE "{DB}"'])
    try:
        load_migrations()
        test_the_door_writes_who_attended_next_to_who_charged()
        test_the_two_attributions_can_be_different_people()
        test_by_staff_comes_back_with_the_day()
        test_the_sales_list_projects_the_attribution()
        test_an_unattributed_sale_is_invisible_to_the_report()
        test_a_neighbour_hub_never_shows_up()
    finally:
        psql(["-c", f'DROP DATABASE IF EXISTS "{DB}" WITH (FORCE)'])

    print()
    if failures:
        print(f"✗ {len(failures)} failure(s):")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("✓ every sale says who attended, and the per-person report finds them")
    return 0


if __name__ == "__main__":
    sys.exit(main())
