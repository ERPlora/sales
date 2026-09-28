// sales#456 — the idempotency key of a refund attempt, remembered per sale until its outcome is
// known.
//
// The key is what makes a retry recover the SAME refund document instead of writing a second one
// (sales#160). sales#451 kept it while the screen stayed open; closing the screen after «we can't
// tell» threw it away, and a partial refund repeated from a fresh screen went out twice. So the key
// is written down BEFORE the command leaves, dropped only once the hub has answered, and the next
// screen on that sale starts from it and asks the hub what became of it.
//
// Device storage first, so a reload or a crashed tablet still has it; a memory copy behind it,
// because a webview in private mode or a sandbox refuses the storage and the doubt still has to
// survive closing the modal on this page.

const PREFIX = 'erplora.sales.refundPendingKey.';

const memory = new Map<string, string>();

function storage(): Storage | undefined {
  try {
    return globalThis.localStorage ?? undefined;
  } catch {
    return undefined;
  }
}

/** The key of the refund attempt on `saleId` whose outcome is not known yet, if any. */
export function pendingRefundKey(saleId: string): string | undefined {
  try {
    const stored = storage()?.getItem(PREFIX + saleId);
    if (stored) return stored;
  } catch {
    // Storage refused: the memory copy is all there is.
  }
  return memory.get(saleId);
}

/** Written before the refund command leaves: from here until the answer, the outcome is open. */
export function rememberPendingRefundKey(saleId: string, key: string): void {
  memory.set(saleId, key);
  try {
    storage()?.setItem(PREFIX + saleId, key);
  } catch {
    // Storage refused: the memory copy still covers closing and reopening on this page.
  }
}

/** The hub answered (recorded, refused, or «no refund under that key» and a new one follows). */
export function forgetPendingRefundKey(saleId: string): void {
  memory.delete(saleId);
  try {
    storage()?.removeItem(PREFIX + saleId);
  } catch {
    // Nothing to undo: an unwritable storage never held it.
  }
}
