/**
 * The reasons on the prerequisite card: a relation's note is read from the
 * side of the page the reader is on, as plain text, and missing notes or a
 * missing file leave the link bare.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadNotes, notesFrom, plainNote, reasonFor, RELATIONS } from './relation-notes';
import { repoRoot } from './repo-root';

describe('plainNote', () => {
  it('turns links into their words and drops code and emphasis marks', () => {
    expect(plainNote('Pair with [retry](../retry.md), then `trip` the **breaker**.')).toBe(
      'Pair with retry, then trip the breaker.',
    );
  });

  it('collapses runs of space and trims the ends', () => {
    expect(plainNote('  one \n  two  ')).toBe('one two');
  });

  it('leaves a lone asterisk or underscore inside a word alone', () => {
    expect(plainNote('a * b and snake_case_name')).toBe('a * b and snake_case_name');
  });
});

describe('notesFrom', () => {
  it('stores each side under its own page: a’s note on a, b’s note on b', () => {
    const notes = notesFrom([{ a: 'x', b: 'y', note_a: 'x says', note_b: 'y says' }]);
    expect(reasonFor(notes, 'x', 'y')).toBe('x says');
    expect(reasonFor(notes, 'y', 'x')).toBe('y says');
  });

  it('keeps the first note for a pair joined twice, and skips an empty or missing one', () => {
    const notes = notesFrom([
      { a: 'x', b: 'y', note_a: 'first' },
      { a: 'x', b: 'y', note_a: 'second', note_b: '   ' },
    ]);
    expect(reasonFor(notes, 'x', 'y')).toBe('first');
    expect(reasonFor(notes, 'y', 'x')).toBeUndefined();
  });

  it('ignores a record that names no page', () => {
    expect(notesFrom([{ note_a: 'orphan' }]).size).toBe(0);
  });
});

describe('loadNotes', () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-notes-'));
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('reads the relations file, and again after it changes', () => {
    fs.mkdirSync(path.join(root, 'docs/data'), { recursive: true });
    const file = path.join(root, RELATIONS);
    fs.writeFileSync(file, JSON.stringify({ relations: [{ a: 'x', b: 'y', note_a: 'one' }] }));
    expect(reasonFor(loadNotes(root), 'x', 'y')).toBe('one');
    fs.writeFileSync(file, JSON.stringify({ relations: [{ a: 'x', b: 'y', note_a: 'two' }] }));
    fs.utimesSync(file, new Date(), new Date(Date.now() + 5000));
    expect(reasonFor(loadNotes(root), 'x', 'y')).toBe('two');
  });

  it('gives no notes for a tree with no file, and for a file that is not JSON', () => {
    expect(loadNotes(root).size).toBe(0);
    fs.mkdirSync(path.join(root, 'docs/data'), { recursive: true });
    fs.writeFileSync(path.join(root, RELATIONS), '{ not json');
    expect(loadNotes(path.join(root, '.')).size).toBe(0);
  });

  it('reads the real tree: the circuit breaker says why it needs a timeout', () => {
    const notes = loadNotes(repoRoot());
    expect(reasonFor(notes, 'circuit-breaker', 'timeout-deadline')).toMatch(/slowness/);
  });
});
