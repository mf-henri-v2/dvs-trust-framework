// Tests for what "Copy link" and "Copy reference" copy (assets/rule-links.js),
// and for the rule blocks they read it from. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { markdownLibrary, stripRepositoryFurniture, ruleAnchor } from "../lib/markdown.js";
import { ruleLink, ruleReference } from "../assets/rule-links.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SECTION_12 = "trust-framework-1.0/part-3/12-service-requirements/";

test("the link is the page being read, at the rule's own anchor, wherever the site is published", () => {
  assert.equal(ruleLink(`http://localhost:8080/${SECTION_12}`, "section-12_4_1_c"), `http://localhost:8080/${SECTION_12}#section-12_4_1_c`);
  assert.equal(
    ruleLink(`https://ofdia-uk.github.io/dvs-trust-framework/${SECTION_12}#section-12_4`, "section-12_4_1_c"),
    `https://ofdia-uk.github.io/dvs-trust-framework/${SECTION_12}#section-12_4_1_c`,
  );
  // A query, such as one added when the page was shared, is not copied.
  assert.equal(ruleLink(`https://example.org/site/${SECTION_12}?from=email`, "section-12_4_1_c"), `https://example.org/site/${SECTION_12}#section-12_4_1_c`);
});

test("the reference is the rule's number", () => {
  assert.equal(ruleReference("12.4.1.c"), "Rule 12.4.1.c");
  assert.equal(ruleReference("4.1.b"), "Rule 4.1.b");
});

/** The rule blocks in a rendered section: [{ rule, anchors, html }]. */
function ruleBlocks(repoPath) {
  const html = markdownLibrary.render(stripRepositoryFurniture(fs.readFileSync(path.join(REPO_ROOT, repoPath), "utf-8")), { page: { inputPath: `../${repoPath}` } });
  const blocks = [];
  for (const match of html.matchAll(/<div class="app-rule-block" data-rule="([^"]+)"/g)) {
    // A block ends at its matching </div>; tables are wrapped in divs too.
    let depth = 0;
    let end = match.index;
    for (const tag of html.slice(match.index).matchAll(/<(\/?)div\b/g)) {
      depth += tag[1] ? -1 : 1;
      if (!depth) {
        end = match.index + tag.index;
        break;
      }
    }
    const blockHtml = html.slice(match.index, end);
    blocks.push({ rule: match[1], anchors: [...blockHtml.matchAll(/<p id="([^"]+)" class="app-rule /g)].map((m) => m[1]), html: blockHtml });
  }
  return blocks;
}

test("each copy names its own rule: one rule per block, even where a table or figures belong to it", () => {
  const cases = [
    ["trust-framework-1.0/part-1/04-how-organisations-participate-in-the-trust-framework.md", "4.1.b", /<table/, "4.1.c"],
    ["trust-framework-1.0/part-1/04-how-organisations-participate-in-the-trust-framework.md", "4.3.c", /Figure 3/, "4.4.a"],
    ["trust-framework-1.0/part-3/12-service-requirements.md", "12.9.b", /Figure 4/, "12.9.c"],
    ["trust-framework-1.0/part-3/12-service-requirements.md", "12.4.1.c", /evidence failures/, "12.4.1.d"],
  ];
  for (const [repoPath, rule, belongs, next] of cases) {
    const block = ruleBlocks(repoPath).find((each) => each.rule === rule);
    assert.deepEqual(block.anchors, [ruleAnchor(rule)], `${rule}: one rule, at its own anchor`);
    assert.match(block.html, belongs, `${rule}: includes what belongs to it`);
    assert.doesNotMatch(block.html, new RegExp(`id="${ruleAnchor(next)}"`), `${rule}: does not include ${next}`);
  }
});
