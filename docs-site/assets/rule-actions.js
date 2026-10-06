// Rule actions: for one rule at a time, a "Give feedback on 12.4.1.c" link
// and buttons to copy a link to the rule (its permanent address, such as
// /rules/r0123/) and its reference ("Rule 12.4.1.c").
//
// - Pointer: point to a rule to highlight it and show its actions. Moving
//   away hides them again.
// - Touch: tap a rule to select it and show its actions below it. Tap it
//   again, or anywhere else, to clear. Scrolling does not select anything,
//   because browsers do not send a tap (click) for a scroll.
// - Linked rule: when the page is opened at a rule, or a link on the page
//   goes to one, that rule's actions are shown after it, so pressing Tab
//   from the rule reaches them. Focus is never moved there.
// - Keyboard and screen readers can also use the rule picker (a form near the
//   end of the page), which gets copy buttons for the chosen rule. Its
//   filter is in assets/rule-picker-filter.js.
//
// There is only ever one set of actions, moved to the rule in use. While
// focus is in it, while a copy is in progress, or while the "copy it
// yourself" box is open, it stays where it is, so it cannot change rules
// under the reader. Each copy works out the rule and the text to copy when
// the button is pressed.
//
// Nothing here is needed to read the page. Without JavaScript the picker's
// "Continue to GitHub" still works and none of these controls are shown.

import { ruleCopyLink, ruleReference, ruleOf } from "./rule-links.js";

// This file is in /assets/, one level below the home page, wherever the site is published.
const SITE_ROOT = new URL("../", import.meta.url);

const picker = document.querySelector(".app-rule-picker");
const blocks = [...document.querySelectorAll(".app-rule-block")];

/** An element with a class and text or children. */
function element(tag, className, ...children) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.append(...children);
  return node;
}

const hiddenText = (text) => element("span", "govuk-visually-hidden", text);

if (picker && blocks.length) {
  const select = picker.querySelector("select");

  // One status message for the page, announced without moving focus.
  const status = element("p", "govuk-visually-hidden");
  status.setAttribute("role", "status");
  document.body.append(status);
  const announce = (text) => {
    // A change of text is what screen readers announce, so clear it first.
    status.textContent = "";
    setTimeout(() => (status.textContent = text), 100);
  };

  // What each kind of copy copies, and what to call it.
  const KINDS = {
    link: {
      button: "Copy link",
      // The rest of the button's name, for screen readers: "Copy link to rule 12.4.1.c".
      suffix: (which) => ` to ${which}`,
      label: (number) => `Link to rule ${number}`,
      copied: "Link copied",
      // The rule's permanent address, which still works if it is renumbered or moved.
      value: (rule) => ruleCopyLink(rule, window.location.href, SITE_ROOT),
    },
    reference: {
      button: "Copy reference",
      suffix: (which) => ` for ${which}`,
      label: (number) => `Reference for rule ${number}`,
      copied: "Reference copied",
      value: (rule) => ruleReference(rule.number),
    },
  };

  let busy = false; // a copy is in progress
  let manual = null; // the open "copy it yourself" box, if any

  /** Remove the "copy it yourself" box. */
  const closeManual = ({ returnFocus = false } = {}) => {
    if (!manual) return;
    const { box, button } = manual;
    manual = null;
    box.remove();
    if (returnFocus && button.isConnected) button.focus();
  };

  /**
   * Copy a rule's link or reference. `rule` is decided by the caller when the
   * button is pressed, and the text is worked out here at once, so nothing
   * that happens during the copy can change what is copied.
   */
  async function copy(kind, rule, button, place) {
    if (busy) return;
    closeManual();
    const { label, copied, value } = KINDS[kind];
    const text = value(rule);
    const done = place.querySelector(".app-copy-done");
    busy = true;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("The clipboard is not available");
      await navigator.clipboard.writeText(text);
      // Focus stays on the button.
      if (done) done.textContent = copied;
      announce(`${label(rule.number)} copied`);
    } catch {
      if (done) done.textContent = "";
      // Copying did not work: give the text in a box, selected, to copy by hand.
      const id = `copy-${kind}-${rule.anchor}`;
      const input = element("input", "govuk-input app-copy-manual__input");
      Object.assign(input, { id, type: "text", readOnly: true, value: text, spellcheck: false });
      const hint = element(
        "div",
        "govuk-hint",
        "Your browser did not let this page copy it. It is selected: copy it with Ctrl+C (or Command+C on a Mac), or by pressing and holding. Press Escape when you have finished.",
      );
      hint.id = `${id}-hint`;
      input.setAttribute("aria-describedby", hint.id);
      const labelElement = element("label", "govuk-label govuk-label--s", label(rule.number));
      labelElement.htmlFor = id;
      const box = element("div", "govuk-form-group app-copy-manual", labelElement, hint, input);
      place.append(box);
      manual = { box, button };
      announce(`${label(rule.number)} could not be copied. It is selected in a box so you can copy it yourself.`);
      input.focus();
      input.select();
    } finally {
      busy = false;
    }
  }

  /** A pair of copy buttons. `ruleFor()` says which rule they are for when pressed. */
  function copyButtons(ruleFor, onMissing) {
    const buttons = Object.keys(KINDS).map((kind) => {
      const button = element("button", "app-link-button", KINDS[kind].button);
      button.type = "button";
      button.dataset.kind = kind;
      return button;
    });
    for (const button of buttons) {
      button.addEventListener("click", () => {
        const rule = ruleFor();
        if (!rule) return onMissing?.();
        copy(button.dataset.kind, rule, button, button.closest("[data-copy-place]"));
      });
    }
    return buttons;
  }

  // The actions shown beside (or below) the rule in use.
  const action = element("div", "govuk-body-s app-rule-action");
  action.dataset.copyPlace = "";
  const feedback = element("a", "govuk-link");
  const [copyLink, copyReference] = copyButtons(() => (action.parentElement ? ruleOf(action.parentElement) : null));
  const done = element("span", "app-copy-done");
  done.setAttribute("aria-hidden", "true"); // announced by the status message instead
  const list = element(
    "ul",
    "app-rule-action__list",
    element("li", "", feedback),
    element("li", "", copyLink),
    element("li", "", copyReference),
  );
  action.append(list, done);

  /** Give copy buttons names that say which rule they are for, such as "Copy link to rule 12.4.1.c". */
  const nameButtons = (buttons, which) => {
    for (const button of buttons) {
      const { button: text, suffix } = KINDS[button.dataset.kind];
      button.replaceChildren(text, hiddenText(suffix(which)));
    }
  };

  let hovered = null;
  let selected = null; // tapped, or the rule linked to
  let selectedByLink = false;
  let hideTimer;
  let pointerType = "mouse";
  // Going to a rule scrolls the page under a pointer that may be resting on
  // it, and the browser then reports the pointer entering whichever rule is
  // now under it. That is not the reader pointing at that rule, so pointing
  // is ignored after going to a rule until the pointer really moves.
  let pointerStill = false;
  document.addEventListener(
    "pointermove",
    (event) => {
      if (!pointerStill || event.pointerType !== "mouse" || !(event.movementX || event.movementY)) return;
      pointerStill = false;
      // The browser reported entering the rule before this movement, while
      // it was being ignored, so point to it now.
      const block = event.target.closest?.(".app-rule-block");
      if (block) {
        hovered = block;
        update();
      }
    },
    { capture: true, passive: true },
  );

  /** Whether the actions must stay where they are. */
  const locked = () => busy || manual !== null || action.contains(document.activeElement);

  const show = (block) => {
    if (locked() && block !== action.parentElement) return;
    for (const each of blocks) each.classList.toggle("app-rule-block--active", each === block);
    if (!block) {
      action.remove();
      return;
    }
    const { number } = ruleOf(block);
    if (action.parentElement !== block) {
      done.textContent = "";
      feedback.textContent = `Give feedback on ${number}`;
      feedback.href = `${picker.action}?reference=${encodeURIComponent(block.dataset.reference)}`;
      nameButtons([copyLink, copyReference], `rule ${number}`);
      block.append(action);
    }
  };
  const update = () => show(hovered ?? selected);

  // When focus leaves the actions, they can follow the pointer again.
  action.addEventListener("focusout", (event) => {
    if (!action.contains(event.relatedTarget)) setTimeout(update);
  });

  /**
   * The rule the page address points to, if any: its number anchor
   * (#section-12_4_1_c) or its block (#rule-r0123, where a permanent link
   * goes). A fragment that is not a rule, or not valid, points to none.
   */
  const linkedBlock = () => {
    let id;
    try {
      id = decodeURIComponent(window.location.hash.slice(1));
    } catch {
      return null; // for example "#%"
    }
    const target = id ? document.getElementById(id) : null;
    if (target?.classList.contains("app-rule-block")) return target;
    return target?.classList.contains("app-rule") ? target.closest(".app-rule-block") : null;
  };
  const followLink = () => {
    const block = linkedBlock();
    if (!block && !selectedByLink) return;
    // Going to a rule (or away from one) matters more than where the pointer
    // happens to be resting.
    hovered = null;
    pointerStill = true;
    selected = block;
    selectedByLink = Boolean(block);
    update();
  };

  document.addEventListener("pointerdown", (event) => (pointerType = event.pointerType), true);

  for (const block of blocks) {
    block.addEventListener("pointerenter", (event) => {
      if (event.pointerType !== "mouse") return;
      if (pointerStill) return;
      clearTimeout(hideTimer);
      hovered = block;
      update();
    });
    block.addEventListener("pointerleave", (event) => {
      if (event.pointerType !== "mouse") return;
      // The rule and the space beside it, where the actions are, count as one
      // area. The delay forgives a pointer that briefly strays outside it.
      // Pointing to another rule switches to it straight away.
      hideTimer = setTimeout(() => {
        if (hovered !== block) return;
        hovered = null;
        update();
      }, 700);
    });
  }

  document.addEventListener("click", (event) => {
    // A click outside the "copy it yourself" box closes it.
    if (manual && !manual.box.contains(event.target) && !event.target.closest("[data-copy-place] button")) closeManual();
    if (pointerType === "mouse") return;
    // Leave links, form controls and text selection alone.
    if (event.target.closest("a, button, input, select, label, summary")) return;
    if (String(window.getSelection?.() ?? "")) return;
    const block = event.target.closest(".app-rule-block");
    selected = block && block !== selected ? block : null;
    selectedByLink = false;
    if (selected) {
      const { reference } = selected.dataset;
      // The picker's filter may be hiding this rule: if so, ask for the whole list first.
      if (![...select.options].some((option) => option.value === reference)) select.dispatchEvent(new Event("app-rule-picker-reset"));
      select.value = reference;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }
    update();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (manual) {
      closeManual({ returnFocus: true });
      return;
    }
    if (!(hovered || selected) || action.contains(document.activeElement)) return;
    hovered = selected = null;
    selectedByLink = false;
    update();
  });

  window.addEventListener("hashchange", followLink);
  window.addEventListener("pageshow", followLink);
  followLink();

  // The rule picker: copy buttons for the chosen rule, and an error, with
  // focus moved to the dropdown, when there is no chosen rule to act on.
  const group = picker.querySelector(".govuk-form-group");
  const chosenRule = () => {
    const block = blocks.find((each) => each.dataset.reference === select.value);
    return block ? ruleOf(block) : null;
  };
  let pickerError = null;
  const clearPickerError = () => {
    pickerError?.remove();
    pickerError = null;
    group.classList.remove("govuk-form-group--error");
    select.classList.remove("govuk-select--error");
    select.setAttribute("aria-describedby", "rule-feedback-hint");
  };
  const showPickerError = (message) => {
    if (!pickerError) {
      pickerError = element("p", "govuk-error-message");
      pickerError.id = "rule-feedback-error";
      group.classList.add("govuk-form-group--error");
      select.classList.add("govuk-select--error");
      select.setAttribute("aria-describedby", "rule-feedback-hint rule-feedback-error");
      select.before(pickerError);
    }
    pickerError.replaceChildren(hiddenText("Error: "), message);
    // The dropdown is described by the error, so moving focus there reads it out.
    select.focus();
  };
  const pickerButtons = copyButtons(chosenRule, () => showPickerError("Choose a rule to copy its link or reference"));
  const pickerDone = element("span", "app-copy-done");
  pickerDone.setAttribute("aria-hidden", "true");
  nameButtons(pickerButtons, "the chosen rule");
  const pickerCopy = element(
    "div",
    "app-rule-picker__copy",
    element("p", "govuk-body-s", "You can also copy a link to the chosen rule, or its reference."),
    element("div", "app-rule-picker__buttons", ...pickerButtons, pickerDone),
  );
  pickerCopy.dataset.copyPlace = "";
  picker.append(pickerCopy);
  select.addEventListener("change", () => {
    clearPickerError();
    pickerDone.textContent = "";
    closeManual();
  });
  picker.addEventListener("submit", (event) => {
    if (select.value) return;
    event.preventDefault();
    showPickerError("Choose a rule to give feedback on");
  });

  // Pointing and tapping need this script, so the hint about them is shown only now.
  const hint = document.querySelector(".app-rule-hint");
  if (hint) hint.hidden = false;
}
