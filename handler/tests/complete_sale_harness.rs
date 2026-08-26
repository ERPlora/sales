//! Test-only bridge: `sales.complete_sale` reachable from the Python batteries (sales#147).
//!
//! The `*.postgres.test.py` batteries under the module's `tests/` prove what a unit test cannot —
//! that a decision survives the round trip into a REAL Postgres, or, for a rejection, that it
//! leaves **nothing** behind. Both halves need the real `complete_sale_pure` and a real database in
//! the same run, and the batteries are Python. Re-implementing the handler's decision in Python
//! would only prove that the copy agrees with itself.
//!
//! So the battery leaves its `{payload, context}` in the file named by `SALES_HANDLER_REQUEST` and
//! reads the answer back from `SALES_HANDLER_RESPONSE`:
//!
//! ```text
//! { "ok": bool, "error": string, "operations": [...], "events": [...] }
//! ```
//!
//! It lives in `handler/tests/` and NOT in `examples/` or `src/bin/` on purpose: everything under
//! `handler/src/**` is scanned by the toolkit (permission ceiling, domain-error catalog) and this
//! is neither the module's surface nor part of the artifact a hub installs.

use std::env;
use std::fs;

use sales_handler::complete_sale_pure;
use serde_json::{json, Value};

/// The handler's decision as the batteries read it. A rejection is a RESULT, not a crash: the
/// battery asserts on the CODE that was raised, so swallowing it would hide what is under test.
///
/// sales#201 — a business rejection travels inside `Output.error`, not as an `Err`: that is the
/// only channel the runtime turns into a `code` the client can translate. `error` therefore carries
/// the BARE code (`sales.empty_sale`), never the `"<code>: <detail>"` string it used to be, and the
/// operations are dropped: a refused sale writes nothing.
///
/// An `Err` is still possible and still means something else entirely — the guest could not honour
/// its contract — so it is reported as its own answer instead of being folded into a refusal.
fn envelope(input: Value) -> Value {
    match complete_sale_pure(input) {
        Ok(out) => match out.error {
            Some(error) => json!({ "ok": false, "error": error.code, "operations": [], "events": [] }),
            None => json!({
                "ok": true,
                "error": "",
                "operations": out.operations,
                "events": out.events,
            }),
        },
        Err(detail) => json!({ "ok": false, "error": detail, "operations": [], "events": [] }),
    }
}

#[test]
fn the_envelope_reports_a_rejection_as_a_result_with_its_domain_code() {
    // The shape the Python side parses, pinned here: `ok: false` + the code + an EMPTY operation
    // list. That last one is the whole point of the batteries' «nothing was persisted» assertion —
    // if a rejection ever emitted an operation, the runtime would run it inside the transaction.
    // With its key present, so what refuses it is the EMPTY CART and not the missing key: an
    // assertion on the code is only worth anything if the code it names is the one under test.
    let refused = envelope(json!({
        "payload": { "items": [], "idempotency_key": "idem-harness-empty" },
        "context": { "hub_id": "h1" }
    }));
    assert_eq!(refused["ok"], json!(false), "an empty sale is refused");
    // The BARE code, not a sentence with the code buried in it (sales#201): what the battery
    // compares against is the ABI, and the detail beside it is not part of the contract.
    assert_eq!(refused["error"], json!("sales.empty_sale"), "the code the handler raised");
    assert_eq!(refused["operations"], json!([]), "a rejection emits nothing at all");
}

#[test]
fn the_envelope_of_a_charged_sale_carries_its_operations_and_its_event() {
    let charged = envelope(json!({
        "payload": {
            "items": [{ "product_name": "Café", "price": 150, "quantity": 1_000_000, "tax_rate": 10.0 }],
            "tax_included": true, "amount_tendered": 150,
            "payment_method_id": "pm-1", "payment_method_name": "Efectivo",
            "idempotency_key": "idem-harness-0001"
        },
        "context": { "hub_id": "h1", "current_user_id": "u1", "now": "2026-08-25T13:00:00+00:00",
                     "new_ids": ["sale-1", "line-1", "pay-1"] }
    }));
    assert_eq!(charged["ok"], json!(true), "a plain cash sale is charged: {}", charged["error"]);
    let ops = charged["operations"].as_array().map(Vec::len).unwrap_or_default();
    assert!(ops >= 4, "counter + sale + line + payment, at least: {ops}");
    assert_eq!(charged["events"][0]["name"], json!("sale.completed"));
}

/// Answers the request a `*.postgres.test.py` battery left on disk. Inert without both env vars —
/// and that is not a guard going silently green: the guarantee lives in the battery, which fails
/// loudly when the answer it asked for is not there (it never skips itself either).
#[test]
fn answers_the_request_left_by_a_postgres_battery() {
    let (Some(request), Some(response)) = (
        env::var_os("SALES_HANDLER_REQUEST"),
        env::var_os("SALES_HANDLER_RESPONSE"),
    ) else {
        return;
    };
    let raw = fs::read_to_string(&request).expect("the battery's request file is readable");
    let input: Value = serde_json::from_str(&raw).expect("the request file holds JSON");
    let text = serde_json::to_string(&envelope(input)).expect("the envelope serialises");
    fs::write(&response, text).expect("the response file is writable");
}
