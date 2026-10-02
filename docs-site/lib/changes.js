// Changes to the trust framework since its baseline.
//
// The baseline is the annotated Git tag named in framework-baseline.json at
// the repository root, initially published-1.0. Changing that file is a
// deliberate, reviewed decision. Repository-only work never needs a tag.
//
// Only the framework content counts: the files under trust-framework-1.0/.
// Their repository-only parts (the caution banner and the "Repository
// navigation" footer) are removed before comparing, the same way the site
// removes them, so updating those is not a change to the trust framework.
// Changes anywhere else in the repository are ignored.
//
// The comparison is between the baseline and the committed working draft
// (HEAD). It needs the tag and the full Git history. If either is missing it
// throws, so the site can never wrongly say the wording is unchanged.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { diffArrays, diffWords } from "diff";
import { stripRepositoryFurniture, firstHeading, siteUrlFor, RULE_NUMBER, ruleAnchor } from "./markdown.js";

export const FRAMEWORK_DIR = "trust-framework-1.0";
export const BASELINE_FILE = "framework-baseline.json";

export class FrameworkChangesError extends Error {}

/** The configured baseline: { tag, name, description?, url? }. */
export function readBaseline(root) {
  let baseline;
  try {
    baseline = JSON.parse(fs.readFileSync(path.join(root, BASELINE_FILE), "utf-8"));
  } catch (error) {
    throw new FrameworkChangesError(`Cannot read ${BASELINE_FILE}: ${error.message}`);
  }
  for (const key of ["tag", "name"]) {
    if (typeof baseline?.[key] !== "string" || !baseline[key].trim()) {
      throw new FrameworkChangesError(`${BASELINE_FILE} must give the baseline's "${key}".`);
    }
  }
  return baseline;
}

/** Framework text with the repository-only parts removed, for comparing. */
export function frameworkText(source) {
  return stripRepositoryFurniture(source.replace(/\r\n?/g, "\n"))
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

/**
 * The changes to the framework content between the baseline and HEAD.
 *
 * Returns { baseline, current, unchanged, sections }. current.lastChanged is
 * the date the framework text last changed on main, or null if it has not
 * changed since the baseline. Each changed section
 * (one per changed file) has its path, status (added, removed, changed or
 * moved), title, site address, a short summary and the changed blocks.
 */
export function frameworkChanges(root) {
  const baseline = readBaseline(root);
  const git = (...args) =>
    execFileSync("git", args, { cwd: root, encoding: "utf-8", maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
  const gitOk = (...args) => {
    try {
      git(...args);
      return true;
    } catch {
      return false;
    }
  };

  if (git("rev-parse", "--is-shallow-repository").trim() === "true") {
    throw new FrameworkChangesError(
      "The Git history is incomplete (a shallow clone), so the trust framework cannot be compared with its baseline. Fetch the full history and tags, for example with fetch-depth: 0.",
    );
  }
  const tagRef = `refs/tags/${baseline.tag}`;
  if (!gitOk("rev-parse", "--verify", "--quiet", tagRef)) {
    throw new FrameworkChangesError(`The baseline tag ${baseline.tag} (from ${BASELINE_FILE}) was not found. Fetch the repository's tags.`);
  }
  if (git("cat-file", "-t", tagRef).trim() !== "tag") {
    throw new FrameworkChangesError(`The baseline tag ${baseline.tag} must be an annotated tag.`);
  }
  const baseCommit = git("rev-parse", `${tagRef}^{commit}`).trim();
  const head = git("rev-parse", "HEAD").trim();
  if (!gitOk("merge-base", "--is-ancestor", baseCommit, head)) {
    throw new FrameworkChangesError(`The baseline tag ${baseline.tag} is not part of the working draft's history.`);
  }
  if (!gitOk("rev-parse", "--verify", "--quiet", `${head}:${FRAMEWORK_DIR}`)) {
    throw new FrameworkChangesError(`The working draft has no ${FRAMEWORK_DIR}/ folder.`);
  }

  const tree = (commit) => (gitOk("rev-parse", "--verify", "--quiet", `${commit}:${FRAMEWORK_DIR}`) ? git("rev-parse", `${commit}:${FRAMEWORK_DIR}`).trim() : null);
  // cat-file rather than show: show also checks "commit:file" as a file name,
  // which fails on Windows when the path is long.
  const show = (commit, file) => git("cat-file", "blob", `${commit}:${file}`);
  const comparable = (file, text) => (file.endsWith(".md") ? frameworkText(text) : text);

  /**
   * The framework files that really differ between two commits: not only in
   * their caution banner or footer. Git's own rename detection is not used,
   * because the banner and footer make small files look similar. A file
   * counts as moved only when a removed file and an added file have exactly
   * the same wording.
   */
  const fileChanges = (from, to) => {
    if (tree(from) === tree(to)) return [];
    const entries = [];
    const fields = git("diff", "--name-status", "--no-renames", "-z", from, to, "--", `${FRAMEWORK_DIR}/`).split("\0").filter(Boolean);
    for (let i = 0; i < fields.length; i += 2) {
      const [code, file] = [fields[i], fields[i + 1]];
      entries.push({
        oldPath: code === "A" ? null : file,
        newPath: code === "D" ? null : file,
        oldText: code === "A" ? null : show(from, file),
        newText: code === "D" ? null : show(to, file),
        renamed: false,
      });
    }
    for (const added of entries.filter((entry) => !entry.oldPath)) {
      const removed = entries.find(
        (entry) => !entry.newPath && !entry.pairedWith && comparable(entry.oldPath, entry.oldText) === comparable(added.newPath, added.newText),
      );
      if (removed) {
        Object.assign(added, { oldPath: removed.oldPath, oldText: removed.oldText, renamed: true });
        removed.pairedWith = added; // shown as part of the file it moved to
      }
    }
    return entries
      .filter((entry) => !entry.pairedWith)
      .map((entry) => ({
        ...entry,
        same: entry.oldText !== null && entry.newText !== null && comparable(entry.newPath, entry.oldText) === comparable(entry.newPath, entry.newText),
      }))
      .filter((entry) => !entry.same || entry.renamed); // drop banner- or footer-only changes
  };

  /**
   * When the framework text last changed on main: the date of the most
   * recent commit on main's own line of history (so a merged pull request
   * counts from when it was merged) that really changed the framework.
   * Repository-only commits, and banner or footer updates, do not count.
   */
  const lastChanged = () => {
    const commits = git("rev-list", "--first-parent", `${baseCommit}..${head}`, "--", `${FRAMEWORK_DIR}/`).split("\n").filter(Boolean);
    const commit = commits.find((each) => fileChanges(`${each}^1`, each).length > 0);
    return commit ? git("show", "-s", "--format=%cs", commit).trim() : null;
  };

  const changed = fileChanges(baseCommit, head);
  const result = {
    baseline: { ...baseline, commit: baseCommit },
    current: { commit: head, lastChanged: changed.length ? lastChanged() : null },
    unchanged: true,
    sections: [],
  };

  for (const { oldPath, newPath, oldText, newText, renamed, same } of changed) {
    const markdown = (newPath ?? oldPath).endsWith(".md");
    const status = !oldPath ? "added" : !newPath ? "removed" : renamed ? "moved" : "changed";
    const items = markdown && !same ? compareBlocks(oldText, newText) : [];
    result.sections.push({
      path: newPath ?? oldPath,
      oldPath: renamed ? oldPath : null,
      status,
      title: markdown ? firstHeading(newText ?? oldText) || path.basename(newPath ?? oldPath) : path.basename(newPath ?? oldPath),
      url: newPath ? siteUrlFor(newPath) : null,
      slug: slugFor(newPath ?? oldPath),
      items,
      summary: summarise(status, items, renamed ? oldPath : null),
    });
  }

  result.sections.sort((a, b) => a.path.localeCompare(b.path, "en", { numeric: true }));
  const slugs = result.sections.map((section) => section.slug);
  const repeated = slugs.find((slug, i) => slugs.indexOf(slug) !== i);
  if (repeated) throw new FrameworkChangesError(`Two changed files would share the change page /changes/${repeated}/.`);
  result.unchanged = result.sections.length === 0;
  return result;
}

/** The address of a file's change page: /changes/<slug>/. */
export function slugFor(file) {
  const relative = file.slice(FRAMEWORK_DIR.length + 1);
  if (relative === "README.md") return "contents";
  if (relative.endsWith("/README.md")) return relative.slice(0, -"/README.md".length).replace(/\//g, "-");
  return path.posix.basename(relative).replace(/\.[^.]+$/, "");
}

// Markdown blocks (paragraphs, list items, headings) that a reader can see.
// Hidden anchors (<a id="..."></a>) are left out of the comparison display.
function blocks(source) {
  if (source === null) return [];
  return frameworkText(source)
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => block && !/^(<a\s+id="[^"]*"\s*><\/a>\s*)+$/.test(block));
}

/** A block as plain text, for reading in the comparison. */
export function plainText(block) {
  return block
    .replace(/^#{1,6}\s+/, "")
    .replace(/^>\s?/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "• ")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, (_, alt) => `[Image: ${alt}]`)
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\*\*|__/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const isHeading = (block) => /^#{1,6}\s/.test(block);
const isListItem = (block) => /^\s*[-*+]\s/.test(block);

// The blocks that differ, in reading order. A removed block followed by an
// added one is shown as one changed block, with the changed words marked.
function compareBlocks(oldSource, newSource) {
  const items = [];
  let heading = "";
  const describe = (kind, oldBlock, newBlock) => {
    const block = newBlock ?? oldBlock;
    const rule = RULE_NUMBER.exec(block)?.[1] ?? null;
    const parts =
      kind === "changed"
        ? diffWords(plainText(oldBlock), plainText(newBlock)).map((part) => ({ text: part.value, added: !!part.added, removed: !!part.removed }))
        : [{ text: plainText(block), added: kind === "added", removed: kind === "removed" }];
    return {
      kind,
      rule,
      // Rule anchors exist on the current page only for rules that are still there.
      anchor: rule && kind !== "removed" ? ruleAnchor(rule) : null,
      label: rule ?? (isHeading(block) ? "Heading" : isListItem(block) ? "List item" : "Paragraph"),
      heading: isHeading(block) ? "" : heading,
      parts,
    };
  };
  const changes = diffArrays(blocks(oldSource), blocks(newSource));
  for (let i = 0; i < changes.length; i++) {
    const change = changes[i];
    if (!change.added && !change.removed) {
      for (const block of change.value) if (isHeading(block)) heading = plainText(block);
      continue;
    }
    const removed = change.removed ? change.value : [];
    const added = change.removed && changes[i + 1]?.added ? changes[++i].value : change.added ? change.value : [];
    const paired = Math.min(removed.length, added.length);
    for (let j = 0; j < Math.max(removed.length, added.length); j++) {
      const item = j < paired ? describe("changed", removed[j], added[j]) : j < removed.length ? describe("removed", removed[j], null) : describe("added", null, added[j]);
      items.push(item);
      const block = added[j] ?? removed[j];
      if (isHeading(block)) heading = plainText(block);
    }
  }
  return items;
}

function summarise(status, items, movedFrom) {
  if (status === "added") return "New section";
  if (status === "removed") return "Section removed";
  if (status === "moved") return `Moved from ${movedFrom}. The wording has not changed.`;
  const count = (kind, rules) => items.filter((item) => item.kind === kind && !!item.rule === rules).length;
  const phrase = (n, kind, noun) => (n ? `${n} ${noun}${n === 1 ? "" : "s"} ${kind}` : null);
  const parts = [
    phrase(count("changed", true), "changed", "rule"),
    phrase(count("added", true), "added", "rule"),
    phrase(count("removed", true), "removed", "rule"),
    phrase(count("changed", false), "changed", "other passage"),
    phrase(count("added", false), "added", "other passage"),
    phrase(count("removed", false), "removed", "other passage"),
  ].filter(Boolean);
  const sentences = [parts.length ? `${parts.join(", ")}.` : "Formatting or hidden links changed. The visible wording has not changed."];
  if (movedFrom) sentences.push(`Moved from ${movedFrom}.`);
  const text = sentences.join(" ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}
