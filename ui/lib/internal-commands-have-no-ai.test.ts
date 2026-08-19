// sales#118 — an INTERNAL command never declares an `ai` block.
//
// The runtime already refuses to offer them: `assemble_tools` evaluates `is_internal(name)`
// BEFORE it looks at `ai`, so today nothing is exposed. This is not about a live hole — it is
// about the manifest declaring the opposite of what it wants. An `ai.description` says "I want
// the model to be able to call this"; on a command whose whole point is that only the runtime
// calls it, that is a contradiction, and the next person to read it cannot tell which of the two
// intentions is the real one.
//
// It matters most because these manifests are the de-facto template for new modules: a module
// that copies the pattern and drops the `_` from the name gets a SILENT exposure. `_void_sale`
// is the expensive one — voiding a sale is a fiscal correction (ADR-0331 `reason: fiscal`), not
// an edit.
import { describe, expect, it } from 'vitest';
import manifest from '../../module.json';

type Cmd = { internal?: boolean; ai?: unknown };
const commands = (manifest as unknown as { commands: Record<string, Cmd> }).commands;

/** The runtime's own rule (`CommandDef::is_internal`): the flag, or a leading `_` on the leaf. */
function isInternal(name: string, def: Cmd): boolean {
  return def.internal === true || name.split('.').pop()!.startsWith('_');
}

describe('internal commands are not offered to the assistant', () => {
  it('no internal command declares an `ai` block', () => {
    const offenders = Object.entries(commands)
      .filter(([name, def]) => isInternal(name, def) && def.ai !== undefined)
      .map(([name]) => name);

    expect(offenders).toEqual([]);
  });

  // Guard against the opposite mistake: this must not be "passing" because the manifest stopped
  // having internal commands at all, which would mean the check verifies nothing.
  it('there ARE internal commands here, so the check above is not vacuous', () => {
    const internals = Object.entries(commands).filter(([name, def]) => isInternal(name, def));
    expect(internals.length).toBeGreaterThan(0);
  });
});
