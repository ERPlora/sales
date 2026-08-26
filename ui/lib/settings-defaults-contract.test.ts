// GUARD (sales#25): the settings form and the settings TABLE must agree on every default.
//
// They did not. `auto_invoice_with_tax_id` shipped as `DEFAULT 1` in the column and `false` in the
// JSON schema the shell builds the form from, so the same hub could answer "on" or "off" depending
// on which of the two you asked — and that switch had no reader at all, so nobody could notice.
// `sync_services` had the mirror problem once it GAINED a reader: `DEFAULT 0` everywhere while the
// till had shown services since sales#89 regardless.
//
// A default that lives in two places drifts. This pins them together, mechanically, so the next
// column cannot land with one value in the migration and another on the screen.
//
// sales#223 added the THIRD leg. The column and the schema agreed that `allow_transfer` ships OFF,
// and the till STILL offered bank transfer on a hub where nobody had ever saved the settings: the
// screen had its own, undeclared fallback (`policy.allow_transfer !== 0`, and `undefined !== 0` is
// true). So the UI's fallback — `POS_SETTINGS_DEFAULTS` — is pinned here too, and it is checked
// against the door the till actually reads through (`queries/pos_settings_get.sql`): an
// operational column cannot land with a default in the migration and no fallback on the screen,
// nor with a fallback the till never receives.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { POS_SETTINGS_DEFAULTS } from './pos-settings.js';

function moduleRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  while (!existsSync(join(dir, 'module.json'))) {
    const up = dirname(dir);
    if (up === dir) throw new Error('module.json not found walking up from the test');
    dir = up;
  }
  return dir;
}

const ROOT = moduleRoot();
const TABLE = 'sales_settings';

/** The DEFAULT of every column of `sales_settings`, as it stands after replaying the migrations in
 *  order. Values are kept as the SQL literal (`1`, `0`, `'ticket'`). */
function columnDefaults(): Map<string, string> {
  const dir = join(ROOT, 'migrations', 'postgres');
  const defaults = new Map<string, string>();
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(dir, file), 'utf8');
    // Statement by statement, with the `--` comments stripped: a DEFAULT mentioned inside a
    // comment is prose, not schema.
    const body = sql.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');

    const create = new RegExp(`CREATE TABLE[^;]*?${TABLE}\\s*\\(([\\s\\S]*?)\\n\\);`, 'i').exec(body);
    if (create) {
      for (const line of create[1].split('\n')) {
        const m = /^\s*([a-z_]+)\s+[A-Z]+[\s\S]*?DEFAULT\s+('[^']*'|[^\s,]+)/.exec(line);
        if (m) defaults.set(m[1], m[2]);
      }
    }
    for (const m of body.matchAll(
      new RegExp(`ALTER TABLE\\s+${TABLE}\\s+ADD COLUMN\\s+(?:IF NOT EXISTS\\s+)?([a-z_]+)[^;]*?DEFAULT\\s+('[^']*'|[^\\s;]+)`, 'gi'),
    )) defaults.set(m[1], m[2]);
    for (const m of body.matchAll(
      new RegExp(`ALTER TABLE\\s+${TABLE}\\s+ALTER COLUMN\\s+([a-z_]+)\\s+SET DEFAULT\\s+('[^']*'|[^\\s;]+)`, 'gi'),
    )) defaults.set(m[1], m[2]);
  }
  return defaults;
}

/** The JSON-schema default written the way the column writes it: booleans are the 0/1 INTEGER of
 *  the portable SQL subset (ADR-0007), strings are quoted. */
function asSqlLiteral(v: unknown): string {
  if (typeof v === 'boolean') return v ? '1' : '0';
  if (typeof v === 'string') return `'${v}'`;
  return String(v);
}

const schema = JSON.parse(readFileSync(join(ROOT, 'schemas', 'settings_update.json'), 'utf8')) as {
  properties: Record<string, { default?: unknown }>;
};

describe('the settings form and the settings table agree on every default', () => {
  const defaults = columnDefaults();

  it('the migrations really were parsed (a guard that reads nothing passes everything)', () => {
    expect(defaults.get('allow_cash')).toBe('1');
    expect(defaults.get('allow_transfer')).toBe('0');
    expect(defaults.get('default_document_format')).toBe("'ticket'");
  });

  for (const [name, prop] of Object.entries(schema.properties)) {
    if (prop.default === undefined) continue;
    it(`${name}`, () => {
      const column = defaults.get(name);
      expect(column, `\`${name}\` is offered by the settings form but no migration creates it`).toBeDefined();
      expect(column).toBe(asSqlLiteral(prop.default));
    });
  }
});

/** The columns `queries/pos_settings_get.sql` really projects — the ONLY settings the till ever
 *  sees. A UI default for anything else is a default for a value that never arrives. */
function counterReadProjection(): string[] {
  const sql = readFileSync(join(ROOT, 'queries', 'pos_settings_get.sql'), 'utf8')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');
  const upper = sql.toUpperCase();
  return sql
    .slice(upper.indexOf('SELECT') + 6, upper.indexOf('FROM'))
    .split(',')
    .map((c) => c.trim().split(/\s+/).pop()!.trim())
    .filter(Boolean);
}

describe('the till\'s fallback is the SAME default, not a third opinion (sales#223)', () => {
  const projection = counterReadProjection();

  it('the counter read really was parsed (a guard that reads nothing passes everything)', () => {
    expect(projection).toContain('allow_transfer');
    expect(projection).toContain('receipt_header');
    expect(projection, 'the row identity is not policy').not.toContain('id');
  });

  for (const [name, prop] of Object.entries(schema.properties)) {
    if (prop.default === undefined) continue;
    if (!projection.includes(name)) continue;
    it(`${name}`, () => {
      const ui = (POS_SETTINGS_DEFAULTS as Record<string, unknown>)[name];
      expect(ui, `\`${name}\` reaches the till but POS_SETTINGS_DEFAULTS has no fallback for it — `
        + 'with no settings row the screen would decide what absence means on its own, which is '
        + 'sales#223').toBeDefined();
      expect(asSqlLiteral(ui)).toBe(asSqlLiteral(prop.default));
    });
  }

  it('every UI fallback is for a setting the till actually receives', () => {
    const unreachable = Object.keys(POS_SETTINGS_DEFAULTS).filter((k) => !projection.includes(k));
    expect(unreachable, 'a fallback for a column the counter read does not project is dead code')
      .toEqual([]);
  });
});

/** Every `.ts` under `ui/`, tests aside. */
function uiSources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) { uiSources(full, out); continue; }
    if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) out.push(full);
  }
  return out;
}

describe('nobody reads the settings row raw (sales#223)', () => {
  const sources = uiSources(join(ROOT, 'ui'));

  it('the sweep really walked the UI (a guard that reads nothing passes everything)', () => {
    expect(sources.length).toBeGreaterThan(20);
    expect(sources.some((f) => f.endsWith('erp-pos-touch.ts'))).toBe(true);
  });

  // The defect was never in one column: it was a reader deciding, on its own, what "no row"
  // means. So the rule is about the DOOR — whoever asks the settings query resolves the answer
  // through the shared defaults before anything on the screen looks at it.
  for (const file of uiSources(join(ROOT, 'ui'))) {
    const src = readFileSync(file, 'utf8');
    if (!src.includes("erplora().query")) continue;
    if (!/['"]sales\.(pos_)?settings\.get['"]/.test(src.replace(/^\s*(\/\/|\*).*$/gm, ''))) continue;
    it(`${file.slice(ROOT.length + 1)} resolves it through withPosSettingsDefaults`, () => {
      expect(src, 'a settings row read raw is sales#223 all over again')
        .toContain('withPosSettingsDefaults');
    });
  }
});

describe('the SERVER falls back to the same defaults as the form (sales#223)', () => {
  // `hub_setting(context, "key", default)` is the handler's own fallback for a hub with no
  // settings row. It is the server half of the same question the screen answers, and the two have
  // to answer it identically: a rule the till hides and the server allows (or the other way
  // round) is the sales#223 split, only louder — the cashier finds out with the card in hand.
  const rust = readFileSync(join(ROOT, 'handler', 'src', 'lib.rs'), 'utf8');
  const fallbacks = new Map<string, string>();
  for (const m of rust.matchAll(/hub_setting\(\s*context\s*,\s*"([a-z_]+)"\s*,\s*(true|false)\s*\)/g)) {
    fallbacks.set(m[1], m[2]);
  }

  it('the handler really was parsed (a guard that reads nothing passes everything)', () => {
    expect([...fallbacks.keys()].sort()).toEqual(['allow_discounts', 'require_customer']);
  });

  for (const [key, value] of fallbacks) {
    it(`${key}`, () => {
      const declared = schema.properties[key]?.default;
      expect(declared, `the server falls back on \`${key}\`, which the settings form does not offer`)
        .toBeDefined();
      expect(asSqlLiteral(value === 'true')).toBe(asSqlLiteral(declared));
    });
  }
});
