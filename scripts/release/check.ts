import { existsSync } from "node:fs";
import { DEFAULT_GATED_PATTERNS, DEFAULT_VERSION_FILE, evaluate } from "./gate.js";
import { gatherFacts } from "./facts.js";

const parsePatterns = (json: string | undefined, fallback: RegExp[]): RegExp[] => {
  if (!json) return fallback;
  const list = JSON.parse(json) as string[];
  return list.map((s) => new RegExp(s));
};

const base = process.env.RELEASE_BASE ?? "origin/main";
const versionFile = process.env.RELEASE_VERSION_FILE ?? DEFAULT_VERSION_FILE;
const gatedPatterns = parsePatterns(process.env.RELEASE_GATED_PATHS, DEFAULT_GATED_PATTERNS);
const surfacePatterns = parsePatterns(process.env.RELEASE_SURFACE_PATTERNS, []);

if (!existsSync(versionFile)) console.log(`\nnote: no version file at ${versionFile}; version checks skipped until one exists`);

const facts = gatherFacts(base, { versionFile, gatedPatterns, surfacePatterns });
const r = evaluate(facts, { gatedPatterns, versionFileLabel: versionFile });

console.log(`\nrelease gate — base ${base}, ${facts.changedFiles.length} file(s) changed, release ${r.required ? "REQUIRED" : "not required"}`);
for (const v of r.verdicts) console.log(`  ${v.ok ? "✓" : "✗"} ${v.reason}`);
if (!r.ok) {
  console.log(`\nFAILED. Rules: ${versionFile}'s version stays unchanged on a branch; no new CHANGELOG.md heading; at least one changelog.d/*.md fragment; BREAKING ⇔ "bump: major"; schema change ⇒ fragments declare ≥ minor. The version is assigned at MERGE time by the release workflow.`);
  process.exit(1);
}
console.log(`\nOK${r.bump ? ` — highest declared bump: ${r.bump}` : ""}.`);
