export const PERF_DAYS = 180;
export const PERF_PER_DAY = 40;
export const MIN_SAMPLES = 5;
export const MIN_CRASHES = 3;
export const PAIR_RATE = 0.2;
const PROJECT = /^[A-Za-z0-9]{8}$/;

export function normGpu(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw
    .split(/[/(]/)[0]
    .toLowerCase()
    .replace(/\b(series|graphics|gpu|laptop|mobile|\(r\)|\(tm\))\b/g, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

export function projectsOf(v: unknown, max = 400): string[] {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.filter((p): p is string => typeof p === "string" && PROJECT.test(p)))].slice(0, max);
}

export function runMods(db: D1Database, kind: "c" | "p", run: number, projects: string[], net: string, created: number) {
  return projects.map((p) => db.prepare("INSERT OR IGNORE INTO run_mods (kind, run, project, net, created) VALUES (?, ?, ?, ?, ?)").bind(kind, run, p, net, created));
}

export async function insight(db: D1Database, mod: string, gpu: string, mc: string, mine: string[], now: number) {
  const since = now - PERF_DAYS * 24 * 60 * 60 * 1000;
  const cost = async (has: boolean) =>
    db
      .prepare(
        `SELECT AVG(p.fps_avg) AS fps, COUNT(DISTINCT p.net) AS n FROM perf_runs p
         WHERE p.gpu = ? AND p.mc = ? AND p.fps_avg IS NOT NULL AND p.created > ?
         AND ${has ? "" : "NOT "}EXISTS (SELECT 1 FROM run_mods r WHERE r.kind = 'p' AND r.run = p.id AND r.project = ?)`,
      )
      .bind(gpu, mc, since, mod)
      .first<{ fps: number | null; n: number }>();
  const [withMod, without] = gpu ? await Promise.all([cost(true), cost(false)]) : [null, null];
  const fpsCost =
    withMod && without && withMod.fps !== null && without.fps !== null && withMod.n >= MIN_SAMPLES && without.n >= MIN_SAMPLES
      ? { fps: Math.round(without.fps - withMod.fps), with: withMod.n, without: without.n }
      : null;
  const others = mine.filter((p) => p !== mod);
  const { results } = others.length
    ? await db
        .prepare(
          `SELECT b.project AS project,
             COUNT(DISTINCT CASE WHEN a.kind = 'c' THEN a.net END) AS crashed,
             COUNT(DISTINCT CASE WHEN a.kind = 'p' THEN a.net END) AS fine
           FROM run_mods a JOIN run_mods b ON b.kind = a.kind AND b.run = a.run AND b.project != a.project
           WHERE a.project = ? AND a.created > ? AND b.project IN (SELECT value FROM json_each(?))
           GROUP BY b.project`,
        )
        .bind(mod, since, JSON.stringify(others))
        .all<{ project: string; crashed: number; fine: number }>()
    : { results: [] };
  const pairs = results
    .filter((r) => r.crashed >= MIN_CRASHES)
    .map((r) => ({ project: r.project, crashed: r.crashed, rate: Math.round((r.crashed / (r.crashed + r.fine)) * 100) / 100 }))
    .filter((r) => r.rate >= PAIR_RATE)
    .sort((a, b) => b.rate - a.rate)
    .slice(0, 5);
  return { cost: fpsCost, pairs };
}
