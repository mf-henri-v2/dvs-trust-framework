// Tests for what a failed "Check rule identities" step shows maintainers:
// the job summary (scripts/rule-identities-summary.js) and the step in the
// Reading site workflow that writes it. Run with: npm test
//
// The step is run for real, in bash, with a stand-in for npm that prints
// given output and exits with a given status, so the tests show what the
// step does with each result of `npm run rules`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkSummary, WORKFLOW_FILE } from "../scripts/rule-identities-summary.js";
import { OPERATIONS } from "../scripts/rule-identities-action.js";

const SITE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = path.resolve(SITE_DIR, "..");
const SITE_WORKFLOW = fs.readFileSync(path.join(REPO_ROOT, ".github", "workflows", "site.yml"), "utf-8").replace(/\r\n/g, "\n");

// Output in the form `npm run rules` gives it, for a reworded rule.
const DECISION = [
  "rule-identities.json does not match the trust framework (1 problem). See ARCHITECTURE.md, under Rule identities.",
  "",
  "The wording of rule 12.4.1.c (trust-framework-1.0/part-3/12-service-requirements.md), registered as r0254, has changed since it was last confirmed. Decide which applies:",
  '  - It is still the same rule, with changed wording: run `npm run rules -- confirm r0254`, or set its "fingerprint" to "cd2f9a7e0b6c1d34". Its identity stays the same.',
  "  - A different rule now has this number: record what happened to r0254 (renumber or retire it), and register the rule that has the number now.",
  "",
  "See ARCHITECTURE.md, under Rule identities.",
].join("\n");

const ENV = {
  GITHUB_SERVER_URL: "https://github.com",
  GITHUB_REPOSITORY: "ofdia-uk/dvs-trust-framework",
  GITHUB_HEAD_REF: "policy/fraud-monitoring",
  GITHUB_REF_NAME: "60/merge",
  DEFAULT_BRANCH: "main",
  HEAD_REPOSITORY: "ofdia-uk/dvs-trust-framework",
};

// --- The summary ------------------------------------------------------------

test("a passing check writes no summary", () => {
  assert.equal(checkSummary({ output: "rule-identities.json matches the trust framework: 337 rules, each with one permanent identity.", status: 0, env: ENV }), "");
  assert.equal(checkSummary({ output: "", status: "0", env: ENV }), "");
});

test("a decision is described, with the route in GitHub and the route on a computer, above the command's output", () => {
  const summary = checkSummary({ output: DECISION, status: 1, env: ENV });
  assert.match(summary, /^## Rule identity decision required\n/);
  // In GitHub: the workflow, linked from this repository, and this pull request's branch.
  assert.match(summary, /### Working in GitHub\n/);
  assert.match(summary, /\*\*Actions\*\*, then \[Maintain rule identities\]\(https:\/\/github\.com\/ofdia-uk\/dvs-trust-framework\/actions\/workflows\/maintain-rule-identities\.yml\), then \*\*Run workflow\*\*/);
  assert.match(summary, /Under \*\*Use workflow from\*\*, choose this pull request's branch, `policy\/fraud-monitoring`\./);
  assert.match(summary, /Choose the operation, and type the identities or numbers, that the output below describes/);
  // On a computer.
  assert.match(summary, /### Working locally\n\nFrom `docs-site\/`, run the `npm run rules -- …` command that the output below gives/);
  // Confirming is not approval.
  assert.match(summary, /Confirming an identity records that the changed wording is still the same logical rule\. It does not approve the policy wording: reviewing and merging the pull request is still the acceptance step\./);
  // The command's output, complete and unchanged, last.
  assert.match(summary, /### What needs deciding\n/);
  assert.ok(summary.includes(`\n\`\`\`text\n${DECISION}\n\`\`\`\n`), "the output is in a text block, exactly as printed");
  assert.ok(summary.indexOf("### What needs deciding") > summary.indexOf("### Working locally"));
});

test("the table of operations comes from the workflow's own form, so the two cannot disagree", () => {
  const summary = checkSummary({ output: DECISION, status: 1, env: ENV });
  for (const [name, operation] of Object.entries(OPERATIONS)) {
    if (operation.command[0] === "check") continue;
    assert.match(summary, new RegExp(`\\| \`npm run rules -- ${operation.command.join(" ").replace(/-/g, "\\-")}[^|]*\` \\| ${name.replace(/[()]/g, "\\$&")} \\|`), name);
  }
  assert.doesNotMatch(summary, /\| check only/, "the table lists only operations that record a decision");
});

test("the output can never end its text block early, and very long output is cut, with a pointer to the log", () => {
  const tricky = "line with ``` backticks ```` inside";
  const summary = checkSummary({ output: tricky, status: 1, env: ENV });
  assert.ok(summary.includes(`\n\`\`\`\`\`text\n${tricky}\n\`\`\`\`\`\n`));
  const long = checkSummary({ output: "x".repeat(250_000), status: 1, env: ENV });
  assert.ok(long.length < 210_000);
  assert.match(long, /All of it is in the step's log/);
});

test("branch names are shown as code, whatever they contain", () => {
  const summary = checkSummary({ output: DECISION, status: 1, env: { ...ENV, GITHUB_HEAD_REF: "fix`[link](https://example.org)`" } });
  // A code span long enough, and padded because the name ends with a backtick, so the name stays inside it.
  assert.match(summary, /choose this pull request's branch, `` fix`\[link\]\(https:\/\/example\.org\)` ``\./);
});

test("a pull request from another repository, or a failure on main, gets the route that works there", () => {
  const fork = checkSummary({ output: DECISION, status: 1, env: { ...ENV, HEAD_REPOSITORY: "someone/dvs-trust-framework" } });
  assert.match(fork, /This pull request's branch is in another repository, `someone\/dvs-trust-framework`\. The workflow has to be run there/);
  const main = checkSummary({ output: DECISION, status: 1, env: { ...ENV, GITHUB_HEAD_REF: "", GITHUB_REF_NAME: "main", HEAD_REPOSITORY: "" } });
  assert.match(main, /This check failed on `main`, which the workflow never changes\. Record the decision on a branch, in a pull request\./);
});

test("a check that could not run says so, without asking for a decision", () => {
  const summary = checkSummary({ output: "rule-identities.json cannot be read: Unexpected token } in JSON", status: 2, env: ENV });
  assert.match(summary, /^## Rule identity check could not run\n/);
  assert.match(summary, /rule-identities\.json cannot be read: Unexpected token \} in JSON/);
  assert.doesNotMatch(summary, /decision required|Maintain rule identities|Confirming/);
});

// --- The workflow step, run for real -----------------------------------------------

/** The run script of the Reading site workflow's "Check rule identities" step, and its env. */
function checkStep() {
  const match = /\n( +)- name: Check rule identities\n((?:\1 {2}.*\n)+)/.exec(SITE_WORKFLOW);
  assert.ok(match, "the step exists");
  const body = match[2];
  const run = /\n( +)run: \|\n((?:\1 {2}.*\n|\n)+)/.exec(`\n${body}`);
  const indent = run[1].length + 2;
  return { body, script: run[2].split("\n").map((line) => line.slice(indent)).join("\n") };
}

/** Run the step with a stand-in npm. Returns { status, stdout, summary, npmArgs }. */
function runStep({ output, status }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rule-identity-check-"));
  const bin = path.join(dir, "bin");
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(dir, "output.txt"), output);
  fs.writeFileSync(path.join(bin, "npm"), '#!/bin/sh\nprintf "%s\\n" "$@" > "$FAKE_DIR/npm-args"\ncat "$FAKE_DIR/output.txt"\nexit "$FAKE_STATUS"\n');
  fs.chmodSync(path.join(bin, "npm"), 0o755);
  const summary = path.join(dir, "summary.md");
  fs.writeFileSync(summary, "");
  const result = spawnSync("bash", ["--noprofile", "--norc", "-eo", "pipefail", "-c", checkStep().script], {
    cwd: SITE_DIR,
    encoding: "utf-8",
    env: {
      ...process.env,
      ...ENV,
      PATH: `${bin}${path.delimiter}${process.env.PATH}`,
      FAKE_DIR: dir,
      FAKE_STATUS: String(status),
      RUNNER_TEMP: dir,
      GITHUB_STEP_SUMMARY: summary,
    },
  });
  return {
    status: result.status,
    stdout: result.stdout,
    summary: fs.readFileSync(summary, "utf-8"),
    npmArgs: fs.readFileSync(path.join(dir, "npm-args"), "utf-8").trim().split("\n"),
  };
}

test("the step fails when the check fails, keeps the output in the log, and adds the summary and an error", () => {
  const run = runStep({ output: `${DECISION}\n`, status: 1 });
  assert.equal(run.status, 1, "the check still fails");
  assert.ok(run.stdout.includes(DECISION), "the command's output is still in the log");
  assert.match(run.stdout, /^::error title=Rule identity decision required::A rule was added, reworded, renumbered, moved or removed\. See this run's Summary page for how to record the decision in GitHub or locally.$/m);
  assert.match(run.summary, /^## Rule identity decision required\n/);
  assert.ok(run.summary.includes(DECISION));
  assert.match(run.summary, /choose this pull request's branch, `policy\/fraud-monitoring`/);
});

test("when the check could not run, the step fails with that status and says so", () => {
  const run = runStep({ output: "rule-identities.json cannot be read: Unexpected end of JSON input\n", status: 2 });
  assert.equal(run.status, 2);
  assert.match(run.stdout, /^::error title=Rule identity check could not run::/m);
  assert.match(run.summary, /^## Rule identity check could not run\n/);
});

test("when the check passes, the step passes quietly: its output, no summary and no error", () => {
  const ok = "rule-identities.json matches the trust framework: 337 rules, each with one permanent identity.";
  const run = runStep({ output: `${ok}\n`, status: 0 });
  assert.equal(run.status, 0);
  assert.equal(run.stdout.trim(), ok);
  assert.equal(run.summary, "");
});

test("the step only checks: it runs `npm run rules` with no operation, and starts nothing else", () => {
  for (const status of [0, 1, 2]) assert.deepEqual(runStep({ output: "x\n", status }).npmArgs, ["run", "--silent", "rules"], `status ${status}`);
  const { body, script } = checkStep();
  assert.doesNotMatch(script, /gh |workflow run|maintain-rule-identities|git (commit|push)|confirm|--all-changed/);
  // Values from the event reach the step only as environment variables.
  assert.doesNotMatch(script, /\$\{\{/);
  assert.match(body, /env:\n\s+DEFAULT_BRANCH: \$\{\{ github\.event\.repository\.default_branch \}\}\n\s+HEAD_REPOSITORY: \$\{\{ github\.event\.pull_request\.head\.repo\.full_name \}\}\n/);
  // The Reading site workflow still has read-only access to the repository's contents.
  assert.match(SITE_WORKFLOW, /\npermissions:\n {2}contents: read\n/);
  // The summary links to the workflow file that exists.
  assert.ok(fs.existsSync(path.join(REPO_ROOT, ".github", "workflows", WORKFLOW_FILE)));
  // The summary is only text: it starts no process and makes no request.
  const source = fs.readFileSync(path.join(SITE_DIR, "scripts", "rule-identities-summary.js"), "utf-8");
  assert.doesNotMatch(source, /child_process|fetch\(|https?\.request|writeFileSync/);
});
