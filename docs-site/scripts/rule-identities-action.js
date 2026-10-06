#!/usr/bin/env node
// The "Maintain rule identities" workflow (.github/workflows/
// maintain-rule-identities.yml) runs the rule identity commands
// (scripts/rule-identities.js) from GitHub in the browser. This turns what
// the maintainer chose in the workflow's form into the arguments for one of
// those commands, and nothing else.
//
// It only checks that what was typed looks like identities (r0254), rule
// numbers (12.4.1.c) or identity=number pairs (r0254=12.4.1.d), so that it
// can never be anything but arguments to the command chosen. Whether the
// change is allowed is decided by the commands themselves, with all their
// safeguards. It makes no decision about any rule.
//
// Run by the workflow with the form's values in OPERATION, ARGUMENTS and
// REPLACED_BY, and the branch in GITHUB_REF_NAME, GITHUB_REF_TYPE and
// DEFAULT_BRANCH. It prints the arguments one per line, or explains what is
// wrong and exits with status 1.

import path from "node:path";
import { fileURLToPath } from "node:url";

const ID = /^r\d{4,}$/;
const NUMBER = /^\d+(?:\.\d+)+(?:\.[a-z]+)+$/;
const MAPPING = /^(r\d{4,})=(\d+(?:\.\d+)+(?:\.[a-z]+)+)$/;
const MAX_ITEMS = 100;

/**
 * The operations offered in the workflow's form, by the text shown there.
 * Each runs one command. `takes` says what the "arguments" box must hold.
 */
export const OPERATIONS = {
  "check only (change nothing)": { command: ["check"], takes: "nothing" },
  "confirm wording (IDs)": { command: ["confirm"], takes: "ids" },
  "confirm ALL changed wording": { command: ["confirm", "--all-changed"], takes: "nothing" },
  "add new rules (numbers)": { command: ["add"], takes: "numbers" },
  "renumber or move (ID=number)": { command: ["renumber"], takes: "mappings" },
  "retire (IDs)": { command: ["retire"], takes: "ids", replacements: true },
  "acknowledge reused numbers (numbers)": { command: ["reuse"], takes: "numbers" },
};

const EXAMPLES = { ids: "r0254 r0255", numbers: "12.4.1.g 12.4.1.h", mappings: "r0254=12.4.1.d r0255=12.4.1.e" };
const NAMES = { ids: "identities", numbers: "rule numbers", mappings: "identity=number pairs" };
const PATTERNS = { ids: ID, numbers: NUMBER, mappings: MAPPING };

export class ActionInputError extends Error {}

/** Words in a box, separated by spaces, commas or new lines. Case does not matter. */
const items = (text) => String(text ?? "").toLowerCase().split(/[\s,]+/).filter(Boolean);

function parseItems(text, kind, box) {
  const list = items(text);
  if (list.length > MAX_ITEMS) throw new ActionInputError(`"${box}" has more than ${MAX_ITEMS} items. Run the workflow more than once.`);
  const bad = list.filter((item) => !PATTERNS[kind].test(item));
  if (bad.length) {
    throw new ActionInputError(
      `"${box}" should hold ${NAMES[kind]}, such as ${EXAMPLES[kind]}. These are not: ${bad.map((item) => JSON.stringify(item.slice(0, 40))).join(", ")}`,
    );
  }
  if (new Set(list).size !== list.length) throw new ActionInputError(`"${box}" names something more than once.`);
  return list;
}

/** Refuse to change anything except a branch other than the default branch. */
export function checkBranch({ refName, refType, defaultBranch }) {
  if (refType !== "branch") throw new ActionInputError(`Run this workflow on a branch, not a ${refType || "ref"} (${refName || "unknown"}).`);
  if (!refName || !defaultBranch) throw new ActionInputError("The branch could not be worked out, so nothing was changed.");
  if (refName === defaultBranch) {
    throw new ActionInputError(`This workflow never changes ${defaultBranch}. Run it on the branch of your pull request: choose it under "Use workflow from".`);
  }
}

/** The arguments for `npm run rules --`, from the workflow's form. Throws ActionInputError if they are not valid. */
export function cliArguments(operation, argumentsText = "", replacedByText = "") {
  const chosen = OPERATIONS[operation];
  if (!chosen) throw new ActionInputError(`Unknown operation ${JSON.stringify(String(operation).slice(0, 60))}.`);
  if (!chosen.replacements && items(replacedByText).length) {
    throw new ActionInputError(`"replaced by" is only for "retire (IDs)". Leave it empty for "${operation}".`);
  }
  if (chosen.takes === "nothing") {
    if (items(argumentsText).length) {
      throw new ActionInputError(`"${operation}" takes no arguments. Leave "arguments" empty, or choose another operation to name particular rules.`);
    }
    return [...chosen.command];
  }
  const list = parseItems(argumentsText, chosen.takes, "arguments");
  if (!list.length) throw new ActionInputError(`"${operation}" needs ${NAMES[chosen.takes]} in "arguments", such as ${EXAMPLES[chosen.takes]}.`);
  const replacements = chosen.replacements ? parseItems(replacedByText, "ids", "replaced by") : [];
  return [...chosen.command, ...list, ...(replacements.length ? ["--replaced-by", ...replacements] : [])];
}

function main(env) {
  try {
    checkBranch({ refName: env.GITHUB_REF_NAME, refType: env.GITHUB_REF_TYPE, defaultBranch: env.DEFAULT_BRANCH });
    for (const arg of cliArguments(env.OPERATION, env.ARGUMENTS, env.REPLACED_BY)) console.log(arg);
    return 0;
  } catch (error) {
    if (!(error instanceof ActionInputError)) throw error;
    // Shown as an error on the workflow run's page.
    console.error(env.GITHUB_ACTIONS === "true" ? `::error::${error.message}` : error.message);
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.env);
}
