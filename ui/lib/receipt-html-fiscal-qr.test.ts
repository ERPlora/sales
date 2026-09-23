// @vitest-environment happy-dom
// sales#340 — the ticket printed by the BROWSER carries the real fiscal QR.
//
// Without a thermal printer (or with no printer role assigned) the hub prints `receiptToPrintableHtml`
// in an isolated iframe. That paper used to say «scan to validate at the AEAT» and «VERI*FACTU» with
// nothing to scan: a simplified invoice without the QR RD 1619/2012 art. 6.5.a requires. Now it
// draws the same QR as the screen (`<ok-receipt>` → `<ok-qr>`), as inline SVG markup from the same
// encoder (no script runs in that iframe), with the sales#339 layout: «QR tributario:» above the
// QR, the fiscal block opening the paper, «VERI*FACTU» right under it.
import { describe, expect, it } from 'vitest';
import { qrSvgMarkup } from '@erplora/outfitkit/ok-qr';
import { receiptToPrintableHtml } from './receipt-html';

document.documentElement.lang = 'es';

const QR = 'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR?nif=B12345678&numserie=T-7&fecha=23-09-2026&importe=5.00';
const CLAIM = 'https://bar.erplora.com/p/ABCD1234ABCD1234';

const base = {
  business: { name: 'Bar Manolo', tax_id: 'B12345678' },
  number: 'T-7',
  lines: [{ name: 'Cerveza', qty: 2, unit_price: 250, total: 500 }],
  total: 500,
  currency: '€',
  footer: 'Gracias por su visita',
};

const fiscal = { ...base, qr: QR, qr_heading: 'QR tributario:', qr_legend: 'VERI*FACTU', qr_note: 'CSV: ABC123' };

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

function pathOf(markup: string): string | null {
  return new DOMParser().parseFromString(markup, 'image/svg+xml').querySelector('path')?.getAttribute('d') ?? null;
}

describe('the fiscal QR on the browser paper (sales#340)', () => {
  it('draws the fiscal QR: the same modules the screen draws for that URL', () => {
    const block = parse(receiptToPrintableHtml(fiscal)).querySelector('.fiscal-qr');
    const svg = block?.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(svg?.querySelector('path')?.getAttribute('d')).toBe(pathOf(qrSvgMarkup(QR)));
  });

  it('opens the paper: heading, QR, legend and note in that order, before the business name', () => {
    const body = parse(receiptToPrintableHtml(fiscal)).body;
    const first = body.firstElementChild;
    expect(first?.classList.contains('fiscal-qr')).toBe(true);
    const kids = Array.from(first?.children ?? []).map((el) => el.tagName.toLowerCase() === 'svg' ? 'svg' : el.className);
    expect(kids).toEqual(['qr-heading', 'svg', 'legend', 'qr-note']);
    expect(first?.querySelector('.qr-heading')?.textContent).toBe('QR tributario:');
    expect(first?.querySelector('.legend')?.textContent).toBe('VERI*FACTU');
  });

  it('the duplicate mark and the title come after the fiscal block, like on the screen', () => {
    const body = parse(receiptToPrintableHtml({ ...fiscal, duplicate_label: 'DUPLICADO', title: 'Factura simplificada' })).body;
    const order = Array.from(body.children).map((el) => el.className || el.tagName.toLowerCase());
    expect(order.slice(0, 3)).toEqual(['fiscal-qr', 'dup', 'doc-title']);
  });

  it('without a fiscal QR there is no block, no heading and no «VERI*FACTU» claiming a check the paper does not offer', () => {
    const html = receiptToPrintableHtml({ ...base, qr_heading: 'QR tributario:', qr_legend: 'VERI*FACTU' });
    const doc = parse(html);
    expect(doc.querySelector('.fiscal-qr')).toBeNull();
    expect(doc.querySelector('svg')).toBeNull();
    expect(doc.body.textContent).not.toContain('VERI*FACTU');
    expect(doc.body.textContent).not.toContain('QR tributario:');
  });

  it('a CSV note with no QR still prints, at the foot, as before', () => {
    const doc = parse(receiptToPrintableHtml({ ...base, qr_note: 'CSV: ABC123' }));
    expect(doc.querySelector('.foot:last-of-type')?.textContent).toBe('CSV: ABC123');
  });
});

describe('the «ask for your invoice» QR on the browser paper (sales#340)', () => {
  it('draws the claim URL as a QR, smaller than the fiscal one, keeping the locator in text', () => {
    const doc = parse(receiptToPrintableHtml({
      ...fiscal, claim_qr_data: CLAIM, claim_note: 'Pide tu factura', claim_locator: 'ABCD1234ABCD1234',
    }));
    const claimSvg = doc.querySelector('.claim svg');
    expect(claimSvg?.querySelector('path')?.getAttribute('d')).toBe(pathOf(qrSvgMarkup(CLAIM)));
    expect(Number(claimSvg?.getAttribute('width'))).toBeLessThan(Number(doc.querySelector('.fiscal-qr svg')?.getAttribute('width')));
    expect(doc.querySelector('.claim-loc')?.textContent).toBe('ABCD1234ABCD1234');
    // The fiscal QR comes first and the claim stays at the foot: two codes, fiscal one first.
    const svgs = Array.from(doc.querySelectorAll('svg'));
    expect(svgs[0].closest('.fiscal-qr')).toBeTruthy();
    expect(svgs[1].closest('.claim')).toBeTruthy();
  });
});
