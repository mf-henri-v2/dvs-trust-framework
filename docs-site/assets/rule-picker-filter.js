// A filter for the rule picker (the "Give feedback on a specific rule" form):
// typing a rule number, such as 12.4.1, or a word from a heading, such as
// fraud, narrows the picker's own dropdown to the rules that match. The
// reader still chooses the rule from the dropdown.
//
// - Typing only narrows the list. It never chooses a rule, goes anywhere,
//   copies or submits anything, and it does not move focus.
// - The text typed is not the choice. Any change to it clears the choice,
//   and says so, so "Continue to GitHub" and the copy buttons can never act
//   on a rule chosen before the filter changed.
// - The dropdown is the same <select>, with the same options and values. Rules
//   that do not match are taken out of it and put back in their place.
//
// The page works without this script, which runs on its own so that if it
// does not load, the rest of the page (assets/rule-actions.js) still works.
// The filter is shown only once it is ready. If anything goes wrong later,
// every rule is put back in the dropdown and the filter is removed.

import { parseFilter, ruleMatches, exampleNumber, placeholderText, filterStatus } from "./rule-filter.js";

const select = document.querySelector(".app-rule-picker select");

/** An element with a class and text or children. */
function element(tag, className, ...children) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.append(...children);
  return node;
}

if (select) {
  // The dropdown as built: its first choice ("Choose a rule"), then its groups
  // of rules, each with a heading.
  const original = [...select.children];
  const placeholder = select.querySelector("option[value='']");
  const placeholderOriginal = placeholder?.textContent ?? "";
  const groups = original
    .filter((node) => node.tagName === "OPTGROUP")
    .map((group) => ({ group, options: [...group.children] }));
  const total = groups.reduce((sum, { options }) => sum + options.length, 0);

  let filter = null; // the filter, once it is on the page
  let statusTimer;

  /** Put every rule back in the dropdown, in its place, keeping the choice. */
  const showAll = () => {
    const value = select.value;
    // Appending each node in order, even one already there, leaves them in
    // their original order.
    for (const { group, options } of groups) for (const option of options) group.appendChild(option);
    for (const node of original) select.appendChild(node);
    if (placeholder) placeholder.textContent = placeholderOriginal;
    select.value = value;
  };

  /** Something went wrong: give the reader the whole dropdown back, without the filter. */
  const fail = (error) => {
    clearTimeout(statusTimer);
    const hadFocus = filter?.contains(document.activeElement);
    try {
      showAll();
    } finally {
      filter?.remove();
      filter = null;
      if (hadFocus) select.focus();
      console.error("The rule filter stopped working, so every rule is listed.", error);
    }
  };

  /** Run a change to the filter, recovering if it fails. */
  const safely = (action) => (...args) => {
    if (!filter) return;
    try {
      action(...args);
    } catch (error) {
      fail(error);
    }
  };

  try {
    // Built off the page, and added in one step once it is complete.
    const first = groups[0]?.options[0]?.textContent.trim() ?? "";
    const example = exampleNumber(first) || "12.4.1";
    const input = element("input", "govuk-input govuk-input--width-20 app-rule-filter__input");
    Object.assign(input, { id: "rule-filter", type: "search", autocomplete: "off", spellcheck: false });
    input.setAttribute("aria-describedby", "rule-filter-hint");
    const label = element("label", "govuk-label", "Filter the rules in this section");
    label.htmlFor = input.id;
    const hint = element("div", "govuk-hint", `Type a rule number, such as ${example}, or a word from a heading. Then choose a rule from the list.`);
    hint.id = "rule-filter-hint";
    const clear = element("button", "app-link-button app-rule-filter__clear", "Clear filter");
    clear.type = "button";
    clear.hidden = true;
    // Visible, and announced without moving focus. It waits for a pause in
    // typing, so it is not read out for every key.
    const status = element("p", "govuk-body-s app-rule-filter__status");
    status.setAttribute("role", "status");
    const box = element("div", "app-rule-filter", label, hint, element("div", "app-rule-filter__row", input, clear), status);

    /** Narrow the dropdown to the rules matching the filter: the number of them. */
    const narrow = (query) => {
      if (!query.trim()) {
        showAll();
        return total;
      }
      const parsed = parseFilter(query);
      let count = 0;
      const shown = [];
      for (const { group, options } of groups) {
        const matching = options.filter((option) => ruleMatches(parsed, option.textContent.trim(), group.label));
        if (!matching.length) continue;
        group.replaceChildren(...matching);
        shown.push(group);
        count += matching.length;
      }
      select.replaceChildren(...[placeholder, ...shown].filter(Boolean));
      if (placeholder) placeholder.textContent = placeholderText(count, true);
      return count;
    };

    /** The filter has changed: clear the choice, narrow the list and say what happened. */
    const update = () => {
      const chosen = select.value ? select.selectedOptions[0]?.textContent.trim() : "";
      select.value = "";
      const query = input.value;
      const count = narrow(query);
      // Again, because taking the chosen option out of a dropdown makes the
      // browser choose another, and putting options back can bring that
      // choice with them.
      select.value = "";
      clear.hidden = !query;
      const text = filterStatus({ query, count, total, cleared: chosen, example });
      clearTimeout(statusTimer);
      statusTimer = setTimeout(() => (status.textContent = text), 400);
      // Tell the rest of the page that the choice has changed, so a message
      // about an earlier choice, such as an error or "Link copied", goes.
      select.dispatchEvent(new Event("change", { bubbles: true }));
    };

    input.addEventListener("input", safely(update));
    // Once a rule is chosen, what was said about clearing an earlier choice
    // no longer applies.
    select.addEventListener(
      "change",
      safely(() => {
        if (!select.value) return;
        clearTimeout(statusTimer);
        status.textContent = filterStatus({ query: input.value, count: select.querySelectorAll("optgroup > option").length, total, chosen: true });
      }),
    );
    // Pressing Enter here would send the form: typing must never do that.
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") event.preventDefault();
    });
    clear.addEventListener(
      "click",
      safely(() => {
        input.value = "";
        update();
        input.focus();
      }),
    );
    // Choosing a rule some other way (tapping it on the page) asks for the
    // whole list first if the filter is hiding that rule.
    select.addEventListener(
      "app-rule-picker-reset",
      safely(() => {
        input.value = "";
        clear.hidden = true;
        clearTimeout(statusTimer);
        status.textContent = "";
        showAll();
      }),
    );

    // Before the dropdown, after the form's label and hint.
    select.before(box);
    filter = box;
  } catch (error) {
    fail(error);
  }
}
