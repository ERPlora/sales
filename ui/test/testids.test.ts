// A screen the QA robot cannot name is a screen nobody tests (sales#291, out of hub#1756).
//
// The hub's QA drives the POS with Playwright, and Playwright addresses by `data-testid`: it is
// the only hook that survives a copy change, the `en`↔`es` translation (ADR-0055/0199) and the
// Shadow DOM of a Web Component. When a control has none, the spec falls back to a selector by
// text or by `nth` — and both break on their own. That is how 12 points of the restaurant
// checklist for this module were left unverified on 2026-09-09.
//
// This is the guard of the PATTERN, not a patch over one screen. The hub's twin lives in
// `apps/web/src/form-testids.test.ts`; the convention both obey is written once, in
// `architecture/hub/apps/testids.md`: `<surface>-<field|action|state>`, kebab-case, and the rows
// of a list carry their identity at the end (`pos-product-${id}`), never their index.
//
// Two things are NOT copied from the hub's guard, because this repo is not Vue:
//
//   · The surfaces are Lit components (`html` tagged templates inside `.ts`), so there is no
//     `<template>` block to cut: the whole source is the template.
//   · The hub only reads LITERAL hooks, so renaming a COMPUTED one (`login-pin-user-${u.id}`)
//     stays green there and breaks the specs days later, in another repo (reported by the
//     hub#1808 worker on 2026-09-11). Here a computed hook is read too: its static head must live
//     under the surface's prefix and end in `-`, so renaming it breaks HERE.
//
// Three rules, because they stop three different things:
//
//   · COVERAGE — in a registered surface no control and no action is left without a hook. It is
//     what makes the button somebody adds next month born addressable.
//   · CONTRACT — the names the QA writes in its specs are declared here, and the declared set is
//     EXACTLY the one in the file. Renaming a hook has to break THIS test first, here, where it
//     is seen.
//   · RATCHET — every surface with a control or an action is classified: covered, or pending with
//     its issue. A new component cannot slip in unclassified, and the pending list only shrinks.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/** `ui/components/` — where the module's Web Components live. */
const COMPONENTS = join(import.meta.dirname, '..', 'components');

/**
 * Covered surface: `prefix` is the namespace that belongs to it and `contract` is the EXACT set of
 * literal `data-testid` the file declares today.
 *
 * To get in here a screen needs both halves: every control and action hooked (the coverage rule)
 * and its contract written down (the contract rule). Adding a button to one of these forces a
 * change to this list — on purpose: that is the moment somebody decides what that button is going
 * to be called for the rest of the world.
 */
const COVERED: Record<string, { prefix: string; contract: string[] }> = {
  // The departments of the till (`/m/sales/settings`, ADR-0248): the till's own grouping, which
  // is what carries the tax category an open-price sale is charged with. The table's own chrome —
  // add, search, row actions — is not named from here: it belongs to `ok-data-table`
  // (outfitkit#143) and reaches this module when the shared checkout publishes it (sales#297).
  'erp-pos-departments/erp-pos-departments.ts': {
    prefix: 'pos-departments-',
    contract: [
      'pos-departments-delete-cancel',
      'pos-departments-delete-confirm',
      'pos-departments-delete-modal',
      'pos-departments-edit-cancel',
      'pos-departments-form',
      'pos-departments-form-error',
      'pos-departments-load-error',
      'pos-departments-name',
      'pos-departments-no-tax-categories',
      'pos-departments-order',
      'pos-departments-submit',
      'pos-departments-table',
      'pos-departments-tax-category',
    ],
  },
  // The quick notes the business preconfigures for a line ("no onion"), same settings screen and
  // same shape as the departments above.
  'erp-pos-quick-notes/erp-pos-quick-notes.ts': {
    prefix: 'pos-quick-notes-',
    contract: [
      'pos-quick-notes-delete-cancel',
      'pos-quick-notes-delete-confirm',
      'pos-quick-notes-delete-modal',
      'pos-quick-notes-edit-cancel',
      'pos-quick-notes-form',
      'pos-quick-notes-form-error',
      'pos-quick-notes-load-error',
      'pos-quick-notes-order',
      'pos-quick-notes-submit',
      'pos-quick-notes-table',
      'pos-quick-notes-text',
    ],
  },
  // The refund of a charged ticket (`erp-sale-refund`, opened from the sales list and from the
  // POS). Every leg is named by the payment it gives back — `refund-amount-<paymentId>` — because
  // the order of the legs is the order the till charged them in, and a spec that addressed the
  // second box would be refunding a different card the next time.
  'erp-sale-refund/erp-sale-refund.ts': {
    prefix: 'refund-',
    contract: [
      'refund-blocked',
      'refund-confirm',
      'refund-error',
      'refund-form',
      'refund-loading',
      'refund-nothing',
      'refund-propose-all',
      'refund-reason',
      'refund-total',
    ],
  },
  // The till itself (`/m/sales/pos`): the screen a cashier spends the day on, and the one the QA
  // journey of a restaurant and of a salon walks end to end — pick a product, park the check, take
  // it back, discount a line, split the payment, charge. Everything it can be asked to do is a tap,
  // so what is named here is mostly actions, not fields.
  //
  // The rows carry identity, never position: `pos-product-${p.id}`, `pos-line-${l.id}`,
  // `pos-parked-${oc.id}`, `pos-tender-${leg.id}-edit`. A spec that pressed «the second parked
  // check» would be retrieving somebody else's the next morning, and the grid reorders itself
  // every time the catalogue changes.
  //
  // The three numpads answer to `pos-keypad-`, `pos-open-price-key-` and `pos-discount-key-`: the
  // same twelve keys live in three different sheets at once, and one shared name would have
  // `getByTestId` pick at random between the one that types the amount tendered and the one that
  // types the discount.
  'erp-pos-touch/erp-pos-touch.ts': {
    prefix: 'pos-',
    contract: [
      'pos-cart-backdrop', 'pos-cart-close', 'pos-cart-fab',
      'pos-catalog-app-absent', 'pos-catalog-blocked-fix', 'pos-catalog-blocked-summary',
      'pos-category-filter', 'pos-charge', 'pos-check-sales',
      'pos-combo-close', 'pos-combo-confirm', 'pos-combo-scrim',
      'pos-dependency-read-failed',
      'pos-dirty-cancel', 'pos-dirty-discard', 'pos-dirty-park',
      'pos-fiscal-certificate-expiring', 'pos-fiscal-certificate-renew',
      'pos-fiscal-road', 'pos-fiscal-road-fix',
      'pos-discount-apply', 'pos-discount-apply-amount', 'pos-discount-close',
      'pos-discount-mode', 'pos-discount-mode-amount', 'pos-discount-mode-percent',
      'pos-discount-remove', 'pos-discount-scrim',
      'pos-invoice-recipient-capture',
      'pos-limit-address', 'pos-limit-country', 'pos-limit-id-type', 'pos-limit-name', 'pos-limit-tax-id',
      'pos-line-staff',
      'pos-modifier-close', 'pos-modifier-confirm', 'pos-modifier-scrim',
      'pos-more-fullscreen', 'pos-more-menu', 'pos-more-scrim',
      'pos-needs-customer',
      'pos-note-close', 'pos-note-input', 'pos-note-remove', 'pos-note-save', 'pos-note-scrim',
      'pos-open-price-add', 'pos-open-price-close', 'pos-open-price-scrim', 'pos-open-price-tile',
      'pos-order-title', 'pos-order-title-edit',
      'pos-park', 'pos-park-cancel', 'pos-park-confirm', 'pos-park-current', 'pos-park-name',
      'pos-parked-backdrop', 'pos-parked-toggle',
      'pos-pay-add-tender', 'pos-pay-close', 'pos-pay-confirm', 'pos-pay-scrim', 'pos-pay-split',
      'pos-prebill', 'pos-prebill-close', 'pos-prebill-print', 'pos-print-on-charge',
      'pos-search', 'pos-simplified-limit-capture',
      'pos-staff-cancel', 'pos-staff-chip', 'pos-staff-empty', 'pos-staff-error',
      'pos-staff-loading', 'pos-staff-option', 'pos-staff-option-me', 'pos-staff-team-error',
      'pos-ticket-discount',
      'pos-view-tab-account', 'pos-view-tab-draft', 'pos-view-tabs',
    ],
  },
  // The sales list (`/m/sales`): the date range, the six KPIs of the day and the table of tickets.
  // It is the screen a QA journey checks the till against after charging, so the KPI values carry
  // a hook too — reading them by position broke the moment the sixth card was added.
  'erp-sales-list/erp-sales-list.ts': {
    prefix: 'sales-',
    contract: [
      'sales-kpi-avg-ticket',
      'sales-kpi-discounts',
      'sales-kpi-revenue',
      'sales-kpi-tax',
      'sales-kpi-tickets',
      'sales-kpi-voided',
      'sales-list-error',
      'sales-pay-methods-error',
      'sales-range',
      'sales-refund-modal',
      'sales-stats-error',
      'sales-table',
    ],
  },
};

/**
 * Surfaces with controls or actions that do not carry hooks yet, each with the issue that asks for
 * them. The list can only SHRINK: when one is completed it leaves here and goes up (the stale-entry
 * test fails if it stays). A new component is not born in this list — it is born covered.
 */
const NOT_YET_COVERED: Record<string, string> = {};

/**
 * How many surfaces are pending TODAY. This number ONLY GOES DOWN. Without it the pending list is
 * a list of excuses: a new component walks in with a decorative issue number and the guard stays
 * green. With the count nailed down, adding one forces raising it by hand, on a line whose comment
 * says it is not raised.
 */
const PENDING_TODAY = 0;

/** What a person fills in. Buttons are not here: actions have their own rule below. */
const CONTROL_TAGS = [
  'ion-input',
  'ion-select',
  'ion-textarea',
  'ion-toggle',
  'ion-checkbox',
  'ion-searchbar',
  'ion-segment',
  'ion-radio-group',
  'ion-datetime',
  'ion-range',
  'input',
  'select',
  'textarea',
] as const;

/**
 * What a person presses. In a POS the buttons ARE the screen — charging, parking a check, opening
 * the discount sheet, tapping a product tile — so unlike the hub's guard the actions are covered
 * too, not merely declared in the contract.
 *
 * A product tile is an `<ion-card button>` and the cart drawer's scrim is a `<div @click>`, so the
 * tag list alone would miss exactly the two taps a QA journey starts with: pick a product, close
 * the drawer. Anything carrying `@click` counts.
 */
const ACTION_TAGS = ['ion-button', 'button', 'ion-fab-button', 'ion-segment-button'] as const;

const ANY_TAG = /<([a-z][a-z0-9-]*)(?=[\s/>])/g;

/**
 * The `>` that closes the opening tag, skipping the ones that are not markup: those inside quotes
 * and those inside an interpolation.
 *
 * In a Lit template `${...}` is JavaScript, and this component's JavaScript is full of `>`: every
 * arrow of a handler (`@click=${() => this.add(p)}`) and every generic (`CustomEvent<{ value?:
 * string }>`). Stopping at the first one reads a quarter of the tag and drops the rest of the
 * attributes — including, silently, an `@click` that happens to be written after another handler.
 */
function openTag(source: string, start: number): string {
  let quote: string | null = null;
  for (let i = start; i < source.length; i++) {
    const c = source[i];
    if (quote) {
      if (c === quote) quote = null;
      continue;
    }
    if (c === '$' && source[i + 1] === '{') {
      const body = braced(source, i);
      if (body !== undefined) {
        i += body.length + 2; // `${` + body + the `}` the loop's own step walks past
        continue;
      }
    }
    if (c === '"' || c === "'") quote = c;
    else if (c === '>') return source.slice(start, i + 1);
  }
  return source.slice(start);
}

/**
 * Prose out. The comments in these components talk ABOUT the markup — they name `data-testid`,
 * quote old names, and one of them explains that Ionic moves the aria attributes to the `<button>`
 * inside its shadow root. Read as markup, that sentence is an action with no hook and the coverage
 * rule reports a button that does not exist.
 *
 * A block comment is only cut when its `/ *` opens the line, which is how every comment in this
 * repo is written. Matching one mid-line would risk swallowing live template — and a swallowed
 * chunk is not a loud failure, it is a control nobody checks.
 */
function withoutComments(source: string): string {
  return source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '')
    .split('\n')
    .map((line) => (/^\s*\/\//.test(line) ? '' : line))
    .join('\n');
}

/** A hook as it is written: literal (`"pos-charge"`) or computed (`` ${`pos-product-${id}`} ``). */
type Hook = { literal?: string; head?: string };

/**
 * Every `data-testid` of a source, in the three shapes Lit writes one: `="name"`, `=${`head-${x}`}`
 * and `="${x}"`. For a computed one what is kept is its STATIC HEAD — the part before the first
 * interpolation — which is what the prefix rule can hold on to.
 */
function hooks(source: string): Hook[] {
  const found: Hook[] = [];
  const re = /(?<![\w-])data-testid\s*=\s*/g;
  for (let m = re.exec(source); m; m = re.exec(source)) {
    const at = m.index + m[0].length;
    const raw = source[at] === '"' || source[at] === "'" ? quoted(source, at) : braced(source, at);
    if (raw === undefined) continue;
    const cut = raw.indexOf('${');
    if (cut === -1 && !raw.startsWith('`')) found.push({ literal: raw });
    else found.push({ head: staticHead(raw) });
  }
  return found;
}

/** The body of `"…"`, without the quotes. */
function quoted(source: string, at: number): string | undefined {
  const end = source.indexOf(source[at], at + 1);
  return end === -1 ? undefined : source.slice(at + 1, end);
}

/** The body of `${…}`, with nested braces balanced so a `${}` inside a template literal survives. */
function braced(source: string, at: number): string | undefined {
  if (source[at] !== '$' || source[at + 1] !== '{') return undefined;
  let depth = 0;
  for (let i = at + 1; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}' && --depth === 0) return source.slice(at + 2, i);
  }
  return undefined;
}

/** The static text a computed hook starts with: `` `pos-product-${id}` `` → `pos-product-`. */
function staticHead(raw: string): string {
  const body = raw.trim().startsWith('`') ? raw.trim().slice(1) : raw;
  const cut = body.search(/\$\{|`/);
  return cut === -1 ? '' : body.slice(0, cut);
}

/** Carries a hook, literal or computed. */
const hasHook = (open: string): boolean => /(?<![\w-])data-testid\s*=/.test(open);

type Element = { tag: string; line: number; open: string };

function elements(source: string): Element[] {
  const clean = withoutComments(source);
  const found: Element[] = [];
  ANY_TAG.lastIndex = 0;
  for (let m = ANY_TAG.exec(clean); m; m = ANY_TAG.exec(clean)) {
    found.push({
      tag: m[1],
      line: clean.slice(0, m.index).split('\n').length,
      open: openTag(clean, m.index),
    });
  }
  return found;
}

const isControl = (el: Element): boolean => (CONTROL_TAGS as readonly string[]).includes(el.tag);

const isAction = (el: Element): boolean =>
  (ACTION_TAGS as readonly string[]).includes(el.tag) || /@click\s*=/.test(el.open);

/** Everything the QA has to name on a surface: what it fills in and what it presses. */
const addressable = (source: string): Element[] =>
  elements(source).filter((el) => isControl(el) || isAction(el));

const unhooked = (source: string): string[] =>
  addressable(source)
    .filter((el) => !hasHook(el.open))
    .map((el) => `<${el.tag}> line ${el.line}`);

/** Kebab-case: lowercase and digits separated by a single hyphen. */
const KEBAB = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

function componentFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) componentFiles(full, found);
    else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) found.push(full);
  }
  return found;
}

const SURFACES: Array<{ name: string; source: string }> = componentFiles(COMPONENTS)
  .map((full) => ({ name: relative(COMPONENTS, full), source: readFileSync(full, 'utf8') }))
  .sort((a, b) => a.name.localeCompare(b.name));

const sourceOf = (name: string): string =>
  SURFACES.find((s) => s.name === name)?.source ?? '';

const literalsOf = (name: string): string[] =>
  hooks(withoutComments(sourceOf(name)))
    .map((h) => h.literal)
    .filter((v): v is string => v !== undefined);

const headsOf = (name: string): string[] =>
  hooks(withoutComments(sourceOf(name)))
    .map((h) => h.head)
    .filter((v): v is string => v !== undefined);

describe('data-testid — the module UI convention (sales#291)', () => {
  it('every literal data-testid is kebab-case', () => {
    const offenders: string[] = [];
    for (const { name } of SURFACES) {
      for (const value of literalsOf(name)) {
        if (!KEBAB.test(value)) offenders.push(`${name}: "${value}"`);
      }
    }
    expect(offenders, 'a name that is not kebab-case breaks what the QA can predict').toEqual([]);
  });

  it('no literal data-testid is repeated in two surfaces', () => {
    const owners = new Map<string, string[]>();
    for (const { name } of SURFACES) {
      for (const value of new Set(literalsOf(name))) {
        owners.set(value, [...(owners.get(value) ?? []), name]);
      }
    }
    const shared = [...owners]
      .filter(([, files]) => files.length > 1)
      .map(([value, files]) => `"${value}" in ${files.join(' + ')}`);
    expect(shared, 'getByTestId would return two elements and the spec would pick at random').toEqual([]);
  });

  it('a covered surface leaves no control and no action without a hook', () => {
    const offenders: string[] = [];
    for (const name of Object.keys(COVERED)) {
      expect(SURFACES.some((s) => s.name === name), `${name} is in COVERED but does not exist`).toBe(true);
      for (const el of unhooked(sourceOf(name))) offenders.push(`${name}: ${el}`);
    }
    expect(offenders, 'Playwright cannot fill in or press what has no data-testid').toEqual([]);
  });

  it('the declared contract is EXACTLY the one in the surface', () => {
    const drift: string[] = [];
    for (const [name, spec] of Object.entries(COVERED)) {
      const found = [...new Set(literalsOf(name))].sort();
      const declared = [...spec.contract].sort();
      for (const missing of declared.filter((v) => !found.includes(v))) {
        drift.push(`${name}: the contract declares "${missing}" and the surface no longer has it`);
      }
      for (const extra of found.filter((v) => !declared.includes(v))) {
        drift.push(`${name}: the surface has "${extra}" and the contract does not declare it`);
      }
    }
    expect(drift, 'renaming a data-testid breaks the QA suite: declare it here').toEqual([]);
  });

  it('every literal data-testid lives in its surface namespace', () => {
    const offenders: string[] = [];
    for (const [name, spec] of Object.entries(COVERED)) {
      if (!spec.prefix) continue;
      for (const value of new Set(literalsOf(name))) {
        if (!value.startsWith(spec.prefix)) offenders.push(`${name}: "${value}" ≠ ${spec.prefix}*`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('a COMPUTED data-testid also lives in its namespace and keeps its identity at the end', () => {
    // This is the hole the hub's guard has and the hub#1808 worker hit: over there only the
    // literals are read, so renaming `login-pin-user-${u.id}` stays green and the specs that use
    // it break days later, in another repo. A computed hook is a contract just the same.
    const offenders: string[] = [];
    for (const [name, spec] of Object.entries(COVERED)) {
      for (const head of headsOf(name)) {
        if (head === '') {
          offenders.push(`${name}: a data-testid with no static head cannot be predicted by a spec`);
        } else if (spec.prefix && !head.startsWith(spec.prefix)) {
          offenders.push(`${name}: "${head}\${…}" ≠ ${spec.prefix}*`);
        } else if (!head.endsWith('-')) {
          offenders.push(`${name}: "${head}\${…}" glues the identity onto the name: end it with "-"`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('every surface with a control or an action is classified: covered, or with its issue', () => {
    const unclassified = SURFACES.filter(
      ({ name, source }) =>
        addressable(source).length > 0 && !(name in COVERED) && !(name in NOT_YET_COVERED),
    ).map(({ name }) => name);
    expect(
      unclassified,
      'a new component is born with data-testid — or enters NOT_YET_COVERED with its issue',
    ).toEqual([]);
  });

  it('a pending surface that is already complete does not stay in the pending list', () => {
    const stale = Object.keys(NOT_YET_COVERED).filter(
      (name) => SURFACES.some((s) => s.name === name) && unhooked(sourceOf(name)).length === 0,
    );
    expect(stale, 'it already has every hook: move it to COVERED with its contract').toEqual([]);
  });

  it('the pending list only shrinks: a new surface is born covered, not pending', () => {
    const pending = Object.keys(NOT_YET_COVERED).length;
    expect(
      pending,
      pending > PENDING_TODAY
        ? 'a new surface does not enter NOT_YET_COVERED: hook it up and move it to COVERED'
        : `a pending surface left the list: lower PENDING_TODAY to ${pending}`,
    ).toBe(PENDING_TODAY);
  });

  it('the pending list does not name surfaces that no longer exist', () => {
    const ghosts = Object.keys(NOT_YET_COVERED).filter(
      (name) => !SURFACES.some((s) => s.name === name),
    );
    expect(ghosts).toEqual([]);
  });

  it('every pending surface cites a real issue, not a placeholder', () => {
    // A pending surface with no issue is a pending surface nobody does: the register above reads
    // like a plan, and a `repo#PENDING-something` turns it into a list of good intentions that
    // never reaches the board. Exact shape `repo#N` so it can be opened from here.
    const placeholders = Object.entries(NOT_YET_COVERED)
      .filter(([, issue]) => !/^[a-z][a-z0-9_-]*#\d+$/.test(issue))
      .map(([name, issue]) => `${name}: "${issue}"`);
    expect(placeholders, 'open the issue and put its number: the board does not pick up a hole').toEqual([]);
  });
});

describe('the guard reads a Lit open tag, not a JavaScript one (sales#291)', () => {
  // The rules above are only worth what the reader underneath them sees. In a Lit template an
  // attribute value is JavaScript — `@click=${() => this.add(p)}`, `@ionChange=${(e:
  // CustomEvent<{ value?: string }>) => …}` — and that JavaScript is FULL of `>`: every arrow, every
  // generic. A reader that closes the tag at the first `>` stops inside the first handler and
  // never sees the rest of the attributes.
  //
  // That cuts both ways, and one of the two is silent: an element whose `@click` comes after
  // another interpolated attribute is not recognised as an action at all, so the coverage rule
  // never demands a hook for it — a button nobody has to name, reported by nobody. These sources
  // are synthetic on purpose: today's components happen not to be written that way, and a guard
  // that only works on the shapes that exist today is a guard that breaks on the next component.

  it('sees an @click that comes after another interpolated handler', () => {
    const source = `html\`<div class="pdrop-back" @wheel=\${(e: WheelEvent) => this.spin(e)} @click=\${() => { this.parkedOpen = false; }}></div>\``;
    expect(
      addressable(source).map((el) => el.tag),
      'the arrow of the first handler is not the end of the tag: that div is a tap',
    ).toEqual(['div']);
  });

  it('sees an @click that comes after an attribute holding a generic', () => {
    // A `div` on purpose: an `ion-segment` is a control and would be demanded a hook anyway, so it
    // would prove nothing about the reader.
    const source = `html\`<div @ionChange=\${(e: CustomEvent<{ value?: string }>) => this.pick(e)} @click=\${() => this.focus()}></div>\``;
    expect(
      addressable(source).map((el) => el.tag),
      'the `>` closing a generic is not the `>` closing the tag',
    ).toEqual(['div']);
  });

  it('sees a data-testid that comes after the handler', () => {
    const source = `html\`<ion-button @click=\${() => this.confirm()} data-testid="pos-charge"></ion-button>\``;
    expect(
      unhooked(source),
      'the hook is there: reporting it as missing sends the author to add a second one',
    ).toEqual([]);
  });

  it('still closes the tag at its own `>`, not at a later one', () => {
    const source = `html\`<ion-input data-testid="pos-park-name"></ion-input><ion-button @click=\${() => this.go()}></ion-button>\``;
    expect(
      unhooked(source),
      'the input is hooked and the button is not: bleeding past the tag would hide one of the two',
    ).toEqual(['<ion-button> line 1']);
  });
});
