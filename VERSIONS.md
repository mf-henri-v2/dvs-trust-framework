<!-- caution-banner:start (wording is kept in tools/caution-banner.md; edit it there) -->
> [!CAUTION]
> This is a working draft of the UK digital verification services trust framework, maintained for collaboration and review. It is not the formally published version and may differ from it. For the published trust framework, see [GOV.UK](https://www.gov.uk/government/publications/uk-digital-verification-services-trust-framework-1-0).
<!-- caution-banner:end -->

# Versions and published baselines

This repository holds OfDIA's working draft of the UK digital verification services trust framework. Git tags record each version exactly as it was formally published, so you can always see what has changed since publication.

## How it works

- **The `main` branch is the working draft.** It holds the text OfDIA has accepted through review. It can include changes that have not been published yet.
- **A `published-X.Y` tag marks each formally published version.** A tag points at the version of the files that matched that publication, and never moves.
- **GOV.UK is authoritative for the published version.** A change accepted into the working draft takes effect only when OfDIA publishes a new version on GOV.UK.

The working draft is expected to differ from the latest published version once changes have been accepted. That difference is what the comparison below shows.

## Published versions

| Tag | Published on GOV.UK | Notes |
| --- | --- | --- |
| [`published-1.0`](https://github.com/ofdia-uk/dvs-trust-framework/tree/published-1.0) | 9 June 2026 | [Trust framework 1.0](https://www.gov.uk/government/publications/uk-digital-verification-services-trust-framework-1-0), final publication. It replaced the pre-release published on 3 March 2026. |

Earlier publications of the trust framework, such as gamma (0.4) and beta (0.3), are on GOV.UK. They are not held in this repository.

## Compare the working draft with a published version

- On GitHub: [compare `published-1.0` with the working draft](https://github.com/ofdia-uk/dvs-trust-framework/compare/published-1.0...main). This shows every change since publication, file by file.
- In a local copy of the repository:

  ```sh
  git fetch --tags
  git diff published-1.0 main -- trust-framework-1.0/
  ```

## Where the text lives

The sections are in [`trust-framework-1.0/`](trust-framework-1.0/README.md), one file per numbered section. The folder name records the version the working draft started from. Whether to rename it is decided when a new version is published.

## When a new version is published

1. Through a reviewed pull request, make sure `main` holds exactly the text published on GOV.UK.
2. A maintainer tags that commit `published-X.Y` with an annotated tag, and adds a row to the table above.
3. If the banner needs to point to the new publication, update [`tools/caution-banner.md`](tools/caution-banner.md) and apply it. [How this repository works](ARCHITECTURE.md#caution-banner) explains how.
4. Optionally, create a GitHub release from the tag so the published version is easy to find.

## How the text was first added

The text was imported on 26 May 2026 from the 1.0 pre-release published on GOV.UK on 3 March 2026. It was then updated to match the final 1.0 publication of 9 June 2026, which changed sections 0, 2 and 4. The result was tagged `published-1.0`.
