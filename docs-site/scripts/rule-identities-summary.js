#!/usr/bin/env node
// When the Reading site workflow's "Check rule identities" step fails, this
// writes the job summary: what the failure means, how to record the decision
// in GitHub or locally, and then the output of `npm run rules`, which is what
// describes each decision. It writes nothing when the check passes.
//
// It does not look inside the output or decide anything about any rule. It
// uses only the command's exit status (see scripts/rule-identities.js):
// 1 means decisions are needed, 2 means the check could not run.
//
// Run by the workflow as:
//   node scripts/rule-identities-summary.js <file with the output> <exit status>
// with GitHub's own variables (GITHUB_SERVER_URL, GITHUB_REPOSITORY,
// GITHUB_HEAD_REF, GITHUB_REF_NAME) and DEFAULT_BRANCH and HEAD_REPOSITORY in
// the environment. It prints Markdown for $GITHUB_STEP_SUMMARY.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { OPERATIONS } from "./rule-identities-action.js";

export const WORKFLOW_FILE = "maintain-rule-identities.yml";
// GitHub limits a job summary to 1 MiB. The output is never that long in
// practice, but if it were, the summary would be lost altogether.
const MAX_OUTPUT = 200_000;

/** Text in a code span or block that its contents cannot end early. */
function fence(text, { block = false } = {}) {
  const longest = Math.max(0, ...[...String(text).matchAll(/`+/g)].map((m) => m[0].length));
  const ticks = "`".repeat(Math.max(block ? 3 : 1, longest + 1));
  if (block) return `${ticks}text\n${text}\n${ticks}`;
  const pad = /^`|`$/.test(text) ? " " : "";
  return `${ticks}${pad}${text}${pad}${ticks}`;
}

const EXAMPLES = { nothing: "", ids: "r0254", numbers: "12.4.1.g", mappings: "r0254=12.4.1.d" };

/** The form's operations, by the command each runs, so the output below can be matched to the form. */
function operationTable() {
  const rows = Object.entries(OPERATIONS)
    .filter(([, operation]) => operation.command[0] !== "check")
    .map(([name, operation]) => {
      const example = EXAMPLES[operation.takes];
      const command = `npm run rules -- ${[...operation.command, example].filter(Boolean).join(" ")}`;
      return `| ${fence(command)} | ${name} | ${example ? fence(example) : "nothing"} |`;
    });
  return ["| The output says to run | Choose this operation | Arguments, for example |", "| --- | --- | --- |", ...rows].join("\n");
}

/**
 * The job summary for a failed rule identity check, as Markdown, or "" if
 * the check passed. `env` holds the workflow's environment.
 */
export function checkSummary({ output, status, env = {} }) {
  if (Number(status) === 0) return "";
  const server = env.GITHUB_SERVER_URL || "https://github.com";
  const repository = env.GITHUB_REPOSITORY || "";
  const repoUrl = repository ? `${server}/${repository}` : "";
  const guide = repoUrl ? `${repoUrl}/blob/HEAD/ARCHITECTURE.md#working-entirely-in-github` : "";
  const text = String(output ?? "").replace(/\r\n?/g, "\n").trimEnd();
  const shown = text.length > MAX_OUTPUT ? `${text.slice(0, MAX_OUTPUT)}\n…` : text;
  const outputBlock = [
    fence(shown || "(The command printed nothing.)", { block: true }),
    ...(shown.length < text.length ? ["", "The output is longer than a job summary can show. All of it is in the step's log."] : []),
  ];

  if (Number(status) !== 1) {
    return [
      "## Rule identity check could not run",
      "",
      "`npm run rules` could not check `rule-identities.json` against the trust framework, so the check failed before any decision could be described. The output below says what went wrong. If `rule-identities.json` was edited by hand, check that it is still valid JSON.",
      "",
      "### Output",
      "",
      ...outputBlock,
      "",
    ].join("\n");
  }

  const branch = env.GITHUB_HEAD_REF || env.GITHUB_REF_NAME || "";
  const elsewhere = env.HEAD_REPOSITORY && repository && env.HEAD_REPOSITORY !== repository;
  const onDefault = !env.GITHUB_HEAD_REF && branch && branch === env.DEFAULT_BRANCH;
  const workflow = repoUrl ? `[Maintain rule identities](${repoUrl}/actions/workflows/${WORKFLOW_FILE})` : "**Maintain rule identities**";
  let chooseBranch = `Under **Use workflow from**, choose this pull request's branch${branch ? `, ${fence(branch)}` : ""}.`;
  if (elsewhere) {
    chooseBranch = `This pull request's branch is in another repository, ${fence(env.HEAD_REPOSITORY)}. The workflow has to be run there, on that branch, by someone who can change it. Otherwise, a maintainer can record the decision on a branch in this repository.`;
  } else if (onDefault) {
    chooseBranch = `This check failed on ${fence(branch)}, which the workflow never changes. Record the decision on a branch, in a pull request.`;
  }

  return [
    "## Rule identity decision required",
    "",
    "A rule was added, reworded, renumbered, moved or removed, and `rule-identities.json` needs a maintainer to record what happened. Every rule has a permanent identity, so that links to it keep working. This check stops an identity from quietly coming to mean a different rule.",
    "",
    "### Working in GitHub",
    "",
    `1. Go to **Actions**, then ${workflow}, then **Run workflow**.`,
    `2. ${chooseBranch}`,
    "3. Choose the operation, and type the identities or numbers, that the output below describes. The table shows which operation each command is.",
    "4. Run it. The workflow commits the decision to the branch and runs the checks again.",
    "",
    operationTable(),
    "",
    "### Working locally",
    "",
    "From `docs-site/`, run the `npm run rules -- …` command that the output below gives, then commit `rule-identities.json` to the branch.",
    "",
    "Confirming an identity records that the changed wording is still the same logical rule. It does not approve the policy wording: reviewing and merging the pull request is still the acceptance step. If it is not the same rule, do not confirm it.",
    "",
    guide ? `For worked examples, see [Working entirely in GitHub](${guide}) in ARCHITECTURE.md.` : "For worked examples, see Working entirely in GitHub in ARCHITECTURE.md.",
    "",
    "### What needs deciding",
    "",
    "The output of `npm run rules`, which describes each decision:",
    "",
    ...outputBlock,
    "",
  ].join("\n");
}

function main(argv, env) {
  const [file, status] = argv;
  process.stdout.write(checkSummary({ output: fs.readFileSync(file, "utf-8"), status, env }));
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2), process.env);
}
