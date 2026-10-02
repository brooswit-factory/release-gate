import { describe, expect, test } from "bun:test";
import { execSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gatherFacts } from "../../scripts/release/facts.js";
import { evaluate } from "../../scripts/release/gate.js";

const sh = (d: string) => (c: string) => execSync(c, { cwd: d, stdio: "ignore" });
const initRepo = (d: string) => sh(d)("git init -q -b main && git config user.email t@t && git config user.name t");

/** A throwaway git repo: main has 0.1.0; a branch bumps to 0.1.1 and touches src/ + the schema. */
function repo() {
  const d = mkdtempSync(join(tmpdir(), "facts-"));
  const run = sh(d);
  initRepo(d);
  writeFileSync(join(d, "package.json"), JSON.stringify({ name: "@probe/none-such-pkg-zz", version: "0.1.0" }));
  writeFileSync(join(d, "CHANGELOG.md"), "# C\n## [0.1.0] - 2026-01-01\n### Added\n- a\n");
  run("mkdir -p src schema && echo x > src/a.ts && echo '{}' > schema/herdr-api.schema.json && git add -A && git commit -qm base");
  run("git checkout -qb feat");
  writeFileSync(join(d, "package.json"), JSON.stringify({ name: "@probe/none-such-pkg-zz", version: "0.1.1" }));
  writeFileSync(join(d, "CHANGELOG.md"), "# C\n## [0.1.1] - 2026-01-02\n### Fixed\n- b\n## [0.1.0] - 2026-01-01\n### Added\n- a\n");
  run("echo y > src/a.ts && echo '{\"v\":2}' > schema/herdr-api.schema.json && git add -A && git commit -qm bump");
  return d;
}
describe("gatherFacts reads git", () => {
  test("versions, changed files, schemaChanged, base changelog", () => {
    const d = repo(); const cwd = process.cwd(); process.chdir(d);
    try {
      const f = gatherFacts("main");
      expect(f.version).toBe("0.1.1"); expect(f.baseVersion).toBe("0.1.0");
      expect(f.changedFiles.sort()).toEqual(["CHANGELOG.md", "package.json", "schema/herdr-api.schema.json", "src/a.ts"]);
      expect(f.schemaChanged).toBe(true);
      expect(f.baseChangelog).toContain("[0.1.0]"); expect(f.baseChangelog).not.toContain("[0.1.1]");
      expect(f.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    } finally { process.chdir(cwd); }
  }, 20_000);
  test("a base commit that has no version-file reads as 0.0.0", () => {
    const d = mkdtempSync(join(tmpdir(), "facts-")); const run = sh(d);
    initRepo(d);
    writeFileSync(join(d, "CHANGELOG.md"), "# C\n"); run("git add -A && git commit -qm root");   // root: no package.json
    run("git checkout -qb feat"); writeFileSync(join(d, "package.json"), JSON.stringify({ name: "@probe/none-such-pkg-zz", version: "0.1.0" }));
    run("git add -A && git commit -qm add-pkg");
    const cwd = process.cwd(); process.chdir(d);
    try { expect(gatherFacts("main").baseVersion).toBe("0.0.0"); } finally { process.chdir(cwd); }
  }, 20_000);
});

describe("gatherFacts honors FactsConfig.versionFile, for each supported version-file kind", () => {
  const cases: Array<{ file: string; before: string; after: string; before_v: string; after_v: string }> = [
    { file: "gradle.properties", before: "version=0.1.0\n", after: "version=0.2.0\n", before_v: "0.1.0", after_v: "0.2.0" },
    { file: "pack.toml", before: 'name = "x"\nversion = "0.1.0"\n', after: 'name = "x"\nversion = "0.2.0"\n', before_v: "0.1.0", after_v: "0.2.0" },
    { file: "release.json", before: JSON.stringify({ tag: "0.1.0" }), after: JSON.stringify({ tag: "0.2.0" }), before_v: "0.1.0", after_v: "0.2.0" },
  ];
  for (const c of cases) {
    test(`${c.file}`, () => {
      const d = mkdtempSync(join(tmpdir(), "facts-vf-")); const run = sh(d);
      initRepo(d);
      writeFileSync(join(d, c.file), c.before);
      writeFileSync(join(d, "CHANGELOG.md"), "# C\n## [0.1.0] - 2026-01-01\n### Added\n- a\n");
      run("mkdir -p src && echo x > src/a.ts && git add -A && git commit -qm base");
      run("git checkout -qb feat");
      writeFileSync(join(d, c.file), c.after);
      run("git add -A && git commit -qm bump");
      const cwd = process.cwd(); process.chdir(d);
      try {
        const f = gatherFacts("main", { versionFile: c.file });
        expect(f.version).toBe(c.after_v);
        expect(f.baseVersion).toBe(c.before_v);
      } finally { process.chdir(cwd); }
    }, 20_000);
  }
});

describe("gatherFacts honors FactsConfig.gatedPatterns", () => {
  test("a custom gated-paths list decides which fragments are 'added by this branch' is unaffected, but requiresRelease (via evaluate) is", () => {
    const d = mkdtempSync(join(tmpdir(), "facts-gp-")); const run = sh(d);
    initRepo(d);
    writeFileSync(join(d, "package.json"), JSON.stringify({ name: "@probe/none-such-pkg-zz", version: "0.1.0" }));
    writeFileSync(join(d, "CHANGELOG.md"), "# C\n## [0.1.0] - 2026-01-01\n### Added\n- a\n");
    run("mkdir -p docs && echo x > docs/guide.md && git add -A && git commit -qm base");
    run("git checkout -qb feat");
    writeFileSync(join(d, "docs/guide.md"), "y\n");
    run("git add -A && git commit -qm docs-change");
    const cwd = process.cwd(); process.chdir(d);
    try {
      const f = gatherFacts("main", { gatedPatterns: [/^docs\//] });
      const r = evaluate(f, { gatedPatterns: [/^docs\//] });
      expect(r.required).toBe(true); // docs/ is gated under the custom list
    } finally { process.chdir(cwd); }
  }, 20_000);
});

describe("gatherFacts.newFragments", () => {
  test("only changelog.d/*.md files ADDED by this branch — not README.md, not files merely modified", () => {
    const d = mkdtempSync(join(tmpdir(), "facts-frag-")); const run = sh(d);
    initRepo(d);
    writeFileSync(join(d, "package.json"), JSON.stringify({ name: "@probe/none-such-pkg-zz", version: "0.5.0" }));
    writeFileSync(join(d, "CHANGELOG.md"), "# C\n## [0.5.0] - 2026-01-01\n### Added\n- a\n");
    execSync("mkdir -p changelog.d", { cwd: d });
    writeFileSync(join(d, "changelog.d/README.md"), "format docs\n");
    writeFileSync(join(d, "changelog.d/OLD.md"), "bump: patch\n### Fixed\n- pre-existing\n");
    run("git add -A && git commit -qm base");
    run("git checkout -qb feat");
    writeFileSync(join(d, "changelog.d/NEW.md"), "bump: minor\n### Added\n- a new thing\n"); // added by this branch
    writeFileSync(join(d, "changelog.d/OLD.md"), "bump: patch\n### Fixed\n- pre-existing (edited)\n"); // merely modified
    run("git add -A && git commit -qm feat");
    const cwd = process.cwd(); process.chdir(d);
    try {
      const f = gatherFacts("main");
      expect(f.newFragments.map((x) => x.path)).toEqual(["changelog.d/NEW.md"]);
      expect(f.newFragments[0]!.bump).toBe("minor");
      expect(f.newFragments[0]!.sections.Added).toEqual(["a new thing"]);
    } finally { process.chdir(cwd); }
  }, 20_000);

  test("no changelog.d/ directory at all reads as no new fragments, not a crash", () => {
    const d = mkdtempSync(join(tmpdir(), "facts-nofrag-")); const run = sh(d);
    initRepo(d);
    writeFileSync(join(d, "package.json"), JSON.stringify({ name: "@probe/none-such-pkg-zz", version: "0.5.0" }));
    writeFileSync(join(d, "CHANGELOG.md"), "# C\n## [0.5.0] - 2026-01-01\n### Added\n- a\n");
    run("git add -A && git commit -qm base");
    run("git checkout -qb feat"); writeFileSync(join(d, "README.md"), "docs\n"); run("git add -A && git commit -qm docs");
    const cwd = process.cwd(); process.chdir(d);
    try { expect(gatherFacts("main").newFragments).toEqual([]); } finally { process.chdir(cwd); }
  }, 20_000);
});

describe("gatherFacts.baseVersion is merge-base relative", () => {
  test("a stale branch (base moved ahead while the branch only touched an ungated file) reads as no-release-required, not a downgrade", () => {
    const d = mkdtempSync(join(tmpdir(), "facts-stale-")); const run = sh(d);
    initRepo(d);
    writeFileSync(join(d, "package.json"), JSON.stringify({ name: "@probe/none-such-pkg-zz", version: "0.5.0" }));
    writeFileSync(join(d, "CHANGELOG.md"), "# C\n## [0.5.0] - 2026-01-01\n### Added\n- a\n");
    run("git add -A && git commit -qm base");
    run("git checkout -qb feat");
    writeFileSync(join(d, "README.md"), "docs only\n"); // ungated — branch's own diff never touches package.json/src/schema
    run("git add -A && git commit -qm docs");
    run("git checkout -q main");
    writeFileSync(join(d, "package.json"), JSON.stringify({ name: "@probe/none-such-pkg-zz", version: "0.6.0" }));
    writeFileSync(join(d, "CHANGELOG.md"), "# C\n## [0.6.0] - 2026-01-02\n### Added\n- b\n## [0.5.0] - 2026-01-01\n### Added\n- a\n");
    run("git add -A && git commit -qm main-bump"); // main moves on while feat sits still
    run("git checkout -q feat");
    const cwd = process.cwd(); process.chdir(d);
    try {
      const f = gatherFacts("main");
      expect(f.version).toBe("0.5.0");
      expect(f.baseVersion).toBe("0.5.0"); // merge-base version, NOT main's tip 0.6.0
      expect(f.baseTipVersion).toBe("0.6.0");
      const r = evaluate(f);
      expect(r.required).toBe(false);
      expect(r.ok, JSON.stringify(r.verdicts)).toBe(true);
      expect(r.verdicts[0]!.reason).not.toMatch(/version changed/);
      expect(r.verdicts[0]!.reason).toMatch(/no gated files changed; no release required/);
    } finally { process.chdir(cwd); }
  }, 20_000);

  test("a genuine downgrade on a branch that IS at the merge-base still fails — the fix must not blunt the real check", () => {
    const d = mkdtempSync(join(tmpdir(), "facts-downgrade-")); const run = sh(d);
    initRepo(d);
    writeFileSync(join(d, "package.json"), JSON.stringify({ name: "@probe/none-such-pkg-zz", version: "0.5.0" }));
    writeFileSync(join(d, "CHANGELOG.md"), "# C\n## [0.5.0] - 2026-01-01\n### Added\n- a\n");
    run("git add -A && git commit -qm base");
    run("git checkout -qb feat");
    writeFileSync(join(d, "package.json"), JSON.stringify({ name: "@probe/none-such-pkg-zz", version: "0.4.0" })); // own commit lowers the version
    run("git add -A && git commit -qm oops-downgrade"); // main never moves — branch IS at the merge-base
    const cwd = process.cwd(); process.chdir(d);
    try {
      const f = gatherFacts("main");
      expect(f.baseVersion).toBe("0.5.0");
      expect(f.baseTipVersion).toBe("0.5.0"); // not stale: merge-base === base tip
      const r = evaluate(f);
      expect(r.ok).toBe(false);
      expect(r.verdicts.some((v) => !v.ok && /0\.5\.0 → 0\.4\.0/.test(v.reason))).toBe(true);
    } finally { process.chdir(cwd); }
  }, 20_000);
});

describe("surfaceAt / gatherFacts surface", () => {
  test("surface-patterns matches, scoped to the gated paths, are diffed against the merge-base; a rename is a removal plus an addition", () => {
    const d = mkdtempSync(join(tmpdir(), "surface-"));
    const run = sh(d);
    initRepo(d);
    execSync("mkdir src", { cwd: d });
    writeFileSync(join(d, "package.json"), JSON.stringify({ name: "@probe/none-such-pkg-zz", version: "0.1.0" }));
    writeFileSync(join(d, "CHANGELOG.md"), "# C\n## [0.1.0] - 2026-01-01\n### Added\n- a\n");
    writeFileSync(join(d, "src/a.ts"), `app.get("/keep", h).post('/gone', h); const e = process.env.ENV_KEEP ?? process.env.ENV_GONE;\n`);
    run("git add -A && git commit -qm base && git checkout -qb feat");
    writeFileSync(join(d, "src/a.ts"), "app.get(\"/keep\", h).put(`/fresh/:id`, h); const e = process.env.ENV_KEEP ?? process.env.ENV_FRESH;\n");
    run("git add -A && git commit -qm change");
    const cwd = process.cwd(); process.chdir(d);
    try {
      const surfacePatterns = [
        /\.(?:get|post|put|delete|patch)\(\s*["'`](\/[^"'`]*)["'`]/,
        /ENV_[A-Z0-9_]+/,
      ];
      const f = gatherFacts("main", { surfacePatterns });
      expect(f.surface).toEqual({ added: ["#0 /fresh/:id", "#1 ENV_FRESH"], removed: ["#0 /gone", "#1 ENV_GONE"] });
    } finally { process.chdir(cwd); }
  });

  test("a surface-patterns match outside the gated paths is not counted", () => {
    const d = mkdtempSync(join(tmpdir(), "surface-scope-"));
    const run = sh(d);
    initRepo(d);
    execSync("mkdir -p src docs", { cwd: d });
    writeFileSync(join(d, "package.json"), JSON.stringify({ name: "@probe/none-such-pkg-zz", version: "0.1.0" }));
    writeFileSync(join(d, "CHANGELOG.md"), "# C\n## [0.1.0] - 2026-01-01\n### Added\n- a\n");
    writeFileSync(join(d, "src/a.ts"), "no env vars here\n");
    writeFileSync(join(d, "docs/guide.md"), "mentions ENV_DOC_ONLY in prose\n");
    run("git add -A && git commit -qm base && git checkout -qb feat");
    writeFileSync(join(d, "docs/guide.md"), "mentions ENV_DOC_ONLY and ENV_DOC_NEW in prose\n");
    run("git add -A && git commit -qm change");
    const cwd = process.cwd(); process.chdir(d);
    try {
      const f = gatherFacts("main", { surfacePatterns: [/ENV_[A-Z0-9_]+/] }); // default gatedPatterns: src/, schema/, package.json — not docs/
      expect(f.surface).toEqual({ added: [], removed: [] });
    } finally { process.chdir(cwd); }
  });
});

describe("gatherFacts tolerates missing files (just-in-time adoption)", () => {
  test("no CHANGELOG.md on either side reads as empty, not a crash", () => {
    const d = mkdtempSync(join(tmpdir(), "facts-nochangelog-")); const run = sh(d);
    initRepo(d);
    writeFileSync(join(d, "package.json"), JSON.stringify({ name: "@probe/none-such-pkg-zz", version: "0.1.0" }));
    run("mkdir -p src && echo x > src/a.ts && git add -A && git commit -qm base"); // no CHANGELOG.md at all
    run("git checkout -qb feat");
    writeFileSync(join(d, "src/a.ts"), "y\n");
    run("git add -A && git commit -qm change");
    const cwd = process.cwd(); process.chdir(d);
    try {
      const f = gatherFacts("main");
      expect(f.changelog).toBe("");
      expect(f.baseChangelog).toBe("");
    } finally { process.chdir(cwd); }
  }, 20_000);

  test("no version file on either side reads as 0.0.0 on both sides, not a crash", () => {
    const d = mkdtempSync(join(tmpdir(), "facts-noversion-")); const run = sh(d);
    initRepo(d);
    writeFileSync(join(d, "CHANGELOG.md"), "# C\n");
    run("mkdir -p src && echo x > src/a.ts && git add -A && git commit -qm base"); // no package.json at all
    run("git checkout -qb feat");
    writeFileSync(join(d, "src/a.ts"), "y\n");
    run("git add -A && git commit -qm change");
    const cwd = process.cwd(); process.chdir(d);
    try {
      const f = gatherFacts("main");
      expect(f.version).toBe("0.0.0");
      expect(f.baseVersion).toBe("0.0.0");
      const r = evaluate(f);
      expect(r.verdicts.some((v) => !v.ok && /version changed/.test(v.reason))).toBe(false);
    } finally { process.chdir(cwd); }
  }, 20_000);
});

describe("gatherFacts treats `base` and refs strictly as git refs, never shell input", () => {
  test("a base ref containing shell metacharacters is passed to git as plain argv, not executed", () => {
    const d = mkdtempSync(join(tmpdir(), "facts-shellsafe-")); const run = sh(d);
    initRepo(d);
    writeFileSync(join(d, "package.json"), JSON.stringify({ name: "@probe/none-such-pkg-zz", version: "0.1.0" }));
    writeFileSync(join(d, "CHANGELOG.md"), "# C\n## [0.1.0] - 2026-01-01\n### Added\n- a\n");
    run("mkdir -p src && echo x > src/a.ts && git add -A && git commit -qm base");
    const marker = join(d, "PWNED");
    const hostile = "main; touch " + marker;
    const cwd = process.cwd(); process.chdir(d);
    try {
      // git rejects the whole string as a single invalid refname argument (its own error message may
      // echo the literal argv back, metacharacters included — that's just text, not execution) — the
      // real check is that `touch PWNED` never actually ran as a second shell command.
      expect(() => gatherFacts(hostile)).toThrow();
      expect(existsSync(marker)).toBe(false);
    } finally { process.chdir(cwd); }
  }, 20_000);
});
