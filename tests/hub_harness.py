"""Plumbing shared by the `*.hub.test.py` batteries — the ones that talk to a REAL kernel.

`erplora test <dir> --against-hub` (module-toolkit#110) starts the published hub image with its
own Postgres, installs the module through `POST /api/modules/install` and hands the url over in
`ERPLORA_HUB_BASE_URL`. Everything below is the thin layer between a battery and that runtime:
the two doors (`/api/query`, `/api/command`), the error envelope, the event shape, and the one
piece of bookkeeping every battery needs — a `check()` that records a failure instead of dying on
it, so a red run names EVERY broken assertion and not just the first.

Why HTTP and not a scratch Postgres: these batteries replace the hub's own `sales_e2e.rs`
(ERPlora/hub#1264, contract «El Hub se CIERRA como KERNEL» §5). What they assert is what the
WASM handler does INSIDE the runtime — ids minted by the host, `reads` pre-loaded by the
dispatcher, the transaction, the outbox — and none of that exists in a hand-written harness that
binds `:hub_id` itself. The Postgres batteries next door keep proving the SQL; these prove the
module against the kernel that runs it.

Two facts of the runtime a battery has to know, both resolved here so no battery hard-codes them:

  * THE TENANT. Module seeds (the payment-method catalogue, the tax rules) land under the
    RUNTIME's own `hub_id`, not under whatever `X-Hub-Id` a request carries (that is how hub#594
    was found). `GET /api/hub/context` says which id that is, and every request goes out under it —
    a battery sending `local` would see a hub with no payment methods and `complete_sale` would
    refuse every sale with `sales.payment_method_required`.
  * THE SESSION USER. Dev auth trusts `X-User-Id`. Each run mints its own, because batteries share
    one hub for the length of the run and `sales.by_staff` attributes the unnamed sale to the
    session user (sales#196): a fixed id would count the previous battery's sales as this one's.

It refuses to skip. Without a runtime a battery FAILS: a check that excuses itself is the green
that proves nothing this whole toolkit exists to remove (module-toolkit#50).
"""

import json
import os
import sys
import time
import urllib.error
import urllib.request
import uuid

BASE = (
    os.environ.get("SALES_HUB_BASE_URL") or os.environ.get("ERPLORA_HUB_BASE_URL") or ""
).rstrip("/")

# Quantities travel in 10^6 fixed point (ADR-0147); money in integer cents (ADR-0007/0123).
ONE = 1_000_000


def cents(value) -> int:
    """A money aggregate the way Postgres hands it back: `SUM(bigint)` is NUMERIC, so a total may
    arrive as a JSON string (`"5000"`) instead of a number. Either form is the same cents."""
    if isinstance(value, bool):
        raise AssertionError(f"not a money amount: {value!r}")
    if isinstance(value, (int, float)):
        return int(round(value))
    if isinstance(value, str):
        return int(round(float(value)))
    raise AssertionError(f"not a money amount: {value!r}")


class Hub:
    """One battery's view of the live runtime."""

    def __init__(self, battery: str, needs: tuple[str, ...] = ("taxes", "sales")):
        self.battery = battery
        self.failures: list[str] = []
        if not BASE:
            print(
                f"{battery}: no runtime at the other end (ERPLORA_HUB_BASE_URL is empty)."
            )
            print(
                "Run it with `erplora test <dir> --against-hub`; without a hub this is NOT a skip, "
                "it is a failure."
            )
            sys.exit(1)
        self.user = f"u-{uuid.uuid4().hex[:8]}"
        self.hub_id = self._runtime_hub_id()
        self._require_installed(needs)

    # ── transport ────────────────────────────────────────────────────────────────────────

    def _request(self, method: str, path: str, body=None):
        data = None if body is None else json.dumps(body).encode()
        req = urllib.request.Request(
            f"{BASE}{path}",
            data=data,
            headers={
                "content-type": "application/json",
                "x-hub-id": self.hub_id,
                "x-user-id": self.user,
            },
            method=method,
        )
        try:
            with urllib.request.urlopen(req, timeout=60) as res:
                return res.status, json.loads(res.read().decode() or "null")
        except urllib.error.HTTPError as err:
            raw = err.read().decode()
            try:
                return err.code, json.loads(raw or "null")
            except json.JSONDecodeError:
                return err.code, {"raw": raw}

    def _runtime_hub_id(self) -> str:
        req = urllib.request.Request(f"{BASE}/api/hub/context", method="GET")
        with urllib.request.urlopen(req, timeout=60) as res:
            body = json.loads(res.read().decode())
        hub_id = body.get("hub_id")
        if not hub_id:
            print(
                f"{self.battery}: GET /api/hub/context did not say the hub_id: {body}"
            )
            sys.exit(1)
        return hub_id

    def _require_installed(self, needs: tuple[str, ...]) -> None:
        status, body = self._request("GET", "/api/modules")
        installed = (
            {m["id"] for m in (body or {}).get("data", [])} if status == 200 else set()
        )
        missing = [m for m in needs if m not in installed]
        if missing:
            print(
                f"{self.battery}: the runtime at {BASE} does not have {missing} installed "
                f'(installed: {sorted(installed)}). `sales` declares `depends_on: ["taxes"]`, '
                "so the harness has to install the dependency through the same door before the "
                "module. Not a skip: nothing below can be trusted without them."
            )
            sys.exit(1)

    # ── the two doors ────────────────────────────────────────────────────────────────────

    def query(self, name: str, params: dict | None = None) -> list:
        """Rows of a query. A query with a `list` block answers `{rows,total,…}`; the rest answer
        the bare array. Both come back as the list of rows."""
        status, body = self._request(
            "POST", "/api/query", {"name": name, "params": params or {}}
        )
        if status != 200 or not (body or {}).get("ok"):
            raise AssertionError(f"query {name} answered {status}: {body}")
        data = body["data"]
        if isinstance(data, dict) and "rows" in data:
            return data["rows"]
        return data

    def page(self, name: str, params: dict | None = None) -> dict:
        """The whole page of a `list` query, `total` included."""
        status, body = self._request(
            "POST", "/api/query", {"name": name, "params": params or {}}
        )
        if status != 200 or not (body or {}).get("ok"):
            raise AssertionError(f"query {name} answered {status}: {body}")
        return body["data"]

    def command(self, name: str, payload: dict):
        """`(status, body)` of a command, whatever the runtime answered."""
        return self._request("POST", "/api/command", {"name": name, "payload": payload})

    def run(self, name: str, payload: dict) -> dict:
        """A command that MUST succeed. Its `data` (`operations`, `new_ids`, …)."""
        status, body = self.command(name, payload)
        if status != 200 or not (body or {}).get("ok"):
            raise AssertionError(f"command {name} answered {status}: {body}")
        return body["data"]

    def refused(self, label: str, name: str, payload: dict, code: str) -> None:
        """The runtime must REFUSE the command with exactly this domain code — the code, never the
        prose (ADR-0398 §6): the till translates the code, nobody reads the sentence."""
        status, body = self.command(name, payload)
        got = (
            ((body or {}).get("error") or {}).get("code")
            if isinstance(body, dict)
            else None
        )
        if status == 200:
            self.failures.append(
                f"{label} — expected refusal `{code}`, the command SUCCEEDED: {body}"
            )
            print(f"  FAIL: {label} — expected refusal `{code}`, got success: {body}")
        elif got != code:
            self.failures.append(
                f"{label} — expected code [{code}], got [{got}] (HTTP {status}: {body})"
            )
            print(
                f"  FAIL: {label} — expected code [{code}], got [{got}] (HTTP {status})"
            )
        else:
            print(f"  ok: {label} refused with `{code}` (HTTP {status})")

    # ── what the hub says about its events ───────────────────────────────────────────────

    def event_shape(self, event_name: str) -> dict | None:
        """`GET /api/hub/events/shape?name=…` — the fields of the NEWEST events of that name in this
        hub, each with one sample unless withheld (hub#715). `None` when the hub has never heard of
        the event. It is the only read of an emitted payload the runtime offers, and it is enough:
        a sample is the value of the most recent event, which is the one the battery just caused."""
        status, body = self._request(
            "GET", f"/api/hub/events/shape?name={event_name}&limit=1"
        )
        if status == 404:
            return None
        if status != 200 or not (body or {}).get("ok"):
            raise AssertionError(f"events/shape {event_name} answered {status}: {body}")
        return body["data"]

    def event_field(self, event_name: str, path: str) -> dict | None:
        shape = self.event_shape(event_name)
        if shape is None:
            return None
        return next((f for f in shape.get("fields", []) if f.get("path") == path), None)

    # ── bookkeeping ──────────────────────────────────────────────────────────────────────

    def check(self, label: str, got, want) -> None:
        if got != want:
            self.failures.append(f"{label} — expected [{want!r}], got [{got!r}]")
            print(f"  FAIL: {label} — expected [{want!r}], got [{got!r}]")
        else:
            print(f"  ok: {label} = {got!r}")

    def check_true(self, label: str, condition: bool, detail="") -> None:
        if not condition:
            self.failures.append(f"{label} — {detail}" if detail else label)
            print(f"  FAIL: {label} {detail}")
        else:
            print(f"  ok: {label}")

    def finish(self, verdict: str) -> int:
        print()
        if self.failures:
            print(f"✗ {self.battery}: {len(self.failures)} failure(s):")
            for f in self.failures:
                print(f"  - {f}")
            return 1
        print(f"✓ {self.battery}: {verdict}")
        return 0


def ensure_business_identity(
    hub: Hub, tax_id="B12345674", legal_name="Mi Empresa SL"
) -> None:
    """Sets the hub's business identity through the real admin door (`PUT /api/settings`).

    It is the KERNEL's fiscal precondition (ADR-0203, hub#328), not this module's: without it
    `invoice.create_from_sale` — the listener `sale.completed` wakes — fails with «configure
    business_legal_name, business_tax_id before issuing fiscal documents» and the sale never
    becomes an invoice. A chain assertion that skipped this would be measuring a chain that
    cannot run, and would go green for the wrong reason.

    Dev auth grants admin to any `X-User-Id` (`crates/server/src/auth.rs::require_admin_session`),
    so this is exactly the write the fiscal setup wizard would make. Idempotent: a second run just
    re-asserts the same identity."""
    status, body = hub._request(
        "PUT",
        "/api/settings",
        {"business_tax_id": tax_id, "business_legal_name": legal_name},
    )
    if status != 200:
        print(
            f"{hub.battery}: PUT /api/settings (business identity) answered {status}: {body}"
        )
        sys.exit(1)


def cash_method_id(hub: Hub) -> str:
    """Id of the CASH method from the hub's seeded catalogue, through the public query — never
    composed by hand, so the battery is not tied to how `sales` builds its ids (sales#20: «the
    client proposes, the server disposes» — `complete_sale` demands a `payment_method_id` that
    IS in the catalogue)."""
    rows = hub.query("sales.payment_methods")
    cash = next((r for r in rows if r.get("type") == "cash"), None)
    if cash is None:
        raise AssertionError(
            f"the hub's catalogue must carry the `cash` method: {rows}"
        )
    return cash["id"]


def card_method_id(hub: Hub) -> str:
    """Id of the CARD method from the hub's seeded catalogue — the twin of [`cash_method_id`], and
    the one a chain battery needs to tell «money in the drawer» from «money that never was»."""
    rows = hub.query("sales.payment_methods")
    card = next((r for r in rows if r.get("type") == "card"), None)
    if card is None:
        raise AssertionError(f"the hub's catalogue must carry the `card` method: {rows}")
    return card["id"]


def wait_until(read, ok, timeout: float = 10.0, interval: float = 0.1):
    """Polls `read()` until `ok(value)` and returns the value — or, on timeout, the LAST value it
    saw. It never raises, and that is a contract with its caller, not a shortcut: every call site
    must feed what comes back straight into a `check`, so a listener that never ran is reported as
    the value it left behind (`expected [10000000], got [8000000]`) and the battery carries on to
    name the REST of its failures instead of dying on the first one.

    It exists because anything a LISTENER does arrives through the outbox relay, which the server
    ticks once a second, and HTTP has no on-demand drain (module-toolkit#135) — so a chain battery
    cannot read the effect the instant the command returns.

    ⚠️ It can only wait FOR something. A negative («the listener did NOT fire») never resolves by
    waiting: give the relay its tick with an explicit sleep and then assert the value outright.
    """
    deadline = time.monotonic() + timeout
    seen = read()
    while not ok(seen) and time.monotonic() < deadline:
        time.sleep(interval)
        seen = read()
    return seen


def sale_by_key(hub: Hub, idempotency_key: str) -> list:
    """The sale charged under this idempotency key, if any (sales#20)."""
    return hub.query("sales.by_idempotency_key", {"idempotency_key": idempotency_key})


def key(tag: str) -> str:
    """A charge-attempt key unique to THIS run. Distinct per expected sale, reused on purpose only
    to prove the retry (sales#20)."""
    return f"hub-battery-{tag}-{uuid.uuid4().hex[:8]}"
