// sales#521 — a line already sent to the kitchen can be VOIDED from the till, with a reason.
//
// Until now a fired line was locked for good: no button at all, only «×qty», so a plate the table
// cancelled stayed on the bill (or the whole check had to be deleted). The market voids it
// (8 references, table in the PR): Toast, Square, TouchBistro, Lightspeed K-Series, LS Central,
// Aloha and Clover all ask for a REASON — preset reasons plus free text — and a manager's
// permission (`sales.void_sale` here: an employee gets the manager's PIN from the hub). So:
//   · a fired line carries a «Void» button; a line still to send keeps its usual controls (it is
//     simply removed with the stepper, nothing to void);
//   · the button opens a sheet with the usual reasons as chips and a free text box, and «Void»
//     stays disabled until there is a reason;
//   · confirming calls `sales.order.void_line` and the line leaves the check;
//   · a refusal is said on screen with its declared sentence, and the line stays.

import { beforeEach, describe, expect, it } from 'vitest';
import { installPosDouble } from '../../test/pos-double';
import enCatalog from '../../../locales/en.json';
import esCatalog from '../../../locales/es.json';
import './erp-pos-touch';

const PRODUCTS = [
  { id: 'p-steak', name: 'Steak', sku: 'STK', price: 1800, is_active: 1, tax_category_key: 'product.generic' },
];
const RULES = [{ id: 'r-21', tax_category_key: 'product.generic', rate_pct: 21, parent_id: null, is_active: 1 }];

let commands: { name: string; payload: Record<string, unknown> }[] = [];
let refuseVoid: { code: string } | undefined;

interface Pos {
  shadowRoot: ShadowRoot;
  updateComplete: Promise<unknown>;
  cart: { line_id?: string; name: string; fired_at?: string | null }[];
  error: string;
  queue<T>(t: () => Promise<T>): Promise<T>;
}

/** The till with Kitchen installed and a check of two Steaks: `l1` already sent (round 1), `l2`
 *  still to send. */
async function mount(): Promise<Pos> {
  commands = [];
  const lines: Record<string, unknown>[] = [];
  installPosDouble({
    settings: null,
    products: PRODUCTS,
    rules: RULES,
    orderLines: () => lines.map((l) => ({ ...l })),
    loadSlot: (slot: string) => (slot === 'sales.pos.actions' ? [{ component: 'erp-fake-fire-521' }] : []),
    command: async (name: string, payload: Record<string, unknown>) => {
      commands.push({ name, payload });
      if (name === 'sales.order.open') {
        lines.push(
          { id: 'l1', product_id: 'p-steak', product_name: 'Steak', unit_price: 1800, quantity: 1_000_000,
            tax_category_key: 'product.generic', fired_at: '2026-10-07T10:00:00Z', round_no: 1 },
          { id: 'l2', product_id: 'p-steak', product_name: 'Steak', unit_price: 1800, quantity: 1_000_000,
            tax_category_key: 'product.generic', fired_at: null, round_no: 0 },
        );
        return { ok: true, new_ids: ['o1', 'l1', 'l2'] };
      }
      if (name === 'sales.order.void_line') {
        if (refuseVoid) throw Object.assign(new Error('refused'), refuseVoid);
        const at = lines.findIndex((l) => l.id === payload.line_id);
        if (at >= 0) lines.splice(at, 1);
        return { ok: true };
      }
      return { ok: true };
    },
  });
  document.body.innerHTML = '';
  const el = document.createElement('erp-pos-touch') as unknown as Pos;
  document.body.appendChild(el as unknown as Node);
  await el.updateComplete;
  await new Promise((r) => setTimeout(r, 0));
  await el.updateComplete;
  el.shadowRoot.querySelector<HTMLElement>('ion-card.tile')!.click();
  await el.queue(async () => undefined);
  await el.updateComplete;
  return el;
}

const q = (el: Pos, id: string) => el.shadowRoot.querySelector<HTMLElement>(`[data-testid="${id}"]`);

async function settle(el: Pos) {
  await el.queue(async () => undefined);
  await new Promise((r) => setTimeout(r, 0));
  await el.updateComplete;
}

describe('voiding a line already sent to the kitchen (sales#521)', () => {
  beforeEach(() => { refuseVoid = undefined; });

  it('a sent line carries a Void button; a line still to send does not', async () => {
    const el = await mount();
    expect(el.cart.map((l) => l.line_id), 'the check holds both lines').toEqual(['l1', 'l2']);
    expect(q(el, 'pos-line-l1-void'), 'the sent line can be voided').toBeTruthy();
    expect(q(el, 'pos-line-l2-void'), 'the pending line is removed with its stepper instead').toBeNull();
    expect(q(el, 'pos-line-l1-void')!.getAttribute('aria-label')).toBe('ui.voidLine');
  });

  it('opens a sheet with the usual reasons and keeps Void disabled until there is one', async () => {
    const el = await mount();
    q(el, 'pos-line-l1-void')!.click();
    await el.updateComplete;
    expect(q(el, 'pos-void-scrim'), 'the sheet is open').toBeTruthy();
    const chips = [...el.shadowRoot.querySelectorAll<HTMLElement>('[data-testid^="pos-void-reason-"]')];
    expect(chips.map((c) => c.textContent?.trim())).toEqual([
      'ui.voidReasonMistake', 'ui.voidReasonChanged', 'ui.voidReasonSoldOut', 'ui.voidReasonDuplicate',
    ]);
    expect(q(el, 'pos-void-confirm')!.hasAttribute('disabled'), 'no reason, no void').toBe(true);
    const box = q(el, 'pos-void-input') as HTMLTextAreaElement;
    box.value = '   ';
    box.dispatchEvent(new Event('input'));
    await el.updateComplete;
    expect(q(el, 'pos-void-confirm')!.hasAttribute('disabled'), 'blanks are not a reason').toBe(true);
    expect(commands.some((c) => c.name === 'sales.order.void_line'), 'nothing sent yet').toBe(false);
  });

  it('a chip is the reason; confirming voids the line on the server and it leaves the check', async () => {
    const el = await mount();
    q(el, 'pos-line-l1-void')!.click();
    await el.updateComplete;
    q(el, 'pos-void-reason-mistake')!.click();
    await el.updateComplete;
    expect(q(el, 'pos-void-reason-mistake')!.getAttribute('aria-pressed')).toBe('true');
    expect(q(el, 'pos-void-confirm')!.hasAttribute('disabled')).toBe(false);
    q(el, 'pos-void-confirm')!.click();
    await settle(el);
    expect(commands.filter((c) => c.name === 'sales.order.void_line').map((c) => c.payload)).toEqual([
      { order_id: 'o1', line_id: 'l1', reason: 'ui.voidReasonMistake' },
    ]);
    expect(q(el, 'pos-void-scrim'), 'the sheet closes').toBeNull();
    expect(el.cart.map((l) => l.line_id), 'only the pending line is left').toEqual(['l2']);
    expect(el.error).toBe('');
  });

  it('a typed reason travels trimmed', async () => {
    const el = await mount();
    q(el, 'pos-line-l1-void')!.click();
    await el.updateComplete;
    const box = q(el, 'pos-void-input') as HTMLTextAreaElement;
    box.value = '  Burnt  ';
    box.dispatchEvent(new Event('input'));
    await el.updateComplete;
    q(el, 'pos-void-confirm')!.click();
    await settle(el);
    expect(commands.find((c) => c.name === 'sales.order.void_line')?.payload.reason).toBe('Burnt');
  });

  it('closing the sheet voids nothing', async () => {
    const el = await mount();
    q(el, 'pos-line-l1-void')!.click();
    await el.updateComplete;
    q(el, 'pos-void-close')!.click();
    await el.updateComplete;
    expect(q(el, 'pos-void-scrim')).toBeNull();
    expect(commands.some((c) => c.name === 'sales.order.void_line')).toBe(false);
    expect(el.cart.map((l) => l.line_id)).toEqual(['l1', 'l2']);
  });

  it('a refusal is said with its declared sentence and the line stays', async () => {
    const el = await mount();
    refuseVoid = { code: 'sales.order_line_not_voidable' };
    q(el, 'pos-line-l1-void')!.click();
    await el.updateComplete;
    q(el, 'pos-void-reason-soldout')!.click();
    await el.updateComplete;
    q(el, 'pos-void-confirm')!.click();
    await settle(el);
    const said = [
      (enCatalog as { errors: Record<string, string> }).errors['sales.order_line_not_voidable'],
      (esCatalog as { errors: Record<string, string> }).errors['sales.order_line_not_voidable'],
    ];
    expect(said.every(Boolean), 'the code has its sentence in en and es').toBe(true);
    expect(said).toContain(el.error);
    expect(el.cart.map((l) => l.line_id)).toEqual(['l1', 'l2']);
  });
});

describe('the words of the void sheet, in en and es (sales#521)', () => {
  const KEYS = ['voidLine', 'voidLineOf', 'voidLineHint', 'voidLineReasonPlaceholder', 'voidLineConfirm',
    'voidLineFailed', 'voidReasonMistake', 'voidReasonChanged', 'voidReasonSoldOut', 'voidReasonDuplicate'];
  for (const [lang, cat] of [['en', enCatalog], ['es', esCatalog]] as const) {
    it(`${lang} has every key`, () => {
      const ui = (cat as { ui: Record<string, string> }).ui;
      for (const k of KEYS) expect(ui[k], `${lang} ui.${k}`).toBeTruthy();
    });
  }
  it('Spanish is not a copy of English', () => {
    const en = (enCatalog as { ui: Record<string, string> }).ui;
    const es = (esCatalog as { ui: Record<string, string> }).ui;
    expect(es.voidLine).not.toBe(en.voidLine);
    expect(es.voidReasonMistake).not.toBe(en.voidReasonMistake);
    for (const code of ['sales.order_line_not_voidable', 'sales.order_line_not_removable']) {
      const e = (enCatalog as { errors: Record<string, string> }).errors[code];
      const s = (esCatalog as { errors: Record<string, string> }).errors[code];
      expect(e, `en ${code}`).toBeTruthy();
      expect(s, `es ${code}`).toBeTruthy();
      expect(s).not.toBe(e);
    }
  });
});
