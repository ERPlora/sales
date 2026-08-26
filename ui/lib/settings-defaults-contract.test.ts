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
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
