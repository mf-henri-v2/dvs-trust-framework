// Existing feedback that maintainers have chosen to show on the reading site.
//
// Feedback is given as public GitHub issues, but being public on GitHub does
// not put an issue on the site. Only the issues listed in
// existing-feedback.json at the repository root are shown, and that file is
// changed only by a reviewed pull request. Listing an issue does not mean
// OfDIA agrees with it.
//
// Each entry in "feedback" is one issue:
//
// - issue: its number on GitHub.
// - title: a short title, written by a maintainer. The site shows only this,
//   the issue number and a link to the issue, never the issue's own text.
// - rules: the permanent identities of the rules it is about (r0254), never
//   their numbers, so the feedback follows a rule that is renumbered or moved.
// - sections: the section files it is about as a whole, for example
//   trust-framework-1.0/part-3/12-service-requirements.md.
//
// When the file and the trust framework disagree, for example an entry names
// a rule that has been removed, checkExistingFeedback says what to decide and
// the build stops, so nothing wrong is published.

import fs from "node:fs";
import path from "node:path";
import { REPOSITORY_URL, siteUrlFor, firstHeading } from "./markdown.js";
import { readSections } from "./rule-identities.js";

export const FEEDBACK_FILE = "existing-feedback.json";
export const GUIDANCE = "ARCHITECTURE.md, under Existing feedback on the reading site";
/** The site page that lists the feedback. */
export const FEEDBACK_PAGE = "/existing-feedback/";
export const MAX_TITLE = 150;

const ID = /^r\d{4,}$/;
const NUMBER = /^\d+(?:\.\d+)+(?:\.[a-z]+)+$/;
const TOP_LEVEL_KEYS = ["about", "feedback"];
const ENTRY_KEYS = ["issue", "title", "rules", "sections"];

export class ExistingFeedbackError extends Error {
  constructor(problems) {
    super(
      `${FEEDBACK_FILE} does not match the trust framework (${problems.length} problem${problems.length === 1 ? "" : "s"}). ` +
        `See ${GUIDANCE}.\n\n${problems.join("\n\n")}`,
    );
    this.problems = problems;
  }
}

/** The anchor on the feedback page for a rule: "rule-r0254". */
export const ruleFeedbackAnchor = (id) => `rule-${id}`;

/** The anchor on the feedback page for a section file: "section-12-service-requirements". */
export const sectionFeedbackAnchor = (repoPath) => `section-${path.posix.basename(repoPath, ".md")}`;

/** The address of an issue on GitHub. */
export const issueUrl = (issue, repositoryUrl = REPOSITORY_URL) => `${repositoryUrl}/issues/${issue}`;

/** The register, as stored. Throws an ExistingFeedbackError if it cannot be read. */
export function readExistingFeedback(root) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, FEEDBACK_FILE), "utf-8"));
  } catch (error) {
    throw new ExistingFeedbackError([`${FEEDBACK_FILE} cannot be read: ${error.message}`]);
  }
}

/** Whether a title is plain text on one line. */
const plainTitle = (title) => typeof title === "string" && title.trim() !== "" && !/[\u0000-\u001f\u007f]/.test(title);

/**
 * Problems with the register, as messages that say what to do. Empty if every
 * entry is valid and names rules and sections that are in the working draft.
 * `identities` is resolveIdentities(...) from lib/rule-identities.js, and
 * `sectionPaths` the section files of the trust framework.
 */
export function checkExistingFeedback(register, identities, sectionPaths) {
  if (!register || typeof register !== "object" || Array.isArray(register) || !Array.isArray(register.feedback)) {
    return [`${FEEDBACK_FILE} must be an object with a "feedback" list.`];
  }
  const problems = [];
  for (const key of Object.keys(register)) {
    if (!TOP_LEVEL_KEYS.includes(key)) problems.push(`${FEEDBACK_FILE} has an unexpected field "${key}".`);
  }
  const sections = new Set(sectionPaths);
  const seen = new Map();
  register.feedback.forEach((entry, i) => {
    const where = `Entry ${i + 1} in "feedback"`;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      problems.push(`${where} is not an object.`);
      return;
    }
    const name = Number.isInteger(entry.issue) && entry.issue > 0 ? `${where} (issue ${entry.issue})` : where;
    const bad = (message) => problems.push(`${name}: ${message}`);
    for (const key of Object.keys(entry)) if (!ENTRY_KEYS.includes(key)) bad(`unexpected field "${key}".`);
    if (!Number.isInteger(entry.issue) || entry.issue < 1) {
      bad(`its "issue" must be the issue's number on GitHub, such as 123, not ${JSON.stringify(entry.issue)}.`);
    } else if (seen.has(entry.issue)) {
      bad(`issue ${entry.issue} is already listed in entry ${seen.get(entry.issue)}. List each issue once, with all the rules and sections it is about.`);
    } else {
      seen.set(entry.issue, i + 1);
    }
    if (!plainTitle(entry.title)) {
      bad(`its "title" must be a short title on one line, such as "Clarify what fraud monitoring evidence is expected".`);
    } else if (entry.title.length > MAX_TITLE) {
      bad(`its "title" is ${entry.title.length} characters long. Keep it to ${MAX_TITLE} or fewer.`);
    }
    if (entry.rules === undefined && entry.sections === undefined) {
      bad(`it must say what it is about: list the rules' permanent identities in "rules", or section files in "sections", or both.`);
    }
    for (const key of ["rules", "sections"]) {
      const list = entry[key];
      if (list === undefined) continue;
      if (!Array.isArray(list) || !list.length) {
        bad(`"${key}" must be a list with at least one item, or left out.`);
        continue;
      }
      if (new Set(list).size !== list.length) bad(`"${key}" lists the same item more than once.`);
    }
    for (const id of Array.isArray(entry.rules) ? entry.rules : []) {
      if (typeof id === "string" && NUMBER.test(id)) {
        const current = identities.byNumber[id];
        bad(
          `"rules" must give permanent identities, not rule numbers, so the feedback stays with the rule if it is renumbered or moved. ` +
            (current ? `Rule ${id} is ${current}: use "${current}".` : `No rule in the working draft has the number ${id}.`),
        );
        continue;
      }
      if (typeof id !== "string" || !ID.test(id)) {
        bad(`${JSON.stringify(id)} in "rules" is not a permanent identity, such as r0254.`);
        continue;
      }
      const identity = identities.byId[id];
      if (!identity) {
        bad(`${id} is not in rule-identities.json. Check the identity on the rule's permanent link (Copy link gives /rules/<identity>/).`);
      } else if (identity.status === "retired") {
        const replacements = identity.replacedBy ?? [];
        bad(
          `${id} (rule ${identity.number} when it was removed) has been removed from the working draft, so the site has no rule to show this feedback on. ` +
            (replacements.length
              ? `Decide whether it is about the rule${replacements.length === 1 ? "" : "s"} that replace${replacements.length === 1 ? "s" : ""} it (${replacements.map((other) => `${other.id}, rule ${other.number}`).join("; ")}): if so, list ${replacements.length === 1 ? "that" : "those"} instead; if not, remove ${id} from this entry.`
              : `Remove ${id} from this entry, or remove the entry if nothing is left.`),
        );
      }
    }
    for (const file of Array.isArray(entry.sections) ? entry.sections : []) {
      if (!sections.has(file)) {
        bad(`${JSON.stringify(file)} in "sections" is not a section file of the trust framework, such as trust-framework-1.0/part-3/12-service-requirements.md. If the section has been renamed or removed, update or remove it.`);
      }
    }
  });
  return problems;
}

/**
 * The feedback for the site. The register must have passed
 * checkExistingFeedback. `sections` is [{ repoPath, source }] in reading order.
 *
 * Returns {
 *   count: the number of issues listed;
 *   byRule: id → { count, href }, for the rule blocks. href is the rule's
 *     place on the feedback page, relative to the site root, so it works
 *     wherever the site is published;
 *   bySection: section file → { count, href }: the issues about the section
 *     or any rule in it, for the section's page;
 *   sections: for the feedback page, in reading order, each section with
 *     feedback: { repoPath, title, url, anchor, count, items, rules }, where
 *     items is the feedback about the whole section and rules is
 *     [{ id, number, href, anchor, items }] in rule number order.
 * }
 *
 * Each item is { issue, title, url }, in the order of the register.
 */
export function resolveExistingFeedback(register, identities, sections, repositoryUrl = REPOSITORY_URL) {
  const pages = new Map(
    sections.map(({ repoPath, source }) => [
      repoPath,
      { repoPath, title: firstHeading(source), url: siteUrlFor(repoPath), anchor: sectionFeedbackAnchor(repoPath), items: [], rules: new Map(), issues: new Set() },
    ]),
  );
  for (const entry of register.feedback) {
    const item = { issue: entry.issue, title: entry.title.trim(), url: issueUrl(entry.issue, repositoryUrl) };
    for (const file of entry.sections ?? []) {
      const page = pages.get(file);
      page.items.push(item);
      page.issues.add(entry.issue);
    }
    for (const id of entry.rules ?? []) {
      const identity = identities.byId[id];
      const page = pages.get(identity.repoPath);
      if (!page.rules.has(id)) {
        page.rules.set(id, { id, number: identity.number, href: identity.destination, anchor: ruleFeedbackAnchor(id), items: [] });
      }
      page.rules.get(id).items.push(item);
      page.issues.add(entry.issue);
    }
  }
  const byRule = {};
  const bySection = {};
  const withFeedback = [];
  for (const page of pages.values()) {
    if (!page.issues.size) continue;
    const rules = [...page.rules.values()].sort((a, b) => a.number.localeCompare(b.number, "en", { numeric: true }));
    for (const rule of rules) byRule[rule.id] = { count: rule.items.length, href: `${FEEDBACK_PAGE.slice(1)}#${rule.anchor}` };
    bySection[page.repoPath] = { count: page.issues.size, href: `${FEEDBACK_PAGE}#${page.anchor}` };
    withFeedback.push({ repoPath: page.repoPath, title: page.title, url: page.url, anchor: page.anchor, count: page.issues.size, items: page.items, rules });
  }
  return { count: register.feedback.length, byRule, bySection, sections: withFeedback };
}

/**
 * The feedback for the site: reads the register, checks it against the rule
 * identities and the trust framework, and resolves it. Throws an
 * ExistingFeedbackError, which stops the build, if they do not agree.
 */
export function loadExistingFeedback(root, identities) {
  const register = readExistingFeedback(root);
  const sections = readSections(root);
  const problems = checkExistingFeedback(register, identities, sections.map((section) => section.repoPath));
  if (problems.length) throw new ExistingFeedbackError(problems);
  return resolveExistingFeedback(register, identities, sections);
}
