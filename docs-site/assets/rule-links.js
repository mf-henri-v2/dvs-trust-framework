// What "Copy link" and "Copy reference" copy for a rule. Kept apart from the
// page code (assets/rule-actions.js) so the tests can check it.

/**
 * The address of a rule: the page it is on, at the rule's own anchor. It is
 * made from the address of the page being read, so it is right wherever the
 * site is published (for example under /dvs-trust-framework/ on GitHub
 * Pages). Any query or other anchor in the page address is dropped.
 */
export function ruleLink(pageHref, anchor) {
  const url = new URL(pageHref);
  url.search = "";
  url.hash = anchor;
  return url.href;
}

/** How to cite a rule in text: "Rule 12.4.1.c". */
export const ruleReference = (number) => `Rule ${number}`;

/**
 * The rule a rule block is for: its number (data-rule) and its anchor (the id
 * of the rule's own paragraph), both as the renderer wrote them.
 */
export function ruleOf(block) {
  const paragraph = block.querySelector(":scope > .app-rule");
  return { number: block.dataset.rule, anchor: paragraph?.id ?? "" };
}
