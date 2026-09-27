// sales#422 — the till's sheets (discount, charge, open price, note, modifiers, combo) fit the part of
// the till the SHELL shows.
//
// Every sheet hangs from `.scrim`, which is `position:absolute; inset:0` over `.card` (sales#314). But
// the shell floors a module screen at 480 px (hub#1730) and scrolls it inside its ion-content below
// that, so on a low phone `.card` is taller than what is on screen: 390×667 with the «You can't
// invoice yet» strip shows 193–601 of a card laid out at 209–689, and a phone on its side (667×375)
// shows 60–309 of 76–556, strip or not. The sheet was centred in the 480 px box, so its button —
// «Apply», «Charge» — sat at 599–651 against a tab bar at 601 (466–518 against 309 on its side); and
// once the shell scrolled, its header went up under the strip.
//
// The fix measures, while a sheet is open, how much of the card the shell's ion-content hides above
// and below and hands both over as the scrim's insets: the sheet sits between the header and the tab
// bar, its button on screen and its middle scrolling, as on Square or Toast. It follows the shell
// scroller, the window and the ion-content's own size while a sheet is open, and stops when it closes.
//
// happy-dom does not lay out, so the rects are stubbed with the numbers measured on the real shell
// (hub:stable, 390×667 with the strip); that it really fits is measured in a browser (the PR).
import { afterEach, describe, expect, it } from 'vitest';
import { installPosDouble } from '../../test/pos-double';
import './erp-pos-touch';

type HappyWindow = Window & { happyDOM?: { setViewport(v: { width: number; height: number }): void } };
type Pos = HTMLElement & { updateComplete: Promise<unknown>; openDiscount(target: 'line' | 'ticket', lineId?: string): void };
type Box = { top: number; bottom: number };

function stubRect(el: Element, box: () => Box): void {
  el.getBoundingClientRect = () => {
    const { top, bottom } = box();
    return { top, bottom, left: 0, right: 390, width: 390, height: bottom - top, x: 0, y: top, toJSON: () => ({}) } as DOMRect;
  };
}

async function flush(pos: Pos): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
  await pos.updateComplete;
}

/** Mounts the till the way the shell does: inside an ion-content whose scroll element is its own. */
async function mountInShell(width: number, height: number, withContent = true, scrollerLookup: 'ready' | 'held' | 'none' = 'ready') {
  (window as HappyWindow).happyDOM?.setViewport({ width, height });
  installPosDouble({});
  document.body.innerHTML = '';
  const view: Box = { top: 193, bottom: 601 };
  const card: Box = { top: 209, bottom: 689 };
  const scroller = document.createElement('div');
  const content = document.createElement(withContent ? 'ion-content' : 'div') as HTMLElement & { getScrollElement?: () => Promise<HTMLElement> };
  // 'held': the shell has not handed its scroller over yet (release() does); 'none': an
  // ion-content that is not upgraded yet, so it has no getScrollElement at all.
  let release: () => void = () => {};
  const held = new Promise<HTMLElement>((resolve) => { release = () => resolve(scroller); });
  if (withContent && scrollerLookup === 'ready') content.getScrollElement = () => Promise.resolve(scroller);
  if (withContent && scrollerLookup === 'held') content.getScrollElement = () => held;
  stubRect(content, () => view);
  const outlet = document.createElement('div');
  content.appendChild(outlet);
  document.body.appendChild(content);
  const pos = document.createElement('erp-pos-touch') as Pos;
  outlet.appendChild(pos);
  await pos.updateComplete;
  const root = pos.shadowRoot!;
  stubRect(root.querySelector('.card')!, () => card);
  return { pos, root, view, card, scroller, release };
}

async function openDiscount(pos: Pos): Promise<void> {
  pos.openDiscount('ticket');
  await flush(pos);
}

async function closeDiscount(pos: Pos): Promise<void> {
  (pos.shadowRoot!.querySelector('[data-testid="pos-discount-close"]') as HTMLElement).click();
  await flush(pos);
}

async function setPaying(pos: Pos, paying: boolean): Promise<void> {
  (pos as unknown as { paying: boolean }).paying = paying;
  await flush(pos);
}

const insets = (pos: Pos) => [pos.style.getPropertyValue('--pos-sheet-top'), pos.style.getPropertyValue('--pos-sheet-bottom')];

afterEach(() => {
  document.body.innerHTML = '';
  (window as HappyWindow).happyDOM?.setViewport({ width: 1024, height: 768 });
});

describe('the till sheets fit what the shell shows (sales#422)', () => {
  it('opening the discount sheet on a low phone lifts it above the tab bar by what the shell hides', async () => {
    const { pos } = await mountInShell(390, 667);
    await openDiscount(pos);

    // card 209–689, shell shows 193–601: nothing hidden above, 88 px hidden below.
    expect(insets(pos)).toEqual(['0px', '88px']);
  });

  it('the scrim takes those insets, so the sheet sits between the header and the tab bar', async () => {
    const { pos, root } = await mountInShell(390, 667);
    await openDiscount(pos);
    const scrim = getComputedStyle(root.querySelector('[data-testid="pos-discount-scrim"]')!);

    expect(scrim.position, 'still anchored to the card (sales#314)').toBe('absolute');
    // happy-dom resolves var() against the host's inline custom properties.
    expect(scrim.top, 'top follows the hidden top').toBe('0px');
    expect(scrim.bottom, 'bottom follows the hidden bottom: 88 px up, above the tab bar').toBe('88px');
  });

  it('the charge sheet — a bottom sheet on the phone — rests on the tab bar too', async () => {
    const { pos, root } = await mountInShell(390, 667);
    await setPaying(pos, true);

    expect(insets(pos)).toEqual(['0px', '88px']);
    const scrim = getComputedStyle(root.querySelector('[data-testid="pos-pay-scrim"]')!);
    expect([scrim.top, scrim.bottom]).toEqual(['0px', '88px']);
  });

  it('when the shell scrolls, the sheet follows: its header stays under the strip, not behind it', async () => {
    const { pos, card, scroller } = await mountInShell(390, 667);
    await openDiscount(pos);

    card.top = 105; card.bottom = 585; // the shell scrolled 104 px, as measured on the real shell
    scroller.dispatchEvent(new Event('scroll'));

    expect(insets(pos)).toEqual(['88px', '0px']);
    const scrim = getComputedStyle(pos.shadowRoot!.querySelector('[data-testid="pos-discount-scrim"]')!);
    expect([scrim.top, scrim.bottom], 'the scrim starts under the strip').toEqual(['88px', '0px']);
  });

  it('typing in an open sheet re-renders the till without piling up listeners', async () => {
    const { pos, card, scroller } = await mountInShell(390, 667);
    await openDiscount(pos);
    for (const k of ['1', '5']) {
      (pos.shadowRoot!.querySelector(`[data-testid="pos-discount-key-${k}"]`) as HTMLElement).click();
      await flush(pos);
    }
    await closeDiscount(pos);

    card.top = 105; card.bottom = 585;
    scroller.dispatchEvent(new Event('scroll'));
    window.dispatchEvent(new Event('resize'));

    expect(insets(pos), 'nothing left listening once it closed').toEqual(['0px', '88px']);
  });

  it('a phone on its side: the sheet spans the 249 px the shell shows, wherever the shell is scrolled', async () => {
    const { pos, view, card, scroller } = await mountInShell(667, 375);
    view.top = 60; view.bottom = 309; card.top = 76; card.bottom = 556; // measured, no strip
    await setPaying(pos, true);
    expect(insets(pos)).toEqual(['0px', '247px']);

    card.top = -187; card.bottom = 293; // scrolled to the end
    scroller.dispatchEvent(new Event('scroll'));
    expect(insets(pos)).toEqual(['247px', '0px']);
  });

  it('when the window changes (the strip goes, the phone turns), the sheet is measured again', async () => {
    const { pos, view } = await mountInShell(390, 667);
    await openDiscount(pos);

    view.top = 60; view.bottom = 601; // the strip is gone
    window.dispatchEvent(new Event('resize'));
    expect(insets(pos)).toEqual(['0px', '88px']);

    view.bottom = 700; // taller window: nothing hidden any more
    window.dispatchEvent(new Event('resize'));
    expect(insets(pos)).toEqual(['0px', '0px']);
  });

  it('closed, it stops listening: a scroll or resize after closing measures nothing', async () => {
    const { pos, card, scroller } = await mountInShell(390, 667);
    await openDiscount(pos);
    await closeDiscount(pos);

    card.top = 105; card.bottom = 585;
    scroller.dispatchEvent(new Event('scroll'));
    window.dispatchEvent(new Event('resize'));

    expect(insets(pos), 'still what it measured while open').toEqual(['0px', '88px']);
  });

  it('going from one sheet straight to another keeps following the shell', async () => {
    const { pos, card, scroller } = await mountInShell(390, 667);
    await openDiscount(pos);
    (pos as unknown as { discountSheet: unknown }).discountSheet = undefined;
    (pos as unknown as { paying: boolean }).paying = true; // same update: one scrim out, another in
    await flush(pos);

    card.top = 105; card.bottom = 585;
    scroller.dispatchEvent(new Event('scroll'));
    expect(insets(pos)).toEqual(['88px', '0px']);
  });

  it('closed before the shell handed its scroller over, it never starts listening to it', async () => {
    const { pos, card, scroller, release } = await mountInShell(390, 667, true, 'held');
    await openDiscount(pos);
    await closeDiscount(pos);
    release(); // the scroller arrives after the sheet closed
    await flush(pos);

    card.top = 105; card.bottom = 585;
    scroller.dispatchEvent(new Event('scroll'));

    expect(insets(pos)).toEqual(['0px', '88px']);
  });

  it('follows the size of the shell area itself (the strip comes or goes without a window resize)', async () => {
    const observed: { target: Element; cb: () => void; live: boolean }[] = [];
    const Real = globalThis.ResizeObserver;
    globalThis.ResizeObserver = class {
      private entry: { target: Element; cb: () => void; live: boolean } | undefined;
      constructor(private cb: () => void) {}
      observe(target: Element) { this.entry = { target, cb: this.cb, live: true }; observed.push(this.entry); }
      unobserve() {}
      disconnect() { if (this.entry) this.entry.live = false; }
    } as unknown as typeof ResizeObserver;
    try {
      const { pos, view } = await mountInShell(390, 667);
      await openDiscount(pos);
      const watch = observed.find((o) => o.target.tagName === 'ION-CONTENT' && o.live);
      expect(watch, 'the ion-content is observed').toBeTruthy();

      view.top = 60; view.bottom = 700;
      watch!.cb();
      expect(insets(pos)).toEqual(['0px', '0px']);

      await closeDiscount(pos);
      expect(watch!.live, 'closing disconnects it').toBe(false);
    } finally {
      globalThis.ResizeObserver = Real;
    }
  });

  it('removed from the page while a sheet is open, it stops listening too', async () => {
    const { pos, card, scroller } = await mountInShell(390, 667);
    await openDiscount(pos);
    pos.remove();

    card.top = 105; card.bottom = 585;
    scroller.dispatchEvent(new Event('scroll'));
    window.dispatchEvent(new Event('resize'));

    expect(insets(pos)).toEqual(['0px', '88px']);
  });

  it('opening a sheet again measures again', async () => {
    const { pos, card } = await mountInShell(390, 667);
    await openDiscount(pos);
    await closeDiscount(pos);

    card.top = 105; card.bottom = 585;
    await openDiscount(pos);

    expect(insets(pos)).toEqual(['88px', '0px']);
  });

  it('measured on open even before the shell can hand its scroller over', async () => {
    const { pos } = await mountInShell(390, 667, true, 'none');
    await openDiscount(pos);

    expect(insets(pos)).toEqual(['0px', '88px']);
  });

  it('outside a shell (no ion-content around it) the sheet keeps the whole card', async () => {
    const { pos, root } = await mountInShell(390, 667, false);
    await openDiscount(pos);

    expect(insets(pos)).toEqual(['', '']);
    const scrim = getComputedStyle(root.querySelector('[data-testid="pos-discount-scrim"]')!);
    expect([scrim.top, scrim.bottom]).toEqual(['0px', '0px']);
  });

  it('outside a shell, typing in an open sheet does not look for the shell again on every re-render', async () => {
    const { pos } = await mountInShell(390, 667, false);
    // The walk ends at the document, the one node it asks for its root: that call counts the walks.
    const rootOf = document.getRootNode.bind(document);
    let walks = 0;
    document.getRootNode = (options?: GetRootNodeOptions) => { walks++; return rootOf(options); };
    await openDiscount(pos);
    const afterOpen = walks;
    expect(afterOpen, 'opening the sheet looks for the shell once').toBeGreaterThan(0);

    for (const k of ['1', '5']) {
      (pos.shadowRoot!.querySelector(`[data-testid="pos-discount-key-${k}"]`) as HTMLElement).click();
      await flush(pos);
    }

    try {
      expect(walks, 'no shell was found on open; the re-renders do not search again').toBe(afterOpen);
    } finally {
      delete (document as { getRootNode?: unknown }).getRootNode;
    }
  });

  it('when the shell shows less than the sheet needs, the sheet scrolls and its button stays at its foot', async () => {
    // A phone on its side shows 249 px, 217 inside the scrim's padding. The discount sheet's header,
    // mode, figure and foot alone take ~230, and the charge sheet's more: MEASURED on hub:stable (md),
    // the keypad shrank to 0 px and «Apply» (300–336) and «Charge» (272–308) spilled out of their
    // sheets under the tab bar at 300. The middle keeps room for the keypad, what does not fit
    // scrolls inside the sheet, and the foot sticks to the sheet's bottom on an opaque ground so the
    // button is always on screen — never under the tab bar.
    const { pos, root } = await mountInShell(667, 375);
    await openDiscount(pos);
    const sheet = root.querySelector('[data-testid="pos-discount-scrim"] .sheet')!;

    expect(getComputedStyle(sheet).overflowY, 'what does not fit scrolls in the sheet').toBe('auto');
    const foot = getComputedStyle(sheet.querySelector('.sheet-foot')!);
    expect([foot.position, foot.bottom], 'the button stays at the foot while it scrolls').toEqual(['sticky', '0px']);
    expect(foot.backgroundColor, 'opaque: the keypad scrolls behind it, not through it').not.toMatch(/^(|transparent|rgba\(0, 0, 0, 0\))$/);
    expect(foot.backgroundColor, 'on the sheet\'s own ground').toBe(getComputedStyle(sheet).backgroundColor);
    expect(foot.zIndex, 'above the keys that scroll under it').toBe('1');
    expect(getComputedStyle(sheet.querySelector('.pay')!).minHeight, 'room for the keypad').toBe('128px');
  });

  it('with no sheet open nothing is watched: scrolling the till measures nothing', async () => {
    const { pos, scroller } = await mountInShell(390, 667);
    scroller.dispatchEvent(new Event('scroll'));
    window.dispatchEvent(new Event('resize'));

    expect(insets(pos)).toEqual(['', '']);
  });
});
