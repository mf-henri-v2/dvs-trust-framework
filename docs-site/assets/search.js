// The search page (/search/): shows the results for the query in the page
// address (?q=...), so a search can be shared, reloaded and returned to with
// the browser's Back button. Each search loads the page again; nothing is
// announced while the reader types.
//
// A rule can also be found by a number it used to have, which says what it
// is now (or lists every rule that has had the number, without choosing
// one), and by its permanent identifier, such as r0123.
//
// Everything is written to the page as text, never as HTML, so a query or a
// passage can never be run as code.
//
// The page works without this script: it offers another way to find a rule
// (the fallback), and keeps the search results area hidden. This script shows
// the results area and hides the fallback only once it is running, so if it
// or search-core.js does not load, the reader still has the fallback. If the
// search index cannot be loaded, the fallback comes back.

import { createSearch, parseReference, parseIdentity, referenceName, queryTerms, destination, identityDestination, resultTitle, resultContext, excerpt } from "./search-core.js";
import { permanentRuleLink } from "./rule-links.js";

const MAX_RESULTS = 100;
// This file is in /assets/, one level below the home page, wherever the site is published.
const SITE_ROOT = new URL("../", import.meta.url);

const form = document.querySelector("[data-search-form]");
const input = form?.querySelector("input[name=q]");
const status = document.querySelector("[data-search-status]");
const output = document.querySelector("[data-search-output]");
const examples = document.querySelector("[data-search-examples]");
const enhanced = document.querySelector("[data-search-enhanced]");
const fallback = document.querySelector("[data-search-fallback]");

/** An element with a class and text or children. */
function element(tag, className, ...children) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.append(...children.filter((child) => child !== null && child !== undefined));
  return node;
}

function link(href, text, className = "govuk-link") {
  const node = element("a", className, text);
  node.href = href;
  return node;
}

/** A passage with the matching words highlighted. */
function excerptElement(text, terms, length) {
  const paragraph = element("p", "govuk-body app-search-result__excerpt");
  for (const part of excerpt(text, terms, length)) paragraph.append(part.match ? element("mark", "app-search-mark", part.text) : part.text);
  return paragraph;
}

function contextElement(entry, pages) {
  const trail = resultContext(entry, pages);
  return trail.length ? element("p", "govuk-body-s app-search-result__context", trail.join(" › ")) : null;
}

function resultItem(entry, search, terms) {
  const title = resultTitle(entry, search.pages);
  const text = entry.kind === "row" || entry.kind === "heading" || entry.kind === "page" ? "" : entry.text;
  return element(
    "li",
    "app-search-result",
    element("h3", "govuk-heading-s app-search-result__title", link(destination(entry, search.pages, SITE_ROOT), title)),
    contextElement(entry, search.pages),
    text ? excerptElement(text, terms, 240) : null,
  );
}

function resultList(entries, search, terms) {
  const list = element("ol", "govuk-list app-search-results");
  for (const entry of entries.slice(0, MAX_RESULTS)) list.append(resultItem(entry, search, terms));
  return list;
}

const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;

function announce(text) {
  status.textContent = text;
  document.title = `${text} – ${document.title}`;
}

/** The first passage after a heading or page, to help the reader confirm it is the right one. */
function firstPassage(entry, search) {
  if (entry.kind !== "heading" && entry.kind !== "page") return entry;
  return search.entries.find((other) => other.order > entry.order && other.page === entry.page && other.text);
}

/** A rule that a number or permanent identifier leads to: a link to it, and where it is, or that it is no longer in the working draft. */
function identityItem(holder, search) {
  if (holder.entry) {
    return element(
      "li",
      "",
      link(identityDestination(holder.entry, search.pages, SITE_ROOT), `Rule ${holder.entry.ref}`),
      contextElement(holder.entry, search.pages),
    );
  }
  return element(
    "li",
    "",
    link(permanentRuleLink(SITE_ROOT, holder.id), `Rule ${holder.ref}`),
    element("p", "govuk-body-s app-search-result__context", "No longer in the working draft"),
  );
}

/** The box for a rule or section found by its number or permanent identifier. `href` is where "Go to" goes. */
function ruleBox(entry, search, name, goTo, href, ...extra) {
  const passage = firstPassage(entry, search);
  return element(
    "div",
    "app-search-exact",
    element("h2", "govuk-heading-m app-search-exact__title", name),
    contextElement(entry, search.pages),
    ...extra,
    passage?.text ? excerptElement(passage.text, [], 300) : null,
    link(href, goTo, "govuk-button app-search-exact__button"),
  );
}

/**
 * A number no rule has now, but one or more rules used to. With one, say what
 * it is now; with more, list them all. Search never picks one for the reader.
 */
function showFormerNumber(reference, holders, search) {
  const name = `Rule ${reference}`;
  if (holders.length > 1) {
    announce(`${name} has been used for more than one rule`);
    const list = element("ul", "govuk-list app-search-holders");
    for (const holder of holders) list.append(identityItem(holder, search));
    output.append(
      element(
        "div",
        "govuk-inset-text app-search-missing",
        element("h2", "govuk-heading-m", `${name} has been used for more than one rule`),
        element(
          "p",
          "govuk-body",
          `No rule is numbered ${reference} now. Earlier versions of the working draft used this number for each of these rules, so search cannot tell which one you are looking for:`,
        ),
        list,
      ),
    );
    return;
  }
  const [holder] = holders;
  if (holder.entry) {
    const now = `rule ${holder.entry.ref}`;
    announce(`${name} is now ${now}`);
    output.append(
      ruleBox(holder.entry, search, `${name} is now ${now}`, `Go to ${now}`, identityDestination(holder.entry, search.pages, SITE_ROOT), element("p", "govuk-body", `This rule was numbered ${reference} in an earlier version of the working draft.`)),
    );
    return;
  }
  announce(`${name} is no longer in the working draft`);
  output.append(
    element(
      "div",
      "govuk-inset-text app-search-missing",
      element("h2", "govuk-heading-m", `${name} is no longer in the working draft`),
      element("p", "govuk-body", "It has been removed from the working draft. Its permanent link says whether anything replaces it."),
      element("p", "govuk-body", link(permanentRuleLink(SITE_ROOT, holder.id), `Find out what happened to rule ${reference}`)),
    ),
  );
}

/** A rule found by its permanent identifier, such as r0123. */
function showIdentity(id, search) {
  const holder = search.identity(id);
  if (!holder) {
    announce("Rule not found");
    output.append(
      element(
        "div",
        "govuk-inset-text app-search-missing",
        element("h2", "govuk-heading-m", `There is no rule with the permanent identifier ${id}`),
        element("p", "govuk-body", "Check it and try again, or search for the rule's number, for example 12.4.1.c."),
      ),
    );
    return;
  }
  if (!holder.entry) {
    announce(`Rule ${holder.ref} is no longer in the working draft`);
    output.append(
      element(
        "div",
        "govuk-inset-text app-search-missing",
        element("h2", "govuk-heading-m", `Rule ${holder.ref} is no longer in the working draft`),
        element("p", "govuk-body", `${id} is the permanent identifier of rule ${holder.ref}, which has been removed from the working draft. Its permanent link says whether anything replaces it.`),
        element("p", "govuk-body", link(permanentRuleLink(SITE_ROOT, id), `Find out what happened to rule ${holder.ref}`)),
      ),
    );
    return;
  }
  const name = `Rule ${holder.entry.ref}`;
  announce(`${name} found`);
  output.append(
    ruleBox(holder.entry, search, name, `Go to rule ${holder.entry.ref}`, identityDestination(holder.entry, search.pages, SITE_ROOT), element("p", "govuk-body", `${id} is the permanent identifier of rule ${holder.entry.ref}.`)),
  );
}

function showReference(query, reference, search) {
  const entry = search.lookup(reference);
  const former = /[a-z]/.test(reference) ? search.formerHolders(reference) : [];
  if (!entry && former.length) {
    showFormerNumber(reference, former, search);
    return;
  }
  if (!entry) {
    const nearest = search.nearest(reference);
    const name = referenceName(reference, /[a-z]/.test(reference) ? "rule" : "section");
    announce(`${name} not found`);
    const box = element(
      "div",
      "govuk-inset-text app-search-missing",
      element("h2", "govuk-heading-m", `There is no ${name.charAt(0).toLowerCase()}${name.slice(1)} in the trust framework`),
      element("p", "govuk-body", "Check the number and try again. Rule numbers start with their section number, for example 12.4.1.c."),
    );
    if (nearest) {
      box.append(
        element(
          "p",
          "govuk-body",
          "The nearest section that exists is ",
          link(destination(nearest, search.pages, SITE_ROOT), resultTitle(nearest, search.pages)),
          ".",
        ),
      );
    }
    output.append(box);
    return;
  }

  const name = entry.kind === "page" || entry.kind === "heading" ? entry.title : referenceName(reference, entry.kind);
  const goTo = entry.kind === "page" ? `Go to section ${reference}` : `Go to ${referenceName(reference, entry.kind).replace(/^\w/, (c) => c.toLowerCase())}`;
  const box = ruleBox(entry, search, name, goTo, destination(entry, search.pages, SITE_ROOT));
  if (!entry.anchor && entry.kind === "paragraph") {
    box.insertBefore(
      element("p", "govuk-body-s", `This paragraph does not have a link of its own. The link goes to the start of the section, where it is.`),
      box.lastChild,
    );
  }
  output.append(box);

  // The number has also been used for another rule, so an older link or
  // reference to it may mean that one. Say so, and list them.
  if (former.length) {
    const list = element("ul", "govuk-list app-search-holders");
    for (const holder of former) list.append(identityItem(holder, search));
    output.append(
      element(
        "div",
        "govuk-inset-text",
        element("h2", "govuk-heading-m", `The number ${reference} has also been used for another rule`),
        element("p", "govuk-body", `If you are following an older link or reference to ${reference}, it may mean:`),
        list,
      ),
    );
  }

  // Cross-references to a rule or subsection. (A section number alone, such
  // as 12, is too common in the text to be useful.)
  const mentions = reference.includes(".") ? search.mentions(reference, entry) : [];
  const found = referenceName(reference, entry.kind);
  announce(mentions.length ? `${found} found, and ${plural(mentions.length, "other passage")} that mention it` : `${found} found`);
  if (mentions.length) {
    output.append(element("h2", "govuk-heading-m", `Other passages that mention ${reference}`), resultList(mentions, search, []));
  }
}

function showResults(query, search) {
  const terms = queryTerms(query);
  const results = search.search(query);
  const quoted = `‘${query}’`;
  if (!results.length) {
    announce(`No results for ${quoted}`);
    output.append(
      element("h2", "govuk-heading-m", `No results for ${quoted}`),
      element("p", "govuk-body", "Check the spelling, or try fewer or different words."),
      element("p", "govuk-body", "If you know the rule number, search for it, for example 12.4.1.c."),
    );
    return;
  }
  announce(`${plural(results.length, "result")} for ${quoted}`);
  output.append(element("h2", "govuk-heading-m", `${plural(results.length, "result")} for ${quoted}`), resultList(results, search, terms));
  if (results.length > MAX_RESULTS) {
    output.append(element("p", "govuk-body", `Showing the first ${MAX_RESULTS} results. Add more words to narrow your search.`));
  }
}

function showFormError() {
  const group = form.querySelector(".govuk-form-group");
  const message = element("p", "govuk-error-message", element("span", "govuk-visually-hidden", "Error: "), "Enter a rule number or words to search for");
  message.id = `${input.id}-error`;
  group.classList.add("govuk-form-group--error");
  input.classList.add("govuk-input--error");
  input.setAttribute("aria-describedby", `${input.getAttribute("aria-describedby") ?? ""} ${message.id}`.trim());
  form.querySelector(".app-search-form__row").before(message);
  document.title = `Error: ${document.title}`;
}

function showUnavailable() {
  announce("Search is not working at the moment");
  output.append(
    element("h2", "govuk-heading-m", "Search is not working at the moment"),
    element("p", "govuk-body", "Try again later, or find a rule using the sections listed below."),
  );
  fallback.hidden = false;
}

async function run() {
  if (!form || !output || !enhanced || !fallback) return;
  // Search is running: offer it instead of the fallback.
  enhanced.hidden = false;
  fallback.hidden = true;
  const query = new URLSearchParams(window.location.search).get("q");
  if (query === null) return;
  input.value = query;
  if (!query.trim()) {
    showFormError();
    return;
  }
  examples.hidden = true;
  const loading = element("p", "govuk-body app-search-loading", "Loading search…");
  output.append(loading);
  let search;
  try {
    const response = await fetch(new URL("search-index.json", SITE_ROOT));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    search = createSearch(await response.json());
  } catch (error) {
    console.error("Search index could not be loaded:", error);
    loading.remove();
    showUnavailable();
    return;
  }
  loading.remove();
  const id = parseIdentity(query);
  const reference = parseReference(query);
  if (id) showIdentity(id, search);
  else if (reference) showReference(query, reference, search);
  else showResults(query.trim(), search);
}

run();
