<!-- caution-banner:start (wording is kept in tools/caution-banner.md; edit it there) -->
> [!CAUTION]
> This is a working draft of the UK digital verification services trust framework, maintained for collaboration and review. It is not the formally published version and may differ from it. For the published trust framework, see [GOV.UK](https://www.gov.uk/government/publications/uk-digital-verification-services-trust-framework-1-0).
<!-- caution-banner:end -->

# How this repository works

A reference for OfDIA maintainers: how the repository is organised, what each part is for, and how to carry out routine tasks.

## GitHub, GOV.UK and who decides

| Stage | What it means |
| --- | --- |
| Issue | Feedback, a question or a proposal. Raising an issue does not mean OfDIA has accepted it. |
| Pull request | A proposed change, reviewed and discussed before a decision is made. |
| Merged into `main` | Accepted into the working draft. Not yet published and not in force. |
| `published-X.Y` tag | The text exactly as formally published. See [Versions](VERSIONS.md). |
| GOV.UK publication | The authoritative, formally published version. |

Automated checks support this process. They do not approve policy. Decisions about policy wording are made by the OfDIA policy owner through review.

## Policy wording and repository material

The repository holds two kinds of material, and they are changed differently.

- **Policy wording** is the numbered text in the section files under `trust-framework-1.0/`. It changes only through a reviewed pull request that records the authority for the change, such as a linked issue or an OfDIA decision. Keep policy changes in their own pull requests, separate from repository changes.
- **Repository material** is everything added to help people read, discuss and maintain the text: the caution banner, navigation footers, README files, templates, tools and workflows. It can be improved without a policy decision, as long as the meaning of the policy wording is unchanged.

If you cannot tell whether a change alters meaning, treat it as a policy change.

## Layout

| Path | What it holds |
| --- | --- |
| `trust-framework-1.0/` | The working draft: section 0, then one folder per part, one file per numbered section |
| `media/` | Figures used by the text, and the OfDIA banner image |
| `tools/` | The caution banner source and tools used by the checks, with their tests |
| `.github/` | Issue forms, pull request template, code owners and workflows |
| `docs-site/` | Source for the [reading site](https://ofdia-uk.github.io/dvs-trust-framework/), built from the Markdown and published from `main` |
| `framework-baseline.json` | The tag the reading site's "What's changed" page compares the trust framework with. See [The framework baseline](VERSIONS.md#the-framework-baseline). |

## How the text is structured

- Each numbered section is one Markdown file. Each part of the publication is a folder.
- Invisible HTML anchors such as `<a id="section-12_4"></a>` keep the anchor IDs used on GOV.UK, so cross-references work. A reference to another file is a relative link to that file and anchor.
- A numbered rule is a paragraph that starts with its number, such as `12.4.1.c.`. The reading site gives each one an anchor made from its number, such as `#section-12_4_1_c`, when it is built. These anchors are not in the Markdown, so do not add them by hand.
- The example boxes in the GOV.UK publication are shown as quoted blocks. The heading in each box is one level below the heading of the section it sits in.
- The abbreviation definitions from the GOV.UK publication (`*[DVS]: Digital Verification Service`) are kept unchanged in an HTML comment at the end of section 16. GitHub does not display them. The reading site uses them to explain abbreviations, as GOV.UK does. Keep the comment, and add any new definition inside it.
- The row headings in the section 15 table are bold cells. On GOV.UK and the reading site they are table row headers.
- The navigation links at the end of each section file, below a horizontal rule, are repository material.
- The text was converted from the GOV.UK publication once, when it was first imported. The conversion scripts were removed afterwards. They remain in the repository history at commit `4c41d4f`.

## Caution banner

Each applicable Markdown file starts with a banner saying that the repository is a working draft and that GOV.UK holds the published version. The banner must stay visible to anyone who opens a single file on GitHub.

The wording is kept in one place, [`tools/caution-banner.md`](tools/caution-banner.md). In each file it sits between two HTML comments that GitHub does not display:

```markdown
<!-- caution-banner:start (wording is kept in tools/caution-banner.md; edit it there) -->
> [!CAUTION]
> This is a working draft of ...
<!-- caution-banner:end -->
```

To change the wording:

1. On a new branch, edit `tools/caution-banner.md`.
2. Apply it in one of two ways:
   - in a local copy, run `python tools/caution_banner.py --apply`, or
   - in the browser, go to **Actions**, choose **Apply caution banner**, and run it on your branch.
3. Open a pull request and review the changes. Every file's banner changes, and nothing else should.

The tool changes only the lines between the markers. It also adds the banner to a file that clearly has none. For anything unexpected it changes nothing and reports the file. That includes a banner without markers, text directly under the banner, duplicate or damaged markers, a byte order mark or front matter. Fix those files by hand. This is deliberate: the tool never guesses where the banner ends and the policy text begins.

Files under `.github/`, `tools/` and `docs-site/` do not need the banner.

## Automated checks

The **Repository checks** workflow runs on every pull request and every change to `main`. It uses read-only permissions and needs no secrets, so it also runs on pull requests from forks. It has no path filters, so if a check is made required it never waits in a "Pending" state.

| Check | Confirms | Does not confirm |
| --- | --- | --- |
| Caution banner present | Every applicable Markdown file starts with the current banner | Anything about the policy content |
| Tooling tests | The tools in `tools/` behave as their tests describe | Anything about the policy content |
| Internal links and anchors | Relative links and anchors in Markdown files resolve, and every issue form lists the same sections as the contents page | That external websites are reachable, or anything about the policy content |

The **Reading site** workflow also runs on every pull request and every change to `main`:

| Check | Confirms | Does not confirm |
| --- | --- | --- |
| Build and check the site | The site builds and its tests pass. Every page has working internal links and anchors, unique IDs, ordered headings, image alt text and the draft banner. Every numbered rule has an anchor and a feedback route. The "What's changed" page reports a consistent status | That the site is published, or anything about the policy content |

On a pull request, GitHub runs the workflows and tools as changed by that pull request. A passing check therefore does not show that the checks themselves were left intact. Review changes to `.github/` and `tools/` with that in mind.

## Reading site

The [reading site](https://ofdia-uk.github.io/dvs-trust-framework/) shows the working draft to people who would rather not use GitHub. It renders the Markdown files directly and keeps no copy of the text. Changes to `main` are published automatically. Pull requests are built and checked but never published. The site is not part of GOV.UK, so it uses the GOV.UK Design System's Generic header and none of the GOV.UK branding. [`docs-site/README.md`](docs-site/README.md) explains how it works and how to run it.

Besides the text itself, the site generates two things when it is built:

- **Rule-level feedback.** Readers can give feedback on a specific rule by pointing to or tapping it, or with the rule picker at the bottom of the page. Either way, an issue form opens with the rule number and a link to the rule filled in. The page-level "Give feedback on GitHub" link remains the general route.
- **"What's changed" (`/changes/`).** The page compares the working draft with the configured baseline and shows any changes to the trust framework content. See [Trust framework changes and repository history](#trust-framework-changes-and-repository-history).

## Trust framework changes and repository history

These are kept separate.

- **Repository history** is everything in Git: changes to the text, and to the website, issue forms, workflows and tools. The GitHub commit history and comparison views show all of it. Nothing is hidden or rewritten.
- **Trust framework changes** are changes to the content of the files under `trust-framework-1.0/`: their wording, links and formatting. The site's "What's changed" page shows only these. It compares the working draft with the tag named in [`framework-baseline.json`](framework-baseline.json), currently `published-1.0`. The caution banner, the navigation footer and whitespace that does not change how the text looks do not count.

Repository-only work never needs a tag. Changing the baseline is a deliberate decision, made in a reviewed pull request. [Versions](VERSIONS.md#the-framework-baseline) explains when.

To compare, the site build needs the baseline tag and the full Git history, which the Reading site workflow fetches. The build fails rather than saying nothing has changed in any of these cases:

- the tag is missing;
- the tag is not an annotated tag;
- the tag is not in the history of `main`;
- the history is incomplete.

A fork needs the baseline tag too. Forks do not receive new tags automatically, so after the baseline moves, fetch the tag into the fork.

## Issue labels

The issue forms apply these labels. They must exist in the repository for the forms to label issues.

| Label | Applied by |
| --- | --- |
| `triage` | Every issue form, until a maintainer has reviewed the issue |
| `proposed change` | Policy feedback |
| `draft clarity` | Unclear wording |
| `correction` | Correction, and Broken link or navigation problem |
| `accessibility` | Accessibility problem |
| `suggestion` | Other suggestion |

Maintainers add other labels when they triage an issue, such as the `area:` and `theme:` labels.

Every issue form has an optional "Rule, paragraph or page" field (`id: reference`). The reading site's feedback links fill it in, through GitHub's template chooser, with a link to the rule or page. Keep the field, with that ID, in every form.
