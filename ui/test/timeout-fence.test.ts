// sales#363 — once a test of a file times out, the rest of that file does not run.
//
// Vitest gives up on a test at its timeout but cannot stop it: its promise keeps going. A till
// mounted by that test keeps calling `globalThis.erplora`, which by then is the double the NEXT test
// installed — so the next test reads another test's lines and totals («192,00 €» where it expected
// «71,00 €»), and the report shows a till bug that does not exist. The timeout is the one true
// failure; everything after it in the same file is noise. The fence lives in the shared double, so
// every suite that mounts a component gets it without a hook of its own.
import { afterAll, describe, expect, it } from 'vitest';
import { installErploraDouble } from './erplora-double';

let ranAfterTheTimeout = false;

describe('a timed-out test fences off the rest of its file', () => {
  // `fails`: the timeout IS the expected outcome here, so this file stays green while still going
  // through the exact path a real timeout goes through.
  it.fails('times out, and its promise never settles (as a stuck mount would)', { timeout: 50 }, async () => {
    installErploraDouble();
    await new Promise(() => {});
  });

  it('does not run: it would read whatever the timed-out test left behind', () => {
    ranAfterTheTimeout = true;
  });
});

afterAll(() => {
  expect(ranAfterTheTimeout, 'a test ran after its file timed out, on top of the stuck test').toBe(false);
});
