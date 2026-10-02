"""Tests for tools/check_site.py.

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

import check_site as cs  # noqa: E402

BANNER = '<div class="govuk-phase-banner">Draft</div>'


def page(body: str, title: str = "Page") -> str:
    return f'<!DOCTYPE html><html lang="en"><head><title>{title}</title></head><body>{BANNER}<h1>{title}</h1>{body}</body></html>'


class SiteChecks(unittest.TestCase):
    def setUp(self):
        self.site = Path(tempfile.mkdtemp())
        (self.site / "section").mkdir()
        (self.site / "section" / "index.html").write_text(page('<h2 id="part-a">Part A</h2>'), encoding="utf-8")

    def problems(self, body: str, prefix: str = "/") -> list[str]:
        (self.site / "index.html").write_text(page(body), encoding="utf-8")
        return cs.check(self.site, prefix)

    def test_valid_page_passes(self):
        self.assertEqual(self.problems('<a href="/section/#part-a">A</a> <a href="https://www.gov.uk/">GOV.UK</a>'), [])

    def test_broken_link_and_missing_anchor(self):
        problems = self.problems('<a href="/missing/">x</a> <a href="/section/#part-z">y</a>')
        self.assertTrue(any("broken link: /missing/" in p for p in problems))
        self.assertTrue(any("missing anchor: /section/#part-z" in p for p in problems))

    def test_links_must_carry_the_path_prefix(self):
        self.assertEqual(self.problems('<a href="/prefix/section/">x</a>', prefix="/prefix/"), [])
        self.assertTrue(self.problems('<a href="/section/">x</a>', prefix="/prefix/"))

    def test_unexpected_url_schemes_are_not_treated_as_external(self):
        # A Windows path turned into a URL once slipped through as "external".
        self.assertTrue(any("broken link" in p for p in self.problems('<a href="c:/C:/Program Files/site/">x</a>')))

    def test_heading_levels_must_not_skip(self):
        self.assertTrue(any("jumps from <h2> to <h4>" in p for p in self.problems("<h2>A</h2><h4>B</h4>")))

    def test_images_need_alt_text(self):
        (self.site / "figure.svg").write_text("<svg/>", encoding="utf-8")
        self.assertTrue(any("without an alt" in p for p in self.problems('<img src="/figure.svg">')))

    def test_draft_banner_is_required(self):
        (self.site / "index.html").write_text(page("").replace(BANNER, ""), encoding="utf-8")
        self.assertTrue(any("draft status banner is missing" in p for p in cs.check(self.site, "/")))

    def test_repository_material_must_not_leak(self):
        self.assertTrue(any("leaked" in p for p in self.problems("<p>Repository navigation</p>")))

    def test_ids_must_be_unique(self):
        problems = self.problems('<h2 id="a">A</h2><p id="a">x</p>')
        self.assertTrue(any("more than one element has id 'a'" in p for p in problems))


def rule(number: str, anchor: str | None = None, reference: str | None = None) -> str:
    anchor = anchor or "section-" + number.replace(".", "_")
    reference = reference or f"{number} (https://example.org/page/#{anchor})"
    return (
        f'<div class="app-rule-block" data-rule="{number}" data-reference="{reference}" data-heading="12.1. Heading">'
        f'<p id="{anchor}" class="app-rule govuk-body">{number}. Text.</p></div>'
    )


def picker(*references: str) -> str:
    options = "".join(f'<option value="{reference}">x</option>' for reference in references)
    return f'<select id="rule-feedback-reference" name="reference"><option value="">Choose a rule</option>{options}</select>'


class RuleFeedbackChecks(unittest.TestCase):
    setUp = SiteChecks.setUp
    problems = SiteChecks.problems

    REF_A = "12.1.a (https://example.org/page/#section-12_1_a)"
    REF_B = "12.1.b (https://example.org/page/#section-12_1_b)"

    def test_rules_with_anchors_blocks_and_picker_pass(self):
        self.assertEqual(self.problems(rule("12.1.a") + rule("12.1.b") + picker(self.REF_A, self.REF_B)), [])

    def test_rule_without_a_feedback_block(self):
        problems = self.problems('<p id="section-12_1_a" class="app-rule govuk-body">12.1.a. Text.</p>')
        self.assertTrue(any("has no feedback block" in p for p in problems))

    def test_anchor_must_match_the_rule_number(self):
        problems = self.problems(rule("12.1.a", anchor="section-12_1_b") + picker(self.REF_A))
        self.assertTrue(any("does not match its number" in p for p in problems))

    def test_reference_must_link_to_the_rule(self):
        reference = "12.1.a (https://example.org/page/#section-12_9_z)"
        problems = self.problems(rule("12.1.a", reference=reference) + picker(reference))
        self.assertTrue(any("does not link to #section-12_1_a" in p for p in problems))

    def test_picker_must_list_every_rule(self):
        problems = self.problems(rule("12.1.a") + rule("12.1.b") + picker(self.REF_A))
        self.assertTrue(any("rule picker does not list exactly" in p for p in problems))


if __name__ == "__main__":
    unittest.main()
