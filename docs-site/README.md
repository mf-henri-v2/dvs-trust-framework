# Reading site

The source for the reading website: <https://ofdia-uk.github.io/dvs-trust-framework/>.

The site shows the working draft of the trust framework to people who would rather not use GitHub. It is for reading only. Feedback, review and history stay on GitHub, and every page links back there.

## How it works

The site has no copy of the text. [Eleventy](https://www.11ty.dev/) renders the Markdown files in `trust-framework-1.0/` and `CONTRIBUTING.md` directly from the repository. Rendering never changes the source files. [`lib/markdown.js`](lib/markdown.js) turns the GitHub-oriented Markdown into web pages:

- It removes each file's caution banner and "Repository navigation" footer. Every page shows a "Draft" status banner instead.
- It uses the first heading as the page title, and keeps the other headings in order without skipping levels.
- It points links between Markdown files at the matching site pages. Links to other repository files go to GitHub.
- It uses the abbreviation definitions kept in a hidden comment in section 16 to explain abbreviations on hover. It renders the bold row headings in the section 15 table as table row headers. Both match GOV.UK.
- It gives each numbered rule (for example 12.4.1.c) an anchor made from its number, such as `#section-12_4_1_c`, and marks it for rule-level feedback. See [Feedback links](#feedback-links).
- It gives each glossary term in section 16 an anchor made from the term, such as `#term-identity-repair`, so that search results can link to it.
- It applies GOV.UK Frontend styles.

The site also has a search page and a "What's changed" page. See [Search](#search) and [Changes to the trust framework](#changes-to-the-trust-framework).

The Markdown is never processed by a template engine, so nothing in the policy text can be interpreted as code.

## Feedback links

Every feedback link opens the issue template chooser on GitHub, so the reader still picks the kind of feedback. GitHub passes the "Rule, paragraph or page" field (id `reference`) through the chooser to the form the reader picks, and every form has that field. The reader can change it before submitting. GitHub fills in text fields from a link, but not dropdowns, so the reader still chooses the section. The links add no labels; each form's labels apply as before.

- **Page:** the "Give feedback on GitHub" link at the bottom of each trust framework page fills in the page title as a link to the page. It works without JavaScript.
- **Rule:** pointing to a rule highlights it and shows a "Give feedback on 12.4.1.c" link beside it. On a touch screen, tapping a rule does the same, and tapping it again or elsewhere clears it. The link fills in the rule number as a Markdown link to the rule, for example `[12.4.1.c](https://…/12-service-requirements/#section-12_4_1_c)`, so the issue shows "12.4.1.c" as a link. There is only one such link at a time, so the rules add nothing to the Tab order. [`assets/rule-feedback.js`](assets/rule-feedback.js) does this.
- **Rule picker:** for keyboard and screen reader users, and without JavaScript, each page with rules has a "Give feedback on a specific rule" form at the bottom, with a dropdown of its rules grouped by heading. A skip link to it appears at the top of the page when it has keyboard focus.

A link to a rule anchor highlights the rule in pale yellow.

All of this is made when the site is built. A rule is a paragraph that starts with its number, such as "12.4.1.c." or "12.4.1.c", so new rules get an anchor and feedback route automatically. The Markdown is not changed. The tests fail if a paragraph looks like a numbered rule but the renderer does not recognise it, if a rule is missing its anchor or feedback route, or if an ID is repeated. The site check does the same on the built pages.

The addresses in the links use `SITE_URL`. The Reading site workflow sets it to the GitHub Pages address of the repository it runs in. Without it, the address of the OfDIA site is used.

## Search

The search page (`/search/`) finds a rule or section by its number, and passages by the words in them. A search form on the home page and a "Search" link in the navigation lead to it.

**Rule and section numbers.** A search for `12.4.1.c` or `Rule 12.4.1.C.` finds rule 12.4.1.c. Case, spaces, a full stop at the end and a leading "rule" or "section" do not matter. Sections (`12`) and subsections (`12.4`, `12.4.1`) work too. The page shows the rule first, with the headings it comes under and the start of its text, then a "Go to rule 12.4.1.c" link to the rule's anchor, and any other passages that mention it. A number that does not exist says so, and offers the nearest section that does exist, by name. Search never goes to a different rule without saying so. Numbered paragraphs at the start of a section, such as 13.a, are not rules on the site and have no anchor, so they link to the start of their section.

**Words.** Every word searched for must be in the passage or in the headings it comes under. Common words such as "the" are ignored, letters and digits are split ("GPG45" is "GPG 45"), and a plural matches its singular ("biometrics" finds "biometric"). Matches in headings and glossary terms, and the words together as a phrase, come first. Each result links to the passage: a rule to its anchor, a glossary term to the term, other paragraphs to the heading they come under, and rows of the table of standards to section 15.

**The address.** The search is in the page address (`/search/?q=identity+repair`), so a search can be shared, reloaded or returned to with Back. Each search loads the page again. The number of results is announced once, not while the reader types. Queries and passages are written to the page as text, never as HTML.

**Without JavaScript.** Search needs JavaScript. Without it, the search page explains how to find a rule by its section and links to every section.

### How the search index is made

[`lib/search.js`](lib/search.js) makes the search index (`/search-index.json`) when the site is built. It parses each numbered section with the site's own Markdown renderer, so every anchor in the index is one the page has. It uses the same rule boundaries as the rule feedback blocks (`ruleBoundaries` in `lib/markdown.js`), so a rule includes its lists. The index has an entry for each section, heading, rule, other paragraph, glossary term and row of the table of standards, with the headings each one comes under.

The index has only the numbered sections. It leaves out the contents pages, the feedback guidance, the "What's changed" pages, the caution banner and repository navigation, and everything the site layout adds, such as the navigation, the draft banner and the feedback controls. Page addresses in the index are relative to the home page. The search page works out the home page from the address of its own script, so search works at `/` locally and at `/dvs-trust-framework/` on GitHub Pages.

[`assets/search-core.js`](assets/search-core.js) does the searching, and [`assets/search.js`](assets/search.js) shows the results. The index is about 250 KB (about 55 KB compressed), and only the search page loads it. Search runs in the reader's browser: there is no search service, nothing is sent anywhere, and there are no accounts or analytics.

### Maintaining search

Nothing needs updating by hand. New or renumbered rules, headings and glossary terms are found when the site is built. The tests fail if a rule or numbered heading cannot be found by its number, if an index entry links to an anchor the page does not have, or if site navigation or feedback text gets into the index. The site check does the same on the built site.

Search matches words only. It does not know synonyms, so "ID" does not find "identity". To change how results are ranked, edit `search` in `assets/search-core.js` and check the example searches in `test/search.test.js`.

## Changes to the trust framework

The "What's changed" page (`/changes/`) tells readers whether the trust framework has changed since its baseline, the tag named in [`framework-baseline.json`](../framework-baseline.json) (initially `published-1.0`). [`lib/changes.js`](lib/changes.js) works this out from Git when the site is built:

- Only the files in `trust-framework-1.0/` count. Their caution banner and "Repository navigation" footer are removed first, so changing those is not a change to the trust framework. Changes anywhere else in the repository are ignored.
- A file has changed only if it looks different on the site. Both versions are rendered as the site renders them. Whitespace a browser does not show, such as extra blank lines or double spaces, and HTML comments are ignored. Whitespace that matters, such as a hard line break or spacing inside code, still counts.
- The page compares the current working draft with the baseline, and says that changes in the working draft do not by themselves change the published trust framework. If nothing has changed, it says the working draft contains no changes compared with the baseline.
- If something has changed, the page lists the changed sections and the date the content last changed on `main`. Repository-only commits never change that date. Each changed section has a page showing the changed paragraphs and rule numbers linked to the rule:
  - **wording changes:** removed words struck through and added words underlined;
  - **link changes:** the link's old and new destination;
  - **formatting changes:** marked as formatting, with the wording and links the same.
- The changed section's own page links to its changes. Unchanged pages say nothing.
- A file is "moved" only when it looks exactly the same in its new place.

The build needs the baseline tag and the full Git history. In CI, if either is missing, the build fails rather than saying nothing has changed. A local build without them says the information is not available. The tests check the comparison against small example repositories, and the site check confirms that what the page says is consistent.

## Branding

The site is not part of GOV.UK. Following the GOV.UK Design System rules for services on other domains, it uses [GOV.UK Frontend](https://frontend.design-system.service.gov.uk/) components with:

- the Generic header, showing the OfDIA name instead of the GOV.UK logo;
- no crown, GOV.UK favicons or GDS Transport font (it uses Arial);
- black instead of the GOV.UK brand colour (set in [`src/site.scss`](src/site.scss)).

## Build and publish

The [Reading site workflow](../.github/workflows/site.yml) runs on every pull request and every change to `main`:

- On a pull request it builds the site, tests the rendering and checks every page. The checks cover internal links, form addresses and anchors, unique IDs, heading order, image alt text, the draft banner, an anchor and feedback route for every numbered rule, a consistent "What's changed" page, and a search index whose every entry links to an anchor that exists. Nothing is published.
- On `main` it does the same and then publishes the site to GitHub Pages.

Publishing needs GitHub Pages enabled for the repository, with **GitHub Actions** as the source (Settings, Pages).

## Run it locally

You need Node.js 24 (see [`.nvmrc`](.nvmrc)) and Python 3.

```sh
cd docs-site
npm ci
npm start          # build the stylesheet, then serve the site at http://localhost:8080/ and rebuild on changes
npm test           # test the Markdown rendering
npm run build      # build once into _site/
python3 ../tools/check_site.py _site
```

## Files

| Path | What it is |
| --- | --- |
| `eleventy.config.js` | Which files become pages, their addresses, and site-wide data |
| `lib/markdown.js` | How the Markdown is rendered |
| `lib/changes.js` | What has changed in the trust framework since its baseline, for the "What's changed" pages |
| `lib/feedback.js` | Feedback link addresses, and the rules listed in each page's rule picker |
| `lib/search.js` | The search index, made from the trust framework sections |
| `_includes/layouts/` | Page templates: `base.njk` for every page, `page.njk` for pages rendered from Markdown |
| `_data/site.js` | Site title, organisation and publication links, and part titles |
| `pages/index.njk` | The home page |
| `pages/changes.njk`, `pages/changes-section.njk` | The "What's changed" page, and a page for each changed section |
| `pages/search.njk`, `pages/search-index.njk` | The search page, and the search index it loads |
| `_includes/components/search-form.njk` | The search form, used on the home page and the search page |
| `src/site.scss` | GOV.UK Frontend settings and the site's own styles |
| `assets/init.js` | Starts GOV.UK Frontend's JavaScript |
| `assets/rule-feedback.js` | Shows the feedback link for the rule that is pointed to or tapped |
| `assets/search-core.js`, `assets/search.js` | Search: finding rules and passages, and showing the results |
| `test/` | Tests for the Markdown rendering, rule anchors, feedback links, changes and search |
