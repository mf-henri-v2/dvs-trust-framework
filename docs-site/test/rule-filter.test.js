// Tests for the rule picker's filter (assets/rule-filter.js): which rules
// match what the reader types, and what the filter says. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { markdownLibrary, stripRepositoryFurniture } from "../lib/markdown.js";
import { ruleGroups } from "../lib/feedback.js";
import { parseFilter, ruleMatches, exampleNumber, placeholderText, filterStatus } from "../assets/rule-filter.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** The rules in a section's picker, as [{ rule, heading }]. */
function pickerRules(repoPath) {
  const source = stripRepositoryFurniture(fs.readFileSync(path.join(REPO_ROOT, repoPath), "utf8"));
  const html = markdownLibrary.render(source, { page: { inputPath: `./${repoPath}` } });
  return ruleGroups(html).flatMap(({ heading, rules }) => rules.map(({ rule }) => ({ rule, heading })));
}

const matching = (rules, query) => rules.filter(({ rule, heading }) => ruleMatches(query, rule, heading)).map(({ rule }) => rule);

const SECTION_12 = pickerRules("trust-framework-1.0/part-3/12-service-requirements.md");
const SECTION_2 = pickerRules("trust-framework-1.0/part-1/02-feedback-received-and-updates.md");

test("a full or partial rule number matches that rule and the rules under it", () => {
  assert.deepEqual(matching(SECTION_12, "12.4.1"), ["12.4.1.a", "12.4.1.b", "12.4.1.c", "12.4.1.d", "12.4.1.e"]);
  assert.deepEqual(matching(SECTION_12, "12.4.1.c"), ["12.4.1.c"]);
  assert.equal(matching(SECTION_12, "12.4").length, 21);
  assert.equal(matching(SECTION_12, "12").length, SECTION_12.length);
});

test("a number is matched whole, part by part: 2.1.1 is not 2.1.10", () => {
  const rules = matching(SECTION_2, "2.1.1");
  assert.ok(rules.includes("2.1.1.a"));
  assert.ok(!rules.includes("2.1.10.a") && !rules.includes("2.1.11.a"));
  assert.deepEqual(matching(SECTION_2, "2.1.10"), ["2.1.10.a"]);
});

test("a number can be typed as it is cited", () => {
  for (const query of ["Rule 12.4.1.c", "12.4.1.c.", "12.4.1.C", "  rule 12.4.1.c  "]) {
    assert.deepEqual(matching(SECTION_12, query), ["12.4.1.c"], query);
  }
  assert.deepEqual(matching(SECTION_12, "12.4.1."), matching(SECTION_12, "12.4.1"));
});

test("words match the start of words in the rule's heading", () => {
  // The rules under 12.4 Fraud management and the subsections with "fraud"
  // in their heading, and 12.5.1 Responding to a fraud incident. Only the
  // heading a rule comes under counts, so 12.4.5 Sharing threat indicators
  // does not match.
  const fraud = matching(SECTION_12, "fraud");
  assert.equal(fraud.length, 21);
  assert.ok(fraud.includes("12.4.a") && fraud.includes("12.5.1.d") && !fraud.includes("12.4.5.a"));
  assert.deepEqual(matching(SECTION_12, "FRAUD"), fraud);
  assert.deepEqual(matching(SECTION_12, "fraud incid"), ["12.5.1.a", "12.5.1.b", "12.5.1.c", "12.5.1.d"]);
  // A number and words together.
  assert.deepEqual(matching(SECTION_12, "12.4 monitoring"), ["12.4.1.a", "12.4.1.b", "12.4.1.c", "12.4.1.d", "12.4.1.e"]);
  // Curly apostrophes in headings match straight ones typed.
  assert.ok(matching(SECTION_12, "user's holder").length > 0);
});

test("nothing typed matches every rule; something that is not there matches none", () => {
  assert.equal(matching(SECTION_12, "").length, SECTION_12.length);
  assert.equal(matching(SECTION_12, "   ").length, SECTION_12.length);
  assert.deepEqual(matching(SECTION_12, "zzz"), []);
  assert.deepEqual(matching(SECTION_12, "4.1.c"), []);
  assert.deepEqual(matching(SECTION_12, "12.40"), []);
});

test("parses numbers and words apart", () => {
  assert.deepEqual(parseFilter("Rule 12.4.1.c"), { numbers: ["12.4.1.c"], words: [] });
  assert.deepEqual(parseFilter("12.4 fraud"), { numbers: ["12.4"], words: ["fraud"] });
  // Without a number, "rule" is a word like any other.
  assert.deepEqual(parseFilter("rules"), { numbers: [], words: ["rules"] });
});

test("says how many rules match, and when a choice was cleared", () => {
  assert.equal(exampleNumber("12.1.1.a"), "12.1.1");
  assert.equal(placeholderText(104, false), "Choose a rule");
  assert.equal(placeholderText(5, true), "Choose from 5 matching rules");
  assert.equal(placeholderText(1, true), "Choose the 1 matching rule");
  assert.equal(placeholderText(0, true), "No rules match");
  const base = { total: 104, example: "12.1.1" };
  assert.equal(filterStatus({ ...base, query: "", count: 104 }), "");
  assert.equal(filterStatus({ ...base, query: "12.4.1", count: 5 }), "5 rules match. Choose one from the list.");
  assert.equal(filterStatus({ ...base, query: "12.4.1.c", count: 1 }), "1 rule matches. Choose it from the list.");
  assert.equal(
    filterStatus({ ...base, query: "12.5", count: 30, cleared: "12.4.1.c" }),
    "30 rules match. Your choice, rule 12.4.1.c, was cleared. Choose one from the list.",
  );
  assert.equal(
    filterStatus({ ...base, query: "zzz", count: 0 }),
    "No rules match “zzz”. Try a rule number such as 12.1.1, or clear the filter.",
  );
  assert.equal(filterStatus({ ...base, query: "", count: 104, cleared: "12.4.1.c" }), "Your choice, rule 12.4.1.c, was cleared. All 104 rules are listed.");
  // Once a rule is chosen again, only the number of matches is said.
  assert.equal(filterStatus({ ...base, query: "12.4.1", count: 5, chosen: true }), "5 rules match.");
  assert.equal(filterStatus({ ...base, query: "", count: 104, chosen: true }), "");
});
