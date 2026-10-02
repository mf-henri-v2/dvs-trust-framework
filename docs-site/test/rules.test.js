// Tests for rule anchors and feedback links. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { markdownLibrary, stripRepositoryFurniture, ruleAnchor } from "../lib/markdown.js";
import { feedbackUrl, siteAddress } from "../lib/feedback.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SECTION_12 = "trust-framework-1.0/part-3/12-service-requirements.md";
const SECTION_11 = "trust-framework-1.0/part-3/11-operational-requirements.md";

const render = (source, repoPath) => markdownLibrary.render(stripRepositoryFurniture(source), { page: { inputPath: `../${repoPath}` } });
const feedbackLinks = (html) => [...html.matchAll(/<a [^>]*href="([^"]*)"[^>]*>Give feedback on ([^<]+)<\/a>/g)];
const referenceOf = (href) => new URL(href.replace(/&amp;/g, "&")).searchParams.get("reference");

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

test("adds feedback links only on the prototype page", () => {
  assert.equal(feedbackLinks(render(SAMPLE, SECTION_11)).length, 0);
  assert.equal(feedbackLinks(render(SAMPLE, SECTION_12)).length, 2);
});

test("puts the feedback link after everything that belongs to the rule", () => {
  const html = render(SAMPLE, SECTION_12);
  const at = (text) => html.indexOf(text);
  assert.ok(at("two.") < at(">Give feedback on 12.1.a<"), "after the rule's list");
  assert.ok(at(">Give feedback on 12.1.a<") < at("12.1.b Second rule"), "before the next rule");
  assert.ok(at(">Give feedback on 12.1.b<") < at('id="section-12_2"'), "before the next heading's anchor");
});

test("the feedback link fills in the rule number and a direct link to the rule", () => {
  const [[, href, label]] = feedbackLinks(render(SAMPLE, SECTION_12));
  assert.equal(label, "12.1.a");
  assert.ok(href.startsWith("https://github.com/ofdia-uk/dvs-trust-framework/issues/new/choose?reference="));
  assert.equal(
    referenceOf(href),
    "12.1.a (https://ofdia-uk.github.io/dvs-trust-framework/trust-framework-1.0/part-3/12-service-requirements/#section-12_1_a)",
  );
});

test("section 12: every rule has one unique anchor and one feedback link", () => {
  const source = fs.readFileSync(path.join(REPO_ROOT, SECTION_12), "utf-8");
  const rules = source.match(/^\d+(?:\.\d+)+(?:\.[a-z]+)+\.?(?=\s)/gm).map((n) => n.replace(/\.$/, ""));
  const html = render(source, SECTION_12);
  const anchors = [...html.matchAll(/<p id="(section-[^"]+)" class="app-rule/g)].map((m) => m[1]);
  assert.equal(rules.length, 104);
  assert.deepEqual(anchors, rules.map(ruleAnchor));
  assert.equal(new Set(anchors).size, anchors.length);
  assert.deepEqual(feedbackLinks(html).map((m) => m[2]), rules);
});

test("the page feedback link fills in the page address", () => {
  const href = feedbackUrl("https://github.com/ofdia-uk/dvs-trust-framework", siteAddress("/trust-framework-1.0/part-3/"));
  assert.doesNotMatch(href, /\+/, "spaces are written as %20");
  assert.equal(referenceOf(href), "https://ofdia-uk.github.io/dvs-trust-framework/trust-framework-1.0/part-3/");
});
