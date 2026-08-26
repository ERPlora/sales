#!/usr/bin/env python3
"""The till's catalogue policy survives an UPDATE of an already configured hub (sales#25).

`sync_products` and `sync_services` had been saved since they were created without a single
reader: the till loaded both catalogues regardless. Giving them a reader is the easy half. The
half that can only be checked by running it is the SCHEMA one, and it is the half that breaks a
salon:

  1. THE UPGRADE. Every hub that ever saved the settings form has `sync_services = 0` on disk —
     that was the form's default, and the value produced no observable effect, so nobody ever set
     it on purpose. Landing the reader without migrating those rows would empty the service grid
     of every salon on the next module update. Migration 029 flips them, and this is the test that
     says so: a row saved BEFORE the migration comes out enabled AFTER it.

  2. THE DEFAULTS AGREE. `sync_services` defaults to on and `auto_invoice_with_tax_id` to off,
     which is what `schemas/settings_update.json` offers on the form. (The unit guard
     `ui/lib/settings-defaults-contract.test.ts` pins the two files against each other; this one
     asks the live column, which is the only authority on what a hub actually gets.)

  3. THE DOOR. `sales.pos_settings.get` projects the four fields the POS decides with, and it is
     scoped by `hub_id` with a LIVE neighbour hub in the table. It exists apart from
     `sales.settings.get` because that one needs `sales.manage_settings` and a cashier has none —
     the permission itself is the runtime's to enforce, but the row it hands back is ours.

Usage: tests/pos_catalog_sources.postgres.test.py
  Uses the `erplora-test-pg-5433` container by default (override: SALES_TEST_PG_CONTAINER).
  Creates a scratch database and DROPS it at the end, pass or fail. It NEVER skips itself: a
  battery that goes green because it could not reach Postgres is worse than no battery at all.
"""

import json
import os
import pathlib
import re
import subprocess
import sys

MODULE_DIR = pathlib.Path(__file__).resolve().parent.parent
CONTAINER = os.environ.get("SALES_TEST_PG_CONTAINER", "erplora-test-pg-5433")
DB = f"sales_pos_catalog_sources_test_{os.getpid()}"
HUB = "hub-test"
OTHER_HUB = "hub-neighbour"

# The migration under test. Everything before it is "the hub as it was".
MIGRATION_UNDER_TEST = "029_pos_catalog_sources.sql"

MANIFEST = json.loads((MODULE_DIR / "module.json").read_text())

failures: list[str] = []


def check(label: str, got, want) -> None:
    if got != want:
        failures.append(f"{label} — expected [{want}], got [{got}]")
        print(f"  FAIL: {label} — expected [{want}], got [{got}]")
    else:
        print(f"  ok: {label} = {got}")


# ── Postgres plumbing ────────────────────────────────────────────────────────────────────

DDL_TYPES = {
    "INTEGER": "BIGINT",
    "REAL": "DOUBLE PRECISION",
    "BLOB": "BYTEA",
    "TEXT": "TEXT",
}
DDL_TOKEN = re.compile(r"\b(INTEGER|REAL|BLOB)\b", re.IGNORECASE)
PARAM = re.compile(r"(?<!:):([a-z_][a-z0-9_]*)", re.IGNORECASE)


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


def apply_migration(path: pathlib.Path) -> None:
    psql(
        [],
        db=DB,
        stdin=DDL_TOKEN.sub(lambda m: DDL_TYPES[m.group(1).upper()], path.read_text()),
    )


def migrations() -> list[pathlib.Path]:
    return sorted((MODULE_DIR / "migrations" / "postgres").glob("*.sql"))


def literal(value) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, (int, float)):
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"


def run_query(name: str, hub: str = HUB) -> list[dict]:
    spec = MANIFEST["queries"].get(name)
    if spec is None:
        failures.append(f"query `{name}` is not declared in module.json")
        return []
    sql = (MODULE_DIR / spec["sql"]).read_text().strip().rstrip(";")
    bound = PARAM.sub(lambda m: literal({"hub_id": hub}.get(m.group(1))), sql)
    try:
        raw = psql(["-tAc", f"SELECT json_agg(t) FROM ({bound}) t"], db=DB).strip()
    except RuntimeError as exc:
        failures.append(f"query `{name}` failed: {str(exc).splitlines()[0]}")
        return []
    return json.loads(raw) if raw else []


def column_default(column: str) -> str:
    return q(
        "SELECT column_default FROM information_schema.columns "
        f"WHERE table_name = 'sales_settings' AND column_name = '{column}'"
    )


def insert_settings_row(row_id: str, hub: str, sync_services: int) -> None:
    psql(
        [
            "-c",
            "INSERT INTO sales_settings (id, hub_id, sync_products, sync_services, is_deleted, "
            f"created_at, updated_at) VALUES ('{row_id}', '{hub}', 1, {sync_services}, 0, "
            "'2026-08-01T00:00:00+00:00', '2026-08-01T00:00:00+00:00')",
        ],
        db=DB,
    )


# ── The battery ──────────────────────────────────────────────────────────────────────────


def test_an_already_configured_hub_keeps_its_services() -> None:
    """The whole point. The row is written the way every saved form wrote it — services off,
    because that was the default of a switch that did nothing — and the migration has to leave it
    ENABLED, or the salon opens tomorrow with an empty grid."""
    print("\n· an already configured hub does not lose its services")
    before, after = [], []
    for mig in migrations():
        if mig.name == MIGRATION_UNDER_TEST:
            before = q(
                "SELECT sync_services FROM sales_settings WHERE hub_id = 'hub-test'"
            )
            apply_migration(mig)
            after = q(
                "SELECT sync_services FROM sales_settings WHERE hub_id = 'hub-test'"
            )
            continue
        apply_migration(mig)
        if mig.name == "001_init.sql":
            insert_settings_row("s-1", HUB, sync_services=0)
            insert_settings_row("s-2", OTHER_HUB, sync_services=0)

    check(
        "the hub HAD services switched off (the state every saved form left)",
        before,
        "0",
    )
    check("after the migration the services are on", after, "1")
    check(
        "the neighbour hub was migrated too — this is not per-tenant data, it is a bad default",
        q("SELECT sync_services FROM sales_settings WHERE hub_id = 'hub-neighbour'"),
        "1",
    )


def test_the_column_defaults_are_the_ones_the_form_offers() -> None:
    print("\n· the live column defaults match the settings form")
    check("sync_products defaults to on", column_default("sync_products"), "1")
    check("sync_services defaults to on", column_default("sync_services"), "1")
    check(
        "auto_invoice_with_tax_id defaults to off",
        column_default("auto_invoice_with_tax_id"),
        "0",
    )


def test_the_pos_reads_its_policy_scoped_to_its_own_hub() -> None:
    print(
        "\n· sales.pos_settings.get answers this hub, with a live neighbour in the table"
    )
    psql(
        [
            "-c",
            "UPDATE sales_settings SET sync_products = 0, default_document_format = 'invoice', "
            "auto_invoice_with_tax_id = 1 WHERE hub_id = 'hub-neighbour'",
        ],
        db=DB,
    )
    mine = run_query("sales.pos_settings.get", hub=HUB)
    check("exactly one row", len(mine), 1)
    if mine:
        check(
            "the four fields the till decides with",
            sorted(mine[0].keys()),
            [
                "auto_invoice_with_tax_id",
                "default_document_format",
                "sync_products",
                "sync_services",
            ],
        )
        check(
            "products come from MY hub, not the neighbour's",
            mine[0]["sync_products"],
            1,
        )
        check("format comes from MY hub", mine[0]["default_document_format"], "ticket")

    theirs = run_query("sales.pos_settings.get", hub=OTHER_HUB)
    check("the neighbour gets their own", theirs and theirs[0]["sync_products"], 0)

    # NEGATIVE CONTROL: a hub with no row at all gets nothing back, which is what makes the UI fall
    # back to the schema defaults instead of borrowing somebody else's configuration.
    check(
        "a hub that never saved settings gets no row",
        run_query("sales.pos_settings.get", hub="hub-brand-new"),
        [],
    )


def test_soft_deleted_settings_are_not_served() -> None:
    print("\n· a soft-deleted settings row is not the till's policy")
    psql(
        ["-c", "UPDATE sales_settings SET is_deleted = 1 WHERE hub_id = 'hub-test'"],
        db=DB,
    )
    check("nothing comes back", run_query("sales.pos_settings.get", hub=HUB), [])


# ── Runner ───────────────────────────────────────────────────────────────────────────────


def main() -> int:
    print(
        f"Postgres battery · POS catalogue sources (sales#25) · db {DB} · container {CONTAINER}"
    )
    names = [m.name for m in migrations()]
    if MIGRATION_UNDER_TEST not in names:
        print(f"✗ {MIGRATION_UNDER_TEST} is not among the migrations: {names[-3:]}")
        return 1
    psql(["-c", f'CREATE DATABASE "{DB}"'])
    try:
        test_an_already_configured_hub_keeps_its_services()
        test_the_column_defaults_are_the_ones_the_form_offers()
        test_the_pos_reads_its_policy_scoped_to_its_own_hub()
        test_soft_deleted_settings_are_not_served()
    finally:
        psql(["-c", f'DROP DATABASE IF EXISTS "{DB}" WITH (FORCE)'])

    print()
    if failures:
        print(f"✗ {len(failures)} failure(s):")
        for f in failures:
            print(f"  - {f}")
        return 1
    print(
        "✓ the catalogue policy upgrades an already configured hub without emptying its grid"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
