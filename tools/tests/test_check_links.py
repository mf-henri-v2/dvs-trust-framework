"""Tests for tools/check_links.py.

Run from the repository root:
    python -m unittest discover -s tools/tests -v
"""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

TOOLS = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(TOOLS))

import check_links as cl  # noqa: E402


class Slugs(unittest.TestCase):
    def test_matches_github_heading_ids(self):
        cases = {
            "Part 3 — Rules for all service providers": "part-3--rules-for-all-service-providers",
            "12. Service requirements": "12-service-requirements",
            "How it works": "how-it-works",
            "GitHub, GOV.UK and who decides": "github-govuk-and-who-decides",
            "Give feedback on `main`": "give-feedback-on-main",
            "snake_case stays": "snake_case-stays",
        }
        for heading, slug in cases.items():
            with self.subTest(heading=heading):
                self.assertEqual(cl.github_slug(heading), slug)

    def test_repeated_headings_are_numbered(self):
        ids = cl.anchors_in("## Back\n\ntext\n\n## Back\n")
        self.assertEqual({"back", "back-1"}, ids)

    def test_html_anchors_are_found(self):
        self.assertIn("section-12_4", cl.anchors_in('## 12.4 Title\n<a id="section-12_4"></a>\n'))

    def test_headings_inside_code_fences_are_ignored(self):
        self.assertNotIn("not-a-heading", cl.anchors_in("```\n# Not a heading\n```\n"))


class Links(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp())
        (self.root / "part").mkdir()
        (self.root / "part" / "README.md").write_text('# Part 3\n<a id="part-3"></a>\n', encoding="utf-8")

    def problems(self, text: str) -> list[str]:
        (self.root / "page.md").write_text(text, encoding="utf-8")
        return [message for _, _, message in cl.check_links(self.root)]

    def test_valid_links_pass(self):
        self.assertEqual(self.problems("[Part](part/README.md#part-3) [Self](#page) [Folder](part/)\n\n# Page\n"), [])

    def test_missing_file_is_reported(self):
        self.assertEqual(self.problems("[Changes](CHANGELOG.md)\n"), ["target does not exist: CHANGELOG.md"])

    def test_missing_anchor_is_reported(self):
        self.assertEqual(self.problems("[Part](part/README.md#part-4)\n"), ["anchor not found: part/README.md#part-4"])

    def test_link_outside_the_repository_is_reported(self):
        self.assertEqual(self.problems("[New issue](../../issues/new/choose)\n"),
                         ["link leaves the repository: ../../issues/new/choose"])

    def test_external_links_are_not_checked(self):
        self.assertEqual(self.problems("[GOV.UK](https://www.gov.uk/) [Mail](mailto:someone@example.com)\n"), [])

    def test_links_in_code_are_not_checked(self):
        self.assertEqual(self.problems("`[x](missing.md)`\n\n```\n[x](missing.md)\n```\n"), [])

    def test_images_are_checked(self):
        self.assertEqual(self.problems("![Figure](media/missing.svg)\n"), ["target does not exist: media/missing.svg"])


class IssueFormSections(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp())
        (self.root / "trust-framework-1.0").mkdir()
        (self.root / "trust-framework-1.0" / "README.md").write_text(
            "- [0. Notes](00.md)\n- [1. Introduction](part-1/01.md)\n", encoding="utf-8")
        (self.root / ".github" / "ISSUE_TEMPLATE").mkdir(parents=True)

    def form(self, options: list[str]) -> list:
        lines = "".join(f'        - "{o}"\n' for o in options)
        (self.root / ".github" / "ISSUE_TEMPLATE" / "1-form.yml").write_text(
            "body:\n  - type: dropdown\n    id: section\n    attributes:\n      label: \"Section\"\n"
            f"      options:\n{lines}    validations:\n      required: true\n", encoding="utf-8")
        return cl.check_issue_form_sections(self.root)

    def test_matching_list_passes(self):
        self.assertEqual(self.form(["0. Notes", "1. Introduction", cl.NO_SECTION]), [])

    def test_missing_or_renamed_section_is_reported(self):
        self.assertEqual(len(self.form(["0. Notes", cl.NO_SECTION])), 1)
        self.assertEqual(len(self.form(["0. Notes", "1. Intro", cl.NO_SECTION])), 1)


if __name__ == "__main__":
    unittest.main()
