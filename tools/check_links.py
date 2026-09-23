#!/usr/bin/env python3
"""Check internal links and anchors in the repository's Markdown files.

For every relative link in a Markdown file, this checks that:

- the file or folder it points to exists in the repository, and
- any #anchor it points to exists in the target file, either as an HTML
  anchor (<a id="...">) or as a heading, using GitHub's heading IDs.

It also checks that the section list in each issue form matches the
contents page, trust-framework-1.0/README.md.

External links (http, https, mailto) are not checked. They depend on other
websites and are not fixed by changing this repository.

Usage:
    python tools/check_links.py
"""

from __future__ import annotations

import os
import re
import subprocess
import sys
from pathlib import Path
from urllib.parse import unquote

REPO_ROOT = Path(__file__).resolve().parent.parent
CONTENTS = "trust-framework-1.0/README.md"
ISSUE_FORMS = ".github/ISSUE_TEMPLATE"
NO_SECTION = "Not about a specific section"

LINK = re.compile(r"(?<!\\)!?\[(?:[^\]\\]|\\.)*\]\(\s*<?([^)\s>]+)>?(?:\s+\"[^\"]*\")?\s*\)")
HTML_ID = re.compile(r"""<a\s[^>]*\b(?:id|name)\s*=\s*["']([^"']+)["']""", re.IGNORECASE)
HEADING = re.compile(r"^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$")
FENCE = re.compile(r"^\s*(```|~~~)")
INLINE_CODE = re.compile(r"`[^`\n]*`")


def github_slug(heading: str) -> str:
    """The ID GitHub gives a heading: lower case, punctuation removed, spaces as hyphens."""
    text = re.sub(r"<[^>]+>", "", heading)
    text = re.sub(r"!?\[([^\]]*)\]\([^)]*\)", r"\1", text)
    text = text.strip().lower()
    text = re.sub(r"[^\w\- ]", "", text)
    return text.replace(" ", "-")


def prose_lines(text: str) -> list[str]:
    """The file's lines with fenced code blocks and inline code blanked out."""
    out, fence = [], None
    for line in text.splitlines():
        match = FENCE.match(line)
        if fence is None and match:
            fence = match.group(1)
            out.append("")
        elif fence is not None:
            if line.lstrip().startswith(fence):
                fence = None
            out.append("")
        else:
            out.append(INLINE_CODE.sub("", line))
    return out


def anchors_in(text: str) -> set[str]:
    ids: set[str] = set()
    seen: dict[str, int] = {}
    for line in prose_lines(text):
        ids.update(HTML_ID.findall(line))
        match = HEADING.match(line)
        if match:
            slug = github_slug(match.group(2))
            count = seen.get(slug, 0)
            seen[slug] = count + 1
            ids.add(slug if count == 0 else f"{slug}-{count}")
    return ids


def tracked_files(root: Path, pattern: str) -> list[str]:
    try:
        out = subprocess.run(
            ["git", "-C", str(root), "ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", pattern],
            check=True,
            capture_output=True,
        ).stdout.decode("utf-8")
        return sorted(p for p in out.split("\0") if p and (root / p).exists())
    except (OSError, subprocess.CalledProcessError):
        suffix = pattern.lstrip("*")
        return sorted(
            p.relative_to(root).as_posix()
            for p in root.rglob(f"*{suffix}")
            if ".git" not in p.parts and "node_modules" not in p.parts
        )


def check_links(root: Path) -> list[tuple[str, int, str]]:
    problems = []
    anchor_cache: dict[Path, set[str]] = {}
    for rel in tracked_files(root, "*.md"):
        if rel.startswith("docs-site/node_modules/"):
            continue
        source = root / rel
        for n, line in enumerate(prose_lines(source.read_text(encoding="utf-8")), 1):
            for target in LINK.findall(line):
                if re.match(r"^[a-z][a-z0-9+.-]*:", target, re.IGNORECASE):
                    continue  # external: http:, https:, mailto: and so on
                path_part, _, fragment = target.partition("#")
                path_part, fragment = unquote(path_part), unquote(fragment)
                dest = (source.parent / path_part).resolve() if path_part else source.resolve()
                try:
                    dest.relative_to(root)
                except ValueError:
                    problems.append((rel, n, f"link leaves the repository: {target}"))
                    continue
                if not dest.exists():
                    problems.append((rel, n, f"target does not exist: {target}"))
                    continue
                if fragment and dest.is_file() and dest.suffix == ".md":
                    if dest not in anchor_cache:
                        anchor_cache[dest] = anchors_in(dest.read_text(encoding="utf-8"))
                    if fragment not in anchor_cache[dest]:
                        problems.append((rel, n, f"anchor not found: {target}"))
    return problems


def check_issue_form_sections(root: Path) -> list[tuple[str, int, str]]:
    contents = (root / CONTENTS).read_text(encoding="utf-8")
    expected = re.findall(r"^- \[(\d+\. [^\]]+)\]\(", contents, re.MULTILINE) + [NO_SECTION]
    problems = []
    for form in sorted((root / ISSUE_FORMS).glob("*.yml")):
        text = form.read_text(encoding="utf-8")
        block = re.search(r"^\s+id: section\s*$(.*?)^\s+validations:", text, re.MULTILINE | re.DOTALL)
        if not block:
            continue
        options = re.findall(r'^\s+- "(.*)"\s*$', block.group(1), re.MULTILINE)
        if options != expected:
            rel = form.relative_to(root).as_posix()
            problems.append((rel, 1, f"section list does not match the contents page ({CONTENTS})"))
    return problems


def main() -> int:
    root = REPO_ROOT
    problems = check_links(root) + check_issue_form_sections(root)
    for rel, line, message in problems:
        if os.environ.get("GITHUB_ACTIONS") == "true":
            print(f"::error file={rel},line={line}::{message}")
        else:
            print(f"ERROR: {rel}:{line}: {message}")
    if problems:
        print(f"\n{len(problems)} problem(s) found.")
        return 1
    print("All internal links and anchors resolve, and the issue forms list every section.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
