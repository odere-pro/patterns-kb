// Whether a page's opening paragraph already says its purpose line.
//
// The title block shows the page's `description` (PageIntro). On many converted pages the body's first paragraph opens with
// that same sentence and carries on — "Stops calling a service that's already
// failing — so callers fail fast …" — so a reader met it twice in two lines.
// Where the lead repeats it, the intro is left out and the lead says it once.

/** Markdown and HTML that open a body without being its lead paragraph. */
const NOT_LEAD = /^(?:#|<|\{\/\*|import\s|export\s|[-*+]\s|\d+\.\s|>|```|~~~|\||:::)/;

/** Inline markdown read as the words a reader sees, lower-cased, whitespace collapsed. */
export function plainWords(text: string): string {
  return text
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`]/g, '')
    .replace(/\{[#.][^}]*\}\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * The first paragraph of a page body, as plain words: the first run of text
 * lines once comments, imports and blank lines are passed. A body that opens
 * with a heading, a list, a quote, a fence or markup has no lead: ''.
 */
export function leadText(body: string | undefined): string {
  const lines = (body ?? '').split('\n');
  let i = 0;
  for (; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (
      line === '' ||
      /^<!--[\s\S]*-->$/.test(line) ||
      /^import\s/.test(line) ||
      /^\{\/\*[\s\S]*\*\/\}$/.test(line)
    )
      continue;
    break;
  }
  const out: string[] = [];
  for (; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (line === '' || (out.length === 0 && NOT_LEAD.test(line))) break;
    out.push(line);
  }
  return plainWords(out.join(' '));
}

/** Does the body's lead open with the purpose line, word for word? */
export function leadRepeats(description: string, body: string | undefined): boolean {
  const said = plainWords(description).replace(/[.!?]+$/, '');
  return said !== '' && leadText(body).startsWith(said);
}
