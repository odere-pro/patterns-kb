// A throwaway document for a test, and the reason every client module takes a
// `Document` instead of reaching for the global one.
//
// The modules attach listeners to the document they are given. Reusing vitest's
// ambient `document` across tests would accumulate those listeners silently,
// and a test would pass or fail depending on which ran before it. One Window
// per test makes each one isolated by construction.
//
// Test-only, and it lives in src/lib rather than beside one component because
// four `*.client.test.ts` files use it.
import { Window } from 'happy-dom';

export interface Fixture {
  window: Window;
  document: Document;
}

export function fixture(body: string): Fixture {
  const window = new Window({ url: 'https://kb.test/' });
  window.document.body.innerHTML = body;
  return { window, document: window.document as unknown as Document };
}
