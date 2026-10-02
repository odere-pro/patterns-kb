/**
 * The description block's shape (KB-015), judged on parsed nodes: one paragraph
 * of at most 80 words, and each way to break it.
 */

import { describe, expect, it } from 'vitest';

import { DESCRIPTION_WORDS_MAX, descriptionProblems } from './description-shape.js';
import { parseKb, type Nodes } from './kb-attrs.js';

/** The nodes under a description heading, as the gate and the lint hand them over. */
const nodesOf = (body: string): Nodes[] => parseKb(`## What it is\n<!--meta block=description-->\n\n${body}`).tree.children.slice(1) as Nodes[];
const words = (n: number): string => Array.from({ length: n }, (_, i) => `w${String(i)}`).join(' ');

describe('descriptionProblems', () => {
  it('passes one paragraph of up to 80 words', () => {
    expect(DESCRIPTION_WORDS_MAX).toBe(80);
    expect(descriptionProblems(nodesOf(words(1)))).toEqual([]);
    expect(descriptionProblems(nodesOf(words(80)))).toEqual([]);
  });

  it('counts a link by its text', () => {
    expect(descriptionProblems(nodesOf(`[${words(40)}](../x.md) ${words(40)}`))).toEqual([]);
  });

  it('names the length of a paragraph past 80 words, at its line, with the words for a ratchet', () => {
    expect(descriptionProblems(nodesOf(words(81)))).toEqual([{ message: 'the description is 81 words — say what the page is for in 80 or fewer', line: 4, words: 81 }]);
  });

  it('names a block of several paragraphs, at the second', () => {
    expect(descriptionProblems(nodesOf(`${words(10)}\n\n${words(10)}\n\n${words(10)}`))).toEqual([{ message: 'the description holds 3 paragraphs — it is one paragraph', line: 6 }]);
  });

  it('names a block that holds something other than a paragraph, at it, and still counts every word', () => {
    expect(descriptionProblems(nodesOf(`${words(10)}\n\n- ${words(80)}`))).toEqual([
      { message: 'the description holds a list — it is one paragraph', line: 6 },
      { message: 'the description is 90 words — say what the page is for in 80 or fewer', line: 4, words: 90 },
    ]);
  });

  it('reports an empty block at no line, and skips the meta line', () => {
    const empty = [{ message: 'the description block is empty — say what the page is for in 80 words or fewer' }];
    expect(descriptionProblems([])).toEqual(empty);
    expect(descriptionProblems(nodesOf(''))).toEqual(empty);
  });

  it('carries no line for nodes that have no position', () => {
    const para = (n: number): Nodes => ({ type: 'paragraph', children: [{ type: 'text', value: words(n) }] }) as unknown as Nodes;
    expect(descriptionProblems([para(2), para(2)])).toEqual([{ message: 'the description holds 2 paragraphs — it is one paragraph' }]);
    expect(descriptionProblems([para(81)])).toEqual([{ message: 'the description is 81 words — say what the page is for in 80 or fewer', words: 81 }]);
  });
});
