//! Handler WASM (Tier 2) del módulo `sales` — completar una venta.
//! Portado de old_modules/m_sales (SaleItem.calculate_line_totals,
//! Sale.calculate_totals, calculate_change). Lógica pura, sin BD: recibe
//! `{payload, context}`, calcula líneas/IVA/totales y devuelve **intenciones**
//! (ops SQL del mismo módulo) que el host valida y ejecuta en una transacción,
//! más el evento `sale.completed` (lo consumen inventory, customers, cash_register).
//!
//! Ids: el host pasa `context.new_ids` (autoridad de ids); new_ids[0]=venta,
//! new_ids[1..]=líneas. Número atómico YYYYMMDD-NNNN: _bump_counter (upsert) +
//! _insert_sale leyendo el contador con subquery en la misma transacción.
//!
//! UNIDADES (ADR-0007, migración a céntimos):
//! * **Dinero = céntimos `i64`** en TODO el flujo: el payload entra en céntimos
//!   (`price`/`amount_tendered`), la aritmética es entera con redondeo half-even,
//!   los binds van a columnas `INTEGER` (céntimos) y el evento `sale.completed`
//!   viaja en **céntimos** (contrato inter-módulo). El formateo a decimales vive
//!   SOLO en la capa UI.
//! * **Tasas** (`tax_rate`, `discount`) = porcentaje `f64` (no es dinero).
//! * **Cantidad** (`quantity`) = `f64` fraccionable (no es dinero).

use erplora_guest_sdk::{Event, Operation, Output};
use serde_json::{json, Map, Value};

#[cfg(feature = "guest")]
use extism_pdk::*;

#[cfg(feature = "guest")]
#[plugin_fn]
pub fn complete_sale(input: Json<erplora_guest_sdk::Input>) -> FnResult<Json<Output>> {
    Ok(Json(complete_sale_pure(input.into_inner().into_value())))
}

/// Redondea un valor en céntimos (posiblemente fraccionario) a céntimos enteros con
/// half-even (banker's rounding), equivalente a `Decimal.quantize(0.01)` aplicado en
/// el espacio de céntimos. `x` está ya escalado a céntimos (p.ej. 8264.46 céntimos).
fn round_cents(x: f64) -> i64 {
    let floor = x.floor();
    let diff = x - floor;
    let r = if (diff - 0.5).abs() < 1e-9 {
        if (floor as i64) % 2 == 0 { floor } else { floor + 1.0 }
    } else {
        x.round()
    };
    r as i64
}

/// Lee un importe de dinero del payload **en céntimos** (`i64`). Acepta entero JSON,
/// string de entero, o —por robustez— un decimal que se interpreta como céntimos ya
/// escalados (se redondea half-even). El contrato es que la UI envía céntimos enteros.
fn as_cents(v: &Value, d: i64) -> i64 {
    match v {
        Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                i
            } else {
                n.as_f64().map(round_cents).unwrap_or(d)
            }
        }
        Value::String(s) => {
            let s = s.trim();
            if let Ok(i) = s.parse::<i64>() {
                i
            } else if let Ok(f) = s.parse::<f64>() {
                round_cents(f)
            } else {
                d
            }
        }
        _ => d,
    }
}

fn as_f64(v: &Value, d: f64) -> f64 {
    match v {
        Value::Number(n) => n.as_f64().unwrap_or(d),
        Value::String(s) => s.trim().parse::<f64>().unwrap_or(d),
        _ => d,
    }
}
fn as_str(v: &Value) -> String {
    match v {
        Value::String(s) => s.clone(),
        Value::Number(n) => n.to_string(),
        Value::Bool(b) => b.to_string(),
        _ => String::new(),
    }
}
fn as_bool(v: &Value) -> bool {
    match v {
        Value::Bool(b) => *b,
        Value::Number(n) => n.as_i64().unwrap_or(0) != 0,
        Value::String(s) => matches!(s.as_str(), "1" | "true" | "True" | "yes"),
        _ => false,
    }
}
fn str_or(p: &Value, k: &str, d: &str) -> String {
    let s = as_str(p.get(k).unwrap_or(&Value::Null));
    if s.is_empty() { d.to_string() } else { s }
}

/// Totales de línea en **céntimos** (`i64`).
struct LineTotals { net: i64, tax: i64, line: i64 }

/// Calcula los totales de una línea en céntimos. `unit_price_cents` en céntimos;
/// `qty`, `disc_pct`, `tax_rate` son `f64` (cantidad / porcentajes). El redondeo
/// half-even se aplica al pasar a céntimos enteros, igual que el Decimal original.
fn calc_line(unit_price_cents: i64, qty: f64, disc_pct: f64, tax_rate: f64, tax_incl: bool) -> LineTotals {
    let unit = unit_price_cents as f64;
    let discounted = unit - unit * (disc_pct / 100.0); // céntimos (fraccionario)
    if tax_incl {
        let divisor = 1.0 + tax_rate / 100.0;
        let net = round_cents((discounted / divisor) * qty);
        let line = round_cents(discounted * qty);
        LineTotals { net, tax: line - net, line }
    } else {
        let net = round_cents(discounted * qty);
        let tax = round_cents((net as f64) * (tax_rate / 100.0));
        LineTotals { net, tax, line: net + tax }
    }
}

fn day_from_now(now: &str) -> String {
    let date = now.split('T').next().unwrap_or("");
    let digits: String = date.chars().filter(|c| c.is_ascii_digit()).collect();
    if digits.len() >= 8 { digits[..8].to_string() } else { "00000000".to_string() }
}

/// Lógica pura: `{payload, context}` → Output (intenciones).
pub fn complete_sale_pure(input: Value) -> Output {
    let payload = input.get("payload").cloned().unwrap_or(Value::Null);
    let context = input.get("context").cloned().unwrap_or(Value::Null);
    let empty: Vec<Value> = Vec::new();
    let new_ids = context.get("new_ids").and_then(|v| v.as_array()).unwrap_or(&empty);
    let now = context.get("now").map(as_str).unwrap_or_default();
    let day = day_from_now(&now);
    let sale_id = new_ids.first().map(as_str).unwrap_or_default();

    let tax_incl = payload.get("tax_included").map(as_bool).unwrap_or(true);
    let sale_disc = payload.get("discount_percent").map(|v| as_f64(v, 0.0)).unwrap_or(0.0);
    let items = payload.get("items").and_then(|v| v.as_array()).unwrap_or(&empty);

    let mut subtotal: i64 = 0; // céntimos
    let mut tax_total: i64 = 0; // céntimos
    let mut gross: i64 = 0; // céntimos
    let mut breakdown: Vec<(String, i64, i64)> = Vec::new();
    let mut ops: Vec<Operation> = Vec::new();

    let mut bump = Map::new();
    bump.insert("day".into(), json!(day));
    ops.push(Operation::sql("sales._bump_counter", bump));

    let header_idx = ops.len();
    ops.push(Operation::sql("sales._insert_sale", Map::new())); // placeholder

    for (i, item) in items.iter().enumerate() {
        let unit_price = as_cents(item.get("price").unwrap_or(&Value::Null), 0); // céntimos
        let qty = item.get("quantity").map(|v| as_f64(v, 1.0)).unwrap_or(1.0);
        let line_disc = item.get("discount").map(|v| as_f64(v, 0.0)).unwrap_or(0.0);
        let tax_rate = item.get("tax_rate").map(|v| as_f64(v, 0.0)).unwrap_or(0.0);
        let t = calc_line(unit_price, qty, line_disc, tax_rate, tax_incl);
        subtotal += t.net; tax_total += t.tax; gross += t.line;

        let rate_key = format!("{:.2}", tax_rate);
        if let Some(e) = breakdown.iter_mut().find(|(k, _, _)| *k == rate_key) {
            e.1 += t.net; e.2 += t.tax;
        } else {
            breakdown.push((rate_key, t.net, t.tax));
        }

        let line_id = new_ids.get(i + 1).map(as_str).unwrap_or_default();
        let mut p = Map::new();
        p.insert("line_id".into(), json!(line_id));
        p.insert("sale_id".into(), json!(sale_id));
        p.insert("product_id".into(), item.get("product_id").cloned().unwrap_or(Value::Null));
        p.insert("product_name".into(), json!(as_str(item.get("product_name").unwrap_or(&Value::Null))));
        p.insert("product_sku".into(), json!(str_or(item, "product_sku", "")));
        p.insert("is_service".into(), json!(item.get("is_service").map(as_bool).unwrap_or(false) as i64));
        p.insert("quantity".into(), json!(qty)); // cantidad fraccionable (REAL)
        p.insert("unit_price".into(), json!(unit_price)); // céntimos (INTEGER)
        p.insert("discount_percent".into(), json!(line_disc)); // tasa % (REAL)
        p.insert("tax_rate".into(), json!(tax_rate)); // tasa % (REAL)
        p.insert("tax_class_name".into(), json!(str_or(item, "tax_class_name", "")));
        p.insert("net_amount".into(), json!(t.net)); // céntimos
        p.insert("tax_amount".into(), json!(t.tax)); // céntimos
        p.insert("line_total".into(), json!(t.line)); // céntimos
        ops.push(Operation::sql("sales._insert_line", p));
    }

    let discount_amount: i64 = if sale_disc > 0.0 {
        round_cents((gross as f64) * (sale_disc / 100.0))
    } else {
        0
    };
    let total = gross - discount_amount; // céntimos
    let tendered = as_cents(payload.get("amount_tendered").unwrap_or(&Value::Null), 0); // céntimos
    let change = if tendered - total > 0 { tendered - total } else { 0 };

    let mut tb = Map::new();
    for (k, base, tax) in &breakdown {
        // base/tax del desglose de IVA, en céntimos (INTEGER) — contrato inter-módulo.
        tb.insert(k.clone(), json!({ "base": *base, "tax": *tax }));
    }
    let tax_breakdown_json = Value::Object(tb).to_string();

    let mut h = Map::new();
    h.insert("sale_id".into(), json!(sale_id));
    h.insert("day".into(), json!(day));
    h.insert("status".into(), json!(str_or(&payload, "status", "completed")));
    h.insert("subtotal".into(), json!(subtotal));
    h.insert("tax_amount".into(), json!(tax_total));
    h.insert("discount_amount".into(), json!(discount_amount));
    h.insert("discount_percent".into(), json!(sale_disc));
    h.insert("total".into(), json!(total));
    h.insert("tax_breakdown".into(), json!(tax_breakdown_json));
    h.insert("payment_method_id".into(), payload.get("payment_method_id").cloned().unwrap_or(Value::Null));
    h.insert("payment_method_name".into(), json!(str_or(&payload, "payment_method_name", "")));
    h.insert("amount_tendered".into(), json!(tendered));
    h.insert("change_due".into(), json!(change));
    h.insert("customer_id".into(), payload.get("customer_id").cloned().unwrap_or(Value::Null));
    h.insert("customer_name".into(), json!(str_or(&payload, "customer_name", "")));
    h.insert("notes".into(), json!(str_or(&payload, "notes", "")));
    h.insert("channel".into(), json!(str_or(&payload, "channel", "")));
    h.insert("source_module".into(), json!(str_or(&payload, "source_module", "pos")));
    h.insert("table_id".into(), payload.get("table_id").cloned().unwrap_or(Value::Null));
    h.insert("order_id".into(), payload.get("order_id").cloned().unwrap_or(Value::Null));
    ops[header_idx] = Operation::sql("sales._insert_sale", h);

    // Líneas compactas para listeners cross-módulo (inventory descuenta stock por
    // product_id+quantity, saltando servicios). El payload del evento ES lo que
    // recibe el listener; por eso viaja la lista, no solo los totales. `unit_price`
    // viaja en céntimos (contrato inter-módulo).
    let event_items: Vec<Value> = items
        .iter()
        .map(|it| json!({
            "product_id": it.get("product_id").cloned().unwrap_or(Value::Null),
            "product_name": as_str(it.get("product_name").unwrap_or(&Value::Null)),
            "quantity": it.get("quantity").map(|v| as_f64(v, 1.0)).unwrap_or(1.0),
            "unit_price": as_cents(it.get("price").unwrap_or(&Value::Null), 0),
            "tax_rate": it.get("tax_rate").map(|v| as_f64(v, 0.0)).unwrap_or(0.0),
            "is_service": it.get("is_service").map(as_bool).unwrap_or(false),
        }))
        .collect();

    // order_id/order_number viajan en el evento (ADR-0010) para que `orders`
    // enlace el pedido (link_to_sale) sin re-consultar; NULL si la venta no
    // proviene de un pedido (el listener de orders es no-op en ese caso).
    // total/subtotal/tax_amount viajan en **céntimos** (contrato inter-módulo):
    // customers.record_purchase acumula total_spent (céntimos), etc.
    let event = Event::new("sale.completed", json!({
        "sender": "sales",
        "sale_id": sale_id,
        "order_id": payload.get("order_id").cloned().unwrap_or(Value::Null),
        "order_number": payload.get("order_number").cloned().unwrap_or(Value::Null),
        "total": total,
        "subtotal": subtotal,
        "tax_amount": tax_total,
        "items_count": items.len(),
        "items": event_items,
        "customer_id": payload.get("customer_id").cloned().unwrap_or(Value::Null),
        "customer_name": str_or(&payload, "customer_name", ""),
    }));

    Output { operations: ops, events: vec![event] }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn input(items: Value, ids: usize, tendered: i64) -> Value {
        let new_ids: Vec<Value> = (0..ids).map(|i| json!(format!("id-{i}"))).collect();
        json!({
            "payload": { "items": items, "tax_included": true, "amount_tendered": tendered, "customer_name": "Bar Manolo" },
            "context": { "hub_id": "h1", "current_user_id": "u1", "now": "2026-05-31T10:00:00+00:00", "new_ids": new_ids }
        })
    }

    #[test]
    fn round_cents_half_even() {
        // 12.5 céntimos → 12 (par); 13.5 → 14 (par).
        assert_eq!(round_cents(12.5), 12);
        assert_eq!(round_cents(13.5), 14);
        // 100€ con IVA 21% incl: 10000/1.21 = 8264.46… céntimos → 8264.
        assert_eq!(round_cents(10000.0 / 1.21), 8264);
    }

    #[test]
    fn line_tax_inclusive() {
        // 1.21€ = 121 céntimos, IVA 21% incluido → net 100, tax 21, line 121.
        let t = calc_line(121, 1.0, 0.0, 21.0, true);
        assert_eq!(t.net, 100); assert_eq!(t.tax, 21); assert_eq!(t.line, 121);
    }
    #[test]
    fn line_tax_exclusive() {
        // 1.00€ = 100 céntimos, IVA 21% excluido → net 100, tax 21, line 121.
        let t = calc_line(100, 1.0, 0.0, 21.0, false);
        assert_eq!(t.net, 100); assert_eq!(t.tax, 21); assert_eq!(t.line, 121);
    }
    #[test]
    fn line_discount_inclusive() {
        // 1.10€ = 110 céntimos ×2, desc 10%, IVA 21% incl → line 198, net 163.6…→164, tax 34.
        let t = calc_line(110, 2.0, 10.0, 21.0, true);
        assert_eq!(t.line, 198); assert_eq!(t.net, 164); assert_eq!(t.tax, 34);
    }

    #[test]
    fn emits_counter_sale_lines_event() {
        let items = json!([
            { "product_name": "Café", "price": 121, "quantity": 2, "tax_rate": 21.0 },
            { "product_name": "Agua", "price": 110, "quantity": 1, "tax_rate": 10.0 }
        ]);
        let out = complete_sale_pure(input(items, 8, 2000));
        assert_eq!(out.operations.len(), 4); // counter + sale + 2 líneas
        assert_eq!(out.operations[0].command, "sales._bump_counter");
        assert_eq!(out.operations[1].command, "sales._insert_sale");
        assert_eq!(out.operations[2].command, "sales._insert_line");
        assert_eq!(out.operations[1].params["sale_id"], json!("id-0"));
        assert_eq!(out.operations[2].params["sale_id"], json!("id-0"));
        assert_eq!(out.operations[2].params["line_id"], json!("id-1"));
        assert_eq!(out.events[0].name, "sale.completed");
        assert_eq!(out.events[0].payload["items_count"], json!(2));
        // El evento viaja en céntimos.
        assert_eq!(out.events[0].payload["total"], json!(352)); // 242 + 110
    }

    #[test]
    fn totals_and_change() {
        // 1.21€×1 = 121 céntimos (IVA 21% incl), pagado 2.00€ = 200 céntimos.
        let items = json!([{ "product_name": "X", "price": 12100, "quantity": 1, "tax_rate": 21.0 }]);
        let out = complete_sale_pure(input(items, 4, 20000));
        let s = &out.operations[1].params;
        assert_eq!(s["subtotal"], json!(10000));   // 100.00€
        assert_eq!(s["tax_amount"], json!(2100));  // 21.00€
        assert_eq!(s["total"], json!(12100));      // 121.00€
        assert_eq!(s["change_due"], json!(7900));  // 79.00€
    }
}
