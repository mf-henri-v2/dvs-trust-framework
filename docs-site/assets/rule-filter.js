// Which rules match the rule picker's filter, and what to say about them.
// Kept apart from the page code (assets/rule-picker-filter.js) so the tests
// can check it.
//
// The filter uses only what the picker already shows: each rule's number and
// the heading it comes under. It is not a search of the rules' text; the
// search page does that.

import { normalise, parseReference } from "./search-core.js";

// Words that may come before a number, as in "Rule 12.4.1.c".
const NUMBER_WORDS = new Set(["rule", "section", "paragraph", "para"]);

/**
 * What a filter asks for: rule numbers, and words from headings. "12.4.1",
 * "Rule 12.4.1.C." and "fraud" are all accepted, and so is a mix such as
 * "12.4 fraud".
 */
export function parseFilter(query) {
  const tokens = String(query).trim().split(/\s+/).filter(Boolean);
  const numbers = [];
  const words = [];
  for (const token of tokens) {
    const number = parseReference(token);
    if (number) numbers.push(number);
    else words.push(...normalise(token).split(" ").filter(Boolean));
  }
  return { numbers, words: numbers.length ? words.filter((word) => !NUMBER_WORDS.has(word)) : words };
}

/**
 * Whether a rule matches a filter. A number matches the rule with that number
 * and the rules under it: "12.4.1" matches 12.4.1.a and 12.4.1.e, but not
 * 12.4.10.a. Each word must start a word of the rule's heading. An empty
 * filter matches every rule.
 */
export function ruleMatches(filter, number, heading) {
  const { numbers, words } = typeof filter === "string" ? parseFilter(filter) : filter;
  const rule = number.toLowerCase();
  if (!numbers.every((each) => rule === each || rule.startsWith(`${each}.`))) return false;
  const headingWords = normalise(heading).split(" ");
  return words.every((word) => headingWords.some((each) => each.startsWith(word)));
}

/** An example of a number to type, from the page's first rule: "12.1.1" for 12.1.1.a. */
export const exampleNumber = (number) => number.replace(/(?:\.[a-z]+)+$/i, "");

/** The first choice in the picker, which says how many rules are in it. */
export function placeholderText(count, filtered) {
  if (!filtered) return "Choose a rule";
  if (count === 0) return "No rules match";
  return count === 1 ? "Choose the 1 matching rule" : `Choose from ${count} matching rules`;
}

/**
 * What the filter says: how many rules match, and whether the reader's
 * choice was cleared. `cleared` is the number of the rule that was chosen
 * before the filter changed, if any; `chosen` says whether a rule has been
 * chosen since. Empty when there is nothing to say.
 */
export function filterStatus({ query, count, total, cleared, chosen = false, example }) {
  const filtered = Boolean(String(query).trim());
  if (chosen) return filtered ? (count === 1 ? "1 rule matches." : `${count} rules match.`) : "";
  const choice = cleared ? `Your choice, rule ${cleared}, was cleared. ` : "";
  if (!filtered) return cleared ? `${choice}All ${total} rules are listed.` : "";
  if (count === 0) return `${choice}No rules match “${String(query).trim()}”. Try a rule number such as ${example}, or clear the filter.`;
  const matches = count === 1 ? "1 rule matches." : `${count} rules match.`;
  return `${matches} ${choice}Choose ${count === 1 ? "it" : "one"} from the list.`;
}
