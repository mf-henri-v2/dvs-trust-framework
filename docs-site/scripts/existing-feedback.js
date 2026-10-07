#!/usr/bin/env node
// Check and change existing-feedback.json, the GitHub issues that maintainers
// have chosen to show on the reading site. See ARCHITECTURE.md, under
// Existing feedback on the reading site.
//
//   npm run feedback                                    check the register
//   npm run feedback -- show 6 --title "What registration means" --rules 12.4.1.c --sections 12
//                                                       show issue 6 on rule 12.4.1.c and section 12
//   npm run feedback -- remove 6                        stop showing issue 6
//
// Rules can be given by their current number (12.4.1.c) or their permanent
// identity (r0254); either way the register records the identity, so the
// feedback stays with the rule if it is renumbered or moved. Sections can be
// given by number (12) or by file. "show" for an issue that is already listed
// replaces what is given (its title, rules or sections) and keeps the rest.
//
// Nothing here decides which issues to show. Each command does only what it
// is told, and refuses anything that would leave the register wrong.
//
// Exit status:
//   0  the register is in order (after the change, if any);
//   1  the register has problems (the output says what to change);
//   2  nothing was done: the command was refused, or the register or the
//      rule identities could not be read. existing-feedback.json is unchanged.
// The "Show existing feedback" workflow relies on these to decide whether to
// commit.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadRuleIdentities, sectionFiles, RuleIdentityError } from "../lib/rule-identities.js";
import {
  FEEDBACK_FILE,
  ExistingFeedbackError,
  readExistingFeedback,
  checkExistingFeedback,
  formatExistingFeedback,
} from "../lib/existing-feedback.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ID = /^r\d{4,}$/;
const NUMBER = /^\d+(?:\.\d+)+(?:\.[a-z]+)+$/;
const SECTION_NUMBER = /^\d{1,2}$/;

export const REFUSED = 2;

class UsageError extends Error {}

/** "Rule 12.4.1.C." becomes "12.4.1.c"; "R0254" becomes "r0254". */
const tidy = (text) => String(text).trim().toLowerCase().replace(/^(rule|section)\s*/, "").replace(/\.$/, "");

/** The permanent identity of a rule given by number or identity. */
function ruleIdentity(identities, given) {
  const key = tidy(given);
  if (ID.test(key)) {
    const identity = identities.byId[key];
    if (!identity) throw new UsageError(`${given} is not in rule-identities.json.`);
    if (identity.status === "retired") throw new UsageError(`${key} (rule ${identity.number} when it was removed) has been removed from the working draft.`);
    return identity;
  }
  if (NUMBER.test(key)) {
    const id = identities.byNumber[key];
    if (!id) throw new UsageError(`The working draft has no rule ${key}.`);
    return identities.byId[id];
  }
  throw new UsageError(`"${given}" is not a rule number, such as 12.4.1.c, or a permanent identity, such as r0254.`);
}

/** The section file of a section given by number (12) or file. */
function sectionFile(sectionPaths, given) {
  if (sectionPaths.includes(given)) return given;
  const key = tidy(given);
  if (SECTION_NUMBER.test(key)) {
    const file = sectionPaths.find((repoPath) => path.posix.basename(repoPath).startsWith(`${key.padStart(2, "0")}-`));
    if (file) return file;
  }
  throw new UsageError(`"${given}" is not a section of the trust framework. Give its number, such as 12, or its file, such as trust-framework-1.0/part-3/12-service-requirements.md.`);
}

/** Split `show 6 --title … --rules … --sections …` into its parts. */
function parseShow(args) {
  const [issueText, ...rest] = args;
  const options = {};
  let current = null;
  for (const arg of rest) {
    if (["--title", "--rules", "--sections"].includes(arg)) {
      current = arg.slice(2);
      if (options[current]) throw new UsageError(`${arg} is given more than once.`);
      options[current] = [];
    } else if (!current) {
      throw new UsageError(`Unexpected "${arg}". Use --title, --rules and --sections, for example: show 6 --title "A short title" --rules 12.4.1.c`);
    } else {
      options[current].push(arg);
    }
  }
  if (options.title && options.title.length !== 1) throw new UsageError(`--title takes one value. Put the title in quotes.`);
  for (const key of ["rules", "sections"]) {
    if (options[key] && !options[key].length) throw new UsageError(`--${key} needs at least one value.`);
  }
  return { issueText, title: options.title?.[0], rules: options.rules, sections: options.sections };
}

function issueNumber(text) {
  const issue = Number(String(text ?? "").trim().replace(/^#/, ""));
  if (!/^#?\d+$/.test(String(text ?? "").trim()) || !Number.isInteger(issue) || issue < 1) {
    throw new UsageError(`Give the issue's number on GitHub, such as 6, not ${JSON.stringify(text ?? "")}.`);
  }
  return issue;
}

/**
 * Apply a command to the register. Returns a list of what it did. Throws a
 * UsageError, and leaves the register as it was, if it cannot.
 */
export function apply(register, identities, sectionPaths, command, args) {
  const done = [];
  switch (command) {
    case "show": {
      const { issueText, title, rules, sections } = parseShow(args);
      const issue = issueNumber(issueText);
      const existing = register.feedback.find((entry) => entry.issue === issue);
      if (!existing && title === undefined) throw new UsageError(`Give a short title for issue ${issue} with --title, for example --title "What registration means in rule 12.4.1.c".`);
      if (!existing && !rules && !sections) throw new UsageError(`Say what issue ${issue} is about: give rule numbers with --rules, section numbers with --sections, or both.`);
      const entry = existing ? { ...existing } : { issue };
      if (title !== undefined) entry.title = title.trim();
      if (rules) entry.rules = [...new Set(rules.map((rule) => ruleIdentity(identities, rule).id))];
      if (sections) entry.sections = [...new Set(sections.map((section) => sectionFile(sectionPaths, section)))];
      const after = { ...register, feedback: existing ? register.feedback.map((each) => (each === existing ? entry : each)) : [...register.feedback, entry] };
      const problems = checkExistingFeedback(after, identities, sectionPaths);
      if (problems.length) throw new UsageError(problems.join("\n\n"));
      register.feedback = after.feedback;
      const about = [
        ...(entry.rules ?? []).map((id) => `rule ${identities.byId[id].number} (${id})`),
        ...(entry.sections ?? []).map((file) => `the whole of section ${Number(path.posix.basename(file).slice(0, 2))}`),
      ];
      done.push(`${existing ? "Updated" : "Added"} issue ${issue}, "${entry.title}". It is shown on ${about.join(", ")}.`);
      break;
    }
    case "remove": {
      if (args.length !== 1) throw new UsageError("Give one issue number, for example: remove 6");
      const issue = issueNumber(args[0]);
      if (!register.feedback.some((entry) => entry.issue === issue)) throw new UsageError(`Issue ${issue} is not listed in ${FEEDBACK_FILE}, so there is nothing to remove.`);
      register.feedback = register.feedback.filter((entry) => entry.issue !== issue);
      done.push(`Removed issue ${issue}. The site will stop showing it; the issue on GitHub is unchanged.`);
      break;
    }
    default:
      throw new UsageError(`Unknown command "${command}". Use check, show or remove.`);
  }
  return done;
}

function main(argv) {
  const [command = "check", ...args] = argv;
  let identities;
  try {
    identities = loadRuleIdentities(ROOT);
  } catch (error) {
    if (!(error instanceof RuleIdentityError)) throw error;
    console.error(`${FEEDBACK_FILE} cannot be checked or changed until rule-identities.json matches the trust framework. Run npm run rules.`);
    return REFUSED;
  }
  let register;
  try {
    register = readExistingFeedback(ROOT);
  } catch (error) {
    if (!(error instanceof ExistingFeedbackError)) throw error;
    console.error(error.message);
    return REFUSED;
  }
  const sectionPaths = sectionFiles(ROOT);
  if (command !== "check") {
    try {
      for (const line of apply(register, identities, sectionPaths, command, args)) console.log(line);
    } catch (error) {
      if (!(error instanceof UsageError)) throw error;
      console.error(`Nothing was changed.\n\n${error.message}`);
      return REFUSED;
    }
    fs.writeFileSync(path.join(ROOT, FEEDBACK_FILE), formatExistingFeedback(register));
    console.log(`Updated ${FEEDBACK_FILE}. Review the change before committing it.\n`);
  }
  const problems = checkExistingFeedback(register, identities, sectionPaths);
  if (problems.length) {
    console.error(new ExistingFeedbackError(problems).message);
    return 1;
  }
  const count = register.feedback.length;
  console.log(`${FEEDBACK_FILE} is in order: ${count} issue${count === 1 ? "" : "s"} shown on the reading site.`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(error.stack ?? String(error));
    process.exitCode = REFUSED;
  }
}
