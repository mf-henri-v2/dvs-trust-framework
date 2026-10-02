// Tests for rule anchors and rule-level feedback. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { markdownLibrary, stripRepositoryFurniture, ruleAnchor } from "../lib/markdown.js";
import { feedbackUrl, siteAddress, ruleGroups, SITE_URL } from "../lib/feedback.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SECTION_12 = "trust-framework-1.0/part-3/12-service-requirements.md";
const SECTION_11 = "trust-framework-1.0/part-3/11-operational-requirements.md";
// Addresses use SITE_URL, which the Reading site workflow sets to the repository's own Pages address.
const SECTION_12_URL = `${SITE_URL}trust-framework-1.0/part-3/12-service-requirements/`;

const render = (source, repoPath) => markdownLibrary.render(stripRepositoryFurniture(source), { page: { inputPath: `../${repoPath}` } });
const referenceOf = (href) => new URL(href).searchParams.get("reference");

const SAMPLE = [
  "## 12. Title",
  "",
  '<a id="section-12_1"></a>',
  "",
  "### 12.1. Heading",
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
  const html = render(SAMPLE, SECTION_11);
  assert.match(html, /<p id="section-12_1_a" class="app-rule govuk-body">12\.1\.a\. First rule/);
  assert.match(html, /<p id="section-12_1_b" class="app-rule govuk-body">12\.1\.b Second rule/);
  assert.doesNotMatch(html, /id="section-[^"]*"[^>]*>Text that is not a rule/);
});

test("marks rules for rule-level feedback only on the prototype page, with no visible links", () => {
  assert.doesNotMatch(render(SAMPLE, SECTION_11), /app-rule-block/);
  const html = render(SAMPLE, SECTION_12);
  assert.equal(html.match(/<div class="app-rule-block"/g).length, 2);
  assert.doesNotMatch(html, /Give feedback/);
});

test("a rule's block holds everything that belongs to the rule, and nothing after it", () => {
  const html = render(SAMPLE, SECTION_12);
  const first = html.slice(html.indexOf('data-rule="12.1.a"'), html.indexOf('data-rule="12.1.b"'));
  assert.match(first, /two\.<\/p>\s*<\/li>\s*<\/ul>\s*<\/div>\s*<div class="app-rule-block" $/, "ends after the rule's list");
  const second = html.slice(html.indexOf('data-rule="12.1.b"'));
  assert.ok(second.indexOf("</div>") < second.indexOf('id="section-12_2"'), "ends before the next heading's anchor");
});

test("lists the rules for the picker, under their headings, with the reference to fill in", () => {
  assert.deepEqual(ruleGroups(render(SAMPLE, SECTION_12)), [
    {
      heading: "12.1. Heading",
      rules: [
        { rule: "12.1.a", reference: `12.1.a (${SECTION_12_URL}#section-12_1_a)` },
        { rule: "12.1.b", reference: `12.1.b (${SECTION_12_URL}#section-12_1_b)` },
      ],
    },
  ]);
  assert.deepEqual(ruleGroups(render(SAMPLE, SECTION_11)), []);
});

test("section 12: every rule has one unique anchor and appears once in the picker", () => {
  const source = fs.readFileSync(path.join(REPO_ROOT, SECTION_12), "utf-8");
  const rules = source.match(/^\d+(?:\.\d+)+(?:\.[a-z]+)+\.?(?=\s)/gm).map((n) => n.replace(/\.$/, ""));
  const html = render(source, SECTION_12);
  const anchors = [...html.matchAll(/<p id="(section-[^"]+)" class="app-rule/g)].map((m) => m[1]);
  assert.equal(rules.length, 104);
  assert.deepEqual(anchors, rules.map(ruleAnchor));
  assert.equal(new Set(anchors).size, anchors.length);
  assert.deepEqual(ruleGroups(html).flatMap((group) => group.rules.map((item) => item.rule)), rules);
  assert.equal(html.match(/<div class="app-rule-block"/g).length, 104);
  assert.equal(html.match(/<div\b/g).length, html.match(/<\/div>/g).length, "every block is closed");
});

test("feedback links fill in the reference, with spaces as %20", () => {
  const href = feedbackUrl("https://github.com/ofdia-uk/dvs-trust-framework", `12.4.1.c (${siteAddress("/trust-framework-1.0/part-3/12-service-requirements/", "section-12_4_1_c")})`);
  assert.ok(href.startsWith("https://github.com/ofdia-uk/dvs-trust-framework/issues/new/choose?reference="));
  assert.doesNotMatch(href, /\+/);
  assert.equal(referenceOf(href), `12.4.1.c (${SECTION_12_URL}#section-12_4_1_c)`);
});

test("the page feedback link fills in the page address", () => {
  const href = feedbackUrl("https://github.com/ofdia-uk/dvs-trust-framework", siteAddress("/trust-framework-1.0/part-3/"));
  assert.equal(referenceOf(href), `${SITE_URL}trust-framework-1.0/part-3/`);
});
