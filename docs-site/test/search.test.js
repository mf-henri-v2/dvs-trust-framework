// Tests for search: the index made from the trust framework (lib/search.js)
// and the search itself (assets/search-core.js). Run with: npm test
//
// Most tests use the real trust framework files, so they fail if a change to
// the text or the renderer stops a rule being found.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { markdownLibrary, stripRepositoryFurniture, firstHeading, siteUrlFor, RULE_NUMBER, ruleAnchor } from "../lib/markdown.js";
import { buildSearchIndex, searchEntries, HEADING_NUMBER } from "../lib/search.js";
import {
  createSearch,
  parseReference,
  referenceName,
  normalise,
  queryTerms,
  destination,
  resultTitle,
  resultContext,
  excerpt,
} from "../assets/search-core.js";

const SITE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = path.resolve(SITE_DIR, "..");

const SECTIONS = fs
  .readdirSync(path.join(REPO_ROOT, "trust-framework-1.0"), { recursive: true })
  .map((file) => `trust-framework-1.0/${file.replace(/\\/g, "/")}`)
  .filter((repoPath) => /\/\d\d-[^/]+\.md$/.test(repoPath))
  .sort((a, b) => path.basename(a).localeCompare(path.basename(b)));

const read = (repoPath) => fs.readFileSync(path.join(REPO_ROOT, repoPath), "utf-8");
const INDEX = buildSearchIndex(SECTIONS.map((repoPath) => ({ url: siteUrlFor(repoPath), title: firstHeading(read(repoPath)), repoPath })));
const search = createSearch(INDEX);

const SECTION_12 = "trust-framework-1.0/part-3/12-service-requirements/";
const ROOT = "http://localhost:8080/";
const PAGES = "https://ofdia-uk.github.io/dvs-trust-framework/";

/** Where a query's top results go, as page#anchor. */
const top = (query, count) => search.search(query).slice(0, count).map((entry) => `${INDEX.pages[entry.page].url}#${entry.anchor ?? ""}`);

// --- Exact references -------------------------------------------------------

test("recognises rule and section numbers, ignoring case, spaces, a full stop and a leading 'rule' or 'section'", () => {
  for (const query of ["12.4.1.c", "12.4.1.C", " 12.4.1.c. ", "rule 12.4.1.c", "Rule 12.4.1.C.", "RULE  12.4.1.c"]) {
    assert.equal(parseReference(query), "12.4.1.c", query);
  }
  assert.equal(parseReference("12.4"), "12.4");
  assert.equal(parseReference("section 12"), "12");
  assert.equal(parseReference("12."), "12");
  for (const query of ["identity repair", "GPG 45", "2025", "12.4.1.c fraud", "", "rule"]) assert.equal(parseReference(query), null, query);
});

test("names references as rules or sections", () => {
  assert.equal(referenceName("12.4.1.c", "rule"), "Rule 12.4.1.c");
  assert.equal(referenceName("12.4", "heading"), "Section 12.4");
  assert.equal(referenceName("13.a", "paragraph"), "Paragraph 13.a");
});

test("finds rule 12.4.1.c, with the headings it comes under, at its anchor", () => {
  const entry = search.lookup(parseReference("Rule 12.4.1.C."));
  assert.equal(entry.kind, "rule");
  assert.equal(resultTitle(entry, INDEX.pages), "Rule 12.4.1.c");
  assert.deepEqual(resultContext(entry, INDEX.pages), ["12. Service requirements", "12.4. Fraud management", "12.4.1. Fraud monitoring"]);
  assert.match(entry.text, /^12\.4\.1\.c\. Where relevant to your service, your monitoring processes must include:/);
  assert.equal(destination(entry, INDEX.pages, PAGES), `${PAGES}${SECTION_12}#section-12_4_1_c`);
});

test("a rule includes the list that belongs to it, and stops before the next rule", () => {
  const entry = search.lookup("12.1.3.a");
  assert.match(entry.text, /identify the person; and\/or decide if the person is eligible for something\.$/);
  assert.doesNotMatch(entry.text, /12\.1\.3\.b/);
});

test("finds subsections and sections at their GOV.UK anchors, and sections at the top of their page", () => {
  assert.equal(destination(search.lookup("12.4"), INDEX.pages, ROOT), `${ROOT}${SECTION_12}#section-12_4`);
  assert.equal(destination(search.lookup("12.4.1"), INDEX.pages, ROOT), `${ROOT}${SECTION_12}#section-12_4_1`);
  assert.equal(search.lookup("12").title, "12. Service requirements");
  assert.equal(destination(search.lookup("12"), INDEX.pages, ROOT), `${ROOT}${SECTION_12}`);
  assert.equal(search.lookup("0").title, "0. Version and certification validity notes");
  // Headings without a full stop after their number.
  assert.equal(search.lookup("10.1").anchor, "section-10_1");
  assert.equal(search.lookup("2.1.2").anchor, "section-2_1_2");
});

test("numbered paragraphs that are not rules on the site can still be found, at the place they are", () => {
  const entry = search.lookup("13.a");
  assert.equal(entry.kind, "paragraph");
  assert.equal(entry.anchor, undefined);
  assert.equal(destination(entry, INDEX.pages, ROOT), `${ROOT}trust-framework-1.0/part-3/13-the-register-of-digital-identity-and-attribute-services/`);
});

test("a number that does not exist is not found, and is never replaced by another", () => {
  for (const reference of ["12.4.1.z", "12.99", "99", "12.4.1.c.d"]) assert.equal(search.lookup(reference), undefined, reference);
  // The nearest section that does exist is offered separately, and named as such.
  assert.equal(search.nearest("12.4.1.z").ref, "12.4.1");
  assert.equal(search.nearest("99"), undefined);
});

test("lists other passages that mention a rule or section number", () => {
  const titles = search.mentions("12.4", search.lookup("12.4")).map((entry) => resultTitle(entry, INDEX.pages));
  assert.ok(titles.length > 0);
  assert.ok(!titles.includes("12.4. Fraud management"));
  // 12.4 is not mentioned by text that only mentions 12.4.1 or 12.41.
  for (const entry of search.mentions("12.4", null)) assert.match(entry.text, /(^|[^\w.])12\.4(?![\w]|\.\w)/);
});

// --- The index ---------------------------------------------------------------

test("every rule and every numbered heading in the trust framework can be found by its number", () => {
  for (const repoPath of SECTIONS) {
    const source = stripRepositoryFurniture(read(repoPath));
    for (const [, number] of source.matchAll(/^(\d+(?:\.\d+)+(?:\.[a-z]+)+)\.?(?=\s)/gm)) {
      if (!RULE_NUMBER.test(number)) continue;
      const entry = search.lookup(number);
      assert.ok(entry, `rule ${number} (${repoPath}) is not in the search index`);
      assert.equal(entry.anchor, ruleAnchor(number));
    }
    for (const [, heading] of source.matchAll(/^#{2,6}\s+(.+)$/gm)) {
      const number = HEADING_NUMBER.exec(heading.trim())?.[1];
      if (number) assert.ok(search.lookup(number), `heading ${number} (${repoPath}) is not in the search index`);
    }
  }
  const refs = INDEX.entries.filter((entry) => entry.ref).map((entry) => entry.ref);
  assert.equal(new Set(refs).size, refs.length, "no number is in the index twice");
});

test("every destination in the index is an anchor on the rendered page", () => {
  const ids = new Map();
  for (const repoPath of SECTIONS) {
    const html = markdownLibrary.render(stripRepositoryFurniture(read(repoPath)), { page: { inputPath: `../${repoPath}` } });
    ids.set(siteUrlFor(repoPath).slice(1), new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1])));
  }
  assert.equal(INDEX.pages.length, SECTIONS.length);
  for (const entry of INDEX.entries) {
    const page = INDEX.pages[entry.page];
    assert.ok(ids.has(page.url), `${page.url} is a page`);
    if (entry.anchor) assert.ok(ids.get(page.url).has(entry.anchor), `${page.url}#${entry.anchor} exists`);
  }
});

test("page addresses are relative, so results work at the root and under the GitHub Pages path", () => {
  for (const page of INDEX.pages) assert.match(page.url, /^trust-framework-1\.0\/.+\/$/);
  const rule = search.lookup("12.4.1.c");
  assert.equal(destination(rule, INDEX.pages, "http://localhost:8080/"), `http://localhost:8080/${SECTION_12}#section-12_4_1_c`);
  assert.equal(
    destination(rule, INDEX.pages, "https://ofdia-uk.github.io/dvs-trust-framework/"),
    "https://ofdia-uk.github.io/dvs-trust-framework/trust-framework-1.0/part-3/12-service-requirements/#section-12_4_1_c",
  );
  // The search page finds the site root from its script, which is in /assets/.
  assert.equal(new URL("../", "https://ofdia-uk.github.io/dvs-trust-framework/assets/search.js").href, "https://ofdia-uk.github.io/dvs-trust-framework/");
});

test("indexes the glossary and the table of standards", () => {
  const term = INDEX.entries.find((entry) => entry.kind === "term" && entry.title === "Identity repair");
  assert.equal(term.anchor, "term-identity-repair");
  assert.match(term.text, /^A process that makes it possible/);
  const standard = INDEX.entries.find((entry) => entry.kind === "row" && /Fraud Act \(2006\)/.test(entry.text));
  assert.ok(standard, "the Fraud Act is in the table of standards");
  assert.equal(standard.context.at(-1), "Business probity");
});

test("indexes only the trust framework sections, without the site's navigation, banners or feedback controls", () => {
  const text = JSON.stringify(INDEX);
  for (const furniture of ["caution-banner", "[!CAUTION]", "Repository navigation", "This is a working draft", "Give feedback", "Choose a rule", "On this page", "Previous", "Next", "Copy link", "Copy reference"]) {
    assert.ok(!text.includes(furniture), `the index does not include ${JSON.stringify(furniture)}`);
  }
  assert.ok(INDEX.pages.every((page) => /\/\d\d-/.test(page.url)), "only numbered sections, not contents pages or the feedback guidance");
  // The abbreviation definitions are used on the page, not indexed as text.
  assert.ok(!text.includes("*["));
});

test("the entries for a file are made with the page's own renderer", () => {
  const entries = searchEntries('## 12. Title\n\n<a id="section-12_1"></a>\n\n### 12.1. Heading\n\n12.1.a. Rule:\n\n- one;\n\n- two.\n\nIntro text.\n', "trust-framework-1.0/part-3/12-service-requirements.md");
  assert.deepEqual(
    entries.map(({ kind, ref, anchor, text }) => ({ kind, ref, anchor, text })),
    [
      { kind: "heading", ref: "12.1", anchor: "section-12_1", text: undefined },
      // Like the page, the rule runs on to the next heading or rule.
      { kind: "rule", ref: "12.1.a", anchor: "section-12_1_a", text: "12.1.a. Rule: one; two. Intro text." },
    ],
  );
});

// --- Topic searches ------------------------------------------------------------

test("splits a query into words, ignoring case, punctuation and common words", () => {
  assert.equal(normalise("GPG45"), "gpg 45");
  assert.deepEqual(queryTerms("The  Identity-repair!"), ["identity", "repair"]);
  assert.deepEqual(queryTerms("the"), ["the"]);
});

test("identity repair: the heading on helping a user repair their identity, its rules and the glossary term", () => {
  const results = top("identity repair", 5);
  assert.ok(results.includes(`${SECTION_12}#section-12_5_5`));
  assert.ok(results.includes(`${SECTION_12}#section-12_5_5_a`));
  assert.ok(results.includes("trust-framework-1.0/part-4/16-glossary-of-terms-and-definitions/#term-identity-repair"));
});

test("fraud monitoring: the fraud monitoring heading first", () => {
  assert.equal(top("fraud monitoring", 1)[0], `${SECTION_12}#section-12_4_1`);
});

test("biometrics: the section on using biometrics, and passages that say 'biometric'", () => {
  assert.equal(top("biometrics", 1)[0], `${SECTION_12}#section-12_8`);
  assert.ok(top("biometrics", 3).includes(`${SECTION_12}#section-12_8_1`));
  assert.ok(search.search("biometrics").some((entry) => /\bbiometric\b/i.test(entry.text ?? "") && !/biometrics/i.test(entry.text ?? "")));
});

test("GPG 45: the GPG 45 components rules first, written with or without a space", () => {
  assert.equal(top("GPG 45", 1)[0], "trust-framework-1.0/part-2/09-rules-for-component-service-providers/#section-9_1_1");
  assert.deepEqual(top("gpg45", 3), top("GPG 45", 3));
});

test("words with no matches give no results", () => {
  assert.deepEqual(search.search("zzqx frobnicate"), []);
  assert.deepEqual(search.search("   "), []);
  assert.deepEqual(search.search("!!!"), []);
});

// --- Safe display ----------------------------------------------------------------

test("excerpts are plain text parts around the first match, with the matches marked", () => {
  const parts = excerpt("Users can ask for identity repair. Identity theft is different.", ["identity", "repair"]);
  assert.deepEqual(parts, [
    { text: "Users can ask for " },
    { text: "identity", match: true },
    { text: " " },
    { text: "repair", match: true },
    { text: ". " },
    { text: "Identity", match: true },
    { text: " theft is different." },
  ]);
  const long = `${"word ".repeat(100)}biometric checks ${"more ".repeat(100)}`;
  const cut = excerpt(long, ["biometrics"], 120);
  assert.equal(cut[0].text, "… ");
  assert.equal(cut.at(-1).text, " …");
  assert.ok(cut.some((part) => part.match && part.text === "biometric"));
});

test("a query or passage that looks like HTML stays text", () => {
  const query = '<img src=x onerror="alert(1)"> identity';
  assert.equal(parseReference(query), null);
  const parts = excerpt('A <script>alert(1)</script> passage about identity', queryTerms(query));
  assert.equal(parts.map((part) => part.text).join(""), "A <script>alert(1)</script> passage about identity");
  assert.ok(parts.every((part) => typeof part.text === "string" && Object.keys(part).every((key) => key === "text" || key === "match")));
});

test("the search page writes text, never HTML", () => {
  const script = fs.readFileSync(path.join(SITE_DIR, "assets", "search.js"), "utf-8");
  for (const unsafe of ["innerHTML", "outerHTML", "insertAdjacentHTML", "document.write", "eval("]) {
    assert.ok(!script.includes(unsafe), `assets/search.js does not use ${unsafe}`);
  }
});
