// Tests for permanent rule identities (lib/rule-identities.js), the
// maintenance commands (scripts/rule-identities.js) and how the site uses
// them. Run with: npm test
//
// The first tests check the real registry against the real trust framework.
// The rest use small made-up sections, to show what happens when a rule is
// renumbered, moved, reworded, retired, split or merged, and that the check
// fails rather than guess whenever the registry and the Markdown disagree.
import { test } from "node:test";
import assert from "node:assert/strict";
import { markdownLibrary, stripRepositoryFurniture } from "../lib/markdown.js";
import { ruleGroups, SITE_URL } from "../lib/feedback.js";
import { buildSearchIndex } from "../lib/search.js";
import { createSearch, identityDestination, destination } from "../assets/search-core.js";
import {
  readRegistry,
  readSections,
  frameworkRules,
  checkRegistry,
  resolveIdentities,
  fingerprint,
  formatRegistry,
  loadRuleIdentities,
  RuleIdentityError,
  REGISTRY_FILE,
} from "../lib/rule-identities.js";
import { apply } from "../scripts/rule-identities.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// --- The real registry ------------------------------------------------------

const REAL_RULES = frameworkRules(readSections(REPO_ROOT));
const REAL = loadRuleIdentities(REPO_ROOT);

test("the registry matches the trust framework", () => {
  assert.deepEqual(checkRegistry(readRegistry(REPO_ROOT), REAL_RULES), []);
});

test("every rule in the trust framework has exactly one permanent identity", () => {
  assert.ok(REAL_RULES.length > 300);
  for (const rule of REAL_RULES) {
    const holders = REAL.list.filter((identity) => identity.status === "current" && identity.number === rule.number);
    assert.equal(holders.length, 1, `rule ${rule.number}`);
    assert.equal(holders[0].repoPath, rule.repoPath, `rule ${rule.number} is registered in its own file`);
  }
  assert.equal(REAL.list.filter((identity) => identity.status === "current").length, REAL_RULES.length, "no identity is left without a rule");
});

test("identities and permanent addresses are unique", () => {
  const ids = REAL.list.map((identity) => identity.id);
  assert.equal(new Set(ids).size, ids.length);
  const urls = REAL.list.map((identity) => identity.permanentUrl);
  assert.equal(new Set(urls).size, urls.length);
  for (const identity of REAL.list) assert.equal(identity.permanentUrl, `/rules/${identity.id}/`);
});

test("the registry is written in its canonical form, so tools and hand edits agree", () => {
  const registry = readRegistry(REPO_ROOT);
  assert.equal(formatRegistry(registry), formatRegistry(JSON.parse(formatRegistry(registry))));
});

test("a current number resolves to its rule, on its page, with its number anchor kept", () => {
  const identity = REAL.byId[REAL.byNumber["12.4.1.c"]];
  assert.equal(identity.number, "12.4.1.c");
  assert.equal(identity.repoPath, "trust-framework-1.0/part-3/12-service-requirements.md");
  assert.equal(identity.numberAnchor, "section-12_4_1_c");
  assert.equal(identity.destination, `/trust-framework-1.0/part-3/12-service-requirements/#rule-${identity.id}`);
  assert.equal(identity.heading, "12.4.1. Fraud monitoring");
  assert.match(identity.excerpt, /^12\.4\.1\.c\. Where relevant to your service/);
});

test("rendered with the identities, a rule keeps its number anchor and gains its permanent identity", () => {
  const repoPath = "trust-framework-1.0/part-3/12-service-requirements.md";
  const source = readSections(REPO_ROOT).find((section) => section.repoPath === repoPath).source;
  const html = markdownLibrary.render(stripRepositoryFurniture(source), { page: { inputPath: `../${repoPath}` }, ruleIdentities: REAL });
  const id = REAL.byNumber["12.4.1.c"];
  // The existing number anchor still works.
  assert.match(html, /<p id="section-12_4_1_c" class="app-rule govuk-body">12\.4\.1\.c\./);
  assert.match(html, new RegExp(`<div class="app-rule-block" data-rule="12\\.4\\.1\\.c" [^>]*id="rule-${id}" data-rule-id="${id}">`));
  // Feedback shows the current number and links to the permanent address.
  const picked = ruleGroups(html).flatMap((group) => group.rules).find((rule) => rule.rule === "12.4.1.c");
  assert.equal(picked.reference, `[12.4.1.c](${SITE_URL}rules/${id}/)`);
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length, "no id is repeated");
});

test("without the identities (as the change comparison and search parse it), rendering is unchanged", () => {
  const html = markdownLibrary.render("12.1.a. A rule.\n", { page: { inputPath: "../trust-framework-1.0/part-3/12-x.md" } });
  assert.doesNotMatch(html, /data-rule-id|rule-r\d/);
});

// --- Made-up sections ---------------------------------------------------------

const S12 = "trust-framework-1.0/part-3/12-service-requirements.md";
const S11 = "trust-framework-1.0/part-3/11-operational-requirements.md";
const section = (title, ...rules) => [`## ${title}`, "", ...rules.flatMap((rule) => [rule, ""])].join("\n");
const ENCRYPT = "You must encrypt data at rest.";
const TEST = "You must test your controls every year.";
const LOGS = "You must keep logs for a year.";

/** The rules in made-up sections: { repoPath: [title, ...rules] }. */
const rulesOf = (files) => frameworkRules(Object.entries(files).map(([repoPath, [title, ...rules]]) => ({ repoPath, source: section(title, ...rules) })));

const BASE = { [S12]: ["12. Service requirements", `12.1.a. ${ENCRYPT}`, `12.1.b. ${TEST}`], [S11]: ["11. Operational requirements", `11.1.a. ${LOGS}`] };

/** A registry for the base sections: r0001 is 12.1.a, r0002 is 12.1.b, r0003 is 11.1.a. */
function baseRegistry() {
  const rules = rulesOf(BASE);
  const byNumber = Object.fromEntries(rules.map((rule) => [rule.number, rule]));
  return {
    rules: [
      { id: "r0001", number: "12.1.a", file: S12, fingerprint: byNumber["12.1.a"].fingerprint },
      { id: "r0002", number: "12.1.b", file: S12, fingerprint: byNumber["12.1.b"].fingerprint },
      { id: "r0003", number: "11.1.a", file: S11, fingerprint: byNumber["11.1.a"].fingerprint },
    ],
    reusedNumbers: [],
  };
}

const clone = (value) => JSON.parse(JSON.stringify(value));
const fails = (problems, pattern) => assert.ok(problems.some((problem) => pattern.test(problem)), `expected a problem matching ${pattern}, got:\n${problems.join("\n\n")}`);
const run = (registry, rules, command, ...args) => apply(registry, rules, command, args);
const renderSection = (repoPath, rules, identities) =>
  markdownLibrary.render(section(...rules), { page: { inputPath: `../${repoPath}` }, ruleIdentities: identities });

test("the base registry for the made-up sections is consistent", () => {
  assert.deepEqual(checkRegistry(baseRegistry(), rulesOf(BASE)), []);
});

test("the fingerprint ignores the number and whitespace, and changes with the wording", () => {
  assert.equal(fingerprint(`12.1.a. ${ENCRYPT}`), fingerprint(`12.4.1.z ${ENCRYPT.replace(/ /g, "  ")}`));
  assert.notEqual(fingerprint(`12.1.a. ${ENCRYPT}`), fingerprint(`12.1.a. ${ENCRYPT} And back it up.`));
});

test("a new rule without an identity fails clearly, and is registered only when a maintainer says it is new", () => {
  const rules = rulesOf({ ...BASE, [S12]: [...BASE[S12], "12.1.c. You must name a security officer."] });
  const registry = baseRegistry();
  const problems = checkRegistry(registry, rules);
  assert.equal(problems.length, 1);
  fails(problems, /rule 12\.1\.c \(trust-framework-1\.0\/part-3\/12-service-requirements\.md\) has no permanent identity/);
  fails(problems, /npm run rules -- add 12\.1\.c/);
  fails(problems, /\{"id":"r0004","number":"12\.1\.c","file":"trust-framework-1\.0\/part-3\/12-service-requirements\.md","fingerprint":"[0-9a-f]{16}"\}/);
  assert.match(run(registry, rules, "add", "12.1.c")[0], /as a new rule, r0004/);
  assert.deepEqual(checkRegistry(registry, rules), []);
  assert.throws(() => run(registry, rules, "add", "12.1.c"), /already registered as r0004/);
});

test("renumbering keeps the identity and the permanent address; the old number is remembered", () => {
  // 12.1.b becomes 12.1.c. Nothing else changes.
  const before = resolveIdentities(baseRegistry(), rulesOf(BASE));
  const rules = rulesOf({ ...BASE, [S12]: ["12. Service requirements", `12.1.a. ${ENCRYPT}`, `12.1.c. ${TEST}`] });
  const registry = baseRegistry();
  const problems = checkRegistry(registry, rules);
  fails(problems, /rule 12\.1\.c .* has no permanent identity/);
  fails(problems, /r0002 is registered as rule 12\.1\.b, but the working draft has no rule 12\.1\.b/);
  // The wording is the same as r0002's, which the check mentions only as a hint.
  fails(problems, /Hint only: its wording is the same as the confirmed wording of r0002/);

  run(registry, rules, "renumber", "r0002=12.1.c");
  assert.deepEqual(checkRegistry(registry, rules), []);
  const after = resolveIdentities(registry, rules);
  const identity = after.byId.r0002;
  assert.equal(identity.permanentUrl, before.byId.r0002.permanentUrl);
  assert.equal(identity.number, "12.1.c");
  assert.equal(identity.destination, "/trust-framework-1.0/part-3/12-service-requirements/#rule-r0002");
  assert.deepEqual(identity.history, [{ number: "12.1.b", file: S12 }]);

  // An older link to #section-12_1_b lands on the former number in section 12.
  assert.deepEqual(after.formerNumbersByPage[S12], [{ number: "12.1.b", anchor: "section-12_1_b", holders: [{ id: "r0002", status: "current", number: "12.1.c", permanentUrl: "/rules/r0002/", href: identity.destination }] }]);
  // A search for 12.1.b says it is now 12.1.c.
  const search = searchFor({ [S12]: ["12. Service requirements", `12.1.a. ${ENCRYPT}`, `12.1.c. ${TEST}`] }, after);
  assert.equal(search.lookup("12.1.b"), undefined);
  assert.deepEqual(search.formerHolders("12.1.b").map((holder) => [holder.id, holder.entry?.ref]), [["r0002", "12.1.c"]]);
  // It links to the rule's block, as its permanent link does, not to a number anchor.
  const [holder] = search.formerHolders("12.1.b");
  assert.equal(identityDestination(holder.entry, search.pages, "https://example.org/site/"), "https://example.org/site/trust-framework-1.0/part-3/12-service-requirements/#rule-r0002");
  assert.equal(destination(holder.entry, search.pages, "https://example.org/site/"), "https://example.org/site/trust-framework-1.0/part-3/12-service-requirements/#section-12_1_c");
});

test("moving a rule to another section keeps its permanent address, and its old page keeps the old anchor", () => {
  const moved = { [S12]: ["12. Service requirements", `12.1.a. ${ENCRYPT}`], [S11]: ["11. Operational requirements", `11.1.a. ${LOGS}`, `11.1.b. ${TEST}`] };
  const rules = rulesOf(moved);
  const registry = baseRegistry();
  fails(checkRegistry(registry, rules), /r0002 is registered as rule 12\.1\.b, but the working draft has no rule 12\.1\.b/);
  run(registry, rules, "renumber", "r0002=11.1.b");
  assert.deepEqual(checkRegistry(registry, rules), []);
  const identities = resolveIdentities(registry, rules);
  assert.equal(identities.byId.r0002.permanentUrl, "/rules/r0002/");
  assert.equal(identities.byId.r0002.destination, "/trust-framework-1.0/part-3/11-operational-requirements/#rule-r0002");
  assert.deepEqual(registry.rules[1], { id: "r0002", number: "11.1.b", file: S11, fingerprint: registry.rules[1].fingerprint, history: [{ number: "12.1.b", file: S12 }] });
  // /12-service-requirements/#section-12_1_b still lands somewhere meaningful: section 12's list of former numbers.
  assert.deepEqual(identities.formerNumbersByPage[S12].map((item) => [item.anchor, item.holders.map((holder) => holder.href)]), [
    ["section-12_1_b", ["/trust-framework-1.0/part-3/11-operational-requirements/#rule-r0002"]],
  ]);
  assert.equal(identities.formerNumbersByPage[S11], undefined);
});

test("a rule moved between files without a new number must still be recorded, so its old page keeps the link", () => {
  const S12B = "trust-framework-1.0/part-3/12-service-rules.md";
  const rules = rulesOf({ [S12B]: BASE[S12], [S11]: BASE[S11] });
  const registry = baseRegistry();
  fails(checkRegistry(registry, rules), /r0001 is registered as rule 12\.1\.a in .*12-service-requirements\.md, but rule 12\.1\.a is now in .*12-service-rules\.md/);
  run(registry, rules, "renumber", "r0001=12.1.a", "r0002=12.1.b");
  assert.deepEqual(checkRegistry(registry, rules), []);
  assert.deepEqual(registry.rules[0].history, [{ number: "12.1.a", file: S12 }]);
});

test("changed wording keeps the identity once a maintainer confirms it, one rule or many at a time", () => {
  const reworded = { ...BASE, [S12]: ["12. Service requirements", `12.1.a. ${ENCRYPT} Back it up.`, `12.1.b. ${TEST} Record the results.`] };
  const rules = rulesOf(reworded);
  const registry = baseRegistry();
  const problems = checkRegistry(registry, rules);
  assert.equal(problems.length, 2);
  fails(problems, /The wording of rule 12\.1\.a .* registered as r0001, has changed since it was last confirmed/);
  run(registry, rules, "confirm", "r0001");
  assert.equal(checkRegistry(registry, rules).length, 1);
  run(registry, rules, "confirm", "--all-changed");
  assert.deepEqual(checkRegistry(registry, rules), []);
  assert.deepEqual(registry.rules.map((entry) => [entry.id, entry.number]), [["r0001", "12.1.a"], ["r0002", "12.1.b"], ["r0003", "11.1.a"]]);
});

/** A registry for made-up sections, with identities r0001, r0002 … in reading order. */
function registryFor(files) {
  const rules = rulesOf(files);
  return {
    rules: rules.map((rule, i) => ({ id: `r${String(i + 1).padStart(4, "0")}`, number: rule.number, file: rule.repoPath, fingerprint: rule.fingerprint })),
    reusedNumbers: [],
  };
}
const OFFICER = "You must name a security officer.";
const THREE = { [S12]: ["12. Service requirements", `12.1.a. ${ENCRYPT}`, `12.1.b. ${TEST}`, `12.1.c. ${OFFICER}`] };

test("two rules swapping numbers cannot be confirmed in bulk: each identity would point at the other rule", () => {
  // 12.1.a and 12.1.b swap places, each keeping its wording. Every number
  // still has a rule and every identity still has a number, so only the
  // fingerprints show that anything is wrong.
  const swapped = { ...BASE, [S12]: ["12. Service requirements", `12.1.a. ${TEST}`, `12.1.b. ${ENCRYPT}`] };
  const rules = rulesOf(swapped);
  const registry = baseRegistry();
  const original = clone(registry);
  const { wording, suspicious, other } = checkRegistry(registry, rules, { wordingOnly: true });
  assert.deepEqual([wording.length, suspicious.length, other.length], [0, 2, 0]);
  fails(suspicious, /rule 12\.1\.a .* registered as r0001, has changed[\s\S]*confirmed wording of r0002[\s\S]*cannot be confirmed with --all-changed/);
  fails(suspicious, /rule 12\.1\.b .* registered as r0002, has changed[\s\S]*confirmed wording of r0001[\s\S]*cannot be confirmed with --all-changed/);
  // The full check reports both, so the build fails too.
  assert.equal(checkRegistry(registry, rules).length, 2);

  assert.throws(() => run(registry, rules, "confirm", "--all-changed"), /no rule's wording is now another rule's confirmed wording[\s\S]*r0001[\s\S]*r0002/);
  assert.deepEqual(registry, original, "nothing is confirmed");
});

test("a swap is resolved by recording the new numbers, which keeps each identity with its own rule", () => {
  const swapped = { ...BASE, [S12]: ["12. Service requirements", `12.1.a. ${TEST}`, `12.1.b. ${ENCRYPT}`] };
  const rules = rulesOf(swapped);
  const registry = baseRegistry();
  const fingerprints = Object.fromEntries(registry.rules.map((entry) => [entry.id, entry.fingerprint]));
  run(registry, rules, "renumber", "r0001=12.1.b", "r0002=12.1.a");
  // Each number has now been used by both rules, which must be acknowledged.
  fails(checkRegistry(registry, rules), /The number 12\.1\.a has been used for more than one rule: r0001, r0002/);
  run(registry, rules, "reuse", "12.1.a", "12.1.b");
  assert.deepEqual(checkRegistry(registry, rules), []);

  const identities = resolveIdentities(registry, rules);
  // r0001 is still the encryption rule, now numbered 12.1.b; its wording was never re-confirmed.
  assert.equal(identities.byId.r0001.number, "12.1.b");
  assert.equal(registry.rules[0].fingerprint, fingerprints.r0001);
  assert.match(identities.byId.r0001.excerpt, /encrypt data at rest/);
  assert.equal(identities.byId.r0001.permanentUrl, "/rules/r0001/");
  assert.equal(identities.byId.r0002.number, "12.1.a");
  assert.match(identities.byId.r0002.excerpt, /test your controls/);
  const html = renderSection(S12, swapped[S12], identities);
  assert.match(html, /data-rule="12\.1\.b" [^>]*data-rule-id="r0001">\s*<p id="section-12_1_b" class="app-rule govuk-body">12\.1\.b\. You must encrypt/);
});

test("a three-rule permutation cannot be confirmed in bulk, and is resolved by recording each new number", () => {
  // 12.1.a → 12.1.c, 12.1.b → 12.1.a, 12.1.c → 12.1.b.
  const rotated = { [S12]: ["12. Service requirements", `12.1.a. ${TEST}`, `12.1.b. ${OFFICER}`, `12.1.c. ${ENCRYPT}`] };
  const rules = rulesOf(rotated);
  const registry = registryFor(THREE);
  const original = clone(registry);
  const { wording, suspicious, other } = checkRegistry(registry, rules, { wordingOnly: true });
  assert.deepEqual([wording.length, suspicious.length, other.length], [0, 3, 0]);
  assert.throws(() => run(registry, rules, "confirm", "--all-changed"), /no rule's wording is now another rule's confirmed wording/);
  assert.deepEqual(registry, original);

  run(registry, rules, "renumber", "r0001=12.1.c", "r0002=12.1.a", "r0003=12.1.b");
  run(registry, rules, "reuse", "12.1.a", "12.1.b", "12.1.c");
  assert.deepEqual(checkRegistry(registry, rules), []);
  const identities = resolveIdentities(registry, rules);
  assert.deepEqual(["r0001", "r0002", "r0003"].map((id) => identities.byId[id].number), ["12.1.c", "12.1.a", "12.1.b"]);
  assert.deepEqual(registry.rules.map((entry) => entry.fingerprint), original.rules.map((entry) => entry.fingerprint), "no wording was re-confirmed");
});

test("a swap hidden among genuine rewording still stops bulk confirmation", () => {
  const files = { [S12]: ["12. Service requirements", `12.1.a. ${TEST}`, `12.1.b. ${ENCRYPT}`, `12.1.c. ${OFFICER} They must report to the board.`] };
  const rules = rulesOf(files);
  const registry = registryFor(THREE);
  const original = clone(registry);
  const { wording, suspicious } = checkRegistry(registry, rules, { wordingOnly: true });
  assert.deepEqual([wording.length, suspicious.length], [1, 2]);
  assert.throws(() => run(registry, rules, "confirm", "--all-changed"), /another rule's confirmed wording/);
  assert.deepEqual(registry, original, "not even the genuinely reworded rule is confirmed");
  // Confirming one rule by name stays a human decision, and is allowed.
  run(registry, rules, "confirm", "r0003");
  assert.equal(checkRegistry(registry, rules, { wordingOnly: true }).wording.length, 0);
});

test("large-scale genuine rewording can still be confirmed in bulk, keeping every identity", () => {
  const letters = "abcdefghijklmnopqrst".split("");
  const before = { [S12]: ["12. Service requirements", ...letters.map((letter, i) => `12.1.${letter}. You must meet requirement number ${i + 1}.`)] };
  const after = { [S12]: ["12. Service requirements", ...letters.map((letter, i) => `12.1.${letter}. You must meet and record requirement number ${i + 1}.`)] };
  const registry = registryFor(before);
  const rules = rulesOf(after);
  const { wording, suspicious, other } = checkRegistry(registry, rules, { wordingOnly: true });
  assert.deepEqual([wording.length, suspicious.length, other.length], [20, 0, 0]);
  const done = run(registry, rules, "confirm", "--all-changed");
  assert.equal(done.filter((line) => /confirmed its changed wording/.test(line)).length, 20);
  assert.deepEqual(checkRegistry(registry, rules), []);
  assert.deepEqual(registry.rules.map((entry) => [entry.id, entry.number]), letters.map((letter, i) => [`r${String(i + 1).padStart(4, "0")}`, `12.1.${letter}`]));
});

test("inserting a rule fails closed: identities never quietly follow the numbers to other rules", () => {
  // A new rule is inserted as 12.1.a, and the rules after it are renumbered.
  const inserted = { ...BASE, [S12]: ["12. Service requirements", "12.1.a. You must name a security officer.", `12.1.b. ${ENCRYPT}`, `12.1.c. ${TEST}`] };
  const rules = rulesOf(inserted);
  const registry = baseRegistry();
  const problems = checkRegistry(registry, rules);
  // Without the fingerprint, only 12.1.c would look wrong, and r0001 and
  // r0002 would silently cite the wrong rules. Instead every number whose
  // wording moved is reported.
  fails(problems, /The wording of rule 12\.1\.a .* registered as r0001, has changed/);
  fails(problems, /The wording of rule 12\.1\.b .* registered as r0002, has changed[\s\S]*Hint only: its wording is the same as the confirmed wording of r0001/);
  fails(problems, /rule 12\.1\.c .* has no permanent identity[\s\S]*Hint only: .*r0002/);
  // Confirming everything at once is refused while identities are unresolved.
  assert.throws(() => run(registry, rules, "confirm", "--all-changed"), /only works when changed wording is the only problem/);

  // The maintainer records what happened. The numbers 12.1.a and 12.1.b are
  // now used for different rules than before, which must be acknowledged.
  run(registry, rules, "renumber", "r0002=12.1.c", "r0001=12.1.b");
  run(registry, rules, "add", "12.1.a");
  const reuse = checkRegistry(registry, rules);
  fails(reuse, /The number 12\.1\.a has been used for more than one rule: r0001, r0004/);
  fails(reuse, /The number 12\.1\.b has been used for more than one rule: r0001, r0002/);
  run(registry, rules, "reuse", "12.1.a", "12.1.b");
  assert.deepEqual(checkRegistry(registry, rules), []);

  const identities = resolveIdentities(registry, rules);
  assert.equal(identities.byId.r0001.destination, "/trust-framework-1.0/part-3/12-service-requirements/#rule-r0001");
  assert.equal(identities.byId.r0001.number, "12.1.b");
  assert.equal(identities.byId.r0004.number, "12.1.a");
  // An older link to #section-12_1_a now reaches the new 12.1.a. The rule says
  // so, and names the rule the link may have meant; it does not pick one.
  assert.deepEqual(identities.byId.r0004.sharedWith.map((other) => other.id), ["r0001"]);
  assert.equal(identities.formerNumbersByPage[S12], undefined, "a number a rule on the page has now is never listed again, so no anchor is repeated");
  const html = renderSection(S12, inserted[S12], identities);
  assert.match(html, /The number 12\.1\.a has also been used for another rule[\s\S]*href="\/trust-framework-1\.0\/part-3\/12-service-requirements\/#rule-r0001">rule 12\.1\.b</);
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length, "no id is repeated");
  // A search for 12.1.a finds the rule numbered 12.1.a now, and says another rule had the number.
  const search = searchFor(inserted, identities);
  assert.equal(search.lookup("12.1.a").id, "r0004");
  assert.deepEqual(search.formerHolders("12.1.a").map((holder) => holder.id), ["r0001"]);
});

test("a retired rule keeps its permanent address, which says it has been removed", () => {
  const removed = { ...BASE, [S12]: ["12. Service requirements", `12.1.a. ${ENCRYPT}`] };
  const rules = rulesOf(removed);
  const registry = baseRegistry();
  fails(checkRegistry(registry, rules), /r0002 is registered as rule 12\.1\.b, but the working draft has no rule 12\.1\.b[\s\S]*retire r0002/);
  run(registry, rules, "retire", "r0002");
  assert.deepEqual(checkRegistry(registry, rules), []);
  assert.deepEqual(registry.rules[1], { id: "r0002", status: "retired", history: [{ number: "12.1.b", file: S12 }] });
  const identities = resolveIdentities(registry, rules);
  const identity = identities.byId.r0002;
  assert.equal(identity.status, "retired");
  assert.equal(identity.permanentUrl, "/rules/r0002/");
  assert.equal(identity.href, "/rules/r0002/", "links to it go to its permanent page, never to another rule");
  assert.equal(identity.number, "12.1.b");
  assert.equal(identity.destination, undefined);
  assert.deepEqual(identities.formerNumbersByPage[S12].map((item) => [item.anchor, item.holders.map((holder) => holder.status)]), [["section-12_1_b", ["retired"]]]);
  const search = searchFor(removed, identities);
  assert.deepEqual(search.formerHolders("12.1.b").map((holder) => [holder.id, holder.status, holder.entry]), [["r0002", "retired", undefined]]);
  assert.equal(search.identity("r0002").ref, "12.1.b");
});

test("a split or a merge is recorded as retirement, with the rules that replace it", () => {
  // 12.1.b is split into 12.1.b and 12.1.c, both new rules.
  const split = { ...BASE, [S12]: ["12. Service requirements", `12.1.a. ${ENCRYPT}`, "12.1.b. You must test your controls.", "12.1.c. You must test them every year."] };
  const rules = rulesOf(split);
  const registry = baseRegistry();
  run(registry, rules, "retire", "r0002");
  run(registry, rules, "add", "12.1.b", "12.1.c");
  run(registry, rules, "retire", "r0002", "--replaced-by", "r0004", "r0005");
  run(registry, rules, "reuse", "12.1.b");
  assert.deepEqual(checkRegistry(registry, rules), []);
  const identities = resolveIdentities(registry, rules);
  assert.deepEqual(identities.byId.r0002.replacedBy.map((other) => [other.id, other.number]), [["r0004", "12.1.b"], ["r0005", "12.1.c"]]);

  // A merge: several retired rules name the same replacement.
  registry.rules.push({ id: "r0006", status: "retired", history: [{ number: "12.9.a", file: S12 }], replacedBy: ["r0001"] });
  assert.deepEqual(checkRegistry(registry, rules), []);
});

test("duplicate or out-of-order identities fail", () => {
  const rules = rulesOf(BASE);
  const duplicate = baseRegistry();
  duplicate.rules[1].id = "r0001";
  fails(checkRegistry(duplicate, rules), /r0001: this identity is in the registry more than once/);
  const order = baseRegistry();
  [order.rules[0], order.rules[1]] = [order.rules[1], order.rules[0]];
  fails(checkRegistry(order, rules), /identities must be in order/);
  const twice = baseRegistry();
  twice.rules[1].number = "12.1.a";
  fails(checkRegistry(twice, rules), /r0001 and r0002 are both registered as rule 12\.1\.a/);
});

test("an identity cannot be given a new meaning: there is no remapped status, and replacements must exist", () => {
  const rules = rulesOf(BASE);
  const remapped = baseRegistry();
  remapped.rules.push({ id: "r0004", status: "remapped", remappedTo: "r0001" });
  fails(checkRegistry(remapped, rules), /r0004: unknown status "remapped"/);
  const retired = baseRegistry();
  retired.rules.push({ id: "r0004", status: "retired", history: [{ number: "12.9.a", file: S12 }], replacedBy: ["r0009"] });
  fails(checkRegistry(retired, rules), /r0004: it is replaced by r0009, which is not in the registry/);
  const noHistory = baseRegistry();
  noHistory.rules.push({ id: "r0004", status: "retired" });
  fails(checkRegistry(noHistory, rules), /a retired rule needs its "history"/);
});

test("a number used for more than one rule fails until a maintainer acknowledges it", () => {
  const rules = rulesOf(BASE);
  const registry = baseRegistry();
  // Two removed rules were both once 12.1.c in section 12.
  registry.rules.push({ id: "r0004", status: "retired", history: [{ number: "12.1.c", file: S12 }] });
  registry.rules.push({ id: "r0005", status: "retired", history: [{ number: "12.1.c", file: S12 }] });
  fails(checkRegistry(registry, rules), /The number 12\.1\.c has been used for more than one rule: r0004, r0005[\s\S]*cannot say which of them it meant/);
  // A wrong or out-of-date acknowledgement does not count.
  registry.reusedNumbers = [{ number: "12.1.c", identities: ["r0004"] }];
  fails(checkRegistry(registry, rules), /12\.1\.c has been used for more than one rule/);
  registry.reusedNumbers = [{ number: "12.1.c", identities: ["r0004", "r0005"] }];
  assert.deepEqual(checkRegistry(registry, rules), []);
  // A later rule that also takes the number needs a new acknowledgement.
  registry.rules.push({ id: "r0006", status: "retired", history: [{ number: "12.1.c", file: S12 }] });
  fails(checkRegistry(registry, rules), /12\.1\.c has been used for more than one rule: r0004, r0005, r0006/);
  registry.rules.pop();

  // Acknowledged, an older link to #section-12_1_c lists both rules; neither is chosen.
  const identities = resolveIdentities(registry, rules);
  assert.deepEqual(identities.formerNumbersByPage[S12].map((item) => [item.anchor, item.holders.map((holder) => holder.id)]), [["section-12_1_c", ["r0004", "r0005"]]]);
  const search = searchFor(BASE, identities);
  assert.equal(search.lookup("12.1.c"), undefined);
  assert.deepEqual(search.formerHolders("12.1.c").map((holder) => holder.id), ["r0004", "r0005"]);

  // An acknowledgement for a number that has not been reused is stale.
  registry.reusedNumbers.push({ number: "12.1.a", identities: ["r0001"] });
  fails(checkRegistry(registry, rules), /"reusedNumbers" lists 12\.1\.a, but no more than one rule has used it/);
});

test("the build stops with the problems when the registry and the trust framework disagree", () => {
  const error = new RuleIdentityError(["first problem", "second problem"]);
  assert.match(error.message, new RegExp(`^${REGISTRY_FILE.replace(".", "\\.")} does not match the trust framework \\(2 problems\\)\\. See ARCHITECTURE\\.md, under Rule identities\\.\\n\\nfirst problem\\n\\nsecond problem$`));
});

test("commands refuse what they cannot do safely", () => {
  const rules = rulesOf(BASE);
  const registry = baseRegistry();
  const original = clone(registry);
  assert.throws(() => run(registry, rules, "renumber", "r0001=12.9.z"), /The working draft has no rule 12\.9\.z/);
  assert.throws(() => run(registry, rules, "renumber", "r0001=12.1.b", "r0002=12.1.b"), /cannot be given the same number/);
  assert.throws(() => run(registry, rules, "retire", "r0001", "--replaced-by", "r0001"), /cannot replace itself/);
  assert.throws(() => run(registry, rules, "retire", "r0009"), /r0009 is not in rule-identities\.json/);
  assert.throws(() => run(registry, rules, "reuse", "12.1.a"), /has not been used for more than one rule/);
  assert.throws(() => run(registry, rules, "remap", "r0001"), /Unknown command "remap"/);
  assert.deepEqual(registry, original);
});

/** Search over made-up sections with their identities. */
function searchFor(files, identities) {
  const sections = Object.entries(files).map(([repoPath, [title]]) => ({ url: `/${repoPath.replace(/\.md$/, "/")}`, title, repoPath }));
  const sources = Object.fromEntries(Object.entries(files).map(([repoPath, [title, ...rules]]) => [repoPath, section(title, ...rules)]));
  return createSearch(buildSearchIndex(sections, (repoPath) => sources[repoPath], identities));
}
