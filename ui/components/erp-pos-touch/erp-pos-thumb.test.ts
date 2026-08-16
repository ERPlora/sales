// The grid tile always keeps something to look at.
//
// The tile painted the photo as a background and the initials as its ELSE:
//
//   <div class="thumb" style=${p.image ? `background-image:url(${p.image})` : `background:${gradient}`}>
//     ${p.image ? nothing : initials(p.name)}
//
// So a product that HAS an `image` gave up its placeholder — and the placeholder is exactly what
// covers the case where the image does not arrive. A URL that 404s, a signature that expired, a
// scheme nothing resolves, the bar's wifi down at opening time: the tile ends up with no photo AND
// no initials, an empty box. On a wall of 280 products that reads as a broken till, not as a
// missing photo — and the cashier cannot tell one product from another.
//
// It is not hypothetical. The starter catalogue ships `image = "media:public/img/…"`, a logical ref
// whose resolver was never built (hub#1006), so the browser gets `url(media:public/…)` — an invalid
// scheme. Every tile was blank, and because the value is truthy every tile ALSO suppressed its own
// fallback.
//
// The fix is to stop treating the placeholder as an alternative: gradient and initials are the
// FLOOR of the tile, always painted, and the photo lays on top. If the photo arrives it covers
// them; if it does not, what shows through is the placeholder instead of nothing.
//
// happy-dom does no layout and never fetches the image, so what is fixed here is the CONTRACT (what
// is painted, with which classes). That the photo visually covers the initials is a browser matter.
import { beforeEach, describe, expect, it } from 'vitest';

/** A product WITH a photo and one WITHOUT, so both branches are compared in one place. */
const PRODUCTS = [
  {
    id: 'p-foto',
    name: 'Café',
    price: 150,
    is_active: 1,
    tax_category_key: 'product.generic',
    image: 'https://example.test/cafe.webp',
  },
  {
    id: 'p-sinfoto',
    name: 'Croissant',
    price: 120,
    is_active: 1,
    tax_category_key: 'product.generic',
  },
];

const RULES = [
  { id: 'r-21', tax_category_key: 'product.generic', rate_pct: 21, parent_id: null, is_active: 1 },
];

beforeEach(() => {
  (globalThis as Record<string, unknown>).erplora = {
    query: async () => [],
    queryAll: async (name: string) => {
      if (name === 'inventory.products.list') return PRODUCTS;
      if (name === 'taxes.rules.list') return RULES;
      return [];
    },
    command: async () => ({}),
    currency: 'EUR',
    formatMoney: (cents: number) => `${((cents || 0) / 100).toFixed(2)} €`,
    formatAmount: (units: number) => `${(units || 0).toFixed(2)} €`,
    t: (_catalog: unknown, key: string) => key,
    loadSlot: async () => [],
    notify: () => {},
  };
});

interface MountedPos {
  shadowRoot: ShadowRoot;
  updateComplete: Promise<unknown>;
}

async function mount(): Promise<MountedPos> {
  await import('./erp-pos-touch');
  const el = document.createElement('erp-pos-touch');
  document.body.appendChild(el);
  await (el as unknown as MountedPos).updateComplete;
  await new Promise((r) => setTimeout(r, 0));
  await (el as unknown as MountedPos).updateComplete;
  return el as unknown as MountedPos;
}

function thumbOf(el: MountedPos, name: string): HTMLElement {
  const tiles = [...el.shadowRoot.querySelectorAll<HTMLElement>('ion-card.tile')];
  const tile = tiles.find((t) => t.querySelector('.n')?.textContent?.trim() === name);
  if (!tile) throw new Error(`no tile painted for "${name}"`);
  return tile.querySelector<HTMLElement>('.thumb')!;
}

describe('the tile always keeps something to look at', () => {
  it('a product WITH a photo still carries its initials underneath', async () => {
    const el = await mount();
    const thumb = thumbOf(el, 'Café');

    // The regression: with the old template the thumb of a product with an image painted no text at
    // all, so a photo that failed to load left an empty box.
    expect(
      thumb.textContent?.trim(),
      'the initials are the floor of the tile, not the alternative to the photo',
    ).toContain('C');
  });

  it('and the photo still reaches the tile', async () => {
    const el = await mount();
    const thumb = thumbOf(el, 'Café');

    const style = thumb.getAttribute('style') ?? '';
    const img = thumb.querySelector<HTMLImageElement>('img');
    expect(
      style.includes('https://example.test/cafe.webp')
        || img?.getAttribute('src') === 'https://example.test/cafe.webp',
      'the photo has to be painted one way or another',
    ).toBe(true);
  });

  it('a product WITHOUT a photo keeps the placeholder it always had', async () => {
    const el = await mount();
    const thumb = thumbOf(el, 'Croissant');

    expect(thumb.textContent?.trim()).toContain('C');
  });
});
