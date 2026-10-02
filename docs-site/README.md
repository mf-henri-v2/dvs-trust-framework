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
- It applies GOV.UK Frontend styles.

The Markdown is never processed by a template engine, so nothing in the policy text can be interpreted as code.

## Feedback links

Every feedback link opens the issue template chooser on GitHub, so the reader still picks the kind of feedback. GitHub passes the "Rule, paragraph or page" field (id `reference`) through the chooser to the form the reader picks, and every form has that field. The reader can change it before submitting. GitHub fills in text fields from a link, but not dropdowns, so the reader still chooses the section. The links add no labels; each form's labels apply as before.

- **Page:** the "Give feedback on GitHub" link at the bottom of each trust framework page fills in the page address. It works without JavaScript.
- **Rule:** pointing to a rule highlights it and shows a "Give feedback on 12.4.1.c" link beside it. On a touch screen, tapping a rule does the same, and tapping it again or elsewhere clears it. The link fills in the rule number and a link to the rule, for example `12.4.1.c (https://…/12-service-requirements/#section-12_4_1_c)`. There is only one such link at a time, so the rules add nothing to the Tab order. [`assets/rule-feedback.js`](assets/rule-feedback.js) does this.
- **Rule picker:** for keyboard and screen reader users, and without JavaScript, each page with rules has a "Give feedback on a specific rule" form at the bottom, with a dropdown of its rules grouped by heading. A skip link to it appears at the top of the page when it has keyboard focus.

A link to a rule anchor highlights the rule in pale yellow.

All of this is made when the site is built. A rule is a paragraph that starts with its number, such as "12.4.1.c." or "12.4.1.c", so new rules get an anchor and feedback route automatically. The Markdown is not changed. The tests fail if a paragraph looks like a numbered rule but the renderer does not recognise it, if a rule is missing its anchor or feedback route, or if an ID is repeated. The site check does the same on the built pages.

The addresses in the links use `SITE_URL`. The Reading site workflow sets it to the GitHub Pages address of the repository it runs in. Without it, the address of the OfDIA site is used.

## Branding

The site is not part of GOV.UK. Following the GOV.UK Design System rules for services on other domains, it uses [GOV.UK Frontend](https://frontend.design-system.service.gov.uk/) components with:

- the Generic header, showing the OfDIA name instead of the GOV.UK logo;
- no crown, GOV.UK favicons or GDS Transport font (it uses Arial);
- black instead of the GOV.UK brand colour (set in [`src/site.scss`](src/site.scss)).

## Build and publish

The [Reading site workflow](../.github/workflows/site.yml) runs on every pull request and every change to `main`:

- On a pull request it builds the site, tests the rendering and checks every page. The checks cover internal links and anchors, unique IDs, heading order, image alt text, the draft banner, and an anchor and feedback route for every numbered rule. Nothing is published.
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
| `lib/feedback.js` | Feedback link addresses, and the rules listed in each page's rule picker |
| `_includes/layouts/` | Page templates: `base.njk` for every page, `page.njk` for pages rendered from Markdown |
| `_data/site.js` | Site title, organisation and publication links, and part titles |
| `pages/index.njk` | The home page |
| `src/site.scss` | GOV.UK Frontend settings and the site's own styles |
| `assets/init.js` | Starts GOV.UK Frontend's JavaScript |
| `assets/rule-feedback.js` | Shows the feedback link for the rule that is pointed to or tapped |
| `test/` | Tests for the Markdown rendering, rule anchors and feedback links |
