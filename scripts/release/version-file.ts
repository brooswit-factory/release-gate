/**
 * Reads a declared version string out of one of a few supported version-file
 * formats, given the file's path (to pick the format) and its content (so a
 * caller can also parse the same file's content at another git ref without
 * a checkout).
 */
export function readVersion(path: string, content: string): string {
  if (path.endsWith(".json")) {
    let data: unknown;
    try { data = JSON.parse(content); } catch { return ""; }
    const obj = data as Record<string, unknown>;
    // release.json declares its version under "tag", not "version".
    const key = /(^|\/)release\.json$/.test(path) ? "tag" : "version";
    return typeof obj[key] === "string" ? (obj[key] as string) : "";
  }
  if (path.endsWith(".toml")) {
    const m = /^version\s*=\s*"([^"]*)"/m.exec(content);
    return m?.[1] ?? "";
  }
  // gradle.properties and other key=value property files.
  const m = /^version\s*=\s*(.+?)\s*$/m.exec(content);
  return m?.[1] ?? "";
}
