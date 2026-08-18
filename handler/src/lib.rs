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
use erplora_guest_sdk::tax;
use erplora_guest_sdk::units::{calculate_line_amount, QuantityValue, QUANTITY_SCALE};
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
    match complete_sale_pure(input.into_inner().into_value()) {
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

/// ADR-0141: abre un pedido MUTABLE (`order`). Ver `open_order_pure`.
#[cfg(feature = "guest")]
#[plugin_fn]
pub fn open_order(input: Json<erplora_guest_sdk::Input>) -> FnResult<Json<Output>> {
    match open_order_pure(input.into_inner().into_value()) {
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

/// La cantidad de la línea (escala 10⁶) y su validación de rejilla (ADR-0147 §2.2).
///
/// El incremento es VALIDACIÓN, no instrucción de redondeo: fuera de rejilla el comando se
/// RECHAZA — redondear aquí modificaría calladamente lo vendido, el stock y el importe. Solo se
/// valida si la línea declara su incremento (contexto congelado); sin contexto no se bloquea la
/// venta (mismo criterio graceful que `inventory::increment_for_product`).
fn line_qty(item: &Value) -> Result<i64, String> {
    let qty = item.get("quantity").map(|v| as_qty(v, QUANTITY_SCALE)).unwrap_or(QUANTITY_SCALE);
    if qty <= 0 {
        return Err(format!("quantity_not_positive: {qty}"));
    }
    let inc = item_i64(item, "increment_value", 0);
    if inc > 0 && qty % inc != 0 {
        // El error nombra ambos valores para que la UI pueda decir «0,0005 kg no vale en una
        // unidad configurada en incrementos de 0,001 kg».
        return Err(format!("quantity_off_grid: {qty} % {inc} != 0"));
    }
    Ok(qty)
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
/// el caso mayoritario no configura nada.
fn freeze_unit_context(item: &Value, p: &mut Map<String, Value>) {
    let unit_code = str_or(item, "unit_code", "ud");
    p.insert("unit_name".into(), json!(str_or(item, "unit_name", "")));
    p.insert("factor_num".into(), json!(item_i64(item, "factor_num", 1)));
    p.insert("factor_den".into(), json!(item_i64(item, "factor_den", 1)));
    p.insert("increment_value".into(), json!(item_i64(item, "increment_value", QUANTITY_SCALE)));
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
) -> Result<ResolvedTax, String> {
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
            let components = tax::rule_components(root, rules, date)
                .into_iter()
                .map(|c| TaxComponent { rate_pct: c.rate_pct, rate_key: rate_key(c.rate_pct) })
                .collect();
            return Ok(ResolvedTax { rule_id: tax::rule_field(root, "id"), components });
        }
        // Categoría que no resuelve regla (venga del catálogo o del payload): el hub está sin
        // configurar para esa categoría. Cobrar el tipo que propone el cliente sería inventarse el
        // impuesto — se cobraría una cosa y se declararía otra. Un catálogo VACÍO ya no es excusa:
        // la read es `required`, así que vacío significa «este hub no tiene reglas» (sales#21).
        return Err(reject("sales.no_tax_rule", format!("no tax rule for category `{cat}`")));
    }
    // Sin categoría que resolver: preview del cliente. La única puerta que queda (ver doc).
    let pct = item.get("tax_rate").map(|v| as_f64(v, 0.0)).unwrap_or(0.0);
    Ok(ResolvedTax { rule_id: String::new(), components: vec![TaxComponent { rate_pct: pct, rate_key: rate_key(pct) }] })
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
    // Cuota por componente sobre la misma base; la cuota total = suma de las redondeadas.
    let net_dec = Decimal::from(net);
    let mut parts: Vec<(String, i64, i64)> = Vec::with_capacity(components.len());
    let mut tax_total: i64 = 0;
    for c in components {
        let pct = Decimal::from_f64(c.rate_pct).unwrap_or(Decimal::ZERO) / Decimal::from(100);
        let comp_tax = money::round(net_dec * pct);
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
fn is_catalog_line(item: &Value) -> bool {
    !field(item, "product_id").is_empty() && !item.get("is_service").map(as_bool).unwrap_or(false)
}

/// Precio y coste AUTORITATIVOS de una línea de catálogo. `Err` con código de dominio si la línea
/// dice ser de catálogo y no se puede sostener.
fn authoritative_price(item: &Value, catalog: Option<&Vec<&Value>>) -> Result<Option<(i64, i64, String)>, String> {
    if !is_catalog_line(item) {
        return Ok(None);
    }
    let rows = catalog.ok_or_else(|| {
        reject("sales.catalog_unavailable", "the product catalogue was not available to price this sale")
    })?;
    let id = field(item, "product_id");
    let row = rows
        .iter()
        .find(|r| field(r, "id") == id)
        .ok_or_else(|| reject("sales.product_not_available", &id))?;
    Ok(Some((
        as_cents(row.get("price").unwrap_or(&Value::Null), 0),
        as_cents(row.get("cost").unwrap_or(&Value::Null), 0),
        field(row, "tax_category_key"),
    )))
}

/// Lógica pura: `{payload, context}` → Output (intenciones).
///
/// Devuelve `Err` si una cantidad es inválida (ADR-0147 §2.2): fuera de la rejilla del incremento
/// congelado de su línea, o no positiva. El comando entero se RECHAZA — no se redondea en silencio.
// ── sales#20 · el SERVIDOR cierra la venta; el cliente solo PROPONE ──────────────────────────

/// Rechaza el cierre con un código de dominio estable y namespaced (`sales.<snake_case>`).
///
/// El runtime convierte este `Err` en un command fallido: no aplica ni una operación ni escribe
/// una sola fila en el outbox, así que una venta rechazada NUNCA mueve stock, caja ni facturación.
/// El prefijo tiene la MISMA forma que el `Output.error` de ADR-0205 (hub#139) a propósito: el día
/// que este módulo compile contra un runtime que lo lleve, esto pasa a ser un error de dominio
/// traducible sin tocar a quien llama — la UI ya se orienta por el CÓDIGO, no por la frase.
fn reject(code: &str, detail: impl std::fmt::Display) -> String {
    format!("{code}: {detail}")
}

/// Lo que el SERVIDOR decidió sobre este cobro tras contrastar la oferta del cliente con las
/// fuentes de confianza del hub (catálogo de métodos de pago y ajustes del TPV, pre-cargados por
/// el runtime vía `reads`). Nada de aquí llega del navegador sin validar.
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
}

/// ¿Una tasa (%) dentro del rango sano 0..=100?
fn rate_in_range(pct: f64) -> bool {
    pct.is_finite() && (0.0..=100.0).contains(&pct)
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
fn decide_checkout(payload: &Value, context: &Value, items: &[Value]) -> Result<ServerDecision, String> {
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

    let mut discounted = sale_disc > 0.0;
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

    // ── Ajustes del TPV: la regla vive en el servidor, no en el botón ──
    // Sin fila de ajustes valen los defaults del esquema (`allow_discounts` sí, `require_customer`
    // no), que es justo lo que hace un hub recién instalado.
    let settings = tax::read_rows(context, "sales.settings.get").unwrap_or_default();
    let setting = |key: &str, default: bool| -> bool {
        settings
            .first()
            .and_then(|row| row.get(key))
            .filter(|v| !v.is_null())
            .map(as_bool)
            .unwrap_or(default)
    };
    if discounted && !setting("allow_discounts", true) {
        return Err(reject("sales.discounts_not_allowed", "this hub disabled discounts"));
    }
    if setting("require_customer", false) && field(payload, "customer_id").is_empty() {
        return Err(reject("sales.customer_required", "this hub requires a customer on every sale"));
    }
    // BASE FISCAL (ADR-0210): que un precio lleve ya el impuesto dentro es una decisión del
    // NEGOCIO, y decide lo que se DECLARA — los mismos 100,00 € son base 100 + 21 de cuota con
    // precios netos, y base 82,64 + 17,35 con precios brutos. Aceptarla del payload era regalarle
    // al navegador la base imponible de la factura. Sin fila de ajustes manda el payload, como
    // hasta ahora. (ADR-0210 mueve la autoridad última a la LISTA DE PRECIOS de `pricing`, con
    // herencia lista → hub → inclusive; consumir esa lista es sales#23.)
    let tax_included = settings
        .first()
        .and_then(|row| row.get("default_tax_included"))
        .filter(|v| !v.is_null())
        .map(as_bool);

    // ── Método de pago: del catálogo del hub o de ningún sitio ──
    // El catálogo es la fuente de confianza para DOS cosas a la vez (hub#778):
    //   - `name`  → display (recibo, TPV): localizado, el que el cajero ve.
    //   - `type`  → lógica: `cash` | `card` | `transfer` | `other`, canónico. El cajón de
    //               cash_register lo usa para saber si una venta suma al efectivo esperado,
    //               sin depender del `name` localizado («Efectivo» ≠ «cash»).
    let method_id = field(payload, "payment_method_id");
    let (payment_method_name, payment_method_type) = match tax::read_rows(context, "sales.payment_methods") {
        Some(catalog) if !catalog.is_empty() => {
            if method_id.is_empty() {
                return Err(reject("sales.payment_method_required", "the sale has no payment method"));
            }
            let row = catalog
                .iter()
                .find(|row| field(row, "id") == method_id)
                .ok_or_else(|| reject("sales.payment_method_not_available", &method_id))?;
            (field(row, "name"), field(row, "type"))
        }
        // Degradación graceful (misma regla que el catálogo fiscal): sin catálogo de confianza no
        // hay nada contra lo que validar, y el TPV tiene que poder cobrar igual. Sin `type` conocido
        // asumimos `cash` (default de `sales_payment_method.type`): es el caso que menos daña al
        // arqueo — una tarjeta sin catálogo se contaría como efectivo, pero sin catálogo no hay
        // venta válida que llegue aquí de todos modos.
        _ => (str_or(payload, "payment_method_name", ""), str_or(payload, "payment_method_type", "cash")),
    };

    Ok(ServerDecision { payment_method_name, payment_method_type, tax_included })
}

pub fn complete_sale_pure(input: Value) -> Result<Output, String> {
    let payload = input.get("payload").cloned().unwrap_or(Value::Null);
    let context = input.get("context").cloned().unwrap_or(Value::Null);
    let empty: Vec<Value> = Vec::new();
    let new_ids = context.get("new_ids").and_then(|v| v.as_array()).unwrap_or(&empty);
    let now = context.get("now").map(as_str).unwrap_or_default();
    let day = day_from_now(&now);
    let sale_id = new_ids.first().map(as_str).unwrap_or_default();

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
    let decision = decide_checkout(&payload, &context, items)?;
    let tax_incl = decision
        .tax_included
        .unwrap_or_else(|| payload.get("tax_included").map(as_bool).unwrap_or(true));

    // Identidad fiscal del hub (ADR-0085): país/región DEL CONTEXTO (hub_settings, inyectado por el
    // runtime — no del cliente). Con ellos + la categoría de la línea se resuelve la regla de tipo.
    let cc = context.get("country_code").map(as_str).unwrap_or_default();
    let rc = context.get("region_code").map(as_str).unwrap_or_default();
    let date = iso_date(&now);

    // Catálogo fiscal de confianza pre-cargado por el runtime (ADR-0085, reads taxes.rules.list —
    // `required` desde sales#21/hub#701). `&Value::Null` as the payload fallback ON PURPOSE: in
    // `taxes.calculate` the caller may hand its own catalog for an ad-hoc calculation, but here the
    // payload IS the browser — a client able to inject `rules` would price its own VAT.
    // `catalog_delivered` distingue «la read llegó (aunque vacía)» de «no llegó»: lo primero es un
    // hub sin reglas, lo segundo un runtime que no honra `required` — ninguno cobra con el IVA del
    // navegador, pero se rechazan con códigos distintos para que el encargado sepa qué mirar.
    let catalog_delivered = tax::CATALOG_READS.iter().any(|q| tax::read_rows(&context, q).is_some());
    let catalog = tax::rule_catalog(&context, &Value::Null);

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

    // El catálogo de venta que el runtime pre-carga (`inventory.products.for_sale`, sales#68). Sin
    // bloque `list` a propósito: una read paginada entregaría solo 50 filas, en silencio (hub#650).
    let product_catalog = tax::read_rows(&context, "inventory.products.for_sale");

    for (i, item) in items.iter().enumerate() {
        // El precio SALE DEL CATÁLOGO si la línea dice ser de catálogo. El del payload es una
        // propuesta, no un hecho.
        let from_catalog = authoritative_price(item, product_catalog.as_ref())?;
        let (unit_price, item_cost) = match &from_catalog {
            Some((price, cost, _)) => (*price, *cost),
            None => (
                as_cents(item.get("price").unwrap_or(&Value::Null), 0), // céntimos
                as_cents(item.get("cost").unwrap_or(&Value::Null), 0),
            ),
        };
        let catalog_cat = from_catalog.as_ref().map(|(_, _, cat)| cat.as_str());
        // Cantidad en punto fijo 10⁶ (ADR-0147) + rechazo fuera de rejilla; y la cantidad de
        // precio KPEIN («37 céntimos por 100 ud») que hace exacto el sub-céntimo sin tocar el dinero.
        let qty = line_qty(item)?;
        let price_qty = line_price_qty(item);
        let line_disc = item.get("discount").map(|v| as_f64(v, 0.0)).unwrap_or(0.0);
        // ADR-0085: resuelve el impuesto por CATEGORÍA desde el catálogo de confianza
        // (server-authoritative, raíz + componentes), con país/región del contexto y fallback
        // graceful al `tax_rate` del payload. El cliente NO es autoridad del %.
        let resolved = resolve_line_tax(item, catalog_cat, &catalog, catalog_delivered, &cc, &rc, &date)?;
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
            // El coste de una invitación va al arqueo (`gift_total`), así que también es un número
            // que decide dinero: sale del catálogo cuando la línea es de catálogo (sales#68).
            let cost = item_cost;
            // Coste × cantidad por el SDK (un HALF_UP): 0,5 kg a coste 8,00 €/kg son 4,00 €.
            gift_total += calculate_line_amount(
                cost,
                QuantityValue::from_raw(qty),
                QuantityValue::from_raw(QUANTITY_SCALE),
            )
            .map_err(|e| format!("gift_cost_overflow: {e:?}"))?;
            (LineTotals { net: 0, tax: 0, line: 0 }, Vec::<(String, i64, i64)>::new())
        } else {
            calc_line_components(unit_price, qty, price_qty, eff_disc, tax_incl, components)
        };
        // Bruto SIN descuento global (mismo cálculo con solo el descuento de línea): la resta de
        // ambos brutos es el `discount_amount` que ve el cliente en el ticket.
        gross_pre_disc += if is_gift || sale_disc <= 0.0 {
            t.line
        } else {
            calc_line_components(unit_price, qty, price_qty, line_disc, tax_incl, components).0.line
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
        p.insert("quantity".into(), json!(qty)); // punto fijo, escala 10⁶ (INTEGER, ADR-0147)
        // Contexto de unidades CONGELADO en la línea (ADR-0147 §2.4): el histórico no relee el maestro.
        freeze_unit_context(item, &mut p);
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
    h.insert("payment_method_id".into(), payload.get("payment_method_id").cloned().unwrap_or(Value::Null));
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
            // MISMAS cifras de confianza que la línea que se persiste (sales#67/#68): si el evento
            // llevara el precio o la categoría del payload, `invoice` facturaría una cosa y la venta
            // guardaría otra. Ya validado en el bucle de arriba (mismo item), así que aquí no falla.
            let it_from_catalog = authoritative_price(it, product_catalog.as_ref()).unwrap_or(None);
            let unit_price = match &it_from_catalog {
                Some((price, _, _)) => *price,
                None => as_cents(it.get("price").unwrap_or(&Value::Null), 0), // céntimos
            };
            let it_catalog_cat = it_from_catalog.as_ref().map(|(_, _, cat)| cat.as_str());
            let qty = line_qty(it).unwrap_or(QUANTITY_SCALE);
            let price_qty = line_price_qty(it);
            let line_disc = it.get("discount").map(|v| as_f64(v, 0.0)).unwrap_or(0.0);
            // Mismo resolver server-authoritative que arriba (ADR-0085): el evento lleva el %
            // y los net/tax RESUELTOS del catálogo, no la pista del cliente, para que
            // invoice/inventory reaccionen con cifras de confianza.
            let resolved = resolve_line_tax(it, it_catalog_cat, &catalog, catalog_delivered, &cc, &rc, &date)
                .unwrap_or_else(|_| ResolvedTax { rule_id: String::new(), components: vec![] });
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
                calc_line_components(unit_price, qty, price_qty, eff_disc, tax_incl, &resolved.components)
            };
            json!({
                "product_id": it.get("product_id").cloned().unwrap_or(Value::Null),
                "product_name": as_str(it.get("product_name").unwrap_or(&Value::Null)),
                // ENTERO en escala 10⁶ (ADR-0147): `inventory` hace as_i64 — un float aquí era
                // 0 → `qty <= 0 → continue` → la venta no descontaba stock, en silencio.
                "quantity": qty,
                "unit_code": str_or(it, "unit_code", "ud"), // unidad congelada de la línea
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

/// ADR-0141 (owner: human, en construcción TDD) — abre un `order` **mutable** (estado `open`) con sus
/// líneas materializadas **temprano** (filas reales, no un blob). Es la entidad canónica del pedido;
/// al cobrar producirá 1..N `sale` inmutables (split-bill). `sales` es **agnóstico de la mesa**: NO
/// conoce `table_id` — la asociación mesa↔pedido la OWNea `tables` en `table_session.order_id`.
pub fn open_order_pure(input: Value) -> Result<Output, String> {
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
        // Punto fijo 10⁶ + rechazo fuera de rejilla (ADR-0147): el pedido habla el mismo idioma
        // que la venta — abrir con 0,0005 kg y cobrar sería mover el error de sitio.
        let qty = line_qty(item)?;
        let is_gift = item.get("is_gift").map(as_bool).unwrap_or(false);
        let line_total = if is_gift {
            0
        } else {
            // Provisional (display), pero con la MISMA aritmética del SDK que el cobro: dinero
            // entero por cantidad de precio, un solo HALF_UP (ADR-0147 §2.3).
            calculate_line_amount(
                unit_price,
                QuantityValue::from_raw(qty),
                QuantityValue::from_raw(line_price_qty(item)),
            )
            .map_err(|e| format!("line_amount_overflow: {e:?}"))?
        };
        provisional_total += line_total;

        let line_id = new_ids.get(i + 1).map(as_str).unwrap_or_default();
        let mut p = Map::new();
        p.insert("id".into(), json!(line_id));
        p.insert("order_id".into(), json!(order_id)); // FK al pedido (materialización temprana)
        p.insert("product_id".into(), item.get("product_id").cloned().unwrap_or(Value::Null));
        p.insert("product_name".into(), json!(as_str(item.get("product_name").unwrap_or(&Value::Null))));
        p.insert("product_sku".into(), json!(str_or(item, "product_sku", "")));
        p.insert("quantity".into(), json!(qty)); // punto fijo, escala 10⁶ (INTEGER, ADR-0147)
        // Contexto de unidades CONGELADO (ADR-0147 §2.4): cerrar y reabrir el pedido no puede
        // cambiar lo que significa la cantidad.
        freeze_unit_context(item, &mut p);
        p.insert("unit_price".into(), json!(unit_price)); // céntimos (INTEGER)
        p.insert("is_gift".into(), json!(is_gift as i64));
        p.insert("gift_reason".into(), json!(if is_gift { str_or(item, "gift_reason", "") } else { String::new() }));
        p.insert("line_total".into(), json!(line_total)); // céntimos, provisional (display)
        // El COBRO necesita estos dos y no se re-derivan al reanudar el pedido: la categoría fiscal
        // es la AUTORIDAD del IVA en servidor (ADR-0085) y el coste alimenta el arqueo de
        // invitaciones (gift_total). Sin ellos, un pedido reanudado facturaría con el IVA erróneo.
        p.insert("tax_category_key".into(), json!(str_or(item, "tax_category_key", "")));
        p.insert("cost".into(), json!(as_cents(item.get("cost").unwrap_or(&Value::Null), 0)));
        // sales#89: SERVICIO o producto. La línea de servicio no se mide contra el catálogo de
        // `inventory` ni descuenta stock, y el pedido tiene que recordarlo para que una cuenta
        // RETOMADA lo siga cobrando como servicio.
        p.insert("is_service".into(), json!(item.get("is_service").map(as_bool).unwrap_or(false) as i64));
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
pub fn fire_order_pure(input: Value) -> Result<Output, String> {
    let payload = input.get("payload").cloned().unwrap_or(Value::Null);
    let order_id = as_str(payload.get("order_id").unwrap_or(&Value::Null));
    if order_id.is_empty() {
        return Err("missing_order_id".to_string());
    }
    let empty: Vec<Value> = Vec::new();
    let items = payload.get("items").and_then(|v| v.as_array()).unwrap_or(&empty).clone();
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
    if round_no >= 1 {
        let context = input.get("context").cloned().unwrap_or(Value::Null);
        if let Some(lines) = tax::read_rows(&context, "sales.order.lines") {
            let pending = lines.iter().any(|l| l.get("fired_at").map_or(true, Value::is_null));
            if !pending {
                return Err(reject(
                    "sales.nothing_to_fire",
                    format!("order {order_id} has no pending lines: this round was already fired"),
                ));
            }
        }
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
        "items": items,
    });
    if round_no >= 1 {
        ev["round_no"] = json!(round_no); // informativo: kitchen numera lo suyo (ADR-0144)
    }
    let event = Event::new("order.fired", ev);
    Ok(Output { operations: ops, events: vec![event], ..Default::default() })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Los comandos ahora RECHAZAN cantidades inválidas (ADR-0147 §2.2): los tests del camino
    /// feliz desenvuelven aquí para no repetir `.expect` en cada uno.
    fn sale(inp: Value) -> Output { complete_sale_pure(inp).expect("venta válida") }
    fn orden(inp: Value) -> Output { open_order_pure(inp).expect("pedido válido") }

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
        let out = fire_order_pure(inp).expect("disparar la ronda");

        let marca = out.operations.iter().find(|o| o.command == "sales._mark_lines_fired")
            .expect("el disparo con ronda marca las líneas pendientes");
        assert_eq!(marca.params["order_id"], json!("ord-1"));
        assert_eq!(marca.params["round_no"], json!(2));

        // Y el evento sigue saliendo UNA vez, con la ronda informativa para kitchen.
        assert_eq!(out.events.len(), 1);
        assert_eq!(out.events[0].payload["round_no"], json!(2));
    }

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
        let err = fire_order_pure(fire_input_with_lines(1, lines)).expect_err("nada pendiente → no se dispara");
        assert!(err.contains("sales.nothing_to_fire"), "{err}");
    }

    #[test]
    fn a_fire_with_pending_lines_goes_through_and_marks_them() {
        let lines = json!([
            { "id": "l-1", "order_id": "ord-1", "product_name": "Entrecot", "round_no": 1, "fired_at": "2026-07-19T14:20:00+00:00" },
            { "id": "l-2", "order_id": "ord-1", "product_name": "Postre", "round_no": null, "fired_at": null }
        ]);
        let out = fire_order_pure(fire_input_with_lines(2, lines)).expect("hay una línea nueva → se dispara");
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
        let out = fire_order_pure(inp).expect("compat");
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
        let out = fire_order_pure(inp).expect("disparo compat");
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
        let out = fire_order_pure(inp).expect("disparar el pedido");

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
    fn disparar_sin_pedido_es_un_error_no_una_comanda_huerfana() {
        let inp = json!({
            "payload": { "label": "Mesa 4", "channel": "dine_in", "items": [] },
            "context": { "hub_id": "h1", "current_user_id": "u1", "now": "2026-07-18T10:00:00+00:00", "new_ids": [] }
        });
        assert!(fire_order_pure(inp).is_err(), "sin order_id no hay comanda que colgar de nada");
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
        let out = sale(inp);

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

    #[test]
    fn emits_counter_sale_lines_event() {
        let items = json!([
            { "product_name": "Café", "price": 121, "quantity": 2_000_000, "tax_rate": 21.0 },
            { "product_name": "Agua", "price": 110, "quantity": 1_000_000, "tax_rate": 10.0 }
        ]);
        let out = sale(input(items, 8, 2000));
        assert_eq!(out.operations.len(), 4); // counter + sale + 2 líneas
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
            .expect_err("categoría desconocida → rechazo");
        assert!(err.starts_with("sales.no_tax_rule"), "{err}");
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
    fn anonymous_sale_carries_no_fiscal_snapshot() {
        // Venta de barra sin cliente: los campos fiscales van vacíos, no heredados.
        let items = json!([{ "product_name": "Café", "price": 121, "quantity": 1_000_000, "tax_rate": 21.0 }]);
        let out = sale(input(items, 4, 200));
        assert_eq!(out.events[0].payload["customer_tax_id"], json!(""));
        assert_eq!(out.events[0].payload["customer_address"], json!(""));
    }

    #[test]
    fn sale_without_staff_has_null_attribution() {
        // Venta de TPV sin profesional: staff_id NULL en cabecera y evento; sin evento extra.
        let items = json!([{ "product_name": "Café", "price": 121, "quantity": 1_000_000, "tax_rate": 21.0 }]);
        let out = sale(input(items, 4, 200));
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
        let err = complete_sale_pure(inp).expect_err("sin catálogo fiscal no se cobra");
        assert!(err.starts_with("sales.tax_catalog_unavailable"), "{err}");
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
        let err = complete_sale_pure(input(items.clone(), 3, 0)).expect_err("fuera de rejilla");
        assert!(err.contains("quantity_off_grid"), "nombra el problema: {err}");
        assert!(err.contains("500") && err.contains("1000"), "nombra ambos valores: {err}");

        // Y el pedido tampoco lo acepta: abrir con una cantidad inválida y cobrarla después
        // sería mover el error de sitio.
        assert!(open_order_pure(input(items, 3, 0)).is_err());
    }

    #[test]
    fn una_cantidad_no_positiva_se_rechaza() {
        // Una línea de 0 unidades no es una venta de nada: es un bug de quien llama.
        let items = json!([{ "product_name": "X", "price": 100, "quantity": 0, "tax_rate": 21.0 }]);
        let err = complete_sale_pure(input(items, 3, 0)).expect_err("cantidad 0");
        assert!(err.contains("quantity_not_positive"), "{err}");
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
            .expect("la venta se cierra");
        let line = out.operations.iter().find(|o| o.command == "sales._insert_line").unwrap();
        assert_eq!(
            line.params["tax_rate"], json!(21.0),
            "se aplicó la categoría del payload en vez de la del catálogo"
        );
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
            .expect_err("sin regla aplicable no se cierra la venta");
        assert!(err.starts_with("sales.no_tax_rule"), "código inesperado: {err}");
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
            .expect_err("catálogo fiscal vacío: no hay regla → no se cierra la venta");
        assert!(err.starts_with("sales.no_tax_rule"), "código inesperado: {err}");
    }

    #[test]
    fn a_catalogued_line_when_the_tax_read_never_arrived_is_refused() {
        // La read es `required`: un runtime que la honra nunca llega aquí sin ella. Si aun así
        // falta (runtime viejo), el handler cierra la puerta él mismo en vez de adivinar el IVA.
        let items = json!([{ "product_id": "p-wine", "product_name": "Vino", "price": 5000,
                             "quantity": 1_000_000, "tax_rate": 21.0 }]);
        let err = complete_sale_pure(input_fiscal(items, product_catalog(), Value::Null))
            .expect_err("sin la read fiscal no se cobra con la pista del cliente");
        assert!(err.starts_with("sales.tax_catalog_unavailable"), "código inesperado: {err}");
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
            .expect_err("service.generic no tiene regla en este catálogo");
        assert!(err.starts_with("sales.no_tax_rule"), "código inesperado: {err}");
    }

    #[test]
    fn a_free_line_still_falls_back_to_the_rate_it_was_given() {
        // Una línea sin producto no tiene categoría de catálogo que resolver. Sigue siendo la
        // puerta abierta (sales#63) y se deja explícita, no tapada.
        let items = json!([{ "product_name": "Varios", "price": 250, "quantity": 1_000_000,
                             "tax_rate": 21.0 }]);
        let out = complete_sale_pure(input_fiscal(items, product_catalog(), tax_catalog()))
            .expect("una línea libre se sigue cobrando");
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
            .expect("la venta se cierra");
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
            .expect_err("un producto que no está en el catálogo no se vende");
        assert!(err.starts_with("sales.product_not_available"), "código inesperado: {err}");
    }

    #[test]
    fn without_the_catalogue_a_product_line_does_not_close_the_sale() {
        // La degradación que vale para el método de pago —«cobrar es lo último que puede
        // romperse»— aquí ES el agujero: aceptar el precio del caller para un producto que dice
        // ser del catálogo. Sin catálogo no hay nada contra lo que contrastar, así que no se cierra.
        let err = complete_sale_pure(input_with_products(underpriced_line(), 4, Value::Null))
            .expect_err("sin catálogo no se cierra una venta de catálogo");
        assert!(err.starts_with("sales.catalog_unavailable"), "código inesperado: {err}");
    }

    #[test]
    fn a_free_line_without_a_product_still_goes_through() {
        // Venta por departamento / precio libre: no dice ser de catálogo, así que el catálogo no
        // tiene nada que decir de ella. Es la única puerta que queda abierta, y es sales#63.
        let items = json!([{ "product_name": "Varios", "price": 250, "quantity": 1_000_000,
                             "tax_rate": 21.0 }]);
        let out = complete_sale_pure(input_with_products(items, 4, product_catalog()))
            .expect("una línea libre se sigue pudiendo vender");
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
            .expect("un servicio se cobra aunque no esté en el catálogo de productos");
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
        let err = complete_sale_pure(input(json!([]), 3, 0)).expect_err("a sale needs lines");
        assert!(err.contains("sales.empty_sale"), "{err}");
    }

    #[test]
    fn a_line_discount_out_of_range_is_rejected() {
        // 120 % off turns the line into a refund the cashier never authorised.
        let items = json!([{ "product_name": "Menú", "price": 500, "quantity": 1_000_000, "discount": 120.0 }]);
        let err = complete_sale_pure(input(items, 3, 0)).expect_err("discount > 100");
        assert!(err.contains("sales.discount_out_of_range"), "{err}");

        let items = json!([{ "product_name": "Menú", "price": 500, "quantity": 1_000_000, "discount": -5.0 }]);
        let err = complete_sale_pure(input(items, 3, 0)).expect_err("negative discount");
        assert!(err.contains("sales.discount_out_of_range"), "{err}");
    }

    #[test]
    fn a_sale_discount_out_of_range_is_rejected() {
        let mut inp = input(one_line(), 3, 0);
        inp["payload"]["discount_percent"] = json!(101.0);
        let err = complete_sale_pure(inp).expect_err("global discount > 100");
        assert!(err.contains("sales.discount_out_of_range"), "{err}");
    }

    #[test]
    fn a_negative_amount_is_rejected() {
        // Money is unsigned in a sale: a negative price or cost is a refund, and refunds have
        // their own flow. Belt and braces with the JSON Schema (`minimum: 0`).
        let items = json!([{ "product_name": "Menú", "price": -500, "quantity": 1_000_000 }]);
        let err = complete_sale_pure(input(items, 3, 0)).expect_err("negative price");
        assert!(err.contains("sales.amount_negative"), "{err}");

        let items = json!([{ "product_name": "Menú", "price": 500, "quantity": 1_000_000, "cost": -1 }]);
        let err = complete_sale_pure(input(items, 3, 0)).expect_err("negative cost");
        assert!(err.contains("sales.amount_negative"), "{err}");

        let mut inp = input(one_line(), 3, 0);
        inp["payload"]["amount_tendered"] = json!(-100);
        let err = complete_sale_pure(inp).expect_err("negative tendered");
        assert!(err.contains("sales.amount_negative"), "{err}");
    }

    #[test]
    fn cash_tendered_below_the_total_is_rejected() {
        // sales#24 — a cash sale where the customer handed over LESS than the total used to close
        // anyway, with `change = 0` and the drawer silently short. The server is the authority on
        // the total (ADR-0085), so it is the server that refuses: 5,00 € due, 1,00 € tendered.
        let items = json!([{ "product_name": "Menú", "price": 500, "quantity": 1_000_000, "tax_rate": 21.0 }]);
        let err = complete_sale_pure(input(items, 3, 100)).expect_err("tendered below total");
        assert!(err.contains("sales.insufficient_tendered"), "{err}");
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
        let err = complete_sale_pure(inp).expect_err("unknown payment method");
        assert!(err.contains("sales.payment_method_not_available"), "{err}");
    }

    #[test]
    fn a_sale_without_payment_method_is_rejected_when_the_hub_has_a_catalog() {
        let mut inp = input_with_catalogs(one_line(), 3, cash_catalog(), Value::Null, Value::Null);
        inp["payload"]["payment_method_id"] = Value::Null;
        let err = complete_sale_pure(inp).expect_err("no payment method");
        assert!(err.contains("sales.payment_method_required"), "{err}");
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
        let err = complete_sale_pure(inp).expect_err("discounts disabled");
        assert!(err.contains("sales.discounts_not_allowed"), "{err}");
    }

    #[test]
    fn a_sale_without_customer_is_rejected_when_the_hub_requires_one() {
        let settings = json!([{ "allow_discounts": 1, "require_customer": 1 }]);
        let inp = input_with_catalogs(one_line(), 3, cash_catalog(), settings, Value::Null);
        let err = complete_sale_pure(inp).expect_err("customer required");
        assert!(err.contains("sales.customer_required"), "{err}");
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
        // Gross 100,00 € at 21 %: base 82,64 € and the quota the hub declares on that base.
        assert_eq!(line["net_amount"], json!(8264));
        assert_eq!(line["tax_amount"], json!(1735));
    }

    #[test]
    fn the_idempotency_key_is_mandatory() {
        let mut inp = input(one_line(), 3, 0);
        inp["payload"]["idempotency_key"] = json!("");
        let err = complete_sale_pure(inp).expect_err("no idempotency key");
        assert!(err.contains("sales.idempotency_key_required"), "{err}");
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
}
