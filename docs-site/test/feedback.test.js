// Tests for lib/feedback.js. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { feedbackUrl } from "../lib/feedback.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const REPOSITORY_URL = "https://github.com/ofdia-uk/dvs-trust-framework";
const SITE_URL = "https://ofdia-uk.github.io/dvs-trust-framework/";

const fieldsOf = (url) => Object.fromEntries(new URL(url).searchParams);

test("opens the template chooser with the page title and address filled in", () => {
  const url = feedbackUrl({
    repositoryUrl: REPOSITORY_URL,
    siteUrl: SITE_URL,
    pageUrl: "/trust-framework-1.0/part-3/12-service-requirements/",
    title: "12. Service requirements",
  });
  assert.ok(url.startsWith(`${REPOSITORY_URL}/issues/new/choose?`));
  assert.doesNotMatch(url, /\+/, "spaces are written as %20");
  assert.deepEqual(fieldsOf(url), {
    page: "12. Service requirements (https://ofdia-uk.github.io/dvs-trust-framework/trust-framework-1.0/part-3/12-service-requirements/)",
  });
});

test("works for contents and part pages too", () => {
  const url = feedbackUrl({
    repositoryUrl: REPOSITORY_URL,
    siteUrl: SITE_URL,
    pageUrl: "/trust-framework-1.0/part-3/",
    title: "Part 3: Rules for all service providers",
  });
  assert.deepEqual(fieldsOf(url), {
    page: "Part 3: Rules for all service providers (https://ofdia-uk.github.io/dvs-trust-framework/trust-framework-1.0/part-3/)",
  });
});

test("the page address follows the site address, for example a fork's GitHub Pages site", () => {
  const url = feedbackUrl({
    repositoryUrl: REPOSITORY_URL,
    siteUrl: "https://example.github.io/dvs-trust-framework/",
    pageUrl: "/trust-framework-1.0/part-1/01-introduction/",
    title: "1. Introduction",
  });
  assert.match(fieldsOf(url).page, /\(https:\/\/example\.github\.io\/dvs-trust-framework\/trust-framework-1\.0\/part-1\/01-introduction\/\)$/);
});

// The chooser passes the value on to whichever form the reader picks, so
// every form needs the field.
test("every issue form has the field the link fills in", () => {
  const formsDir = path.join(REPO_ROOT, ".github", "ISSUE_TEMPLATE");
  const forms = fs.readdirSync(formsDir).filter((file) => /^\d-.*\.yml$/.test(file));
  assert.ok(forms.length > 0);
  for (const form of forms) {
    const text = fs.readFileSync(path.join(formsDir, form), "utf-8");
    assert.match(text, /^\s+- type: input\s*\r?\n\s+id: page\s*$/m, `${form} has a "page" text field`);
  }
});
