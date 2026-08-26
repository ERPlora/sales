// sales#206 — the MANIFEST contract of the configurable quick notes.
//
// WHY A TABLE AND NOT A COLUMN IN `sales_settings`. The shell paints a module's settings screen
// from its JSON Schema and knows exactly four controls — toggle, select, number, text
// (`hub/apps/web/src/lib/module-settings.ts`). A list has no control there, so a JSON column
// exposed through `settings.schema` would reach the business as a raw JSON string in a text box.
// The module already has the shape this needs and it is a TABLE: `sales_payment_method` — an
// ordered catalogue of rows with `sort_order`, soft-delete and audit. `sales_quick_note` is the
// same row, and the CRUD is the one every catalogue of the fleet uses (`ok-data-table` with its
// create/edit/delete, like `services.categories` or `modifiers.groups`).
//
// WHO GOES THROUGH WHICH DOOR. Writing is the business configuring its till → `manage_settings`,
// which neither `cashier` nor `employee` has. READING is the till itself, and it has to work for
// the two roles that stand at it all day — the very failure `sales.pos_settings.get` was born to
// fix (sales#205): a query behind `manage_settings` makes the till blind to its own configuration.
// So the list reads with `sales.view_sale`.
import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import manifest from '../../module.json' with { type: 'json' };
import en from '../../locales/en.json' with { type: 'json' };
import es from '../../locales/es.json' with { type: 'json' };

type Manifest = {
  permissions: string[];
  role_permissions: Record<string, string[]>;
  migrations: { postgres: string[] };
  navigation: Array<{ id: string; label: string; icon?: string; component: string; permission?: string }>;
  queries: Record<string, { permission: string; sql: string; list?: { sort?: string[]; default_sort?: string } }>;
  commands: Record<string, {
    permission: string;
    sql?: string[];
    schema?: string;
    expect_rows?: { op: string; n: number; error: string };
  }>;
  errors: Record<string, unknown>;
};
const m = manifest as unknown as Manifest;
const catalogs = { en, es } as unknown as Record<string, { ui?: Record<string, string>; errors?: Record<string, string>; navigation?: Record<string, { label: string }> }>;

const MIGRATION = 'migrations/postgres/032_quick_notes.sql';

describe('quick notes · storage', () => {
  it('ships its own migration, and it is the last one', () => {
    expect(m.migrations.postgres).toContain(MIGRATION);
    expect(m.migrations.postgres[m.migrations.postgres.length - 1]).toBe(MIGRATION);
    expect(existsSync(join(process.cwd(), MIGRATION))).toBe(true);
  });
});

describe('quick notes · the READ door is the till’s (sales#205)', () => {
  const q = () => m.queries['sales.quick_notes.list'];

  it('exists and reads with `sales.view_sale`, never with `manage_settings`', () => {
    expect(q()).toBeDefined();
    expect(q().permission).toBe('sales.view_sale');
  });

  it('is a list query sorted by the order the business gave it', () => {
    expect(q().list?.default_sort).toBe('sort_order');
    expect(q().list?.sort).toContain('sort_order');
  });

  it('and the cashier holds that permission — the chips are for whoever is at the till', () => {
    expect(m.role_permissions.cashier).toContain('sales.view_sale');
    expect(m.role_permissions.employee).toContain('sales.view_sale');
    expect(m.role_permissions.cashier).not.toContain('sales.manage_settings');
  });
});

describe('quick notes · the WRITE door is the manager’s', () => {
  const WRITES = ['sales.quick_notes.create', 'sales.quick_notes.update', 'sales.quick_notes.delete'];

  it('declares the three commands behind `sales.manage_settings`', () => {
    for (const name of WRITES) {
      expect(m.commands[name], name).toBeDefined();
      expect(m.commands[name].permission, name).toBe('sales.manage_settings');
    }
  });

  it('each one validates its payload with a schema that exists', () => {
    for (const name of WRITES) {
      const schema = m.commands[name].schema;
      expect(schema, `${name} declares no schema`).toBeTruthy();
      expect(existsSync(join(process.cwd(), schema as string)), schema).toBe(true);
    }
  });

  it('each one runs SQL that exists — no handler, no WASM', () => {
    for (const name of WRITES) {
      const files = m.commands[name].sql ?? [];
      expect(files.length, name).toBeGreaterThan(0);
      for (const f of files) expect(existsSync(join(process.cwd(), f)), f).toBe(true);
    }
  });

  it('and the manager has the permission (admin already holds `*`)', () => {
    expect(m.role_permissions.manager).toContain('sales.manage_settings');
    expect(m.role_permissions.admin).toContain('*');
  });
});

describe('quick notes · editing something that is gone FAILS, it does not pretend', () => {
  // A soft-delete or an update that matches zero rows would answer `200 ok` and the screen would
  // show the change it never made. `expect_rows` is the runtime's translatable gate (hub#139):
  // under the minimum it rolls the whole transaction back and answers 409 with the domain code.
  for (const name of ['sales.quick_notes.update', 'sales.quick_notes.delete']) {
    it(`${name} gates on at least one affected row`, () => {
      expect(m.commands[name].expect_rows).toEqual({
        op: 'min',
        n: 1,
        error: 'sales.quick_note_not_found',
      });
    });
  }

  it('and the code is in the module’s catalogue with its text in en AND es (ADR-0398/0055)', () => {
    expect(Object.keys(m.errors)).toContain('sales.quick_note_not_found');
    for (const lang of ['en', 'es']) {
      const text = catalogs[lang].errors?.['sales.quick_note_not_found'];
      expect(typeof text, `locales/${lang}.json`).toBe('string');
      expect((text ?? '').trim().length, `locales/${lang}.json`).toBeGreaterThan(0);
    }
  });
});

describe('quick notes · where the business configures them', () => {
  const entry = () => m.navigation.find((n) => n.id === 'quick_notes');

  it('is a tab of the module that only opens for who can configure the till', () => {
    expect(entry(), 'navigation entry `quick_notes`').toBeDefined();
    expect(entry()?.component).toBe('erp-pos-quick-notes');
    // hub#1052: the manifest says who the tab is served to; the runtime re-checks the command
    // behind it anyway. This is not the door — it is not showing a locked one to the cashier.
    expect(entry()?.permission).toBe('sales.manage_settings');
  });

  it('and its label is translated on both sides (ADR-0055/0199)', () => {
    for (const lang of ['en', 'es']) {
      const label = catalogs[lang].navigation?.quick_notes?.label;
      expect(typeof label, `locales/${lang}.json → navigation.quick_notes.label`).toBe('string');
      expect((label ?? '').trim().length, lang).toBeGreaterThan(0);
    }
  });
});

describe('quick notes · every visible string is translated on both sides', () => {
  const KEYS = [
    'quickNotesTitle',
    'quickNoteText',
    'quickNoteOrder',
    'quickNotesEmpty',
    'quickNotesSearch',
    'quickNoteAdd',
    'quickNoteSave',
    'quickNoteSaving',
    'quickNoteEdit',
    'quickNoteEditing',
    'quickNoteEditCancel',
    'quickNoteDelete',
    'quickNoteDeleteTitle',
    'quickNoteDeleteHint',
    'quickNoteCancel',
    'quickNoteSaveFailed',
    'quickNoteDeleteFailed',
    'lineNoteQuickLoading',
    'lineNoteQuickError',
  ];

  for (const lang of ['en', 'es']) {
    it(`locales/${lang}.json carries them all`, () => {
      for (const key of KEYS) {
        const text = catalogs[lang].ui?.[key];
        expect(typeof text, `locales/${lang}.json → ui.${key}`).toBe('string');
        expect((text ?? '').trim().length, `ui.${key}`).toBeGreaterThan(0);
      }
    });
  }
});
