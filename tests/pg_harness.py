"""The runtime in miniature, shared by the `sales` batteries that walk a whole CHAIN.

Every `*.postgres.test.py` in this module carries its own copy of the same 150 lines: `psql` over
`docker exec`, the `:name` binder, the DDL type shim, the `erp_pad` bridge function, and the two
loops that play a manifest command and a manifest query. That was fine while a battery covered ONE
seam. The chain batteries (sales#237, sales#238) walk five doors each and would have made it eight
copies of a mini-runtime that must not drift: the point of driving the module's OWN SQL is that the
harness is a MIRROR of the kernel, and a mirror that exists eight times is eight opinions.

So the plumbing lives here once and the batteries import it. It is not a battery itself and never
runs alone — the toolkit knows that shape (`strayTestFiles` in module-toolkit's `run-batteries.mjs`
treats a helper NAMED by a battery as plumbing, which is how `services`/`staff`/`schedules` carry
their own `pg_harness.py`).

🔴 What it deliberately does NOT do: decide anything. It plays the operations a handler emits and
reads back through the doors a hub reads through. Re-implementing the handler's arithmetic in
Python would only prove that the copy agrees with itself — so every number a battery asserts comes
either from the module's SQL, from Postgres, or from a literal the battery writes out in full.

It NEVER skips: a battery that goes green because it could not reach Postgres is worse than no
battery at all, so `Session.create()` raises and the battery dies loudly.
"""

import json
import os
import pathlib
import re
import subprocess

MODULE_DIR = pathlib.Path(__file__).resolve().parent.parent
CONTAINER = os.environ.get("SALES_TEST_PG_CONTAINER", "erplora-test-pg-5433")
MANIFEST = json.loads((MODULE_DIR / "module.json").read_text())

# Portable type subset → native Postgres type (ADR-0007 §4b, `shim_ddl_types`). Without this the
# money columns land as int4 instead of BIGINT and the harness would not run production's schema.
DDL_TYPES = {
    "INTEGER": "BIGINT",
    "REAL": "DOUBLE PRECISION",
    "BLOB": "BYTEA",
    "TEXT": "TEXT",
}
DDL_TOKEN = re.compile(r"\b(INTEGER|REAL|BLOB)\b", re.IGNORECASE)

# The runtime's bridge functions (ADR-0007 §4a): portable SQL names the translator rewrites per
# dialect. `sales._insert_sale` pads the day's counter into the fiscal number with `erp_pad`.
#
# `width` is a MINIMUM, never a ceiling (ERPlora/hub#1393). The bare `lpad` of Postgres imposes an
# EXACT width and CUTS the overflow, so `lpad('10000', 4, '0')` came out `'1000'` and the 10.000th
# sale of the day collided with the 1.000th: the till stopped charging (sales#241). A miniature
# runtime that keeps the old rendering puts the bug back in the one place nobody would look — the
# tests. Proved both ways in `sale_number_width.postgres.test.py`.
BRIDGE_FUNCTIONS = """
CREATE OR REPLACE FUNCTION erp_pad(value anyelement, width integer) RETURNS text
    LANGUAGE sql IMMUTABLE AS $$
        SELECT lpad($1::text, greatest($2, length($1::text)), '0')
    $$;
CREATE OR REPLACE FUNCTION erp_date(value anyelement) RETURNS date
    LANGUAGE sql IMMUTABLE AS $$ SELECT ($1::timestamptz)::date $$;
"""

PARAM = re.compile(r":([a-z_][a-z0-9_]*)", re.IGNORECASE)


def literal(value) -> str:
    """A payload value as the driver would bind it. `None` is `NULL` — the same `DynNull` the
    runtime binds for a `:param` the payload does not carry (hub/crates/db/src/lib.rs)."""
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, (list, dict)):
        value = json.dumps(value, separators=(",", ":"), ensure_ascii=False)
    return "'" + str(value).replace("'", "''") + "'"


def _comment_spans(text: str) -> list:
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
    translator does; the module's SQL is full of prose that mentions `:hub_id`."""
    spans = _comment_spans(sql)

    def in_comment(pos: int) -> bool:
        return any(a <= pos < b for a, b in spans)

    return PARAM.sub(
        lambda m: (
            m.group(0) if in_comment(m.start()) else literal(params.get(m.group(1)))
        ),
        sql,
    )


# ── The runtime's translator, for the bridge functions these doors use (crates/db/src/lib.rs) ──
#
# `Session.query` leaves `erp_date`/`erp_dateadd` to SQL functions the harness installs, and those
# cannot type a bare literal (`erp_date('2026-09-19')` → «could not determine polymorphic type»).
# The runtime never runs them as functions: it REWRITES them textually per dialect. This mirrors
# that rewrite for the three shims involved, so the SQL Postgres sees is the SQL production sees.
# Spelled `CAST(x AS t)` instead of the runtime's `(x)::t` — the same cast — because the harness's
# `bind` would read the `:t` of `::t` as a placeholder.


def _expand(sql: str, token: str, render) -> str:
    out, i = [], 0
    while True:
        j = sql.find(token, i)
        if j < 0:
            out.append(sql[i:])
            return "".join(out)
        line_start = sql.rfind("\n", 0, j) + 1
        if sql[line_start:j].lstrip().startswith("--"):
            out.append(sql[i : j + len(token)])
            i = j + len(token)
            continue
        depth, k = 1, j + len(token)
        while k < len(sql) and depth:
            depth += {"(": 1, ")": -1}.get(sql[k], 0)
            k += 1
        out.append(sql[i:j])
        out.append(render(_expand(sql[j + len(token) : k - 1], token, render)))
        i = k


def _split_args(args: str) -> list:
    parts, depth, cur = [], 0, ""
    for ch in args:
        if ch == "," and depth == 0:
            parts.append(cur.strip())
            cur = ""
            continue
        depth += {"(": 1, ")": -1}.get(ch, 0)
        cur += ch
    parts.append(cur.strip())
    return parts


def _dateadd(args: str) -> str:
    x, n, unit = _split_args(args)
    return f"(CAST(({x}) AS timestamptz) + CAST((({n}) || ' ' || {unit}) AS interval))"


def _pad(args: str) -> str:
    value, width = _split_args(args)
    return f"lpad(CAST(({value}) AS text), greatest({width}, length(CAST(({value}) AS text))), '0')"


def lower(sql: str) -> str:
    sql = _expand(sql, "erp_dateadd(", _dateadd)
    sql = _expand(sql, "erp_date(", lambda a: f"(CAST(({a}) AS date))")
    return _expand(sql, "erp_pad(", _pad)


class Session:
    """One scratch database, its migrations, and the doors of the manifest."""

    def __init__(
        self,
        db: str,
        hub: str = "hub-test",
        user: str = "u-1",
        now: str = "2026-09-01T13:00:00+00:00",
        container: str = CONTAINER,
    ) -> None:
        self.db = db
        self.hub = hub
        self.user = user
        self.now = now
        self.container = container
        self.failures: list = []

    # ── Postgres plumbing ────────────────────────────────────────────────────────────────

    def psql(self, args: list, stdin=None, db=...) -> str:
        cmd = [
            "docker",
            "exec",
            "-i",
            self.container,
            "psql",
            "-v",
            "ON_ERROR_STOP=1",
            "-U",
            "postgres",
        ]
        target = self.db if db is ... else db
        if target:
            cmd += ["-d", target]
        cmd += args
        res = subprocess.run(cmd, input=stdin, capture_output=True, text=True)
        if res.returncode != 0:
            raise RuntimeError(res.stderr.strip() or res.stdout.strip())
        return res.stdout

    def create(self) -> None:
        """Fresh database, production's migrations, the bridge functions. Raises if Postgres is not
        reachable — a battery that cannot reach its database FAILS, it does not go green."""
        running = subprocess.run(
            ["docker", "inspect", "-f", "{{.State.Running}}", self.container],
            capture_output=True,
            text=True,
        )
        if "true" not in running.stdout:
            subprocess.run(["docker", "start", self.container], capture_output=True)
        self.psql(["-c", f"DROP DATABASE IF EXISTS {self.db} WITH (FORCE)"], db=None)
        self.psql(["-c", f"CREATE DATABASE {self.db}"], db=None)
        self.psql([], stdin=BRIDGE_FUNCTIONS)
        for mig in sorted((MODULE_DIR / "migrations" / "postgres").glob("*.sql")):
            sql = DDL_TOKEN.sub(
                lambda m: DDL_TYPES[m.group(1).upper()], mig.read_text()
            )
            self.psql([], stdin=sql)

    def drop(self) -> None:
        try:
            self.psql(
                ["-c", f"DROP DATABASE IF EXISTS {self.db} WITH (FORCE)"], db=None
            )
        except RuntimeError:
            pass

    def q(self, sql: str) -> str:
        """Scalar query. A missing relation/column is a RED result, not a crash: the run must report
        every acceptance point, not stop at the first one."""
        try:
            return self.psql(["-tAc", sql]).strip()
        except RuntimeError as exc:
            return f"<sql error: {str(exc).splitlines()[0]}>"

    def qi(self, sql: str) -> int:
        raw = self.q(sql)
        try:
            return int(raw)
        except ValueError:
            return -1

    def rows(self, sql: str) -> list:
        """Every row of a raw SELECT, as dicts."""
        try:
            raw = self.psql(["-tAc", f"SELECT json_agg(t) FROM ({sql}) t"]).strip()
        except RuntimeError as exc:
            self.failures.append(f"raw query failed: {str(exc).splitlines()[0]}")
            return []
        return json.loads(raw) if raw else []

    # ── The manifest's doors ─────────────────────────────────────────────────────────────

    def command(self, name: str, payload: dict, hub=None, now=None):
        """Play a manifest command's `sql[]` the way the runtime does: ONE transaction for the whole
        chain, system params injected and NOT taken from the payload (`hub_id` is not spoofable).

        Returns `(ok, error)`; a command declared with a WASM handler and no `sql[]` is reported as
        such instead of silently doing nothing."""
        cmd = MANIFEST["commands"].get(name)
        if cmd is None:
            return False, f"command `{name}` is not declared in module.json"
        files = cmd.get("sql")
        if not files:
            return (
                False,
                f"command `{name}` declares no sql[] (handler `{cmd.get('handler')}`)",
            )
        params = dict(payload)
        params["hub_id"] = hub or self.hub
        params["current_user_id"] = self.user
        params["now"] = now or self.now
        script = ["BEGIN;"]
        for rel in files:
            path = MODULE_DIR / rel
            if not path.exists():
                return False, f"`{name}` declares `{rel}`, which does not exist"
            script.append(bind(path.read_text(), params))
        script.append("COMMIT;")
        try:
            self.psql([], stdin="\n".join(script))
            return True, ""
        except RuntimeError as exc:
            return False, str(exc)

    def query(self, name: str, params: dict, hub=None) -> list:
        """Play a manifest query the way the runtime does — `hub_id` injected, never bound from the
        caller — and return its rows as dicts."""
        spec = MANIFEST["queries"].get(name)
        if spec is None:
            self.failures.append(f"query `{name}` is not declared in module.json")
            return []
        sql = (MODULE_DIR / spec["sql"]).read_text().strip().rstrip(";")
        bound = bind(sql, {**params, "hub_id": hub or self.hub})
        try:
            raw = self.psql(["-tAc", f"SELECT json_agg(t) FROM ({bound}) t"]).strip()
        except RuntimeError as exc:
            self.failures.append(f"query `{name}` failed: {str(exc).splitlines()[0]}")
            return []
        return json.loads(raw) if raw else []

    # ── Assertions ───────────────────────────────────────────────────────────────────────

    def check(self, label: str, got, want) -> bool:
        if got != want:
            self.failures.append(f"{label}: got {got!r}, want {want!r}")
            print(f"  ✗ {label}: got {got!r}, want {want!r}")
            return False
        print(f"  ✓ {label}")
        return True

    def command_ok(
        self, label: str, name: str, payload: dict, hub=None, now=None
    ) -> bool:
        ok, err = self.command(name, payload, hub=hub, now=now)
        if not ok:
            detail = err.splitlines()[-1] if err else ""
            self.failures.append(f"{label} — `{name}` failed: {detail}")
            print(f"  ✗ {label} — `{name}` failed: {detail}")
        else:
            print(f"  ✓ {label}")
        return ok

    # ── Reading a row without letting a missing column stop the run ──────────────────────
    #
    # 🔴 A door that stops returning a column is the exact bug these batteries exist to catch
    # (sales#148: charged, written and unreadable), so it has to come out as a REPORTED failure and
    # not as a traceback. A crash is a red too, but it stops at the first point and hides the other
    # nineteen — and the house rule here is that a run reports every acceptance point it has.

    @staticmethod
    def field(rows: list, key: str, default=None, pos: int = 0):
        """`rows[pos][key]`, or `default` when the row or the column is not there."""
        if not rows or pos >= len(rows):
            return default
        return rows[pos].get(key, default)

    @staticmethod
    def parsed(rows: list, key: str, default=None, pos: int = 0):
        """A JSON column of a row, decoded. `default` when it is absent or not JSON."""
        raw = Session.field(rows, key, None, pos)
        if raw is None:
            return default
        try:
            return json.loads(raw)
        except (TypeError, ValueError):
            return default

    def report(self, pass_line: str) -> int:
        print()
        if self.failures:
            print(f"✗ {len(self.failures)} failure(s):")
            for f in self.failures:
                print(f"  - {f}")
            return 1
        print(f"✓ {pass_line}")
        return 0


# ── The frozen unit context every line of every door carries (ADR-0147 §2.4) ─────────────
#
# One `ud` at scale 10⁶. Written out in full because it is the payload shape the handler produces:
# if a door grows a parameter and the handler does not — or the other way round — the INSERT is
# rejected here instead of quietly writing a line with a NULL where a number belongs.
UNITS = {
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


def order_line_params(**over) -> dict:
    """Every parameter `sales._insert_order_line` binds — the row a waiter's order writes.

    ⚠️ `unit_price` is the price the HANDLER already resolved against `inventory.products.for_sale`
    and against `modifiers.options.all` (sales#175 / sales#200), never the payload's. What travels
    here is the number as it arrives in production."""
    params = {
        "id": None,
        "order_id": None,
        "product_id": None,
        "product_name": "",
        "product_sku": "",
        "quantity": 1_000_000,
        "unit_price": 0,
        "is_gift": 0,
        "gift_reason": "",
        "line_total": 0,
        "tax_category_key": "",
        "cost": 0,
        "is_service": 0,
        "category_id": None,
        "discount_percent": 0.0,
        "modifiers": "[]",
        "notes": "",
        "combo_group_ref": None,
        "combo": "{}",
        # sales#273 — the professional who does THIS line, from the very first tap. NULL is the
        # honest default: a bar does not attribute, and every line older than the 035 has none.
        "staff_id": None,
        **UNITS,
    }
    params.update(over)
    return params


def sale_line_params(**over) -> dict:
    """Every parameter `sales._insert_line` binds — the line the checkout freezes."""
    params = {
        "line_id": None,
        "sale_id": None,
        "product_id": None,
        "product_name": "",
        "product_sku": "",
        "is_service": 0,
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
        # sales#273 — the professional who did THIS line. NULL is the honest default: a bar does
        # not attribute, and every line older than the 034 has none.
        "staff_id": None,
        "net_amount": 0,
        "tax_amount": 0,
        "line_total": 0,
        **UNITS,
    }
    params.update(over)
    return params


def sale_header_params(**over) -> dict:
    """Every parameter `sales._insert_sale` binds — the header of a charged sale."""
    params = {
        "sale_id": None,
        "day": "20260901",
        "status": "completed",
        "subtotal": 0,
        "tax_amount": 0,
        "tax_breakdown": "{}",
        "discount_amount": 0,
        "discount_percent": 0,
        "total": 0,
        "gift_total": 0,
        "payment_method_id": "pm-cash",
        "payment_method_name": "Efectivo",
        "amount_tendered": 0,
        "change_due": 0,
        "customer_id": None,
        "customer_name": "",
        "notes": "",
        "source_module": "pos",
        "channel": "dine_in",
        "order_id": None,
        "staff_id": None,
        "appointment_id": None,
        "document_type": "ticket",
        "idempotency_key": None,
    }
    params.update(over)
    return params
