// pos-tax — PREVIEW del IVA de cada línea del POS por CATEGORÍA fiscal (ADR-0085).
//
// El producto enlaza por `tax_category_key` (categoría fiscal abstracta); el % concreto vive en
// `taxes_rule` (módulo taxes) y lo resuelve el SERVIDOR al completar la venta (server-authoritative,
// keystone ADR-0085). Este mapa es solo un PREVIEW para el cliente (mostrar el IVA en el carrito
// antes de cobrar): agrupa las reglas del hub por categoría y suma la regla raíz + sus componentes
// (recargo de equivalencia). Como un hub es de UN país (ADR-0085), todas las reglas del hub son de
// su país → no hace falta filtrar por país en el preview.
//
// Best-effort: si `taxes` no responde, el mapa queda vacío → preview 0%; la venta NUNCA se rompe por
// esto (el servidor recalcula el % real por categoría al completar).
//
// El mismo catálogo responde además a la pregunta de la REJILLA (sales#74): ¿se puede cobrar este
// producto? Por eso `loadTaxCatalog` devuelve, junto al mapa, si el catálogo LLEGÓ: un mapa vacío
// significa a la vez «taxes caído» y «no hay reglas», y confundirlos apagaría el TPV entero cuando
// el caído es `taxes`. `productSellability` es el veredicto por producto.

import type { ErploraClientLike } from './pos-cart.js';

interface TaxRuleRow {
  id?: string;
  tax_category_key?: string;
  rate_pct?: number | string;
  parent_id?: string | null;
  valid_from?: string | null;
  is_active?: number | string;
}

function rows<T>(r: unknown): T[] {
  if (Array.isArray(r)) return r as T[];
  if (r && typeof r === 'object' && Array.isArray((r as { rows?: T[] }).rows)) return (r as { rows: T[] }).rows;
  return [];
}

function isRoot(r: TaxRuleRow): boolean {
  return r.parent_id == null || String(r.parent_id) === '';
}

/** El catálogo fiscal del hub tal y como lo ve el navegador. */
export interface TaxCatalog {
  /** `tax_category_key → rate_pct` (raíz + componentes). Solo PREVIEW: el % lo pone el servidor. */
  rates: Map<string, number>;
  /** ¿Sabemos algo de impuestos? `false` = el catálogo NO llegó (taxes caído, `read` omitida) o vino
   *  vacío. Un mapa vacío significa las dos cosas a la vez, y NO son la misma: sin este flag, un
   *  fallo de `taxes` se convertiría en un TPV que no deja vender nada. Es la misma distinción que
   *  hace el handler con `!rules.is_empty()` antes de rechazar por `sales.no_tax_rule`. */
  available: boolean;
}

/** Veredicto de una línea de catálogo ANTES de tocarla (sales#74):
 *  - `sellable`         → tiene categoría y esa categoría resuelve regla;
 *  - `no_tax_category`  → el producto no tiene `tax_category_key` (defecto del propio producto);
 *  - `no_tax_rule`      → tiene categoría, hay catálogo fiscal y no resuelve → el cobro la rechaza;
 *  - `unknown`          → tiene categoría pero NO hay catálogo con el que juzgar. No se bloquea. */
export type Sellability = 'sellable' | 'no_tax_category' | 'no_tax_rule' | 'unknown';

/** ¿Puede el TPV añadir este producto a la cesta? Función pura sobre el catálogo ya cargado.
 *
 *  Que el producto no traiga categoría se sabe SIN el catálogo fiscal (está en su propia fila), así
 *  que se bloquea siempre: venderlo emitiría un documento con 0 % de IVA sin haberlo decidido nadie.
 *  Lo que sí depende del catálogo es «esta categoría no tiene tipo»: sin catálogo no se juzga. */
export function productSellability(catalog: TaxCatalog, taxCategoryKey?: string | null): Sellability {
  if (!taxCategoryKey) return 'no_tax_category';
  if (!catalog.available) return 'unknown';
  return catalog.rates.has(String(taxCategoryKey)) ? 'sellable' : 'no_tax_rule';
}

/** Carga el catálogo fiscal del hub: el mapa de tipos por categoría + si el catálogo llegó siquiera.
 *  Nunca lanza: ante cualquier fallo (taxes no instalado/sin responder) devuelve `available:false`. */
export async function loadTaxCatalog(client: ErploraClientLike): Promise<TaxCatalog> {
  const map = new Map<string, number>();
  let available = false;
  try {
    const all = await client.queryAll<TaxRuleRow>('taxes.rules.list');
    available = Array.isArray(all) && all.length > 0;
    // Raíz por categoría: la regla raíz activa con `valid_from` más reciente.
    const rootByCat = new Map<string, TaxRuleRow>();
    for (const r of all) {
      if (!r || !r.tax_category_key || !isRoot(r)) continue;
      const cat = String(r.tax_category_key);
      const cur = rootByCat.get(cat);
      if (!cur || String(r.valid_from ?? '') > String(cur.valid_from ?? '')) rootByCat.set(cat, r);
    }
    for (const [cat, root] of rootByCat) {
      let pct = Number(root.rate_pct) || 0;
      // Suma los componentes (parent_id == root.id), p.ej. recargo de equivalencia.
      for (const r of all) {
        if (r && String(r.parent_id ?? '') === String(root.id ?? '__none__') && root.id != null) {
          pct += Number(r.rate_pct) || 0;
        }
      }
      map.set(cat, pct);
    }
  } catch {
    /* taxes puede no responder; preview 0% sin romper la venta (el servidor resuelve el % real) */
    available = false;
  }
  return { rates: map, available };
}

/** Preview del % de IVA de un producto desde su `tax_category_key` usando el mapa (0 si no resuelve). */
export function resolveLineTax(catRatesMap: Map<string, number>, taxCategoryKey?: string | null): number {
  if (!taxCategoryKey) return 0;
  return catRatesMap.get(String(taxCategoryKey)) ?? 0;
}

// -- The bill's PROVISIONAL tax breakdown (sales#180) ------------------------------------------
//
// The bill taken to the table is the paper the customer reviews BEFORE paying, and Toast and
// Lightspeed break the rates down there just as they do on the ticket. The ticket's breakdown is
// frozen by the SERVER on checkout (`tax_breakdown`, ADR-0085): this is a preview, of the same
// standing as the cart total.
//
// It mirrors the handler's `calc_line_components` so the two figures cannot disagree:
//   - VAT-INCLUSIVE price -> the base is worked out of the charged amount and the quota is what is
//     LEFT (`line - base`), because the amount is already fixed (sales#124);
//   - VAT-EXCLUSIVE price -> the line is COMPOSED (`base + quota`).
// One HALF_UP rounding per line, before summing, never over the total.

/** A cart line, in the minimum the breakdown needs: its amount and its rate. */
export interface TaxableAmount {
  /** Line amount in minor units. Gross when VAT is included, net when it is not. */
  amount: number;
  /** Combined rate of the line (root + components), the same preview `resolveLineTax` gives. */
  tax_rate?: number;
}

/** One entry of the breakdown, in minor units. */
export interface TaxBreakdownEntry {
  rate: number;
  base: number;
  amount: number;
}

/** HALF_UP over minor units, immune to floating-point noise (same rule as `pos-cart`). */
function roundHalfUp(x: number): number {
  return Math.round(x + 1e-9);
}

/**
 * Provisional breakdown by rate, in minor units and SORTED by ascending rate (the way anyone reads
 * it: 10 % before 21 %). Lines with no rate -- tax catalogue down, 0 % preview -- stay out:
 * inventing a 0 % for them would put on the paper a breakdown nobody computed.
 */
export function previewTaxBreakdown(lines: TaxableAmount[], taxIncluded = true): TaxBreakdownEntry[] {
  const byRate = new Map<number, TaxBreakdownEntry>();
  for (const l of lines) {
    const rate = Number(l.tax_rate) || 0;
    const amount = Number(l.amount) || 0;
    if (rate <= 0 || amount === 0) continue;
    const base = taxIncluded ? roundHalfUp(amount / (1 + rate / 100)) : amount;
    const tax = taxIncluded ? amount - base : roundHalfUp(base * rate / 100);
    const acc = byRate.get(rate) ?? { rate, base: 0, amount: 0 };
    acc.base += base;
    acc.amount += tax;
    byRate.set(rate, acc);
  }
  return [...byRate.values()].sort((a, b) => a.rate - b.rate);
}
