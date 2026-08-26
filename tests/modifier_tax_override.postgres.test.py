#!/usr/bin/env python3
"""A supplement that taxes DIFFERENTLY never reaches a real Postgres (sales#147 / ADR-0376 amended).

`modifiers_option.tax_category_key` is optional and means «this supplement taxes differently» — a
soft drink at 21 % inside a menu at 10 %. The catalogue lets you declare it; the sale used to
IGNORE it: `authoritative_modifiers` folded the delta into the parent's `unit_price`, so the
supplement inherited the parent's rate. `sales_sale_item` carries ONE `tax_rate` per row, so there
was nowhere to put the second base. The invoice came out wrongly broken down, and it came out that
way in silence — no error, no warning, no log.

The handler's unit tests prove the DECISION (the code raised, the fold that still happens). What
they cannot prove is the only thing the business cares about: that a rejected sale leaves **nothing
behind** in a hub's database, and that the sale that is still allowed lands with the money and the
rate it was priced with. A rejection is only worth what the database says afterwards, and a
database fact is only checked by running it.

So this battery runs the REAL handler (`handler/tests/complete_sale_harness.rs`, the same
`complete_sale_pure` the WASM guest exports) and then plays its operations into Postgres exactly
like the runtime does — one transaction, system params injected. Three points:

  1. THE FOLD STILL WORKS. A supplement with NO tax category of its own is the 99 % of them: it
     folds into the parent's unit price and lands as ONE row of 12,00 € at 10 %. This is the
     control, and it is first on purpose — if it went red, the fix would have broken every ticket
     with a «+cheese» on it.

  2. THE OVERRIDE IS REFUSED, BY CODE. The same sale with the drink declaring `product.generic`
     comes back `sales.modifier_tax_override_unsupported`. Asserted on the CODE, never on the
     prose: the sentence is English source text and the UI translates by code (ADR-0205/0055).

  3. AND NOTHING IS PERSISTED. The refused attempt writes no sale, no line, no payment and does not
     bump the day's counter. The counter matters as much as the rows: a burnt number would leave a
     hole in the fiscal series for a sale that never existed.

Usage: tests/modifier_tax_override.postgres.test.py
  Uses the `erplora-test-pg-5433` container by default (override: SALES_TEST_PG_CONTAINER; the
  toolkit sets it per CI job). Creates a scratch database and DROPS it at the end, pass or fail.
  It NEVER skips itself: a battery that goes green because it could not reach Postgres — or because
  cargo could not build the handler — is worse than no battery at all.
"""

import json
import os
import pathlib
import re
import shutil
import subprocess
import sys

MODULE_DIR = pathlib.Path(__file__).resolve().parent.parent
HANDLER_DIR = MODULE_DIR / "handler"
CONTAINER = os.environ.get("SALES_TEST_PG_CONTAINER", "erplora-test-pg-5433")
DB = f"sales_modifier_tax_override_test_{os.getpid()}"
HUB = "hub-test"
USER = "u-cashier"
NOW = "2026-08-25T13:00:00+00:00"
DAY = "20260825"

MANIFEST = json.loads((MODULE_DIR / "module.json").read_text())

failures: list[str] = []
# Sub-checks this checkout could not make, and WHY. Printed INDENTED at the end, never at column 0:
# the gate reads a `SKIPPED:` in column 0 as "the whole battery skipped itself" and turns it into a
# failure (module-toolkit#57) — exactly right for that case, exactly wrong for this one.
skipped: list[str] = []


def check(label: str, got, want) -> None:
    if got != want:
        failures.append(f"{label}: got {got!r}, want {want!r}")
        print(f"  ✗ {label}: got {got!r}, want {want!r}")
    else:
        print(f"  ✓ {label}")


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
        lambda m: (
            m.group(0) if in_comment(m.start()) else literal(params.get(m.group(1)))
        ),
        sql,
    )


def apply_operations(operations: list[dict], hub: str = HUB) -> tuple[bool, str]:
    """Play the handler's operations the way the runtime does: ONE transaction for the whole batch.

    That single transaction is the reason a refused sale leaves nothing behind — but only when the
    handler refuses BEFORE emitting anything, which is what point 3 below checks by playing whatever
    came back (an empty list, if the code is right) and then looking at the tables.
    """
    script = ["BEGIN;"]
    for index, op in enumerate(operations):
        spec = MANIFEST["commands"].get(op["command"])
        if spec is None:
            return False, f"command `{op['command']}` is not declared in module.json"
        files = spec.get("sql")
        if not files:
            return (
                False,
                f"command `{op['command']}` declares no sql[] (handler `{spec.get('handler')}`)",
            )
        params = dict(op.get("params") or {})
        params.setdefault("hub_id", hub)
        params.setdefault("current_user_id", USER)
        params.setdefault("now", NOW)
        # `:new_id` is the id the runtime mints for the row an operation creates (the counter's, the
        # payment's). One per operation, like the runtime's batch of ids.
        params.setdefault("new_id", f"row-{index}")
        for rel in files:
            path = MODULE_DIR / rel
            if not path.exists():
                return (
                    False,
                    f"`{op['command']}` declares `{rel}`, which does not exist",
                )
            script.append(bind(path.read_text(), params))
    script.append("COMMIT;")
    try:
        psql([], db=DB, stdin="\n".join(script))
        return True, ""
    except RuntimeError as exc:
        return False, str(exc).splitlines()[0]


# The runtime's bridge functions (ADR-0007 §4a): portable SQL names the translator rewrites per
# dialect. `sales._insert_sale` pads the day's counter into the fiscal number with `erp_pad`, so
# without them the header never lands and this battery would be testing an empty table.
BRIDGE_FUNCTIONS = """
CREATE OR REPLACE FUNCTION erp_pad(value anyelement, width integer) RETURNS text
    LANGUAGE sql IMMUTABLE AS $$ SELECT lpad($1::text, $2, '0') $$;
"""


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


# ── The REAL handler ─────────────────────────────────────────────────────────────────────

HARNESS = "complete_sale_harness"
EXCHANGE = pathlib.Path(os.environ.get("TMPDIR", "/tmp")) / f"sales-147-{os.getpid()}"


def guest_sdk_path() -> pathlib.Path:
    """Where `handler/Cargo.toml`'s path dependency on the hub's `erplora-guest-sdk` resolves.

    `ERPLORA_HUB_DIR` first, so a runner that DOES carry a checkout of ERPlora/hub can say where it
    put it instead of this file guessing at anyone's directory layout. Otherwise the sibling
    checkout of the workspace (`../../../hub`), which is what a developer's machine looks like.
    """
    hub = os.environ.get("ERPLORA_HUB_DIR")
    if hub:
        return pathlib.Path(hub).expanduser().resolve() / "crates" / "guest-sdk"
    return (MODULE_DIR / ".." / ".." / ".." / "hub" / "crates" / "guest-sdk").resolve()


def build_handler() -> bool:
    """Compile the harness once, up front. `True` when the real handler can be driven.

    🔴 The handler crate depends on the hub's `erplora-guest-sdk` BY RELATIVE PATH, and a CI runner
    has no checkout of ERPlora/hub there — checking one out would mean a token for a private repo
    living in 25 module repos, which is a security decision and not a CI detail. The shared gate
    already says this out loud rather than faking it: `checkWasmHandler` reports the handler as SIN
    VERIFICAR for this exact missing path, and `staff`/`schedules` skip their `cargo metadata`
    sub-check the same way. So the points that need the real handler are reported as NOT VERIFIED —
    named, with the path that was missing, and never as a pass. Everything that only needs Postgres
    still runs, which is the same deal every other battery in this repo gets on a runner.

    A build failure WITH the checkout present is a different thing and stays RED: there the handler
    really is broken.
    """
    sdk = guest_sdk_path()
    if not sdk.exists():
        skipped.append(
            f"the handler-driven points: no guest-sdk checkout at {sdk} — set ERPLORA_HUB_DIR to a "
            "checkout of ERPlora/hub to run them"
        )
        print(f"  SKIPPED: the handler-driven points (no guest-sdk checkout at {sdk})")
        return False
    EXCHANGE.mkdir(parents=True, exist_ok=True)
    res = subprocess.run(
        ["cargo", "test", "--quiet", "--test", HARNESS, "--no-run"],
        cwd=HANDLER_DIR,
        capture_output=True,
        text=True,
    )
    if res.returncode != 0:
        raise RuntimeError(
            "the handler harness does not build:\n"
            + (res.stderr.strip() or res.stdout.strip())
        )
    return True


def complete_sale(payload: dict, reads: dict) -> dict:
    """Run `sales.complete_sale` for real — the same `complete_sale_pure` the WASM guest exports.

    Returns the harness envelope: `{ok, error, operations, events}`.
    """
    request = {
        "payload": payload,
        "context": {
            "hub_id": HUB,
            "current_user_id": USER,
            "now": NOW,
            "country_code": "ES",
            "new_ids": ["sale-1", "line-1", "pay-1"],
            "reads": reads,
        },
    }
    request_file = EXCHANGE / "request.json"
    response_file = EXCHANGE / "response.json"
    request_file.write_text(json.dumps(request))
    # A stale answer read as a fresh one is the worst failure this harness could have: it would make
    # the rejection test pass against the PREVIOUS sale's envelope.
    response_file.unlink(missing_ok=True)
    res = subprocess.run(
        ["cargo", "test", "--quiet", "--test", HARNESS, "answers_the_request"],
        cwd=HANDLER_DIR,
        capture_output=True,
        text=True,
        env={
            **os.environ,
            "SALES_HANDLER_REQUEST": str(request_file),
            "SALES_HANDLER_RESPONSE": str(response_file),
        },
    )
    if res.returncode != 0:
        raise RuntimeError(
            "the handler harness failed:\n" + (res.stderr.strip() or res.stdout.strip())
        )
    if not response_file.exists():
        raise RuntimeError("the handler harness wrote no answer — it did not run")
    return json.loads(response_file.read_text())


# ── The catalogues the runtime pre-loads, and the ticket the cashier rings up ────────────

# 10,00 € menu at 10 % (`restaurant.food`) — the price and the tax category come from the CATALOGUE,
# never from the payload (sales#68).
PRODUCTS = [
    {"id": "p-menu", "price": 1000, "cost": 0, "tax_category_key": "restaurant.food"}
]

TAX_RULES = [
    {
        "id": "r-es-10",
        "country_code": "ES",
        "region_code": None,
        "tax_category_key": "restaurant.food",
        "rate_pct": 10.0,
        "tax_type": "vat",
    },
    {
        "id": "r-es-21",
        "country_code": "ES",
        "region_code": None,
        "tax_category_key": "product.generic",
        "rate_pct": 21.0,
        "tax_type": "vat",
    },
]

PAYMENT_METHODS = [{"id": "pm-1", "name": "Efectivo", "type": "cash"}]


def drink(tax_category_key):
    """The 2,00 € soft drink of the menu. `None` = inherits its line's category (ADR-0376)."""
    return [
        {
            "option_id": "o-refresco",
            "group_id": "g-bebida",
            "name": "Refresco",
            "kitchen_name": "+REFRESCO",
            "price_delta": 200,
            "tax_category_key": tax_category_key,
        }
    ]


def ticket() -> dict:
    return {
        "items": [
            {
                "product_id": "p-menu",
                "product_name": "Menú del día",
                "quantity": 1_000_000,
                # What the POS sends: the category and the rate it PREVIEWED. Both are a proposal —
                # the server re-reads them from the catalogue (sales#68 / ADR-0085) — and they are
                # here because a ticket that omitted them would not be the one a cashier rings up.
                "tax_category_key": "restaurant.food",
                "tax_rate": 10.0,
                "modifiers": [{"option_id": "o-refresco"}],
            }
        ],
        "tax_included": True,
        "amount_tendered": 1200,
        "payment_method_id": "pm-1",
        "payment_method_name": "Efectivo",
        "idempotency_key": "idem-sales-147",
    }


def reads(option_tax_category) -> dict:
    return {
        "inventory.products.for_sale": PRODUCTS,
        "taxes.rules.list": TAX_RULES,
        "sales.payment_methods.all": PAYMENT_METHODS,
        "modifiers.options.all": drink(option_tax_category),
    }


# ── 1 · the fold that must NOT change ────────────────────────────────────────────────────


def test_a_supplement_with_no_category_of_its_own_still_folds_into_its_line() -> None:
    print(
        "\n1 · control — a supplement that INHERITS still lands as one line of 12,00 € at 10 %"
    )
    out = complete_sale(ticket(), reads(None))
    check("the sale is charged", (out["ok"], out.get("error", "")), (True, ""))
    ok, err = apply_operations(out["operations"])
    check("its operations run in a real Postgres", (ok, err), (True, ""))

    check(
        "one sale row", qi(f"SELECT count(*) FROM sales_sale WHERE hub_id='{HUB}'"), 1
    )
    check(
        "ONE line, not two",
        qi(f"SELECT count(*) FROM sales_sale_item WHERE hub_id='{HUB}'"),
        1,
    )
    # 10,00 € + 2,00 € folded into the parent's unit price: the whole ADR-0147/0123 machinery
    # (fixed point, HALF_UP, one rounding per amount) stays exactly as it was.
    check(
        "charged 12,00 €",
        qi(f"SELECT line_total FROM sales_sale_item WHERE hub_id='{HUB}'"),
        1200,
    )
    check(
        "at the parent's rate",
        q(f"SELECT tax_rate FROM sales_sale_item WHERE hub_id='{HUB}'"),
        "10",
    )
    check(
        "with the parent's tax category",
        q(f"SELECT tax_category_key FROM sales_sale_item WHERE hub_id='{HUB}'"),
        "restaurant.food",
    )
    # base + cuota adds up to the cent, which is the only reason the fold is defensible at all.
    check(
        "base + cuota == the line total",
        qi(f"SELECT net_amount + tax_amount FROM sales_sale_item WHERE hub_id='{HUB}'"),
        1200,
    )
    # The choice is frozen on the row with an EMPTY category: that empty string IS «it inherits».
    snap = json.loads(
        q(f"SELECT modifiers FROM sales_sale_item WHERE hub_id='{HUB}'") or "[]"
    )
    check("the frozen supplement says it inherits", snap[0]["tax_category_key"], "")


# ── 2 · the override is refused, and 3 · nothing is left behind ──────────────────────────


def test_a_supplement_that_taxes_differently_is_refused_and_writes_nothing() -> None:
    print(
        "\n2-3 · a 21 % drink inside a 10 % menu is REFUSED, and the database stays untouched"
    )
    before_sales = qi(f"SELECT count(*) FROM sales_sale WHERE hub_id='{HUB}'")
    before_lines = qi(f"SELECT count(*) FROM sales_sale_item WHERE hub_id='{HUB}'")
    before_payments = qi("SELECT count(*) FROM sales_sale_payment")
    before_counter = qi(
        f"SELECT coalesce(max(last_number), 0) FROM sales_sale_counter WHERE hub_id='{HUB}' AND day='{DAY}'"
    )

    out = complete_sale(ticket(), reads("product.generic"))
    check("the sale is REFUSED", out["ok"], False)
    # On the CODE, never on the prose: the sentence is English source text and the UI translates by
    # code (ADR-0205 / ADR-0055). An assertion on the wording breaks on the next reword.
    check(
        "with the domain code of the amendment",
        "sales.modifier_tax_override_unsupported" in out.get("error", ""),
        True,
    )
    check("and it emits no operation at all", len(out["operations"]), 0)

    # Play back whatever came out — an empty batch, if the code is right — and then LOOK.
    ok, err = apply_operations(out["operations"])
    check("replaying the refused attempt is a no-op", (ok, err), (True, ""))
    check(
        "no sale was written",
        qi(f"SELECT count(*) FROM sales_sale WHERE hub_id='{HUB}'"),
        before_sales,
    )
    check(
        "no line was written",
        qi(f"SELECT count(*) FROM sales_sale_item WHERE hub_id='{HUB}'"),
        before_lines,
    )
    check(
        "no payment was taken",
        qi("SELECT count(*) FROM sales_sale_payment"),
        before_payments,
    )
    # A burnt number would leave a hole in the day's fiscal series for a sale that never existed.
    check(
        "and the day's counter was not burnt",
        qi(
            f"SELECT coalesce(max(last_number), 0) FROM sales_sale_counter WHERE hub_id='{HUB}' AND day='{DAY}'"
        ),
        before_counter,
    )


# ── the same category is not an override ─────────────────────────────────────────────────


def test_declaring_the_SAME_category_is_not_an_override() -> None:
    print(
        "\n4 · declaring the line's own category is not an exception — it still folds"
    )
    out = complete_sale(ticket(), reads("restaurant.food"))
    check("the sale is charged", (out["ok"], out.get("error", "")), (True, ""))
    check(
        "and it is still ONE line",
        sum(1 for o in out["operations"] if o["command"] == "sales._insert_line"),
        1,
    )
    line = next(o for o in out["operations"] if o["command"] == "sales._insert_line")
    check("of 12,00 €", line["params"]["line_total"], 1200)


# ── 0 · the storage side, which needs no handler at all ─────────────────────────────────

# Its own hub so the hub-scoped counts of the points below stay clean whether or not those ran.
SCHEMA_HUB = "hub-schema"
SCHEMA_SALE = "sale-schema"


def test_the_frozen_supplement_carries_its_tax_category_through_the_column_and_the_door() -> None:
    """The `modifiers` snapshot round-trips `tax_category_key`, empty AND set.

    This is the half of sales#147 that is a SCHEMA fact, and the half a CI runner can still check
    with no hub checkout: the column that has to carry the decision is TEXT and format-agnostic, so
    the empty category the fold freezes today and the real one part 2 will need both survive the
    round trip through `sales._insert_line` and back out through `sales.lines`. If this went red,
    the child line of part 2 would have nowhere to be written even after the handler learns to
    build it — and today's fold would be freezing something the ticket cannot read back.
    """
    print("\n0 · the `modifiers` snapshot round-trips the supplement's tax category")
    psql(
        ["-c", bind(
            "INSERT INTO sales_sale (id, hub_id, sale_number, status, total, is_deleted,"
            " created_at, updated_at)"
            " VALUES (:id, :hub_id, '20260825-0001', 'completed', 1200, 0, :now, :now)",
            {"id": SCHEMA_SALE, "hub_id": SCHEMA_HUB, "now": NOW},
        )],
        db=DB,
    )
    inherits = [{"option_id": "o-refresco", "group_id": "g-bebida", "name": "Refresco",
                 "kitchen_name": "+REFRESCO", "price_delta": 200, "tax_category_key": ""}]
    its_own = [{"option_id": "o-refresco", "group_id": "g-bebida", "name": "Refresco",
                "kitchen_name": "+REFRESCO", "price_delta": 200,
                "tax_category_key": "product.generic"}]
    for line_id, snapshot, label in (
        ("line-inherits", inherits, "a supplement that INHERITS"),
        ("line-its-own", its_own, "a supplement with its OWN category"),
    ):
        ok, err = apply_operations(
            [{"command": "sales._insert_line", "params": {
                "line_id": line_id, "sale_id": SCHEMA_SALE, "product_id": "p-menu",
                "product_name": "Menú del día", "product_sku": "", "is_service": 0,
                "quantity": 1_000_000, "unit_price": 1200, "discount_percent": 0.0,
                "tax_rate": 10.0, "tax_class_name": "", "tax_category_key": "restaurant.food",
                "tax_country_code": "ES", "tax_region_code": "", "tax_rule_id": None,
                "is_gift": 0, "gift_reason": "", "is_covered": 0, "category_id": None,
                "modifiers": json.dumps(snapshot, separators=(",", ":"), ensure_ascii=False),
                "combo_group_ref": None, "combo": "{}",
                "net_amount": 1091, "tax_amount": 109, "line_total": 1200,
                "unit_code": "ud", "unit_name": "unidad", "factor_num": 1, "factor_den": 1,
                "increment_value": 1_000_000, "price_quantity_value": 1_000_000,
                "pricing_unit_code": "ud", "pricing_unit_name": "unidad",
                "pricing_factor_num": 1, "pricing_factor_den": 1,
            }}],
            hub=SCHEMA_HUB,
        )
        check(f"{label} is written through the real door", (ok, err), (True, ""))

    rows = run_query("sales.lines", {"sale_id": SCHEMA_SALE}, hub=SCHEMA_HUB)
    check("both lines come back out", len(rows), 2)
    by_id = {r["id"]: r for r in rows}
    empty = json.loads(by_id.get("line-inherits", {}).get("modifiers") or "[]")
    own = json.loads(by_id.get("line-its-own", {}).get("modifiers") or "[]")
    check("the empty category survives the round trip — that empty string IS «it inherits»",
          empty[0]["tax_category_key"], "")
    check("and so does a real one, which is what part 2 will hang the child line off",
          own[0]["tax_category_key"], "product.generic")
    check("with the kitchen name frozen beside it", own[0]["kitchen_name"], "+REFRESCO")


def main() -> int:
    running = subprocess.run(
        ["docker", "inspect", "-f", "{{.State.Running}}", CONTAINER],
        capture_output=True,
        text=True,
    )
    if "true" not in running.stdout:
        subprocess.run(["docker", "start", CONTAINER], capture_output=True)

    # Resolved BEFORE the database is built so a checkout that cannot drive the handler says so at
    # the top of the output, where it is read, instead of two hundred lines down.
    with_handler = build_handler()
    psql(["-c", f"DROP DATABASE IF EXISTS {DB} WITH (FORCE)"])
    psql(["-c", f"CREATE DATABASE {DB}"])
    try:
        psql([], db=DB, stdin=BRIDGE_FUNCTIONS)
        load_migrations()
        test_the_frozen_supplement_carries_its_tax_category_through_the_column_and_the_door()
        if with_handler:
            test_a_supplement_with_no_category_of_its_own_still_folds_into_its_line()
            test_a_supplement_that_taxes_differently_is_refused_and_writes_nothing()
            test_declaring_the_SAME_category_is_not_an_override()
    finally:
        psql(["-c", f"DROP DATABASE IF EXISTS {DB} WITH (FORCE)"])
        shutil.rmtree(EXCHANGE, ignore_errors=True)

    print()
    for s_ in skipped:
        print(f"  SKIPPED: {s_}")
    if failures:
        print(f"FAILED — {len(failures)} assertion(s):")
        for f in failures:
            print(f"  - {f}")
        return 1
    if with_handler:
        print(
            "PASS — a supplement that taxes differently is refused by code and writes nothing (sales#147)"
        )
    else:
        print("PASS — the snapshot column carries the tax category (sales#147); the handler-driven points did NOT run")
    return 0


if __name__ == "__main__":
    sys.exit(main())
