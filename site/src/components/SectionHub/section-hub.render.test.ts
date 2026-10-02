// @vitest-environment node
/**
 * What a hub page's markup has to be, asserted by rendering it.
 *
 * No `.astro` component had a test before this one, so nothing held the shape
 * of the four components that turn data into markup — and the defect this file
 * exists for is exactly that kind: every generated hub shipped with one heading,
 * its own title, because the group label was a `<p>`. `check-site-a11y` catches
 * it in `dist` now; this catches it here, where the fix is one line away
 * instead of a build away.
 *
 * The heading cases run over both variants on purpose. It is the one thing the
 * two renderings must agree on, and nothing else would notice if one of them
 * stopped agreeing.
 *
 * The `node` docblock above is load-bearing, and it is the reason every render
 * test carries one. Under the suite's default `happy-dom`, vitest resolves the
 * `.astro` import through Astro's *client* transform, so the default export is a
 * plain function with no `isAstroComponentFactory` on it and the container falls
 * through to "no valid renderer was found for this file extension" — a message
 * about renderers for a problem about environments. These tests render markup on
 * a server and assert strings; they never need a DOM.
 */

import { describe, expect, it } from 'vitest';

import { renderComponent } from '../../lib/render-fixture';

import SectionHub from './SectionHub.astro';

import type { HubGroup } from '../../lib/site-types';

const groups: HubGroup[] = [
  {
    label: '',
    pages: [
      {
        href: '/patterns/caching/cache-aside.html',
        title: 'Install it',
        description: 'How to get it.',
      },
    ],
  },
  {
    label: 'Deep dives',
    pages: [
      {
        href: '/patterns/caching/scopes.html',
        title: 'Scopes',
        description: 'Where things live.',
        status: 'draft',
      },
    ],
  },
];

const render = (props: Record<string, unknown>): Promise<string> =>
  renderComponent(SectionHub, { props });

describe('SectionHub, whichever variant', () => {
  // The heading is the invariant: it is what `check-site-a11y` fails a hub for,
  // and the body under it is a rendering choice. Asserted over both, so a
  // variant cannot quietly drop the outline the other one has.
  it.each(['list', 'cards'] as const)('gives the page an outline — %s', async (variant) => {
    const html = await render({ groups, variant });
    expect(html).toContain('<h2 class="kb-kicker">Deep dives</h2>');
  });

  it.each(['list', 'cards'] as const)('links every page once — %s', async (variant) => {
    const html = await render({ groups, variant });
    expect(html).toContain('href="/patterns/caching/cache-aside.html"');
    expect(html).toContain('href="/patterns/caching/scopes.html"');
    expect(html.match(/href="\/patterns\/caching\/cache-aside\.html"/g)).toHaveLength(1);
  });

  it.each(['list', 'cards'] as const)('carries the description — %s', async (variant) => {
    const html = await render({ groups, variant });
    expect(html).toContain('How to get it.');
    expect(html).not.toContain('kb-level');
  });

  it("names the generator's unlabelled group rather than leaving it headingless", async () => {
    // The generator labels only a group of children sharing a tag, and on a
    // folder whose pages share no topic that anonymous group is the whole
    // page. A component that skipped the heading when the label was empty
    // would leave such a hub with no outline at all.
    const html = await render({ groups: [groups[0]] });
    expect(html).toContain('<h2 class="kb-kicker">In this section</h2>');
  });

  it('calls the unlabelled group the rest when a labelled one has already had its say', async () => {
    // The generator orders groups by journey, so the anonymous one trails on
    // some hubs. "In this section" over the second half of a page claims the
    // whole of it, and the heading a reader needs there says the rest.
    const html = await render({ groups: [groups[1], groups[0]] });
    expect(html).toContain('<h2 class="kb-kicker">The rest of this section</h2>');
    expect(html).not.toContain('>In this section<');
  });

  it.each(['list', 'cards'] as const)(
    'shows a status chip for draft, and none for stable — %s',
    async (variant) => {
      expect(await render({ groups, variant })).toContain('kb-status--draft');
      const first = groups[0].pages[0];
      const stable: HubGroup[] = [{ label: 'x', pages: [{ ...first, status: 'stable' }] }];
      expect(await render({ groups: stable, variant })).not.toContain('kb-status');
      // A deprecated page names its own status.
      const deprecated: HubGroup[] = [{ label: 'x', pages: [{ ...first, status: 'deprecated' }] }];
      expect(await render({ groups: deprecated, variant })).toContain(
        '<span class="kb-status kb-status--deprecated">deprecated</span>',
      );
    },
  );

  it('renders nothing at all with no groups — a hub with no children is empty, not broken', async () => {
    expect((await render({})).trim()).toBe('');
  });
});

describe('the list, which is what a section hub gets', () => {
  it('is the default, so neither generator has to ask for it', async () => {
    const html = await render({ groups });
    expect(html).toContain('<ol class="kb-hub-list"');
    expect(html).not.toContain('kb-card-grid');
  });

  it('counts across the groups instead of restarting each one', async () => {
    // The rows are ranked by journey stage, so the whole page is one reading
    // order and the numbers say which. `start` is what carries it: a CSS
    // counter cannot be read back, and the position is content.
    const html = await render({ groups });
    expect(html).toContain('start="1"');
    expect(html).toContain('start="2"');
  });

  it('holds nothing but rows, and a row nothing but spans and an anchor', async () => {
    // All three are load-bearing. Anything other than an <li> inside the <ol>
    // fails axe's `list` rule; a <p> or a <div> inside the <li> matches
    // Starlight's list-spacing :has() and puts 1.25rem under every row; and the
    // row's grid sits on the wrapping <span> because `display: grid` on the
    // <li> would replace `list-item` and take its number with it.
    const html = await render({ groups });
    const list = html.slice(html.indexOf('<ol'), html.indexOf('</ol>'));
    expect(list.match(/<(?!\/)(?!ol\b)([a-z]+)/g)).toEqual([
      '<li',
      '<span',
      '<a',
      '<span',
      '<span',
    ]);
  });

  it('leaves the row title a link rather than a heading', async () => {
    // A list of links is already enumerable on its own. An <h3> per row would
    // put one heading per page in the rail of a page whose whole content is
    // its links.
    const html = await render({ groups });
    expect(html).toContain('<a class="kb-hub-link" href="/patterns/caching/scopes.html">');
    expect(html).not.toContain('<h3');
  });
});

describe('the cards, which are the splash', () => {
  it('renders one card per page', async () => {
    const html = await render({ groups, variant: 'cards' });
    expect(html.match(/class="kb-card"/g)).toHaveLength(2);
  });

  it('keeps the card title an h3 — one more level of the same outline', async () => {
    const html = await render({ groups, variant: 'cards' });
    expect(html).toMatch(/<h3 class="kb-card-title">\s*Scopes\s*<\/h3>/);
  });

  it('puts a card’s old anchor ids in its title, empty, so a link to one lands on the card', async () => {
    const [first, ...rest] = groups;
    const anchored: HubGroup[] = [
      {
        ...first,
        pages: first.pages.map((p, i) =>
          i === 0 ? { ...p, anchors: ['band-dist-h', 'band-msg-h'] } : p,
        ),
      },
      ...rest,
    ];
    const html = await render({ groups: anchored, variant: 'cards' });
    expect(html).toMatch(
      /<h3 class="kb-card-title">\s*<span id="band-dist-h"><\/span>\s*<span id="band-msg-h"><\/span>/,
    );
  });

  it('shows a card’s count line beside its sentence, and nothing for a card with none', async () => {
    const [first, ...rest] = groups;
    const counted: HubGroup[] = [
      {
        ...first,
        pages: first.pages.map((p, i) => (i === 0 ? { ...p, count: '216 patterns' } : p)),
      },
      ...rest,
    ];
    const html = await render({ groups: counted, variant: 'cards' });
    expect(html.match(/class="kb-card-count"/g)).toHaveLength(1);
    expect(html).toMatch(/<span class="kb-card-count">216 patterns<\/span>/);
  });

  it('puts every group in the packed grid, whatever its card count', async () => {
    // `.kb-card-grid` alone, never the --stretch variant: a card's width is a
    // property of the grid rather than of how many siblings it has, so a group
    // of one renders one card at track width and leaves the rest of the row
    // empty, which is also how the one-card next-steps block sits.
    const html = await render({ groups, variant: 'cards' });
    expect(html.match(/class="kb-card-grid"/g)).toHaveLength(2);
    expect(html).not.toContain('kb-card-grid--stretch');
  });
});

describe("the reader's marks on a list", () => {
  const pages: HubGroup[] = [
    {
      label: '',
      pages: [
        {
          href: '/a.html',
          title: 'A',
          description: '',
          slug: 'a',
          tags: ['caching'],
          favourite: true,
        },
        { href: '/b.html', title: 'B', description: '', slug: 'b', tags: ['caching'] },
        { href: '/c.html', title: 'C', description: '', slug: 'c', tags: ['resilience'] },
        { href: '/area.html', title: 'An area', description: '', tags: [] },
      ],
    },
  ];

  it('gives a page row its star, starting from its own answer, and its check; a nested area gets neither', async () => {
    const html = await render({ groups: pages });
    expect(html).toMatch(/data-kb-favourite="a" aria-pressed="true"/);
    expect(html).toMatch(/data-kb-favourite="b" aria-pressed="false"/);
    expect(html).toContain('data-kb-practiced="c"');
    const area = html.slice(html.indexOf('href="/area.html"'));
    expect(area).not.toContain('data-kb-favourite');
    expect(area).not.toContain('data-kb-practiced=');
  });

  it("writes each row's filter keys and puts the count and the bar above the list", async () => {
    const html = await render({ groups: pages });
    expect(html).toContain('data-kb-facet-keys="topic:caching"');
    expect(html).toContain('data-kb-facet-keys="topic:resilience"');
    expect(html.indexOf('data-kb-practiced-count')).toBeLessThan(html.indexOf('data-kb-facets'));
    expect(html.indexOf('data-kb-facets')).toBeLessThan(html.indexOf('<ol'));
  });

  it('leaves the count out when no row is a page, and the cards bare', async () => {
    const areas: HubGroup[] = [
      {
        label: '',
        pages: [{ href: '/area.html', title: 'An area', description: '', tags: [] }],
      },
    ];
    expect(await render({ groups: areas })).not.toContain('data-kb-practiced-count');
    const cards = await render({ groups: pages, variant: 'cards' });
    for (const hook of [
      'data-kb-facets',
      'data-kb-favourite',
      'data-kb-practiced',
      'data-kb-facet-keys',
    ])
      expect(cards).not.toContain(hook);
  });
});
