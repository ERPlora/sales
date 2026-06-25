// pos-tax — resolución del tipo de IVA de cada línea del POS (fix interino ADR-0064/0066).
//
// El producto solo guarda una REFERENCIA al tipo fiscal (`tax_rate_id`); el porcentaje concreto
// vive en `taxes_rate.rate_pct` (módulo taxes, dependencia). El POS construye un mapa
// `tax_rate_id → rate_pct` al montar y lo usa para pasar `tax_rate` por línea a
// `sales.complete_sale` (el handler ya calcula bien si recibe `tax_rate` + `tax_included`).
//
// Best-effort: si `taxes` no responde el mapa queda vacío → tipos sin resolver = 0%; la venta
// nunca se rompe por esto.

import type { ErploraClientLike } from './pos-cart.js';

interface TaxRateRow { id?: string; rate_pct?: number | string }

function rows<T>(r: unknown): T[] {
  if (Array.isArray(r)) return r as T[];
  if (r && typeof r === 'object' && Array.isArray((r as { rows?: T[] }).rows)) return (r as { rows: T[] }).rows;
  return [];
}

/** Carga los tipos fiscales activos del hub y construye `tax_rate_id → rate_pct`.
 *  Nunca lanza: ante cualquier fallo (taxes no instalado/sin responder) devuelve un mapa vacío. */
export async function buildRatesMap(client: ErploraClientLike): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  try {
    const r = rows<TaxRateRow>(await client.query('taxes.rates.list', { page_size: 500 }));
    for (const row of r) {
      if (!row || row.id == null) continue;
      const pct = Number(row.rate_pct);
      if (Number.isFinite(pct)) map.set(String(row.id), pct);
    }
  } catch {
    /* taxes puede no responder; los tipos quedan sin resolver (0%) sin romper la venta */
  }
  return map;
}

/** Resuelve el % de IVA de un producto desde su `tax_rate_id` usando el mapa (0 si no se resuelve). */
export function resolveLineTax(ratesMap: Map<string, number>, taxRateId?: string | null): number {
  if (!taxRateId) return 0;
  return ratesMap.get(String(taxRateId)) ?? 0;
}
