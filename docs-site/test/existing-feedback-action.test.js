// Tests for choosing existing feedback to show: the commands
// (scripts/existing-feedback.js), the "Show existing feedback" workflow
// (.github/workflows/show-existing-feedback.yml) and how its form becomes a
// command (scripts/existing-feedback-action.js). Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ACTIONS, cliArguments, issueNumber, ActionInputError } from "../scripts/existing-feedback-action.js";
import { apply } from "../scripts/existing-feedback.js";
import { loadRuleIdentities, sectionFiles } from "../lib/rule-identities.js";
import { FEEDBACK_FILE, formatExistingFeedback, checkExistingFeedback } from "../lib/existing-feedback.js";

const SITE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = path.resolve(SITE_DIR, "..");
const WORKFLOW = fs.readFileSync(path.join(REPO_ROOT, ".github", "workflows", "show-existing-feedback.yml"), "utf-8").replace(/\r\n/g, "\n");
const CLI = path.join(SITE_DIR, "scripts", "existing-feedback.js");
const ACTION = path.join(SITE_DIR, "scripts", "existing-feedback-action.js");

const IDENTITIES = loadRuleIdentities(REPO_ROOT);
const SECTIONS = sectionFiles(REPO_ROOT);
const S12 = "trust-framework-1.0/part-3/12-service-requirements.md";
const R_12_4_1_C = IDENTITIES.byNumber["12.4.1.c"];
const R_11_2_B = IDENTITIES.byNumber["11.2.b"];

// --- The commands -------------------------------------------------------------------

const empty = () => ({ about: "About.", feedback: [] });
const run = (register, ...args) => apply(register, IDENTITIES, SECTIONS, args[0], args.slice(1));

test("show records rules by permanent identity, whether given by number or identity", () => {
  const register = empty();
  const done = run(register, "show", "6", "--title", "What registration means", "--rules", "Rule 12.4.1.C.", R_11_2_B);
  assert.deepEqual(register.feedback, [{ issue: 6, title: "What registration means", rules: [R_12_4_1_C, R_11_2_B] }]);
  assert.match(done[0], new RegExp(`Added issue 6, "What registration means"\\. It is shown on rule 12\\.4\\.1\\.c \\(${R_12_4_1_C}\\), rule 11\\.2\\.b \\(${R_11_2_B}\\)\\.`));
  assert.deepEqual(checkExistingFeedback(register, IDENTITIES, SECTIONS), []);
});

test("show takes sections by number or file", () => {
  const register = empty();
  run(register, "show", "#22", "--title", "No operational floor", "--sections", "12");
  run(register, "show", "23", "--title", "Internal threats", "--sections", S12, "section 11");
  assert.deepEqual(register.feedback, [
    { issue: 22, title: "No operational floor", sections: [S12] },
    { issue: 23, title: "Internal threats", sections: [S12, "trust-framework-1.0/part-3/11-operational-requirements.md"] },
  ]);
});

test("show for a listed issue changes only what is given, and remove takes it off the site", () => {
  const register = empty();
  run(register, "show", "6", "--title", "Old title", "--rules", "12.4.1.c");
  assert.match(run(register, "show", "6", "--sections", "12")[0], /^Updated issue 6, "Old title"/);
  run(register, "show", "6", "--title", "New title");
  assert.deepEqual(register.feedback, [{ issue: 6, title: "New title", rules: [R_12_4_1_C], sections: [S12] }]);
  assert.match(run(register, "remove", "6")[0], /Removed issue 6\. .*the issue on GitHub is unchanged/);
  assert.deepEqual(register.feedback, []);
});

test("a command that cannot be done is refused and changes nothing", () => {
  const register = empty();
  run(register, "show", "6", "--title", "Listed", "--rules", "12.4.1.c");
  const before = JSON.stringify(register);
  for (const [args, pattern] of [
    [["show", "7", "--rules", "12.4.1.c"], /Give a short title for issue 7/],
    [["show", "7", "--title", "About nothing"], /Say what issue 7 is about/],
    [["show", "7", "--title", "x", "--rules", "12.99.z"], /The working draft has no rule 12\.99\.z/],
    [["show", "7", "--title", "x", "--rules", "r9999"], /r9999 is not in rule-identities\.json/],
    [["show", "7", "--title", "x", "--rules", "fraud"], /is not a rule number/],
    [["show", "7", "--title", "x", "--sections", "99"], /"99" is not a section of the trust framework/],
    [["show", "7", "--title", "Two\nlines", "--rules", "12.4.1.c"], /"title" must be a short title on one line/],
    [["show", "7", "--title", "x".repeat(151), "--rules", "12.4.1.c"], /151 characters long/],
    [["show", "7", "--title", "a", "b", "--rules", "12.4.1.c"], /--title takes one value/],
    [["show", "7", "--title", "x", "--rules"], /--rules needs at least one value/],
    [["show", "7", "12.4.1.c"], /Unexpected "12\.4\.1\.c"/],
    [["show", "seven", "--title", "x", "--rules", "12.4.1.c"], /Give the issue's number on GitHub/],
    [["remove", "8"], /Issue 8 is not listed/],
    [["remove"], /Give one issue number/],
    [["publish", "6"], /Unknown command "publish"/],
  ]) {
    assert.throws(() => run(register, ...args), pattern, args.join(" "));
    assert.equal(JSON.stringify(register), before, `${args.join(" ")} changed nothing`);
  }
});

test("the register is written one issue per line, so each change is one line to review", () => {
  const register = empty();
  assert.equal(formatExistingFeedback(register), '{\n  "about": "About.",\n  "feedback": []\n}\n');
  run(register, "show", "6", "--title", 'What "registration" means', "--rules", "12.4.1.c");
  run(register, "show", "22", "--title", "No floor", "--sections", "12");
  assert.equal(
    formatExistingFeedback(register),
    `{\n  "about": "About.",\n  "feedback": [\n    {"issue":6,"title":"What \\"registration\\" means","rules":["${R_12_4_1_C}"]},\n    {"issue":22,"title":"No floor","sections":["${S12}"]}\n  ]\n}\n`,
  );
});

const registerHash = () => crypto.createHash("sha256").update(fs.readFileSync(path.join(REPO_ROOT, FEEDBACK_FILE))).digest("hex");
const cli = (...args) => spawnSync(process.execPath, [CLI, ...args], { cwd: SITE_DIR, encoding: "utf-8" });

test("the command exits 0 when the register is in order, and 2, changing nothing, when it refuses", () => {
  const before = registerHash();
  assert.equal(cli("check").status, 0);
  for (const args of [["show", "6", "--rules", "12.99.z"], ["remove", "999999"], ["publish"]]) {
    const result = cli(...args);
    assert.equal(result.status, 2, args.join(" "));
    assert.match(result.stderr, /^Nothing was changed\./);
    assert.equal(registerHash(), before, `${args.join(" ")} left ${FEEDBACK_FILE} unchanged`);
  }
});

// --- From the form to the command ---------------------------------------------------

const SHOW = "show an issue (or change how it is shown)";
const STOP = "stop showing an issue";
const ISSUE = { number: 6, title: 'The word "registration" in rule 12.4.1.c. is unclear', isPullRequest: false };
const refused = (fn, pattern) => assert.throws(fn, (error) => error instanceof ActionInputError && pattern.test(error.message));

test("the form becomes one show or remove command", () => {
  assert.deepEqual(cliArguments({ action: SHOW, issue: "6", title: "What registration means", rules: "12.4.1.c, Rule 11.2.B.", sections: "" }, ISSUE), [
    "show", "6", "--title", "What registration means", "--rules", "12.4.1.c", "11.2.b",
  ]);
  assert.deepEqual(cliArguments({ action: SHOW, issue: "#6", title: " ", rules: "", sections: "section 12" }, ISSUE), [
    "show", "6", "--title", ISSUE.title, "--sections", "12",
  ]);
  assert.deepEqual(cliArguments({ action: SHOW, issue: "6", rules: "r0254" }, ISSUE), ["show", "6", "--title", ISSUE.title, "--rules", "r0254"]);
  assert.deepEqual(cliArguments({ action: STOP, issue: "6" }, ISSUE), ["remove", "6"]);
});

test("the form offers exactly these actions, starting with showing an issue", () => {
  const options = /\n {8}options:\n((?: {10}- .+\n)+)/.exec(WORKFLOW)[1].split("\n").filter(Boolean).map((line) => line.replace(/^ {10}- /, ""));
  assert.deepEqual(options, Object.keys(ACTIONS));
  assert.match(WORKFLOW, new RegExp(`\\n {8}default: ${SHOW.replace(/[()]/g, "\\$&")}\\n`));
});

test("nothing typed in the form can become anything but an issue number, a title, rule numbers or section numbers", () => {
  refused(() => issueNumber("6; rm -rf /"), /"issue" should be the issue's number/);
  refused(() => issueNumber("0"), /"issue" should be the issue's number/);
  refused(() => cliArguments({ action: "publish", issue: "6" }, ISSUE), /Unknown action/);
  refused(() => cliArguments({ action: SHOW, issue: "6", rules: "12.4.1.c --sections 1" }, ISSUE), /"rules" should hold rule numbers.*These are not: "--", "1"/);
  refused(() => cliArguments({ action: SHOW, issue: "6", rules: "$(whoami)" }, ISSUE), /"rules" should hold rule numbers/);
  refused(() => cliArguments({ action: SHOW, issue: "6", sections: "12-service-requirements" }, ISSUE), /"sections" should hold section numbers/);
  refused(() => cliArguments({ action: SHOW, issue: "6", rules: "12.4.1.c 12.4.1.c" }, ISSUE), /names something more than once/);
  refused(() => cliArguments({ action: SHOW, issue: "6", title: "One\n--rules r0001" }, ISSUE), /must be on one line/);
  refused(() => cliArguments({ action: SHOW, issue: "6", title: "x".repeat(151) }, ISSUE), /The title is 151 characters long/);
  refused(() => cliArguments({ action: SHOW, issue: "6" }, { ...ISSUE, title: "x".repeat(200) }), /The issue's own title is 200 characters long. Type a shorter one/);
  refused(() => cliArguments({ action: STOP, issue: "6", rules: "12.4.1.c" }, ISSUE), /takes only the issue number/);
});

test("only an issue that exists, and is not a pull request, can be shown", () => {
  refused(() => cliArguments({ action: SHOW, issue: "6", rules: "12.4.1.c" }, null), /There is no issue 6/);
  refused(() => cliArguments({ action: SHOW, issue: "6", rules: "12.4.1.c" }, { ...ISSUE, isPullRequest: true }), /is a pull request, not an issue/);
});

test("run as the workflow runs it, a form that is not valid is refused before GitHub is asked anything", () => {
  const result = spawnSync(process.execPath, [ACTION], {
    env: { ...process.env, GITHUB_ACTIONS: "true", GITHUB_API_URL: "http://127.0.0.1:9", GITHUB_REPOSITORY: "x/y", ACTION: SHOW, ISSUE: "6 && echo" },
    encoding: "utf-8",
  });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /^::error::"issue" should be the issue's number/);
});

// --- The workflow file ----------------------------------------------------------------

const jobs = Object.fromEntries([...WORKFLOW.split(/\njobs:\n/)[1].matchAll(/^ {2}([a-z-]+):\n((?: {4}.*\n|\n)+)/gm)].map((m) => [m[1], m[2]]));

test("the workflow is run by hand, from the browser, and named for maintainers", () => {
  assert.match(WORKFLOW, /^name: Show existing feedback\n/);
  assert.match(WORKFLOW, /\non:\n {2}workflow_dispatch:\n/);
  assert.doesNotMatch(WORKFLOW, /\n {2}(push|pull_request|pull_request_target|schedule|workflow_run|issues):/);
  assert.deepEqual(Object.keys(jobs), ["refuse", "record"]);
  assert.match(jobs.record, /\n {4}if: github\.ref_type == 'branch'\n/);
  assert.match(jobs.refuse, /\n {4}if: github\.ref_type != 'branch'\n[\s\S]*exit 1/);
});

test("the form's values reach only environment variables, never a command line", () => {
  const uses = WORKFLOW.split("\n").filter((line) => /\$\{\{[^}]*\binputs\./.test(line) || /github\.event\.inputs/.test(line));
  assert.deepEqual(uses.map((line) => line.trim()), [
    "ACTION: ${{ inputs.action }}",
    "ISSUE: ${{ inputs.issue }}",
    "TITLE: ${{ inputs.title }}",
    "RULES: ${{ inputs.rules }}",
    "SECTIONS: ${{ inputs.sections }}",
  ]);
  const runBlocks = [...WORKFLOW.matchAll(/\n( +)run: \|\n((?:\1 {2}.*\n|\n)+)/g)].map((m) => m[2]);
  assert.ok(runBlocks.length >= 4);
  for (const block of runBlocks) assert.doesNotMatch(block, /\$\{\{/, "no expressions inside run scripts");
});

test("it runs the existing command, commits only existing-feedback.json, and never to main", () => {
  const record = jobs.record;
  assert.match(record, /mapfile -t args < "\$RUNNER_TEMP\/feedback-arguments"/);
  assert.match(record, /npm run --silent feedback -- "\$\{args\[@\]\}"/);
  assert.match(record, /if \[ "\$status" -ne 0 \]; then\n\s+echo "::error::Nothing was committed/);
  assert.match(record, /if \[ -z "\$changes" \]; then\n\s+echo "Nothing to change/);
  assert.match(record, /if \[ "\$changes" != " M existing-feedback\.json" \]; then\n\s+echo "::error::Files other than existing-feedback\.json changed/);
  assert.match(record, /git add existing-feedback\.json\n/);
  assert.doesNotMatch(record, /git add (-A|--all|\.)|git commit (-a|--all)/);
  // From the default branch, a new branch; otherwise the branch it was run on.
  assert.match(record, /branch="\$GITHUB_REF_NAME"\n\s+if \[ "\$branch" = "\$DEFAULT_BRANCH" \]; then\n\s+branch="existing-feedback\/issue-\$\{ISSUE\}-run-\$\{GITHUB_RUN_ID\}"\n\s+git switch --create "\$branch"\n\s+fi/);
  assert.match(record, /push origin "HEAD:refs\/heads\/\$\{branch\}"/);
  assert.doesNotMatch(record, /--force|push -f|\+HEAD/);
  // The pull request is opened only for a new branch, and goes to the default branch for review.
  assert.match(record, /if: steps\.commit\.outputs\.changed == 'true' && github\.ref_name == github\.event\.repository\.default_branch\n/);
  assert.match(record, /gh pr create --repo "\$GITHUB_REPOSITORY" --base "\$DEFAULT_BRANCH" --head "\$BRANCH"/);
  assert.doesNotMatch(record, /gh pr merge|--auto/);
  assert.match(record, /- uses: actions\/checkout@v\d+\n\s+with:\n\s+persist-credentials: false\n/);
  assert.match(record, /git config user\.name "github-actions\[bot\]"/);
});

test("it uses the least permissions, no secrets, and runs the checks after committing", () => {
  assert.match(WORKFLOW, /\npermissions:\n {2}contents: read\n/);
  assert.match(jobs.refuse, /\n {4}permissions: \{\}\n/);
  assert.match(jobs.record, /\n {4}permissions:\n {6}contents: write # [^\n]+\n {6}pull-requests: write # [^\n]+\n {6}issues: read # [^\n]+\n {6}actions: write # [^\n]+\n {4}steps:/);
  assert.doesNotMatch(WORKFLOW, /secrets\./);
  assert.match(jobs.record, /npm ci --ignore-scripts/);
  assert.match(jobs.record, /gh workflow run site\.yml --repo "\$GITHUB_REPOSITORY" --ref "\$BRANCH"\n\s+gh workflow run checks\.yml --repo "\$GITHUB_REPOSITORY" --ref "\$BRANCH"/);
});
