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
| `docs-site/` | Source for a rendered reading version of the working draft (not yet deployed) |

## How the text is structured

- Each numbered section is one Markdown file. Each part of the publication is a folder.
- Invisible HTML anchors such as `<a id="section-12_4"></a>` keep the anchor IDs used on GOV.UK, so cross-references work. A reference to another file is a relative link to that file and anchor.
- The example boxes in the GOV.UK publication are shown as quoted blocks.
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

On a pull request, GitHub runs the workflows and tools as changed by that pull request. A passing check therefore does not show that the checks themselves were left intact. Review changes to `.github/` and `tools/` with that in mind.

## Issue labels

The issue forms apply these labels. They must exist in the repository for the forms to label issues.

| Label | Applied by |
| --- | --- |
| `triage` | Every issue form, until a maintainer has reviewed the issue |
| `policy-feedback` | Policy feedback |
| `clarity` | Unclear wording |
| `correction` | Correction |
| `accessibility` | Accessibility problem |
| `links-and-navigation` | Broken link or navigation problem |
| `suggestion` | Other suggestion |
