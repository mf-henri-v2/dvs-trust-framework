// The search index for the reading site's search page (/search/).
//
// The index is made from the trust framework Markdown when the site is built,
// so it never needs updating by hand. Each section file is parsed with the
// same Markdown renderer as its page, so every anchor in the index is one the
// page has, and a rule includes exactly what the page shows as part of it (its
// lists, for example). Only the numbered sections are indexed: the contents
// pages, the feedback guidance, the "What's changed" pages and everything the
// site layout adds (navigation, banners, feedback links) are not.
//
// The index lists the pages and, for each page, entries for:
//
// - the page itself and each heading, with its number if it has one
//   (12, 12.4, 12.4.1), linking to the GOV.UK anchor before the heading;
// - each numbered rule (12.4.1.c), with its lists, linking to the rule;
// - each numbered paragraph that is not a rule on the site, such as 13.a at
//   the start of section 13, linking to where it is;
// - each other paragraph, with its lists, linking to the heading it is under;
// - each glossary term, linking to the term;
// - each row of other tables, such as the table of standards in section 15,
//   linking to the heading it is under.
//
// Each entry has the headings it comes under, so a result can say where it is.
// Page addresses are relative to the root of the site (no leading "/"), so the
// search page can resolve them against wherever the site is published.

import fs from "node:fs";
import { markdownLibrary, stripRepositoryFurniture, ruleBoundaries } from "./markdown.js";

/** The number at the start of a heading, for example "12.4.1" in "12.4.1. Fraud monitoring". */
export const HEADING_NUMBER = /^(\d+(?:\.\d+)*)\.?(?=\s|$)/;

/** A paragraph numbered like a rule but with one number before its letter, for example "13.a.". */
const NUMBERED_PARAGRAPH = /^(\d+(?:\.\d+)*(?:\.[a-z]+)+)\.?(?=\s|$)/;

const ANCHOR_ONLY =/^\s*<a\s+id="([^"]+)"\s*><\/a>\s*$/;

/** The text of an inline token, without markup. */
function inlineText(inline) {
  return (inline?.children ?? [])
    .map((t) => (t.type === "text" || t.type === "code_inline" ? t.content : t.type === "softbreak" || t.type === "hardbreak" ? " " : ""))
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

/** The search entries for one section file. `page` is the index of its page in the index. */
export function searchEntries(source, repoPath, page = 0) {
  const tokens = markdownLibrary.parse(stripRepositoryFurniture(source), { page: { inputPath: `../${repoPath}` } });
  const { ruleAt, endsRule } = ruleBoundaries(tokens);
  const entries = [];
  const headings = []; // the headings the current position is under: { level, text, anchor }
  let current = null; // the entry being collected
  let inRule = false;
  let anchorBefore = null; // a GOV.UK anchor just before the next block
  let listDepth = 0;
  let table = null;

  const context = () => headings.map((heading) => heading.text);
  const underHeading = () => headings.at(-1)?.anchor ?? "";
  const add = (entry) => {
    const text = entry.text?.replace(/\s+/g, " ").trim();
    entries.push(
      Object.fromEntries(
        Object.entries({ page, ...entry, text }).filter(([, value]) => value !== undefined && value !== "" && !(Array.isArray(value) && !value.length)),
      ),
    );
  };
  const flush = () => {
    if (current?.text.trim()) add(current);
    current = null;
  };
  const start = (entry) => {
    flush();
    current = { ...entry, context: context(), text: "" };
  };
  const append = (text) => {
    if (!text) return;
    if (!current) start({ kind: "text", anchor: underHeading() });
    current.text += ` ${text}`;
  };

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (inRule && endsRule(i)) {
      flush();
      inRule = false;
    }
    switch (token.type) {
      case "heading_open": {
        flush();
        const text = inlineText(tokens[i + 1]);
        const level = Number(token.tag.slice(1));
        while (headings.length && headings.at(-1).level >= level) headings.pop();
        const anchor = anchorBefore ?? token.attrGet("id");
        add({ kind: "heading", ref: HEADING_NUMBER.exec(text)?.[1], anchor, title: text, context: context() });
        headings.push({ level, text, anchor });
        anchorBefore = null;
        i += 2;
        continue;
      }
      case "paragraph_open": {
        const anchorOnly = token.hidden && token.level === 0 && ANCHOR_ONLY.exec(tokens[i + 1]?.content ?? "");
        if (anchorOnly) {
          anchorBefore = anchorOnly[1];
          i += 2;
          continue;
        }
        const number = ruleAt(i);
        if (number) {
          start({ kind: "rule", ref: number, anchor: token.attrGet("id") });
          inRule = true;
        } else if (!inRule && !listDepth && !table) {
          // Paragraphs such as "13.a." at the start of a section are numbered,
          // but are not rules on the site, so they have no anchor of their
          // own. They can still be looked up by number, and link to where
          // they are.
          const paragraph = token.level === 0 ? NUMBERED_PARAGRAPH.exec(tokens[i + 1]?.content ?? "")?.[1] : undefined;
          start({ kind: paragraph ? "paragraph" : "text", ref: paragraph, anchor: underHeading() });
        }
        break;
      }
      case "bullet_list_open":
      case "ordered_list_open":
        listDepth++;
        break;
      case "bullet_list_close":
      case "ordered_list_close":
        listDepth--;
        break;
      case "hr":
        flush();
        break;
      case "table_open":
        // A table inside a rule is part of the rule; any other table's rows are entries.
        if (!inRule) flush();
        table = { inRule, glossary: false, group: "", row: [], head: false };
        break;
      case "thead_open":
        table.head = true;
        table.glossary = tokens[i + 3]?.content.trim() === "Term";
        break;
      case "thead_close":
        table.head = false;
        break;
      case "tr_open":
        table.row = [];
        table.rowId = token.attrGet("id");
        break;
      case "inline":
        if (table) table.row.push({ text: inlineText(token), rowHeader: Boolean(tokens[i - 1].meta?.rowHeader) });
        else append(inlineText(token));
        break;
      case "tr_close": {
        const cells = table.row.filter((cell) => cell.text);
        if (!cells.length) break;
        if (table.inRule) append(cells.map((cell) => cell.text).join(" "));
        else if (table.head) break;
        else if (cells.length === 1 && cells[0].rowHeader) table.group = cells[0].text;
        else if (table.glossary && table.rowId) {
          add({ kind: "term", anchor: table.rowId, title: cells[0].text, context: context(), text: cells.slice(1).map((cell) => cell.text).join(" ") });
        } else {
          const where = table.group ? [...context(), table.group] : context();
          add({ kind: "row", anchor: underHeading(), context: where, text: cells.map((cell) => cell.text).join(" ") });
        }
        break;
      }
      case "table_close":
        table = null;
        break;
    }
    if (token.nesting === 1) anchorBefore = null;
  }
  flush();
  return entries;
}

/**
 * The search index for the trust framework sections, in reading order. Each
 * section is { url, title, repoPath, part }, where url is the page's site
 * address (for example /trust-framework-1.0/part-3/12-service-requirements/)
 * and part is the title of its part, if it has one.
 *
 * With the rule identities (lib/rule-identities.js), each rule's entry also
 * has its permanent identity (id), and the index lists the rule numbers that
 * are no longer used as they were:
 *
 * - former: each number that one or more identities used to have, and which
 *   ones, so that a search for an old number can say what it is now;
 * - identities: each identity that is not a rule in the working draft
 *   (retired) or that has had another number, with its status and its
 *   current or last number.
 */
export function buildSearchIndex(
  sections,
  readSource = (repoPath) => fs.readFileSync(new URL(`../../${repoPath}`, import.meta.url), "utf-8"),
  identities = null,
) {
  const pages = [];
  const entries = [];
  for (const section of sections) {
    const page = pages.length;
    pages.push(Object.fromEntries(Object.entries({ url: section.url.replace(/^\//, ""), title: section.title, part: section.part }).filter(([, v]) => v)));
    entries.push({ page, kind: "page", ref: HEADING_NUMBER.exec(section.title)?.[1], title: section.title });
    entries.push(...searchEntries(readSource(section.repoPath), section.repoPath, page));
  }
  if (!identities) return { pages, entries };
  for (const entry of entries) {
    if (entry.kind === "rule") entry.id = identities.byNumber[entry.ref];
  }
  const former = Object.entries(identities.formerHolders).map(([ref, holders]) => ({ ref, ids: holders.map((holder) => holder.id) }));
  const listed = identities.list
    .filter((identity) => identity.status !== "current" || identity.history.length)
    .map((identity) => ({ id: identity.id, status: identity.status, ref: identity.number }));
  return { pages, entries, former, identities: listed };
}
