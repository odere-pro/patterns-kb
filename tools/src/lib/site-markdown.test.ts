/**
 * The site's markdown plugins, run the way Astro runs them: remark-parse with
 * GFM, `remarkKbSite`, remark-rehype, then — standing in for rehype-mermaid,
 * which needs a browser — a step that swaps each mermaid block for the inline
 * SVG it would draw, then `rehypeKbDiagrams`.
 *
 * What is held here is the two-layer shape (spec kb.pagedata.two-layers): a
 * fact lands as a bare data-* on a class-free element, and a construct whose
 * renderer wears classes gets a class-free wrapper to carry it.
 */

import rehypeStringify from 'rehype-stringify';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';
import { VFile } from 'vfile';
import { describe, expect, it } from 'vitest';

import { figureFor, kindName, metaInline, rehypeKbDiagrams, rehypeKbTables, remarkKbSite, textOf, type HastNode } from './site-markdown.js';

/** rehype-mermaid's inline-svg output, reduced to what the plugin reads. */
function fakeMermaid() {
  return (tree: HastNode): void => {
    let n = 0;
    const walk = (node: HastNode): void => {
      const kids = node.children ?? [];
      kids.forEach((k, i) => {
        const code = k.tagName === 'pre' ? k.children?.[0] : undefined;
        const cls = code?.properties?.['className'];
        if (Array.isArray(cls) && cls.includes('language-mermaid')) {
          kids[i] = { type: 'element', tagName: 'svg', properties: { id: `mermaid-${n++}`, 'aria-roledescription': 'flowchart-v2' }, children: [] };
        } else walk(k);
      });
    };
    walk(tree);
  };
}

function render(md: string | Uint8Array): { html: string; messages: string[] } {
  const file = new VFile({ value: md });
  const html = String(
    unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkKbSite)
      .use(remarkRehype)
      .use(fakeMermaid)
      .use(rehypeKbDiagrams)
      .use(rehypeKbTables)
      .use(rehypeStringify)
      .processSync(file),
  );
  return { html, messages: file.messages.map((m) => `${m.ruleId}:${m.line}:${m.reason}`) };
}

const page = (body: string): string => `# Title\n\nIntro.\n\n## What it is\n<!--meta block=description-->\n\n${body}\n`;

describe('rehypeKbTables — each anchored row named by a row header', () => {
  it('makes an id’d body row’s first cell its row header, and leaves the head row and the other cells alone', () => {
    const { html } = render(page('| Criterion | Kafka |\n| --- | --- |\n| Ordering | per partition |\n| **Licence** | Apache-2.0 {level=advanced} |'));
    expect(html).toContain('<tr>\n<th>Criterion</th>\n<th>Kafka</th>\n</tr>');
    expect(html).toContain('<tr id="description-row-1">\n<th scope="row">Ordering</th>\n<td>per partition</td>');
    expect(html).toContain('<th scope="row"><strong>Licence</strong></th>');
  });

  it('leaves a row with no id, and one led by a header already, as it is', () => {
    const tree: HastNode = {
      type: 'root',
      children: [
        {
          type: 'element',
          tagName: 'table',
          children: [
            {
              type: 'element',
              tagName: 'tbody',
              children: [
                { type: 'element', tagName: 'tr', properties: {}, children: [{ type: 'element', tagName: 'td', children: [] }] },
                { type: 'element', tagName: 'tr', properties: { id: 'r' }, children: [{ type: 'text', value: ' ' }, { type: 'element', tagName: 'th', children: [] }] },
                { type: 'element', tagName: 'tr', properties: { id: 's' }, children: [] },
              ],
            },
          ],
        },
        { type: 'element', tagName: 'tr', properties: { id: 'outside' }, children: [{ type: 'element', tagName: 'td', children: [] }] },
      ],
    };
    (rehypeKbTables as unknown as () => (t: unknown) => void)()(tree);
    const rows = (((tree.children?.[0] as HastNode).children?.[0] as HastNode).children ?? []) as HastNode[];
    expect(rows.map((r) => (r.children ?? []).filter((c) => c.type === 'element').map((c) => c.tagName))).toEqual([['td'], ['th'], []]);
    expect((tree.children?.[1] as HastNode).children?.[0]?.tagName).toBe('td');
  });
});

describe('remarkKbSite — facts as bare data-* on class-free elements', () => {
  it('gives a block heading its block name as its id, and a suffixed paragraph its own id', () => {
    const { html } = render(page('Plain words.\n\nDeeper words. {#deeper}'));
    expect(html).toContain('<h2 id="description">What it is</h2>');
    expect(html).toContain('<p id="description-p-1">Plain words.</p>');
    expect(html).toContain('<p id="deeper">Deeper words.</p>');
  });

  it('puts a list item’s, a row’s and a list’s ids on the li, the tr and the ul', () => {
    const { html } = render(page('- one\n- two {#two}\n\n{#the-list}\n\n| A | B |\n| --- | --- |\n| x | y {#row-x} |'));
    expect(html).toMatch(/<ul id="the-list">/);
    expect(html).toContain('<li id="two">two</li>');
    expect(html).toMatch(/<tr id="row-x">/);
  });

  it('reports a grammar problem as a vfile message, keeping the words', () => {
    const { html, messages } = render(page('Words. {level=basic}'));
    expect(messages.some((m) => m.startsWith('suffix:'))).toBe(true);
    expect(html).toContain('{level=basic}');
  });

  it('reads a page handed over as bytes', () => {
    expect(render(new TextEncoder().encode(page('Bytes.'))).html).toContain('<p id="description-p-1">Bytes.</p>');
  });
});

describe('remarkKbSite — fences', () => {
  it('wraps a sketch in <details> carrying its id, the summary its meta text', () => {
    const { html } = render(page('~~~ts summary="Sketch `run()` here"\nrun();\n~~~'));
    expect(html).toContain(
      '<details id="description-sketch-1"><summary>Sketch <code>run()</code> here</summary><pre><code class="language-ts">run();\n</code></pre></details>',
    );
  });

  it('wraps a plain fence that carries an id in a class-free div, and leaves one that carries nothing alone', () => {
    const { html } = render(`\`\`\`sh\necho top\n\`\`\`\n\n${page('```sh\necho hi\n```')}`);
    expect(html).toContain('<pre><code class="language-sh">echo top\n</code></pre>');
    expect(html).toContain('<div id="description-sketch-1"><pre><code class="language-sh">echo hi\n</code></pre></div>');
  });

  it('wraps a captioned fence in a figure carrying its id, the caption a figcaption under the code', () => {
    const { html } = render(page('~~~sh caption="How does `run` start?"\nrun\n~~~'));
    expect(html).toContain(
      '<figure id="description-sketch-1"><pre><code class="language-sh">run\n</code></pre><figcaption>How does <code>run</code> start?</figcaption></figure>',
    );
    expect(html).not.toContain('kb-diagram');
  });

  it('lets a summary keep a fence that carries both', () => {
    const { html } = render(page('~~~sh summary="Sketch" caption="Ask"\nrun\n~~~'));
    expect(html).toContain('<details id="description-sketch-1"><summary>Sketch</summary>');
    expect(html).not.toContain('<figcaption>');
  });

  it('frames a diagram: the class-free div carries the facts, the figure holds the svg and the caption', () => {
    const { html } = render(page('~~~mermaid caption="How a `take` works" wide=true\nflowchart LR\n  A --> B\n~~~'));
    expect(html).toMatch(/^[\s\S]*<div id="description-fig-1"><figure class="kb-diagram kb-wide kb-diagram--wide not-content" data-kb-diagram="">/);
    expect(html).not.toContain('data-kb-wide');
    expect(html).toContain('<svg id="mermaid-0" aria-roledescription="flowchart-v2" aria-label="How a take works">');
    expect(html).toMatch(/<\/div><figcaption>How a <code>take<\/code> works<\/figcaption><\/figure><\/div>/);
    expect(html.match(/data-kb-diagram-act="/g)).toHaveLength(4);
  });

  it('names an uncaptioned diagram by what mermaid says it drew', () => {
    const { html } = render(page('```mermaid\nflowchart LR\n  A --> B\n```'));
    expect(html).toContain('aria-label="Flowchart diagram"');
    expect(html).toContain('<figure class="kb-diagram kb-wide not-content"');
  });
});

describe('remarkKbSite — prose sketches', () => {
  it('turns a quote into <details>, its bold first paragraph the summary', () => {
    const { html } = render(page('> **Why it fails**\n>\n> Because.\n\n{#why}'));
    expect(html).toContain('<details id="why">\n<summary>Why it fails</summary>\n<p id="description-p-1">Because.</p>\n</details>');
  });

  it('drops the thematic break of a quote with no summary, and leaves a quote whose lead is not one bold run', () => {
    const none = render(page('> ***\n>\n> Only words.'));
    expect(none.html).toContain('<details id="description-sketch-1">\n<p id="description-p-1">Only words.</p>\n</details>');
    const plain = render(page('> Not **bold** alone.'));
    expect(plain.html).toContain('<details id="description-sketch-1">\n<p>Not <strong>bold</strong> alone.</p>\n</details>');
  });
});

describe('metaInline', () => {
  it('splits fence meta text into words and code spans', () => {
    expect(metaInline('a `b` c')).toEqual([
      { type: 'text', value: 'a ' },
      { type: 'inlineCode', value: 'b' },
      { type: 'text', value: ' c' },
    ]);
    expect(metaInline('`` x`y `` end')).toEqual([
      { type: 'inlineCode', value: 'x`y' },
      { type: 'text', value: ' end' },
    ]);
    expect(metaInline('')).toEqual([]);
  });
});

describe('rehypeKbDiagrams and its helpers', () => {
  const svg = (props: Record<string, unknown>, children: HastNode[] = []): HastNode => ({ type: 'element', tagName: 'svg', properties: props, children });

  it('frames a diagram outside any wrapper, uncaptioned', () => {
    const tree: HastNode = { type: 'root', children: [svg({ id: 'mermaid-3' })] };
    rehypeKbDiagrams.call(unified())?.(tree as never, new VFile(), () => undefined);
    const fig = tree.children?.[0] as HastNode;
    expect(fig.tagName).toBe('figure');
    expect(fig.children).toHaveLength(2);
    expect(((fig.children?.[1] as HastNode).children?.[0] as HastNode).children?.[0]?.properties?.['aria-label']).toBe('Diagram');
  });

  it('leaves a diagram that names itself alone, and passes an svg that is no diagram', () => {
    const named = svg({ id: 'mermaid-1', ariaLabel: 'Own name' });
    figureFor(named, undefined, false);
    expect(named.properties).toEqual({ id: 'mermaid-1', ariaLabel: 'Own name' });
    const icon: HastNode = { type: 'root', children: [svg({ id: 'icon' })] };
    rehypeKbDiagrams.call(unified())?.(icon as never, new VFile(), () => undefined);
    expect((icon.children?.[0] as HastNode).tagName).toBe('svg');
  });

  it('gives a diagram with no properties an accessible name', () => {
    const bare: HastNode = { type: 'element', tagName: 'svg' };
    figureFor(bare, undefined, false);
    expect(bare.properties).toEqual({ 'aria-label': 'Diagram' });
  });

  it('reads mermaid’s role description in either spelling', () => {
    expect(kindName(svg({ 'aria-roledescription': 'sequence' }))).toBe('Sequence diagram');
    expect(kindName(svg({ ariaRoleDescription: 'state-v2' }))).toBe('State diagram');
    expect(kindName({ type: 'element' })).toBe('Diagram');
  });

  it('collapses the text of a subtree', () => {
    expect(
      textOf({ type: 'element', children: [{ type: 'text', value: ' a \n' }, { type: 'element', children: [{ type: 'text', value: 'b ' }] }, { type: 'text' }, { type: 'element' }] }),
    ).toBe('a b');
  });

  it('keeps a wrapper’s other children in place around the figure', () => {
    const cap: HastNode = { type: 'element', tagName: 'figcaption', children: [{ type: 'text', value: 'Cap' }] };
    const wrapper: HastNode = { type: 'element', tagName: 'div', children: [{ type: 'text', value: '\n' }, svg({ id: 'mermaid-0' }), { type: 'text', value: '\n' }, cap] };
    rehypeKbDiagrams.call(unified())?.({ type: 'root', children: [wrapper] } as never, new VFile(), () => undefined);
    expect(wrapper.children?.map((k) => k.tagName ?? k.type)).toEqual(['text', 'figure', 'text']);
    expect((wrapper.children?.[1] as HastNode).children?.at(-1)).toBe(cap);
  });

  it('passes over an svg with no id, or no properties at all', () => {
    const tree: HastNode = { type: 'root', children: [svg({}), { type: 'element', tagName: 'svg' }] };
    rehypeKbDiagrams.call(unified())?.(tree as never, new VFile(), () => undefined);
    expect(tree.children?.map((k) => k.tagName)).toEqual(['svg', 'svg']);
  });
});

describe('remarkKbSite on a tree with no source positions', () => {
  it('reports a problem with no line as a message with no place', () => {
    const file = new VFile({ value: '' });
    const tree = { type: 'root', children: [{ type: 'html', value: '<!--meta block=description-->' }] };
    remarkKbSite.call(unified())?.(tree as never, file, () => undefined);
    expect(file.messages).toHaveLength(1);
    expect(file.messages[0]?.line).toBeUndefined();
    expect(file.messages[0]?.ruleId).toBe('fact');
  });
});

describe('the relationships block', () => {
  it('renders its list and no figure', () => {
    const md = [
      '## How it relates',
      '<!--meta block=relationships-->',
      '',
      '<!-- relationships:start -->',
      '',
      '**Requires**',
      '',
      '- [Timeout](/patterns/timeout.html) — Bound it',
      '',
      '<!-- relationships:end -->',
      '',
    ].join('\n');
    const { html } = render(md);
    expect(html).toContain('Timeout');
    expect(html).not.toContain('data-kb-neighbours');
    expect(html).not.toContain('data-kb-diagram');
    expect(html).not.toContain('mermaid');
  });
});
