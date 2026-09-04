#!/usr/bin/env python3
"""The day's numbering survives the 10.000th sale (sales#241) — against a REAL Postgres 18.

THE SYMPTOM. From the 10.000th sale of a single day the till STOPPED CHARGING. `uq_sale_number
(hub_id, sale_number)` rejected every sale that followed, with an error that is not actionable for
a cashier:

    duplicate key value violates unique constraint "uq_sale_number"
    Key (hub_id, sale_number)=(hub-test, 20260901-1000) already exists.

WHY. `commands/_insert_sale.sql` builds the fiscal number as `:day || '-' || erp_pad(counter, 4)`.
`erp_pad` is a bridge function of the portable subset (ADR-0007 §4a) that the runtime lowers to the
dialect. The Postgres `lpad` imposes an EXACT width — it CUTS what does not fit — so the shim
turned `10000` into `1000` and the 10.000th sale of the day collided with the 1.000th.

The width has to be a MINIMUM, never a ceiling. That contract lives in the kernel and was fixed
there (ERPlora/hub#1393: `lpad(v, greatest(width, length(v)), fill)`, mirrored in the toolkit's
validator by module-toolkit#139). This battery is the CONSUMER side of it: what `sales` itself must
keep true once the number outgrows four digits — the number is minted whole, the UNIQUE index takes
it, and every query that reads it back gives it back entire.

WHY IT CARRIES BOTH RENDERINGS. A harness that lowers `erp_pad` its own way proves only its own
lowering. So `pad_truncating` — the expression the runtime emitted BEFORE hub#1393 — stays here as
the CONTROL: the same scenario, run through it, must still blow up on the UNIQUE index. If that
control ever comes back green the harness has stopped being able to see the bug, and every green
below is worthless. A check that cannot catch the positive is not a check.

It never rewrites numbers already issued: only the next one past the width changes shape, and the
shape is still `YYYYMMDD-<sequence>`.

Usage: tests/sale_number_width.postgres.test.py
  Uses the `erplora-test-pg-5433` container by default (override: SALES_TEST_PG_CONTAINER).
  Creates scratch databases and DROPS them at the end, pass or fail.
"""

import json
import os
import pathlib
import re
import subprocess
import sys

MODULE_DIR = pathlib.Path(__file__).resolve().parent.parent
CONTAINER = os.environ.get("SALES_TEST_PG_CONTAINER", "erplora-test-pg-5433")
DB_PREFIX = f"sales_number_width_test_{os.getpid()}"
HUB = "hub-test"
OTHER_HUB = "hub-neighbour"
DAY = "20260901"
# The day before, for the ordering scenario: a length-prefixed key has to keep the DAY as the
# leading term, or a 4-digit day would sort ahead of a 5-digit one and the history would reshuffle
# by width instead of by date.
PREV_DAY = "20260831"

MANIFEST = json.loads((MODULE_DIR / "module.json").read_text())
LIST = MANIFEST["queries"]["sales.list"]

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
    """Bind the `:name` placeholders the way the driver does. A `:param` the payload does not
    carry binds as NULL (`DynNull`, hub/crates/db/src/lib.rs)."""
    return PARAM.sub(lambda m: literal(params.get(m.group(1))), sql)


# ── The bridge-function shim, in miniature (hub/crates/db/src/lib.rs, `shim_functions`) ───


def _expand(sql: str, token: str, render) -> str:
    """Textual substitution anchored on balanced parentheses, recursive on the argument — the
    same scan the runtime's translator does, and like it, blind to a token inside a `--` comment."""
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


def _split_args(args: str) -> tuple[str, str]:
    depth = 0
    for i, ch in enumerate(args):
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        elif ch == "," and depth == 0:
            return args[:i].strip(), args[i + 1 :].strip()
    raise AssertionError(f"erp_pad takes two arguments, got: {args}")


def pad_min_width(args: str) -> str:
    """What the runtime emits TODAY (hub#1393): the width is a floor, so a longer value survives
    whole. Kept as ONE expression so this harness stays a mirror of the kernel and not a second
    opinion about what the number should look like."""
    value, width = _split_args(args)
    return f"lpad(({value})::text, greatest({width}, length(({value})::text)), '0')"


def pad_truncating(args: str) -> str:
    """What the runtime emitted BEFORE hub#1393 — bare `lpad`, an EXACT width. It exists only so
    the control below can prove this harness still sees the bug (`lpad('10000', 4, '0')` = `1000`)."""
    value, width = _split_args(args)
    return f"lpad(({value})::text, {width}, '0')"


def lower(sql: str, pad) -> str:
    return _expand(sql, "erp_pad(", pad)


# ── The module's own SQL, read from disk so the test follows the code ─────────────────────

BUMP = (MODULE_DIR / "commands" / "_bump_counter.sql").read_text()
INSERT = (MODULE_DIR / "commands" / "_insert_sale.sql").read_text()

SALE_DEFAULTS = {
    "status": "completed",
    "subtotal": 100,
    "tax_amount": 21,
    "tax_breakdown": "{}",
    "discount_amount": 0,
    "discount_percent": 0,
    "total": 121,
    "gift_total": 0,
    "payment_method_id": "pm-cash",
    "payment_method_name": "Efectivo",
    "amount_tendered": 121,
    "change_due": 0,
    "customer_id": None,
    "customer_name": "",
    "employee_id": None,
    "notes": "",
    "source_module": "",
    "channel": "pos",
    "order_id": None,
    "staff_id": None,
    "appointment_id": None,
    "document_type": "ticket",
    "now": "2026-09-01T10:00:00Z",
    "current_user_id": "u-1",
}


def load_migrations(db: str) -> None:
    for mig in sorted((MODULE_DIR / "migrations" / "postgres").glob("*.sql")):
        sql = DDL_TOKEN.sub(lambda m: DDL_TYPES[m.group(1).upper()], mig.read_text())
        psql([], db=db, stdin=sql)


def set_counter(db: str, value: int, hub: str = HUB, day: str = DAY) -> None:
    """Put the day's counter one short of the sale under test — the whole point of the battery is
    to reach the 10.000th sale WITHOUT charging 9.999 of them first."""
    psql(
        [
            "-c",
            "INSERT INTO sales_sale_counter (id, hub_id, day, last_number) VALUES "
            f"('ctr-{hub}-{day}', '{hub}', '{day}', {value}) "
            "ON CONFLICT (hub_id, day) DO UPDATE SET last_number = EXCLUDED.last_number",
        ],
        db=db,
    )


def complete_sale(
    db: str,
    sale_id: str,
    pad,
    hub: str = HUB,
    at: str | None = None,
    day: str = DAY,
) -> None:
    """The two operations `sales.complete_sale` runs, in the order and the transaction the handler
    runs them (`handler/src/lib.rs`): bump the day's counter, then read it back INSIDE the INSERT.
    No read-back from the guest, so the number is minted by this SQL and nothing else.

    `at` is the charge instant. Distinct instants matter for the ordering scenario: the screen
    opens on `created_at desc` and ties would make the assertion depend on the heap order."""
    params = dict(SALE_DEFAULTS)
    params.update(
        {
            "new_id": f"ctr-{hub}-{day}",
            "hub_id": hub,
            "day": day,
            "sale_id": sale_id,
            "idempotency_key": f"key-{sale_id}",
        }
    )
    if at is not None:
        params["now"] = at
    sql = (
        "BEGIN;\n"
        + bind(BUMP, params)
        + "\n"
        + bind(lower(INSERT, pad), params)
        + "\nCOMMIT;"
    )
    psql(["-q"], db=db, stdin=sql)


def number_of(db: str, sale_id: str) -> str:
    return psql(
        ["-tAc", f"SELECT sale_number FROM sales_sale WHERE id = '{sale_id}'"], db=db
    ).strip()


def seq_key_of(db: str, sale_id: str) -> str:
    """The synthetic sort key `sales.list` projects for a row (sales#243). It is read from the
    QUERY, not from the table: `sale_seq` is a projection and no column stores it — which is the
    point, since the number itself is a fiscal datum and is never rewritten."""
    base = lower(
        _expand(
            (MODULE_DIR / LIST["sql"]).read_text().strip().rstrip(";"),
            "erp_date(",
            lambda arg: f"((({arg})::date))",
        ),
        pad_min_width,
    )
    sql = bind(
        f"SELECT sub.sale_seq FROM ( {base} ) AS sub WHERE sub.id = :sale_id",
        {"hub_id": HUB, "sale_id": sale_id},
    )
    return psql(["-tAc", sql], db=db).strip()


# ── The list engine, in miniature (crates/runtime/src/queries.rs) ─────────────────────────


def run_list(
    db: str, filters: dict, sort: str = "created_at", dir_: str = "desc"
) -> list[str]:
    """`sales.list` the way the runtime runs it: the module's SQL wrapped as a derived table, plus
    the WHERE of every declared filter whose params came in. The projection is trimmed to
    `sub.sale_number` — the number coming back WHOLE is what is under test.

    The `sort` whitelist is enforced here the way `run_list` enforces it in
    `crates/runtime/src/queries.rs`: a column the manifest does not concede is refused, never
    interpolated. Without this the harness would happily ORDER BY a column no hub can ask for, and
    the ordering scenario below would go green against a manifest that concedes nothing."""
    spec = LIST["list"]
    if sort not in spec["sort"]:
        raise RuntimeError(
            f"sales.list does not concede `{sort}` as a sort column "
            f"(module.json declares {spec['sort']})"
        )
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
    base = _expand(
        (MODULE_DIR / LIST["sql"]).read_text().strip().rstrip(";"),
        "erp_date(",
        lambda arg: f"((({arg})::date))",
    )
    # The query projects its sort key with `erp_pad` too (sales#243), so the base has to go through
    # the same lowering the runtime applies before Postgres ever sees it.
    base = lower(base, pad_min_width)
    where = f" WHERE {' AND '.join(conds)}" if conds else ""
    sql = (
        f"SELECT sub.sale_number FROM ( {base} ) AS sub{where} "
        f"ORDER BY sub.{sort} {dir_} LIMIT :limit OFFSET :offset"
    )
    raw = psql(["-tAc", bind(sql, params)], db=db)
    return [line.strip() for line in raw.splitlines() if line.strip()]


def run_query(db: str, name: str, params: dict) -> list[str]:
    """One of the module's declared queries, projected down to its `sale_number` column."""
    sql = (
        (MODULE_DIR / MANIFEST["queries"][name]["sql"]).read_text().strip().rstrip(";")
    )
    raw = psql(
        ["-tAc", f"SELECT sub.sale_number FROM ( {bind(sql, params)} ) AS sub"], db=db
    )
    return [line.strip() for line in raw.splitlines() if line.strip()]


# ── Assertions ───────────────────────────────────────────────────────────────────────────


def check(label: str, expected, actual) -> None:
    if expected != actual:
        failures.append(f"{label} — expected [{expected!r}], got [{actual!r}]")
        print(f"  FAIL: {label} — expected [{expected!r}], got [{actual!r}]")
    else:
        print(f"  ok: {label} = {actual!r}")


# ── Scenarios ────────────────────────────────────────────────────────────────────────────


def scenario_control(db: str) -> None:
    """THE CONTROL. With the pre-hub#1393 rendering the 10.000th sale MUST still collide. If this
    ever stops blowing up, the harness has gone blind and nothing else here means anything."""
    set_counter(db, 999)
    complete_sale(db, "sale-1000", pad_truncating)
    check(
        "control: the 1.000th sale is numbered as it always was",
        f"{DAY}-1000",
        number_of(db, "sale-1000"),
    )
    set_counter(db, 9999)
    try:
        complete_sale(db, "sale-10000", pad_truncating)
        check(
            "control: the truncating shim STILL collides on the 10.000th sale",
            "duplicate key value violates unique constraint",
            f"it went through and wrote {number_of(db, 'sale-10000')!r}",
        )
    except RuntimeError as err:
        first = str(err).splitlines()[0]
        check(
            "control: the truncating shim STILL collides on the 10.000th sale",
            True,
            'duplicate key value violates unique constraint "uq_sale_number"' in first,
        )


def scenario_fixed(db: str) -> None:
    """The contract `sales` has to keep once the counter outgrows the four-digit pad."""
    # Three sales that fit in the pad, charged in order. They are the «nothing changed» control of
    # the whole battery: whatever the wide numbers do, these must look exactly as they always did.
    set_counter(db, 998)
    complete_sale(db, "sale-0999", pad_min_width, at="2026-09-01T09:00:00Z")
    set_counter(db, 999)
    complete_sale(db, "sale-1000", pad_min_width, at="2026-09-01T10:00:00Z")
    set_counter(db, 1999)
    complete_sale(db, "sale-2000", pad_min_width, at="2026-09-01T10:30:00Z")
    check(
        "what already fitted is padded exactly as before",
        [f"{DAY}-0999", f"{DAY}-1000", f"{DAY}-2000"],
        [number_of(db, s) for s in ("sale-0999", "sale-1000", "sale-2000")],
    )

    # A neighbour hub charging its own 10.000th sale the same day must not stand in the way:
    # the UNIQUE index is `(hub_id, sale_number)` and the counter is per hub.
    set_counter(db, 9999, hub=OTHER_HUB)
    complete_sale(db, "sale-neighbour", pad_min_width, hub=OTHER_HUB)

    set_counter(db, 9999)
    complete_sale(db, "sale-10000", pad_min_width, at="2026-09-01T11:00:00Z")
    check(
        "the 10.000th sale is minted WHOLE and does not collide with the 1.000th",
        f"{DAY}-10000",
        number_of(db, "sale-10000"),
    )
    check(
        "the shape is still YYYYMMDD-<sequence>",
        True,
        re.fullmatch(r"\d{8}-\d+", number_of(db, "sale-10000")) is not None,
    )
    check(
        "the number already issued was NOT rewritten",
        f"{DAY}-1000",
        number_of(db, "sale-1000"),
    )

    # The day carries on past the border: 10.001 is the next one, not a second 10.000.
    complete_sale(db, "sale-10001", pad_min_width, at="2026-09-01T12:00:00Z")
    check(
        "the day keeps numbering past the border",
        f"{DAY}-10001",
        number_of(db, "sale-10001"),
    )

    # Six digits is the same rule one order of magnitude further out — the pad is a floor, not a
    # ceiling that has merely been raised.
    set_counter(db, 999_999)
    complete_sale(db, "sale-1m", pad_min_width, at="2026-09-01T13:00:00Z")
    check(
        "the floor holds at a million too",
        f"{DAY}-1000000",
        number_of(db, "sale-1m"),
    )


def scenario_ordering(db: str) -> None:
    """The history reads in issue order — by the default view AND by the «Nº» column (sales#243).

    `sales.list` opens on `created_at desc` (`default_sort` in module.json), and that is the order
    the screen shows: the wide numbers sit exactly where they were charged, not wherever a string
    comparison would drop them. Below the border the numbers are all the same length, so sorting by
    the column itself is numeric too — that is the part the width guarantees.

    ACROSS the border a plain `ORDER BY sale_number` is NOT numeric: `20260901-10000` lands between
    `-1000` and `-2000`, because the sequence part is no longer fixed-width. That is sales#243, and
    it is what the SYNTHETIC key `sale_seq` fixes — a column the query projects only to be ordered
    by. The fiscal number is never rewritten: `sale_number` stays exactly what was minted, and it
    stays what the column PAINTS.

    The order the key has to produce is (day, sequence-as-a-number), and it produces it as a single
    comparable string because the list engine sorts by ONE column (`crates/runtime/src/queries.rs`)
    — the same constraint that made `services.package_redemption_history` mint `movement_seq`. The
    day part is already fixed-width, so it compares as text; the sequence is length-prefixed, which
    is what makes text comparison agree with numeric comparison at ANY width, without the module
    having to guess a ceiling it would then have to raise again (hub#1393: the pad is a floor)."""
    issue_order = [
        f"{DAY}-0999",
        f"{DAY}-1000",
        f"{DAY}-2000",
        f"{DAY}-10000",
        f"{DAY}-10001",
        f"{DAY}-1000000",
    ]
    check(
        "the default view (created_at desc) reads in issue order, wide numbers included",
        list(reversed(issue_order)),
        run_list(db, {}),
    )

    by_number = [
        n.split("-", 1)[1] for n in run_list(db, {}, sort="sale_number", dir_="asc")
    ]
    for width, expected in ((4, ["0999", "1000", "2000"]), (5, ["10000", "10001"])):
        check(
            f"a {width}-digit sequence sorts numerically by the number column",
            expected,
            [seq for seq in by_number if len(seq) == width],
        )

    # ── sales#243 ────────────────────────────────────────────────────────────────────────
    # THE POSITIVE CONTROL, first. Ordering by the fiscal number itself is TEXT ordering, and the
    # symptom the issue reports is that the 10.000th sale lands BEFORE the 2.000th. If this ever
    # stops being true on its own, everything below goes green without proving anything.
    check(
        "control: ordering by the fiscal number puts the 10.000th BEFORE the 2.000th",
        True,
        by_number.index("10000") < by_number.index("2000"),
    )

    # A sale from an EARLIER day, with a short number. It is the trap of any length-prefixed key:
    # get the pieces in the wrong order and every 4-digit day sorts ahead of every 5-digit one, so
    # the whole history reshuffles by width instead of by date.
    set_counter(db, 6, day=PREV_DAY)
    complete_sale(
        db, "sale-prev", pad_min_width, at="2026-08-31T18:00:00Z", day=PREV_DAY
    )
    check(
        "the earlier day's sale is minted the way it always was",
        f"{PREV_DAY}-0007",
        number_of(db, "sale-prev"),
    )

    numeric_order = [f"{PREV_DAY}-0007", *issue_order]
    check(
        "ascending by the «Nº» column is NUMERIC across widths and across days",
        numeric_order,
        run_list(db, {}, sort="sale_seq", dir_="asc"),
    )
    check(
        "and descending is the exact reverse",
        list(reversed(numeric_order)),
        run_list(db, {}, sort="sale_seq", dir_="desc"),
    )

    # What is PAINTED is the fiscal number, untouched: the key ORDERS, it never replaces. They are
    # two different columns of the same row, and the one the reader sees is the minted one.
    check(
        "the sort key is a column of its own, not the number wearing a different shape",
        [f"{DAY}-0510000", f"{DAY}-071000000"],
        [seq_key_of(db, s) for s in ("sale-10000", "sale-1m")],
    )
    check(
        "and the fiscal number the row carries is still exactly what was minted",
        [f"{DAY}-10000", f"{DAY}-1000000"],
        [number_of(db, s) for s in ("sale-10000", "sale-1m")],
    )

    # The key is an ORDER key and nothing else. Conceding it as a filter or a search column would
    # hand the outside world a second, synthetic way of naming a fiscal document.
    spec = LIST["list"]
    check(
        "`sale_seq` is conceded as a SORT column",
        True,
        "sale_seq" in spec["sort"],
    )
    check(
        "and it is NOT a filter: the number a hub queries by is the fiscal one",
        [],
        [k for k in ("sale_seq",) if k in spec["filters"]],
    )
    check(
        "nor is it searchable",
        [],
        [k for k in ("sale_seq",) if k in spec["search"]],
    )


def scenario_consumers(db: str) -> None:
    """Everything that reads the number back has to hand it over ENTIRE. A five-digit sequence
    that is minted right and then truncated on the way out is the same outage one layer up."""
    wide = f"{DAY}-10000"

    check(
        "sales.get returns the wide number whole",
        [wide],
        run_query(db, "sales.get", {"hub_id": HUB, "sale_id": "sale-10000"}),
    )
    check(
        "sales.by_idempotency_key finds the retry of a wide-numbered sale",
        [wide],
        run_query(
            db,
            "sales.by_idempotency_key",
            {"hub_id": HUB, "idempotency_key": "key-sale-10000"},
        ),
    )
    # «Nº» is a free-text box, so the manifest filters it with `op: "like"` (hub#1182): the
    # cashier types the day, or the tail of the number on the receipt, and the history narrows.
    # These two used to read `[wide]` and `[f"{DAY}-1000"]`, which is what `op: "eq"` answered —
    # correct then, outdated now. What they were written to prove is not exactness, it is that the
    # wide number survives the read path and does NOT collide with the one it used to truncate
    # into, and that is asserted head-on below instead of riding on the old operator — the count
    # is the anti-collision claim, stated rather than implied.
    #
    # What still turns them red, measured one mutation at a time: declaring `sale_number` with an
    # `op` a text box cannot use (back to `eq` → both go red, one short of its superset, the other
    # down to a single row). The truncating shim does NOT reach here — it dies minting, on the
    # UNIQUE index, which is the control scenario's job; and a number mangled on the way out is
    # caught upstream by the ordering scenario, before this one runs.
    check(
        "sales.list hands the wide number back whole, next to the numbers that contain it",
        [f"{DAY}-1000000", wide],
        run_list(db, {"sale_number": wide}),
    )
    narrowed = run_list(db, {"sale_number": f"{DAY}-1000"})
    check(
        "narrowing by the number it used to collide with reaches every number that contains it",
        [f"{DAY}-1000000", f"{DAY}-10001", f"{DAY}-10000", f"{DAY}-1000"],
        narrowed,
    )
    check(
        "and the 1.000th is in that answer exactly once — the 10.000th is a row of its own",
        1,
        narrowed.count(f"{DAY}-1000"),
    )
    # THE SYMPTOM of hub#1182 for this screen, head-on: the cashier has no receipt in hand and
    # types the DAY into «Nº». With `op: "eq"` nothing is exactly `20260901`, so the history went
    # EMPTY without a word; with `like` it narrows to that day's sales — every one of this hub's,
    # in the order the screen opens on, none of the day before, none of the neighbour's.
    check(
        "typing only the day into «Nº» narrows the history to that day instead of emptying it",
        [
            f"{DAY}-1000000",
            f"{DAY}-10001",
            f"{DAY}-10000",
            f"{DAY}-2000",
            f"{DAY}-1000",
            f"{DAY}-0999",
        ],
        run_list(db, {"sale_number": DAY}),
    )
    # Both hubs hold a `20260901-10000` that day: the UNIQUE index is per hub, and so is the list.
    check(
        "this hub sees its own 10.000th exactly once, and never the neighbour's",
        1,
        run_list(db, {}).count(wide),
    )


def main() -> int:
    running = subprocess.run(
        ["docker", "inspect", "-f", "{{.State.Running}}", CONTAINER],
        capture_output=True,
        text=True,
    )
    if "true" not in running.stdout:
        subprocess.run(["docker", "start", CONTAINER], capture_output=True)

    control_db = f"{DB_PREFIX}_control"
    fixed_db = f"{DB_PREFIX}_fixed"
    for db in (control_db, fixed_db):
        psql(["-c", f"DROP DATABASE IF EXISTS {db} WITH (FORCE)"])
        psql(["-c", f"CREATE DATABASE {db}"])
    try:
        load_migrations(control_db)
        load_migrations(fixed_db)
        print(" control — the harness can still see the bug:")
        scenario_control(control_db)
        print(" fixed — the numbering of the day past the pad:")
        scenario_fixed(fixed_db)
        print(" ordering — the history still reads in issue order:")
        scenario_ordering(fixed_db)
        print(" consumers — the wide number read back:")
        scenario_consumers(fixed_db)
    finally:
        for db in (control_db, fixed_db):
            psql(["-c", f"DROP DATABASE IF EXISTS {db} WITH (FORCE)"])

    print()
    if failures:
        print(f" Sale number width: {len(failures)} FAILURES")
        for f in failures:
            print(f"  - {f}")
        return 1
    print(" Sale number width: all green")
    return 0


if __name__ == "__main__":
    sys.exit(main())
