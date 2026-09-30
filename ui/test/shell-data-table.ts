// shell-data-table — stands in for the SHELL's `<ok-data-table>` in the suites that measure what a
// list does when it could not load (pm#533).
//
// A module paints with the shell's OutfitKit (ADR-0451), registered at boot, before any screen: the
// screen's own `define()` then loses. Importing this file registers the stand-in the same way, so it
// has to be imported at the top of the test file BEFORE the screens (sales#363 forbids loading a
// screen inside a test). Whether the shell's table can paint a failed load is decided per test with
// `shellTableKnowsErrors`, which adds or removes the `error` property that
// `dataTableShowsLoadError()` of the SDK looks for.
export class ShellTable extends HTMLElement {}

const errors = new WeakMap<HTMLElement, unknown>();

customElements.define('ok-data-table', ShellTable);

/** `true`: a shell whose table paints «could not load» + Retry (OutfitKit ≥ 0.1.113). `false`: an
 *  older hub, where the screen's own notice is the only place the reason is said. */
export function shellTableKnowsErrors(yes: boolean): void {
  if (yes) {
    Object.defineProperty(ShellTable.prototype, 'error', {
      configurable: true,
      get(this: HTMLElement) { return errors.get(this) ?? ''; },
      set(this: HTMLElement, v: unknown) { errors.set(this, v); },
    });
  } else {
    delete (ShellTable.prototype as { error?: unknown }).error;
  }
}
