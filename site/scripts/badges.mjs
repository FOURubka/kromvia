import { readFileSync, writeFileSync } from "node:fs";

const read = (path) => {
  const out = {};
  const src = readFileSync(new URL(path, import.meta.url), "utf8");
  for (const m of src.matchAll(/"badge\.([A-Za-z0-9]+)(\.hint)?": "((?:[^"\\]|\\.)*)"/g)) {
    out[m[1]] ??= ["", ""];
    out[m[1]][m[2] ? 1 : 0] = JSON.parse(`"${m[3]}"`);
  }
  return out;
};

writeFileSync(new URL("../lib/badges.json", import.meta.url), JSON.stringify({ en: read("../../src/i18n/en.ts"), uk: read("../../src/i18n/locales/uk.ts") }, null, 1) + "\n");
