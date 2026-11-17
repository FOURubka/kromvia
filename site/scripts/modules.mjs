import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../../client/", import.meta.url).pathname;
const files = [];
const walk = (dir) => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith(".java")) files.push(p);
  }
};
walk(join(root, "src/main/java"));
walk(join(root, "fx/src/main/java"));

const info = {};
const infoSrc = readFileSync(join(root, "src/main/java/com/kromvia/client/module/ModuleInfo.java"), "utf8");
for (const m of infoSrc.matchAll(/put\("([a-z0-9_]+)", "[^"]*", "((?:[^"\\]|\\.)*)"\)/g)) info[m[1]] = m[2].replace(/\\"/g, '"');

const CAT = { PVP: "PvP", HUD: "HUD" };
const DECL = /\("([a-z0-9_]+)", "([^"]+)", (?:Module\.)?Category\.([A-Z]+)/g;
const out = new Map();
for (const file of files) {
  const src = readFileSync(file, "utf8");
  const decls = [...src.matchAll(DECL)];
  decls.forEach((d) => {
    const [, id, name, cat] = d;
    if (!info[id] || out.has(id)) return;
    out.set(id, { id: id.replace(/_/g, "-"), name, cat: CAT[cat] ?? "Utility & visuals", text: info[id] });
  });
}
const list = [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
writeFileSync(new URL("../lib/modules.json", import.meta.url), JSON.stringify(list, null, 1) + "\n");
console.log(`${list.length} modules`);
