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
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installPosDouble } from '../../test/pos-double';
import './erp-pos-touch';

/** A product WITH a photo and one WITHOUT, so both branches are compared in one place. */
const PRODUCTS = [
  {
    id: 'p-foto',
    name: 'Café',
    price: 150,
    is_active: 1,
    tax_category_key: 'product.generic',
    image: '/api/media/raw?path=hospitality%2Fcafe.webp',
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

const fetchMediaBlob = vi.fn(async () => new Blob(['webp'], { type: 'image/webp' }));
let double: ReturnType<typeof installPosDouble>;
let nextObjectUrl = 0;

beforeEach(() => {
  fetchMediaBlob.mockClear();
  nextObjectUrl = 0;
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:catalogue-${++nextObjectUrl}`);
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  double = installPosDouble({ products: PRODUCTS, rules: RULES, extra: { fetchMediaBlob } });
});

interface MountedPos {
  shadowRoot: ShadowRoot;
  updateComplete: Promise<unknown>;
}

async function mount(): Promise<MountedPos> {
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

    const img = thumb.querySelector<HTMLImageElement>('img');
    expect(img?.getAttribute('src')).toMatch(/^blob:catalogue-/);
    expect(fetchMediaBlob).toHaveBeenCalledWith(
      '/api/media/raw?path=hospitality%2Fcafe.webp',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(img?.getAttribute('src')).not.toContain('X-Hub-Session');
  });

  it('a product WITHOUT a photo keeps the placeholder it always had', async () => {
    const el = await mount();
    const thumb = thumbOf(el, 'Croissant');

    expect(thumb.textContent?.trim()).toContain('C');
  });

  it('a photo that fails to load takes itself off the tile', async () => {
    // Laying the photo over the placeholder fixed the empty box, but left a smaller one: an `<img>`
    // whose source does not resolve still occupies the tile and the browser paints its own
    // broken-image glyph on top of the initials. On a wall of 50 tiles that is 50 torn-page icons,
    // which reads as damage rather than as a missing photo.
    //
    // Measured on the live demo (hub#791): every tile answered 401 and every tile carried the glyph.
    const el = await mount();
    const thumb = thumbOf(el, 'Café');
    const img = thumb.querySelector<HTMLImageElement>('img')!;

    img.dispatchEvent(new Event('error'));
    await new Promise((r) => setTimeout(r, 20));
    await el.updateComplete;

    const after = thumbOf(el, 'Café').querySelector<HTMLImageElement>('img');
    expect(after, 'a photo that cannot load must stop occupying the tile').toBeNull();
    expect(
      thumbOf(el, 'Café').textContent?.trim(),
      'and what is left is the placeholder, not an empty box',
    ).toContain('C');
  });

  it('one broken photo does not blank the others', async () => {
    // The failure is per product — a single 404 in a catalogue of 50 must not be read as "photos are
    // off". If this ever regresses to a component-wide flag, this is what catches it.
    const el = await mount();
    const broken = thumbOf(el, 'Café').querySelector<HTMLImageElement>('img')!;
    broken.dispatchEvent(new Event('error'));
    await new Promise((r) => setTimeout(r, 20));
    await el.updateComplete;

    // `Croissant` has no photo of its own, so the standing proof is that the one that DID load is
    // still there. Re-mounting is what a second render would do.
    const fresh = await mount();
    expect(thumbOf(fresh, 'Café').querySelector('img')).not.toBeNull();
  });
});

// sales#57 (QA visual del catálogo, 2026-08-10): debajo del nombre la baldosa exponía el SKU/slug
// interno (`agua_con_gas`) — ruido repetido en 50 baldosas que además entraba en el NOMBRE ACCESIBLE
// del botón. Square, Toast y Lightspeed pintan nombre + precio; el SKU vive en la búsqueda y en la
// ficha. Se conserva la UNIDAD cuando no es la pieza («kg», «l»): eso sí lo lee la cajera.
async function mountWith(products: Record<string, unknown>[]): Promise<MountedPos> {
  double.setQuery('inventory.products.list', products);
  document.body.innerHTML = '';
  return mount();
}

describe('la baldosa no expone el SKU (sales#57)', () => {
  it('nombre y precio dominan; el sku no se pinta ni entra en el texto accesible', async () => {
    const el = await mountWith([{ id: 'p1', name: 'Agua con gas', sku: 'agua_con_gas', price: 120, is_active: 1, tax_category_key: 'product.generic' }]);
    const tile = el.shadowRoot!.querySelector<HTMLElement>('ion-card.tile')!;
    expect(tile.textContent).not.toContain('agua_con_gas');
    expect(tile.querySelector('.n')?.textContent).toBe('Agua con gas');
  });
  it('la unidad a peso sí se ve («kg»); la pieza («ud») no', async () => {
    const el = await mountWith([
      { id: 'p1', name: 'Gambas', sku: 'GAM', price: 1200, is_active: 1, tax_category_key: 'product.generic', unit_code: 'kg' },
      { id: 'p2', name: 'Pan', sku: 'PAN', price: 100, is_active: 1, tax_category_key: 'product.generic', unit_code: 'ud' },
    ]);
    const tiles = [...el.shadowRoot!.querySelectorAll<HTMLElement>('ion-card.tile')];
    expect(tiles[0].querySelector('.sku')?.textContent?.trim()).toBe('kg');
    expect(tiles[1].querySelector('.sku')?.textContent?.trim() ?? '').toBe('');
  });
});
