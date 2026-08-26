// scale-entry — the OPTIONAL scale contract of the POS (sales#28, ADR-0147).
//
// `sales` does NOT talk to hardware and must never learn how. The device that can read a scale is
// the installed app (`erplora-app` → `crates/peripherals`, ADR-0196/0204); the shell is what sits
// between the two, and it already has a one-way door for exactly this shape of news:
// `window` + a namespaced `CustomEvent`, the same one the shell uses for `erplora:locale-changed`.
// So the whole coupling is a NAME and a payload: whoever can weigh dispatches
// {@link SCALE_WEIGHT_EVENT}; whoever cannot dispatches nothing, and a hub with no scale is the POS
// of today, byte for byte — no probe, no capability read, no `depends_on`, no branch to keep alive.
//
// The market shape (9 references + 2 forums; the table is in `scale-entry.test.ts` and in
// `architecture/modules/sales.md`) is unanimous on three things, and this module is those three:
//
//   1. **The line comes first, the weight second.** Square, Odoo, Clover, Toast, Lightspeed and
//      Glop all have the cashier choose the article and THEN put it on the platter. A reading never
//      creates a line — if it did, a scale left with a box on it would be selling by itself.
//   2. **The unit is not converted.** Clover states it plainly: the unit on the scale must match
//      the item's. Reading 500 g onto a line priced in kg and «helpfully» dividing is how a 1000×
//      error reaches a fiscal document; a refusal the cashier can see costs one sentence.
//   3. **No scale changes nothing.** Typing the quantity stays the product; the scale only saves
//      the typing.
//
// 🔴 And the quantity itself goes through the SAME door as a typed one — `setQtyAbs`, so `toMicro`
// (fixed point 10⁶) and `onGrid` (the article's step) judge a weighed 0,5 exactly as they judge a
// typed 0,5. There is no second path into the cart, which is the point of keeping this file free of
// arithmetic: it decides WHICH line and WHETHER, never how much a quantity is worth.
import { isLineLocked } from './rounds.js';
import type { CartLine } from './pos-cart.js';

/**
 * The one name that couples `sales` to whoever can weigh.
 *
 * A `window` `CustomEvent`, namespaced like the shell's own (`erplora:locale-changed`), carrying a
 * {@link ScaleReading} in `detail`. One way: the POS never answers, never asks, never polls.
 */
export const SCALE_WEIGHT_EVENT = 'erplora:scale-weight';

/**
 * A weight the hardware has already measured.
 *
 * `value` is the **net** weight in logical units (0.5 = half a kilo), tare already subtracted —
 * that is where every reference with real hardware puts the tare (on the scale, or in the driver
 * that reads it), and it keeps `sales` from owning a container registry it has no business owning.
 *
 * Field names are snake_case to match the unit registry (`unit_code` on the line, on the command
 * and on the event of a sale), not the shell's own camelCase: this payload is about the DOMAIN, and
 * a cashier's line says `unit_code` everywhere else.
 */
export interface ScaleReading {
  /** Net weight, logical (0.5 = half a kilo). Always ≥ 0 and finite. */
  value: number;
  /** Unit of the reading, by the hub's unit registry code (`kg`, `g`). */
  unit_code: string;
  /** The platter has settled. A scale streams while the hand is still on it. */
  stable: boolean;
  /** Which device measured it. For the log and for support — never for authorisation. */
  device_id?: string;
}

/** Why a reading did not become a quantity. Every one of them is a normal day, not a fault. */
export type ScaleRefusal =
  | { ok: false; reason: 'no_weighable_line' }
  | { ok: false; reason: 'unstable' }
  | { ok: false; reason: 'unit_mismatch'; expected: string; got: string }
  | { ok: false; reason: 'zero' };

/** What the POS should do with a reading. */
export type ScaleVerdict = { ok: true; qty: number } | ScaleRefusal;

/**
 * Reads the `detail` of the event, or `null` if it is not a weight.
 *
 * A `window` event is a **public door**: anything on the page can dispatch one, so nothing that is
 * not a finite, non-negative number in a named unit gets to reach the cart. A missing `stable` is
 * read as **not** stable on purpose — a scale that never claims to have settled is still settling,
 * and taking its stream would ring up the weight of a hand.
 */
export function parseScaleReading(detail: unknown): ScaleReading | null {
  if (!detail || typeof detail !== 'object') return null;
  const d = detail as Record<string, unknown>;
  const value = d.value;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  const unit = typeof d.unit_code === 'string' ? d.unit_code.trim() : '';
  if (!unit) return null;
  const device = typeof d.device_id === 'string' && d.device_id.trim() ? d.device_id.trim() : undefined;
  return {
    value,
    unit_code: unit,
    stable: d.stable === true,
    ...(device ? { device_id: device } : {}),
  };
}

/**
 * The line a weight belongs to: the **last** line priced by weight that is still open.
 *
 * «Last» is what «the one the cashier just tapped» means in a POS whose tap adds a line — it is the
 * same selection Square and Odoo make explicit with a popup, without adding a selection state the
 * cashier has to think about. A line already fired to the kitchen is skipped: that weight is cooked,
 * and re-weighing it would silently reprice a plate that is already out.
 *
 * `weighable` answers whether a unit code is a weight; the hub's unit registry owns that
 * (`inventory.units.list` → `category = 'mass'`), so this file never hard-codes `kg`.
 */
export function scaleTargetLine(
  cart: CartLine[],
  weighable: (unitCode: string | undefined) => boolean,
): CartLine | undefined {
  for (let i = cart.length - 1; i >= 0; i--) {
    const line = cart[i];
    if (weighable(line.unit_code) && !isLineLocked(line)) return line;
  }
  return undefined;
}

/**
 * Whether this reading becomes the quantity of that line, and if not, why.
 *
 * The order of the refusals is the order of how ordinary they are: most readings arrive with
 * nothing selected (the scale is always talking), then unsettled ones, and only then the two that
 * mean something is actually wrong.
 */
export function scaleVerdict(line: CartLine | undefined, reading: ScaleReading): ScaleVerdict {
  if (!line) return { ok: false, reason: 'no_weighable_line' };
  if (!reading.stable) return { ok: false, reason: 'unstable' };
  if ((line.unit_code ?? '') !== reading.unit_code) {
    return { ok: false, reason: 'unit_mismatch', expected: line.unit_code ?? '', got: reading.unit_code };
  }
  if (reading.value <= 0) return { ok: false, reason: 'zero' };
  return { ok: true, qty: reading.value };
}
