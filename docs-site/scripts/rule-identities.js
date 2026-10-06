#!/usr/bin/env node
// Check and maintain rule-identities.json, the permanent identities of the
// trust framework's rules. See ARCHITECTURE.md, under Rule identities, for
// when to use each command.
//
//   npm run rules                                  check the registry against the Markdown
//   npm run rules -- add 12.4.1.f [...]            register genuinely new rules
//   npm run rules -- confirm r0254 [...]           confirm that changed wording is still the same rule
//   npm run rules -- confirm --all-changed         the same, for every rule whose wording changed
//   npm run rules -- renumber r0254=12.4.1.d [...] record a rule's new number or section
//   npm run rules -- retire r0254 [...] [--replaced-by r0340 ...]
//                                                  record that a rule has been removed
//   npm run rules -- reuse 12.4.1.c [...]          acknowledge that a number has been used for more than one rule
//
// Nothing here decides that two rules are the same. Each command does only
// what it is told, for the identities and numbers it is given, and refuses
// anything it cannot do safely.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  REGISTRY_FILE,
  GUIDANCE,
  RuleIdentityError,
  readRegistry,
  readSections,
  frameworkRules,
  checkRegistry,
  formatRegistry,
  nextId,
  isRetired,
} from "../lib/rule-identities.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

class UsageError extends Error {}

/** Apply a command to the registry. Returns a list of what it did. Throws UsageError if it cannot. */
export function apply(registry, rules, command, args) {
  const byNumber = new Map(rules.map((rule) => [rule.number, rule]));
  const entry = (id) => {
    const found = registry.rules.find((each) => each.id === id);
    if (!found) throw new UsageError(`${id} is not in ${REGISTRY_FILE}.`);
    return found;
  };
  const currentEntry = (key) => {
    const found = registry.rules.find((each) => !isRetired(each) && (each.id === key || each.number === key));
    if (!found) throw new UsageError(`No rule in the working draft is registered as ${key}.`);
    return found;
  };
  const markdownRule = (number) => {
    const rule = byNumber.get(number);
    if (!rule) throw new UsageError(`The working draft has no rule ${number}.`);
    return rule;
  };
  const done = [];
  switch (command) {
    case "add": {
      if (!args.length) throw new UsageError("Give the numbers of the new rules, for example: add 12.4.1.f");
      for (const number of args) {
        const rule = markdownRule(number);
        const holder = registry.rules.find((each) => !isRetired(each) && each.number === number);
        if (holder) throw new UsageError(`Rule ${number} is already registered as ${holder.id}. If a different rule now has this number, first renumber or retire ${holder.id}.`);
        const id = nextId(registry);
        registry.rules.push({ id, number, file: rule.repoPath, fingerprint: rule.fingerprint });
        done.push(`Registered rule ${number} as a new rule, ${id}.`);
      }
      break;
    }
    case "confirm": {
      let targets;
      if (args.length === 1 && args[0] === "--all-changed") {
        // Only when changed wording is the only thing wrong. Anything else,
        // such as a missing identity, can mean rules have been renumbered,
        // and then the wording at a number may belong to a different rule.
        // So can wording that is now another rule's confirmed wording, as when
        // rules swap numbers: nothing else looks wrong then, so confirming in
        // bulk would quietly point each identity at the other rule.
        const { other, suspicious } = checkRegistry(registry, rules, { wordingOnly: true });
        if (other.length || suspicious.length) {
          throw new UsageError(
            `confirm --all-changed only works when changed wording is the only problem, and no rule's wording is now another rule's confirmed wording. ` +
              `Resolve these first, one at a time, then try again:\n\n${[...other, ...suspicious].join("\n\n")}`,
          );
        }
        targets = registry.rules.filter((each) => !isRetired(each) && byNumber.get(each.number)?.fingerprint !== each.fingerprint);
      } else {
        if (!args.length) throw new UsageError("Give the identities or numbers of the rules to confirm, or --all-changed.");
        targets = args.map(currentEntry);
      }
      for (const target of targets) {
        const rule = markdownRule(target.number);
        if (target.fingerprint === rule.fingerprint) {
          done.push(`${target.id} (rule ${target.number}): wording unchanged, nothing to confirm.`);
          continue;
        }
        target.fingerprint = rule.fingerprint;
        done.push(`${target.id} (rule ${target.number}): confirmed its changed wording. Its identity is unchanged.`);
      }
      break;
    }
    case "renumber": {
      if (!args.length) throw new UsageError("Give each identity and its new number, for example: renumber r0254=12.4.1.d");
      const moves = args.map((arg) => {
        const [id, number] = arg.split("=");
        if (!id || !number) throw new UsageError(`"${arg}" should be an identity and its new number, for example r0254=12.4.1.d`);
        const target = entry(id);
        if (isRetired(target)) throw new UsageError(`${id} is retired. A retired rule cannot be renumbered.`);
        return { target, rule: markdownRule(number) };
      });
      const numbers = moves.map((move) => move.rule.number);
      if (new Set(numbers).size !== numbers.length) throw new UsageError("Two identities cannot be given the same number.");
      for (const { target, rule } of moves) {
        if (target.number === rule.number && target.file === rule.repoPath) {
          done.push(`${target.id} is already rule ${rule.number} in ${rule.repoPath}.`);
          continue;
        }
        const history = (target.history ?? []).filter((place) => !(place.number === rule.number && place.file === rule.repoPath));
        history.push({ number: target.number, file: target.file });
        done.push(`${target.id}: rule ${target.number} (${target.file}) is now rule ${rule.number} (${rule.repoPath}).`);
        Object.assign(target, { number: rule.number, file: rule.repoPath, history });
      }
      break;
    }
    case "retire": {
      const split = args.indexOf("--replaced-by");
      const ids = split === -1 ? args : args.slice(0, split);
      const replacedBy = split === -1 ? [] : args.slice(split + 1);
      if (!ids.length) throw new UsageError("Give the identities to retire, for example: retire r0254 --replaced-by r0340 r0341");
      if (split !== -1 && !replacedBy.length) throw new UsageError("--replaced-by needs one or more identities.");
      for (const id of replacedBy) entry(id);
      for (const id of ids) {
        const target = entry(id);
        if (replacedBy.includes(id)) throw new UsageError(`${id} cannot replace itself.`);
        if (!isRetired(target)) {
          const history = [...(target.history ?? []), { number: target.number, file: target.file }];
          for (const key of ["number", "file", "fingerprint"]) delete target[key];
          Object.assign(target, { status: "retired", history });
        }
        if (replacedBy.length) target.replacedBy = replacedBy;
        const last = target.history.at(-1);
        done.push(`${id}: rule ${last.number} is retired${replacedBy.length ? `, replaced by ${replacedBy.join(", ")}` : ""}. Its permanent link stays, and says so.`);
      }
      break;
    }
    case "reuse": {
      if (!args.length) throw new UsageError("Give the numbers to acknowledge, for example: reuse 12.4.1.c");
      registry.reusedNumbers ??= [];
      for (const number of args) {
        const ids = registry.rules
          .filter((each) => [...(each.history ?? []).map((place) => place.number), ...(isRetired(each) ? [] : [each.number])].includes(number))
          .map((each) => each.id);
        if (ids.length < 2) throw new UsageError(`${number} has not been used for more than one rule, so there is nothing to acknowledge.`);
        registry.reusedNumbers = registry.reusedNumbers.filter((item) => item.number !== number);
        registry.reusedNumbers.push({ number, identities: ids });
        done.push(`Acknowledged that ${number} has been used for ${ids.join(", ")}.`);
      }
      registry.reusedNumbers.sort((a, b) => a.number.localeCompare(b.number, "en", { numeric: true }));
      break;
    }
    default:
      throw new UsageError(`Unknown command "${command}". Use check, add, confirm, renumber, retire or reuse.`);
  }
  return done;
}

function main(argv) {
  const [command = "check", ...args] = argv;
  let registry;
  try {
    registry = readRegistry(ROOT);
  } catch (error) {
    console.error(error.message);
    return 1;
  }
  const rules = frameworkRules(readSections(ROOT));
  if (command !== "check") {
    try {
      for (const line of apply(registry, rules, command, args)) console.log(line);
    } catch (error) {
      if (!(error instanceof UsageError)) throw error;
      console.error(error.message);
      return 1;
    }
    fs.writeFileSync(path.join(ROOT, REGISTRY_FILE), formatRegistry(registry));
    console.log(`Updated ${REGISTRY_FILE}. Review the change before committing it.\n`);
  }
  const problems = checkRegistry(registry, rules);
  if (!problems.length) {
    console.log(`${REGISTRY_FILE} matches the trust framework: ${rules.length} rules, each with one permanent identity.`);
    return 0;
  }
  console.error(new RuleIdentityError(problems).message);
  console.error(`\nSee ${GUIDANCE}.`);
  return 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
