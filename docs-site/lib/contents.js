// The "On this page" list for a page rendered from Markdown.
//
// It lists the page's subsections (<h2>) and, under each, the headings one
// level below (<h3>), so a reader can go straight to a part of a long
// section, such as 12.4.1 in section 12. It goes no deeper, and never lists
// rules. Headings inside example boxes (blockquotes) are left out: they
// belong to the example, not to the structure of the section.
//
// Each link uses the heading's own id, so nothing about the page's anchors
// changes.

const plainText = (html) =>
  html
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

/** The page's <h2> and <h3> headings, as [{ id, text, children: [{ id, text }] }]. */
export function pageContents(html) {
  const contents = [];
  let quoted = 0;
  for (const match of String(html).matchAll(/<blockquote\b|<\/blockquote>|<h([23])\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/h\1>/g)) {
    if (match[0].startsWith("<blockquote")) {
      quoted++;
      continue;
    }
    if (match[0] === "</blockquote>") {
      quoted--;
      continue;
    }
    if (quoted) continue;
    const [, level, id, text] = match;
    const heading = { id, text: plainText(text) };
    if (level === "2") contents.push({ ...heading, children: [] });
    // An <h3> before any <h2> has no subsection to go under, so it is listed on its own.
    else if (contents.length) contents.at(-1).children.push(heading);
    else contents.push({ ...heading, children: [] });
  }
  return contents;
}

/** How many links a contents list has. */
export const contentsLength = (contents) => contents.reduce((count, item) => count + 1 + item.children.length, 0);
