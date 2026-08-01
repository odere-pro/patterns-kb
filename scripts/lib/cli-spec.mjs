/* cli-spec.mjs — the kb.mjs command surface, as data.
 *
 * This is the vocabulary an agent actually types, and it used to exist three times: a
 * header comment in kb.mjs, a summary in the root CLAUDE.md, and nothing machine-readable
 * at all. Nothing checked the copies against each other, and they had already drifted —
 * `set --essence` shipped undocumented.
 *
 * So the spec is the source and the prose is the render: kb.mjs prints its usage from
 * here, and build-vocab.mjs renders the same entries onto vocab.html. Adding a subcommand
 * means adding it here, once.
 *
 * It lives outside model.mjs deliberately. model.mjs is the KB's taxonomy and ontology —
 * what a page IS. A CLI verb is neither; it is how you reach one.
 *
 *   name    the subcommand
 *   args    the positional signature, as it appears after the name
 *   group   "read" (never writes) or "write" (edits a page through the validated writer)
 *   desc    one sentence, interpolated RAW so it may carry <code>
 *   flags   [{ flag, desc }] — desc may be omitted where the flag speaks for itself
 *   note    optional extra paragraphs, the caveats that stop someone using it wrongly
 */

export const CLI_COMMANDS = [
  /* ---- read ---- */
  {
    name: "find", args: "<query…>", group: "read",
    desc: "Search names, essences, aliases, tags and symptoms. The way in from a symptom you can describe but cannot name.",
    flags: [
      { flag: "--tag <t>" }, { flag: "--band <b>" }, { flag: "--kind <k>" },
      { flag: "--level <l>", desc: "search only prose visible at that reading level" },
    ],
  },
  {
    name: "get", args: "<id>", group: "read",
    desc: "One page, cleaned of styles, scripts and navigation chrome — or one block of it.",
    flags: [
      { flag: "--block <b>", desc: "just that block, about 180 tokens instead of 3,600" },
      { flag: "--level <l>", desc: "scope to a reading level" },
      { flag: "--diagrams", desc: "keep the mermaid source, omitted by default as noise" },
    ],
    note: "On the <code>wild</code> and <code>production</code> blocks, <code>--json</code> also dumps <code>items</code> in the writers' own shape — edit one entry and hand the lot back, rather than re-typing the neighbours from rendered prose and dropping their level tags and inline <code>&lt;code&gt;</code>.",
  },
  {
    name: "brief", args: "<query…>", group: "read",
    desc: "One-call scout bundle: the find hits, the governing theme's decide table, and the typed neighbours of the top hits.",
    flags: [{ flag: "--theme <id>" }, { flag: "--tag <t>" }, { flag: "--band <b>" }, { flag: "--kind <k>" }, { flag: "--n <5>" }],
    note: "Replaces the three to six calls an agent otherwise spends re-deriving exactly this sequence.",
  },
  {
    name: "related", args: "<id>", group: "read",
    desc: "The typed neighbours — what it combines with, what replaces it, what it gets confused for.",
    flags: [],
  },
  {
    name: "backlinks", args: "<id>", group: "read",
    desc: "What points here: typed inbound edges plus the prose mentions that never became edges.",
    flags: [],
  },
  {
    name: "refs", args: "[<id>]", group: "read",
    desc: "What this page points AT, read live off the page rather than off the build: relations, prose links, theme members, mermaid clicks.",
    flags: [{ flag: "--file <path>" }],
    note: "Read live, so an edit that changed what a page uses can be reconciled before the build sees it.",
  },
  {
    name: "ls", args: "", group: "read",
    desc: "List pages, filtered.",
    flags: [{ flag: "--band <b>" }, { flag: "--kind <k>" }],
  },
  {
    name: "validate", args: "[<id>]", group: "read",
    desc: "Structural lint against the data contract. No argument validates every page.",
    flags: [{ flag: "--file <path>" }],
  },

  /* ---- write ---- */
  {
    name: "set", args: "<id>", group: "write",
    desc: "Set the page's root metadata. Each flag takes JSON where the value is a list, so the attribute survives a comma inside a sentence.",
    flags: [
      { flag: "--aliases '[\"CB\"]'" }, { flag: "--tags '[…]'" }, { flag: "--solves '[…]'" },
      { flag: "--essence \"…\"" },
      { flag: "--favourite true|false", desc: "the editorial pick — a &#9733; chip and a hub filter" },
    ],
  },
  {
    name: "wild", args: "<id>", group: "write",
    desc: "Replace the &ldquo;In the wild&rdquo; block — real, well-known implementations only.",
    flags: [{ flag: "--items '[{\"id\":\"envoy\",\"name\":\"Envoy\",\"note\":\"…\"}]'" }],
    note: "Replaces the WHOLE block, so re-supply every item. Dump the current one with <code>get --block wild --json</code>, which returns exactly this shape. Each item takes an optional <code>level</code>; text may carry <code>&lt;code&gt;</code> and all other markup is escaped.",
  },
  {
    name: "production", args: "<id>", group: "write",
    desc: "Replace the production block: what it takes to run the pattern.",
    flags: [
      { flag: "--knobs '[{\"label\":…,\"note\":…}]'" }, { flag: "--signals '[…]'" },
      { flag: "--failures '[…]'" }, { flag: "--checklist '[\"…\"]'" },
    ],
    note: "Replaces the whole block, same as <code>wild</code>. Any list may be empty and its card is simply omitted — but each of the four is checked by name at every lens, so tagging every knob up a lens leaves a basic reader looking at an empty heading.",
  },
  {
    name: "explain", args: "<id>", group: "write",
    desc: "Write the three-rung ladder. All three rungs are required, and they stack — the reader at expert sees all three.",
    flags: [{ flag: "--basic \"…\"" }, { flag: "--advanced \"…\"" }, { flag: "--expert \"…\"" }],
    note: "A sentence repeated across rungs is a defect. All three empty removes the block.",
  },
  {
    name: "level", args: "<id> <element-id> <basic|advanced|expert|none>", group: "write",
    desc: "THE lens mechanism — accretion: visible from this level up. Untagged content is the basic core every reader sees.",
    flags: [],
  },
  {
    name: "register", args: "<id> <element-id> <basic|advanced|expert|none>", group: "write",
    desc: "RARE — replacement: rendered at exactly this lens, instead of its simpler sibling.",
    flags: [],
    note: "For the few places where showing both versions at once would be wrong. Elements only: sections always show, at every lens. An element carries at most one of <code>level</code> and <code>register</code>.",
  },
  {
    name: "link", args: "<from> <verb> <to>", group: "write",
    desc: "Declare a relationship. Writes both sides at once, which is what keeps the graph bidirectional.",
    flags: [{ flag: "--note \"…\"" }, { flag: "--note-back \"…\"" }],
    note: "Each side may phrase its note its own way; only the edge and its verb must agree.",
  },
  {
    name: "unlink", args: "<a> <b>", group: "write",
    desc: "Drop the edge from both pages, whatever verb each side declared. Re-typing an edge is <code>unlink</code> then <code>link</code>.",
    flags: [],
  },
  {
    name: "new", args: "<id>", group: "write",
    desc: "Scaffold a page with every block its kind requires, in order.",
    flags: [
      { flag: "--kind <k>" }, { flag: "--band <b>" }, { flag: "--group <g>" },
      { flag: "--name \"…\"" }, { flag: "--order <n>" }, { flag: "--tags '[…]'" },
    ],
    note: "The other writers report an unknown id until <code>build.mjs</code> has run, because they resolve ids through the built graph. Scaffold, build, then set.",
  },
];

/* Flags that apply to every command rather than one. */
export const CLI_GLOBAL_FLAGS = [
  { flag: "--json", desc: "structured output instead of text" },
  { flag: "--diagrams", desc: "keep the mermaid source, omitted by default as noise" },
];

/* The terminal rendering, used by kb.mjs for its own usage text. Plain text: strips the
 * <code> and entity markup the descriptions carry for the HTML side. */
const plain = (s) => s
  .replace(/<\/?code>/g, "`")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&ldquo;|&rdquo;/g, '"').replace(/&#9733;/g, "*")
  .replace(/&amp;/g, "&");

export function usageText(header = "") {
  const out = header ? [header, ""] : [];
  for (const group of ["read", "write"]) {
    out.push(group === "read" ? "Reading:" : "\nWriting (authoring goes through here, so the data stays well-formed):");
    for (const c of CLI_COMMANDS.filter((c) => c.group === group)) {
      out.push(`  kb.mjs ${c.name}${c.args ? " " + c.args : ""}${c.flags.map((f) => ` [${plain(f.flag)}]`).join("")}`);
      out.push(`      ${plain(c.desc)}`);
      for (const f of c.flags.filter((f) => f.desc)) out.push(`      ${plain(f.flag)}  ${plain(f.desc)}`);
      if (c.note) out.push(`      ${plain(c.note)}`);
    }
  }
  out.push("");
  for (const f of CLI_GLOBAL_FLAGS) out.push(`  ${f.flag}${" ".repeat(Math.max(1, 12 - f.flag.length))}${plain(f.desc)}`);
  return out.join("\n");
}
