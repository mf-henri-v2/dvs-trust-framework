// Tests for the "Maintain rule identities" workflow
// (.github/workflows/maintain-rule-identities.yml): how its form becomes a
// rule identity command (scripts/rule-identities-action.js), the command's
// exit status, which the workflow uses to decide whether to commit, and the
// workflow file's safeguards. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { OPERATIONS, cliArguments, checkBranch, ActionInputError } from "../scripts/rule-identities-action.js";
import { apply } from "../scripts/rule-identities.js";
import { readRegistry, readSections, frameworkRules, REGISTRY_FILE } from "../lib/rule-identities.js";

const SITE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = path.resolve(SITE_DIR, "..");
const WORKFLOW = fs.readFileSync(path.join(REPO_ROOT, ".github", "workflows", "maintain-rule-identities.yml"), "utf-8").replace(/\r\n/g, "\n");
const ACTION = path.join(SITE_DIR, "scripts", "rule-identities-action.js");
const CLI = path.join(SITE_DIR, "scripts", "rule-identities.js");

const refused = (fn, pattern) => assert.throws(fn, (error) => error instanceof ActionInputError && pattern.test(error.message));

// --- From the form to the command --------------------------------------------

test("each operation runs the intended command", () => {
  assert.deepEqual(cliArguments("check only (change nothing)"), ["check"]);
  assert.deepEqual(cliArguments("confirm wording (IDs)", "r0254"), ["confirm", "r0254"]);
  assert.deepEqual(cliArguments("confirm wording (IDs)", "r0254, R0255\nr0256"), ["confirm", "r0254", "r0255", "r0256"]);
  assert.deepEqual(cliArguments("confirm ALL changed wording", ""), ["confirm", "--all-changed"]);
  assert.deepEqual(cliArguments("add new rules (numbers)", "12.4.1.g 12.4.1.h"), ["add", "12.4.1.g", "12.4.1.h"]);
  assert.deepEqual(cliArguments("renumber or move (ID=number)", "r0256=12.4.1.f r0255=12.4.1.e"), ["renumber", "r0256=12.4.1.f", "r0255=12.4.1.e"]);
  assert.deepEqual(cliArguments("retire (IDs)", "r0254"), ["retire", "r0254"]);
  assert.deepEqual(cliArguments("retire (IDs)", "r0254", "r0340 r0341"), ["retire", "r0254", "--replaced-by", "r0340", "r0341"]);
  assert.deepEqual(cliArguments("acknowledge reused numbers (numbers)", "12.4.1.c 12.4.1.d"), ["reuse", "12.4.1.c", "12.4.1.d"]);
});

test("the workflow's form offers exactly these operations, starting with the one that changes nothing", () => {
  const options = /\n {8}options:\n((?: {10}- .+\n)+)/.exec(WORKFLOW)[1].split("\n").filter(Boolean).map((line) => line.replace(/^ {10}- /, ""));
  assert.deepEqual(options, Object.keys(OPERATIONS));
  assert.match(WORKFLOW, /\n {8}default: check only \(change nothing\)\n/);
});

test("confirming all changed wording is never implied: it must be chosen, and takes no arguments", () => {
  for (const operation of Object.keys(OPERATIONS).filter((each) => each !== "confirm ALL changed wording")) {
    assert.ok(!OPERATIONS[operation].command.includes("--all-changed"), operation);
  }
  refused(() => cliArguments("confirm ALL changed wording", "r0254"), /takes no arguments/);
  refused(() => cliArguments("confirm wording (IDs)", "--all-changed"), /should hold identities/);
  refused(() => cliArguments("confirm wording (IDs)", ""), /needs identities/);
});

test("nothing typed in the form can become anything but identities, numbers or identity=number pairs", () => {
  const attempts = [
    "r0254; rm -rf /",
    "r0254 && curl https://example.org",
    "$(id)",
    "`id`",
    "r0254|cat",
    "r0254 > rule-identities.json",
    "--replaced-by r0001",
    "-h",
    "../../etc/passwd",
    "r0254=12.4.1.d;id",
    "12.4.1.c'",
    "r12",
  ];
  for (const text of attempts) {
    for (const operation of ["confirm wording (IDs)", "add new rules (numbers)", "renumber or move (ID=number)", "retire (IDs)", "acknowledge reused numbers (numbers)"]) {
      refused(() => cliArguments(operation, text), /should hold/);
    }
    refused(() => cliArguments("retire (IDs)", "r0254", text), /should hold identities/);
  }
  // Each kind of box takes only its own kind of item.
  refused(() => cliArguments("confirm wording (IDs)", "12.4.1.c"), /should hold identities/);
  refused(() => cliArguments("add new rules (numbers)", "r0254"), /should hold rule numbers/);
  refused(() => cliArguments("renumber or move (ID=number)", "r0254"), /should hold identity=number pairs/);
  // Only operations in the form are accepted.
  for (const operation of ["confirm", "check", "remap (IDs)", "check only (change nothing); id", ""]) refused(() => cliArguments(operation), /Unknown operation/);
});

test("replacements are only for retiring, and nothing is named twice", () => {
  refused(() => cliArguments("confirm wording (IDs)", "r0254", "r0340"), /only for "retire \(IDs\)"/);
  refused(() => cliArguments("check only (change nothing)", "", "r0340"), /only for "retire \(IDs\)"/);
  refused(() => cliArguments("confirm wording (IDs)", "r0254 r0254"), /more than once/);
  refused(() => cliArguments("add new rules (numbers)", Array.from({ length: 101 }, (_, i) => `12.4.1.${String.fromCharCode(97 + (i % 26)).repeat(1 + Math.floor(i / 26))}`).join(" ")), /more than 100/);
});

test("it refuses the default branch and anything that is not a branch", () => {
  refused(() => checkBranch({ refName: "main", refType: "branch", defaultBranch: "main" }), /never changes main/);
  refused(() => checkBranch({ refName: "published-1.0", refType: "tag", defaultBranch: "main" }), /on a branch, not a tag/);
  refused(() => checkBranch({ refName: "", refType: "branch", defaultBranch: "main" }), /could not be worked out/);
  refused(() => checkBranch({ refName: "policy/fraud", refType: "branch", defaultBranch: "" }), /could not be worked out/);
  assert.doesNotThrow(() => checkBranch({ refName: "policy/fraud-monitoring", refType: "branch", defaultBranch: "main" }));
});

test("run as the workflow runs it, it prints one argument per line, or refuses", () => {
  const env = { ...process.env, GITHUB_ACTIONS: "true", GITHUB_REF_NAME: "policy/fraud", GITHUB_REF_TYPE: "branch", DEFAULT_BRANCH: "main" };
  const run = (extra) => spawnSync(process.execPath, [ACTION], { env: { ...env, ...extra }, encoding: "utf-8" });
  const ok = run({ OPERATION: "renumber or move (ID=number)", ARGUMENTS: "r0256=12.4.1.f r0255=12.4.1.e", REPLACED_BY: "" });
  assert.equal(ok.status, 0);
  assert.equal(ok.stdout, "renumber\nr0256=12.4.1.f\nr0255=12.4.1.e\n");
  const onMain = run({ GITHUB_REF_NAME: "main", OPERATION: "confirm wording (IDs)", ARGUMENTS: "r0254" });
  assert.equal(onMain.status, 1);
  assert.equal(onMain.stdout, "");
  assert.match(onMain.stderr, /^::error::This workflow never changes main/);
  const injected = run({ OPERATION: "confirm wording (IDs)", ARGUMENTS: "r0254\n--all-changed" });
  assert.equal(injected.status, 1);
  assert.equal(injected.stdout, "");
});

// --- The command's exit status ------------------------------------------------

const registryHash = () => crypto.createHash("sha256").update(fs.readFileSync(path.join(REPO_ROOT, REGISTRY_FILE))).digest("hex");
const cli = (...args) => spawnSync(process.execPath, [CLI, ...args], { cwd: SITE_DIR, encoding: "utf-8" });

test("the command exits 0 when the registry matches, and 2, changing nothing, when it refuses", () => {
  const before = registryHash();
  assert.equal(cli("check").status, 0);
  for (const args of [["confirm", "r9999"], ["add", "12.4.1.c"], ["renumber", "r0254=99.9.z"], ["remap", "r0254"], ["reuse", "12.4.1.c"]]) {
    const result = cli(...args);
    assert.equal(result.status, 2, args.join(" "));
    assert.equal(registryHash(), before, `${args.join(" ")} left ${REGISTRY_FILE} unchanged`);
  }
  // Confirming wording that has not changed writes the same registry: nothing to commit.
  const same = cli("confirm", "r0254");
  assert.equal(same.status, 0);
  assert.match(same.stdout, /wording unchanged, nothing to confirm/);
  assert.equal(registryHash(), before);
});

test("an identity can be given only one new number at a time", () => {
  const registry = readRegistry(REPO_ROOT);
  const rules = frameworkRules(readSections(REPO_ROOT));
  assert.throws(() => apply(registry, rules, "renumber", ["r0254=12.4.1.c", "r0254=12.4.1.d"]), /only one new number at a time/);
});

// --- The workflow file ------------------------------------------------------------

/** The workflow's jobs, by id, as text. */
const jobs = Object.fromEntries([...WORKFLOW.split(/\njobs:\n/)[1].matchAll(/^ {2}([a-z-]+):\n((?: {4}.*\n|\n)+)/gm)].map((m) => [m[1], m[2]]));

test("the workflow is run by hand, from the browser, and named for maintainers", () => {
  assert.match(WORKFLOW, /^name: Maintain rule identities\n/);
  assert.match(WORKFLOW, /\non:\n {2}workflow_dispatch:\n/);
  assert.doesNotMatch(WORKFLOW, /\n {2}(push|pull_request|pull_request_target|schedule|workflow_run):/);
  assert.deepEqual(Object.keys(jobs), ["refuse", "maintain"]);
});

test("its write path can never run on the default branch or a tag, and it says so when asked to", () => {
  assert.match(jobs.maintain, /\n {4}if: github\.ref_type == 'branch' && github\.ref_name != github\.event\.repository\.default_branch\n/);
  assert.match(jobs.refuse, /\n {4}if: github\.ref_type != 'branch' \|\| github\.ref_name == github\.event\.repository\.default_branch\n/);
  assert.match(jobs.refuse, /exit 1/);
  // The form is read with the branch check too, before anything runs.
  assert.match(jobs.maintain, /DEFAULT_BRANCH: \$\{\{ github\.event\.repository\.default_branch \}\}\n\s+run: node scripts\/rule-identities-action\.js/);
});

test("the form's values reach only environment variables, never a command line", () => {
  const uses = WORKFLOW.split("\n").filter((line) => /\$\{\{[^}]*\binputs\./.test(line) || /github\.event\.inputs/.test(line));
  assert.deepEqual(uses.map((line) => line.trim()), [
    "OPERATION: ${{ inputs.operation }}",
    "ARGUMENTS: ${{ inputs.arguments }}",
    "REPLACED_BY: ${{ inputs.replaced_by }}",
  ]);
  // Expressions inside run scripts use only step outputs made from checked arguments, the token and fixed values.
  const runBlocks = [...WORKFLOW.matchAll(/\n( +)run: \|\n((?:\1 {2}.*\n|\n)+)/g)].map((m) => m[2]);
  for (const block of runBlocks) assert.doesNotMatch(block, /\$\{\{/, "no expressions inside run scripts");
});

test("it runs the existing command, and commits only rule-identities.json, to the same branch", () => {
  const maintain = jobs.maintain;
  assert.match(maintain, /npm run --silent rules -- "\$\{args\[@\]\}"/);
  assert.match(maintain, /mapfile -t args < "\$RUNNER_TEMP\/rules-arguments"/);
  // Refused (status 2): fail, before the commit step.
  assert.match(maintain, /if \[ "\$status" -ge 2 \]; then\n\s+echo "::error::The command was refused, so nothing was changed or committed/);
  // Nothing to change: say so, commit nothing.
  assert.match(maintain, /if \[ -z "\$changes" \]; then\n\s+echo "Nothing to change/);
  // Anything but the registry changed: fail, commit nothing.
  assert.match(maintain, /if \[ "\$changes" != " M rule-identities\.json" \]; then\n\s+echo "::error::Files other than rule-identities\.json changed/);
  assert.match(maintain, /git add rule-identities\.json\n/);
  assert.doesNotMatch(maintain, /git add (-A|--all|\.)|git commit (-a|--all)/);
  // Pushed to the branch the workflow was run on, never forced.
  assert.match(maintain, /push origin "HEAD:refs\/heads\/\$\{GITHUB_REF_NAME\}"/);
  assert.doesNotMatch(maintain, /--force|push -f|\+HEAD/);
  // The checkout is the branch the workflow was run on, and keeps no token.
  assert.match(maintain, /- uses: actions\/checkout@v\d+\n\s+with:\n\s+persist-credentials: false\n/);
  assert.doesNotMatch(maintain, /\n\s+ref:/);
  // A bot identity.
  assert.match(maintain, /git config user\.name "github-actions\[bot\]"/);
});

test("it uses the least permissions, no secrets, and reruns the checks after committing", () => {
  assert.match(WORKFLOW, /\npermissions:\n {2}contents: read\n/);
  assert.match(jobs.refuse, /\n {4}permissions: \{\}\n/);
  assert.match(jobs.maintain, /\n {4}permissions:\n {6}contents: write # [^\n]+\n {6}actions: write # [^\n]+\n {4}steps:/);
  assert.doesNotMatch(WORKFLOW, /secrets\./);
  assert.match(jobs.maintain, /npm ci --ignore-scripts/);
  assert.match(jobs.maintain, /if: steps\.commit\.outputs\.changed == 'true'\n[\s\S]*gh workflow run site\.yml --repo "\$GITHUB_REPOSITORY" --ref "\$GITHUB_REF_NAME"\n\s+gh workflow run checks\.yml --repo "\$GITHUB_REPOSITORY" --ref "\$GITHUB_REF_NAME"/);
  // Both workflows it starts can be started this way.
  for (const file of ["site.yml", "checks.yml"]) {
    assert.match(fs.readFileSync(path.join(REPO_ROOT, ".github", "workflows", file), "utf-8"), /\n {2}workflow_dispatch:/, file);
  }
});

test("ARCHITECTURE.md documents every operation in the form", () => {
  const guide = fs.readFileSync(path.join(REPO_ROOT, "ARCHITECTURE.md"), "utf-8").replace(/\r\n/g, "\n");
  assert.match(guide, /\n### Working entirely in GitHub\n/);
  for (const operation of Object.keys(OPERATIONS)) {
    const command = `npm run rules -- ${OPERATIONS[operation].command.join(" ")}`;
    assert.ok(guide.split("\n").some((line) => line.startsWith(`| ${operation} |`) && line.includes(command)), `${operation} runs ${command}`);
  }
});

test("the workflow file has no tabs, which YAML does not allow for indentation", () => {
  assert.doesNotMatch(WORKFLOW, /\t/);
});
