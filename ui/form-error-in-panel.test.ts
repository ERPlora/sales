// pm#513 (out of pm#478) — on a phone or a tablet, a refused save in «Quick notes» or «Departments»
// showed NOTHING: the person pressed «Add»/«Save» and the sheet stayed as it was.
//
// The refusal did arrive; it was painted in the wrong place. The form lives in the `create` panel of
// the `ok-data-table`, and under 834 px that panel is a FULL-SCREEN sheet (outfitkit#75). The notice
// was a child of the PAGE, so on a phone it sat under the sheet, out of sight (bench: hub:stable
// 1.1.30, 390/820/1440 px, ios and md: 2 of 6 visible on each screen, only the desktop ones). A
// refused DELETE was visible 6 of 6: the confirmation closes and no panel is open then.
//
// The rule, the same one cart_checkout#31 / tasks#47 / tickets#43 follow:
//
//   · what goes wrong while SAVING the form is painted INSIDE that form, above the button that was
//     pressed, and scrolled into view once — not again on every keystroke (rv-reservations-73);
//   · what goes wrong OUTSIDE the save stays on the PAGE, above the list: a refused delete and a
//     list that does not load (rv-appointments-227, rv-taxes-81). A notice inside a closed panel is
//     just as invisible as one under an open panel.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dataTableShowsLoadError } from '@erplora/module-sdk';
import { installErploraDouble } from './test/erplora-double';
import './components/erp-pos-quick-notes/erp-pos-quick-notes';
import './components/erp-pos-departments/erp-pos-departments';

type Wc = HTMLElement & { shadowRoot: ShadowRoot; updateComplete: Promise<unknown> } & Record<string, any>;

interface Screen {
  tag: string;
  list: string;
  del: string;
  prefix: string;
  rows: Record<string, unknown>[];
  /** Fills the form with something that can be saved. */
  fill(el: Wc, text: string): void;
  /** Types in a field other than the first one, as a person correcting the form does. */
  typeElsewhere(el: Wc): void;
  saveFailed: string;
  deleteFailed: string;
}

const SCREENS: Screen[] = [
  {
    tag: 'erp-pos-quick-notes',
    list: 'sales.quick_notes.list',
    del: 'sales.quick_notes.delete',
    prefix: 'pos-quick-notes',
    rows: [
      { id: 'qn-1', text: 'Sin cebolla', sort_order: 1 },
      { id: 'qn-2', text: 'Poco hecho', sort_order: 2 },
    ],
    fill: (el, text) => { el.newText = text; },
    typeElsewhere: (el) => { el.newSortOrder = '7'; },
    saveFailed: 'ui.quickNoteSaveFailed',
    deleteFailed: 'ui.quickNoteDeleteFailed',
  },
  {
    tag: 'erp-pos-departments',
    list: 'sales.departments.list',
    del: 'sales.departments.delete',
    prefix: 'pos-departments',
    rows: [
      { id: 'd-veg', name: 'Frutas y verduras', tax_category_key: 'product.super_reduced', sort_order: 10 },
      { id: 'd-clean', name: 'Droguería', tax_category_key: 'product.generic', sort_order: 20 },
    ],
    fill: (el, text) => { el.newName = text; el.newTaxCategoryKey = 'product.generic'; },
    typeElsewhere: (el) => { el.newSortOrder = '7'; },
    saveFailed: 'ui.departmentSaveFailed',
    deleteFailed: 'ui.departmentDeleteFailed',
  },
];

let refuse = false;
/** When set, the next command waits on it: lets a test look at the screen while it is in flight. */
let hold: Promise<void> | null = null;
let loadFails = false;
/** How many times the list was read: an action that goes through reloads it. */
let reads = 0;
/** Every element the component scrolled into view. */
let revealed: Element[] = [];
/** Whether each revealed element had already painted itself when it was scrolled to. */
let paintedWhenRevealed: boolean[] = [];

function install(s: Screen): void {
  installErploraDouble({
    queries: {
      [s.list]: () => {
        reads++;
        if (loadFails) throw new Error('boom');
        return s.rows;
      },
      'taxes.categories.list': [
        { key: 'product.generic', name: 'Product — generic', display_name: 'Producto — general', is_active: 1 },
      ],
      'taxes.rules.list': [],
    },
    pageSize: 50,
    command: async () => {
      const wait = hold;
      if (wait) await wait;
      if (refuse) throw new Error('refused');
      return {};
    },
    locale: 'es',
    t: (_c: Record<string, unknown>, key: string) => key,
  });
}

beforeEach(() => {
  refuse = false;
  hold = null;
  loadFails = false;
  reads = 0;
  revealed = [];
  paintedWhenRevealed = [];
  vi.restoreAllMocks();
  vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(function (this: HTMLElement) {
    revealed.push(this);
    // ok-inline-feedback lays itself out in its own update: scrolled to before it, a phone scrolls to
    // an empty, zero-height box and the notice ends up off the sheet anyway (online_booking#33).
    paintedWhenRevealed.push((this as unknown as { hasUpdated?: boolean }).hasUpdated !== false);
  });
});

async function settle(el: Wc): Promise<void> {
  for (let i = 0; i < 3; i++) {
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
  }
}

async function mount(s: Screen): Promise<Wc> {
  install(s);
  document.body.innerHTML = '';
  const el = document.createElement(s.tag) as Wc;
  document.body.appendChild(el);
  await settle(el);
  return el;
}

const submitEvent = (): Event => new Event('submit', { cancelable: true });

const CREATE = 'form[slot="create"]';

/** The notice inside `scope`, or null. */
const inside = (el: Wc, scope: string, testid: string): Element | null =>
  el.shadowRoot.querySelector(`${scope} [data-testid="${testid}"]`);

/** Every place a notice with `text` is painted in, by where it sits. */
function whereIs(el: Wc, text: string): string[] {
  return [...el.shadowRoot.querySelectorAll('ok-inline-feedback')]
    .filter((n) => n.textContent?.trim() === text)
    .map((n) => (n.closest(CREATE) ? 'panel' : 'page'));
}

/** The notice sits above the submit button of its form. */
function aboveTheButton(form: Element, testid: string): boolean {
  const kids = [...form.children];
  const notice = kids.findIndex((k) => k.getAttribute('data-testid') === testid);
  const button = kids.findIndex((k) => k.tagName === 'ION-BUTTON' && k.getAttribute('type') === 'submit');
  return notice >= 0 && button >= 0 && notice < button;
}

async function refusedSave(s: Screen, el: Wc, text = 'Nueva'): Promise<void> {
  s.fill(el, text);
  refuse = true;
  await el.save(submitEvent());
  await settle(el);
}

async function deleteRow(el: Wc, row: Record<string, unknown>): Promise<void> {
  el.deleteTarget = row;
  await settle(el);
  await el.confirmDelete();
  await settle(el);
}

async function editRow(el: Wc, row: Record<string, unknown>): Promise<void> {
  await el.onRowAction({ detail: { actionId: 'edit', row } });
  await settle(el);
}

for (const s of SCREENS) {
  const FORM_ERROR = `${s.prefix}-form-error`;
  const PAGE_ERROR = `${s.prefix}-error`;

  describe(`pm#513 · ${s.tag}: a refused save is shown INSIDE the panel form`, () => {
    it('lands in the form, painted and scrolled into view — nothing on the page under the sheet', async () => {
      const el = await mount(s);
      await refusedSave(s, el);
      const notice = inside(el, CREATE, FORM_ERROR);
      expect(notice, 'on a phone the panel covers the page: the refusal has to travel with the form').not.toBeNull();
      expect(notice?.textContent?.trim()).toBe(s.saveFailed);
      expect(revealed, 'and it is scrolled into view').toEqual([notice]);
      expect(paintedWhenRevealed, 'once it has painted itself').toEqual([true]);
      expect(whereIs(el, s.saveFailed)).toEqual(['panel']);
    });

    it('a refused EDIT lands in the same form (the submit decides create vs update)', async () => {
      const el = await mount(s);
      await editRow(el, s.rows[0]);
      refuse = true;
      await el.save(submitEvent());
      await settle(el);
      expect(whereIs(el, s.saveFailed)).toEqual(['panel']);
    });

    it('sits above the button that was pressed', async () => {
      const el = await mount(s);
      await refusedSave(s, el);
      expect(aboveTheButton(el.shadowRoot.querySelector(CREATE)!, FORM_ERROR)).toBe(true);
    });

    it('is revealed once, not again on every keystroke while the person corrects the form', async () => {
      const el = await mount(s);
      await refusedSave(s, el);
      revealed = [];
      s.fill(el, 'Nueva 2');
      await settle(el);
      s.typeElsewhere(el);
      await settle(el);
      expect(inside(el, CREATE, FORM_ERROR), 'the refusal is still there').not.toBeNull();
      expect(revealed, 'but the sheet stays where the person is typing').toEqual([]);
    });

    it('pressing it again and being refused again reveals the refusal again', async () => {
      const el = await mount(s);
      await refusedSave(s, el);
      revealed = [];
      await el.save(submitEvent());
      await settle(el);
      expect(revealed).toEqual([inside(el, CREATE, FORM_ERROR)]);
    });

    it('while the new attempt is being saved, the previous refusal is already gone', async () => {
      const el = await mount(s);
      await refusedSave(s, el);
      refuse = false;
      let release!: () => void;
      hold = new Promise((r) => (release = r));
      const attempt = el.save(submitEvent());
      await settle(el);
      expect(inside(el, CREATE, FORM_ERROR)).toBeNull();
      release();
      await attempt;
    });

    it('a save that goes through reloads the list and also clears the page notice of an earlier refused delete', async () => {
      const el = await mount(s);
      refuse = true;
      await deleteRow(el, s.rows[0]);
      expect(whereIs(el, s.deleteFailed)).toEqual(['page']);
      refuse = false;
      const before = reads;
      s.fill(el, 'Nueva');
      await el.save(submitEvent());
      await settle(el);
      expect(whereIs(el, s.deleteFailed)).toEqual([]);
      expect(reads, 'the new row would not show up').toBe(before + 1);
    });

    it('a refusal does not travel to another row opened for editing (rv-tickets-43)', async () => {
      const el = await mount(s);
      await editRow(el, s.rows[0]);
      refuse = true;
      await el.save(submitEvent());
      await settle(el);
      expect(whereIs(el, s.saveFailed)).toEqual(['panel']);
      await editRow(el, s.rows[1]);
      expect(whereIs(el, s.saveFailed)).toEqual([]);
    });
  });

  describe(`pm#513 · ${s.tag}: what goes wrong OUTSIDE the save stays on the page (rv-appointments-227)`, () => {
    it('a refused delete is shown on the page, above the list — not in the (closed) panel', async () => {
      const el = await mount(s);
      refuse = true;
      await deleteRow(el, s.rows[0]);
      const notice = inside(el, '.page', PAGE_ERROR);
      expect(notice?.textContent?.trim()).toBe(s.deleteFailed);
      expect(whereIs(el, s.deleteFailed)).toEqual(['page']);
      expect(inside(el, CREATE, FORM_ERROR)).toBeNull();
      // Above the table: at the end of the page, under the whole list (cards on a phone), it is not
      // seen either (rv-taxes-81).
      const table = el.shadowRoot.querySelector('ok-data-table')!;
      expect(notice!.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('a new delete clears the previous refusal while it runs', async () => {
      const el = await mount(s);
      refuse = true;
      await deleteRow(el, s.rows[0]);
      refuse = false;
      let release!: () => void;
      hold = new Promise((r) => (release = r));
      el.deleteTarget = s.rows[1];
      await settle(el);
      const attempt = el.confirmDelete();
      await settle(el);
      expect(whereIs(el, s.deleteFailed)).toEqual([]);
      release();
      await attempt;
    });

    it('a delete does not wipe a refusal the person is still reading in the form', async () => {
      const el = await mount(s);
      await refusedSave(s, el);
      refuse = false;
      await deleteRow(el, s.rows[1]);
      expect(whereIs(el, s.saveFailed)).toEqual(['panel']);
    });

    it('a delete that goes through reloads the list (rv-tasks-47)', async () => {
      const el = await mount(s);
      const before = reads;
      await deleteRow(el, s.rows[0]);
      expect(reads, 'the deleted row would stay on the list').toBe(before + 1);
    });

    it('a list that does not load is shown on the page, not in the form', async () => {
      loadFails = true;
      const el = await mount(s);
      // pm#533: a shell table that paints the failure (OutfitKit ≥ 0.1.113) says it on the page with
      // the reason, and the screen adds no notice; on an older shell the screen's notice does, and
      // ui/test/list-load-error.test.ts forces that shell to check it stays out of the panel.
      if (dataTableShowsLoadError()) {
        expect((el.shadowRoot.querySelector('ok-data-table') as unknown as { error?: unknown }).error).toBe('boom');
        expect(inside(el, '.page', `${s.prefix}-load-error`)).toBeNull();
      } else {
        expect(inside(el, '.page', `${s.prefix}-load-error`)).not.toBeNull();
      }
      expect(inside(el, CREATE, FORM_ERROR)).toBeNull();
      expect(revealed).toEqual([]);
    });
  });
}

describe('pm#513 · erp-pos-departments: the «no VAT picked» guard speaks in the form too', () => {
  it('is painted inside the form and revealed, without calling the server', async () => {
    const s = SCREENS[1];
    const el = await mount(s);
    el.newName = 'Carnicería';
    el.newTaxCategoryKey = '';
    await el.save(submitEvent());
    await settle(el);
    const notice = inside(el, CREATE, 'pos-departments-form-error');
    expect(notice?.textContent?.trim()).toBe('ui.departmentTaxCategoryMissing');
    expect(revealed).toEqual([notice]);
    expect(whereIs(el, 'ui.departmentTaxCategoryMissing')).toEqual(['panel']);
  });
});
