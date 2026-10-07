// What "Copy link" and "Copy reference" copy for a rule. Kept apart from the
// page code (assets/rule-actions.js) so the tests can check it.

/**
 * The permanent address of a rule: /rules/r0123/ on the site being read. It
 * stays the same when the rule is renumbered or moved, and goes to wherever
 * the rule is then. `siteRoot` is the address of the site's home page, such
 * as https://ofdia-uk.github.io/dvs-trust-framework/, so this is right
 * wherever the site is published.
 */
export function permanentRuleLink(siteRoot, id) {
  return new URL(`rules/${encodeURIComponent(id)}/`, siteRoot).href;
}

/**
 * The address of a rule on the page it is on now, at its number anchor. Used
 * only if a rule has no permanent identity, which the build does not allow.
 * Any query or other anchor in the page address is dropped.
 */
export function ruleLink(pageHref, anchor) {
  const url = new URL(pageHref);
  url.search = "";
  url.hash = anchor;
  return url.href;
}

/** What "Copy link" copies for a rule: its permanent address, or failing that its number anchor. */
export function ruleCopyLink(rule, pageHref, siteRoot) {
  return rule.id ? permanentRuleLink(siteRoot, rule.id) : ruleLink(pageHref, rule.anchor);
}

/** How to cite a rule in text: "Rule 12.4.1.c", by its current number. */
export const ruleReference = (number) => `Rule ${number}`;

/**
 * The rule a rule block is for: its number (data-rule), its permanent
 * identity (data-rule-id) and its number anchor (the id of the rule's own
 * paragraph), all as the renderer wrote them.
 */
export function ruleOf(block) {
  const paragraph = block.querySelector(":scope > .app-rule");
  return { number: block.dataset.rule, id: block.dataset.ruleId ?? "", anchor: paragraph?.id ?? "" };
}

/**
 * The "See existing feedback" link for a rule block, if maintainers have
 * chosen existing feedback about the rule to show: { text, href }, such as
 * "See existing feedback on 12.4.1.c (3)" and the rule's place on the
 * existing feedback page. The block's data-feedback-href is relative to the
 * site root, so the link is right wherever the site is published. null for a
 * rule with none, or if the block's values are not what the build writes.
 */
export function existingFeedbackLink(block, siteRoot) {
  const { rule, feedbackCount, feedbackHref } = block.dataset;
  const count = Number(feedbackCount);
  if (!rule || !Number.isInteger(count) || count < 1 || !feedbackHref) return null;
  const root = new URL(siteRoot).href;
  const href = new URL(feedbackHref, root).href;
  // Only ever a page of this site.
  if (!href.startsWith(root)) return null;
  return { text: `See existing feedback on ${rule} (${count})`, href };
}
