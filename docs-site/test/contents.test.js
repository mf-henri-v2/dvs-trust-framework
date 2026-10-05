// Tests for the "On this page" list (lib/contents.js). Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { markdownLibrary, stripRepositoryFurniture } from "../lib/markdown.js";
import { pageContents, contentsLength } from "../lib/contents.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const renderSection = (repoPath) =>
  markdownLibrary.render(stripRepositoryFurniture(fs.readFileSync(path.join(REPO_ROOT, repoPath), "utf-8")), { page: { inputPath: `../${repoPath}` } });

test("lists subsections with the headings under each, using the headings' own ids", () => {
  const html = [
    '<h2 id="a" class="govuk-heading-l">12.1. First</h2>',
    '<h3 id="a-1" class="govuk-heading-m">12.1.1. <em>Under</em> first &amp; more</h3>',
    '<h2 id="b">12.2. Second</h2>',
  ].join("\n");
  assert.deepEqual(pageContents(html), [
    { id: "a", text: "12.1. First", children: [{ id: "a-1", text: "12.1.1. Under first & more" }] },
    { id: "b", text: "12.2. Second", children: [] },
  ]);
  assert.equal(contentsLength(pageContents(html)), 3);
});

test("leaves out headings in example boxes and headings below <h3>", () => {
  const html = '<h2 id="a">A</h2><blockquote class="govuk-inset-text"><h3 id="example">Illustrative example 1</h3></blockquote><h4 id="deep">Deep</h4><h3 id="a-1">A.1</h3>';
  assert.deepEqual(pageContents(html), [{ id: "a", text: "A", children: [{ id: "a-1", text: "A.1" }] }]);
});

test("section 12: every subsection, with 12.4.1 under 12.4, and no rules", () => {
  const html = renderSection("trust-framework-1.0/part-3/12-service-requirements.md");
  const contents = pageContents(html);
  const fraud = contents.find((item) => item.text === "12.4. Fraud management");
  assert.ok(fraud, "12.4 is listed");
  assert.equal(fraud.children[0].text, "12.4.1. Fraud monitoring");
  assert.ok(contents.every((item) => /^12\.\d+\.? /.test(item.text)), "only numbered subsections at the top level");
  assert.ok(contents.flatMap((item) => item.children).every((child) => /^12\.\d+\.\d+\.? /.test(child.text)), "only their headings below");
  // Every link goes to an id on the page.
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
  for (const item of [...contents, ...contents.flatMap((each) => each.children)]) assert.ok(ids.has(item.id), item.id);
});

test("section 2, with only two subsections but headings under them, gets a list", () => {
  const contents = pageContents(renderSection("trust-framework-1.0/part-1/02-feedback-received-and-updates.md"));
  assert.ok(contentsLength(contents) >= 3);
});
