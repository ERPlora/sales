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
//!   (`price`/`amount_tendered`), la aritmética es entera con redondeo HALF_UP,
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
//! * **Immutable line snapshot (ADR-0085)**: every line freezes `tax_category_key`, `tax_rate`
//!   (= combined tax_rate_pct), `tax_country_code`, `tax_region_code` and `tax_rule_id` (the root
//!   rule's id, nullable). An invoice already issued does not change when the VAT does.
//!   🔴 sales#195 — the frozen `tax_category_key` is the RESOLVED one, the same one that produced
//!   `tax_rate` and `tax_rule_id`: the catalogue's (or the open check's row) when the line comes
//!   from it, the payload's only when there is no row to check it against. It is one authority per
//!   snapshot, in the row and in `sale.completed`.
//! * **Fails CLOSED, not graceful** (sales#21/#67): a line that NAMES a category and does not
//!   resolve a rule is refused (`sales.no_tax_rule`), and so is one whose fiscal catalogue never
//!   arrived (`sales.tax_catalog_unavailable`). The payload's `tax_rate` is only honoured by a line
//!   with NO category at all (open price / integration, sales#63) — the single door left open, and
//!   left explicit. Respects `tax_included`.

use erplora_guest_sdk::money;
use erplora_guest_sdk::tax;
use erplora_guest_sdk::units::{calculate_line_amount, QuantityValue, QUANTITY_SCALE};
use rust_decimal::prelude::FromPrimitive;
use rust_decimal::Decimal;
use std::str::FromStr;
use erplora_guest_sdk::{DomainError, Event, Operation, Output};
use serde_json::{json, Map, Value};

#[cfg(feature = "guest")]
use extism_pdk::*;

/// sales#201 — the two channels, and why the `Err` arm is NOT where a refusal goes.
///
/// A business rejection comes back inside the `Ok`, in `Output.error`: that is the only channel the
/// host turns into `RuntimeError::Domain { code }`, and therefore the only one the browser receives
/// as a translatable `code` instead of the flat `400 {code: "error"}`. The `Err` arm is reserved for
/// a broken guest contract, which the host reports as a failed command — a bug, not an answer.
#[cfg(feature = "guest")]
#[plugin_fn]
pub fn complete_sale(input: Json<erplora_guest_sdk::Input>) -> FnResult<Json<Output>> {
    match complete_sale_pure(input.into_inner().into_value()) {
        Ok(out) => Ok(Json(out)),
        Err(e) => Err(Error::msg(e).into()),
    }
}

/// sales#269 — the same checkout, entered through the door that already required the manager.
/// Bound to `sales.complete_sale_over_limit`, whose permission (`sales.discount.over_limit`) a
/// `cashier` does not have: the runtime answers them `requires_elevation` and the till asks for
/// the PIN. See [`complete_sale_over_limit_pure`] for why it is a second function and not a flag.
#[cfg(feature = "guest")]
#[plugin_fn]
pub fn complete_sale_over_limit(input: Json<erplora_guest_sdk::Input>) -> FnResult<Json<Output>> {
    match complete_sale_over_limit_pure(input.into_inner().into_value()) {
        Ok(out) => Ok(Json(out)),
        Err(e) => Err(Error::msg(e).into()),
    }
}

/// ADR-0141: dispara a cocina lo pedido hasta ahora. Ver `fire_order_pure`.
#[cfg(feature = "guest")]
#[plugin_fn]
pub fn fire_order(input: Json<erplora_guest_sdk::Input>) -> FnResult<Json<Output>> {
    match fire_order_pure(input.into_inner().into_value()) {
        Ok(out) => Ok(Json(out)),
        Err(e) => Err(Error::msg(e).into()),
    }
}

/// sales#26: anula una venta cerrada, con auditoría y de un solo disparo. Ver `void_sale_pure`.
#[cfg(feature = "guest")]
#[plugin_fn]
pub fn void_sale(input: Json<erplora_guest_sdk::Input>) -> FnResult<Json<Output>> {
    match void_sale_pure(input.into_inner().into_value()) {
        Ok(out) => Ok(Json(out)),
        Err(e) => Err(Error::msg(e).into()),
    }
}

/// sales#160: devuelve una venta por TENDER ELEGIBLE, con reparto editable. Ver `refund_sale_pure`.
#[cfg(feature = "guest")]
#[plugin_fn]
pub fn refund_sale(input: Json<erplora_guest_sdk::Input>) -> FnResult<Json<Output>> {
    match refund_sale_pure(input.into_inner().into_value()) {
        Ok(out) => Ok(Json(out)),
        Err(e) => Err(Error::msg(e).into()),
    }
}

/// ADR-0141: abre un pedido MUTABLE (`order`). Ver `open_order_pure`.
#[cfg(feature = "guest")]
#[plugin_fn]
pub fn open_order(input: Json<erplora_guest_sdk::Input>) -> FnResult<Json<Output>> {
    match open_order_pure(input.into_inner().into_value()) {
        Ok(out) => Ok(Json(out)),
        Err(e) => Err(Error::msg(e).into()),
    }
}

/// sales#164/#172: values a ticket WITHOUT charging it. See `preview_checkout_pure`.
#[cfg(feature = "guest")]
#[plugin_fn]
pub fn preview_checkout(input: Json<erplora_guest_sdk::Input>) -> FnResult<Json<Output>> {
    match preview_checkout_pure(input.into_inner().into_value()) {
        Ok(out) => Ok(Json(out)),
        Err(e) => Err(Error::msg(e).into()),
    }
}

/// sales#175: adds a line to an open check WITH the catalogue in hand. See `add_order_line_pure`.
#[cfg(feature = "guest")]
#[plugin_fn]
pub fn add_order_line(input: Json<erplora_guest_sdk::Input>) -> FnResult<Json<Output>> {
    match add_order_line_pure(input.into_inner().into_value()) {
        Ok(out) => Ok(Json(out)),
        Err(e) => Err(Error::msg(e).into()),
    }
}

/// sales#242 / ADR-0422: splits a line of N services into N lines of one. See
/// `split_order_line_pure`.
#[cfg(feature = "guest")]
#[plugin_fn]
pub fn split_order_line(input: Json<erplora_guest_sdk::Input>) -> FnResult<Json<Output>> {
    match split_order_line_pure(input.into_inner().into_value()) {
        Ok(out) => Ok(Json(out)),
        Err(e) => Err(Error::msg(e).into()),
    }
}

/// Redondeo a la unidad mínima. **No decide el modo**: delega en `guest_sdk::money::round`, que es
/// EL redondeo del hub (HALF_UP, ADR-0123 §4 — la única regla de redondeo monetario escrita en
/// Derecho español: art. 11 de la Ley 46/1998 del euro).
///
/// Este handler traía su propio half-even simulado con un épsilon sobre `f64`
/// (`(diff - 0.5).abs() < 1e-9`), copiado byte a byte en otros cuatro módulos. Ya no.
/// Solo tests: referencia f64→céntimos del modo de redondeo. El flujo de producción ya no pasa
/// por f64 (ADR-0147): las cantidades son punto fijo 10⁶ y los importes van por el SDK.
#[cfg(test)]
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

/// Cantidad en PUNTO FIJO, escala global 10⁶ (ADR-0147). Un entero: 0,5 kg es `500000`.
///
/// No repesca floats a propósito: un decimal que llegue hasta aquí es un error de quien llama
/// (la conversión va en la frontera, donde el humano teclea) y el esquema declara `integer`.
fn as_qty(v: &Value, d: i64) -> i64 {
    match v {
        Value::Number(n) => n.as_i64().unwrap_or(d),
        Value::String(s) => s.trim().parse::<i64>().unwrap_or(d),
        _ => d,
    }
}

/// Lee un i64 de una clave del item, con default (contexto de unidades congelado, ADR-0147 §2.4).
fn item_i64(item: &Value, key: &str, d: i64) -> i64 {
    item.get(key).map(|v| as_qty(v, d)).unwrap_or(d)
}

/// La rejilla que la línea DECLARA (ADR-0147 §2): el incremento mínimo es una de las tres cosas que
/// define una UNIDAD DE MEDIDA —«pieza 1 · kg 0,001 · hora 0,25»—, o sea una propiedad de la unidad,
/// no del documento. Una línea sin contexto de unidades no declara rejilla, y `0` es «ninguna»: un
/// cero no valida nada porque no hay escalón del que salirse.
///
/// Es la misma regla que aplica el TPV al otro lado del cable (`onGrid(qtyMicro, increment ?? 0)`).
fn declared_increment(item: &Value) -> i64 {
    let inc = item_i64(item, "increment_value", 0);
    if inc > 0 { inc } else { 0 }
}

/// La cantidad de la línea (escala 10⁶) y su validación de rejilla (ADR-0147 §2.2).
///
/// El incremento es VALIDACIÓN, no instrucción de redondeo: fuera de rejilla el comando se
/// RECHAZA — redondear aquí modificaría calladamente lo vendido, el stock y el importe. Solo se
/// valida contra la rejilla que la línea DECLARA (contexto congelado); sin contexto no hay rejilla
/// de la que salirse, así que media ración entra (mismo criterio graceful que
/// `inventory::increment_for_product`).
fn line_qty(item: &Value) -> Result<i64, Refusal> {
    let qty = item.get("quantity").map(|v| as_qty(v, QUANTITY_SCALE)).unwrap_or(QUANTITY_SCALE);
    if qty <= 0 {
        return Err(reject("sales.quantity_not_positive", format!("quantity {qty}")));
    }
    let inc = declared_increment(item);
    if inc > 0 && qty % inc != 0 {
        // El error nombra ambos valores para que la UI pueda decir «0,0005 kg no vale en una
        // unidad configurada en incrementos de 0,001 kg».
        return Err(reject("sales.quantity_off_grid", format!("{qty} % {inc} != 0")));
    }
    Ok(qty)
}

/// El INCREMENTO que la fila congela (ADR-0147 §2.4), con UNA invariante que la fila no puede
/// romper nunca:
///
/// ```text
/// increment_value == 0  ||  quantity % increment_value == 0
/// ```
///
/// El de la línea cuando lo declara. Cuando no declara ninguno, la unidad suelta —el caso
/// mayoritario, que no configura nada, se vende entero— **salvo que la cantidad diga lo contrario**:
/// ahí se congela «ninguna rejilla», porque inventar una es exactamente cómo una fila acababa
/// diciendo «se vende entera» mientras guardaba 0,001 (sales#288) o 0,5 (sales#300).
///
/// 🔴 Inventarla además al VALIDAR es lo que rechazaba media ración de gambas en una línea de precio
/// libre —la cantidad que ADR-0147 existe para representar— y lo que cazó
/// `kitchen/tests/tickets.hub.test.py` contra el kernel real: `sales.order.open` contestando 409
/// `sales.quantity_off_grid` con «500000 % 1000000 != 0». La rejilla sale de la unidad; si no hay
/// unidad, no hay rejilla.
fn frozen_increment(item: &Value, qty: i64) -> i64 {
    let inc = declared_increment(item);
    if inc > 0 {
        return inc;
    }
    if qty % QUANTITY_SCALE == 0 { QUANTITY_SCALE } else { 0 }
}

/// La cantidad de precio de la línea (KPEIN, ADR-0147 §2.3): «X céntimos por ESTA cantidad».
/// Default: por 1 unidad (escala 10⁶) — el bar que no configura nada vende «250 por 1 caña».
fn line_price_qty(item: &Value) -> i64 {
    let pq = item_i64(item, "price_quantity_value", QUANTITY_SCALE);
    if pq > 0 { pq } else { QUANTITY_SCALE }
}

/// Congela el contexto de unidades de la línea (ADR-0147 §2.4, opción A): el cálculo histórico
/// NUNCA consulta el maestro. El factor va como fracción EXACTA num/den, nunca decimal. Sin
/// contexto en el payload se congela la unidad suelta (`ud`, factor 1/1, precio por 1 unidad) —
/// el caso mayoritario no configura nada. La ÚNICA excepción es la rejilla: esa no se inventa, sale
/// de la cantidad que la fila guarda (ver [`frozen_increment`]), porque una fila no puede declarar
/// un escalón del que su propia cantidad se sale.
fn freeze_unit_context(item: &Value, qty: i64, p: &mut Map<String, Value>) {
    let unit_code = str_or(item, "unit_code", "ud");
    p.insert("unit_name".into(), json!(str_or(item, "unit_name", "")));
    p.insert("factor_num".into(), json!(item_i64(item, "factor_num", 1)));
    p.insert("factor_den".into(), json!(item_i64(item, "factor_den", 1)));
    p.insert("increment_value".into(), json!(frozen_increment(item, qty)));
    p.insert("price_quantity_value".into(), json!(line_price_qty(item)));
    // Sin unidad de precio explícita, el precio es «por 1 de la unidad de la línea» — no `ud` a
    // secas: congelar `ud` en una línea de kg sería congelar una mentira.
    p.insert("pricing_unit_code".into(), json!(str_or(item, "pricing_unit_code", &unit_code)));
    p.insert("pricing_unit_name".into(), json!(str_or(item, "pricing_unit_name", "")));
    p.insert("pricing_factor_num".into(), json!(item_i64(item, "pricing_factor_num", 1)));
    p.insert("pricing_factor_den".into(), json!(item_i64(item, "pricing_factor_den", 1)));
    p.insert("unit_code".into(), json!(unit_code));
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
#[derive(Clone, Copy)]
struct LineTotals { net: i64, tax: i64, line: i64 }

/// Calcula los totales de una línea en céntimos para **una sola tasa**. `unit_price_cents`
/// en céntimos; `qty`, `disc_pct`, `tax_rate` son `f64` (cantidad / porcentajes). El redondeo
/// HALF_UP (`money::round`, art. 11 de la Ley 46/1998) se aplica al pasar a céntimos enteros. El flujo de
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

/// THE BUSINESS'S DATE (sales#323): the `YYYY-MM-DD` day an instant belongs to on the business
/// clock. `now` is the runtime's instant in UTC (`to_rfc3339`); `context.timezone` is the business
/// zone the runtime already resolved (hub#1022, `settings::timezone_of`). Cutting the date off
/// `now` as it came numbered everything charged between local midnight and UTC midnight with the
/// previous day (`20260918-0006` at 01:57 on the 19th in Madrid). Same helper as invoice#78.
///
/// Degrades to the UTC date — the runtime's own fallback (`timezone_name()` → `UTC`) — when the hub
/// sends no zone or one this table cannot read; a naive instant keeps its own date.
fn business_date(context: &Value, now: &str) -> String {
    let tz = context
        .get("timezone")
        .and_then(Value::as_str)
        .and_then(|name| name.parse::<chrono_tz::Tz>().ok())
        .unwrap_or(chrono_tz::UTC);
    match chrono::DateTime::parse_from_rfc3339(now) {
        Ok(instant) => instant.with_timezone(&tz).format("%Y-%m-%d").to_string(),
        Err(_) => now.split('T').next().unwrap_or(now).to_string(),
    }
}

/// `YYYYMMDD` of a business date — the prefix of `sale_number` and the key of its day counter.
fn day_from_now(date: &str) -> String {
    let date = date.split('T').next().unwrap_or("");
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
#[derive(Clone)]
struct TaxComponent {
    rate_pct: f64,
    rate_key: String,
    /// sales#54 — qué es este componente dentro del desglose: `tax` (la regla raíz: el IVA) o el
    /// `tax_type` del hijo (`surcharge` = recargo de equivalencia). Va al `tax_breakdown` para que
    /// nadie lea el recargo como «un tipo de IVA más» (en el fiscal viaja DENTRO de la línea del
    /// IVA, ADR-0186; aquí conserva su clave por tasa porque el arqueo y el tique la leen así).
    kind: String,
    /// Etiqueta de presentación (`component_label` de la regla o su `tax_type`): el tique la usa
    /// para no imprimir «IVA 5,2 %» donde toca «RE 5,2 %».
    label: String,
}

/// Clave de desglose para una tasa: "%.2f" del `rate_pct` (p.ej. 21.0 → "21.00").
fn rate_key(rate_pct: f64) -> String {
    format!("{:.2}", rate_pct)
}

/// El tipo resuelto para una línea (ADR-0085): el id de la regla raíz (para el snapshot) y sus
/// componentes a aplicar (raíz + hijos). `rule_id` vacío = no se resolvió por catálogo (fallback).
#[derive(Clone)]
struct ResolvedTax {
    rule_id: String,
    /// sales#195 — the tax category the snapshot must FREEZE: the catalogue's when the line comes
    /// from it, the payload's only when there is no catalogue row to check it against. It travels
    /// here so that the row and the `sale.completed` event have ONE source, the same one that
    /// produced `rule_id` and the components: a rate resolved from `restaurant.food` next to a
    /// column reading `product.generic` is a fiscal snapshot that contradicts itself.
    category_key: String,
    components: Vec<TaxComponent>,
}

/// Resuelve los componentes de impuesto de una línea (ADR-0085), **server-authoritative**:
///
/// 1. Si la línea trae categoría (la del CATÁLOGO si es de catálogo —sales#68—, si no la del
///    payload) y hay una regla raíz que matchee país (del CONTEXTO), región y vigencia → la raíz +
///    sus componentes (filas con `parent_id == raíz.id`, activas y vigentes). Ignora el `tax_rate`
///    que mandó el cliente.
/// 2. Si la línea trae categoría y NO resuelve regla → **se rechaza** (`sales.no_tax_rule`).
///    Cobrar el tipo que propone el cliente es cobrar una cosa y declarar otra (sales#67).
/// 3. Si el catálogo fiscal NO llegó (`catalog_delivered == false`) y la línea trae categoría →
///    **se rechaza** (`sales.tax_catalog_unavailable`). sales#21: la read `taxes.rules.list` se
///    declara `required` (hub#701), así que un runtime que la honra aborta antes; si aun así falta
///    (runtime viejo), el handler cierra la puerta él mismo en vez de adivinar el IVA. Antes aquí
///    se degradaba al `tax_rate` del navegador — un catálogo vacío era indistinguible de «la read
///    falló» porque el runtime la omitía en silencio (hub#650). Ya no.
/// 4. Sin categoría que resolver (línea libre de integración, sin departamento) → fallback al
///    `tax_rate` del payload si viene; si no, 0 %. Es la ÚNICA puerta que queda abierta y se deja
///    explícita: el TPV nunca manda una línea así (ADR-0289 — sin categoría fiscal no entra al
///    catálogo; el precio libre lleva la del departamento).
///
/// `catalog_cat` es la categoría que dice el CATÁLOGO cuando la línea es de catálogo (sales#68):
/// manda sobre la del payload.
fn resolve_line_tax(
    item: &Value,
    catalog_cat: Option<&str>,
    rules: &[&Value],
    catalog_delivered: bool,
    cc: &str,
    rc: &str,
    date: &str,
) -> Result<ResolvedTax, Refusal> {
    // La categoría de una línea de catálogo la pone el catálogo; si no, la que venga.
    let cat = catalog_cat
        .map(|c| c.to_string())
        .unwrap_or_else(|| field(item, "tax_category_key"));

    if !cat.is_empty() {
        if !catalog_delivered {
            return Err(reject(
                "sales.tax_catalog_unavailable",
                "the tax catalogue (taxes.rules.list) was not delivered; refusing to guess the VAT",
            ));
        }
        if let Some(root) = tax::resolve_root(rules, cc, rc, &cat, date) {
            let root_id = tax::rule_field(root, "id");
            let components = tax::rule_components(root, rules, date)
                .into_iter()
                .map(|c| {
                    let is_root = c.rule_id == root_id;
                    let kind = if is_root { "tax".to_string() } else if c.tax_type.is_empty() { "component".to_string() } else { c.tax_type.clone() };
                    TaxComponent { rate_pct: c.rate_pct, rate_key: rate_key(c.rate_pct), kind, label: c.label.clone() }
                })
                .collect();
            return Ok(ResolvedTax { rule_id: tax::rule_field(root, "id"), category_key: cat, components });
        }
        // Categoría que no resuelve regla (venga del catálogo o del payload): el hub está sin
        // configurar para esa categoría. Cobrar el tipo que propone el cliente sería inventarse el
        // impuesto — se cobraría una cosa y se declararía otra. Un catálogo VACÍO ya no es excusa:
        // la read es `required`, así que vacío significa «este hub no tiene reglas» (sales#21).
        return Err(reject("sales.no_tax_rule", format!("no tax rule for category `{cat}`")));
    }
    // Sin categoría que resolver: preview del cliente. La única puerta que queda (ver doc).
    let pct = item.get("tax_rate").map(|v| as_f64(v, 0.0)).unwrap_or(0.0);
    Ok(ResolvedTax { rule_id: String::new(), category_key: cat, components: vec![TaxComponent { rate_pct: pct, rate_key: rate_key(pct), kind: "tax".to_string(), label: String::new() }] })
}

/// sales#113 / ADR-0210 — reparte `total` entre `weights` por RESTO MAYOR (Hamilton), en enteros:
/// suelo de la parte exacta y los restos mayores se llevan las unidades que faltan. La suma de las
/// partes es EXACTAMENTE `total` (acotado a Σweights). Un peso ≤ 0 no recibe nada.
fn allocate_amount(total: i64, weights: &[i64]) -> Vec<i64> {
    let n = weights.len();
    if n == 0 || total <= 0 { return vec![0; n]; }
    let w: Vec<i128> = weights.iter().map(|x| (*x as i128).max(0)).collect();
    let w_total: i128 = w.iter().sum();
    if w_total == 0 { return vec![0; n]; }
    let magnitude = (total as i128).min(w_total);
    let mut parts: Vec<i128> = Vec::with_capacity(n);
    let mut remainders: Vec<(i128, usize)> = Vec::with_capacity(n);
    for (i, wi) in w.iter().enumerate() {
        let numerator = magnitude * wi;
        parts.push(numerator / w_total);
        remainders.push((numerator % w_total, i));
    }
    let mut left = magnitude - parts.iter().sum::<i128>();
    // Restos mayores primero; a igualdad, la línea anterior (orden estable del ticket).
    remainders.sort_by(|a, b| b.0.cmp(&a.0).then(a.1.cmp(&b.1)));
    for (_, i) in remainders {
        if left == 0 { break; }
        parts[i] += 1;
        left -= 1;
    }
    parts.into_iter().map(|p| p as i64).collect()
}

/// sales#152 / ADR-0381 — reparto proporcional del art. 79.Dos, **sin el techo** de
/// [`allocate_amount`].
///
/// El reparto de un descuento nunca puede pasar del bruto, así que `allocate_amount` acota el
/// total a la suma de los pesos. Un combo es al revés: el precio cerrado puede **superar** la suma
/// de los precios de catálogo (una sustitución con `price_delta`, o un pack por encima de sus
/// partes), y ahí el techo repartiría de menos y la suma dejaría de ser el precio cerrado.
///
/// 🔴 Sigue siendo LA MISMA máquina, no una nueva: con `total = k·Σpesos + r` la parte de Hamilton
/// vale `k·peso_i + hamilton(r, pesos)_i`, porque `⌊total·wᵢ/Σw⌋ = k·wᵢ + ⌊r·wᵢ/Σw⌋` y los restos
/// de `total·wᵢ` y de `r·wᵢ` módulo `Σw` son idénticos. El resto mayor se decide sobre `r`, que ya
/// cabe en el rango que [`allocate_amount`] sabe repartir.
fn allocate_proportional(total: i64, weights: &[i64]) -> Vec<i64> {
    let n = weights.len();
    if n == 0 || total <= 0 { return vec![0; n]; }
    let w_total: i64 = weights.iter().map(|w| (*w).max(0)).sum();
    if w_total <= 0 { return vec![0; n]; }
    let whole = total / w_total;
    let rest = total % w_total;
    let shares = allocate_amount(rest, weights);
    weights
        .iter()
        .zip(shares)
        .map(|(w, share)| whole * (*w).max(0) + share)
        .collect()
}

/// sales#113 — rebaja una línea ya calculada en `amount` céntimos de su bruto (lo que paga el
/// cliente) y recompone base y cuota sobre lo cobrado: base = bruto' / (1 + tasa combinada), cuota
/// = bruto' − base; cada componente informa su cuota sobre esa base (la que se DECLARA sale del
/// desglose agregado por tipo, ADR-0123 §4). Misma garantía que sales#33: la AEAT recibe lo cobrado.
fn apply_amount_discount(t: &mut LineTotals, parts: &mut [(String, i64, i64)], amount: i64, components: &[TaxComponent]) {
    if amount <= 0 { return; }
    let new_line = (t.line - amount).max(0);
    let combined_pct: f64 = components.iter().map(|c| c.rate_pct).sum();
    let divisor = Decimal::ONE + Decimal::from_f64(combined_pct).unwrap_or(Decimal::ZERO) / Decimal::from(100);
    let net = money::round(Decimal::from(new_line) / divisor);
    t.line = new_line;
    t.net = net;
    t.tax = new_line - net;
    for part in parts.iter_mut() {
        let pct = components.iter().find(|c| c.rate_key == part.0).map(|c| c.rate_pct).unwrap_or(0.0);
        part.1 = net;
        part.2 = money::round(Decimal::from(net) * Decimal::from_f64(pct).unwrap_or(Decimal::ZERO) / Decimal::from(100));
    }
}

/// sales#295 — with net prices a fixed amount comes off the BASE, as in every B2B price list: the
/// line's base drops exactly `amount` and every component keeps its base in step. The quotas are
/// not recomputed here: phase 3 closes them once per rate over the aggregate base (ADR-0123 §4)
/// and hands each line its share, so a per-line rounding here would only be overwritten.
fn apply_amount_discount_to_base(t: &mut LineTotals, parts: &mut [(String, i64, i64)], amount: i64) {
    if amount <= 0 { return; }
    let net = (t.net - amount).max(0);
    t.net = net;
    for part in parts.iter_mut() {
        part.1 = net;
    }
}

/// sales#124 / sales#292 — reparte una cuota YA FIJADA (`bruto − base`) entre los componentes que
/// la produjeron, por RESTO MAYOR sobre sus tasas. Escalar todos los pesos por igual conserva la
/// proporción y esquiva el techo de [`allocate_amount`], que acota el reparto a Σpesos (pensado
/// para el descuento de ADR-0210, donde no se puede repartir más que la línea).
fn split_quota(quota: i64, components: &[TaxComponent]) -> Vec<i64> {
    let weights: Vec<i64> = components.iter().map(|c| (c.rate_pct * 100.0).round() as i64).collect();
    share_by_weight(quota, &weights)
}

/// sales#293 — reparte una cuota YA FIJADA entre pesos cualesquiera por RESTO MAYOR. Escalar todos
/// los pesos por igual conserva la proporción y esquiva el techo de [`allocate_amount`] (Σpesos),
/// que es una salvaguarda del descuento de ADR-0210 —no se puede descontar más que la línea— y no
/// tiene sentido cuando lo que se reparte es un impuesto.
fn share_by_weight(quota: i64, weights: &[i64]) -> Vec<i64> {
    let w_total: i64 = weights.iter().map(|w| (*w).max(0)).sum();
    if w_total <= 0 || quota <= 0 {
        return vec![0; weights.len()];
    }
    let scale = ((quota + w_total - 1) / w_total).max(1);
    let scaled: Vec<i64> = weights.iter().map(|w| (*w).max(0) * scale).collect();
    allocate_amount(quota, &scaled)
}

/// sales#292 — dos líneas comparten PERFIL IMPOSITIVO cuando las gravan los mismos componentes.
/// Es lo que permite sumar su bruto ANTES de dividir: una línea al 21 % y otra al 21 % + 5,2 % de
/// recargo declaran las dos en la entrada "21.00", pero no comparten divisor. La identidad es la
/// clave de desglose (`"%.2f"` de la tasa), que es exactamente lo que se declara.
fn same_profile(a: &[TaxComponent], b: &[TaxComponent]) -> bool {
    a.len() == b.len() && a.iter().zip(b).all(|(x, y)| x.rate_key == y.rate_key)
}

/// Totales de una línea aplicando **N componentes** de impuesto sobre la misma base
/// (ADR-0069, grupos). Devuelve `(LineTotals agregado, desglose por componente)`. La tasa
/// combinada (suma de componentes) desglosa la base cuando `tax_included`; cada componente
/// calcula su cuota sobre esa base (HALF_UP, paridad con `calc_line`). Para un solo
/// componente el resultado es idéntico a `calc_line`.
fn calc_line_components(
    unit_price_cents: i64,
    qty_raw: i64,
    price_qty_raw: i64,
    disc_pct: f64,
    tax_incl: bool,
    components: &[TaxComponent],
) -> (LineTotals, Vec<(String, i64, i64)>) {
    let combined_pct: f64 = components.iter().map(|c| c.rate_pct).sum();
    // ADR-0147 §2.3 (KPEIN): dinero ENTERO por una cantidad de precio. Las escalas de `quantity`
    // y `price_quantity` se cancelan; el descuento entra como factor exacto sobre el precio. El
    // redondeo es HALF_UP, UNO solo por importe, antes de sumar — nunca al total.
    let qty = Decimal::from(qty_raw) / Decimal::from(QUANTITY_SCALE);
    let pq = Decimal::from(if price_qty_raw > 0 { price_qty_raw } else { QUANTITY_SCALE })
        / Decimal::from(QUANTITY_SCALE);
    let factor = Decimal::ONE
        - Decimal::from_f64(disc_pct).unwrap_or(Decimal::ZERO) / Decimal::from(100);
    // Importe EXACTO de la línea antes del único redondeo (céntimos fraccionarios).
    let exact = Decimal::from(unit_price_cents) * factor * qty / pq;
    // Sin descuento, el importe de línea ES la fórmula del SDK (i128, HALF_UP) — mismo resultado
    // que materializar `exact`, pero pasa por el contrato ejecutable de `units.rs`.
    let amount = if disc_pct == 0.0 {
        calculate_line_amount(
            unit_price_cents,
            QuantityValue::from_raw(qty_raw),
            QuantityValue::from_raw(if price_qty_raw > 0 { price_qty_raw } else { QUANTITY_SCALE }),
        )
        .unwrap_or_else(|_| money::round(exact))
    } else {
        money::round(exact)
    };
    // Base imponible (común a todos los componentes) y bruto de la línea.
    let (net, line) = if tax_incl {
        let divisor = Decimal::ONE + Decimal::from_f64(combined_pct).unwrap_or(Decimal::ZERO) / Decimal::from(100);
        (money::round(exact / divisor), amount)
    } else {
        (amount, 0) // line se recompone abajo (net + suma de cuotas)
    };
    // Cuota por componente. sales#124 — con el precio IVA **INCLUIDO** el importe cobrado ya está
    // fijado, así que la cuota es lo que QUEDA (`line - net`) y se reparte entre los componentes
    // por resto mayor. Recalcularla desde la base daba `545 + 114 = 659` sobre un cobro de 660: el
    // desglose no sumaba el total, y ese descuadre viajaba al tique, a la factura y al `CuotaTotal`
    // de la AEAT. Con el IVA **EXCLUIDO** la línea SE COMPONE de base + cuota (`line = net + tax`),
    // así que ahí la suma cuadra por construcción y cada componente conserva su propio redondeo.
    let net_dec = Decimal::from(net);
    let comp_taxes: Vec<i64> = if tax_incl {
        // El mismo reparto que cierra el desglose de la venta (`split_quota`): una sola
        // implementación, así la línea y la cabecera no pueden divergir (sales#292).
        split_quota(line - net, components)
    } else {
        components
            .iter()
            .map(|c| {
                let pct = Decimal::from_f64(c.rate_pct).unwrap_or(Decimal::ZERO) / Decimal::from(100);
                money::round(net_dec * pct)
            })
            .collect()
    };

    let mut parts: Vec<(String, i64, i64)> = Vec::with_capacity(components.len());
    let mut tax_total: i64 = 0;
    for (c, comp_tax) in components.iter().zip(comp_taxes) {
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


// ── sales#68 · el PRECIO lo pone el catálogo, no el navegador ────────────────────────────────
//
// `complete_sale` tomaba el `price` de la línea DEL PAYLOAD y solo comprobaba que no fuese
// negativo. Un artículo de 50 € se vendía por un céntimo y el hub lo aceptaba entero: movía stock,
// movía caja y emitía factura. Todo consistente, todo mal — y sin mala fe hace falta poco: un bug
// en la UI, una integración por la API, una tablet con el bundle viejo.
//
// La vía ya estaba inventada aquí mismo: el método de pago se contrasta contra su catálogo
// pre-cargado y el NOMBRE del recibo sale de la fila. Esto hace lo mismo con el precio.
//
// La regla, en una frase: **si la línea dice ser de catálogo, manda el catálogo**.
//
// Tres casos, y los tres a propósito:
//
//   * línea CON `product_id` y sin `is_service` → es una línea de catálogo. Su precio y su coste
//     salen de la fila. Un id que no esté en el catálogo se RECHAZA (`sales.product_not_available`).
//   * línea SIN `product_id` → venta por departamento / precio libre. No dice ser de catálogo, así
//     que el catálogo no tiene nada que decir de ella. Es la única puerta que queda abierta y es
//     su propia issue (sales#63): cerrarla pide un permiso que el handler hoy no recibe.
//   * línea con `is_service` → `sales` no puede leer `services.*` (no está en su `depends_on`), así
//     que no hay catálogo contra el que contrastarla. Rechazarla dejaría a la peluquería sin
//     cobrar. Fuera de alcance, dicho en voz alta.
//
// Y **sin catálogo no se cierra una venta de catálogo**. La degradación graceful que vale para el
// método de pago —«cobrar es lo último que puede romperse»— aquí ES el agujero: sería aceptar el
// precio que propone el caller para algo que dice ser un producto del hub.
//
// sales#25 — since `inventory` became an OPTIONAL capability (ADR-0127) instead of a hard
// dependency, "no catalogue" stopped being an anomaly: it is the salon's hub, the one that only
// sells services. The rule does NOT relax because of it — it is precisely what makes dropping the
// dependency safe: without `inventory` a hub sells services and free-price lines (ADR-0085), and a
// line that claims to come from the catalogue is still refused with `sales.catalog_unavailable`.
// What changed is whose fault the absence is, not what gets charged.
fn is_catalog_line(item: &Value) -> bool {
    !field(item, "product_id").is_empty() && !item.get("is_service").map(as_bool).unwrap_or(false)
}

/// La FILA de catálogo de una línea que dice venir del catálogo. `Err` con código de dominio si lo
/// dice y no se puede sostener; `Ok(None)` si no lo dice (precio libre o servicio).
///
/// sales#288 — existe aparte de [`authoritative_price`] porque del catálogo sale algo más que el
/// dinero: el NOMBRE que la fila congela y que el cocinero lee en el pase sale de la misma fila, y
/// resolverlo con una segunda búsqueda sería dos verdades donde hay una.
fn catalog_row<'a>(
    item: &Value,
    catalog: Option<&'a Vec<&'a Value>>,
) -> Result<Option<&'a Value>, Refusal> {
    if !is_catalog_line(item) {
        return Ok(None);
    }
    let rows = catalog.ok_or_else(|| {
        reject("sales.catalog_unavailable", "the product catalogue was not available to price this sale")
    })?;
    let id = field(item, "product_id");
    rows.iter()
        .copied()
        .find(|r| field(r, "id") == id)
        .map(Some)
        .ok_or_else(|| reject("sales.product_not_available", &id))
}

/// Precio, coste y categoría fiscal AUTORITATIVOS de una línea de catálogo.
fn authoritative_price(item: &Value, catalog: Option<&Vec<&Value>>) -> Result<Option<(i64, i64, String)>, Refusal> {
    Ok(catalog_row(item, catalog)?.map(catalog_money))
}

/// Lo que de una fila de catálogo decide DINERO: precio, coste y con qué regla tributa.
fn catalog_money(row: &Value) -> (i64, i64, String) {
    (
        as_cents(row.get("price").unwrap_or(&Value::Null), 0),
        as_cents(row.get("cost").unwrap_or(&Value::Null), 0),
        field(row, "tax_category_key"),
    )
}

/// The ROW of the open check this line came from (sales#175), if it names one.
///
/// An open check is charged at the price it had **when it was ordered**, not at what the catalogue
/// says when it is paid: that is what Square does (its Orders API snapshots the price when the
/// order is created), what Simphony does (a price-level change never reaches "menu items from a
/// previous service round") and what Odoo does (the lines of an order already created are not
/// recomputed). Shopify tried the opposite and ended up shipping the `price lock`. The full
/// decision, with its 8 references, is in the ADR on an open check being charged at the price it
/// was opened at (sales#175).
///
/// 🔴 Fails CLOSED on both sides: if the line claims to come from the check and the read of its
/// rows did not arrive, or the id is not among the order's LIVE rows, it is refused instead of
/// falling back to the catalogue. Falling back would re-price in silence — the very thing this
/// issue removes — and, for a row already paid (`sale_id IS NOT NULL`, which the query excludes),
/// it would charge it twice.
fn frozen_order_line<'a>(
    item: &Value,
    rows: Option<&'a Vec<&'a Value>>,
) -> Result<Option<&'a Value>, Refusal> {
    let id = field(item, "order_item_id");
    if id.is_empty() {
        // Counter sale: there is no "when it was ordered" apart from "when it is paid". The
        // catalogue decides, exactly as it has since sales#68.
        return Ok(None);
    }
    let rows = rows.ok_or_else(|| {
        reject("sales.order_lines_unavailable", format!("the lines of the open check were not available to price `{id}`"))
    })?;
    rows.iter()
        .copied()
        .find(|r| field(r, "id") == id)
        .map(Some)
        .ok_or_else(|| reject("sales.order_line_not_available", &id))
}

/// AUTHORITATIVE price, cost and tax category of a line: the frozen ROW of the open check when the
/// line names one, and the catalogue when it does not (sales#68).
///
/// Honouring the row is **not** honouring the payload: the row was written by the server with the
/// catalogue in hand — `open_order` and `add_order_line` resolve it against
/// `inventory.products.for_sale` — the browser was not.
fn line_price(
    item: &Value,
    frozen: Option<&Value>,
    catalog: Option<&Vec<&Value>>,
) -> Result<Option<(i64, i64, String)>, Refusal> {
    match frozen {
        Some(row) => Ok(Some((
            as_cents(row.get("unit_price").unwrap_or(&Value::Null), 0),
            as_cents(row.get("cost").unwrap_or(&Value::Null), 0),
            field(row, "tax_category_key"),
        ))),
        None => authoritative_price(item, catalog),
    }
}

/// The supplements of a line, **with the price the SERVER resolved** (pm#93 / ADR-0376), split
/// into the ones that FOLD into their line and the ones that get a LINE OF THEIR OWN (sales#147).
///
/// Same principle as [`authoritative_price`]: the payload's `price_delta` is a proposal, not a
/// fact. Without this, a client sending `price_delta: -500` would be giving itself a discount.
///
/// 🔴 **Fails CLOSED.** If the line carries supplements and the catalogue did not arrive — because
/// `modifiers` is not installed, or because the optional `read` was not delivered — the sale is
/// REFUSED. Charging "on trust" would open the hole through the back door, and an absent read is
/// indistinguishable from a tampered one.
///
/// 🔴 **sales#200 — on an OPEN CHECK the picks and their money come from the ROW, not from the
/// payload and not from today's catalogue.** The row was written by the server with the catalogue
/// in hand (`open_order` / `add_order_line` freeze the delta the moment the waiter takes the
/// order), so a table pays the supplement at the price it ORDERED it at — the same market decision
/// as sales#175 one floor above. Re-resolving here would re-price in silence every check that is
/// open when someone edits the menu.
///
/// # What the split decides (sales#147, the amendment to ADR-0376)
///
/// `line_tax_category` is the tax category the SERVER fixed for the line — the product catalogue's,
/// or the one the combo split decided. Against it, every option:
///
/// * **no category of its own, or the SAME one** → it FOLDS. That is 99 % of supplements ("+cheese"
///   on a burger) and nothing about them changes: the delta goes into the parent's `unit_price`,
///   one base, one row, exactly as before.
/// * **a category of its OWN and DIFFERENT** → it is PROMOTED to a line of its own. Folding it
///   would make it inherit the parent's rate and the invoice would come out wrongly broken down
///   **in silence** (a soft drink at 21 % charged at the menu's 10 %). Declaring the category in the
///   catalogue IS the business saying "this taxes differently", and the sale honours it.
///
/// A line with NO category of its own (an open-price sale) promotes too: there is nothing for the
/// option to inherit, which is precisely why it needs a row of its own.
fn split_modifiers(
    item: &Value,
    frozen: Option<&Value>,
    catalog: Option<&Vec<&Value>>,
    line_tax_category: Option<&str>,
) -> Result<(Vec<Value>, Vec<Value>), Refusal> {
    let entries = resolve_modifiers(item, frozen, catalog)?;
    let mut folded: Vec<Value> = Vec::with_capacity(entries.len());
    let mut promoted: Vec<Value> = Vec::new();
    for entry in entries {
        // sales#147 — the option's own tax category. Empty = it inherits its line's (ADR-0376). On
        // a resumed check it is the FROZEN one: what the menu said when the table ordered.
        let option_category = field(&entry, "tax_category_key");
        if option_category.is_empty() || line_tax_category == Some(option_category.as_str()) {
            folded.push(entry);
            continue;
        }
        // 🔴 A supplement billed APART has to BE something. A zero — or negative — row at another
        // rate is not a supplement: it is a rebate wearing a tax category, and it would declare a
        // base the customer never bought. A rebate belongs in the line's discount, which is the
        // machinery that already knows how to prorate it to the cent (ADR-0210).
        let delta = as_cents(entry.get("price_delta").unwrap_or(&Value::Null), 0);
        if delta <= 0 {
            return Err(reject(
                "sales.modifier_child_price_invalid",
                format!(
                    "`{}` taxes as `{option_category}` so it bills on a line of its own, and a line \
                     of its own cannot be worth {delta}",
                    field(&entry, "option_id"),
                ),
            ));
        }
        promoted.push(entry);
    }
    Ok((folded, promoted))
}

/// The supplements that FOLD, as the line carries them: `(total delta in minor units, snapshot)`.
///
/// The snapshot preserves the ORDER OF CHOICE (a recurring request in the kitchen: the catalogue's
/// order is useless on the pass) and freezes the `kitchen_name`, which is the one that gets
/// printed. It holds what is INSIDE this row's `unit_price` and nothing else — which is why the
/// paper prints no amount beside a supplement (sales#148), and why a PROMOTED option is not in it:
/// that one is on its own row, with its own money.
fn fold_modifiers(entries: &[Value]) -> Result<(i64, String), Refusal> {
    let delta_total: i64 = entries
        .iter()
        .map(|e| as_cents(e.get("price_delta").unwrap_or(&Value::Null), 0))
        .sum();
    Ok((delta_total, encode_modifiers(entries.to_vec())?))
}

/// The picks of a line, RESOLVED into full entries (id, group, names, delta, tax category) — the
/// single place where a supplement turns into money, for both doors of an open check and for the
/// checkout.
///
/// It does NOT check the tax category: that refusal belongs to the door that decides the money
/// (`authoritative_modifiers`). The doors that materialise a row cannot check it — a set menu's
/// category is decided by the checkout when it splits it — and refusing there would leave a waiter
/// unable to take an order for a rule that only bites when paying.
fn resolve_modifiers(
    item: &Value,
    frozen: Option<&Value>,
    catalog: Option<&Vec<&Value>>,
) -> Result<Vec<Value>, Refusal> {
    let chosen = chosen_modifiers(item, frozen)?;
    if chosen.is_empty() {
        // No supplements, no catalogue needed: the vast majority of lines.
        return Ok(Vec::new());
    }
    let mut entries: Vec<Value> = Vec::with_capacity(chosen.len());
    for pick in &chosen {
        // sales#200: the row of an open check already froze the money. The payload's `price_delta`
        // never gets this branch — `frozen` is `None` for a counter sale — so sales#68 stands.
        match frozen.and_then(|_| frozen_modifier(pick)) {
            Some(entry) => entries.push(entry),
            None => entries.push(catalog_modifier(pick, catalog)?),
        }
    }
    Ok(entries)
}

/// The picks to value: the ROW's on an open check (sales#200), the payload's on a counter sale.
///
/// 🔴 A row whose `modifiers` column is missing, or is not the list we wrote, is REFUSED instead of
/// read as "no supplements": that silence would undercharge the check by the whole delta, and a
/// column that stopped travelling in `sales.order.lines` is indistinguishable from a check that
/// carries none.
fn chosen_modifiers(item: &Value, frozen: Option<&Value>) -> Result<Vec<Value>, Refusal> {
    match frozen {
        Some(row) => match row.get("modifiers") {
            None => Err(reject(
                "sales.order_line_modifiers_unreadable",
                format!("`{}` came back without its supplements column", field(row, "id")),
            )),
            Some(_) => match stored_modifiers(row) {
                Value::Array(a) => Ok(a),
                other => Err(reject(
                    "sales.order_line_modifiers_unreadable",
                    format!("the supplements frozen on `{}` are not a list: {other}", field(row, "id")),
                )),
            },
        },
        None => Ok(item
            .get("modifiers")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default()),
    }
}

/// One entry of the snapshot a row of an open check already froze (sales#200). `None` = it is not
/// frozen money — a row written before the freeze, which carries only the `option_id` — and then
/// the catalogue resolves it, exactly as it did before.
fn frozen_modifier(pick: &Value) -> Option<Value> {
    let id = field(pick, "option_id");
    if id.is_empty() || !pick.get("price_delta").map(Value::is_number).unwrap_or(false) {
        return None;
    }
    let name = field(pick, "name");
    let kitchen = {
        let k = field(pick, "kitchen_name");
        if k.is_empty() { name.clone() } else { k }
    };
    Some(json!({
        "option_id": id,
        "group_id": field(pick, "group_id"),
        "name": name,
        "kitchen_name": kitchen,
        "price_delta": as_cents(pick.get("price_delta").unwrap_or(&Value::Null), 0),
        "tax_category_key": field(pick, "tax_category_key"),
    }))
}

/// One entry resolved against `modifiers.options.all`: the catalogue is the authority for a counter
/// sale, for the two doors that materialise a line of an open check, and for a row written before
/// sales#200.
fn catalog_modifier(pick: &Value, catalog: Option<&Vec<&Value>>) -> Result<Value, Refusal> {
    let rows = catalog.ok_or_else(|| {
        reject(
            "sales.modifier_catalog_unavailable",
            "the modifier catalogue was not available to price this line",
        )
    })?;
    let id = field(pick, "option_id");
    let row = rows
        .iter()
        .find(|r| field(r, "option_id") == id)
        .ok_or_else(|| reject("sales.modifier_not_available", &id))?;
    let name = field(row, "name");
    let kitchen = {
        let k = field(row, "kitchen_name");
        if k.is_empty() { name.clone() } else { k }
    };
    Ok(json!({
        "option_id": id,
        "group_id": field(row, "group_id"),
        "name": name,
        "kitchen_name": kitchen,
        "price_delta": as_cents(row.get("price_delta").unwrap_or(&Value::Null), 0),
        // Empty = it inherits the line's tax category (ADR-0376). Frozen all the same so the
        // history knows what was decided.
        "tax_category_key": field(row, "tax_category_key"),
    }))
}

/// The snapshot as it binds to the TEXT column (migration 023): a JSON list, in the order of
/// choice.
fn encode_modifiers(entries: Vec<Value>) -> Result<String, Refusal> {
    serde_json::to_string(&Value::Array(entries))
        .map_err(|e| broken(format!("modifier_snapshot_encode: {e}")))
}

/// Una línea que el SERVIDOR materializó a partir de un combo (sales#152 / ADR-0381).
///
/// Un combo NO es una línea: es un GRUPO de líneas hermanas, y cuántas tenga lo decide cuántos
/// TIPOS impositivos distintos hay dentro, nunca cuántos componentes se eligieron. No existe línea
/// padre con dinero, ni siquiera a 0 € — es el fallo documentado de Odoo (odoo#187509), donde el
/// combo aparece REGALADO en el informe de ventas.
#[derive(Clone)]
struct ComboLine {
    /// Precio unitario que decide el SERVIDOR: el precio cerrado del combo, o la parte que le tocó
    /// del reparto del art. 79.Dos. NUNCA sale del payload (la lección de sales#68).
    unit_price: i64,
    /// Categoría fiscal de ESTA línea: la del combo cuando es prestación única (`service`), la del
    /// componente cuando el pack de bienes se reparte.
    tax_category_key: String,
    /// Lo que hermana las líneas de un mismo combo. La cabecera del tique se pinta agrupando por
    /// esto y por el snapshot, no leyendo una fila a cero.
    group_ref: String,
    /// Snapshot inmutable del combo (regla 6 de ADR-0381), congelado en CADA hermana: cambiar el
    /// menú mañana no reescribe la comanda de ayer.
    snapshot: String,
    /// Las unidades que mueven el STOCK de esta línea (sales#171 / inventory#69), **por unidad de
    /// combo**: el multiplicador de la línea se aplica al armar el evento.
    ///
    /// Va llena SOLO cuando el combo se cobró como UNA línea, que es justo cuando esa línea no
    /// tiene `product_id` propio y nadie más puede saber qué salió del almacén. Cuando el combo se
    /// PARTE en hermanas, cada hermana YA es un componente con su artículo y su cantidad: colgarle
    /// además esta lista descontaría cada artículo una vez por hermana.
    stock_components: Vec<ComboComponent>,
}

/// Un componente del combo visto como UNIDAD DE STOCK: lo que `inventory` necesita para mover
/// existencias, con los MISMOS campos que ya lleva una línea de venta.
///
/// El contrato que viaja en el evento es genérico a propósito y no lo puso `sales`: lo fijó
/// `inventory` (inventory#69) como «una línea que lleva `components[]` no vacío cede su stock a
/// ellos». No nombra la palabra «combo», sirve para cualquier línea compuesta que venga después, y
/// por eso `sales` sigue SIN `depends_on` de `combos` ni de `inventory`.
#[derive(Clone)]
struct ComboComponent {
    /// El artículo real detrás de la elección (`source_ref`). `combos` lo referencia de forma
    /// OPACA (`source`/`source_ref`, sin FK), así que aquí viaja tal cual.
    product_id: String,
    /// Nombre de display, el mismo que llevaría la línea si el componente se hubiese vendido suelto.
    product_name: String,
    /// Un servicio dentro de un combo (el corte del pack de peluquería) NO mueve stock, y eso es
    /// lo NORMAL, no un error: se salta ese componente y los demás se descuentan igual.
    is_service: bool,
}

/// Precio de catálogo y categoría fiscal de un componente, leídos de `inventory.products.for_sale`.
///
/// Son el **peso** del reparto (art. 79.Dos: «en proporción al valor de mercado»; HMRC VATVAL03800:
/// *selling price*) y el tipo con el que tributa. `combos` no puede conocerlos —su referencia al
/// artículo es OPACA (`source`/`source_ref`, `depends_on: []`)— así que el reparto es de `sales`.
fn combo_component_catalog(
    source: &str,
    source_ref: &str,
    catalog: Option<&Vec<&Value>>,
) -> Result<(i64, String), Refusal> {
    // Un componente que no es un producto (un servicio del pack de peluquería) no tiene catálogo
    // que `sales` pueda leer: `services` no está en su `depends_on`. Un combo `service` no lo
    // necesita —va entero a un tipo—, pero uno de bienes SÍ, y ahí se rechaza en vez de estimar.
    let rows = match (source, catalog) {
        ("product", Some(rows)) => rows,
        _ => {
            return Err(reject(
                "sales.combo_component_price_unknown",
                format!("`{source_ref}` ({source}) has no catalogue price to weigh the split with"),
            ))
        }
    };
    let row = rows.iter().find(|r| field(r, "id") == source_ref).ok_or_else(|| {
        reject("sales.combo_component_price_unknown", format!("`{source_ref}` is not on sale"))
    })?;
    Ok((
        as_cents(row.get("price").unwrap_or(&Value::Null), 0),
        field(row, "tax_category_key"),
    ))
}

/// Arma UN combo contra el catálogo y devuelve las líneas hermanas que lo materializan.
///
/// Hermano de [`authoritative_modifiers`]: el precio, el tipo y el `price_delta` salen de
/// `combos.options.all`, **nunca del payload**. Devuelve `Err` con código de dominio si el combo no
/// se sostiene — un menú retirado, un curso obligatorio sin resolver, un componente sin precio.
///
/// El número de líneas lo decide **cuántas categorías fiscales distintas** hay dentro:
/// * `supply_kind = service` → **UNA** línea al tipo del combo, aunque el vino de dentro esté
///   etiquetado al 21 % (art. 91.Uno.2.2º LIVA: prestación única, la bebida es accesoria). La
///   accesoriedad es una posición jurídica del negocio, no una consecuencia del etiquetado.
/// * `goods` con **un solo** tipo → **UNA** línea con el precio cerrado. Cero reparto, cero
///   redondeo: la maquinaria de dinero ya probada ni se entera de que había un combo.
/// * `goods` con tipos **distintos** → **UNA LÍNEA POR COMPONENTE** (art. 79.Dos LIVA), con el
///   precio cerrado repartido por [`allocate_amount`] — la misma máquina de resto mayor de
///   ADR-0210/sales#113, reutilizada, no reinventada.
fn expand_combo(
    item: &Value,
    group_ref: String,
    combo_catalog: Option<&Vec<&Value>>,
    product_catalog: Option<&Vec<&Value>>,
    frozen_dividend: Option<i64>,
) -> Result<Vec<(Value, ComboLine)>, Refusal> {
    let combo_id = field(item, "combo_id");
    // FALLA CERRADO (ADR-0127). La read es OPCIONAL —`sales` no depende de `combos`—, así que su
    // ausencia significa «el módulo no está instalado». Sin catálogo no se conocen ni el precio
    // cerrado ni los pesos del reparto, y cobrar «confiando» sería el agujero por la puerta de
    // atrás. Un hub SIN `combos` cobra exactamente igual que antes: nadie manda `combo_id`.
    let rows = combo_catalog.ok_or_else(|| {
        reject("sales.combo_catalog_unavailable", format!("no combo catalogue to price `{combo_id}`"))
    })?;
    let options: Vec<&&Value> = rows.iter().filter(|r| field(r, "combo_id") == combo_id).collect();
    let head = *options
        .first()
        .ok_or_else(|| reject("sales.combo_not_available", &combo_id))?;
    // `combo_is_active = 0` viaja en la read a propósito: un menú retirado se rechaza diciendo QUE
    // YA NO ESTÁ A LA VENTA. Confundirlo con «opción desconocida» manda al encargado a mirar el
    // sitio equivocado — es otro bug con otro arreglo.
    if !head.get("combo_is_active").map(as_bool).unwrap_or(false) {
        return Err(reject(
            "sales.combo_not_on_sale",
            format!("`{combo_id}` was withdrawn from sale"),
        ));
    }
    let supply_kind = field(head, "supply_kind");
    let combo_name = field(head, "combo_name");
    let closed_price = as_cents(head.get("combo_price").unwrap_or(&Value::Null), 0);

    let empty: Vec<Value> = Vec::new();
    let picks = item.get("combo_choices").and_then(|v| v.as_array()).unwrap_or(&empty);

    // ── Lo elegido, resuelto contra el catálogo y EN EL ORDEN de elección ──
    let mut chosen: Vec<(&Value, &Value)> = Vec::with_capacity(picks.len()); // (pick, fila del catálogo)
    for pick in picks {
        let option_id = field(pick, "option_id");
        let row = options
            .iter()
            .find(|r| field(r, "option_id") == option_id)
            .ok_or_else(|| reject("sales.combo_option_not_available", &option_id))?;
        chosen.push((pick, row));
    }

    // ── Los grupos de elección son una PRECONDICIÓN del servidor, no del picker ──
    // Regla 7 de ADR-0381: `min_choices >= 1` ES «obligatorio» (misma regla de Clover que ya fijó
    // ADR-0376: no hay flag `required`). Que la pantalla lo impida no basta — quien llame al
    // comando por la API se la salta.
    // Cada grupo aparece una vez POR OPCIÓN en la read (viene aplanada), así que se recorre la
    // lista de grupos DISTINTOS: comprobar el mismo grupo cuatro veces daría el mismo veredicto
    // cuatro veces y haría el bucle O(n²) sin decir nada nuevo.
    let mut seen_groups: Vec<String> = Vec::new();
    for group in &options {
        let group_id = field(group, "group_id");
        if seen_groups.contains(&group_id) {
            continue;
        }
        seen_groups.push(group_id.clone());
        let picked: Vec<&(&Value, &Value)> =
            chosen.iter().filter(|(_, r)| field(r, "group_id") == group_id).collect();
        let min = item_i64(group, "min_choices", 0);
        let max = item_i64(group, "max_choices", 0);
        if (picked.len() as i64) < min {
            return Err(reject(
                "sales.combo_group_unresolved",
                format!("`{}` needs {min} choice(s), got {}", field(group, "group_name"), picked.len()),
            ));
        }
        // `max_choices = 0` = sin techo (contrato de `combos`).
        if max > 0 && picked.len() as i64 > max {
            return Err(reject(
                "sales.combo_group_over_max",
                format!("`{}` allows {max} choice(s), got {}", field(group, "group_name"), picked.len()),
            ));
        }
        if !group.get("allow_repeat").map(as_bool).unwrap_or(false) {
            let mut seen: Vec<String> = Vec::with_capacity(picked.len());
            for (_, r) in picked {
                let id = field(r, "option_id");
                if seen.contains(&id) {
                    return Err(reject("sales.combo_option_repeated", &id));
                }
                seen.push(id);
            }
        }
    }
    if chosen.is_empty() {
        return Err(reject("sales.combo_group_unresolved", format!("`{combo_id}` was sent with no choice")));
    }

    // ── EL DIVIDENDO: el precio cerrado + los suplementos de sustitución ──
    // El `price_delta` («+ solomillo 3 €») suma AL PRECIO CERRADO, nunca al peso del componente:
    // entra en el dividendo, no en los pesos. Puede ser negativo (contrato de `combos`).
    let mut dividend = closed_price;
    for (_, row) in &chosen {
        dividend += as_cents(row.get("price_delta").unwrap_or(&Value::Null), 0);
    }
    // sales#175 — a parked set menu is charged at the CLOSED price it had when it was ordered. The
    // open check already froze that dividend on its row (the server resolved it against this very
    // catalogue when the line was added), so raising the pack tomorrow does not re-price today's
    // table. The SPLIT, on the other hand, is still today's: the weights and rates of art. 79.Dos
    // belong to the accrual, and the accrual is the delivery (art. 75.Uno.1º LIVA).
    if let Some(frozen) = frozen_dividend {
        dividend = frozen;
    }
    if dividend < 0 {
        return Err(reject("sales.amount_negative", format!("combo `{combo_id}` priced at {dividend}")));
    }

    // ── Los PESOS: el precio de CATÁLOGO de cada componente elegido ──
    // Un combo `service` no los necesita (va entero a un tipo), y por eso un pack de peluquería
    // —cuyos componentes son servicios que `sales` no puede leer— se cobra igual de bien.
    let components: Vec<(i64, String)> = if supply_kind == "service" {
        Vec::new()
    } else {
        let mut out = Vec::with_capacity(chosen.len());
        for (_, row) in &chosen {
            out.push(combo_component_catalog(
                &field(row, "source"),
                &field(row, "source_ref"),
                product_catalog,
            )?);
        }
        out
    };

    // ── ¿Una línea o una por componente? Lo deciden los TIPOS, no los componentes ──
    let distinct = supply_kind != "service"
        && components.iter().any(|(_, cat)| *cat != components[0].1);
    let shares: Vec<i64> = if distinct {
        let weights: Vec<i64> = components.iter().map(|(price, _)| *price).collect();
        if weights.iter().sum::<i64>() <= 0 {
            return Err(reject(
                "sales.combo_component_price_unknown",
                format!("`{combo_id}` has no catalogue prices to weigh the split with"),
            ));
        }
        // 🔴 LA MISMA MÁQUINA DE ADR-0210 (sales#113), no una nueva: suelo de la parte exacta y el
        // céntimo residual al RESTO MAYOR, con la suma EXACTAMENTE igual al precio cerrado.
        allocate_proportional(dividend, &weights)
    } else {
        Vec::new()
    };

    // ── El SNAPSHOT que congela cada hermana (regla 6) ──
    let snapshot_components: Vec<Value> = chosen
        .iter()
        .enumerate()
        .map(|(i, (pick, row))| {
            json!({
                "option_id": field(row, "option_id"),
                "group_id": field(row, "group_id"),
                "group_name": field(row, "group_name"),
                "source": field(row, "source"),
                "source_ref": field(row, "source_ref"),
                // El nombre es DISPLAY y viene del pick, como el `product_name` de cualquier línea:
                // el catálogo de `combos` referencia el artículo de forma opaca y no lo conoce.
                "name": str_or(pick, "product_name", ""),
                "price_delta": as_cents(row.get("price_delta").unwrap_or(&Value::Null), 0),
                "tax_category_key": components.get(i).map(|(_, c)| c.clone()).unwrap_or_default(),
                "catalog_price": components.get(i).map(|(p, _)| *p).unwrap_or(0),
                // Lo que le tocó del reparto; `null` cuando el combo NO se parte.
                "share": shares.get(i).map(|s| json!(s)).unwrap_or(Value::Null),
            })
        })
        .collect();
    // Las unidades de stock del combo, en el MISMO orden de elección que el snapshot: una por
    // pick, porque cada elección es una unidad de ese artículo por unidad de combo.
    let stock_components: Vec<ComboComponent> = chosen
        .iter()
        .map(|(pick, row)| ComboComponent {
            product_id: field(row, "source_ref"),
            product_name: str_or(pick, "product_name", &combo_name),
            is_service: field(row, "source") == "service",
        })
        .collect();
    let kitchen_name = {
        let k = field(head, "combo_kitchen_name");
        if k.is_empty() { combo_name.clone() } else { k }
    };
    let snapshot = serde_json::to_string(&json!({
        "combo_id": combo_id,
        "name": combo_name,
        "kitchen_name": kitchen_name,
        // El precio de CATÁLOGO y el que de verdad se repartió (con los suplementos dentro).
        "price": closed_price,
        "price_charged": dividend,
        "supply_kind": supply_kind,
        "components": snapshot_components,
    }))
    .map_err(|e| broken(format!("combo_snapshot_encode: {e}")))?;

    // Lo que la línea hereda del combo: si el menú se invita o lo cubre un bono, se invita o se
    // cubre ENTERO; un descuento de línea sobre el menú lo llevan por igual todas sus hermanas, así
    // que la proporción del reparto se conserva.
    let inherit = |p: &mut Map<String, Value>| {
        p.insert("quantity".into(), item.get("quantity").cloned().unwrap_or(Value::Null));
        p.insert("discount".into(), item.get("discount").cloned().unwrap_or(Value::Null));
        p.insert("is_gift".into(), item.get("is_gift").cloned().unwrap_or(Value::Null));
        p.insert("gift_reason".into(), item.get("gift_reason").cloned().unwrap_or(Value::Null));
        p.insert("covered".into(), item.get("covered").cloned().unwrap_or(Value::Null));
        // sales#156: and the note. A set menu has no parent row with money (there is none by
        // design), so a note kept only on the head would have nowhere to live: the paper builds
        // the menu's header line by GROUPING the siblings, and the kitchen routes each component
        // to its own station. «No ice» belongs on both, exactly like the comp reason above.
        p.insert("notes".into(), item.get("notes").cloned().unwrap_or(Value::Null));
    };

    if !distinct {
        // UNA línea con el precio cerrado. El tipo es el del combo cuando es prestación única, y el
        // de sus componentes cuando son bienes que tributan todos igual.
        let cat = if supply_kind == "service" {
            field(head, "combo_tax_category_key")
        } else {
            components.first().map(|(_, c)| c.clone()).unwrap_or_default()
        };
        if cat.is_empty() {
            // Sin categoría, `resolve_line_tax` se caería al `tax_rate` del payload — el navegador
            // fijando el IVA de un menú. El combo está mal configurado y se dice en voz alta.
            return Err(reject(
                "sales.combo_tax_category_missing",
                format!("`{combo_id}` has no tax category to charge the closed price with"),
            ));
        }
        let mut p = Map::new();
        // Sin `product_id`: un combo NO es un artículo del catálogo de productos, y una fila con el
        // id del combo sería justo la línea padre que ADR-0381 prohíbe.
        p.insert("product_id".into(), Value::Null);
        p.insert("product_name".into(), json!(combo_name));
        p.insert("is_service".into(), json!(supply_kind == "service"));
        p.insert("price".into(), json!(dividend));
        p.insert("tax_category_key".into(), json!(cat.clone()));
        p.insert("category_id".into(), Value::Null);
        inherit(&mut p);
        return Ok(vec![(
            Value::Object(p),
            ComboLine {
                unit_price: dividend,
                tax_category_key: cat,
                group_ref,
                snapshot,
                // 🔴 Esta línea NO tiene `product_id` —un combo no es un artículo del catálogo— así
                // que sin esta lista `inventory` no tendría a qué agarrarse: caería a la línea, el
                // `WHERE` de su `_decrease_stock` no casaría ninguna fila y el SQL respondería `ok`.
                stock_components,
            },
        )]);
    }

    // UNA LÍNEA POR COMPONENTE, cada una con SU tipo y su parte del precio cerrado.
    let mut lines = Vec::with_capacity(chosen.len());
    for (i, (pick, row)) in chosen.iter().enumerate() {
        let (_, cat) = &components[i];
        let source = field(row, "source");
        let mut p = Map::new();
        p.insert("product_id".into(), json!(field(row, "source_ref")));
        p.insert("product_name".into(), json!(str_or(pick, "product_name", &combo_name)));
        p.insert("is_service".into(), json!(source == "service"));
        p.insert("price".into(), json!(shares[i]));
        p.insert("tax_category_key".into(), json!(cat.clone()));
        p.insert("category_id".into(), pick.get("category_id").cloned().unwrap_or(Value::Null));
        // ADR-0376 sin cambios: un modificador dentro de un combo cuelga de la línea de SU
        // componente («el segundo, sin cebolla»), y su delta lo sigue poniendo `modifiers`.
        p.insert("modifiers".into(), pick.get("modifiers").cloned().unwrap_or(Value::Null));
        inherit(&mut p);
        lines.push((
            Value::Object(p),
            ComboLine {
                unit_price: shares[i],
                tax_category_key: cat.clone(),
                group_ref: group_ref.clone(),
                snapshot: snapshot.clone(),
                // La hermana YA es un componente, con su `product_id` y la cantidad heredada del
                // combo: mueve su propio stock. Repetir aquí la lista entera descontaría cada
                // artículo una vez POR HERMANA.
                stock_components: Vec::new(),
            },
        ));
    }
    Ok(lines)
}

/// Sustituye cada línea de combo del payload por las líneas hermanas que el SERVIDOR arma
/// (sales#152). Una línea normal pasa tal cual, con `None`: un hub sin `combos` cobra igual.
///
/// 🔴 Se hace UNA sola vez y lo consumen las DOS rutas —las filas que se persisten y el evento
/// `sale.completed`—. Si el evento se quedara con el item del payload, `invoice` facturaría el
/// combo por el precio que mandó el navegador mientras las filas dicen otra cosa, y lo que llega a
/// la AEAT sale del evento.
fn expand_combos<'a>(
    items: &[Value],
    sale_id: &str,
    combo_catalog: Option<&Vec<&Value>>,
    product_catalog: Option<&Vec<&Value>>,
    order_lines: Option<&'a Vec<&'a Value>>,
) -> Result<Vec<(Value, Option<ComboLine>)>, Refusal> {
    let mut out: Vec<(Value, Option<ComboLine>)> = Vec::with_capacity(items.len());
    for (idx, item) in items.iter().enumerate() {
        if field(item, "combo_id").is_empty() {
            out.push((item.clone(), None));
            continue;
        }
        // El ref que hermana las líneas de ESTE combo. Derivado (venta + posición) en vez de tomado
        // de `new_ids`: no consume ids de la tanda y es único fuera de la venta.
        let group_ref = format!("{sale_id}-{idx}");
        // sales#175: the closed price the open check's row froze, when the line comes from one.
        // With no open check (counter sale) the price comes from the `combos` catalogue.
        let frozen = frozen_order_line(item, order_lines)?;
        let frozen_dividend = frozen.map(|row| as_cents(row.get("unit_price").unwrap_or(&Value::Null), 0));
        // sales#156: the note travels down to the siblings from the ROW when the check was open —
        // the same authority as the closed price just above. Without an open check it is the
        // call's own, because at the counter there is no row yet.
        let mut head = item.clone();
        if let (Some(row), Some(obj)) = (frozen, head.as_object_mut()) {
            obj.insert("notes".into(), json!(field(row, "notes")));
        }
        for (line, combo) in expand_combo(&head, group_ref, combo_catalog, product_catalog, frozen_dividend)? {
            out.push((line, Some(combo)));
        }
    }
    Ok(out)
}

/// UNA línea del cobro tal y como el SERVIDOR la expandió, antes de valorarla.
///
/// Dos expansiones viven aquí y las dos son del servidor, nunca del payload: un combo se convierte
/// en sus líneas hermanas (sales#152 / ADR-0381) y un suplemento que tributa distinto se convierte
/// en su propia línea hija (sales#147 / enmienda de ADR-0376).
#[derive(Clone)]
struct ExpandedLine {
    /// La línea tal y como entra en la valoración.
    item: Value,
    /// De qué combo salió, con su snapshot congelado. `None` = no viene de ninguno.
    combo: Option<ComboLine>,
    /// Los suplementos que se PLIEGAN en el precio unitario de esta línea, en orden de elección.
    folded: Vec<Value>,
    /// La opción que ESTA línea ES (sales#147). Va al snapshot de la fila —así la hija dice de qué
    /// suplemento salió, con su delta congelado, sin que nadie tenga que deducirlo del orden— pero
    /// su delta NO se suma: ya ES el precio unitario de la línea.
    own: Option<Value>,
    /// La línea de la que ESTA cuelga, por índice en esta misma lista (sales#147). `None` = no
    /// cuelga de ninguna, que es la verdad de todas las líneas que había hasta esta issue.
    parent: Option<usize>,
}

/// La LÍNEA HIJA de un suplemento con tipo fiscal propio (sales#147 / enmienda de ADR-0376).
///
/// Todo lo que decide dinero sale del catálogo (`entry`, que resolvió el servidor) o del PADRE,
/// jamás del payload:
///
/// * `price` = el `price_delta` congelado. La hija no tiene `product_id` —una opción no es un
///   artículo del catálogo de productos— así que la valoración usa ese precio tal cual, por la
///   misma puerta por la que ya pasa una línea de precio libre.
/// * `quantity` (con la cantidad de precio KPEIN y el contexto de unidades) = las del padre: la
///   hija no es una línea que el camarero teclease, es un trozo del padre. Dos menús, dos refrescos.
/// * `tax_category_key` = la de la OPCIÓN. Es lo que hace que la fila lleve su propio `tax_rate` y
///   que base + cuota cuadren al céntimo en las dos filas por separado.
/// * el descuento de línea, la invitación y el cubierto se HEREDAN: si el menú se invita, su
///   refresco se invita; si lleva un 10 %, su refresco lo lleva. Así el prorrateo de ADR-0210 cae
///   sobre las dos y no hay descuadre.
///
/// 🔴 **NO lleva `order_item_id`.** La hija no es una fila de la cuenta abierta —`sales_order_item`
/// no la tiene ni la necesita: se materializa AL COBRAR, igual que las hermanas de un combo— y
/// dejarle el del padre la valoraría con el precio del padre.
fn modifier_child_item(parent: &Value, entry: &Value) -> Value {
    let name = {
        let n = field(entry, "name");
        if n.is_empty() { field(entry, "option_id") } else { n }
    };
    let mut p = Map::new();
    // Sin `product_id`: una opción de `modifiers` no es un artículo de `inventory`, y ponerle uno
    // haría que `inventory` descontase existencias que nadie declaró. Descontar los ingredientes de
    // un suplemento es pm#116, post-MVP, y se dice en voz alta en vez de fingirlo.
    p.insert("product_id".into(), Value::Null);
    p.insert("product_name".into(), json!(name));
    p.insert("is_service".into(), parent.get("is_service").cloned().unwrap_or(Value::Null));
    p.insert("price".into(), json!(as_cents(entry.get("price_delta").unwrap_or(&Value::Null), 0)));
    p.insert("tax_category_key".into(), json!(field(entry, "tax_category_key")));
    // Sin categoría de producto: una opción no está clasificada para el routing de cocina, y una
    // cadena vacía sería un id que no existe (sales#12).
    p.insert("category_id".into(), Value::Null);
    for key in [
        "quantity",
        "price_quantity_value",
        "discount",
        "is_gift",
        "gift_reason",
        "covered",
        "unit_code",
        "unit_name",
        "factor_num",
        "factor_den",
        "increment_value",
        "pricing_unit_code",
        "pricing_unit_name",
        "pricing_factor_num",
        "pricing_factor_den",
    ] {
        if let Some(v) = parent.get(key) {
            p.insert(key.into(), v.clone());
        }
    }
    Value::Object(p)
}

/// Las líneas que el SERVIDOR va a cobrar de verdad: los combos ya repartidos (sales#152) y los
/// suplementos con tipo fiscal propio ya sacados a su línea hija (sales#147).
///
/// 🔴 Se hace UNA sola vez, aquí, y de esto beben TODAS las rutas: las filas que se persisten, el
/// evento `sale.completed` del que salen la factura y el registro de la AEAT, y la lectura
/// autoritativa que responde el preview (sales#164). Si cada una expandiera por su cuenta, un día
/// dirían cosas distintas — y «cuadra al céntimo» duraría hasta el primer cambio en una de ellas.
///
/// La hija va SIEMPRE inmediatamente detrás de su padre: el papel la imprime debajo, y el índice
/// que guarda en `parent` es el que se convierte en `parent_line_ref` al repartir los ids.
fn expand_lines<'a>(
    items: &[Value],
    sale_id: &str,
    combo_catalog: Option<&Vec<&Value>>,
    product_catalog: Option<&Vec<&Value>>,
    modifier_catalog: Option<&Vec<&Value>>,
    order_lines: Option<&'a Vec<&'a Value>>,
) -> Result<Vec<ExpandedLine>, Refusal> {
    let mut out: Vec<ExpandedLine> = Vec::with_capacity(items.len());
    for (item, combo) in expand_combos(items, sale_id, combo_catalog, product_catalog, order_lines)? {
        // sales#175/#200: the ROW of the open check this line comes from — the authority for both
        // the base price and the supplements' frozen delta.
        let frozen = frozen_order_line(&item, order_lines)?;
        // The tax category the SERVER fixed for this line: the combo split's when it came from one
        // (art. 91.Uno.2.2º or art. 79.Dos), the catalogue's otherwise, and `None` when the line has
        // none to fix (an open-price sale). It is what an option's own category is checked against,
        // so it has to be resolved BEFORE the supplements.
        let line_category = match &combo {
            Some(c) => Some(c.tax_category_key.clone()),
            None => line_price(&item, frozen, product_catalog)?.map(|(_, _, cat)| cat),
        };
        let (folded, promoted) =
            split_modifiers(&item, frozen, modifier_catalog, line_category.as_deref())?;
        let parent_idx = out.len();
        out.push(ExpandedLine { item, combo, folded, own: None, parent: None });
        for entry in promoted {
            let child = modifier_child_item(&out[parent_idx].item, &entry);
            out.push(ExpandedLine {
                item: child,
                // NO es un combo: `combo_group_ref` hermana filas SIN padre (ADR-0381) y esto es la
                // relación contraria — una fila que cuelga de otra que sí lleva el dinero. Además
                // COMPONEN (un componente de menú puede traer su propio suplemento), así que una
                // sola columna no puede con las dos sin que un grupo signifique dos cosas.
                combo: None,
                // Nada se pliega en una hija: su precio unitario ES el delta del suplemento.
                folded: Vec::new(),
                // La opción promocionada viaja en SU PROPIA fila: eso es lo que hace la fila
                // autodescriptiva (qué opción, con qué delta congelado) sin duplicarla en el padre,
                // donde ya no forma parte del precio.
                own: Some(entry),
                parent: Some(parent_idx),
            });
        }
    }
    Ok(out)
}

// ── sales#20 · el SERVIDOR cierra la venta; el cliente solo PROPONE ──────────────────────────

/// Why a command did not go through. Two kinds, because they leave the hub by two different
/// doors and only one of them is translatable (sales#201).
enum Refusal {
    /// A BUSINESS rejection — «the menu is missing a dish», «what was handed over does not cover
    /// the total». It travels to the caller inside `Output.error`, which is the ONLY channel the
    /// runtime turns into `RuntimeError::Domain { code }` and therefore the only one that reaches
    /// the browser as a `code` (`crates/runtime/src/commands.rs`, hub#139). The host still drops
    /// every operation and every event, so a rejected sale NEVER moves stock, cash or invoicing.
    ///
    /// It used to travel as `Err("<code>: <detail>")`, which the runtime mapped to
    /// `RuntimeError::Wasm` and the server flattened into HTTP 400 with `code: "error"`: the
    /// cashier was told «could not charge» and nothing else, and the whole code→message map of
    /// `ui/lib/checkout-key.ts` was dead. Recovering the code by parsing that prefix is the
    /// anti-pattern ADR-0398 §6 retired — the producer publishes the code, nobody reads prose.
    Domain(DomainError),
    /// A BROKEN CONTRACT — the guest could not do its job at all (a snapshot that will not encode,
    /// an overflow). This is a bug, not an answer for the cashier, so it stays an `Err` and traps:
    /// a translated screen for it would be a lie, and swallowing it would hide the bug.
    Broken(String),
}

/// A business rejection with its ADR-0205 code (`sales.<snake_case>`). The runtime validates the
/// namespace (`valid_domain_code`, hub#139), so a foreign code is caught at the door.
///
/// The `detail` is the ENGLISH source sentence for developers and logs. What the cashier reads is
/// resolved by the UI from the CODE (`ui/lib/checkout-key.ts` → `locales/<lang>.json`, ADR-0055):
/// nothing downstream may branch on this text.
fn reject(code: &str, detail: impl std::fmt::Display) -> Refusal {
    Refusal::Domain(DomainError::new(code, detail.to_string()))
}

/// The guest could not honour its own contract. See [`Refusal::Broken`].
fn broken(detail: impl std::fmt::Display) -> Refusal {
    Refusal::Broken(detail.to_string())
}

/// Hands a refusal to the caller the way each kind has to leave: a business rejection as a normal
/// output carrying its code, a broken contract as an `Err` the runtime turns into a failed command.
fn finish(result: Result<Output, Refusal>) -> Result<Output, String> {
    match result {
        Ok(out) => Ok(out),
        Err(Refusal::Domain(error)) => Ok(Output::new().with_error(error)),
        Err(Refusal::Broken(detail)) => Err(detail),
    }
}

/// sales#12 — the product's category, frozen on the line for kitchen routing. Opaque to `sales`
/// (no cross-module FK). `Null` when the line is unclassified: an empty string would be an id
/// that does not exist and kitchen would try to route by it.
fn category_snapshot(item: &Value) -> Value {
    let cat = field(item, "category_id");
    if cat.is_empty() { Value::Null } else { json!(cat) }
}

/// sales#273 — WHO did a line, as the row stores it. Opaque reference to `staff.*` /
/// `hub.users.list`: `sales` never interprets it and never joins against it (ADR-0007).
///
/// NULL and not `""` when nobody was named. That is not cosmetic: `sales.by_staff` COALESCEs a NULL
/// line to the ticket's own professional, so the close of a bar —which attributes nothing— keeps
/// adding up exactly as it did before this column existed. An empty string would be a third state
/// belonging to no one, and it would fall back to nobody.
fn staff_ref(row: &Value) -> Value {
    match row.get("staff_id").and_then(|v| v.as_str()) {
        Some(id) if !id.trim().is_empty() => json!(id.trim()),
        _ => Value::Null,
    }
}

/// Lo que el SERVIDOR decidió sobre este cobro tras contrastar la oferta del cliente con las
/// fuentes de confianza del hub (catálogo de métodos de pago y ajustes del TPV, pre-cargados por
/// el runtime vía `reads`). Nada de aquí llega del navegador sin validar.
/// ONE leg of the payment (ADR-0386). A sale is charged with N of these; a sale paid the old way
/// has exactly one. Everything here is what the SERVER decided: the name and the canonical type
/// come from the hub catalog, never from the browser.
#[derive(Clone)]
struct Tender {
    /// Catalog id, or `Null` in the degraded case where the runtime delivered no catalog.
    method_id: Value,
    /// Display name, resolved from the hub catalog (localized, what the cashier sees).
    name: String,
    /// Canonical type (`cash` | `card` | `transfer` | `other`) — the value LOGIC keys on (hub#778).
    kind: String,
    /// What this leg covers of the sale total, in cents. The legs add up to the total exactly.
    amount: i64,
    /// What the customer actually handed over on this leg, in cents. Only a `cash` leg can exceed
    /// its `amount`; every other kind is normalised to it (ADR-0386: no cash, no change).
    tendered: i64,
    /// `tendered - amount`, and only ever non-zero on a `cash` leg.
    change: i64,
    /// The order the cashier took the legs in — the receipt prints them in it.
    sort_order: i64,
    /// Free-text trace (a card authorisation code, a transfer reference). Opaque to `sales`.
    reference: String,
}

struct ServerDecision {
    /// Nombre del método de pago **tal y como lo tiene el hub**, no como lo etiquetó el navegador.
    /// Es el valor para DISPLAY (recibo, TPV): localizado, el que el cajero ve.
    payment_method_name: String,
    /// Tipo canónico del método (`cash` | `card` | `transfer` | `other`), también leído del
    /// catálogo del hub. Es el valor para LÓGICA: el cajón de `cash_register` lo usa para decidir
    /// si una venta suma al efectivo esperado, sin depender del `name` localizado (hub#778).
    payment_method_type: String,
    /// Base fiscal de los precios: `true` = brutos (IVA incluido), `false` = base imponible.
    /// `None` = el hub no la ha fijado (sin fila de ajustes o sin `reads`) → manda el payload.
    tax_included: Option<bool>,
    /// Id of the PRINCIPAL tender — the leg the header scalars derive from (ADR-0386).
    payment_method_id: Value,
    /// The legs of this payment, in the order they were taken. Never empty.
    tenders: Vec<Tender>,
    /// Did the caller send `payments[]`? A caller that did not is a one-tender sale whose amount
    /// is only known once the server has computed the total.
    explicit_tenders: bool,
}

/// ¿Una tasa (%) dentro del rango sano 0..=100?
fn rate_in_range(pct: f64) -> bool {
    pct.is_finite() && (0.0..=100.0).contains(&pct)
}

/// STRUCTURE of the offer: what has to hold for the arithmetic to mean anything, whether the
/// ticket is being charged or merely valued (sales#164). Returns whether it carries ANY discount —
/// the hub setting that forbids them is a policy gate, and it lives with the other ones.
///
/// The JSON Schema of the payload already demands this and the runtime validates BEFORE invoking
/// us; this is the second lock, for whoever comes in through another door.
fn validate_checkout_shape(payload: &Value, items: &[Value]) -> Result<bool, Refusal> {
    if items.is_empty() {
        return Err(reject("sales.empty_sale", "a sale needs at least one line"));
    }

    let sale_disc = payload.get("discount_percent").map(|v| as_f64(v, 0.0)).unwrap_or(0.0);
    if !rate_in_range(sale_disc) {
        return Err(reject("sales.discount_out_of_range", format!("sale discount {sale_disc}")));
    }
    let tendered = as_cents(payload.get("amount_tendered").unwrap_or(&Value::Null), 0);
    if tendered < 0 {
        return Err(reject("sales.amount_negative", format!("amount_tendered {tendered}")));
    }

    // sales#113: descuento de IMPORTE FIJO al ticket (céntimos, entero ≥ 0). Se reparte por resto
    // mayor entre las líneas no invitadas (ADR-0210) DESPUÉS de los porcentuales; ver más abajo.
    let sale_disc_amount = as_cents(payload.get("discount_amount").unwrap_or(&Value::Null), 0);
    if sale_disc_amount < 0 {
        return Err(reject("sales.amount_negative", format!("discount_amount {sale_disc_amount}")));
    }
    let mut discounted = sale_disc > 0.0 || sale_disc_amount > 0;
    for item in items {
        let line_disc = item.get("discount").map(|v| as_f64(v, 0.0)).unwrap_or(0.0);
        if !rate_in_range(line_disc) {
            return Err(reject("sales.discount_out_of_range", format!("line discount {line_disc}")));
        }
        discounted = discounted || line_disc > 0.0;
        let rate = item.get("tax_rate").map(|v| as_f64(v, 0.0)).unwrap_or(0.0);
        if !rate_in_range(rate) {
            return Err(reject("sales.tax_rate_out_of_range", format!("tax rate {rate}")));
        }
        for key in ["price", "cost"] {
            let amount = as_cents(item.get(key).unwrap_or(&Value::Null), 0);
            if amount < 0 {
                return Err(reject("sales.amount_negative", format!("{key} {amount}")));
            }
        }
    }
    Ok(discounted)
}

/// sales#317 — **a complete invoice is made out to somebody.** The till charged «Factura» with no
/// customer: the screen handed over a «FACTURA» to «Cliente» while VeriFactu filed an F2, because
/// the hub's `resolve_invoice_type` downgrades an F1 without a recipient — with the chain number
/// already spent. The till now asks before charging; this is the same rule for every other door
/// (the API, the assistant). Name, tax ID and address (art. 6 RD 1619/2012): the same three the
/// simplified-invoice ceiling asks for (`ui/lib/simplified-limit.ts`), so both layers agree.
fn invoice_recipient_is_complete(payload: &Value) -> bool {
    ["customer_name", "customer_tax_id", "customer_address"]
        .iter()
        .all(|key| !field(payload, key).trim().is_empty())
}

/// ── POS settings: the rule lives on the server, not in the button ──
///
/// With no settings row the schema defaults apply (`allow_discounts` yes, `require_customer` no),
/// which is exactly what a freshly installed hub does.
fn hub_setting(context: &Value, key: &str, default: bool) -> bool {
    tax::read_rows(context, "sales.settings.get")
        .unwrap_or_default()
        .first()
        .and_then(|row| row.get(key))
        .filter(|v| !v.is_null())
        .map(as_bool)
        .unwrap_or(default)
}

/// FISCAL BASE (ADR-0210): whether a price already carries the tax inside is a BUSINESS decision,
/// and it decides what gets DECLARED — the same 100.00 € are base 100 + 21 of quota with net
/// prices, and base 82.64 + 17.35 with gross ones. Taking it from the payload was handing the
/// browser the taxable base of the invoice. `None` = no settings row → the payload rules, as it
/// always did. (ADR-0210 moves the ultimate authority to `pricing`'s PRICE LIST, with list → hub →
/// inclusive inheritance; consuming that list is sales#23.)
///
/// 🔴 sales#164: the preview reads it TOO. While only the checkout read it, a hub with the setting
/// at 0 saw «Cobrar 100,00 €» and was charged 121,00 €: the button showed the base and the server
/// charged base + quota.
fn hub_tax_included(context: &Value) -> Option<bool> {
    tax::read_rows(context, "sales.settings.get")
        .unwrap_or_default()
        .first()
        .and_then(|row| row.get("default_tax_included"))
        .filter(|v| !v.is_null())
        .map(as_bool)
}

/// A hub can have discounts switched OFF. The same door for the checkout and for the preview: if
/// the ticket will not be chargeable like this, the preview does not price it either — it is a
/// reason that is fixed on the same screen, and saying it early beats saying it with the card
/// already in hand.
fn enforce_discount_policy(context: &Value, discounted: bool) -> Result<(), Refusal> {
    if discounted && !hub_setting(context, "allow_discounts", true) {
        return Err(reject("sales.discounts_not_allowed", "this hub disabled discounts"));
    }
    Ok(())
}

/// Which door the checkout came through (sales#269) — and therefore whether the shop's discount
/// cap applies. `Approved` is not a favour the payload can ask for: it is reached only from the
/// exported function the runtime binds to `sales.complete_sale_over_limit`, whose permission a
/// cashier does not have.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum CapRule {
    /// The everyday door: the cap in the settings is enforced.
    Enforced,
    /// The manager's door: the cap was already cleared by the permission (or by their PIN).
    Approved,
}

impl CapRule {
    /// The cap to apply, given what the shop configured. `100` is «no cap» either way.
    fn cap(self, context: &Value) -> f64 {
        match self {
            CapRule::Enforced => discount_cap(context),
            CapRule::Approved => 100.0,
        }
    }
}

/// The business cap on a manual discount, as a percentage (sales#269).
///
/// `100` = no cap, and that is deliberately what absence means: a hub with no settings row, and
/// every hub updating from a version that had no column, must keep behaving exactly as it did.
/// The shop opts IN to the control; it is never switched on underneath anybody.
fn discount_cap(context: &Value) -> f64 {
    tax::read_rows(context, "sales.settings.get")
        .unwrap_or_default()
        .first()
        .and_then(|row| row.get("max_discount_percent"))
        .filter(|v| !v.is_null())
        .map(|v| as_f64(v, 100.0))
        .unwrap_or(100.0)
        .clamp(0.0, 100.0)
}

/// Refuses a manual discount bigger than the one the shop lets whoever is charging give alone.
///
/// 🔴 This is the SERVER's copy of the rule, and the one that counts. The till knows the cap too
/// (it reads it to route the charge through the manager's door instead), but a payload that never
/// went through a screen — the API, the assistant, a tampered request — arrives here all the same.
/// A cap that only lived in the button would be a suggestion.
///
/// The ticket percentage and each line's are checked with the same number: capping only the
/// ticket would leave «un 90 % en cada línea» as the way around it. The FIXED amount (sales#113)
/// cannot be judged here — it is cents, and what share of the ticket they are is not known until
/// the lines are valued — so it is checked in `value_checkout`, where the gross exists.
fn enforce_discount_cap(cap: f64, payload: &Value, items: &[Value]) -> Result<(), Refusal> {
    if cap >= 100.0 {
        return Ok(());
    }
    let sale_disc = payload.get("discount_percent").map(|v| as_f64(v, 0.0)).unwrap_or(0.0);
    if sale_disc > cap {
        return Err(reject(
            "sales.discount_over_limit",
            format!("ticket discount {sale_disc} above the {cap} this business allows"),
        ));
    }
    for item in items {
        let line_disc = item.get("discount").map(|v| as_f64(v, 0.0)).unwrap_or(0.0);
        if line_disc > cap {
            return Err(reject(
                "sales.discount_over_limit",
                format!("line discount {line_disc} above the {cap} this business allows"),
            ));
        }
    }
    Ok(())
}

/// Valida el cobro propuesto y devuelve lo que el servidor decide.
///
/// # Por qué existe
///
/// `complete_sale` recalculaba la aritmética pero aceptaba como AUTORIDAD lo que mandaba el
/// navegador: estado de la venta, método de pago, descuentos sin techo, cero líneas. Una UI con un
/// bug, una integración o una petición manipulada creaba ventas vacías, negativas o infravaloradas
/// y aun así disparaba `inventory`, `cash_register` e `invoice` — porque el handler emitía
/// `sale.completed` pasara lo que pasara.
///
/// Aquí se cierra el contrato en el único sitio donde el cliente no llega:
///
/// 1. **Estructura**: al menos una línea, importes no negativos, tasas en 0..=100. El JSON Schema
///    del payload ya lo exige (el runtime valida ANTES de invocarnos); esto es la segunda cerradura
///    para quien entre por otro camino.
/// 2. **Ajustes del hub** (`sales.settings.get`): `allow_discounts` y `require_customer` dejan de
///    ser un botón escondido en la UI y pasan a ser una regla.
/// 3. **Método de pago** (`sales.payment_methods`): la query ya filtra activo + no borrado + del
///    hub, así que el catálogo pre-cargado ES la lista legítima. Si el runtime lo entrega y no está
///    vacío, manda: un id que no esté ahí (inactivo, borrado, de otro hub, inventado) se rechaza y
///    el NOMBRE del recibo sale de la fila, no del payload. Si no lo entrega —runtime sin `reads` o
///    hub sin métodos sembrados— se degrada al payload: cobrar es lo último que puede romperse.
fn decide_checkout(payload: &Value, context: &Value, items: &[Value], cap: f64) -> Result<ServerDecision, Refusal> {
    let discounted = validate_checkout_shape(payload, items)?;
    enforce_discount_policy(context, discounted)?;
    enforce_discount_cap(cap, payload, items)?;
    if hub_setting(context, "require_customer", false) && field(payload, "customer_id").is_empty() {
        return Err(reject("sales.customer_required", "this hub requires a customer on every sale"));
    }
    if field(payload, "document_type") == "invoice" && !invoice_recipient_is_complete(payload) {
        return Err(reject(
            "sales.invoice_recipient_incomplete",
            "a complete invoice needs the customer's name, tax id and address",
        ));
    }
    let tax_included = hub_tax_included(context);

    // ── Método de pago: del catálogo del hub o de ningún sitio ──
    // El catálogo es la fuente de confianza para DOS cosas a la vez (hub#778):
    //   - `name`  → display (recibo, TPV): localizado, el que el cajero ve.
    //   - `type`  → lógica: `cash` | `card` | `transfer` | `other`, canónico. El cajón de
    //               cash_register lo usa para saber si una venta suma al efectivo esperado,
    //               sin depender del `name` localizado («Efectivo» ≠ «cash»).
    let catalog = tax::read_rows(context, "sales.payment_methods");

    // ── The legs of the payment (ADR-0386) ──
    // `payments[]` is the mixed-payment form; the scalars are the one-tender form every caller
    // alive today still speaks. BOTH end up as a `Vec<Tender>` so nothing downstream — the child
    // rows, the header scalars, the event — has to know which door the sale came through.
    let declared = payload.get("payments").and_then(|v| v.as_array());
    let explicit_tenders = declared.map(|a| !a.is_empty()).unwrap_or(false);
    let mut tenders: Vec<Tender> = Vec::new();

    if explicit_tenders {
        for (i, leg) in declared.unwrap().iter().enumerate() {
            let id = field(leg, "payment_method_id");
            let (name, kind) = resolve_method(
                &catalog,
                &id,
                str_or(leg, "payment_method_name", ""),
                str_or(leg, "payment_method_type", "cash"),
            )?;
            // A zero or negative leg is not a way of paying, it is noise that would make the
            // "adds up to the total" check pass with a row that means nothing.
            let amount = as_cents(leg.get("amount").unwrap_or(&Value::Null), 0);
            if amount <= 0 {
                return Err(reject("sales.amount_negative", format!("payment amount {amount}")));
            }
            let tendered = match leg.get("amount_tendered") {
                Some(v) if !v.is_null() => as_cents(v, 0),
                _ => amount,
            };
            if tendered < 0 {
                return Err(reject("sales.amount_negative", format!("amount_tendered {tendered}")));
            }
            tenders.push(Tender {
                method_id: if id.is_empty() { Value::Null } else { json!(id) },
                name,
                kind,
                amount,
                tendered,
                change: 0,
                sort_order: i as i64,
                reference: str_or(leg, "reference", ""),
            });
        }
    } else {
        let method_id = field(payload, "payment_method_id");
        let (name, kind) = resolve_method(
            &catalog,
            &method_id,
            str_or(payload, "payment_method_name", ""),
            str_or(payload, "payment_method_type", "cash"),
        )?;
        // `amount`/`tendered` stay at 0 here on purpose: a one-tender sale covers the TOTAL, and
        // the total is not known until the lines have been priced. `complete_sale_pure` fills it.
        tenders.push(Tender {
            method_id: payload.get("payment_method_id").cloned().unwrap_or(Value::Null),
            name,
            kind,
            amount: 0,
            tendered: 0,
            change: 0,
            sort_order: 0,
            reference: String::new(),
        });
    }

    // THE PRINCIPAL TENDER is the largest leg — ties go to the one taken first. The header scalars
    // are derived from it while consumers still read them (`sales.get`, the receipt, `invoice`);
    // they stopped being an input the moment `payments[]` exists.
    let principal = tenders
        .iter()
        .enumerate()
        .max_by_key(|(i, t)| (t.amount, -(*i as i64)))
        .map(|(_, t)| t)
        .expect("a payment always has at least one leg");

    Ok(ServerDecision {
        payment_method_name: principal.name.clone(),
        payment_method_type: principal.kind.clone(),
        payment_method_id: principal.method_id.clone(),
        tax_included,
        tenders,
        explicit_tenders,
    })
}

/// Resolves ONE payment method against the hub catalog the runtime pre-loads.
///
/// The catalog query already filters active + not deleted + of this hub, so a catalog that arrives
/// non-empty IS the legitimate list: an id that is not in it (deactivated, deleted, from another
/// hub, invented) is refused, and the NAME and canonical TYPE come from the row, never from the
/// browser (sales#20, hub#778).
///
/// Graceful degradation, same rule as the tax catalog: if the runtime delivered no catalog there is
/// nothing to validate against and the POS still has to be able to charge, so the payload's own
/// labels are used. Without a known `type` we assume `cash` — the default of
/// `sales_payment_method.type`, and the assumption that damages the count least.
fn resolve_method(
    catalog: &Option<Vec<&Value>>,
    method_id: &str,
    fallback_name: String,
    fallback_type: String,
) -> Result<(String, String), Refusal> {
    match catalog {
        Some(rows) if !rows.is_empty() => {
            if method_id.is_empty() {
                return Err(reject("sales.payment_method_required", "the sale has no payment method"));
            }
            let row = rows
                .iter()
                .find(|row| field(row, "id") == method_id)
                .ok_or_else(|| reject("sales.payment_method_not_available", method_id))?;
            Ok((field(row, "name"), field(row, "type")))
        }
        _ => Ok((fallback_name, fallback_type)),
    }
}
/// **Who attended** (sales#179), resolved by the server and never blank while there is a session.
///
/// Precedence: the payload's `field` (the appointment's professional, or the person a check was
/// transferred to) → the user holding the SESSION (`context.current_user_id`). It only returns
/// `Null` when the runtime gave no user, which is a path with no session (seed, internal task).
///
/// An EMPTY string is not an attribution: the till sends `null` when there is no appointment and
/// integrations send `""`. Both fall back to the session user.
fn attributed_person(payload: &Value, field: &str, session_user: &str) -> Value {
    let named = payload.get(field).map(as_str).unwrap_or_default();
    if !named.is_empty() {
        return json!(named);
    }
    if !session_user.is_empty() {
        return json!(session_user);
    }
    Value::Null
}

/// Who the SALE is attributed to (`sales_sale.staff_id`). See [`attributed_person`].
fn attributed_staff(payload: &Value, session_user: &str) -> Value {
    attributed_person(payload, "staff_id", session_user)
}


/// ONE line already priced: exactly the figures the sale would write on its row.
#[derive(Clone)]
struct ValuedLine {
    /// Net, quota and gross of the line, with every discount (line, ticket-wide and fixed amount)
    /// ALREADY applied. It is what gets persisted and what travels in `sale.completed`.
    t: LineTotals,
    /// This line's breakdown by RATE: `(key, net, quota)`. Aggregates into the sale's breakdown.
    parts: Vec<(String, i64, i64)>,
    is_gift: bool,
    covered: bool,
    /// Tax rule resolved against the trusted catalogue (ADR-0085), with its components.
    resolved: ResolvedTax,
    /// Combined rate (sum of the components) — the one frozen on the row and sent in the event.
    combined_pct: f64,
    /// Unit price THE SERVER decided (catalogue, or the combo's split), supplements included.
    unit_price: i64,
    /// Quantity in fixed point, scale 10⁶ (ADR-0147).
    qty: i64,
    line_disc: f64,
    /// The line as it came in (already expanded when it came from a set menu).
    item: Value,
    /// Immutable snapshot of the supplements, in the order they were chosen (pm#93).
    modifiers: String,
    /// sales#156 — the line's free-text note, taken from the open check's ROW when there is one.
    /// It decides no money (the valuation ignores it): it rides here so the row that gets written
    /// says the same thing the kitchen ticket said.
    note: String,
    /// Which set menu it came out of, with its frozen snapshot (ADR-0381). `None` = a plain line.
    combo: Option<ComboLine>,
    /// The line THIS one hangs from, by index into [`Valuation::lines`] (sales#147). It becomes
    /// `parent_line_ref` when the batch of ids is handed out, and it lets the preview answer the
    /// same hierarchy the sale persists without inventing ids that do not exist.
    parent: Option<usize>,
}

/// WHAT A TICKET IS WORTH: its priced lines, the breakdown by rate and the totals. Nothing in
/// here knows how to write anywhere.
struct Valuation {
    lines: Vec<ValuedLine>,
    /// Aggregate taxable base (cents).
    subtotal: i64,
    /// What is charged (cents), with the discounts already prorated across the lines.
    total: i64,
    /// What the discounts took off — informative, for the receipt (cents).
    discount_amount: i64,
    /// Cost of the comped lines, for the cash count (cents).
    gift_total: i64,
    /// DECLARED quota: computed once per tax rate over the aggregate base (ADR-0123 §4).
    tax_total: i64,
    /// The closed breakdown, exactly as it is persisted and travels:
    /// `{ "21.00": { base, tax, kind, label } }`.
    tax_breakdown: Value,
    /// Effective fiscal base of this ticket (`true` = the prices carry the tax inside).
    tax_included: bool,
    /// Fiscal identity of the hub the rules were resolved with (ADR-0085).
    country_code: String,
    region_code: String,
}

/// ── sales#164 / #172 · THE VALUATION, IN ONE SINGLE PLACE ────────────────────────────────────
///
/// Prices a ticket with the arithmetic of the checkout and **without charging it**: expands the set
/// menus, resolves each line's price and rate against the trusted catalogues, prorates the
/// discounts (ADR-0210) and closes the breakdown by rate (ADR-0123 §4).
///
/// # Why it exists
///
/// There was no door to ask "how much does this really add up to?" without charging. The till
/// answered with ITS OWN arithmetic (`cartTotal`), and the server refuses legs of a mixed payment
/// that do not add up **to the cent** (`sales.payments_do_not_match_total`). With prices that do
/// NOT carry the tax inside, the two answers did not differ by a rounding cent but by the WHOLE
/// VAT, on every sale. The fix is emphatically NOT a second implementation in the browser: a
/// second implementation of the fiscal arithmetic is the very bug that refusal exists to catch.
///
/// Hence: **one function, two callers** — [`complete_sale_pure`], which charges, and
/// [`preview_checkout_pure`], which only answers.
///
/// `id_budget` = how many ids the host's batch carries (`context.new_ids`). A set menu MULTIPLIES
/// lines, so the expansion can overflow it and is refused here, at the same point and in the same
/// order as before. `None` = a preview, which consumes no id at all.
fn value_checkout(
    payload: &Value,
    context: &Value,
    sale_id: &str,
    tax_incl: bool,
    id_budget: Option<usize>,
    cap: f64,
) -> Result<Valuation, Refusal> {
    let empty: Vec<Value> = Vec::new();
    let items = payload.get("items").and_then(|v| v.as_array()).unwrap_or(&empty);
    let now = context.get("now").map(as_str).unwrap_or_default();
    let sale_disc = payload.get("discount_percent").map(|v| as_f64(v, 0.0)).unwrap_or(0.0);
    let sale_disc_amount = as_cents(payload.get("discount_amount").unwrap_or(&Value::Null), 0); // sales#113

    // Identidad fiscal del hub (ADR-0085): país/región DEL CONTEXTO (hub_settings, inyectado por el
    // runtime — no del cliente). Con ellos + la categoría de la línea se resuelve la regla de tipo.
    let cc = context.get("country_code").map(as_str).unwrap_or_default();
    let rc = context.get("region_code").map(as_str).unwrap_or_default();
    // The rules are dated by day: read them on the business clock (sales#323).
    let date = business_date(context, &now);

    // Catálogo fiscal de confianza pre-cargado por el runtime (ADR-0085, reads taxes.rules.list —
    // `required` desde sales#21/hub#701). `&Value::Null` as the payload fallback ON PURPOSE: in
    // `taxes.calculate` the caller may hand its own catalog for an ad-hoc calculation, but here the
    // payload IS the browser — a client able to inject `rules` would price its own VAT.
    // `catalog_delivered` distingue «la read llegó (aunque vacía)» de «no llegó»: lo primero es un
    // hub sin reglas, lo segundo un runtime que no honra `required` — ninguno cobra con el IVA del
    // navegador, pero se rechazan con códigos distintos para que el encargado sepa qué mirar.
    let catalog_delivered = tax::CATALOG_READS.iter().any(|q| tax::read_rows(context, q).is_some());
    let catalog = tax::rule_catalog(context, &Value::Null);

    let mut subtotal: i64 = 0; // céntimos
    let mut gross: i64 = 0; // céntimos (CON descuento global ya prorrateado)
    let mut gross_pre_disc: i64 = 0; // céntimos (sin descuento global → discount_amount)
    let mut gift_total: i64 = 0; // céntimos: coste de las invitaciones (para el arqueo, ADR-comp)
    let mut breakdown: Vec<(String, i64, i64)> = Vec::new();
    // sales#293 — el mismo cierre, sobre las líneas SIN el descuento global: `discount_amount` es
    // la diferencia entre los dos totales, y si uno se cierra por tipo y el otro se compone
    // sumando líneas, el tique enseña un descuento que nadie hizo.
    let mut pre_subtotal: i64 = 0;
    let mut pre_breakdown: Vec<(String, i64)> = Vec::new();
    // sales#54: qué es cada clave del desglose (`kind`, `label`) — la primera línea que la aporta manda.
    let mut breakdown_meta: std::collections::HashMap<String, (String, String)> = std::collections::HashMap::new();
    // sales#113: las líneas se calculan primero y se emiten después (el importe fijo se reparte
    // cuando se conocen todas).
    let mut pending_lines: Vec<ValuedLine> = Vec::new();

    // El catálogo de venta que el runtime pre-carga (`inventory.products.for_sale`, sales#68). Sin
    // bloque `list` a propósito: una read paginada entregaría solo 50 filas, en silencio (hub#650).
    let product_catalog = tax::read_rows(context, "inventory.products.for_sale");
    // Catálogo de suplementos (pm#93). Lectura OPCIONAL: `None` = `modifiers` no está instalado,
    // y entonces una línea CON suplementos se rechaza en `authoritative_modifiers` (falla cerrado).
    let modifier_catalog = tax::read_rows(context, "modifiers.options.all");
    // Catálogo de combos (sales#152 / ADR-0381). Lectura OPCIONAL igual que la de suplementos:
    // `None` = `combos` no está instalado, y entonces una línea CON `combo_id` se rechaza en
    // `expand_combo` (falla cerrado). Sin bloque `list` en origen — es autoridad de precio, y una
    // read paginada entregaría 50 filas y callaría sobre el resto (hub#650).
    let combo_catalog = tax::read_rows(context, "combos.options.all");
    // sales#175 — THE ROWS OF THE OPEN CHECK. This is the read that makes a table pay the price it
    // had when it ordered: every row was written by the SERVER with the catalogue in hand
    // (`open_order` / `add_order_line`), so honouring it is not honouring the payload. It is
    // delivered parameterised by `payload.order_id`, so a counter sale gets nothing here — and
    // there the catalogue still rules, which is right: there is no earlier "when it was ordered".
    let order_lines = tax::read_rows(context, "sales.order.lines");

    // 🔴 EL COMBO SE ARMA UNA SOLA VEZ, aquí, y de esto beben las DOS rutas: las filas que se
    // persisten y el evento `sale.completed` del que salen la factura y el registro de la AEAT. Si
    // cada una expandiera por su cuenta, un día dirían cosas distintas.
    // 🔴 Y con ellas SALE LA HIJA de todo suplemento que tribute distinto (sales#147): también una
    // sola vez, también del lado del servidor, por la MISMA puerta. Una segunda ruta del dinero es
    // una segunda ruta que mantener y auditar.
    let lines_in = expand_lines(items, sale_id, combo_catalog.as_ref(), product_catalog.as_ref(), modifier_catalog.as_ref(), order_lines.as_ref())?;
    // La tanda de ids del host es finita (256, ARQUITECTURA.md §5.3) y un combo —o un suplemento
    // con tipo fiscal propio— MULTIPLICA líneas. Sin este guard la línea 256 saldría con id vacío,
    // y el fallo aparecería como una colisión de clave primaria en la BD, lejos de su causa.
    if let Some(budget) = id_budget {
        if lines_in.len() + 1 > budget {
            return Err(reject(
                "sales.too_many_lines",
                format!("{} lines need {} ids, the batch has {}", lines_in.len(), lines_in.len() + 1, budget),
            ));
        }
    }

    for expanded in lines_in.iter() {
        let item = &expanded.item;
        let combo = &expanded.combo;
        // El precio SALE DEL CATÁLOGO si la línea dice ser de catálogo. El del payload es una
        // propuesta, no un hecho.
        // sales#175/#200: the ROW of the open check this line comes from, resolved ONCE — it is
        // the authority for both the base price and the supplements' frozen delta.
        let frozen = frozen_order_line(item, order_lines.as_ref())?;
        let from_catalog = line_price(item, frozen, product_catalog.as_ref())?;
        // sales#156 — the line's NOTE rides the SAME row, for the same reason: the check was
        // charged what it was ordered at, and it must be cooked what it was ordered as. With no
        // open check (counter sale) the note comes from the call itself, because the line is born
        // and charged in the same breath. It decides no money, so there is nothing to verify it
        // against — but where a row DOES exist, the row is what the kitchen was given and what
        // the customer's paper has to agree with.
        let note = match frozen {
            Some(row) => field(row, "notes"),
            None => line_note(item),
        };
        let (unit_price, item_cost) = match &from_catalog {
            Some((price, cost, _)) => (*price, *cost),
            None => (
                as_cents(item.get("price").unwrap_or(&Value::Null), 0), // céntimos
                as_cents(item.get("cost").unwrap_or(&Value::Null), 0),
            ),
        };
        // pm#93: el suplemento suma al PRECIO UNITARIO, así que el descuento de línea, el
        // prorrateo del descuento global, el punto fijo y el redondeo HALF_UP siguen siendo los
        // mismos. Una segunda ruta del dinero sería una segunda ruta que mantener y auditar.
        // sales#152: en una línea de combo el precio lo decidió el SERVIDOR al repartir el precio
        // cerrado; el del catálogo del producto es el PESO que ya se usó para repartirlo, no lo que
        // se cobra. Aquí no hay una segunda ruta del dinero: el resto de la maquinaria sigue igual.
        let unit_price = match combo { Some(c) => c.unit_price, None => unit_price };
        // La categoría de una línea de combo la fijó el servidor: la del combo si es prestación
        // única (art. 91.Uno.2.2º), la del componente si el pack se repartió (art. 79.Dos).
        // Resolved BEFORE the supplements because it is what an option's own category is checked
        // against (sales#147): a supplement that taxes differently cannot be folded into this
        // line's price without inheriting its rate.
        let catalog_cat = match combo {
            Some(c) => Some(c.tax_category_key.as_str()),
            None => from_catalog.as_ref().map(|(_, _, cat)| cat.as_str()),
        };
        // sales#147: la promoción a línea hija ya la decidió `expand_lines`. En una línea normal
        // aquí solo quedan los suplementos que SÍ se pliegan en su precio unitario; en una hija no
        // se pliega ninguno —su precio ES el delta— y el snapshot solo dice de qué opción salió.
        let (modifier_delta, modifier_snapshot) = match &expanded.own {
            Some(entry) => (0, encode_modifiers(vec![entry.clone()])?),
            None => fold_modifiers(&expanded.folded)?,
        };
        let unit_price = unit_price + modifier_delta;
        // Cantidad en punto fijo 10⁶ (ADR-0147) + rechazo fuera de rejilla; y la cantidad de
        // precio KPEIN («37 céntimos por 100 ud») que hace exacto el sub-céntimo sin tocar el dinero.
        let qty = line_qty(item)?;
        let price_qty = line_price_qty(item);
        let line_disc = item.get("discount").map(|v| as_f64(v, 0.0)).unwrap_or(0.0);
        // ADR-0085: resuelve el impuesto por CATEGORÍA desde el catálogo de confianza
        // (server-authoritative, raíz + componentes), con país/región del contexto y fallback
        // graceful al `tax_rate` del payload. El cliente NO es autoridad del %.
        let resolved = resolve_line_tax(item, catalog_cat, &catalog, catalog_delivered, &cc, &rc, &date)?;
        for c in &resolved.components {
            breakdown_meta.entry(c.rate_key.clone()).or_insert_with(|| (c.kind.clone(), c.label.clone()));
        }
        let components = &resolved.components;
        // Tasa combinada que persistimos en la línea (== suma de componentes; para un tipo
        // simple es su propio %). Es la cifra que ve invoice/listeners en `tax_rate`.
        let combined_pct: f64 = components.iter().map(|c| c.rate_pct).sum();
        // INVITACIÓN/REGALO (comp): una línea marcada `is_gift` NO se cobra (net/tax/total = 0) y no
        // entra en el desglose de IVA (base 0). Acumula su COSTE (a coste, decisión del humano) en
        // `gift_total` para el arqueo "Invitaciones". Sigue descontando stock (el evento lleva qty).
        let is_gift = item.get("is_gift").map(as_bool).unwrap_or(false);
        // CUBIERTA POR UN TENDER EXTERNO (sales#162 / ADR-0386): otro módulo ya cobró esta línea
        // —el bono de `services` cubre LÍNEAS enteras, no importes— así que aquí vale net/tax/total
        // = 0 y NO entra en el desglose de IVA. Sigue en la venta: la clienta se llevó el corte y
        // el tique tiene que nombrarlo. Fiscalmente es lo correcto para un bono univalente: el
        // registro salió al VENDER el bono y el canje «no se considerará una operación
        // independiente» (art. 30 ter.1 de la Directiva 2006/112/CE).
        //
        // 🔴 No es un descuento (no toca `discount_amount` ni el ajuste `allow_discounts`) y no es
        // una invitación (no acumula coste en `gift_total`): el salón no regala nada, ya cobró.
        let covered = item.get("covered").map(as_bool).unwrap_or(false);
        // DESCUENTO GLOBAL prorrateado a la LÍNEA (sales#33): factor multiplicativo con el
        // descuento propio de la línea. Así el snapshot fiscal por línea (net/tax) YA lleva el
        // descuento y TODO lo que deriva de él —desglose por tipo, evento `sale.completed`,
        // factura de `invoice`— declara lo COBRADO. Antes el descuento solo tocaba `total` y la
        // AEAT recibía la base sin descontar (cliente paga 4,50 €, factura decía 5,00 €).
        // La columna `discount_percent` de la línea conserva SOLO el suyo (el global va en el header).
        let eff_disc = 100.0 * (1.0 - (1.0 - line_disc / 100.0) * (1.0 - sale_disc / 100.0));
        let (t, parts) = if covered {
            (LineTotals { net: 0, tax: 0, line: 0 }, Vec::<(String, i64, i64)>::new())
        } else if is_gift {
            // El coste de una invitación va al arqueo (`gift_total`), así que también es un número
            // que decide dinero: sale del catálogo cuando la línea es de catálogo (sales#68).
            let cost = item_cost;
            // Coste × cantidad por el SDK (un HALF_UP): 0,5 kg a coste 8,00 €/kg son 4,00 €.
            gift_total += calculate_line_amount(
                cost,
                QuantityValue::from_raw(qty),
                QuantityValue::from_raw(QUANTITY_SCALE),
            )
            .map_err(|e| broken(format!("gift_cost_overflow: {e:?}")))?;
            (LineTotals { net: 0, tax: 0, line: 0 }, Vec::<(String, i64, i64)>::new())
        } else {
            calc_line_components(unit_price, qty, price_qty, eff_disc, tax_incl, components)
        };
        // Bruto SIN descuento global (mismo cálculo con solo el descuento de línea): la resta de
        // ambos brutos es el `discount_amount` que ve el cliente en el ticket.
        let pre = if is_gift || covered || sale_disc <= 0.0 {
            (t, parts.clone())
        } else {
            calc_line_components(unit_price, qty, price_qty, line_disc, tax_incl, components)
        };
        gross_pre_disc += pre.0.line;
        if !tax_incl {
            pre_subtotal += pre.0.net;
            for (k, base, _) in pre.1.iter() {
                match pre_breakdown.iter_mut().find(|(bk, _)| bk == k) {
                    Some(e) => e.1 += *base,
                    None => pre_breakdown.push((k.clone(), *base)),
                }
            }
        }
        // sales#113: la línea se guarda calculada; el importe fijo se reparte cuando se conocen
        // TODAS (fase 2, más abajo) y solo entonces se agrega y se emite.
        pending_lines.push(ValuedLine { t, parts, is_gift, covered, resolved, combined_pct, unit_price, qty, line_disc, item: item.clone(), modifiers: modifier_snapshot, note, combo: combo.clone(), parent: expanded.parent });
    }

    // ── Fase 2 (sales#113): reparto del importe fijo por RESTO MAYOR entre las líneas cobradas ──
    if sale_disc_amount > 0 {
        // Una línea que no se cobra (invitación o cubierta por otro tender) pesa 0: darle un trozo
        // del importe fijo lo aplicaría sobre un 0 y el descuento se evaporaría, cobrando de más.
        // sales#295 — the amount comes off the figure the prices are written in: the GROSS when the
        // VAT rides inside the price (what the customer pays), the BASE when it rides on top (net
        // prices, the B2B price list). That figure is both the weight and the ceiling.
        let weights: Vec<i64> = pending_lines
            .iter()
            .map(|l| if l.is_gift || l.covered { 0 } else if tax_incl { l.t.line } else { l.t.net })
            .collect();
        let payable: i64 = weights.iter().sum();
        if sale_disc_amount > payable {
            return Err(reject("sales.discount_out_of_range", format!("discount_amount {sale_disc_amount} above the payable {payable}")));
        }
        // sales#269: the business cap, applied to the only lever that is not a percentage. 3,00 €
        // of gross with the cap at 10 % buys 30 cents — without this, «2,00 € de descuento» walks
        // straight past a percentage cap and the control means nothing. Basis points so a cap with
        // decimals stays exact integer arithmetic; the floor rounds AGAINST the discount, which is
        // the safe direction for a control.
        if cap < 100.0 {
            let allowed = ((payable as i128 * (cap * 100.0).round() as i128) / 10_000) as i64;
            if sale_disc_amount > allowed {
                return Err(reject(
                    "sales.discount_over_limit",
                    format!("discount_amount {sale_disc_amount} is more than the {cap} of the {payable} gross this business allows"),
                ));
            }
        }
        let shares = allocate_amount(sale_disc_amount, &weights);
        for (l, share) in pending_lines.iter_mut().zip(shares) {
            let comps = l.resolved.components.clone();
            if tax_incl {
                apply_amount_discount(&mut l.t, &mut l.parts, share, &comps);
            } else {
                apply_amount_discount_to_base(&mut l.t, &mut l.parts, share);
            }
        }
    }

    // ── Phase 3: aggregate. The quota that gets DECLARED is closed ONCE per TAX RATE over the
    // AGGREGATE (ADR-0123 §4) — never by summing the already-rounded quotas of each line, which is
    // the product-by-product rounding the TEAC censures (RG 2233/2022). It is also the only shape
    // the VeriFactu XML can represent: `DetalleDesglose` is per rate (max. 12), there is no detail
    // per article. `t.tax` stays as the line's own informative figure.
    //
    // sales#292 — WHAT it closes over depends on where the price carries the tax, and ADR-0123 §4
    // writes BOTH cases:
    //
    //   * **VAT INSIDE the price** (the till, art. 88.Uno LIVA): the anchor is what the customer
    //     PAID, so the rate closes over its GROSS — `base = round(gross / (1 + rate))` and
    //     **`quota = gross − base`, by difference**, «so that what is charged does not move a
    //     single cent because of the rounding». Closing it as `base × rate` over the sum of the
    //     line bases declared 4,55 + 0,46 = 5,01 on a 5,00 € loaf at 10 %: the same sale carried
    //     two different VAT figures, the declared one did not add up to the till, and it travelled
    //     to the row, to the receipt and to the invoice.
    //   * **VAT ON TOP** (B2B): the anchor is the base, so the rate closes over the AGGREGATE
    //     base — `quota = round(base × rate)` — and the total is DERIVED from it, `total =
    //     Σ (base + quota)`. sales#293: that derivation has to actually happen. Composing the
    //     total out of each line's `net + round(net × rate)` instead left the declaration a cent
    //     BELOW the charge (two 0,03 € articles at 21 %: 0,07 € booked, 0,08 € taken). The close
    //     for this mode is further down, after the profiles.
    //
    // With the tax inside, the gross is grouped by TAX PROFILE (the components that tax the line:
    // a plain rate, or 21 % + 5,2 % of equivalence surcharge) because that is the unit that shares
    // a divisor — the gross of a line taxed at 21 % + 5,2 % cannot be divided by 1,21. A line that
    // charges nothing (comped, or covered by another tender) declares nothing: it brings no part.
    //
    // (sales#33: the bases already arrive WITH the ticket-wide discount prorated across the lines,
    // so there is nothing to discount here — only the rate to close.)
    let mut profiles: Vec<(Vec<TaxComponent>, i64)> = Vec::new(); // (components, gross of the profile)
    for l in pending_lines.iter() {
        gross += l.t.line;
        if l.parts.is_empty() {
            continue;
        }
        if tax_incl {
            let comps = &l.resolved.components;
            match profiles.iter_mut().find(|(c, _)| same_profile(c, comps)) {
                Some(p) => p.1 += l.t.line,
                None => profiles.push((comps.clone(), l.t.line)),
            }
        } else {
            subtotal += l.t.net;
            // Desglose por componente: una clave por tasa (los grupos aportan varias, p.ej.
            // "21.00" + "5.20"). Agrega sobre el desglose global de la venta.
            for (k, base, tax) in l.parts.iter() {
                if let Some(e) = breakdown.iter_mut().find(|(ek, _, _)| ek == k) {
                    e.1 += base;
                    e.2 += tax;
                } else {
                    breakdown.push((k.clone(), *base, *tax));
                }
            }
        }
    }

    let mut tax_total: i64 = 0;
    // One division per profile, one quota by difference, and that quota split across the components
    // exactly as a line splits it. `subtotal + tax_total == total` then holds by construction: the
    // profiles partition the gross of the ticket.
    for (comps, profile_gross) in profiles.iter() {
        let combined_pct: f64 = comps.iter().map(|c| c.rate_pct).sum();
        let divisor = Decimal::ONE
            + Decimal::from_f64(combined_pct).unwrap_or(Decimal::ZERO) / Decimal::from(100);
        let base = money::round(Decimal::from(*profile_gross) / divisor);
        let quota = *profile_gross - base;
        subtotal += base;
        tax_total += quota;
        // Merge inside the profile first: two components with the SAME key are one base taxed
        // twice, not two bases (parity with `calc_line_components`).
        let mut merged: Vec<(String, i64)> = Vec::new();
        for (c, share) in comps.iter().zip(split_quota(quota, comps)) {
            match merged.iter_mut().find(|(k, _)| *k == c.rate_key) {
                Some(e) => e.1 += share,
                None => merged.push((c.rate_key.clone(), share)),
            }
        }
        for (k, share) in merged {
            match breakdown.iter_mut().find(|(bk, _, _)| *bk == k) {
                Some(e) => {
                    e.1 += base;
                    e.2 += share;
                }
                None => breakdown.push((k, base, share)),
            }
        }
    }

    // ── sales#293 · VAT ON TOP: the total is DERIVED from the declaration ────────────────────
    //
    // ADR-0123 §4 closes the chain for this mode: `base_rate = Σ lines of the rate` (an exact sum)
    // → `quota_rate = round(base_rate × rate)` ← the only rounding → **`total = Σ (base_rate +
    // quota_rate)`**, which «adds up by construction». The close did the first two steps and then
    // let the total be composed by summing `net + round(net × rate)` of EACH line — the
    // product-by-product rounding the TEAC censures (RG 2233/2022) — so the two counts had no
    // reason to agree: two 0,03 € articles at 21 % took 0,08 € from the customer and booked 0,07 €.
    //
    // The declared figure wins, and what is charged follows it. So that the receipt still adds up,
    // each line gets its share of the quota ALREADY DECLARED, by largest remainder over the bases
    // that produced it (ADR-0210, the same split the fixed-amount discount uses): nobody has to
    // choose between adding up for the AEAT and adding up for the till drawer.
    if !tax_incl {
        for (k, base, tax) in breakdown.iter_mut() {
            let rate = Decimal::from_str(k).unwrap_or(Decimal::ZERO);
            let quota = money::percent_of(*base, rate);
            tax_total += quota;
            *tax = quota; // the declared quota, not the sum of the per-line ones
            let weights: Vec<i64> = pending_lines
                .iter()
                .map(|l| l.parts.iter().find(|(pk, _, _)| pk == k).map(|(_, b, _)| *b).unwrap_or(0))
                .collect();
            for (l, share) in pending_lines.iter_mut().zip(share_by_weight(quota, &weights)) {
                if let Some(part) = l.parts.iter_mut().find(|(pk, _, _)| pk == k) {
                    part.2 = share;
                }
            }
        }
        for l in pending_lines.iter_mut() {
            if l.parts.is_empty() {
                continue; // comped or covered by another tender: it charges nothing and declares nothing
            }
            l.t.tax = l.parts.iter().map(|(_, _, tax)| *tax).sum();
            l.t.line = l.t.net + l.t.tax;
        }
        gross = pending_lines.iter().map(|l| l.t.line).sum();
        // The same close over the ticket WITHOUT the global discount, so `discount_amount` stays
        // the difference between two totals measured the same way (0 when there is no discount).
        gross_pre_disc = pre_subtotal
            + pre_breakdown
                .iter()
                .map(|(k, base)| money::percent_of(*base, Decimal::from_str(k).unwrap_or(Decimal::ZERO)))
                .sum::<i64>();
    }

    let mut tb = Map::new();
    for (k, base, tax) in &breakdown {
        // `tax` is the DECLARED quota in both modes: closed by difference over the gross of the
        // profile when the tax rides inside the price, and the single rounding over the aggregate
        // base when it rides on top. Either way it is what the header and the AEAT receive.
        let cuota = *tax;
        let (kind, label) = breakdown_meta.get(k).cloned().unwrap_or_else(|| ("tax".to_string(), String::new()));
        let mut entry = Map::new();
        entry.insert("base".into(), json!(*base));
        entry.insert("tax".into(), json!(cuota));
        entry.insert("kind".into(), json!(kind)); // sales#54: `tax` | `surcharge` | …
        if !label.is_empty() {
            entry.insert("label".into(), json!(label));
        }
        tb.insert(k.clone(), Value::Object(entry));
    }

    Ok(Valuation {
        lines: pending_lines,
        subtotal,
        total: gross,
        // The ticket-wide discount is ALREADY prorated across the lines: `gross` is what gets
        // charged, and `discount_amount` (informative, for the receipt) is the difference against
        // the gross before it.
        // sales#295 — with net prices the discount is a BASE figure (what was asked for), so it is
        // measured on the base; with the VAT inside, on what the customer pays.
        discount_amount: if tax_incl { gross_pre_disc - gross } else { pre_subtotal - subtotal },
        gift_total,
        tax_total,
        tax_breakdown: Value::Object(tb),
        tax_included: tax_incl,
        country_code: cc,
        region_code: rc,
    })
}

/// ── sales#164 / #172 · THE AUTHORITATIVE PREVIEW ─────────────────────────────────────────────
///
/// Prices the ticket with the arithmetic of the checkout and **does not charge**: zero operations,
/// zero events, not one number of the fiscal chain spent. The answer travels through the handler's
/// `result` channel (hub#70).
///
/// # What it answers
///
/// ```json
/// { "total": 600, "subtotal": 545, "tax_total": 55, "discount_amount": 0, "gift_total": 0,
///   "tax_included": true,
///   "lines": [ { "product_id", "product_name", "tax_category_key", "tax_rate", "quantity",
///                "unit_price", "net_amount", "tax_amount", "line_total",
///                "combo_group_ref", "parent_index", "is_gift", "covered" } ],
///   "tax_breakdown": { "10.00": { "base": 545, "tax": 55, "kind": "tax" } } }
/// ```
///
/// Everything in CENTS (ADR-0007/0123) and everything the sale would write: the sum of
/// `line_total` IS `total`, and for a goods set menu split across rates the art. 79.Dos allocation
/// already carries the residual cent assigned by largest remainder (ADR-0210).
///
/// # What it does NOT do
///
/// * **It does not demand the customer.** `require_customer` is a rule about CLOSING a sale and is
///   fixed on the same screen; refusing to price until it is captured would leave the till without
///   a total for the whole time the check is being built, which is exactly when it needs one.
/// * **It does not look at the ways of paying.** A preview has no legs: who pays is decided
///   afterwards, and precisely WITH this number (`sales.payments_do_not_match_total` stops firing
///   on the normal path).
/// * **It is not idempotent and does not need to be**: it writes nothing.
///
/// Everything else it refuses exactly like the checkout and with the SAME domain code
/// (`sales.empty_sale`, `sales.discounts_not_allowed`, `sales.product_not_available`,
/// `sales.no_tax_rule`, `sales.combo_catalog_unavailable`…): if the ticket is not going to be
/// chargeable, saying so early beats saying it with the card already in hand.
pub fn preview_checkout_pure(input: Value) -> Result<Output, String> {
    finish(preview_checkout_inner(input))
}

/// The valuation itself (sales#201). A business rejection comes back as `Refusal::Domain` and
/// [`finish`] hands it to the caller inside `Output.error` — the preview refuses with the SAME
/// code the charge would, and the till can translate it without parsing prose.
fn preview_checkout_inner(input: Value) -> Result<Output, Refusal> {
    let payload = input.get("payload").cloned().unwrap_or(Value::Null);
    let context = input.get("context").cloned().unwrap_or(Value::Null);
    let empty: Vec<Value> = Vec::new();
    let items = payload.get("items").and_then(|v| v.as_array()).unwrap_or(&empty);

    let discounted = validate_checkout_shape(&payload, items)?;
    enforce_discount_policy(&context, discounted)?;
    let tax_incl = hub_tax_included(&context)
        .unwrap_or_else(|| payload.get("tax_included").map(as_bool).unwrap_or(true));

    // Synthetic `sale_id`: a preview consumes no host ids (`id_budget = None`), but a split goods
    // set menu still needs a `combo_group_ref` the screen can group its siblings by. `preview`
    // makes it plain in the value itself that no such sale exists.
    // sales#269: the preview PRICES, it does not authorise. The cap is not applied here on
    // purpose — refusing to show a total is how the cashier would find out they need the manager
    // *without ever seeing what the ticket comes to*. The approval is asked for at the charge,
    // which is the moment the money moves and the only one that has to be gated.
    let valuation = value_checkout(&payload, &context, "preview", tax_incl, None, 100.0)?;

    let lines: Vec<Value> = valuation
        .lines
        .iter()
        .map(|l| {
            json!({
                "product_id": l.item.get("product_id").cloned().unwrap_or(Value::Null),
                "product_name": as_str(l.item.get("product_name").unwrap_or(&Value::Null)),
                // sales#195: the RESOLVED category, the same one the sale freezes on its row.
                "tax_category_key": l.resolved.category_key.clone(),
                "tax_rate": l.combined_pct,          // combined rate % (server-authoritative)
                "quantity": l.qty,                   // fixed point, scale 10⁶ (ADR-0147)
                "unit_price": l.unit_price,          // cents: what the SERVER decided
                "net_amount": l.t.net,               // cents: taxable base
                "tax_amount": l.t.tax,               // cents: the line's quota
                "line_total": l.t.line,              // cents: what it adds to the total
                // ADR-0381: what makes siblings of one set menu. `null` = a plain line.
                "combo_group_ref": l.combo.as_ref().map(|c| json!(c.group_ref)).unwrap_or(Value::Null),
                // sales#147 — la línea de la que ESTA cuelga, por POSICIÓN en esta misma lista. Un
                // preview no gasta ids del host, así que aquí no hay `parent_line_ref` que dar: la
                // jerarquía que devuelve es la misma que se persistirá, expresada con lo único que
                // existe todavía. `null` = no cuelga de ninguna.
                "parent_index": l.parent.map(|i| json!(i)).unwrap_or(Value::Null),
                "is_gift": l.is_gift,
                "covered": l.covered,
            })
        })
        .collect();

    Ok(Output::new().with_result(json!({
        "total": valuation.total,
        "subtotal": valuation.subtotal,
        "tax_total": valuation.tax_total,
        "discount_amount": valuation.discount_amount,
        "gift_total": valuation.gift_total,
        "tax_included": valuation.tax_included,
        "lines": lines,
        "tax_breakdown": valuation.tax_breakdown,
    })))
}

pub fn complete_sale_pure(input: Value) -> Result<Output, String> {
    finish(complete_sale_inner(input, CapRule::Enforced))
}

/// The MANAGER's door to the very same checkout (sales#269).
///
/// Identical logic; the only difference is that the business discount cap is not applied, because
/// getting HERE already required `sales.discount.over_limit` — a permission a `cashier` does not
/// have, so the runtime answers them `requires_elevation` and the till asks for the manager's PIN
/// (ADR-0238/0246). The sale is then attributed to both: who charged and who authorised.
///
/// 🔴 It is a SEPARATE exported function, not a flag in the payload, because that is the only way
/// the handler can tell the two doors apart: the guest gets `{payload, context}` and the context
/// carries no command name. A flag in the payload would be the client granting itself the
/// permission, which is exactly the hole this closes.
pub fn complete_sale_over_limit_pure(input: Value) -> Result<Output, String> {
    finish(complete_sale_inner(input, CapRule::Approved))
}

/// The decision itself (sales#201). A business rejection comes back as `Refusal::Domain`
/// and [`finish`] hands it to the caller inside `Output.error`, which is the only channel
/// that reaches the browser as a translatable `code`.
fn complete_sale_inner(input: Value, rule: CapRule) -> Result<Output, Refusal> {
    let payload = input.get("payload").cloned().unwrap_or(Value::Null);
    let context = input.get("context").cloned().unwrap_or(Value::Null);
    let empty: Vec<Value> = Vec::new();
    let new_ids = context.get("new_ids").and_then(|v| v.as_array()).unwrap_or(&empty);
    let now = context.get("now").map(as_str).unwrap_or_default();
    let day = day_from_now(&business_date(&context, &now));
    let sale_id = new_ids.first().map(as_str).unwrap_or_default();

    // sales#179 — **WHO ATTENDED cannot be left blank.** The till never asked for the waiter and
    // only `appointments` sent `staff_id`, so every counter sale stayed unattributed:
    // `sales.by_staff` came back empty, the kitchen ticket did not say who fired it, and there was
    // no basis for tips nor for auditing discounts per person. The market (Toast, Square for
    // Restaurants, Lightspeed) pins the *server* to the check from the moment it opens, and lets
    // it be transferred. Here: whoever the payload names wins (the appointment, or a transferred
    // check) and, when nobody is named, the user holding the SESSION — resolved on the server from
    // `context.current_user_id`, the same non-forgeable id that already writes `employee_id`.
    //
    // `staff_id` (who attended) is still a different thing from `employee_id` (who charged): on a
    // sale attributed to somebody else the two differ, and that difference is the audit trail.
    let session_user = context.get("current_user_id").map(as_str).unwrap_or_default();
    let staff_id = attributed_staff(&payload, &session_user);


    let sale_disc = payload.get("discount_percent").map(|v| as_f64(v, 0.0)).unwrap_or(0.0);
    let items = payload.get("items").and_then(|v| v.as_array()).unwrap_or(&empty);

    // ── IDEMPOTENCIA (sales#20) ──────────────────────────────────────────────────────────────
    // Un cobro se reintenta: se va el wifi, el camarero vuelve a pulsar, el navegador reenvía. Sin
    // clave, cada reintento era una venta NUEVA — con su stock descontado, su apunte de caja y su
    // factura. La clave la genera el cliente por INTENTO de cobro y la congela la fila; el índice
    // único (hub_id, idempotency_key) es la autoridad final ante dos peticiones a la vez.
    let idempotency_key = field(&payload, "idempotency_key");
    if idempotency_key.is_empty() {
        return Err(reject("sales.idempotency_key_required", "every checkout needs its key"));
    }
    // La sonda que el runtime pre-carga (`reads`, filtrada por la clave del payload) dice si ESTA
    // clave ya se cobró. Si ya está, el reintento es un no-op LIMPIO: cero operaciones, cero
    // eventos. El cliente recupera la venta consultando `sales.by_idempotency_key` con su clave.
    if tax::read_rows(&context, "sales.by_idempotency_key").is_some_and(|rows| !rows.is_empty()) {
        return Ok(Output::new());
    }

    // El servidor valida la oferta del cliente y decide lo que no le corresponde decidir a él.
    let cap = rule.cap(&context);
    let decision = decide_checkout(&payload, &context, items, cap)?;
    let tax_incl = decision
        .tax_included
        .unwrap_or_else(|| payload.get("tax_included").map(as_bool).unwrap_or(true));

    // 🔴 THE VERY SAME VALUATION THE PREVIEW ANSWERS WITH (sales#164/#172). One function: if the
    // preview and the checkout did not share code, "adds up to the cent" would last until the
    // first change to either of them.
    let valuation = value_checkout(&payload, &context, &sale_id, tax_incl, Some(new_ids.len()), cap)?;
    let cc = valuation.country_code.as_str();
    let rc = valuation.region_code.as_str();
    let subtotal = valuation.subtotal;
    let gift_total = valuation.gift_total;

    let mut ops: Vec<Operation> = Vec::new();
    let mut bump = Map::new();
    bump.insert("day".into(), json!(day));
    ops.push(Operation::sql("sales._bump_counter", bump));

    let header_idx = ops.len();
    ops.push(Operation::sql("sales._insert_sale", Map::new())); // placeholder

    // ── Phase 3: emit the lines ALREADY PRICED ──
    let mut line_results: Vec<LineTotals> = Vec::with_capacity(valuation.lines.len());
    for (i, l) in valuation.lines.iter().enumerate() {
        let t = l.t;
        let item = &l.item;
        let combo = &l.combo;
        let resolved = &l.resolved;
        let modifiers = &l.modifiers;
        let note = &l.note; // sales#156
        let (is_gift, covered, combined_pct, unit_price, qty, line_disc) =
            (l.is_gift, l.covered, l.combined_pct, l.unit_price, l.qty, l.line_disc);

        let line_id = new_ids.get(i + 1).map(as_str).unwrap_or_default();
        let mut p = Map::new();
        p.insert("line_id".into(), json!(line_id));
        p.insert("sale_id".into(), json!(sale_id));
        p.insert("product_id".into(), item.get("product_id").cloned().unwrap_or(Value::Null));
        p.insert("product_name".into(), json!(as_str(item.get("product_name").unwrap_or(&Value::Null))));
        p.insert("product_sku".into(), json!(str_or(item, "product_sku", "")));
        p.insert("is_service".into(), json!(item.get("is_service").map(as_bool).unwrap_or(false) as i64));
        p.insert("quantity".into(), json!(qty)); // punto fijo, escala 10⁶ (INTEGER, ADR-0147)
        // Contexto de unidades CONGELADO en la línea (ADR-0147 §2.4): el histórico no relee el maestro.
        freeze_unit_context(item, qty, &mut p);
        p.insert("unit_price".into(), json!(unit_price)); // céntimos (INTEGER)
        p.insert("discount_percent".into(), json!(line_disc)); // tasa % (REAL)
        p.insert("tax_rate".into(), json!(combined_pct)); // tasa % combinada (REAL) == tax_rate_pct
        p.insert("tax_class_name".into(), json!(str_or(item, "tax_class_name", "")));
        // Invitación/regalo (comp): la línea conserva unit_price (display, tachado en el ticket) pero
        // net/tax/total = 0; `gift_reason` da el motivo (cortesía/error cocina/fidelización…).
        p.insert("is_gift".into(), json!(is_gift as i64));
        p.insert("gift_reason".into(), json!(if is_gift { str_or(item, "gift_reason", "") } else { String::new() }));
        // sales#162: la línea deja escrito que la pagó un tender EXTERNO. Sin esta marca, un 0 € en
        // un documento fiscal no se distingue de un error de precio ni de una invitación, y el
        // papel no tiene con qué explicárselo al cliente.
        p.insert("is_covered".into(), json!(covered as i64));
        // ── Snapshot fiscal inmutable de la línea (ADR-0085) ──
        // sales#195: the RESOLVED category, the very one that produced `tax_rate` and
        // `tax_rule_id`. The catalogue's when the line comes from it (sales#68), the payload's only
        // when there is no row to check it against. It used to be copied from the payload, so the
        // row could freeze `product.generic` while charging the 10 % of `restaurant.food`.
        p.insert("tax_category_key".into(), json!(resolved.category_key));
        // sales#12: la categoría del producto también se congela (routing de cocina; misma regla).
        p.insert("category_id".into(), category_snapshot(item));
        p.insert("tax_country_code".into(), json!(cc));
        p.insert("tax_region_code".into(), json!(rc));
        // tax_rule_id NULL si la línea no resolvió por catálogo (fallback al preview del cliente).
        p.insert(
            "tax_rule_id".into(),
            if resolved.rule_id.is_empty() { Value::Null } else { json!(resolved.rule_id) },
        );
        // pm#93: snapshot inmutable de los suplementos, en el ORDEN en que se eligieron. La columna
        // `sales_sale_item.modifiers` existía desde el principio y no la escribía nadie.
        p.insert("modifiers".into(), json!(modifiers));
        // sales#156: and the line's free-text note. `sales_sale_item.notes` has existed since the
        // 001 and nobody ever wrote it — the same orphan column this issue is about, one table
        // over. Frozen here so a REPRINT of the ticket says what the kitchen was told.
        p.insert("notes".into(), json!(note));
        // sales#152 / ADR-0381: lo que HERMANA las líneas de un mismo combo, y el snapshot del
        // combo congelado en cada una. NO hay línea padre con dinero: la cabecera del tique se
        // pinta de este snapshot, no de una fila a cero (el fallo de Odoo, odoo#187509).
        p.insert(
            "combo_group_ref".into(),
            combo.as_ref().map(|c| json!(c.group_ref)).unwrap_or(Value::Null),
        );
        p.insert(
            "combo".into(),
            json!(combo.as_ref().map(|c| c.snapshot.clone()).unwrap_or_else(|| "{}".to_string())),
        );
        // sales#147 / enmienda de ADR-0376: la fila de la que ESTA cuelga. La hija de un suplemento
        // con tipo fiscal propio nombra a su padre, y por ahí el papel la imprime debajo y un
        // informe las junta sin depender del orden de las filas (todas comparten `created_at`).
        // NULL en toda línea que no cuelgue de ninguna — que es la verdad de las ventas ya escritas.
        p.insert(
            "parent_line_ref".into(),
            l.parent
                .and_then(|pi| new_ids.get(pi + 1))
                .map(|v| json!(as_str(v)))
                .unwrap_or(Value::Null),
        );
        // sales#273 — QUIÉN hizo ESTA línea. En una peluquería Ana corta y Marta tiñe en el mismo
        // ticket, así que la atribución de la CABECERA no alcanza: repartida solo por venta, el
        // tique entero cae sobre una de las dos y el cierre por profesional no cuadra.
        //
        // Precedencia igual que en la cabecera (`attributed_person`): lo que nombra la línea gana,
        // y si no nombra a nadie hereda la atribución ya resuelta de la venta —que a su vez cae al
        // usuario con sesión (sales#179)—. Una cadena VACÍA no es una atribución: guardarla crearía
        // en el cierre un profesional cuyo nombre es «». Así, quien no reparte por línea (todo bar)
        // sigue viendo exactamente el informe de siempre.
        let line_staff = as_str(l.item.get("staff_id").unwrap_or(&Value::Null));
        p.insert(
            "staff_id".into(),
            if line_staff.is_empty() { staff_id.clone() } else { json!(line_staff) },
        );
        p.insert("net_amount".into(), json!(t.net)); // céntimos
        p.insert("tax_amount".into(), json!(t.tax)); // céntimos
        p.insert("line_total".into(), json!(t.line)); // céntimos
        ops.push(Operation::sql("sales._insert_line", p));
        line_results.push(t);
    }

    let discount_amount: i64 = valuation.discount_amount;
    let total = valuation.total; // cents
    let tendered = as_cents(payload.get("amount_tendered").unwrap_or(&Value::Null), 0); // céntimos
    // sales#24 — a POSITIVE amount below the total is a short payment: the sale used to close
    // anyway with `change = 0` and the drawer silently short. `0` keeps meaning «not stated»
    // (integrations that never send it); the touch POS never sends 0 — an empty numpad becomes
    // the payable. The server owns the total (ADR-0085), so the server refuses.
    if tendered > 0 && tendered < total {
        return Err(reject(
            "sales.insufficient_tendered",
            format!("amount_tendered {tendered} is below the total {total}"),
        ));
    }
    // «No indicado» (0/ausente) = importe EXACTO: se persiste el total, que es lo que el tique y el
    // arqueo tienen que decir que se pagó — no un 0 que parece «sin cobrar». El TPV solo manda lo
    // que la cajera TECLEA (sales#24): su total en pantalla es un preview y no puede decidir el
    // entregado exacto (IVA excluido, cantidades a peso y descuentos redondean en el servidor).
    let tendered = if tendered == 0 { total } else { tendered };

    // ── ADR-0386 · the legs of the payment, closed against the total ─────────────────────────────
    let mut tenders = decision.tenders.clone();
    if !decision.explicit_tenders {
        // One-tender sale (every caller until sales#159 lands): the single leg covers the total,
        // and what was handed over is the `amount_tendered` already validated above.
        tenders[0].amount = total;
        tenders[0].tendered = tendered;
    }

    // THE LEGS MUST ADD UP TO THE CENT. A mismatch is refused, never absorbed: a sale that closes
    // with legs summing to something other than what it charged is a till that ends the day with a
    // number nobody can explain, and the difference surfaces days later as "the drawer is short".
    let declared_total: i64 = tenders.iter().map(|t| t.amount).sum();
    if declared_total != total {
        return Err(reject(
            "sales.payments_do_not_match_total",
            format!("the payments add up to {declared_total} but the total is {total}"),
        ));
    }

    // THE CHANGE COMES OUT OF THE CASH LEG, and it is never prorated (ADR-0386 decision 2).
    // Odoo prorates it (PR#194284): 120 € paid with 100 by bank + 50 in notes books the 30 of
    // change against the BANK, so the receipt and the database disagree and the count breaks. The
    // change physically leaves the drawer, so it is charged to the drawer. With no cash leg there
    // is no change at all — overpaying by card does not exist, the exact amount is charged.
    for t in tenders.iter_mut() {
        if t.kind == "cash" {
            if t.tendered < t.amount {
                return Err(reject(
                    "sales.insufficient_tendered",
                    format!("a cash leg covering {} was handed only {}", t.amount, t.tendered),
                ));
            }
            t.change = t.tendered - t.amount;
        } else {
            t.tendered = t.amount;
            t.change = 0;
        }
    }

    // The header scalars are the AGGREGATE of the legs, so `amount_tendered - change_due == total`
    // still holds on the row exactly as it did when a sale had one way of paying.
    let tendered: i64 = tenders.iter().map(|t| t.tendered).sum();
    let change: i64 = tenders.iter().map(|t| t.change).sum();

    // The breakdown was closed by the valuation, once per TAX RATE over the AGGREGATE base
    // (ADR-0123 §4) — and it is the SAME one the preview answers with (sales#164/#172).
    let tax_total = valuation.tax_total;
    let tax_breakdown_json = valuation.tax_breakdown.to_string();

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
    // El ESTADO lo pone el servidor (sales#20). Antes lo elegía quien llamaba mientras el handler
    // emitía `sale.completed` igualmente: una venta podía quedar en el libro como `draft` y aun así
    // mover stock, caja y facturación. Si llega aquí, la venta está cobrada — punto.
    h.insert("status".into(), json!("completed"));
    // Clave de idempotencia congelada en la fila: es lo que hace útil al índice único.
    h.insert("idempotency_key".into(), json!(idempotency_key));
    h.insert("document_type".into(), json!(document_type));
    h.insert("subtotal".into(), json!(subtotal));
    h.insert("tax_amount".into(), json!(tax_total));
    h.insert("discount_amount".into(), json!(discount_amount));
    h.insert("discount_percent".into(), json!(sale_disc));
    h.insert("total".into(), json!(total));
    // Invitaciones (comp): coste total de las líneas regalo de esta venta, para el arqueo (a coste).
    h.insert("gift_total".into(), json!(gift_total));
    h.insert("tax_breakdown".into(), json!(tax_breakdown_json));
    // Principal tender (ADR-0386): with one leg this is exactly what the payload sent; with three
    // it is the largest, so `sales.get` and the receipt keep showing a method that really paid.
    h.insert("payment_method_id".into(), decision.payment_method_id.clone());
    // Nombre RESUELTO del catálogo del hub, no la etiqueta que mandó el navegador (sales#20).
    h.insert("payment_method_name".into(), json!(decision.payment_method_name));
    h.insert("amount_tendered".into(), json!(tendered));
    h.insert("change_due".into(), json!(change));
    h.insert("customer_id".into(), payload.get("customer_id").cloned().unwrap_or(Value::Null));
    h.insert("customer_name".into(), json!(str_or(&payload, "customer_name", "")));
    h.insert("notes".into(), json!(str_or(&payload, "notes", "")));
    h.insert("channel".into(), json!(str_or(&payload, "channel", "")));
    h.insert("source_module".into(), json!(str_or(&payload, "source_module", "pos")));
    h.insert("order_id".into(), payload.get("order_id").cloned().unwrap_or(Value::Null));
    // Atribución por profesional (staff_member) y traza de la cita de origen (opacas; sin FK
    // cross-módulo). `staff_id` distinto de `employee_id` (= :current_user_id, el cajero). NULL
    // en TPV sin atribuir; `appointment_id` NULL salvo venta nacida de una cita.
    h.insert("staff_id".into(), staff_id.clone());
    h.insert("appointment_id".into(), payload.get("appointment_id").cloned().unwrap_or(Value::Null));
    ops[header_idx] = Operation::sql("sales._insert_sale", h);

    // ── One row per leg (ADR-0386) ──
    // Ids come from the host's batch (`context.new_ids`): the sale takes [0], the lines [1..=n],
    // and the legs continue from there. Running out is a LOUD refusal — `unwrap_or_default()` would
    // hand the row an EMPTY primary key, and the second one would collide on it.
    //
    // 🔴 sales#204 — `n` is how many lines were EMITTED, never how many items the payload carried.
    // A `goods` combo split into siblings (art. 79.Dos LIVA) and a supplement with a tax rate of
    // its own (sales#147) both turn ONE item into SEVERAL lines, and the loop above spends one id
    // per line (`new_ids[i + 1]`). Counting the payload made the first leg land back on the last
    // line's id: two rows of the same sale answering to the same name, which breaks the premise of
    // `consumed_new_ids` (hub#776) and leaves every trace that joins lines to legs by id ambiguous.
    let line_count = valuation.lines.len();
    let first_payment_id = 1 + line_count;
    if first_payment_id + tenders.len() > new_ids.len() {
        return Err(reject(
            "sales.too_many_rows",
            format!(
                "{} lines and {} payments need {} ids, the host gave {}",
                line_count,
                tenders.len(),
                first_payment_id + tenders.len(),
                new_ids.len()
            ),
        ));
    }
    for (i, t) in tenders.iter().enumerate() {
        let mut p = Map::new();
        p.insert("payment_id".into(), json!(new_ids[first_payment_id + i].as_str().unwrap_or_default()));
        p.insert("sale_id".into(), json!(sale_id));
        p.insert("sort_order".into(), json!(t.sort_order));
        p.insert("payment_method_id".into(), t.method_id.clone());
        p.insert("payment_method_name".into(), json!(t.name));
        p.insert("payment_method_type".into(), json!(t.kind));
        p.insert("amount".into(), json!(t.amount));
        p.insert("amount_tendered".into(), json!(t.tendered));
        p.insert("change_due".into(), json!(t.change));
        p.insert("reference".into(), json!(t.reference));
        ops.push(Operation::sql("sales._insert_payment", p));
    }

    // The same legs, shaped for the listeners. `cash_register` cannot square a mixed sale from a
    // single scalar: it needs each leg with its canonical TYPE to know how much of the total
    // actually entered the drawer (the cash legs, net of their change) and how much never did.
    let event_payments: Vec<Value> = tenders
        .iter()
        .map(|t| {
            json!({
                "payment_method_id": t.method_id,
                "payment_method_name": t.name,
                "payment_method_type": t.kind,
                "amount": t.amount,
                "amount_tendered": t.tendered,
                "change_due": t.change,
                "sort_order": t.sort_order,
                "reference": t.reference,
            })
        })
        .collect();

    // Compact lines for cross-module listeners (inventory takes stock out by product_id+quantity,
    // skipping services; invoice bills from the net/tax ALREADY computed). The event payload IS
    // what the listener receives, which is why the list travels and not only the totals.
    // `unit_price` travels in cents (inter-module contract). Per-line `net_amount`/`tax_amount`
    // (cents) honour `tax_included`: invoice must NOT re-add VAT on top of the gross.
    //
    // 🔴 The very SAME expanded AND PRICED lines that were persisted (sales#152 / sales#164): this
    // used to walk `lines_in` and RECOMPUTE price, rate and base for the event, leaving two paths
    // for the money to keep in sync by hand — and they only agreed because the result was
    // overwritten at the end with `line_results`. Now it reads what was priced: no second path.
    let event_items: Vec<Value> = valuation
        .lines
        .iter()
        .map(|l| {
            let it = &l.item;
            let it_combo = &l.combo;
            let t = l.t;
            let qty = l.qty;
            let unit_price = l.unit_price;
            let combined_pct = l.combined_pct;
            let it_gift = l.is_gift;
            let it_covered = l.covered;
            // sales#195: the frozen category is the RESOLVED one, the same that produced the rate.
            let it_category_key = l.resolved.category_key.clone();
            json!({
                "product_id": it.get("product_id").cloned().unwrap_or(Value::Null),
                "product_name": as_str(it.get("product_name").unwrap_or(&Value::Null)),
                // ENTERO en escala 10⁶ (ADR-0147): `inventory` hace as_i64 — un float aquí era
                // 0 → `qty <= 0 → continue` → la venta no descontaba stock, en silencio.
                "quantity": qty,
                "unit_code": str_or(it, "unit_code", "ud"), // unidad congelada de la línea
                "unit_price": unit_price,           // céntimos (bruto/unitario tal cual lo envió la UI)
                "tax_rate": combined_pct,           // tasa % resuelta (server-authoritative)
                "tax_category_key": it_category_key, // RESOLVED tax category, frozen (ADR-0085, sales#195)
                "net_amount": t.net,                // céntimos: base imponible YA extraída (0 si invitación)
                "tax_amount": t.tax,                // céntimos: IVA YA calculado (0 si invitación)
                "is_gift": it_gift,                 // invitación/regalo (comp)
                "covered": it_covered,              // la pagó un tender externo (sales#162)
                "is_service": it.get("is_service").map(as_bool).unwrap_or(false),
                // category_id por línea (aditivo, QA 2026-06-25): el KDS enruta la comanda a su
                // estación (station_id) por la categoría del producto. Sin esto, el KDS recibe
                // station_id vacío. Opaco para sales (no FK cross-módulo); NULL si la línea no
                // trae categoría (p.ej. producto sin clasificar). No depende de qué KDS se instale.
                "category_id": it.get("category_id").cloned().unwrap_or(Value::Null),
                // sales#152 / ADR-0381: de qué combo salió esta línea, y el combo entero congelado.
                // Va al EVENTO y no solo a la fila porque los consumidores viven del evento: sin
                // esto, `inventory` no puede mover el stock de los componentes de un menú que salió
                // como UNA línea (no hay `product_id` que mirar — es la regla 8, inventory#69) y el
                // documento de `invoice` no puede nombrar el menú que cobró.
                // sales#171 · LAS UNIDADES DE STOCK DE ESTA LÍNEA. Contrato genérico de
                // inventory#69: una línea con `components[]` no vacío cede su stock a ellos. Un
                // menú cobrado como UNA línea no tiene `product_id`, así que sin esto `inventory`
                // caía a la propia línea, no casaba ninguna fila y respondía `ok` — el stock no se
                // movía y NADIE se enteraba. `null` en una línea que ya mueve su propio stock (una
                // venta suelta, o una hermana de un combo partido: descontaría dos veces).
                //
                // ⚠️ `quantity` es ABSOLUTA y en punto fijo 10⁶ (ADR-0147), igual que la de la
                // línea de la que cuelga: el multiplicador de la línea se aplica AQUÍ. Leerla como
                // «por unidad de combo» descontaría una ración donde se sirvieron tres, y el mismo
                // payload significaría dos cosas en dos niveles de anidamiento.
                "components": it_combo
                    .as_ref()
                    .filter(|c| !c.stock_components.is_empty())
                    .map(|c| {
                        Value::Array(
                            c.stock_components
                                .iter()
                                .map(|k| json!({
                                    "product_id": k.product_id,
                                    "product_name": k.product_name,
                                    "quantity": qty,
                                    "is_service": k.is_service,
                                }))
                                .collect(),
                        )
                    })
                    .unwrap_or(Value::Null),
                "combo_group_ref": it_combo.as_ref().map(|c| json!(c.group_ref)).unwrap_or(Value::Null),
                // sales#147: la hija viaja al evento nombrando a su padre, con el MISMO id que la
                // fila. `invoice` y el registro de la AEAT ven dos líneas con dos tipos —que es lo
                // que hay que declarar— y saben cuál cuelga de cuál para pintarlas juntas.
                "parent_line_ref": l.parent
                    .and_then(|pi| new_ids.get(pi + 1))
                    .map(|v| json!(as_str(v)))
                    .unwrap_or(Value::Null),
                "combo": it_combo
                    .as_ref()
                    .map(|c| serde_json::from_str::<Value>(&c.snapshot).unwrap_or(Value::Null))
                    .unwrap_or(Value::Null),
            })
        })
        .collect();

    // order_id/order_number viajan en el evento (ADR-0010) para que `orders`
    // enlace el pedido (link_to_sale) sin re-consultar; NULL si la venta no
    // proviene de un pedido (el listener de orders es no-op en ese caso).
    // total/subtotal/tax_amount viajan en **céntimos** (contrato inter-módulo):
    // customers.record_purchase acumula total_spent (céntimos), etc.
    let mut event = Event::new("sale.completed", json!({
        "sender": "sales",
        "sale_id": sale_id,
        "order_id": payload.get("order_id").cloned().unwrap_or(Value::Null),
        "order_number": payload.get("order_number").cloned().unwrap_or(Value::Null),
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

        // Las líneas REALES de la venta: un combo de bienes a tipos distintos son N, no una.
        "items_count": valuation.lines.len(),
        "items": event_items,
        "customer_id": payload.get("customer_id").cloned().unwrap_or(Value::Null),
        "customer_name": str_or(&payload, "customer_name", ""),
        // Snapshot fiscal del cliente asignado (ADR-0132): `invoice` lo copia a la factura para
        // que una venta de TPV con cliente salga CON NIF y dirección. Vacío = venta anónima.
        "customer_tax_id": str_or(&payload, "customer_tax_id", ""),
        "customer_address": str_or(&payload, "customer_address", ""),
        // sales#332: a customer from abroad is declared by country (ISO alpha-2) and document kind
        // (AEAT IDType), which `invoice` copies to the invoice (hub#1967). '' = the VAT prefix of
        // the tax id decides, which is what every sale did before.
        "customer_country": str_or(&payload, "customer_country", "").trim().to_ascii_uppercase(),
        "customer_id_type": str_or(&payload, "customer_id_type", "").trim(),
        // staff_id travels in the event so consumers (cash_register, reporting) can attribute the
        // sale to whoever attended. Already RESOLVED (sales#179): the professional the payload
        // named or, failing that, the session user. It is only NULL when the runtime gave no user
        // context, which is a path with no session.
        "staff_id": staff_id.clone(),
        // El MÉTODO DE PAGO viaja en el evento (QA restaurante 07-16, P0 del arqueo):
        // cash_register.record_sale decidía con default 'cash' → las ventas con TARJETA
        // se sumaban al efectivo esperado del cajón y el arqueo nunca cuadraba.
        "payment_method_id": payload.get("payment_method_id").cloned().unwrap_or(Value::Null),
        // Igual que en la cabecera: el nombre que viaja al arqueo es el del catálogo (sales#20).
        "payment_method_name": decision.payment_method_name,
        // Tipo CANÓNICO del método (`cash` | `card` | …), del catálogo del hub (hub#778): el
        // cajón compara contra este, no contra el `name` localizado. «Efectivo» y «Cash» son el
        // mismo `type` («cash»), y solo las ventas así marcadadas suman al efectivo esperado.
        "payment_method_type": decision.payment_method_type,
        // ADR-0386 — the legs of the payment, in the order the cashier took them. The scalars above
        // are the PRINCIPAL leg and stay while consumers still read them; `payments[]` is the whole
        // truth. It is always present and never empty: a one-tender sale is a list of one.
        //
        // 🔴 Nothing fiscal is in here, and that is the decision, not an omission: the AEAT record
        // has no field for the means of payment (0 hits for `MedioPago`/`FormaPago` in the web
        // service PDF and in `SuministroInformacion.xsd`, positive control of 91 for
        // `IDFactura|RegistroAlta|Huella`). One sale = one `RegistroAlta`, one hash, one chain link,
        // however many ways it was paid.
        "payments": event_payments,
    }));
    // sales#283 — the «Print receipt» switch as the cashier left it: the shell prints on this event
    // and obeys it over its auto-print setting. Only a real boolean travels; absent (API, assistant,
    // any other producer) the key is not there and the setting keeps deciding.
    if let (Some(choice), Some(body)) = (payload.get("print_receipt").and_then(Value::as_bool), event.payload.as_object_mut()) {
        body.insert("print_receipt".into(), Value::Bool(choice));
    }

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
            "staff_id": staff_id.clone(),
            "total": total,
        })));
    }

    // ADR-0141: si la venta nace de un pedido (`order_id`) y es el cobro FINAL (no un split
    // parcial), marca el pedido completado (open → completed). En split-bill (`keep_order_open`)
    // se deja abierto para los siguientes cobros; así 1 order → N sale, ligadas por `order_id`.
    let order_ref = payload.get("order_id").cloned().unwrap_or(Value::Null);
    let keep_open = payload.get("keep_order_open").map(as_bool).unwrap_or(false);
    // ADR-0146 etapa 5 — «cada uno paga lo suyo»: las líneas que cubre ESTE cobro quedan atadas a
    // SU venta. Las demás siguen pendientes para el siguiente. Sin esto, al reanudar el pedido
    // volverían a salir las ya pagadas y se cobrarían dos veces.
    if let Some(ids) = payload.get("line_ids").and_then(|v| v.as_array()) {
        for id in ids {
            let line_id = as_str(id);
            if line_id.is_empty() { continue; }
            let mut p = Map::new();
            p.insert("line_id".into(), json!(line_id));
            p.insert("sale_id".into(), json!(sale_id));
            ops.push(Operation::sql("sales._mark_order_line_paid", p));
        }
    }

    if !order_ref.is_null() && !as_str(&order_ref).is_empty() && !keep_open {
        let mut c = Map::new();
        c.insert("order_id".into(), order_ref.clone());
        ops.push(Operation::sql("sales._complete_order", c));
        // ADR-0146: el fin del PEDIDO es un hecho distinto del cobro de una venta, y es el que
        // esperan los satélites (la mesa se libera aquí). `sale.completed` NO sirve: se emite
        // también en un cobro parcial, donde el pedido sigue abierto y la mesa no debe soltarse.
        events.push(Event::new("order.completed", json!({
            "sender": "sales",
            "order_id": order_ref,
        })));
    }

    Ok(Output { operations: ops, events, ..Default::default() })
}

/// sales#169 — la COMPOSICIÓN de un menú, congelada en la fila del PEDIDO: qué combo y qué se
/// eligió, EN SU ORDEN de elección.
///
/// Es una fila de **trabajo**, con el mismo criterio que `modifiers` (migración 023) y que su
/// `line_total` provisional: **no lleva dinero**. El precio cerrado, el reparto del art. 79.Dos y
/// los nombres definitivos los decide `complete_sale` contra `combos.options.all`, en el mismo y
/// ÚNICO recorrido de siempre. Congelar aquí líneas hermanas ya repartidas sería el segundo
/// recorrido que sales#152 quitó a propósito — y un día las dos rutas dirían cosas distintas.
///
/// `product_name` y `category_id` viajan porque son DISPLAY y ROUTING, no dinero: sin ellos la
/// cuenta retomada no sabe pintar los componentes, y el KDS no sabe a qué estación mandar cada uno
/// (el fallo de TouchBistro que nombra ADR-0381).
///
/// `Ok(None)` = la línea no es un combo, que es el 100 % de las líneas de casi todas las cuentas.
fn order_combo_snapshot(item: &Value) -> Result<Option<String>, Refusal> {
    let combo_id = field(item, "combo_id");
    if combo_id.is_empty() {
        return Ok(None);
    }
    let empty: Vec<Value> = Vec::new();
    let picks = item.get("combo_choices").and_then(|v| v.as_array()).unwrap_or(&empty);
    let choices: Vec<Value> = picks
        .iter()
        .filter(|p| !field(p, "option_id").is_empty())
        .map(|p| {
            json!({
                "option_id": field(p, "option_id"),
                "product_name": str_or(p, "product_name", ""),
                "category_id": category_snapshot(p),
            })
        })
        .collect();
    // Un menú SIN elegir no se rechaza aquí: la cuenta abierta es mutable y la puerta que decide es
    // el cobro, que ya lo rechaza con `sales.combo_group_unresolved`. Duplicar la regla aquí sería
    // una segunda cerradura que mantener, con su propio riesgo de decir algo distinto.
    serde_json::to_string(&json!({ "combo_id": combo_id, "combo_choices": choices }))
        .map(Some)
        .map_err(|e| broken(format!("order_combo_snapshot_encode: {e}")))
}

/// pm#93 / sales#200 — the supplements chosen, in their order, serialised for the TEXT column of
/// the order's row, **with the delta and the name the SERVER resolved**.
///
/// 🔴 The row used to keep only the `option_id`s and the checkout resolved the money against
/// `modifiers.options.all` when the check was PAID: raising "+ cheese" at 8 p.m. re-priced the
/// table that had ordered it at lunchtime. Now the delta is frozen the moment the waiter takes the
/// order — the same rule, and the same market decision, as the base price (sales#175).
///
/// It fails CLOSED like the price: with no catalogue there is nothing to value the supplement
/// against, and freezing what the browser proposed is the hole sales#68 closed. The tax category is
/// NOT compared here (that is `authoritative_modifiers`' job at the checkout): a set menu's
/// category is only decided when the checkout splits it.
///
/// Returns `(delta of the whole line in minor units, the snapshot)` — sales#208. The delta is what
/// the row's PROVISIONAL `line_total` is worth on top of the base price, and
/// `order_recompute_total.sql` adds exactly those up into the open check's total. The split of
/// sales#147 is NOT applied here: whether an option is billed on a line of its own is decided by
/// the checkout, and either way the table pays the same, which is all a provisional total claims.
fn order_modifiers_snapshot(
    item: &Value,
    modifier_catalog: Option<&Vec<&Value>>,
) -> Result<(i64, String), Refusal> {
    fold_modifiers(&resolve_modifiers(item, None, modifier_catalog)?)
}

/// The CLOSED price of a set menu (sales#175): the one in the `combos` catalogue plus the
/// SUBSTITUTION supplements that were picked ("+ sirloin 3 €"). This is what gets frozen on the
/// open check's row.
///
/// The SPLIT across sibling lines (art. 79.Dos) is NOT frozen here: the checkout still decides it,
/// because the weights and the rates belong to the accrual — and the accrual is the delivery, not
/// the moment the waiter takes the order (art. 75.Uno.1º LIVA). What stays fixed is the menu's
/// TOTAL amount.
///
/// 🔴 Fails CLOSED just like the checkout: with no `combos` catalogue a line that claims to be a
/// set menu is not materialised, because its price would be coming from the browser.
fn combo_closed_price(item: &Value, combo_catalog: Option<&Vec<&Value>>) -> Result<i64, Refusal> {
    let combo_id = field(item, "combo_id");
    let rows = combo_catalog.ok_or_else(|| {
        reject("sales.combo_catalog_unavailable", format!("no combo catalogue to price `{combo_id}`"))
    })?;
    let options: Vec<&&Value> = rows.iter().filter(|r| field(r, "combo_id") == combo_id).collect();
    let head = *options
        .first()
        .ok_or_else(|| reject("sales.combo_not_available", &combo_id))?;
    if !head.get("combo_is_active").map(as_bool).unwrap_or(false) {
        return Err(reject("sales.combo_not_on_sale", format!("`{combo_id}` was withdrawn from sale")));
    }
    let mut total = as_cents(head.get("combo_price").unwrap_or(&Value::Null), 0);
    let empty: Vec<Value> = Vec::new();
    for pick in item.get("combo_choices").and_then(|v| v.as_array()).unwrap_or(&empty) {
        let option_id = field(pick, "option_id");
        let row = options
            .iter()
            .find(|r| field(r, "option_id") == option_id)
            .ok_or_else(|| reject("sales.combo_option_not_available", &option_id))?;
        total += as_cents(row.get("price_delta").unwrap_or(&Value::Null), 0);
    }
    if total < 0 {
        return Err(reject("sales.amount_negative", format!("combo `{combo_id}` priced at {total}")));
    }
    Ok(total)
}

/// ONE row of `sales_order_item`, exactly as written by the TWO doors that materialise a line of an
/// open check: `sales.order.open` (the first line) and `sales.order.add_line` (every one after it).
///
/// 🔴 sales#175 — **this is where the price is frozen.** Now that the checkout honours the row's
/// `unit_price`, that column decides money, so the SERVER resolves it against
/// `inventory.products.for_sale` (and `combos.options.all` for a set menu) with exactly the rule
/// `complete_sale` has had since sales#68: if a line claims to come from the catalogue, the
/// catalogue wins; an id that is not there is refused; with no catalogue the line is not
/// materialised. The payload's `price` is a proposal at both doors, just as it already was at the
/// checkout.
///
/// Returns the params of the `sales._insert_order_line` command and the PROVISIONAL `line_total`
/// (display) that adds up into the order's total.
/// sales#156 — the line's free-text NOTE, as the row stores it.
///
/// Unlike the price, the supplements or the tax category, there is nothing to verify this against:
/// it IS the waiter's own words, and that is the whole point of the field. It is display and
/// production text — the cook reads it at the pass — and `sales` interprets none of it. So the only
/// thing done to it is a trim, so that a stray space does not turn "no note" into a note.
fn line_note(item: &Value) -> String {
    str_or(item, "notes", "").trim().to_string()
}

/// The ONE sub-line the pass reads for an item: **what to cook, and why it is going out free.**
///
/// The two are different facts and the kitchen needs both: "medium rare" is an instruction, "on
/// the house" is why a plate nobody is paying for leaves the kitchen. They are joined
/// instead of one winning because `kitchen::modifiers_for_display` prints exactly ONE indented
/// sub-line per item (`  > {notes}`, crates/peripherals/src/escpos.rs), so a second field would be
/// dropped in silence. The separator is the same « · » the paper already uses between supplements:
/// in the 32 columns of a thermal printer a comma reads as a decimal point.
fn kitchen_note(note: &str, is_gift: bool, gift_reason: &str) -> String {
    let reason = if is_gift { gift_reason.trim() } else { "" };
    [note.trim(), reason]
        .iter()
        .filter(|s| !s.is_empty())
        .copied()
        .collect::<Vec<&str>>()
        .join(" · ")
}

/// The PROVISIONAL amount of an order line, in minor units — the one arithmetic every door that
/// materialises a row shares (ADR-0147 §2.3, sales#71).
///
/// It lives on its own because sales#242 gave it a third caller: splitting a line prices each of
/// its N parts, and a second copy of this formula is exactly how the screen ends up drifting a cent
/// from the receipt. Not fiscal: the HALF_UP quota and the per-rate breakdown are frozen at
/// checkout (ADR-0123/0085).
fn order_line_amount(
    priced_unit: i64, qty: i64, price_qty: i64, is_gift: bool, line_disc: f64,
) -> Result<i64, Refusal> {
    if is_gift {
        return Ok(0);
    }
    let pq_raw = if price_qty > 0 { price_qty } else { QUANTITY_SCALE };
    if line_disc > 0.0 {
        // With a discount: price × exact factor × quantity, a SINGLE HALF_UP — the same formula
        // `calc_line_components` uses at checkout, so the preview does not drift from the receipt.
        let pq = Decimal::from(pq_raw) / Decimal::from(QUANTITY_SCALE);
        let factor = Decimal::ONE - Decimal::from_f64(line_disc).unwrap_or(Decimal::ZERO) / Decimal::from(100);
        let exact = Decimal::from(priced_unit) * factor * (Decimal::from(qty) / Decimal::from(QUANTITY_SCALE)) / pq;
        return Ok(money::round(exact));
    }
    // Provisional (display), but with the SDK's very arithmetic: integer money over the price
    // quantity, a single HALF_UP (ADR-0147 §2.3).
    calculate_line_amount(priced_unit, QuantityValue::from_raw(qty), QuantityValue::from_raw(pq_raw))
        .map_err(|e| broken(format!("line_amount_overflow: {e:?}")))
}

fn order_line_row(
    item: &Value,
    line_id: &str,
    order_id: &str,
    group_seed: &str,
    product_catalog: Option<&Vec<&Value>>,
    combo_catalog: Option<&Vec<&Value>>,
    modifier_catalog: Option<&Vec<&Value>>,
) -> Result<(Map<String, Value>, i64), Refusal> {
    // A set menu is NOT measured against the product catalogue: its id is not there (it belongs to
    // `combos`), and its price is the pack's closed one. It goes first for exactly that reason.
    // sales#288: the catalogue row is kept, not just the money read off it — the name the cook
    // reads is frozen from this very row, below.
    let catalog = if field(item, "combo_id").is_empty() {
        catalog_row(item, product_catalog)?
    } else {
        // A set menu is NOT in the product catalogue: its id belongs to `combos`.
        None
    };
    let (unit_price, unit_cost, unit_cat) = if !field(item, "combo_id").is_empty() {
        (
            combo_closed_price(item, combo_catalog)?,
            as_cents(item.get("cost").unwrap_or(&Value::Null), 0),
            // The tax category of a set menu is decided by the CHECKOUT when it splits it (one if
            // it is a single supply, the component's if the pack is split). The row cannot pin one.
            str_or(item, "tax_category_key", ""),
        )
    } else {
        match catalog.map(catalog_money) {
            Some((price, cost, cat)) => (price, cost, cat),
            // Open price or service: there is no catalogue `sales` can check it against. It is the
            // same deliberately open door `is_catalog_line` documents, with its own permission.
            None => (
                as_cents(item.get("price").unwrap_or(&Value::Null), 0),
                as_cents(item.get("cost").unwrap_or(&Value::Null), 0),
                str_or(item, "tax_category_key", ""),
            ),
        }
    };
    // Fixed point 10⁶ + refusal off the grid (ADR-0147): the order speaks the same language as the
    // sale — opening at 0.0005 kg and charging later would just move the error somewhere else.
    // sales#300: the grid is the one the LINE DECLARES, and the row freezes that same fact (see
    // `frozen_increment`) — never one the quantity contradicts, and never one invented here.
    let qty = line_qty(item)?;
    let is_gift = item.get("is_gift").map(as_bool).unwrap_or(false);
    // sales#71: manual line discount (%), same range and same refusal as the checkout.
    let line_disc = item.get("discount").map(|v| as_f64(v, 0.0)).unwrap_or(0.0);
    if !rate_in_range(line_disc) {
        return Err(reject("sales.discount_out_of_range", format!("line discount {line_disc}")));
    }
    // pm#93 / sales#200: the supplements, resolved against the catalogue by the SERVER — with the
    // delta they are worth. sales#208: that delta is part of what the line COSTS, so it is resolved
    // before the amount instead of after it.
    let (modifier_delta, modifier_snapshot) = order_modifiers_snapshot(item, modifier_catalog)?;
    // 🔴 The delta rides on the PRICE, exactly as the checkout does it (`unit_price +
    // modifier_delta`), so quantity, price quantity and discount go through the very same
    // arithmetic — there is no second money path to keep in step. What it does NOT do is move
    // `unit_price`: that column is the frozen BASE the checkout starts from, and adding the delta
    // there would charge it twice.
    let priced_unit = unit_price + modifier_delta;
    let line_total =
        order_line_amount(priced_unit, qty, line_price_qty(item), is_gift, line_disc)?;

    let mut p = Map::new();
    p.insert("id".into(), json!(line_id));
    p.insert("order_id".into(), json!(order_id)); // FK to the order (early materialisation)
    p.insert("product_id".into(), item.get("product_id").cloned().unwrap_or(Value::Null));
    // sales#288 — WHO NAMES THE LINE. The same rule as the price (sales#175): if the line claims to
    // come from the catalogue, the catalogue decides. A caller that sends only a `product_id` —
    // which the API door makes easy and the till never does — used to write a row with no name at
    // all, and the kitchen display then printed the raw UUID (`kitchen::cooking_name` falls back to
    // the id on purpose: a cook who sees a code asks, one who sees nothing plates it wrong).
    //
    // It DEGRADES instead of refusing: a hub whose `inventory` still serves the narrow catalogue
    // hands over no `name`, and a name decides no money — so the caller's own text stands, exactly
    // as it did before. The refusal for an unknown id is upstairs, where the money is.
    let payload_name = as_str(item.get("product_name").unwrap_or(&Value::Null));
    let payload_sku = str_or(item, "product_sku", "");
    p.insert(
        "product_name".into(),
        json!(catalog.map_or_else(|| payload_name.clone(), |row| str_or(row, "name", &payload_name))),
    );
    p.insert(
        "product_sku".into(),
        json!(catalog.map_or_else(|| payload_sku.clone(), |row| str_or(row, "sku", &payload_sku))),
    );
    p.insert("quantity".into(), json!(qty)); // fixed point, scale 10⁶ (INTEGER, ADR-0147)
    // Unit context FROZEN (ADR-0147 §2.4): closing and reopening the order cannot change what the
    // quantity means.
    freeze_unit_context(item, qty, &mut p);
    p.insert("unit_price".into(), json!(unit_price)); // minor units (INTEGER), from the CATALOGUE
    p.insert("is_gift".into(), json!(is_gift as i64));
    p.insert("gift_reason".into(), json!(if is_gift { str_or(item, "gift_reason", "") } else { String::new() }));
    p.insert("line_total".into(), json!(line_total)); // minor units, provisional (display)
    // The CHECKOUT needs these two and cannot re-derive them after a reload: the tax category is
    // the server-side authority of VAT (ADR-0085) and the cost feeds the gift total of the cash-up.
    // Without them, a resumed order would be invoiced with the wrong VAT.
    p.insert("tax_category_key".into(), json!(unit_cat));
    p.insert("cost".into(), json!(unit_cost));
    // sales#89: SERVICE or product. A service line is not measured against `inventory`'s catalogue
    // and moves no stock, and the order has to remember it so a RESUMED check keeps charging it as
    // a service.
    p.insert("is_service".into(), json!(item.get("is_service").map(as_bool).unwrap_or(false) as i64));
    // sales#12: the product's category is FROZEN on the order line — it is what routes the kitchen
    // ticket (category → station) and it has to survive resuming the check and someone
    // recategorising the product tomorrow. Same rule as `tax_category_key`.
    p.insert("category_id".into(), category_snapshot(item));
    p.insert("discount_percent".into(), json!(line_disc)); // sales#71
    // sales#273: WHO did this line. Opaque reference to `staff.*` / `hub.users.list` — `sales`
    // never interprets it and never joins against it (ADR-0007). NULL and not "" when the till
    // named nobody: that is what makes `by_staff` fall back to the ticket's own professional, and
    // it is what every line written before this column already looks like.
    p.insert("staff_id".into(), staff_ref(item));
    // sales#156: and so does the waiter's free-text note («medium rare», «shellfish allergy»).
    p.insert("notes".into(), json!(line_note(item)));
    // pm#93: the supplements belong to the ROW too. `sales.order.add_line` stored them from day
    // one, but this door — the one every check's FIRST line comes through — did not forward them:
    // the "no onion" burger that opened the table lost them when it was resumed.
    p.insert("modifiers".into(), json!(modifier_snapshot));
    // sales#169: and the composition of the SET MENU, for the same reason and with the same rule.
    match order_combo_snapshot(item)? {
        Some(text) => {
            p.insert("combo".into(), json!(text));
            // 🔴 What marks the row as a combo is MINTED BY THE SERVER, just like the price
            // (sales#68) and with the same shape as in the sale (`{sale_id}-{idx}`): from the order
            // and the position. Taking it from the payload would let two checks claim to be the
            // same menu.
            p.insert("combo_group_ref".into(), json!(group_seed));
        }
        None => {
            p.insert("combo".into(), json!("{}"));
            p.insert("combo_group_ref".into(), Value::Null);
        }
    }
    Ok((p, line_total))
}

/// ADR-0141 — abre un `order` **mutable** (estado `open`) con sus
/// líneas materializadas **temprano** (filas reales, no un blob). Es la entidad canónica del pedido;
/// al cobrar producirá 1..N `sale` inmutables (split-bill). `sales` es **agnóstico de la mesa**: NO
/// conoce `table_id` — la asociación mesa↔pedido la OWNea `tables` en `table_session.order_id`.
pub fn open_order_pure(input: Value) -> Result<Output, String> {
    finish(open_order_inner(input))
}

/// The decision itself (sales#201). A business rejection comes back as `Refusal::Domain`
/// and [`finish`] hands it to the caller inside `Output.error`, which is the only channel
/// that reaches the browser as a translatable `code`.
fn open_order_inner(input: Value) -> Result<Output, Refusal> {
    let payload = input.get("payload").cloned().unwrap_or(Value::Null);
    let context = input.get("context").cloned().unwrap_or(Value::Null);
    let empty: Vec<Value> = Vec::new();
    let new_ids = context.get("new_ids").and_then(|v| v.as_array()).unwrap_or(&empty);
    let items = payload.get("items").and_then(|v| v.as_array()).unwrap_or(&empty);
    let order_id = new_ids.first().map(as_str).unwrap_or_default();
    // sales#175: the trusted catalogues. Opening a check FREEZES the price of its lines, so this
    // door needs the same reads as the checkout or it would freeze whatever the till proposed.
    let product_catalog = tax::read_rows(&context, "inventory.products.for_sale");
    let combo_catalog = tax::read_rows(&context, "combos.options.all");
    // sales#200: and the supplements'. OPTIONAL like the combos' — `None` = `modifiers` is not
    // installed, and then a line WITH supplements is refused (it fails closed, same as the
    // checkout): its delta is money and money is not frozen from the browser.
    let modifier_catalog = tax::read_rows(&context, "modifiers.options.all");

    let mut ops: Vec<Operation> = Vec::new();
    // Order header: a placeholder; the provisional total is filled in after walking the lines.
    let header_idx = ops.len();
    ops.push(Operation::sql("sales._insert_order", Map::new()));

    // Lines materialised EARLY (real `sales_order_item` rows). An `order` is MUTABLE: its amounts
    // are **provisional** (display on the till). The HALF_UP tax and the per-rate breakdown
    // (ADR-0123/0085) are frozen at CHECKOUT (`complete_sale`), not when the order is opened.
    // What IS frozen here is the unit price of every line (sales#175).
    let mut provisional_total: i64 = 0;
    for (i, item) in items.iter().enumerate() {
        let line_id = new_ids.get(i + 1).map(as_str).unwrap_or_default();
        let (p, line_total) = order_line_row(
            item,
            &line_id,
            &order_id,
            &format!("{order_id}-{i}"),
            product_catalog.as_ref(),
            combo_catalog.as_ref(),
            modifier_catalog.as_ref(),
        )?;
        provisional_total += line_total;
        ops.push(Operation::sql("sales._insert_order_line", p));
    }

    let mut h = Map::new();
    h.insert("id".into(), json!(order_id));
    h.insert("status".into(), json!("open")); // ciclo de vida: open → completed → voided (ADR-0141)
    h.insert("provisional_total".into(), json!(provisional_total)); // céntimos, recalculable
    h.insert("notes".into(), json!(str_or(&payload, "notes", "")));
    // Etiqueta OPACA de la cuenta («Mesa 4», «Ana — terraza», «15:07»): es lo que la hace
    // reconocible en la lista de cuentas abiertas. `sales` no la interpreta (ADR-0144).
    h.insert("label".into(), json!(str_or(&payload, "label", "")));
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

    Ok(Output { operations: ops, events: vec![event], ..Default::default() })
}

/// sales#175 — normalises the FLAT payload of `sales.order.add_line` into the item shape used by
/// `sales.order.open` and the checkout.
///
/// The two doors were born different because one was declarative SQL (flat parameters, TEXT
/// columns) and the other a handler (objects). Turning `add_line` into a handler accepts **both the
/// old and the new shape** on purpose: the installed till still sends `unit_price`/
/// `discount_percent` and the serialised `modifiers`/`combo`, and a hub does not update its web app
/// and its image in the same second.
fn add_line_item(payload: &Value) -> Value {
    let mut item = match payload {
        Value::Object(map) => map.clone(),
        _ => Map::new(),
    };
    // `unit_price` (flat shape) → `price` (item shape). It is a PROPOSAL in both: what gets
    // persisted comes from the catalogue (`order_line_row`).
    if item.get("price").is_none() {
        if let Some(v) = payload.get("unit_price") {
            item.insert("price".into(), v.clone());
        }
    }
    if item.get("discount").is_none() {
        if let Some(v) = payload.get("discount_percent") {
            item.insert("discount".into(), v.clone());
        }
    }
    // `modifiers` and `combo` travelled SERIALISED because they bound to a TEXT column. They are
    // decoded here so the same `order_modifiers_snapshot`/`order_combo_snapshot` as the other door
    // freeze them again — one single way of writing those two columns.
    if let Some(text) = payload.get("modifiers").and_then(|v| v.as_str()) {
        item.insert(
            "modifiers".into(),
            serde_json::from_str(text).unwrap_or(Value::Array(Vec::new())),
        );
    }
    if let Some(text) = payload.get("combo").and_then(|v| v.as_str()) {
        let combo: Value = serde_json::from_str(text).unwrap_or(Value::Null);
        if !field(&combo, "combo_id").is_empty() {
            item.insert("combo_id".into(), combo.get("combo_id").cloned().unwrap_or(Value::Null));
            item.insert(
                "combo_choices".into(),
                combo.get("combo_choices").cloned().unwrap_or(Value::Array(Vec::new())),
            );
        }
        item.remove("combo");
    }
    Value::Object(item)
}

/// sales#175 — adds ONE line to a check already open, **with the catalogue in hand**.
///
/// It used to be declarative SQL and bound `:unit_price` from the payload. While the checkout
/// re-priced against `inventory.products.for_sale`, that parameter only moved a display preview;
/// now that the checkout HONOURS the row's `unit_price` (the check is charged at the price it was
/// ordered at), that column decides money — and a column that decides money is not written by the
/// browser (sales#68).
///
/// The tenancy guard the declarative command got from `expect_rows` (pm#146) now comes from the
/// `sales.order.get` read, parameterised by `payload.order_id` and filtered by `hub_id` in its own
/// SQL: if the order is not this hub's, is deleted or does not exist, no row comes back and it is
/// refused with **the same domain code** as before (`sales.order_unavailable`), the one the UI
/// already translates.
pub fn add_order_line_pure(input: Value) -> Result<Output, String> {
    finish(add_order_line_inner(input))
}

/// The decision itself (sales#201). A business rejection comes back as `Refusal::Domain`
/// and [`finish`] hands it to the caller inside `Output.error`, which is the only channel
/// that reaches the browser as a translatable `code`.
fn add_order_line_inner(input: Value) -> Result<Output, Refusal> {
    let payload = input.get("payload").cloned().unwrap_or(Value::Null);
    let context = input.get("context").cloned().unwrap_or(Value::Null);
    let empty: Vec<Value> = Vec::new();
    let new_ids = context.get("new_ids").and_then(|v| v.as_array()).unwrap_or(&empty);
    let order_id = as_str(payload.get("order_id").unwrap_or(&Value::Null));

    // The order has to exist, belong to THIS hub and be alive. The query already filters by
    // `hub_id` (the runtime injects it), so zero rows means exactly that.
    let order = tax::read_rows(&context, "sales.order.get").unwrap_or_default();
    if order.is_empty() {
        return Err(reject(
            "sales.order_unavailable",
            format!("`{order_id}` is not an open order of this business"),
        ));
    }

    let product_catalog = tax::read_rows(&context, "inventory.products.for_sale");
    let combo_catalog = tax::read_rows(&context, "combos.options.all");
    // sales#200: the supplements' catalogue, with the same rule as the other door.
    let modifier_catalog = tax::read_rows(&context, "modifiers.options.all");
    let line_id = new_ids.first().map(as_str).unwrap_or_default();
    let item = add_line_item(&payload);
    // The `combo_group_ref` is minted by the SERVER from the id the runtime just coined for this
    // row — the same rule as in `open_order`, where the order and the position mint it.
    let (p, _line_total) =
        order_line_row(&item, &line_id, &order_id, &line_id, product_catalog.as_ref(),
                       combo_catalog.as_ref(), modifier_catalog.as_ref())?;

    let mut recompute = Map::new();
    recompute.insert("order_id".into(), json!(order_id));
    Ok(Output {
        operations: vec![
            Operation::sql("sales._insert_order_line", p),
            // The order's PROVISIONAL total is recomputed in the SAME transaction, just as the 2nd
            // statement of the declarative command did: otherwise the total drifts from its lines.
            Operation::sql("sales._recompute_order_total", recompute),
        ],
        ..Default::default()
    })
}

/// How many lines of ONE a single split may produce (sales#242 / ADR-0422).
///
/// The host mints a finite batch of ids per command (`NEW_IDS_BATCH`, ARQUITECTURA.md §5.3), so an
/// unbounded split would run out of them and write a check missing rows. Fifty units of one service
/// on one counter check is not a redemption case either — it is a typo on the quantity. The screen
/// keeps the same ceiling (`MAX_LINE_SPLIT`, `ui/lib/line-tender.ts`).
const MAX_LINE_SPLIT: i64 = 50;

/// sales#242 / ADR-0422 — **the unit a session buys is the LINE**, so the line is what gets split.
///
/// A voucher redemption covers one line and spends one session: `services` enforces one per
/// `(hub_id, checkout_ref, line_ref)` with a unique index and its hold takes no quantity. So «Corte
/// × 2» — which is what the till builds when the cashier taps the same service twice, and what is
/// right for everything else — could hand out two haircuts for one session. The market's answer,
/// with 12 verified references, is not to teach the voucher about quantities (that is Square's
/// longest complaint thread and it cannot express «one session for the mother, full price for the
/// daughter»): it is to make each service its own line. Phorest adds the service again, Boulevard
/// is one voucher per service, Zanda links one session to one invoice item.
///
/// This is a SERVER operation because half a split is money: the source row still at two with one
/// clone already in would charge the check for three haircuts. Every operation below lands in the
/// same transaction, so it is all of it or none of it.
///
/// 🔴 Nothing here is re-priced against the catalogue, and that is deliberate: the row froze its
/// price when the line was added (sales#175). Re-reading the catalogue would reprice this morning's
/// check with this afternoon's prices, which is what freezing it removed.
pub fn split_order_line_pure(input: Value) -> Result<Output, String> {
    finish(split_order_line_inner(input))
}

fn split_order_line_inner(input: Value) -> Result<Output, Refusal> {
    let payload = input.get("payload").cloned().unwrap_or(Value::Null);
    let context = input.get("context").cloned().unwrap_or(Value::Null);
    let empty: Vec<Value> = Vec::new();
    let new_ids = context.get("new_ids").and_then(|v| v.as_array()).unwrap_or(&empty);
    let order_id = as_str(payload.get("order_id").unwrap_or(&Value::Null));
    let line_id = as_str(payload.get("line_id").unwrap_or(&Value::Null));

    // The order has to exist, belong to THIS hub and be open. The query filters by `hub_id` (the
    // runtime injects it), so zero rows means exactly that.
    if tax::read_rows(&context, "sales.order.get").unwrap_or_default().is_empty() {
        return Err(reject(
            "sales.order_unavailable",
            format!("`{order_id}` is not an open order of this business"),
        ));
    }

    // Fails CLOSED. `read_rows` answers `None` when the read did not resolve, and taking that for
    // «this check has no lines» would refuse with the wrong reason — or clone a row nobody handed
    // over. The read is declared `required` in the manifest for the same reason.
    let lines = tax::read_rows(&context, "sales.order.lines").ok_or_else(|| {
        reject("sales.order_lines_unavailable", format!("`{order_id}` did not hand over its lines"))
    })?;
    let row = *lines.iter().find(|r| field(r, "id") == line_id).ok_or_else(|| {
        reject(
            "sales.order_line_not_available",
            format!("`{line_id}` is not a live unpaid line of `{order_id}`"),
        )
    })?;

    let parts = splittable_parts(row)?;
    // The guest takes ids from the host's batch and can mint none of its own (sandbox without
    // randomness, §5.3). Running short is a broken contract, not a business refusal: the cap above
    // is what keeps it from happening.
    if new_ids.len() < (parts - 1) as usize {
        return Err(broken(format!("split_order_line: {} ids for {parts} parts", new_ids.len())));
    }

    // sales#200/#208 — what the supplements are worth was FROZEN on the row; this reads that, which
    // is why the command needs no catalogue. A row written before the snapshot existed carries no
    // `price_delta` and is refused rather than valued from the browser (`catalog_modifier`).
    let (modifier_delta, modifier_snapshot) = fold_modifiers(&resolve_modifiers(row, Some(row), None)?)?;
    let unit_price = as_cents(row.get("unit_price").unwrap_or(&Value::Null), 0);
    let line_disc = row.get("discount_percent").map(|v| as_f64(v, 0.0)).unwrap_or(0.0);
    if !rate_in_range(line_disc) {
        return Err(reject("sales.discount_out_of_range", format!("line discount {line_disc}")));
    }
    // 🔴 THE PART IS PRICED THE WAY THE CHECKOUT WILL PRICE IT, one unit at a time — not as a share
    // of the line's old total. `complete_sale` values every item on its own, so N parts written as
    // the largest-remainder shares of the old amount (ADR-0210) would leave `provisional_total` a
    // cent away from what the drawer takes, which is the drift the guard of sales#246 exists to
    // catch. ADR-0210 prorates a TICKET discount over lines; three discounted units priced one by
    // one is a different sum, and one by one is what they now are.
    let part_total = order_line_amount(
        unit_price + modifier_delta, QUANTITY_SCALE, line_price_qty(row), false, line_disc,
    )?;

    let mut ops: Vec<Operation> = Vec::with_capacity(parts as usize + 1);
    // The SOURCE row keeps its id — and with it its place in the check, its audit trail and
    // anything already pointing at it — and drops to one unit.
    let mut source = Map::new();
    source.insert("order_id".into(), json!(order_id));
    source.insert("line_id".into(), json!(line_id));
    source.insert("quantity".into(), json!(QUANTITY_SCALE));
    source.insert("line_total".into(), json!(part_total));
    // Everything the statement COALESCEs is sent as NULL on purpose: the split changes the quantity
    // and the amount, and nothing else about the line.
    source.insert("is_gift".into(), Value::Null);
    source.insert("gift_reason".into(), Value::Null);
    source.insert("discount_percent".into(), Value::Null);
    source.insert("notes".into(), Value::Null);
    ops.push(Operation::sql("sales._update_order_line", source));

    for i in 0..(parts - 1) {
        let new_id = new_ids.get(i as usize).map(as_str).unwrap_or_default();
        ops.push(Operation::sql(
            "sales._insert_order_line",
            split_clone_row(row, &new_id, &order_id, part_total, &modifier_snapshot),
        ));
    }

    let mut recompute = Map::new();
    recompute.insert("order_id".into(), json!(order_id));
    ops.push(Operation::sql("sales._recompute_order_total", recompute));
    Ok(Output { operations: ops, ..Default::default() })
}

/// How many lines of ONE this row becomes, or the reason it cannot become any.
///
/// One code for every «this row cannot be split», because they are one answer to the cashier and
/// the screen never offers the action in any of these cases (`splitCount`, `ui/lib/line-tender.ts`).
/// This is the second door and it does not trust the first.
fn splittable_parts(row: &Value) -> Result<i64, Refusal> {
    let line_id = field(row, "id");
    let refuse = |why: &str| {
        Err(reject("sales.line_not_splittable", format!("`{line_id}` {why}")))
    };
    // A line already in production is locked by `order_update_line.sql` (`fired_at IS NULL`): the
    // source row would keep its quantity while the clones went in, and the check would silently
    // grow by the whole line.
    if !field(row, "fired_at").is_empty() {
        return refuse("already went to production and its quantity can no longer be rewritten");
    }
    if row.get("is_gift").map(as_bool).unwrap_or(false) {
        return refuse("is a comp: it costs nothing, so no session covers it");
    }
    // A set menu is a GROUP of sibling lines, not a quantity (ADR-0381): cloning one would mint a
    // second menu out of a row that only holds part of the first.
    let combo = field(row, "combo");
    if (!combo.is_empty() && combo != "{}")
        || row.get("combo_group_ref").map(|v| !v.is_null()).unwrap_or(false)
    {
        return refuse("belongs to a set menu, which is a group of lines and not a quantity");
    }
    let qty = item_i64(row, "quantity", QUANTITY_SCALE);
    if qty <= 0 || qty % QUANTITY_SCALE != 0 {
        return refuse("is not a whole number of units, so it has no lines of one to become");
    }
    let parts = qty / QUANTITY_SCALE;
    if parts < 2 {
        return refuse("is already a line of one");
    }
    if parts > MAX_LINE_SPLIT {
        return refuse("is beyond the ceiling of units one split may write");
    }
    Ok(parts)
}

/// One of the N-1 rows a split writes: the SAME line, one unit of it.
///
/// Every frozen field travels verbatim — price (sales#175), tax category (ADR-0085), service flag
/// (sales#89), category snapshot (sales#12), note (sales#156), supplements (sales#200) and unit
/// context (ADR-0147 §2.4) — because they are what the check already agreed to charge. The two that
/// do NOT travel are the ones a clone must not inherit: `fired_at` (the clone never went to the
/// pass, and `splittable_parts` refuses a line that did) and the combo columns, refused upstream.
fn split_clone_row(
    row: &Value, new_id: &str, order_id: &str, part_total: i64, modifier_snapshot: &str,
) -> Map<String, Value> {
    let mut p = Map::new();
    p.insert("id".into(), json!(new_id));
    p.insert("order_id".into(), json!(order_id));
    p.insert("product_id".into(), row.get("product_id").cloned().unwrap_or(Value::Null));
    p.insert("product_name".into(), json!(field(row, "product_name")));
    p.insert("product_sku".into(), json!(field(row, "product_sku")));
    p.insert("quantity".into(), json!(QUANTITY_SCALE));
    freeze_unit_context(row, QUANTITY_SCALE, &mut p);
    p.insert("unit_price".into(), json!(as_cents(row.get("unit_price").unwrap_or(&Value::Null), 0)));
    p.insert("is_gift".into(), json!(0));
    p.insert("gift_reason".into(), json!(""));
    p.insert("line_total".into(), json!(part_total));
    p.insert("tax_category_key".into(), json!(field(row, "tax_category_key")));
    p.insert("cost".into(), json!(as_cents(row.get("cost").unwrap_or(&Value::Null), 0)));
    p.insert("is_service".into(), json!(row.get("is_service").map(as_bool).unwrap_or(false) as i64));
    p.insert("category_id".into(), category_snapshot(row));
    p.insert(
        "discount_percent".into(),
        json!(row.get("discount_percent").map(|v| as_f64(v, 0.0)).unwrap_or(0.0)),
    );
    p.insert("notes".into(), json!(field(row, "notes")));
    // sales#273: and WHO did it. Splitting «haircut x 2» into two haircuts of one does not change
    // who cut the hair, so both parts stay hers — otherwise half the work of the day would fall to
    // the ticket's professional and the close would be wrong by exactly that half, silently.
    p.insert("staff_id".into(), staff_ref(row));
    p.insert("modifiers".into(), json!(modifier_snapshot));
    p.insert("combo".into(), json!("{}"));
    p.insert("combo_group_ref".into(), Value::Null);
    p
}

/// ADR-0141 — **la comanda nace del pedido, no del cobro**.
///
/// Antes cocina colgaba de `sale.completed`: en un restaurante eso manda la comida cuando el
/// cliente **paga**, o sea al final del servicio. El camarero dispara cuando **toma nota**, y el
/// pedido sigue abierto una hora sin que exista ninguna venta.
///
/// `sales` sigue sin saber qué es una mesa: recibe una **etiqueta opaca** (`label`) que reenvía sin
/// interpretarla —quien dispara sabe si es "Mesa 4", "Barra" o "Recogida Ana"— y un **canal**
/// (`dine_in|takeaway|delivery`). Las líneas viajan en el payload porque las `reads` del runtime se
/// ejecutan **sin parámetros** (no se puede pre-cargar `sales.order.lines` filtrado por `order_id`),
/// igual que ya hace `complete_sale` con sus items.
///
/// No escribe nada: mandar comida a cocina no cambia el pedido. Cada disparo es una **ronda** y de
/// numerarlas se encarga `kitchen`, que es quien las imprime.
/// pm#93 — pone el NOMBRE DE COCINA a los suplementos de una comanda, resolviéndolo en el servidor.
///
/// El TPV manda solo `option_id`. El texto que se IMPRIME lo pone el servidor por el mismo motivo
/// que el precio: si lo pusiera el navegador, cualquiera podría escribir lo que quisiera en la
/// comanda que sale por la impresora de cocina.
///
/// 🔴 Aquí, a diferencia del cobro, NO se falla cerrado. Al cobrar, un precio sin verificar es un
/// agujero de dinero y la venta se rechaza. Aquí lo que está en juego es que la comida SALGA:
/// negarse a imprimir porque falta un catálogo dejaría la cocina parada por una integración
/// accesoria. Sin catálogo se manda lo que se sabe —el id—, que es mejor que un silencio.
fn name_modifiers_for_kitchen(items: &[Value], catalog: Option<&Vec<&Value>>) -> Vec<Value> {
    items
        .iter()
        .map(|item| {
            let picks = match item.get("modifiers").and_then(|v| v.as_array()) {
                Some(a) if !a.is_empty() => a,
                _ => return item.clone(),
            };
            let named: Vec<Value> = picks
                .iter()
                .map(|pick| {
                    let id = field(pick, "option_id");
                    let row = catalog.and_then(|rows| rows.iter().find(|r| field(r, "option_id") == id));
                    let Some(row) = row else {
                        // Sin catálogo o id desconocido: el id viaja igual. La comanda sale.
                        return json!({ "option_id": id });
                    };
                    let name = field(row, "name");
                    let kitchen = {
                        let k = field(row, "kitchen_name");
                        // Vacío = se imprime el comercial. Un hueco en la comanda es lo mismo que
                        // no haberla impreso.
                        if k.is_empty() { name.clone() } else { k }
                    };
                    json!({ "option_id": id, "name": name, "kitchen_name": kitchen })
                })
                .collect();
            let mut out = item.clone();
            if let Some(obj) = out.as_object_mut() {
                obj.insert("modifiers".into(), Value::Array(named));
            }
            out
        })
        .collect()
}

/// kitchen#54 — **las líneas que se cocinan las pone el SERVIDOR, no el navegador.**
///
/// El KDS recibía comandas VACÍAS: tarjeta con número y cronómetro, cero productos, sin rejilla por
/// estación y sin botón «Listo». `sales.order.fire` declaraba desde siempre su read de
/// `sales.order.lines` filtrada por `payload.order_id` —la puerta que aplica `hub_id` y el
/// permiso—, pero solo la usaba para el guard del doble toque: lo que viajaba en `order.fired`
/// salía de `payload.items`. Quien llamase al comando sin repetir el carrito (la API, el
/// asistente, una integración, un POS a medio cargar) disparaba una comanda en blanco con 200 OK.
///
/// La fila del pedido ya trae TODO lo que cocina necesita, y mejor que el payload: producto,
/// nombre, cantidad en punto fijo 10⁶ (ADR-0147), precio, `category_id` (sales#12, lo que enruta a
/// la estación), el id de la línea con el que `kitchen` reparte una anulación, `is_service` y el
/// snapshot de suplementos. And the cook's note too (sales#156): the free text the waiter typed
/// lives in `notes` on the row, and the comp reason is derived from `is_gift`/`gift_reason`, which
/// are on the row as well — the browser proposes neither.
fn kitchen_items_from_lines(rows: &[&Value], round_no: i64) -> Vec<Value> {
    rows.iter()
        // Con tandas, la ronda manda SOLO lo nuevo: la línea que ya salió no se vuelve a cocinar.
        // Sin `round_no` (compat) va el pedido entero, como siempre.
        .filter(|l| round_no < 1 || l.get("fired_at").map_or(true, Value::is_null))
        .map(|l| {
            // sales#156: the note the waiter typed now lives on the ROW, so it comes from HERE —
            // the same authority as the rest of the ticket. It shares its sub-line with the comp
            // reason, which is what used to be the only thing `notes` ever carried.
            let notes = kitchen_note(
                &field(l, "notes"),
                as_bool(l.get("is_gift").unwrap_or(&Value::Null)),
                &field(l, "gift_reason"),
            );
            json!({
                "product_id": l.get("product_id").cloned().unwrap_or(Value::Null),
                "product_name": field(l, "product_name"),
                "quantity": l.get("quantity").map(|v| as_qty(v, QUANTITY_SCALE)).unwrap_or(QUANTITY_SCALE),
                "unit_price": l.get("unit_price").map(|v| as_qty(v, 0)).unwrap_or(0),
                "notes": notes,
                "category_id": l.get("category_id").cloned().unwrap_or(Value::Null),
                "order_item_id": field(l, "id"),
                // Quien filtra las líneas de servicio es cocina, con el mismo criterio que
                // inventory al descontar stock. Aquí solo se transporta el hecho.
                "is_service": as_bool(l.get("is_service").unwrap_or(&Value::Null)),
                "modifiers": stored_modifiers(l),
            })
        })
        .collect()
}

/// 🔴 `sales_order_item.modifiers` es una columna **TEXT** con un JSON dentro (migración 023): la
/// read la devuelve como CADENA, no como lista. Pasarla tal cual imprimiría el JSON crudo por la
/// térmica de cocina, porque `kitchen::modifiers_for_display` trata una cadena como «formato
/// antiguo, ya viene escrito».
///
/// Si el texto no es la lista que escribimos, se pasa **verbatim** en vez de descartarlo: cocina
/// sabe imprimir una cadena suelta, y un suplemento que no sepamos releer es mejor en el vale que
/// desaparecido en silencio — que es justo el fallo estrella del sector (ADR-0376).
fn stored_modifiers(line: &Value) -> Value {
    match line.get("modifiers") {
        Some(Value::Array(a)) => Value::Array(a.clone()),
        Some(Value::String(s)) => match serde_json::from_str::<Value>(s) {
            Ok(v @ Value::Array(_)) => v,
            _ => Value::String(s.clone()),
        },
        _ => json!([]),
    }
}

pub fn fire_order_pure(input: Value) -> Result<Output, String> {
    finish(fire_order_inner(input))
}

/// The decision itself (sales#201). A business rejection comes back as `Refusal::Domain`
/// and [`finish`] hands it to the caller inside `Output.error`, which is the only channel
/// that reaches the browser as a translatable `code`.
fn fire_order_inner(input: Value) -> Result<Output, Refusal> {
    let payload = input.get("payload").cloned().unwrap_or(Value::Null);
    let order_id = as_str(payload.get("order_id").unwrap_or(&Value::Null));
    if order_id.is_empty() {
        return Err(reject("sales.order_id_required", "a fire needs the order it fires"));
    }
    let channel = match as_str(payload.get("channel").unwrap_or(&Value::Null)).as_str() {
        "" => "dine_in".to_string(),
        c => c.to_string(),
    };

    // TANDAS (decisión Ioan 2026-07-19): si el POS manda `round_no` (≥1), las líneas aún sin
    // enviar quedan marcadas con esa ronda (`fired_at IS NULL` filtra en el SQL) — es lo que
    // permite que el siguiente disparo mande SOLO lo nuevo (antes cada fire reenviaba el carrito
    // entero: comida duplicada en cocina). El número es la vista LOCAL del pedido; `kitchen`
    // sigue numerando sus rondas (ADR-0144) y ambos coinciden porque cuentan los mismos disparos.
    // Sin `round_no` (POS viejo, integraciones): comportamiento de siempre, no se escribe nada.
    let round_no = payload.get("round_no").and_then(|v| v.as_i64()).unwrap_or(0);
    // sales#80 — el doble toque. `_mark_lines_fired` filtra `fired_at IS NULL`, así que el SEGUNDO
    // disparo de la misma tanda marcaba 0 filas… y emitía `order.fired` igual: kitchen abría una
    // ronda 2 con la misma comida. El handler no ve las filas afectadas (el SQL corre después),
    // así que mira el estado del pedido ANTES en la read `sales.order.lines` (filtrada por
    // `order_id`, module.json). Con `round_no` y NADA pendiente no hay tanda → se rechaza sin
    // emitir. Sin la read (runtime viejo) no se puede saber → compat, como siempre.
    let context = input.get("context").cloned().unwrap_or(Value::Null);
    // kitchen#54 — las líneas salen de la READ (autoridad del servidor). Sin la read (runtime
    // viejo, integración fuera del dispatcher) no hay de dónde sacarlas: se cae al payload, que es
    // el comportamiento de siempre y lo único disponible.
    let items = match tax::read_rows(&context, "sales.order.lines") {
        Some(rows) => kitchen_items_from_lines(&rows, round_no),
        None => payload
            .get("items")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default(),
    };
    // Una comanda sin líneas no es una comanda: es una tarjeta en blanco en el KDS que nadie puede
    // cocinar y que nadie sabe que está mal. Aquí caen los tres casos que la producían — el pedido
    // no existe en este hub (el `order_id` basura fabricaba una comanda igual), el pedido está
    // vacío, y el segundo toque de la misma tanda (sales#80), que ya se rechazaba. Se rechaza
    // ANTES de emitir: `order.fired` no sale.
    if items.is_empty() {
        return Err(reject(
            "sales.nothing_to_fire",
            format!(
                "order {order_id} has no lines to fire (unknown order, empty order, or this round was already fired)"
            ),
        ));
    }
    let mut ops: Vec<Operation> = Vec::new();
    if round_no >= 1 {
        let mut p = Map::new();
        p.insert("order_id".into(), json!(order_id));
        p.insert("round_no".into(), json!(round_no));
        ops.push(Operation::sql("sales._mark_lines_fired", p));
    }

    let mut ev = json!({
        "sender": "sales",
        "order_id": order_id,
        // Opaca a propósito: `sales` no sabe (ni quiere saber) de dónde sale este texto.
        "label": str_or(&payload, "label", ""),
        "channel": channel,
        // sales#179 — **the ticket says who fired it.** `kitchen` already stores `waiter_id` on
        // its ticket, but nobody ever gave it one: the KDS showed the round with no waiter and the
        // pass had nobody to call. The default is the SESSION user, resolved by the SERVER; when
        // the caller sends the table's own waiter (`tables` owns the session and its waiter), that
        // one wins — `sales` forwards it without interpreting it, exactly like `label`.
        "waiter_id": attributed_person(
            &payload,
            "waiter_id",
            &context.get("current_user_id").map(as_str).unwrap_or_default(),
        ),
        // pm#93: los suplementos salen con el nombre que resuelve el SERVIDOR, no el navegador.
        "items": name_modifiers_for_kitchen(
            &items,
            tax::read_rows(&context, "modifiers.options.all").as_ref(),
        ),
    });
    if round_no >= 1 {
        ev["round_no"] = json!(round_no); // informativo: kitchen numera lo suyo (ADR-0144)
    }
    // hub#1411 — **la urgencia nace al disparar.** La comanda se imprime UNA sola vez, cuando
    // `kitchen` crea la ronda, así que marcarla después no reimprime nada: si el camarero quiere
    // que el pase la vea correr, tiene que decirlo aquí. `sales` no interpreta la palabra —no
    // sabe qué es una cocina—, la reenvía OPACA igual que `label` y `waiter_id`; el vocabulario y
    // su validación son de `kitchen`. Sin urgencia la clave NO viaja: `order.fired` lo leen más
    // módulos y `kitchen` ya asume `normal` cuando falta.
    let priority = str_or(&payload, "priority", "");
    if !priority.is_empty() {
        ev["priority"] = json!(priority);
    }
    let event = Event::new("order.fired", ev);
    Ok(Output { operations: ops, events: vec![event], ..Default::default() })
}

/// sales#26 — **anular es auditable, idempotente y respeta la factura.**
///
/// Lo que hace el mercado (Square, Toast, Lightspeed, Odoo, Business Central, Shopify, Holded,
/// Clover — tabla en la issue): nadie BORRA una venta pagada; el original queda inmutable y se
/// añade el reverso; el motivo es obligatorio en el TPV de hostelería y en el software fiscal
/// español; el permiso es propio (`sales.void_sale`); con factura completa emitida solo cabe la
/// rectificativa (invoice#5); y el reverso es de UN solo disparo — los foros están llenos de
/// reembolsos dobles.
///
/// El handler lee la venta que dice el payload (`sales.get`, read `required` filtrada por
/// `payload.sale_id`) y decide con código propio:
///   * no está en este hub / read ausente → `sales.sale_not_found`
///   * ya anulada / reembolsada / no cerrada → `sales.already_voided` (segunda llamada = rechazo,
///     sin evento: los consumidores no ven un segundo `sale.voided`)
///   * `document_type = invoice` → `sales.void_requires_credit_note`
///   * con devoluciones ya emitidas → `sales.sale_already_refunded` (sales#247: se ha movido
///     dinero, así que lo que queda es devolver el resto, no anular)
///   * motivo vacío → `sales.void_reason_required`
/// Si aplica: `sales._void_sale` (status + `voided_at/voided_by/void_reason`, el resto de la
/// fila intacto) y `sale.voided` con la identidad de la operación.
pub fn void_sale_pure(input: Value) -> Result<Output, String> {
    finish(void_sale_inner(input))
}

/// The decision itself (sales#201). A business rejection comes back as `Refusal::Domain`
/// and [`finish`] hands it to the caller inside `Output.error`, which is the only channel
/// that reaches the browser as a translatable `code`.
fn void_sale_inner(input: Value) -> Result<Output, Refusal> {
    let payload = input.get("payload").cloned().unwrap_or(Value::Null);
    let context = input.get("context").cloned().unwrap_or(Value::Null);
    let sale_id = field(&payload, "sale_id");
    if sale_id.is_empty() {
        return Err(reject("sales.sale_not_found", "missing sale_id"));
    }
    let reason = field(&payload, "reason").trim().to_string();
    if reason.is_empty() {
        return Err(reject("sales.void_reason_required", "a void needs a reason"));
    }
    let rows = tax::read_rows(&context, "sales.get").unwrap_or_default();
    let sale = rows
        .iter()
        .find(|r| field(r, "id") == sale_id)
        .ok_or_else(|| reject("sales.sale_not_found", format!("sale {sale_id} is not in this hub")))?;
    if field(sale, "status") != "completed" {
        return Err(reject(
            "sales.already_voided",
            format!("sale {sale_id} is `{}`: only a completed sale can be voided, and only once", field(sale, "status")),
        ));
    }
    if field(sale, "document_type") == "invoice" {
        return Err(reject(
            "sales.void_requires_credit_note",
            format!("sale {sale_id} carries a full invoice: issue a credit note (rectificativa) instead of voiding"),
        ));
    }
    // sales#247 — the door closes the moment money MOVED. A PARTIAL refund leaves the sale
    // `completed` (`_mark_refunded` only fires on the last cent), so without this the till offered
    // an «annulment» of a charge that has already been partly given back — an operation no POS in
    // the market has: Stripe cannot cancel a captured intent, Lightspeed answers «you must refund
    // the sale instead of voiding it», Dynamics 365 BC blocks its Cancel button, and Shopify warns
    // in writing that cancelling an already refunded order triggers duplicate refund processing.
    //
    // The refunds are a `required` read of this command, so an empty list is a resolved «none»
    // and not a runtime that stayed quiet (hub#701 aborts a required read that FAILS).
    let refunds = tax::read_rows(&context, "sales.refunds").unwrap_or_default();
    if !refunds.is_empty() {
        return Err(reject(
            "sales.sale_already_refunded",
            format!(
                "sale {sale_id} already has {} refund(s): return what is left instead of voiding it",
                refunds.len()
            ),
        ));
    }
    let voided_by = as_str(context.get("current_user_id").unwrap_or(&Value::Null));
    let mut p = Map::new();
    p.insert("sale_id".into(), json!(sale_id));
    p.insert("void_reason".into(), json!(reason));
    p.insert("voided_by".into(), json!(voided_by));
    let event = Event::new("sale.voided", json!({
        "sender": "sales",
        "sale_id": sale_id,
        "sale_number": sale.get("sale_number").cloned().unwrap_or(Value::Null),
        "reason": reason,
        "voided_by": voided_by,
        "voided_at": context.get("now").cloned().unwrap_or(Value::Null),
        "total": sale.get("total").cloned().unwrap_or(Value::Null),
        "payment_method_name": sale.get("payment_method_name").cloned().unwrap_or(Value::Null),
        "order_id": sale.get("order_id").cloned().unwrap_or(Value::Null),
        "document_type": sale.get("document_type").cloned().unwrap_or(Value::Null),
    }));
    Ok(Output { operations: vec![Operation::sql("sales._void_sale", p)], events: vec![event], ..Default::default() })
}

/// sales#160 / ADR-0386 decisión 3 — **devolver una venta cobrada con VARIOS medios**.
///
/// Es el fallo más repetido del mercado y ninguno lo resuelve: Shopify POS prorratea y lo tiene
/// HARDCODED (*«there's no setting or permission to change it»*); Square obliga al tender original
/// *«even if the gift card does not exist or has been reused»* (reportado en 2018, sin solución en
/// 2021); Odoo, al devolver por otro método, genera un asiento inválido.
///
/// Aquí decide el operador y el servidor solo hace de **tope**. Y hay DOS ejes, que confundirlos
/// es justo lo que deja al cajero encerrado:
///
/// * **De dónde sale** — la pata original (`payment_id`). Su tope es lo que esa pata cobró menos
///   lo que ya se le devolvió, y pasarse se rechaza **diciendo cuál** se pasó.
/// * **A dónde va** — el método de destino. Por defecto el de la propia pata (se devuelve por
///   donde se cobró). Cuando esa puerta ya no existe, la pata sale marcada **no elegible con su
///   motivo** por `sales.refund_options` y el operador nombra otro destino con
///   `to_payment_method_id`. Marcarla y no dejar salida sería el bug de Square con mejores
///   palabras.
///
/// **No es una operación fiscal en sí**: la devolución es el hecho económico y la rectificativa es
/// su documento (invoice#5 / hub#1023). Por eso, al revés que `sales.void`, una venta CON FACTURA
/// sí se devuelve — si esto la rechazara, una venta facturada no tendría reverso en el TPV.
///
/// El id del documento es la referencia (`refund_ref`) que `services` usa como clave de
/// idempotencia para devolver la sesión al bono, así que es **estable por documento**: un reintento
/// con la misma `idempotency_key` no escribe nada y responde con el MISMO id.
pub fn refund_sale_pure(input: Value) -> Result<Output, String> {
    finish(refund_sale_inner(input))
}

/// The decision itself (sales#201). A business rejection comes back as `Refusal::Domain`
/// and [`finish`] hands it to the caller inside `Output.error`, which is the only channel
/// that reaches the browser as a translatable `code`.
fn refund_sale_inner(input: Value) -> Result<Output, Refusal> {
    let payload = input.get("payload").cloned().unwrap_or(Value::Null);
    let context = input.get("context").cloned().unwrap_or(Value::Null);

    // ── El reintento, ANTES que nada ────────────────────────────────────────────────────────
    //
    // Se cae el wifi entre el INSERT y la respuesta y el cajero vuelve a pulsar. Si esto se
    // comprobara DESPUÉS de validar el reparto, el reintento moriría con
    // `sales.refund_exceeds_tender` — porque la primera pasada ya consumió el tope— y el operador
    // leería «te has pasado» sobre una devolución que ya salió. El dinero es lo último que puede
    // permitirse un mensaje equivocado.
    if let Some(prev) = tax::read_rows(&context, "sales.refund_by_idempotency_key")
        .unwrap_or_default()
        .first()
        .filter(|r| !field(r, "id").is_empty())
    {
        let id = field(prev, "id");
        return Ok(Output {
            result: Some(json!({
                "already": true,
                "refund_id": id,
                "refund_ref": id,
                "total": prev.get("total").cloned().unwrap_or(json!(0)),
            })),
            ..Default::default()
        });
    }

    let sale_id = field(&payload, "sale_id");
    if sale_id.is_empty() {
        return Err(reject("sales.sale_not_found", "missing sale_id"));
    }
    let sale_rows = tax::read_rows(&context, "sales.get").unwrap_or_default();
    let sale = sale_rows
        .iter()
        .find(|r| field(r, "id") == sale_id)
        .ok_or_else(|| reject("sales.sale_not_found", format!("sale {sale_id} is not in this hub")))?;

    // Una venta anulada no tiene dinero que devolver, y una ya devuelta entera tampoco. La factura
    // NO bloquea: ver el doc de arriba.
    if field(sale, "status") != "completed" {
        return Err(reject(
            "sales.refund_requires_completed",
            format!(
                "sale {sale_id} is `{}`: only a completed sale can be refunded",
                field(sale, "status")
            ),
        ));
    }

    let reason = field(&payload, "reason").trim().to_string();
    if reason.is_empty() {
        return Err(reject("sales.refund_reason_required", "a refund needs a reason"));
    }

    // Las patas, con su tope y su elegibilidad ya resueltos por la puerta que lee la BD. El handler
    // no los recalcula: lo que ya se devolvió está en filas que él no ve.
    let options = tax::read_rows(&context, "sales.refund_options").unwrap_or_default();
    let catalog = tax::read_rows(&context, "sales.payment_methods").unwrap_or_default();

    let allocations: Vec<&Value> = payload
        .get("allocations")
        .and_then(|v| v.as_array())
        .map(|a| a.iter().collect())
        .unwrap_or_default();
    if allocations.is_empty() {
        return Err(reject(
            "sales.refund_nothing_to_return",
            "a refund must say which tender each cent goes back to",
        ));
    }

    let new_ids: Vec<String> = context
        .get("new_ids")
        .and_then(|v| v.as_array())
        .map(|a| a.iter().map(as_str).collect())
        .unwrap_or_default();
    // Cabecera + una fila por pata. Quedarse corto y tirar de `unwrap_or_default()` escribiría
    // filas con la clave primaria vacía, y la segunda chocaría contra la primera.
    if 1 + allocations.len() > new_ids.len() {
        return Err(reject(
            "sales.too_many_rows",
            format!(
                "{} refund legs need {} ids, the host gave {}",
                allocations.len(),
                1 + allocations.len(),
                new_ids.len()
            ),
        ));
    }

    let refund_id = new_ids[0].clone();
    let mut seen: Vec<String> = Vec::with_capacity(allocations.len());
    let mut legs: Vec<Map<String, Value>> = Vec::with_capacity(allocations.len());
    let mut event_legs: Vec<Value> = Vec::with_capacity(allocations.len());
    let mut total: i64 = 0;

    for (idx, alloc) in allocations.iter().enumerate() {
        let payment_id = field(alloc, "payment_id");
        let leg = options
            .iter()
            .find(|o| field(o, "payment_id") == payment_id)
            .ok_or_else(|| {
                reject(
                    "sales.refund_tender_unknown",
                    format!("`{payment_id}` is not a tender of sale {sale_id}"),
                )
            })?;
        if seen.contains(&payment_id) {
            // Dos filas de 20,00 € sobre una pata de 20,00 € pasan el tope una a una y lo rompen
            // juntas. Sumarlas calladamente escondería un reparto que el operador no quiso.
            return Err(reject(
                "sales.refund_tender_duplicated",
                format!("tender `{payment_id}` appears twice in the same refund"),
            ));
        }
        seen.push(payment_id.clone());

        // Dinero: entero positivo en céntimos y nada más. Un `"mucho"` o un negativo no se
        // interpretan — un importe negativo aquí sería un COBRO disfrazado de devolución.
        let amount = match alloc.get("amount") {
            Some(v) if v.is_i64() => v.as_i64().unwrap_or(0),
            _ => 0,
        };
        if amount <= 0 {
            return Err(reject(
                "sales.refund_amount_invalid",
                format!(
                    "tender `{payment_id}` was given {:?}: a refund leg is a positive amount in cents",
                    alloc.get("amount").unwrap_or(&Value::Null)
                ),
            ));
        }

        let method_name = field(leg, "payment_method_name");
        let charged = item_i64(leg, "charged", 0);
        let remaining = leg
            .get("remaining")
            .map(|v| as_qty(v, 0))
            .unwrap_or_else(|| charged - item_i64(leg, "refunded", 0));
        if amount > remaining {
            // 🔴 El tope de la issue. Y el mensaje NOMBRA la pata: «no cuadra» a secas obliga al
            // cajero a adivinar cuál de las tres tocar.
            return Err(reject(
                "sales.refund_exceeds_tender",
                format!(
                    "`{method_name}` was charged {charged} and {remaining} is still refundable: {amount} is more than that"
                ),
            ));
        }

        // ── A dónde vuelve el dinero ────────────────────────────────────────────────────────
        let to_method_id = field(alloc, "to_payment_method_id");
        let (method_id, name, kind) = if to_method_id.is_empty() {
            // Por donde se cobró. La puerta ya dijo si eso sigue siendo posible.
            if item_i64(leg, "refundable", 1) != 1 {
                let why = field(leg, "reason");
                return Err(reject(
                    "sales.refund_tender_not_eligible",
                    format!(
                        "`{method_name}` cannot take its own money back ({}): choose another destination",
                        if why.is_empty() { "not_refundable".to_string() } else { why }
                    ),
                ));
            }
            (
                leg.get("payment_method_id").cloned().unwrap_or(Value::Null),
                method_name.clone(),
                field(leg, "payment_method_type"),
            )
        } else {
            // Un destino distinto: sale del CATÁLOGO del hub, no del navegador — mismo criterio
            // que el cobro (sales#20).
            let m = catalog
                .iter()
                .find(|m| field(m, "id") == to_method_id && item_i64(m, "is_active", 1) == 1)
                .ok_or_else(|| {
                    reject(
                        "sales.refund_method_unavailable",
                        format!("payment method `{to_method_id}` is not available in this hub"),
                    )
                })?;
            (json!(to_method_id), field(m, "name"), field(m, "type"))
        };

        total += amount;

        let mut p = Map::new();
        p.insert("refund_payment_id".into(), json!(new_ids[1 + idx]));
        p.insert("refund_id".into(), json!(refund_id));
        p.insert("sale_id".into(), json!(sale_id));
        p.insert("payment_id".into(), json!(payment_id));
        p.insert("payment_method_id".into(), method_id.clone());
        p.insert("payment_method_name".into(), json!(name));
        p.insert("payment_method_type".into(), json!(kind));
        p.insert("amount".into(), json!(amount));
        p.insert("sort_order".into(), json!(idx as i64));
        legs.push(p);

        event_legs.push(json!({
            "payment_id": payment_id,
            "payment_method_id": method_id,
            "payment_method_name": name,
            "payment_method_type": kind,
            "amount": amount,
        }));
    }

    // ¿Queda algo cobrado? Se compara CONTRA EL TOTAL DE LA VENTA, no contra las patas: es el
    // dinero lo que decide si la venta sigue viva, y una pata cuyo método murió puede volver por
    // otra puerta sin que su propia fila llegue nunca a cero.
    let sale_total = item_i64(sale, "total", 0);
    let already: i64 = options.iter().map(|o| item_i64(o, "refunded", 0)).sum();
    let fully_refunded = sale_total > 0 && already + total >= sale_total;

    let mut operations: Vec<Operation> = Vec::with_capacity(2 + legs.len());
    let mut head = Map::new();
    head.insert("refund_id".into(), json!(refund_id));
    head.insert("sale_id".into(), json!(sale_id));
    head.insert("total".into(), json!(total));
    head.insert("reason".into(), json!(reason));
    head.insert("note".into(), json!(field(&payload, "note")));
    head.insert("idempotency_key".into(), json!(field(&payload, "idempotency_key")));
    operations.push(Operation::sql("sales._insert_refund", head));
    for leg in legs {
        operations.push(Operation::sql("sales._insert_refund_payment", leg));
    }
    if fully_refunded {
        // Sin esta marca la lista de ventas sigue diciendo `completed` sobre una venta que ya no
        // tiene dinero detrás, y el histórico miente en la única pantalla que el dueño mira.
        let mut m = Map::new();
        m.insert("sale_id".into(), json!(sale_id));
        operations.push(Operation::sql("sales._mark_refunded", m));
    }

    let refunded_by = as_str(context.get("current_user_id").unwrap_or(&Value::Null));
    let event = Event::new(
        "sale.refunded",
        json!({
            "sender": "sales",
            "sale_id": sale_id,
            "sale_number": sale.get("sale_number").cloned().unwrap_or(Value::Null),
            "refund_id": refund_id,
            // La referencia ES el documento: `services` la usa como clave de idempotencia.
            "refund_ref": refund_id,
            "total": total,
            "reason": reason,
            "refunded_by": refunded_by,
            "refunded_at": context.get("now").cloned().unwrap_or(Value::Null),
            "fully_refunded": fully_refunded,
            "document_type": sale.get("document_type").cloned().unwrap_or(Value::Null),
            "order_id": sale.get("order_id").cloned().unwrap_or(Value::Null),
            "payments": event_legs,
        }),
    );

    Ok(Output {
        operations,
        events: vec![event],
        result: Some(json!({
            "already": false,
            "refund_id": refund_id,
            "refund_ref": refund_id,
            "total": total,
            "fully_refunded": fully_refunded,
        })),
        ..Default::default()
    })
}


#[cfg(test)]
mod tests {
    use super::*;

    /// How a test reads what a command answered (sales#201).
    ///
    /// A business rejection is NOT an `Err`: it is a normal output carrying `Output.error`, which
    /// is the only channel that reaches the browser as a translatable `code`. So `.expect()` on
    /// the result would swallow a refusal — the sale would look accepted and the test would go
    /// green over nothing. These three read the answer for what it is.
    ///
    /// An `Err` still exists and still fails the test loudly: it means the guest could not honour
    /// its contract (a snapshot that will not encode), which is a bug, never an answer.
    trait Answered {
        /// The output of a command that went THROUGH. Fails if the handler refused it.
        fn accepted(self, what: &str) -> Output;
        /// The domain error of a REFUSED command. Fails if the command went through.
        fn refused(self, what: &str) -> DomainError;
        /// Whether the command was refused, for the tests that only care that it did not go in.
        fn was_refused(self) -> bool;
    }

    impl Answered for Result<Output, String> {
        fn accepted(self, what: &str) -> Output {
            match self {
                Ok(out) => {
                    assert!(out.error.is_none(), "{what}: refused with {:?}", out.error);
                    out
                }
                Err(e) => panic!("{what}: broken guest contract, not an answer: {e}"),
            }
        }

        fn refused(self, what: &str) -> DomainError {
            match self {
                Ok(out) => match out.error {
                    Some(error) => {
                        assert!(out.operations.is_empty(), "{what}: a refusal persists nothing");
                        assert!(out.events.is_empty(), "{what}: a refusal announces nothing");
                        error
                    }
                    None => panic!("{what}: the command went through instead of being refused"),
                },
                Err(e) => panic!("{what}: broken guest contract, not a refusal: {e}"),
            }
        }

        fn was_refused(self) -> bool {
            matches!(self, Ok(out) if out.error.is_some())
        }
    }

    /// Los comandos ahora RECHAZAN cantidades inválidas (ADR-0147 §2.2): los tests del camino
    /// feliz desenvuelven aquí para no repetir `.expect` en cada uno.
    fn sale(inp: Value) -> Output { complete_sale_pure(inp).accepted("venta válida") }
    fn orden(inp: Value) -> Output { open_order_pure(inp).accepted("pedido válido") }

    // ── sales#201: the CHANNEL a refusal travels through ─────────────────────────────────
    //
    // A business refusal is a normal guest output (`Output.error`), never an `Err`. That is not a
    // stylistic choice: `Output.error` is the ONLY channel the runtime turns into
    // `RuntimeError::Domain { code }` (`crates/runtime/src/commands.rs`), and therefore the only
    // one that reaches the browser as a `code`. An `Err` from the guest becomes
    // `RuntimeError::Wasm`, which the server answers as HTTP 400 with the flat `code: "error"` —
    // so the cashier cannot be told whether the menu is missing a dish or the till lost its
    // connection, and the 26 mappings of `ui/lib/checkout-key.ts` never fire.
    //
    // The assertion is on the CODE and on the SHAPE, never on the sentence (ADR-0398 §6): the
    // sentence is translated, the code is the ABI.

    #[test]
    fn a_refusal_publishes_its_code_through_output_error() {
        let out = complete_sale_pure(input(json!([]), 3, 0)).expect("a refusal is NOT an Err");
        let err = out.error.as_ref().expect("a refusal carries its domain error");
        assert_eq!(err.code, "sales.empty_sale");
        assert!(out.operations.is_empty(), "a refusal persists nothing");
        assert!(out.events.is_empty(), "a refusal announces nothing");

        // And the same answer, read the way the runtime reads it before it becomes HTTP: the code
        // travels in `Output.error`, so it survives serialisation to the guest ABI.
        let wire: Value = serde_json::from_slice(&serde_json::to_vec(&out).expect("Output encodes"))
            .expect("Output is JSON");
        assert_eq!(wire["error"]["code"], json!("sales.empty_sale"));
    }

    fn input(items: Value, ids: usize, tendered: i64) -> Value {
        let new_ids: Vec<Value> = (0..ids).map(|i| json!(format!("id-{i}"))).collect();
        json!({
            "payload": { "items": items, "tax_included": true, "amount_tendered": tendered, "customer_name": "Bar Manolo",
                         "payment_method_id": "pm-1", "payment_method_name": "Efectivo",
                         // sales#20: the checkout is server-authoritative and every attempt carries
                         // its own idempotency key, so a retry can never become a second sale.
                         "idempotency_key": "idem-test-0001" },
            "context": { "hub_id": "h1", "current_user_id": "u1", "now": "2026-05-31T10:00:00+00:00", "new_ids": new_ids }
        })
    }

    /// sales#175 — opening a check FREEZES the price of its lines, so that door checks against
    /// `inventory.products.for_sale` with the same rule the checkout has had since sales#68. This
    /// helper delivers the catalogue the hub would have: the SAME price the till painted, which is
    /// the normal case. The case where they differ — the one this issue is about — has its own
    /// tests, and there the catalogue is written by hand.
    fn order_input(items: Value, ids: usize) -> Value {
        let rows: Vec<Value> = items
            .as_array()
            .cloned()
            .unwrap_or_default()
            .iter()
            .filter(|it| !field(it, "product_id").is_empty() && field(it, "combo_id").is_empty())
            .map(|it| {
                json!({
                    "id": field(it, "product_id"),
                    "price": as_cents(it.get("price").unwrap_or(&Value::Null), 0),
                    "cost": as_cents(it.get("cost").unwrap_or(&Value::Null), 0),
                    "tax_category_key": str_or(it, "tax_category_key", ""),
                })
            })
            .collect();
        let mut inp = input(items, ids, 0);
        inp["context"]["reads"] = json!({ "inventory.products.for_sale": rows });
        inp
    }

    // ── ADR-0141 · entidad `order` mutable → `sale` inmutable (en construcción TDD) ──────────────

    #[test]
    fn un_cobro_por_LINEAS_marca_solo_esas_como_pagadas() {
        // ADR-0146 etapa 5 — «cada uno paga lo suyo». Al cobrar una parte, esas líneas quedan
        // atadas a SU venta; las demás siguen pendientes y se cobran después. Sin esto, al reanudar
        // el pedido volverían a salir las ya pagadas y se cobrarían dos veces.
        let mut inp = input(
            json!([{ "product_name": "Menú", "price": 500, "quantity": 1_000_000, "tax_rate": 21.0 }]),
            3,
            500,
        );
        inp["payload"]["order_id"] = json!("ord-1");
        inp["payload"]["keep_order_open"] = json!(true);
        inp["payload"]["line_ids"] = json!(["line-3", "line-4"]);
        let out = sale(inp);

        let marcadas: Vec<&str> = out
            .operations
            .iter()
            .filter(|o| o.command == "sales._mark_order_line_paid")
            .map(|o| o.params["line_id"].as_str().unwrap_or(""))
            .collect();
        assert_eq!(marcadas, vec!["line-3", "line-4"], "solo las líneas cobradas");

        // Y quedan atadas a LA venta que las cobró, que es lo que permite reconstruir quién pagó qué.
        let sale_id = out.operations.iter()
            .find(|o| o.command == "sales._insert_sale")
            .map(|o| o.params["sale_id"].clone())
            .expect("la venta");
        for op in out.operations.iter().filter(|o| o.command == "sales._mark_order_line_paid") {
            assert_eq!(op.params["sale_id"], sale_id);
        }
    }

    #[test]
    fn un_cobro_normal_no_marca_lineas_sueltas() {
        // Sin `line_ids` se cobra el pedido entero y se cierra: no hay nada que marcar línea a línea.
        let mut inp = input(json!([{ "product_name": "Menú", "price": 500, "quantity": 1_000_000, "tax_rate": 21.0 }]), 3, 500);
        inp["payload"]["order_id"] = json!("ord-1");
        let out = sale(inp);
        assert!(!out.operations.iter().any(|o| o.command == "sales._mark_order_line_paid"));
        assert!(out.operations.iter().any(|o| o.command == "sales._complete_order"),
                "el cobro entero SÍ cierra el pedido");
    }

    #[test]
    fn abrir_un_pedido_persiste_su_etiqueta_opaca() {
        // La etiqueta («Mesa 4», «Ana — terraza», «15:07») es lo que hace RECUPERABLE una cuenta
        // abierta: sin ella la lista de aparcados salía anónima (solo total+hora) y los tiquets
        // «desaparecían» a la vista. Opaca como la del disparo a cocina (ADR-0144): `sales` no
        // sabe si es una mesa o un nombre — la escribe quien la conoce.
        let mut inp = input(json!([{ "product_name": "Menú", "price": 500, "quantity": 1_000_000 }]), 2, 0);
        inp["payload"]["label"] = json!("Mesa 4");
        let out = orden(inp);
        let header = out.operations.iter().find(|o| o.command == "sales._insert_order").expect("cabecera");
        assert_eq!(header.params["label"], json!("Mesa 4"));
    }

    #[test]
    fn abrir_sin_etiqueta_deja_cadena_vacia() {
        // Cuenta de barra sin nombre: etiqueta vacía, nunca NULL ni ausente — el SQL bindea :label.
        let out = orden(input(json!([{ "product_name": "Menú", "price": 500, "quantity": 1_000_000 }]), 2, 0));
        let header = out.operations.iter().find(|o| o.command == "sales._insert_order").expect("cabecera");
        assert_eq!(header.params["label"], json!(""));
    }

    #[test]
    fn disparar_con_ronda_marca_las_lineas_pendientes_del_pedido() {
        // Tandas (decisión Ioan 2026-07-19): al disparar, las líneas aún sin enviar quedan
        // MARCADAS con su ronda (`sales._mark_lines_fired` filtra fired_at IS NULL). Es lo que
        // permite que el siguiente disparo mande SOLO lo nuevo — antes cada fire reenviaba el
        // carrito entero y cocina recibía comida duplicada. `kitchen` sigue numerando lo suyo
        // (ADR-0144); este número es la vista local del pedido y viaja informativo.
        let inp = json!({
            "payload": {
                "order_id": "ord-1", "label": "Mesa 4", "channel": "dine_in", "round_no": 2,
                "items": [{ "product_name": "Entrecot", "quantity": 1_000_000 }]
            },
            "context": { "hub_id": "h1", "current_user_id": "u1", "now": "2026-07-19T14:25:00+00:00", "new_ids": [] }
        });
        let out = fire_order_pure(inp).accepted("disparar la ronda");

        let marca = out.operations.iter().find(|o| o.command == "sales._mark_lines_fired")
            .expect("el disparo con ronda marca las líneas pendientes");
        assert_eq!(marca.params["order_id"], json!("ord-1"));
        assert_eq!(marca.params["round_no"], json!(2));

        // Y el evento sigue saliendo UNA vez, con la ronda informativa para kitchen.
        assert_eq!(out.events.len(), 1);
        assert_eq!(out.events[0].payload["round_no"], json!(2));
    }

    #[test]
    fn una_ronda_disparada_como_urgente_lleva_su_prioridad_en_el_evento() {
        // hub#1411 — **nadie podía decirle al pase que una ronda corre.** El renderizador del
        // papel imprime «!! URGENTE !!» y `kitchen` guarda `priority` en su comanda desde la
        // primera migración, pero `order.fired` no llevaba el campo: la urgencia no tenía por
        // dónde viajar del TPV a cocina.
        //
        // `sales` NO interpreta la palabra —no sabe qué es una cocina—: la reenvía OPACA, igual
        // que `label` y `waiter_id`. El vocabulario (`normal`/`rush`/`vip`) y su validación son
        // de `kitchen`, que es quien la escribe en su fila.
        let mut inp = fire_input_with_lines(1, json!([{ "id": "l1", "product_name": "Entrecot", "quantity": 1_000_000 }]));
        inp["payload"]["priority"] = json!("rush");
        let out = fire_order_pure(inp).accepted("disparar la ronda urgente");

        assert_eq!(out.events.len(), 1);
        assert_eq!(
            out.events[0].payload["priority"],
            json!("rush"),
            "la urgencia tiene que llegar a cocina: {:?}",
            out.events[0].payload
        );
    }

    #[test]
    fn a_priority_that_is_not_rush_travels_verbatim() {
        // 🔴 THE FORWARDING IS VERBATIM, and the `rush` case alone cannot prove it: measured while
        // reviewing sales#258, a `fire_order_inner` that wrote `json!("rush")` whenever a priority
        // arrived passed all 295 tests. The mutant is not academic — `vip` is a valid `kitchen`
        // word this module forwards on purpose (hub#1411 leaves it out of the paper banner ON
        // PURPOSE: it is a FLOOR priority, not a kitchen one), and the shell prints `!! URGENTE !!`
        // for `rush` and only for `rush` (hub#1509). Squashing one word into the other puts a red
        // banner on a round nobody rushed, and `sales` owning no vocabulary is the whole contract.
        let mut inp = fire_input_with_lines(1, json!([{ "id": "l1", "product_name": "Entrecot", "quantity": 1_000_000 }]));
        inp["payload"]["priority"] = json!("vip");
        let out = fire_order_pure(inp).accepted("disparar la ronda de un cliente VIP");

        assert_eq!(
            out.events[0].payload["priority"],
            json!("vip"),
            "la palabra viaja tal cual, `sales` no tiene vocabulario: {:?}",
            out.events[0].payload
        );
    }

    #[test]
    fn un_disparo_normal_no_ensucia_el_evento_con_una_clave_vacia() {
        // El 99 % de las comandas son normales: sin urgencia el campo NO viaja. `order.fired` lo
        // leen más módulos (kitchen, flujos, el asistente) y una clave vacía es ruido que hay que
        // interpretar; `kitchen` ya asume `normal` cuando no viene.
        let out = fire_order_pure(fire_input_with_lines(1, json!([{ "id": "l1", "product_name": "Entrecot", "quantity": 1_000_000 }])))
            .accepted("disparar la ronda normal");
        assert_eq!(out.events.len(), 1);
        assert!(
            out.events[0].payload.get("priority").is_none(),
            "sin urgencia no hay clave: {:?}",
            out.events[0].payload
        );
    }

    // ── sales#26 · anular es AUDITABLE, IDEMPOTENTE y respeta la factura ─────────────────────
    //
    // Mercado (8 refs en la issue): nadie borra una venta pagada — el original queda inmutable y
    // se añade el reverso; el motivo es obligatorio (Toast, Lightspeed, Holded/VeriFactu); el
    // permiso es propio; con factura emitida solo cabe la rectificativa; y el reverso es de un
    // solo disparo (Square/Toast: los foros están llenos de reembolsos dobles). Aquí: el handler
    // lee la venta (`sales.get`, required), rechaza con código propio lo que no aplica, y solo
    // emite `sale.voided` cuando de verdad cambia algo.

    fn void_input(reason: &str, sale: Value) -> Value {
        let mut reads = Map::new();
        if !sale.is_null() { reads.insert("sales.get".into(), sale); }
        json!({
            "payload": { "sale_id": "sale-1", "reason": reason },
            "context": { "hub_id": "h1", "current_user_id": "u-manager", "now": "2026-08-18T12:00:00+00:00", "new_ids": [],
                         "reads": reads }
        })
    }
    fn completed_ticket() -> Value {
        json!([{ "id": "sale-1", "sale_number": "20260818-0007", "status": "completed", "document_type": "ticket",
                 "total": 1210, "payment_method_name": "Cash", "order_id": "ord-9" }])
    }

    #[test]
    fn voiding_a_completed_ticket_writes_the_audit_fields_and_emits_once() {
        let out = void_sale_pure(void_input("customer changed their mind", completed_ticket())).accepted("void ok");
        let op = out.operations.iter().find(|o| o.command == "sales._void_sale").expect("the void op");
        assert_eq!(op.params["sale_id"], json!("sale-1"));
        assert_eq!(op.params["void_reason"], json!("customer changed their mind"));
        assert_eq!(out.events.len(), 1);
        let ev = &out.events[0];
        assert_eq!(ev.name, "sale.voided");
        assert_eq!(ev.payload["sale_id"], json!("sale-1"));
        assert_eq!(ev.payload["reason"], json!("customer changed their mind"));
        assert_eq!(ev.payload["voided_by"], json!("u-manager"));
        assert_eq!(ev.payload["total"], json!(1210));
        assert_eq!(ev.payload["order_id"], json!("ord-9"));
    }

    #[test]
    fn voiding_twice_is_refused_and_emits_nothing_the_second_time() {
        let mut already = completed_ticket();
        already[0]["status"] = json!("voided");
        let err = void_sale_pure(void_input("again", already)).refused("second void");
        assert_eq!(err.code, "sales.already_voided", "{err:?}");
    }

    #[test]
    fn a_reason_is_mandatory() {
        let err = void_sale_pure(void_input("   ", completed_ticket())).refused("no reason");
        assert_eq!(err.code, "sales.void_reason_required", "{err:?}");
    }

    #[test]
    fn a_sale_that_does_not_exist_here_cannot_be_voided() {
        let err = void_sale_pure(void_input("x", json!([]))).refused("unknown sale");
        assert_eq!(err.code, "sales.sale_not_found", "{err:?}");
    }

    #[test]
    fn a_full_invoice_needs_a_credit_note_not_a_void() {
        let mut inv = completed_ticket();
        inv[0]["document_type"] = json!("invoice");
        let err = void_sale_pure(void_input("x", inv)).refused("invoice");
        assert_eq!(err.code, "sales.void_requires_credit_note", "{err:?}");
    }

    #[test]
    fn without_the_sale_read_the_void_is_refused_not_guessed() {
        // La read es `required`; si aun así falta (runtime viejo) no se anula a ciegas.
        let err = void_sale_pure(void_input("x", Value::Null)).refused("no read");
        assert_eq!(err.code, "sales.sale_not_found", "{err:?}");
    }

    // ── sales#247 · once money has MOVED, the void door is closed ────────────────────────────
    //
    // A PARTIAL refund leaves the sale `completed` on purpose (`_mark_refunded` only fires on the
    // last cent, `una_devolucion_PARCIAL_no_marca_la_venta_como_devuelta`), so every guard above
    // let it through: status is `completed`, the document is a ticket and the reason is there.
    // The result was an operation no POS in the market offers — an «annulment» of a payment that
    // has already been partly given back (12 verified references in the issue: Stripe refuses to
    // cancel a captured intent, Square «you can't delete a completed transaction», Lightspeed
    // «you must refund the sale instead of voiding it», Dynamics 365 BC blocks the Cancel button).
    //
    // Void and refund are not two roads to the same place: they are two doors separated by the
    // STATE, and a refund document is the proof that the charge was captured. So the refunds of
    // the sale are now a `required` read of the command and the handler refuses on sight.
    //
    // 🔴 The check lives HERE, in the handler that applies with its `hub_id`, and not in the
    // button: the till is not the only door (assistant, API, a stale row in the list).

    /// `void_input`, plus the `sales.refunds` read the command now pre-loads.
    fn void_input_with_refunds(reason: &str, sale: Value, refunds: Value) -> Value {
        let mut input = void_input(reason, sale);
        input["context"]["reads"]["sales.refunds"] = refunds;
        input
    }

    #[test]
    fn a_sale_with_a_partial_refund_can_no_longer_be_voided() {
        let refunds = json!([
            { "id": "ref-1", "sale_id": "sale-1", "total": 300, "reason": "one coffee came back" }
        ]);
        let err = void_sale_pure(void_input_with_refunds("mistake", completed_ticket(), refunds))
            .refused("void over a partially refunded sale");
        assert_eq!(err.code, "sales.sale_already_refunded", "{err:?}");
    }

    #[test]
    fn several_refunds_close_the_door_just_the_same() {
        let refunds = json!([
            { "id": "ref-2", "sale_id": "sale-1", "total": 200 },
            { "id": "ref-1", "sale_id": "sale-1", "total": 300 }
        ]);
        let err = void_sale_pure(void_input_with_refunds("mistake", completed_ticket(), refunds))
            .refused("two refunds");
        assert_eq!(err.code, "sales.sale_already_refunded", "{err:?}");
    }

    #[test]
    fn an_empty_refunds_read_is_not_a_refund_and_the_sale_is_still_voided() {
        // The control that proves the guard closes the RIGHT door: a sale nobody refunded reads
        // back zero rows (the runtime resolves the query and inserts `[]`, hub#701 only aborts on
        // a query that FAILS), and that must stay a perfectly ordinary void.
        let out = void_sale_pure(void_input_with_refunds("customer changed their mind", completed_ticket(), json!([])))
            .accepted("clean void");
        assert!(out.operations.iter().any(|o| o.command == "sales._void_sale"), "the void still writes");
        assert_eq!(out.events.len(), 1);
        assert_eq!(out.events[0].name, "sale.voided");
    }

    // That the refusal reaches `_void_sale` with nothing and emits no `sale.voided` — the event
    // cash_register and inventory key on to reverse the drawer and the stock — is asserted by
    // `Answered::refused` itself, which is why it is not repeated here.

    // ── sales#80 · el doble toque en «Enviar a cocina» no puede crear dos comandas ────────────
    //
    // `_mark_lines_fired` filtra `fired_at IS NULL`, así que el SEGUNDO disparo de la misma tanda
    // marcaba 0 filas… y emitía `order.fired` igual: kitchen numeraba una ronda 2 con la misma
    // comida. El handler no ve las filas afectadas (el SQL corre después), así que lee el estado
    // del pedido ANTES: `sales.order.lines` (filtrada por `order_id`, pre-cargada por el runtime).
    // Si con `round_no` no queda ninguna línea pendiente, no hay tanda que enviar → se rechaza y
    // NO se emite. Sin la read (runtime viejo) se comporta como siempre.

    fn fire_input_with_lines(round_no: i64, lines: Value) -> Value {
        json!({
            "payload": {
                "order_id": "ord-1", "label": "Mesa 4", "channel": "dine_in", "round_no": round_no,
                "items": [{ "product_name": "Entrecot", "quantity": 1_000_000 }]
            },
            "context": { "hub_id": "h1", "current_user_id": "u1", "now": "2026-07-19T14:25:00+00:00", "new_ids": [],
                         "reads": { "sales.order.lines": lines } }
        })
    }

    #[test]
    fn a_second_fire_of_the_same_round_with_nothing_pending_is_refused_and_emits_nothing() {
        // Todas las líneas del pedido ya llevan `fired_at`: el primer toque ya se las llevó.
        let lines = json!([
            { "id": "l-1", "order_id": "ord-1", "product_name": "Entrecot", "round_no": 1, "fired_at": "2026-07-19T14:24:59+00:00" }
        ]);
        let err = fire_order_pure(fire_input_with_lines(1, lines)).refused("nada pendiente → no se dispara");
        assert_eq!(err.code, "sales.nothing_to_fire", "{err:?}");
    }

    #[test]
    fn a_fire_with_pending_lines_goes_through_and_marks_them() {
        let lines = json!([
            { "id": "l-1", "order_id": "ord-1", "product_name": "Entrecot", "round_no": 1, "fired_at": "2026-07-19T14:20:00+00:00" },
            { "id": "l-2", "order_id": "ord-1", "product_name": "Postre", "round_no": null, "fired_at": null }
        ]);
        let out = fire_order_pure(fire_input_with_lines(2, lines)).accepted("hay una línea nueva → se dispara");
        assert!(out.operations.iter().any(|o| o.command == "sales._mark_lines_fired"));
        assert_eq!(out.events.len(), 1);
    }

    #[test]
    fn without_the_lines_read_the_fire_behaves_as_before() {
        // Runtime que no entrega la read: no se puede saber → compat, se dispara.
        let inp = json!({
            "payload": { "order_id": "ord-1", "round_no": 1, "items": [{ "product_name": "Entrecot", "quantity": 1_000_000 }] },
            "context": { "hub_id": "h1", "current_user_id": "u1", "now": "2026-07-19T14:25:00+00:00", "new_ids": [] }
        });
        let out = fire_order_pure(inp).accepted("compat");
        assert_eq!(out.events.len(), 1);
    }

    #[test]
    fn disparar_sin_ronda_sigue_sin_escribir_nada() {
        // Compat: un fire sin round_no (POS viejo, integraciones) se comporta como siempre —
        // solo emite el evento, no muta el pedido.
        let inp = json!({
            "payload": { "order_id": "ord-1", "label": "", "items": [{ "product_name": "Café", "quantity": 1_000_000 }] },
            "context": { "hub_id": "h1", "current_user_id": "u1", "now": "2026-07-19T10:00:00+00:00", "new_ids": [] }
        });
        let out = fire_order_pure(inp).accepted("disparo compat");
        assert!(out.operations.is_empty(), "sin ronda no se marca nada: {:?}", out.operations);
    }

    #[test]
    fn disparar_un_pedido_manda_a_cocina_la_etiqueta_opaca_y_el_canal() {
        // ADR-0141: la comanda nace del PEDIDO, no del cobro. `sales` no sabe qué es una mesa, así
        // que la referencia que verá el cocinero es una ETIQUETA OPACA que le pasa quien dispara
        // ("Mesa 4", "Barra", "Recogida Ana") y que `sales` reenvía sin interpretar.
        let inp = json!({
            "payload": {
                "order_id": "ord-1", "label": "Mesa 4", "channel": "dine_in",
                "items": [
                    { "product_name": "Croquetas", "quantity": 2_000_000, "notes": "sin gluten" },
                    { "product_name": "Servicio", "quantity": 1_000_000, "is_service": true }
                ]
            },
            "context": { "hub_id": "h1", "current_user_id": "u1", "now": "2026-07-18T10:00:00+00:00", "new_ids": [] }
        });
        let out = fire_order_pure(inp).accepted("disparar el pedido");

        // El disparo NO escribe en `sales`: el pedido no cambia de estado por mandar comida.
        assert!(out.operations.is_empty(), "disparar no muta el pedido: {:?}", out.operations);

        assert_eq!(out.events.len(), 1);
        let ev = &out.events[0];
        assert_eq!(ev.name, "order.fired");
        assert_eq!(ev.payload["order_id"], json!("ord-1"));
        assert_eq!(ev.payload["label"], json!("Mesa 4"));
        assert_eq!(ev.payload["channel"], json!("dine_in"));
        assert_eq!(ev.payload["items"].as_array().unwrap().len(), 2, "las líneas viajan tal cual");
        assert_eq!(ev.payload["items"][0]["notes"], json!("sin gluten"), "la nota es para el cocinero");
    }

    #[test]
    fn the_kitchen_ticket_travels_with_the_waiter_who_fired_it() {
        // sales#179 — the kitchen ticket did not say who fired it (`kitchen.orders.list` came back
        // with `waiter_id: null`), so at the pass nobody knew who to call when the plate was ready.
        // The default waiter is the user with a session on that terminal, resolved by the SERVER
        // (`context.current_user_id`), and it travels in `order.fired` so `kitchen` can copy it
        // onto its ticket. Same contract as `sale.completed`.
        let inp = json!({
            "payload": {
                "order_id": "ord-1", "label": "Mesa 4", "channel": "dine_in",
                "items": [{ "product_name": "Croquetas", "quantity": 2_000_000 }]
            },
            "context": { "hub_id": "h1", "current_user_id": "u-waiter", "now": "2026-07-18T10:00:00+00:00", "new_ids": [] }
        });
        let out = fire_order_pure(inp).accepted("disparar el pedido");
        assert_eq!(out.events[0].payload["waiter_id"], json!("u-waiter"));
    }

    #[test]
    fn the_tables_waiter_wins_over_the_one_at_the_terminal() {
        // sales#179 — with a transferred check, whoever is serving the table is NOT whoever stands
        // at the terminal. `tables` owns the session and its waiter: when the caller sends it, that
        // is the one that reaches the kitchen. `sales` does not interpret it, same as `label`.
        let inp = json!({
            "payload": {
                "order_id": "ord-1", "label": "Mesa 4", "channel": "dine_in", "waiter_id": "u-luis",
                "items": [{ "product_name": "Croquetas", "quantity": 2_000_000 }]
            },
            "context": { "hub_id": "h1", "current_user_id": "u-waiter", "now": "2026-07-18T10:00:00+00:00", "new_ids": [] }
        });
        let out = fire_order_pure(inp).accepted("disparar el pedido");
        assert_eq!(out.events[0].payload["waiter_id"], json!("u-luis"));
    }

    #[test]
    fn disparar_sin_pedido_es_un_error_no_una_comanda_huerfana() {
        let inp = json!({
            "payload": { "label": "Mesa 4", "channel": "dine_in", "items": [] },
            "context": { "hub_id": "h1", "current_user_id": "u1", "now": "2026-07-18T10:00:00+00:00", "new_ids": [] }
        });
        assert!(fire_order_pure(inp).was_refused(), "sin order_id no hay comanda que colgar de nada");
    }

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
            { "product_name": "Café", "price": 121, "quantity": 2_000_000, "tax_rate": 21.0 },
            { "product_name": "Agua", "price": 110, "quantity": 1_000_000, "tax_rate": 10.0 }
        ]);
        let out = orden(input(items, 3, 0));

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
        let items = json!([{ "product_name": "Menú", "price": 500, "quantity": 1_000_000, "tax_rate": 21.0 }]);

        // cobro FINAL de un pedido → aparece el intent de completar, con su order_id.
        let mut inp = input(items.clone(), 3, 500);
        inp["payload"]["order_id"] = json!("ord-1");
        let out = sale(inp);
        assert!(out.operations.iter().any(|o| o.command == "sales._complete_order"
                && o.params["order_id"] == json!("ord-1")),
            "el cobro final marca el pedido completado");

        // SPLIT parcial (keep_order_open) → NO se completa el pedido (queda abierto para más cobros).
        let mut inp2 = input(items, 3, 500);
        inp2["payload"]["order_id"] = json!("ord-1");
        inp2["payload"]["keep_order_open"] = json!(true);
        let out2 = sale(inp2);
        assert!(!out2.operations.iter().any(|o| o.command == "sales._complete_order"),
            "un split parcial deja el pedido abierto");

        // venta sin pedido (TPV suelto) → no toca ningún pedido.
        let out3 = sale(input(
            json!([{ "product_name": "X", "price": 100, "quantity": 1_000_000, "tax_rate": 21.0 }]), 3, 100));
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
            "product_name": "Chicle", "price": 5, "quantity": 1_000_000, "tax_rate": 21.0
        })).collect::<Vec<_>>());
        let out = sale(input(items, 9, 100));
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
        let mut inp = input(json!([{ "product_name": "Menú", "price": 500, "quantity": 1_000_000, "tax_rate": 21.0 }]), 3, 450);
        inp["payload"]["discount_percent"] = json!(10.0);
        let out = sale(inp);
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
        let items = json!([{ "product_name": "Menú", "price": 500, "quantity": 1_000_000, "tax_rate": 21.0 }]);
        let out = sale(input(items, 3, 500));
        let h = &out.operations[1].params;
        let bd: Value = serde_json::from_str(h["tax_breakdown"].as_str().unwrap()).unwrap();
        assert_eq!(bd["21.00"]["base"], json!(413));
        assert_eq!(bd["21.00"]["tax"], json!(87));
        assert_eq!(h["subtotal"], json!(413));
        assert_eq!(h["total"], json!(500));
    }

    // ── sales#292 · WITH VAT INSIDE THE PRICE, THE DECLARED QUOTA IS THE ONE CHARGED ──────────
    //
    // ADR-0123 §4 decides it in one line: with tax-inclusive prices `base = round(total / (1 +
    // rate))` and **`quota = total − base`, by difference**, «so that what is charged does not
    // move a single cent because of the rounding». The close ignored `tax_included` and always
    // recomputed `quota = base × rate`, so a 5,00 € loaf at 10 % was charged 5,00 € and declared
    // 4,55 + 0,46 = 5,01: two different VAT figures inside the SAME sale, and the declared one did
    // not add up to what the till took. It travelled to the row, to the receipt and to the invoice.
    //
    // The rounding stays ONE per tax rate over the AGGREGATE (ADR-0123 §4, TEAC RG 2233/2022): it
    // just runs over the gross of that rate instead of over the sum of already-rounded line bases.

    /// The header figures the AEAT cross-checks: `(subtotal, tax_amount, total, tax_breakdown)`.
    fn declared(out: &Output) -> (i64, i64, i64, Value) {
        let h = &out.operations.iter().find(|o| o.command == "sales._insert_sale")
            .expect("the sale header").params;
        let bd: Value = serde_json::from_str(h["tax_breakdown"].as_str().unwrap_or("{}"))
            .expect("the breakdown is JSON");
        (
            h["subtotal"].as_i64().expect("subtotal"),
            h["tax_amount"].as_i64().expect("tax_amount"),
            h["total"].as_i64().expect("total"),
            bd,
        )
    }

    #[test]
    fn con_iva_incluido_la_cuota_declarada_es_la_que_se_cobro() {
        // The three amounts measured in sales#292 — plus 5,00 € at 21 %, which already added up
        // and must not move.
        for (price, rate, base, quota) in [
            (500_i64, 10.0_f64, 455_i64, 45_i64),
            (700, 21.0, 579, 121),
            (1000, 21.0, 826, 174),
            (500, 21.0, 413, 87),
        ] {
            let items = json!([{ "product_name": "Pan", "price": price, "quantity": 1_000_000, "tax_rate": rate }]);
            let out = sale(input(items, 3, price));
            let (subtotal, tax_total, total, bd) = declared(&out);
            let key = format!("{rate:.2}");
            let entry = &bd[key.as_str()];
            assert_eq!(total, price, "{price} @ {rate}: what the customer paid does not move");
            assert_eq!(entry["base"].as_i64(), Some(base), "{price} @ {rate}: declared base");
            assert_eq!(entry["tax"].as_i64(), Some(quota), "{price} @ {rate}: quota by difference");
            assert_eq!(
                entry["base"].as_i64().unwrap() + entry["tax"].as_i64().unwrap(), total,
                "{price} @ {rate}: the entry of the rate adds up to the gross of that rate",
            );
            assert_eq!(subtotal + tax_total, total, "{price} @ {rate}: declared vs charged");
            // …and the line of the receipt says exactly the same as the header.
            let line = &sale_lines(&out)[0];
            assert_eq!(line["net_amount"].as_i64(), Some(base), "{price} @ {rate}: line base");
            assert_eq!(line["tax_amount"].as_i64(), Some(quota), "{price} @ {rate}: line quota");
        }
    }

    #[test]
    fn con_iva_incluido_ningun_importe_declara_de_mas_ni_de_menos() {
        // sales#292 swept 24 combinations on a real hub and THREE of them did not add up. This is
        // the sweep that keeps them from coming back: for every amount and rate the till can
        // charge, what is declared adds up to the cent to what was charged — and the line of the
        // receipt says the same as the header, because a single-line sale has nowhere to hide a
        // rounding difference.
        // 121,00 € is where the quota at 21 % reaches Σ rates (21,00 €) and 1.000,00 € leaves it
        // far behind: the split of the quota must not be capped by the weights it is shared with.
        for price in [1_i64, 5, 7, 33, 100, 105, 120, 199, 300, 500, 700, 999, 1000, 1234, 1999, 2500, 3330, 9999, 12100, 100_000] {
            for rate in [0.0_f64, 4.0, 5.0, 10.0, 21.0] {
                let items = json!([{ "product_name": "P", "price": price, "quantity": 1_000_000, "tax_rate": rate }]);
                let out = sale(input(items, 3, price));
                let (subtotal, tax_total, total, bd) = declared(&out);
                let entry = &bd[rate_key(rate).as_str()];
                let (base, quota) = (entry["base"].as_i64().expect("base"), entry["tax"].as_i64().expect("quota"));
                assert_eq!(total, price, "{price} @ {rate}: what was charged");
                assert_eq!(base + quota, price, "{price} @ {rate}: declared {base}+{quota} vs charged {price}");
                assert_eq!((subtotal, tax_total), (base, quota), "{price} @ {rate}: the header declares the breakdown");
                let line = &sale_lines(&out)[0];
                assert_eq!(
                    (line["net_amount"].as_i64(), line["tax_amount"].as_i64()), (Some(base), Some(quota)),
                    "{price} @ {rate}: the line and the header carry the SAME VAT",
                );
            }
        }
    }

    #[test]
    fn el_ejemplo_de_la_adr_sigue_declarando_29_de_base_y_6_de_cuota() {
        // ADR-0123 §4, literally: 7 chewing gums of 0,05 € at 21 % declare base 0,29 / quota 0,06.
        // Summing the per-line bases gives 7 × round(5/1,21) = 7 × 4 = 28 — the product-by-product
        // rounding the TEAC censures (RG 2233/2022), and 28 + 7 is the 0,35 € charged only because
        // the quota is then taken by difference on an already distorted base.
        let items: Vec<Value> = (0..7)
            .map(|i| json!({ "product_name": format!("Chicle {i}"), "price": 5, "quantity": 1_000_000, "tax_rate": 21.0 }))
            .collect();
        let out = sale(input(json!(items), 12, 35));
        let (subtotal, tax_total, total, bd) = declared(&out);
        assert_eq!(total, 35, "seven gums at five cents");
        assert_eq!(bd["21.00"]["base"].as_i64(), Some(29), "one rounding per rate, over the aggregate");
        assert_eq!(bd["21.00"]["tax"].as_i64(), Some(6));
        assert_eq!((subtotal, tax_total), (29, 6), "the header declares the breakdown");
    }

    #[test]
    fn cada_tipo_impositivo_se_cierra_sobre_su_propio_bruto() {
        // A 5,00 € loaf at 10 % and a 10,00 € menu at 21 % on the same ticket: each rate closes
        // over ITS gross, and the two entries add up to the 15,00 € that was charged.
        let items = json!([
            { "product_name": "Pan",  "price": 500,  "quantity": 1_000_000, "tax_rate": 10.0 },
            { "product_name": "Menú", "price": 1000, "quantity": 1_000_000, "tax_rate": 21.0 }
        ]);
        let out = sale(input(items, 5, 1500));
        let (subtotal, tax_total, total, bd) = declared(&out);
        assert_eq!(total, 1500);
        assert_eq!((bd["10.00"]["base"].as_i64(), bd["10.00"]["tax"].as_i64()), (Some(455), Some(45)));
        assert_eq!((bd["21.00"]["base"].as_i64(), bd["21.00"]["tax"].as_i64()), (Some(826), Some(174)));
        assert_eq!(subtotal + tax_total, total, "declared {subtotal}+{tax_total} vs charged {total}");
    }

    #[test]
    fn una_linea_invitada_no_abre_entrada_en_el_desglose() {
        // A comped line charges nothing, so it declares nothing: it opens no `DetalleDesglose` of
        // its own for a rate that nobody paid — an entry with base 0 is not «zero VAT», it is an
        // operation that never happened.
        let items = json!([
            { "product_name": "Café", "price": 500, "quantity": 1_000_000, "tax_rate": 10.0 },
            { "product_name": "Copa invitada", "price": 700, "quantity": 1_000_000, "tax_rate": 21.0, "is_gift": true, "cost": 200 }
        ]);
        let out = sale(input(items, 5, 500));
        let (subtotal, tax_total, total, bd) = declared(&out);
        assert_eq!(total, 500, "the comped line is not charged");
        assert_eq!(bd.as_object().map(|o| o.len()), Some(1), "only the rate that was charged is declared: {bd}");
        assert_eq!(bd["10.00"]["base"], json!(455));
        assert_eq!((subtotal, tax_total), (455, 45));
    }

    #[test]
    fn dos_perfiles_que_declaran_en_el_mismo_tipo_suman_sus_bases() {
        // A shop under the equivalence surcharge sells one article that carries it (21 % + 5,2 %)
        // and one that does not (21 %). Both declare into the "21.00" entry and they do NOT share a
        // divisor: 12,62 € of the first is 10,00 € of base, 5,00 € of the second is 4,13 €. The
        // entry has to carry BOTH bases — what the AEAT cross-checks is the base of the RATE.
        let items = json!([
            { "product_name": "Con RE", "price": 1262, "quantity": 1_000_000, "tax_category_key": "product.generic" },
            { "product_name": "Sin RE", "price": 500,  "quantity": 1_000_000, "tax_category_key": "product.no_re" }
        ]);
        let rules = json!([
            { "id": "r-iva", "country_code": "ES", "region_code": null, "tax_category_key": "product.generic", "rate_pct": 21.0, "tax_type": "vat", "parent_id": null, "is_active": 1 },
            { "id": "c-re",  "country_code": "ES", "region_code": null, "tax_category_key": "product.generic", "rate_pct": 5.2, "tax_type": "surcharge", "parent_id": "r-iva", "is_active": 1 },
            { "id": "r-21",  "country_code": "ES", "region_code": null, "tax_category_key": "product.no_re", "rate_pct": 21.0, "tax_type": "vat", "parent_id": null, "is_active": 1 }
        ]);
        let mut inp = input_with_rules(items, 5, rules, "array", "ES", "");
        inp["payload"]["tax_included"] = json!(true);
        let out = sale(inp);
        let (subtotal, tax_total, total, bd) = declared(&out);
        assert_eq!(total, 1762, "12,62 € + 5,00 €");
        assert_eq!(bd["21.00"]["base"], json!(1413), "10,00 € of the line with RE + 4,13 € of the one without");
        assert_eq!(bd["21.00"]["tax"], json!(297), "2,10 € + 0,87 €");
        assert_eq!(bd["5.20"]["base"], json!(1000), "the surcharge only rides on the line that carries it");
        assert_eq!(bd["5.20"]["tax"], json!(52));
        assert_eq!((subtotal, tax_total), (1413, 349), "base 10,00 + 4,13; quota 2,62 + 0,87");
        assert_eq!(subtotal + tax_total, total, "declared {subtotal}+{tax_total} vs charged {total}");
    }

    #[test]
    fn sin_iva_incluido_la_cuota_sigue_saliendo_de_la_base() {
        // With tax-EXCLUDED prices the total is DERIVED (`line = net + tax`), so there is nothing
        // to close by difference: ADR-0123 §4 keeps `quota_rate = round(base_rate × rate)` there.
        let items = json!([{ "product_name": "Menú", "price": 500, "quantity": 1_000_000, "tax_rate": 21.0 }]);
        let mut inp = input(items, 3, 605);
        inp["payload"]["tax_included"] = json!(false);
        let out = sale(inp);
        let (subtotal, tax_total, total, bd) = declared(&out);
        assert_eq!((subtotal, tax_total, total), (500, 105, 605));
        assert_eq!((bd["21.00"]["base"].as_i64(), bd["21.00"]["tax"].as_i64()), (Some(500), Some(105)));
    }

    #[test]
    fn sin_iva_incluido_la_base_declarada_es_la_SUMA_de_las_de_linea_nadie_vuelve_a_dividir() {
        // The guard above cannot tell the two closes apart: 6,05 € / 1,21 is exactly 5,00 €, so
        // dividing the gross and summing the line bases agree to the cent. This one CAN, and it is
        // the one that pins the B2B branch: with the tax ON TOP the declared base is the SUM OF
        // THE LINE BASES, and nobody divides the gross again to get it back.
        //
        // 🔴 The amount is chosen so that the two formulas DIVERGE, which is the only thing that
        // makes a guard a guard: 0,50 € of base taxed at 21 % + 5,2 % of equivalence surcharge is
        // charged 0,50 + 0,11 + 0,03 = 0,64 €, and round(64 / 1,262) = 0,51 € — routing this mode
        // through the tax-inclusive close moves the declared base by a cent. (An amount that
        // divides exactly, like the 5,00 € above, would keep this test green through that mutant.)
        let items = json!([
            { "product_name": "Café", "price": 50, "quantity": 1_000_000, "tax_category_key": "product.generic" }
        ]);
        let rules = json!([
            { "id": "r-iva", "country_code": "ES", "region_code": null, "tax_category_key": "product.generic", "rate_pct": 21.0, "tax_type": "vat", "parent_id": null, "is_active": 1 },
            { "id": "c-re",  "country_code": "ES", "region_code": null, "tax_category_key": "product.generic", "rate_pct": 5.2, "tax_type": "surcharge", "parent_id": "r-iva", "is_active": 1 }
        ]);
        let out = sale(input_with_rules(items, 5, rules, "array", "ES", ""));
        let (subtotal, tax_total, total, bd) = declared(&out);
        let line_bases: i64 = sale_lines(&out).iter().map(|l| l["net_amount"].as_i64().unwrap_or(0)).sum();
        assert_eq!(line_bases, 50, "las bases de línea");
        assert_eq!(subtotal, line_bases, "con el IVA por encima la base declarada es la SUMA de las de línea, no round(bruto / 1,262)");
        assert_eq!((bd["21.00"]["base"].as_i64(), bd["21.00"]["tax"].as_i64()), (Some(50), Some(11)), "round(0,50 € × 21 %) = 0,11 €");
        assert_eq!((bd["5.20"]["base"].as_i64(), bd["5.20"]["tax"].as_i64()), (Some(50), Some(3)), "round(0,50 € × 5,2 %) = 0,03 €");
        assert_eq!((subtotal, tax_total, total), (50, 14, 64), "el total se compone de lo declarado");
    }

    // ── sales#293 · CON EL IVA POR ENCIMA, EL TOTAL SE DERIVA DE LO DECLARADO ─────────────────
    //
    // ADR-0123 §4 escribe la cadena entera de este modo y no deja hueco: `importe_línea = round(…)`
    // → `base_tipo = Σ líneas del tipo` (suma EXACTA) → `cuota_tipo = round(base_tipo × tipo)`
    // ← único redondeo → **`total = Σ (base_tipo + cuota_tipo)`**, que «cuadra por construcción».
    //
    // El cierre hacía los tres primeros pasos y luego componía el total sumando `net + round(net ×
    // tipo)` de CADA línea — el redondeo producto a producto que el TEAC censura (RG 2233/2022) —,
    // así que las dos cuentas no tenían por qué coincidir: dos artículos de 0,03 € al 21 % se
    // cobraban 0,08 € y en el libro quedaba una venta de 0,07 €.
    //
    // Manda lo declarado, como dice la ADR, y el cobro se deriva de ello. Para que el tique siga
    // sumando su total, la cuota de cada línea sale de REPARTIR la cuota ya declarada por resto
    // mayor (ADR-0210, el mismo reparto del descuento de importe fijo): así nadie tiene que elegir
    // entre cuadrar con la AEAT y cuadrar con el cajón.

    /// HALF_UP `round(base × tipo %)` en enteros — una SEGUNDA implementación, a propósito: una
    /// guarda del redondeo que llama a `money::round` no prueba el redondeo, lo repite.
    fn cuota_esperada(base: i64, rate_pct: f64) -> i64 {
        let milli = (rate_pct * 1_000.0).round() as i64; // 21,0 % → 21000
        (base * milli + 50_000) / 100_000
    }

    /// La cabecera + lo que se persiste de cada línea, que es donde el descuadre se veía.
    fn header_of(out: &Output) -> Map<String, Value> {
        out.operations.iter().find(|o| o.command == "sales._insert_sale").expect("la cabecera").params.clone()
    }

    #[test]
    fn sin_iva_incluido_lo_declarado_es_exactamente_lo_que_se_cobra() {
        // El caso de sales#293, con sus números: dos artículos de 0,03 € al 21 %. La base declarada
        // sigue siendo la SUMA de las de línea (0,06 €) con UN redondeo encima —round(6 × 21 %) =
        // 0,01 €— y ahora el total es 0,07 €, que es lo que se cobra. Antes se cobraban 0,08 €.
        let items = json!([
            { "product_name": "A", "price": 3, "quantity": 1_000_000, "tax_rate": 21.0 },
            { "product_name": "B", "price": 3, "quantity": 1_000_000, "tax_rate": 21.0 }
        ]);
        let mut inp = input(items, 5, 100);
        inp["payload"]["tax_included"] = json!(false);
        let out = sale(inp);
        let (subtotal, tax_total, total, bd) = declared(&out);
        assert_eq!((bd["21.00"]["base"].as_i64(), bd["21.00"]["tax"].as_i64()), (Some(6), Some(1)), "un solo redondeo sobre la base agregada: round(6 × 21 %) = 1");
        assert_eq!((subtotal, tax_total), (6, 1), "la cabecera declara el desglose");
        assert_eq!(subtotal + tax_total, total, "lo declarado {subtotal}+{tax_total} contra lo cobrado {total}");
        assert_eq!(total, 7, "el total se DERIVA de la declaración (ADR-0123 §4), no de sumar las cuotas de línea");

        // …y el tique sigue cuadrando: las líneas suman el total y sus bases suman la base.
        let lines = sale_lines(&out);
        let (bases, taxes, totales) = (
            lines.iter().map(|l| l["net_amount"].as_i64().unwrap_or(0)).sum::<i64>(),
            lines.iter().map(|l| l["tax_amount"].as_i64().unwrap_or(0)).sum::<i64>(),
            lines.iter().map(|l| l["line_total"].as_i64().unwrap_or(0)).sum::<i64>(),
        );
        assert_eq!((bases, taxes, totales), (6, 1, 7), "el tique suma lo mismo que la cabecera");
        for l in lines.iter() {
            assert_eq!(
                l["line_total"].as_i64(), Some(l["net_amount"].as_i64().unwrap_or(0) + l["tax_amount"].as_i64().unwrap_or(0)),
                "con el IVA por encima la línea SE COMPONE de base + cuota",
            );
        }

        // El descuento informativo no se inventa un céntimo por el camino: aquí no hay descuento.
        assert_eq!(header_of(&out)["discount_amount"].as_i64(), Some(0), "sin descuento, discount_amount es 0");

        // Y el evento que consumen `invoice`/`verifactu`/`cash_register` lleva lo mismo.
        let ev = &out.events[0].payload;
        assert_eq!(
            (ev["subtotal"].as_i64(), ev["tax_amount"].as_i64(), ev["total"].as_i64()), (Some(6), Some(1), Some(7)),
            "sale.completed declara lo mismo que la fila",
        );
    }

    #[test]
    fn sin_iva_incluido_con_descuento_de_importe_fijo_lo_declarado_sigue_cuadrando() {
        // The fixed amount is prorated by largest remainder (ADR-0210) BEFORE the rates are closed,
        // so the close has to hold here too: four 0,55 € articles at 21 % with 0,13 € off.
        let items: Vec<Value> = (0..4)
            .map(|i| json!({ "product_name": format!("P{i}"), "price": 55, "quantity": 1_000_000, "tax_rate": 21.0 }))
            .collect();
        let mut inp = input(json!(items), 9, 100_000);
        inp["payload"]["tax_included"] = json!(false);
        inp["payload"]["discount_amount"] = json!(13);
        let out = sale(inp);
        let (subtotal, tax_total, total, bd) = declared(&out);
        // sales#295 — with net prices the amount comes off the BASE, like every B2B price list:
        // 2,20 € − 0,13 € = 2,07 €, and the VAT rides on top of what is left.
        assert_eq!((bd["21.00"]["base"].as_i64(), bd["21.00"]["tax"].as_i64()), (Some(207), Some(43)), "round(2,07 € × 21 %) = 0,43 €");
        assert_eq!((subtotal, tax_total, total), (207, 43, 250), "what is declared adds up to what is charged, discount included");
        assert_eq!(line_totals(&out).iter().sum::<i64>(), 250, "the receipt adds up to what is charged");
        assert_eq!(header_of(&out)["discount_amount"].as_i64(), Some(13), "sales#295: the discount shown is the one asked for");
    }

    #[test]
    fn sin_iva_incluido_el_importe_fijo_baja_la_base_exactamente_lo_pedido() {
        // sales#295 — the cases of the issue, where the gross → base → gross round trip lost or
        // added up to two cents. With net prices «X € off» means X € off the base: the base drops
        // EXACTLY X, the quota is the single rounding over what is left (ADR-0123 §4) and the
        // header reports X. Expected figures with integer arithmetic, not the handler's.
        for (n, price, rate_bp, disc) in [
            (4_usize, 55_i64, 2100_i64, 13_i64),
            (5, 123, 400, 7),
            (2, 300, 2100, 50),
            (3, 300, 2100, 77),
            (2, 1000, 1000, 33),
            (7, 199, 1000, 1),
        ] {
            let rate = rate_bp as f64 / 100.0;
            let items: Vec<Value> = (0..n)
                .map(|i| json!({ "product_name": format!("P{i}"), "price": price, "quantity": 1_000_000, "tax_rate": rate }))
                .collect();
            let mut inp = input(json!(items), n + 5, 10_000_000);
            inp["payload"]["tax_included"] = json!(false);
            inp["payload"]["discount_amount"] = json!(disc);
            let out = sale(inp);
            let (subtotal, tax_total, total, _) = declared(&out);
            let base = n as i64 * price - disc;
            let quota = (base * rate_bp + 5_000) / 10_000;
            let case = format!("{n} × {price} at {rate} % with {disc} off");
            assert_eq!(subtotal, base, "{case}: the base drops exactly what was asked");
            assert_eq!((tax_total, total), (quota, base + quota), "{case}: the VAT rides on the discounted base");
            assert_eq!(header_of(&out)["discount_amount"].as_i64(), Some(disc), "{case}: the receipt shows the discount asked for");
            assert_eq!(line_totals(&out).iter().sum::<i64>(), total, "{case}: the lines add up to the total");
        }
    }

    #[test]
    fn sin_iva_incluido_un_importe_fijo_mayor_que_la_base_se_rechaza() {
        // sales#295 — the amount comes off the base, so the base is its ceiling: 2,30 € off a
        // 2,20 € base fits under the 2,66 € gross but would leave a negative base.
        let items: Vec<Value> = (0..4)
            .map(|i| json!({ "product_name": format!("P{i}"), "price": 55, "quantity": 1_000_000, "tax_rate": 21.0 }))
            .collect();
        let mut inp = input(json!(items), 9, 100_000);
        inp["payload"]["tax_included"] = json!(false);
        inp["payload"]["discount_amount"] = json!(230);
        let err = complete_sale_pure(inp).refused("a discount above the base");
        assert_eq!(err.code, "sales.discount_out_of_range", "{err:?}");
    }

    #[test]
    fn sin_iva_incluido_ningun_importe_declara_de_mas_ni_de_menos() {
        // El barrido que impide que vuelva: para cada importe, tipo y número de líneas, lo
        // declarado cuadra al céntimo con lo cobrado, el tique suma el total, y la cuota de cada
        // tipo es EXACTAMENTE el único redondeo sobre su base agregada (ADR-0123 §4), calculado
        // aquí con una aritmética distinta de la del handler.
        for n in [1_usize, 2, 3, 7] {
            for price in [1_i64, 3, 5, 7, 33, 50, 99, 100, 333, 500, 1234, 9999] {
                for rate in [0.0_f64, 4.0, 5.0, 10.0, 21.0] {
                    let items: Vec<Value> = (0..n)
                        .map(|i| json!({ "product_name": format!("P{i}"), "price": price, "quantity": 1_000_000, "tax_rate": rate }))
                        .collect();
                    let mut inp = input(json!(items), n + 4, 100_000_000);
                    inp["payload"]["tax_included"] = json!(false);
                    let out = sale(inp);
                    let (subtotal, tax_total, total, bd) = declared(&out);
                    let ctx = format!("{n} × {price} @ {rate}");

                    let base = n as i64 * price;
                    let quota = cuota_esperada(base, rate);
                    let entry = &bd[rate_key(rate).as_str()];
                    assert_eq!(entry["base"].as_i64(), Some(base), "{ctx}: la base declarada es la suma EXACTA de las de línea");
                    assert_eq!(entry["tax"].as_i64(), Some(quota), "{ctx}: un único redondeo sobre la base agregada");
                    assert_eq!((subtotal, tax_total), (base, quota), "{ctx}: la cabecera declara el desglose");
                    assert_eq!(subtotal + tax_total, total, "{ctx}: declarado {subtotal}+{tax_total} contra cobrado {total}");

                    let lines = sale_lines(&out);
                    assert_eq!(lines.len(), n, "{ctx}: una fila por línea");
                    assert_eq!(
                        lines.iter().map(|l| l["net_amount"].as_i64().unwrap_or(0)).sum::<i64>(), subtotal,
                        "{ctx}: las bases de línea suman la base declarada",
                    );
                    assert_eq!(
                        lines.iter().map(|l| l["tax_amount"].as_i64().unwrap_or(0)).sum::<i64>(), tax_total,
                        "{ctx}: las cuotas de línea suman la cuota declarada",
                    );
                    assert_eq!(
                        lines.iter().map(|l| l["line_total"].as_i64().unwrap_or(0)).sum::<i64>(), total,
                        "{ctx}: el tique suma el total que se cobra",
                    );
                    // El reparto es por resto mayor: ninguna línea se lleva más de un céntimo de
                    // más que la parte que le tocaría.
                    for l in lines.iter() {
                        let (b, t) = (l["net_amount"].as_i64().unwrap_or(0), l["tax_amount"].as_i64().unwrap_or(0));
                        let exacta = cuota_esperada(b, rate);
                        assert!((t - exacta).abs() <= 1, "{ctx}: la línea declara {t} donde le tocaba ~{exacta}");
                    }
                }
            }
        }
    }

    #[test]
    fn sin_iva_incluido_el_ejemplo_de_la_adr_declara_la_base_agregada_y_el_total_sale_de_ella() {
        // El gemelo B2B del ejemplo de la ADR: 7 artículos de 0,03 € al 21 % se declaran con base
        // 0,21 € y cuota round(0,21 × 21 %) = round(4,41) = 0,04 €, así que el ticket son 0,25 €.
        // Sumar las cuotas de línea —7 × round(0,63) = 0,07 €— daría 0,28 €: tres céntimos de más
        // cobrados sobre una venta de 0,25 € declarada, que es el redondeo producto a producto.
        let items: Vec<Value> = (0..7)
            .map(|i| json!({ "product_name": format!("Chicle {i}"), "price": 3, "quantity": 1_000_000, "tax_rate": 21.0 }))
            .collect();
        let mut inp = input(json!(items), 12, 100);
        inp["payload"]["tax_included"] = json!(false);
        let out = sale(inp);
        let (subtotal, tax_total, total, bd) = declared(&out);
        assert_eq!((bd["21.00"]["base"].as_i64(), bd["21.00"]["tax"].as_i64()), (Some(21), Some(4)));
        assert_eq!((subtotal, tax_total, total), (21, 4, 25), "el total sale de la declaración, no de las 7 cuotas de línea");
        assert_eq!(line_totals(&out).iter().sum::<i64>(), 25, "el tique suma lo que se cobra");
    }

    #[test]
    fn sin_iva_incluido_cada_tipo_cierra_sobre_su_propia_base_y_el_total_los_suma() {
        // Dos tipos en el mismo tique, cada uno con resto: 3 × 0,03 € al 21 % (base 0,09 €, cuota
        // round(1,89) = 0,02 €) y 3 × 0,07 € al 10 % (base 0,21 €, cuota round(2,10) = 0,02 €).
        // El total es la suma de los dos pares, 0,34 €; sumando cuotas de línea saldrían 0,36 €.
        let mut items: Vec<Value> = (0..3)
            .map(|i| json!({ "product_name": format!("A{i}"), "price": 3, "quantity": 1_000_000, "tax_rate": 21.0 }))
            .collect();
        items.extend((0..3).map(|i| json!({ "product_name": format!("B{i}"), "price": 7, "quantity": 1_000_000, "tax_rate": 10.0 })));
        let mut inp = input(json!(items), 12, 1_000);
        inp["payload"]["tax_included"] = json!(false);
        let out = sale(inp);
        let (subtotal, tax_total, total, bd) = declared(&out);
        assert_eq!((bd["21.00"]["base"].as_i64(), bd["21.00"]["tax"].as_i64()), (Some(9), Some(2)));
        assert_eq!((bd["10.00"]["base"].as_i64(), bd["10.00"]["tax"].as_i64()), (Some(21), Some(2)));
        assert_eq!((subtotal, tax_total, total), (30, 4, 34), "cada tipo cierra sobre lo suyo y el total los suma");
        assert_eq!(line_totals(&out).iter().sum::<i64>(), 34, "el tique suma lo que se cobra");
    }

    #[test]
    fn el_preview_declara_lo_mismo_que_la_venta_con_iva_incluido() {
        // sales#292 was measured on `sales.checkout.preview` first: both doors share
        // `value_checkout`, so the preview has to answer the same 4,55 + 0,45.
        let items = json!([{ "product_name": "Pan", "price": 500, "quantity": 1_000_000, "tax_rate": 10.0 }]);
        let previewed = preview_agrees_with_the_sale(input(items, 3, 500));
        assert_eq!(previewed["subtotal"].as_i64(), Some(455));
        assert_eq!(previewed["tax_total"].as_i64(), Some(45));
        assert_eq!(previewed["tax_breakdown"]["10.00"]["tax"].as_i64(), Some(45));
    }

    #[test]
    fn el_tipo_de_documento_es_atomico_y_viaja_en_el_evento() {
        // ADR-0140: el tipo de documento (ticket|invoice) se fija ATÓMICAMENTE al completar la
        // venta —no con un UPDATE retro (`sales.set_document_type`) que mutaba la fila ya emitida,
        // violando la inmutabilidad fiscal— y VIAJA en `sale.completed` para que
        // `invoice.create_from_sale` decida F1 (completa) vs F2 (simplificada) sin re-consultar la
        // venta (antes hardcodeaba F2 porque el tipo no llegaba en el evento).
        let items = json!([{ "product_name": "Menú", "price": 500, "quantity": 1_000_000, "tax_rate": 21.0 }]);
        let mut inp = input(items, 3, 500);
        inp["payload"]["document_type"] = json!("invoice");
        // sales#317: an invoice travels with its recipient — without one it is refused
        // (`sales.invoice_recipient_incomplete`), which is not what this test is about.
        inp["payload"]["customer_name"] = json!("ACME SL");
        inp["payload"]["customer_tax_id"] = json!("B12345678");
        inp["payload"]["customer_address"] = json!("C/ Mayor 1");
        let out = sale(inp);

        // 1) la cabecera de la venta persiste el tipo en la MISMA inserción (atómico).
        assert_eq!(out.operations[1].params["document_type"], json!("invoice"),
                   "la venta persiste el tipo al insertarse, sin UPDATE posterior");
        // 2) el evento lo lleva → invoice deja de hardcodear F2.
        assert_eq!(out.events[0].payload["document_type"], json!("invoice"),
                   "sale.completed lleva el tipo de documento");
    }

    #[test]
    fn the_receipt_choice_travels_in_the_event() {
        // sales#283 — the «Print receipt» switch of the charge sheet. The shell prints on
        // `sale.completed`, so the cashier's choice only means something if it travels there.
        let items = json!([{ "product_name": "Café", "price": 121, "quantity": 1_000_000, "tax_rate": 21.0 }]);
        for choice in [true, false] {
            let mut inp = input(items.clone(), 3, 121);
            inp["payload"]["print_receipt"] = json!(choice);
            let out = sale(inp);
            assert_eq!(out.events[0].payload["print_receipt"], json!(choice),
                       "sale.completed carries print_receipt={choice}");
        }
    }

    #[test]
    fn without_a_receipt_choice_the_event_says_nothing() {
        // sales#283 — any other producer of sales (API, assistant, cart_checkout) sends no choice:
        // the event must not invent one, or it would override the shop's auto-print setting.
        let items = json!([{ "product_name": "Café", "price": 121, "quantity": 1_000_000, "tax_rate": 21.0 }]);
        let out = sale(input(items.clone(), 3, 121));
        assert_eq!(out.events[0].payload.get("print_receipt"), None,
                   "no choice → no key: {}", out.events[0].payload);
        let mut inp = input(items, 3, 121);
        inp["payload"]["print_receipt"] = json!("yes");
        let out = sale(inp);
        assert_eq!(out.events[0].payload.get("print_receipt"), None,
                   "a non-boolean is no choice: {}", out.events[0].payload);
    }

    #[test]
    fn el_tipo_de_documento_por_defecto_es_ticket() {
        // Sin `document_type` explícito → simplificada (ticket/F2), el caso mayoritario del TPV.
        // Cualquier valor no reconocido cae también a 'ticket' (normalización defensiva fiscal).
        let items = json!([{ "product_name": "Café", "price": 121, "quantity": 1_000_000, "tax_rate": 21.0 }]);
        let out = sale(input(items, 3, 121));
        assert_eq!(out.operations[1].params["document_type"], json!("ticket"));
        assert_eq!(out.events[0].payload["document_type"], json!("ticket"));

        let mut inp = input(json!([{ "product_name": "Té", "price": 100, "quantity": 1_000_000, "tax_rate": 10.0 }]), 3, 100);
        inp["payload"]["document_type"] = json!("garbage");
        let out2 = sale(inp);
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

    /// Helper: un solo componente de IVA, que es el caso del 99 % de las lineas.
    #[cfg(test)]
    fn one_vat(rate_pct: f64) -> Vec<TaxComponent> {
        vec![TaxComponent {
            rate_pct,
            rate_key: rate_key(rate_pct),
            kind: "tax".to_string(),
            label: "IVA".to_string(),
        }]
    }

    /// sales#124 — el camino de PRODUCCION (`calc_line_components`) tiene que cumplir lo mismo
    /// que la referencia (`calc_line`): **base + cuota = importe cobrado**.
    ///
    /// Con precio IVA incluido la cuota NO se puede recalcular desde la base: `2 x 3,30 EUR` al
    /// 21 % da `net = round(660/1,21) = 545` y `round(545 x 0,21) = 114`, que suma 659 y no 660.
    /// La cuota es lo que queda: `line - net`.
    #[test]
    fn components_tax_inclusive_line_always_sums() {
        let comps = one_vat(21.0);
        let (t, parts) = calc_line_components(330, 2 * QUANTITY_SCALE, QUANTITY_SCALE, 0.0, true, &comps);

        assert_eq!(t.line, 660, "el importe cobrado es el del catalogo");
        assert_eq!(
            t.net + t.tax,
            t.line,
            "base {} + cuota {} != cobrado {}",
            t.net, t.tax, t.line
        );
        assert_eq!(t.net, 545);
        assert_eq!(t.tax, 115, "la cuota es line - net, no round(net * pct)");
        assert_eq!(
            parts.iter().map(|(_, _, q)| *q).sum::<i64>(),
            t.tax,
            "las cuotas del desglose suman la cuota de la linea"
        );
    }

    /// El invariante no es de un caso: se cumple para CUALQUIER importe. Barremos 1..2000
    /// centimos a los tipos espanoles con precio IVA incluido, que es como vende un TPV.
    #[test]
    fn components_tax_inclusive_sums_for_every_amount() {
        for rate in [4.0_f64, 10.0, 21.0] {
            let comps = one_vat(rate);
            for cents in 1..=2000_i64 {
                let (t, parts) =
                    calc_line_components(cents, QUANTITY_SCALE, QUANTITY_SCALE, 0.0, true, &comps);
                assert_eq!(
                    t.net + t.tax,
                    t.line,
                    "no suma con {} centimos al {} %: {} + {} != {}",
                    cents, rate, t.net, t.tax, t.line
                );
                assert_eq!(
                    parts.iter().map(|(_, _, q)| *q).sum::<i64>(),
                    t.tax,
                    "el desglose no suma la cuota con {} centimos al {} %",
                    cents, rate
                );
            }
        }
    }

    /// Un grupo multi-impuesto (IVA 21 % + recargo de equivalencia 5,2 %) reparte la cuota entre
    /// sus componentes, y la suma de las partes sigue siendo `line - net`.
    #[test]
    fn components_tax_inclusive_group_splits_the_exact_quota() {
        let comps = vec![
            TaxComponent { rate_pct: 21.0, rate_key: rate_key(21.0), kind: "tax".to_string(), label: "IVA".to_string() },
            TaxComponent { rate_pct: 5.2, rate_key: rate_key(5.2), kind: "surcharge".to_string(), label: "RE".to_string() },
        ];
        for cents in 1..=500_i64 {
            let (t, parts) =
                calc_line_components(cents, QUANTITY_SCALE, QUANTITY_SCALE, 0.0, true, &comps);
            assert_eq!(
                t.net + t.tax,
                t.line,
                "el grupo no suma con {} centimos: {} + {} != {}",
                cents, t.net, t.tax, t.line
            );
            assert_eq!(
                parts.iter().map(|(_, _, q)| *q).sum::<i64>(),
                t.tax,
                "las partes del grupo no suman la cuota con {} centimos",
                cents
            );
        }
    }

    #[test]
    fn emits_counter_sale_lines_event() {
        let items = json!([
            { "product_name": "Café", "price": 121, "quantity": 2_000_000, "tax_rate": 21.0 },
            { "product_name": "Agua", "price": 110, "quantity": 1_000_000, "tax_rate": 10.0 }
        ]);
        let out = sale(input(items, 8, 2000));
        // ADR-0386: + la fila del cobro. Toda venta registra su tender, también la de un solo
        // medio — si no, la tabla hija estaría vacía para todo lo cobrado antes de sales#159.
        assert_eq!(out.operations.len(), 5); // counter + sale + 2 líneas + 1 cobro
        assert_eq!(out.operations[4].command, "sales._insert_payment");
        assert_eq!(out.operations[4].params["amount"], out.operations[1].params["total"]);
        assert_eq!(out.operations[0].command, "sales._bump_counter");
        assert_eq!(out.operations[1].command, "sales._insert_sale");
        assert_eq!(out.operations[2].command, "sales._insert_line");
        assert_eq!(out.operations[1].params["sale_id"], json!("id-0"));
        assert_eq!(out.operations[2].params["sale_id"], json!("id-0"));
        assert_eq!(out.operations[2].params["line_id"], json!("id-1"));
        assert_eq!(out.events[0].name, "sale.completed");
        assert_eq!(out.events[0].payload["items_count"], json!(2));
        // El MÉTODO DE PAGO viaja en el evento (QA restaurante, P0 del arqueo):
        // sin él, cash_register.record_sale defaultea 'cash' y suma la TARJETA al
        // cajón → el arqueo nunca cuadra en un día mixto.
        assert_eq!(out.events[0].payload["payment_method_name"], json!("Efectivo"));
        assert_eq!(out.events[0].payload["payment_method_id"], json!("pm-1"));
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
    fn la_venta_no_sabe_de_mesas() {
        // ADR-0141: la venta es una TRANSACCIÓN, no un hecho de sala. Antes `table_id` viajaba en
        // `sale.completed` porque cocina creaba la comanda al COBRAR (D3); ahora la comanda nace
        // del pedido (`order.fired`) y nadie necesita la mesa aquí. Un ultramarinos no tiene mesas
        // y vende igual: lo que ata la venta a la sala es la junction que OWNea `tables`.
        let new_ids: Vec<Value> = (0..4).map(|i| json!(format!("id-{i}"))).collect();
        let input = json!({
            "payload": {
                "idempotency_key": "idem-test-1499",
                "items": [{ "product_name": "X", "price": 121, "quantity": 1_000_000, "tax_rate": 21.0 }],
                "tax_included": true, "amount_tendered": 200, "table_id": "table-7"
            },
            "context": { "hub_id": "h1", "current_user_id": "u1", "now": "2026-05-31T10:00:00+00:00", "new_ids": new_ids }
        });
        let out = sale(input);
        // Ni en el evento…
        assert!(out.events[0].payload.get("table_id").is_none(),
                "sale.completed no lleva la mesa: {}", out.events[0].payload);
        // …ni en la fila que se persiste: aunque el cliente la mande, `sales` la ignora.
        let json_all = serde_json::to_string(&out.operations).unwrap();
        assert!(!json_all.contains("table-7"), "la venta no persiste la mesa: {json_all}");
    }

    #[test]
    fn event_carries_category_id_per_line_for_kds() {
        // category_id por línea debe viajar en sale.completed para que el KDS enrute la comanda
        // a su estación (station_id). Una línea con categoría la lleva; una sin categoría → null.
        let new_ids: Vec<Value> = (0..4).map(|i| json!(format!("id-{i}"))).collect();
        let input = json!({
            "payload": {
                "idempotency_key": "idem-test-1520",
                "items": [
                    { "product_name": "Pollo", "price": 121, "quantity": 1_000_000, "tax_rate": 21.0, "category_id": "cat-cocina" },
                    { "product_name": "Agua",  "price": 110, "quantity": 1_000_000, "tax_rate": 10.0 }
                ],
                "tax_included": true, "amount_tendered": 500
            },
            "context": { "hub_id": "h1", "current_user_id": "u1", "now": "2026-05-31T10:00:00+00:00", "new_ids": new_ids }
        });
        let out = sale(input);
        // Línea con categoría → category_id presente; sin categoría → null (no rompe el evento).
        assert_eq!(out.events[0].payload["items"][0]["category_id"], json!("cat-cocina"));
        assert_eq!(out.events[0].payload["items"][1]["category_id"], Value::Null);
    }

    #[test]
    fn totals_and_change() {
        // 1.21€×1 = 121 céntimos (IVA 21% incl), pagado 2.00€ = 200 céntimos.
        let items = json!([{ "product_name": "X", "price": 12100, "quantity": 1_000_000, "tax_rate": 21.0 }]);
        let out = sale(input(items, 4, 20000));
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
            "payload": { "items": items, "tax_included": false, "amount_tendered": 0, "customer_name": "Bar Manolo",
                         "idempotency_key": "idem-test-0002" },
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
            { "product_name": "Café", "price": 10000, "quantity": 1_000_000, "tax_category_key": "product.generic", "tax_rate": 99.0 }
        ]);
        let rules = json!([
            { "id": "r-21", "country_code": "ES", "region_code": null, "tax_category_key": "product.generic", "rate_pct": 21.0, "tax_type": "vat", "parent_id": null, "is_active": 1 },
            { "id": "r-10", "country_code": "ES", "region_code": null, "tax_category_key": "restaurant.food", "rate_pct": 10.0, "tax_type": "vat", "parent_id": null, "is_active": 1 }
        ]);
        let out = sale(input_with_rules(items, 4, rules, "array", "ES", ""));
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
            { "product_name": "Café", "price": 10000, "quantity": 1_000_000, "tax_category_key": "product.generic" }
        ]);
        let rules = json!([
            { "id": "r-21", "country_code": "ES", "region_code": null, "tax_category_key": "product.generic", "rate_pct": 21.0, "tax_type": "vat", "parent_id": null, "is_active": 1 }
        ]);
        let out = sale(input_with_rules(items, 4, rules, "rows", "ES", ""));
        let line = &out.operations[2].params;
        assert_eq!(line["tax_rate"], json!(21.0));
        assert_eq!(line["tax_amount"], json!(2100));
    }

    #[test]
    fn root_plus_components_expand_recargo() {
        // Regla raíz IVA 21 (product.generic ES) + componente Recargo 5,2 (parent_id). Base 100.00€
        // → IVA 21.00€ + RE 5.20€ → tax total 26.20€, line 131.20€.
        let items = json!([
            { "product_name": "Producto RE", "price": 10000, "quantity": 1_000_000, "tax_category_key": "product.generic" }
        ]);
        let rules = json!([
            { "id": "r-iva", "country_code": "ES", "region_code": null, "tax_category_key": "product.generic", "rate_pct": 21.0, "tax_type": "vat", "parent_id": null, "is_active": 1 },
            { "id": "c-re",  "country_code": "ES", "region_code": null, "tax_category_key": "product.generic", "rate_pct": 5.2, "tax_type": "surcharge", "parent_id": "r-iva", "is_active": 1 }
        ]);
        let out = sale(input_with_rules(items, 4, rules, "array", "ES", ""));
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
        // sales#54: el componente se MARCA para que nadie lo lea como «un tipo de IVA más». La
        // forma (una clave por tasa) se conserva —arqueo y tique la leen así—; el marcador es
        // aditivo. La raíz no lleva marca (o lleva `kind: "tax"`), el recargo `kind: "surcharge"`
        // con su etiqueta (`component_label` o `tax_type` de la regla), que es lo que imprime el tique.
        assert_eq!(tb["5.20"]["kind"], json!("surcharge"));
        assert_eq!(tb["5.20"]["label"], json!("surcharge"));
        assert_eq!(tb["21.00"]["kind"], json!("tax"));
    }

    #[test]
    fn region_rule_beats_country_rule() {
        // IGIC Canarias: la regla de región ES-CN (7%) gana a la de país ES (21%) cuando el hub
        // tiene region_code=ES-CN en su identidad fiscal.
        let items = json!([
            { "product_name": "Producto", "price": 10000, "quantity": 1_000_000, "tax_category_key": "product.generic" }
        ]);
        let rules = json!([
            { "id": "r-es", "country_code": "ES", "region_code": null, "tax_category_key": "product.generic", "rate_pct": 21.0, "tax_type": "vat", "parent_id": null, "is_active": 1 },
            { "id": "r-cn", "country_code": "ES", "region_code": "ES-CN", "tax_category_key": "product.generic", "rate_pct": 7.0, "tax_type": "igic", "parent_id": null, "is_active": 1 }
        ]);
        let out = sale(input_with_rules(items, 4, rules, "array", "ES", "ES-CN"));
        let line = &out.operations[2].params;
        assert_eq!(line["tax_rule_id"], json!("r-cn"));
        assert_eq!(line["tax_amount"], json!(700));
        assert_eq!(line["tax_region_code"], json!("ES-CN"));
    }

    #[test]
    fn unknown_category_is_refused_not_charged_at_zero() {
        // sales#21 — ANTES: categoría sin regla y sin `tax_rate` de preview → 0 % «sin romper».
        // Cobrar al 0 % una categoría que el hub no conoce es declarar exento lo que no lo es.
        let items = json!([
            { "product_name": "Misterioso", "price": 10000, "quantity": 1_000_000, "tax_category_key": "unknown.cat" }
        ]);
        let rules = json!([
            { "id": "r-21", "country_code": "ES", "region_code": null, "tax_category_key": "product.generic", "rate_pct": 21.0, "tax_type": "vat", "parent_id": null, "is_active": 1 }
        ]);
        let err = complete_sale_pure(input_with_rules(items, 4, rules, "array", "ES", ""))
            .refused("categoría desconocida → rechazo");
        assert_eq!(err.code, "sales.no_tax_rule", "{err:?}");
    }

    // ── Atribución por profesional + cita→venta ──────────────────────────────

    #[test]
    fn staff_id_persisted_in_header_and_event() {
        // La venta atribuida a un profesional guarda staff_id en la cabecera y lo emite.
        let new_ids: Vec<Value> = (0..4).map(|i| json!(format!("id-{i}"))).collect();
        let inp = json!({
            "payload": {
                "idempotency_key": "idem-test-1677",
                "items": [{ "product_name": "Corte", "price": 2000, "quantity": 1_000_000, "tax_rate": 21.0 }],
                "tax_included": true, "amount_tendered": 0, "staff_id": "staff-7", "is_service": true
            },
            "context": { "hub_id": "h1", "current_user_id": "u1", "now": "2026-05-31T10:00:00+00:00", "new_ids": new_ids }
        });
        let out = sale(inp);
        // header (_insert_sale) lleva staff_id; appointment_id NULL (venta TPV normal).
        assert_eq!(out.operations[1].params["staff_id"], json!("staff-7"));
        assert_eq!(out.operations[1].params["appointment_id"], Value::Null);
        // sale.completed lleva staff_id para que cash_register/reporting atribuyan.
        assert_eq!(out.events[0].payload["staff_id"], json!("staff-7"));
        // Sin appointment_id → un solo evento (no se emite created_from_appointment).
        assert_eq!(out.events.len(), 1);
    }

    #[test]
    fn each_line_carries_its_own_professional() {
        // sales#273 — Ana corta y Marta tiñe en el MISMO ticket. Hasta aquí la atribución vivía
        // solo en la cabecera, así que el ticket entero caía sobre una de las dos y el cierre por
        // profesional no podía cuadrar. Cada línea nombra a quien la hizo.
        let new_ids: Vec<Value> = (0..6).map(|i| json!(format!("id-{i}"))).collect();
        let inp = json!({
            "payload": {
                "idempotency_key": "idem-273-split",
                "items": [
                    { "product_name": "Corte", "price": 2000, "quantity": 1_000_000, "tax_rate": 21.0,
                      "is_service": true, "staff_id": "staff-ana" },
                    { "product_name": "Color", "price": 5000, "quantity": 1_000_000, "tax_rate": 21.0,
                      "is_service": true, "staff_id": "staff-marta" }
                ],
                "tax_included": true, "amount_tendered": 0, "staff_id": "staff-ana"
            },
            "context": { "hub_id": "h1", "current_user_id": "u1", "now": "2026-05-31T10:00:00+00:00", "new_ids": new_ids }
        });
        let out = sale(inp);
        let lines: Vec<&Value> = out.operations.iter()
            .filter(|o| o.command == "sales._insert_line")
            .map(|o| &o.params["staff_id"])
            .collect();
        assert_eq!(lines, vec![&json!("staff-ana"), &json!("staff-marta")],
            "cada línea se atribuye a quien la hizo, no la cabecera entera a una");
    }

    #[test]
    fn a_line_that_names_nobody_falls_back_to_the_sale() {
        // El caso de siempre y el mayoritario: un bar no atribuye por línea. La línea hereda la
        // atribución de la venta, que a su vez cae al usuario con sesión (sales#179), así que
        // `sales.by_staff` sigue contestando lo mismo para todo el que no reparte.
        let new_ids: Vec<Value> = (0..4).map(|i| json!(format!("id-{i}"))).collect();
        let inp = json!({
            "payload": {
                "idempotency_key": "idem-273-fallback",
                "items": [{ "product_name": "Caña", "price": 250, "quantity": 1_000_000, "tax_rate": 21.0 }],
                "tax_included": true, "amount_tendered": 0
            },
            "context": { "hub_id": "h1", "current_user_id": "u1", "now": "2026-05-31T10:00:00+00:00", "new_ids": new_ids }
        });
        let out = sale(inp);
        let line = out.operations.iter().find(|o| o.command == "sales._insert_line").expect("una línea");
        assert_eq!(line.params["staff_id"], json!("u1"),
            "sin nadie nombrado, la línea es del que la cobró");
    }

    #[test]
    fn an_empty_line_staff_id_is_not_an_attribution() {
        // Misma regla que en la cabecera: una integración que manda `""` no está atribuyendo.
        // Guardarlo tal cual crearía en el cierre un profesional cuyo nombre es la cadena vacía.
        let new_ids: Vec<Value> = (0..4).map(|i| json!(format!("id-{i}"))).collect();
        let inp = json!({
            "payload": {
                "idempotency_key": "idem-273-empty",
                "items": [{ "product_name": "Corte", "price": 2000, "quantity": 1_000_000,
                            "tax_rate": 21.0, "staff_id": "" }],
                "tax_included": true, "amount_tendered": 0, "staff_id": "staff-ana"
            },
            "context": { "hub_id": "h1", "current_user_id": "u1", "now": "2026-05-31T10:00:00+00:00", "new_ids": new_ids }
        });
        let out = sale(inp);
        let line = out.operations.iter().find(|o| o.command == "sales._insert_line").expect("una línea");
        assert_eq!(line.params["staff_id"], json!("staff-ana"));
    }

    #[test]
    fn event_carries_customer_fiscal_snapshot_for_invoice() {
        // ADR-0132: si el cajero asigna un cliente en el TPV, sus datos fiscales viajan en
        // sale.completed para que `invoice` emita la factura CON NIF y dirección. Sin esto la
        // factura sale vacía aunque el cliente los tenga en su ficha.
        let new_ids: Vec<Value> = (0..4).map(|i| json!(format!("id-{i}"))).collect();
        let inp = json!({
            "payload": {
                "idempotency_key": "idem-test-1700",
                "items": [{ "product_name": "Corte", "price": 2000, "quantity": 1_000_000, "tax_rate": 21.0 }],
                "tax_included": true, "amount_tendered": 0,
                "customer_id": "cus-1", "customer_name": "Ana García",
                "customer_tax_id": "12345678Z",
                "customer_address": "Calle Mayor 1, 28013 Madrid, ES"
            },
            "context": { "hub_id": "h1", "current_user_id": "u1", "now": "2026-05-31T10:00:00+00:00", "new_ids": new_ids }
        });
        let out = sale(inp);
        let ev = &out.events[0].payload;
        assert_eq!(ev["customer_id"], json!("cus-1"));
        assert_eq!(ev["customer_name"], json!("Ana García"));
        assert_eq!(ev["customer_tax_id"], json!("12345678Z"));
        assert_eq!(ev["customer_address"], json!("Calle Mayor 1, 28013 Madrid, ES"));
    }

    #[test]
    fn event_carries_a_foreign_customers_country_and_document_kind() {
        // sales#332: a customer from abroad is declared to the AEAT by their country and the kind
        // of document their number is (IDOtro), not as a Spanish NIF. `invoice.create_from_sale`
        // copies both from sale.completed (hub#1967); the country travels as ISO upper case.
        let new_ids: Vec<Value> = (0..4).map(|i| json!(format!("id-{i}"))).collect();
        let inp = json!({
            "payload": {
                "idempotency_key": "idem-test-332",
                "items": [{ "product_name": "Corte", "price": 2000, "quantity": 1_000_000, "tax_rate": 21.0 }],
                "tax_included": true, "amount_tendered": 0, "document_type": "invoice",
                "customer_name": "ACME Inc", "customer_tax_id": "TEST-TAXID-1",
                "customer_address": "1 Main St, Springfield",
                "customer_country": " us ", "customer_id_type": "04"
            },
            "context": { "hub_id": "h1", "current_user_id": "u1", "now": "2026-09-23T10:00:00+00:00", "new_ids": new_ids }
        });
        let out = sale(inp);
        let ev = &out.events[0].payload;
        assert_eq!(ev["customer_country"], json!("US"));
        assert_eq!(ev["customer_id_type"], json!("04"));
    }

    #[test]
    fn anonymous_sale_carries_no_fiscal_snapshot() {
        // Venta de barra sin cliente: los campos fiscales van vacíos, no heredados.
        let items = json!([{ "product_name": "Café", "price": 121, "quantity": 1_000_000, "tax_rate": 21.0 }]);
        let out = sale(input(items, 4, 200));
        assert_eq!(out.events[0].payload["customer_tax_id"], json!(""));
        assert_eq!(out.events[0].payload["customer_address"], json!(""));
        // '' = the tax id's VAT prefix decides downstream, exactly as before sales#332.
        assert_eq!(out.events[0].payload["customer_country"], json!(""));
        assert_eq!(out.events[0].payload["customer_id_type"], json!(""));
    }

    #[test]
    fn sale_without_staff_is_attributed_to_the_session_user() {
        // sales#179 — **a sale ALWAYS says who attended it.** This test used to assert the
        // opposite (`staff_id` NULL), and that was exactly the fault: the till never asks for the
        // waiter, so no counter sale was ever attributed and `sales.by_staff` came back empty. The
        // market (Toast, Square for Restaurants, Lightspeed) pins the *server* to the check from
        // the moment it opens, and that server is by default the user signed in at the terminal.
        //
        // The SERVER is what resolves it, from `context.current_user_id` — the same non-forgeable
        // id that already writes `employee_id`. The browser cannot make it up.
        let items = json!([{ "product_name": "Café", "price": 121, "quantity": 1_000_000, "tax_rate": 21.0 }]);
        let out = sale(input(items, 4, 200));
        assert_eq!(out.operations[1].params["staff_id"], json!("u1"));
        assert_eq!(out.events.len(), 1);
        assert_eq!(out.events[0].payload["staff_id"], json!("u1"));
    }

    #[test]
    fn an_empty_staff_id_is_not_an_attribution_either() {
        // sales#179 — the till sends `staff_id: null` when there is no appointment, and an
        // integration sends `""`. Neither means "nobody attended": both fall back to the session
        // user.
        let items = json!([{ "product_name": "Café", "price": 121, "quantity": 1_000_000, "tax_rate": 21.0 }]);
        let mut inp = input(items, 4, 200);
        inp["payload"]["staff_id"] = json!("");
        let out = sale(inp);
        assert_eq!(out.operations[1].params["staff_id"], json!("u1"));
        assert_eq!(out.events[0].payload["staff_id"], json!("u1"));
    }

    #[test]
    fn staff_id_from_the_payload_wins_over_the_session_user() {
        // sales#179 — the opposite control: when the sale is born from an appointment (or the
        // cashier transfers the check to somebody else), that person wins over whoever is charging.
        // The cashier is still stored separately, in `employee_id` (`:current_user_id` in
        // `_insert_sale`).
        let items = json!([{ "product_name": "Tinte", "price": 4500, "quantity": 1_000_000, "tax_rate": 21.0 }]);
        let mut inp = input(items, 4, 5000);
        inp["payload"]["staff_id"] = json!("staff-7");
        let out = sale(inp);
        assert_eq!(out.operations[1].params["staff_id"], json!("staff-7"));
        assert_eq!(out.events[0].payload["staff_id"], json!("staff-7"));
    }

    #[test]
    fn the_appointment_trace_event_carries_the_resolved_staff() {
        // sales#179 — `sales.sale.created_from_appointment` used to carry the RAW `staff_id` from
        // the payload. An appointment with no professional assigned left `appointments` with
        // nobody to mark the conversion against; it now carries the same RESOLVED value as the
        // header.
        let new_ids: Vec<Value> = (0..4).map(|i| json!(format!("id-{i}"))).collect();
        let inp = json!({
            "payload": {
                "idempotency_key": "idem-test-179-appt",
                "items": [{ "product_name": "Tinte", "price": 4500, "quantity": 1_000_000, "tax_rate": 21.0, "is_service": true }],
                "tax_included": true, "amount_tendered": 0, "appointment_id": "appt-99"
            },
            "context": { "hub_id": "h1", "current_user_id": "u-ana", "now": "2026-05-31T10:00:00+00:00", "new_ids": new_ids }
        });
        let out = sale(inp);
        assert_eq!(out.events.len(), 2);
        assert_eq!(out.events[1].name, "sales.sale.created_from_appointment");
        assert_eq!(out.events[1].payload["staff_id"], json!("u-ana"));
    }

    #[test]
    fn appointment_emits_created_from_appointment_event() {
        // Cita→venta: con appointment_id se emite el segundo evento de traza (aditivo).
        let new_ids: Vec<Value> = (0..4).map(|i| json!(format!("id-{i}"))).collect();
        let inp = json!({
            "payload": {
                "idempotency_key": "idem-test-1741",
                "items": [{ "product_name": "Tinte", "price": 4500, "quantity": 1_000_000, "tax_rate": 21.0, "is_service": true }],
                "tax_included": true, "amount_tendered": 0,
                "staff_id": "staff-3", "appointment_id": "appt-99", "customer_id": "cust-1", "customer_name": "Ana"
            },
            "context": { "hub_id": "h1", "current_user_id": "u1", "now": "2026-05-31T10:00:00+00:00", "new_ids": new_ids }
        });
        let out = sale(inp);
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
    fn without_context_reads_a_categorised_line_is_refused_not_priced_by_the_client() {
        // sales#21 — ANTES: sin `context.reads` (host antiguo / dep no resuelta) se usaba el
        // `tax_rate` del payload. Eso era el agujero: un `taxes` caído se convertía en «cobra lo
        // que diga el navegador». Con la read `required` (hub#701) el runtime ya aborta; y si un
        // runtime viejo la omite, el handler rechaza con su propio código.
        let items = json!([
            { "product_name": "Agua", "price": 10000, "quantity": 1_000_000, "tax_category_key": "restaurant.drink", "tax_rate": 10.0 }
        ]);
        let inp = json!({
            "payload": { "items": items, "tax_included": false, "amount_tendered": 0, "idempotency_key": "idem-test-1770" },
            "context": { "hub_id": "h1", "now": "2026-05-31T10:00:00+00:00", "country_code": "ES",
                "new_ids": [json!("id-0"), json!("id-1"), json!("id-2"), json!("id-3")] }
        });
        let err = complete_sale_pure(inp).refused("sin catálogo fiscal no se cobra");
        assert_eq!(err.code, "sales.tax_catalog_unavailable", "{err:?}");
    }

    #[test]
    fn gift_line_is_free_and_accumulates_cost_in_arqueo() {
        // Invitación: una línea is_gift no se cobra (net/tax/total=0) pero descuenta stock y suma su
        // COSTE en gift_total (arqueo). La otra línea (normal) sí se cobra.
        let items = json!([
            { "product_name": "Café cortesía", "price": 200, "quantity": 1_000_000, "tax_category_key": "restaurant.drink",
              "tax_rate": 10.0, "is_gift": true, "gift_reason": "cortesía", "cost": 60 },
            { "product_name": "Tarta", "price": 500, "quantity": 1_000_000, "tax_category_key": "restaurant.food", "tax_rate": 10.0 }
        ]);
        // sales#21: una línea con categoría exige catálogo fiscal — este test es de invitaciones,
        // no de impuestos, así que se le da el suyo (ES, 10 % para bebida y comida).
        let rules = json!([
            { "id": "r-drink", "country_code": "ES", "region_code": null, "tax_category_key": "restaurant.drink", "rate_pct": 10.0, "tax_type": "vat", "parent_id": null, "is_active": 1 },
            { "id": "r-food", "country_code": "ES", "region_code": null, "tax_category_key": "restaurant.food", "rate_pct": 10.0, "tax_type": "vat", "parent_id": null, "is_active": 1 }
        ]);
        let mut inp = input(items, 8, 1000);
        inp["context"]["country_code"] = json!("ES");
        inp["context"]["reads"] = json!({ "taxes.rules.list": rules });
        let out = sale(inp);
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

    #[test]
    fn covered_line_is_worth_nothing_and_is_not_a_discount() {
        // sales#162 / ADR-0386 — una línea que un TENDER EXTERNO ya pagó (el bono de `services`
        // cubre LÍNEAS, no importes). Vale net/tax/total = 0, sigue en la venta —la clienta SÍ se
        // llevó el corte, y el tique tiene que nombrarlo— y el resto del ticket se cobra normal.
        //
        // 🔴 NO es un descuento y no puede modelarse como uno: `discount: 100` entraría en
        // `discount_amount` (mentiría en los libros diciendo que el salón regaló 18 €) y un hub con
        // `allow_discounts` desactivado RECHAZARÍA el canje, que es lo contrario de lo que pasa.
        //
        // 🔴 Tampoco es una invitación: un comp acumula su COSTE en `gift_total` para el arqueo, y
        // una sesión de bono no es una cortesía del salón — se cobró al vender el bono.
        //
        // Fiscalmente esto es lo correcto para un bono UNIVALENTE (ADR-0386 §5): el registro salió
        // al VENDER el bono, con el IVA del servicio, y el canje «no se considerará una operación
        // independiente» (art. 30 ter.1 de la Directiva 2006/112/CE). Base 0, cuota 0.
        let items = json!([
            { "product_name": "Corte", "price": 1800, "quantity": 1_000_000,
              "tax_category_key": "service.generic", "tax_rate": 21.0, "is_service": true,
              "covered": true, "cost": 400 },
            { "product_name": "Champú", "price": 900, "quantity": 1_000_000,
              "tax_category_key": "product.generic", "tax_rate": 21.0 }
        ]);
        let rules = json!([
            { "id": "r-svc", "country_code": "ES", "region_code": null, "tax_category_key": "service.generic", "rate_pct": 21.0, "tax_type": "vat", "parent_id": null, "is_active": 1 },
            { "id": "r-prod", "country_code": "ES", "region_code": null, "tax_category_key": "product.generic", "rate_pct": 21.0, "tax_type": "vat", "parent_id": null, "is_active": 1 }
        ]);
        let mut inp = input(items, 8, 900);
        inp["context"]["country_code"] = json!("ES");
        inp["context"]["reads"] = json!({ "taxes.rules.list": rules });
        let out = sale(inp);

        let corte = &out.operations[2].params;
        assert_eq!(corte["is_covered"], json!(1), "la fila deja escrito que otro tender la pagó");
        assert_eq!(corte["net_amount"], json!(0));
        assert_eq!(corte["tax_amount"], json!(0));
        assert_eq!(corte["line_total"], json!(0));
        assert_eq!(corte["unit_price"], json!(1800), "el precio se conserva para el papel");
        assert_eq!(corte["is_gift"], json!(0), "cubierto no es invitación");
        assert_eq!(corte["discount_percent"], json!(0.0), "cubierto no es descuento");

        let champu = &out.operations[3].params;
        assert_eq!(champu["is_covered"], json!(0));
        assert_eq!(champu["line_total"], json!(900), "el resto del ticket se cobra igual");

        let h = &out.operations[1].params;
        assert_eq!(h["total"], json!(900), "solo se cobra lo no cubierto");
        assert_eq!(h["gift_total"], json!(0), "el coste NO va al arqueo de invitaciones");
        assert_eq!(h["discount_amount"], json!(0), "y no aparece como descuento concedido");

        let ev = &out.events[0].payload;
        assert_eq!(ev["items"][0]["covered"], json!(true));
        assert_eq!(ev["items"][0]["net_amount"], json!(0), "`invoice` no declara base por la sesión");
        assert_eq!(ev["items"][0]["tax_amount"], json!(0));
        assert_eq!(ev["total"], json!(900));
    }

    #[test]
    fn covered_line_does_not_take_a_share_of_the_fixed_discount() {
        // sales#113 reparte el importe fijo por RESTO MAYOR entre las líneas cobradas. Una línea
        // cubierta no se cobra, así que no puede llevarse un trozo: si se lo llevara, el descuento
        // se evaporaría (aplicado sobre un 0) y el cliente pagaría de más.
        let items = json!([
            { "product_name": "Corte", "price": 1800, "quantity": 1_000_000, "tax_rate": 21.0, "covered": true },
            { "product_name": "Champú", "price": 900, "quantity": 1_000_000, "tax_rate": 21.0 }
        ]);
        let mut inp = input(items, 8, 800);
        inp["payload"]["discount_amount"] = json!(100);
        let out = sale(inp);
        let h = &out.operations[1].params;
        assert_eq!(h["total"], json!(800), "900 - 100: el descuento cae ENTERO sobre lo cobrado");
        assert_eq!(out.operations[2].params["line_total"], json!(0));
        assert_eq!(out.operations[3].params["line_total"], json!(800));
    }

    // ── ADR-0147 · contrato de la CANTIDAD: punto fijo global 10⁶ ────────────────────────────
    //
    // De dónde sale: `sale.completed` emitía `quantity` como f64 (`3.0`); `inventory` lee un
    // entero → 0 → `qty <= 0 → continue` → vender al peso NO descontaba stock, en silencio.

    /// Escala global (ADR-0147 §2.1). Duplicada a propósito: si cambia en el SDK, esto debe fallar.
    const SCALE: i64 = 1_000_000;

    #[test]
    fn media_racion_calcula_el_importe_en_punto_fijo_y_lo_emite_en_escala_10e6() {
        // 0,5 kg de gambas a 12,00 €/kg (IVA 21 % incl): el importe de línea es UN solo HALF_UP
        // (600 = 1200 × 500000 ÷ 1000000) y el evento lleva la cantidad EXACTA en escala 10⁶.
        let items = json!([{
            "product_name": "Gambas", "product_id": "p-gambas", "price": 1200,
            "quantity": 500_000, "tax_rate": 21.0
        }]);
        // La línea dice ser de catálogo (`product_id`), así que desde sales#68 necesita catálogo:
        // sin él la venta se rechaza a propósito. El precio del catálogo es el MISMO que traía el
        // payload, para que este test siga midiendo lo que medía — la aritmética de la cantidad.
        let mut inp = input(items, 3, 600);
        inp["context"]["reads"] = json!({
            "inventory.products.for_sale": [{ "id": "p-gambas", "price": 1200, "cost": 0 }]
        });
        let out = sale(inp);

        let line = &out.operations[2].params;
        assert_eq!(line["quantity"], json!(500_000), "la línea persiste la representación cruda");
        assert_eq!(line["line_total"], json!(600), "1200 × 0,5 = 600 céntimos, un solo redondeo");
        assert_eq!(line["net_amount"], json!(496), "600/1,21 = 495,87 → 496 (HALF_UP)");

        let h = &out.operations[1].params;
        assert_eq!(h["total"], json!(600));

        // EL CONTRATO DEL EVENTO — lo que desbloquea `sale_decrements_stock_via_event`: la
        // cantidad viaja como ENTERO en escala 10⁶, no como float. `inventory` hace `as_i64` y
        // un `500000.0` sería 0 → no descontaría.
        let ev = &out.events[0].payload;
        assert_eq!(ev["items"][0]["quantity"].as_i64(), Some(500_000),
                   "el evento emite la cantidad como entero 10⁶: {:?}", ev["items"][0]["quantity"]);
    }

    #[test]
    fn kpein_un_precio_por_100_unidades_cuadra_el_importe_de_linea() {
        // ADR-0147 §2.3 (modelo KPEIN de SAP): 0,0037 €/ud NO es un entero de céntimos; se expresa
        // como «0,37 € por 100 ud» (`price` = 37, `price_quantity_value` = 100×10⁶). 250 tornillos:
        // 37 × 250e6 ÷ 100e6 = 92,5 → HALF_UP → 93 céntimos. El dinero sigue siendo entero.
        let items = json!([{
            "product_name": "Tornillo", "price": 37, "quantity": 250 * SCALE,
            "price_quantity_value": 100 * SCALE, "pricing_unit_code": "ud",
            "tax_rate": 21.0
        }]);
        let out = sale(input(items, 3, 100));
        let line = &out.operations[2].params;
        assert_eq!(line["line_total"], json!(93), "92,5 → 93: HALF_UP, uno solo, por línea");
        assert_eq!(out.operations[1].params["total"], json!(93));
    }

    #[test]
    fn la_linea_congela_el_contexto_de_unidades_del_payload() {
        // ADR-0147 §2.4 (opción A): la línea conserva el contexto con el que fue creada y el
        // cálculo histórico NUNCA consulta el maestro. Si mañana las gambas pasan de `kg` a `ud`,
        // una línea de ayer sigue siendo 0,5 kg y se puede reimprimir, recalcular o anular.
        let items = json!([{
            "product_name": "Gambas", "price": 1200, "quantity": 500_000, "tax_rate": 21.0,
            "unit_code": "kg", "unit_name": "Kilogram",
            "factor_num": 1, "factor_den": 1, "increment_value": 1_000,
            "price_quantity_value": SCALE, "pricing_unit_code": "kg", "pricing_unit_name": "Kilogram",
            "pricing_factor_num": 1, "pricing_factor_den": 1
        }]);
        let out = sale(input(items, 3, 600));
        let p = &out.operations[2].params;
        assert_eq!(p["unit_code"], json!("kg"));
        assert_eq!(p["unit_name"], json!("Kilogram"));
        assert_eq!(p["factor_num"], json!(1), "el factor es fracción EXACTA num/den, nunca decimal");
        assert_eq!(p["factor_den"], json!(1));
        assert_eq!(p["increment_value"], json!(1_000), "0,001 kg: el escalón de una báscula");
        assert_eq!(p["price_quantity_value"], json!(SCALE));
        assert_eq!(p["pricing_unit_code"], json!("kg"));
        assert_eq!(p["pricing_factor_num"], json!(1));
        assert_eq!(p["pricing_factor_den"], json!(1));
    }

    #[test]
    fn sin_contexto_de_unidades_la_linea_congela_la_unidad_suelta() {
        // El caso mayoritario no configura nada: un bar vende cañas. La línea congela `ud`,
        // factor 1/1, incremento 1 ud y precio por 1 unidad — el comportamiento de siempre.
        let items = json!([{ "product_name": "Caña", "price": 250, "quantity": SCALE, "tax_rate": 21.0 }]);
        let out = sale(input(items, 3, 250));
        let p = &out.operations[2].params;
        assert_eq!(p["unit_code"], json!("ud"));
        assert_eq!(p["factor_num"], json!(1));
        assert_eq!(p["factor_den"], json!(1));
        assert_eq!(p["increment_value"], json!(SCALE), "una pieza no se parte");
        assert_eq!(p["price_quantity_value"], json!(SCALE), "precio por 1 unidad");
        assert_eq!(p["line_total"], json!(250), "1 caña × 250 = 250: nada cambia para el bar");
    }

    // ── sales#12 · la CATEGORÍA del producto es snapshot de la línea (routing de cocina) ────────
    //
    // Regla de `architecture/modules/sales.md`: dependencia FUNCIONAL (inventory/taxes) = snapshot
    // en la línea. La categoría decide a qué estación se cocina, y una comanda ya enviada no puede
    // cambiar de estación porque mañana alguien recategorice el producto. Mismo molde que el
    // snapshot fiscal (`tax_category_key`, 006). Se congela al abrir/añadir (pedido) y al cobrar.

    #[test]
    fn the_order_line_freezes_the_product_category_it_was_added_with() {
        let items = json!([{ "product_id": "p-cerveza", "product_name": "Cerveza", "price": 300,
                             "quantity": 1_000_000, "category_id": "cat-bebidas" }]);
        let out = orden(order_input(items, 3));
        let l = out.operations.iter().find(|o| o.command == "sales._insert_order_line").unwrap();
        assert_eq!(l.params["category_id"], json!("cat-bebidas"));
    }

    #[test]
    fn an_order_line_without_category_stores_null_not_empty_string() {
        // NULL = «sin clasificar» (precio libre, servicio sin categoría). Kitchen enruta con
        // `category_id` solo si viene; una cadena vacía sería un id que no existe.
        let items = json!([{ "product_name": "Varios", "price": 300, "quantity": 1_000_000 }]);
        let out = orden(input(items, 3, 0));
        let l = out.operations.iter().find(|o| o.command == "sales._insert_order_line").unwrap();
        assert_eq!(l.params["category_id"], Value::Null);
    }

    #[test]
    fn the_sale_line_freezes_the_category_too() {
        let items = json!([{ "product_name": "Cerveza", "price": 300, "quantity": 1_000_000,
                             "tax_rate": 21.0, "category_id": "cat-bebidas" }]);
        let out = sale(input(items, 3, 300));
        let l = out.operations.iter().find(|o| o.command == "sales._insert_line").unwrap();
        assert_eq!(l.params["category_id"], json!("cat-bebidas"));
    }

    #[test]
    fn the_order_line_keeps_its_manual_discount_and_the_provisional_reflects_it() {
        // sales#71 — 1,80 € × 2 con 10 % = 3,24 € (un solo HALF_UP), y el % viaja a la fila para
        // que la cuenta RETOMADA lo conserve. Fuera de rango → rechazo, como en el cobro.
        let items = json!([{ "product_name": "Café", "price": 180, "quantity": 2_000_000, "discount": 10 }]);
        let out = orden(input(items, 3, 0));
        let l = out.operations.iter().find(|o| o.command == "sales._insert_order_line").unwrap();
        assert_eq!(l.params["discount_percent"], json!(10.0));
        assert_eq!(l.params["line_total"], json!(324));
        let h = out.operations.iter().find(|o| o.command == "sales._insert_order").unwrap();
        assert_eq!(h.params["provisional_total"], json!(324));

        let bad = json!([{ "product_name": "Café", "price": 180, "quantity": 1_000_000, "discount": 120 }]);
        let err = open_order_pure(input(bad, 3, 0)).refused("120 % no es un descuento");
        assert_eq!(err.code, "sales.discount_out_of_range", "{err:?}");
    }

    #[test]
    fn abrir_un_pedido_congela_el_contexto_y_calcula_el_provisional_en_punto_fijo() {
        // El pedido abierto también habla 10⁶: 0,5 kg × 12,00 €/kg = 6,00 € provisionales, y sus
        // líneas congelan el mismo contexto que las de venta (cerrar y reabrir NO puede cambiar
        // lo que significa la cantidad).
        let items = json!([{
            "product_name": "Gambas", "price": 1200, "quantity": 500_000,
            "unit_code": "kg", "increment_value": 1_000
        }]);
        let out = orden(input(items, 3, 0));
        let l = out.operations.iter().find(|o| o.command == "sales._insert_order_line").unwrap();
        assert_eq!(l.params["quantity"], json!(500_000));
        assert_eq!(l.params["line_total"], json!(600), "1200 × 0,5 = 600, un solo HALF_UP");
        assert_eq!(l.params["unit_code"], json!("kg"));
        assert_eq!(l.params["increment_value"], json!(1_000));
        let h = out.operations.iter().find(|o| o.command == "sales._insert_order").unwrap();
        assert_eq!(h.params["provisional_total"], json!(600));
    }

    #[test]
    fn una_cantidad_fuera_de_la_rejilla_se_RECHAZA_no_se_redondea() {
        // ADR-0147 §2.2: el incremento es VALIDACIÓN, no instrucción de redondeo. Medio gramo en
        // una unidad configurada en gramos NO se convierte en 0 g ni en 1 g: se rechaza el comando
        // entero, con un error que NOMBRA ambos valores (la UI construye su mensaje con ellos).
        let items = json!([{
            "product_name": "Gambas", "price": 1200, "quantity": 500, // 0,0005 kg
            "unit_code": "kg", "increment_value": 1_000, "tax_rate": 21.0
        }]);
        let err = complete_sale_pure(input(items.clone(), 3, 0)).refused("fuera de rejilla");
        assert_eq!(err.code, "sales.quantity_off_grid", "{err:?}");
        // The detail names both values so a developer reading the log sees the offending pair; what
        // the till shows is resolved from the CODE (ADR-0055), never from this sentence.
        assert!(err.message.contains("500") && err.message.contains("1000"), "nombra ambos valores: {err:?}");

        // Y el pedido tampoco lo acepta: abrir con una cantidad inválida y cobrarla después
        // sería mover el error de sitio.
        assert!(open_order_pure(input(items, 3, 0)).was_refused());
    }

    #[test]
    fn una_cantidad_no_positiva_se_rechaza() {
        // Una línea de 0 unidades no es una venta de nada: es un bug de quien llama.
        let items = json!([{ "product_name": "X", "price": 100, "quantity": 0, "tax_rate": 21.0 }]);
        let err = complete_sale_pure(input(items, 3, 0)).refused("cantidad 0");
        assert_eq!(err.code, "sales.quantity_not_positive", "{err:?}");
    }

    #[test]
    fn el_coste_de_una_invitacion_tambien_va_en_escala_10e6() {
        // gift_total (arqueo) = coste × cantidad. Con la cantidad en 10⁶, 0,5 kg de coste 8,00 €/kg
        // son 4,00 € — no 4.000.000 € (el «×un millón» que ya nos comimos en inventario).
        let items = json!([{
            "product_name": "Gambas cortesía", "price": 1200, "quantity": 500_000, "tax_rate": 10.0,
            "is_gift": true, "gift_reason": "cortesía", "cost": 800
        }]);
        let out = sale(input(items, 3, 0));
        assert_eq!(out.operations[1].params["gift_total"], json!(400), "800 × 0,5 = 400 céntimos");
    }

    // ── sales#20 · the SERVER closes the sale, the client only proposes ───────────────────────
    //
    // Everything below states the same rule from a different angle: what the browser sends is an
    // OFFER. The server validates it against its own sources of truth (the sale settings and the
    // payment-method catalog the runtime pre-loads via `reads`) and either closes the sale itself
    // or rejects it LOUDLY — a rejection returns `Err`, so the runtime never persists an operation
    // nor writes a single row into the outbox.

    /// Builds an input with the trusted catalogs the runtime pre-loads for `complete_sale`
    /// (ADR-0069 `reads`): `sales.payment_methods`, `sales.settings.get` and the idempotency probe
    /// `sales.by_idempotency_key`. `Value::Null` for any of them means "the runtime did not deliver
    /// that read" — the key is simply absent, which is how an old runtime behaves.
    fn input_with_catalogs(
        items: Value,
        ids: usize,
        methods: Value,
        settings: Value,
        already_recorded: Value,
    ) -> Value {
        let mut inp = input(items, ids, 0);
        let mut reads = Map::new();
        if !methods.is_null() {
            reads.insert("sales.payment_methods".into(), methods);
        }
        if !settings.is_null() {
            reads.insert("sales.settings.get".into(), settings);
        }
        if !already_recorded.is_null() {
            reads.insert("sales.by_idempotency_key".into(), already_recorded);
        }
        inp["context"]["reads"] = Value::Object(reads);
        inp
    }

    /// The catalog a hub really has: one active cash method.
    fn cash_catalog() -> Value {
        json!([{ "id": "pm-1", "name": "Cash", "type": "cash" }])
    }

    /// The sale catalogue the runtime pre-loads from `inventory.products.for_sale` (sales#68):
    /// one product that really costs 50,00 €.
    fn product_catalog() -> Value {
        json!([{ "id": "p-wine", "price": 5000, "cost": 3000, "tax_category_key": "product.generic" }])
    }

    /// An input carrying BOTH trusted catalogues: payment methods and products.
    fn input_with_products(items: Value, ids: usize, products: Value) -> Value {
        let mut inp = input_with_catalogs(items, ids, cash_catalog(), Value::Null, Value::Null);
        if !products.is_null() {
            inp["context"]["reads"]["inventory.products.for_sale"] = products;
        }
        inp
    }

    /// A trusted tax catalogue: one ES root rule at 21 % for `product.generic`.
    fn tax_catalog() -> Value {
        json!([{ "id": "r-es-21", "country_code": "ES", "region_code": null,
                 "tax_category_key": "product.generic", "rate_pct": 21.0, "tax_type": "vat" }])
    }

    /// Input with BOTH catalogues plus the fiscal one, and a hub in ES.
    fn input_fiscal(items: Value, products: Value, rules: Value) -> Value {
        let mut inp = input_with_products(items, 4, products);
        if !rules.is_null() {
            inp["context"]["reads"]["taxes.rules.list"] = rules;
        }
        inp["context"]["country_code"] = json!("ES");
        inp
    }

    // ── sales#67 · el IMPUESTO tampoco lo pone el navegador ────────────────────────────────────
    //
    // `resolve_line_tax` caía al `tax_rate` del payload cuando la categoría no resolvía regla —su
    // propio comentario lo llamaba «preview del cliente»—. Con eso, los DOS números que deciden lo
    // que se cobra y lo que se declara a la AEAT los proponía quien llama.

    #[test]
    fn the_tax_category_comes_from_the_catalogue_too() {
        // El payload miente sobre la categoría para caer en una regla más barata; la fila manda.
        let items = json!([{ "product_id": "p-wine", "product_name": "Vino", "price": 5000,
                             "quantity": 1_000_000, "tax_category_key": "restaurant.food",
                             "tax_rate": 10.0 }]);
        let out = complete_sale_pure(input_fiscal(items, product_catalog(), tax_catalog()))
            .accepted("la venta se cierra");
        let line = out.operations.iter().find(|o| o.command == "sales._insert_line").unwrap();
        assert_eq!(
            line.params["tax_rate"], json!(21.0),
            "se aplicó la categoría del payload en vez de la del catálogo"
        );
    }

    // ── sales#195 · the frozen CATEGORY comes from the catalogue too ───────────────────────────
    //
    // ADR-0085: both the rate and the tax category are set by the hub's trusted catalogue. The rate
    // already came from there (sales#67/#68), but the `tax_category_key` column that gets PERSISTED
    // — and the one travelling in `sale.completed` towards the invoice and VeriFactu — was copied
    // from the payload. Two authorities writing the same fiscal snapshot, and they could disagree:
    // the row read "product.generic" while charging the 10 % of `restaurant.food`.

    /// The catalogue says one thing and the till another: the product is `restaurant.food` (10 %)
    /// and the payload claims `product.generic` (21 %).
    fn mismatching_category_input() -> Value {
        input_fiscal(
            json!([{ "product_id": "p-menu", "product_name": "Menu", "price": 1000,
                     "quantity": 1_000_000, "tax_category_key": "product.generic" }]),
            json!([{ "id": "p-menu", "price": 1000, "cost": 0,
                     "tax_category_key": "restaurant.food" }]),
            json!([
                { "id": "r-10", "country_code": "ES", "region_code": null,
                  "tax_category_key": "restaurant.food", "rate_pct": 10.0, "tax_type": "vat" },
                { "id": "r-21", "country_code": "ES", "region_code": null,
                  "tax_category_key": "product.generic", "rate_pct": 21.0, "tax_type": "vat" }
            ]),
        )
    }

    #[test]
    fn the_frozen_tax_category_comes_from_the_catalogue_not_from_the_payload() {
        let out = sale(mismatching_category_input());
        let line = out.operations.iter().find(|o| o.command == "sales._insert_line").expect("line");
        assert_eq!(line.params["tax_rate"], json!(10.0), "the rate already comes from the catalogue");
        assert_eq!(line.params["tax_rule_id"], json!("r-10"));
        assert_eq!(
            line.params["tax_category_key"], json!("restaurant.food"),
            "the row froze the browser's category while charging the catalogue's rate"
        );
    }

    #[test]
    fn the_sale_completed_event_carries_the_resolved_tax_category() {
        // This is the payload `invoice` and VeriFactu build the document from: the label that
        // justifies the rate has to be the same one that produced it.
        let out = sale(mismatching_category_input());
        assert_eq!(out.events[0].name, "sale.completed");
        let item = &out.events[0].payload["items"][0];
        assert_eq!(item["tax_rate"], json!(10.0));
        assert_eq!(
            item["tax_category_key"], json!("restaurant.food"),
            "the event carried the browser's category to invoice and to the AEAT"
        );
    }

    #[test]
    fn an_unclassified_catalogue_product_freezes_NO_category_rather_than_the_claimed_one() {
        // Edge the fix makes explicit: the product IS in the catalogue but its row carries no tax
        // category. `resolve_line_tax` already ignored the payload's category for the RATE here
        // (it falls through to the open door of sales#63), so the row must say the same thing: no
        // rule (`tax_rule_id` NULL) and no category. Freezing the claimed label next to a rate no
        // category produced is the very contradiction sales#195 removes — and the browser is not
        // the authority that classifies a product.
        let out = sale(input_fiscal(
            json!([{ "product_id": "p-plain", "product_name": "Unclassified", "price": 1000,
                     "quantity": 1_000_000, "tax_category_key": "restaurant.food",
                     "tax_rate": 21.0 }]),
            json!([{ "id": "p-plain", "price": 1000, "cost": 0, "tax_category_key": "" }]),
            tax_catalog(),
        ));
        let line = out.operations.iter().find(|o| o.command == "sales._insert_line").expect("line");
        assert_eq!(line.params["tax_rule_id"], Value::Null);
        assert_eq!(line.params["tax_category_key"], json!(""));
        assert_eq!(out.events[0].payload["items"][0]["tax_category_key"], json!(""));
    }

    #[test]
    fn a_line_with_no_catalogue_still_freezes_the_category_it_was_given() {
        // Control: a service (or an open-price line) has no catalogue row `sales` can check it
        // against, so the payload's category is the only one there is — and freezing it is right.
        let out = sale(input_fiscal(
            json!([{ "product_name": "Haircut", "price": 1800, "quantity": 1_000_000,
                     "is_service": true, "tax_category_key": "service.generic" }]),
            product_catalog(),
            json!([{ "id": "r-svc", "country_code": "ES", "region_code": null,
                     "tax_category_key": "service.generic", "rate_pct": 21.0, "tax_type": "vat" }]),
        ));
        let line = out.operations.iter().find(|o| o.command == "sales._insert_line").expect("line");
        assert_eq!(line.params["tax_category_key"], json!("service.generic"));
        assert_eq!(line.params["tax_rate"], json!(21.0));
        assert_eq!(out.events[0].payload["items"][0]["tax_category_key"], json!("service.generic"));
    }
    #[test]
    fn a_catalogue_line_whose_category_has_no_rule_is_refused() {
        // Hub sin regla para esa categoría: cobrar el tipo que propone el cliente es exactamente
        // lo que hace que se cobre una cosa y se declare otra.
        let items = json!([{ "product_id": "p-wine", "product_name": "Vino", "price": 5000,
                             "quantity": 1_000_000, "tax_rate": 21.0 }]);
        // El catálogo fiscal EXISTE pero no cubre `product.generic` — que es el caso real: el hub
        // tiene sus reglas y a alguien le falta la de una categoría. Un catálogo VACÍO significa
        // otra cosa (que no ha llegado) y ahí se degrada a propósito.
        let otras_reglas = json!([{ "id": "r-es-food", "country_code": "ES", "region_code": null,
                                    "tax_category_key": "restaurant.food", "rate_pct": 10.0,
                                    "tax_type": "vat" }]);
        let err = complete_sale_pure(input_fiscal(items, product_catalog(), otras_reglas))
            .refused("sin regla aplicable no se cierra la venta");
        assert_eq!(err.code, "sales.no_tax_rule", "código inesperado: {err:?}");
    }

    // ── sales#21 · sin catálogo fiscal NO se cobra con el IVA del navegador ────────────────────
    //
    // Hasta hub#701 el runtime omitía EN SILENCIO una read que fallaba, así que un catálogo vacío
    // era indistinguible de «este hub no tiene reglas» y el handler degradaba al `tax_rate` del
    // payload. Desde hub#701 la read se declara `required` (module.json) y el runtime ABORTA el
    // command si no resuelve — así que aquí un catálogo vacío ya solo significa lo que dice: el
    // hub no tiene regla para esa categoría. Y una line con categoría que no resuelve se rechaza,
    // venga la categoría del catálogo o del payload (servicio, precio libre): cobrar el tipo que
    // propone el cliente es cobrar una cosa y declarar otra.

    #[test]
    fn a_catalogued_line_with_an_EMPTY_tax_catalogue_is_refused() {
        let items = json!([{ "product_id": "p-wine", "product_name": "Vino", "price": 5000,
                             "quantity": 1_000_000, "tax_rate": 21.0 }]);
        let err = complete_sale_pure(input_fiscal(items, product_catalog(), json!([])))
            .refused("catálogo fiscal vacío: no hay regla → no se cierra la venta");
        assert_eq!(err.code, "sales.no_tax_rule", "código inesperado: {err:?}");
    }

    #[test]
    fn a_catalogued_line_when_the_tax_read_never_arrived_is_refused() {
        // La read es `required`: un runtime que la honra nunca llega aquí sin ella. Si aun así
        // falta (runtime viejo), el handler cierra la puerta él mismo en vez de adivinar el IVA.
        let items = json!([{ "product_id": "p-wine", "product_name": "Vino", "price": 5000,
                             "quantity": 1_000_000, "tax_rate": 21.0 }]);
        let err = complete_sale_pure(input_fiscal(items, product_catalog(), Value::Null))
            .refused("sin la read fiscal no se cobra con la pista del cliente");
        assert_eq!(err.code, "sales.tax_catalog_unavailable", "código inesperado: {err:?}");
    }

    #[test]
    fn a_non_catalogue_line_whose_own_category_has_no_rule_is_refused() {
        // Servicio o precio libre: la categoría viene del payload (no hay fila de catálogo), pero
        // si NOMBRA una categoría, esa categoría tiene que resolver. El TPV ya deshabilita la
        // baldosa en este caso; el servidor no puede fiarse de eso.
        let items = json!([{ "product_name": "Corte", "price": 1800, "quantity": 1_000_000,
                             "is_service": true, "tax_category_key": "service.generic",
                             "tax_rate": 21.0 }]);
        let err = complete_sale_pure(input_fiscal(items, product_catalog(), tax_catalog()))
            .refused("service.generic no tiene regla en este catálogo");
        assert_eq!(err.code, "sales.no_tax_rule", "código inesperado: {err:?}");
    }

    #[test]
    fn a_free_line_still_falls_back_to_the_rate_it_was_given() {
        // Una línea sin producto no tiene categoría de catálogo que resolver. Sigue siendo la
        // puerta abierta (sales#63) y se deja explícita, no tapada.
        let items = json!([{ "product_name": "Varios", "price": 250, "quantity": 1_000_000,
                             "tax_rate": 21.0 }]);
        let out = complete_sale_pure(input_fiscal(items, product_catalog(), tax_catalog()))
            .accepted("una línea libre se sigue cobrando");
        let line = out.operations.iter().find(|o| o.command == "sales._insert_line").unwrap();
        assert_eq!(line.params["tax_rate"], json!(21.0));
    }

    /// The line a manipulated caller sends: the real product, at one cent.
    fn underpriced_line() -> Value {
        json!([{ "product_id": "p-wine", "product_name": "Botella de vino", "price": 1,
                 "quantity": 1_000_000, "tax_rate": 21.0 }])
    }

    // ── sales#68 · el PRECIO lo pone el catálogo, no el navegador ──────────────────────────────
    //
    // `complete_sale` cerraba la venta con el `price` del payload y solo comprobaba que no fuese
    // negativo. Una botella de 50 € se vendía por un céntimo y el hub la aceptaba entera: movía
    // stock, movía caja y emitía factura. El propio doc del handler decía «el cliente solo
    // PROPONE» — para el método de pago era verdad; para el precio, disponía.

    #[test]
    fn the_catalogue_price_wins_over_the_one_the_caller_sent() {
        // Con catálogo fiscal, porque desde sales#67 una línea de catálogo exige regla resuelta.
        let out = complete_sale_pure(input_fiscal(underpriced_line(), product_catalog(), tax_catalog()))
            .accepted("la venta se cierra");
        let line = out
            .operations
            .iter()
            .find(|o| o.command == "sales._insert_line")
            .expect("hay línea");
        assert_eq!(
            line.params["unit_price"], json!(5000),
            "el precio salió del payload (1 céntimo) en vez del catálogo (50,00 €)"
        );
    }

    #[test]
    fn a_line_naming_a_product_that_is_not_in_the_catalogue_is_refused() {
        let items = json!([{ "product_id": "p-inventado", "product_name": "X", "price": 100,
                             "quantity": 1_000_000, "tax_rate": 21.0 }]);
        let err = complete_sale_pure(input_with_products(items, 4, product_catalog()))
            .refused("un producto que no está en el catálogo no se vende");
        assert_eq!(err.code, "sales.product_not_available", "código inesperado: {err:?}");
    }

    #[test]
    fn without_the_catalogue_a_product_line_does_not_close_the_sale() {
        // La degradación que vale para el método de pago —«cobrar es lo último que puede
        // romperse»— aquí ES el agujero: aceptar el precio del caller para un producto que dice
        // ser del catálogo. Sin catálogo no hay nada contra lo que contrastar, así que no se cierra.
        let err = complete_sale_pure(input_with_products(underpriced_line(), 4, Value::Null))
            .refused("sin catálogo no se cierra una venta de catálogo");
        assert_eq!(err.code, "sales.catalog_unavailable", "código inesperado: {err:?}");
    }

    #[test]
    fn a_free_line_without_a_product_still_goes_through() {
        // Venta por departamento / precio libre: no dice ser de catálogo, así que el catálogo no
        // tiene nada que decir de ella. Es la única puerta que queda abierta, y es sales#63.
        let items = json!([{ "product_name": "Varios", "price": 250, "quantity": 1_000_000,
                             "tax_rate": 21.0 }]);
        let out = complete_sale_pure(input_with_products(items, 4, product_catalog()))
            .accepted("una línea libre se sigue pudiendo vender");
        let line = out.operations.iter().find(|o| o.command == "sales._insert_line").unwrap();
        assert_eq!(line.params["unit_price"], json!(250));
    }

    #[test]
    fn a_service_line_is_not_measured_against_the_product_catalogue() {
        // `sales` no puede leer `services.*` (no está en su `depends_on`), así que una línea de
        // servicio no tiene catálogo contra el que contrastarse. Rechazarla dejaría a la peluquería
        // sin poder cobrar. Queda fuera del alcance de esta issue, dicho a propósito.
        let items = json!([{ "product_id": "svc-1", "product_name": "Tinte", "price": 4500,
                             "quantity": 1_000_000, "tax_rate": 21.0, "is_service": true }]);
        let out = complete_sale_pure(input_with_products(items, 4, product_catalog()))
            .accepted("un servicio se cobra aunque no esté en el catálogo de productos");
        let line = out.operations.iter().find(|o| o.command == "sales._insert_line").unwrap();
        assert_eq!(line.params["unit_price"], json!(4500));
    }

    fn one_line() -> Value {
        json!([{ "product_name": "Menú", "price": 500, "quantity": 1_000_000, "tax_rate": 21.0 }])
    }

    #[test]
    fn a_sale_with_no_lines_is_rejected() {
        // An empty basket is not a sale: it used to be accepted and it still fired inventory,
        // cash register and invoice with a 0,00 € document.
        let err = complete_sale_pure(input(json!([]), 3, 0)).refused("a sale needs lines");
        assert_eq!(err.code, "sales.empty_sale", "{err:?}");
    }

    #[test]
    fn a_line_discount_out_of_range_is_rejected() {
        // 120 % off turns the line into a refund the cashier never authorised.
        let items = json!([{ "product_name": "Menú", "price": 500, "quantity": 1_000_000, "discount": 120.0 }]);
        let err = complete_sale_pure(input(items, 3, 0)).refused("discount > 100");
        assert_eq!(err.code, "sales.discount_out_of_range", "{err:?}");

        let items = json!([{ "product_name": "Menú", "price": 500, "quantity": 1_000_000, "discount": -5.0 }]);
        let err = complete_sale_pure(input(items, 3, 0)).refused("negative discount");
        assert_eq!(err.code, "sales.discount_out_of_range", "{err:?}");
    }

    #[test]
    fn a_sale_discount_out_of_range_is_rejected() {
        let mut inp = input(one_line(), 3, 0);
        inp["payload"]["discount_percent"] = json!(101.0);
        let err = complete_sale_pure(inp).refused("global discount > 100");
        assert_eq!(err.code, "sales.discount_out_of_range", "{err:?}");
    }

    // ── sales#113 · descuento de IMPORTE FIJO al ticket, repartido por RESTO MAYOR (ADR-0210) ──
    //
    // «5 € menos», «te lo dejo en 20 €»: estándar en Square, Toast, Lightspeed, Odoo (amount off).
    // Es el caso que obliga a REPARTIR: el importe se prorratea entre las líneas no invitadas por
    // resto mayor (Hamilton) en enteros — HALF_UP por línea NO vale (1,01 € entre 3 líneas → 1,02).
    // El desglose por tipo y el net/tax de cada línea salen YA descontados (misma garantía que
    // sales#33: la AEAT recibe lo cobrado). Se aplica DESPUÉS de los porcentuales.

    fn three_equal_lines() -> Value {
        json!([
            { "product_name": "A", "price": 100, "quantity": 1_000_000, "tax_rate": 21.0 },
            { "product_name": "B", "price": 100, "quantity": 1_000_000, "tax_rate": 21.0 },
            { "product_name": "C", "price": 100, "quantity": 1_000_000, "tax_rate": 21.0 }
        ])
    }

    #[test]
    fn a_fixed_amount_is_split_by_largest_remainder_and_the_header_carries_it_exactly() {
        let mut inp = input(three_equal_lines(), 5, 0);
        inp["payload"]["discount_amount"] = json!(101);
        let out = sale(inp);
        let lines: Vec<i64> = out.operations.iter().filter(|o| o.command == "sales._insert_line")
            .map(|o| o.params["line_total"].as_i64().unwrap()).collect();
        assert_eq!(lines, vec![66, 66, 67], "34+34+33 de descuento, no 3 × HALF_UP(33,67)");
        let h = &out.operations[1].params;
        assert_eq!(h["total"], json!(199));
        assert_eq!(h["discount_amount"], json!(101));
        // Base y cuota se declaran sobre lo cobrado. Desde sales#292 no es «±1 céntimo»: con el
        // IVA dentro del precio la cuota se cierra POR DIFERENCIA sobre el bruto del tipo
        // (ADR-0123 §4), así que lo declarado suma EXACTAMENTE lo cobrado — 1,99 € = base 1,64 +
        // cuota 0,35. Antes se declaraban 165 + 35 = 200 sobre un cobro de 199.
        let declared = h["subtotal"].as_i64().unwrap() + h["tax_amount"].as_i64().unwrap();
        assert_eq!(declared, 199, "lo declarado suma lo cobrado, sin tolerancia");
        assert_eq!(h["subtotal"], json!(164));
        assert_eq!(h["tax_amount"], json!(35));
    }

    #[test]
    fn a_gifted_line_receives_no_share_of_the_amount() {
        let items = json!([
            { "product_name": "A", "price": 100, "quantity": 1_000_000, "tax_rate": 21.0, "is_gift": true, "cost": 10 },
            { "product_name": "B", "price": 100, "quantity": 1_000_000, "tax_rate": 21.0 },
            { "product_name": "C", "price": 100, "quantity": 1_000_000, "tax_rate": 21.0 }
        ]);
        let mut inp = input(items, 5, 0);
        inp["payload"]["discount_amount"] = json!(50);
        let out = sale(inp);
        let lines: Vec<i64> = out.operations.iter().filter(|o| o.command == "sales._insert_line")
            .map(|o| o.params["line_total"].as_i64().unwrap()).collect();
        assert_eq!(lines, vec![0, 75, 75]);
        assert_eq!(out.operations[1].params["total"], json!(150));
    }

    #[test]
    fn the_amount_composes_after_the_percentages_and_the_event_lines_carry_the_discounted_figures() {
        // 2 × 10,00 € con 10 % de ticket = 18,00 €; menos 1,00 € fijo = 17,00 € (8,50 + 8,50).
        let items = json!([
            { "product_name": "A", "price": 1000, "quantity": 1_000_000, "tax_rate": 21.0 },
            { "product_name": "B", "price": 1000, "quantity": 1_000_000, "tax_rate": 21.0 }
        ]);
        let mut inp = input(items, 4, 0);
        inp["payload"]["discount_percent"] = json!(10.0);
        inp["payload"]["discount_amount"] = json!(100);
        let out = sale(inp);
        let h = &out.operations[1].params;
        assert_eq!(h["total"], json!(1700));
        assert_eq!(h["discount_amount"], json!(300), "2,00 € del 10 % + 1,00 € fijo");
        let ev = &out.events[0].payload;
        let ev_lines: i64 = ev["items"].as_array().unwrap().iter()
            .map(|it| it["net_amount"].as_i64().unwrap() + it["tax_amount"].as_i64().unwrap()).sum();
        assert_eq!(ev_lines, 1700, "el evento (lo que factura invoice) lleva lo cobrado");
    }

    #[test]
    fn a_fixed_amount_above_the_gross_is_refused_and_it_needs_discounts_allowed() {
        let mut inp = input(three_equal_lines(), 5, 0);
        inp["payload"]["discount_amount"] = json!(301);
        let err = complete_sale_pure(inp).refused("más descuento que venta");
        assert_eq!(err.code, "sales.discount_out_of_range", "{err:?}");

        let mut inp = input_with_catalogs(three_equal_lines(), 5, Value::Null, json!([{ "allow_discounts": 0 }]), Value::Null);
        inp["payload"]["discount_amount"] = json!(10);
        let err = complete_sale_pure(inp).refused("descuentos apagados");
        assert_eq!(err.code, "sales.discounts_not_allowed", "{err:?}");
    }

    #[test]
    fn a_discount_above_the_shops_cap_needs_the_managers_door() {
        // sales#269 — a 100 % discount used to be one tap away for anybody who could charge: the
        // only lever was `allow_discounts`, all-or-nothing. The shop now says «up to 10 % is the
        // cashier's; above that, the manager authorises it». The cap is enforced HERE because the
        // till is not the authority — a payload that never went through the screen must hit the
        // same wall. Toast, Square and Lightspeed all gate the discount the same way.
        let capped = json!([{ "max_discount_percent": 10 }]);

        // The TICKET percentage.
        let mut inp = input_with_catalogs(three_equal_lines(), 5, Value::Null, capped.clone(), Value::Null);
        inp["payload"]["discount_percent"] = json!(90);
        let err = complete_sale_pure(inp.clone()).refused("90 % con el tope en 10");
        assert_eq!(err.code, "sales.discount_over_limit", "{err:?}");

        // The very SAME sale through the manager's door goes through: that is what the PIN buys.
        complete_sale_over_limit_pure(inp).accepted("el encargado lo autorizó");

        // A LINE percentage is the same lever with another name: capping only the ticket would
        // leave «90 % en cada línea» as the way around it.
        let mut inp = input_with_catalogs(three_equal_lines(), 5, Value::Null, capped.clone(), Value::Null);
        inp["payload"]["items"][0]["discount"] = json!(90);
        let err = complete_sale_pure(inp).refused("90 % en una línea");
        assert_eq!(err.code, "sales.discount_over_limit", "{err:?}");

        // And so is a FIXED amount (sales#113): 3,00 € of gross with the cap at 10 % buys 30
        // cents. Without this, «2,00 € de descuento» would walk straight past a percentage cap.
        let mut inp = input_with_catalogs(three_equal_lines(), 5, Value::Null, capped.clone(), Value::Null);
        inp["payload"]["discount_amount"] = json!(200);
        let err = complete_sale_pure(inp).refused("2,00 € de 3,00 € con el tope en 10 %");
        assert_eq!(err.code, "sales.discount_over_limit", "{err:?}");

        let mut inp = input_with_catalogs(three_equal_lines(), 5, Value::Null, capped, Value::Null);
        inp["payload"]["discount_amount"] = json!(30);
        complete_sale_pure(inp).accepted("30 céntimos de 3,00 € son el 10 % justo: es del cajero");
    }

    #[test]
    fn a_shop_that_never_set_a_cap_sees_no_change_when_it_updates() {
        // The column ships `DEFAULT 100` and the schema's default is 100 on purpose: updating the
        // module cannot start asking for a PIN in a salon that never configured anything.
        let mut inp = input_with_catalogs(three_equal_lines(), 5, Value::Null, Value::Null, Value::Null);
        inp["payload"]["discount_percent"] = json!(100);
        complete_sale_pure(inp).accepted("sin fila de ajustes, el 100 % sigue pasando");

        let settings = json!([{ "max_discount_percent": 100 }]);
        let mut inp = input_with_catalogs(three_equal_lines(), 5, Value::Null, settings, Value::Null);
        inp["payload"]["discount_percent"] = json!(100);
        complete_sale_pure(inp).accepted("tope al 100 % = exactamente como hoy");
    }

    #[test]
    fn a_negative_amount_is_rejected() {
        // Money is unsigned in a sale: a negative price or cost is a refund, and refunds have
        // their own flow. Belt and braces with the JSON Schema (`minimum: 0`).
        let items = json!([{ "product_name": "Menú", "price": -500, "quantity": 1_000_000 }]);
        let err = complete_sale_pure(input(items, 3, 0)).refused("negative price");
        assert_eq!(err.code, "sales.amount_negative", "{err:?}");

        let items = json!([{ "product_name": "Menú", "price": 500, "quantity": 1_000_000, "cost": -1 }]);
        let err = complete_sale_pure(input(items, 3, 0)).refused("negative cost");
        assert_eq!(err.code, "sales.amount_negative", "{err:?}");

        let mut inp = input(one_line(), 3, 0);
        inp["payload"]["amount_tendered"] = json!(-100);
        let err = complete_sale_pure(inp).refused("negative tendered");
        assert_eq!(err.code, "sales.amount_negative", "{err:?}");
    }

    #[test]
    fn cash_tendered_below_the_total_is_rejected() {
        // sales#24 — a cash sale where the customer handed over LESS than the total used to close
        // anyway, with `change = 0` and the drawer silently short. The server is the authority on
        // the total (ADR-0085), so it is the server that refuses: 5,00 € due, 1,00 € tendered.
        let items = json!([{ "product_name": "Menú", "price": 500, "quantity": 1_000_000, "tax_rate": 21.0 }]);
        let err = complete_sale_pure(input(items, 3, 100)).refused("tendered below total");
        assert_eq!(err.code, "sales.insufficient_tendered", "{err:?}");
    }

    #[test]
    fn tendered_equal_or_above_the_total_still_closes_and_omitted_tendered_means_exact() {
        // Exact amount, more than due (change), and the legacy «not stated» (0 — integrations that
        // never send `amount_tendered`) all keep working: only a POSITIVE amount below the total is
        // a short payment. The touch POS never sends 0: an empty numpad becomes the payable.
        let items = || json!([{ "product_name": "Menú", "price": 500, "quantity": 1_000_000, "tax_rate": 21.0 }]);
        let exact = sale(input(items(), 3, 500));
        assert_eq!(exact.operations[1].params["change_due"], json!(0));
        let over = sale(input(items(), 3, 1000));
        assert_eq!(over.operations[1].params["change_due"], json!(500));
        let unstated = sale(input(items(), 3, 0));
        assert_eq!(unstated.operations[1].params["change_due"], json!(0));
        // «No indicado» = importe exacto: la cabecera y el tique dicen lo que se pagó (el total), no 0.
        assert_eq!(unstated.operations[1].params["amount_tendered"], json!(500));
        let mut omitted = input(items(), 3, 0);
        omitted["payload"].as_object_mut().unwrap().remove("amount_tendered");
        let out = sale(omitted);
        assert_eq!(out.operations[1].params["amount_tendered"], json!(500));
        assert_eq!(out.operations[1].params["change_due"], json!(0));
    }

    #[test]
    fn the_server_stamps_the_status_and_ignores_the_one_sent_by_the_caller() {
        // The caller used to pick the status while the handler always emitted `sale.completed`:
        // a sale could sit in the ledger as `draft` and still move stock, cash and invoicing.
        let mut inp = input(one_line(), 3, 500);
        inp["payload"]["status"] = json!("draft");
        let out = sale(inp);
        let header = out.operations.iter().find(|o| o.command == "sales._insert_sale").expect("header");
        assert_eq!(header.params["status"], json!("completed"));
    }

    #[test]
    fn a_payment_method_outside_the_trusted_catalog_is_rejected() {
        // The browser could name any id — including a deleted or deactivated method, or one
        // belonging to another hub. The catalog the runtime pre-loads is the only authority.
        let mut inp = input_with_catalogs(one_line(), 3, cash_catalog(), Value::Null, Value::Null);
        inp["payload"]["payment_method_id"] = json!("pm-ghost");
        let err = complete_sale_pure(inp).refused("unknown payment method");
        assert_eq!(err.code, "sales.payment_method_not_available", "{err:?}");
    }

    #[test]
    fn a_sale_without_payment_method_is_rejected_when_the_hub_has_a_catalog() {
        let mut inp = input_with_catalogs(one_line(), 3, cash_catalog(), Value::Null, Value::Null);
        inp["payload"]["payment_method_id"] = Value::Null;
        let err = complete_sale_pure(inp).refused("no payment method");
        assert_eq!(err.code, "sales.payment_method_required", "{err:?}");
    }

    #[test]
    fn the_payment_method_name_is_taken_from_the_catalog_not_from_the_payload() {
        // The receipt (and the cash-register breakdown) must say what the hub configured, not
        // whatever label the browser felt like sending.
        let mut inp = input_with_catalogs(one_line(), 3, cash_catalog(), Value::Null, Value::Null);
        inp["payload"]["payment_method_name"] = json!("Free beer");
        let out = sale(inp);
        let header = out.operations.iter().find(|o| o.command == "sales._insert_sale").expect("header");
        assert_eq!(header.params["payment_method_name"], json!("Cash"));
        let event = out.events.iter().find(|e| e.name == "sale.completed").expect("event");
        assert_eq!(event.payload["payment_method_name"], json!("Cash"));
    }

    #[test]
    fn the_payment_method_type_travels_in_the_event_from_the_catalog() {
        // hub#778: the cash drawer must key on the canonical TYPE, not on the localized NAME.
        // A Spanish hub labels cash "Efectivo"; the drawer compares against "cash". The event
        // carries the TYPE read from the catalog so the consumer never has to guess the name.
        let catalog = json!([{ "id": "pm-1", "name": "Efectivo", "type": "cash" }]);
        let inp = input_with_catalogs(one_line(), 3, catalog, Value::Null, Value::Null);
        let out = sale(inp);
        let event = out.events.iter().find(|e| e.name == "sale.completed").expect("event");
        assert_eq!(event.payload["payment_method_name"], json!("Efectivo"));
        assert_eq!(event.payload["payment_method_type"], json!("cash"));
    }

    #[test]
    fn a_card_payment_carries_its_type_so_the_drawer_excludes_it() {
        // The regression that started this: card sales counted as cash because the drawer
        // could not tell them apart. With the TYPE in the event, cash_register knows a "card"
        // sale does NOT go into the expected drawer total.
        let catalog = json!([
            { "id": "pm-1", "name": "Efectivo", "type": "cash" },
            { "id": "pm-2", "name": "Tarjeta", "type": "card" }
        ]);
        let mut inp = input_with_catalogs(one_line(), 3, catalog, Value::Null, Value::Null);
        inp["payload"]["payment_method_id"] = json!("pm-2");
        let out = sale(inp);
        let event = out.events.iter().find(|e| e.name == "sale.completed").expect("event");
        assert_eq!(event.payload["payment_method_type"], json!("card"));
    }

    #[test]
    fn without_a_catalog_the_payment_method_type_defaults_to_cash() {
        // Graceful degradation: without the catalog the TYPE is unknown, so we assume "cash"
        // (the column default) — the least damaging guess for the drawer, and a hub with no
        // payment methods seeded cannot produce a valid sale here anyway.
        let out = sale(input(one_line(), 3, 500));
        let event = out.events.iter().find(|e| e.name == "sale.completed").expect("event");
        assert_eq!(event.payload["payment_method_type"], json!("cash"));
    }

    #[test]
    fn without_a_catalog_the_payload_name_still_works() {
        // Graceful degradation (same rule as the tax catalog): a runtime that does not deliver
        // `reads`, or a hub with no payment methods yet, must still be able to charge.
        let out = sale(input(one_line(), 3, 500));
        let header = out.operations.iter().find(|o| o.command == "sales._insert_sale").expect("header");
        assert_eq!(header.params["payment_method_name"], json!("Efectivo"));
    }

    #[test]
    fn discounts_are_rejected_when_the_hub_switched_them_off() {
        // `allow_discounts` was enforced in the UI only: hiding the button is not a rule.
        let settings = json!([{ "allow_discounts": 0, "require_customer": 0 }]);
        let items = json!([{ "product_name": "Menú", "price": 500, "quantity": 1_000_000, "discount": 10.0 }]);
        let inp = input_with_catalogs(items, 3, cash_catalog(), settings, Value::Null);
        let err = complete_sale_pure(inp).refused("discounts disabled");
        assert_eq!(err.code, "sales.discounts_not_allowed", "{err:?}");
    }

    #[test]
    fn a_sale_without_customer_is_rejected_when_the_hub_requires_one() {
        let settings = json!([{ "allow_discounts": 1, "require_customer": 1 }]);
        let inp = input_with_catalogs(one_line(), 3, cash_catalog(), settings, Value::Null);
        let err = complete_sale_pure(inp).refused("customer required");
        assert_eq!(err.code, "sales.customer_required", "{err:?}");
    }

    /// A payload asking for a complete invoice, with the recipient the till snapshots (ADR-0132).
    fn invoice_input(name: &str, tax_id: &str, address: &str) -> Value {
        let mut inp = input(one_line(), 3, 500);
        inp["payload"]["document_type"] = json!("invoice");
        inp["payload"]["customer_name"] = json!(name);
        inp["payload"]["customer_tax_id"] = json!(tax_id);
        inp["payload"]["customer_address"] = json!(address);
        inp
    }

    #[test]
    fn an_invoice_made_out_to_nobody_is_refused_before_the_number_is_spent() {
        // sales#317 — the till charged «Factura» with no customer: the screen handed over a
        // «FACTURA» to «Cliente» and VeriFactu filed an F2 (`resolve_invoice_type` downgrades an F1
        // without a recipient). The till now asks; this is the lock for every other door (the API,
        // the assistant): a complete invoice needs name, tax ID and address (art. 6 RD 1619/2012),
        // the same three the simplified-invoice ceiling asks for.
        for (missing, inp) in [
            ("all", invoice_input("", "", "")),
            ("name", invoice_input("", "12345678Z", "C/ Mayor 1")),
            ("tax id", invoice_input("Ana López", "", "C/ Mayor 1")),
            ("address", invoice_input("Ana López", "12345678Z", "")),
            ("blank tax id", invoice_input("Ana López", "   ", "C/ Mayor 1")),
        ] {
            let err = complete_sale_pure(inp.clone()).refused(missing);
            assert_eq!(err.code, "sales.invoice_recipient_incomplete", "missing {missing}: {err:?}");
            // The manager's door charges the SAME sale: it lifts the discount cap, not the law.
            let err = complete_sale_over_limit_pure(inp).refused(missing);
            assert_eq!(err.code, "sales.invoice_recipient_incomplete", "over-limit door, missing {missing}: {err:?}");
        }
    }

    #[test]
    fn an_invoice_with_its_recipient_and_a_plain_ticket_go_through() {
        let out = complete_sale_pure(invoice_input("Ana López", "12345678Z", "C/ Mayor 1, Madrid"))
            .accepted("complete invoice");
        assert_eq!(out.events[0].payload["document_type"], json!("invoice"));
        assert_eq!(out.events[0].payload["customer_tax_id"], json!("12345678Z"));

        // A ticket needs no recipient at all: the counter's everyday sale must not notice this.
        let mut inp = invoice_input("", "", "");
        inp["payload"]["document_type"] = json!("ticket");
        complete_sale_pure(inp).accepted("anonymous ticket");
    }

    #[test]
    fn the_settings_gate_lets_a_compliant_sale_through() {
        let settings = json!([{ "allow_discounts": 1, "require_customer": 1 }]);
        let mut inp = input_with_catalogs(one_line(), 3, cash_catalog(), settings, Value::Null);
        inp["payload"]["customer_id"] = json!("c-1");
        let out = sale(inp);
        assert!(out.operations.iter().any(|o| o.command == "sales._insert_sale"));
        assert!(out.events.iter().any(|e| e.name == "sale.completed"));
    }

    #[test]
    fn the_tax_basis_comes_from_the_hub_settings_not_from_the_payload() {
        // ADR-0210: whether a price already carries the tax is a decision of the BUSINESS, and it
        // decides what gets DECLARED — the same 100,00 € is base 100 + 21 of quota when prices are
        // net, and base 82,64 + 17,36 when they are gross. Letting the request flip it handed the
        // browser the taxable base of the invoice.
        let settings = json!([{ "default_tax_included": 0 }]);
        let items = json!([{ "product_name": "Café", "price": 10000, "quantity": 1_000_000, "tax_rate": 21.0 }]);
        let mut inp = input_with_catalogs(items, 3, cash_catalog(), settings, Value::Null);
        inp["payload"]["tax_included"] = json!(true); // the browser says gross; the hub says net
        let out = sale(inp);
        let line = &out.operations.iter().find(|o| o.command == "sales._insert_line").expect("line").params;
        assert_eq!(line["net_amount"], json!(10000));
        assert_eq!(line["tax_amount"], json!(2100));
    }

    #[test]
    fn without_a_settings_row_the_payload_basis_still_applies() {
        // A brand new hub has no settings row yet, and an old runtime delivers no reads at all:
        // in both cases the payload keeps deciding, exactly like today. `input()` says gross.
        let items = json!([{ "product_name": "Café", "price": 10000, "quantity": 1_000_000, "tax_rate": 21.0 }]);
        let out = sale(input(items, 3, 0));
        let line = &out.operations.iter().find(|o| o.command == "sales._insert_line").expect("line").params;
        // Gross 100,00 € at 21 %: base 82,64 € and the quota that is LEFT, so the breakdown adds
        // up to what the customer actually paid. sales#124 — this used to assert 1735, the quota
        // recomputed from the base (`round(8264 * 0.21)`), which declared 82,64 + 17,35 = 99,99 €
        // on a 100,00 € charge. One cent short of the money taken, and that gap travelled to the
        // printed receipt, to the invoice and to the AEAT `CuotaTotal`.
        assert_eq!(line["net_amount"], json!(8264));
        assert_eq!(line["tax_amount"], json!(1736));
        assert_eq!(
            line["net_amount"].as_i64().unwrap() + line["tax_amount"].as_i64().unwrap(),
            10000,
            "base + quota must equal the gross charged"
        );
    }

    #[test]
    fn the_idempotency_key_is_mandatory() {
        let mut inp = input(one_line(), 3, 0);
        inp["payload"]["idempotency_key"] = json!("");
        let err = complete_sale_pure(inp).refused("no idempotency key");
        assert_eq!(err.code, "sales.idempotency_key_required", "{err:?}");
    }

    #[test]
    fn the_idempotency_key_is_frozen_on_the_sale_header() {
        // The unique index on (hub_id, idempotency_key) is what makes a concurrent double submit
        // impossible; the key has to reach the row for that index to mean anything.
        let out = sale(input(one_line(), 3, 500));
        let header = out.operations.iter().find(|o| o.command == "sales._insert_sale").expect("header");
        assert_eq!(header.params["idempotency_key"], json!("idem-test-0001"));
    }

    #[test]
    fn replaying_an_idempotency_key_writes_nothing_and_emits_nothing() {
        // A network retry of a checkout that DID land must not duplicate the sale, the stock
        // movement, the cash entry or the invoice. The probe read tells the handler it already
        // happened, so it returns an empty output: no operations, no events.
        let already = json!([{ "id": "sale-existing", "sale_number": "20260531-0001" }]);
        let inp = input_with_catalogs(one_line(), 3, cash_catalog(), Value::Null, already);
        let out = sale(inp);
        assert!(out.operations.is_empty(), "a replay writes nothing: {:?}", out.operations);
        assert!(out.events.is_empty(), "a replay emits nothing: {:?}", out.events.len());
    }

    #[test]
    fn a_first_attempt_with_an_unused_key_goes_through() {
        // The probe read exists but comes back empty: this key has never been charged.
        let inp = input_with_catalogs(one_line(), 3, cash_catalog(), Value::Null, json!([]));
        let out = sale(inp);
        assert!(out.operations.iter().any(|o| o.command == "sales._insert_sale"));
        assert!(out.events.iter().any(|e| e.name == "sale.completed"));
    }

    #[test]
    fn the_probe_read_is_also_understood_in_its_paginated_shape() {
        // Same defensive unwrapping as the tax catalog: `[…]` or `{"rows": […]}`.
        let already = json!({ "rows": [{ "id": "sale-existing" }] });
        let inp = input_with_catalogs(one_line(), 3, cash_catalog(), Value::Null, already);
        let out = sale(inp);
        assert!(out.operations.is_empty());
        assert!(out.events.is_empty());
    }

    // ── El contrato COMPARTIDO de la regla (hub#295) ──────────────────────────
    //
    // The same fixture is replayed by `taxes` (the `taxes.calculate` contract) and by `invoice`
    // (what is DECLARED). The three entry points resolve it through `erplora_guest_sdk::tax`, so
    // what is CHARGED here and what is declared there cannot drift apart any more.

    /// The catalog the three entry points share in their tests (hub#295).
    fn shared_fixture_rules() -> Value {
        json!([
            {"id": "es-vat-21", "country_code": "ES", "region_code": null, "tax_category_key": "standard",
             "rate_pct": 21.0, "tax_type": "vat", "parent_id": null, "valid_from": "2012-09-01"},
            {"id": "es-vat-21-surcharge", "parent_id": "es-vat-21", "country_code": "ES", "region_code": null,
             "tax_category_key": "standard", "rate_pct": 5.2, "tax_type": "surcharge"},
            {"id": "es-cn-igic-7", "country_code": "ES", "region_code": "CN", "tax_category_key": "standard",
             "rate_pct": 7.0, "tax_type": "IGIC", "parent_id": null},
            {"id": "es-vat-10", "country_code": "ES", "region_code": null, "tax_category_key": "restaurant.food",
             "rate_pct": 10.0, "tax_type": "vat", "parent_id": null},
            {"id": "es-exempt-health", "country_code": "ES", "region_code": null,
             "tax_category_key": "health.treatment", "rate_pct": 0.0, "tax_type": "vat", "parent_id": null,
             "operation_class": "exempt", "exempt_reason": "e1"},
            {"id": "es-broken-class", "country_code": "ES", "region_code": null,
             "tax_category_key": "broken.class", "rate_pct": 21.0, "tax_type": "vat", "parent_id": null,
             "operation_class": "exent"}
        ])
    }

    /// Charges one 100,00 € net line of `category` in `region` against the shared fixture and
    /// returns the line params (`tax_rate`, `tax_amount`, `tax_rule_id`, …).
    fn shared_charge(category: &str, region: &str) -> Value {
        let items = json!([
            { "product_name": "Item", "price": 10000, "quantity": 1_000_000,
              "tax_category_key": category, "tax_rate": 99.0 }
        ]);
        let out = sale(input_with_rules(items, 4, shared_fixture_rules(), "array", "ES", region));
        out.operations[2].params.clone().into()
    }

    #[test]
    fn the_shared_fixture_charges_what_the_other_entry_points_declare() {
        let peninsula = shared_charge("standard", "MD");
        assert_eq!(peninsula["tax_rate"], json!(26.2), "the surcharge rides on the root rule");
        assert_eq!(peninsula["tax_amount"], json!(2620));
        assert_eq!(peninsula["tax_rule_id"], json!("es-vat-21"));

        let canaries = shared_charge("standard", "CN");
        assert_eq!(canaries["tax_rate"], json!(7.0), "the region rule wins");
        assert_eq!(canaries["tax_rule_id"], json!("es-cn-igic-7"));

        let reduced = shared_charge("restaurant.food", "MD");
        assert_eq!(reduced["tax_rate"], json!(10.0));
        assert_eq!(reduced["tax_amount"], json!(1000));

        let exempt = shared_charge("health.treatment", "MD");
        assert_eq!(exempt["tax_rate"], json!(0.0));
        assert_eq!(exempt["tax_amount"], json!(0));

        let broken = shared_charge("broken.class", "MD");
        assert_eq!(broken["tax_rate"], json!(21.0), "a broken qualification still charges its rate");
    }

    #[test]
    fn a_rule_catalog_delivered_under_the_alias_read_is_honoured() {
        // `taxes.rules.by_country` is a real query of the `taxes` module. `taxes.calculate` read
        // it; `sales` only looked at `taxes.rules.list`, so the very same pre-load left the
        // checkout charging the client's hint while `taxes.calculate` charged the rule.
        let items = json!([
            { "product_name": "Item", "price": 10000, "quantity": 1_000_000,
              "tax_category_key": "standard", "tax_rate": 99.0 }
        ]);
        let mut inp = input_with_rules(items, 4, json!([]), "array", "ES", "MD");
        inp["context"]["reads"] = json!({ "taxes.rules.by_country": shared_fixture_rules() });
        let out = sale(inp);
        let line = &out.operations[2].params;
        assert_eq!(line["tax_rule_id"], json!("es-vat-21"));
        assert_eq!(line["tax_rate"], json!(26.2));
    }

    // ── pm#93 · suplementos: el precio lo pone el CATÁLOGO, nunca el cliente ─────────────────

    /// Catálogo de opciones tal como lo entrega `modifiers.options.all` (lectura OPCIONAL).
    fn con_suplementos(mut inp: Value, catalogo: Value) -> Value {
        inp["context"]["reads"] = json!({ "modifiers.options.all": catalogo });
        inp
    }

    fn catalogo_queso() -> Value {
        json!([{ "option_id": "o-queso", "group_id": "g-extras", "name": "Extra de queso",
                 "kitchen_name": "+QUESO", "price_delta": 100, "tax_category_key": null }])
    }

    #[test]
    fn un_suplemento_suma_su_delta_al_importe_de_la_linea() {
        // «+queso +1 €» sobre una hamburguesa de 5 €: se cobran 6 €. El delta entra por el precio
        // unitario, así que TODA la maquinaria de ADR-0147/0123 (punto fijo, HALF_UP, un redondeo
        // por importe) sigue siendo la misma — no hay una segunda ruta del dinero que mantener.
        let inp = con_suplementos(
            input(json!([{ "product_name": "Hamburguesa", "price": 500, "quantity": 1_000_000,
                           "tax_rate": 10.0, "modifiers": [{ "option_id": "o-queso" }] }]), 3, 600),
            catalogo_queso(),
        );
        let out = sale(inp);
        let line = out.operations.iter().find(|o| o.command == "sales._insert_line").expect("línea");
        assert_eq!(line.params["line_total"], json!(600), "5 € + 1 € de suplemento");
    }

    #[test]
    fn el_snapshot_del_suplemento_viaja_a_la_linea() {
        // Congelado como la factura (ADR-0140): cambiar el catálogo mañana no reescribe la comanda
        // de ayer. Y viaja el nombre de COCINA, que es el que se imprime.
        let inp = con_suplementos(
            input(json!([{ "product_name": "Hamburguesa", "price": 500, "quantity": 1_000_000,
                           "tax_rate": 10.0, "modifiers": [{ "option_id": "o-queso" }] }]), 3, 600),
            catalogo_queso(),
        );
        let out = sale(inp);
        let line = out.operations.iter().find(|o| o.command == "sales._insert_line").expect("línea");
        let snap: Value = serde_json::from_str(line.params["modifiers"].as_str().expect("TEXT"))
            .expect("JSON");
        assert_eq!(snap[0]["option_id"], json!("o-queso"));
        assert_eq!(snap[0]["kitchen_name"], json!("+QUESO"));
        assert_eq!(snap[0]["price_delta"], json!(100));
    }

    #[test]
    fn el_price_delta_QUE_MANDA_EL_CLIENTE_se_ignora() {
        // El agujero que esto cierra: mandar `price_delta: -500` para pagar menos. El precio sale
        // del catálogo, igual que el del producto («el del payload es una propuesta, no un hecho»).
        let inp = con_suplementos(
            input(json!([{ "product_name": "Hamburguesa", "price": 500, "quantity": 1_000_000,
                           "tax_rate": 10.0,
                           "modifiers": [{ "option_id": "o-queso", "price_delta": -500 }] }]), 3, 600),
            catalogo_queso(),
        );
        let out = sale(inp);
        let line = out.operations.iter().find(|o| o.command == "sales._insert_line").expect("línea");
        assert_eq!(line.params["line_total"], json!(600), "manda el catálogo, no el payload");
    }

    #[test]
    fn un_suplemento_que_no_esta_en_el_catalogo_RECHAZA_la_venta() {
        let inp = con_suplementos(
            input(json!([{ "product_name": "Hamburguesa", "price": 500, "quantity": 1_000_000,
                           "tax_rate": 10.0, "modifiers": [{ "option_id": "o-inventado" }] }]), 3, 600),
            catalogo_queso(),
        );
        let err = complete_sale_pure(inp).refused("debe rechazar");
        assert_eq!(err.code, "sales.modifier_not_available", "código de dominio estable: {err:?}");
    }

    #[test]
    fn sin_el_modulo_instalado_una_linea_con_suplementos_se_RECHAZA() {
        // FALLA CERRADO. Si `modifiers` no está, la lectura no llega y NO hay forma de verificar el
        // importe — cobrar «confiando» sería el agujero por la puerta de atrás. Una línea SIN
        // suplementos sigue cobrándose igual (lo fija el test de abajo).
        let inp = input(json!([{ "product_name": "Hamburguesa", "price": 500, "quantity": 1_000_000,
                                 "tax_rate": 10.0, "modifiers": [{ "option_id": "o-queso" }] }]), 3, 600);
        let err = complete_sale_pure(inp).refused("debe rechazar");
        assert_eq!(err.code, "sales.modifier_catalog_unavailable", "código estable: {err:?}");
    }

    #[test]
    fn una_linea_SIN_suplementos_no_cambia_en_nada() {
        // Control: sin `modifiers` no hace falta el catálogo, no hay rechazo y el importe es el de
        // siempre. Si este test se pusiera rojo, el arreglo habría roto el 100 % de las ventas.
        let out = sale(input(json!([{ "product_name": "Hamburguesa", "price": 500,
                                      "quantity": 1_000_000, "tax_rate": 10.0 }]), 3, 500));
        let line = out.operations.iter().find(|o| o.command == "sales._insert_line").expect("línea");
        assert_eq!(line.params["line_total"], json!(500));
        assert_eq!(line.params["modifiers"], json!("[]"), "sin suplementos, snapshot vacío");
    }

    // ── sales#147 · a supplement that taxes DIFFERENTLY becomes ITS OWN LINE ──────────────────

    /// An option of `modifiers.options.all` carrying whatever tax category it is given
    /// (`Value::Null` = it inherits its line's, which is the case for the vast majority).
    fn drink_option(tax_category_key: Value) -> Value {
        json!([{ "option_id": "o-refresco", "group_id": "g-bebida", "name": "Refresco",
                 "kitchen_name": "+REFRESCO", "price_delta": 200,
                 "tax_category_key": tax_category_key }])
    }

    /// The trusted tax catalogue of these cases: the menu at 10 %, the drink at 21 % (ADR-0085).
    fn menu_tax_rules() -> Value {
        json!([
            { "id": "r-es-10", "country_code": "ES", "region_code": null,
              "tax_category_key": "restaurant.food", "rate_pct": 10.0, "tax_type": "vat" },
            { "id": "r-es-21", "country_code": "ES", "region_code": null,
              "tax_category_key": "product.generic", "rate_pct": 21.0, "tax_type": "vat" }
        ])
    }

    /// A 10,00 € set menu from the catalogue (`restaurant.food`) with a 2,00 € soft drink on it.
    /// The OPTION's category is the only thing that changes between the cases below.
    fn menu_with_drink(option_tax_category: Value) -> Value {
        menu_with_drink_qty(option_tax_category, 1_000_000, 5)
    }

    /// The same menu with an arbitrary quantity and id budget: a promoted supplement needs one id
    /// MORE than the lines the payload names.
    fn menu_with_drink_qty(option_tax_category: Value, qty: i64, ids: usize) -> Value {
        let mut inp = con_suplementos(
            input(json!([{ "product_id": "p-menu", "product_name": "Menú del día",
                           "quantity": qty, "tax_rate": 10.0,
                           "modifiers": [{ "option_id": "o-refresco" }] }]), ids, 0),
            drink_option(option_tax_category),
        );
        inp["context"]["reads"]["inventory.products.for_sale"] =
            json!([{ "id": "p-menu", "price": 1000, "cost": 0,
                     "tax_category_key": "restaurant.food" }]);
        inp["context"]["reads"]["taxes.rules.list"] = menu_tax_rules();
        inp["context"]["country_code"] = json!("ES");
        inp
    }

    #[test]
    fn a_supplement_with_a_TAX_CATEGORY_OF_ITS_OWN_gets_a_LINE_OF_ITS_OWN() {
        // 🔴 The hole sales#147 closes: the 21 % drink inside a 10 % menu was folded into the
        // parent's `unit_price` and INHERITED its rate — a wrongly broken down invoice, in silence.
        // Part 1 refused the sale; this is part 2, the line that lets it be charged RIGHT: two rows,
        // each with its own rate, and base + quota adding up to the cent on both.
        let out = sale(menu_with_drink(json!("product.generic")));
        let lines = sale_lines(&out);
        assert_eq!(lines.len(), 2, "the menu and its drink are two rows: {lines:?}");

        assert_eq!(lines[0]["unit_price"], json!(1000), "the parent keeps the CATALOGUE price");
        assert_eq!(lines[0]["tax_rate"], json!(10.0));
        assert_eq!(lines[0]["net_amount"], json!(909));
        assert_eq!(lines[0]["tax_amount"], json!(91)); // 909 + 91 = 1000, tax-included
        assert_eq!(lines[0]["line_total"], json!(1000));
        assert_eq!(lines[0]["parent_line_ref"], Value::Null, "a parent hangs from nobody");

        assert_eq!(lines[1]["unit_price"], json!(200), "the catalogue's FROZEN delta");
        assert_eq!(lines[1]["tax_rate"], json!(21.0));
        assert_eq!(lines[1]["tax_category_key"], json!("product.generic"));
        assert_eq!(lines[1]["net_amount"], json!(165));
        assert_eq!(lines[1]["tax_amount"], json!(35)); // 165 + 35 = 200
        assert_eq!(lines[1]["line_total"], json!(200));
        assert_eq!(lines[1]["product_name"], json!("Refresco"), "the option is what is read");
        assert_eq!(lines[1]["product_id"], Value::Null, "an option is not an article");
        // The link: the child names the ROW it hangs from, so the paper can print it underneath and
        // a report can put the two together without depending on row order — every line of a sale
        // shares `created_at`, so ordering by it is a tie, not an answer.
        assert_eq!(lines[1]["parent_line_ref"], lines[0]["line_id"]);
        // Not a set menu: `combo_group_ref` groups SIBLINGS with no parent (ADR-0381) and this is
        // the opposite relation. Overloading it would make one column mean two things.
        assert_eq!(lines[1]["combo_group_ref"], Value::Null);

        let ev = out.events.first().expect("sale.completed");
        assert_eq!(ev.payload["total"], json!(1200));
        assert_eq!(ev.payload["items_count"], json!(2), "the event carries BOTH lines");
        assert_eq!(ev.payload["items"][1]["parent_line_ref"], lines[0]["line_id"]);

        // The declared breakdown: TWO bases, each squaring with its own rate (ADR-0123 §4). This is
        // what reaches VeriFactu, and it is the whole point of the child line.
        let header = &out.operations[1].params;
        let bd: Value = serde_json::from_str(header["tax_breakdown"].as_str().expect("TEXT")).unwrap();
        assert_eq!(bd["10.00"]["base"], json!(909));
        assert_eq!(bd["10.00"]["tax"], json!(91));
        assert_eq!(bd["21.00"]["base"], json!(165));
        assert_eq!(bd["21.00"]["tax"], json!(35));
    }

    #[test]
    fn the_PREVIEW_answers_the_child_line_exactly_like_the_charge() {
        // sales#164 — one valuation, two callers. If the preview did not expand the supplement the
        // till would paint 12,00 € as ONE line at 10 % and the charge would write two: the cashier
        // would be reconciling a ticket that does not exist, and the mixed-payment legs would stop
        // adding up to the total the server demands to the cent.
        let charged = sale(menu_with_drink(json!("product.generic")));
        let out = preview_checkout_pure(menu_with_drink(json!("product.generic")))
            .accepted("preview válido");
        let result = out.result.as_ref().expect("the preview answers through `result`");
        assert!(out.operations.is_empty(), "a preview writes nothing");
        assert!(out.events.is_empty(), "a preview announces nothing");

        let lines = result["lines"].as_array().expect("lines");
        assert_eq!(lines.len(), 2);
        assert_eq!(lines[1]["tax_rate"], json!(21.0));
        assert_eq!(lines[1]["net_amount"], json!(165));
        assert_eq!(lines[1]["line_total"], json!(200));
        assert_eq!(lines[1]["parent_index"], json!(0), "and it says which line it hangs from");
        assert_eq!(lines[0]["parent_index"], Value::Null);
        // The SAME arithmetic, cent for cent, as the rows the charge writes.
        let charged_lines = sale_lines(&charged);
        for (i, l) in lines.iter().enumerate() {
            assert_eq!(l["net_amount"], charged_lines[i]["net_amount"], "line {i} net");
            assert_eq!(l["tax_amount"], charged_lines[i]["tax_amount"], "line {i} quota");
            assert_eq!(l["line_total"], charged_lines[i]["line_total"], "line {i} gross");
        }
        assert_eq!(result["total"], json!(1200));
        assert_eq!(result["tax_breakdown"]["21.00"]["base"], json!(165));
    }

    #[test]
    fn the_child_line_follows_the_QUANTITY_of_its_parent() {
        // Two set menus are two drinks. The child is not a line the waiter typed: it is a piece of
        // its parent, so its quantity is the parent's — anything else would charge one drink for
        // two menus, or two for one.
        let out = sale(menu_with_drink_qty(json!("product.generic"), 2_000_000, 5));
        let lines = sale_lines(&out);
        assert_eq!(lines.len(), 2);
        assert_eq!(lines[1]["quantity"], json!(2_000_000), "2 menus ⇒ 2 drinks");
        assert_eq!(lines[1]["line_total"], json!(400), "2 × 2,00 €");
        assert_eq!(lines[0]["line_total"], json!(2000));
    }

    #[test]
    fn a_supplement_with_the_SAME_category_as_its_line_still_folds() {
        // Declaring the category is not declaring an exception: if it is THE SAME as the line's,
        // there are no two bases to break down and the supplement folds as it always did.
        let out = sale(menu_with_drink(json!("restaurant.food")));
        let lines = sale_lines(&out);
        assert_eq!(lines.len(), 1, "one rate, one row");
        assert_eq!(lines[0]["line_total"], json!(1200), "10 € + 2 € at the same rate");
    }

    #[test]
    fn a_supplement_with_NO_category_keeps_folding_into_its_line() {
        // NO-REGRESSION control over 99 % of supplements: an empty `tax_category_key` means it
        // inherits (ADR-0376). If this test went red, the fix would have broken "+cheese".
        let out = sale(menu_with_drink(Value::Null));
        let lines = sale_lines(&out);
        assert_eq!(lines.len(), 1);
        assert_eq!(lines[0]["line_total"], json!(1200), "the delta goes in via the unit price");
        let snap: Value = serde_json::from_str(lines[0]["modifiers"].as_str().expect("TEXT")).unwrap();
        assert_eq!(snap[0]["option_id"], json!("o-refresco"), "and it stays ON the line");
    }

    #[test]
    fn the_promoted_supplement_LEAVES_the_parents_snapshot_and_lands_on_the_child() {
        // `sales_sale_item.modifiers` means «what is INSIDE this row's unit price» — that is the
        // whole reason the paper prints no amount beside a supplement (sales#148). A promoted
        // option is no longer inside it, so leaving it there would print it twice: once as a
        // sub-line of the menu and once as its own row, with its own money.
        let out = sale(menu_with_drink(json!("product.generic")));
        let lines = sale_lines(&out);
        assert_eq!(lines[0]["modifiers"], json!("[]"), "nothing folded into the parent");
        let child: Value = serde_json::from_str(lines[1]["modifiers"].as_str().expect("TEXT")).unwrap();
        assert_eq!(child[0]["option_id"], json!("o-refresco"), "the row says WHICH option it is");
        assert_eq!(child[0]["kitchen_name"], json!("+REFRESCO"));
        assert_eq!(child[0]["price_delta"], json!(200));
    }

    #[test]
    fn a_line_discount_prorates_over_the_parent_AND_the_child() {
        // ADR-0210: 10 % off the menu line is 10 % off what the menu costs, drink included. The
        // child inherits the discount, so neither base escapes it.
        let mut inp = menu_with_drink(json!("product.generic"));
        inp["payload"]["items"][0]["discount"] = json!(10.0);
        let lines = sale_lines(&sale(inp));
        assert_eq!(lines[0]["line_total"], json!(900), "10,00 € − 10 %");
        assert_eq!(lines[1]["line_total"], json!(180), "2,00 € − 10 %");
        assert_eq!(lines[1]["discount_percent"], json!(10.0), "frozen on the child too");
    }

    #[test]
    fn a_TICKET_discount_prorates_over_the_parent_AND_the_child_to_the_cent() {
        // The fixed-amount ticket discount is shared out by LARGEST REMAINDER over every charged
        // line (sales#113 / ADR-0210). The child is one of them: the two rows have to add up to
        // EXACTLY the ticket's total, with no cent invented or lost, and the declared quota has to
        // keep squaring with `base × rate` on both rates (ADR-0123 §4).
        let mut inp = menu_with_drink(json!("product.generic"));
        inp["payload"]["discount_amount"] = json!(101);
        let out = sale(inp);
        let lines = sale_lines(&out);
        let total: i64 = lines.iter().map(|l| l["line_total"].as_i64().unwrap()).sum();
        assert_eq!(total, 1099, "1200 − 1,01 €, to the cent");
        let ev = out.events.first().expect("sale.completed");
        assert_eq!(ev.payload["total"], json!(1099));
        let header = &out.operations[1].params;
        let bd: Value = serde_json::from_str(header["tax_breakdown"].as_str().expect("TEXT")).unwrap();
        let bd = bd.as_object().expect("breakdown");
        assert_eq!(bd.len(), 2, "the two rates survive the discount");
        let declared: i64 = bd.values().map(|v| v["tax"].as_i64().unwrap()).sum();
        assert_eq!(ev.payload["tax_amount"], json!(declared), "declared quota == the breakdown's");
    }

    #[test]
    fn an_INVITED_menu_invites_its_child_too() {
        // A comped set menu is comped whole: charging the drink of a menu that was given away
        // would leave a 2,00 € row nobody can explain to the customer.
        let mut inp = menu_with_drink(json!("product.generic"));
        inp["payload"]["items"][0]["is_gift"] = json!(true);
        let lines = sale_lines(&sale(inp));
        assert_eq!(lines.len(), 2);
        assert_eq!(lines[1]["is_gift"], json!(1));
        assert_eq!(lines[1]["line_total"], json!(0));
    }

    #[test]
    fn on_an_OPEN_PRICE_line_the_supplement_gets_its_own_line_as_well() {
        // A line with no `product_id` has no catalogue category, so there is nothing for the option
        // to inherit — which is exactly why it needs a row of its own. Part 1 refused this case
        // because folding it would have meant guessing; the child line removes the guess.
        let mut inp = con_suplementos(
            input(json!([{ "product_name": "Menú del día", "price": 1000, "quantity": 1_000_000,
                           "tax_rate": 10.0, "tax_category_key": "restaurant.food",
                           "modifiers": [{ "option_id": "o-refresco" }] }]), 5, 0),
            drink_option(json!("product.generic")),
        );
        inp["context"]["reads"]["taxes.rules.list"] = menu_tax_rules();
        inp["context"]["country_code"] = json!("ES");
        let lines = sale_lines(&sale(inp));
        assert_eq!(lines.len(), 2);
        assert_eq!(lines[1]["tax_rate"], json!(21.0));
        assert_eq!(lines[1]["line_total"], json!(200));
    }

    #[test]
    fn a_promoted_supplement_that_is_worth_NOTHING_is_refused() {
        // A supplement billed apart has to BE something. A 0 € — or negative — row at another rate
        // is not a supplement: it is a rebate wearing a tax category, and it would declare a base
        // the customer never bought. Fails CLOSED, like the rest of this door.
        let mut inp = menu_with_drink(json!("product.generic"));
        inp["payload"]["items"][0]["modifiers"] = json!([{ "option_id": "o-descuento" }]);
        inp["context"]["reads"]["modifiers.options.all"] =
            json!([{ "option_id": "o-descuento", "group_id": "g", "name": "Sin bebida",
                     "price_delta": -100, "tax_category_key": "product.generic" }]);
        let err = complete_sale_pure(inp).refused("un suplemento aparte que no vale nada");
        assert_eq!(err.code, "sales.modifier_child_price_invalid", "{err:?}");
    }

    #[test]
    fn a_parent_line_ref_SENT_BY_THE_CLIENT_is_ignored() {
        // The link is minted by the SERVER from the batch of ids, like `combo_group_ref` and like
        // the price (sales#68). A payload that could name its own parent could hang a line it
        // invented off a line it did not pay for.
        let mut inp = menu_with_drink(Value::Null);
        inp["payload"]["items"][0]["parent_line_ref"] = json!("me-lo-invento");
        let lines = sale_lines(&sale(inp));
        assert_eq!(lines.len(), 1);
        assert_eq!(lines[0]["parent_line_ref"], Value::Null, "el payload no engancha nada");
    }

    #[test]
    fn the_child_line_COUNTS_against_the_batch_of_ids() {
        // The host hands out a finite batch (256, ARQUITECTURA.md §5.3) and a promoted supplement
        // multiplies rows just like a set menu does. Without counting it, the last line would be
        // written with an empty primary key and the failure would surface as a collision in the
        // database, far from its cause.
        let err = complete_sale_pure(menu_with_drink_qty(json!("product.generic"), 1_000_000, 2))
            .refused("la tanda de ids no da para la hija");
        assert_eq!(err.code, "sales.too_many_lines", "{err:?}");
    }

    // ── pm#93 · los suplementos llegan a COCINA con el nombre que resuelve el SERVIDOR ────────

    fn fire_con_suplementos(picks: Value, catalogo: Option<Value>) -> Value {
        let mut inp = json!({
            "payload": {
                "order_id": "ord-1", "label": "Mesa 4", "channel": "dine_in",
                "items": [{ "product_id": "p-burger", "product_name": "Hamburguesa",
                            "quantity": 1_000_000, "unit_price": 500, "notes": "",
                            "category_id": null, "order_item_id": "li-1",
                            "modifiers": picks }]
            },
            "context": { "hub_id": "h1", "current_user_id": "u1", "now": "2026-05-31T10:00:00+00:00" }
        });
        if let Some(c) = catalogo {
            inp["context"]["reads"] = json!({ "modifiers.options.all": c });
        }
        inp
    }

    fn catalogo_cocina() -> Value {
        json!([
            { "option_id": "o-no-onion", "group_id": "g", "name": "Sin cebolla",
              "kitchen_name": "SIN CEBOLLA", "price_delta": 0, "tax_category_key": null },
            // kitchen_name vacío: cocina imprime el comercial. Que el fallback exista importa,
            // porque un hueco en la comanda es lo mismo que no imprimirla.
            { "option_id": "o-cheese", "group_id": "g", "name": "Extra de queso",
              "kitchen_name": "", "price_delta": 100, "tax_category_key": null },
        ])
    }

    #[test]
    fn la_comanda_lleva_el_NOMBRE_DE_COCINA_resuelto_por_el_servidor() {
        // El TPV manda solo ids. El texto que se IMPRIME lo pone el servidor, igual que el precio:
        // si lo pusiera el navegador, un cliente podría escribir lo que quisiera en la comanda.
        let out = fire_order_pure(fire_con_suplementos(
            json!([{ "option_id": "o-no-onion" }]), Some(catalogo_cocina()),
        )).accepted("fire ok");
        let ev = &out.events[0];
        let m = &ev.payload["items"][0]["modifiers"][0];
        assert_eq!(m["kitchen_name"], json!("SIN CEBOLLA"));
    }

    #[test]
    fn sin_kitchen_name_cocina_imprime_el_nombre_comercial() {
        let out = fire_order_pure(fire_con_suplementos(
            json!([{ "option_id": "o-cheese" }]), Some(catalogo_cocina()),
        )).accepted("fire ok");
        let m = &out.events[0].payload["items"][0]["modifiers"][0];
        assert_eq!(m["kitchen_name"], json!("Extra de queso"), "hueco en la comanda = comanda inútil");
    }

    #[test]
    fn el_ORDEN_de_eleccion_se_conserva_hasta_el_papel() {
        // Petición recurrente en los foros de Square: cocina lee en el orden en que se eligió, no
        // en el del catálogo.
        let out = fire_order_pure(fire_con_suplementos(
            json!([{ "option_id": "o-cheese" }, { "option_id": "o-no-onion" }]), Some(catalogo_cocina()),
        )).accepted("fire ok");
        let ms = out.events[0].payload["items"][0]["modifiers"].as_array().expect("array").clone();
        let names: Vec<String> = ms.iter().map(|m| as_str(&m["kitchen_name"])).collect();
        assert_eq!(names, vec!["Extra de queso".to_string(), "SIN CEBOLLA".to_string()]);
    }

    #[test]
    fn sin_catalogo_la_comanda_SIGUE_saliendo() {
        // 🔴 Aquí NO se falla cerrado, y es a propósito: al cobrar, un precio sin verificar es un
        // agujero de dinero y se rechaza. Aquí lo que está en juego es que la comida salga. Negarse
        // a imprimir porque falta un catálogo dejaría la cocina parada por una integración
        // accesoria. Se imprime lo que se sabe: el id, que es mejor que nada y que un silencio.
        let out = fire_order_pure(fire_con_suplementos(
            json!([{ "option_id": "o-no-onion" }]), None,
        )).accepted("la comanda tiene que salir igual");
        let m = &out.events[0].payload["items"][0]["modifiers"][0];
        assert_eq!(m["option_id"], json!("o-no-onion"));
    }

    #[test]
    fn una_comanda_SIN_suplementos_no_cambia() {
        // Control: el 99 % de las comandas. Si esto se rompiera, se rompería cocina entera.
        let out = fire_order_pure(fire_con_suplementos(json!([]), Some(catalogo_cocina())))
            .accepted("fire ok");
        let item = &out.events[0].payload["items"][0];
        assert_eq!(item["product_name"], json!("Hamburguesa"));
        assert_eq!(out.events[0].name, "order.fired");
    }

    // ── sales#152 / ADR-0381 · el SERVIDOR arma el combo y REPARTE la base (art. 79.Dos) ───────
    //
    // Un combo NO es una línea: es un GRUPO de líneas hermanas, y cuántas tenga lo decide cuántos
    // TIPOS impositivos distintos hay dentro, nunca cuántos componentes se eligieron.
    //
    //   * un solo tipo  → UNA línea con el precio cerrado. Cero reparto, cero redondeo: toda la
    //     maquinaria de dinero ya probada (punto fijo, HALF_UP, un redondeo por importe) intacta.
    //   * tipos distintos → UNA LÍNEA POR COMPONENTE, cada una con su categoría fiscal y el precio
    //     cerrado repartido EN PROPORCIÓN AL PRECIO DE CATÁLOGO (art. 79.Dos LIVA, «valor de
    //     mercado»; HMRC VATVAL03800, «selling price»). El céntimo residual va por RESTO MAYOR con
    //     la MISMA máquina de ADR-0210/sales#113 (`allocate_amount`), no una nueva.
    //
    // 🔴 Y NUNCA una línea padre con dinero, ni siquiera a 0 €: es el fallo documentado de Odoo
    // (odoo#187509), donde el combo aparece REGALADO en el informe de ventas.

    /// Reglas de IVA con los DOS tipos que necesita un pack de tienda de alimentación.
    fn combo_rules() -> Value {
        json!([
            { "id": "es-vat-10", "country_code": "ES", "region_code": null,
              "tax_category_key": "shop.food", "rate_pct": 10.0, "tax_type": "vat", "parent_id": null },
            { "id": "es-vat-21", "country_code": "ES", "region_code": null,
              "tax_category_key": "product.generic", "rate_pct": 21.0, "tax_type": "vat", "parent_id": null }
        ])
    }

    /// Una fila de `combos.options.all` (lectura OPCIONAL, ADR-0127: `sales` NO depende de `combos`).
    #[allow(clippy::too_many_arguments)]
    fn combo_option(
        option_id: &str, group_id: &str, min_choices: i64, source_ref: &str,
        price_delta: i64, supply_kind: &str, combo_price: i64, combo_tax: &str,
    ) -> Value {
        json!({
            "option_id": option_id, "group_id": group_id, "combo_id": "c-1",
            "combo_name": "Pack merienda", "combo_kitchen_name": "PACK",
            "combo_price": combo_price, "combo_tax_category_key": combo_tax,
            "supply_kind": supply_kind, "combo_is_active": 1,
            "group_name": group_id, "min_choices": min_choices, "max_choices": 1, "allow_repeat": 0,
            "group_sort_order": 0, "source": "product", "source_ref": source_ref,
            "price_delta": price_delta, "option_sort_order": 0
        })
    }

    /// Una fila de `inventory.products.for_sale`: el PESO del reparto (precio de catálogo) y la
    /// categoría fiscal del componente salen de aquí, nunca del payload.
    fn combo_product(id: &str, price: i64, cat: &str) -> Value {
        json!({ "id": id, "price": price, "cost": 0, "tax_category_key": cat })
    }

    /// Cobro de UN combo con todos los catálogos de confianza puestos.
    fn combo_input(choices: Value, options: Value, products: Value, ids: usize) -> Value {
        let items = json!([{
            // El TPV manda el id del combo y lo elegido. El nombre y el precio los pone el catálogo.
            "combo_id": "c-1", "product_name": "Pack merienda", "price": 1, "quantity": 1_000_000,
            "combo_choices": choices
        }]);
        let mut inp = input(items, ids, 0);
        inp["context"]["country_code"] = json!("ES");
        inp["context"]["reads"] = json!({
            "taxes.rules.list": combo_rules(),
            "inventory.products.for_sale": products,
            "combos.options.all": options,
        });
        inp
    }

    /// Las líneas de venta que emitió el cobro, en orden.
    fn sale_lines(out: &Output) -> Vec<Map<String, Value>> {
        out.operations.iter()
            .filter(|o| o.command == "sales._insert_line")
            .map(|o| o.params.clone())
            .collect()
    }

    fn line_totals(out: &Output) -> Vec<i64> {
        sale_lines(out).iter().map(|p| p["line_total"].as_i64().unwrap_or(-1)).collect()
    }

    /// The stock movements `inventory` would take out of this sale — a LITERAL port of its
    /// `stock_units()` plus the loop of `decrease_on_sale_pure` (`inventory` v1.2.38,
    /// `handler/src/lib.rs:415-520`, read at `origin/main`), not a reinterpretation of them.
    ///
    /// It lives here because the contract between the two modules is the EVENT: `sales` does not
    /// depend on `inventory` and never will. Asserting on the shape of the payload alone is what
    /// let sales#171 through — the event looked right and the stock did not move, because a combo
    /// line carries no `product_id` of its own and `inventory` had nothing else to read.
    ///
    /// Returns `(product_id, quantity)` in emission order, quantity in 10⁶ fixed point (ADR-0147).
    fn stock_movements(out: &Output) -> Vec<(String, i64)> {
        let ev = out.events.iter().find(|e| e.name == "sale.completed").expect("sale.completed");
        let empty: Vec<Value> = Vec::new();
        let items = ev.payload["items"].as_array().unwrap_or(&empty);
        let mut moves: Vec<(String, i64)> = Vec::new();
        for item in items {
            // `stock_units`: a line that carries a non-empty `components[]` hands its stock over
            // to them; absent OR empty means a plain line, which moves its own.
            let units: Vec<&Value> = match item.get("components").and_then(|v| v.as_array()) {
                Some(c) if !c.is_empty() => c.iter().collect(),
                _ => vec![item],
            };
            for u in units {
                // `is_service_entry`: the flag travels as bool, number or string.
                let is_service = match u.get("is_service") {
                    Some(Value::Bool(b)) => *b,
                    Some(Value::Number(n)) => n.as_i64().unwrap_or(0) != 0,
                    Some(Value::String(s)) => matches!(s.as_str(), "1" | "true" | "True"),
                    _ => false,
                };
                let product_id = u.get("product_id").cloned().unwrap_or(Value::Null);
                if is_service || product_id.is_null() {
                    continue;
                }
                let qty = u.get("quantity").and_then(|v| v.as_i64()).unwrap_or(0);
                if qty <= 0 {
                    continue;
                }
                moves.push((as_str(&product_id), qty));
            }
        }
        moves
    }

    /// El menú del día: `service` (prestación única al 10 %, art. 91.Uno.2.2º LIVA) con tres
    /// platos que SÍ son artículos del catálogo. `qty` en punto fijo 10⁶ (ADR-0147).
    fn menu_del_dia(qty: i64) -> Value {
        let mut inp = combo_input(
            json!([{ "option_id": "o-first", "product_name": "Ensalada" },
                   { "option_id": "o-second", "product_name": "Merluza" },
                   { "option_id": "o-dessert", "product_name": "Flan" }]),
            json!([combo_option("o-first", "g-first", 1, "p-salad", 0, "service", 1350, "shop.food"),
                   combo_option("o-second", "g-second", 1, "p-hake", 0, "service", 1350, "shop.food"),
                   combo_option("o-dessert", "g-dessert", 1, "p-flan", 0, "service", 1350, "shop.food")]),
            json!([]),
            8,
        );
        inp["payload"]["items"][0]["quantity"] = json!(qty);
        inp
    }

    #[test]
    fn el_pack_de_tienda_reparte_el_centimo_residual_a_la_CERVEZA_no_al_bocadillo() {
        // 🔴 EL VECTOR DISCRIMINANTE (pm#156). Tienda de alimentación: bocadillo 4,50 € (10 %) +
        // cerveza 2,00 € (21 %) = 6,50 € de catálogo, vendidos por 6,00 € cerrados.
        //
        //   600 × 450 / 650 = 415,38…  → suelo 415, resto 250
        //   600 × 200 / 650 = 184,61…  → suelo 184, resto 400   ← el resto MAYOR
        //
        // Sobra 1 céntimo y va a la CERVEZA. Quien sume el sobrante a la primera línea da
        // [416, 184] y NO se entera con ningún otro vector; quien redondee HALF_UP por línea da
        // [415, 185] por casualidad aquí pero descuadra en cuanto la suma no cierra.
        let out = sale(combo_input(
            json!([{ "option_id": "o-sandwich", "product_name": "Bocadillo" },
                   { "option_id": "o-beer", "product_name": "Cerveza" }]),
            json!([combo_option("o-sandwich", "g-food", 1, "p-sandwich", 0, "goods", 600, ""),
                   combo_option("o-beer", "g-drink", 1, "p-beer", 0, "goods", 600, "")]),
            json!([combo_product("p-sandwich", 450, "shop.food"),
                   combo_product("p-beer", 200, "product.generic")]),
            8,
        ));
        assert_eq!(line_totals(&out), vec![415, 185], "el céntimo va al RESTO MAYOR (la cerveza)");
        // LA INVARIANTE: la suma es EXACTAMENTE el precio cerrado. No «±1 céntimo»: exactamente.
        assert_eq!(line_totals(&out).iter().sum::<i64>(), 600);
        // Y cada línea tributa a LO SUYO: el bocadillo al 10 %, la cerveza al 21 %.
        let lines = sale_lines(&out);
        assert_eq!(lines[0]["tax_rate"], json!(10.0));
        assert_eq!(lines[1]["tax_rate"], json!(21.0));
        assert_eq!(lines[0]["tax_category_key"], json!("shop.food"));
        assert_eq!(lines[1]["tax_category_key"], json!("product.generic"));
    }

    #[test]
    fn el_reparto_reproduce_EXACTAMENTE_la_tabla_de_HMRC_VATVAL03800() {
        // El control EXTERNO: HMRC documenta el reparto con un meal deal CON VINO dentro —
        // plato 6,00 → 4,00; guarnición 1,50 → 1,00; postre 1,50 → 1,00; vino 6,00 → 4,00, sobre
        // un precio de 10,00 frente a 15,00 de suma individual. Que España (art. 79.Dos, «valor de
        // mercado») y HMRC («selling price») converjan deja de ser una afirmación del ADR.
        let out = sale(combo_input(
            json!([{ "option_id": "o-main" }, { "option_id": "o-side" },
                   { "option_id": "o-dessert" }, { "option_id": "o-wine" }]),
            json!([combo_option("o-main", "g1", 1, "p-main", 0, "goods", 1000, ""),
                   combo_option("o-side", "g2", 1, "p-side", 0, "goods", 1000, ""),
                   combo_option("o-dessert", "g3", 1, "p-dessert", 0, "goods", 1000, ""),
                   combo_option("o-wine", "g4", 1, "p-wine", 0, "goods", 1000, "")]),
            json!([combo_product("p-main", 600, "shop.food"),
                   combo_product("p-side", 150, "shop.food"),
                   combo_product("p-dessert", 150, "shop.food"),
                   combo_product("p-wine", 600, "product.generic")]),
            8,
        ));
        assert_eq!(line_totals(&out), vec![400, 100, 100, 400], "la tabla de HMRC, literal");
        assert_eq!(line_totals(&out).iter().sum::<i64>(), 1000);
    }

    #[test]
    fn con_restos_iguales_el_centimo_se_lo_lleva_la_linea_ANTERIOR() {
        // 1000 sobre [500, 500, 500]: 333,33… cada uno, suelo 333, sobra 1 y los tres restos son
        // IGUALES. El desempate es el orden estable del tique (la línea anterior), que es lo que
        // hace `remainders.sort_by(… b.0.cmp(&a.0).then(a.1.cmp(&b.1)))` en `allocate_amount`.
        let out = sale(combo_input(
            json!([{ "option_id": "o-a" }, { "option_id": "o-b" }, { "option_id": "o-c" }]),
            json!([combo_option("o-a", "g1", 1, "p-a", 0, "goods", 1000, ""),
                   combo_option("o-b", "g2", 1, "p-b", 0, "goods", 1000, ""),
                   combo_option("o-c", "g3", 1, "p-c", 0, "goods", 1000, "")]),
            json!([combo_product("p-a", 500, "shop.food"),
                   combo_product("p-b", 500, "shop.food"),
                   combo_product("p-c", 500, "product.generic")]),
            8,
        ));
        assert_eq!(line_totals(&out), vec![334, 333, 333]);
        assert_eq!(line_totals(&out).iter().sum::<i64>(), 1000);
    }

    #[test]
    fn un_menu_del_dia_es_UNA_linea_al_tipo_del_COMBO_aunque_dentro_haya_vino() {
        // 🇪🇸 El error de partida más caro de esta funcionalidad: un menú SERVIDO EN EL LOCAL va
        // ENTERO al 10 %, vino incluido (art. 91.Uno.2.2º LIVA — prestación única, la bebida es
        // ACCESORIA). `supply_kind = service` lo DECLARA el combo; no lo adivina el TPV mirando
        // cómo estén etiquetados los artículos. Una línea, el precio cerrado, cero reparto.
        let out = sale(combo_input(
            json!([{ "option_id": "o-first" }, { "option_id": "o-second" },
                   { "option_id": "o-dessert" }, { "option_id": "o-wine" }]),
            json!([combo_option("o-first", "g1", 1, "p-a", 0, "service", 1350, "shop.food"),
                   combo_option("o-second", "g2", 1, "p-b", 0, "service", 1350, "shop.food"),
                   combo_option("o-dessert", "g3", 1, "p-c", 0, "service", 1350, "shop.food"),
                   // El vino está etiquetado al 21 % en el catálogo y NO parte el menú.
                   combo_option("o-wine", "g4", 1, "p-wine", 0, "service", 1350, "shop.food")]),
            json!([combo_product("p-a", 600, "shop.food"), combo_product("p-b", 800, "shop.food"),
                   combo_product("p-c", 300, "shop.food"),
                   combo_product("p-wine", 400, "product.generic")]),
            8,
        ));
        let lines = sale_lines(&out);
        assert_eq!(lines.len(), 1, "prestación única = UNA línea");
        assert_eq!(lines[0]["unit_price"], json!(1350), "el precio CERRADO, sin repartir");
        assert_eq!(lines[0]["line_total"], json!(1350));
        assert_eq!(lines[0]["tax_rate"], json!(10.0), "todo al 10 %, vino incluido");
        assert_eq!(lines[0]["tax_category_key"], json!("shop.food"));
        // Y el nombre que se guarda es el del CATÁLOGO, no el que mandó el navegador.
        assert_eq!(lines[0]["product_name"], json!("Pack merienda"));
    }

    #[test]
    fn un_pack_de_UN_SOLO_tipo_tampoco_se_parte() {
        // Regla 1 de ADR-0381: lo que decide el número de líneas es cuántos TIPOS distintos hay,
        // nunca cuántos componentes. Dos productos al 10 % → UNA línea con el precio cerrado, y la
        // maquinaria de dinero ni se entera de que había un combo.
        let out = sale(combo_input(
            json!([{ "option_id": "o-a" }, { "option_id": "o-b" }]),
            json!([combo_option("o-a", "g1", 1, "p-a", 0, "goods", 600, ""),
                   combo_option("o-b", "g2", 1, "p-b", 0, "goods", 600, "")]),
            json!([combo_product("p-a", 450, "shop.food"), combo_product("p-b", 200, "shop.food")]),
            8,
        ));
        let lines = sale_lines(&out);
        assert_eq!(lines.len(), 1);
        assert_eq!(lines[0]["line_total"], json!(600));
        assert_eq!(lines[0]["tax_category_key"], json!("shop.food"), "el tipo de sus componentes");
    }

    #[test]
    fn NO_hay_linea_padre_con_importe_ni_a_cero_euros() {
        // 🔴 El fallo documentado de Odoo (odoo#187509 + foro 279266): al prorratear, el combo
        // queda a 0 € en el informe de ventas y el operador cree que lo ha REGALADO. Aquí las
        // líneas son HERMANAS: no hay una fila más, ni a 0, ni con el `combo_id` como producto.
        let out = sale(combo_input(
            json!([{ "option_id": "o-sandwich" }, { "option_id": "o-beer" }]),
            json!([combo_option("o-sandwich", "g-food", 1, "p-sandwich", 0, "goods", 600, ""),
                   combo_option("o-beer", "g-drink", 1, "p-beer", 0, "goods", 600, "")]),
            json!([combo_product("p-sandwich", 450, "shop.food"),
                   combo_product("p-beer", 200, "product.generic")]),
            8,
        ));
        let lines = sale_lines(&out);
        assert_eq!(lines.len(), 2, "dos componentes, dos líneas: ni una más");
        assert!(!lines.iter().any(|l| l["line_total"] == json!(0)), "ninguna línea a 0 €");
        assert!(!lines.iter().any(|l| l["product_id"] == json!("c-1")), "el combo NO es una fila");
    }

    #[test]
    fn las_lineas_hermanas_comparten_combo_group_ref_y_el_SNAPSHOT_del_combo() {
        // Regla 4 y 6 de ADR-0381: las hermanas se reconocen por su `combo_group_ref` y llevan
        // CONGELADO el nombre y el precio del combo — la cabecera del tique se pinta de ahí, no de
        // una fila a cero. Cambiar el menú mañana no reescribe la comanda de ayer (ADR-0140).
        let out = sale(combo_input(
            json!([{ "option_id": "o-sandwich", "product_name": "Bocadillo" },
                   { "option_id": "o-beer", "product_name": "Cerveza" }]),
            json!([combo_option("o-sandwich", "g-food", 1, "p-sandwich", 0, "goods", 600, ""),
                   combo_option("o-beer", "g-drink", 1, "p-beer", 0, "goods", 600, "")]),
            json!([combo_product("p-sandwich", 450, "shop.food"),
                   combo_product("p-beer", 200, "product.generic")]),
            8,
        ));
        let lines = sale_lines(&out);
        let refs: Vec<&Value> = lines.iter().map(|l| &l["combo_group_ref"]).collect();
        assert_eq!(refs[0], refs[1], "hermanas: el MISMO grupo");
        assert!(!as_str(refs[0]).is_empty(), "y un ref de verdad, no vacío");
        let snap: Value = serde_json::from_str(lines[0]["combo"].as_str().expect("TEXT")).expect("JSON");
        assert_eq!(snap["combo_id"], json!("c-1"));
        assert_eq!(snap["name"], json!("Pack merienda"), "el nombre del CATÁLOGO, congelado");
        assert_eq!(snap["price"], json!(600), "el precio CERRADO, congelado");
        assert_eq!(snap["supply_kind"], json!("goods"));
        // Y el orden de ELECCIÓN, que es el que lee cocina (la petición recurrente de Square).
        assert_eq!(snap["components"][0]["option_id"], json!("o-sandwich"));
        assert_eq!(snap["components"][1]["option_id"], json!("o-beer"));
        assert_eq!(snap["components"][0]["source_ref"], json!("p-sandwich"));
    }

    #[test]
    fn el_precio_QUE_MANDA_EL_CLIENTE_se_ignora_del_todo() {
        // La lección de sales#68, aplicada al combo: el payload manda `price: 1` (un céntimo) y
        // cada componente con su propio precio inventado. Se cobran los 6,00 € del catálogo.
        let mut inp = combo_input(
            json!([{ "option_id": "o-sandwich", "price": 1 }, { "option_id": "o-beer", "price": 1 }]),
            json!([combo_option("o-sandwich", "g-food", 1, "p-sandwich", 0, "goods", 600, ""),
                   combo_option("o-beer", "g-drink", 1, "p-beer", 0, "goods", 600, "")]),
            json!([combo_product("p-sandwich", 450, "shop.food"),
                   combo_product("p-beer", 200, "product.generic")]),
            8,
        );
        inp["payload"]["items"][0]["price"] = json!(1);
        let out = sale(inp);
        assert_eq!(line_totals(&out).iter().sum::<i64>(), 600, "manda el catálogo, no el payload");
    }

    #[test]
    fn el_price_delta_de_una_sustitucion_sube_el_DIVIDENDO_no_el_peso() {
        // «+ solomillo 3 €»: el suplemento suma AL PRECIO CERRADO (el dividendo), nunca al peso del
        // componente. El componente caro se lleva más base porque su precio de CATÁLOGO es mayor,
        // sin tratamiento fiscal especial. 600 + 300 = 900 sobre [450, 200]:
        //   900 × 450 / 650 = 623,07… → 623 (resto 50)
        //   900 × 200 / 650 = 276,92… → 276 (resto 600) ← el resto mayor se lleva el céntimo
        let out = sale(combo_input(
            json!([{ "option_id": "o-sandwich" }, { "option_id": "o-beer" }]),
            json!([combo_option("o-sandwich", "g-food", 1, "p-sandwich", 300, "goods", 600, ""),
                   combo_option("o-beer", "g-drink", 1, "p-beer", 0, "goods", 600, "")]),
            json!([combo_product("p-sandwich", 450, "shop.food"),
                   combo_product("p-beer", 200, "product.generic")]),
            8,
        ));
        assert_eq!(line_totals(&out), vec![623, 277]);
        assert_eq!(line_totals(&out).iter().sum::<i64>(), 900, "600 cerrados + 300 de suplemento");
    }

    #[test]
    fn el_ORDEN_de_eleccion_no_cambia_lo_que_cobra_cada_componente() {
        // Es lo que hizo indefendible el `override` de Toast: el reparto no puede depender de en
        // qué orden tocó las baldosas el cajero. Se eligen al revés y cada componente cobra lo mismo.
        let options = json!([combo_option("o-sandwich", "g-food", 1, "p-sandwich", 0, "goods", 600, ""),
                             combo_option("o-beer", "g-drink", 1, "p-beer", 0, "goods", 600, "")]);
        let products = json!([combo_product("p-sandwich", 450, "shop.food"),
                              combo_product("p-beer", 200, "product.generic")]);
        let al_reves = sale(combo_input(
            json!([{ "option_id": "o-beer" }, { "option_id": "o-sandwich" }]),
            options, products, 8,
        ));
        // Las líneas salen en el orden de elección, pero cada componente cobra LO SUYO.
        let lines = sale_lines(&al_reves);
        assert_eq!(lines[0]["product_id"], json!("p-beer"));
        assert_eq!(lines[0]["line_total"], json!(185), "la cerveza cobra 1,85 € se elija cuando se elija");
        assert_eq!(lines[1]["line_total"], json!(415));
        assert_eq!(line_totals(&al_reves).iter().sum::<i64>(), 600);
    }

    #[test]
    fn dos_packs_cobran_el_doble_exacto() {
        // La cantidad multiplica DESPUÉS del reparto: el reparto es por unidad de combo, así que
        // 2 packs son 2 × 4,15 € + 2 × 1,85 € = 12,00 € exactos, no un segundo redondeo.
        let mut inp = combo_input(
            json!([{ "option_id": "o-sandwich" }, { "option_id": "o-beer" }]),
            json!([combo_option("o-sandwich", "g-food", 1, "p-sandwich", 0, "goods", 600, ""),
                   combo_option("o-beer", "g-drink", 1, "p-beer", 0, "goods", 600, "")]),
            json!([combo_product("p-sandwich", 450, "shop.food"),
                   combo_product("p-beer", 200, "product.generic")]),
            8,
        );
        inp["payload"]["items"][0]["quantity"] = json!(2_000_000);
        let out = sale(inp);
        assert_eq!(line_totals(&out), vec![830, 370]);
        assert_eq!(line_totals(&out).iter().sum::<i64>(), 1200);
    }

    #[test]
    fn un_grupo_OBLIGATORIO_sin_resolver_RECHAZA_la_venta() {
        // Regla 7: `min_choices >= 1` es una PRECONDICIÓN, no un aviso. El pack tiene dos cursos
        // obligatorios y solo se eligió uno: no se cobra media cosa.
        let inp = combo_input(
            json!([{ "option_id": "o-sandwich" }]),
            json!([combo_option("o-sandwich", "g-food", 1, "p-sandwich", 0, "goods", 600, ""),
                   combo_option("o-beer", "g-drink", 1, "p-beer", 0, "goods", 600, "")]),
            json!([combo_product("p-sandwich", 450, "shop.food"),
                   combo_product("p-beer", 200, "product.generic")]),
            8,
        );
        let err = complete_sale_pure(inp).refused("un curso sin resolver no se cobra");
        assert_eq!(err.code, "sales.combo_group_unresolved", "código de dominio estable: {err:?}");
    }

    #[test]
    fn elegir_MAS_de_lo_que_permite_el_grupo_RECHAZA_la_venta() {
        // `max_choices` es del servidor, no del picker: una petición que se salte la pantalla no
        // puede llevarse dos postres al precio de uno.
        let inp = combo_input(
            json!([{ "option_id": "o-sandwich" }, { "option_id": "o-toast" }, { "option_id": "o-beer" }]),
            json!([combo_option("o-sandwich", "g-food", 1, "p-sandwich", 0, "goods", 600, ""),
                   combo_option("o-toast", "g-food", 1, "p-toast", 0, "goods", 600, ""),
                   combo_option("o-beer", "g-drink", 1, "p-beer", 0, "goods", 600, "")]),
            json!([combo_product("p-sandwich", 450, "shop.food"),
                   combo_product("p-toast", 450, "shop.food"),
                   combo_product("p-beer", 200, "product.generic")]),
            8,
        );
        let err = complete_sale_pure(inp).refused("dos de un grupo de máximo uno");
        assert_eq!(err.code, "sales.combo_group_over_max", "código de dominio estable: {err:?}");
    }

    #[test]
    fn un_menu_RETIRADO_se_rechaza_RUIDOSO_y_no_como_opcion_desconocida() {
        // `combo_is_active = 0` viaja a propósito en la read: un componente de un menú retirado se
        // rechaza diciendo QUE EL MENÚ YA NO ESTÁ A LA VENTA. Confundirlo con «opción desconocida»
        // manda al encargado a mirar el sitio equivocado — es otro bug con otro arreglo.
        let mut options = json!([combo_option("o-sandwich", "g-food", 1, "p-sandwich", 0, "goods", 600, ""),
                                 combo_option("o-beer", "g-drink", 1, "p-beer", 0, "goods", 600, "")]);
        options[0]["combo_is_active"] = json!(0);
        options[1]["combo_is_active"] = json!(0);
        let inp = combo_input(
            json!([{ "option_id": "o-sandwich" }, { "option_id": "o-beer" }]),
            options,
            json!([combo_product("p-sandwich", 450, "shop.food"),
                   combo_product("p-beer", 200, "product.generic")]),
            8,
        );
        let err = complete_sale_pure(inp).refused("un menú retirado no se vende");
        assert_eq!(err.code, "sales.combo_not_on_sale", "código propio y RUIDOSO: {err:?}");
    }

    #[test]
    fn una_opcion_que_no_es_de_ese_combo_RECHAZA_la_venta() {
        let inp = combo_input(
            json!([{ "option_id": "o-sandwich" }, { "option_id": "o-inventada" }]),
            json!([combo_option("o-sandwich", "g-food", 1, "p-sandwich", 0, "goods", 600, "")]),
            json!([combo_product("p-sandwich", 450, "shop.food")]),
            8,
        );
        let err = complete_sale_pure(inp).refused("opción inventada");
        assert_eq!(err.code, "sales.combo_option_not_available", "código estable: {err:?}");
    }

    #[test]
    fn un_combo_que_no_esta_en_el_catalogo_RECHAZA_la_venta() {
        let mut inp = combo_input(
            json!([{ "option_id": "o-sandwich" }]),
            json!([combo_option("o-sandwich", "g-food", 1, "p-sandwich", 0, "goods", 600, "")]),
            json!([combo_product("p-sandwich", 450, "shop.food")]),
            8,
        );
        inp["payload"]["items"][0]["combo_id"] = json!("c-inventado");
        let err = complete_sale_pure(inp).refused("combo inventado");
        assert_eq!(err.code, "sales.combo_not_available", "código estable: {err:?}");
    }

    #[test]
    fn sin_el_modulo_combos_instalado_una_linea_de_combo_se_RECHAZA() {
        // FALLA CERRADO (ADR-0127). `sales` NO depende de `combos`: la read es OPCIONAL, así que su
        // ausencia significa «el módulo no está». Y sin catálogo no hay forma de saber ni el precio
        // cerrado ni el reparto — cobrar «confiando» sería el agujero por la puerta de atrás.
        // Un hub SIN `combos` cobra exactamente igual que antes (lo fija el test de control).
        let mut inp = combo_input(
            json!([{ "option_id": "o-sandwich" }]),
            json!([combo_option("o-sandwich", "g-food", 1, "p-sandwich", 0, "goods", 600, "")]),
            json!([combo_product("p-sandwich", 450, "shop.food")]),
            8,
        );
        inp["context"]["reads"]["combos.options.all"] = Value::Null;
        let err = complete_sale_pure(inp).refused("sin catálogo no se cobra un combo");
        assert_eq!(err.code, "sales.combo_catalog_unavailable", "código estable: {err:?}");
    }

    #[test]
    fn un_componente_SIN_precio_de_catalogo_RECHAZA_el_reparto() {
        // El peso del reparto es el precio de CATÁLOGO del componente. Si el componente no está en
        // `inventory.products.for_sale` no hay peso, y repartir «a partes iguales» sería inventarse
        // la base imponible de una factura. Se rechaza, no se estima.
        let inp = combo_input(
            json!([{ "option_id": "o-sandwich" }, { "option_id": "o-beer" }]),
            json!([combo_option("o-sandwich", "g-food", 1, "p-sandwich", 0, "goods", 600, ""),
                   combo_option("o-beer", "g-drink", 1, "p-fantasma", 0, "goods", 600, "")]),
            json!([combo_product("p-sandwich", 450, "shop.food")]),
            8,
        );
        let err = complete_sale_pure(inp).refused("sin peso no hay reparto");
        assert_eq!(err.code, "sales.combo_component_price_unknown", "código estable: {err:?}");
    }

    #[test]
    fn el_EVENTO_lleva_las_mismas_lineas_repartidas_que_la_venta() {
        // 🔴 `sale.completed` se construye en un SEGUNDO recorrido sobre los items. Si ese recorrido
        // se quedara con el item del payload, `invoice` facturaría el combo por el precio que mandó
        // el navegador (aquí, 1 céntimo) mientras las filas dicen otra cosa — y lo que llega a la
        // AEAT sale del evento. Las dos rutas tienen que ver EXACTAMENTE las mismas líneas.
        let out = sale(combo_input(
            json!([{ "option_id": "o-sandwich" }, { "option_id": "o-beer" }]),
            json!([combo_option("o-sandwich", "g-food", 1, "p-sandwich", 0, "goods", 600, ""),
                   combo_option("o-beer", "g-drink", 1, "p-beer", 0, "goods", 600, "")]),
            json!([combo_product("p-sandwich", 450, "shop.food"),
                   combo_product("p-beer", 200, "product.generic")]),
            8,
        ));
        let ev = &out.events[0].payload;
        assert_eq!(ev["items_count"], json!(2), "el evento cuenta las líneas REALES");
        let items = ev["items"].as_array().expect("items");
        assert_eq!(items.len(), 2);
        assert_eq!(items[0]["unit_price"], json!(415));
        assert_eq!(items[1]["unit_price"], json!(185));
        assert_eq!(items[0]["tax_rate"], json!(10.0));
        assert_eq!(items[1]["tax_rate"], json!(21.0));
        // El grupo y el snapshot viajan TAMBIÉN en el evento: los consumidores (inventory para el
        // stock de los componentes, invoice para nombrar el menú) viven del evento, no de la fila.
        assert_eq!(items[0]["combo_group_ref"], items[1]["combo_group_ref"]);
        assert_eq!(items[0]["combo"]["name"], json!("Pack merienda"));
        assert_eq!(items[0]["combo"]["components"][1]["source_ref"], json!("p-beer"));
        // Y el total de la venta es el precio cerrado, al céntimo.
        assert_eq!(ev["total"], json!(600));
        let header = out.operations.iter().find(|o| o.command == "sales._insert_sale").expect("cabecera");
        assert_eq!(header.params["total"], json!(600));
    }

    #[test]
    fn el_DESGLOSE_por_tipo_reparte_la_base_del_pack_entre_los_dos_tipos() {
        // Lo que se DECLARA (ADR-0123 §4): una entrada por tipo, sobre la base agregada. 415 brutos
        // al 10 % → base 377, cuota 38; 185 brutos al 21 % → base 153, cuota 32. N líneas con N
        // tipos es lo que el desglose YA sabía emitir: aguas abajo no hay caso nuevo.
        let out = sale(combo_input(
            json!([{ "option_id": "o-sandwich" }, { "option_id": "o-beer" }]),
            json!([combo_option("o-sandwich", "g-food", 1, "p-sandwich", 0, "goods", 600, ""),
                   combo_option("o-beer", "g-drink", 1, "p-beer", 0, "goods", 600, "")]),
            json!([combo_product("p-sandwich", 450, "shop.food"),
                   combo_product("p-beer", 200, "product.generic")]),
            8,
        ));
        let header = out.operations.iter().find(|o| o.command == "sales._insert_sale").expect("cabecera");
        let bd: Value = serde_json::from_str(header.params["tax_breakdown"].as_str().expect("TEXT"))
            .expect("JSON");
        let entries = bd.as_object().expect("un DetalleDesglose por TIPO (ADR-0123 §4)");
        assert_eq!(entries.len(), 2, "dos tipos, dos entradas de desglose: {entries:?}");
        assert_eq!(bd["10.00"]["base"], json!(377));
        assert_eq!(bd["10.00"]["tax"], json!(38));
        assert_eq!(bd["21.00"]["base"], json!(153));
        assert_eq!(bd["21.00"]["tax"], json!(32));
    }

    #[test]
    fn una_venta_SIN_combos_no_cambia_en_NADA() {
        // Control (el 100 % de las ventas de hoy): sin `combo_id` no hace falta el catálogo de
        // combos, no hay rechazo, y la línea es la de siempre. Si esto se pusiera rojo, el arreglo
        // habría roto todas las ventas del producto.
        let out = sale(input(json!([{ "product_name": "Café", "price": 150,
                                      "quantity": 1_000_000, "tax_rate": 10.0 }]), 3, 150));
        let lines = sale_lines(&out);
        assert_eq!(lines.len(), 1);
        assert_eq!(lines[0]["line_total"], json!(150));
        assert_eq!(lines[0]["combo_group_ref"], Value::Null, "sin combo, sin grupo");
        assert_eq!(lines[0]["combo"], json!("{}"), "sin combo, snapshot vacío");
        let ev_item = &out.events[0].payload["items"][0];
        assert_eq!(ev_item["combo_group_ref"], Value::Null, "y el evento tampoco se inventa uno");
        assert_eq!(ev_item["combo"], Value::Null);
    }

    #[test]
    fn el_reparto_de_un_combo_MAS_CARO_que_sus_partes_sigue_siendo_el_de_hamilton() {
        // `allocate_amount` acota el total a la suma de los pesos (un descuento no puede pasar del
        // bruto). Un precio cerrado POR ENCIMA de la suma de los precios de catálogo es legítimo
        // —una sustitución con suplemento, un pack por encima de sus partes— y con el techo se
        // repartía de MENOS: la suma dejaba de ser el precio cerrado, que es la invariante.
        //
        // La equivalencia que hace que siga siendo la misma máquina: para todo total y todo peso,
        // el resultado es el de Hamilton calculado con enteros de 128 bits.
        let weights = [450_i64, 200];
        for total in [1_i64, 599, 600, 650, 651, 900, 1300, 1301, 99_999] {
            let got = allocate_proportional(total, &weights);
            assert_eq!(got.iter().sum::<i64>(), total, "la suma es EXACTA para {total}");
            let w_total: i128 = weights.iter().map(|w| *w as i128).sum();
            let floors: Vec<i64> = weights.iter()
                .map(|w| ((total as i128 * *w as i128) / w_total) as i64).collect();
            for (i, f) in floors.iter().enumerate() {
                assert!(got[i] == *f || got[i] == f + 1, "cada parte es el suelo o el suelo + 1 ({total})");
            }
        }
        // Y por debajo del techo sigue coincidiendo, céntimo a céntimo, con la máquina de sales#113.
        for total in [1_i64, 250, 600, 650] {
            assert_eq!(allocate_proportional(total, &weights), allocate_amount(total, &weights));
        }
    }

    #[test]
    fn un_modificador_DENTRO_de_un_combo_cuelga_de_la_linea_de_SU_componente() {
        // ADR-0376 sin cambios: «el segundo, sin cebolla» no es del menú, es de ese plato. El delta
        // del suplemento suma AL PRECIO DE ESA LÍNEA, sobre su parte del reparto, y solo a esa.
        let mut inp = combo_input(
            json!([{ "option_id": "o-sandwich", "modifiers": [{ "option_id": "o-queso" }] },
                   { "option_id": "o-beer" }]),
            json!([combo_option("o-sandwich", "g-food", 1, "p-sandwich", 0, "goods", 600, ""),
                   combo_option("o-beer", "g-drink", 1, "p-beer", 0, "goods", 600, "")]),
            json!([combo_product("p-sandwich", 450, "shop.food"),
                   combo_product("p-beer", 200, "product.generic")]),
            8,
        );
        inp["context"]["reads"]["modifiers.options.all"] = catalogo_queso();
        let out = sale(inp);
        // 415 de reparto + 100 de queso en la línea del bocadillo; la cerveza, intacta.
        assert_eq!(line_totals(&out), vec![515, 185]);
    }

    #[test]
    fn un_combo_SIN_categoria_fiscal_se_rechaza_en_vez_de_cobrar_el_IVA_del_NAVEGADOR() {
        // Sin categoría, el resolver se caería al `tax_rate` del payload —«preview del cliente»— y
        // el navegador acabaría fijando el IVA de un menú. El combo está mal configurado y se dice
        // en voz alta, que es lo contrario de cobrar al 0 % sin que nadie se entere.
        let inp = combo_input(
            json!([{ "option_id": "o-first" }]),
            json!([combo_option("o-first", "g1", 1, "p-a", 0, "service", 1350, "")]),
            json!([combo_product("p-a", 600, "shop.food")]),
            8,
        );
        let err = complete_sale_pure(inp).refused("un menú sin categoría fiscal no se cobra");
        assert_eq!(err.code, "sales.combo_tax_category_missing", "código estable: {err:?}");
    }

    #[test]
    fn repetir_una_opcion_que_no_admite_repeticion_RECHAZA_la_venta() {
        // `allow_repeat = 0`: dos veces el mismo plato en un curso que SÍ admite dos elecciones
        // (`max_choices = 2`) pero no repetirlas. Con `max_choices = 1` lo pararía antes el techo
        // del grupo, y el test no probaría nada de lo que dice probar.
        let mut options = json!([combo_option("o-sandwich", "g-food", 1, "p-sandwich", 0, "goods", 600, "")]);
        options[0]["max_choices"] = json!(2);
        let inp = combo_input(
            json!([{ "option_id": "o-sandwich" }, { "option_id": "o-sandwich" }]),
            options,
            json!([combo_product("p-sandwich", 450, "shop.food")]),
            8,
        );
        let err = complete_sale_pure(inp).refused("opción repetida");
        assert_eq!(err.code, "sales.combo_option_repeated", "código estable: {err:?}");
    }

    #[test]
    fn un_menu_INVITADO_lo_es_en_TODAS_sus_lineas_hermanas() {
        // Invitar medio menú no existe: la invitación es del combo, así que la heredan todas las
        // hermanas. Si solo la heredara la primera, el tique cobraría la cerveza de una cortesía.
        let mut inp = combo_input(
            json!([{ "option_id": "o-sandwich" }, { "option_id": "o-beer" }]),
            json!([combo_option("o-sandwich", "g-food", 1, "p-sandwich", 0, "goods", 600, ""),
                   combo_option("o-beer", "g-drink", 1, "p-beer", 0, "goods", 600, "")]),
            json!([combo_product("p-sandwich", 450, "shop.food"),
                   combo_product("p-beer", 200, "product.generic")]),
            8,
        );
        inp["payload"]["items"][0]["is_gift"] = json!(true);
        inp["payload"]["items"][0]["gift_reason"] = json!("error de cocina");
        let out = sale(inp);
        let lines = sale_lines(&out);
        assert_eq!(lines.len(), 2);
        assert!(lines.iter().all(|l| l["is_gift"] == json!(1)), "las dos, o ninguna");
        assert_eq!(line_totals(&out), vec![0, 0]);
    }

    // ── sales#171 · el stock de un menú lo mueven sus COMPONENTES ─────────────────────────────
    //
    // 🔴 EL FALLO ERA MUDO, que es lo que lo hacía P0. Un combo que se cobra como UNA línea no
    // tiene `product_id` —no es un artículo del catálogo, y una fila con el id del combo sería la
    // línea padre que ADR-0381 prohíbe—, así que `inventory` no tenía a qué agarrarse: caía a la
    // línea, el `WHERE` de su `_decrease_stock` no casaba ninguna fila y el SQL respondía `ok`.
    // El negocio leía «el stock no ha cambiado» mientras servía menús que no descontaban nada.
    //
    // El contrato es GENÉRICO a propósito y lo puso `inventory` (inventory#69): «una línea que
    // lleva `components[]` no vacío cede su stock a ellos». No nombra la palabra «combo», sirve
    // para cualquier línea compuesta que venga después, y por eso `sales` NO gana un `depends_on`
    // de `combos` ni de `inventory` — lo que viaja es el evento.

    #[test]
    fn dos_menus_mueven_el_stock_de_sus_TRES_componentes_y_CERO_del_combo() {
        // Se venden DOS a propósito: la cantidad del componente es ABSOLUTA —con el multiplicador
        // de la línea YA aplicado, porque `items[].quantity` significa exactamente eso y un mismo
        // payload no puede decir dos cosas en dos niveles de anidamiento—. Con UN solo menú
        // «absoluta» y «por unidad de combo» valen lo mismo y el test pasaría con la lectura
        // equivocada; solo se rompe al vender dos.
        let out = sale(menu_del_dia(2_000_000));

        // Prestación única: UNA línea al tipo del combo, sin `product_id` propio.
        let lines = sale_lines(&out);
        assert_eq!(lines.len(), 1, "un menú del día es UNA línea");
        assert_eq!(lines[0]["product_id"], Value::Null, "un combo no es un artículo del catálogo");

        let moves = stock_movements(&out);
        assert_eq!(
            moves,
            vec![("p-salad".to_string(), 2_000_000),
                 ("p-hake".to_string(), 2_000_000),
                 ("p-flan".to_string(), 2_000_000)],
            "un movimiento por componente, con la cantidad de los DOS menús: {moves:?}"
        );
        // Seis unidades de stock salen del almacén (3 platos × 2 menús), en punto fijo 10⁶.
        assert_eq!(moves.iter().map(|(_, q)| *q).sum::<i64>(), 6_000_000);
        assert!(!moves.iter().any(|(id, _)| id == "c-1"),
                "el combo NUNCA aparece en un movimiento: su id no es un artículo y el SQL diría `ok` sin mover nada");

        // Y el evento lo dice con los campos que una LÍNEA ya tiene, que es lo que `inventory` lee.
        let comps = out.events[0].payload["items"][0]["components"].as_array().expect("components[]");
        assert_eq!(comps.len(), 3);
        assert_eq!(comps[0]["product_id"], json!("p-salad"));
        assert_eq!(comps[0]["product_name"], json!("Ensalada"));
        assert_eq!(comps[0]["quantity"], json!(2_000_000));
        assert_eq!(comps[0]["is_service"], json!(false), "el plato es un BIEN aunque el menú se sirva");
        // El snapshot del combo se queda donde estaba: `invoice` nombra el menú con él y `kitchen`
        // enruta por él. Esto es ADITIVO.
        assert_eq!(out.events[0].payload["items"][0]["combo"]["combo_id"], json!("c-1"));
    }

    #[test]
    fn cuando_el_combo_SI_se_parte_el_stock_no_se_descuenta_DOS_veces() {
        // El caso que más fácil se cuela. `goods` con tipos distintos se materializa como UNA
        // LÍNEA POR COMPONENTE (regla 2 de ADR-0381): cada hermana YA es un componente, con su
        // `product_id` y la cantidad heredada del combo. Colgarles ADEMÁS el `components[]` del
        // menú descontaría cada artículo una vez por hermana — 2 × 2 = 4 unidades donde tocan 2.
        let mut inp = combo_input(
            json!([{ "option_id": "o-sandwich", "product_name": "Bocadillo" },
                   { "option_id": "o-beer", "product_name": "Cerveza" }]),
            json!([combo_option("o-sandwich", "g-food", 1, "p-sandwich", 0, "goods", 600, ""),
                   combo_option("o-beer", "g-drink", 1, "p-beer", 0, "goods", 600, "")]),
            json!([combo_product("p-sandwich", 450, "shop.food"),
                   combo_product("p-beer", 200, "product.generic")]),
            8,
        );
        inp["payload"]["items"][0]["quantity"] = json!(2_000_000); // DOS packs
        let out = sale(inp);

        assert_eq!(sale_lines(&out).len(), 2, "dos tipos, dos líneas hermanas");
        let moves = stock_movements(&out);
        assert_eq!(
            moves,
            vec![("p-sandwich".to_string(), 2_000_000), ("p-beer".to_string(), 2_000_000)],
            "UNA vez cada artículo: la hermana ya ES el componente — {moves:?}"
        );
        // Y el evento no cuelga un `components[]` de una línea que ya se mueve a sí misma.
        for item in out.events[0].payload["items"].as_array().expect("items") {
            assert_eq!(item["components"], Value::Null,
                       "una hermana no lleva componentes: los llevaría dos veces");
        }
    }

    #[test]
    fn un_pack_de_bienes_a_UN_solo_tipo_tambien_mueve_el_stock_de_sus_partes() {
        // `goods` cuyos componentes tributan IGUAL: cero reparto, UNA línea con el precio cerrado
        // (y por tanto sin `product_id`). Es el mismo agujero que el menú del día, por otro camino
        // — el que se olvida quien arregla solo el caso `service`.
        let out = sale(combo_input(
            json!([{ "option_id": "o-sandwich", "product_name": "Bocadillo" },
                   { "option_id": "o-water", "product_name": "Agua" }]),
            json!([combo_option("o-sandwich", "g-food", 1, "p-sandwich", 0, "goods", 600, ""),
                   combo_option("o-water", "g-drink", 1, "p-water", 0, "goods", 600, "")]),
            json!([combo_product("p-sandwich", 450, "shop.food"),
                   combo_product("p-water", 200, "shop.food")]),
            8,
        ));
        assert_eq!(sale_lines(&out).len(), 1, "un solo tipo, una sola línea");
        assert_eq!(stock_movements(&out),
                   vec![("p-sandwich".to_string(), 1_000_000), ("p-water".to_string(), 1_000_000)]);
    }

    #[test]
    fn un_componente_que_es_un_SERVICIO_no_mueve_stock_y_no_impide_que_lo_muevan_los_demas() {
        // El pack de peluquería: corte (servicio, sin stock) + champú (producto). Que un
        // componente no tenga existencias es lo NORMAL dentro de un combo, no un error: se salta
        // ese y se descuenta el otro. Tratarlo como fallo dejaría el pack entero sin mover nada.
        let mut options = json!([combo_option("o-cut", "g-service", 1, "s-cut", 0, "service", 3000, "shop.food"),
                                 combo_option("o-shampoo", "g-goods", 1, "p-shampoo", 0, "service", 3000, "shop.food")]);
        options[0]["source"] = json!("service");
        let out = sale(combo_input(
            json!([{ "option_id": "o-cut", "product_name": "Corte" },
                   { "option_id": "o-shampoo", "product_name": "Champú" }]),
            options,
            json!([]),
            8,
        ));
        assert_eq!(stock_movements(&out), vec![("p-shampoo".to_string(), 1_000_000)],
                   "el servicio se salta; el champú se descuenta igual");
    }

    #[test]
    fn una_linea_normal_sigue_moviendo_SU_propio_stock() {
        // Control (el 100 % de las ventas de hoy): sin combo no hay `components[]`, y la línea
        // sigue siendo su propia unidad de stock. Si esto se pusiera rojo, el arreglo habría
        // dejado de descontar en todo el producto.
        let mut inp = input(json!([{ "product_id": "p-coffee", "product_name": "Café", "price": 150,
                                     "quantity": 3_000_000, "tax_rate": 10.0 }]), 3, 450);
        inp["context"]["country_code"] = json!("ES");
        inp["context"]["reads"] = json!({
            "taxes.rules.list": combo_rules(),
            "inventory.products.for_sale": [combo_product("p-coffee", 150, "shop.food")],
        });
        let out = sale(inp);
        assert_eq!(stock_movements(&out), vec![("p-coffee".to_string(), 3_000_000)]);
        assert_eq!(out.events[0].payload["items"][0]["components"], Value::Null,
                   "una línea suelta no se inventa componentes");
    }

    #[test]
    fn una_venta_con_MAS_lineas_que_ids_se_rechaza_en_vez_de_colisionar_en_la_BD() {
        // La tanda de ids del host es finita (256) y un combo MULTIPLICA líneas. Sin guard, la
        // línea 256 salía con id VACÍO y el fallo aparecía como una colisión de clave primaria en
        // la BD, lejos de su causa — y con la venta a medio escribir.
        let items: Vec<Value> = (0..300)
            .map(|i| json!({ "product_name": format!("Item {i}"), "price": 100,
                             "quantity": 1_000_000, "tax_rate": 10.0 }))
            .collect();
        let err = complete_sale_pure(input(json!(items), 256, 0)).refused("no caben");
        assert_eq!(err.code, "sales.too_many_lines", "código estable: {err:?}");
    }

    // ── kitchen#54 · las líneas de la comanda las pone el SERVIDOR ────────────────────────────
    //
    // El KDS recibía comandas VACÍAS: tarjeta con su número y su cronómetro, cero productos, sin
    // rejilla por estación y sin botón «Listo». `sales.order.fire` declara desde siempre una read
    // de `sales.order.lines` filtrada por `payload.order_id` —la puerta que aplica `hub_id` y el
    // permiso— pero el handler la usaba SOLO para el guard del doble toque: las líneas que
    // viajaban en `order.fired` salían de `payload.items`, o sea del navegador. Quien llamara al
    // comando sin repetir el carrito (la API, el asistente, una integración, un POS a medio
    // cargar) disparaba una comanda en blanco, y nada fallaba: 200 OK y cocina a ciegas.
    //
    // Es además el agujero que dejaba fabricar una comanda con un `order_id` INEXISTENTE.

    /// Fila tal y como la devuelve `sales.order.lines` (columnas reales de la query).
    fn line_row(id: &str, name: &str, qty: i64, price: i64) -> Value {
        json!({
            "id": id, "order_id": "ord-1", "product_id": "p-1", "product_name": name,
            "product_sku": "", "quantity": qty, "unit_price": price, "is_gift": 0,
            "gift_reason": "", "line_total": price, "tax_category_key": "standard", "cost": 0,
            "is_service": 0, "round_no": null, "fired_at": null, "category_id": "cat-tapas",
            "discount_percent": 0, "modifiers": "[]"
        })
    }

    /// Disparo tal y como llega por la API: SOLO el id del pedido. Sin `items` en el payload.
    fn fire_from_server(lines: Value, catalog: Option<Value>) -> Value {
        let mut reads = json!({ "sales.order.lines": lines });
        if let Some(c) = catalog {
            reads["modifiers.options.all"] = c;
        }
        json!({
            "payload": { "order_id": "ord-1", "label": "Mesa 4", "channel": "dine_in" },
            "context": { "hub_id": "h1", "current_user_id": "u1",
                         "now": "2026-08-24T13:00:00+00:00", "new_ids": [], "reads": reads }
        })
    }

    #[test]
    fn firing_an_order_takes_its_lines_from_the_server_not_from_the_payload() {
        let out = fire_order_pure(fire_from_server(
            json!([line_row("li-1", "Tortilla pincho", 1_000_000, 350),
                   line_row("li-2", "Vermut", 2_000_000, 300)]),
            None,
        ))
        .accepted("fire ok");

        let items = out.events[0].payload["items"].as_array().expect("items");
        assert_eq!(items.len(), 2, "la comanda sale con las dos líneas del pedido: {items:?}");
        assert_eq!(items[0]["product_name"], json!("Tortilla pincho"));
        assert_eq!(items[0]["quantity"], json!(1_000_000), "punto fijo 10⁶, ADR-0147");
        assert_eq!(items[0]["unit_price"], json!(350));
        assert_eq!(items[0]["category_id"], json!("cat-tapas"), "sin esto no hay enrutado por estación");
        assert_eq!(items[0]["order_item_id"], json!("li-1"), "kitchen reparte anulaciones por este id");
        assert_eq!(items[1]["product_name"], json!("Vermut"));
    }

    #[test]
    fn an_order_with_no_lines_here_is_refused_instead_of_firing_an_empty_ticket() {
        // El `order_id` no existe en este hub (o el pedido está vacío): la read vuelve sin filas.
        // Fabricar igualmente una comanda es lo que dejó pasar un id BASURA y colgó de él una
        // tarjeta en blanco en el KDS. Sin líneas no hay nada que cocinar: se rechaza y NO se emite.
        let err = fire_order_pure(fire_from_server(json!([]), None))
            .refused("un pedido sin líneas no es una comanda");
        assert_eq!(err.code, "sales.nothing_to_fire", "{err:?}");
    }

    #[test]
    fn the_stored_modifiers_snapshot_is_parsed_before_it_reaches_the_kitchen() {
        // 🔴 `sales_order_item.modifiers` es una columna TEXT: la read la devuelve como CADENA
        // (`[{"option_id":"o-cheese"}]`), no como lista. Pasarla tal cual a cocina imprimiría el
        // JSON crudo por la térmica — `modifiers_for_display` trata una cadena como «formato
        // antiguo, ya escrito». Se parsea aquí, y el nombre lo sigue resolviendo el servidor.
        let mut row = line_row("li-1", "Hamburguesa", 1_000_000, 900);
        row["modifiers"] = json!(r#"[{"option_id":"o-cheese"},{"option_id":"o-no-onion"}]"#);
        let out = fire_order_pure(fire_from_server(json!([row]), Some(catalogo_cocina())))
            .accepted("fire ok");

        let ms = out.events[0].payload["items"][0]["modifiers"].as_array().expect("lista de suplementos").clone();
        assert_eq!(ms.len(), 2, "en su ORDEN de elección: {ms:?}");
        assert_eq!(ms[0]["option_id"], json!("o-cheese"));
        assert_eq!(ms[0]["kitchen_name"], json!("Extra de queso"), "kitchen_name vacío → el comercial");
        assert_eq!(ms[1]["kitchen_name"], json!("SIN CEBOLLA"));
    }

    #[test]
    fn a_gifted_line_carries_its_reason_as_the_note_for_the_cook() {
        // El motivo de una invitación es información de SALA que el cocinero necesita ver, y es
        // lo único que el POS metía en `notes`. Está en la fila (`is_gift`/`gift_reason`), así que
        // se deriva del servidor como todo lo demás.
        let mut row = line_row("li-1", "Postre", 1_000_000, 400);
        row["is_gift"] = json!(1);
        row["gift_reason"] = json!("cumpleaños");
        let out = fire_order_pure(fire_from_server(json!([row]), None)).accepted("fire ok");
        assert_eq!(out.events[0].payload["items"][0]["notes"], json!("cumpleaños"));
    }

    #[test]
    fn a_round_fires_only_the_lines_still_pending() {
        // Tandas: la ronda 2 manda lo NUEVO. La línea que ya salió no se vuelve a cocinar.
        let mut ya = line_row("li-1", "Entrecot", 1_000_000, 1800);
        ya["fired_at"] = json!("2026-08-24T12:50:00+00:00");
        ya["round_no"] = json!(1);
        let mut inp = fire_from_server(json!([ya, line_row("li-2", "Postre", 1_000_000, 400)]), None);
        inp["payload"]["round_no"] = json!(2);

        let out = fire_order_pure(inp).accepted("hay una línea nueva");
        let items = out.events[0].payload["items"].as_array().expect("items");
        assert_eq!(items.len(), 1, "solo lo pendiente: {items:?}");
        assert_eq!(items[0]["product_name"], json!("Postre"));
    }

    #[test]
    fn a_service_line_still_travels_and_kitchen_decides_it_does_not_cook_it() {
        // `is_service` viaja con la línea: quien filtra es cocina (mismo criterio que inventory).
        let mut corte = line_row("li-1", "Corte de pelo", 1_000_000, 1500);
        corte["is_service"] = json!(1);
        let out = fire_order_pure(fire_from_server(json!([corte]), None)).accepted("fire ok");
        assert_eq!(out.events[0].payload["items"][0]["is_service"], json!(true));
    }

    // ── ADR-0386 · one sale, N tenders: mixed payment is TREASURY, not fiscal ────────────────────
    //
    // The split-tender core (sales#158). Everything below states the same thing from a different
    // angle: the money can arrive in N pieces, and NOTHING above the cash drawer is allowed to
    // notice. The fiscal record, its hash and its chain link are byte-identical whether the
    // customer paid with one card or with a card, a note and a transfer.

    /// A hub that really has the three families a mixed payment mixes.
    fn mixed_catalog() -> Value {
        json!([
            { "id": "pm-cash", "name": "Efectivo", "type": "cash" },
            { "id": "pm-card", "name": "Tarjeta", "type": "card" },
            { "id": "pm-wire", "name": "Transferencia", "type": "transfer" }
        ])
    }

    /// 121,00 € gross (100,00 € base + 21,00 € VAT) — the cart every fiscal comparison below uses.
    fn cart_121() -> Value {
        json!([{ "product_name": "Menú", "price": 12100, "quantity": 1_000_000, "tax_rate": 21.0 }])
    }

    /// `complete_sale` input carrying `payments[]` against the mixed catalog.
    fn input_with_payments(items: Value, ids: usize, payments: Value) -> Value {
        let mut inp = input_with_catalogs(items, ids, mixed_catalog(), Value::Null, Value::Null);
        inp["payload"]["payments"] = payments;
        // The scalars are what a single-tender caller sends; with `payments[]` present they are
        // DERIVED, never trusted — removing them here proves the derivation is real.
        inp["payload"].as_object_mut().unwrap().remove("payment_method_id");
        inp["payload"].as_object_mut().unwrap().remove("payment_method_name");
        inp["payload"].as_object_mut().unwrap().remove("amount_tendered");
        inp
    }

    fn payment_ops(out: &Output) -> Vec<&Operation> {
        out.operations.iter().filter(|o| o.command == "sales._insert_payment").collect()
    }

    #[test]
    fn every_tender_becomes_its_own_row() {
        // The whole point of the child table: three ways of paying are three rows, in the order
        // the cashier took them, each with the method the CATALOG says it is.
        let out = sale(input_with_payments(
            cart_121(),
            8,
            json!([
                { "payment_method_id": "pm-card", "amount": 5000 },
                { "payment_method_id": "pm-cash", "amount": 5000, "amount_tendered": 5000 },
                { "payment_method_id": "pm-wire", "amount": 2100, "reference": "TRF-99" }
            ]),
        ));
        let pays = payment_ops(&out);
        assert_eq!(pays.len(), 3, "one row per tender");
        assert_eq!(pays[0].params["amount"], json!(5000));
        assert_eq!(pays[0].params["payment_method_type"], json!("card"));
        assert_eq!(pays[0].params["sort_order"], json!(0));
        assert_eq!(pays[1].params["payment_method_type"], json!("cash"));
        assert_eq!(pays[1].params["sort_order"], json!(1));
        assert_eq!(pays[2].params["amount"], json!(2100));
        assert_eq!(pays[2].params["reference"], json!("TRF-99"));
        assert_eq!(pays[2].params["sort_order"], json!(2));
        // The NAME is the hub's, never the browser's (same rule as the scalar path, sales#20).
        assert_eq!(pays[2].params["payment_method_name"], json!("Transferencia"));
        // Each row is addressable and belongs to the sale being created.
        assert_eq!(pays[0].params["sale_id"], json!("id-0"));
        assert_ne!(pays[0].params["payment_id"], pays[1].params["payment_id"]);
    }

    #[test]
    fn a_tender_outside_the_trusted_catalog_is_rejected() {
        // Same door as the scalar path: the catalog the runtime pre-loads is the only authority,
        // so a deleted, deactivated or foreign method cannot enter through `payments[]` instead.
        let err = complete_sale_pure(input_with_payments(
            cart_121(),
            8,
            json!([
                { "payment_method_id": "pm-ghost", "amount": 12100 }
            ]),
        ))
        .refused("unknown tender");
        assert_eq!(err.code, "sales.payment_method_not_available", "{err:?}");
    }

    #[test]
    fn the_change_comes_out_of_the_cash_tender_and_is_never_prorated() {
        // 🔴 ADR-0386 decision 2, and the exact bug Odoo ships (PR#194284): paying 121,00 € with
        // 50,00 € on card and 90,00 € in notes gives 19,00 € back — and that change came out of
        // the DRAWER, so it belongs to the cash tender. Odoo prorates it onto the bank line, and
        // from then on the receipt and the database disagree and the count never squares.
        let out = sale(input_with_payments(
            cart_121(),
            8,
            json!([
                { "payment_method_id": "pm-card", "amount": 5000 },
                { "payment_method_id": "pm-cash", "amount": 7100, "amount_tendered": 9000 }
            ]),
        ));
        let pays = payment_ops(&out);
        // The card leg is untouched: it covered 50,00 € and nothing came back through it.
        assert_eq!(pays[0].params["amount"], json!(5000));
        assert_eq!(pays[0].params["amount_tendered"], json!(5000));
        assert_eq!(pays[0].params["change_due"], json!(0));
        // The cash leg carries the whole 19,00 €.
        assert_eq!(pays[1].params["amount"], json!(7100));
        assert_eq!(pays[1].params["amount_tendered"], json!(9000));
        assert_eq!(pays[1].params["change_due"], json!(1900));
    }

    #[test]
    fn without_a_cash_tender_there_is_no_change_at_all() {
        // ADR-0386: overpaying by card does not exist — the exact amount is charged. Handing the
        // change to a card tender would invent money leaving a drawer that never opened.
        let out = sale(input_with_payments(
            cart_121(),
            8,
            json!([
                { "payment_method_id": "pm-card", "amount": 6100, "amount_tendered": 9000 },
                { "payment_method_id": "pm-wire", "amount": 6000 }
            ]),
        ));
        let pays = payment_ops(&out);
        assert_eq!(pays[0].params["change_due"], json!(0));
        assert_eq!(pays[0].params["amount_tendered"], json!(6100), "normalised to the exact amount");
        let header = out.operations.iter().find(|o| o.command == "sales._insert_sale").expect("header");
        assert_eq!(header.params["change_due"], json!(0));
        assert_eq!(header.params["amount_tendered"], json!(12100));
    }

    #[test]
    fn tenders_that_do_not_add_up_to_the_total_are_refused_not_absorbed() {
        // A cent short and a cent over are both a mismatch, and both are REFUSED. Accepting either
        // one quietly is how a till ends the day with a number nobody can explain.
        for (label, payments) in [
            (
                "short",
                json!([
                    { "payment_method_id": "pm-card", "amount": 5000 },
                    { "payment_method_id": "pm-cash", "amount": 7099, "amount_tendered": 7099 }
                ]),
            ),
            (
                "over",
                json!([
                    { "payment_method_id": "pm-card", "amount": 5000 },
                    { "payment_method_id": "pm-cash", "amount": 7101, "amount_tendered": 7101 }
                ]),
            ),
        ] {
            let err = complete_sale_pure(input_with_payments(cart_121(), 8, payments))
                .refused("mismatch must be refused");
            assert_eq!(err.code, "sales.payments_do_not_match_total", "{label}: {err:?}");
        }
    }

    #[test]
    fn a_cash_tender_handing_over_less_than_its_share_is_refused() {
        // The per-tender twin of sales#24: a cash leg that covers 71,00 € but only 50,00 € was put
        // on the counter used to close with the drawer silently short.
        let err = complete_sale_pure(input_with_payments(
            cart_121(),
            8,
            json!([
                { "payment_method_id": "pm-card", "amount": 5000 },
                { "payment_method_id": "pm-cash", "amount": 7100, "amount_tendered": 5000 }
            ]),
        ))
        .refused("short cash leg");
        assert_eq!(err.code, "sales.insufficient_tendered", "{err:?}");
    }

    #[test]
    fn the_header_scalars_derive_from_the_principal_tender() {
        // The scalars stay while consumers still read them, but they stop being an INPUT: they are
        // the principal tender (the largest leg), resolved from the catalog. The two money scalars
        // are the aggregate, so `amount_tendered - change_due == total` still holds on the header.
        let out = sale(input_with_payments(
            cart_121(),
            8,
            json!([
                { "payment_method_id": "pm-cash", "amount": 2100, "amount_tendered": 5000 },
                { "payment_method_id": "pm-card", "amount": 10000 }
            ]),
        ));
        let header = out.operations.iter().find(|o| o.command == "sales._insert_sale").expect("header");
        assert_eq!(header.params["payment_method_id"], json!("pm-card"), "the largest leg leads");
        assert_eq!(header.params["payment_method_name"], json!("Tarjeta"));
        // 50,00 € of notes for a 21,00 € leg + 100,00 € on card = 150,00 € handed over, 29,00 €
        // back. The identity that has to hold is `tendered - change == total`, not `tendered == total`.
        assert_eq!(header.params["amount_tendered"], json!(15000));
        assert_eq!(header.params["change_due"], json!(2900));
        let tendered = header.params["amount_tendered"].as_i64().unwrap();
        let change = header.params["change_due"].as_i64().unwrap();
        assert_eq!(tendered - change, header.params["total"].as_i64().unwrap());
    }

    #[test]
    fn sale_completed_carries_every_tender() {
        // `cash_register` cannot square a mixed sale from a single scalar: it needs the legs, with
        // their canonical TYPE, to know how much of the 121,00 € actually entered the drawer.
        let out = sale(input_with_payments(
            cart_121(),
            8,
            json!([
                { "payment_method_id": "pm-card", "amount": 10000 },
                { "payment_method_id": "pm-cash", "amount": 2100, "amount_tendered": 5000 }
            ]),
        ));
        let event = out.events.iter().find(|e| e.name == "sale.completed").expect("event");
        let payments = event.payload["payments"].as_array().expect("payments[] in the event");
        assert_eq!(payments.len(), 2);
        assert_eq!(payments[0]["payment_method_type"], json!("card"));
        assert_eq!(payments[0]["amount"], json!(10000));
        assert_eq!(payments[1]["payment_method_type"], json!("cash"));
        assert_eq!(payments[1]["amount"], json!(2100));
        assert_eq!(payments[1]["change_due"], json!(2900));
        // Only the cash leg net of its change reaches the drawer: 21,00 €. That is the number the
        // count has to show, and it is derivable from the event alone.
        let into_drawer: i64 = payments
            .iter()
            .filter(|p| p["payment_method_type"] == json!("cash"))
            .map(|p| p["amount"].as_i64().unwrap_or(0))
            .sum();
        assert_eq!(into_drawer, 2100);
    }

    #[test]
    fn a_sale_without_payments_still_records_its_single_tender() {
        // Back-compat: every caller alive today (and the touch POS until sales#159 lands) sends the
        // scalars. That sale is a one-tender sale, and it gets its row like any other — otherwise
        // the child table would be empty for every sale taken before the new screen ships.
        let mut inp = input_with_catalogs(cart_121(), 8, mixed_catalog(), Value::Null, Value::Null);
        inp["payload"]["payment_method_id"] = json!("pm-card");
        let out = sale(inp);
        let pays = payment_ops(&out);
        assert_eq!(pays.len(), 1, "the single tender is still a row");
        assert_eq!(pays[0].params["amount"], json!(12100), "the single leg covers the whole total");
        assert_eq!(pays[0].params["payment_method_id"], json!("pm-card"));
        assert_eq!(pays[0].params["payment_method_type"], json!("card"));
        assert_eq!(pays[0].params["sort_order"], json!(0));
    }

    #[test]
    fn the_fiscal_chain_is_identical_with_one_tender_and_with_three() {
        // 🔴🔴 THE point of ADR-0386, and the reason the table is a CHILD instead of a column on
        // the record: how the money arrived is not a field of the fiscal record.
        //
        // Verified in the ADR against the AEAT web-service PDF (101 pages) and
        // `SuministroInformacion.xsd`: ZERO occurrences of `MedioPago` / `FormaPago` / «medio de
        // pago» / «forma de pago», with a POSITIVE CONTROL of 91 for `IDFactura|RegistroAlta|Huella`
        // — so the extraction was working and the absence is real. None of the 31 children of
        // `RegistroFacturacionAltaType` is a payment. Same in TicketBAI v1.1.
        //
        // Therefore: same `RegistroAlta`, same hash, ONE chain link. If this test ever goes red,
        // something has leaked the tender into the fiscal record and the chain has forked.
        let single = sale(input_with_payments(
            cart_121(),
            8,
            json!([{ "payment_method_id": "pm-card", "amount": 12100 }]),
        ));
        let three = sale(input_with_payments(
            cart_121(),
            8,
            json!([
                { "payment_method_id": "pm-card", "amount": 5000 },
                { "payment_method_id": "pm-cash", "amount": 5000, "amount_tendered": 5000 },
                { "payment_method_id": "pm-wire", "amount": 2100 }
            ]),
        ));

        let header = |o: &Output| {
            o.operations
                .iter()
                .find(|op| op.command == "sales._insert_sale")
                .expect("header")
                .params
                .clone()
        };
        let (a, b) = (header(&single), header(&three));

        // Every input the fiscal record is built from — base, quota, per-rate breakdown, gross,
        // document type and the invoice number itself. Not one of them may move.
        for field in [
            "subtotal",
            "tax_amount",
            "tax_breakdown",
            "discount_amount",
            "discount_percent",
            "total",
            "gift_total",
            "document_type",
            "status",
            "day",
        ] {
            assert_eq!(a[field], b[field], "`{field}` moved between 1 and 3 tenders");
        }

        // ONE chain link, not three: a single `sale.completed`, carrying identical fiscal figures.
        let fiscal_events = |o: &Output| {
            o.events.iter().filter(|e| e.name == "sale.completed").count()
        };
        assert_eq!(fiscal_events(&single), 1);
        assert_eq!(fiscal_events(&three), 1, "three tenders are still ONE fiscal event");

        let ev = |o: &Output| {
            let e = o.events.iter().find(|e| e.name == "sale.completed").expect("event");
            json!({
                "total": e.payload["total"],
                "subtotal": e.payload["subtotal"],
                "tax_amount": e.payload["tax_amount"],
                "document_type": e.payload["document_type"],
                "tax_included": e.payload["tax_included"],
                "items": e.payload["items"],
            })
        };
        assert_eq!(ev(&single), ev(&three), "the fiscal half of the event must not move");

        // And the lines — the fiscal unit (ADR-0381) — are identical row for row.
        let lines = |o: &Output| {
            o.operations
                .iter()
                .filter(|op| op.command == "sales._insert_line")
                .map(|op| {
                    json!({
                        "net_amount": op.params["net_amount"],
                        "tax_amount": op.params["tax_amount"],
                        "line_total": op.params["line_total"],
                        "tax_rate": op.params["tax_rate"],
                    })
                })
                .collect::<Vec<_>>()
        };
        assert_eq!(lines(&single), lines(&three));
    }

    #[test]
    fn more_rows_than_the_host_gave_ids_for_is_refused_not_written_with_a_blank_id() {
        // The host hands a fixed batch of ids (`NEW_IDS_BATCH`). Running out must be a LOUD
        // refusal: taking `unwrap_or_default()` would write rows with an empty primary key.
        let err = complete_sale_pure(input_with_payments(
            cart_121(),
            2, // sale + one line, and nothing left for a tender
            json!([{ "payment_method_id": "pm-card", "amount": 12100 }]),
        ))
        .refused("not enough ids");
        assert_eq!(err.code, "sales.too_many_rows", "{err:?}");
    }

    // ── sales#160 · devolver una venta cobrada con VARIOS medios (ADR-0386, decisión 3) ────────
    //
    // El fallo más repetido del mercado y ninguno lo resuelve: Shopify POS prorratea y lo tiene
    // HARDCODED («there's no setting or permission to change it»); Square obliga al tender
    // original «even if the gift card does not exist or has been reused» (reportado en 2018, sin
    // solución en 2021); Odoo genera un asiento inválido al devolver por otro método.
    //
    // Aquí el operador decide, y el servidor solo hace de tope. Dos ejes distintos, que la pantalla
    // confunde si no se separan:
    //
    //   * DE DÓNDE sale el dinero — la pata original (`payment_id`). Su tope es lo que esa pata
    //     cobró menos lo que ya se le devolvió, y pasarse se RECHAZA diciendo CUÁL se pasó.
    //   * A DÓNDE va — el método de destino. Por defecto, el de la propia pata: se devuelve por
    //     donde se cobró. Cuando esa puerta ya no existe (la tarjeta regalo de Square), la pata se
    //     marca NO ELEGIBLE con su motivo y el operador nombra otro destino — que es lo que a
    //     Square le falta. Marcarla y no dejar salida sería el mismo bug con mejores palabras.

    /// Las patas de la venta tal como las devuelve `sales.refund_options`: lo cobrado, lo ya
    /// devuelto, el tope que queda y si su propio método sigue siendo una puerta válida.
    fn refund_options() -> Value {
        json!([
            { "payment_id": "pay-card", "sort_order": 0, "payment_method_id": "pm-card",
              "payment_method_name": "Tarjeta", "payment_method_type": "card",
              "charged": 5000, "refunded": 0, "remaining": 5000, "refundable": 1, "reason": "" },
            { "payment_id": "pay-cash", "sort_order": 1, "payment_method_id": "pm-cash",
              "payment_method_name": "Efectivo", "payment_method_type": "cash",
              "charged": 2000, "refunded": 0, "remaining": 2000, "refundable": 1, "reason": "" }
        ])
    }

    fn refund_methods() -> Value {
        json!([
            { "id": "pm-card", "name": "Tarjeta", "type": "card", "is_active": 1 },
            { "id": "pm-cash", "name": "Efectivo", "type": "cash", "is_active": 1 }
        ])
    }

    fn refunded_sale() -> Value {
        json!([{ "id": "sale-1", "sale_number": "20260824-0007", "status": "completed",
                 "document_type": "ticket", "total": 7000, "order_id": "ord-9" }])
    }

    fn refund_input(allocations: Value) -> Value {
        refund_input_with(allocations, refund_options(), refunded_sale())
    }

    fn refund_input_with(allocations: Value, options: Value, sale: Value) -> Value {
        let mut reads = Map::new();
        if !sale.is_null() { reads.insert("sales.get".into(), sale); }
        if !options.is_null() { reads.insert("sales.refund_options".into(), options); }
        reads.insert("sales.payment_methods".into(), refund_methods());
        reads.insert("sales.refund_by_idempotency_key".into(), json!([]));
        json!({
            "payload": { "sale_id": "sale-1", "reason": "el cliente devuelve el producto",
                         "idempotency_key": "idem-refund-0001", "allocations": allocations },
            "context": { "hub_id": "h1", "current_user_id": "u-manager",
                         "now": "2026-08-24T12:00:00+00:00",
                         "new_ids": ["ref-1", "ref-line-1", "ref-line-2", "ref-line-3"],
                         "reads": reads }
        })
    }

    #[test]
    fn devolver_mas_de_lo_cobrado_por_UNA_pata_se_rechaza_diciendo_cual_se_paso() {
        // 🔴 EL test de la issue. 70,00 € cobrados como 50,00 € en tarjeta + 20,00 € en efectivo.
        // El operador teclea 25,00 € al efectivo: son 5,00 € que esa pata NUNCA cobró. Aceptarlo
        // sacaría del cajón dinero que no entró por él, y el arqueo cerraría corto sin que nadie
        // pueda explicar por qué. Se rechaza — y el mensaje NOMBRA la pata, porque «no cuadra» a
        // secas obliga al cajero a adivinar cuál de las tres tocar.
        let err = refund_sale_pure(refund_input(json!([
            { "payment_id": "pay-card", "amount": 5000 },
            { "payment_id": "pay-cash", "amount": 2500 }
        ])))
        .refused("25,00 € sobre una pata que cobró 20,00 €");

        assert_eq!(err.code, "sales.refund_exceeds_tender", "{err:?}");
        assert!(err.message.contains("Efectivo"), "el rechazo dice CUÁL se pasó: {err:?}");
        assert!(err.message.contains("2500") && err.message.contains("2000"), "y con cuánto se pasó: {err:?}");
        // Y no nombra a la inocente: la tarjeta iba justa de tope.
        assert!(!err.message.contains("Tarjeta"), "solo se nombra la pata que se pasó: {err:?}");
    }

    #[test]
    fn el_tope_de_una_pata_es_lo_que_QUEDA_no_lo_que_cobro() {
        // Segunda devolución parcial sobre la misma venta: de los 50,00 € de la tarjeta ya
        // volvieron 15,00 €. Pedir 40,00 € es menos de lo que cobró y aun así son 5,00 € de más.
        // Sin esta resta, dos devoluciones parciales devuelven más que la venta entera — que es
        // como se vacía una caja sin que salte ninguna alarma.
        let mut options = refund_options();
        options[0]["refunded"] = json!(1500);
        options[0]["remaining"] = json!(3500);

        let err = refund_sale_pure(refund_input_with(
            json!([{ "payment_id": "pay-card", "amount": 4000 }]),
            options,
            refunded_sale(),
        ))
        .refused("40,00 € sobre un resto de 35,00 €");
        assert_eq!(err.code, "sales.refund_exceeds_tender", "{err:?}");
        assert!(err.message.contains("Tarjeta"), "{err:?}");
    }

    #[test]
    fn el_reparto_lo_decide_el_operador_y_se_escribe_pata_a_pata() {
        // Reparto NO proporcional a propósito: 30,00 € que el operador manda enteros a la tarjeta,
        // aunque el prorrateo habría propuesto 21,43 / 8,57. La propuesta es una propuesta.
        let out = refund_sale_pure(refund_input(json!([
            { "payment_id": "pay-card", "amount": 3000 }
        ])))
        .accepted("devolución válida");

        let head = out.operations.iter().find(|o| o.command == "sales._insert_refund").expect("cabecera");
        assert_eq!(head.params["refund_id"], json!("ref-1"));
        assert_eq!(head.params["sale_id"], json!("sale-1"));
        assert_eq!(head.params["total"], json!(3000));
        assert_eq!(head.params["idempotency_key"], json!("idem-refund-0001"));

        let legs: Vec<&Operation> = out.operations.iter()
            .filter(|o| o.command == "sales._insert_refund_payment").collect();
        assert_eq!(legs.len(), 1, "una fila por pata devuelta");
        assert_eq!(legs[0].params["payment_id"], json!("pay-card"));
        assert_eq!(legs[0].params["amount"], json!(3000));
        // El nombre y el tipo salen del CATÁLOGO, no del navegador (mismo criterio que el cobro).
        assert_eq!(legs[0].params["payment_method_id"], json!("pm-card"));
        assert_eq!(legs[0].params["payment_method_name"], json!("Tarjeta"));
        assert_eq!(legs[0].params["payment_method_type"], json!("card"));
    }

    #[test]
    fn una_pata_no_elegible_no_falla_al_confirmar_dice_su_motivo() {
        // El caso de Square: la tarjeta con la que se cobró ya no existe en el catálogo. Devolver
        // ahí no es posible, pero eso se sabe ANTES de confirmar y se dice con su motivo, en vez
        // de reventar al pulsar el botón.
        let mut options = refund_options();
        options[0]["refundable"] = json!(0);
        options[0]["reason"] = json!("method_unavailable");

        let err = refund_sale_pure(refund_input_with(
            json!([{ "payment_id": "pay-card", "amount": 3000 }]),
            options,
            refunded_sale(),
        ))
        .refused("la pata no admite su propio método");
        assert_eq!(err.code, "sales.refund_tender_not_eligible", "{err:?}");
        assert!(err.message.contains("method_unavailable"), "el motivo viaja: {err:?}");
        assert!(err.message.contains("Tarjeta"), "y CUÁL: {err:?}");
    }

    #[test]
    fn una_pata_no_elegible_SI_sale_por_otro_destino_que_el_operador_nombra() {
        // Y aquí está la diferencia con Square, que marca el problema y deja al cajero encerrado:
        // el dinero de una pata inservible sale por el destino que el operador elige. El tope
        // sigue siendo el de la pata de ORIGEN — se devuelve lo que entró por ella, ni un céntimo
        // más — pero por la puerta que hoy funciona.
        let mut options = refund_options();
        options[0]["refundable"] = json!(0);
        options[0]["reason"] = json!("method_unavailable");

        let out = refund_sale_pure(refund_input_with(
            json!([{ "payment_id": "pay-card", "amount": 3000, "to_payment_method_id": "pm-cash" }]),
            options,
            refunded_sale(),
        ))
        .accepted("con destino explícito, la devolución sale");

        let leg = out.operations.iter()
            .find(|o| o.command == "sales._insert_refund_payment").expect("la pata");
        assert_eq!(leg.params["payment_id"], json!("pay-card"), "el origen sigue siendo la tarjeta");
        assert_eq!(leg.params["payment_method_id"], json!("pm-cash"), "pero vuelve en efectivo");
        assert_eq!(leg.params["payment_method_type"], json!("cash"));
        assert_eq!(leg.params["amount"], json!(3000));
    }

    #[test]
    fn el_destino_tiene_que_existir_en_el_catalogo_del_hub() {
        let err = refund_sale_pure(refund_input(json!([
            { "payment_id": "pay-card", "amount": 1000, "to_payment_method_id": "pm-ghost" }
        ])))
        .refused("destino inventado");
        assert_eq!(err.code, "sales.refund_method_unavailable", "{err:?}");
    }

    #[test]
    fn una_pata_ya_devuelta_entera_no_admite_ni_un_centimo_mas() {
        let mut options = refund_options();
        options[1]["refunded"] = json!(2000);
        options[1]["remaining"] = json!(0);
        options[1]["refundable"] = json!(0);
        options[1]["reason"] = json!("already_refunded");

        let err = refund_sale_pure(refund_input_with(
            json!([{ "payment_id": "pay-cash", "amount": 1 }]),
            options,
            refunded_sale(),
        ))
        .refused("ya devuelta");
        assert_eq!(err.code, "sales.refund_exceeds_tender", "{err:?}");
        assert!(err.message.contains("Efectivo"), "{err:?}");
    }

    #[test]
    fn una_pata_que_no_es_de_esta_venta_se_rechaza() {
        let err = refund_sale_pure(refund_input(json!([
            { "payment_id": "pay-de-otra-venta", "amount": 100 }
        ])))
        .refused("pata ajena");
        assert_eq!(err.code, "sales.refund_tender_unknown", "{err:?}");
    }

    #[test]
    fn la_misma_pata_dos_veces_en_el_mismo_reparto_se_rechaza() {
        // Dos filas de 2.000 sobre una pata de 2.000 pasan el tope UNA a UNA y lo rompen juntas.
        let err = refund_sale_pure(refund_input(json!([
            { "payment_id": "pay-cash", "amount": 2000 },
            { "payment_id": "pay-cash", "amount": 2000 }
        ])))
        .refused("pata repetida");
        assert_eq!(err.code, "sales.refund_tender_duplicated", "{err:?}");
    }

    #[test]
    fn un_importe_que_no_es_dinero_positivo_se_rechaza() {
        for amount in [json!(0), json!(-100), json!("mucho")] {
            let err = refund_sale_pure(refund_input(json!([
                { "payment_id": "pay-cash", "amount": amount }
            ])))
            .refused("importe inválido");
            assert_eq!(err.code, "sales.refund_amount_invalid", "{err:?}");
        }
    }

    #[test]
    fn una_devolucion_sin_nada_que_devolver_se_rechaza() {
        let err = refund_sale_pure(refund_input(json!([]))).refused("sin reparto");
        assert_eq!(err.code, "sales.refund_nothing_to_return", "{err:?}");
    }

    #[test]
    fn el_motivo_es_obligatorio() {
        let mut inp = refund_input(json!([{ "payment_id": "pay-cash", "amount": 100 }]));
        inp["payload"]["reason"] = json!("   ");
        let err = refund_sale_pure(inp).refused("sin motivo");
        assert_eq!(err.code, "sales.refund_reason_required", "{err:?}");
    }

    #[test]
    fn una_venta_ANULADA_no_se_devuelve() {
        let mut sale = refunded_sale();
        sale[0]["status"] = json!("voided");
        let err = refund_sale_pure(refund_input_with(
            json!([{ "payment_id": "pay-cash", "amount": 100 }]),
            refund_options(),
            sale,
        ))
        .refused("venta anulada");
        assert_eq!(err.code, "sales.refund_requires_completed", "{err:?}");
    }

    #[test]
    fn una_venta_CON_FACTURA_si_se_devuelve_la_devolucion_es_camino_normal() {
        // 🔴 Al revés que `sales.void`, que la rechaza con `sales.void_requires_credit_note`. Una
        // venta facturada NO se anula, pero SÍ se devuelve: la devolución es el hecho económico y
        // la rectificativa es su documento (invoice#5 / hub#1023). Si esto rechazara, una venta
        // con factura no tendría reverso ninguno en el TPV.
        let mut sale = refunded_sale();
        sale[0]["document_type"] = json!("invoice");
        let out = refund_sale_pure(refund_input_with(
            json!([{ "payment_id": "pay-cash", "amount": 2000 }]),
            refund_options(),
            sale,
        ))
        .accepted("una venta facturada se devuelve");
        let ev = out.events.iter().find(|e| e.name == "sale.refunded").expect("evento");
        assert_eq!(ev.payload["document_type"], json!("invoice"),
                   "el consumidor fiscal necesita saber que detrás hay una factura que rectificar");
    }

    #[test]
    fn sin_la_read_de_las_patas_no_se_devuelve_a_ciegas() {
        let err = refund_sale_pure(refund_input_with(
            json!([{ "payment_id": "pay-cash", "amount": 100 }]),
            Value::Null,
            refunded_sale(),
        ))
        .refused("sin patas");
        assert_eq!(err.code, "sales.refund_tender_unknown", "{err:?}");
    }

    #[test]
    fn una_venta_que_no_existe_aqui_no_se_devuelve() {
        let err = refund_sale_pure(refund_input_with(
            json!([{ "payment_id": "pay-cash", "amount": 100 }]),
            refund_options(),
            json!([]),
        ))
        .refused("venta ajena");
        assert_eq!(err.code, "sales.sale_not_found", "{err:?}");
    }

    #[test]
    fn el_evento_lleva_refund_ref_ESTABLE_igual_al_id_del_documento() {
        // Lo pidió `services` en la issue: `refund_ref` es la clave de idempotencia de
        // `services.packages.refund_redemption`. Si fuera un uuid nuevo por intento, el segundo
        // reintento se rechazaría como doble devolución del bono — correcto, pero ilegible.
        let out = refund_sale_pure(refund_input(json!([
            { "payment_id": "pay-card", "amount": 5000 },
            { "payment_id": "pay-cash", "amount": 2000 }
        ])))
        .accepted("devolución total");

        let ev = out.events.iter().find(|e| e.name == "sale.refunded").expect("evento");
        assert_eq!(ev.payload["refund_id"], json!("ref-1"));
        assert_eq!(ev.payload["refund_ref"], ev.payload["refund_id"], "la referencia ES el documento");
        assert_eq!(ev.payload["sale_id"], json!("sale-1"));
        assert_eq!(ev.payload["total"], json!(7000));
        assert_eq!(ev.payload["refunded_by"], json!("u-manager"));
        assert_eq!(ev.payload["fully_refunded"], json!(true));
        assert_eq!(ev.payload["payments"].as_array().map(|a| a.len()), Some(2),
                   "las patas viajan: el arqueo las necesita una a una");
        assert_eq!(out.events.iter().filter(|e| e.name == "sale.refunded").count(), 1);

        // Y la referencia vuelve al que llamó, que es como el TPV se la pasa a `services` sin
        // adivinarla ni recomponerla desde la lista.
        let res = out.result.expect("la devolución responde con su documento");
        assert_eq!(res["refund_id"], json!("ref-1"));
        assert_eq!(res["refund_ref"], json!("ref-1"));
        assert_eq!(res["total"], json!(7000));
        assert_eq!(res["already"], json!(false));
    }

    #[test]
    fn una_devolucion_PARCIAL_no_marca_la_venta_como_devuelta() {
        let out = refund_sale_pure(refund_input(json!([
            { "payment_id": "pay-cash", "amount": 1000 }
        ])))
        .accepted("parcial");
        let ev = out.events.iter().find(|e| e.name == "sale.refunded").expect("evento");
        assert_eq!(ev.payload["fully_refunded"], json!(false));
        assert!(!out.operations.iter().any(|o| o.command == "sales._mark_refunded"),
                "la venta sigue viva: quedan 60,00 € cobrados");
    }

    #[test]
    fn cuando_vuelve_el_ultimo_centimo_la_venta_queda_marcada_como_devuelta() {
        // Sin esta marca, la lista de ventas sigue diciendo `completed` sobre una venta que ya no
        // tiene dinero detrás — y el histórico miente en la única pantalla que el dueño mira.
        let out = refund_sale_pure(refund_input(json!([
            { "payment_id": "pay-card", "amount": 5000 },
            { "payment_id": "pay-cash", "amount": 2000 }
        ])))
        .accepted("total");
        let mark = out.operations.iter().find(|o| o.command == "sales._mark_refunded").expect("la marca");
        assert_eq!(mark.params["sale_id"], json!("sale-1"));
    }

    #[test]
    fn un_reintento_con_la_MISMA_clave_no_escribe_nada_y_devuelve_el_MISMO_documento() {
        // Se cae el wifi entre el INSERT y la respuesta y el cajero vuelve a pulsar. Sin esto, el
        // segundo intento es una SEGUNDA devolución: el dinero sale dos veces.
        let mut inp = refund_input(json!([{ "payment_id": "pay-cash", "amount": 2000 }]));
        inp["context"]["reads"]["sales.refund_by_idempotency_key"] =
            json!([{ "id": "ref-ya-escrito", "sale_id": "sale-1", "total": 2000 }]);

        let out = refund_sale_pure(inp).accepted("reintento limpio");
        assert!(out.operations.is_empty(), "un reintento no escribe: {:?}", out.operations);
        assert!(out.events.is_empty(), "ni vuelve a emitir");
        let res = out.result.expect("un reintento SÍ responde: el que llama necesita la referencia");
        assert_eq!(res["already"], json!(true));
        assert_eq!(res["refund_id"], json!("ref-ya-escrito"));
        assert_eq!(res["refund_ref"], json!("ref-ya-escrito"));
    }

    #[test]
    fn sin_ids_del_host_no_se_escriben_filas_con_clave_vacia() {
        let mut inp = refund_input(json!([{ "payment_id": "pay-cash", "amount": 100 }]));
        inp["context"]["new_ids"] = json!(["ref-1"]); // cabecera sí, pata no
        let err = refund_sale_pure(inp).refused("sin ids");
        assert_eq!(err.code, "sales.too_many_rows", "{err:?}");
    }

    // ── sales#169 · el MENÚ sobrevive en una CUENTA ABIERTA ──────────────────────────────────
    //
    // sales#152 dejó el combo cobrable de un tirón, pero el camino del restaurante es otro: abrir
    // cuenta → añadir líneas → disparar a cocina → cobrar media hora después. Y ahí la fila del
    // pedido no tenía dónde guardar de qué menú venía la línea ni qué se eligió.
    //
    // 🔴 El síntoma NO era «el menú se convierte en un plato normal»: `addComboLine` pone el
    // `combo_id` en `product_id`, así que al perderse `combo_id` la línea entra por
    // `is_catalog_line` → `authoritative_price` busca el combo en el catálogo de PRODUCTOS, no lo
    // encuentra, y el cobro entero se RECHAZA con `sales.product_not_available`. La mesa que pidió
    // el menú del día no podía pagar.
    //
    // Lo que se congela en la fila del pedido es la COMPOSICIÓN (qué menú y qué se eligió, en su
    // orden), nunca dinero: el `line_total` del pedido sigue siendo provisional y el precio lo
    // decide `complete_sale` contra `combos.options.all`, en el MISMO y ÚNICO recorrido de siempre.
    // Mismo criterio que la migración 023 para los suplementos.

    /// La composición tal y como la fila del pedido la devuelve al RETOMAR la cuenta: se lee la
    /// columna `combo` que congeló el pedido y se rearma el item del cobro con ella, que es
    /// literalmente lo que hace `loadOrderLines` + el constructor del payload del TPV.
    ///
    /// Se pasa por el TEXTO de la columna a propósito: probar el cobro con el item original sería
    /// probar que el test se pone de acuerdo consigo mismo, no que la cuenta sobrevive al viaje.
    fn resumed_item(frozen: &Map<String, Value>) -> Value {
        let combo: Value = serde_json::from_str(frozen["combo"].as_str().expect("TEXT"))
            .expect("la columna `combo` es JSON");
        json!({
            // La fila guarda el id del combo en `product_id` (lo pone `addComboLine`), y eso es lo
            // único que sobrevivía ANTES de esta rebanada.
            "product_id": frozen["product_id"].clone(),
            "product_name": frozen["product_name"].clone(),
            "price": frozen["unit_price"].clone(),
            "quantity": frozen["quantity"].clone(),
            "combo_id": combo["combo_id"].clone(),
            "combo_choices": combo["combo_choices"].clone(),
        })
    }

    /// El pedido de UN menú, con los mismos catálogos de confianza que usa `combo_input`.
    fn combo_order_input(choices: Value, ids: usize) -> Value {
        let items = json!([{
            "combo_id": "c-1", "product_id": "c-1", "product_name": "Pack merienda",
            "price": 600, "quantity": 1_000_000, "combo_choices": choices
        }]);
        let mut inp = input(items, ids, 0);
        // sales#175: opening the check freezes the menu's CLOSED price, so this door needs the
        // `combos` catalogue — the very one the checkout already used.
        inp["context"]["reads"] = json!({
            "combos.options.all": [
                combo_option("o-sandwich", "g-food", 1, "p-sandwich", 0, "goods", 600, ""),
                combo_option("o-beer", "g-drink", 1, "p-beer", 0, "goods", 600, ""),
            ],
            "inventory.products.for_sale": [
                combo_product("p-sandwich", 450, "shop.food"),
                combo_product("p-beer", 200, "product.generic"),
            ],
        });
        inp
    }

    fn order_lines(out: &Output) -> Vec<Map<String, Value>> {
        out.operations.iter()
            .filter(|o| o.command == "sales._insert_order_line")
            .map(|o| o.params.clone())
            .collect()
    }

    #[test]
    fn aparcar_un_menu_congela_QUE_menu_y_QUE_se_eligio_en_su_orden() {
        let out = orden(combo_order_input(
            json!([{ "option_id": "o-sandwich", "product_name": "Bocadillo", "category_id": "cat-food" },
                   { "option_id": "o-beer", "product_name": "Cerveza", "category_id": "cat-drink" }]),
            3,
        ));
        let l = &order_lines(&out)[0];
        let combo: Value = serde_json::from_str(l["combo"].as_str().expect("TEXT")).expect("JSON");
        assert_eq!(combo["combo_id"], json!("c-1"));
        // EL ORDEN es el que lee cocina: el de catálogo no sirve en el pase (foros de Square).
        assert_eq!(combo["combo_choices"][0]["option_id"], json!("o-sandwich"));
        assert_eq!(combo["combo_choices"][1]["option_id"], json!("o-beer"));
        // `product_name` y `category_id` viajan para DISPLAY y para que el KDS enrute CADA
        // componente a SU estación al retomar la cuenta — el fallo de TouchBistro de ADR-0381.
        assert_eq!(combo["combo_choices"][0]["product_name"], json!("Bocadillo"));
        assert_eq!(combo["combo_choices"][1]["category_id"], json!("cat-drink"));
        assert!(!as_str(&l["combo_group_ref"]).is_empty(), "la fila dice que ES un combo");
    }

    #[test]
    fn una_linea_normal_del_pedido_no_gana_ni_grupo_ni_snapshot() {
        // El control: el 100 % de las cuentas que no venden menús no cambia en nada.
        let out = orden(order_input(
            json!([{ "product_id": "p-cafe", "product_name": "Café", "price": 150, "quantity": 1_000_000 }]),
            3,
        ));
        let l = &order_lines(&out)[0];
        assert_eq!(l["combo_group_ref"], Value::Null, "sin combo, sin grupo");
        assert_eq!(l["combo"], json!("{}"), "y el snapshot vacío, como la columna por defecto");
    }

    #[test]
    fn el_grupo_de_la_fila_del_pedido_lo_MINTA_el_servidor_no_el_navegador() {
        // Mismo principio que el precio (sales#68): lo que hermana las líneas no puede venir del
        // payload, o dos cuentas distintas podrían decir ser el mismo menú.
        let mut inp = combo_order_input(json!([{ "option_id": "o-sandwich" }]), 3);
        inp["payload"]["items"][0]["combo_group_ref"] = json!("me-lo-invento");
        let out = orden(inp);
        let l = &order_lines(&out)[0];
        assert_ne!(l["combo_group_ref"], json!("me-lo-invento"));
        assert!(as_str(&l["combo_group_ref"]).starts_with("id-0"), "deriva del pedido: {:?}", l["combo_group_ref"]);
    }

    #[test]
    fn opening_a_check_freezes_the_lines_SUPPLEMENTS_too() {
        // pm#93 closed `sales.order.add_line`, but `sales.order.open` — the door every check's
        // FIRST line comes through — never forwarded `modifiers` to the row: the "no onion" burger
        // that opened the table lost its supplement when the check was resumed. Same column, same
        // contract, same test.
        //
        // sales#200: and the catalogue travels with it, because the row now freezes the DELTA too.
        let mut inp = order_input(
            json!([{ "product_id": "p-burger", "product_name": "Hamburguesa", "price": 900,
                     "quantity": 1_000_000, "modifiers": [{ "option_id": "m-sin-cebolla" }] }]),
            3,
        );
        inp["context"]["reads"]["modifiers.options.all"] = json!([
            { "option_id": "m-sin-cebolla", "group_id": "g", "name": "Sin cebolla",
              "kitchen_name": "SIN CEBOLLA", "price_delta": 0, "tax_category_key": null }
        ]);
        let l = &order_lines(&orden(inp))[0];
        let mods: Value = serde_json::from_str(l["modifiers"].as_str().expect("TEXT")).expect("JSON");
        assert_eq!(mods[0]["option_id"], json!("m-sin-cebolla"));
        assert_eq!(mods[0]["kitchen_name"], json!("SIN CEBOLLA"));
    }

    #[test]
    fn cobrar_la_cuenta_RETOMADA_da_EXACTAMENTE_las_mismas_hermanas_que_cobrarla_directa() {
        // 🔴 EL CRITERIO DE LA ISSUE. La mesa pide el menú, se aparca la cuenta, se retoma y se
        // cobra: tiene que salir el MISMO reparto, al céntimo, que si se hubiera cobrado de un
        // tirón. Y la expansión sigue siendo UNA sola, la de `complete_sale`: el pedido guarda la
        // composición, nunca líneas hermanas ya repartidas.
        let choices = json!([{ "option_id": "o-sandwich", "product_name": "Bocadillo" },
                             { "option_id": "o-beer", "product_name": "Cerveza" }]);
        let options = json!([combo_option("o-sandwich", "g-food", 1, "p-sandwich", 0, "goods", 600, ""),
                             combo_option("o-beer", "g-drink", 1, "p-beer", 0, "goods", 600, "")]);
        let products = json!([combo_product("p-sandwich", 450, "shop.food"),
                              combo_product("p-beer", 200, "product.generic")]);

        // (a) DIRECTO: el camino de la tienda de alimentación, ya vivo desde sales#152.
        let directo = sale_lines(&sale(combo_input(choices.clone(), options.clone(), products.clone(), 8)));

        // (b) APARCADO Y RETOMADO: se abre la cuenta con el menú, se lee la fila que quedó escrita
        // y se cobra con lo que esa fila devuelve — nada del navegador de la sesión anterior.
        let aparcada = orden(combo_order_input(choices, 3));
        let mut inp = combo_input(json!([]), options, products, 8);
        inp["payload"]["items"] = json!([resumed_item(&order_lines(&aparcada)[0])]);
        let retomada = sale_lines(&sale(inp));

        assert_eq!(retomada.len(), directo.len(), "las mismas hermanas, ni una más");
        for (r, d) in retomada.iter().zip(directo.iter()) {
            for k in ["product_id", "product_name", "unit_price", "line_total", "net_amount",
                      "tax_amount", "tax_rate", "tax_category_key", "combo"] {
                assert_eq!(r[k], d[k], "difiere `{k}` al retomar la cuenta");
            }
        }
        let suma: i64 = retomada.iter().map(|l| l["line_total"].as_i64().unwrap_or(-1)).sum();
        assert_eq!(suma, 600, "el precio cerrado, al céntimo, tras aparcar y retomar");
    }

    #[test]
    fn the_price_the_BROWSER_parked_decides_nothing_about_what_is_charged() {
        // The browser parked the set menu at 99.99 € (an old bundle, an integration, a bug).
        //
        // Until sales#175 the row kept that 99.99 € — it was display — and the checkout ignored it
        // because it re-priced against `combos.options.all`. Since sales#175 the checkout HONOURS
        // the row, so the row can no longer be born from the browser: the server writes it with the
        // `combos` catalogue in hand. Both halves of the lesson are still here — the browser does
        // not decide, neither when parking nor when charging — and the amount charged is the same.
        let choices = json!([{ "option_id": "o-sandwich" }, { "option_id": "o-beer" }]);
        let options = json!([combo_option("o-sandwich", "g-food", 1, "p-sandwich", 0, "goods", 600, ""),
                             combo_option("o-beer", "g-drink", 1, "p-beer", 0, "goods", 600, "")]);
        let products = json!([combo_product("p-sandwich", 450, "shop.food"),
                              combo_product("p-beer", 200, "product.generic")]);
        let mut abrir = combo_order_input(choices, 3);
        abrir["payload"]["items"][0]["price"] = json!(9999);
        let parked = orden(abrir);
        let fila = &order_lines(&parked)[0];
        assert_eq!(fila["unit_price"], json!(600), "the row is born from the catalogue, not the payload");
        assert_eq!(fila["line_total"], json!(600), "and the preview is computed with it");

        let mut inp = combo_input(json!([]), options, products, 8);
        inp["payload"]["items"] = json!([resumed_item(fila)]);
        let cobrado: i64 = line_totals(&sale(inp)).iter().sum();
        assert_eq!(cobrado, 600, "y se cobra el precio cerrado, no los 99,99 € del navegador");
    }


    // ── sales#175 · AN OPEN CHECK IS CHARGED AT THE PRICE IT HAD WHEN IT WAS ORDERED ───────────
    //
    // Market decision (8 references + forums, written on the issue and in its ADR): the line
    // FREEZES its price the moment it is added to the check, and the checkout HONOURS it. Square
    // spells it out in its Orders API ("Even if the price of the item changes before the
    // transaction completes, the Orders API uses that original price"), Simphony excludes "menu
    // items from a previous service round" from a price-level change, and Odoo does not recompute
    // the lines of an order already created. Shopify tried the opposite in 2025-01 and ended up
    // shipping the `price lock` after the [BUG] thread in its community.
    //
    // 🔴 Freezing the ROW's price is only safe if the SERVER wrote the row with the catalogue in
    // hand. That is why the two doors that materialise a line — opening the check and adding a line
    // to it — now resolve the price against `inventory.products.for_sale`, exactly as the checkout
    // has since sales#68. The payload's `price` still decides nothing, at any door.

    /// The catalogue as the runtime delivers it when the check is OPENED: the burger at 9.00 €.
    fn burger_catalog(price: i64) -> Value {
        json!([{ "id": "p-burger", "price": price, "cost": 400, "tax_category_key": "product.generic" }])
    }

    /// Opening a check with ONE catalogue line, with the catalogue delivered (or without it when
    /// `products` is `Null`). The payload's `price` is always 1 on purpose: if it ever decides
    /// anything, it shows.
    fn open_input(products: Value) -> Value {
        let items = json!([{ "product_id": "p-burger", "product_name": "Hamburguesa",
                             "price": 1, "cost": 1, "quantity": 1_000_000,
                             "tax_category_key": "restaurant.food" }]);
        let mut inp = input(items, 3, 0);
        if !products.is_null() {
            inp["context"]["reads"] = json!({ "inventory.products.for_sale": products });
        }
        inp
    }

    /// The order row exactly as `sales.order.lines` gives it back when the check is resumed.
    fn order_row(id: &str, unit_price: i64) -> Value {
        json!({ "id": id, "order_id": "ord-1", "product_id": "p-burger",
                "product_name": "Hamburguesa", "quantity": 1_000_000,
                "unit_price": unit_price, "cost": 400, "tax_category_key": "product.generic",
                "is_gift": 0, "is_service": 0, "line_total": unit_price, "discount_percent": 0,
                "modifiers": "[]", "combo": "{}", "combo_group_ref": null })
    }

    /// Charging check `ord-1`: the till sends the line naming ITS row (`order_item_id`), and the
    /// runtime delivers the order's live rows in `sales.order.lines`.
    fn charge_open_check(catalog_now: i64, rows: Value, payload_price: i64) -> Value {
        let items = json!([{ "product_id": "p-burger", "product_name": "Hamburguesa",
                             "price": payload_price, "quantity": 1_000_000,
                             "order_item_id": "line-1" }]);
        let mut inp = input_fiscal(items, burger_catalog(catalog_now), tax_catalog());
        inp["payload"]["order_id"] = json!("ord-1");
        if !rows.is_null() {
            inp["context"]["reads"]["sales.order.lines"] = rows;
        }
        inp
    }

    #[test]
    fn charging_a_resumed_check_freezes_the_ROWS_tax_category() {
        // sales#195 · the restaurant path end to end: the waiter's row was written by the server
        // (`product.generic`), and the till that pays it sends no category at all. Before, the
        // sale line froze that EMPTY value while charging the 21 % the row's category resolved —
        // and the same empty string travelled to `invoice` and to VeriFactu.
        let out = sale(charge_open_check(900, json!([order_row("line-1", 900)]), 900));
        let line = out.operations.iter().find(|o| o.command == "sales._insert_line").expect("line");
        assert_eq!(line.params["tax_rate"], json!(21.0));
        assert_eq!(line.params["tax_category_key"], json!("product.generic"),
                   "the sale line did not inherit the category frozen on the check's row");
        assert_eq!(out.events[0].payload["items"][0]["tax_category_key"], json!("product.generic"));
    }

    #[test]
    fn opening_a_check_freezes_the_CATALOGUE_price_not_the_payload_one() {
        let row = &order_lines(&orden(open_input(burger_catalog(900))))[0];
        assert_eq!(row["unit_price"], json!(900), "the row is born with the catalogue's price");
        assert_eq!(row["line_total"], json!(900), "and the preview is computed with it");
        assert_eq!(row["cost"], json!(400), "the cost comes from the catalogue too (gift cash-up)");
        assert_eq!(row["tax_category_key"], json!("product.generic"),
                   "and the tax category, which is the server-side authority of VAT (ADR-0085)");
    }

    #[test]
    fn opening_a_check_with_a_product_that_is_not_on_sale_is_refused() {
        let other = json!([{ "id": "p-otro", "price": 900, "cost": 0, "tax_category_key": "x" }]);
        let err = open_order_pure(open_input(other)).refused("no check is opened blind");
        assert_eq!(err.code, "sales.product_not_available", "unexpected code: {err:?}");
    }

    #[test]
    fn opening_a_check_WITHOUT_a_catalogue_does_not_freeze_the_browsers_price() {
        // Same degradation as the checkout (sales#68): with no catalogue, a line that claims to
        // come from the catalogue cannot be sustained. Accepting it would freeze the price the
        // browser proposed, and from then on the checkout would honour it without asking.
        let err = open_order_pure(open_input(Value::Null)).refused("no catalogue, no check");
        assert_eq!(err.code, "sales.catalog_unavailable", "unexpected code: {err:?}");
    }

    #[test]
    fn an_OPEN_PRICE_line_still_comes_in_through_its_own_door() {
        // With no `product_id` there is nothing to check it against: it is selling by department,
        // with its own permission (`sales.sell_open_price`). The typed price is frozen as it is.
        let items = json!([{ "product_id": null, "product_name": "Varios", "price": 250,
                             "quantity": 1_000_000 }]);
        let mut inp = input(items, 3, 0);
        inp["context"]["reads"] = json!({ "inventory.products.for_sale": burger_catalog(900) });
        let row = &order_lines(&orden(inp))[0];
        assert_eq!(row["unit_price"], json!(250));
    }

    #[test]
    fn charging_an_open_check_uses_the_FROZEN_price_even_if_the_catalogue_went_UP() {
        // The exact symptom of the issue: table 4 ordered at 9.00 €, the manager raises it to 10.00.
        let out = sale(charge_open_check(1000, json!([order_row("line-1", 900)]), 900));
        let l = &sale_lines(&out)[0];
        assert_eq!(l["unit_price"], json!(900), "it charged the menu price it ordered at");
        assert_eq!(l["line_total"], json!(900));
    }

    #[test]
    fn and_also_when_the_catalogue_went_DOWN() {
        // Freezing is symmetrical or it is not freezing: Shopify documents this very trade-off ("a
        // price lock prevents prices from being raised, but they also prevent prices from being
        // automatically lowered"). A markdown is applied by hand, with the line discount, which is
        // a decision of whoever is serving and carries their name.
        let out = sale(charge_open_check(800, json!([order_row("line-1", 900)]), 800));
        assert_eq!(sale_lines(&out)[0]["line_total"], json!(900));
    }

    #[test]
    fn the_PAYLOAD_price_still_decides_nothing_on_an_open_check() {
        // The hole of sales#68 does not reopen through the back door: honouring the ROW is not
        // honouring the payload. Here the browser sends 1 cent and the row says 900.
        let out = sale(charge_open_check(1000, json!([order_row("line-1", 900)]), 1));
        assert_eq!(sale_lines(&out)[0]["line_total"], json!(900), "the browser won");
    }

    #[test]
    fn a_line_that_claims_to_come_from_the_check_and_is_not_in_it_is_refused() {
        // A row already paid (`sale_id IS NOT NULL`) or belonging to another check does not come
        // back in the read. Charging it by "falling back to the catalogue" would charge the same
        // thing twice without saying a word.
        let err = complete_sale_pure(charge_open_check(1000, json!([order_row("line-9", 900)]), 900))
            .refused("the line is not in the check");
        assert_eq!(err.code, "sales.order_line_not_available", "unexpected code: {err:?}");
    }

    #[test]
    fn with_an_order_and_without_its_lines_the_checkout_fails_CLOSED() {
        // The read did not arrive (deleted order, a race, an integration). Charging "with whatever
        // is there" would re-price in silence, which is exactly what this issue removes.
        let err = complete_sale_pure(charge_open_check(1000, Value::Null, 900))
            .refused("no rows of the order, no checkout");
        assert_eq!(err.code, "sales.order_lines_unavailable", "unexpected code: {err:?}");
    }

    #[test]
    fn a_COUNTER_sale_is_still_priced_by_the_catalogue() {
        // With no open check there is no "when it was ordered" apart from "when it is paid": you
        // tap the item and charge. The catalogue wins, exactly as it has since sales#68.
        let items = json!([{ "product_id": "p-burger", "product_name": "Hamburguesa",
                             "price": 1, "quantity": 1_000_000 }]);
        let out = sale(input_fiscal(items, burger_catalog(1000), tax_catalog()));
        assert_eq!(sale_lines(&out)[0]["line_total"], json!(1000));
    }

    #[test]
    fn a_parked_set_menu_is_charged_at_the_CLOSED_price_it_was_ordered_at() {
        // The twin for the set menu (sales#169): the composition was already frozen; now the closed
        // price is too. `combos.options.all` raises the pack to 8.00 € while the table is open and
        // the check is still charged the 6.00 € it ordered at — split, mind you, with TODAY's
        // weights and rates, because the art. 79.Dos apportionment belongs to the accrual.
        let choices = json!([{ "option_id": "o-sandwich" }, { "option_id": "o-beer" }]);
        let options = json!([combo_option("o-sandwich", "g-food", 1, "p-sandwich", 0, "goods", 800, ""),
                             combo_option("o-beer", "g-drink", 1, "p-beer", 0, "goods", 800, "")]);
        let products = json!([combo_product("p-sandwich", 450, "shop.food"),
                              combo_product("p-beer", 200, "product.generic")]);
        let row = json!({ "id": "line-c", "order_id": "ord-1", "product_id": "c-1",
                          "product_name": "Pack merienda", "quantity": 1_000_000,
                          "unit_price": 600, "cost": 0, "tax_category_key": "",
                          "is_gift": 0, "is_service": 0, "line_total": 600, "discount_percent": 0,
                          "modifiers": "[]", "combo_group_ref": "ord-1-0",
                          "combo": "{\"combo_id\":\"c-1\",\"combo_choices\":[{\"option_id\":\"o-sandwich\"},{\"option_id\":\"o-beer\"}]}" });
        let mut inp = combo_input(json!([]), options, products, 8);
        inp["payload"]["order_id"] = json!("ord-1");
        inp["payload"]["items"] = json!([{ "product_id": "c-1", "product_name": "Pack merienda",
                                           "price": 600, "quantity": 1_000_000, "combo_id": "c-1",
                                           "combo_choices": choices, "order_item_id": "line-c" }]);
        inp["context"]["reads"]["sales.order.lines"] = json!([row]);
        let charged: i64 = line_totals(&sale(inp)).iter().sum();
        assert_eq!(charged, 600, "the menu was charged at today's closed price, not the ordered one");
    }

    #[test]
    fn opening_a_check_with_a_set_menu_freezes_its_CLOSED_price() {
        let choices = json!([{ "option_id": "o-sandwich" }, { "option_id": "o-beer" }]);
        let options = json!([combo_option("o-sandwich", "g-food", 1, "p-sandwich", 0, "goods", 600, ""),
                             combo_option("o-beer", "g-drink", 1, "p-beer", 0, "goods", 600, "")]);
        let products = json!([combo_product("p-sandwich", 450, "shop.food"),
                              combo_product("p-beer", 200, "product.generic")]);
        let mut inp = combo_order_input(choices, 3);
        inp["payload"]["items"][0]["price"] = json!(9999); // the browser lies
        inp["context"]["reads"] = json!({ "inventory.products.for_sale": products,
                                          "combos.options.all": options });
        let row = &order_lines(&orden(inp))[0];
        assert_eq!(row["unit_price"], json!(600), "the closed price is `combos`', not the till's");
        assert_eq!(row["line_total"], json!(600));
    }

    // ── `sales.order.add_line` stops being a money door ────────────────────────────────────────
    //
    // It was declarative SQL and bound `:unit_price` from the payload. While the checkout re-priced
    // against the catalogue that only moved a display preview; the moment the checkout HONOURS the
    // row, that parameter decides money. It becomes a WASM handler with the same catalogue in hand
    // as the other door, and a missing order still yields the same domain code.

    fn add_line_input(products: Value, order: Value) -> Value {
        let mut inp = input(json!([]), 2, 0);
        inp["payload"] = json!({ "order_id": "ord-1", "product_id": "p-burger",
                                 "product_name": "Hamburguesa", "product_sku": "",
                                 "quantity": 1_000_000, "unit_price": 1, "cost": 1,
                                 "tax_category_key": "restaurant.food", "line_total": 1 });
        let mut reads = Map::new();
        if !products.is_null() {
            reads.insert("inventory.products.for_sale".into(), products);
        }
        reads.insert("sales.order.get".into(), order);
        inp["context"]["reads"] = Value::Object(reads);
        inp
    }

    fn open_order_row() -> Value {
        json!([{ "id": "ord-1", "status": "open", "provisional_total": 0 }])
    }

    #[test]
    fn adding_a_line_freezes_the_catalogue_price() {
        let out = add_order_line_pure(add_line_input(burger_catalog(900), open_order_row()))
            .accepted("the line goes in");
        let row = &order_lines(&out)[0];
        assert_eq!(row["unit_price"], json!(900), "the payload's `unit_price` decides nothing");
        assert_eq!(row["line_total"], json!(900));
        assert!(out.operations.iter().any(|o| o.command == "sales._recompute_order_total"),
                "the order's provisional total is recomposed in the same transaction");
    }

    #[test]
    fn adding_a_line_freezes_the_catalogue_tax_category_too() {
        // sales#195 · guard for the OTHER door. `add_line_input`'s payload claims
        // `restaurant.food` (10 %) for a burger the catalogue classifies as `product.generic`
        // (21 %). sales#175 already made this row server-resolved; this pins it, because the
        // checkout now HONOURS the row's category when the check is resumed.
        let out = add_order_line_pure(add_line_input(burger_catalog(900), open_order_row()))
            .accepted("the line goes in");
        let row = &order_lines(&out)[0];
        assert_eq!(row["tax_category_key"], json!("product.generic"),
                   "the row froze the till's category instead of the catalogue's");
    }

    // sales#273 — the professional rides on the ORDER LINE, not only on the sale.
    //
    // ADR-0141 does not keep the cart in memory: the till writes this row on every tap and REBUILDS
    // the cart from it (on reload, on resuming a parked check, and after every fire to the kitchen).
    // So an attribution the browser holds and this row drops is an attribution that is gone by the
    // time anyone pays — and `sales.by_staff` would quietly hand Marta's colour to Ana.
    #[test]
    fn adding_a_line_keeps_the_professional_who_did_it() {
        let mut inp = add_line_input(burger_catalog(900), open_order_row());
        inp["payload"]["staff_id"] = json!("u-ana");
        let out = add_order_line_pure(inp).accepted("the line goes in");
        assert_eq!(order_lines(&out)[0]["staff_id"], json!("u-ana"));
    }

    // NULL, never "". NULL means "this line is attributed by the ticket's own professional", which
    // is what `by_staff` COALESCEs to; an empty string would be a third state belonging to nobody.
    #[test]
    fn a_line_with_no_professional_is_written_null_not_empty() {
        let out = add_order_line_pure(add_line_input(burger_catalog(900), open_order_row()))
            .accepted("the line goes in");
        assert_eq!(order_lines(&out)[0]["staff_id"], Value::Null);
    }

    // The FIRST line of every check comes through the OTHER door. `is_service` (sales#89), the
    // supplements (pm#93) and the set menu (sales#169) each had to be fixed here a second time.
    #[test]
    fn the_line_that_opens_the_order_keeps_the_professional_too() {
        let mut inp = open_input(burger_catalog(900));
        inp["payload"]["items"][0]["staff_id"] = json!("u-marta");
        let out = open_order_pure(inp).accepted("the order opens");
        assert_eq!(order_lines(&out)[0]["staff_id"], json!("u-marta"));
    }

    #[test]
    fn adding_a_line_to_an_order_that_does_not_exist_is_refused_with_its_code() {
        let err = add_order_line_pure(add_line_input(burger_catalog(900), json!([])))
            .refused("that order is not open in this business");
        assert_eq!(err.code, "sales.order_unavailable", "unexpected code: {err:?}");
    }

    #[test]
    fn adding_a_line_of_a_product_that_is_not_on_sale_is_refused() {
        let other = json!([{ "id": "p-otro", "price": 900, "cost": 0, "tax_category_key": "x" }]);
        let err = add_order_line_pure(add_line_input(other, open_order_row()))
            .refused("nothing is added blind");
        assert_eq!(err.code, "sales.product_not_available", "unexpected code: {err:?}");
    }

    // ── sales#288 · what the COOK reads is written by the server, like the price ────────────────
    //
    // The kitchen display was showing the raw product UUID and «0,001» on every line a caller added
    // through the API with nothing but a `product_id`. Neither is the kitchen's fault: `kitchen`
    // falls back to the id on purpose (a cook who sees a code ASKS; one who sees nothing plates it
    // wrong) and its screen does rescale the fixed point. Both facts were already wrong one floor
    // up, on the `sales_order_item` row this door writes:
    //
    //   * `product_name`/`product_sku` were copied STRAIGHT FROM THE PAYLOAD while the price, the
    //     cost and the tax category were resolved against `inventory.products.for_sale`. A line
    //     that names a catalogue id carries the catalogue's name for the same reason it carries its
    //     price: the caller is not the authority on either.
    //   * the quantity was validated against `increment_value` defaulting to NO grid, and then
    //     FROZEN on the row with a default of one whole unit. Two defaults for one fact: the row
    //     came out holding 0,001 while declaring it is sold by the unit.

    /// The catalogue with the DISPLAY columns `inventory.products.for_sale` projects since sales#288.
    fn named_burger_catalog() -> Value {
        json!([{ "id": "p-burger", "name": "Hamburguesa doble", "sku": "BUR-2",
                 "price": 900, "cost": 400, "tax_category_key": "product.generic" }])
    }

    #[test]
    fn a_line_added_by_id_alone_is_named_by_the_catalogue() {
        let mut inp = add_line_input(named_burger_catalog(), open_order_row());
        inp["payload"]["product_name"] = json!("");
        inp["payload"]["product_sku"] = json!("");
        let row = &order_lines(&add_order_line_pure(inp).accepted("the line goes in"))[0];
        assert_eq!(row["product_name"], json!("Hamburguesa doble"),
                   "the row went in with no name, so the pass prints the raw id");
        assert_eq!(row["product_sku"], json!("BUR-2"));
    }

    #[test]
    fn the_catalogue_name_wins_over_the_one_the_caller_proposed() {
        // Same rule as the price (sales#175): if the line claims to come from the catalogue, the
        // catalogue decides. A caller renaming someone else's dish on the pass is the display
        // version of selling a 50 € item for a cent.
        let mut inp = add_line_input(named_burger_catalog(), open_order_row());
        inp["payload"]["product_name"] = json!("Ensalada");
        let row = &order_lines(&add_order_line_pure(inp).accepted("the line goes in"))[0];
        assert_eq!(row["product_name"], json!("Hamburguesa doble"));
    }

    #[test]
    fn the_line_that_opens_the_check_is_named_by_the_catalogue_too() {
        // The FIRST line of every check comes through the OTHER door, and every fix on this row has
        // had to be made twice (`is_service`, the supplements, the set menu, the professional).
        let mut inp = open_input(named_burger_catalog());
        inp["payload"]["items"][0]["product_name"] = json!("");
        let row = &order_lines(&open_order_pure(inp).accepted("the order opens"))[0];
        assert_eq!(row["product_name"], json!("Hamburguesa doble"));
        assert_eq!(row["product_sku"], json!("BUR-2"));
    }

    #[test]
    fn a_catalogue_with_no_display_columns_leaves_the_line_as_the_caller_named_it() {
        // Degrades, never refuses: a hub still serving the narrow catalogue (`inventory` older than
        // this change) keeps writing exactly the row it wrote yesterday. A name is DISPLAY — it
        // decides no money — so an absent column is not a reason to stop a waiter taking an order.
        let row = &order_lines(
            &add_order_line_pure(add_line_input(burger_catalog(900), open_order_row()))
                .accepted("the line goes in"),
        )[0];
        assert_eq!(row["product_name"], json!("Hamburguesa"));
    }

    #[test]
    fn an_open_price_line_keeps_the_name_the_till_typed() {
        // No `product_id` = no catalogue to check it against (department sale, ADR-0085). Its name
        // is the cashier's own words, exactly like the note.
        let mut inp = add_line_input(named_burger_catalog(), open_order_row());
        inp["payload"]["product_id"] = Value::Null;
        inp["payload"]["product_name"] = json!("Varios");
        let row = &order_lines(&add_order_line_pure(inp).accepted("the line goes in"))[0];
        assert_eq!(row["product_name"], json!("Varios"));
    }

    #[test]
    fn a_quantity_the_row_cannot_call_whole_freezes_no_grid_instead_of_being_refused() {
        // ⚠️ This was `a_quantity_off_the_grid_the_row_itself_will_freeze_is_refused` (sales#288),
        // and its assertion was objectively wrong, not merely inconvenient: it made the server
        // INVENT a one-whole-unit grid for a line that declares no unit of measure, and ADR-0147 §2
        // puts the minimum increment inside the UNIT («pieza 1 · kg 0,001 · hora 0,25»). No unit,
        // no grid, nothing to be off — which is also the rule the till applies on its side
        // (`onGrid(qtyMicro, increment ?? 0)`). The invented grid refused half a portion as well,
        // and that is what went red against the real kernel (sales#300,
        // `kitchen/tests/tickets.hub.test.py`).
        //
        // The half of sales#288 that was right is kept, and is what this pins now: the row must
        // never declare a grid its own quantity is off.
        let mut inp = add_line_input(named_burger_catalog(), open_order_row());
        inp["payload"]["quantity"] = json!(1_000);
        let row = &order_lines(&add_order_line_pure(inp).accepted("the line goes in"))[0];
        assert_eq!(row["quantity"], json!(1_000));
        assert_eq!(row["increment_value"], json!(0),
                   "the row declared «sold by the unit» while holding 0,001 of one");
    }

    #[test]
    fn half_a_kilo_still_goes_in_when_the_line_declares_its_grid() {
        // The guard above must not reach the scale. A line that carries its unit context is
        // measured against ITS increment (0,001 kg), which is what the till freezes from the unit
        // registry — and 0,5 kg is on that grid.
        let mut inp = add_line_input(named_burger_catalog(), open_order_row());
        inp["payload"]["quantity"] = json!(500_000);
        inp["payload"]["unit_code"] = json!("kg");
        inp["payload"]["increment_value"] = json!(1_000);
        let row = &order_lines(&add_order_line_pure(inp).accepted("half a kilo goes in"))[0];
        assert_eq!(row["quantity"], json!(500_000));
        assert_eq!(row["increment_value"], json!(1_000));
    }

    #[test]
    fn a_zero_increment_is_not_a_grid_and_the_row_says_so() {
        // A caller can send `increment_value: 0`, and a zero cannot be a step: every quantity is a
        // multiple of it. It is read as «declares no grid», exactly like omitting the field — one
        // fact, one answer at both ends. It refuses nothing, and the row freezes the whole unit
        // only when the quantity is actually on it.
        let mut inp = add_line_input(named_burger_catalog(), open_order_row());
        inp["payload"]["quantity"] = json!(1_000);
        inp["payload"]["increment_value"] = json!(0);
        let row = &order_lines(&add_order_line_pure(inp).accepted("a zero refuses nothing"))[0];
        assert_eq!(row["increment_value"], json!(0), "the row froze a grid 0,001 is off");

        let mut ok = add_line_input(named_burger_catalog(), open_order_row());
        ok["payload"]["increment_value"] = json!(0);
        let row = &order_lines(&add_order_line_pure(ok).accepted("one whole burger goes in"))[0];
        assert_eq!(row["increment_value"], json!(1_000_000),
                   "a whole unit is sold whole, and that is the frozen fact every row carries");
    }

    // ── sales#300 · THE GRID BELONGS TO THE UNIT, and a row never contradicts itself ───────────
    //
    // ADR-0147 §2 puts the minimum increment where it belongs: it is one of the three things a UNIT
    // OF MEASURE defines («pieza 1 · kg 0,001 · hora 0,25»), a business rule of the unit — not of
    // the document, and not a default the server may invent. A line that declares no unit therefore
    // declares NO grid, and nothing can be off a grid that does not exist. That is also what the
    // till itself enforces on the other side of the wire: `onGrid(qtyMicro, ex.increment_value ?? 0)`
    // in `ui/lib` — no context, no grid.
    //
    // sales#288 read it the other way round for the two doors that materialise an order row: they
    // measured the quantity against `frozen_increment`, which invented ONE WHOLE UNIT when the line
    // declared nothing. That refuses half a portion on any line with no unit behind it — «media
    // ración de gambas», the very quantity ADR-0147 exists to represent — and it is what
    // `kitchen/tests/tickets.hub.test.py` caught against the real kernel: `sales.order.open`
    // answering 409 `sales.quantity_off_grid` with «500000 % 1000000 != 0».
    //
    // What sales#288 was right about is the OTHER half: a row must never declare a grid its own
    // quantity is off (`quantity = 1 000` while freezing `increment_value = 1 000 000`). That is
    // fixed where the contradiction is — in what the row FREEZES — instead of by refusing the
    // quantity. The invariant these tests pin, at every door:
    //
    //     increment_value == 0  ||  quantity % increment_value == 0

    /// Opening a check with ONE free-price line: no catalogue article, no unit context — exactly
    /// what `kitchen`'s battery fires at the kernel, and what the till sends for a department sale.
    fn open_free_line(quantity: i64) -> Value {
        input(json!([{ "product_name": "Gambas", "price": 2400, "quantity": quantity }]), 3, 0)
    }

    #[test]
    fn half_a_portion_opens_a_check_on_a_line_that_declares_no_unit() {
        let out = open_order_pure(open_free_line(500_000)).accepted("half a portion goes in");
        assert_eq!(order_lines(&out)[0]["quantity"], json!(500_000),
                   "half a kilo of shrimp is a real quantity in a bar (kitchen#5)");
    }

    #[test]
    fn half_a_portion_goes_into_an_open_check_too() {
        // The other door of the same check: every fix on this row has had to be made twice.
        let mut inp = add_line_input(named_burger_catalog(), open_order_row());
        inp["payload"]["product_id"] = Value::Null;
        inp["payload"]["product_name"] = json!("Gambas");
        inp["payload"]["quantity"] = json!(500_000);
        let out = add_order_line_pure(inp).accepted("half a portion goes in");
        assert_eq!(order_lines(&out)[0]["quantity"], json!(500_000));
    }

    #[test]
    fn a_row_never_freezes_a_grid_its_own_quantity_is_off() {
        // The half portion freezes NO grid — inventing the whole unit here is what made the row
        // say «sold whole» while holding 0,5, and what then refuses the waiter editing it.
        let half = open_order_pure(open_free_line(500_000)).accepted("half a portion goes in");
        assert_eq!(order_lines(&half)[0]["increment_value"], json!(0),
                   "a line that declares no unit declares no grid");

        // And the ordinary line is untouched: two whole portions still freeze the whole unit, which
        // is the frozen fact every row written before this change already carries.
        let whole = open_order_pure(open_free_line(2_000_000)).accepted("two portions go in");
        assert_eq!(order_lines(&whole)[0]["increment_value"], json!(1_000_000));
    }

    #[test]
    fn a_quantity_off_the_grid_the_line_declares_is_still_refused() {
        // The grid still bites where ADR-0147 §2.2 says it must: the line CARRIES its unit context
        // (0,001 kg, frozen from the unit registry) and 0,0005 kg is off it. Rounding would quietly
        // change what is sold, cooked, charged and stocked.
        let mut inp = add_line_input(named_burger_catalog(), open_order_row());
        inp["payload"]["quantity"] = json!(500);
        inp["payload"]["unit_code"] = json!("kg");
        inp["payload"]["increment_value"] = json!(1_000);
        let err = add_order_line_pure(inp).refused("0,0005 kg is off a 0,001 kg grid");
        assert_eq!(err.code, "sales.quantity_off_grid", "unexpected code: {err:?}");
    }

    #[test]
    fn the_counter_sale_freezes_a_grid_its_own_quantity_is_on() {
        // sales#300: the checkout was left out of sales#288 on purpose, so its row kept the
        // contradiction — 0,5 frozen as «sold whole». It is closed from the freezing side, which is
        // the one that was lying; nothing new bites at the drawer with the card already in hand.
        let items = json!([{ "product_name": "Gambas", "price": 2400, "quantity": 500_000,
                             "tax_category_key": "product.generic" }]);
        let out = complete_sale_pure(input_fiscal(items, json!([]), tax_catalog()))
            .accepted("the counter sale goes through");
        let line = &out.operations.iter()
            .find(|o| o.command == "sales._insert_line").expect("the sale line").params;
        assert_eq!(line["quantity"], json!(500_000));
        assert_eq!(line["increment_value"], json!(0),
                   "the row declared «sold by the unit» while holding half of one");
    }

    // ── sales#242 / ADR-0422 · «Corte × 2» becomes two lines of one ────────────────────────────
    //
    // A redemption covers ONE line and spends ONE session (`services` enforces one per
    // `(checkout_ref, line_ref)` with a unique index, and its hold takes no quantity). The till used
    // to dead-end there: it listed the line, wrote the reason on it and left the cashier to split it
    // by hand, except there was no «split». This is that split, and it is a SERVER operation because
    // half a split is money: the source row at two and one clone already in would charge the check
    // for three haircuts.
    //
    // 🔴 The clones are NOT re-priced against the catalogue. The row already froze its price
    // (sales#175) and re-reading the catalogue here would reprice this morning's check with this
    // afternoon's prices — which is exactly what freezing it removed.

    /// A live row of `sales.order.lines`: a haircut rung up twice, 18,00 € each.
    fn split_line_row() -> Value {
        json!({
            "id": "line-1", "order_id": "ord-1", "product_id": "s-corte",
            "product_name": "Corte de señora", "product_sku": "", "quantity": 2_000_000,
            "unit_price": 1800, "is_gift": 0, "gift_reason": "", "line_total": 3600,
            "tax_category_key": "service.generic", "cost": 0, "is_service": 1,
            "unit_code": "ud", "unit_name": "", "factor_num": 1, "factor_den": 1,
            "increment_value": 1_000_000, "price_quantity_value": 1_000_000,
            "pricing_unit_code": "ud", "pricing_unit_name": "", "pricing_factor_num": 1,
            "pricing_factor_den": 1, "round_no": 0, "fired_at": null,
            "category_id": "sc-pelo", "discount_percent": 0, "modifiers": "[]", "notes": "",
            "combo_group_ref": null, "combo": "{}"
        })
    }

    fn split_input(row: Value, order: Value) -> Value {
        let mut inp = input(json!([]), 60, 0);
        inp["payload"] = json!({ "order_id": "ord-1", "line_id": "line-1" });
        let mut reads = Map::new();
        reads.insert("sales.order.get".into(), order);
        reads.insert("sales.order.lines".into(), json!([row]));
        inp["context"]["reads"] = Value::Object(reads);
        inp
    }

    /// The source row as the split leaves it (quantity and amount), from the update operation.
    fn split_source(out: &Output) -> Map<String, Value> {
        out.operations.iter()
            .find(|o| o.command == "sales._update_order_line")
            .expect("the source row is rewritten to a line of one")
            .params
            .clone()
    }

    #[test]
    fn splitting_a_line_of_two_leaves_two_lines_of_one() {
        let out = split_order_line_pure(split_input(split_line_row(), open_order_row()))
            .accepted("a haircut rung up twice can be split");
        let source = split_source(&out);
        assert_eq!(source["line_id"], json!("line-1"), "the source row keeps its id and its holds");
        assert_eq!(source["quantity"], json!(1_000_000), "one unit, fixed point 10⁶");
        let clones = order_lines(&out);
        assert_eq!(clones.len(), 1, "two lines of one out of a line of two: one clone");
        assert_eq!(clones[0]["quantity"], json!(1_000_000));
        assert_ne!(clones[0]["id"], json!("line-1"), "the clone takes an id from the host's batch");
        assert!(out.operations.iter().any(|o| o.command == "sales._recompute_order_total"),
                "the order's provisional total is recomposed in the SAME transaction");
    }

    #[test]
    fn splitting_does_not_move_the_money_of_the_check() {
        let out = split_order_line_pure(split_input(split_line_row(), open_order_row()))
            .accepted("a haircut rung up twice can be split");
        let parts: i64 = as_cents(&split_source(&out)["line_total"], -1)
            + order_lines(&out).iter().map(|l| as_cents(&l["line_total"], -1)).sum::<i64>();
        assert_eq!(parts, 3600, "two haircuts before the split, two haircuts after it");
    }

    #[test]
    fn every_part_is_priced_the_way_THE_CHECKOUT_will_price_it() {
        // 🔴 This is the invariant that decides the arithmetic, and it is NOT «the total does not
        // change»: it is `provisional_total` == what the drawer takes (the guard of sales#246).
        //
        // `complete_sale` prices each ITEM on its own — `round(price × qty × (1 − discount))` — so
        // after the split it will charge 3 × round(333 × 0,9) = 900. Writing the largest-remainder
        // shares instead (300 + 300 + 299 = 899, ADR-0210) would keep the screen still and hand the
        // check a cent the checkout is never going to charge, which is the drift
        // `sales.payments_do_not_match_total` exists to catch. ADR-0210 prorates a TICKET discount
        // over lines; this is three discounted units priced one by one, and one by one they cost
        // 9,00 €.
        let mut row = split_line_row();
        row["quantity"] = json!(3_000_000);
        row["unit_price"] = json!(333);
        row["discount_percent"] = json!(10.0);
        row["line_total"] = json!(899); // round(333 × 3 × 0,9)
        let out = split_order_line_pure(split_input(row, open_order_row()))
            .accepted("a discounted line splits too");
        assert_eq!(as_cents(&split_source(&out)["line_total"], -1), 300);
        for clone in order_lines(&out) {
            assert_eq!(as_cents(&clone["line_total"], -1), 300, "same price, one by one");
            assert_eq!(clone["discount_percent"], json!(10.0), "the discount travels with the unit");
        }
    }

    #[test]
    fn the_clones_carry_the_frozen_snapshot_of_the_line() {
        let mut row = split_line_row();
        row["notes"] = json!("sin secador");
        let out = split_order_line_pure(split_input(row, open_order_row()))
            .accepted("a haircut rung up twice can be split");
        let clone = &order_lines(&out)[0];
        assert_eq!(clone["order_id"], json!("ord-1"));
        assert_eq!(clone["product_id"], json!("s-corte"));
        assert_eq!(clone["product_name"], json!("Corte de señora"));
        assert_eq!(clone["unit_price"], json!(1800), "the price stays the FROZEN one (sales#175)");
        assert_eq!(clone["tax_category_key"], json!("service.generic"), "the VAT authority (ADR-0085)");
        assert_eq!(clone["is_service"], json!(1), "sales#89: still a service, still no stock");
        assert_eq!(clone["category_id"], json!("sc-pelo"), "sales#12: kitchen routing survives");
        assert_eq!(clone["notes"], json!("sin secador"), "sales#156: the note is on every unit");
        assert_eq!(clone["price_quantity_value"], json!(1_000_000), "ADR-0147 §2.4: unit context");
        assert_eq!(clone["combo"], json!("{}"));
    }

    #[test]
    fn a_supplement_frozen_on_the_line_is_worth_the_same_on_every_part() {
        // sales#200/#208: the row froze what the supplement is worth. The split re-reads THAT, not
        // the catalogue — there is no catalogue in this command's reads on purpose.
        let mut row = split_line_row();
        row["modifiers"] = json!("[{\"option_id\":\"o-tratamiento\",\"group_id\":\"g\",\"name\":\"Tratamiento\",\"kitchen_name\":\"Tratamiento\",\"price_delta\":300,\"tax_category_key\":\"\"}]");
        row["line_total"] = json!(4200);
        let out = split_order_line_pure(split_input(row, open_order_row()))
            .accepted("a line with a supplement splits too");
        assert_eq!(as_cents(&split_source(&out)["line_total"], -1), 2100, "18,00 € + 3,00 €");
        assert_eq!(as_cents(&order_lines(&out)[0]["line_total"], -1), 2100);
        assert_eq!(order_lines(&out)[0]["unit_price"], json!(1800),
                   "the delta rides on the AMOUNT, never on the frozen base — it would be charged twice");
    }

    #[test]
    fn splitting_a_line_of_an_order_that_is_not_open_is_refused_with_its_code() {
        let err = split_order_line_pure(split_input(split_line_row(), json!([])))
            .refused("no check, no split");
        assert_eq!(err.code, "sales.order_unavailable", "unexpected code: {err:?}");
    }

    #[test]
    fn splitting_a_line_that_is_not_on_the_check_is_refused() {
        let mut row = split_line_row();
        row["id"] = json!("line-other");
        let err = split_order_line_pure(split_input(row, open_order_row()))
            .refused("that row is not a live line of this order");
        assert_eq!(err.code, "sales.order_line_not_available", "unexpected code: {err:?}");
    }

    #[test]
    fn the_cases_that_cannot_become_lines_of_one_are_refused_with_one_code() {
        // Each of these would leave the check WRONG if it went through, and each of them is a case
        // the screen never offers — this is the second door, and it does not trust the first.
        let mut fired = split_line_row();
        fired["fired_at"] = json!("2026-09-02T10:00:00+00:00");
        let mut weighed = split_line_row();
        weighed["quantity"] = json!(1_500_000);
        let mut single = split_line_row();
        single["quantity"] = json!(1_000_000);
        let mut over_cap = split_line_row();
        over_cap["quantity"] = json!(51_000_000);
        let mut comp = split_line_row();
        comp["is_gift"] = json!(1);
        let mut menu = split_line_row();
        menu["combo"] = json!("{\"combo_id\":\"c-1\",\"combo_choices\":[]}");
        menu["combo_group_ref"] = json!("ord-1-0");
        for (what, row) in [
            ("a line already in production keeps its quantity: the SQL will not touch it", fired),
            ("half a haircut is not a line of one", weighed),
            ("a line of one has nothing to split", single),
            ("beyond the cap the host runs out of ids mid-check", over_cap),
            ("a comp costs nothing, so no session covers it", comp),
            ("a set menu is a GROUP of lines, not a quantity (ADR-0381)", menu),
        ] {
            let err = split_order_line_pure(split_input(row, open_order_row())).refused(what);
            assert_eq!(err.code, "sales.line_not_splittable", "{what}: unexpected code {err:?}");
        }
    }

    /// Every `:name` a statement binds, comments stripped — the module's SQL is full of prose that
    /// mentions parameters, and the runtime's translator ignores those too.
    fn bound_params(sql: &str) -> Vec<String> {
        let mut names: Vec<String> = Vec::new();
        for line in sql.lines() {
            let code = line.split("--").next().unwrap_or("");
            let bytes: Vec<char> = code.chars().collect();
            let mut i = 0;
            while i < bytes.len() {
                if bytes[i] == ':' {
                    let start = i + 1;
                    let mut end = start;
                    while end < bytes.len() && (bytes[end].is_ascii_alphanumeric() || bytes[end] == '_') {
                        end += 1;
                    }
                    if end > start {
                        let name: String = bytes[start..end].iter().collect();
                        if !names.contains(&name) {
                            names.push(name);
                        }
                    }
                    i = end;
                } else {
                    i += 1;
                }
            }
        }
        names
    }

    #[test]
    fn splitting_a_line_keeps_the_professional_on_every_part() {
        // sales#273 — «Corte x 2» de Ana se parte en dos cortes de uno porque el bono de `services`
        // se canjea por LÍNEA. Las dos partes las hizo Ana: si el clon nace sin profesional, la
        // mitad del trabajo del día cae al de la cabecera y el cierre por profesional deja de
        // cuadrar por la mitad exacta del corte que se partió — y nadie lo ve, porque el total del
        // ticket sigue estando bien.
        let mut row = split_line_row();
        row["staff_id"] = json!("staff-ana");
        let out = split_order_line_pure(split_input(row, open_order_row()))
            .accepted("a haircut rung up twice can be split");

        let clone = out.operations.iter()
            .find(|o| o.command == "sales._insert_order_line")
            .expect("the split writes the second line")
            .params
            .clone();
        assert_eq!(clone.get("staff_id"), Some(&json!("staff-ana")),
            "the part that is born keeps the professional who did the work");

        // Y un negocio que NO atribuye sigue escribiendo NULL, no la cadena vacía: `by_staff` cae
        // entonces al profesional de la cabecera, y el vacío sería un tercer estado sin dueño.
        let out = split_order_line_pure(split_input(split_line_row(), open_order_row()))
            .accepted("a bar splits the same way, naming nobody");
        let clone = out.operations.iter()
            .find(|o| o.command == "sales._insert_order_line")
            .expect("the split writes the second line")
            .params
            .clone();
        assert_eq!(clone.get("staff_id"), Some(&Value::Null),
            "nobody named stays NULL, which falls back to the ticket's professional");
    }

    #[test]
    fn the_split_binds_every_parameter_its_two_doors_ask_for() {
        // 🔴 The one thing the tests above CANNOT see. They check what the split decides; this
        // checks that what it emits BINDS. A statement Postgres cannot prepare is a command that
        // does not exist in any hub (ADR-0154), and half a split is money: the source row still at
        // two with a clone already in charges the check for three haircuts. When either door grows
        // a column, this fails here instead of in a salon.
        //
        // The system parameters (`hub_id`, `current_user_id`, `now`) are the runtime's and are
        // never emitted by a guest, so they are the only ones excluded.
        const SYSTEM: [&str; 3] = ["hub_id", "current_user_id", "now"];
        let out = split_order_line_pure(split_input(split_line_row(), open_order_row()))
            .accepted("a haircut rung up twice can be split");

        for (command, sql) in [
            ("sales._update_order_line", include_str!("../../commands/order_update_line.sql")),
            ("sales._insert_order_line", include_str!("../../commands/_insert_order_line.sql")),
        ] {
            let params = out.operations.iter()
                .find(|o| o.command == command)
                .unwrap_or_else(|| panic!("the split emits no `{command}`"))
                .params
                .clone();
            let wanted = bound_params(sql);
            assert!(!wanted.is_empty(), "{command}: the statement binds nothing — this check is vacuous");
            for name in wanted {
                if SYSTEM.contains(&name.as_str()) {
                    continue;
                }
                assert!(params.contains_key(&name),
                        "{command} binds `:{name}` and the split does not send it");
            }
        }
    }

    #[test]
    fn without_the_lines_of_the_order_nothing_is_split() {
        // Fails CLOSED: `read_rows` hands back `None` when the read did not resolve, and reading
        // that as «the check has no lines» would refuse with the wrong code — or, worse, invent a
        // clone out of a row nobody delivered.
        let mut inp = split_input(split_line_row(), open_order_row());
        inp["context"]["reads"] = json!({ "sales.order.get": open_order_row() });
        let err = split_order_line_pure(inp).refused("no lines, no split");
        assert_eq!(err.code, "sales.order_lines_unavailable", "unexpected code: {err:?}");
    }

    // ── sales#164 / #172 · THE AUTHORITATIVE PREVIEW ─────────────────────────────────────────────
    //
    // The till used to build the legs of a mixed payment on its OWN arithmetic (`cartTotal`), and
    // the server refuses legs that do not add up to the cent. Worse, with `default_tax_included =
    // 0` the divergence is not a rounding cent: it is the whole VAT, on every sale.
    //
    // The remedy is not a second implementation of the fiscal arithmetic in the browser — that is
    // the very bug the "adds up to the cent" check exists to catch. It is a READ-ONLY door onto
    // THE SAME valuation the checkout charges with: `value_checkout`, one function, two callers.
    //
    // These tests are the contract: for each shape of ticket, the preview and the sale agree cent
    // by cent. If the two ever drift, the ones that fail are these, not the customer's receipt.

    /// The preview of an input that would ALSO be a valid checkout.
    fn preview(inp: Value) -> Value {
        preview_checkout_pure(inp).accepted("the preview values the ticket")
            .result.expect("the preview answers through the result channel (hub#70)")
    }

    /// The figures the SALE writes, reduced to what the preview claims: total, base, quota and one
    /// row per line with its tax category. Read off the persisted operations — not off some
    /// intermediate value — so a drift between what is valued and what is written also fails here.
    fn sale_figures(out: &Output) -> Value {
        let header = out.operations.iter().find(|o| o.command == "sales._insert_sale")
            .expect("the sale header").params.clone();
        let lines: Vec<Value> = sale_lines(out).iter().map(|p| json!({
            "tax_category_key": p["tax_category_key"],
            "net_amount": p["net_amount"],
            "tax_amount": p["tax_amount"],
            "line_total": p["line_total"],
        })).collect();
        json!({
            "total": header["total"],
            "subtotal": header["subtotal"],
            "tax_total": header["tax_amount"],
            "discount_amount": header["discount_amount"],
            "lines": lines,
            "tax_breakdown": serde_json::from_str::<Value>(header["tax_breakdown"].as_str().unwrap_or("{}")).unwrap_or(Value::Null),
        })
    }

    /// The same reduction over the PREVIEW's answer.
    fn preview_figures(result: &Value) -> Value {
        let lines: Vec<Value> = result["lines"].as_array().cloned().unwrap_or_default().iter().map(|l| json!({
            "tax_category_key": l["tax_category_key"],
            "net_amount": l["net_amount"],
            "tax_amount": l["tax_amount"],
            "line_total": l["line_total"],
        })).collect();
        json!({
            "total": result["total"],
            "subtotal": result["subtotal"],
            "tax_total": result["tax_total"],
            "discount_amount": result["discount_amount"],
            "lines": lines,
            "tax_breakdown": result["tax_breakdown"],
        })
    }

    /// Strips from a checkout payload what only a CHARGE needs, leaving the valuation untouched.
    fn as_preview_input(mut inp: Value) -> Value {
        for key in ["idempotency_key", "payment_method_id", "payment_method_name", "amount_tendered", "payments"] {
            inp["payload"].as_object_mut().expect("payload").remove(key);
        }
        inp
    }

    /// The preview and the sale value the SAME ticket. One assertion, four shapes.
    fn preview_agrees_with_the_sale(inp: Value) -> Value {
        let sold = sale(inp.clone());
        let previewed = preview(as_preview_input(inp));
        assert_eq!(
            preview_figures(&previewed), sale_figures(&sold),
            "the preview and the charge must agree to the cent",
        );
        previewed
    }

    #[test]
    fn the_preview_writes_nothing_and_spends_no_number() {
        let out = preview_checkout_pure(as_preview_input(input(
            json!([{ "product_name": "Café", "price": 150, "quantity": 1_000_000, "tax_rate": 10.0 }]), 3, 0,
        ))).accepted("the preview values the ticket");
        assert!(out.operations.is_empty(), "a preview writes no row and bumps no counter");
        assert!(out.events.is_empty(), "a preview moves no stock, no till and no invoice");
        assert!(out.result.is_some(), "and it answers through the result channel");
    }

    #[test]
    fn preview_agrees_on_a_plain_ticket() {
        preview_agrees_with_the_sale(input(
            json!([{ "product_name": "Café", "price": 150, "quantity": 2_000_000, "tax_rate": 10.0 },
                   { "product_name": "Copa", "price": 495, "quantity": 1_000_000, "tax_rate": 21.0 }]), 4, 0,
        ));
    }

    #[test]
    fn preview_agrees_when_a_fixed_discount_is_prorated() {
        // ADR-0210 / sales#113: the fixed amount is split by largest remainder over the charged
        // lines, and the residual cent lands on ONE of them. This is the shape the till could never
        // reproduce, and the one that made a mixed payment bounce.
        let mut inp = input(
            json!([{ "product_name": "Café", "price": 150, "quantity": 3_000_000, "tax_rate": 10.0 },
                   { "product_name": "Tostada", "price": 235, "quantity": 1_000_000, "tax_rate": 10.0 }]), 4, 0,
        );
        inp["payload"]["discount_amount"] = json!(101);
        preview_agrees_with_the_sale(inp);
    }

    #[test]
    fn preview_agrees_on_a_goods_combo_split_across_two_rates() {
        // sales#172 — the discriminating vector of pm#156: sandwich 4,50 € (10 %) + beer 2,00 €
        // (21 %) sold as a 6,00 € pack. Art. 79.Dos LIVA splits it in proportion to the catalogue
        // price and the residual cent goes to the LARGEST remainder (the beer).
        let previewed = preview_agrees_with_the_sale(combo_input(
            json!([{ "option_id": "o-sandwich", "product_name": "Bocadillo" },
                   { "option_id": "o-beer", "product_name": "Cerveza" }]),
            json!([combo_option("o-sandwich", "g-food", 1, "p-sandwich", 0, "goods", 600, ""),
                   combo_option("o-beer", "g-drink", 1, "p-beer", 0, "goods", 600, "")]),
            json!([combo_product("p-sandwich", 450, "shop.food"),
                   combo_product("p-beer", 200, "product.generic")]),
            8,
        ));
        // The number of lines is decided by the number of TAX RATES, not of components.
        let lines = previewed["lines"].as_array().expect("lines").clone();
        assert_eq!(lines.len(), 2, "two rates inside the pack, two lines");
        let sum: i64 = lines.iter().map(|l| l["line_total"].as_i64().unwrap_or(0)).sum();
        assert_eq!(sum, 600, "the lines add up EXACTLY to the closed price");
        assert_eq!(previewed["total"], json!(600));
        let cats: Vec<&str> = lines.iter().map(|l| l["tax_category_key"].as_str().unwrap_or("")).collect();
        assert_eq!(cats, vec!["shop.food", "product.generic"], "each line keeps its own rate");
    }

    #[test]
    fn preview_agrees_on_a_service_combo_which_is_a_single_line() {
        // Art. 91.Uno.2.2º LIVA: a `service` set menu is ONE supply at the combo's own rate — no
        // split, no residual cent, however the wine inside is labelled.
        let previewed = preview_agrees_with_the_sale(menu_del_dia(1_000_000));
        let lines = previewed["lines"].as_array().expect("lines").clone();
        assert_eq!(lines.len(), 1, "a single supply is a single line");
        assert_eq!(lines[0]["line_total"], json!(1350));
        assert_eq!(lines[0]["tax_category_key"], json!("shop.food"));
    }

    #[test]
    fn with_prices_that_EXCLUDE_tax_the_preview_answers_the_gross_the_sale_charges() {
        // sales#164 (comment of 2026-08-25). With `default_tax_included = 0` the till's own total
        // is the BASE and the server charges base + quota: «Cobrar 100,00 €» charged 121,00 €.
        // The preview reads the SAME hub setting the checkout reads, so there is one truth again.
        let mut inp = input(
            json!([{ "product_name": "Consultoría", "price": 10_000, "quantity": 1_000_000, "tax_rate": 21.0 }]), 3, 0,
        );
        inp["payload"]["tax_included"] = json!(true); // the browser's hint, which must NOT win
        inp["context"]["reads"] = json!({ "sales.settings.get": [{ "default_tax_included": 0 }] });
        let previewed = preview_agrees_with_the_sale(inp);
        assert_eq!(previewed["tax_included"], json!(false), "the hub setting decides, not the payload");
        assert_eq!(previewed["subtotal"], json!(10_000), "the base is what the line said");
        assert_eq!(previewed["total"], json!(12_100), "and the charge is base + quota");
    }

    #[test]
    fn a_preview_of_an_empty_ticket_is_refused_with_the_same_code_as_the_sale() {
        let err = preview_checkout_pure(as_preview_input(input(json!([]), 2, 0)))
            .refused("there is nothing to value");
        assert_eq!(err.code, "sales.empty_sale");
    }

    #[test]
    fn a_preview_does_NOT_demand_the_customer_the_charge_will_demand() {
        // `require_customer` is a rule about CLOSING a sale, and it is curable on the same screen.
        // Refusing to value the ticket until the customer is captured would leave the till without
        // a total during the whole time it is being built — which is when it needs one.
        let mut inp = input(
            json!([{ "product_name": "Café", "price": 150, "quantity": 1_000_000, "tax_rate": 10.0 }]), 3, 0,
        );
        inp["context"]["reads"] = json!({ "sales.settings.get": [{ "require_customer": 1 }] });
        let previewed = preview(as_preview_input(inp.clone()));
        assert_eq!(previewed["total"], json!(150));
        // The CHARGE still refuses: the preview relaxes nothing about what closes a sale.
        let err = complete_sale_pure(inp).refused("the charge still needs the customer");
        assert_eq!(err.code, "sales.customer_required");
    }

    // ── sales#156 · the LINE NOTE, end to end ──────────────────────────────────────────────────
    //
    // `kitchen_order_item` has had a `notes` column since day one and the KDS paints it, but there
    // was nowhere to fill it from: the note never existed on `sales_order_item`, so «medium rare»
    // or «shellfish allergy» had no way of reaching the pass. The market is unanimous about the
    // shape — Toast's «Special Request» on the selected item, Square's per-item Notes, Lightspeed's
    // notes on the order line, Odoo's «Customer Note», Clover's `lineItem.note`, Revel's special
    // requests printed in red — and every one of them sends it to the kitchen.
    //
    // What is NOT market and is ours: the note is a WORKING column, like `modifiers` and `combo`.
    // It carries no money, `sales` interprets none of it, and it lives on the row so that resuming
    // the check, splitting it or transferring it keeps it.

    /// The order row exactly as `sales.order.lines` gives it back, with the note on it.
    fn noted_row(note: &str) -> Value {
        json!({ "id": "line-n", "order_id": "ord-1", "product_id": "p-burger",
                "product_name": "Hamburguesa", "quantity": 1_000_000, "unit_price": 900,
                "cost": 400, "tax_category_key": "product.generic", "is_gift": 0,
                "is_service": 0, "line_total": 900, "discount_percent": 0, "modifiers": "[]",
                "category_id": "cat-food", "notes": note })
    }

    #[test]
    fn opening_a_check_writes_the_lines_note() {
        let mut inp = open_input(burger_catalog(900));
        inp["payload"]["items"][0]["notes"] = json!("medium rare");
        let row = &order_lines(&orden(inp))[0];
        assert_eq!(row["notes"], json!("medium rare"), "the note belongs to the ROW, not the browser");
    }

    #[test]
    fn a_line_without_a_note_writes_an_empty_string_not_null() {
        // Every line of every check open today. The column is NOT NULL DEFAULT '' precisely so
        // nothing downstream has to learn a third state.
        let row = &order_lines(&orden(open_input(burger_catalog(900))))[0];
        assert_eq!(row["notes"], json!(""));
    }

    #[test]
    fn adding_a_line_to_an_open_check_writes_its_note_too() {
        // The door EVERY line but the first comes through. `add_line`'s payload is FLAT (it was
        // declarative SQL until sales#175), so the note arrives as a plain key.
        let mut inp = add_line_input(burger_catalog(900), open_order_row());
        inp["payload"]["notes"] = json!("no onion");
        let row = &order_lines(&add_order_line_pure(inp).expect("the line goes in"))[0];
        assert_eq!(row["notes"], json!("no onion"));
    }

    #[test]
    fn the_kitchen_ticket_carries_the_note_of_the_ROW() {
        // kitchen#54 put the fired lines under the server's authority: they come from the read,
        // not from `payload.items`. So the note has to come from there too, or a check fired from
        // the API — or from a POS that reloaded — would print a ticket with the note missing.
        let out = fire_order_pure(fire_input_with_lines(1, json!([noted_row("medium rare")])))
            .expect("there is a round to fire");
        let ev = &out.events[0];
        assert_eq!(ev.payload["items"][0]["notes"], json!("medium rare"));
    }

    #[test]
    fn the_note_and_the_comp_reason_travel_together_on_one_sub_line() {
        // They are two different things and the pass needs BOTH: what to cook, and why a plate
        // nobody is paying for is going out. `kitchen::modifiers_for_display` prints ONE indented
        // sub-line per item, so they are joined with the same « · » the paper already uses rather
        // than one of them silently winning.
        let mut row = noted_row("medium rare");
        row["is_gift"] = json!(1);
        row["gift_reason"] = json!("On the house");
        let out = fire_order_pure(fire_input_with_lines(1, json!([row]))).expect("fired");
        assert_eq!(
            out.events[0].payload["items"][0]["notes"],
            json!("medium rare · On the house"),
        );
    }

    #[test]
    fn a_comped_line_with_no_note_still_says_only_why() {
        // The behaviour before this issue, unchanged: a comp without a note prints just the reason.
        let mut row = noted_row("");
        row["is_gift"] = json!(1);
        row["gift_reason"] = json!("Kitchen error");
        let out = fire_order_pure(fire_input_with_lines(1, json!([row]))).expect("fired");
        assert_eq!(out.events[0].payload["items"][0]["notes"], json!("Kitchen error"));
    }

    #[test]
    fn charging_the_check_freezes_the_ROWS_note_on_the_sale_line() {
        // `sales_sale_item.notes` has existed since 001 and nobody ever wrote it — the same orphan
        // column this issue is about, one table over. It is frozen from the ROW, not from the
        // payload: the browser proposes nothing that the server did not already write down.
        let items = json!([{ "product_id": "p-burger", "product_name": "Hamburguesa",
                             "price": 900, "quantity": 1_000_000, "order_item_id": "line-n",
                             "notes": "the browser making things up" }]);
        let mut inp = input_fiscal(items, burger_catalog(900), tax_catalog());
        inp["payload"]["order_id"] = json!("ord-1");
        inp["context"]["reads"]["sales.order.lines"] = json!([noted_row("medium rare")]);
        assert_eq!(sale_lines(&sale(inp))[0]["notes"], json!("medium rare"));
    }

    #[test]
    fn a_counter_sale_has_no_row_so_its_note_comes_from_the_payload() {
        // There is no open check at the counter: the line is born and charged in the same call, so
        // the only place the note can come from is the call itself. It decides no money, so there
        // is nothing to verify it against — same door `is_catalog_line` already documents.
        let items = json!([{ "product_id": "p-burger", "product_name": "Hamburguesa",
                             "price": 900, "quantity": 1_000_000, "notes": "to go" }]);
        let out = sale(input_fiscal(items, burger_catalog(900), tax_catalog()));
        assert_eq!(sale_lines(&out)[0]["notes"], json!("to go"));
    }

    #[test]
    fn a_sale_line_without_a_note_writes_an_empty_string() {
        let items = json!([{ "product_id": "p-burger", "product_name": "Hamburguesa",
                             "price": 900, "quantity": 1_000_000 }]);
        let out = sale(input_fiscal(items, burger_catalog(900), tax_catalog()));
        assert_eq!(sale_lines(&out)[0]["notes"], json!(""));
    }


    #[test]
    fn every_sibling_of_a_set_menu_carries_the_menus_note() {
        // A set menu has no parent row with money (ADR-0381): the paper builds its header line by
        // grouping the siblings. So a note left only on the head would have nowhere to live and
        // would disappear from the ticket — the same rule the comp reason already follows.
        let choices = json!([{ "option_id": "o-sandwich" }, { "option_id": "o-beer" }]);
        let options = json!([combo_option("o-sandwich", "g-food", 1, "p-sandwich", 0, "goods", 600, ""),
                             combo_option("o-beer", "g-drink", 1, "p-beer", 0, "goods", 600, "")]);
        let products = json!([combo_product("p-sandwich", 450, "shop.food"),
                              combo_product("p-beer", 200, "product.generic")]);
        let mut inp = combo_input(json!([]), options, products, 8);
        inp["payload"]["items"] = json!([{ "product_id": "c-1", "product_name": "Pack merienda",
                                           "price": 600, "quantity": 1_000_000, "combo_id": "c-1",
                                           "combo_choices": choices, "notes": "no ice" }]);
        let notes: Vec<Value> = sale_lines(&sale(inp)).iter().map(|l| l["notes"].clone()).collect();
        assert_eq!(notes, vec![json!("no ice"), json!("no ice")]);
    }

    // ── sales#200 · A SUPPLEMENT OF AN OPEN CHECK IS CHARGED AT THE PRICE IT WAS ORDERED AT ────
    //
    // The half sales#175 left out. The base price of a parked line was already frozen on its row;
    // the supplement's delta was NOT: the row kept only the `option_id`s and the checkout resolved
    // the money against `modifiers.options.all` **when the check was paid**. Raising "+ cheese"
    // from 3.00 to 5.00 at 8 p.m. re-priced every table that had ordered it at lunchtime — exactly
    // the symptom sales#175 removed one floor above. The market decision is the same one, with the
    // same 8 references: the delta is frozen when the line is ORDERED.
    //
    // 🔴 Freezing the row's delta is only safe because the SERVER writes the row: the two doors
    // that materialise a line now resolve the supplements against the catalogue, exactly as they
    // already resolve the product's price (sales#175) — the payload decides nothing at any door.

    /// The `modifiers` catalogue as the runtime delivers it (`modifiers.options.all`).
    fn cheese_catalog(price_delta: i64) -> Value {
        json!([{ "option_id": "o-queso", "group_id": "g-extras", "name": "Extra de queso",
                 "kitchen_name": "+QUESO", "price_delta": price_delta, "tax_category_key": null }])
    }

    /// Opening a check with ONE burger AND its supplement, with both catalogues delivered.
    fn open_with_cheese(delta: i64) -> Value {
        let mut inp = open_input(burger_catalog(900));
        inp["payload"]["items"][0]["modifiers"] = json!([{ "option_id": "o-queso" }]);
        inp["context"]["reads"]["modifiers.options.all"] = cheese_catalog(delta);
        inp
    }

    /// The row of the open check as `sales.order.lines` gives it back, built from what the ordering
    /// door ACTUALLY wrote. It goes through the TEXT column on purpose: rebuilding the snapshot by
    /// hand would prove the test agrees with itself, not that the check survives the round trip.
    fn parked_row(out: &Output) -> Value {
        let written = &order_lines(out)[0];
        json!({ "id": "line-1", "order_id": "ord-1", "product_id": "p-burger",
                "product_name": "Hamburguesa", "quantity": 1_000_000,
                "unit_price": written["unit_price"].clone(), "cost": 400,
                "tax_category_key": written["tax_category_key"].clone(),
                "is_gift": 0, "is_service": 0, "line_total": written["line_total"].clone(),
                "discount_percent": 0, "modifiers": written["modifiers"].clone(),
                "combo": "{}", "combo_group_ref": null })
    }

    /// Charging that check: the till names the row and BOTH catalogues have moved since. The
    /// payload's picks are whatever the caller wants to try — they decide nothing.
    fn charge_parked(row: Value, catalog_now: i64, delta_now: i64, payload_picks: Value) -> Value {
        let items = json!([{ "product_id": "p-burger", "product_name": "Hamburguesa",
                             "price": 1, "quantity": 1_000_000, "order_item_id": "line-1",
                             "modifiers": payload_picks }]);
        let mut inp = input_fiscal(items, burger_catalog(catalog_now), tax_catalog());
        inp["payload"]["order_id"] = json!("ord-1");
        inp["context"]["reads"]["sales.order.lines"] = json!([row]);
        inp["context"]["reads"]["modifiers.options.all"] = cheese_catalog(delta_now);
        inp
    }

    #[test]
    fn ordering_a_supplement_freezes_its_DELTA_and_its_kitchen_name_on_the_row() {
        // The row stopped being "ids without money": the delta that will be charged is resolved
        // against the catalogue by the SERVER, at the moment the waiter takes the order.
        let row = &order_lines(&orden(open_with_cheese(300)))[0];
        let snap: Value = serde_json::from_str(row["modifiers"].as_str().expect("TEXT"))
            .expect("the column is a JSON list");
        assert_eq!(snap[0]["option_id"], json!("o-queso"));
        assert_eq!(snap[0]["price_delta"], json!(300), "the delta is frozen when it is ORDERED");
        assert_eq!(snap[0]["kitchen_name"], json!("+QUESO"), "and the name that gets printed");
        assert_eq!(row["unit_price"], json!(900),
                   "the delta does NOT go into `unit_price`: the checkout adds it on top");
    }

    // ── sales#208 · and that frozen delta is what the OPEN CHECK is worth ───────────────────
    //
    // `order_recompute_total.sql` adds up the rows' `line_total`, and that column carried the BASE
    // price alone: the list of open checks — and the bill the waiter carried to the table — read
    // 9,00 € while the drawer took 12,00 €. It is PROVISIONAL money (display), so it is composed
    // with the same arithmetic as the row's own amount and stays out of the fiscal path: the
    // checkout re-derives everything from `unit_price` plus this very snapshot.

    #[test]
    fn the_rows_PROVISIONAL_total_carries_the_supplement_too() {
        let row = &order_lines(&orden(open_with_cheese(300)))[0];
        assert_eq!(row["line_total"], json!(1200), "9,00 € of burger + 3,00 € of cheese");
        assert_eq!(row["unit_price"], json!(900),
                   "and the BASE price stays in its own column: the checkout adds the delta on top");
    }

    #[test]
    fn the_delta_is_per_UNIT_in_the_rows_total() {
        let mut inp = open_with_cheese(300);
        inp["payload"]["items"][0]["quantity"] = json!(2_000_000);
        assert_eq!(order_lines(&orden(inp))[0]["line_total"], json!(2400), "2 × (9,00 + 3,00)");
    }

    #[test]
    fn a_COMPED_line_is_still_worth_nothing_however_many_supplements_it_carries() {
        let mut inp = open_with_cheese(300);
        inp["payload"]["items"][0]["is_gift"] = json!(true);
        assert_eq!(order_lines(&orden(inp))[0]["line_total"], json!(0));
    }

    #[test]
    fn the_line_discount_applies_to_the_supplement_too_in_ONE_rounding() {
        // The same single HALF_UP the checkout does: (900 + 300) × 0,9 = 1080, not 810 + 270.
        let mut inp = open_with_cheese(300);
        inp["payload"]["items"][0]["discount"] = json!(10.0);
        assert_eq!(order_lines(&orden(inp))[0]["line_total"], json!(1080));
    }

    #[test]
    fn charging_a_resumed_check_uses_the_FROZEN_delta_even_if_the_catalogue_went_UP() {
        // 🔴 THE SYMPTOM OF THE ISSUE: table 4 ordered "+ cheese" at 3.00 €, the manager raises it
        // to 5.00 € while the table is still open, and the check is charged 9.00 + 3.00.
        let parked = parked_row(&orden(open_with_cheese(300)));
        let out = sale(charge_parked(parked, 900, 500, json!([{ "option_id": "o-queso" }])));
        assert_eq!(sale_lines(&out)[0]["line_total"], json!(1200),
                   "it charged the supplement at TODAY's price, not the one it was ordered at");
    }

    #[test]
    fn and_also_when_the_supplement_went_DOWN() {
        // Freezing is symmetrical or it is not freezing (the same trade-off sales#175 documents):
        // a markdown is applied by hand, with the line discount, and carries a name.
        let parked = parked_row(&orden(open_with_cheese(300)));
        let out = sale(charge_parked(parked, 900, 100, json!([{ "option_id": "o-queso" }])));
        assert_eq!(sale_lines(&out)[0]["line_total"], json!(1200));
    }

    #[test]
    fn the_frozen_NAME_travels_to_the_sale_line_too() {
        // The receipt names what was ordered, with the name the menu had then: the snapshot of the
        // sale line is copied from the row's, not resolved again against today's catalogue.
        let parked = parked_row(&orden(open_with_cheese(300)));
        let out = sale(charge_parked(parked, 900, 500, json!([{ "option_id": "o-queso" }])));
        let snap: Value = serde_json::from_str(sale_lines(&out)[0]["modifiers"].as_str().expect("TEXT"))
            .expect("JSON");
        assert_eq!(snap[0]["kitchen_name"], json!("+QUESO"));
        assert_eq!(snap[0]["price_delta"], json!(300), "the sale line declares what was charged");
    }

    #[test]
    fn the_PAYLOAD_supplements_still_decide_nothing_on_an_open_check() {
        // The hole of sales#68 does not reopen through the back door. The browser sends a delta of
        // its own AND an extra pick that is not on the row: the row is what is charged.
        let parked = parked_row(&orden(open_with_cheese(300)));
        let picks = json!([{ "option_id": "o-queso", "price_delta": -500 },
                           { "option_id": "o-queso" }]);
        let out = sale(charge_parked(parked, 900, 300, picks));
        assert_eq!(sale_lines(&out)[0]["line_total"], json!(1200), "the browser won");
    }

    #[test]
    fn a_supplement_WITHDRAWN_from_the_menu_after_it_was_ordered_is_still_charged() {
        // The consequence of freezing, and it is the wanted one: the row is the proof the option
        // existed when it was ordered. Re-checking it against today's catalogue would leave a table
        // unable to pay because someone tidied up the menu mid-service.
        let parked = parked_row(&orden(open_with_cheese(300)));
        let items = json!([{ "product_id": "p-burger", "product_name": "Hamburguesa",
                             "price": 1, "quantity": 1_000_000, "order_item_id": "line-1",
                             "modifiers": [{ "option_id": "o-queso" }] }]);
        let mut inp = input_fiscal(items, burger_catalog(900), tax_catalog());
        inp["payload"]["order_id"] = json!("ord-1");
        inp["context"]["reads"]["sales.order.lines"] = json!([parked]);
        inp["context"]["reads"]["modifiers.options.all"] = json!([]);
        assert_eq!(sale_lines(&sale(inp))[0]["line_total"], json!(1200));
    }

    #[test]
    fn a_FROZEN_supplement_that_taxes_DIFFERENTLY_gets_its_child_line_at_the_FROZEN_delta() {
        // sales#147 across the freeze of sales#200, which is where a restaurant actually lives: the
        // waiter takes the order, the menu is edited, the table pays half an hour later. The
        // option's own category AND its delta travel FROZEN on the row, so the child line is
        // materialised from what the menu said WHEN IT WAS ORDERED — 2,00 €, not today's price —
        // and the table is not re-priced in silence.
        //
        // The child is materialised HERE and not on `sales_order_item`, and that is the design:
        // `sales_order_item` keeps carrying the picks, so splitting, transferring and merging a
        // check move parent and supplement together for free — there is no orphan row to move,
        // because the row does not exist until the money is decided.
        let row = json!({ "id": "line-1", "order_id": "ord-1", "product_id": "p-burger",
                          "product_name": "Hamburguesa", "quantity": 1_000_000,
                          "unit_price": 900, "cost": 400, "tax_category_key": "product.generic",
                          "is_gift": 0, "is_service": 0, "line_total": 900, "discount_percent": 0,
                          "modifiers": "[{\"option_id\":\"o-refresco\",\"group_id\":\"g\",\"name\":\"Refresco\",\"kitchen_name\":\"+REFRESCO\",\"price_delta\":200,\"tax_category_key\":\"restaurant.food\"}]",
                          "combo": "{}", "combo_group_ref": null });
        let mut inp = charge_parked(row, 900, 300, json!([]));
        // The hub taxes both categories: 21 % for the burger, 10 % for the drink.
        inp["context"]["reads"]["taxes.rules.list"] = json!([
            { "id": "r-es-21", "country_code": "ES", "region_code": null,
              "tax_category_key": "product.generic", "rate_pct": 21.0, "tax_type": "vat" },
            { "id": "r-es-10", "country_code": "ES", "region_code": null,
              "tax_category_key": "restaurant.food", "rate_pct": 10.0, "tax_type": "vat" }
        ]);
        inp["context"]["new_ids"] = json!(["id-0", "id-1", "id-2", "id-3", "id-4"]);
        let lines = sale_lines(&sale(inp));
        assert_eq!(lines.len(), 2, "the burger and its drink: {lines:?}");
        assert_eq!(lines[0]["unit_price"], json!(900), "the price the check froze");
        assert_eq!(lines[0]["tax_rate"], json!(21.0));
        assert_eq!(lines[1]["unit_price"], json!(200), "the delta the check froze, not today's 300");
        assert_eq!(lines[1]["tax_rate"], json!(10.0));
        assert_eq!(lines[1]["parent_line_ref"], lines[0]["line_id"]);
    }

    #[test]
    fn a_row_written_BEFORE_the_freeze_is_still_priced_by_the_catalogue() {
        // Backward compatibility that decides money: the checks open in production right now carry
        // `[{"option_id":"…"}]`, with no delta. An entry with no frozen delta is resolved against
        // the catalogue exactly as it was before this issue — refusing an unknown option included.
        // Reading a missing delta as 0 would undercharge every one of those tables in silence.
        let row = json!({ "id": "line-1", "order_id": "ord-1", "product_id": "p-burger",
                          "product_name": "Hamburguesa", "quantity": 1_000_000,
                          "unit_price": 900, "cost": 400, "tax_category_key": "product.generic",
                          "is_gift": 0, "is_service": 0, "line_total": 900, "discount_percent": 0,
                          "modifiers": "[{\"option_id\":\"o-queso\"}]",
                          "combo": "{}", "combo_group_ref": null });
        let out = sale(charge_parked(row, 900, 500, json!([])));
        assert_eq!(sale_lines(&out)[0]["line_total"], json!(1400), "9.00 + today's 5.00");
    }

    #[test]
    fn a_legacy_row_naming_an_option_that_is_gone_is_refused_like_it_always_was() {
        let row = json!({ "id": "line-1", "order_id": "ord-1", "product_id": "p-burger",
                          "product_name": "Hamburguesa", "quantity": 1_000_000,
                          "unit_price": 900, "cost": 400, "tax_category_key": "product.generic",
                          "is_gift": 0, "is_service": 0, "line_total": 900, "discount_percent": 0,
                          "modifiers": "[{\"option_id\":\"o-inventado\"}]",
                          "combo": "{}", "combo_group_ref": null });
        let err = complete_sale_pure(charge_parked(row, 900, 300, json!([])))
            .refused("must refuse");
        assert_eq!(err.code, "sales.modifier_not_available", "stable code: {err:?}");
    }

    #[test]
    fn a_row_whose_supplements_cannot_be_READ_refuses_the_sale() {
        // The column is TEXT (migration 023) and kitchen prints a bare string verbatim ("old
        // format"). Money cannot: reading what is not our list as "no supplements" would charge the
        // check short by the whole delta and say nothing. Falling back to the payload would be
        // worse — that is the browser deciding money (sales#68).
        let row = json!({ "id": "line-1", "order_id": "ord-1", "product_id": "p-burger",
                          "product_name": "Hamburguesa", "quantity": 1_000_000,
                          "unit_price": 900, "cost": 400, "tax_category_key": "product.generic",
                          "is_gift": 0, "is_service": 0, "line_total": 900, "discount_percent": 0,
                          "modifiers": "sin cebolla", "combo": "{}", "combo_group_ref": null });
        let err = complete_sale_pure(charge_parked(row, 900, 300, json!([])))
            .refused("must refuse");
        assert_eq!(err.code, "sales.order_line_modifiers_unreadable", "stable code: {err:?}");
    }

    #[test]
    fn a_row_that_comes_back_WITHOUT_its_supplements_column_refuses_the_sale() {
        // If `sales.order.lines` ever stopped returning `modifiers`, a check with supplements would
        // be charged as if it had none — the whole delta lost, in silence, on every table. The
        // absent column is told apart from an empty list on purpose: only one of the two is a bug.
        let mut row = json!({ "id": "line-1", "order_id": "ord-1", "product_id": "p-burger",
                              "product_name": "Hamburguesa", "quantity": 1_000_000,
                              "unit_price": 900, "cost": 400, "tax_category_key": "product.generic",
                              "is_gift": 0, "is_service": 0, "line_total": 900,
                              "discount_percent": 0, "combo": "{}", "combo_group_ref": null });
        let err = complete_sale_pure(charge_parked(row.take(), 900, 300, json!([])))
            .refused("must refuse");
        assert_eq!(err.code, "sales.order_line_modifiers_unreadable", "stable code: {err:?}");
    }

    #[test]
    fn a_COUNTER_sale_still_prices_its_supplements_from_the_CATALOGUE() {
        // Control over the other half of the world: with no open check there is no "when it was
        // ordered" apart from "when it is paid", so the catalogue rules — as it has since sales#68.
        let items = json!([{ "product_id": "p-burger", "product_name": "Hamburguesa",
                             "price": 1, "quantity": 1_000_000,
                             "modifiers": [{ "option_id": "o-queso", "price_delta": -500 }] }]);
        let mut inp = input_fiscal(items, burger_catalog(900), tax_catalog());
        inp["context"]["reads"]["modifiers.options.all"] = cheese_catalog(500);
        assert_eq!(sale_lines(&sale(inp))[0]["line_total"], json!(1400), "9.00 + today's 5.00");
    }

    #[test]
    fn ordering_an_unknown_supplement_is_refused_at_the_ORDERING_door() {
        // It used to be refused only when paying: the waiter parked a check that could not be
        // charged and nobody found out until the customer was at the till. The row decides money
        // now, so it is checked where it is written.
        let mut inp = open_with_cheese(300);
        inp["payload"]["items"][0]["modifiers"] = json!([{ "option_id": "o-inventado" }]);
        let err = open_order_pure(inp).refused("nothing is frozen blind");
        assert_eq!(err.code, "sales.modifier_not_available", "unexpected code: {err:?}");
    }

    #[test]
    fn ordering_a_supplement_WITHOUT_its_catalogue_fails_CLOSED() {
        // The same degradation as the checkout: with no catalogue there is no way to value the
        // supplement, and freezing "what the browser said" is the hole sales#68 closed.
        let mut inp = open_input(burger_catalog(900));
        inp["payload"]["items"][0]["modifiers"] = json!([{ "option_id": "o-queso" }]);
        let err = open_order_pure(inp).refused("no catalogue, no freeze");
        assert_eq!(err.code, "sales.modifier_catalog_unavailable", "unexpected code: {err:?}");
    }

    #[test]
    fn a_line_ordered_WITHOUT_supplements_does_not_change_at_all() {
        // No-regression control over the 99 % of lines: no supplements, no catalogue needed, empty
        // snapshot. If this went red, ordering anything at all would be broken.
        let row = &order_lines(&orden(open_input(burger_catalog(900))))[0];
        assert_eq!(row["modifiers"], json!("[]"));
        assert_eq!(row["unit_price"], json!(900));
    }

    #[test]
    fn adding_a_line_freezes_its_supplements_DELTA_too() {
        // The OTHER door of an open check (`sales.order.add_line`), with the same rule: the check
        // that grows during service freezes each supplement as it is ordered.
        let mut inp = add_line_input(burger_catalog(900), open_order_row());
        inp["payload"]["modifiers"] = json!("[{\"option_id\":\"o-queso\"}]"); // serialised (flat shape)
        inp["context"]["reads"]["modifiers.options.all"] = cheese_catalog(300);
        let out = add_order_line_pure(inp).accepted("the line goes in");
        let snap: Value = serde_json::from_str(order_lines(&out)[0]["modifiers"].as_str().expect("TEXT"))
            .expect("JSON");
        assert_eq!(snap[0]["price_delta"], json!(300));
        assert_eq!(snap[0]["kitchen_name"], json!("+QUESO"));
    }

    // ── sales#204 · UN ID DE LA TANDA NOMBRA UNA FILA ─────────────────────────────────────────
    //
    // `context.new_ids` es la autoridad de ids (hub#776): la tanda que entrega el host se reparte
    // entre las filas de la venta y cada id nombra UNA. El reparto contaba los items del PAYLOAD,
    // y un combo `goods` partido en hermanas (art. 79.Dos LIVA) hace que las líneas EXPANDIDAS
    // sean más que los items — así que la primera pata del pago volvía a tomar el id de la última
    // línea. `sales_sale_item` y `sales_sale_payment` son tablas distintas, de modo que nada
    // reventaba a la vista: lo que quedaba era una venta con dos filas llamadas igual.

    /// Every id of the host's batch this checkout STAMPED on a row, in emission order: the sale
    /// header, then the lines, then the payment legs. References to OTHER rows
    /// (`parent_line_ref`, `combo_group_ref`) are deliberately out — they name an id, they do not
    /// consume one.
    fn stamped_row_ids(out: &Output) -> Vec<String> {
        out.operations
            .iter()
            .filter_map(|o| match o.command.as_str() {
                "sales._insert_sale" => o.params.get("sale_id"),
                "sales._insert_line" => o.params.get("line_id"),
                "sales._insert_payment" => o.params.get("payment_id"),
                _ => None,
            })
            .map(as_str)
            .collect()
    }

    /// The invariant, in one place: no id of the batch may name two rows of the same sale.
    fn assert_no_id_names_two_rows(out: &Output) -> Vec<String> {
        let ids = stamped_row_ids(out);
        let unique: std::collections::HashSet<&String> = ids.iter().collect();
        assert!(!ids.iter().any(|id| id.is_empty()), "no row goes out with an EMPTY id: {ids:?}");
        assert_eq!(unique.len(), ids.len(), "one id of the batch = ONE row, but: {ids:?}");
        ids
    }

    #[test]
    fn a_SPLIT_combo_does_not_give_the_payment_the_id_of_its_last_line() {
        // 🔴 The reproducer of sales#204. One item in the payload (a 6,00 € pack) that the server
        // splits into two sibling lines, and a single tender. Counting the payload's items handed
        // the payment `id-2`, which is the beer's line.
        let out = sale(combo_input(
            json!([{ "option_id": "o-sandwich", "product_name": "Bocadillo" },
                   { "option_id": "o-beer", "product_name": "Cerveza" }]),
            json!([combo_option("o-sandwich", "g-food", 1, "p-sandwich", 0, "goods", 600, ""),
                   combo_option("o-beer", "g-drink", 1, "p-beer", 0, "goods", 600, "")]),
            json!([combo_product("p-sandwich", 450, "shop.food"),
                   combo_product("p-beer", 200, "product.generic")]),
            8,
        ));
        assert_eq!(sale_lines(&out).len(), 2, "the pack splits: this test needs the split");
        let ids = assert_no_id_names_two_rows(&out);
        // And the exact layout, so a future reshuffle of the batch is a red test and not a silent
        // change: header, the two siblings, then the leg.
        assert_eq!(ids, vec!["id-0", "id-1", "id-2", "id-3"]);
    }

    #[test]
    fn a_PLAIN_sale_still_puts_the_payment_right_after_its_only_line() {
        // Control: the 99 % of tickets, where the payload's items and the expanded lines are the
        // same thing. The fix must not shift the batch by one here.
        let out = sale(input(
            json!([{ "product_name": "Café", "price": 150, "quantity": 1_000_000, "tax_rate": 10.0 }]),
            3,
            150,
        ));
        let ids = assert_no_id_names_two_rows(&out);
        assert_eq!(ids, vec!["id-0", "id-1", "id-2"]);
    }

    #[test]
    fn three_siblings_and_TWO_legs_keep_one_id_per_row() {
        // ADR-0386 — a mixed payment over a combo split in three: the drift used to GROW with the
        // legs, so the first leg landed on the third line and the second on nothing of its own.
        let mut inp = combo_input(
            json!([{ "option_id": "o-a" }, { "option_id": "o-b" }, { "option_id": "o-c" }]),
            json!([combo_option("o-a", "g1", 1, "p-a", 0, "goods", 1000, ""),
                   combo_option("o-b", "g2", 1, "p-b", 0, "goods", 1000, ""),
                   combo_option("o-c", "g3", 1, "p-c", 0, "goods", 1000, "")]),
            json!([combo_product("p-a", 500, "shop.food"),
                   combo_product("p-b", 500, "shop.food"),
                   combo_product("p-c", 500, "product.generic")]),
            8,
        );
        inp["context"]["reads"]["sales.payment_methods"] = mixed_catalog();
        inp["payload"]["payments"] = json!([
            { "payment_method_id": "pm-card", "amount": 600 },
            { "payment_method_id": "pm-cash", "amount": 400, "amount_tendered": 400 }
        ]);
        for key in ["payment_method_id", "payment_method_name", "amount_tendered"] {
            inp["payload"].as_object_mut().expect("payload").remove(key);
        }
        let out = sale(inp);
        assert_eq!(sale_lines(&out).len(), 3, "three tax-split siblings");
        assert_eq!(payment_ops(&out).len(), 2, "two legs");
        let ids = assert_no_id_names_two_rows(&out);
        assert_eq!(ids, vec!["id-0", "id-1", "id-2", "id-3", "id-4", "id-5"]);
    }

    #[test]
    fn the_batch_running_out_is_still_a_LOUD_refusal_counted_over_the_EXPANDED_lines() {
        // The guard counted the same thing wrong, so it never caught this. With two siblings and
        // one leg the sale needs FOUR ids: three are a refusal, four go through.
        let split_pack = |ids: usize| {
            combo_input(
                json!([{ "option_id": "o-sandwich" }, { "option_id": "o-beer" }]),
                json!([combo_option("o-sandwich", "g-food", 1, "p-sandwich", 0, "goods", 600, ""),
                       combo_option("o-beer", "g-drink", 1, "p-beer", 0, "goods", 600, "")]),
                json!([combo_product("p-sandwich", 450, "shop.food"),
                       combo_product("p-beer", 200, "product.generic")]),
                ids,
            )
        };
        let err = complete_sale_pure(split_pack(3)).refused("three ids cannot hold four rows");
        assert_eq!(err.code, "sales.too_many_rows", "unexpected code: {err:?}");
        assert_no_id_names_two_rows(&sale(split_pack(4)));
    }


    // ── sales#25 · THE MODULE MATRIX AT THE MONEY DOOR ────────────────────────────────────────
    //
    // `inventory` stopped being a hard dependency and became an OPTIONAL capability (ADR-0127), so
    // "the catalogue read did not arrive" is no longer an anomaly to be sorry about: it is the hub
    // of a salon that only sells haircuts, and of the bar that has not fichado a thing yet. That
    // makes the runtime's `reads` a MATRIX, and this block walks it — one combination per test,
    // through the three doors that decide money (`complete_sale`, `checkout.preview`,
    // `add_order_line`).
    //
    // The rule under every row is the same and does not bend: what a line CLAIMS to be decides what
    // has to back it. A line that says "I am product `p-wine` from this hub" needs the catalogue;
    // a service line and an open-price line claim nothing of the sort and never did.
    //
    // The reads are built by ABSENCE — the key is simply not in `context.reads`, which is exactly
    // what the runtime delivers when the owner module is not installed. Handing an empty array
    // instead would be testing "installed with an empty catalogue", a different fact.
    mod optional_catalogue_matrix {
        use super::*;

        /// The tax rules a hub with `taxes` really has: goods and services, both at 21 % in ES.
        /// `taxes` is the one dependency that STAYS hard, so every row of the matrix has them.
        fn rules() -> Value {
            json!([{ "id": "r-es-21", "country_code": "ES", "region_code": null,
                     "tax_category_key": "product.generic", "rate_pct": 21.0, "tax_type": "vat" },
                   { "id": "r-es-s21", "country_code": "ES", "region_code": null,
                     "tax_category_key": "service.generic", "rate_pct": 21.0, "tax_type": "vat" }])
        }

        /// A line that claims to come from the product catalogue.
        fn catalogue_line() -> Value {
            json!([{ "product_id": "p-wine", "product_name": "Vino", "price": 5000,
                     "quantity": 1_000_000, "tax_category_key": "product.generic", "tax_rate": 21.0 }])
        }

        /// A SERVICE line: `services` owns it, and `sales` never had a catalogue to check it
        /// against — that is why it carries its price (sales#89 keeps it an optional read).
        fn service_line() -> Value {
            json!([{ "product_id": "s-cut", "product_name": "Corte", "price": 2000,
                     "quantity": 1_000_000, "tax_category_key": "service.generic", "tax_rate": 21.0,
                     "is_service": true }])
        }

        /// An OPEN-PRICE line (ADR-0085): sold by department, claims no catalogue row. The
        /// department IS its tax category — that is the whole shape of a free-price sale.
        fn open_price_line() -> Value {
            json!([{ "product_name": "Varios", "price": 250, "quantity": 1_000_000,
                     "tax_category_key": "product.generic", "tax_rate": 21.0 }])
        }

        /// `sales` + `taxes` and nothing else: no `inventory.products.for_sale` read at all. The
        /// key is ABSENT, not empty — an empty array would be "installed with nothing on sale".
        fn without_catalogue(items: Value) -> Value {
            input_fiscal(items, Value::Null, rules())
        }

        /// The same hub WITH the catalogue app.
        fn with_catalogue(items: Value) -> Value {
            input_fiscal(items, product_catalog(), rules())
        }

        // ── row 1 · `sales` + `taxes` only ───────────────────────────────────────────────────
        #[test]
        fn with_no_catalogue_app_an_open_price_line_is_charged() {
            let out = complete_sale_pure(without_catalogue(open_price_line()))
                .accepted("free price is the degraded mode, so it cannot need the catalogue");
            let line = out.operations.iter().find(|o| o.command == "sales._insert_line").unwrap();
            assert_eq!(line.params["unit_price"], json!(250));
        }

        #[test]
        fn with_no_catalogue_app_a_catalogue_line_is_still_refused() {
            // Optional does NOT mean lenient. Dropping the dependency changed who is expected to be
            // there; it did not change who may set a price. Accepting this would let a caller sell
            // a product of the hub at the price it typed, which is sales#68 reopened.
            let err = complete_sale_pure(without_catalogue(catalogue_line()))
                .refused("a line that claims to be from the catalogue needs the catalogue");
            assert_eq!(err.code, "sales.catalog_unavailable", "unexpected code: {err:?}");
        }

        #[test]
        fn the_preview_answers_the_same_two_ways_as_the_charge() {
            // sales#209 — the preview is the SAME valuation, read-only. If it valued a ticket the
            // charge is going to refuse, the till would show a total nobody can take money for.
            preview_checkout_pure(as_preview_input(without_catalogue(open_price_line())))
                .accepted("a free-price ticket is previewable with no catalogue app");
            let err = preview_checkout_pure(as_preview_input(without_catalogue(catalogue_line())))
                .refused("and a catalogue line is not");
            assert_eq!(err.code, "sales.catalog_unavailable", "unexpected code: {err:?}");
        }

        #[test]
        fn the_open_check_door_holds_the_same_line() {
            // `add_order_line` freezes the price into the row, and the checkout then HONOURS that
            // row (sales#175). A catalogue line let in here without a catalogue would launder the
            // browser's price into a column the charge trusts.
            let mut inp = order_input(catalogue_line(), 2);
            inp["payload"]["order_id"] = json!("ord-1");
            inp["context"]["reads"]["sales.order.get"] = json!([{ "id": "ord-1", "status": "open" }]);
            inp["context"]["reads"].as_object_mut().unwrap().remove("inventory.products.for_sale");
            let items = inp["payload"]["items"].as_array().cloned().unwrap();
            inp["payload"]["items"] = json!([items[0]]);
            for (k, v) in items[0].as_object().unwrap() {
                inp["payload"][k] = v.clone();
            }
            let err = add_order_line_pure(inp).refused("no catalogue, no frozen row");
            assert_eq!(err.code, "sales.catalog_unavailable", "unexpected code: {err:?}");
        }

        // ── row 2 · `+ inventory` ────────────────────────────────────────────────────────────
        #[test]
        fn with_the_catalogue_app_the_catalogue_prices_the_line() {
            // The whole point of keeping the read: present, it MANDA. The payload said 50,00 €
            // here because the till painted it; what is charged is the row's price either way.
            let out = complete_sale_pure(with_catalogue(catalogue_line()))
                .accepted("with the catalogue the line is priced and charged");
            let line = out.operations.iter().find(|o| o.command == "sales._insert_line").unwrap();
            assert_eq!(line.params["unit_price"], json!(5000), "the price came from the catalogue row");
            assert_eq!(line.params["tax_category_key"], json!("product.generic"),
                       "and so did the fiscal category, which is the other thing the browser may not set");
        }

        // ── row 3 · `+ services` ─────────────────────────────────────────────────────────────
        #[test]
        fn a_service_is_charged_with_no_product_catalogue_at_all() {
            // The salon that made sales#30 exist: `services` + `taxes`, no stock app anywhere.
            let out = complete_sale_pure(without_catalogue(service_line()))
                .accepted("a salon must be able to charge a haircut");
            let line = out.operations.iter().find(|o| o.command == "sales._insert_line").unwrap();
            assert_eq!(line.params["unit_price"], json!(2000));
            assert_eq!(line.params["is_service"], json!(1), "and it is written down as a service");
        }

        #[test]
        fn a_service_and_a_free_line_ride_the_same_ticket_through_the_same_fiscal_door() {
            let mut items = service_line().as_array().cloned().unwrap();
            items.extend(open_price_line().as_array().cloned().unwrap());
            let out = complete_sale_pure(without_catalogue(Value::Array(items)))
                .accepted("mixing the two things a hub without a catalogue sells");
            assert_eq!(sale_lines(&out).len(), 2, "both lines are persisted");
            let header = out.operations.iter().find(|o| o.command == "sales._insert_sale").unwrap();
            assert_eq!(header.params["total"], json!(2250), "one total, one tax breakdown, one door");
        }

        // ── row 4 · `+ customers` ────────────────────────────────────────────────────────────
        #[test]
        fn the_customers_fiscal_snapshot_travels_frozen_without_a_product_catalogue() {
            // ADR-0132: the customer's fiscal identity travels in `sale.completed` so `invoice`
            // can issue with NIF. It rides the payload, not a read, so it does not depend on the
            // catalogue app either — which is what a salon invoicing a company needs.
            let mut inp = without_catalogue(service_line());
            inp["payload"]["customer_id"] = json!("cus-1");
            inp["payload"]["customer_name"] = json!("Ana García");
            inp["payload"]["customer_tax_id"] = json!("12345678Z");
            inp["payload"]["customer_address"] = json!("Calle Mayor 1, 28013 Madrid, ES");
            let out = complete_sale_pure(inp).accepted("the sale closes");
            let ev = &out.events[0].payload;
            assert_eq!(ev["customer_tax_id"], json!("12345678Z"));
            assert_eq!(ev["customer_address"], json!("Calle Mayor 1, 28013 Madrid, ES"));
        }

        // ── the one dependency that STAYS hard ───────────────────────────────────────────────
        #[test]
        fn taxes_is_the_line_that_does_not_move() {
            // `taxes.rules.list` is declared `required: true` (sales#21/hub#701), so with no tax
            // app the runtime aborts the command before the handler runs. What the handler pins is
            // the other half: a hub whose rules DID arrive and do not cover the line is refused
            // too, and with its own code — nothing is ever charged with the browser's VAT.
            let items = json!([{ "product_name": "Varios", "price": 250, "quantity": 1_000_000,
                                 "tax_category_key": "product.generic", "tax_rate": 21.0 }]);
            let err = complete_sale_pure(input_fiscal(items, Value::Null, json!([])))
                .refused("no rule, no sale");
            assert_eq!(err.code, "sales.no_tax_rule", "unexpected code: {err:?}");
        }
    }

    // ── sales#323 · THE SALE NUMBER CARRIES THE BUSINESS DAY, NOT THE UTC ONE ────────────────
    //
    // The runtime hands over `context.now` in UTC and the business zone as an IANA name in
    // `context.timezone` (hub#1022, `settings::timezone_of`). Cutting the day off `now` numbered
    // everything charged between local midnight and 02:00 (summer in Spain) with YESTERDAY's
    // date: `20260918-0006` at 01:57 on the 19th. Same root as invoice#78, non-fiscal half.

    /// A one-line sale charged at `now` (UTC instant) in a hub whose zone is `timezone`.
    fn sale_at(now: &str, timezone: Option<&str>) -> Output {
        let items = json!([{ "product_name": "Caña", "price": 250, "quantity": 1_000_000, "tax_rate": 10.0 }]);
        let mut inp = input(items, 3, 250);
        inp["context"]["now"] = json!(now);
        if let Some(tz) = timezone {
            inp["context"]["timezone"] = json!(tz);
        }
        sale(inp)
    }

    /// The `day` the counter is bumped for — the prefix of `sale_number` (`_insert_sale.sql`).
    fn counter_day(out: &Output) -> Value {
        let bump = out.operations.iter().find(|op| op.command == "sales._bump_counter").expect("bump");
        let header = out.operations.iter().find(|op| op.command == "sales._insert_sale").expect("header");
        assert_eq!(bump.params["day"], header.params["day"], "counter and header must agree on the day");
        bump.params["day"].clone()
    }

    #[test]
    fn a_sale_charged_after_local_midnight_is_numbered_with_the_business_day() {
        // 01:57 on the 19th in Madrid (CEST, UTC+2) is 23:57 on the 18th in UTC — the QA evidence.
        assert_eq!(counter_day(&sale_at("2026-09-18T23:57:41+00:00", Some("Europe/Madrid"))), json!("20260919"));
    }

    #[test]
    fn the_day_flips_at_the_business_midnight_not_at_utc_midnight() {
        // 23:30 on the 18th in Madrid is 21:30Z: still the 18th.
        assert_eq!(counter_day(&sale_at("2026-09-18T21:30:00+00:00", Some("Europe/Madrid"))), json!("20260918"));
        // 00:00:30 on the 19th in Madrid is 22:00:30Z: already the 19th.
        assert_eq!(counter_day(&sale_at("2026-09-18T22:00:30+00:00", Some("Europe/Madrid"))), json!("20260919"));
    }

    #[test]
    fn a_zone_west_of_utc_moves_the_day_back_not_forward() {
        // 03:00Z on the 19th is 21:00 on the 18th in Mexico City (UTC−6).
        assert_eq!(counter_day(&sale_at("2026-09-19T03:00:00+00:00", Some("America/Mexico_City"))), json!("20260918"));
    }

    #[test]
    fn the_october_clock_change_moves_the_border_with_it() {
        // Sat 24/10 22:30Z = Sun 25/10 00:30 CEST (UTC+2) → the 25th.
        assert_eq!(counter_day(&sale_at("2026-10-24T22:30:00+00:00", Some("Europe/Madrid"))), json!("20261025"));
        // Sun 25/10 22:30Z = 23:30 CET (UTC+1, after the change) → still the 25th.
        assert_eq!(counter_day(&sale_at("2026-10-25T22:30:00+00:00", Some("Europe/Madrid"))), json!("20261025"));
        // The Canaries run one hour behind the peninsula: 23:30Z on the 24th is 00:30 there → 25th.
        assert_eq!(counter_day(&sale_at("2026-10-24T23:30:00+00:00", Some("Atlantic/Canary"))), json!("20261025"));
    }

    #[test]
    fn without_a_usable_zone_the_day_stays_on_utc() {
        // No zone, an empty one, or a name nobody knows → the runtime's own fallback (`UTC`).
        assert_eq!(counter_day(&sale_at("2026-09-18T23:57:41+00:00", None)), json!("20260918"));
        assert_eq!(counter_day(&sale_at("2026-09-18T23:57:41+00:00", Some(""))), json!("20260918"));
        assert_eq!(counter_day(&sale_at("2026-09-18T23:57:41+00:00", Some("Mars/Olympus"))), json!("20260918"));
    }

    #[test]
    fn an_instant_without_an_offset_keeps_its_own_date_never_an_empty_one() {
        // Not what the runtime sends (it is RFC 3339), but a naive instant must not zero the day.
        assert_eq!(counter_day(&sale_at("2026-09-18T23:57:41", Some("Europe/Madrid"))), json!("20260918"));
    }

    #[test]
    fn a_tax_rate_change_at_new_year_applies_from_the_business_midnight() {
        // The rule catalogue is dated by day (`valid_from`). At 00:30 on 1 January in Madrid
        // (23:30Z on 31 December) the NEW rate already governs — the UTC day would still say 2026.
        let items = json!([
            { "product_name": "Café", "price": 10000, "quantity": 1_000_000, "tax_category_key": "product.generic" }
        ]);
        let rules = json!([
            { "id": "r-old", "country_code": "ES", "region_code": null, "tax_category_key": "product.generic",
              "rate_pct": 21.0, "tax_type": "vat", "parent_id": null, "is_active": 1, "valid_from": "2012-09-01", "valid_to": "2026-12-31" },
            { "id": "r-new", "country_code": "ES", "region_code": null, "tax_category_key": "product.generic",
              "rate_pct": 10.0, "tax_type": "vat", "parent_id": null, "is_active": 1, "valid_from": "2027-01-01" }
        ]);
        let mut inp = input_with_rules(items, 4, rules, "array", "ES", "");
        inp["context"]["now"] = json!("2026-12-31T23:30:00+00:00");
        inp["context"]["timezone"] = json!("Europe/Madrid");
        let out = sale(inp);
        let line = out.operations.iter().find(|op| op.command == "sales._insert_line").expect("line");
        assert_eq!(line.params["tax_rule_id"], json!("r-new"));
        assert_eq!(line.params["tax_rate"], json!(10.0));
    }

}
