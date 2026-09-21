import { existsSync, readFileSync, writeFileSync } from "node:fs";

export type EnvEntries = Record<string, string>;

const isAssignmentOf = (key: string) => (line: string) => line.trimStart().startsWith(`${key}=`);

/** Replaces the value of each key already present and appends the rest, keeping every other line as is. */
export function upsertEnvContent(content: string, entries: EnvEntries): string {
  const lines = content === "" ? [] : content.replace(/\n$/, "").split("\n");
  const pending = { ...entries };

  const merged = lines.map(line => {
    const key = Object.keys(pending).find(candidate => isAssignmentOf(candidate)(line));
    if (key === undefined) return line;
    const value = pending[key];
    delete pending[key];
    return `${key}=${value}`;
  });

  const appended = Object.entries(pending).map(([key, value]) => `${key}=${value}`);
  return [...merged, ...appended].join("\n") + "\n";
}

export function upsertEnvFile(filePath: string, entries: EnvEntries): void {
  const current = existsSync(filePath) ? readFileSync(filePath, "utf8") : "";
  writeFileSync(filePath, upsertEnvContent(current, entries));
}
