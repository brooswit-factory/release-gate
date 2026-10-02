import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { DEFAULT_GATED_PATTERNS, DEFAULT_VERSION_FILE, type Facts } from "./gate.js";
import { parseFragment } from "./fragments.js";
import { readVersion } from "./version-file.js";

// Every git call below goes through execFileSync with an argv array — never a shell string. `base`
// (github.base_ref, a branch name) and `ref` can legally contain shell metacharacters (;, $, (, `),
// so interpolating them into a shell command line would let a maliciously-named branch run arbitrary
// commands. execFileSync with an argument array passes them to git as plain argv, never to a shell.
const git = (args: string[]): string => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
const at = (ref: string, file: string) => { try { return git(["show", `${ref}:${file}`]); } catch { return ""; } };
const readFileOrEmpty = (path: string) => { try { return readFileSync(path, "utf8"); } catch { return ""; } };
const listFilesAt = (ref: string): string[] => {
  try { return git(["ls-tree", "-r", "--name-only", ref]).split("\n").filter(Boolean); }
  catch { return []; }
};

export interface FactsConfig {
  /** path to the file the version is read from, e.g. "package.json", "gradle.properties", "pack.toml", "release.json". */
  versionFile?: string;
  /** regexes (against a repo-relative path) deciding which changed files require a changelog.d/ fragment. */
  gatedPatterns?: RegExp[];
  /** regexes whose matches, within files under the gated paths, are diffed as "public surface". Empty = not measured. */
  surfacePatterns?: RegExp[];
}

/**
 * Every match of any `surfacePatterns` regex, within files under `ref` whose path matches a
 * `gatedPatterns` regex. Each match is labeled `#<i> <text>` (the pattern's index, so two patterns
 * matching the same text stay distinguishable) using the regex's first capture group, or its whole
 * match when it has none.
 */
export function surfaceAt(ref: string, gatedPatterns: RegExp[], surfacePatterns: RegExp[]): Set<string> {
  const out = new Set<string>();
  if (surfacePatterns.length === 0) return out;
  const files = listFilesAt(ref).filter((f) => gatedPatterns.some((p) => p.test(f)));
  for (const file of files) {
    const content = at(ref, file);
    if (!content) continue;
    surfacePatterns.forEach((pattern, i) => {
      const re = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g");
      for (const m of content.matchAll(re)) out.add(`#${i} ${m[1] ?? m[0]}`);
    });
  }
  return out;
}

/** `base` is the ref to compare against — `origin/<base-branch>` in CI, `HEAD~1` on main itself. */
export function gatherFacts(base: string, config: FactsConfig = {}): Facts {
  const versionFile = config.versionFile ?? DEFAULT_VERSION_FILE;
  const gatedPatterns = config.gatedPatterns ?? DEFAULT_GATED_PATTERNS;
  const surfacePatterns = config.surfacePatterns ?? [];

  // Just-in-time adoption: a repo may wire the gate up before it has a version file at all (the
  // consumer stub ships no version file of its own). Missing on both sides reads as "0.0.0" on both
  // sides — consistent, so the "version changed" check never fires spuriously — rather than crashing.
  const versionFileExists = existsSync(versionFile);
  const content = versionFileExists ? readFileOrEmpty(versionFile) : "";
  // baseVersion must share a reference point with changedFiles (merge-base relative, below) or a
  // branch that is merely behind base reads as a downgrade. Fall back to the base tip if merge-base
  // can't be resolved (unrelated histories, shallow clone) rather than crashing the gate.
  let mergeBase = base;
  try { mergeBase = git(["merge-base", base, "HEAD"]); } catch { /* fall back to base tip */ }
  const baseContent = at(mergeBase, versionFile);
  const baseTipContent = at(base, versionFile);
  const addedFragmentPaths = git(["diff", "--name-only", "--diff-filter=A", `${base}...HEAD`, "--", "changelog.d/"])
    .split("\n").filter((p) => p && /\.md$/.test(p) && p !== "changelog.d/README.md");
  const surfaceEnabled = surfacePatterns.length > 0;
  const was = surfaceEnabled ? surfaceAt(mergeBase, gatedPatterns, surfacePatterns) : null;
  const now = surfaceEnabled ? surfaceAt("HEAD", gatedPatterns, surfacePatterns) : null;
  return {
    version: versionFileExists ? readVersion(versionFile, content) : "0.0.0",
    baseVersion: baseContent ? readVersion(versionFile, baseContent) : "0.0.0",
    baseTipVersion: baseTipContent ? readVersion(versionFile, baseTipContent) : undefined,
    changedFiles: git(["diff", "--name-only", `${base}...HEAD`]).split("\n").filter(Boolean),
    changelog: readFileOrEmpty("CHANGELOG.md"),
    baseChangelog: at(base, "CHANGELOG.md"),
    schemaChanged: git(["diff", "--name-only", `${base}...HEAD`, "--", "schema/"]) !== "",
    newFragments: addedFragmentPaths.map((p) => parseFragment(p, readFileOrEmpty(p))),
    surface: was && now ? { added: [...now].filter((x) => !was.has(x)).sort(), removed: [...was].filter((x) => !now.has(x)).sort() } : undefined,
    today: new Date().toISOString().slice(0, 10),
  };
}
