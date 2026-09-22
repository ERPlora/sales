// sales#330 — which sales already had their ORIGINAL ticket printed on this device.
//
// Only one original of an invoice may exist (RD 1619/2012 art. 14): every later paper says
// «duplicado». Right after charging, two printers of the same sale meet on one device — the hub
// shell's automatic print (its own hidden `erp-sales-document`, asked with no argument) and the
// ticket screen's print button — and either may come first. Both go through `erp-sales-document`,
// the one custom element this bundle defines, so a module-level record is shared by the two.
//
// Held in memory on purpose: it only has to cover the minutes the ticket screen stays open after a
// charge. A reprint from the sales list or the history is always a copy on its own (hub#1931).

/** Enough for a whole busy day on one till; the oldest are dropped first. */
const MAX_REMEMBERED = 2000;

const printed = new Set<string>();

/** `true` once the original ticket of `saleId` came out on this device. */
export function originalPrinted(saleId: string): boolean {
  return printed.has(saleId);
}

/** Records that the original ticket of `saleId` was printed: from now on it only gets copies. */
export function markOriginalPrinted(saleId: string): void {
  printed.delete(saleId);
  printed.add(saleId);
  // A Set iterates in insertion order: the first one is the oldest.
  while (printed.size > MAX_REMEMBERED) printed.delete(printed.values().next().value as string);
}

/** Tests only: start with no original printed. */
export function forgetOriginalPrints(): void {
  printed.clear();
}
