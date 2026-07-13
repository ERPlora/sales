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
//! UNIDADES (ADR-0007 + ADR-0123): **la aritmética NO vive aquí**, vive en
//! [`erplora_guest_sdk::money`] — una sola implementación para todos los handlers. Este módulo
//! tenía su propio `round_cents` (half-even sobre `f64`), copiado **byte a byte** en otros cuatro.
//!
//! * **Dinero** = entero de **unidades mínimas** de la moneda del hub (`Money`). El payload entra
//!   en enteros (`price`/`amount_tendered`), los binds van a columnas `INTEGER` y el evento
//!   `sale.completed` viaja igual (contrato inter-módulo). El formateo decimal vive SOLO en la UI.
//! * **Tasas** (`tax_rate`, `discount`) y **cantidad** (`quantity`) **NO son dinero**: llevan
//!   decimales (`Rate`/`Qty`), se calculan en `Decimal` y se guardan en columnas `REAL`.
//!
//! Los tres son **tipos distintos**: `total + tax_rate` **no compila**. Confundirlos es la familia
//! de bugs que ADR-0123 vino a matar.
//!
//! DOS CAMBIOS DE COMPORTAMIENTO (ADR-0123 §4, decisión del humano 2026-07-13):
//!
//! 1. **HALF_UP**, no half-even. Ninguna norma española fija el modo de redondeo de la cuota de IVA
//!    (LIVA, RD 1619/2012, RD 1007/2023, Orden HAC/1177/2024: cero menciones); la única regla de
//!    redondeo monetario escrita en Derecho español es half-up (art. 11, Ley 46/1998 del euro).
//! 2. **La cuota se redondea UNA vez por TIPO IMPOSITIVO**, no por línea. Es lo único que el XML de
//!    VeriFactu sabe representar (`DetalleDesglose` es por tipo, máx. 12 — no hay detalle por
//!    artículo) y evita el error acumulado que censura el TEAC (RG 2233/2022).
//!
//! Antes, 7 chicles de 0,05 € al 21 % declaraban base 28 / cuota 7 — pero 28 × 21 % = 5,88 → **6**,
//! no 7: el desglose **no cuadraba** con `cuota = base × tipo`, y solo colaba por la tolerancia de
//! ±10 € de la AEAT. Ahora declara 29 / 6, que sí cuadra. Lo que paga el cliente no cambia.

use erplora_guest_sdk::money::{Money, Qty, Rate, TaxBreakdown};
use erplora_guest_sdk::{Event, Operation, Output};
use rust_decimal::prelude::FromPrimitive;
use rust_decimal::Decimal;
use serde_json::{json, Map, Value};

#[cfg(feature = "guest")]
use extism_pdk::*;

#[cfg(feature = "guest")]
#[plugin_fn]
pub fn complete_sale(input: Json<erplora_guest_sdk::Input>) -> FnResult<Json<Output>> {
    Ok(Json(complete_sale_pure(input.into_inner().into_value())))
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

/// Totales de una línea. Los tres son DINERO — el compilador no deja meter aquí una tasa.
struct LineTotals { net: Money, tax: Money, line: Money }

/// Lo que se lee de una línea del payload, **cada cosa con su tipo**.
struct LineInput { unit_price: Money, qty: Qty, disc: Rate, rate: Rate }

fn read_line(item: &Value) -> LineInput {
    LineInput {
        unit_price: Money::from_json(item.get("price").unwrap_or(&Value::Null), 0),
        qty: Qty::from_json(item.get("quantity").unwrap_or(&Value::Null), Decimal::ONE),
        disc: Rate::from_json(item.get("discount").unwrap_or(&Value::Null), Decimal::ZERO),
        rate: Rate::from_json(item.get("tax_rate").unwrap_or(&Value::Null), Decimal::ZERO),
    }
}

/// Los totales **de una línea**, para su fila y para los listeners.
///
/// Ojo: la base y la cuota **de la línea** son informativas. Las que se DECLARAN salen del desglose
/// por TIPO IMPOSITIVO (`TaxBreakdown`), que redondea la cuota una sola vez sobre la base agregada.
fn calc_line(l: &LineInput, tax_incl: bool) -> LineTotals {
    // Precio × cantidad − descuento, con UN solo redondeo.
    let amount = Money::line(l.unit_price, l.qty, l.disc);
    if tax_incl {
        // El precio ya lleva el IVA dentro: `amount` es lo que paga el cliente por esta línea.
        let (net, tax) = amount.split_tax_included(l.rate);
        LineTotals { net, tax, line: amount }
    } else {
        // El precio es la base; el IVA va encima.
        let tax = amount.percent_of(l.rate);
        LineTotals { net: amount, tax, line: amount + tax }
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

    // EL DESGLOSE MANDA: acumula el importe de cada línea por TIPO IMPOSITIVO y calcula la cuota
    // UNA sola vez por tipo, al cerrar (ADR-0123 §4). Redondear la cuota línea a línea y sumarlas
    // acumula error, y el XML de VeriFactu ni siquiera puede representarlo.
    let mut bd = if tax_incl { TaxBreakdown::tax_included() } else { TaxBreakdown::new() };
    let mut ops: Vec<Operation> = Vec::new();

    let mut bump = Map::new();
    bump.insert("day".into(), json!(day));
    ops.push(Operation::sql("sales._bump_counter", bump));

    let header_idx = ops.len();
    ops.push(Operation::sql("sales._insert_sale", Map::new())); // placeholder

    for (i, item) in items.iter().enumerate() {
        let l = read_line(item);
        let t = calc_line(&l, tax_incl);
        // Al desglose va el IMPORTE de la línea, no su cuota ya redondeada.
        bd.add(l.rate, t.line);

        let line_id = new_ids.get(i + 1).map(as_str).unwrap_or_default();
        let mut p = Map::new();
        p.insert("line_id".into(), json!(line_id));
        p.insert("sale_id".into(), json!(sale_id));
        p.insert("product_id".into(), item.get("product_id").cloned().unwrap_or(Value::Null));
        p.insert("product_name".into(), json!(as_str(item.get("product_name").unwrap_or(&Value::Null))));
        p.insert("product_sku".into(), json!(str_or(item, "product_sku", "")));
        p.insert("is_service".into(), json!(item.get("is_service").map(as_bool).unwrap_or(false) as i64));
        p.insert("quantity".into(), json!(l.qty.to_f64())); // cantidad fraccionable (REAL)
        p.insert("unit_price".into(), json!(l.unit_price.minor())); // unidades mínimas (INTEGER)
        p.insert("discount_percent".into(), json!(l.disc.to_f64())); // tasa % (REAL)
        p.insert("tax_rate".into(), json!(l.rate.to_f64())); // tasa % (REAL)
        p.insert("tax_class_name".into(), json!(str_or(item, "tax_class_name", "")));
        p.insert("net_amount".into(), json!(t.net.minor())); // informativo: manda el desglose
        p.insert("tax_amount".into(), json!(t.tax.minor())); // informativo: manda el desglose
        p.insert("line_total".into(), json!(t.line.minor()));
        ops.push(Operation::sql("sales._insert_line", p));
    }

    // Los totales que se DECLARAN salen del desglose, no de sumar líneas ya redondeadas.
    let subtotal = bd.total_base();
    let tax_total = bd.total_tax();
    let gross = bd.total(); // con IVA incluido, es EXACTAMENTE lo que paga el cliente

    // ⚠️ El descuento de VENTA COMPLETA se resta del bruto DESPUÉS del desglose, así que el desglose
    // declarado no lo refleja (base + cuota ≠ total). Hoy no lo manda nadie (ni el TPV táctil ni el
    // de escritorio); hacerlo bien exige decidir cómo reparte un descuento global la base imponible
    // entre tipos → decisión fiscal del humano. Se conserva el comportamiento anterior.
    let discount_amount = if sale_disc > 0.0 {
        gross.percent_of(Rate::from_percent(Decimal::from_f64(sale_disc).unwrap_or(Decimal::ZERO)))
    } else {
        Money::ZERO
    };
    let total = gross - discount_amount;
    let tendered = Money::from_json(payload.get("amount_tendered").unwrap_or(&Value::Null), 0);
    let change = if tendered > total { tendered - total } else { Money::ZERO };

    let mut tb = Map::new();
    for (rate, base, tax) in bd.close() {
        // base/cuota por TIPO, en unidades mínimas (INTEGER) — contrato inter-módulo.
        // La clave sigue siendo el tipo con 2 decimales ("21.00"), como antes.
        tb.insert(
            format!("{:.2}", rate.to_f64()),
            json!({ "base": base.minor(), "tax": tax.minor() }),
        );
    }
    let tax_breakdown_json = Value::Object(tb).to_string();

    let mut h = Map::new();
    h.insert("sale_id".into(), json!(sale_id));
    h.insert("day".into(), json!(day));
    h.insert("status".into(), json!(str_or(&payload, "status", "completed")));
    h.insert("subtotal".into(), json!(subtotal.minor()));
    h.insert("tax_amount".into(), json!(tax_total.minor()));
    h.insert("discount_amount".into(), json!(discount_amount.minor()));
    h.insert("discount_percent".into(), json!(sale_disc));
    h.insert("total".into(), json!(total.minor()));
    h.insert("tax_breakdown".into(), json!(tax_breakdown_json));
    h.insert("payment_method_id".into(), payload.get("payment_method_id").cloned().unwrap_or(Value::Null));
    h.insert("payment_method_name".into(), json!(str_or(&payload, "payment_method_name", "")));
    h.insert("amount_tendered".into(), json!(tendered.minor()));
    h.insert("change_due".into(), json!(change.minor()));
    h.insert("customer_id".into(), payload.get("customer_id").cloned().unwrap_or(Value::Null));
    h.insert("customer_name".into(), json!(str_or(&payload, "customer_name", "")));
    h.insert("notes".into(), json!(str_or(&payload, "notes", "")));
    h.insert("channel".into(), json!(str_or(&payload, "channel", "")));
    h.insert("source_module".into(), json!(str_or(&payload, "source_module", "pos")));
    h.insert("table_id".into(), payload.get("table_id").cloned().unwrap_or(Value::Null));
    h.insert("order_id".into(), payload.get("order_id").cloned().unwrap_or(Value::Null));
    ops[header_idx] = Operation::sql("sales._insert_sale", h);

    // Líneas compactas para listeners cross-módulo (inventory descuenta stock por
    // product_id+quantity, saltando servicios; invoice factura por net/tax YA
    // calculados). El payload del evento ES lo que recibe el listener; por eso viaja
    // la lista, no solo los totales. `unit_price` viaja en céntimos (contrato
    // inter-módulo). `net_amount`/`tax_amount` por línea (céntimos) los recalculó
    // `calc_line` respetando `tax_included`: invoice NO debe re-sumar IVA sobre el
    // bruto (precios IVA-incluido), debe USAR estos importes. Recomputamos aquí en
    // el mismo orden que arriba para emitir la base/IVA por línea sin reestructurar.
    let event_items: Vec<Value> = items
        .iter()
        .map(|it| {
            let l = read_line(it);
            let t = calc_line(&l, tax_incl);
            json!({
                "product_id": it.get("product_id").cloned().unwrap_or(Value::Null),
                "product_name": as_str(it.get("product_name").unwrap_or(&Value::Null)),
                "quantity": l.qty.to_f64(),
                "unit_price": l.unit_price.minor(), // unidades mínimas (unitario tal cual lo envió la UI)
                "tax_rate": l.rate.to_f64(),        // tasa %
                "net_amount": t.net.minor(),        // base imponible YA extraída
                "tax_amount": t.tax.minor(),        // IVA YA calculado
                "is_service": it.get("is_service").map(as_bool).unwrap_or(false),
            })
        })
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
        // table_id viaja en el evento (D3): kitchen.create_order_from_sale lo lee para
        // decidir order_type=dine_in (con mesa) y enlazar la comanda a la mesa. NULL si
        // la venta no proviene de una mesa.
        "table_id": payload.get("table_id").cloned().unwrap_or(Value::Null),
        // tax_included indica que unit_price de cada línea es bruto (IVA-incluido).
        // invoice usa net_amount/tax_amount por línea (ya extraídos) y NO re-suma IVA.
        "tax_included": tax_incl,
        "total": total.minor(),
        "subtotal": subtotal.minor(),
        "tax_amount": tax_total.minor(),
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

    /// Azúcar: construye la línea con sus tipos correctos (dinero entero, tasas/cantidad Decimal).
    fn linea(unit: i64, qty: f64, disc: f64, rate: f64) -> LineInput {
        LineInput {
            unit_price: Money::from_minor(unit),
            qty: Qty::from_decimal(Decimal::from_f64(qty).unwrap()),
            disc: Rate::from_percent(Decimal::from_f64(disc).unwrap()),
            rate: Rate::from_percent(Decimal::from_f64(rate).unwrap()),
        }
    }

    #[test]
    fn el_redondeo_ahora_es_half_up_y_vive_en_el_SDK() {
        use erplora_guest_sdk::money;
        // ANTES: `round_cents` propio, half-even → 12,5 se iba a 12 (al par). AHORA: HALF_UP → 13.
        // Es la única regla de redondeo monetario escrita en Derecho español (art. 11, Ley 46/1998).
        assert_eq!(money::round(Decimal::from_f64(12.5).unwrap()), 13);
        assert_eq!(money::round(Decimal::from_f64(13.5).unwrap()), 14);
        // 100 € con IVA 21 % incl: 10000/1,21 = 8264,46… → 8264 (sin empate; no cambia).
        let (base, _) = Money::from_minor(10000).split_tax_included(Rate::from_percent(Decimal::from(21)));
        assert_eq!(base.minor(), 8264);
    }

    #[test]
    fn line_tax_inclusive() {
        // 1.21€ = 121 céntimos, IVA 21% incluido → net 100, tax 21, line 121.
        let t = calc_line(&linea(121, 1.0, 0.0, 21.0), true);
        assert_eq!(t.net.minor(), 100); assert_eq!(t.tax.minor(), 21); assert_eq!(t.line.minor(), 121);
    }
    #[test]
    fn line_tax_exclusive() {
        // 1.00€ = 100 céntimos, IVA 21% excluido → net 100, tax 21, line 121.
        let t = calc_line(&linea(100, 1.0, 0.0, 21.0), false);
        assert_eq!(t.net.minor(), 100); assert_eq!(t.tax.minor(), 21); assert_eq!(t.line.minor(), 121);
    }
    #[test]
    fn line_discount_inclusive() {
        // 1.10€ = 110 céntimos ×2, desc 10%, IVA 21% incl → line 198, net 163.6…→164, tax 34.
        let t = calc_line(&linea(110, 2.0, 10.0, 21.0), true);
        assert_eq!(t.line.minor(), 198); assert_eq!(t.net.minor(), 164); assert_eq!(t.tax.minor(), 34);
    }

    #[test]
    fn el_desglose_declara_la_cuota_POR_TIPO_no_sumando_las_de_cada_linea() {
        // EL CAMBIO DE ADR-0123 §4, con el caso donde de verdad se nota.
        //
        // Siete chicles de 0,05 € (IVA 21 % incluido). El cliente paga 0,35 € — eso NO cambia.
        // Lo que cambia es lo que se DECLARA a la AEAT:
        //
        //   · ANTES (redondeando por LÍNEA): base = round(5/1,21) = 4 cts, siete veces → base 28,
        //     cuota 7. Pero 28 × 21 % = 5,88 → 6, NO 7: el desglose era **incoherente** con
        //     `cuota = base × tipo` y solo colaba por la tolerancia de ±10 € de la AEAT.
        //   · AHORA (una vez por TIPO): base = round(35/1,21) = 29 cts, cuota = 35 − 29 = 6.
        //     Y 29 × 21 % = 6,09 → 6. Cuadra.
        let items = json!((0..7).map(|_| json!({
            "product_name": "Chicle", "price": 5, "quantity": 1, "tax_rate": 21.0
        })).collect::<Vec<_>>());
        let out = complete_sale_pure(input(items, 9, 100));
        let h = &out.operations[1].params; // sales._insert_sale

        assert_eq!(h["total"], json!(35), "lo que paga el cliente no se mueve");
        assert_eq!(h["subtotal"], json!(29), "base declarada: sobre el AGREGADO, no línea a línea");
        assert_eq!(h["tax_amount"], json!(6), "cuota declarada: 35 − 29, no 7×1");

        // Y el desglose que va al XML: UN solo DetalleDesglose para el 21 %.
        let bd: Value = serde_json::from_str(h["tax_breakdown"].as_str().unwrap()).unwrap();
        assert_eq!(bd.as_object().unwrap().len(), 1, "un detalle por TIPO, no por artículo");
        assert_eq!(bd["21.00"], json!({ "base": 29, "tax": 6 }));
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
        // tax_included viaja en el evento (default true en el helper input()).
        assert_eq!(out.events[0].payload["tax_included"], json!(true));
        // net/tax por línea YA extraídos (IVA-incluido): 121×2 bruto → net 200, tax 42.
        let l0 = &out.events[0].payload["items"][0];
        assert_eq!(l0["net_amount"], json!(200));
        assert_eq!(l0["tax_amount"], json!(42));
        assert_eq!(l0["unit_price"], json!(121)); // bruto unitario tal cual
    }

    #[test]
    fn event_carries_table_id_for_kitchen() {
        // D3: table_id debe viajar en sale.completed para que kitchen cree dine_in.
        let new_ids: Vec<Value> = (0..4).map(|i| json!(format!("id-{i}"))).collect();
        let input = json!({
            "payload": {
                "items": [{ "product_name": "X", "price": 121, "quantity": 1, "tax_rate": 21.0 }],
                "tax_included": true, "amount_tendered": 200, "table_id": "table-7"
            },
            "context": { "hub_id": "h1", "current_user_id": "u1", "now": "2026-05-31T10:00:00+00:00", "new_ids": new_ids }
        });
        let out = complete_sale_pure(input);
        assert_eq!(out.events[0].payload["table_id"], json!("table-7"));
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
