#!/usr/bin/env node
// The "Show existing feedback" workflow (.github/workflows/
// show-existing-feedback.yml) lets maintainers choose, in the browser, which
// issues the reading site shows. This turns what was typed in the
// workflow's form into the arguments for one existing feedback command
// (scripts/existing-feedback.js), and nothing else.
//
// It checks that the issue exists and is an issue, not a pull request, and
// that the rules and sections typed look like rule numbers (12.4.1.c),
// identities (r0254) and section numbers (12). Whether they are in the
// working draft is decided by the command, with all its safeguards. If no
// title is typed, it uses the issue's own title, which the pull request's
// reviewers see before anything is published. It decides nothing about
// which issues to show.
//
// Run by the workflow with the form's values in ACTION, ISSUE, TITLE, RULES
// and SECTIONS, and GITHUB_REPOSITORY, GITHUB_API_URL and GH_TOKEN to look
// up the issue. It prints the arguments one per line, or explains what is
// wrong and exits with status 1.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { MAX_TITLE } from "../lib/existing-feedback.js";

const ID = /^r\d{4,}$/;
const NUMBER = /^\d+(?:\.\d+)+(?:\.[a-z]+)+$/;
const SECTION_NUMBER = /^\d{1,2}$/;
const MAX_ITEMS = 50;

/** The actions offered in the workflow's form, by the text shown there. */
export const ACTIONS = {
  "show an issue (or change how it is shown)": "show",
  "stop showing an issue": "remove",
};

export class ActionInputError extends Error {}

/** Words in a box, separated by spaces, commas or new lines, tidied: "Rule 12.4.1.C." becomes "12.4.1.c". */
const items = (text) =>
  String(text ?? "")
    .toLowerCase()
    .replace(/\b(rules?|sections?)\b/g, " ")
    .split(/[\s,;]+/)
    .map((item) => item.replace(/\.$/, ""))
    .filter(Boolean);

function parseItems(text, valid, box, example) {
  const list = items(text);
  if (list.length > MAX_ITEMS) throw new ActionInputError(`"${box}" has more than ${MAX_ITEMS} items.`);
  const bad = list.filter((item) => !valid(item));
  if (bad.length) {
    throw new ActionInputError(`"${box}" should hold ${example}. These are not: ${bad.map((item) => JSON.stringify(item.slice(0, 40))).join(", ")}`);
  }
  if (new Set(list).size !== list.length) throw new ActionInputError(`"${box}" names something more than once.`);
  return list;
}

/** The issue number typed in the form: "6" or "#6". */
export function issueNumber(text) {
  const match = /^#?(\d{1,9})$/.exec(String(text ?? "").trim());
  if (!match || Number(match[1]) < 1) throw new ActionInputError(`"issue" should be the issue's number, such as 6, not ${JSON.stringify(String(text ?? "").slice(0, 40))}.`);
  return Number(match[1]);
}

/**
 * The arguments for `npm run feedback --`, from the workflow's form.
 * `issue` is what GitHub says about the issue: { number, title,
 * isPullRequest }, or null if there is no such issue. Throws
 * ActionInputError if the form is not valid.
 */
export function cliArguments(form, issue) {
  const command = ACTIONS[form.action];
  if (!command) throw new ActionInputError(`Unknown action ${JSON.stringify(String(form.action).slice(0, 60))}.`);
  const number = issueNumber(form.issue);
  if (!issue) throw new ActionInputError(`There is no issue ${number} in this repository.`);
  if (issue.isPullRequest) throw new ActionInputError(`${number} is a pull request, not an issue. Only issues can be shown as existing feedback.`);
  const rules = parseItems(form.rules, (item) => NUMBER.test(item) || ID.test(item), "rules", "rule numbers, such as 12.4.1.c 11.2.b");
  const sections = parseItems(form.sections, (item) => SECTION_NUMBER.test(item), "sections", "section numbers, such as 12");
  const typedTitle = String(form.title ?? "").trim();
  if (command === "remove") {
    if (typedTitle || rules.length || sections.length) {
      throw new ActionInputError(`"stop showing an issue" takes only the issue number. Leave "title", "rules" and "sections" empty.`);
    }
    return ["remove", String(number)];
  }
  const title = typedTitle || String(issue.title ?? "").trim();
  if (/[\u0000-\u001f\u007f]/.test(title)) throw new ActionInputError(`The title must be on one line.`);
  if (title.length > MAX_TITLE) {
    throw new ActionInputError(`${typedTitle ? "The title" : `The issue's own title`} is ${title.length} characters long. Type a shorter one, of ${MAX_TITLE} or fewer, in "title".`);
  }
  return [
    "show",
    String(number),
    ...(title ? ["--title", title] : []),
    ...(rules.length ? ["--rules", ...rules] : []),
    ...(sections.length ? ["--sections", ...sections] : []),
  ];
}

/** What GitHub says about an issue, or null if there is none. */
async function lookUpIssue(env, number) {
  const response = await fetch(`${env.GITHUB_API_URL || "https://api.github.com"}/repos/${env.GITHUB_REPOSITORY}/issues/${number}`, {
    headers: { accept: "application/vnd.github+json", ...(env.GH_TOKEN ? { authorization: `Bearer ${env.GH_TOKEN}` } : {}) },
  });
  if (response.status === 404 || response.status === 410) return null;
  if (!response.ok) throw new ActionInputError(`GitHub did not say whether issue ${number} exists (${response.status}). Try again.`);
  const data = await response.json();
  return { number: data.number, title: data.title, isPullRequest: Boolean(data.pull_request) };
}

async function main(env) {
  try {
    const form = { action: env.ACTION, issue: env.ISSUE, title: env.TITLE, rules: env.RULES, sections: env.SECTIONS };
    const issue = await lookUpIssue(env, issueNumber(form.issue));
    for (const arg of cliArguments(form, issue)) console.log(arg);
    return 0;
  } catch (error) {
    if (!(error instanceof ActionInputError)) throw error;
    // Shown as an error on the workflow run's page.
    console.error(env.GITHUB_ACTIONS === "true" ? `::error::${error.message}` : error.message);
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.env);
}
