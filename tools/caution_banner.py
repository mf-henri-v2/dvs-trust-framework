#!/usr/bin/env python3
"""Check or apply the caution banner at the top of the repository's Markdown files.

The banner wording is kept in one place: tools/caution-banner.md.

In each Markdown file the banner sits between two HTML comments, which
GitHub does not display:

    <!-- caution-banner:start (...) -->
    > [!CAUTION]
    > ...
    <!-- caution-banner:end -->

The comments mark exactly which lines belong to the banner, and the tool
only ever changes those lines. If a file's structure is unexpected or
ambiguous, the tool changes nothing, says why and fails, so that a person
can look at the file. A file with a missing or malformed banner is better
than policy text deleted by mistake.

Usage:
    python tools/caution_banner.py            report problems (same as --check)
    python tools/caution_banner.py --check    report problems; exit 1 if any
    python tools/caution_banner.py --apply    update the files that can be fixed safely

To change the wording: edit tools/caution-banner.md, run with --apply,
then review and commit the resulting changes.
"""

from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

START = "<!-- caution-banner:start (wording is kept in tools/caution-banner.md; edit it there) -->"
END = "<!-- caution-banner:end -->"

# Banner wording used before the start and end comments were introduced. A
# file that opens with exactly one of these (alert line plus text line) is
# unambiguous and is upgraded to the managed form. Any other unmarked banner
# is refused.
LEGACY_BANNERS = (
    (
        "> [!CAUTION]",
        "> This repository is a workspace copy for navigation, drafting, version control and "
        "collaboration. It is not the official statement of government policy and must not be "
        "relied on as such. For the official published policy, see the [UK digital verification "
        "services trust framework 1.0 on GOV.UK](https://www.gov.uk/government/publications/"
        "uk-digital-verification-services-trust-framework-1-0/"
        "uk-digital-verification-services-trust-framework-1-0-pre-release).",
    ),
)

# Markdown that is not repository content: GitHub configuration, tooling
# and the rendered site's own source.
EXCLUDED_PREFIXES = (".github/", "tools/", "docs-site/")

ALERT = re.compile(r"^\s*>\s*\[!", re.IGNORECASE)
CAUTION_ALERT = re.compile(r"^\s*>\s*\[!\s*caution\s*\]", re.IGNORECASE)
MARKER_LIKE = re.compile(r"caution-banner\s*:", re.IGNORECASE)
HEADING = re.compile(r"^#{1,6}(\s|$)")
LOOKAHEAD_LINES = 10  # how far to look for an alert that may be a stray banner

OK, FIXABLE, REFUSED = "ok", "fixable", "refused"


class SourceError(Exception):
    """The canonical banner file is missing or malformed."""


@dataclass
class Result:
    status: str
    reason: str = ""
    new_bytes: bytes | None = None


def load_banner(path: Path) -> list[str]:
    """Read and validate the canonical banner lines."""
    if not path.is_file():
        raise SourceError(f"{path} not found")
    raw = path.read_bytes()
    if raw.startswith(b"\xef\xbb\xbf"):
        raise SourceError(f"{path} starts with a byte order mark")
    lines = raw.decode("utf-8").replace("\r\n", "\n").rstrip("\n").split("\n")
    if lines[0] != "> [!CAUTION]":
        raise SourceError(f"{path} must start with the line '> [!CAUTION]'")
    if len(lines) < 2:
        raise SourceError(f"{path} must contain wording after the '> [!CAUTION]' line")
    for n, line in enumerate(lines, 1):
        if not (line.startswith("> ") or line == ">"):
            raise SourceError(f"{path} line {n}: every line must be part of the quote (start with '>')")
        if MARKER_LIKE.search(line):
            raise SourceError(f"{path} line {n}: must not contain banner markers")
    return lines



def _outside_code_fences(lines: list[str]) -> list[bool]:
    """For each line, whether it is outside a fenced code block (``` or ~~~)."""
    flags, fence = [], None
    for line in lines:
        stripped = line.lstrip()
        marker = stripped[:3] if stripped[:3] in ("```", "~~~") else None
        if fence is None and marker:
            fence = marker
            flags.append(False)
        elif fence is not None:
            flags.append(False)
            if stripped.startswith(fence):
                fence = None
        else:
            flags.append(True)
    return flags

def classify(raw: bytes, banner: list[str]) -> Result:
    """Decide what, if anything, can safely be done to one file's content."""
    if raw.startswith(b"\xef\xbb\xbf"):
        return Result(REFUSED, "file starts with a byte order mark (BOM); remove it and run again")
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        return Result(REFUSED, "file is not valid UTF-8")

    crlf = text.count("\r\n")
    if crlf and text.count("\n") != crlf:
        return Result(REFUSED, "file mixes CRLF and LF line endings")
    nl = "\r\n" if crlf else "\n"
    managed = [START, *banner, END]

    def encode(lines: list[str], trailing_newline: bool) -> bytes:
        return (nl.join(lines) + (nl if trailing_newline else "")).encode("utf-8")

    if text == "":
        return Result(FIXABLE, "file is empty; the banner will be added", encode(managed, True))

    ends_with_newline = text.endswith(nl)
    lines = (text[: -len(nl)] if ends_with_newline else text).split(nl)

    starts = [i for i, line in enumerate(lines) if line == START]
    ends = [i for i, line in enumerate(lines) if line == END]
    stray = [i for i, line in enumerate(lines) if MARKER_LIKE.search(line) and i not in starts and i not in ends]
    if stray:
        return Result(REFUSED, f"line {stray[0] + 1} looks like a banner marker but does not match it exactly")

    if starts or ends:
        # Managed form: the markers prove where the banner begins and ends.
        if len(starts) != 1 or len(ends) != 1:
            return Result(REFUSED, "the banner start or end marker is missing or appears more than once")
        start, end = starts[0], ends[0]
        if start != 0:
            return Result(REFUSED, f"the banner start marker is on line {start + 1}, not line 1")
        if end <= start + 1:
            return Result(REFUSED, "the banner end marker is not below the start marker, or the banner is empty")
        if not all(line.startswith(">") for line in lines[start + 1 : end]):
            return Result(REFUSED, "a line between the banner markers is not part of the banner quote")
        rest = lines[end + 1 :]
        reason = "banner wording differs from tools/caution-banner.md"
    else:
        first = lines[0]
        legacy = next((b for b in LEGACY_BANNERS if lines[: len(b)] == list(b)), None)
        if legacy:
            rest = lines[len(legacy) :]
            if rest and rest[0] != "" and not HEADING.match(rest[0]):
                return Result(
                    REFUSED,
                    "the banner is followed directly by another line, so it is unclear where the "
                    "banner ends; add a blank line after it and run again",
                )
            reason = "banner uses earlier wording and has no markers"
        elif first.strip() == "":
            return Result(REFUSED, "file starts with a blank line; remove it so the banner position is clear")
        elif first.startswith("---"):
            return Result(REFUSED, "file starts with front matter or a horizontal rule; add the banner manually")
        elif first.lstrip().startswith(">"):
            return Result(
                REFUSED,
                "file starts with a quote that is not a recognised banner (it may be a damaged "
                "banner or a quoted passage); fix or add the banner manually",
            )
        elif first.lstrip().startswith("<!--"):
            return Result(REFUSED, "file starts with an HTML comment that is not a banner marker")
        else:
            prose = _outside_code_fences(lines)
            nearby = next(
                (i for i, line in enumerate(lines[:LOOKAHEAD_LINES]) if prose[i] and ALERT.match(line)), None
            )
            if nearby is not None:
                return Result(
                    REFUSED,
                    f"there is no banner at the top, but an alert appears on line {nearby + 1}; "
                    "check whether it is a misplaced banner",
                )
            rest = lines
            reason = "file has no banner"

    following = [line for line in rest if line.strip() != ""]
    if following and ALERT.match(following[0]):
        return Result(REFUSED, "another alert follows the banner; it may be a duplicate")
    offset = len(lines) - len(rest)
    rest_prose = _outside_code_fences(rest)
    second = next((i for i, line in enumerate(rest) if rest_prose[i] and CAUTION_ALERT.match(line)), None)
    if second is not None:
        return Result(REFUSED, f"a second caution alert appears on line {offset + second + 1}; it may be a duplicate banner")

    if rest and rest[0] != "":
        rest = ["", *rest]  # separate the banner from the content; nothing is removed
    new_bytes = encode([*managed, *rest], ends_with_newline or not rest)
    if new_bytes == raw:
        return Result(OK)
    return Result(FIXABLE, reason, new_bytes)


def markdown_files(root: Path) -> list[Path]:
    """Markdown files in scope: tracked, or untracked and not ignored, minus exclusions."""
    try:
        out = subprocess.run(
            ["git", "-C", str(root), "ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", "*.md"],
            check=True,
            capture_output=True,
        ).stdout.decode("utf-8")
        rels = sorted({p for p in out.split("\0") if p})
    except (OSError, subprocess.CalledProcessError):
        rels = sorted(
            p.relative_to(root).as_posix()
            for p in root.rglob("*.md")
            if ".git" not in p.parts and "node_modules" not in p.parts
        )
    return [root / r for r in rels if not r.startswith(EXCLUDED_PREFIXES) and (root / r).is_file()]


def report(rel: str, message: str) -> None:
    if os.environ.get("GITHUB_ACTIONS") == "true":
        print(f"::error file={rel}::{message}")
    else:
        print(f"ERROR: {rel}: {message}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Check or apply the repository caution banner.")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--check", action="store_true", help="report problems without changing files (default)")
    mode.add_argument("--apply", action="store_true", help="update the files that can be fixed safely")
    parser.add_argument("--root", type=Path, default=REPO_ROOT, help=argparse.SUPPRESS)
    args = parser.parse_args(argv)

    root = args.root.resolve()
    try:
        banner = load_banner(root / "tools" / "caution-banner.md")
    except SourceError as err:
        print(f"ERROR: {err}")
        return 2

    files = markdown_files(root)
    fixable = refused = changed = 0
    for path in files:
        rel = path.relative_to(root).as_posix()
        result = classify(path.read_bytes(), banner)
        if result.status == OK:
            continue
        if result.status == REFUSED:
            refused += 1
            report(rel, f"not changed: {result.reason}")
        elif args.apply:
            path.write_bytes(result.new_bytes)
            changed += 1
            print(f"updated: {rel} ({result.reason})")
        else:
            fixable += 1
            report(rel, f"{result.reason}; run 'python tools/caution_banner.py --apply'")

    if args.apply:
        print(f"\n{len(files)} files checked, {changed} updated, {refused} need a manual fix.")
        return 1 if refused else 0
    if fixable or refused:
        print(f"\n{len(files)} files checked: {fixable} can be fixed with --apply, {refused} need a manual fix.")
        return 1
    print(f"{len(files)} files checked: each starts with the caution banner from tools/caution-banner.md.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
