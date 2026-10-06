// A permanent rule link (/rules/r0123/) goes straight to the rule, wherever
// it is now. The page names the rule and links to it, so without JavaScript
// the reader follows that link instead. location.replace keeps the permanent
// link out of the browser's history, so Back returns to where the reader
// came from.
(function () {
  var link = document.querySelector("[data-rule-destination]");
  if (link && link.href) window.location.replace(link.href);
})();
