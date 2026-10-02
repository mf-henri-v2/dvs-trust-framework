// Rule-level feedback: reveal a "Give feedback on 12.4.1.c" link for one
// rule at a time.
//
// - Pointer: point to a rule to highlight it and show the link. Moving away
//   hides it again.
// - Touch: tap a rule to select it and show the link below it. Tap it again,
//   or anywhere else, to clear. Scrolling does not select anything, because
//   browsers do not send a tap (click) for a scroll.
// - Keyboard and screen readers: the page has one rule picker (a form near
//   the end of the page) instead, so the rules add nothing to the Tab order.
//
// There is only ever one link, moved to the rule in use, and it is not in
// the page until a rule is pointed to or tapped. Without JavaScript the rule
// picker still works.

const picker = document.querySelector(".app-rule-picker");
const blocks = [...document.querySelectorAll(".app-rule-block")];

if (picker && blocks.length) {
  const select = picker.querySelector("select");
  const action = document.createElement("p");
  action.className = "govuk-body-s app-rule-action";
  const link = document.createElement("a");
  link.className = "govuk-link";
  action.append(link);

  let hovered = null;
  let selected = null;
  let hideTimer;
  let pointerType = "mouse";

  const show = (block) => {
    for (const each of blocks) each.classList.toggle("app-rule-block--active", each === block);
    if (!block) {
      action.remove();
      return;
    }
    link.textContent = `Give feedback on ${block.dataset.rule}`;
    link.href = `${picker.action}?reference=${encodeURIComponent(block.dataset.reference)}`;
    if (action.parentElement !== block) block.append(action);
  };
  const update = () => show(hovered ?? selected);

  document.addEventListener("pointerdown", (event) => (pointerType = event.pointerType), true);

  for (const block of blocks) {
    block.addEventListener("pointerenter", (event) => {
      if (event.pointerType !== "mouse") return;
      clearTimeout(hideTimer);
      hovered = block;
      update();
    });
    block.addEventListener("pointerleave", (event) => {
      if (event.pointerType !== "mouse") return;
      // The rule and the space beside it, where the link is, count as one
      // area. The delay forgives a pointer that briefly strays outside it.
      // Pointing to another rule switches to it straight away.
      hideTimer = setTimeout(() => {
        if (hovered !== block || action.contains(document.activeElement)) return;
        hovered = null;
        update();
      }, 700);
    });
  }

  document.addEventListener("click", (event) => {
    if (pointerType === "mouse") return;
    // Leave links, form controls and text selection alone.
    if (event.target.closest("a, button, input, select, label, summary")) return;
    if (String(window.getSelection?.() ?? "")) return;
    const block = event.target.closest(".app-rule-block");
    selected = block && block !== selected ? block : null;
    if (selected) select.value = selected.dataset.reference;
    update();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !(hovered || selected)) return;
    hovered = selected = null;
    update();
  });
}
