// Tests for rule anchors and rule-level feedback. Run with: npm test
//
// The last group of tests reads every trust framework section, so the build
// fails if a paragraph looks like a numbered rule but the renderer does not
// recognise it, if a rule has no anchor or feedback route, or if anchors are
// duplicated.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { markdownLibrary, stripRepositoryFurniture, ruleAnchor, siteUrlFor, RULE_NUMBER } from "../lib/markdown.js";
import { feedbackUrl, markdownLink, siteAddress, ruleGroups, SITE_URL } from "../lib/feedback.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SECTION_12 = "trust-framework-1.0/part-3/12-service-requirements.md";
// Addresses use SITE_URL, which the Reading site workflow sets to the repository's own Pages address.
const SECTION_12_URL = `${SITE_URL}trust-framework-1.0/part-3/12-service-requirements/`;

const render = (source, repoPath) => markdownLibrary.render(stripRepositoryFurniture(source), { page: { inputPath: `../${repoPath}` } });
const referenceOf = (href) => new URL(href).searchParams.get("reference");

const SAMPLE = [
  "## 12. Title",
  "",
  '<a id="section-12_1"></a>',
  "",
  "### 12.1. Heading with *emphasis*",
  "",
  "12.1.a. First rule, which has a list:",
  "",
  "- one;",
  "",
  "- two.",
  "",
  "12.1.b Second rule, without a full stop after its number.",
  "",
  '<a id="section-12_2"></a>',
  "",
  "### 12.2. Next heading",
  "",
  "Text that is not a rule.",
  "",
].join("\n");

test("turns a rule number into an anchor in the GOV.UK form", () => {
  assert.equal(ruleAnchor("12.4.1.c"), "section-12_4_1_c");
  assert.equal(ruleAnchor("12.3.a"), "section-12_3_a");
});

test("gives each rule an anchor without changing its text", () => {
  const html = render(SAMPLE, SECTION_12);
  assert.match(html, /<p id="section-12_1_a" class="app-rule govuk-body">12\.1\.a\. First rule/);
  assert.match(html, /<p id="section-12_1_b" class="app-rule govuk-body">12\.1\.b Second rule/);
  assert.doesNotMatch(html, /id="section-[^"]*"[^>]*>Text that is not a rule/);
});

test("marks rules for feedback on trust framework pages only, with no links in the text", () => {
  const html = render(SAMPLE, SECTION_12);
  assert.equal(html.match(/<div class="app-rule-block"/g).length, 2);
  assert.doesNotMatch(html, /Give feedback/);
  assert.doesNotMatch(render(SAMPLE, "CONTRIBUTING.md"), /app-rule-block/);
});

test("a rule's block holds everything that belongs to the rule, and nothing after it", () => {
  const html = render(SAMPLE, SECTION_12);
  const first = html.slice(html.indexOf('data-rule="12.1.a"'), html.indexOf('data-rule="12.1.b"'));
  assert.match(first, /two\.<\/p>\s*<\/li>\s*<\/ul>\s*<\/div>\s*<div class="app-rule-block" $/, "ends after the rule's list");
  const second = html.slice(html.indexOf('data-rule="12.1.b"'));
  assert.ok(second.indexOf("</div>") < second.indexOf('id="section-12_2"'), "ends before the next heading's anchor");
});

test("lists the rules for the picker under their headings (as plain text), with the reference to fill in", () => {
  assert.deepEqual(ruleGroups(render(SAMPLE, SECTION_12)), [
    {
      heading: "12.1. Heading with emphasis",
      rules: [
        { rule: "12.1.a", reference: `[12.1.a](${SECTION_12_URL}#section-12_1_a)` },
        { rule: "12.1.b", reference: `[12.1.b](${SECTION_12_URL}#section-12_1_b)` },
      ],
    },
  ]);
  assert.deepEqual(ruleGroups(render(SAMPLE, "CONTRIBUTING.md")), []);
});

test("the reference is a Markdown link, so the issue shows the rule number or page title as the link", () => {
  assert.equal(markdownLink("12.4.1.c", "https://example.org/page/#section-12_4_1_c"), "[12.4.1.c](https://example.org/page/#section-12_4_1_c)");
  // Brackets in the text and parentheses in the address cannot end the link early.
  assert.equal(markdownLink("Part [3]", "https://example.org/a_(b)/"), "[Part \\[3\\]](https://example.org/a_%28b%29/)");
});

test("feedback links carry the Markdown link intact, with spaces as %20", () => {
  const reference = markdownLink("12.4.1.c", siteAddress("/trust-framework-1.0/part-3/12-service-requirements/", "section-12_4_1_c"));
  const href = feedbackUrl("https://github.com/ofdia-uk/dvs-trust-framework", reference);
  assert.ok(href.startsWith("https://github.com/ofdia-uk/dvs-trust-framework/issues/new/choose?reference=%5B12.4.1.c%5D("));
  assert.doesNotMatch(href, /\+/);
  assert.equal(referenceOf(href), `[12.4.1.c](${SECTION_12_URL}#section-12_4_1_c)`);
});

test("the page feedback link fills in the page title as a link to the page", () => {
  const href = feedbackUrl("https://github.com/ofdia-uk/dvs-trust-framework", markdownLink("Part 3: Rules for all service providers", siteAddress("/trust-framework-1.0/part-3/")));
  assert.equal(referenceOf(href), `[Part 3: Rules for all service providers](${SITE_URL}trust-framework-1.0/part-3/)`);
});

// The feedback links fill in the field with id "reference". The template
// chooser passes it on to whichever form the reader picks, so every form
// needs it.
test("every issue form has the reference text field", () => {
  const formsDir = path.join(REPO_ROOT, ".github", "ISSUE_TEMPLATE");
  const forms = fs.readdirSync(formsDir).filter((file) => /^\d-.*\.yml$/.test(file));
  assert.ok(forms.length >= 6);
  for (const form of forms) {
    const text = fs.readFileSync(path.join(formsDir, form), "utf-8");
    assert.match(text, /^\s+- type: input\s*\r?\n\s+id: reference\s*$/m, `${form} has a "reference" text field`);
  }
});

// --- Every trust framework section ----------------------------------------

const SECTIONS = fs
  .readdirSync(path.join(REPO_ROOT, "trust-framework-1.0"), { recursive: true })
  .map((file) => `trust-framework-1.0/${file.replace(/\\/g, "/")}`)
  .filter((repoPath) => /\/\d\d-[^/]+\.md$/.test(repoPath))
  .sort();

// Deliberately looser than the renderer: any block that starts with a
// number like "12.4" (after an optional list or quote marker, or bold).
const LOOKS_LIKE_RULE = /^\s*((?:[-*+]\s+|>\s*)*)\**\s*(\d+\.\d+\S*)/;

/** Blocks in a section's Markdown that look like numbered rules. */
function ruleLikeBlocks(source) {
  const lines = stripRepositoryFurniture(source).split(/\r?\n/);
  return lines.flatMap((line, i) => {
    if (i > 0 && lines[i - 1].trim() !== "") return []; // not the start of a block
    if (/^\s*(#|\|)/.test(line)) return []; // headings and tables
    const match = LOOKS_LIKE_RULE.exec(line);
    return match ? [{ line: line.trim(), prefix: match[1], start: match[2] }] : [];
  });
}

test("finds the trust framework sections", () => {
  assert.equal(SECTIONS.length, 17);
});

for (const repoPath of SECTIONS) {
  const section = Number(path.basename(repoPath).slice(0, 2));
  const source = fs.readFileSync(path.join(REPO_ROOT, repoPath), "utf-8");

  test(`${path.basename(repoPath)}: every rule is recognised, anchored and has a feedback route`, () => {
    // Every block that looks like a rule must be a rule the renderer understands.
    const numbers = [];
    for (const { line, prefix, start } of ruleLikeBlocks(source)) {
      const number = RULE_NUMBER.exec(start)?.[1];
      assert.ok(
        !prefix && number,
        `this looks like a numbered rule, but the renderer does not recognise it (rules are paragraphs that start like "12.4.1.c."): ${line.slice(0, 80)}`,
      );
      assert.equal(Number(number.split(".")[0]), section, `rule ${number} is not numbered for section ${section}`);
      numbers.push(number);
    }
    assert.equal(new Set(numbers).size, numbers.length, `rule numbers are repeated: ${numbers.filter((n, i) => numbers.indexOf(n) !== i)}`);

    const html = render(source, repoPath);
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
    assert.equal(new Set(ids).size, ids.length, `IDs are repeated: ${ids.filter((id, i) => ids.indexOf(id) !== i)}`);

    const anchors = [...html.matchAll(/<p id="(section-[^"]+)" class="app-rule /g)].map((m) => m[1]);
    assert.deepEqual(anchors, numbers.map(ruleAnchor), "each rule has an anchor made from its number");

    const pageAddress = siteAddress(siteUrlFor(repoPath));
    const picker = ruleGroups(html).flatMap((group) => group.rules);
    assert.deepEqual(
      picker,
      numbers.map((number) => ({ rule: number, reference: `[${number}](${pageAddress}#${ruleAnchor(number)})` })),
      "each rule has a feedback block and picker entry with its number and a link to its anchor",
    );
    assert.equal(html.match(/<div\b/g)?.length ?? 0, html.match(/<\/div>/g)?.length ?? 0, "every block is closed");
  });
}

test("the trust framework has numbered rules, and each section's rule numbers are its own", () => {
  const all = SECTIONS.flatMap((repoPath) => ruleLikeBlocks(fs.readFileSync(path.join(REPO_ROOT, repoPath), "utf-8")));
  // 337 at the time of writing. The exact count is not fixed, so that rules
  // can be added or removed, but none at all would mean the check is broken.
  assert.ok(all.length > 0);
  assert.equal(new Set(all.map((block) => block.start)).size, all.length, "rule numbers are unique across the trust framework");
});
