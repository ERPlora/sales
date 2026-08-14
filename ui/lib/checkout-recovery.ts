// hub#923 (saas#1460) — turning "did it charge?" into an answer.
//
// A checkout can lose its answer for reasons the POS cannot prevent: the hub is OOM-killed after
// committing the sale (the incident that motivated this), the proxy returns a 502, the wifi drops
// mid-response. The sale is already in the database; the cashier is not. What she saw was a raw
// engine string, so she charged again.
//
// The sale carries an idempotency key (sales#20), which makes the doubt answerable: ask the server
// whether that key already produced a sale. Three outcomes, and the difference between them is the
// difference between a double charge and a non-event:
//
//   charged      — the sale exists. Show it. NEVER offer a retry.
//   not_charged  — the server answered "no sale for that key". Retrying is safe (and must reuse
//                  the same key, so a racing duplicate still collapses into one sale).
//   unknown      — we could not ask. Say so, send the cashier to Sales, and DO NOT retry silently.
//
// The load-bearing rule is that last one: an unreachable server is not evidence of "no sale". The
// reasoning "no answer ⇒ it did not charge" is precisely what produced the incident.

/** A row of `sales.by_idempotency_key` — only the id is load-bearing here. */
export interface RecoveredSale {
  id?: string;
}

/** Asks the server for the sale recorded under this idempotency key. */
export type CheckoutProbe = (idempotencyKey: string) => Promise<RecoveredSale[]>;

export type CheckoutRecovery =
  | { outcome: 'charged'; saleId: string }
  | { outcome: 'not_charged' }
  | { outcome: 'unknown' };

export interface RecoverOptions {
  /** How many times to ask. >1 covers the restart window: an OOM-killed hub is back in seconds. */
  attempts?: number;
  /** Injected so tests don't wait in real time. */
  sleep?: (ms: number) => Promise<void>;
  /** Delay between attempts. */
  delayMs?: number;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function recoverCheckout(
  probe: CheckoutProbe,
  idempotencyKey: string,
  options: RecoverOptions = {},
): Promise<CheckoutRecovery> {
  // No key, nothing to ask: this checkout never got far enough to be identifiable.
  if (!idempotencyKey) return { outcome: 'unknown' };

  const attempts = Math.max(1, options.attempts ?? 1);
  const sleep = options.sleep ?? wait;
  const delayMs = options.delayMs ?? 1500;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const rows = await probe(idempotencyKey);
      // The server SPOKE. An empty answer is an answer — no retry, no ambiguity.
      if (!rows?.length) return { outcome: 'not_charged' };
      return { outcome: 'charged', saleId: rows[0]?.id ?? '' };
    } catch {
      // Could not reach it. Try again while the container comes back; if it never does, the
      // caller gets `unknown` — which is the truth, and the only safe thing to tell the cashier.
      if (attempt < attempts) await sleep(delayMs);
    }
  }
  return { outcome: 'unknown' };
}
