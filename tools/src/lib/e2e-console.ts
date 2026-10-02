/**
 * What the reader's flows (tools/e2e/) may find in the browser console: nothing,
 * but for a short list of messages named with their reason and the flows that
 * print them. The fixture in tools/e2e/fixtures.ts collects each flow's console
 * errors and uncaught page errors and asks `judgeConsole` about them.
 */

/**
 * One console message a flow is known to cause, and may not do without. A
 * message nothing names fails the flow that printed it; an entry whose message
 * a named flow never printed fails that flow too, so an allowance the site has
 * outgrown does not linger.
 */
export interface ExpectedConsole {
  readonly name: string;
  /** Matched against the text of a console error or an uncaught page error. */
  readonly match: RegExp;
  /** The flows (their titles) that print it, and so are held to printing it. */
  readonly flows: readonly string[];
  readonly reason: string;
}

/** The messages one flow printed that no entry of its own names, and its entries it never printed. */
export function judgeConsole(
  title: string,
  messages: readonly string[],
  expected: readonly ExpectedConsole[],
): { unexpected: string[]; missing: string[] } {
  const mine = expected.filter((e) => e.flows.includes(title));
  return {
    unexpected: messages.filter((m) => !mine.some((e) => e.match.test(m))),
    missing: mine.filter((e) => !messages.some((m) => e.match.test(m))).map((e) => e.name),
  };
}
