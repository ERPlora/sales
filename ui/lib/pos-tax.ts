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

/** Carga las reglas de tipo del hub y construye `tax_category_key → rate_pct` (raíz + componentes).
 *  Nunca lanza: ante cualquier fallo (taxes no instalado/sin responder) devuelve un mapa vacío. */
export async function buildCategoryRatesMap(client: ErploraClientLike): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  try {
    const all = rows<TaxRuleRow>(await client.query('taxes.rules.list', { page_size: 500 }));
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
  }
  return map;
}

/** Preview del % de IVA de un producto desde su `tax_category_key` usando el mapa (0 si no resuelve). */
export function resolveLineTax(catRatesMap: Map<string, number>, taxCategoryKey?: string | null): number {
  if (!taxCategoryKey) return 0;
  return catRatesMap.get(String(taxCategoryKey)) ?? 0;
}
