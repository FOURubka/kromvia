import { invoke } from "@tauri-apps/api/core";
import { BADGES, earned, type Facts } from "./badges";
import type { Card } from "./card";

export type GameNumbers = { kills: number; deaths: number; totems: number; cps: number; elytra: number };
export type PublicStats = { hours?: number; launches?: number; worlds?: number; badges?: string[]; modules?: string[]; game?: GameNumbers; at?: number };

type Me = { verified: boolean; created?: number; likes?: number; links?: Record<string, string>; profile?: Card; clan?: unknown; dev?: boolean };
type InstanceStats = { playSeconds: number; launches: number };

const SENT_KEY = "kromvia.statsSent";
const STARRED_KEY = "kromvia.starred";
const GAME_KEY = "kromvia.gameStats";
const GAME_SHARE_KEY = "kromvia.gameShare";
const ZERO: GameNumbers = { kills: 0, deaths: 0, totems: 0, cps: 0, elytra: 0 };

export function gameNumbers(): GameNumbers {
  try {
    return { ...ZERO, ...JSON.parse(localStorage.getItem(GAME_KEY) ?? "{}") };
  } catch {
    return { ...ZERO };
  }
}

const sharesGame = () => localStorage.getItem(GAME_SHARE_KEY) === "1";

export function addGameStats(delta: unknown, share: unknown) {
  const before = sharesGame();
  localStorage.setItem(GAME_SHARE_KEY, share === true ? "1" : "0");
  if (delta && typeof delta === "object") {
    const d = delta as Record<string, unknown>;
    const n = (k: string) => (typeof d[k] === "number" && Number.isFinite(d[k]) && (d[k] as number) >= 0 ? (d[k] as number) : 0);
    const g = gameNumbers();
    localStorage.setItem(
      GAME_KEY,
      JSON.stringify({ kills: g.kills + n("kills"), deaths: g.deaths + n("deaths"), totems: g.totems + n("totems"), cps: Math.max(g.cps, Math.min(n("cps"), 50)), elytra: Math.round((g.elytra + n("elytra")) * 10) / 10 }),
    );
    return true;
  }
  return before !== sharesGame();
}

export function starredModules(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(STARRED_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string" && /^[a-z0-9_]{1,32}$/.test(x)).slice(0, 8) : [];
  } catch {
    return [];
  }
}

export function storeStarred(ids: unknown) {
  if (!Array.isArray(ids)) return false;
  const next = JSON.stringify(ids.filter((x) => typeof x === "string").slice(0, 8));
  if (localStorage.getItem(STARRED_KEY) === next) return false;
  localStorage.setItem(STARRED_KEY, next);
  return true;
}

export function factsOf(me: Me | null, played: number, launches: number, builds: number, worlds: number, friends: number, game: GameNumbers | null = gameNumbers()): Facts {
  return {
    hours: played / 3600,
    launches,
    builds,
    worlds,
    friends,
    likes: me?.likes ?? 0,
    verified: !!me?.verified,
    linked: !!me?.links && Object.keys(me.links).length > 0,
    days: me?.created ? (Date.now() - me.created) / 86_400_000 : 0,
    created: me?.created ?? 0,
    clan: !!me?.clan,
    dev: !!me?.dev,
    kills: game?.kills ?? 0,
    elytra: game?.elytra ?? 0,
    totems: game?.totems ?? 0,
    profile: [me?.profile?.bio, me?.profile?.status, me?.profile?.music, me?.profile?.banner ?? me?.profile?.shot, me?.profile?.mob ?? me?.profile?.block ?? me?.profile?.biome].filter(Boolean).length,
  };
}

let running: Promise<void> | null = null;

export function syncStats(instances: { id: string }[]) {
  running ??= upload(instances).finally(() => (running = null));
  return running;
}

async function upload(instances: { id: string }[]) {
  const me = await invoke<Me | null>("social_me").catch(() => null);
  if (!me) return;
  const stats = await Promise.all(instances.map((i) => invoke<{ stats: InstanceStats }>("instance_info", { id: i.id }).then((x) => x.stats, () => null)));
  const worlds = await Promise.all(instances.map((i) => invoke<unknown[]>("world_list", { instanceId: i.id }).then((w) => w.length, () => 0)));
  const friends = await invoke<{ friends: unknown[] }>("social_friends").then((f) => f.friends.length, () => 0);
  const played = stats.reduce((n, s) => n + (s?.playSeconds ?? 0), 0);
  const launches = stats.reduce((n, s) => n + (s?.launches ?? 0), 0);
  const worldCount = worlds.reduce((a, b) => a + b, 0);
  const share = sharesGame();
  const game = share ? gameNumbers() : null;
  const facts = factsOf(me, played, launches, instances.length, worldCount, friends, game);
  const payload: PublicStats = {
    hours: Math.round(facts.hours * 10) / 10,
    launches,
    worlds: worldCount,
    badges: BADGES.filter((b) => earned(b, facts)).map((b) => b.id),
    modules: starredModules(),
    ...(game ? { game } : {}),
  };
  const key = JSON.stringify(payload);
  if (localStorage.getItem(SENT_KEY) === key) return;
  await invoke("social_stats", { stats: payload }).then(() => localStorage.setItem(SENT_KEY, key), () => {});
}
