import { describe, expect, test } from "bun:test";
import { readVersion } from "../../scripts/release/version-file.js";

describe("readVersion", () => {
  test("package.json: \"version\" field", () => {
    expect(readVersion("package.json", JSON.stringify({ name: "x", version: "1.2.3" }))).toBe("1.2.3");
  });
  test("gradle.properties: version=x.y.z", () => {
    expect(readVersion("gradle.properties", "org.gradle.jvmargs=-Xmx2g\nversion=1.2.3\n")).toBe("1.2.3");
  });
  test("pack.toml: version = \"x.y.z\"", () => {
    expect(readVersion("pack.toml", 'name = "thing"\nversion = "1.2.3"\n')).toBe("1.2.3");
  });
  test("release.json: \"tag\" field, not \"version\"", () => {
    expect(readVersion("release.json", JSON.stringify({ tag: "1.2.3", version: "9.9.9" }))).toBe("1.2.3");
  });
  test("a path nested in a directory still dispatches on its filename", () => {
    expect(readVersion("sub/dir/release.json", JSON.stringify({ tag: "0.5.0" }))).toBe("0.5.0");
  });
  test("missing or malformed content reads as empty, not a crash", () => {
    expect(readVersion("package.json", "{not json")).toBe("");
    expect(readVersion("gradle.properties", "")).toBe("");
    expect(readVersion("pack.toml", "")).toBe("");
  });
});
