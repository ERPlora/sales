// services#157 — the hole `sales.reversal.notice` of the void and refund windows.
//
// Voiding a sale, or refunding it in full, can undo things other modules sold on it: the voucher
// Services granted on that ticket is voided with it, sessions already used included. The operator
// has to READ that before confirming (Square, Lightspeed and MyTime say it on the confirmation;
// WooCommerce leaving the voucher alive in silence is the complaint). Sales does not know what a
// voucher is, so it cedes a hole: each filler gets the sale and the door, and says what happens.
// It warns and never blocks — and never delays the window: a filler that fails paints nothing.

export const REVERSAL_NOTICE_SLOT = 'sales.reversal.notice';

/** The door hosting the hole. A partial refund leaves what was sold alive: the filler says so. */
export type ReversalAction = 'void' | 'refund';

interface SlotSdk {
  loadSlot?(slot: string): Promise<Array<Record<string, unknown> & { component: string }>>;
}

/** The tags of the components filling the hole. An older shell or a failed read = none. */
export async function loadReversalFillers(sdk: SlotSdk): Promise<string[]> {
  try {
    // A literal, not REVERSAL_NOTICE_SLOT: the contract extractor reads the slot name from the
    // call itself (ADR-0127), and the test pins both to the same string.
    const rows = (await sdk.loadSlot?.('sales.reversal.notice')) ?? [];
    return rows.map((f) => String(f.component));
  } catch {
    return [];
  }
}

/**
 * One instance per filler inside `host`. Idempotent: the window re-renders on every keystroke.
 *
 * 🔴 `saleId` and `action` are set BEFORE the insert (as in the till, sales#162): the filler reads
 * in `connectedCallback`, so inserting it first would make it ask about an empty sale.
 */
export function mountReversalNotice(
  host: Element | null | undefined,
  fillers: readonly string[],
  saleId: string,
  action: ReversalAction,
  mounted: Map<string, HTMLElement>,
): void {
  if (!host) return;
  for (const component of fillers) {
    let el = mounted.get(component);
    if (!el) {
      el = document.createElement(component);
      mounted.set(component, el);
    }
    // TYPED data through JS properties, never through attributes (ADR-0043).
    const props = el as HTMLElement & { saleId?: string; action?: ReversalAction };
    props.saleId = saleId;
    props.action = action;
    if (el.parentElement !== host) host.appendChild(el);
  }
  for (const [component, el] of [...mounted]) {
    if (fillers.includes(component)) continue;
    el.remove();
    mounted.delete(component);
  }
}
