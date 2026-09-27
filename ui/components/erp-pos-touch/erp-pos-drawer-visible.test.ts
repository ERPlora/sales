// sales#420 — on a phone, the open cart drawer fits the part of the till the SHELL shows.
//
// The shell floors a module screen at 480 px (hub#1730: `.outlet{min-height:480px}`) and lets its
// own scroller (ion-content) show the rest. With the «You can't invoice yet» strip up, a 390×667
// phone shows ~408 px of it, and a phone on its side shows ~250 px with no strip at all. The drawer
// was `position:absolute; top:0; bottom:0` over the till's body — the 480 px box, not what is on
// screen — so its foot (the total and Charge) sat under the tab bar (measured 565–688 against a
// tab bar at 601), and once the shell scrolled, its header went up under the strip.
//
// The fix measures, while the drawer is open, how much of the body the shell's ion-content shows
// and hands the hidden top and bottom over as insets: the drawer spans exactly the visible part,
// its foot on screen and its lines scrolling inside, as on Square or Toast. It follows the shell
// scroller and the window while open, and stops listening when it closes.
//
// happy-dom does not lay out, so the rects are stubbed with the numbers measured on the real shell
// (hub:stable, 390×667 with the strip); that it really fits is measured in a browser (the PR).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installPosDouble } from '../../test/pos-double';
import './erp-pos-touch';

type HappyWindow = Window & { happyDOM?: { setViewport(v: { width: number; height: number }): void } };
type Pos = HTMLElement & { updateComplete: Promise<unknown> };
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
  const body: Box = { top: 210, bottom: 688 };
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
  stubRect(root.querySelector('.body')!, () => body);
  return { pos, root, view, body, scroller, release };
}

async function openCart(pos: Pos): Promise<void> {
  (pos.shadowRoot!.querySelector('[data-testid="pos-cart-fab"]') as HTMLElement).click();
  await flush(pos);
}

async function closeCart(pos: Pos): Promise<void> {
  (pos.shadowRoot!.querySelector('[data-testid="pos-cart-backdrop"]') as HTMLElement).click();
  await flush(pos);
}

const insets = (pos: Pos) => [pos.style.getPropertyValue('--pos-cart-top'), pos.style.getPropertyValue('--pos-cart-bottom')];

afterEach(() => {
  document.body.innerHTML = '';
  (window as HappyWindow).happyDOM?.setViewport({ width: 1024, height: 768 });
});

describe('the open cart drawer fits what the shell shows (sales#420)', () => {
  it('opening it on a low phone lifts its foot above the tab bar by what the shell hides', async () => {
    const { pos } = await mountInShell(390, 667);
    await openCart(pos);

    // body 210–688, shell shows 193–601: nothing hidden above, 87 px hidden below.
    expect(insets(pos)).toEqual(['0px', '87px']);
  });

  it('the drawer takes those insets on a phone, so it spans exactly the visible part', async () => {
    const { pos, root } = await mountInShell(390, 667);
    await openCart(pos);
    const cart = getComputedStyle(root.querySelector('.cart')!);

    expect(cart.position, 'still a drawer over the body').toBe('absolute');
    // happy-dom resolves var() against the host's inline custom properties.
    expect(cart.top, 'top follows the hidden top').toBe('0px');
    expect(cart.bottom, 'bottom follows the hidden bottom: 87 px up, above the tab bar').toBe('87px');
  });

  it('when the shell scrolls, the drawer follows: its header stays under the strip, not behind it', async () => {
    const { pos, body, scroller } = await mountInShell(390, 667);
    await openCart(pos);

    body.top = 106; body.bottom = 584; // the shell scrolled 104 px, as measured on the real shell
    scroller.dispatchEvent(new Event('scroll'));

    expect(insets(pos)).toEqual(['87px', '0px']);
    const cart = getComputedStyle(pos.shadowRoot!.querySelector('.cart')!);
    expect([cart.top, cart.bottom]).toEqual(['87px', '0px']);
  });

  it('when the window changes (the strip goes, the phone turns), the drawer is measured again', async () => {
    const { pos, view } = await mountInShell(390, 667);
    await openCart(pos);

    view.top = 60; // the strip is gone: the shell shows 60–601
    view.bottom = 601;
    window.dispatchEvent(new Event('resize'));

    expect(insets(pos)).toEqual(['0px', '87px']);
    view.bottom = 700; // taller window: nothing hidden any more
    window.dispatchEvent(new Event('resize'));
    expect(insets(pos)).toEqual(['0px', '0px']);
  });

  it('closed, it stops listening: a scroll after closing measures nothing', async () => {
    const { pos, body, scroller } = await mountInShell(390, 667);
    await openCart(pos);
    await closeCart(pos);

    body.top = 106; body.bottom = 584;
    scroller.dispatchEvent(new Event('scroll'));
    window.dispatchEvent(new Event('resize'));

    expect(insets(pos), 'still what it measured while open').toEqual(['0px', '87px']);
  });

  it('closed before the shell handed its scroller over, it never starts listening to it', async () => {
    const { pos, body, scroller, release } = await mountInShell(390, 667, true, 'held');
    await openCart(pos);
    await closeCart(pos);
    release(); // the scroller arrives after the drawer closed
    await flush(pos);

    body.top = 106; body.bottom = 584;
    scroller.dispatchEvent(new Event('scroll'));

    expect(insets(pos)).toEqual(['0px', '87px']);
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
      await openCart(pos);
      const watch = observed.find((o) => o.target.tagName === 'ION-CONTENT');
      expect(watch, 'the ion-content is observed').toBeTruthy();

      view.top = 60; view.bottom = 700;
      watch!.cb();
      expect(insets(pos)).toEqual(['0px', '0px']);

      await closeCart(pos);
      expect(watch!.live, 'closing disconnects it').toBe(false);
    } finally {
      globalThis.ResizeObserver = Real;
    }
  });

  it('removed from the page while open, it stops listening too', async () => {
    const { pos, body, scroller } = await mountInShell(390, 667);
    await openCart(pos);
    pos.remove();

    body.top = 106; body.bottom = 584;
    scroller.dispatchEvent(new Event('scroll'));
    window.dispatchEvent(new Event('resize'));

    expect(insets(pos)).toEqual(['0px', '87px']);
  });

  it('opening it again measures again', async () => {
    const { pos, body } = await mountInShell(390, 667);
    await openCart(pos);
    await closeCart(pos);

    body.top = 106; body.bottom = 584;
    await openCart(pos);

    expect(insets(pos)).toEqual(['87px', '0px']);
  });

  it('its lines keep a minimum, and when the shell shows less than that the drawer scrolls inside', async () => {
    // 320×568 with the strip leaves ~283 px, a phone on its side ~232: the header (~145) and the
    // foot (~125) alone take it all, and without a floor the lines shrank to 0 px — the cashier saw
    // the total of a ticket whose lines could not be reached. With the floor the drawer overflows
    // and scrolls on its own, still inside what the shell shows, never under the tab bar.
    const { pos, root } = await mountInShell(390, 667);
    await openCart(pos);

    expect(getComputedStyle(root.querySelector('.cart ion-content.cart-body')!).minHeight, 'room for the first line').toBe('80px');
    expect(getComputedStyle(root.querySelector('.cart')!).overflowY, 'what does not fit scrolls in the drawer').toBe('auto');
  });

  it('measured on open even before the shell can hand its scroller over', async () => {
    const { pos } = await mountInShell(390, 667, true, 'none');
    await openCart(pos);

    expect(insets(pos)).toEqual(['0px', '87px']);
  });

  it('outside a shell (no ion-content around it) the drawer keeps the whole body', async () => {
    const { pos, root } = await mountInShell(390, 667, false);
    await openCart(pos);

    expect(insets(pos)).toEqual(['', '']);
    expect(getComputedStyle(root.querySelector('.cart')!).bottom).toBe('0px');
  });

  it('on a wide screen the cart is a column, not a drawer: the insets do not apply', async () => {
    const { pos, root } = await mountInShell(1280, 800);
    pos.style.setProperty('--pos-cart-bottom', '87px');
    await pos.updateComplete;
    const cart = getComputedStyle(root.querySelector('.cart')!);

    expect(cart.position).toBe('relative');
    expect(cart.bottom).not.toBe('87px');
    expect(cart.overflowY, 'the column never scrolls as a whole: its lines do').not.toBe('auto');
    expect(getComputedStyle(root.querySelector('.cart ion-content.cart-body')!).minHeight, 'declared as written: happy-dom keeps 0').toBe('0');
  });

  it('mounted inside another component\'s shadow root, it still finds the shell around that component', async () => {
    (window as HappyWindow).happyDOM?.setViewport({ width: 390, height: 667 });
    installPosDouble({});
    document.body.innerHTML = '';
    const content = document.createElement('ion-content') as HTMLElement & { getScrollElement?: () => Promise<HTMLElement> };
    content.getScrollElement = () => Promise.resolve(document.createElement('div'));
    stubRect(content, () => ({ top: 193, bottom: 601 }));
    const wrapper = document.createElement('div');
    content.appendChild(wrapper);
    document.body.appendChild(content);
    const pos = document.createElement('erp-pos-touch') as Pos;
    wrapper.attachShadow({ mode: 'open' }).appendChild(pos);
    await pos.updateComplete;
    stubRect(pos.shadowRoot!.querySelector('.body')!, () => ({ top: 210, bottom: 688 }));

    await openCart(pos);

    expect(insets(pos)).toEqual(['0px', '87px']);
  });

  it('a re-render while it is open does not look the shell up again', async () => {
    const { pos } = await mountInShell(390, 667);
    const content = pos.closest('ion-content') as HTMLElement & { getScrollElement: () => Promise<HTMLElement> };
    const lookup = content.getScrollElement;
    let lookups = 0;
    content.getScrollElement = () => { lookups++; return lookup(); };
    await openCart(pos);
    expect(lookups).toBe(1);

    (pos as unknown as { requestUpdate(): void }).requestUpdate();
    await flush(pos);

    expect(lookups, 'the till re-renders on every cart change; it keeps the one watch').toBe(1);
  });

  it('when the shell cannot hand its scroller over, the drawer keeps what it measured on open and says so', async () => {
    const { pos } = await mountInShell(390, 667);
    const content = pos.closest('ion-content') as HTMLElement & { getScrollElement: () => Promise<HTMLElement> };
    content.getScrollElement = () => Promise.reject(new Error('scroller gone'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await openCart(pos);

      expect(insets(pos)).toEqual(['0px', '87px']);
      expect(warn, 'the failure is visible in the log, not swallowed').toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
    }
  });
});
