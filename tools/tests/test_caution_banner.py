"""Tests for tools/caution_banner.py.

Run from the repository root:
    python -m unittest discover -s tools/tests -v
"""

from __future__ import annotations

import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

TOOLS = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(TOOLS))

import caution_banner as cb  # noqa: E402

BANNER = ["> [!CAUTION]", "> Test banner wording."]
MANAGED = [cb.START, *BANNER, cb.END]
LEGACY = list(cb.LEGACY_BANNERS[0])
POLICY_QUOTE = "> 12.4.1.c. A quoted passage of policy text that must never be removed."


def doc(*lines: str, nl: str = "\n", trailing: bool = True) -> bytes:
    return (nl.join(lines) + (nl if trailing else "")).encode("utf-8")


def classify(raw: bytes) -> cb.Result:
    return cb.classify(raw, BANNER)


class BannerTestCase(unittest.TestCase):
    def assertRefused(self, raw: bytes, reason_fragment: str) -> None:
        result = classify(raw)
        self.assertEqual(result.status, cb.REFUSED, f"expected refusal, got {result.status}")
        self.assertIsNone(result.new_bytes, "a refused file must never be given new content")
        self.assertIn(reason_fragment, result.reason)

    def assertFixedTo(self, raw: bytes, expected: bytes) -> None:
        result = classify(raw)
        self.assertEqual(result.status, cb.FIXABLE, f"expected fixable, got {result.status}: {result.reason}")
        self.assertEqual(result.new_bytes, expected)
        # Convergence: the fixed file passes the check, and applying again changes nothing.
        again = classify(result.new_bytes)
        self.assertEqual(again.status, cb.OK, f"fixed output does not pass the check: {again.reason}")


class CorrectFiles(BannerTestCase):
    def test_managed_banner_with_content_is_ok(self):
        self.assertEqual(classify(doc(*MANAGED, "", "# Heading", "Body.")).status, cb.OK)

    def test_separate_blockquote_after_blank_line_is_ok_and_untouched(self):
        self.assertEqual(classify(doc(*MANAGED, "", POLICY_QUOTE, "", "Body.")).status, cb.OK)

    def test_crlf_managed_file_is_ok(self):
        self.assertEqual(classify(doc(*MANAGED, "", "# Heading", nl="\r\n")).status, cb.OK)

    def test_banner_only_file_is_ok(self):
        self.assertEqual(classify(doc(*MANAGED)).status, cb.OK)

    def test_banner_shown_inside_a_code_fence_is_not_a_duplicate(self):
        raw = doc(*MANAGED, "", "# Example", "", "```", "> [!CAUTION]", "> Example.", "```")
        self.assertEqual(classify(raw).status, cb.OK)


class SafeFixes(BannerTestCase):
    def test_hand_edited_wording_between_markers_is_replaced(self):
        raw = doc(cb.START, "> [!CAUTION]", "> Someone edited this by hand.", cb.END, "", "# Heading")
        self.assertFixedTo(raw, doc(*MANAGED, "", "# Heading"))

    def test_wrapped_wording_between_markers_is_replaced(self):
        raw = doc(cb.START, "> [!CAUTION]", "> First half of the wording,", "> second half.", cb.END, "", "# Heading")
        self.assertFixedTo(raw, doc(*MANAGED, "", "# Heading"))

    def test_blockquote_directly_under_end_marker_is_kept_and_separated(self):
        raw = doc(*MANAGED, POLICY_QUOTE, "", "Body.")
        self.assertFixedTo(raw, doc(*MANAGED, "", POLICY_QUOTE, "", "Body."))

    def test_missing_blank_line_after_managed_banner_is_added(self):
        self.assertFixedTo(doc(*MANAGED, "# Heading"), doc(*MANAGED, "", "# Heading"))

    def test_legacy_banner_is_upgraded(self):
        raw = doc(*LEGACY, "", "# Heading", "Body.")
        self.assertFixedTo(raw, doc(*MANAGED, "", "# Heading", "Body."))

    def test_legacy_banner_directly_followed_by_heading_is_upgraded(self):
        self.assertFixedTo(doc(*LEGACY, "# Heading"), doc(*MANAGED, "", "# Heading"))

    def test_legacy_banner_then_separate_blockquote_keeps_the_quote(self):
        raw = doc(*LEGACY, "", POLICY_QUOTE, "", "Body.")
        self.assertFixedTo(raw, doc(*MANAGED, "", POLICY_QUOTE, "", "Body."))

    def test_legacy_banner_only_file_is_upgraded(self):
        self.assertFixedTo(doc(*LEGACY), doc(*MANAGED))

    def test_file_without_banner_gets_one_prepended(self):
        self.assertFixedTo(doc("# Heading", "Body."), doc(*MANAGED, "", "# Heading", "Body."))

    def test_crlf_line_endings_are_preserved(self):
        raw = doc(*LEGACY, "", "# Heading", nl="\r\n")
        self.assertFixedTo(raw, doc(*MANAGED, "", "# Heading", nl="\r\n"))

    def test_crlf_file_without_banner(self):
        self.assertFixedTo(doc("# Heading", nl="\r\n"), doc(*MANAGED, "", "# Heading", nl="\r\n"))

    def test_missing_final_newline_is_preserved_when_there_is_content(self):
        raw = doc(*LEGACY, "", "# Heading", trailing=False)
        self.assertFixedTo(raw, doc(*MANAGED, "", "# Heading", trailing=False))

    def test_banner_only_file_without_final_newline_gains_one(self):
        self.assertFixedTo(doc(*MANAGED, trailing=False), doc(*MANAGED))

    def test_empty_file_gets_the_banner(self):
        self.assertFixedTo(b"", doc(*MANAGED))


class Refusals(BannerTestCase):
    def test_hand_edited_wording_without_markers(self):
        self.assertRefused(doc("> [!CAUTION]", "> Hand-edited wording.", "", "# Heading"), "not a recognised banner")

    def test_wrapped_wording_without_markers(self):
        self.assertRefused(doc("> [!CAUTION]", "> First half,", "> second half.", "", "# Heading"),
                           "not a recognised banner")

    def test_blockquote_directly_under_legacy_banner(self):
        self.assertRefused(doc(*LEGACY, POLICY_QUOTE, "", "Body."), "unclear where the banner ends")

    def test_text_directly_under_legacy_banner(self):
        self.assertRefused(doc(*LEGACY, "A paragraph with no blank line before it."), "unclear where the banner ends")

    def test_malformed_marker_case(self):
        self.assertRefused(doc("> [!Caution]", BANNER[1], "", "# Heading"), "not a recognised banner")

    def test_malformed_marker_spacing(self):
        self.assertRefused(doc(">[!CAUTION]", BANNER[1], "", "# Heading"), "not a recognised banner")

    def test_wrong_alert_type(self):
        self.assertRefused(doc("> [!WARNING]", BANNER[1], "", "# Heading"), "not a recognised banner")

    def test_byte_order_mark(self):
        self.assertRefused(b"\xef\xbb\xbf" + doc(*MANAGED, "", "# Heading"), "byte order mark")

    def test_front_matter(self):
        self.assertRefused(doc("---", "title: Example", "---", *MANAGED, "", "# Heading"), "banner start marker is on line 4")
        self.assertRefused(doc("---", "title: Example", "---", "", "# Heading"), "front matter")

    def test_no_banner_and_file_starts_with_policy_quote(self):
        self.assertRefused(doc(POLICY_QUOTE, "", "Body."), "not a recognised banner")

    def test_blank_first_line(self):
        self.assertRefused(doc("", *LEGACY, "", "# Heading"), "starts with a blank line")

    def test_mixed_line_endings(self):
        self.assertRefused(b"# Heading\r\nBody.\nMore.\n", "mixes CRLF and LF")

    def test_invalid_utf8(self):
        self.assertRefused(b"# Heading\n\xff\xfe\n", "not valid UTF-8")

    def test_start_marker_twice(self):
        self.assertRefused(doc(*MANAGED, "", *MANAGED, "", "# Heading"), "more than once")

    def test_end_marker_missing(self):
        self.assertRefused(doc(cb.START, *BANNER, "", "# Heading"), "missing or appears more than once")

    def test_start_marker_not_on_first_line(self):
        self.assertRefused(doc("# Heading", "", *MANAGED), "not line 1")

    def test_near_miss_marker(self):
        self.assertRefused(doc("<!-- caution-banner:strat -->", *BANNER, cb.END, "", "# Heading"),
                           "looks like a banner marker")

    def test_non_quote_line_inside_markers(self):
        self.assertRefused(doc(cb.START, *BANNER, "Policy text inside the markers.", cb.END, "", "# Heading"),
                           "not part of the banner quote")

    def test_other_alert_directly_after_banner(self):
        self.assertRefused(doc(*MANAGED, "", "> [!NOTE]", "> Something.", "", "# Heading"), "may be a duplicate")

    def test_second_caution_alert_further_down(self):
        self.assertRefused(doc(*MANAGED, "", "# Heading", "", "> [!caution]", "> Old banner.", "", "Body."),
                           "second caution alert")

    def test_legacy_banner_followed_by_duplicate(self):
        self.assertRefused(doc(*LEGACY, "", *LEGACY, "", "# Heading"), "may be a duplicate")

    def test_alert_near_top_of_file_without_banner(self):
        self.assertRefused(doc("# Heading", "", "> [!CAUTION]", "> Misplaced banner.", "", "Body."),
                           "misplaced banner")

    def test_file_starting_with_html_comment(self):
        self.assertRefused(doc("<!-- a note -->", "# Heading"), "HTML comment")


class Idempotence(unittest.TestCase):
    FIXABLE_INPUTS = [
        doc(*LEGACY, "", "# Heading", "Body."),
        doc(*LEGACY, "", POLICY_QUOTE, "", "Body."),
        doc("# Heading", "Body."),
        doc(*MANAGED, POLICY_QUOTE),
        doc(cb.START, "> [!CAUTION]", "> Old.", "> Wrapped.", cb.END, "# Heading", nl="\r\n"),
        b"",
    ]

    def test_applying_twice_gives_the_same_result_as_once(self):
        for raw in self.FIXABLE_INPUTS:
            with self.subTest(raw=raw[:40]):
                once = classify(raw).new_bytes
                self.assertIsNotNone(once)
                self.assertEqual(classify(once).status, cb.OK)

    def test_no_non_banner_line_is_ever_removed(self):
        banner_lines = set(MANAGED) | set(LEGACY) | {"> Old.", "> Wrapped."}
        for raw in self.FIXABLE_INPUTS:
            with self.subTest(raw=raw[:40]):
                before = [l for l in raw.decode().replace("\r\n", "\n").split("\n") if l and l not in banner_lines]
                after = [l for l in classify(raw).new_bytes.decode().replace("\r\n", "\n").split("\n")
                         if l and l not in banner_lines]
                self.assertEqual(before, after)


class CanonicalSource(unittest.TestCase):
    def write(self, text: str) -> Path:
        tmp = Path(tempfile.mkdtemp()) / "banner.md"
        tmp.write_text(text, encoding="utf-8")
        return tmp

    def test_repository_banner_source_is_valid(self):
        lines = cb.load_banner(TOOLS / "caution-banner.md")
        self.assertEqual(lines[0], "> [!CAUTION]")

    def test_source_must_start_with_caution_alert(self):
        with self.assertRaises(cb.SourceError):
            cb.load_banner(self.write("> [!NOTE]\n> Text.\n"))

    def test_source_must_not_contain_blank_lines(self):
        with self.assertRaises(cb.SourceError):
            cb.load_banner(self.write("> [!CAUTION]\n\n> Text.\n"))

    def test_source_must_have_wording(self):
        with self.assertRaises(cb.SourceError):
            cb.load_banner(self.write("> [!CAUTION]\n"))


class CommandLine(unittest.TestCase):
    """Run the tool as a script against a temporary repository layout."""

    def setUp(self):
        self.root = Path(tempfile.mkdtemp())
        (self.root / "tools").mkdir()
        (self.root / "tools" / "caution-banner.md").write_text("\n".join(BANNER) + "\n", encoding="utf-8")
        (self.root / ".github").mkdir()
        (self.root / ".github" / "PULL_REQUEST_TEMPLATE.md").write_text("# No banner here\n", encoding="utf-8")
        (self.root / "docs-site").mkdir()
        (self.root / "docs-site" / "README.md").write_text("# Site notes\n", encoding="utf-8")
        (self.root / "good.md").write_bytes(doc(*MANAGED, "", "# Good"))
        (self.root / "legacy.md").write_bytes(doc(*LEGACY, "", "# Legacy"))
        self.refused = doc(*LEGACY, POLICY_QUOTE)
        (self.root / "refused.md").write_bytes(self.refused)

    def run_tool(self, *args: str) -> subprocess.CompletedProcess:
        return subprocess.run(
            [sys.executable, str(TOOLS / "caution_banner.py"), "--root", str(self.root), *args],
            capture_output=True, text=True,
        )

    def test_check_reports_problems_and_changes_nothing(self):
        before = {p.name: p.read_bytes() for p in self.root.glob("*.md")}
        proc = self.run_tool("--check")
        self.assertEqual(proc.returncode, 1)
        self.assertIn("legacy.md", proc.stdout)
        self.assertIn("refused.md", proc.stdout)
        self.assertNotIn("PULL_REQUEST_TEMPLATE", proc.stdout)
        self.assertNotIn("docs-site", proc.stdout)
        self.assertEqual(before, {p.name: p.read_bytes() for p in self.root.glob("*.md")})

    def test_apply_fixes_what_it_safely_can_and_fails_on_the_rest(self):
        proc = self.run_tool("--apply")
        self.assertEqual(proc.returncode, 1, proc.stdout)
        self.assertEqual((self.root / "legacy.md").read_bytes(), doc(*MANAGED, "", "# Legacy"))
        self.assertEqual((self.root / "refused.md").read_bytes(), self.refused)
        self.assertEqual((self.root / ".github" / "PULL_REQUEST_TEMPLATE.md").read_text(), "# No banner here\n")

    def test_clean_repository_passes(self):
        (self.root / "refused.md").unlink()
        self.assertEqual(self.run_tool("--apply").returncode, 0)
        proc = self.run_tool("--check")
        self.assertEqual(proc.returncode, 0, proc.stdout)
        self.assertIn("2 files checked", proc.stdout)

    def test_invalid_source_is_a_usage_error(self):
        (self.root / "tools" / "caution-banner.md").write_text("Not a banner\n", encoding="utf-8")
        self.assertEqual(self.run_tool("--check").returncode, 2)


if __name__ == "__main__":
    unittest.main()
