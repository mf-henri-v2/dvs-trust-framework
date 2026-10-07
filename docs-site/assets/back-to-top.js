// "Back to top": a link at the end of every page to the site header (#top),
// where the navigation is.
//
// As built, it is an ordinary link at the end of the footer, shown on wide
// screens (see .app-back-to-top in src/site.scss). This script fixes it to
// the bottom right of the window instead, shown once the reader has scrolled
// about one window height down the page, however they got there: scrolling,
// a link to a rule further down, or the browser restoring their place.
// Nearer the top it is hidden, so it is not in the Tab order or read out.
//
// Following it jumps straight to the top, without changing the page address
// or adding to the browser history, and moves focus to the header, so the
// next Tab reaches the site navigation.
//
// The link keeps its address throughout, and is fixed to the window only
// once everything here is ready, so if this script does not run, or fails,
// the link still goes to the top.

const box = document.querySelector(".app-back-to-top");
const link = box?.querySelector("a[href='#top']");
const header = document.getElementById("top");

if (link && header) {
  // Shown once scrolled about a window height down, and while it has focus,
  // so focus is never left on a control that has disappeared.
  const update = () => {
    const hide = window.scrollY < window.innerHeight && document.activeElement !== link;
    if (link.hidden !== hide) link.hidden = hide;
  };

  link.addEventListener("click", (event) => {
    // Opening the link in a new tab or window works as usual.
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    window.scrollTo(0, 0);
    // The header is not focusable of itself. Like GOV.UK's skip link, make it
    // focusable just while it has focus.
    header.setAttribute("tabindex", "-1");
    header.addEventListener("blur", () => header.removeAttribute("tabindex"), { once: true });
    header.focus({ preventScroll: true });
    update();
  });

  window.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update);
  window.addEventListener("pageshow", update);
  link.addEventListener("blur", update);

  update();
  box.classList.add("app-back-to-top--floating");
}
