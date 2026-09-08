// sales#267 — the MANIFEST contract of the business's own open-price departments.
//
// WHY A TABLE IN `sales` AND NOT A CURATION OF `taxes`. The till used to paint one department per
// ACTIVE TAX CATEGORY, and that catalogue is the same in every hub: the `taxes` seed plants ten
// `is_system=1` rows in all of them. Turning off the ones a grocer never sells would not have
// worked, and the reason is a CONTRACT and not a missing feature — a seed guarded per ROW declares
// REFERENCE data (ADR-0444), the export omits it (`export::is_module_seeded` skips `is_system=1`,
// and `blueprint_seed_reglas_no_duplican.rs` asserts `taxes_category` never enters a bundle) and
// the module replants it at the destination. A curation of it could therefore never travel inside
// a sector template, which is the whole point of having departments.
//
// WHO GOES THROUGH WHICH DOOR. Writing is the business configuring its till → `manage_settings`,
// which neither `cashier` nor `employee` has. READING is the till itself, and it has to work for
// the two roles that stand at it all day — the failure `sales.pos_settings.get` was born to fix
// (sales#205). Here it would be worse than a wrong default: with no departments the till falls
// back to the tax catalogue, so a read behind `manage_settings` would silently hand the cashier
// the ten seeded categories back and nobody would know why.
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
const catalogs = { en, es } as unknown as Record<string, {
  ui?: Record<string, string>;
  errors?: Record<string, string>;
  navigation?: Record<string, { label: string }>;
}>;

const MIGRATION = 'migrations/postgres/033_departments.sql';

describe('departments · storage', () => {
  it('ships its own migration, declared exactly once and on disk', () => {
    expect(m.migrations.postgres.filter((f) => f === MIGRATION)).toHaveLength(1);
    expect(existsSync(join(process.cwd(), MIGRATION))).toBe(true);
  });
});

describe('departments · the READ door is the till’s (sales#205)', () => {
  const q = () => m.queries['sales.departments.list'];

  it('exists and reads with `sales.view_sale`, never with `manage_settings`', () => {
    expect(q()).toBeDefined();
    expect(q().permission).toBe('sales.view_sale');
  });

  it('is a list query sorted by the order the business gave it', () => {
    expect(q().list?.default_sort).toBe('sort_order');
    expect(q().list?.sort).toContain('sort_order');
  });

  it('and the cashier holds that permission — the buttons are for whoever is at the till', () => {
    expect(m.role_permissions.cashier).toContain('sales.view_sale');
    expect(m.role_permissions.employee).toContain('sales.view_sale');
    expect(m.role_permissions.cashier).not.toContain('sales.manage_settings');
  });
});

describe('departments · the WRITE door is the manager’s', () => {
  const WRITES = ['sales.departments.create', 'sales.departments.update', 'sales.departments.delete'];

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
});

describe('departments · editing something that is gone FAILS, it does not pretend', () => {
  // A soft-delete or an update that matches zero rows would answer `200 ok` and the screen would
  // show the change it never made. `expect_rows` is the runtime's translatable gate (hub#139):
  // under the minimum it rolls the whole transaction back and answers 409 with the domain code.
  for (const name of ['sales.departments.update', 'sales.departments.delete']) {
    it(`${name} gates on at least one affected row`, () => {
      expect(m.commands[name].expect_rows).toEqual({
        op: 'min',
        n: 1,
        error: 'sales.department_not_found',
      });
    });
  }

  it('and the code is in the module’s catalogue with its text in en AND es (ADR-0398/0055)', () => {
    expect(Object.keys(m.errors)).toContain('sales.department_not_found');
    for (const lang of ['en', 'es']) {
      const text = catalogs[lang].errors?.['sales.department_not_found'];
      expect(typeof text, `locales/${lang}.json`).toBe('string');
      expect((text ?? '').trim().length, `locales/${lang}.json`).toBeGreaterThan(0);
    }
  });
});

describe('departments · where the business configures them', () => {
  const entry = () => m.navigation.find((n) => n.id === 'departments');

  it('is a tab of the module that only opens for who can configure the till', () => {
    expect(entry(), 'navigation entry `departments`').toBeDefined();
    expect(entry()?.component).toBe('erp-pos-departments');
    // hub#1052: the manifest says who the tab is served to; the runtime re-checks the command
    // behind it anyway. This is not the door — it is not showing a locked one to the cashier.
    expect(entry()?.permission).toBe('sales.manage_settings');
  });

  it('and its label is translated on both sides (ADR-0055/0199)', () => {
    for (const lang of ['en', 'es']) {
      const label = catalogs[lang].navigation?.departments?.label;
      expect(typeof label, `locales/${lang}.json → navigation.departments.label`).toBe('string');
      expect((label ?? '').trim().length, lang).toBeGreaterThan(0);
    }
  });
});

describe('departments · every visible string is translated on both sides', () => {
  const KEYS = [
    'departmentsTitle',
    'departmentsIntro',
    'departmentName',
    'departmentNamePlaceholder',
    'departmentTaxCategory',
    'departmentOrder',
    'departmentsEmpty',
    'departmentsLoading',
    'departmentsSearch',
    'departmentAdd',
    'departmentSave',
    'departmentSaving',
    'departmentEdit',
    'departmentEditing',
    'departmentEditCancel',
    'departmentDelete',
    'departmentDeleteTitle',
    'departmentDeleteHint',
    'departmentCancel',
    'departmentSaveFailed',
    'departmentDeleteFailed',
    'departmentsLoadFailed',
    'departmentTaxCategoryMissing',
    'departmentsNoTaxCategories',
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

  it('and Spanish is a TRANSLATION, not the English string copied across', () => {
    // sales#267 — an `es` catalogue that echoes `en` passes a "the key exists" check and still
    // ships an English screen to a Spanish till, which is the failure ADR-0055 exists to stop.
    const enUi = catalogs.en.ui ?? {};
    const esUi = catalogs.es.ui ?? {};
    for (const key of ['departmentsIntro', 'departmentsEmpty', 'departmentDeleteHint', 'departmentTaxCategoryMissing']) {
      expect(esUi[key], `ui.${key} is still the English text`).not.toBe(enUi[key]);
    }
  });
});
