/**
 * A block as text, in scripts/kb.mjs's conventions, for the shapes the
 * fixture tree does not reach: items with no text, nested lists inside a
 * name-and-explanation item, a list inside a quote, deeper headings, bare
 * fences and figures.
 */

import { describe, expect, it } from 'vitest';

import { parsePage } from './page.js';
import { blockText, metaText } from './render.js';

const text = (block: string, body: string, slugOf = (): string | null => null): string => {
  const doc = parsePage(`## B\n<!--meta block=${block}-->\n\n${body}\n`);
  return blockText(doc, doc.blocks[0] as never, { diagrams: false, slugOf });
};

describe('blockText', () => {
  it('prints a nested list inside a named item and inside a sub-item', () => {
    expect(text('variations', '- **Name** — lead\n\n  More words.\n\n  - sub one\n  - sub two')).toBe('- [variations-item-1] **Name**: lead More words. sub one sub two');
    expect(text('description', '- top\n  - mid\n    - deep')).toBe('- [description-li-1] top\n  - mid deep');
  });

  it('prints an item with no id, and one that opens with a fence', () => {
    expect(text('variations', '> - quoted item')).toBe('- quoted item');
    expect(text('description', '- ```sh\n  run\n  ```\n\n  After.')).toBe('- [description-li-1] \n\n```sh\nrun\n```\n\nAfter.');
    expect(text('description', '- Words.\n\n  ```\n  code\n  ```')).toBe('- [description-li-1] Words.\n\n```\ncode\n```');
  });

  it('prints a relationship row with no note, and one whose link names no page', () => {
    const region = (row: string): string =>
      text('relationships', `<!-- relationships:start -->\n\n**Combines with**\n\n${row}\n\n<!-- relationships:end -->`, () => null);
    expect(region('- [Gone](./gone.md)')).toBe('Combines with:\n- Gone');
    expect(text('relationships', '<!-- relationships:start -->\n\n- [X](./x.md) — note\n\n<!-- relationships:end -->', () => 'x')).toBe('- X [x] — note');
  });

  it('prints a deeper heading as written, a figure with no caption as nothing, a fence with no language bare', () => {
    expect(text('description', '#### Run-in\n\nText.')).toBe('Run-in\n\nText.');
    expect(text('structure', '```mermaid\nflowchart LR\n```')).toBe('');
    expect(text('sketch', '```\nx\n```')).toBe('```\nx\n```');
    expect(text('description', '---\n\nAfter a rule.')).toBe('After a rule.');
  });

  it('prints an explain example paragraph under its label, and a fence example under its caption', () => {
    expect(text('explain', 'The paragraph.\n\n**Example.** Checkout calls it.')).toBe('The paragraph.\n\nEXAMPLE\n\nCheckout calls it.');
    expect(text('explain', 'The paragraph.\n\n```typescript caption="How does it look?"\nconst a = 1;\n```')).toBe(
      'The paragraph.\n\nEXAMPLE\n\nHow does it look?\n\n```typescript\nconst a = 1;\n```',
    );
    expect(text('explain', '```text\nbare\n```')).toBe('EXAMPLE\n\n```text\nbare\n```');
  });

  it('prints a paragraph that is only a bold label in the explain block as it stands', () => {
    expect(text('explain', '**Example.**')).toBe('Example.');
  });

  it('prints every heading and table row, since no level hides one', () => {
    expect(text('description', '### Shown heading\n\nShown.')).toBe('SHOWN HEADING\n\nShown.');
    expect(text('decide', '| a | b |\n| --- | --- |\n| 1 | 2 |')).toBe('| a | b |\n| 1 | 2 |');
  });
});

describe('metaText', () => {
  it('unwraps code spans; keeps a no-break space in a caption only', () => {
    expect(metaText(' a `b`  c ')).toBe('a b c');
    expect(metaText(' a `b`  c ', true)).toBe('a b  c');
  });
});
