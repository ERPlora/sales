// sales#393 — every door that can put the manager's PIN on screen says WHAT is being approved.
//
// When a role runs a command it lacks the permission for, the shell paints the approval dialog
// and names the action with `commands["<command>"].label` from this module's locale (hub#579,
// `apps/web/src/lib/elevation-label.ts`). Without it the dialog falls back to "an action of
// Sales / POS" and the manager types the PIN blind — the receipt becomes a rubber stamp.
//
// The rule is derived from the manifest, not from a hand-kept list: a command is a PIN door when
// at least one non-admin role lacks its permission. A new manager-only command without a label
// turns this test red.
import { describe, expect, it } from 'vitest';
import manifest from '../../module.json';
import en from '../../locales/en.json';
import es from '../../locales/es.json';

type Cmd = { internal?: boolean; permission?: string };
type Locale = { commands?: Record<string, { label?: string }> };

const m = manifest as unknown as {
  commands: Record<string, Cmd>;
  role_permissions: Record<string, string[]>;
};

/** The runtime's own rule (`CommandDef::is_internal`): the flag, or a leading `_` on the leaf. */
function isInternal(name: string, def: Cmd): boolean {
  return def.internal === true || name.split('.').pop()!.startsWith('_');
}

const nonAdminRoles = Object.entries(m.role_permissions).filter(([, perms]) => !perms.includes('*'));

/** Commands some non-admin role can only run with a manager's approval. */
const pinDoors = Object.entries(m.commands)
  .filter(([name, def]) => !isInternal(name, def) && def.permission)
  .filter(([, def]) => nonAdminRoles.some(([, perms]) => !perms.includes(def.permission!)))
  .map(([name]) => name)
  .sort();

const label = (locale: unknown, cmd: string) =>
  (locale as Locale).commands?.[cmd]?.label?.trim() ?? '';

describe('manager approval dialog names the action (sales#393)', () => {
  it('covers the doors the issue saw, so the derivation is not vacuous', () => {
    expect(pinDoors).toEqual(
      expect.arrayContaining([
        'sales.complete_sale_over_limit',
        'sales.order.set_discount_over_limit',
        'sales.order.set_line_discount_over_limit',
        'sales.order.add_open_line',
        'sales.void',
        'sales.refund',
      ]),
    );
  });

  it.each(pinDoors)('%s has an English label', (cmd) => {
    expect(label(en, cmd)).not.toBe('');
  });

  it.each(pinDoors)('%s has a Spanish label that is a translation, not a copy', (cmd) => {
    expect(label(es, cmd)).not.toBe('');
    expect(label(es, cmd)).not.toBe(label(en, cmd));
  });

  // hub#363: the permission key or the command name is our vocabulary, not the counter's — the
  // customer may be looking at the screen.
  it.each(pinDoors)('%s label never shows the raw command or permission', (cmd) => {
    const perm = m.commands[cmd].permission!;
    for (const text of [label(en, cmd), label(es, cmd)]) {
      expect(text).not.toContain(cmd);
      expect(text).not.toContain(perm);
      expect(text).not.toMatch(/[a-z]+\.[a-z_]+/);
    }
  });
});
