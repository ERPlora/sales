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
//!
//! IMPUESTO SERVER-AUTHORITATIVE (ADR-0069 — keystone, supera el interino ADR-0066):
//! * El POS manda por línea un `tax_rate_id` (referencia fiscal del producto) y, como
//!   pista de **preview**, un `tax_rate` (% resuelto en cliente). **La autoridad del % es
//!   este handler**: por cada línea resuelve `rate_pct`/`tax_type` desde el **catálogo de
//!   confianza** que el runtime pre-carga en `context.reads["taxes.rates.list"]`
//!   (declarado como `reads` en el manifest, gateado por `depends_on:["taxes"]`). El
//!   `tax_rate` del cliente se **ignora** si la línea se resuelve por catálogo.
//! * **Grupos (multi-impuesto, "IVA 21 + RE 5,2")**: si el tipo resuelto tiene
//!   `tax_type == "group"`, se **expande** a sus componentes (filas con
//!   `parent_id == tax_rate_id` entre las cargadas); cada componente aporta su `rate_pct`
//!   sobre la **misma base** y el `tax_breakdown` lleva **una clave por componente** (p.ej.
//!   `{"21.00":{…},"5.20":{…}}`). Réplica de la aritmética de `taxes::group_components`
//!   (módulos separados; ver `architecture` ADR-0069).
//! * **Backward-compat / graceful**: sin `context.reads`, o `tax_rate_id` ausente/no
//!   encontrado → se cae al `tax_rate` del payload si viene; si no, 0%. Nunca rompe la
//!   venta. Respeta `tax_included` igual que antes.

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

/// Calcula los totales de una línea en céntimos para **una sola tasa**. `unit_price_cents`
/// en céntimos; `qty`, `disc_pct`, `tax_rate` son `f64` (cantidad / porcentajes). El redondeo
/// half-even se aplica al pasar a céntimos enteros, igual que el Decimal original. El flujo de
/// producción usa `calc_line_components` (que generaliza esto a N componentes para grupos,
/// ADR-0069); `calc_line` se conserva como referencia aritmética de tasa simple para los tests.
#[cfg(test)]
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

// ── Resolución del impuesto desde el catálogo de confianza (ADR-0069) ─────────

/// Lee un campo de una fila como string (vacío si ausente/null).
fn field(v: &Value, k: &str) -> String {
    as_str(v.get(k).unwrap_or(&Value::Null))
}

/// Un componente de impuesto a aplicar sobre la base de una línea: un tipo simple
/// (un solo componente) o cada hijo de un grupo (multi-impuesto). `rate_pct` es la
/// tasa %, `rate_key` es la clave del `tax_breakdown` ("21.00", "5.20", …).
struct TaxComponent {
    rate_pct: f64,
    rate_key: String,
}

/// Desenvuelve **defensivamente** las filas del catálogo pre-cargado en
/// `context.reads["taxes.rates.list"]`. El contrato exacto que asumimos: puede venir
/// (a) como **array directo** `[ {…}, … ]`, o (b) envuelto como **`{"rows":[…]}`**
/// (forma paginada del list-engine). Cualquier otra forma → catálogo vacío (degrada a
/// fallback de payload). Devuelve referencias a las filas.
fn load_rate_catalog(context: &Value) -> Vec<&Value> {
    let Some(node) = context.get("reads").and_then(|r| r.get("taxes.rates.list")) else {
        return Vec::new();
    };
    let arr = match node {
        Value::Array(a) => Some(a),
        Value::Object(_) => node.get("rows").and_then(|v| v.as_array()),
        _ => None,
    };
    arr.map(|a| a.iter().collect()).unwrap_or_default()
}

/// ¿Está activa la fila? Si la columna no viene (la query ya filtra), se asume activa.
fn rate_is_active(row: &Value) -> bool {
    match row.get("is_active") {
        None | Some(Value::Null) => true,
        Some(v) => as_bool(v),
    }
}

/// Clave de desglose para una tasa: "%.2f" del `rate_pct` (p.ej. 21.0 → "21.00").
fn rate_key(rate_pct: f64) -> String {
    format!("{:.2}", rate_pct)
}

/// Resuelve los componentes de impuesto de una línea (ADR-0069), **server-authoritative**:
///
/// 1. Si la línea trae `tax_rate_id` y existe en el catálogo de confianza → usa SIEMPRE el
///    `rate_pct` del catálogo (ignora el `tax_rate` que mandó el cliente).
///    * `tax_type == "group"` → expande a sus componentes (filas con
///      `parent_id == tax_rate_id`, activas, entre las cargadas), una entrada por hijo. Si
///      el grupo no tiene hijos cargados, degrada a su propio `rate_pct` (tipo simple).
///    * tipo simple → un único componente con su `rate_pct`.
/// 2. Si no hay catálogo, o `tax_rate_id` ausente/no encontrado → **fallback graceful** al
///    `tax_rate` del payload (preview del cliente) si viene; si no, 0%. Un solo componente.
fn resolve_line_components(item: &Value, catalog: &[&Value]) -> Vec<TaxComponent> {
    let rate_id = field(item, "tax_rate_id");
    if !rate_id.is_empty() {
        if let Some(rate) = catalog.iter().copied().find(|r| field(r, "id") == rate_id) {
            // Tipo "grupo": expandir a hijos (parent_id == id_del_grupo, activos).
            if field(rate, "tax_type").eq_ignore_ascii_case("group") {
                let mut children: Vec<&Value> = catalog
                    .iter()
                    .copied()
                    .filter(|r| {
                        !field(r, "id").is_empty()
                            && field(r, "parent_id") == rate_id
                            && rate_is_active(r)
                    })
                    .collect();
                if !children.is_empty() {
                    // Orden determinista: `default`/`standard` primero, luego por `code`.
                    children.sort_by_key(|r| {
                        let code = field(r, "code").to_lowercase();
                        let pref = if code == "default" || code == "standard" { 0 } else { 1 };
                        (pref, code)
                    });
                    return children
                        .iter()
                        .map(|r| {
                            let pct = as_f64(r.get("rate_pct").unwrap_or(&Value::Null), 0.0);
                            TaxComponent { rate_pct: pct, rate_key: rate_key(pct) }
                        })
                        .collect();
                }
                // Grupo sin hijos cargados → se trata como tipo simple con su propio rate_pct.
            }
            let pct = as_f64(rate.get("rate_pct").unwrap_or(&Value::Null), 0.0);
            return vec![TaxComponent { rate_pct: pct, rate_key: rate_key(pct) }];
        }
    }
    // Backward-compat / graceful: catálogo ausente o id no encontrado → preview del cliente
    // (payload.tax_rate) si viene; si no, 0%.
    let pct = item.get("tax_rate").map(|v| as_f64(v, 0.0)).unwrap_or(0.0);
    vec![TaxComponent { rate_pct: pct, rate_key: rate_key(pct) }]
}

/// Totales de una línea aplicando **N componentes** de impuesto sobre la misma base
/// (ADR-0069, grupos). Devuelve `(LineTotals agregado, desglose por componente)`. La tasa
/// combinada (suma de componentes) desglosa la base cuando `tax_included`; cada componente
/// calcula su cuota sobre esa base (half-even, paridad con `calc_line`). Para un solo
/// componente el resultado es idéntico a `calc_line`.
fn calc_line_components(
    unit_price_cents: i64,
    qty: f64,
    disc_pct: f64,
    tax_incl: bool,
    components: &[TaxComponent],
) -> (LineTotals, Vec<(String, i64, i64)>) {
    let combined_pct: f64 = components.iter().map(|c| c.rate_pct).sum();
    let unit = unit_price_cents as f64;
    let discounted = unit - unit * (disc_pct / 100.0); // céntimos (fraccionario)
    // Base imponible (común a todos los componentes) y bruto de la línea.
    let (net, line) = if tax_incl {
        let divisor = 1.0 + combined_pct / 100.0;
        (round_cents((discounted / divisor) * qty), round_cents(discounted * qty))
    } else {
        (round_cents(discounted * qty), 0) // line se recompone abajo (net + suma de cuotas)
    };
    // Cuota por componente sobre la misma base; la cuota total = suma de las redondeadas.
    let net_f = net as f64;
    let mut parts: Vec<(String, i64, i64)> = Vec::with_capacity(components.len());
    let mut tax_total: i64 = 0;
    for c in components {
        let comp_tax = round_cents(net_f * (c.rate_pct / 100.0));
        tax_total += comp_tax;
        // Agrega por clave (dos componentes con la misma tasa se funden en una entrada).
        if let Some(e) = parts.iter_mut().find(|(k, _, _)| *k == c.rate_key) {
            e.2 += comp_tax;
        } else {
            parts.push((c.rate_key.clone(), net, comp_tax));
        }
    }
    let line = if tax_incl { line } else { net + tax_total };
    (LineTotals { net, tax: tax_total, line }, parts)
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

    // Catálogo fiscal de confianza pre-cargado por el runtime (ADR-0069). Vacío si el
    // runtime no inyectó reads (host antiguo / dependencia no resuelta) → fallback graceful.
    let catalog = load_rate_catalog(&context);

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
        // ADR-0069: resuelve el impuesto desde el catálogo de confianza (server-authoritative,
        // expande grupos), con fallback graceful al `tax_rate` del payload. El `tax_rate` que
        // mandó el cliente NO es autoridad; solo se usa si la línea no resuelve por catálogo.
        let components = resolve_line_components(item, &catalog);
        // Tasa combinada que persistimos en la línea (== suma de componentes; para un tipo
        // simple es su propio %). Es la cifra que ve invoice/listeners en `tax_rate`.
        let combined_pct: f64 = components.iter().map(|c| c.rate_pct).sum();
        let (t, parts) = calc_line_components(unit_price, qty, line_disc, tax_incl, &components);
        subtotal += t.net; tax_total += t.tax; gross += t.line;

        // Desglose por componente: una clave por tasa (los grupos aportan varias, p.ej.
        // "21.00" + "5.20"). Agrega sobre el desglose global de la venta.
        for (k, base, tax) in parts {
            if let Some(e) = breakdown.iter_mut().find(|(ek, _, _)| *ek == k) {
                e.1 += base; e.2 += tax;
            } else {
                breakdown.push((k, base, tax));
            }
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
        p.insert("tax_rate".into(), json!(combined_pct)); // tasa % resuelta (REAL) — server-authoritative
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
    // Atribución por profesional (staff_member) y traza de la cita de origen (opacas; sin FK
    // cross-módulo). `staff_id` distinto de `employee_id` (= :current_user_id, el cajero). NULL
    // en TPV sin atribuir; `appointment_id` NULL salvo venta nacida de una cita.
    h.insert("staff_id".into(), payload.get("staff_id").cloned().unwrap_or(Value::Null));
    h.insert("appointment_id".into(), payload.get("appointment_id").cloned().unwrap_or(Value::Null));
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
            let unit_price = as_cents(it.get("price").unwrap_or(&Value::Null), 0); // céntimos
            let qty = it.get("quantity").map(|v| as_f64(v, 1.0)).unwrap_or(1.0);
            let line_disc = it.get("discount").map(|v| as_f64(v, 0.0)).unwrap_or(0.0);
            // Mismo resolver server-authoritative que arriba (ADR-0069): el evento lleva el %
            // y los net/tax RESUELTOS del catálogo, no la pista del cliente, para que
            // invoice/inventory reaccionen con cifras de confianza.
            let components = resolve_line_components(it, &catalog);
            let combined_pct: f64 = components.iter().map(|c| c.rate_pct).sum();
            let (t, _parts) = calc_line_components(unit_price, qty, line_disc, tax_incl, &components);
            json!({
                "product_id": it.get("product_id").cloned().unwrap_or(Value::Null),
                "product_name": as_str(it.get("product_name").unwrap_or(&Value::Null)),
                "quantity": qty,
                "unit_price": unit_price,           // céntimos (bruto/unitario tal cual lo envió la UI)
                "tax_rate": combined_pct,           // tasa % resuelta (server-authoritative)
                "net_amount": t.net,                // céntimos: base imponible YA extraída
                "tax_amount": t.tax,                // céntimos: IVA YA calculado
                "is_service": it.get("is_service").map(as_bool).unwrap_or(false),
                // category_id por línea (aditivo, QA 2026-06-25): el KDS enruta la comanda a su
                // estación (station_id) por la categoría del producto. Sin esto, el KDS recibe
                // station_id vacío. Opaco para sales (no FK cross-módulo); NULL si la línea no
                // trae categoría (p.ej. producto sin clasificar). No depende de qué KDS se instale.
                "category_id": it.get("category_id").cloned().unwrap_or(Value::Null),
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
        "total": total,
        "subtotal": subtotal,
        "tax_amount": tax_total,
        "items_count": items.len(),
        "items": event_items,
        "customer_id": payload.get("customer_id").cloned().unwrap_or(Value::Null),
        "customer_name": str_or(&payload, "customer_name", ""),
        // staff_id viaja en el evento para que los consumidores (p.ej. cash_register, reporting)
        // puedan atribuir la venta al profesional. NULL si la venta no se atribuye.
        "staff_id": payload.get("staff_id").cloned().unwrap_or(Value::Null),
    }));

    let mut events = vec![event];

    // Cita→venta (seam de marcado convertido): si la venta nace de una cita, emitimos un
    // evento de traza con el appointment_id para que `appointments` la marque convertida en
    // SU propio listener (sales NO edita appointments — contrato por evento, ADR-0010 style).
    // El evento es ADITIVO a sale.completed (no lo reemplaza): inventory/customers/cash_register
    // reaccionan igual a sale.completed; solo appointments escucha el nuevo.
    let appointment_id = payload.get("appointment_id").cloned().unwrap_or(Value::Null);
    if !appointment_id.is_null() && !as_str(&appointment_id).is_empty() {
        events.push(Event::new("sales.sale.created_from_appointment", json!({
            "sender": "sales",
            "sale_id": sale_id,
            "appointment_id": appointment_id,
            "staff_id": payload.get("staff_id").cloned().unwrap_or(Value::Null),
            "total": total,
        })));
    }

    Output { operations: ops, events }
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
    fn event_carries_category_id_per_line_for_kds() {
        // category_id por línea debe viajar en sale.completed para que el KDS enrute la comanda
        // a su estación (station_id). Una línea con categoría la lleva; una sin categoría → null.
        let new_ids: Vec<Value> = (0..4).map(|i| json!(format!("id-{i}"))).collect();
        let input = json!({
            "payload": {
                "items": [
                    { "product_name": "Pollo", "price": 121, "quantity": 1, "tax_rate": 21.0, "category_id": "cat-cocina" },
                    { "product_name": "Agua",  "price": 110, "quantity": 1, "tax_rate": 10.0 }
                ],
                "tax_included": true, "amount_tendered": 500
            },
            "context": { "hub_id": "h1", "current_user_id": "u1", "now": "2026-05-31T10:00:00+00:00", "new_ids": new_ids }
        });
        let out = complete_sale_pure(input);
        // Línea con categoría → category_id presente; sin categoría → null (no rompe el evento).
        assert_eq!(out.events[0].payload["items"][0]["category_id"], json!("cat-cocina"));
        assert_eq!(out.events[0].payload["items"][1]["category_id"], Value::Null);
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

    // ── ADR-0069: resolución server-side del impuesto desde el catálogo ───────

    /// Construye un input con catálogo fiscal pre-cargado en `context.reads`.
    /// `reads_shape` = "array" → array directo; "rows" → `{"rows":[…]}`.
    fn input_with_catalog(items: Value, ids: usize, catalog: Value, reads_shape: &str) -> Value {
        let new_ids: Vec<Value> = (0..ids).map(|i| json!(format!("id-{i}"))).collect();
        let rates_node = if reads_shape == "rows" { json!({ "rows": catalog }) } else { catalog };
        json!({
            "payload": { "items": items, "tax_included": false, "amount_tendered": 0, "customer_name": "Bar Manolo" },
            "context": {
                "hub_id": "h1", "current_user_id": "u1", "now": "2026-05-31T10:00:00+00:00",
                "new_ids": new_ids,
                "reads": { "taxes.rates.list": rates_node }
            }
        })
    }

    #[test]
    fn line_resolves_rate_from_catalog_ignoring_client_hint() {
        // El cliente manda tax_rate=99 (mentira); el catálogo dice 21% para ese tax_rate_id.
        // El servidor DEBE usar 21%, no 99%. 100.00€ neto → IVA 21.00€.
        let items = json!([
            { "product_name": "Café", "price": 10000, "quantity": 1, "tax_rate_id": "r-21", "tax_rate": 99.0 }
        ]);
        let catalog = json!([
            { "id": "r-21", "code": "standard", "rate_pct": 21.0, "tax_type": "vat", "is_active": 1 },
            { "id": "r-10", "code": "reduced",  "rate_pct": 10.0, "tax_type": "vat", "is_active": 1 }
        ]);
        let out = complete_sale_pure(input_with_catalog(items, 4, catalog, "array"));
        let line = &out.operations[2].params;
        assert_eq!(line["tax_rate"], json!(21.0));    // % del catálogo, no el del cliente
        assert_eq!(line["net_amount"], json!(10000)); // 100.00€
        assert_eq!(line["tax_amount"], json!(2100));  // 21.00€ (no 99%)
        let s = &out.operations[1].params;
        assert_eq!(s["tax_amount"], json!(2100));
        // tax_breakdown lleva la clave de la tasa resuelta.
        let tb: Value = serde_json::from_str(s["tax_breakdown"].as_str().unwrap()).unwrap();
        assert_eq!(tb["21.00"]["base"], json!(10000));
        assert_eq!(tb["21.00"]["tax"], json!(2100));
        assert!(tb.get("99.00").is_none());
    }

    #[test]
    fn line_resolves_rate_from_catalog_rows_shape() {
        // Mismo caso pero el catálogo viene envuelto como {"rows":[…]} (forma paginada).
        let items = json!([
            { "product_name": "Café", "price": 10000, "quantity": 1, "tax_rate_id": "r-21" }
        ]);
        let catalog = json!([
            { "id": "r-21", "code": "standard", "rate_pct": 21.0, "tax_type": "vat", "is_active": 1 }
        ]);
        let out = complete_sale_pure(input_with_catalog(items, 4, catalog, "rows"));
        let line = &out.operations[2].params;
        assert_eq!(line["tax_rate"], json!(21.0));
        assert_eq!(line["tax_amount"], json!(2100));
    }

    #[test]
    fn group_rate_expands_to_components() {
        // tax_rate_id apunta a un GRUPO "IVA 21 + RE 5,2". Base 100.00€ →
        // IVA 21% = 21.00€ + RE 5,2% = 5.20€ → tax total 26.20€, line 131.20€.
        let items = json!([
            { "product_name": "Producto RE", "price": 10000, "quantity": 1, "tax_rate_id": "g-re" }
        ]);
        let catalog = json!([
            { "id": "g-re", "code": "grp-re", "rate_pct": 0.0, "tax_type": "group", "is_active": 1 },
            { "id": "c-iva", "code": "iva21", "rate_pct": 21.0, "tax_type": "vat",       "parent_id": "g-re", "is_active": 1 },
            { "id": "c-re",  "code": "re52",  "rate_pct": 5.2,  "tax_type": "surcharge", "parent_id": "g-re", "is_active": 1 }
        ]);
        let out = complete_sale_pure(input_with_catalog(items, 4, catalog, "array"));
        let line = &out.operations[2].params;
        assert_eq!(line["net_amount"], json!(10000)); // base 100.00€
        assert_eq!(line["tax_amount"], json!(2620));  // 21.00 + 5.20 = 26.20€
        assert_eq!(line["line_total"], json!(12620)); // 131.20€
        assert_eq!(line["tax_rate"], json!(26.2));    // tasa combinada en la línea
        // El desglose lleva DOS claves (un componente por tasa).
        let s = &out.operations[1].params;
        let tb: Value = serde_json::from_str(s["tax_breakdown"].as_str().unwrap()).unwrap();
        assert_eq!(tb["21.00"]["base"], json!(10000));
        assert_eq!(tb["21.00"]["tax"], json!(2100));
        assert_eq!(tb["5.20"]["base"], json!(10000));
        assert_eq!(tb["5.20"]["tax"], json!(520));
        assert_eq!(s["tax_amount"], json!(2620));
    }

    #[test]
    fn group_rate_tax_included_unwinds_combined_rate() {
        // Bruto 126.20€ con grupo 21+5,2 incluido (combinada 26,2%) → base 100.00€,
        // IVA 21.00€, RE 5.20€ (126.20 / 1.262 = 100.00).
        let items = json!([
            { "product_name": "Producto RE incl", "price": 12620, "quantity": 1, "tax_rate_id": "g-re" }
        ]);
        let catalog = json!([
            { "id": "g-re", "code": "grp-re", "rate_pct": 0.0, "tax_type": "group", "is_active": 1 },
            { "id": "c-iva", "rate_pct": 21.0, "tax_type": "vat",       "parent_id": "g-re", "is_active": 1 },
            { "id": "c-re",  "rate_pct": 5.2,  "tax_type": "surcharge", "parent_id": "g-re", "is_active": 1 }
        ]);
        // tax_included=true: usamos el helper de catálogo pero forzando incl en el payload.
        let new_ids: Vec<Value> = (0..4).map(|i| json!(format!("id-{i}"))).collect();
        let inp = json!({
            "payload": { "items": items, "tax_included": true, "amount_tendered": 0 },
            "context": {
                "hub_id": "h1", "now": "2026-05-31T10:00:00+00:00", "new_ids": new_ids,
                "reads": { "taxes.rates.list": catalog }
            }
        });
        let out = complete_sale_pure(inp);
        let line = &out.operations[2].params;
        assert_eq!(line["net_amount"], json!(10000)); // 126.20 / 1.262 = 100.00€
        assert_eq!(line["tax_amount"], json!(2620));  // 26.20€
        assert_eq!(line["line_total"], json!(12620)); // bruto íntegro
    }

    #[test]
    fn unknown_tax_rate_id_falls_back_to_zero() {
        // tax_rate_id no está en el catálogo y NO hay tax_rate de preview → 0%, sin romper.
        let items = json!([
            { "product_name": "Misterioso", "price": 10000, "quantity": 1, "tax_rate_id": "no-existe" }
        ]);
        let catalog = json!([
            { "id": "r-21", "rate_pct": 21.0, "tax_type": "vat", "is_active": 1 }
        ]);
        let out = complete_sale_pure(input_with_catalog(items, 4, catalog, "array"));
        let line = &out.operations[2].params;
        assert_eq!(line["tax_rate"], json!(0.0));
        assert_eq!(line["net_amount"], json!(10000));
        assert_eq!(line["tax_amount"], json!(0));
        // La venta NO se rompe: hay operaciones y evento.
        assert!(out.operations.len() >= 3);
        assert_eq!(out.events[0].name, "sale.completed");
    }

    // ── Atribución por profesional + cita→venta ──────────────────────────────

    #[test]
    fn staff_id_persisted_in_header_and_event() {
        // La venta atribuida a un profesional guarda staff_id en la cabecera y lo emite.
        let new_ids: Vec<Value> = (0..4).map(|i| json!(format!("id-{i}"))).collect();
        let inp = json!({
            "payload": {
                "items": [{ "product_name": "Corte", "price": 2000, "quantity": 1, "tax_rate": 21.0 }],
                "tax_included": true, "amount_tendered": 0, "staff_id": "staff-7", "is_service": true
            },
            "context": { "hub_id": "h1", "current_user_id": "u1", "now": "2026-05-31T10:00:00+00:00", "new_ids": new_ids }
        });
        let out = complete_sale_pure(inp);
        // header (_insert_sale) lleva staff_id; appointment_id NULL (venta TPV normal).
        assert_eq!(out.operations[1].params["staff_id"], json!("staff-7"));
        assert_eq!(out.operations[1].params["appointment_id"], Value::Null);
        // sale.completed lleva staff_id para que cash_register/reporting atribuyan.
        assert_eq!(out.events[0].payload["staff_id"], json!("staff-7"));
        // Sin appointment_id → un solo evento (no se emite created_from_appointment).
        assert_eq!(out.events.len(), 1);
    }

    #[test]
    fn sale_without_staff_has_null_attribution() {
        // Venta de TPV sin profesional: staff_id NULL en cabecera y evento; sin evento extra.
        let items = json!([{ "product_name": "Café", "price": 121, "quantity": 1, "tax_rate": 21.0 }]);
        let out = complete_sale_pure(input(items, 4, 200));
        assert_eq!(out.operations[1].params["staff_id"], Value::Null);
        assert_eq!(out.events.len(), 1);
        assert_eq!(out.events[0].payload["staff_id"], Value::Null);
    }

    #[test]
    fn appointment_emits_created_from_appointment_event() {
        // Cita→venta: con appointment_id se emite el segundo evento de traza (aditivo).
        let new_ids: Vec<Value> = (0..4).map(|i| json!(format!("id-{i}"))).collect();
        let inp = json!({
            "payload": {
                "items": [{ "product_name": "Tinte", "price": 4500, "quantity": 1, "tax_rate": 21.0, "is_service": true }],
                "tax_included": true, "amount_tendered": 0,
                "staff_id": "staff-3", "appointment_id": "appt-99", "customer_id": "cust-1", "customer_name": "Ana"
            },
            "context": { "hub_id": "h1", "current_user_id": "u1", "now": "2026-05-31T10:00:00+00:00", "new_ids": new_ids }
        });
        let out = complete_sale_pure(inp);
        // header guarda appointment_id + staff_id.
        assert_eq!(out.operations[1].params["appointment_id"], json!("appt-99"));
        assert_eq!(out.operations[1].params["staff_id"], json!("staff-3"));
        // Dos eventos: sale.completed + sales.sale.created_from_appointment.
        assert_eq!(out.events.len(), 2);
        assert_eq!(out.events[0].name, "sale.completed");
        let conv = &out.events[1];
        assert_eq!(conv.name, "sales.sale.created_from_appointment");
        assert_eq!(conv.payload["appointment_id"], json!("appt-99"));
        assert_eq!(conv.payload["staff_id"], json!("staff-3"));
        assert_eq!(conv.payload["sale_id"], json!("id-0"));
    }

    #[test]
    fn unknown_id_falls_back_to_payload_hint_when_no_catalog() {
        // Sin context.reads (host antiguo / dep no resuelta): se usa el tax_rate del payload.
        // 100.00€ neto, IVA 10% del preview → 10.00€.
        let items = json!([
            { "product_name": "Agua", "price": 10000, "quantity": 1, "tax_rate_id": "r-10", "tax_rate": 10.0 }
        ]);
        // input() NO inyecta reads → catálogo vacío. tax_included=true (default del helper).
        let inp = json!({
            "payload": { "items": items, "tax_included": false, "amount_tendered": 0 },
            "context": { "hub_id": "h1", "now": "2026-05-31T10:00:00+00:00",
                "new_ids": [json!("id-0"), json!("id-1"), json!("id-2"), json!("id-3")] }
        });
        let out = complete_sale_pure(inp);
        let line = &out.operations[2].params;
        assert_eq!(line["tax_rate"], json!(10.0)); // fallback al preview del payload
        assert_eq!(line["tax_amount"], json!(1000));
    }
}
