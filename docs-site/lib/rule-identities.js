// Permanent identities for the trust framework's rules.
//
// A rule's number (12.4.1.c), its wording, its section file and its position
// can all change while the working draft is edited. Its identity (r0123)
// does not, and never comes to mean a different rule. Identities are stored
// in rule-identities.json at the repository root, never worked out from the
// number or the text, and never changed by a build. Each one has a permanent
// address on the reading site, /rules/r0123/, that goes to wherever the rule
// is now.
//
// The registry records, for each identity:
//
// - id: r followed by at least four digits. Never changed or reused.
// - For a rule in the working draft: number, its current number; file, the
//   section file it is in; and fingerprint, a hash of its wording without
//   its number, as last confirmed by a maintainer.
// - For a rule that has been removed: status "retired", and replacedBy, the
//   identities that replace it, if any (one for a replacement, several for a
//   split; several retired rules can name the same one for a merge).
// - history: every earlier number and file it had, oldest first, recorded
//   when it was deliberately renumbered, moved or retired. A retired rule's
//   last place is the last item.
//
// and, in reusedNumbers, every number that has been used for more than one
// identity, with the identities that have used it. A number-based link
// (#section-12_4_1_c) cannot say which of them it meant, so each reuse must
// be acknowledged.
//
// The fingerprint is only a guardrail. It is not the identity, and nothing
// here matches rules by their wording. When a rule's wording changes, a
// maintainer confirms it is still the same rule and its identity stays the
// same. What the fingerprint catches is wording that has moved to another
// number, for example when a rule is inserted and the rules after it are
// renumbered: without it, their identities would quietly follow the numbers
// to the wrong rules.
//
// When the registry and the Markdown disagree, checkRegistry reports it with
// the choices a maintainer has, and the build stops.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { RULE_NUMBER, ruleAnchor, identityAnchor, siteUrlFor, firstHeading } from "./markdown.js";
import { searchEntries, HEADING_NUMBER } from "./search.js";

export { identityAnchor };

export const REGISTRY_FILE = "rule-identities.json";
export const FRAMEWORK_DIR = "trust-framework-1.0";
export const GUIDANCE = "ARCHITECTURE.md, under Rule identities";

const ID = /^r\d{4,}$/;
const NUMBER = /^\d+(?:\.\d+)+(?:\.[a-z]+)+$/;
const FILE = /^trust-framework-1\.0\/(?:[^/]+\/)*\d\d-[^/]+\.md$/;
const FINGERPRINT = /^[0-9a-f]{16}$/;
const ENTRY_KEYS = ["id", "status", "number", "file", "fingerprint", "history", "replacedBy"];
const TOP_LEVEL_KEYS = ["about", "rules", "reusedNumbers"];

export class RuleIdentityError extends Error {
  constructor(problems) {
    super(
      `${REGISTRY_FILE} does not match the trust framework (${problems.length} problem${problems.length === 1 ? "" : "s"}). ` +
        `See ${GUIDANCE}.\n\n${problems.join("\n\n")}`,
    );
    this.problems = problems;
  }
}

/** A rule's permanent address on the site: "/rules/r0123/". */
export const permanentPath = (id) => `/rules/${id}/`;

const idNumber = (id) => Number(id.slice(1));
const formatId = (n) => `r${String(n).padStart(4, "0")}`;
const byIdOrder = (a, b) => idNumber(a) - idNumber(b);
export const isRetired = (entry) => entry.status === "retired";

/** The section files of the trust framework, in reading order: 0, 1, 2 … 16. */
export function sectionFiles(root) {
  return fs
    .readdirSync(path.join(root, FRAMEWORK_DIR), { recursive: true })
    .map((file) => `${FRAMEWORK_DIR}/${file.replace(/\\/g, "/")}`)
    .filter((repoPath) => /\/\d\d-[^/]+\.md$/.test(repoPath))
    .sort((a, b) => path.posix.basename(a).localeCompare(path.posix.basename(b), "en", { numeric: true }));
}

/**
 * A hash of a rule's wording, without its number, so that renumbering a rule
 * does not change it but changing its wording does. The text is the rule as
 * the search index has it: its paragraphs and lists, as plain text.
 */
export function fingerprint(text) {
  const match = RULE_NUMBER.exec(text);
  const wording = (match ? text.slice(match[0].length) : text).replace(/\s+/g, " ").trim();
  return crypto.createHash("sha256").update(wording, "utf8").digest("hex").slice(0, 16);
}

/** The start of a passage, cut at a word: for showing what a rule says. */
function excerptOf(text, length = 300) {
  if (text.length <= length) return text;
  const space = text.lastIndexOf(" ", length);
  return `${text.slice(0, space > 0 ? space : length)} …`;
}

/**
 * The numbered rules in the working draft, in reading order. `files` is
 * [{ repoPath, source }]. A rule is found with the same renderer and the same
 * rule boundaries as its page and the search index (ruleBoundaries in
 * lib/markdown.js), so a rule's text includes its lists.
 */
export function frameworkRules(files) {
  const rules = [];
  for (const { repoPath, source } of files) {
    const pageUrl = siteUrlFor(repoPath);
    const pageTitle = firstHeading(source);
    for (const entry of searchEntries(source, repoPath)) {
      if (entry.kind !== "rule") continue;
      rules.push({
        number: entry.ref,
        repoPath,
        pageUrl,
        pageTitle,
        numberAnchor: entry.anchor,
        // The numbered heading it comes under, such as "12.4.1. Fraud monitoring", not an example box heading.
        heading: [...(entry.context ?? [])].reverse().find((text) => HEADING_NUMBER.test(text)) ?? "",
        excerpt: excerptOf(entry.text),
        fingerprint: fingerprint(entry.text),
      });
    }
  }
  return rules;
}

/** The section files of the trust framework with their Markdown. */
export function readSections(root) {
  return sectionFiles(root).map((repoPath) => ({ repoPath, source: fs.readFileSync(path.join(root, repoPath), "utf-8") }));
}

/** The registry, as stored. Throws a RuleIdentityError if it cannot be read. */
export function readRegistry(root) {
  const file = path.join(root, REGISTRY_FILE);
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch (error) {
    throw new RuleIdentityError([`${REGISTRY_FILE} cannot be read: ${error.message}`]);
  }
}

/** The next identity after every one in the registry, including retired ones. */
export function nextId(registry) {
  const ids = (registry.rules ?? []).filter((entry) => ID.test(entry?.id ?? "")).map((entry) => idNumber(entry.id));
  return formatId(Math.max(0, ...ids) + 1);
}

/** Every place an entry has had: its history, then where it is now. */
const placesOf = (entry) => [...(entry.history ?? []), ...(isRetired(entry) ? [] : [{ number: entry.number, file: entry.file }])];

/** A retired rule's last number, or a current rule's number. */
export const lastNumberOf = (entry) => (isRetired(entry) ? entry.history?.at(-1)?.number : entry.number);

/** Every identity that has had each number: number → ids in order. */
function numberHolders(entries) {
  const holders = new Map();
  for (const entry of entries) {
    for (const { number } of placesOf(entry)) {
      if (!holders.has(number)) holders.set(number, new Set());
      holders.get(number).add(entry.id);
    }
  }
  return new Map([...holders].map(([number, ids]) => [number, [...ids].sort(byIdOrder)]));
}

/** An entry with its fields in the registry's order. */
export function canonicalEntry(entry) {
  return Object.fromEntries(ENTRY_KEYS.filter((key) => entry[key] !== undefined).map((key) => [key, entry[key]]));
}

const entryLine = (entry) => JSON.stringify(canonicalEntry(entry));
const ruleLabel = (rule) => `rule ${rule.number} (${rule.repoPath})`;

/** Problems with the shape of one history item, or "" if it is valid. */
const placeProblem = (place) =>
  place && typeof place === "object" && NUMBER.test(place.number ?? "") && FILE.test(place.file ?? "") && Object.keys(place).every((key) => key === "number" || key === "file")
    ? ""
    : `each item in "history" must be {"number": "12.4.1.c", "file": "trust-framework-1.0/part-3/12-service-requirements.md"}`;

/**
 * Problems with the registry's own entries, as messages. These do not depend
 * on the Markdown. Returns { problems, entries } where entries are the ones
 * valid enough to check further.
 */
function entryProblems(registry) {
  const problems = [];
  for (const key of Object.keys(registry)) {
    if (!TOP_LEVEL_KEYS.includes(key)) problems.push(`${REGISTRY_FILE} has an unexpected field "${key}".`);
  }
  const entries = [];
  const byId = new Map();
  let previous = 0;
  registry.rules.forEach((entry, i) => {
    const where = `Entry ${i + 1} in "rules"`;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      problems.push(`${where} is not an object.`);
      return;
    }
    const name = ID.test(entry.id ?? "") ? entry.id : where;
    const bad = (message) => problems.push(`${name}: ${message}`);
    for (const key of Object.keys(entry)) if (!ENTRY_KEYS.includes(key)) bad(`unexpected field "${key}".`);
    if (!ID.test(entry.id ?? "")) {
      bad(`its "id" must be "r" followed by at least four digits, such as r0123, not ${JSON.stringify(entry.id)}.`);
      return;
    }
    if (byId.has(entry.id)) {
      bad("this identity is in the registry more than once. Every identity must be unique: give the entry that was added last a new identity.");
      return;
    }
    if (idNumber(entry.id) <= previous) bad(`identities must be in order, with new ones added at the end. ${entry.id} comes after ${formatId(previous)}.`);
    previous = Math.max(previous, idNumber(entry.id));
    if (entry.status !== undefined && entry.status !== "retired") {
      bad(`unknown status ${JSON.stringify(entry.status)}. Use "retired" for a rule that has been removed, or leave it out for a rule in the working draft.`);
      return;
    }
    const history = entry.history ?? [];
    if (!Array.isArray(history)) {
      bad(`"history" must be a list.`);
      return;
    }
    const historyProblem = history.map(placeProblem).find(Boolean);
    if (historyProblem) {
      bad(`${historyProblem}.`);
      return;
    }
    if (isRetired(entry)) {
      if (!history.length) bad(`a retired rule needs its "history", ending with the number and file it had when it was removed.`);
      for (const key of ["number", "file", "fingerprint"]) {
        if (entry[key] !== undefined) bad(`a retired rule has no "${key}". Its last number and file are the last item in its "history".`);
      }
    } else {
      if (!NUMBER.test(entry.number ?? "")) bad(`its "number" must be a rule number such as 12.4.1.c, not ${JSON.stringify(entry.number)}.`);
      if (!FILE.test(entry.file ?? "")) bad(`its "file" must be the section file it is in, such as trust-framework-1.0/part-3/12-service-requirements.md.`);
      if (!FINGERPRINT.test(entry.fingerprint ?? "")) bad(`a rule in the working draft needs its "fingerprint" (16 hexadecimal characters).`);
      if (entry.replacedBy !== undefined) bad(`only a retired rule can have "replacedBy".`);
    }
    const places = placesOf(entry).map((place) => `${place.number} ${place.file}`);
    if (new Set(places).size !== places.length) bad(`its "history" repeats a place it has had, or the place it has now.`);
    byId.set(entry.id, entry);
    entries.push(entry);
  });

  for (const entry of entries) {
    if (entry.replacedBy === undefined) continue;
    const replacements = entry.replacedBy;
    if (!Array.isArray(replacements) || !replacements.length || replacements.some((id) => !ID.test(id ?? ""))) {
      problems.push(`${entry.id}: "replacedBy" must be a list of identities, or left out if nothing replaces it.`);
      continue;
    }
    if (new Set(replacements).size !== replacements.length) problems.push(`${entry.id}: "replacedBy" lists an identity more than once.`);
    for (const id of replacements) {
      if (id === entry.id) problems.push(`${entry.id}: it cannot replace itself.`);
      else if (!byId.has(id)) problems.push(`${entry.id}: it is replaced by ${id}, which is not in the registry.`);
    }
  }
  return { problems, entries };
}

/**
 * Problems with the registry, as messages that say what to do. Empty if the
 * registry and the working draft agree. `rules` is frameworkRules(...).
 *
 * With `{ wordingOnly: true }` it returns { wording, other }: the changed
 * wording of registered rules, and every other problem. confirm
 * --all-changed uses this to refuse when anything else is wrong.
 */
export function checkRegistry(registry, rules, { wordingOnly = false } = {}) {
  if (!registry || typeof registry !== "object" || !Array.isArray(registry.rules)) {
    const problem = `${REGISTRY_FILE} must be an object with a "rules" list.`;
    return wordingOnly ? { wording: [], other: [problem] } : [problem];
  }
  const { problems, entries } = entryProblems(registry);
  const wording = [];

  // --- The registry against the working draft ---------------------------------
  const markdown = new Map();
  for (const rule of rules) {
    if (markdown.has(rule.number)) problems.push(`The working draft has more than one rule ${rule.number} (${markdown.get(rule.number).repoPath} and ${rule.repoPath}). Rule numbers must be unique.`);
    else markdown.set(rule.number, rule);
  }
  const current = entries.filter((entry) => !isRetired(entry) && NUMBER.test(entry.number ?? ""));
  const currentByNumber = new Map();
  for (const entry of current) {
    if (currentByNumber.has(entry.number)) {
      problems.push(`${currentByNumber.get(entry.number).id} and ${entry.id} are both registered as rule ${entry.number}. A number can belong to only one rule in the working draft.`);
    } else currentByNumber.set(entry.number, entry);
  }
  // Confirmed wording, only to point out where wording now is. It never decides anything.
  const byFingerprint = new Map();
  for (const entry of current) {
    if (!byFingerprint.has(entry.fingerprint)) byFingerprint.set(entry.fingerprint, []);
    byFingerprint.get(entry.fingerprint).push(entry);
  }
  const sameWording = (rule, except) => {
    const matches = (byFingerprint.get(rule.fingerprint) ?? []).filter((entry) => entry !== except);
    if (!matches.length) return "";
    const list = matches.map((entry) => `${entry.id} (registered as rule ${entry.number})`).join(", ");
    return (
      `\n  Hint only: its wording is the same as the confirmed wording of ${list}. If rules have been renumbered, ` +
      `record their new numbers rather than adding identities. Matching wording does not make it the same rule: that is for you to decide.`
    );
  };

  let suggested = idNumber(nextId(registry)) - 1;
  for (const rule of rules) {
    const entry = currentByNumber.get(rule.number);
    if (!entry) {
      const id = formatId(++suggested);
      problems.push(
        `${ruleLabel(rule)} has no permanent identity. Decide which applies:\n` +
          `  - It is a new rule: run \`npm run rules -- add ${rule.number}\`, or add this line at the end of "rules":\n` +
          `      ${entryLine({ id, number: rule.number, file: rule.repoPath, fingerprint: rule.fingerprint })}\n` +
          `  - It is an existing rule that has been renumbered or moved: record its new number on that rule's entry with \`npm run rules -- renumber <id>=${rule.number}\`.` +
          sameWording(rule),
      );
      continue;
    }
    if (entry.file !== rule.repoPath) {
      problems.push(
        `${entry.id} is registered as rule ${entry.number} in ${entry.file}, but rule ${entry.number} is now in ${rule.repoPath}. ` +
          `If it is the same rule and it has moved, record the move so that older links to its old page still work: \`npm run rules -- renumber ${entry.id}=${rule.number}\`.`,
      );
    }
    if (entry.fingerprint !== rule.fingerprint) {
      wording.push(
        `The wording of ${ruleLabel(rule)}, registered as ${entry.id}, has changed since it was last confirmed. Decide which applies:\n` +
          `  - It is still the same rule, with changed wording: run \`npm run rules -- confirm ${entry.id}\`, or set its "fingerprint" to "${rule.fingerprint}". Its identity stays the same.\n` +
          `  - A different rule now has this number: record what happened to ${entry.id} (renumber or retire it), and register the rule that has the number now.` +
          sameWording(rule, entry),
      );
    }
  }
  for (const entry of current) {
    if (markdown.has(entry.number)) continue;
    problems.push(
      `${entry.id} is registered as rule ${entry.number}, but the working draft has no rule ${entry.number}. Decide what happened to it:\n` +
        `  - It was renumbered or moved: \`npm run rules -- renumber ${entry.id}=<its new number>\`.\n` +
        `  - It was removed, replaced, split or merged: \`npm run rules -- retire ${entry.id}\`, adding \`--replaced-by <id> ...\` for any rules that replace it.`,
    );
  }

  // --- Numbers used for more than one rule -----------------------------------
  const reused = registry.reusedNumbers ?? [];
  const acknowledged = new Map();
  if (!Array.isArray(reused)) {
    problems.push(`"reusedNumbers" must be a list.`);
  } else {
    reused.forEach((item, i) => {
      const valid =
        item && NUMBER.test(item.number ?? "") && Array.isArray(item.identities) && item.identities.every((id) => ID.test(id ?? "")) &&
        Object.keys(item).every((key) => key === "number" || key === "identities");
      if (!valid) problems.push(`Entry ${i + 1} in "reusedNumbers" must be {"number": "12.4.1.c", "identities": ["r0001", "r0002"]}.`);
      else if (acknowledged.has(item.number)) problems.push(`"reusedNumbers" lists ${item.number} more than once.`);
      else acknowledged.set(item.number, [...item.identities].sort(byIdOrder));
    });
  }
  const holders = numberHolders(entries);
  for (const [number, ids] of holders) {
    if (ids.length < 2) continue;
    const recorded = acknowledged.get(number);
    if (recorded && recorded.join() === ids.join()) continue;
    problems.push(
      `The number ${number} has been used for more than one rule: ${ids.join(", ")}. ` +
        `An older link to #${ruleAnchor(number)}, or a search for ${number}, cannot say which of them it meant. ` +
        `Check that this is intended. If it is, acknowledge it: run \`npm run rules -- reuse ${number}\`, or ` +
        `${recorded ? "change its entry in" : "add this to"} "reusedNumbers":\n      ${JSON.stringify({ number, identities: ids })}`,
    );
  }
  for (const [number] of acknowledged) {
    if ((holders.get(number)?.length ?? 0) < 2) problems.push(`"reusedNumbers" lists ${number}, but no more than one rule has used it. Remove that entry.`);
  }
  return wordingOnly ? { wording, other: problems } : [...problems, ...wording];
}

/** The registry as it is written: one rule per line, so changes are easy to review. */
export function formatRegistry(registry) {
  const lines = ["{"];
  if (registry.about !== undefined) lines.push(`  "about": ${JSON.stringify(registry.about)},`);
  lines.push(`  "rules": [`);
  lines.push(registry.rules.map((entry) => `    ${entryLine(entry)}`).join(",\n"));
  lines.push("  ],");
  const reused = registry.reusedNumbers ?? [];
  lines.push(reused.length ? `  "reusedNumbers": [\n${reused.map((item) => `    ${JSON.stringify(item)}`).join(",\n")}\n  ]` : `  "reusedNumbers": []`);
  lines.push("}");
  return `${lines.join("\n")}\n`;
}

/**
 * Where each identity is now, for the site. The registry must have passed
 * checkRegistry. `sectionPaths` lists the section files that are pages now.
 *
 * Returns {
 *   list: every identity, in id order;
 *   byId: id → identity;
 *   byNumber: current number → id;
 *   formerHolders: number → the identities that used to have it, not
 *     counting the rule that has it now, for search;
 *   formerNumbersByPage: section file → the numbers that rules used to have
 *     on that page and no rule there has now, with the identities that had
 *     them there, so that older links to the page still land somewhere.
 * }
 *
 * Each identity has id, status, number (current, or last if retired),
 * history, permanentUrl and href (where a link to it should go). A current
 * one also has its page, heading, excerpt, destination (its block on its
 * page), numberAnchor and sharedWith: the other identities that used to have
 * its number on its page, which a link to its number anchor may have meant.
 * A retired one has replacedBy.
 */
export function resolveIdentities(registry, rules, sectionPaths = [...new Set(rules.map((rule) => rule.repoPath))]) {
  const rulesByNumber = new Map(rules.map((rule) => [rule.number, rule]));
  const entries = registry.rules;
  const list = [];
  const byId = {};
  for (const entry of entries) {
    const identity = {
      id: entry.id,
      status: isRetired(entry) ? "retired" : "current",
      number: lastNumberOf(entry),
      history: entry.history ?? [],
      permanentUrl: permanentPath(entry.id),
    };
    if (isRetired(entry)) {
      identity.href = identity.permanentUrl;
    } else {
      const rule = rulesByNumber.get(entry.number);
      Object.assign(identity, {
        repoPath: rule.repoPath,
        pageUrl: rule.pageUrl,
        pageTitle: rule.pageTitle,
        heading: rule.heading,
        excerpt: rule.excerpt,
        numberAnchor: rule.numberAnchor,
        destination: `${rule.pageUrl}#${identityAnchor(entry.id)}`,
      });
      identity.href = identity.destination;
    }
    list.push(identity);
    byId[entry.id] = identity;
  }
  const summary = (identity) => ({ id: identity.id, status: identity.status, number: identity.number, permanentUrl: identity.permanentUrl, href: identity.href });
  for (const entry of entries) {
    if (isRetired(entry)) byId[entry.id].replacedBy = (entry.replacedBy ?? []).map((id) => summary(byId[id]));
  }

  const byNumber = {};
  for (const identity of list) if (identity.status === "current") byNumber[identity.number] = identity.id;

  const formerHolders = {};
  for (const [number, ids] of numberHolders(entries)) {
    const former = ids.filter((id) => byNumber[number] !== id).map((id) => summary(byId[id]));
    if (former.length) formerHolders[number] = former;
  }

  // Old places: (file, number) → the identities that were there. Each becomes
  // either a note on the rule that has that number on that page now, or an
  // item, with the old anchor, in the page's list of former rule numbers.
  // Never both, so an anchor is never repeated on a page.
  const pages = new Set(sectionPaths);
  const oldPlaces = new Map();
  for (const entry of entries) {
    for (const place of entry.history ?? []) {
      const key = `${place.file}\n${place.number}`;
      if (!oldPlaces.has(key)) oldPlaces.set(key, { ...place, ids: [] });
      if (!oldPlaces.get(key).ids.includes(entry.id)) oldPlaces.get(key).ids.push(entry.id);
    }
  }
  const formerNumbersByPage = {};
  for (const { number, file, ids } of oldPlaces.values()) {
    const holderNow = byId[byNumber[number]];
    const others = ids.filter((id) => id !== holderNow?.id);
    if (!others.length) continue;
    if (holderNow?.repoPath === file) {
      holderNow.sharedWith = [...(holderNow.sharedWith ?? []), ...others.map((id) => summary(byId[id]))];
    } else if (pages.has(file)) {
      (formerNumbersByPage[file] ??= []).push({ number, anchor: ruleAnchor(number), holders: others.sort(byIdOrder).map((id) => summary(byId[id])) });
    }
  }
  for (const numbers of Object.values(formerNumbersByPage)) {
    numbers.sort((a, b) => a.number.localeCompare(b.number, "en", { numeric: true }));
  }
  return { list, byId, byNumber, formerHolders, formerNumbersByPage };
}

/**
 * The identities for the site: reads the registry and the trust framework,
 * checks that they agree, and resolves each identity. Throws a
 * RuleIdentityError, which stops the build, if they do not.
 */
export function loadRuleIdentities(root) {
  const registry = readRegistry(root);
  const sections = readSections(root);
  const rules = frameworkRules(sections);
  const problems = checkRegistry(registry, rules);
  if (problems.length) throw new RuleIdentityError(problems);
  return resolveIdentities(registry, rules, sections.map((section) => section.repoPath));
}
