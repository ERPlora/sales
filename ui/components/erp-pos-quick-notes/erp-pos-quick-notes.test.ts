// sales#206 — the screen where the business writes its quick notes (Lightspeed's Back Office
// panel: add, edit, delete and reorder, and the POS shows them in that order).
//
// It is NOT a new kind of screen: it is the CRUD every catalogue of the fleet already uses — an
// `ok-data-table` where «+» opens the create panel, the row action «edit» pre-fills the SAME form
// and «delete» confirms before it runs (`services.categories`, `inventory.categories`,
// `modifiers.groups`). Reusing it is what gives loading, empty, search and the phone/tablet/desktop
// layouts for free, instead of a fourth hand-rolled list.
import { beforeEach, describe, expect, it } from 'vitest';

const ROWS = [
  { id: 'qn-1', text: 'medium rare', sort_order: 10 },
  { id: 'qn-2', text: 'no salt', sort_order: 20 },
];
const commands: { name: string; payload: Record<string, unknown> }[] = [];
let sdk: Record<string, unknown>;
let pageFails = false;

beforeEach(() => {
  commands.length = 0;
  pageFails = false;
  sdk = {
    query: async () => [],
    queryPage: async () => {
      if (pageFails) throw new Error('boom');
      return { rows: ROWS, total: ROWS.length };
    },
    queryAll: async (name: string) => (name === 'sales.quick_notes.list' ? ROWS : []),
    command: async (name: string, payload: Record<string, unknown>) => {
      commands.push({ name, payload });
      return {};
    },
    on: () => () => {},
    hasPermission: () => true,
    locale: 'en',
    t: (_c: unknown, key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
  };
  (globalThis as Record<string, unknown>).erplora = sdk;
});

type Mounted = HTMLElement & {
  shadowRoot: ShadowRoot;
  updateComplete: Promise<unknown>;
  actions: { id: string }[];
  editingId: string | null;
  newText: string;
  newSortOrder: string;
  formError: string;
  onRowAction(ev: CustomEvent<{ actionId: string; row: Record<string, unknown> }>): Promise<void>;
  save(ev: Event): Promise<void>;
  confirmDelete(): Promise<void>;
};

async function mount(): Promise<Mounted> {
  document.body.innerHTML = '';
  await import('./erp-pos-quick-notes');
  const el = document.createElement('erp-pos-quick-notes') as unknown as Mounted;
  document.body.appendChild(el);
  await el.updateComplete;
  await new Promise((r) => setTimeout(r, 0));
  await el.updateComplete;
  return el;
}
const settle = async (el: Mounted) => {
  await new Promise((r) => setTimeout(r, 0));
  await el.updateComplete;
};
const action = (el: Mounted, actionId: string, row: Record<string, unknown> = ROWS[0]) =>
  el.onRowAction(new CustomEvent('rowAction', { detail: { actionId, row } }));
const table = (el: Mounted) =>
  el.shadowRoot.querySelector('ok-data-table') as (HTMLElement & {
    addable: boolean;
    rows: Record<string, unknown>[];
    emptyMessage: string;
  }) | null;

describe('the list', () => {
  it('shows what the business configured, through the till’s own read', async () => {
    const el = await mount();
    expect(table(el)?.rows).toEqual(ROWS);
  });

  it('is empty-stated, not blank, when nothing is configured yet', async () => {
    sdk.queryPage = async () => ({ rows: [], total: 0 });
    const el = await mount();
    expect(table(el)?.rows).toEqual([]);
    expect(table(el)?.emptyMessage).toBe('ui.quickNotesEmpty');
  });

  it('says so when the read fails instead of showing an empty catalogue', async () => {
    pageFails = true;
    const el = await mount();
    await settle(el);
    expect(el.shadowRoot.querySelector('ok-inline-feedback')).toBeTruthy();
  });
});

describe('the CRUD lives inside the data-table', () => {
  it('the table is addable and the form is projected in its `create` slot', async () => {
    const el = await mount();
    expect(table(el)?.addable).toBe(true);
    expect(el.shadowRoot.querySelector('form[slot="create"]')?.closest('ok-data-table')).toBeTruthy();
  });

  it('the actions follow the permission — read-only for whoever cannot configure the till', async () => {
    let el = await mount();
    expect(el.actions.map((a) => a.id)).toEqual(['edit', 'delete']);
    el.remove();
    sdk.hasPermission = (p: string) => p === 'sales.view_sale';
    el = await mount();
    expect(el.actions).toEqual([]);
    expect(table(el)?.addable, 'no «+» without sales.manage_settings').toBe(false);
  });
});

describe('create · edit · delete', () => {
  it('creates with the text and the position it will hold at the till', async () => {
    const el = await mount();
    el.newText = 'no ice';
    el.newSortOrder = '30';
    await el.save(new Event('submit'));
    expect(commands).toEqual([
      { name: 'sales.quick_notes.create', payload: { text: 'no ice', sort_order: 30 } },
    ]);
  });

  it('refuses to create an EMPTY note — a blank chip is a chip nobody can name', async () => {
    const el = await mount();
    el.newText = '   ';
    await el.save(new Event('submit'));
    expect(commands).toEqual([]);
  });

  it('trims what it stores, so a stray space does not widen the chip', async () => {
    const el = await mount();
    el.newText = '  no ice  ';
    await el.save(new Event('submit'));
    expect(commands[0].payload).toEqual({ text: 'no ice', sort_order: 0 });
  });

  it('edit pre-fills the SAME form and the submit updates by id', async () => {
    const el = await mount();
    await action(el, 'edit', ROWS[1]);
    await settle(el);
    expect(el.editingId).toBe('qn-2');
    expect(el.newText).toBe('no salt');
    expect(el.newSortOrder).toBe('20');
    el.newText = 'no salt at all';
    await el.save(new Event('submit'));
    expect(commands).toEqual([
      {
        name: 'sales.quick_notes.update',
        payload: { quick_note_id: 'qn-2', text: 'no salt at all', sort_order: 20 },
      },
    ]);
    expect(el.editingId).toBeNull();
  });

  it('delete confirms first and only then runs the command', async () => {
    const el = await mount();
    await action(el, 'delete', ROWS[0]);
    await settle(el);
    expect(commands, 'nothing on the first tap').toEqual([]);
    const modal = el.shadowRoot.querySelector('ion-modal') as (HTMLElement & { isOpen: boolean }) | null;
    expect(modal?.isOpen).toBe(true);
    await el.confirmDelete();
    expect(commands).toEqual([
      { name: 'sales.quick_notes.delete', payload: { quick_note_id: 'qn-1' } },
    ]);
  });

  it('a command that fails is SHOWN, never swallowed', async () => {
    const el = await mount();
    sdk.command = async () => {
      throw new Error('nope');
    };
    el.newText = 'no ice';
    await el.save(new Event('submit'));
    await settle(el);
    expect(el.formError.length).toBeGreaterThan(0);
    expect(el.shadowRoot.querySelector('ok-inline-feedback')).toBeTruthy();
  });
});

describe('the form controls are visible on the shell’s `ios` mode (ADR-0143)', () => {
  it('every ion-input that declares `fill` declares `mode="md"` too', async () => {
    const el = await mount();
    for (const input of [...el.shadowRoot.querySelectorAll('ion-input, ion-select, ion-textarea')]) {
      if (input.hasAttribute('fill')) {
        expect(input.getAttribute('mode'), input.outerHTML.slice(0, 80)).toBe('md');
      }
    }
  });
});
