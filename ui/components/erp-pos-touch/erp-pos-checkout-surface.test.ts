// sales#185 — WHERE and WHEN the checkout failure is told, and WHAT the screen branches on.
//
// Three defects of the same screen, found by the 25-module QA campaign of 2026-08-22 (hub#1102):
//
//   1. ONE failure, TWO messages. `this.error` was painted both by the page (`p.err`, behind the
//      modal, across the product grid) and by the pay sheet (`p.pay-err`). The copy behind the
//      scrim is clipped by the modal's edge ("... is unavailable - the c..."), so the cashier reads
//      half a sentence twice. While the sheet is open the checkout error belongs to the SHEET: it
//      is the surface the eyes and the thumb are on, and it is the one that is not cut off.
//
//   2. The POS said it AT THE END. With a required app uninstalled (`taxes`, hub#1101) the screen
//      looked perfectly healthy until the cashier had typed the amount, picked a payment method
//      and confirmed — customer waiting, cart to rebuild. The runtime already answers the stable
//      `module_not_installed` / `module_inactive` codes on the read the POS does AT MOUNT
//      (`taxes.rules.list`, declared `required: true` on `sales.complete_sale`), so the screen can
//      say it before a payment is ever started. Same reasoning as sales#74 for the grid tile: the
//      handler is the last net, not the first. Note the runtime does NOT carry a `module` field on
//      the envelope today (checked against hub@origin/develop `crates/server/src/lib.rs`), so the
//      app is identified by the read we asked for, never by a field that does not exist.
//
//   3. And the twin debt inside the module: `handleCheckoutFailure` chose the message with
//      `checkoutErrorKey(raw)` — over the PROSE. That is the pattern hub#1070 is retiring from the
//      hub: the day the sentence is translated (or the SDK replaces it, which is what ADR-0400
//      just did to the platform codes) the mapping stops matching IN SILENCE. The contract is the
//      `code` the envelope carries, never the sentence.
//
// 🔴 The block on Charge is `aria-disabled`, NEVER the native `disabled`: on Ionic that is
// `pointer-events: none`, so on a counter tablet the tap dies with the reason stranded in `title`
// (sales#58). The tap has to arrive and ANSWER.
import { beforeEach, describe, expect, it } from 'vitest';
import enLocale from '../../../locales/en.json';
import esLocale from '../../../locales/es.json';
import { installPosDouble } from '../../test/pos-double';

import { tenderExactCash } from '../../test/cash-tender';
import './erp-pos-touch';
const PRODUCTS = [
  { id: 'p-cafe', name: 'Café', sku: 'CAF', price: 150, is_active: 1, tax_category_key: 'product.generic' },
];
const RULES = [{ id: 'r-21', tax_category_key: 'product.generic', rate_pct: 21, parent_id: null, is_active: 1 }];
const METHODS = [{ id: 'pm-cash', name: 'Efectivo', type: 'cash', requires_change: 1, sort_order: 10 }];

/** Toasts the component asked the shell for, in order. */
let notices: { type: string; message: string }[] = [];
/** Stable code the next `sales.complete_sale` is refused with (''=it succeeds). */
let refuseWith = '';
/** Stable code `taxes.rules.list` is refused with (''=the catalogue arrives). */
let taxesRefuseWith = '';

/** The typed error the SDK really throws: a `code` FIELD plus a sentence nobody should parse. */
class FakeErploraError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'ErploraError';
  }
}

function installSdk() {
  notices = [];
  refuseWith = '';
  taxesRefuseWith = '';
  installPosDouble({
    paymentMethods: METHODS,
    byIdempotencyKey: [{ id: 'sale-1' }],
    products: PRODUCTS,
    // Read LAZILY: each test sets `taxesRefuseWith` after the double is installed. The sentence is
    // deliberately USELESS to a text matcher — only the code identifies the refusal.
    rules: () => {
      if (taxesRefuseWith) throw new FakeErploraError(taxesRefuseWith, 'module `taxes` is not installed in this hub');
      return RULES;
    },
    notify: (n: { type: string; message: string }) => { notices.push(n); },
    command: async (name: string) => {
      if (name === 'sales.complete_sale' && refuseWith) {
        // The sentence is deliberately USELESS to a text matcher: only the code identifies it.
        throw new FakeErploraError(refuseWith, 'the operation could not be completed');
      }
      return { ok: true, new_ids: ['ord-1', 'line-1'] };
    },
  });
}

interface Pos extends HTMLElement {
  shadowRoot: ShadowRoot;
  updateComplete: Promise<unknown>;
  queue<T>(t: () => Promise<T>): Promise<T>;
  openPay(): void;
  confirm(print?: boolean): Promise<void>;
  error: string;
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

/** A cart with one line, ready to be charged. */
async function withLine(): Promise<Pos> {
  const el = await mount();
  $(el, 'ion-card.tile')!.click();
  await el.queue(async () => undefined);
  await el.updateComplete;
  return el;
}

beforeEach(() => { installSdk(); });

describe('1 · with the pay sheet open the checkout error lives ONLY in the sheet', () => {
  it('a refused checkout paints `.pay-err` and leaves the page `.err` empty', async () => {
    const el = await withLine();
    el.openPay();
    await el.updateComplete;
    refuseWith = 'sales.no_tax_rule';

    await tenderExactCash(el); // sales#309: cash is typed before charging
    await el.confirm();
    await el.updateComplete;

    expect($(el, '.sheet .pay-err')?.textContent, 'the sheet says it, where the thumb is')
      .toContain('ui.errorNoTaxRule');
    // The page copy sits behind the scrim and gets clipped by the modal edge: half a sentence,
    // twice. While the sheet is open the page must not paint the checkout error at all.
    expect($(el, '.catalog > .err'), 'the page must not repeat the checkout error behind the modal')
      .toBeFalsy();
  });

  it('closing the sheet hands the error back to the page — it is never lost, only moved', async () => {
    const el = await withLine();
    el.openPay();
    await el.updateComplete;
    refuseWith = 'sales.no_tax_rule';
    await tenderExactCash(el); // sales#309: cash is typed before charging
    await el.confirm();
    await el.updateComplete;

    $(el, '.sheet .x')!.click();
    await el.updateComplete;

    expect($(el, '.catalog > .err')?.textContent, 'with no sheet on top, the page is the surface')
      .toContain('ui.errorNoTaxRule');
  });
});

describe('2 · a missing app is said AT MOUNT, before a checkout can be started', () => {
  it('paints the notice naming the app when `taxes` is not installed', async () => {
    taxesRefuseWith = 'module_not_installed';
    const el = await mount();

    const notice = $(el, '.missing-app-notice');
    expect(notice, 'the screen looked healthy until the cashier had already confirmed').toBeTruthy();
    expect(notice!.textContent).toContain('ui.missingAppCharge');
    expect(notice!.getAttribute('role'), 'it is not decoration: a sale cannot be taken').toBe('alert');
  });

  it('a DEACTIVATED app counts as missing too (the ADR-0128 cascade)', async () => {
    taxesRefuseWith = 'module_inactive';
    const el = await mount();
    expect($(el, '.missing-app-notice')).toBeTruthy();
  });

  it('Charge is aria-disabled — NEVER natively disabled — and the tap ANSWERS', async () => {
    taxesRefuseWith = 'module_not_installed';
    const el = await mount();
    $(el, 'ion-card.tile')!.click();
    await el.queue(async () => undefined);
    await el.updateComplete;

    const charge = $(el, '.foot-actions ion-button.charge')!;
    expect(charge.hasAttribute('disabled'), 'a native disabled swallows the tap in silence').toBe(false);
    expect(charge.getAttribute('aria-disabled')).toBe('true');

    charge.click();
    await el.updateComplete;

    expect($(el, '.sheet'), 'no payment may be started with the app missing').toBeFalsy();
    expect(notices.map((n) => n.message), 'the tap is answered, not swallowed')
      .toContain('ui.missingAppCharge');
  });

  // 🔴 MEASURED IN A REAL BROWSER (`erplora dev` + CDP, 2026-08-25), not deduced. Ionic (Stencil)
  // takes the `ion-button` host over on hydration: it steals the `aria-*` and rewrites `className`
  // with its own. Lit then never writes either of them again — its `AttributePart` caches the last
  // value it emitted, sees no change and skips the write. Result: the attribute vanishes from the
  // host, never lands on the inner button, and the block goes UNANNOUNCED — exactly the sales#58
  // hole, through another door.
  //
  // happy-dom does not hydrate Ionic, so the theft itself cannot be reproduced here; what CAN be
  // pinned down is the CONTRACT that neutralises it: if a third party strips the state, the next
  // paint puts it back. That is what `updated()` does, and that is what this test demands.
  it('puts `aria-disabled` and the blocked class back when a third party strips them', async () => {
    taxesRefuseWith = 'module_not_installed';
    const el = await mount();
    $(el, 'ion-card.tile')!.click();
    await el.queue(async () => undefined);
    await el.updateComplete;

    const charge = $(el, '.foot-actions ion-button.charge')!;
    expect(charge.getAttribute('aria-disabled')).toBe('true');

    // What Ionic really does on hydration: steal the aria-* and rewrite `className` with its own.
    // Measured in `erplora dev`: the block was lost as soon as the first line was added.
    charge.removeAttribute('aria-disabled');
    charge.className = 'charge md button button-solid hydrated';
    (el as unknown as { requestUpdate(): void }).requestUpdate();
    await el.updateComplete;

    expect(charge.getAttribute('aria-disabled'), 'one more paint and the block was invisible')
      .toBe('true');
    expect(charge.classList.contains('blocked'), 'and the colour has to come back with it').toBe(true);
    expect(charge.classList.contains('button-solid'), 'without wiping Ionic own classes').toBe(true);
  });

  it('and REMOVES them once it is no longer blocked: the DOM never lies the other way', async () => {
    const el = await withLine();
    const charge = $(el, '.foot-actions ion-button.charge')!;
    expect(charge.hasAttribute('aria-disabled')).toBe(false);

    charge.setAttribute('aria-disabled', 'true'); // left over from an earlier paint
    charge.classList.add('blocked');
    (el as unknown as { requestUpdate(): void }).requestUpdate();
    await el.updateComplete;

    expect(charge.hasAttribute('aria-disabled')).toBe(false);
    expect(charge.classList.contains('blocked')).toBe(false);
  });

  it('the blocked button LOOKS blocked, it is not only announced', async () => {
    taxesRefuseWith = 'module_not_installed';
    const el = await mount();
    $(el, 'ion-card.tile')!.click();
    await el.queue(async () => undefined);
    await el.updateComplete;
    // A full-colour primary button that does not charge is a promise the screen does not keep.
    expect($(el, '.foot-actions ion-button.charge')!.classList.contains('blocked')).toBe(true);
  });

  it('a healthy hub keeps the POS exactly as it was — no notice, no block', async () => {
    const el = await withLine();
    expect($(el, '.missing-app-notice')).toBeFalsy();
    const charge = $(el, '.foot-actions ion-button.charge')!;
    expect(charge.getAttribute('aria-disabled')).toBeNull();

    charge.click();
    await el.updateComplete;
    expect($(el, '.sheet'), 'the sheet still opens on a hub with its apps in place').toBeTruthy();
  });

  it('a tax catalogue that fails for ANY OTHER reason is NOT "the app is missing"', async () => {
    // `taxes` is installed and answered badly (a broken handler, a renamed query). That is a
    // different incident: the POS keeps selling, exactly as it did before sales#185.
    taxesRefuseWith = 'db';
    const el = await mount();
    expect($(el, '.missing-app-notice'), 'only the runtime\'s two absence codes mean absence')
      .toBeFalsy();
  });
});

describe('3 · the checkout branches on the CODE, never on the sentence', () => {
  it('a refusal whose sentence says nothing still gets its own message', async () => {
    const el = await withLine();
    el.openPay();
    await el.updateComplete;
    // The prose carries no code at all — the old `checkoutErrorKey(raw)` would fall back to the
    // generic "could not charge" and, worse, print the server's sentence verbatim.
    refuseWith = 'sales.payments_do_not_match_total';

    await tenderExactCash(el); // sales#309: cash is typed before charging
    await el.confirm();
    await el.updateComplete;

    expect($(el, '.sheet .pay-err')?.textContent).toContain('ui.errorPaymentsMismatch');
    expect($(el, '.sheet .pay-err')?.textContent, 'the raw sentence never reaches the cashier')
      .not.toContain('the operation could not be completed');
  });

  it('a platform refusal at checkout time is explained as the missing app, not as "error"', async () => {
    const el = await withLine();
    el.openPay();
    await el.updateComplete;
    refuseWith = 'module_not_installed';

    await tenderExactCash(el); // sales#309: cash is typed before charging
    await el.confirm();
    await el.updateComplete;

    expect($(el, '.sheet .pay-err')?.textContent).toContain('ui.errorMissingApp');
  });
});

describe('i18n (ADR-0055/0199)', () => {
  it('every string sales#185 adds exists in en AND in es', () => {
    const en = (enLocale as { ui: Record<string, string> }).ui;
    const es = (esLocale as { ui: Record<string, string> }).ui;
    for (const key of ['missingAppCharge', 'missingAppChargeShort', 'appTaxes', 'errorMissingApp']) {
      expect(en[key], `en.ui.${key}`).toBeTruthy();
      expect(es[key], `es.ui.${key}`).toBeTruthy();
    }
    // The app's name is a PARAMETER: the sentence is one string, not one per app.
    expect(en.missingAppCharge).toContain('{app}');
    expect(es.missingAppCharge).toContain('{app}');
  });
});

// sales#201 — the END of the chain, mounted: the code the handler publishes has to become the
// SENTENCE the cashier reads.
//
// The map of `checkout-key.ts` was already right and already tested in isolation; what was missing
// was the producer. The handler refused with `Err("sales.x: …")`, the runtime turned that into
// `RuntimeError::Wasm` and the server flattened it into HTTP 400 with `code: "error"` — so
// `errorCode(e)` read `"error"`, `MESSAGES["error"]` was `undefined` and all 26 mappings fell
// through to the generic «could not charge». Twenty-six different problems, one dead end.
//
// These tests mount the real screen and drive it with the envelope the SDK builds from that
// answer, which is where the two halves finally meet.
describe('4 · sales#201 — the domain code reaches the cashier as its own sentence', () => {
  it('a split whose legs do not add up says SO, not «could not charge»', async () => {
    const el = await withLine();
    el.openPay();
    await el.updateComplete;
    // The exact code `complete_sale` now publishes through `Output.error` when the legs of a mixed
    // payment do not add up to the total the SERVER priced (sales#159, ADR-0386).
    refuseWith = 'sales.payments_do_not_match_total';

    await tenderExactCash(el); // sales#309: cash is typed before charging
    await el.confirm();
    await el.updateComplete;

    const shown = $(el, '.sheet .pay-err')?.textContent ?? '';
    expect(shown, 'the legs are still on screen to be fixed — say which problem it is')
      .toContain('ui.errorPaymentsMismatch');
    expect(shown, 'the generic bucket is what this issue is about').not.toContain('ui.errorCharge');
  });

  it('and so does every other domain code the checkout can be refused with', async () => {
    // One per screen the cashier would have to go and fix it on. Before sales#201 every one of
    // these arrived as `code: "error"` and painted the same dead end.
    const chain: [string, string][] = [
      ['sales.empty_sale', 'ui.errorEmptySale'],
      ['sales.combo_group_unresolved', 'ui.errorComboGroupUnresolved'],
      ['sales.combo_not_on_sale', 'ui.errorComboNotOnSale'],
      ['sales.insufficient_tendered', 'ui.errorInsufficientTendered'],
      ['sales.customer_required', 'ui.errorCustomerRequired'],
      ['sales.too_many_lines', 'ui.errorTooManyLines'],
    ];
    for (const [code, key] of chain) {
      const el = await withLine();
      el.openPay();
      await el.updateComplete;
      refuseWith = code;

      await tenderExactCash(el); // sales#309: cash is typed before charging
      await el.confirm();
      await el.updateComplete;

      expect($(el, '.sheet .pay-err')?.textContent, `${code} → ${key}`).toContain(key);
    }
  });

  it('the flat `error` of the OLD chain is exactly what the cashier could not act on', async () => {
    // The regression net: this is what the screen showed for all 26 codes while the handler
    // refused with an `Err(String)`. If a change ever puts the flat code back, the test above goes
    // red and this one explains why.
    const el = await withLine();
    el.openPay();
    await el.updateComplete;
    refuseWith = 'error';

    await tenderExactCash(el); // sales#309: cash is typed before charging
    await el.confirm();
    await el.updateComplete;

    expect($(el, '.sheet .pay-err')?.textContent).toContain('ui.errorCharge');
  });

  it('every key the code→message map points at exists in en AND in es', async () => {
    const { checkoutErrorKey } = await import('../../lib/checkout-key.js');
    const en = (enLocale as { ui: Record<string, string> }).ui;
    const es = (esLocale as { ui: Record<string, string> }).ui;
    const codes = [
      'sales.empty_sale', 'sales.payment_method_required', 'sales.payment_method_not_available',
      'sales.discounts_not_allowed', 'sales.discount_out_of_range', 'sales.tax_rate_out_of_range',
      'sales.customer_required', 'sales.amount_negative', 'sales.insufficient_tendered',
      'sales.payments_do_not_match_total', 'sales.no_tax_rule', 'sales.tax_catalog_unavailable',
      'sales.idempotency_key_required', 'sales.combo_catalog_unavailable', 'sales.combo_not_available',
      'sales.combo_not_on_sale', 'sales.combo_option_not_available', 'sales.combo_group_unresolved',
      'sales.combo_group_over_max', 'sales.combo_option_repeated', 'sales.combo_component_price_unknown',
      'sales.combo_tax_category_missing', 'sales.too_many_lines',
    ];
    for (const code of codes) {
      const key = checkoutErrorKey(code).replace(/^ui\./, '');
      expect(en[key], `en.ui.${key} (${code})`).toBeTruthy();
      expect(es[key], `es.ui.${key} (${code})`).toBeTruthy();
    }
  });
});
