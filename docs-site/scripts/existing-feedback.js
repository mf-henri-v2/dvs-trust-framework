#!/usr/bin/env node
// Check existing-feedback.json, the GitHub issues that maintainers have
// chosen to show on the reading site. See ARCHITECTURE.md, under Existing
// feedback on the reading site.
//
//   npm run feedback    check the register against the rule identities and the trust framework
//
// It only checks. It never changes the register.
//
// Exit status: 0 if the register is in order, 1 if not (the output says what
// to change), 2 if the rule identities themselves need a decision first.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadRuleIdentities, RuleIdentityError } from "../lib/rule-identities.js";
import { loadExistingFeedback, ExistingFeedbackError, FEEDBACK_FILE } from "../lib/existing-feedback.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

let identities;
try {
  identities = loadRuleIdentities(ROOT);
} catch (error) {
  if (!(error instanceof RuleIdentityError)) throw error;
  console.error(`${FEEDBACK_FILE} cannot be checked until rule-identities.json matches the trust framework. Run npm run rules.`);
  process.exit(2);
}
try {
  const feedback = loadExistingFeedback(ROOT, identities);
  console.log(`${FEEDBACK_FILE} is in order: ${feedback.count} issue${feedback.count === 1 ? "" : "s"} shown on the reading site.`);
} catch (error) {
  if (!(error instanceof ExistingFeedbackError)) throw error;
  console.error(error.message);
  process.exit(1);
}
