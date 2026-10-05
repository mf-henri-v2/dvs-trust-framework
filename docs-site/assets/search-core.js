// Search for the reading site: finding a rule or section by its number, and
// finding passages by the words in them. The search index is made when the
// site is built (lib/search.js). This module has no access to the page, so the
// tests can use it too; assets/search.js shows the results.

const STOP_WORDS = new Set(
  "a an and are as at be by for from has have in is it its of on or that the this to was were will with".split(" "),
);

/** Lower case, without accents, curly quotes or punctuation, with letters and digits apart ("GPG45" is "gpg 45"). */
export function normalise(text) {
  return String(text)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/([a-z])(\d)|(\d)([a-z])/g, (match, a, b, c, d) => (a ? `${a} ${b}` : `${c} ${d}`))
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const words = (text) => normalise(text).split(" ").filter(Boolean);

/** A plural and its singular are the same word for searching ("biometrics", "biometric"). */
const stem = (word) => (word.length > 3 && word.endsWith("ies") ? `${word.slice(0, -3)}y` : word.length > 3 && /[^s]s$/.test(word) ? word.slice(0, -1) : word);

/** The words of a query to search for: without common words such as "the", unless that is all there is. */
export function queryTerms(query) {
  const all = words(query);
  const meaningful = all.filter((word) => !STOP_WORDS.has(word));
  return [...new Set(meaningful.length ? meaningful : all)];
}

/**
 * The rule or section number a query asks for, or null. "12.4.1.c",
 * "Rule 12.4.1.C." and " section 12.4 " are all accepted.
 */
export function parseReference(query) {
  const match = /^(?:(?:rule|section|paragraph|para)\s+)?(\d{1,2}(?:\.\d{1,2})*(?:\.[a-z]{1,2})?)\.?$/i.exec(String(query).trim());
  return match ? match[1].toLowerCase() : null;
}

/** "Rule 12.4.1.c", "Section 12.4" or "Paragraph 13.a", for a number. */
export function referenceName(reference, kind) {
  if (kind === "paragraph") return `Paragraph ${reference}`;
  return /[a-z]/.test(reference) ? `Rule ${reference}` : `Section ${reference}`;
}

/** How well a word in a passage matches a search term: 0 if it does not. */
function wordScore(term, word) {
  if (word === term) return 3;
  if (stem(word) === stem(term)) return 2.5;
  if (term.length >= 3 && word.startsWith(term)) return 1.5;
  return 0;
}

const bestScore = (term, list) => list.reduce((best, word) => Math.max(best, wordScore(term, word)), 0);

/** Prepare a search index (lib/search.js) for searching. */
export function createSearch(index) {
  const pages = index.pages;
  const entries = index.entries.map((entry, order) => ({
    ...entry,
    order,
    words: words(`${entry.title ?? ""} ${entry.text ?? ""}`),
    titleWords: words(entry.title ?? ""),
    contextWords: words([pages[entry.page].title, ...(entry.context ?? [])].join(" ")),
    phrase: ` ${normalise(`${entry.title ?? ""} ${entry.text ?? ""}`)} `,
  }));
  const byReference = new Map(entries.filter((entry) => entry.ref).map((entry) => [entry.ref, entry]));

  /** The entry for a rule or section number, or undefined. */
  const lookup = (reference) => byReference.get(reference);

  /**
   * The nearest section that does exist above a number that does not: for
   * 12.4.1.z, section 12.4.1.
   */
  const nearest = (reference) => {
    const parts = reference.split(".");
    while (parts.length > 1) {
      parts.pop();
      const entry = byReference.get(parts.join("."));
      if (entry) return entry;
    }
    return undefined;
  };

  /**
   * Passages matching the words of a query, best first. Every word must be
   * in the passage or in the headings it comes under. Words in a heading or
   * glossary term, and the words together as a phrase, count for most.
   */
  const search = (query) => {
    const terms = queryTerms(query);
    if (!terms.length) return [];
    const phrase = ` ${terms.join(" ")} `;
    const results = [];
    for (const entry of entries) {
      let score = 0;
      let inTitle = 0;
      for (const term of terms) {
        const own = bestScore(term, entry.words);
        const context = own ? 0 : bestScore(term, entry.contextWords) / 3;
        if (!own && !context) {
          score = 0;
          break;
        }
        score += own + context;
        if (bestScore(term, entry.titleWords)) inTitle++;
      }
      if (!score) continue;
      if (terms.length > 1 && entry.phrase.includes(phrase)) score += 4;
      if (inTitle === terms.length) score += entry.kind === "page" || entry.kind === "heading" || entry.kind === "term" ? 6 : 2;
      if (normalise(entry.title ?? "").replace(/^[\d ]+/, "") === terms.join(" ")) score += 4;
      // A slight preference for shorter passages, where the words are more central.
      score -= Math.min(1.5, entry.words.length / 200);
      results.push({ entry, score });
    }
    return results.sort((a, b) => b.score - a.score || a.entry.order - b.entry.order).map((result) => result.entry);
  };

  /** Other passages that mention a rule or section number, such as cross-references to it. */
  const mentions = (reference, except) => {
    const pattern = new RegExp(`(^|[^\\w.])${reference.replace(/\./g, "\\.")}(?![\\w]|\\.\\w)`, "i");
    return entries.filter((entry) => entry !== except && entry.kind !== "heading" && entry.kind !== "page" && pattern.test(entry.text ?? ""));
  };

  return { pages, entries, lookup, nearest, search, mentions };
}

/**
 * The address of an entry's passage: its page at the passage's anchor.
 * `siteRoot` is the address of the site's home page, such as
 * https://ofdia-uk.github.io/dvs-trust-framework/, so this works wherever the
 * site is published.
 */
export function destination(entry, pages, siteRoot) {
  const address = new URL(pages[entry.page].url, siteRoot);
  if (entry.anchor) address.hash = entry.anchor;
  return address.href;
}

/** What a result is called: "Rule 12.4.1.c", a heading, a glossary term, or the heading a passage is under. */
export function resultTitle(entry, pages) {
  if (entry.ref && (entry.kind === "rule" || entry.kind === "paragraph")) return referenceName(entry.ref, entry.kind);
  if (entry.kind === "term") return `${entry.title} (glossary)`;
  // A row of the table of standards: the standard's name.
  if (entry.kind === "row") return entry.text.length > 150 ? `${entry.text.slice(0, entry.text.lastIndexOf(" ", 150))} …` : entry.text;
  if (entry.title) return entry.title;
  return entry.context?.at(-1) ?? pages[entry.page].title;
}

/** Where a result is: its page and the headings it comes under, without repeating its title. */
export function resultContext(entry, pages) {
  const title = resultTitle(entry, pages);
  const page = pages[entry.page];
  const trail = [page.title, ...(entry.context ?? [])].filter((part) => part !== title);
  if (entry.kind === "page" && page.part) trail.unshift(page.part);
  return trail;
}

/**
 * A short piece of a passage around the first word that matches, split into
 * parts that match and parts that do not, so the page can highlight the
 * matches without treating any text as HTML.
 */
export function excerpt(text, terms, length = 240) {
  const source = String(text ?? "");
  const stems = terms.map((term) => (stem(term) === term ? term : stem(term)));
  const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = stems.length ? new RegExp(`(?<![\\p{L}\\p{N}])(?:${stems.map(escape).join("|")})[\\p{L}\\p{N}]*`, "giu") : null;
  // Matching ignores accents and curly quotes, as the search does.
  const plain = source.normalize("NFKD").replace(/[̀-ͯ]/g, "");
  const comparable = plain.length === source.length ? plain : source;

  let start = 0;
  const first = match ? comparable.search(match) : -1;
  if (source.length > length && first > length / 4) {
    start = source.lastIndexOf(" ", first - Math.floor(length / 4));
    start = start < 0 ? 0 : start + 1;
  }
  let end = Math.min(source.length, start + length);
  if (end < source.length) {
    const space = source.lastIndexOf(" ", end);
    if (space > start) end = space;
  }

  const parts = [];
  if (start > 0) parts.push({ text: "… " });
  let position = start;
  if (match) {
    match.lastIndex = 0;
    for (const found of comparable.slice(start, end).matchAll(match)) {
      const at = start + found.index;
      if (at > position) parts.push({ text: source.slice(position, at) });
      parts.push({ text: source.slice(at, at + found[0].length), match: true });
      position = at + found[0].length;
    }
  }
  if (position < end) parts.push({ text: source.slice(position, end) });
  if (end < source.length) parts.push({ text: " …" });
  return parts;
}
