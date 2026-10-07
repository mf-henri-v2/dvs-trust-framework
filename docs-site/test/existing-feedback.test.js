// Tests for the existing feedback shown on the reading site
// (lib/existing-feedback.js, existing-feedback.json). Run with: npm test
//
// The first test checks the real register. The rest use small made-up
// sections and rule identities, to show that only listed issues are shown,
// that feedback follows a rule that is renumbered or moved, and that the
// check fails rather than guess when an entry is wrong or out of date.
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { frameworkRules, resolveIdentities, loadRuleIdentities } from "../lib/rule-identities.js";
import {
  readExistingFeedback,
  checkExistingFeedback,
  resolveExistingFeedback,
  loadExistingFeedback,
  ExistingFeedbackError,
  FEEDBACK_FILE,
} from "../lib/existing-feedback.js";
import { REPOSITORY_URL } from "../lib/markdown.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// --- The real register ----------------------------------------------------------

test("the real register is in order", () => {
  const register = readExistingFeedback(REPO_ROOT);
  assert.ok(Array.isArray(register.feedback));
  const feedback = loadExistingFeedback(REPO_ROOT, loadRuleIdentities(REPO_ROOT));
  assert.equal(feedback.count, register.feedback.length);
});

// --- Made-up sections -------------------------------------------------------------

const S12 = "trust-framework-1.0/part-3/12-service-requirements.md";
const S11 = "trust-framework-1.0/part-3/11-operational-requirements.md";
const S16 = "trust-framework-1.0/part-4/16-glossary-of-terms-and-definitions.md";
const heading = { [S12]: "12. Service requirements", [S11]: "11. Operational requirements", [S16]: "16. Glossary of terms and definitions" };

/** Made-up section files: { repoPath: [rule, ...] } → [{ repoPath, source }] in reading order. */
const sectionsOf = (files) =>
  [S11, S12, S16].map((repoPath) => ({ repoPath, source: [`# ${heading[repoPath]}`, "", ...(files[repoPath] ?? []).flatMap((rule) => [rule, ""])].join("\n") }));

const BASE = { [S12]: ["12.1.a. You must encrypt data at rest.", "12.1.b. You must test your controls every year."], [S11]: ["11.1.a. You must keep logs for a year."] };

/** Identities for made-up sections: r0001 is 12.1.a, r0002 is 12.1.b, r0003 is 11.1.a, unless `entries` says otherwise. */
function identitiesFor(files = BASE, entries) {
  const sections = sectionsOf(files);
  const rules = frameworkRules(sections);
  const byNumber = Object.fromEntries(rules.map((rule) => [rule.number, rule]));
  const registry = {
    rules: entries ?? [
      { id: "r0001", number: "12.1.a", file: S12, fingerprint: byNumber["12.1.a"].fingerprint },
      { id: "r0002", number: "12.1.b", file: S12, fingerprint: byNumber["12.1.b"].fingerprint },
      { id: "r0003", number: "11.1.a", file: S11, fingerprint: byNumber["11.1.a"].fingerprint },
    ],
  };
  return { identities: resolveIdentities(registry, rules, sections.map((section) => section.repoPath)), sections };
}

const PATHS = [S11, S12, S16];
const check = (feedback, identities = identitiesFor().identities) => checkExistingFeedback({ feedback }, identities, PATHS);
const resolve = (feedback, { identities, sections } = identitiesFor()) => {
  assert.deepEqual(checkExistingFeedback({ feedback }, identities, PATHS), []);
  return resolveExistingFeedback({ feedback }, identities, sections);
};
const fails = (problems, pattern) => assert.ok(problems.some((problem) => pattern.test(problem)), `expected a problem matching ${pattern}, got:\n${problems.join("\n\n")}`);

test("with nothing listed, nothing is shown", () => {
  const feedback = resolve([]);
  assert.deepEqual(feedback, { count: 0, byRule: {}, bySection: {}, sections: [] });
});

test("an issue listed against a rule is shown on that rule, by its permanent identity", () => {
  const feedback = resolve([{ issue: 12, title: "Clarify encryption at rest", rules: ["r0001"] }]);
  assert.deepEqual(feedback.byRule, { r0001: { count: 1, href: "existing-feedback/#rule-r0001" } });
  assert.deepEqual(feedback.bySection, { [S12]: { count: 1, href: "/existing-feedback/#section-12-service-requirements" } });
  const [section] = feedback.sections;
  assert.equal(section.title, "12. Service requirements");
  assert.equal(section.url, "/trust-framework-1.0/part-3/12-service-requirements/");
  assert.deepEqual(section.items, []);
  assert.deepEqual(section.rules, [
    { id: "r0001", number: "12.1.a", href: "/trust-framework-1.0/part-3/12-service-requirements/#rule-r0001", anchor: "rule-r0001", items: [{ issue: 12, title: "Clarify encryption at rest", url: `${REPOSITORY_URL}/issues/12` }] },
  ]);
  // Rules and sections without listed feedback get nothing.
  assert.equal(feedback.byRule.r0002, undefined);
  assert.equal(feedback.bySection[S11], undefined);
});

test("several issues on one rule are counted, and an issue on several rules is shown on each", () => {
  const feedback = resolve([
    { issue: 30, title: "Third", rules: ["r0002"] },
    { issue: 10, title: "First", rules: ["r0002", "r0001"] },
    { issue: 20, title: "Second", rules: ["r0002"] },
    { issue: 40, title: "About the whole section", sections: [S12] },
  ]);
  assert.equal(feedback.byRule.r0002.count, 3);
  assert.equal(feedback.byRule.r0001.count, 1);
  // The section counts each issue once, whether it is about the section or its rules.
  assert.equal(feedback.bySection[S12].count, 4);
  const [section] = feedback.sections;
  assert.deepEqual(section.items.map((item) => item.issue), [40]);
  // Rules in number order, and their issues in the order of the register.
  assert.deepEqual(section.rules.map((rule) => rule.number), ["12.1.a", "12.1.b"]);
  assert.deepEqual(section.rules[1].items.map((item) => item.issue), [30, 10, 20]);
});

test("feedback about a section with no rules of its own is shown for that section", () => {
  const feedback = resolve([{ issue: 5, title: "Add a term", sections: [S16] }]);
  assert.deepEqual(feedback.byRule, {});
  assert.deepEqual(feedback.sections.map((section) => [section.repoPath, section.count, section.anchor]), [[S16, 1, "section-16-glossary-of-terms-and-definitions"]]);
});

test("sections are in reading order", () => {
  const feedback = resolve([
    { issue: 1, title: "On 12", rules: ["r0001"] },
    { issue: 2, title: "On 11", rules: ["r0003"] },
  ]);
  assert.deepEqual(feedback.sections.map((section) => section.repoPath), [S11, S12]);
});

test("feedback follows a rule that is renumbered and moved to another section, with no change to the register", () => {
  const listed = [{ issue: 7, title: "Testing controls", rules: ["r0002"] }];
  const before = resolve(listed);
  assert.equal(before.sections[0].repoPath, S12);
  assert.equal(before.sections[0].rules[0].number, "12.1.b");

  // 12.1.b moves to section 11 as 11.1.b. The registry records the move; the register is unchanged.
  const moved = { [S12]: ["12.1.a. You must encrypt data at rest."], [S11]: ["11.1.a. You must keep logs for a year.", "11.1.b. You must test your controls every year."] };
  const rules = Object.fromEntries(frameworkRules(sectionsOf(moved)).map((rule) => [rule.number, rule]));
  const after = resolve(
    listed,
    identitiesFor(moved, [
      { id: "r0001", number: "12.1.a", file: S12, fingerprint: rules["12.1.a"].fingerprint },
      { id: "r0002", number: "11.1.b", file: S11, fingerprint: rules["11.1.b"].fingerprint, history: [{ number: "12.1.b", file: S12 }] },
      { id: "r0003", number: "11.1.a", file: S11, fingerprint: rules["11.1.a"].fingerprint },
    ]),
  );
  assert.deepEqual(after.byRule, { r0002: { count: 1, href: "existing-feedback/#rule-r0002" } });
  assert.deepEqual(Object.keys(after.bySection), [S11]);
  assert.equal(after.sections[0].rules[0].number, "11.1.b");
  assert.equal(after.sections[0].rules[0].href, "/trust-framework-1.0/part-3/11-operational-requirements/#rule-r0002");
});

test("a rule that has been removed fails, naming the rules that replace it", () => {
  const sections = { [S12]: ["12.1.a. You must encrypt data at rest."], [S11]: ["11.1.a. You must keep logs for a year."] };
  const rules = Object.fromEntries(frameworkRules(sectionsOf(sections)).map((rule) => [rule.number, rule]));
  const { identities } = identitiesFor(sections, [
    { id: "r0001", number: "12.1.a", file: S12, fingerprint: rules["12.1.a"].fingerprint },
    { id: "r0002", status: "retired", history: [{ number: "12.1.b", file: S12 }], replacedBy: ["r0003"] },
    { id: "r0003", number: "11.1.a", file: S11, fingerprint: rules["11.1.a"].fingerprint },
    { id: "r0004", status: "retired", history: [{ number: "12.1.c", file: S12 }] },
  ]);
  fails(check([{ issue: 7, title: "Testing", rules: ["r0002"] }], identities), /issue 7\): r0002 \(rule 12\.1\.b when it was removed\) has been removed .*r0003, rule 11\.1\.a/);
  fails(check([{ issue: 8, title: "Gone", rules: ["r0004"] }], identities), /r0004 .* has been removed .*Remove r0004 from this entry/);
});

test("an identity that is not in the registry fails", () => {
  fails(check([{ issue: 7, title: "Typo", rules: ["r0099"] }]), /r0099 is not in rule-identities\.json/);
});

test("a rule number instead of an identity fails, and names the identity to use", () => {
  fails(check([{ issue: 7, title: "By number", rules: ["12.1.b"] }]), /not rule numbers.*Rule 12\.1\.b is r0002: use "r0002"/);
  fails(check([{ issue: 7, title: "By number", rules: ["12.9.z"] }]), /No rule in the working draft has the number 12\.9\.z/);
});

test("a section file that is not in the trust framework fails", () => {
  fails(check([{ issue: 7, title: "Renamed", sections: ["trust-framework-1.0/part-3/12-old-name.md"] }]), /is not a section file of the trust framework/);
  fails(check([{ issue: 7, title: "Contents", sections: ["trust-framework-1.0/README.md"] }]), /is not a section file/);
});

test("malformed entries fail, each with what to change", () => {
  const entry = { issue: 7, title: "A title", rules: ["r0001"] };
  fails(check([entry, { ...entry, rules: ["r0002"] }]), /issue 7 is already listed in entry 1/);
  for (const issue of [0, -1, 1.5, "7", "#7", null]) fails(check([{ ...entry, issue }]), /"issue" must be the issue's number/);
  for (const title of ["", "  ", "Two\nlines", 7, undefined]) fails(check([{ ...entry, title }]), /"title" must be a short title on one line/);
  fails(check([{ ...entry, title: "x".repeat(151) }]), /151 characters long/);
  assert.deepEqual(check([{ ...entry, title: "x".repeat(150) }]), []);
  fails(check([{ issue: 7, title: "About nothing" }]), /it must say what it is about/);
  fails(check([{ ...entry, rules: [] }]), /"rules" must be a list with at least one item/);
  fails(check([{ ...entry, rules: "r0001" }]), /"rules" must be a list/);
  fails(check([{ ...entry, rules: ["r0001", "r0001"] }]), /"rules" lists the same item more than once/);
  fails(check([{ ...entry, rules: ["rule one"] }]), /"rule one" in "rules" is not a permanent identity/);
  fails(check([{ ...entry, label: "show" }]), /unexpected field "label"/);
  fails(check(["#7"]), /Entry 1 in "feedback" is not an object/);
  const { identities } = identitiesFor();
  fails(checkExistingFeedback({ feedback: [], approved: true }, identities, PATHS), /unexpected field "approved"/);
  for (const register of [null, [], {}, { feedback: {} }]) fails(checkExistingFeedback(register, identities, PATHS), /must be an object with a "feedback" list/);
});

test("a register that cannot be read stops the build", () => {
  const root = path.join(REPO_ROOT, "docs-site", "test", "no-such-folder");
  assert.throws(() => readExistingFeedback(root), (error) => error instanceof ExistingFeedbackError && error.message.includes(`${FEEDBACK_FILE} cannot be read`));
});
