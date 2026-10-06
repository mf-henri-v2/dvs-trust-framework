"""Tests for tools/check_site.py.

Run from the repository root:
    python -m unittest discover -s tools/tests -v
"""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path
from urllib.parse import quote

TOOLS = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(TOOLS))

import check_site as cs  # noqa: E402

CHOOSER = "https://github.com/example/repo/issues/new/choose"
BANNER = f'<div class="govuk-phase-banner"><p>Draft. <a href="https://www.gov.uk/">Published version</a> or <a href="{CHOOSER}">give feedback</a>.</p></div>'


def page(body: str, title: str = "Page") -> str:
    return f'<!DOCTYPE html><html lang="en"><head><title>{title}</title></head><body>{BANNER}<h1>{title}</h1>{body}</body></html>'


UNCHANGED = '<div data-framework-status="unchanged"><p>No changes.</p></div>'

INDEX = {
    "pages": [{"url": "section/", "title": "1. Section"}],
    "entries": [
        {"page": 0, "kind": "page", "ref": "1", "title": "1. Section"},
        {"page": 0, "kind": "heading", "anchor": "part-a", "title": "Part A"},
    ],
}


def write_index(site: Path, index: dict) -> None:
    (site / "search-index.json").write_text(json.dumps(index), encoding="utf-8")


SEARCH_ENHANCED = '<div data-search-enhanced hidden><div data-search-output></div></div>'
SEARCH_FALLBACK = '<div data-search-fallback><div><p>Find a rule.</p></div><ul><li><a href="../section/">A</a></li><li><a href="../">B</a></li></ul></div>'


def write_search_page(site: Path, body: str = SEARCH_ENHANCED + SEARCH_FALLBACK) -> None:
    (site / "search").mkdir(exist_ok=True)
    (site / "search" / "index.html").write_text(page(body), encoding="utf-8")


class SiteChecks(unittest.TestCase):
    def setUp(self):
        self.site = Path(tempfile.mkdtemp())
        (self.site / "section").mkdir()
        (self.site / "section" / "index.html").write_text(page('<h2 id="part-a">Part A</h2>'), encoding="utf-8")
        (self.site / "changes").mkdir()
        (self.site / "changes" / "index.html").write_text(page(UNCHANGED), encoding="utf-8")
        write_index(self.site, INDEX)
        write_search_page(self.site)

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

    def test_draft_banner_needs_a_feedback_link(self):
        (self.site / "index.html").write_text(page("").replace(f' or <a href="{CHOOSER}">give feedback</a>', ""), encoding="utf-8")
        self.assertIn("index.html: the draft status banner should have one link to give feedback, found 0", cs.check(self.site, "/"))

    def framework_page(self, reference: str | None) -> list[str]:
        href = CHOOSER + (f"?reference={quote(reference)}" if reference is not None else "")
        folder = self.site / "trust-framework-1.0" / "part-3" / "12-service-requirements"
        folder.mkdir(parents=True)
        (folder / "index.html").write_text(page("").replace(f'href="{CHOOSER}"', f'href="{href}"'), encoding="utf-8")
        return [p for p in cs.check(self.site, "/") if "draft status banner" in p]

    def test_banner_feedback_on_a_framework_page_fills_in_that_page(self):
        self.assertEqual(self.framework_page("[12. Service requirements](https://example.org/site/trust-framework-1.0/part-3/12-service-requirements/)"), [])

    def test_banner_feedback_on_a_framework_page_must_not_fill_in_another_page_or_a_rule(self):
        for reference in (
            None,
            "[11. Operational requirements](https://example.org/site/trust-framework-1.0/part-3/11-operational-requirements/)",
            "[12.4.1.c](https://example.org/site/trust-framework-1.0/part-3/12-service-requirements/#section-12_4_1_c)",
        ):
            with self.subTest(reference=reference):
                self.setUp()
                self.assertEqual(len(self.framework_page(reference)), 1)

    def test_banner_feedback_elsewhere_fills_in_nothing(self):
        (self.site / "index.html").write_text(page("").replace(f'href="{CHOOSER}"', f'href="{CHOOSER}?reference=%5BHome%5D(https%3A%2F%2Fexample.org%2F)"'), encoding="utf-8")
        self.assertIn(
            "index.html: the draft status banner's feedback link fills in a reference on a page that is not part of the trust framework: '[Home](https://example.org/)'",
            cs.check(self.site, "/"),
        )

    def test_repository_material_must_not_leak(self):
        self.assertTrue(any("leaked" in p for p in self.problems("<p>Repository navigation</p>")))

    def test_form_addresses_are_checked(self):
        self.assertEqual(self.problems('<form action="/section/"></form>'), [])
        self.assertTrue(any("broken link: /missing/" in p for p in self.problems('<form action="/missing/"></form>')))
        self.assertTrue(any("broken link" in p for p in self.problems('<form action="/section/"></form>', prefix="/prefix/")))

    def test_navigation_marks_the_current_page(self):
        nav = '<ul class="govuk-service-navigation__list"><li><a href="/section/"{a}>Section</a></li><li><a href="/"{b}>Home</a></li></ul>'
        self.assertEqual(self.problems(nav.format(a="", b=' aria-current="page"')), [])
        problems = self.problems(nav.format(a="", b=""))
        self.assertTrue(any('link to this page (/) is not marked aria-current="page"' in p for p in problems))
        problems = self.problems(nav.format(a=' aria-current="true"', b=' aria-current="page"'))
        self.assertTrue(any("more than one navigation link is marked" in p for p in problems))

    def test_ids_must_be_unique(self):
        problems = self.problems('<h2 id="a">A</h2><p id="a">x</p>')
        self.assertTrue(any("more than one element has id 'a'" in p for p in problems))


IDENTITIES = {"12.1.a": "r0001", "12.1.b": "r0002"}


def rule(number: str, anchor: str | None = None, reference: str | None = None, identity: str | None = None, block_id: str | None = None) -> str:
    anchor = anchor or "section-" + number.replace(".", "_")
    identity = IDENTITIES[number] if identity is None else identity
    reference = reference or f"[{number}](https://example.org/rules/{identity}/)"
    block_id = f"rule-{identity}" if block_id is None else block_id
    return (
        f'<div class="app-rule-block" data-rule="{number}" data-reference="{reference}" data-heading="12.1. Heading" id="{block_id}" data-rule-id="{identity}">'
        f'<p id="{anchor}" class="app-rule govuk-body">{number}. Text.</p></div>'
    )


def identity_page(site: Path, identity: str, status: str = "current", destination: str | None = None, replacements: tuple[str, ...] = ()) -> None:
    """A rule's permanent page, as docs-site/pages/rule-identity.njk writes it."""
    if destination is None and status == "current":
        destination = f"/#rule-{identity}"
    body = f'<div data-rule-identity="{identity}" data-rule-status="{status}">'
    if destination:
        body += f'<a href="{destination}" data-rule-destination>Go to the rule</a>'
    body += "".join(f'<a href="/rules/{other}/" data-rule-replacement="{other}">Rule</a>' for other in replacements)
    body += "</div>"
    (site / "rules" / identity).mkdir(parents=True, exist_ok=True)
    (site / "rules" / identity / "index.html").write_text(page(body), encoding="utf-8")


def picker(*references: str) -> str:
    options = "".join(f'<option value="{reference}">x</option>' for reference in references)
    return f'<select id="rule-feedback-reference" name="reference"><option value="">Choose a rule</option>{options}</select>'


class RuleFeedbackChecks(unittest.TestCase):
    problems = SiteChecks.problems

    def setUp(self):
        SiteChecks.setUp(self)
        for identity in IDENTITIES.values():
            identity_page(self.site, identity)

    REF_A = "[12.1.a](https://example.org/rules/r0001/)"
    REF_B = "[12.1.b](https://example.org/rules/r0002/)"

    def test_rules_with_anchors_blocks_and_picker_pass(self):
        self.assertEqual(self.problems(rule("12.1.a") + rule("12.1.b") + picker(self.REF_A, self.REF_B)), [])

    def test_rule_without_a_feedback_block(self):
        problems = self.problems('<p id="section-12_1_a" class="app-rule govuk-body">12.1.a. Text.</p>')
        self.assertTrue(any("has no feedback block" in p for p in problems))

    def test_anchor_must_match_the_rule_number(self):
        problems = self.problems(rule("12.1.a", anchor="section-12_1_b") + picker(self.REF_A))
        self.assertTrue(any("does not match its number" in p for p in problems))

    def test_reference_must_link_to_the_rules_permanent_address(self):
        for reference in ("[12.1.a](https://example.org/page/#section-12_1_a)", "[12.1.a](https://example.org/rules/r0002/)", "[12.1.a](https://example.org/rules/r0001/#x)"):
            problems = self.problems(rule("12.1.a", reference=reference) + picker(reference))
            self.assertTrue(any("does not link to its permanent address /rules/r0001/" in p for p in problems), reference)

    def test_picker_must_list_every_rule(self):
        problems = self.problems(rule("12.1.a") + rule("12.1.b") + picker(self.REF_A))
        self.assertTrue(any("rule picker does not list exactly" in p for p in problems))


class PermanentLinkChecks(unittest.TestCase):
    """Each rule's permanent address, /rules/<identity>/, and where it goes."""

    def setUp(self):
        SiteChecks.setUp(self)
        for identity in IDENTITIES.values():
            identity_page(self.site, identity)

    def problems(self, body: str, registry: dict | None = None) -> list[str]:
        (self.site / "index.html").write_text(page(body), encoding="utf-8")
        path = None
        if registry is not None:
            path = self.site.parent / f"{self.site.name}-registry.json"
            path.write_text(json.dumps({"rules": [{"id": identity, **extra} for identity, extra in registry.items()]}), encoding="utf-8")
        return cs.check(self.site, "/", path)

    RULES = rule("12.1.a") + rule("12.1.b") + picker("[12.1.a](https://example.org/rules/r0001/)", "[12.1.b](https://example.org/rules/r0002/)")

    def test_current_rules_with_their_permanent_pages_pass(self):
        self.assertEqual(self.problems(self.RULES), [])
        self.assertEqual(self.problems(self.RULES, registry={"r0001": {}, "r0002": {}}), [])

    def test_a_rule_needs_a_permanent_identity(self):
        reference = "[12.1.a](https://example.org/rules//)"
        problems = self.problems(rule("12.1.a", identity="", block_id="", reference=reference) + picker(reference))
        self.assertTrue(any("rule '12.1.a' has no permanent identity" in p for p in problems))

    def test_the_block_anchor_is_made_from_the_identity(self):
        problems = self.problems(rule("12.1.a", block_id="rule-r0009") + picker("[12.1.a](https://example.org/rules/r0001/)"))
        self.assertTrue(any("should have the anchor rule-r0001" in p for p in problems))

    def test_an_identity_cannot_be_on_two_rules(self):
        body = rule("12.1.a") + rule("12.1.b", identity="r0001") + picker("[12.1.a](https://example.org/rules/r0001/)", "[12.1.b](https://example.org/rules/r0001/)")
        self.assertTrue(any("r0001 is on more than one rule" in p for p in self.problems(body)))

    def test_every_rule_identity_needs_a_page(self):
        (self.site / "rules" / "r0002" / "index.html").unlink()
        self.assertTrue(any("r0002, which has no page" in p for p in self.problems(self.RULES)))

    def test_a_permanent_page_must_go_to_its_own_rule(self):
        identity_page(self.site, "r0001", destination="/#rule-r0002")
        self.assertTrue(any("does not go to that rule's block" in p for p in self.problems(self.RULES)))
        identity_page(self.site, "r0001", destination="/#section-12_1_a")
        self.assertTrue(any("does not go to that rule's block" in p for p in self.problems(self.RULES)))
        identity_page(self.site, "r0001", destination="/section/#rule-r0001")
        self.assertTrue(any("does not go to that rule's block" in p for p in self.problems(self.RULES)))

    def test_a_current_rules_page_needs_one_link_to_it(self):
        identity_page(self.site, "r0001", destination="")
        self.assertTrue(any("one link to its rule, found 0" in p for p in self.problems(self.RULES)))

    def test_a_retired_rule_keeps_a_page_that_goes_to_no_rule(self):
        identity_page(self.site, "r0003", status="retired", replacements=("r0001", "r0002"))
        self.assertEqual(self.problems(self.RULES, registry={"r0001": {}, "r0002": {}, "r0003": {"status": "retired"}}), [])
        identity_page(self.site, "r0003", status="retired", destination="/#rule-r0001")
        self.assertTrue(any("must not link to a rule as if it were current" in p for p in self.problems(self.RULES)))

    def test_a_retired_rule_cannot_be_on_the_page(self):
        identity_page(self.site, "r0002", status="retired")
        problems = self.problems(self.RULES)
        self.assertTrue(any("r0002 is retired, but a rule" in p for p in problems))
        self.assertTrue(any("whose page says it is retired" in p for p in problems))

    def test_replacements_go_to_permanent_pages(self):
        identity_page(self.site, "r0003", status="retired", replacements=("r0009",))
        self.assertTrue(any("does not go to another rule's permanent page" in p for p in self.problems(self.RULES)))

    def test_pages_match_the_registry(self):
        problems = self.problems(self.RULES, registry={"r0001": {}, "r0002": {"status": "retired"}, "r0003": {"status": "retired"}})
        self.assertTrue(any("r0003 has no permanent page" in p for p in problems))
        self.assertTrue(any("rules/r0002/index.html: says the rule is current, but rule-identities.json says retired" in p for p in problems))
        problems = self.problems(self.RULES, registry={"r0001": {}})
        self.assertTrue(any("r0002 is not in rule-identities.json" in p for p in problems))

    def test_the_search_index_has_each_rules_identity_and_each_has_a_page(self):
        (self.site / "section" / "index.html").write_text(page('<h2 id="part-a">Part A</h2>' + rule("12.1.a", identity="r0005")), encoding="utf-8")
        identity_page(self.site, "r0005", destination="/section/#rule-r0005")
        entry = {"page": 0, "kind": "rule", "ref": "12.1.a", "anchor": "section-12_1_a"}
        write_index(self.site, {"pages": INDEX["pages"], "entries": INDEX["entries"] + [entry]})
        self.assertTrue(any("the rule has no permanent identity" in p for p in self.problems(self.RULES)))
        write_index(self.site, {"pages": INDEX["pages"], "entries": INDEX["entries"] + [{**entry, "id": "r0005"}], "identities": [{"id": "r0077", "status": "retired", "ref": "12.1.c"}]})
        problems = self.problems(self.RULES)
        self.assertFalse(any("the rule has no permanent identity" in p for p in problems))
        self.assertTrue(any("search-index.json: r0077 has no permanent page" in p for p in problems))


class SearchIndexChecks(unittest.TestCase):
    setUp = SiteChecks.setUp
    problems = SiteChecks.problems

    def with_entry(self, entry: dict) -> list[str]:
        write_index(self.site, {"pages": INDEX["pages"], "entries": INDEX["entries"] + [entry]})
        return self.problems("")

    def test_valid_index_passes(self):
        self.assertEqual(self.problems(""), [])

    def test_index_is_required(self):
        (self.site / "search-index.json").unlink()
        self.assertTrue(any("search-index.json is missing" in p for p in self.problems("")))

    def test_destinations_must_exist(self):
        self.assertTrue(any("no such anchor" in p for p in self.with_entry({"page": 0, "kind": "rule", "ref": "1.1.a", "anchor": "section-1_1_a"})))
        write_index(self.site, {"pages": [{"url": "missing/", "title": "Missing"}], "entries": [{"page": 0, "kind": "page"}]})
        self.assertTrue(any("no such page" in p for p in self.problems("")))

    def test_page_addresses_are_relative_so_they_work_under_a_path_prefix(self):
        write_index(self.site, {"pages": [{"url": "/section/", "title": "1. Section"}], "entries": [{"page": 0, "kind": "page"}]})
        self.assertTrue(any("relative to the site root" in p for p in self.problems("")))

    def test_numbers_must_not_repeat(self):
        self.assertTrue(any("more than once" in p for p in self.with_entry({"page": 0, "kind": "heading", "ref": "1", "anchor": "part-a"})))

    def test_site_furniture_must_not_be_indexed(self):
        problems = self.with_entry({"page": 0, "kind": "text", "anchor": "part-a", "text": "Give feedback on 1.1.a"})
        self.assertTrue(any("'Give feedback on'" in p for p in problems))

class SearchFallbackChecks(unittest.TestCase):
    setUp = SiteChecks.setUp
    problems = SiteChecks.problems

    def search_page(self, body: str) -> list[str]:
        write_search_page(self.site, body)
        return self.problems("")

    def test_hidden_results_and_shown_fallback_pass(self):
        self.assertEqual(self.problems(""), [])

    def test_search_page_is_required(self):
        (self.site / "search" / "index.html").unlink()
        self.assertTrue(any("search/index.html is missing" in p for p in self.problems("")))

    def test_results_area_must_start_hidden(self):
        problems = self.search_page('<div data-search-enhanced></div>' + SEARCH_FALLBACK)
        self.assertTrue(any("results area must be hidden" in p for p in problems))

    def test_fallback_must_start_shown(self):
        problems = self.search_page(SEARCH_ENHANCED + SEARCH_FALLBACK.replace("data-search-fallback", "data-search-fallback hidden"))
        self.assertTrue(any("must be shown as built" in p for p in problems))

    def test_fallback_needs_links(self):
        problems = self.search_page(SEARCH_ENHANCED + '<div data-search-fallback><p>Search is not available.</p></div><a href="../section/">Outside</a><a href="../">Outside</a>')
        self.assertTrue(any("has no links" in p for p in problems))


class ChangeStatusChecks(unittest.TestCase):
    setUp = SiteChecks.setUp
    problems = SiteChecks.problems

    def changes(self, body: str) -> list[str]:
        (self.site / "changes" / "index.html").write_text(page(body), encoding="utf-8")
        return self.problems("")

    def test_unchanged_with_nothing_listed_passes(self):
        self.assertEqual(self.changes(UNCHANGED), [])

    def test_the_changes_page_is_required(self):
        (self.site / "changes" / "index.html").unlink()
        self.assertTrue(any("the /changes/ page is missing" in p for p in self.problems("")))

    def test_only_one_page_may_report_the_status(self):
        self.assertTrue(any("expected only /changes/" in p for p in self.problems(UNCHANGED)))

    def test_unavailable_comparison_fails(self):
        self.assertTrue(any("could not be compared" in p for p in self.changes('<div data-framework-status="unavailable"></div>')))

    def test_unchanged_must_not_list_changed_sections(self):
        body = UNCHANGED + '<a class="govuk-link app-changed-section" href="/section/">Section</a>'
        self.assertTrue(any("says the wording is unchanged but lists 1" in p for p in self.changes(body)))

    def test_unchanged_must_not_mark_a_section_as_changed(self):
        notice = '<div class="govuk-inset-text app-section-changed">This section has changed.</div>'
        (self.site / "section" / "index.html").write_text(page(notice), encoding="utf-8")
        self.assertTrue(any("section/index.html: says the section has changed" in p for p in self.problems("")))

    def test_changed_must_list_as_many_sections_as_it_says(self):
        link = '<a class="govuk-link app-changed-section" href="/section/">Section</a>'
        self.assertEqual(self.changes(f'<div data-framework-status="changed" data-changed-sections="1"></div>{link}'), [])
        problems = self.changes(f'<div data-framework-status="changed" data-changed-sections="2"></div>{link}')
        self.assertTrue(any("says 2 section(s) changed but lists 1" in p for p in problems))


if __name__ == "__main__":
    unittest.main()
