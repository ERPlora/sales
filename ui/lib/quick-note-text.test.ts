// sales#206 — what a QUICK-NOTE chip does to the text already in the sheet.
//
// The rule comes from the market, not from us. Lightspeed Restaurant (K-Series) is the one
// reference that ships preconfigured notes as a first-class feature: the business creates them in
// the Back Office (add / edit / delete / reorder) and the waiter SELECTS them on the order — more
// than one, and a selected note can be deselected again. Everything the waiter picks travels to
// the KDS and the printed docket.
//
// Our line carries ONE note string (sales#156, `sales_order_item.notes`), which is what the
// kitchen prints, so «selecting several» has to become one line of text. Hence: a chip APPENDS its
// text, joined by «, », and tapping it again TAKES IT OUT. Never a replace — "medium rare" plus
// "no salt" is one request, and replacing would silently drop the first one. Never a blind append
// either: the same chip tapped twice would print "no salt, no salt" at the pass.
import { describe, expect, it } from 'vitest';
import { hasQuickNote, toggleQuickNote } from './quick-note-text';

describe('toggleQuickNote', () => {
  it('puts the text in an empty note', () => {
    expect(toggleQuickNote('', 'no salt')).toBe('no salt');
  });

  it('appends to what is already written, joined by a comma', () => {
    expect(toggleQuickNote('medium rare', 'no salt')).toBe('medium rare, no salt');
  });

  it('appends to FREE text the waiter typed — the keyboard never stops working', () => {
    expect(toggleQuickNote('shellfish allergy!!', 'no salt')).toBe('shellfish allergy!!, no salt');
  });

  it('takes the text out when it is already there — the same chip twice does not duplicate it', () => {
    expect(toggleQuickNote('medium rare, no salt', 'no salt')).toBe('medium rare');
  });

  it('takes it out from the middle and leaves the rest joined', () => {
    expect(toggleQuickNote('a, b, c', 'b')).toBe('a, c');
  });

  it('emptying the last one leaves an empty note, never a stray comma', () => {
    expect(toggleQuickNote('no salt', 'no salt')).toBe('');
  });

  it('is not fooled by spacing around the separators', () => {
    expect(toggleQuickNote('medium rare ,   no salt', 'no salt')).toBe('medium rare');
  });

  it('trims what it stores, so a chip with padding does not widen the ticket', () => {
    expect(toggleQuickNote('  ', '  no salt  ')).toBe('no salt');
  });

  it('matches whole segments only: «salt» does not take «no salt» out', () => {
    expect(toggleQuickNote('no salt', 'salt')).toBe('no salt, salt');
  });
});

describe('hasQuickNote', () => {
  it('is what lights the chip up: true only for a whole segment', () => {
    expect(hasQuickNote('medium rare, no salt', 'no salt')).toBe(true);
    expect(hasQuickNote('medium rare, no salt', 'salt')).toBe(false);
    expect(hasQuickNote('', 'no salt')).toBe(false);
  });

  it('ignores spacing, so a note typed by hand still lights its chip', () => {
    expect(hasQuickNote('medium rare ,  no salt ', 'no salt')).toBe(true);
  });
});
