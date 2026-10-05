// Markdown rendering for the reading site.
//
// The Markdown files are written for GitHub. This module renders the same
// files as web pages without changing them:
//
// - removes the repository caution banner and the "Repository navigation"
//   footer, which the site layout replaces with its own status banner and
//   page navigation;
// - uses the page's first heading as its title, and moves the remaining
//   headings up a level so each page has one <h1> and no skipped levels;
// - rewrites links between Markdown files to the site's page addresses;
// - applies GOV.UK Frontend classes to the rendered HTML;
// - uses the abbreviation definitions kept in a hidden comment in section 16
//   to explain abbreviations, and renders the bold row headings in the
//   section 15 table as table row headers, as the GOV.UK publication does;
// - gives each numbered rule (for example 12.4.1.c) an anchor, and marks it
//   for rule-level feedback;
// - gives each glossary term an anchor, so search results can link to it.

import path from "node:path";
import markdownIt from "markdown-it";
import markdownItAbbr from "markdown-it-abbr";
import markdownItAnchor from "markdown-it-anchor";
import { markdownLink, siteAddress } from "./feedback.js";

export const REPOSITORY_URL = "https://github.com/ofdia-uk/dvs-trust-framework";

const BANNER = /^<!-- caution-banner:start[^\n]*-->\r?\n[\s\S]*?^<!-- caution-banner:end -->\r?\n/m;
const REPO_FOOTER = /\r?\n(?:---|\*\*\*|___)\s*\r?\n+\*\*Repository navigation\*\*[\s\S]*$/;
const BACK_SECTION = /\r?\n## Back\s*\r?\n[\s\S]*$/;
const FIRST_HEADING = /^#{1,6}\s+(.+?)\s*#*\s*$/m;

// Section 16 keeps the GOV.UK abbreviation definitions (*[DVS]: ...) inside an
// HTML comment so that GitHub does not display them. Uncomment them for the
// site so that they explain abbreviations, as they do on GOV.UK.
const ABBREVIATION_COMMENT = /^<!-- Abbreviation definitions from the GOV\.UK publication source\.[^\n]*\r?\n([\s\S]*?)\r?\n-->[ \t]*$/m;

/** Prepare a Markdown file for rendering: remove repository-only material. */
export function stripRepositoryFurniture(source) {
  return source
    .replace(BANNER, "")
    .replace(REPO_FOOTER, "\n")
    .replace(BACK_SECTION, "\n")
    .replace(ABBREVIATION_COMMENT, "$1");
}

/** The text of the first heading in a Markdown file, used as the page title. */
export function firstHeading(source) {
  const match = stripRepositoryFurniture(source).match(FIRST_HEADING);
  return match ? match[1].replace(/<[^>]+>/g, "").trim() : "";
}

/** The site address for a repository path, or null if it is not a site page. */
export function siteUrlFor(repoPath) {
  if (repoPath === "README.md") return "/";
  if (repoPath === "CONTRIBUTING.md") return "/feedback/";
  if (repoPath.startsWith("media/")) return `/${repoPath}`;
  if (repoPath.startsWith("trust-framework-1.0/") && repoPath.endsWith(".md")) {
    return `/${repoPath.replace(/README\.md$/, "").replace(/\.md$/, "/")}`;
  }
  return null;
}

function githubSlug(text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/[^\p{L}\p{N}_\- ]/gu, "")
    .replace(/ /g, "-");
}

/**
 * Where a link in a Markdown file goes on the site. A relative link is
 * resolved against the file and mapped to a site page, or to GitHub if the
 * target is not a site page. Other links are unchanged.
 */
export function siteLinkFor(url, sourceRepoPath) {
  if (!url || /^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith("#") || url.startsWith("/")) return url;
  const [target, fragment] = url.split("#");
  const repoPath = path.posix.normalize(path.posix.join(path.posix.dirname(sourceRepoPath), decodeURI(target)));
  const siteUrl = siteUrlFor(repoPath);
  const base = siteUrl ?? `${REPOSITORY_URL}/blob/main/${repoPath}`;
  return fragment ? `${base}#${fragment}` : base;
}

// Resolve relative links against the source file and map them to site pages.
// Links to repository files that are not site pages go to GitHub instead.
function rewriteLinks(md) {
  md.core.ruler.push("site_links", (state) => {
    const inputPath = state.env?.page?.inputPath;
    if (!inputPath) return;
    const sourceRepoPath = inputPath.replace(/\\/g, "/").replace(/^(\.\.\/|\.\/)+/, "");
    const rewrite = (url) => siteLinkFor(url, sourceRepoPath);
    const visit = (tokens) => {
      for (const token of tokens) {
        if (token.type === "link_open") token.attrSet("href", rewrite(token.attrGet("href")));
        if (token.type === "image") token.attrSet("src", rewrite(token.attrGet("src")));
        if (token.children) visit(token.children);
      }
    };
    visit(state.tokens);
  });
}

// The first heading becomes the page title (rendered by the layout), so it
// is removed here and the rest are moved up to start at <h2>.
function titleAndHeadingLevels(md) {
  md.core.ruler.push("site_headings", (state) => {
    const tokens = state.tokens;
    const first = tokens.findIndex((t) => t.type === "heading_open");
    if (first === -1) return;
    tokens.splice(first, 3);
    const levels = tokens.filter((t) => t.type === "heading_open").map((t) => Number(t.tag.slice(1)));
    if (!levels.length) return;
    const shift = Math.min(...levels) - 2;
    // Never let a heading skip a level (for example the example-box headings,
    // which follow a section heading two levels up). Only the level changes.
    let previous = 1;
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type !== "heading_open") continue;
      const level = Math.min(6, Math.max(2, Number(tokens[i].tag.slice(1)) - shift), previous + 1);
      tokens[i].tag = `h${level}`;
      const close = tokens.findIndex((t, j) => j > i && t.type === "heading_close");
      tokens[close].tag = `h${level}`;
      previous = level;
    }
  });
}

// A line holding only an invisible anchor (<a id="section-12"></a>) would
// otherwise render as an empty paragraph with spacing around it.
function bareAnchors(md) {
  const anchorOnly = /^(\s*<a\s+id="[^"]+"\s*><\/a>\s*)+$/;
  md.core.ruler.push("bare_anchors", (state) => {
    const tokens = state.tokens;
    for (let i = 0; i + 2 < tokens.length; i++) {
      if (tokens[i].type === "paragraph_open" && tokens[i + 1].type === "inline" && anchorOnly.test(tokens[i + 1].content)) {
        tokens[i].hidden = true;
        tokens[i + 2].hidden = true;
      }
    }
  });
}

// Row headings in a single-column table are written as bold cells (the
// section 15 table of standards). Render them as <th scope="row">, as GOV.UK
// does. A cell counts only if its whole content is bold.
function boldRowHeaders(md) {
  md.core.ruler.push("bold_row_headers", (state) => {
    const tokens = state.tokens;
    let columns = 0;
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (token.type === "table_open") {
        const firstRowEnd = tokens.findIndex((t, j) => j > i && t.type === "tr_close");
        columns = tokens.slice(i, firstRowEnd).filter((t) => t.type === "th_open" || t.type === "td_open").length;
        continue;
      }
      if (token.type !== "td_open" || columns !== 1) continue;
      // Ignore whitespace-only text around the bold run.
      const children = (tokens[i + 1]?.children ?? []).filter((c) => !(c.type === "text" && c.content.trim() === ""));
      const whollyBold =
        children.length >= 3 &&
        children[0].type === "strong_open" &&
        children.at(-1).type === "strong_close" &&
        children.slice(1, -1).every((c) => c.type !== "strong_open" && c.type !== "strong_close");
      if (!whollyBold) continue;
      token.tag = "th";
      token.attrSet("scope", "row");
      token.meta = { ...(token.meta || {}), rowHeader: true };
      tokens[i + 2].tag = "th";
      tokens[i + 1].children = children.slice(1, -1);
    }
  });
}

// Rules. A rule is a paragraph that starts with its number, for example
// "12.4.1.c. Where relevant ...". The text is unchanged. Each rule gets:
//
// - an anchor made from its number (section-12_4_1_c), in the same form as
//   the GOV.UK heading anchors (section-12_4_1), so a link can go straight
//   to it;
// - on trust framework pages, a block around the rule and everything that
//   belongs to it, such as a list. The block says which rule it is, the
//   "Rule, paragraph or page" value for a feedback issue (the rule number
//   as a Markdown link to it), and the heading it comes under. The page's rule
//   picker and assets/rule-actions.js use them.
//
// Both are made when the site is built, so new rules get them automatically.
// The tests fail if a paragraph looks like a rule but does not match.
export const RULE_NUMBER = /^(\d+(?:\.\d+)+(?:\.[a-z]+)+)\.?(?=\s|$)/;

/** The anchor for a rule number: "12.4.1.c" becomes "section-12_4_1_c". */
export const ruleAnchor = (number) => `section-${number.replace(/\./g, "_")}`;

/**
 * Where the numbered rules are in a list of block tokens: ruleAt(i) is the
 * number of the rule that starts at token i, if any, and endsRule(i) says
 * whether token i ends the rule before it. A rule ends at the next heading,
 * horizontal rule, rule or hidden anchor paragraph (which comes before a
 * heading), so it includes its lists. The renderer and the search index
 * (lib/search.js) both use this, so they agree on what belongs to a rule.
 */
export function ruleBoundaries(tokens) {
  const topLevelParagraph = (i) => tokens[i].type === "paragraph_open" && tokens[i].level === 0;
  const ruleAt = (i) => (topLevelParagraph(i) ? RULE_NUMBER.exec(tokens[i + 1]?.content ?? "")?.[1] : undefined);
  const endsRule = (i) =>
    tokens[i].type === "heading_open" || tokens[i].type === "hr" || (topLevelParagraph(i) && (tokens[i].hidden || ruleAt(i)));
  return { ruleAt, endsRule };
}

function rules(md) {
  md.core.ruler.push("rules", (state) => {
    const inputPath = state.env?.page?.inputPath ?? "";
    const repoPath = inputPath.replace(/\\/g, "/").replace(/^(\.\.\/|\.\/)+/, "");
    const withFeedback = repoPath.startsWith("trust-framework-1.0/");
    const plainText = (inline) =>
      (inline.children ?? []).filter((t) => t.type === "text" || t.type === "code_inline").map((t) => t.content).join("").trim();
    const tokens = state.tokens;
    const { ruleAt, endsRule } = ruleBoundaries(tokens);
    const html = (content) => Object.assign(new state.Token("html_block", "", 0), { content });
    const attr = (value) => md.utils.escapeHtml(value);
    const blockStart = (number, heading) => {
      const reference = markdownLink(number, siteAddress(siteUrlFor(repoPath), ruleAnchor(number)));
      return html(
        `<div class="app-rule-block" data-rule="${attr(number)}" data-reference="${attr(reference)}" data-heading="${attr(heading)}">\n`,
      );
    };
    const out = [];
    let current = null;
    let heading = "";
    for (let i = 0; i < tokens.length; i++) {
      if (current && endsRule(i)) {
        if (withFeedback) out.push(html("</div>\n"));
        current = null;
      }
      if (tokens[i].type === "heading_open") heading = plainText(tokens[i + 1]);
      const number = ruleAt(i);
      if (number) {
        tokens[i].attrSet("id", ruleAnchor(number));
        tokens[i].attrJoin("class", "app-rule");
        if (withFeedback) out.push(blockStart(number, heading));
        current = number;
      }
      out.push(tokens[i]);
    }
    if (current && withFeedback) out.push(html("</div>\n"));
    state.tokens = out;
  });
}

// Glossary terms. In a table whose first column is headed "Term" (the
// glossary in section 16), each row gets an anchor made from its term, for
// example #term-identity-repair, so a search result can go straight to it.
// The text is unchanged.
export const termAnchor = (term) => `term-${githubSlug(term)}`;

function termAnchors(md) {
  md.core.ruler.push("term_anchors", (state) => {
    const tokens = state.tokens;
    const used = new Set();
    let glossary = false;
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (token.type === "thead_open") glossary = tokens[i + 3]?.content.trim() === "Term";
      if (!glossary || token.type !== "tr_open" || tokens[i + 1]?.type !== "td_open") continue;
      const term = tokens[i + 2].content.trim();
      if (!term) continue;
      let id = termAnchor(term);
      for (let n = 2; used.has(id); n++) id = `${termAnchor(term)}-${n}`;
      used.add(id);
      token.attrSet("id", id);
      token.attrJoin("class", "app-term");
    }
  });
}

function govukClasses(md) {
  const addClass = (name, classes) => {
    const previous = md.renderer.rules[name] ?? ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));
    md.renderer.rules[name] = (tokens, idx, options, env, self) => {
      const token = tokens[idx];
      const value = typeof classes === "function" ? classes(token) : classes;
      if (value) token.attrJoin("class", value);
      return previous(tokens, idx, options, env, self);
    };
  };
  const headingClass = { h2: "govuk-heading-l", h3: "govuk-heading-m", h4: "govuk-heading-s", h5: "govuk-heading-s", h6: "govuk-heading-s" };
  addClass("heading_open", (t) => headingClass[t.tag]);
  addClass("paragraph_open", (t) => (t.hidden ? "" : "govuk-body"));
  addClass("bullet_list_open", "govuk-list govuk-list--bullet");
  addClass("ordered_list_open", "govuk-list govuk-list--number");
  addClass("blockquote_open", "govuk-inset-text");
  addClass("link_open", "govuk-link");
  addClass("hr", "govuk-section-break govuk-section-break--l govuk-section-break--visible");
  addClass("table_open", "govuk-table");
  addClass("thead_open", "govuk-table__head");
  addClass("tbody_open", "govuk-table__body");
  addClass("tr_open", "govuk-table__row");
  addClass("th_open", (t) => {
    t.attrSet("scope", "col");
    return "govuk-table__header";
  });
  addClass("td_open", (t) => (t.meta?.rowHeader ? "govuk-table__header" : "govuk-table__cell"));
  // Wrap tables so wide ones scroll horizontally instead of widening the page.
  const tableOpen = md.renderer.rules.table_open;
  md.renderer.rules.table_open = (...args) => `<div class="app-table-wrapper">\n${tableOpen(...args)}`;
  md.renderer.rules.table_close = () => "</table>\n</div>\n";
  addClass("code_inline", "app-code");
}

export const markdownLibrary = markdownIt({ html: true, linkify: false, typographer: false })
  .use(markdownItAbbr)
  .use(titleAndHeadingLevels)
  .use(markdownItAnchor, { slugify: githubSlug, tabIndex: false })
  .use(rewriteLinks)
  .use(bareAnchors)
  .use(rules)
  .use(boldRowHeaders)
  .use(termAnchors)
  .use(govukClasses);
