// @vitest-environment happy-dom
// sales#345 — the ticket printed by the BROWSER carries the business's promotional QR.
//
// A business that set its reviews/social link in the POS settings (`receipt_marketing_url`) saw it
// on the on-screen ticket (`<ok-receipt>` → `renderPromo`) but not on the paper the browser prints
// when there is no thermal printer: `saleToReceipt` sends `promo_qr`/`promo_note` and
// `receiptToPrintableHtml` dropped them without a word. Now the paper draws it like the screen: at
// the very foot, after the fiscal QR and the «pide tu factura» block, smaller than the fiscal QR.
import { describe, expect, it } from 'vitest';
import { qrSvgMarkup } from '@erplora/outfitkit/ok-qr';
import { receiptToPrintableHtml } from './receipt-html';

document.documentElement.lang = 'es';

const QR = 'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR?nif=B12345678&numserie=T-7&fecha=23-09-2026&importe=5.00';
const PROMO = 'https://g.page/r/bar-manolo/review';

const base = {
  business: { name: 'Bar Manolo', tax_id: 'B12345678' },
  number: 'T-7',
  lines: [{ name: 'Cerveza', qty: 2, unit_price: 250, total: 500 }],
  total: 500,
  currency: '€',
  footer: 'Gracias por su visita',
  qr: QR,
  qr_heading: 'QR tributario:',
  qr_legend: 'VERI*FACTU',
};

const withPromo = { ...base, promo_qr: PROMO, promo_note: 'Escanea y déjanos una reseña' };

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

function pathOf(markup: string): string | null {
  return new DOMParser().parseFromString(markup, 'image/svg+xml').querySelector('path')?.getAttribute('d') ?? null;
}

describe('the promotional QR on the browser paper (sales#345)', () => {
  it('draws the promotional QR: the same modules the screen draws for that URL', () => {
    const svg = parse(receiptToPrintableHtml(withPromo)).querySelector('.promo svg');
    expect(svg).toBeTruthy();
    expect(svg?.querySelector('path')?.getAttribute('d')).toBe(pathOf(qrSvgMarkup(PROMO)));
  });

  it('prints the note above its QR', () => {
    const block = parse(receiptToPrintableHtml(withPromo)).querySelector('.promo');
    const kids = Array.from(block?.children ?? []).map((el) => el.tagName.toLowerCase() === 'svg' ? 'svg' : el.className);
    expect(kids).toEqual(['promo-note', 'svg']);
    expect(block?.querySelector('.promo-note')?.textContent).toBe('Escanea y déjanos una reseña');
  });

  it('closes the paper: after the footer and after the «pide tu factura» block', () => {
    const body = parse(receiptToPrintableHtml({
      ...withPromo,
      claim_note: 'Pide tu factura',
      claim_locator: 'ABCD-1234',
      claim_qr_data: 'https://bar.erplora.com/p/ABCD1234ABCD1234',
    })).body;
    expect(body.lastElementChild?.classList.contains('promo')).toBe(true);
    expect(body.querySelector('.claim')).toBeTruthy();
  });

  it('is smaller than the fiscal QR, like <ok-receipt> (70 % of it)', () => {
    const doc = parse(receiptToPrintableHtml(withPromo));
    const fiscal = Number(doc.querySelector('.fiscal-qr svg')?.getAttribute('width'));
    const promo = Number(doc.querySelector('.promo svg')?.getAttribute('width'));
    expect(promo).toBeGreaterThan(0);
    expect(promo).toBe(Math.round(fiscal * 0.7));
  });

  it('draws the QR without a note when the business left the text empty', () => {
    const block = parse(receiptToPrintableHtml({ ...base, promo_qr: PROMO })).querySelector('.promo');
    expect(block?.querySelector('svg')).toBeTruthy();
    expect(block?.querySelector('.promo-note')).toBeNull();
  });

  it('prints nothing promotional without a URL, even with a stray note', () => {
    const doc = parse(receiptToPrintableHtml({ ...base, promo_note: 'Escanea y déjanos una reseña' }));
    expect(doc.querySelector('.promo')).toBeNull();
    expect(doc.body.textContent).not.toContain('déjanos una reseña');
  });

  it('escapes the note: it is typed by the business', () => {
    const html = receiptToPrintableHtml({ ...withPromo, promo_note: '<img src=x onerror=alert(1)>' });
    expect(parse(html).querySelector('.promo img')).toBeNull();
  });
});
