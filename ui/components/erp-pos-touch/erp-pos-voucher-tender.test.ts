// sales#162 / ADR-0386 — the till HOSTS the `sales.pos.tender` slot, one instance per LINE.
//
// `services` already built, translated and tested its side (services#70/#71, 1.5.35): a read that
// says which vouchers cover THIS line with the preview («4 left · 3 after»), the default voucher
// with its reason written, and the commands to hold, undo and settle. It declares the component in
// `sales.pos.tender` — and nobody sees it, because the POS never asks for that slot.
//
// A voucher covers a LINE, whole or not at all (it is N uses of concrete services, not a wallet),
// so the slot goes on the line and not on the ticket. What the host owes the filler is four values
// and two ears:
//
//   customer-id · service-id · checkout-ref · line-ref
//   `erp:voucher-held` → that line is paid, take it out of the amount to charge
//   `erp:voucher-released` → it counts again
//
// 🔴 THE HOST LEARNS NOTHING ABOUT VOUCHERS. It hosts a slot; the word «voucher» never reaches a
// decision here. A hub without `services` gets zero calls and zero gaps on screen, which is the
// last test of this file and the reason the other seven are allowed to exist.
import { beforeEach, describe, expect, it } from 'vitest';
import enLocale from '../../../locales/en.json';
import esLocale from '../../../locales/es.json';
import { installPosDouble } from '../../test/pos-double';

import { tenderExactCash } from '../../test/cash-tender';
import './erp-pos-touch';
const PRODUCTS = [
  { id: 'p-champu', name: 'Champú', price: 900, is_active: 1, tax_category_key: 'product.generic' },
];
const SERVICES = [
  { id: 's-corte', name: 'Corte de señora', price: 1800, pricing_type: 'fixed',
    duration_minutes: 45, category_id: 'sc-pelo', tax_category_key: 'service.generic',
    status: 'active' },
];
const SERVICE_CATS = [{ id: 'sc-pelo', name: 'Cabello' }];
const RULES = [
  { id: 'r-21', tax_category_key: 'product.generic', rate_pct: 21, parent_id: null, is_active: 1 },
  { id: 'r-s21', tax_category_key: 'service.generic', rate_pct: 21, parent_id: null, is_active: 1 },
];
const METHODS = [
  { id: 'pm-cash', name: 'Efectivo', type: 'cash', requires_change: 1, sort_order: 10 },
  { id: 'pm-card', name: 'Tarjeta', type: 'card', requires_change: 0, sort_order: 20 },
];

/** Every slot the till asked the SDK for, in order. */
let slotsAsked: string[] = [];
/** sales#554 — the code the next split is refused with after another device raised the line to
 *  three; '' = it splits. */
let refuseSplitWith = '';

class FakeErploraError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'ErploraError';
  }
}
let commands: { name: string; payload: Record<string, unknown> }[] = [];

/** A stand-in for `erp-services-voucher-tender`: it only records what the host handed it. */
class FakeVoucherTender extends HTMLElement {
  customerId = '';
  serviceId = '';
  checkoutRef = '';
  lineRef = '';
}
if (!customElements.get('erp-fake-voucher')) {
  customElements.define('erp-fake-voucher', FakeVoucherTender);
}

/** `servicesInstalled: false` reproduces a hub that never installed `services`. */
function installSdk(servicesInstalled = true) {
  slotsAsked = [];
  commands = [];
  refuseSplitWith = '';
  const orderLines: Record<string, unknown>[] = [];
  let seq = 0;
  installPosDouble({
    paymentMethods: METHODS,
    orderLines: () => orderLines,
    byIdempotencyKey: [{ id: 'sale-1' }],
    products: PRODUCTS,
    rules: RULES,
    ...(servicesInstalled
      ? { services: SERVICES, serviceCategories: SERVICE_CATS }
      : { absentModules: ['services'] }),
    loadSlot: (slot: string) => {
      slotsAsked.push(slot);
      if (!servicesInstalled) return [];
      return slot === 'sales.pos.tender' ? [{ component: 'erp-fake-voucher' }] : [];
    },
    command: async (name: string, payload: Record<string, unknown>) => {
      commands.push({ name, payload });
      if (name === 'sales.order.open' || name === 'sales.order.add_line') {
        const items = (payload.items as Record<string, unknown>[] | undefined)
          ?? [payload as Record<string, unknown>];
        const ids: string[] = name === 'sales.order.open' ? ['ord-1'] : [];
        for (const it of items) {
          const id = `line-${++seq}`;
          ids.push(id);
          orderLines.push({
            // `order.open` sends items with `price`; `order.add_line` sends a FLAT payload with
            // `unit_price`. Reading only the first left every added line worth 0 the moment the
            // check was re-read from its rows, which is what a split does.
            id, product_id: it.product_id, product_name: it.product_name,
            quantity: it.quantity, unit_price: it.price ?? it.unit_price,
            line_total: it.line_total ?? it.price, tax_category_key: it.tax_category_key,
            is_service: it.is_service ? 1 : 0,
          });
        }
        return { ok: true, new_ids: ids };
      }
      // The till bumps a repeated tap through `update_line`, so the row really does hold «× 2».
      if (name === 'sales.order.update_line') {
        const row = orderLines.find((l) => l.id === payload.line_id);
        if (row) {
          // sales#394: the server prices the line from its row; no amount comes from the till.
          row.quantity = payload.quantity;
          row.line_total = Math.round((Number(row.unit_price) * Number(payload.quantity)) / 1_000_000);
        }
        return { ok: true, new_ids: [] };
      }
      // sales#242 / ADR-0422 — the server's split: the named row drops to ONE unit and N−1 clones
      // of it go in, all in one transaction. The ids of the new rows come back in `new_ids`.
      if (name === 'sales.order.split_line') {
        const row = orderLines.find((l) => l.id === payload.line_id);
        if (!row) return { ok: true, new_ids: [] };
        if (refuseSplitWith) {
          // Another device raised the line to three while this one split the two it showed.
          row.quantity = 3_000_000;
          row.line_total = Number(row.unit_price) * 3;
          throw new FakeErploraError(refuseSplitWith, 'The check changed while it was being charged');
        }
        const parts = Number(row.quantity) / 1_000_000;
        row.quantity = 1_000_000;
        row.line_total = row.unit_price;
        const ids: string[] = [];
        for (let i = 1; i < parts; i += 1) {
          const id = `line-${++seq}`;
          ids.push(id);
          orderLines.push({ ...row, id });
        }
        return { ok: true, new_ids: ids };
      }
      return { ok: true, new_ids: [`x-${++seq}`] };
    },
  });
}

interface Pos extends HTMLElement {
  shadowRoot: ShadowRoot;
  updateComplete: Promise<unknown>;
  queue<T>(t: () => Promise<T>): Promise<T>;
  openPay(): void;
  confirm(print?: boolean): Promise<void>;
}

async function mount(): Promise<Pos> {
  document.body.innerHTML = '';
  const el = document.createElement('erp-pos-touch') as unknown as Pos;
  document.body.appendChild(el);
  await el.updateComplete;
  await new Promise((r) => setTimeout(r, 0));
  await el.updateComplete;
  return el;
}

const $ = (el: Pos, sel: string) => el.shadowRoot.querySelector<HTMLElement>(sel);
const $$ = (el: Pos, sel: string) => [...el.shadowRoot.querySelectorAll<HTMLElement>(sel)];

async function addByName(el: Pos, name: string) {
  const tile = $$(el, 'ion-card.tile').find((c) => c.querySelector('.n')?.textContent?.trim() === name);
  if (!tile) throw new Error(`no tile named ${name}`);
  tile.click();
  await el.queue(async () => undefined);
  await el.updateComplete;
}

function assignCustomer(el: Pos, id = 'cust-1') {
  el.dispatchEvent(new CustomEvent('erp:customer-context', {
    detail: { customer_id: id, customer_name: 'Ana' },
  }));
}

/** A haircut (18,00 €) plus a shampoo (9,00 €), a customer assigned, and the pay sheet open. */
async function salonTicket(servicesInstalled = true): Promise<Pos> {
  installSdk(servicesInstalled);
  const el = await mount();
  await addByName(el, 'Corte de señora');
  await addByName(el, 'Champú');
  assignCustomer(el);
  await el.updateComplete;
  el.openPay();
  await el.updateComplete;
  await new Promise((r) => setTimeout(r, 0));
  await el.updateComplete;
  return el;
}

const payable = (el: Pos) => $(el, '.sheet .pay-total')?.textContent?.trim();
const fillerOf = (el: Pos, lineRef: string) =>
  $(el, `.tender-line[data-line="${lineRef}"] erp-fake-voucher`) as FakeVoucherTender | null;

function hold(el: Pos, lineRef: string, redemptionId = 'red-1') {
  fillerOf(el, lineRef)!.dispatchEvent(new CustomEvent('erp:voucher-held', {
    bubbles: true, composed: true,
    detail: { redemptionId, packageId: 'pkg-1', lineRef, checkoutRef: 'ord-1' },
  }));
}
function release(el: Pos, lineRef: string, redemptionId = 'red-1') {
  fillerOf(el, lineRef)!.dispatchEvent(new CustomEvent('erp:voucher-released', {
    bubbles: true, composed: true, detail: { redemptionId, lineRef },
  }));
}

beforeEach(() => { installSdk(); });

describe('sales#162 — the POS hosts `sales.pos.tender`', () => {
  it('asks the SDK for the tender slot (control: it already asks for `sales.pos.assign`)', async () => {
    const el = await salonTicket();
    expect(slotsAsked, 'positive control: the assign slot IS asked for today').toContain('sales.pos.assign');
    expect(slotsAsked, 'the till must ask for the tender slot').toContain('sales.pos.tender');
    expect(el).toBeTruthy();
  });

  it('mounts the filler on the SERVICE line and on no other', async () => {
    const el = await salonTicket();
    expect(fillerOf(el, 'line-1'), 'the haircut carries the slot').toBeTruthy();
    expect($$(el, '.tender-line')).toHaveLength(1);
    expect($(el, '.tender-line[data-line="line-2"]'), 'the shampoo is not a service').toBeNull();
  });

  it('hands the filler the four values of the contract, as JS properties', async () => {
    const el = await salonTicket();
    const filler = fillerOf(el, 'line-1')!;
    expect(filler.customerId).toBe('cust-1');
    expect(filler.serviceId, 'the product_id of the service line').toBe('s-corte');
    expect(filler.checkoutRef, 'the same value that travels as order_id in sale.completed').toBe('ord-1');
    expect(filler.lineRef).toBe('line-1');
    // Properties, never attributes: these are typed data, not strings on the DOM.
    expect(filler.getAttribute('customer-id')).toBeNull();
  });

  it('without a customer there is no voucher to offer, so the slot is not mounted', async () => {
    installSdk();
    const el = await mount();
    await addByName(el, 'Corte de señora');
    el.openPay();
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    await el.updateComplete;
    expect($$(el, '.tender-line')).toHaveLength(0);
  });

  it('a confirmed redemption takes that line out of the amount to charge', async () => {
    const el = await salonTicket();
    expect(payable(el), 'the whole ticket before the redemption').toBe('27.00 €');
    hold(el, 'line-1');
    await el.updateComplete;
    expect(payable(el), 'only the shampoo is left to charge').toBe('9.00 €');
  });

  it('undoing it puts the line back into the amount', async () => {
    const el = await salonTicket();
    hold(el, 'line-1');
    await el.updateComplete;
    release(el, 'line-1');
    await el.updateComplete;
    expect(payable(el)).toBe('27.00 €');
  });

  it('the covered line travels to `complete_sale` marked, and the rest at full price', async () => {
    const el = await salonTicket();
    hold(el, 'line-1');
    await el.updateComplete;
    await tenderExactCash(el); // sales#309: cash is typed before charging
    await el.confirm(false);
    const sale = commands.find((c) => c.name === 'sales.complete_sale')!;
    const items = sale.payload.items as Record<string, unknown>[];
    expect(items, 'the covered line stays in the sale: the customer did get the haircut').toHaveLength(2);
    const corte = items.find((i) => i.product_id === 's-corte')!;
    const champu = items.find((i) => i.product_id === 'p-champu')!;
    expect(corte.covered, 'covered by an external tender — the handler zeroes it').toBe(true);
    expect(corte.price, 'the price is NOT zeroed by the browser: the server decides').toBe(1800);
    expect(champu.covered).toBeUndefined();
  });

  it('the CART footer stops promising money the ticket no longer owes', async () => {
    // Found in the browser at 1440×900: the sheet said «Cobrar 9,00 €» and the till's own footer,
    // behind it, still said «Cobrar · 27,00 €». Close the sheet and that is the only number on
    // screen — the cashier reads the amount the customer is about to be asked for, and it is wrong
    // by the whole voucher. The ticket TOTAL is still 27,00 €, and that line stays: what changed is
    // what is left to charge.
    const el = await salonTicket();
    hold(el, 'line-1');
    await el.updateComplete;
    const foot = $(el, '.cart-foot ion-button.charge')!;
    expect(foot.textContent?.replace(/\s+/g, ' ')).toContain('9.00 €');
    expect($(el, '.cart-foot .total b')?.textContent?.trim(), 'the ticket is still worth 27,00 €').toBe('27.00 €');
    release(el, 'line-1');
    await el.updateComplete;
    expect($(el, '.cart-foot ion-button.charge')!.textContent?.replace(/\s+/g, ' ')).toContain('27.00 €');
  });

  // ── sales#242 / ADR-0422 · the mother and the daughter ───────────────────────────────────────
  //
  // The cashier taps «Corte de señora» twice and the till merges into ONE line of two, which is
  // what it does with any repeated article and what is right for everything else. A redemption
  // covers one line and spends one session, so that line used to dead-end: it was listed with the
  // reason written on it and the cashier was left to split it by hand, except the till had no
  // «split». It has one now, and the two lines it produces are two haircuts the voucher can be
  // asked about one at a time — one session for the mother, full price for the daughter.
  describe('a line of more than one', () => {
    /** Two haircuts (one line of two) plus a shampoo, a customer, the pay sheet open. */
    async function twoHaircuts(): Promise<Pos> {
      installSdk();
      const el = await mount();
      await addByName(el, 'Corte de señora');
      await addByName(el, 'Corte de señora');
      await addByName(el, 'Champú');
      assignCustomer(el);
      await el.updateComplete;
      el.openPay();
      await el.updateComplete;
      await new Promise((r) => setTimeout(r, 0));
      await el.updateComplete;
      return el;
    }

    async function tapSplit(el: Pos) {
      const button = $(el, '.tender-line[data-line="line-1"] .tl-split');
      if (!button) throw new Error('no split action on the line of two');
      button.click();
      await el.queue(async () => undefined);
      await el.updateComplete;
      await new Promise((r) => setTimeout(r, 0));
      await el.updateComplete;
    }

    it('is NOT offered the slot — one session would pay for two haircuts', async () => {
      const el = await twoHaircuts();
      expect(payable(el), 'two haircuts and a shampoo').toBe('45.00 €');
      expect($$(el, '.tender-line'), 'the line is listed, not skipped in silence').toHaveLength(1);
      expect(fillerOf(el, 'line-1'), 'no slot on a line of two').toBeNull();
    });

    it('is offered the SPLIT instead of a dead end', async () => {
      const el = await twoHaircuts();
      const button = $(el, '.tender-line[data-line="line-1"] .tl-split');
      expect(button, 'the till now has a «split»').toBeTruthy();
      // The COUNT, not the sentence (ADR-0055): the wording is the part that is meant to change.
      expect(button!.dataset.parts, 'two haircuts, two lines').toBe('2');
    });

    it('splitting leaves two lines of one, each with its own slot, worth the same', async () => {
      const el = await twoHaircuts();
      await tapSplit(el);
      const split = commands.filter((c) => c.name === 'sales.order.split_line');
      expect(split, 'ONE server command: half a split is money').toHaveLength(1);
      expect(split[0].payload).toEqual({ order_id: 'ord-1', line_id: 'line-1' });
      expect($$(el, '.tender-line'), 'two haircuts, two lines').toHaveLength(2);
      expect(fillerOf(el, 'line-1'), 'the source keeps its id').toBeTruthy();
      expect($$(el, 'erp-fake-voucher'), 'one slot per haircut').toHaveLength(2);
      expect(payable(el), 'splitting charges nothing and forgives nothing').toBe('45.00 €');
    });

    it('LABELS the two lines, or two identical rows read as a double charge', async () => {
      // The Shopify lesson: splitting the cart line is right, and unmarked it reads as a bug —
      // «this is a known behavior… it can definitely be confusing» (community.shopify.dev).
      const el = await twoHaircuts();
      await tapSplit(el);
      const parts = $$(el, '.tender-line .tl-part').map((n) => `${n.dataset.part}/${n.dataset.of}`);
      expect(parts).toEqual(['1/2', '2/2']);
    });

    it('covers the haircut the voucher reaches and CHARGES the other one', async () => {
      // Partial coverage, unanimous in Vagaro, Zenoti, Boulevard, Lightspeed and WooCommerce. No
      // blocking dialog: nobody in the trade uses one, and the cashier learns to accept it unread.
      const el = await twoHaircuts();
      await tapSplit(el);
      const second = $$(el, '.tender-line').map((n) => n.dataset.line).find((id) => id !== 'line-1')!;
      hold(el, second);
      await el.updateComplete;
      expect(payable(el), 'one haircut and the shampoo are still charged').toBe('27.00 €');
      expect($(el, '.sheet .pay-total'), 'no dialog interrupted the charge').toBeTruthy();
    });

    // sales#554 — the server refuses a split whose line changed on another device while it waited
    // (`sales.order_changed`): nothing was split. The screen says so in its own sentence and reads
    // the check again, so the next «Split» splits the three haircuts that are really there.
    it('a line changed on another device: the sheet says so and the check is read again', async () => {
      const el = await twoHaircuts();
      refuseSplitWith = 'sales.order_changed';
      await tapSplit(el);
      const err = $(el, '.sheet .pay-err')?.textContent ?? '';
      expect(err).toContain('ui.tenderSplitChanged');
      expect(err, 'not the generic «could not be split»').not.toContain('ui.tenderSplitFailed');
      expect($$(el, '.tender-line'), 'nothing was split').toHaveLength(1);
      expect($(el, '.tender-line[data-line="line-1"] .tl-split')!.dataset.parts, 'the line as it is now').toBe('3');
      expect(payable(el), 'three haircuts and a shampoo').toBe('63.00 €');
    });

    it('any other refusal keeps the generic sentence', async () => {
      const el = await twoHaircuts();
      refuseSplitWith = 'sales.line_not_splittable';
      await tapSplit(el);
      expect($(el, '.sheet .pay-err')?.textContent ?? '').not.toContain('ui.tenderSplitChanged');
    });

    it('its sentence exists in en AND in es', () => {
      const en = (enLocale as { ui: Record<string, string> }).ui.tenderSplitChanged;
      const es = (esLocale as { ui: Record<string, string> }).ui.tenderSplitChanged;
      expect(en).toBeTruthy();
      expect(es).toBeTruthy();
      expect(es).not.toBe(en);
    });

    it('a line of one is untouched: no split action where there is nothing to split', async () => {
      const el = await salonTicket();
      expect(fillerOf(el, 'line-1'), 'the single haircut carries its slot').toBeTruthy();
      expect($(el, '.tender-line .tl-split'), 'nothing to split').toBeNull();
      expect($(el, '.tender-line .tl-part'), 'nothing to number either').toBeNull();
    });
  });

  it('without `services` installed the checkout does not change: no gaps, no fillers', async () => {
    // No `services` means no service catalogue either, so this is a shop ticket: one shampoo. The
    // guarantee is that the pay sheet is EXACTLY the one that shipped in 2.16.2 — the slot leaves
    // no empty row behind, and `loadSlot` handing back nothing is the normal case, not a failure.
    installSdk(false);
    const el = await mount();
    await addByName(el, 'Champú');
    assignCustomer(el);
    await el.updateComplete;
    el.openPay();
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    await el.updateComplete;
    expect($$(el, '.tender-line'), 'no empty row where the slot would go').toHaveLength(0);
    expect($$(el, 'erp-fake-voucher')).toHaveLength(0);
    expect(payable(el)).toBe('9.00 €');
  });
});
