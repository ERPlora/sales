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
//! IMPUESTO SERVER-AUTHORITATIVE (ADR-0085 — keystone, supersede el link `tax_rate_id` de ADR-0066):
//! * El POS manda por línea un `tax_category_key` (la categoría fiscal del producto, p.ej.
//!   `restaurant.food`) y, como pista de **preview**, un `tax_rate` (% resuelto en cliente). **La
//!   autoridad del % es este handler**: por cada línea resuelve la REGLA de tipo desde el **catálogo
//!   de confianza** que el runtime pre-carga en `context.reads["taxes.rules.list"]` (declarado como
//!   `reads`, gateado por `depends_on:["taxes"]`), usando el **país/región del hub** que el runtime
//!   inyecta en `context.country_code`/`context.region_code` (identidad fiscal de `hub_settings`,
//!   ADR-0085) — NO el país del cliente, que no es de confianza. El `tax_rate` del cliente se
//!   **ignora** si la línea se resuelve por catálogo.
//! * **Componentes (multi-impuesto, "IVA 21 + RE 5,2")**: la regla RAÍZ (parent_id vacío) que matchea
//!   país+categoría+vigencia es el tipo principal; sus **componentes** son filas con
//!   `parent_id == raíz.id`. Cada componente (raíz incluida) aporta su `rate_pct` sobre la **misma
//!   base**; el `tax_breakdown` lleva **una clave por tasa**. Réplica de `taxes::rule_components`.
//! * **Snapshot inmutable de la línea (ADR-0085)**: cada línea congela `tax_category_key`,
//!   `tax_rate` (= tax_rate_pct combinada), `tax_country_code`, `tax_region_code`, `tax_rule_id`
//!   (id de la regla raíz, nullable). Una factura ya emitida no cambia aunque cambie el IVA.
//! * **Backward-compat / graceful**: sin `context.reads`, o categoría ausente/sin regla → se cae al
//!   `tax_rate` del payload si viene; si no, 0%. Nunca rompe la venta. Respeta `tax_included`.

use erplora_guest_sdk::money;
use rust_decimal::prelude::FromPrimitive;
use rust_decimal::Decimal;
use std::str::FromStr;
use erplora_guest_sdk::{Event, Operation, Output};
use serde_json::{json, Map, Value};

#[cfg(feature = "guest")]
use extism_pdk::*;

#[cfg(feature = "guest")]
#[plugin_fn]
pub fn complete_sale(input: Json<erplora_guest_sdk::Input>) -> FnResult<Json<Output>> {
    Ok(Json(complete_sale_pure(input.into_inner().into_value())))
}

/// ADR-0141: abre un pedido MUTABLE (`order`). Ver `open_order_pure`.
#[cfg(feature = "guest")]
#[plugin_fn]
pub fn open_order(input: Json<erplora_guest_sdk::Input>) -> FnResult<Json<Output>> {
    Ok(Json(open_order_pure(input.into_inner().into_value())))
}

/// Redondeo a la unidad mínima. **No decide el modo**: delega en `guest_sdk::money::round`, que es
/// EL redondeo del hub (HALF_UP, ADR-0123 §4 — la única regla de redondeo monetario escrita en
/// Derecho español: art. 11 de la Ley 46/1998 del euro).
///
/// Este handler traía su propio half-even simulado con un épsilon sobre `f64`
/// (`(diff - 0.5).abs() < 1e-9`), copiado byte a byte en otros cuatro módulos. Ya no.
fn round_cents(x: f64) -> i64 {
    money::round(Decimal::from_f64(x).unwrap_or(Decimal::ZERO))
}

/// Lee un importe del payload, en unidades mínimas. Delega en `guest_sdk::money::from_json`.
fn as_cents(v: &Value, d: i64) -> i64 {
    money::from_json(v, d)
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
/// `context.reads["taxes.rules.list"]` (ADR-0085). El contrato exacto que asumimos: puede venir
/// (a) como **array directo** `[ {…}, … ]`, o (b) envuelto como **`{"rows":[…]}`** (forma paginada
/// del list-engine). Cualquier otra forma → catálogo vacío (degrada a fallback de payload).
fn load_rule_catalog(context: &Value) -> Vec<&Value> {
    let Some(node) = context.get("reads").and_then(|r| r.get("taxes.rules.list")) else {
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

/// ¿Es una regla RAÍZ (no un componente)? `parent_id` vacío/NULL.
fn rule_is_root(rule: &Value) -> bool {
    field(rule, "parent_id").is_empty()
}

/// ¿Está la regla vigente en `date` (YYYY-MM-DD)? Fechas ISO comparan como string.
fn rule_valid_on(rule: &Value, date: &str) -> bool {
    if date.is_empty() {
        return true;
    }
    let from = field(rule, "valid_from");
    let until = field(rule, "valid_to");
    (from.is_empty() || from.as_str() <= date) && (until.is_empty() || until.as_str() >= date)
}

/// Clave de desglose para una tasa: "%.2f" del `rate_pct` (p.ej. 21.0 → "21.00").
fn rate_key(rate_pct: f64) -> String {
    format!("{:.2}", rate_pct)
}

/// El tipo resuelto para una línea (ADR-0085): el id de la regla raíz (para el snapshot) y sus
/// componentes a aplicar (raíz + hijos). `rule_id` vacío = no se resolvió por catálogo (fallback).
struct ResolvedTax {
    rule_id: String,
    components: Vec<TaxComponent>,
}

/// Resuelve la regla RAÍZ aplicable a `(cc, rc, cat, date)` en el catálogo de confianza
/// (ADR-0085). Precedencia: región exacta → regla de país (región vacía/NULL). Dentro de un nivel,
/// prefiere la `valid_from` más reciente, luego `id` ascendente. Réplica de `taxes::resolve_root`.
fn resolve_root<'a>(rules: &[&'a Value], cc: &str, rc: &str, cat: &str, date: &str) -> Option<&'a Value> {
    let eligible: Vec<&Value> = rules
        .iter()
        .copied()
        .filter(|r| {
            rule_is_root(r)
                && rate_is_active(r)
                && rule_valid_on(r, date)
                && field(r, "country_code").eq_ignore_ascii_case(cc)
                && field(r, "tax_category_key") == cat
        })
        .collect();
    let pick = |rows: Vec<&'a Value>| -> Option<&'a Value> {
        let mut rows = rows;
        rows.sort_by(|a, b| {
            field(b, "valid_from")
                .cmp(&field(a, "valid_from"))
                .then_with(|| field(a, "id").cmp(&field(b, "id")))
        });
        rows.first().copied()
    };
    if !rc.is_empty() {
        if let Some(r) = pick(eligible.iter().copied().filter(|r| field(r, "region_code").eq_ignore_ascii_case(rc)).collect()) {
            return Some(r);
        }
    }
    pick(eligible.iter().copied().filter(|r| field(r, "region_code").is_empty()).collect())
        .or_else(|| pick(eligible.clone()))
}

/// Resuelve los componentes de impuesto de una línea (ADR-0085), **server-authoritative**:
///
/// 1. Si la línea trae `tax_category_key` y hay una regla raíz que matchee país (del CONTEXTO),
///    región y vigencia → la raíz + sus componentes (filas con `parent_id == raíz.id`, activas y
///    vigentes), cada una con su `rate_pct`. Ignora el `tax_rate` que mandó el cliente.
/// 2. Si no hay catálogo, o categoría ausente/sin regla → **fallback graceful** al `tax_rate` del
///    payload (preview del cliente) si viene; si no, 0%. Un solo componente, `rule_id` vacío.
fn resolve_line_tax(item: &Value, rules: &[&Value], cc: &str, rc: &str, date: &str) -> ResolvedTax {
    let cat = field(item, "tax_category_key");
    if !cat.is_empty() {
        if let Some(root) = resolve_root(rules, cc, rc, &cat, date) {
            let root_id = field(root, "id");
            let mut children: Vec<&Value> = rules
                .iter()
                .copied()
                .filter(|r| !field(r, "id").is_empty() && field(r, "parent_id") == root_id && rate_is_active(r) && rule_valid_on(r, date))
                .collect();
            children.sort_by_key(|r| field(r, "id"));
            let mut comps: Vec<TaxComponent> = Vec::with_capacity(children.len() + 1);
            let root_pct = as_f64(root.get("rate_pct").unwrap_or(&Value::Null), 0.0);
            comps.push(TaxComponent { rate_pct: root_pct, rate_key: rate_key(root_pct) });
            for c in children {
                let pct = as_f64(c.get("rate_pct").unwrap_or(&Value::Null), 0.0);
                comps.push(TaxComponent { rate_pct: pct, rate_key: rate_key(pct) });
            }
            return ResolvedTax { rule_id: root_id, components: comps };
        }
    }
    // Backward-compat / graceful: catálogo ausente o categoría sin regla → preview del cliente.
    let pct = item.get("tax_rate").map(|v| as_f64(v, 0.0)).unwrap_or(0.0);
    ResolvedTax { rule_id: String::new(), components: vec![TaxComponent { rate_pct: pct, rate_key: rate_key(pct) }] }
}

/// Día ISO `YYYY-MM-DD` de `now` (para la vigencia de las reglas).
fn iso_date(now: &str) -> String {
    now.chars().take(10).collect()
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

    // Identidad fiscal del hub (ADR-0085): país/región DEL CONTEXTO (hub_settings, inyectado por el
    // runtime — no del cliente). Con ellos + la categoría de la línea se resuelve la regla de tipo.
    let cc = context.get("country_code").map(as_str).unwrap_or_default();
    let rc = context.get("region_code").map(as_str).unwrap_or_default();
    let date = iso_date(&now);

    // Catálogo fiscal de confianza pre-cargado por el runtime (ADR-0085, reads taxes.rules.list).
    // Vacío si el runtime no inyectó reads (host antiguo / dependencia no resuelta) → fallback graceful.
    let catalog = load_rule_catalog(&context);

    let mut subtotal: i64 = 0; // céntimos
    let mut gross: i64 = 0; // céntimos (CON descuento global ya prorrateado)
    let mut gross_pre_disc: i64 = 0; // céntimos (sin descuento global → discount_amount)
    let mut gift_total: i64 = 0; // céntimos: coste de las invitaciones (para el arqueo, ADR-comp)
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
        // ADR-0085: resuelve el impuesto por CATEGORÍA desde el catálogo de confianza
        // (server-authoritative, raíz + componentes), con país/región del contexto y fallback
        // graceful al `tax_rate` del payload. El cliente NO es autoridad del %.
        let resolved = resolve_line_tax(item, &catalog, &cc, &rc, &date);
        let components = &resolved.components;
        // Tasa combinada que persistimos en la línea (== suma de componentes; para un tipo
        // simple es su propio %). Es la cifra que ve invoice/listeners en `tax_rate`.
        let combined_pct: f64 = components.iter().map(|c| c.rate_pct).sum();
        // INVITACIÓN/REGALO (comp): una línea marcada `is_gift` NO se cobra (net/tax/total = 0) y no
        // entra en el desglose de IVA (base 0). Acumula su COSTE (a coste, decisión del humano) en
        // `gift_total` para el arqueo "Invitaciones". Sigue descontando stock (el evento lleva qty).
        let is_gift = item.get("is_gift").map(as_bool).unwrap_or(false);
        // DESCUENTO GLOBAL prorrateado a la LÍNEA (sales#33): factor multiplicativo con el
        // descuento propio de la línea. Así el snapshot fiscal por línea (net/tax) YA lleva el
        // descuento y TODO lo que deriva de él —desglose por tipo, evento `sale.completed`,
        // factura de `invoice`— declara lo COBRADO. Antes el descuento solo tocaba `total` y la
        // AEAT recibía la base sin descontar (cliente paga 4,50 €, factura decía 5,00 €).
        // La columna `discount_percent` de la línea conserva SOLO el suyo (el global va en el header).
        let eff_disc = 100.0 * (1.0 - (1.0 - line_disc / 100.0) * (1.0 - sale_disc / 100.0));
        let (t, parts) = if is_gift {
            let cost = as_cents(item.get("cost").unwrap_or(&Value::Null), 0);
            gift_total += round_cents(cost as f64 * qty);
            (LineTotals { net: 0, tax: 0, line: 0 }, Vec::<(String, i64, i64)>::new())
        } else {
            calc_line_components(unit_price, qty, eff_disc, tax_incl, components)
        };
        // Bruto SIN descuento global (mismo cálculo con solo el descuento de línea): la resta de
        // ambos brutos es el `discount_amount` que ve el cliente en el ticket.
        gross_pre_disc += if is_gift || sale_disc <= 0.0 {
            t.line
        } else {
            calc_line_components(unit_price, qty, line_disc, tax_incl, components).0.line
        };
        // `tax_total` YA NO se acumula por línea: la cuota que se DECLARA sale del desglose, una
        // sola vez por tipo impositivo (ADR-0123 §4). `t.tax` queda como informativo de la línea.
        subtotal += t.net; gross += t.line;

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
        p.insert("tax_rate".into(), json!(combined_pct)); // tasa % combinada (REAL) == tax_rate_pct
        p.insert("tax_class_name".into(), json!(str_or(item, "tax_class_name", "")));
        // Invitación/regalo (comp): la línea conserva unit_price (display, tachado en el ticket) pero
        // net/tax/total = 0; `gift_reason` da el motivo (cortesía/error cocina/fidelización…).
        p.insert("is_gift".into(), json!(is_gift as i64));
        p.insert("gift_reason".into(), json!(if is_gift { str_or(item, "gift_reason", "") } else { String::new() }));
        // ── Snapshot fiscal inmutable de la línea (ADR-0085) ──
        p.insert("tax_category_key".into(), json!(field(item, "tax_category_key")));
        p.insert("tax_country_code".into(), json!(cc));
        p.insert("tax_region_code".into(), json!(rc));
        // tax_rule_id NULL si la línea no resolvió por catálogo (fallback al preview del cliente).
        p.insert(
            "tax_rule_id".into(),
            if resolved.rule_id.is_empty() { Value::Null } else { json!(resolved.rule_id) },
        );
        p.insert("net_amount".into(), json!(t.net)); // céntimos
        p.insert("tax_amount".into(), json!(t.tax)); // céntimos
        p.insert("line_total".into(), json!(t.line)); // céntimos
        ops.push(Operation::sql("sales._insert_line", p));
    }

    // El descuento global YA está prorrateado en las líneas: `gross` es lo cobrado y el
    // `discount_amount` (informativo, para el ticket) es la diferencia con el bruto sin descuento.
    let discount_amount: i64 = gross_pre_disc - gross;
    let total = gross; // céntimos
    let tendered = as_cents(payload.get("amount_tendered").unwrap_or(&Value::Null), 0); // céntimos
    let change = if tendered - total > 0 { tendered - total } else { 0 };

    // EL DESGLOSE SE CIERRA AQUÍ: la cuota se calcula UNA sola vez por TIPO IMPOSITIVO, sobre la
    // base AGREGADA — no sumando las cuotas ya redondeadas de cada línea (ADR-0123 §4).
    //
    // Es lo único que el XML de VeriFactu sabe representar (`DetalleDesglose` es por tipo, máx. 12
    // — no hay detalle por artículo) y evita el error acumulado que censura el TEAC (RG 2233/2022).
    // Antes, 7 chicles de 0,05 € al 21 % declaraban base 28 / cuota 7 — pero 28 × 21 % = 5,88 → 6,
    // NO 7: el desglose no cuadraba con `cuota = base × tipo` y solo colaba por la tolerancia de
    // ±10 € de la AEAT. Ahora declara 29 / 6, que sí cuadra.
    //
    // (sales#33: las bases del desglose ya llegan CON el descuento global — prorrateado por
    // línea arriba — así que aquí no hay nada que descontar: solo cerrar la cuota por tipo.)
    let mut tb = Map::new();
    let mut tax_total_declarado: i64 = 0;
    for (k, base, _tax_por_linea) in &breakdown {
        let rate = Decimal::from_str(k).unwrap_or(Decimal::ZERO);
        let cuota = money::percent_of(*base, rate);
        tax_total_declarado += cuota;
        tb.insert(k.clone(), json!({ "base": *base, "tax": cuota }));
    }
    let tax_total = tax_total_declarado;
    let tax_breakdown_json = Value::Object(tb).to_string();

    // Tipo de documento fiscal (ADR-0140): 'invoice' = factura completa (→ F1), 'ticket' =
    // simplificada (→ F2). Se fija ATÓMICAMENTE aquí (una sola escritura) en vez del UPDATE retro
    // `sales.set_document_type`, que mutaba la fila ya emitida —violando la inmutabilidad fiscal— y
    // no llegaba a `sale.completed` (por eso `invoice` hardcodeaba F2). Normalización defensiva:
    // solo 'invoice' es completa; cualquier otro valor → simplificada.
    let document_type = if str_or(&payload, "document_type", "ticket") == "invoice" {
        "invoice"
    } else {
        "ticket"
    };

    let mut h = Map::new();
    h.insert("sale_id".into(), json!(sale_id));
    h.insert("day".into(), json!(day));
    h.insert("status".into(), json!(str_or(&payload, "status", "completed")));
    h.insert("document_type".into(), json!(document_type));
    h.insert("subtotal".into(), json!(subtotal));
    h.insert("tax_amount".into(), json!(tax_total));
    h.insert("discount_amount".into(), json!(discount_amount));
    h.insert("discount_percent".into(), json!(sale_disc));
    h.insert("total".into(), json!(total));
    // Invitaciones (comp): coste total de las líneas regalo de esta venta, para el arqueo (a coste).
    h.insert("gift_total".into(), json!(gift_total));
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
            // Mismo resolver server-authoritative que arriba (ADR-0085): el evento lleva el %
            // y los net/tax RESUELTOS del catálogo, no la pista del cliente, para que
            // invoice/inventory reaccionen con cifras de confianza.
            let resolved = resolve_line_tax(it, &catalog, &cc, &rc, &date);
            let combined_pct: f64 = resolved.components.iter().map(|c| c.rate_pct).sum();
            // Invitación: net/tax = 0 en el evento (invoice/customers no facturan la cortesía). Sigue
            // descontando stock (inventory usa product_id+quantity). Mismo gating que arriba.
            let it_gift = it.get("is_gift").map(as_bool).unwrap_or(false);
            // El descuento GLOBAL también viaja prorrateado en el evento (sales#33): `invoice`
            // construye la factura de estos net/tax — sin esto declararía la base sin descontar.
            let eff_disc = 100.0 * (1.0 - (1.0 - line_disc / 100.0) * (1.0 - sale_disc / 100.0));
            let (t, _parts) = if it_gift {
                (LineTotals { net: 0, tax: 0, line: 0 }, Vec::<(String, i64, i64)>::new())
            } else {
                calc_line_components(unit_price, qty, eff_disc, tax_incl, &resolved.components)
            };
            json!({
                "product_id": it.get("product_id").cloned().unwrap_or(Value::Null),
                "product_name": as_str(it.get("product_name").unwrap_or(&Value::Null)),
                "quantity": qty,
                "unit_price": unit_price,           // céntimos (bruto/unitario tal cual lo envió la UI)
                "tax_rate": combined_pct,           // tasa % resuelta (server-authoritative)
                "tax_category_key": field(it, "tax_category_key"), // categoría fiscal congelada (ADR-0085)
                "net_amount": t.net,                // céntimos: base imponible YA extraída (0 si invitación)
                "tax_amount": t.tax,                // céntimos: IVA YA calculado (0 si invitación)
                "is_gift": it_gift,                 // invitación/regalo (comp)
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
        // Tipo de documento fiscal (ADR-0140): 'invoice' → factura completa (F1), 'ticket' →
        // simplificada (F2). `invoice.create_from_sale` lo lee para elegir la serie/tipo en vez de
        // hardcodear F2. Viaja atómicamente con la venta (ya no hay `set_document_type` retro).
        "document_type": document_type,
        "total": total,
        "subtotal": subtotal,
        "tax_amount": tax_total,
        "gift_total": gift_total, // coste de invitaciones (céntimos) → cash_register lo suma al arqueo

        "items_count": items.len(),
        "items": event_items,
        "customer_id": payload.get("customer_id").cloned().unwrap_or(Value::Null),
        "customer_name": str_or(&payload, "customer_name", ""),
        // Snapshot fiscal del cliente asignado (ADR-0132): `invoice` lo copia a la factura para
        // que una venta de TPV con cliente salga CON NIF y dirección. Vacío = venta anónima.
        "customer_tax_id": str_or(&payload, "customer_tax_id", ""),
        "customer_address": str_or(&payload, "customer_address", ""),
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

    // ADR-0141: si la venta nace de un pedido (`order_id`) y es el cobro FINAL (no un split
    // parcial), marca el pedido completado (open → completed). En split-bill (`keep_order_open`)
    // se deja abierto para los siguientes cobros; así 1 order → N sale, ligadas por `order_id`.
    let order_ref = payload.get("order_id").cloned().unwrap_or(Value::Null);
    let keep_open = payload.get("keep_order_open").map(as_bool).unwrap_or(false);
    if !order_ref.is_null() && !as_str(&order_ref).is_empty() && !keep_open {
        let mut c = Map::new();
        c.insert("order_id".into(), order_ref);
        ops.push(Operation::sql("sales._complete_order", c));
    }

    Output { operations: ops, events }
}

/// ADR-0141 (owner: human, en construcción TDD) — abre un `order` **mutable** (estado `open`) con sus
/// líneas materializadas **temprano** (filas reales, no un blob). Es la entidad canónica del pedido;
/// al cobrar producirá 1..N `sale` inmutables (split-bill). `sales` es **agnóstico de la mesa**: NO
/// conoce `table_id` — la asociación mesa↔pedido la OWNea `tables` en `table_session.order_id`.
pub fn open_order_pure(input: Value) -> Output {
    let payload = input.get("payload").cloned().unwrap_or(Value::Null);
    let context = input.get("context").cloned().unwrap_or(Value::Null);
    let empty: Vec<Value> = Vec::new();
    let new_ids = context.get("new_ids").and_then(|v| v.as_array()).unwrap_or(&empty);
    let items = payload.get("items").and_then(|v| v.as_array()).unwrap_or(&empty);
    let order_id = new_ids.first().map(as_str).unwrap_or_default();

    let mut ops: Vec<Operation> = Vec::new();
    // Cabecera del pedido: placeholder; se rellena el total provisional tras recorrer las líneas.
    let header_idx = ops.len();
    ops.push(Operation::sql("sales._insert_order", Map::new()));

    // Líneas materializadas TEMPRANO (filas reales `sales_order_item`). Un `order` es MUTABLE: sus
    // importes son **provisionales** (display en el TPV). La cuota fiscal HALF_UP + el desglose por
    // tipo (ADR-0123/0085) se congelan al COBRAR (`complete_sale`), no al abrir el pedido.
    let mut provisional_total: i64 = 0;
    for (i, item) in items.iter().enumerate() {
        let unit_price = as_cents(item.get("price").unwrap_or(&Value::Null), 0); // céntimos
        let qty = item.get("quantity").map(|v| as_f64(v, 1.0)).unwrap_or(1.0);
        let is_gift = item.get("is_gift").map(as_bool).unwrap_or(false);
        let line_total = if is_gift { 0 } else { round_cents(unit_price as f64 * qty) };
        provisional_total += line_total;

        let line_id = new_ids.get(i + 1).map(as_str).unwrap_or_default();
        let mut p = Map::new();
        p.insert("id".into(), json!(line_id));
        p.insert("order_id".into(), json!(order_id)); // FK al pedido (materialización temprana)
        p.insert("product_id".into(), item.get("product_id").cloned().unwrap_or(Value::Null));
        p.insert("product_name".into(), json!(as_str(item.get("product_name").unwrap_or(&Value::Null))));
        p.insert("product_sku".into(), json!(str_or(item, "product_sku", "")));
        p.insert("quantity".into(), json!(qty)); // cantidad fraccionable (REAL)
        p.insert("unit_price".into(), json!(unit_price)); // céntimos (INTEGER)
        p.insert("is_gift".into(), json!(is_gift as i64));
        p.insert("gift_reason".into(), json!(if is_gift { str_or(item, "gift_reason", "") } else { String::new() }));
        p.insert("line_total".into(), json!(line_total)); // céntimos, provisional (display)
        // El COBRO necesita estos dos y no se re-derivan al reanudar el pedido: la categoría fiscal
        // es la AUTORIDAD del IVA en servidor (ADR-0085) y el coste alimenta el arqueo de
        // invitaciones (gift_total). Sin ellos, un pedido reanudado facturaría con el IVA erróneo.
        p.insert("tax_category_key".into(), json!(str_or(item, "tax_category_key", "")));
        p.insert("cost".into(), json!(as_cents(item.get("cost").unwrap_or(&Value::Null), 0)));
        ops.push(Operation::sql("sales._insert_order_line", p));
    }

    let mut h = Map::new();
    h.insert("id".into(), json!(order_id));
    h.insert("status".into(), json!("open")); // ciclo de vida: open → completed → voided (ADR-0141)
    h.insert("provisional_total".into(), json!(provisional_total)); // céntimos, recalculable
    h.insert("notes".into(), json!(str_or(&payload, "notes", "")));
    h.insert("source_module".into(), json!(str_or(&payload, "source_module", "pos")));
    // created_by/created_at/hub_id los inyecta el SQL desde el contexto (:current_user_id, :now,
    // :hub_id), igual que `_insert_sale` — el WASM no los pasa.
    // NOTA (ADR-0141): el pedido NO persiste `table_id` NI `customer_id`. Esas asociaciones las
    // OWNean sus dueños en junctions (`tables.table_session.order_id`, `customers.customer_order`):
    // una tienda de alimentación vende sin mesas y sin cliente.
    ops[header_idx] = Operation::sql("sales._insert_order", h);

    // Evento para UI en vivo (Outbox → refresh_on): un pedido abierto puede refrescar tickets/KPIs.
    let event = Event::new("sales.order.opened", json!({
        "sender": "sales",
        "order_id": order_id,
        "items_count": items.len(),
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

    // ── ADR-0141 · entidad `order` mutable → `sale` inmutable (en construcción TDD) ──────────────

    #[test]
    fn abrir_un_pedido_crea_un_order_open_con_lineas_materializadas() {
        // ADR-0141: el POS abre un `order` MUTABLE (estado `open`) antes de cobrar. Las líneas se
        // materializan TEMPRANO (filas reales `sales_order_item`, no un blob). El order es la entidad
        // canónica del pedido; al cobrar producirá una o varias `sale` inmutables (split-bill).
        //
        // INVARIANTE CLAVE (el leak que motivó el ADR): `sales` es AGNÓSTICO de la mesa — abrir un
        // pedido NO conoce `table_id`. La asociación mesa↔pedido la OWNea `tables` en su junction
        // `table_session.order_id`, no `sales`.
        let items = json!([
            { "product_name": "Café", "price": 121, "quantity": 2, "tax_rate": 21.0 },
            { "product_name": "Agua", "price": 110, "quantity": 1, "tax_rate": 10.0 }
        ]);
        let out = open_order_pure(input(items, 3, 0));

        // 1) cabecera: un `_insert_order` con estado `open` y el id que da el host (new_ids[0]).
        let header = out.operations.iter().find(|o| o.command == "sales._insert_order")
            .expect("debe insertar el order");
        assert_eq!(header.params["status"], json!("open"), "el pedido nace abierto (mutable)");
        assert_eq!(header.params["id"], json!("id-0"), "id del order = new_ids[0]");

        // 2) líneas materializadas temprano: una fila `_insert_order_line` por artículo, con el FK.
        let lines: Vec<_> = out.operations.iter()
            .filter(|o| o.command == "sales._insert_order_line").collect();
        assert_eq!(lines.len(), 2, "una línea real por artículo (materialización temprana)");
        assert!(lines.iter().all(|l| l.params["order_id"] == json!("id-0")),
                "cada línea cuelga del order_id");

        // 3) INVARIANTE: `sales` no habla el idioma 'mesa'. Nada de `table_id` al abrir un pedido.
        let json_all = serde_json::to_string(&out.operations).unwrap();
        assert!(!json_all.contains("table_id"),
                "abrir un pedido no conoce table_id (la mesa la OWNea `tables`, ADR-0141)");
    }

    #[test]
    fn cobrar_un_pedido_lo_marca_completado_salvo_split_parcial() {
        // ADR-0141 Gate 4: si `complete_sale` nace de un `order_id`, el cobro FINAL marca el pedido
        // completado (intent `sales._complete_order`). En split-bill (`keep_order_open`) NO se marca,
        // para permitir más cobros del mismo pedido → 1 order → N sale.
        let items = json!([{ "product_name": "Menú", "price": 500, "quantity": 1, "tax_rate": 21.0 }]);

        // cobro FINAL de un pedido → aparece el intent de completar, con su order_id.
        let mut inp = input(items.clone(), 3, 500);
        inp["payload"]["order_id"] = json!("ord-1");
        let out = complete_sale_pure(inp);
        assert!(out.operations.iter().any(|o| o.command == "sales._complete_order"
                && o.params["order_id"] == json!("ord-1")),
            "el cobro final marca el pedido completado");

        // SPLIT parcial (keep_order_open) → NO se completa el pedido (queda abierto para más cobros).
        let mut inp2 = input(items, 3, 500);
        inp2["payload"]["order_id"] = json!("ord-1");
        inp2["payload"]["keep_order_open"] = json!(true);
        let out2 = complete_sale_pure(inp2);
        assert!(!out2.operations.iter().any(|o| o.command == "sales._complete_order"),
            "un split parcial deja el pedido abierto");

        // venta sin pedido (TPV suelto) → no toca ningún pedido.
        let out3 = complete_sale_pure(input(
            json!([{ "product_name": "X", "price": 100, "quantity": 1, "tax_rate": 21.0 }]), 3, 100));
        assert!(!out3.operations.iter().any(|o| o.command == "sales._complete_order"),
            "una venta sin order_id no toca ningún pedido");
    }

    #[test]
    fn el_redondeo_ahora_es_HALF_UP_y_vive_en_el_SDK() {
        // ANTES: `round_cents` propio, half-even simulado con un épsilon sobre f64 → 12,5 se iba
        // a 12 (al par). AHORA: `money::round` del SDK, HALF_UP → 13.
        //
        // Ninguna norma española fija el modo de redondeo de la cuota de IVA (LIVA, RD 1619/2012,
        // RD 1007/2023, Orden HAC/1177/2024: cero menciones; el TJUE lo deja a cada Estado y
        // España no ejerció la opción). La ÚNICA regla de redondeo monetario escrita en Derecho
        // español es half-up: art. 11 de la Ley 46/1998 del euro. Ver ADR-0123 §4.
        assert_eq!(round_cents(12.5), 13, "half-even habría dicho 12");
        assert_eq!(round_cents(13.5), 14);
        // 100 € con IVA 21 % incl: 10000/1,21 = 8264,46… → 8264 (sin empate; no cambia).
        assert_eq!(round_cents(10000.0 / 1.21), 8264);
    }

    #[test]
    fn el_desglose_declara_la_cuota_POR_TIPO_no_sumando_las_de_cada_linea() {
        // EL CAMBIO DE ADR-0123 §4, con el caso donde de verdad se nota.
        //
        // Siete chicles de 0,05 € (IVA 21 % incluido). El cliente paga 0,35 € — eso NO cambia.
        // Lo que cambia es lo que se DECLARA a la AEAT:
        //
        //   · ANTES (redondeando por LÍNEA): base = round(5/1,21) = 4 cts, siete veces → base 28,
        //     cuota 7. Pero 28 × 21 % = 5,88 → 6, NO 7: el desglose era INCOHERENTE con
        //     `cuota = base × tipo` y solo colaba por la tolerancia de ±10 € de la AEAT.
        //   · AHORA (una vez por TIPO, sobre la base agregada): cuota = round(28 × 21 %) = 6.
        let items = json!((0..7).map(|_| json!({
            "product_name": "Chicle", "price": 5, "quantity": 1, "tax_rate": 21.0
        })).collect::<Vec<_>>());
        let out = complete_sale_pure(input(items, 9, 100));
        let h = &out.operations[1].params;

        assert_eq!(h["total"], json!(35), "lo que paga el cliente no se mueve");

        let bd: Value = serde_json::from_str(h["tax_breakdown"].as_str().unwrap()).unwrap();
        assert_eq!(bd.as_object().unwrap().len(), 1, "un DetalleDesglose por TIPO, no por artículo");
        let d = &bd["21.00"];
        let (base, cuota) = (d["base"].as_i64().unwrap(), d["tax"].as_i64().unwrap());
        // LA PROPIEDAD QUE ANTES NO SE CUMPLÍA: la cuota declarada ES base × tipo.
        assert_eq!(cuota, (base as f64 * 0.21).round() as i64,
                   "la cuota declarada debe ser coherente con base × tipo");
        assert_eq!(h["tax_amount"], json!(cuota), "el header declara la cuota del desglose");
    }

    #[test]
    fn el_descuento_global_baja_la_BASE_declarada_no_solo_el_total() {
        // sales#33 (QA restaurante 07-16): venta de 5,00 € (IVA 21 % incl) con descuento GLOBAL
        // del 10 % → el cliente paga 4,50 €, pero el desglose declaraba base 413 + cuota 87
        // = 5,00 €: se SOBRE-DECLARABA IVA a la AEAT (impuesto por dinero no ingresado).
        //
        // El descuento global debe prorratearse a la BASE de cada tipo ANTES de extraer la
        // cuota (ADR-0123 §4, HALF_UP del SDK):
        //   base 413 − 10 % (41) = 372 · cuota = 372 × 21 % = 78,12 → 78 · 372 + 78 = 450 ✓
        let mut inp = input(json!([{ "product_name": "Menú", "price": 500, "quantity": 1, "tax_rate": 21.0 }]), 3, 450);
        inp["payload"]["discount_percent"] = json!(10.0);
        let out = complete_sale_pure(inp);
        let h = &out.operations[1].params;

        assert_eq!(h["total"], json!(450), "lo que paga el cliente no cambia");
        assert_eq!(h["discount_amount"], json!(50));

        let bd: Value = serde_json::from_str(h["tax_breakdown"].as_str().unwrap()).unwrap();
        let d = &bd["21.00"];
        assert_eq!(d["base"], json!(372), "la base declarada lleva el descuento prorrateado");
        assert_eq!(d["tax"], json!(78), "cuota = base descontada × tipo");
        // La propiedad que la AEAT puede cotejar: lo declarado suma lo COBRADO.
        assert_eq!(d["base"].as_i64().unwrap() + d["tax"].as_i64().unwrap(), 450);
        assert_eq!(h["tax_amount"], json!(78), "el header declara la cuota del desglose");
        assert_eq!(h["subtotal"], json!(372), "el subtotal declarado también baja");

        // El descuento va PRORRATEADO A LA LÍNEA (la prescripción de la issue): el snapshot
        // fiscal persistido y el evento `sale.completed` (del que `invoice` construye la
        // factura) llevan net/tax YA descontados — sin esto la factura seguiría declarando
        // la base sin descuento aunque el header estuviera bien.
        let line = &out.operations[2].params;
        assert_eq!(line["net_amount"], json!(372), "la línea persiste la base descontada");
        assert_eq!(line["line_total"], json!(450));
        assert_eq!(line["unit_price"], json!(500), "el unitario sigue siendo el bruto (display)");
        let ev = &out.events[0];
        let it = &ev.payload["items"][0];
        assert_eq!(it["net_amount"], json!(372), "el evento (→ invoice) lleva la base descontada");
        assert_eq!(it["tax_amount"], json!(78));
    }

    #[test]
    fn sin_descuento_global_el_desglose_no_se_mueve() {
        // Guardarraíl del fix de sales#33: con discount_percent ausente/0 todo queda como estaba.
        let items = json!([{ "product_name": "Menú", "price": 500, "quantity": 1, "tax_rate": 21.0 }]);
        let out = complete_sale_pure(input(items, 3, 500));
        let h = &out.operations[1].params;
        let bd: Value = serde_json::from_str(h["tax_breakdown"].as_str().unwrap()).unwrap();
        assert_eq!(bd["21.00"]["base"], json!(413));
        assert_eq!(bd["21.00"]["tax"], json!(87));
        assert_eq!(h["subtotal"], json!(413));
        assert_eq!(h["total"], json!(500));
    }

    #[test]
    fn el_tipo_de_documento_es_atomico_y_viaja_en_el_evento() {
        // ADR-0140: el tipo de documento (ticket|invoice) se fija ATÓMICAMENTE al completar la
        // venta —no con un UPDATE retro (`sales.set_document_type`) que mutaba la fila ya emitida,
        // violando la inmutabilidad fiscal— y VIAJA en `sale.completed` para que
        // `invoice.create_from_sale` decida F1 (completa) vs F2 (simplificada) sin re-consultar la
        // venta (antes hardcodeaba F2 porque el tipo no llegaba en el evento).
        let items = json!([{ "product_name": "Menú", "price": 500, "quantity": 1, "tax_rate": 21.0 }]);
        let mut inp = input(items, 3, 500);
        inp["payload"]["document_type"] = json!("invoice");
        let out = complete_sale_pure(inp);

        // 1) la cabecera de la venta persiste el tipo en la MISMA inserción (atómico).
        assert_eq!(out.operations[1].params["document_type"], json!("invoice"),
                   "la venta persiste el tipo al insertarse, sin UPDATE posterior");
        // 2) el evento lo lleva → invoice deja de hardcodear F2.
        assert_eq!(out.events[0].payload["document_type"], json!("invoice"),
                   "sale.completed lleva el tipo de documento");
    }

    #[test]
    fn el_tipo_de_documento_por_defecto_es_ticket() {
        // Sin `document_type` explícito → simplificada (ticket/F2), el caso mayoritario del TPV.
        // Cualquier valor no reconocido cae también a 'ticket' (normalización defensiva fiscal).
        let items = json!([{ "product_name": "Café", "price": 121, "quantity": 1, "tax_rate": 21.0 }]);
        let out = complete_sale_pure(input(items, 3, 121));
        assert_eq!(out.operations[1].params["document_type"], json!("ticket"));
        assert_eq!(out.events[0].payload["document_type"], json!("ticket"));

        let mut inp = input(json!([{ "product_name": "Té", "price": 100, "quantity": 1, "tax_rate": 10.0 }]), 3, 100);
        inp["payload"]["document_type"] = json!("garbage");
        let out2 = complete_sale_pure(inp);
        assert_eq!(out2.operations[1].params["document_type"], json!("ticket"),
                   "un valor no reconocido se normaliza a la simplificada");
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

    // ── ADR-0085: resolución server-side del impuesto por categoría ───────────

    /// Construye un input con catálogo de REGLAS pre-cargado en `context.reads["taxes.rules.list"]`
    /// + país/región del hub en el contexto (identidad fiscal, ADR-0085).
    /// `reads_shape` = "array" → array directo; "rows" → `{"rows":[…]}`.
    fn input_with_rules(items: Value, ids: usize, rules: Value, reads_shape: &str, cc: &str, rc: &str) -> Value {
        let new_ids: Vec<Value> = (0..ids).map(|i| json!(format!("id-{i}"))).collect();
        let rules_node = if reads_shape == "rows" { json!({ "rows": rules }) } else { rules };
        json!({
            "payload": { "items": items, "tax_included": false, "amount_tendered": 0, "customer_name": "Bar Manolo" },
            "context": {
                "hub_id": "h1", "current_user_id": "u1", "now": "2026-05-31T10:00:00+00:00",
                "new_ids": new_ids, "country_code": cc, "region_code": rc,
                "reads": { "taxes.rules.list": rules_node }
            }
        })
    }

    #[test]
    fn line_resolves_rate_from_catalog_ignoring_client_hint() {
        // El cliente manda tax_rate=99 (mentira); la regla ES/product.generic dice 21%. El servidor
        // DEBE usar 21%, no 99%. 100.00€ neto → IVA 21.00€. El snapshot congela categoría + regla.
        let items = json!([
            { "product_name": "Café", "price": 10000, "quantity": 1, "tax_category_key": "product.generic", "tax_rate": 99.0 }
        ]);
        let rules = json!([
            { "id": "r-21", "country_code": "ES", "region_code": null, "tax_category_key": "product.generic", "rate_pct": 21.0, "tax_type": "vat", "parent_id": null, "is_active": 1 },
            { "id": "r-10", "country_code": "ES", "region_code": null, "tax_category_key": "restaurant.food", "rate_pct": 10.0, "tax_type": "vat", "parent_id": null, "is_active": 1 }
        ]);
        let out = complete_sale_pure(input_with_rules(items, 4, rules, "array", "ES", ""));
        let line = &out.operations[2].params;
        assert_eq!(line["tax_rate"], json!(21.0));    // % del catálogo, no el del cliente
        assert_eq!(line["net_amount"], json!(10000)); // 100.00€
        assert_eq!(line["tax_amount"], json!(2100));  // 21.00€ (no 99%)
        // snapshot ADR-0085
        assert_eq!(line["tax_category_key"], json!("product.generic"));
        assert_eq!(line["tax_country_code"], json!("ES"));
        assert_eq!(line["tax_rule_id"], json!("r-21"));
        let s = &out.operations[1].params;
        assert_eq!(s["tax_amount"], json!(2100));
        let tb: Value = serde_json::from_str(s["tax_breakdown"].as_str().unwrap()).unwrap();
        assert_eq!(tb["21.00"]["tax"], json!(2100));
        assert!(tb.get("99.00").is_none());
    }

    #[test]
    fn line_resolves_rate_from_catalog_rows_shape() {
        // Mismo caso pero el catálogo viene envuelto como {"rows":[…]} (forma paginada).
        let items = json!([
            { "product_name": "Café", "price": 10000, "quantity": 1, "tax_category_key": "product.generic" }
        ]);
        let rules = json!([
            { "id": "r-21", "country_code": "ES", "region_code": null, "tax_category_key": "product.generic", "rate_pct": 21.0, "tax_type": "vat", "parent_id": null, "is_active": 1 }
        ]);
        let out = complete_sale_pure(input_with_rules(items, 4, rules, "rows", "ES", ""));
        let line = &out.operations[2].params;
        assert_eq!(line["tax_rate"], json!(21.0));
        assert_eq!(line["tax_amount"], json!(2100));
    }

    #[test]
    fn root_plus_components_expand_recargo() {
        // Regla raíz IVA 21 (product.generic ES) + componente Recargo 5,2 (parent_id). Base 100.00€
        // → IVA 21.00€ + RE 5.20€ → tax total 26.20€, line 131.20€.
        let items = json!([
            { "product_name": "Producto RE", "price": 10000, "quantity": 1, "tax_category_key": "product.generic" }
        ]);
        let rules = json!([
            { "id": "r-iva", "country_code": "ES", "region_code": null, "tax_category_key": "product.generic", "rate_pct": 21.0, "tax_type": "vat", "parent_id": null, "is_active": 1 },
            { "id": "c-re",  "country_code": "ES", "region_code": null, "tax_category_key": "product.generic", "rate_pct": 5.2, "tax_type": "surcharge", "parent_id": "r-iva", "is_active": 1 }
        ]);
        let out = complete_sale_pure(input_with_rules(items, 4, rules, "array", "ES", ""));
        let line = &out.operations[2].params;
        assert_eq!(line["net_amount"], json!(10000)); // base 100.00€
        assert_eq!(line["tax_amount"], json!(2620));  // 21.00 + 5.20 = 26.20€
        assert_eq!(line["line_total"], json!(12620)); // 131.20€
        assert_eq!(line["tax_rate"], json!(26.2));    // tasa combinada en la línea
        assert_eq!(line["tax_rule_id"], json!("r-iva"));
        let s = &out.operations[1].params;
        let tb: Value = serde_json::from_str(s["tax_breakdown"].as_str().unwrap()).unwrap();
        assert_eq!(tb["21.00"]["tax"], json!(2100));
        assert_eq!(tb["5.20"]["tax"], json!(520));
        assert_eq!(s["tax_amount"], json!(2620));
    }

    #[test]
    fn region_rule_beats_country_rule() {
        // IGIC Canarias: la regla de región ES-CN (7%) gana a la de país ES (21%) cuando el hub
        // tiene region_code=ES-CN en su identidad fiscal.
        let items = json!([
            { "product_name": "Producto", "price": 10000, "quantity": 1, "tax_category_key": "product.generic" }
        ]);
        let rules = json!([
            { "id": "r-es", "country_code": "ES", "region_code": null, "tax_category_key": "product.generic", "rate_pct": 21.0, "tax_type": "vat", "parent_id": null, "is_active": 1 },
            { "id": "r-cn", "country_code": "ES", "region_code": "ES-CN", "tax_category_key": "product.generic", "rate_pct": 7.0, "tax_type": "igic", "parent_id": null, "is_active": 1 }
        ]);
        let out = complete_sale_pure(input_with_rules(items, 4, rules, "array", "ES", "ES-CN"));
        let line = &out.operations[2].params;
        assert_eq!(line["tax_rule_id"], json!("r-cn"));
        assert_eq!(line["tax_amount"], json!(700));
        assert_eq!(line["tax_region_code"], json!("ES-CN"));
    }

    #[test]
    fn unknown_category_falls_back_to_zero() {
        // Categoría sin regla en el país y SIN tax_rate de preview → 0%, sin romper. rule_id NULL.
        let items = json!([
            { "product_name": "Misterioso", "price": 10000, "quantity": 1, "tax_category_key": "unknown.cat" }
        ]);
        let rules = json!([
            { "id": "r-21", "country_code": "ES", "region_code": null, "tax_category_key": "product.generic", "rate_pct": 21.0, "tax_type": "vat", "parent_id": null, "is_active": 1 }
        ]);
        let out = complete_sale_pure(input_with_rules(items, 4, rules, "array", "ES", ""));
        let line = &out.operations[2].params;
        assert_eq!(line["tax_rate"], json!(0.0));
        assert_eq!(line["net_amount"], json!(10000));
        assert_eq!(line["tax_amount"], json!(0));
        assert_eq!(line["tax_rule_id"], Value::Null);
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
    fn event_carries_customer_fiscal_snapshot_for_invoice() {
        // ADR-0132: si el cajero asigna un cliente en el TPV, sus datos fiscales viajan en
        // sale.completed para que `invoice` emita la factura CON NIF y dirección. Sin esto la
        // factura sale vacía aunque el cliente los tenga en su ficha.
        let new_ids: Vec<Value> = (0..4).map(|i| json!(format!("id-{i}"))).collect();
        let inp = json!({
            "payload": {
                "items": [{ "product_name": "Corte", "price": 2000, "quantity": 1, "tax_rate": 21.0 }],
                "tax_included": true, "amount_tendered": 0,
                "customer_id": "cus-1", "customer_name": "Ana García",
                "customer_tax_id": "12345678Z",
                "customer_address": "Calle Mayor 1, 28013 Madrid, ES"
            },
            "context": { "hub_id": "h1", "current_user_id": "u1", "now": "2026-05-31T10:00:00+00:00", "new_ids": new_ids }
        });
        let out = complete_sale_pure(inp);
        let ev = &out.events[0].payload;
        assert_eq!(ev["customer_id"], json!("cus-1"));
        assert_eq!(ev["customer_name"], json!("Ana García"));
        assert_eq!(ev["customer_tax_id"], json!("12345678Z"));
        assert_eq!(ev["customer_address"], json!("Calle Mayor 1, 28013 Madrid, ES"));
    }

    #[test]
    fn anonymous_sale_carries_no_fiscal_snapshot() {
        // Venta de barra sin cliente: los campos fiscales van vacíos, no heredados.
        let items = json!([{ "product_name": "Café", "price": 121, "quantity": 1, "tax_rate": 21.0 }]);
        let out = complete_sale_pure(input(items, 4, 200));
        assert_eq!(out.events[0].payload["customer_tax_id"], json!(""));
        assert_eq!(out.events[0].payload["customer_address"], json!(""));
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
    fn falls_back_to_payload_hint_when_no_catalog() {
        // Sin context.reads (host antiguo / dep no resuelta): se usa el tax_rate del payload.
        // 100.00€ neto, IVA 10% del preview → 10.00€. rule_id NULL (no resolvió por catálogo).
        let items = json!([
            { "product_name": "Agua", "price": 10000, "quantity": 1, "tax_category_key": "restaurant.drink", "tax_rate": 10.0 }
        ]);
        let inp = json!({
            "payload": { "items": items, "tax_included": false, "amount_tendered": 0 },
            "context": { "hub_id": "h1", "now": "2026-05-31T10:00:00+00:00", "country_code": "ES",
                "new_ids": [json!("id-0"), json!("id-1"), json!("id-2"), json!("id-3")] }
        });
        let out = complete_sale_pure(inp);
        let line = &out.operations[2].params;
        assert_eq!(line["tax_rate"], json!(10.0)); // fallback al preview del payload
        assert_eq!(line["tax_amount"], json!(1000));
        assert_eq!(line["tax_rule_id"], Value::Null);
    }

    #[test]
    fn gift_line_is_free_and_accumulates_cost_in_arqueo() {
        // Invitación: una línea is_gift no se cobra (net/tax/total=0) pero descuenta stock y suma su
        // COSTE en gift_total (arqueo). La otra línea (normal) sí se cobra.
        let items = json!([
            { "product_name": "Café cortesía", "price": 200, "quantity": 1, "tax_category_key": "restaurant.drink",
              "tax_rate": 10.0, "is_gift": true, "gift_reason": "cortesía", "cost": 60 },
            { "product_name": "Tarta", "price": 500, "quantity": 1, "tax_category_key": "restaurant.food", "tax_rate": 10.0 }
        ]);
        let out = complete_sale_pure(input(items, 8, 1000));
        // línea 1 (invitación): todo a 0, marcada is_gift + motivo.
        let l1 = &out.operations[2].params;
        assert_eq!(l1["is_gift"], json!(1));
        assert_eq!(l1["gift_reason"], json!("cortesía"));
        assert_eq!(l1["net_amount"], json!(0));
        assert_eq!(l1["tax_amount"], json!(0));
        assert_eq!(l1["line_total"], json!(0));
        assert_eq!(l1["unit_price"], json!(200)); // conserva el precio para el ticket (tachado)
        // línea 2 (normal) sí se cobra: 500 bruto, IVA 10% incl → net 455, tax 45.
        let l2 = &out.operations[3].params;
        assert_eq!(l2["is_gift"], json!(0));
        // cabecera: total = solo la línea cobrada (500), gift_total = coste de la invitación (60).
        let h = &out.operations[1].params;
        assert_eq!(h["total"], json!(500));
        assert_eq!(h["gift_total"], json!(60));
        // evento: la invitación viaja con net/tax 0 e is_gift; gift_total en cabecera del evento.
        let ev = &out.events[0].payload;
        assert_eq!(ev["gift_total"], json!(60));
        assert_eq!(ev["items"][0]["is_gift"], json!(true));
        assert_eq!(ev["items"][0]["net_amount"], json!(0));
        assert_eq!(ev["total"], json!(500));
    }
}
