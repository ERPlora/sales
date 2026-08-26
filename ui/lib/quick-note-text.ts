// sales#206 — the one rule a quick-note chip follows when it meets the text already in the sheet.
//
// The line carries ONE note (`sales_order_item.notes`, sales#156) because that is what the kitchen
// prints. Lightspeed lets the waiter select SEVERAL preconfigured notes on the same line, so the
// selection has to collapse into that single string: chips are joined by «, », which is how the
// note reads on the docket and how a waiter would have typed it anyway.
//
// It lives apart from the component on purpose: this is the part with the edge cases (spacing,
// the same chip twice, a segment that is a prefix of another), and it is worth pinning without
// mounting a till.

/** The note, cut into the segments a chip can match — blanks dropped. */
function segments(note: string): string[] {
  return note
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * `true` when `text` is one WHOLE segment of the note — what lights a chip up.
 *
 * Whole segments only: «salt» must not light up because the line says «no salt», which is close to
 * the opposite instruction.
 */
export function hasQuickNote(note: string, text: string): boolean {
  const wanted = text.trim();
  return wanted.length > 0 && segments(note).includes(wanted);
}

/**
 * Adds `text` to the note, or takes it out if it is already there.
 *
 * Never replaces: «medium rare» + «no salt» is one request and both halves have to reach the pass.
 * Never appends blindly either: the same chip tapped twice would print the instruction twice.
 */
export function toggleQuickNote(note: string, text: string): string {
  const wanted = text.trim();
  if (!wanted) return note.trim();
  const parts = segments(note);
  const at = parts.indexOf(wanted);
  if (at >= 0) parts.splice(at, 1);
  else parts.push(wanted);
  return parts.join(', ');
}
