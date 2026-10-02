/**
 * The current branch: which groups stay open, which become one link to their
 * hub, and that nothing on the reader's path is dropped.
 */
import { describe, expect, it } from 'vitest';

import { currentBranch, holdsCurrent, hubLink, type SidebarEntry } from './current-branch';

const link = (label: string, href: string, isCurrent = false): SidebarEntry => ({
  type: 'link',
  label,
  href,
  isCurrent,
  badge: undefined,
  attrs: {},
});
const group = (label: string, entries: SidebarEntry[]): SidebarEntry => ({
  type: 'group',
  label,
  entries,
  collapsed: true,
  badge: undefined,
});

/** Patterns > GoF > Creational, beside Hazards: the shape the site config writes. */
const tree = (current: string | null): SidebarEntry[] => {
  const at = (label: string, href: string): SidebarEntry => link(label, href, href === current);
  return [
    group('Patterns', [
      at('Overview', '/patterns.html'),
      group('Objects & Classes', [
        at('Overview', '/patterns/gof.html'),
        group('Creational', [
          at('Overview', '/patterns/gof/creational.html'),
          at('Builder', '/patterns/gof/creational/builder.html'),
          at('Factory Method', '/patterns/gof/creational/factory-method.html'),
        ]),
        group('Structural', [
          at('Overview', '/patterns/gof/structural.html'),
          at('Adapter', '/patterns/gof/structural/adapter.html'),
        ]),
      ]),
      group('Caching', [
        at('Overview', '/patterns/caching.html'),
        at('Cache-Aside', '/patterns/caching/cache-aside.html'),
      ]),
    ]),
    group('Hazards', [
      at('Overview', '/hazards.html'),
      at('God Object', '/hazards/god-object.html'),
    ]),
  ];
};

/** What a reader sees: an open group's label with its entries, a link as `label -> href`. */
const shape = (entries: readonly SidebarEntry[]): unknown[] =>
  entries.map((e) =>
    e.type === 'link'
      ? `${e.label} -> ${e.href}${e.isCurrent ? ' (current)' : ''}`
      : { [`${e.label}${e.collapsed ? ' (closed)' : ''}`]: shape(e.entries) },
  );

describe('currentBranch', () => {
  it('opens the path to the page and turns every other group into a link to its hub', () => {
    expect(shape(currentBranch(tree('/patterns/gof/creational/builder.html')))).toEqual([
      {
        Patterns: [
          'Overview -> /patterns.html',
          {
            'Objects & Classes': [
              'Overview -> /patterns/gof.html',
              {
                Creational: [
                  'Overview -> /patterns/gof/creational.html',
                  'Builder -> /patterns/gof/creational/builder.html (current)',
                  'Factory Method -> /patterns/gof/creational/factory-method.html',
                ],
              },
              'Structural -> /patterns/gof/structural.html',
            ],
          },
          'Caching -> /patterns/caching.html',
        ],
      },
      'Hazards -> /hazards.html',
    ]);
  });

  it('on a hub, opens its area and closes the areas below it to links', () => {
    expect(shape(currentBranch(tree('/patterns/gof.html')))).toEqual([
      {
        Patterns: [
          'Overview -> /patterns.html',
          {
            'Objects & Classes': [
              'Overview -> /patterns/gof.html (current)',
              'Creational -> /patterns/gof/creational.html',
              'Structural -> /patterns/gof/structural.html',
            ],
          },
          'Caching -> /patterns/caching.html',
        ],
      },
      'Hazards -> /hazards.html',
    ]);
  });

  it('on a page no group holds, the home page, shows the top-level areas alone', () => {
    expect(shape(currentBranch(tree(null)))).toEqual([
      'Patterns -> /patterns.html',
      'Hazards -> /hazards.html',
    ]);
  });

  it('keeps a top-level link, and a group with no hub link as a closed group', () => {
    const odd = [
      link('Home', '/index.html'),
      group('Loose', [group('Inner', [link('A', '/a.html')])]),
    ];
    expect(shape(currentBranch(odd))).toEqual([
      'Home -> /index.html',
      { 'Loose (closed)': [{ 'Inner (closed)': ['A -> /a.html'] }] },
    ]);
  });

  it('carries a group’s badge onto the link that stands for it', () => {
    const badge = { text: 'new', variant: 'tip' as const };
    const [only] = currentBranch([
      { ...group('Hazards', [link('Overview', '/hazards.html')]), badge },
    ]);
    expect(only).toMatchObject({ type: 'link', label: 'Hazards', href: '/hazards.html', badge });
  });

  it('marks the link that stands for a group, so it can wear the group’s look', () => {
    const [only] = currentBranch([group('Hazards', [link('Overview', '/hazards.html')])]);
    expect(only).toMatchObject({ attrs: { class: 'kb-sidebar-branch' } });
  });
});

describe('holdsCurrent and hubLink', () => {
  it('finds the page at any depth, and a group’s first direct link', () => {
    const [patterns] = tree('/patterns/gof/structural/adapter.html') as [SidebarEntry];
    expect(holdsCurrent(patterns)).toBe(true);
    expect(holdsCurrent(tree(null)[1])).toBe(false);
    expect(hubLink(patterns)?.href).toBe('/patterns.html');
    expect(hubLink(link('x', '/x.html'))).toBeUndefined();
  });
});
