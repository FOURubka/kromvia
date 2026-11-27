export const API = process.env.KROMVIA_API ?? "https://api.kromvia.com";

import type { Worn } from "@launcher/art/worn";
import type { Card, ClanTag } from "@launcher/profile/card";

export type Cosmetics = Worn;

export type Player = {
  id: string;
  name: string;
  verified: boolean;
  mc_uuid: string | null;
  created: number;
  likes: number;
  cosmetics: Cosmetics;
  profile?: Card;
  clan?: ClanTag | null;
  links?: Partial<Record<"discord" | "telegram", string>>;
  stats?: { hours?: number; launches?: number; worlds?: number; badges?: string[]; modules?: string[]; game?: { kills: number; deaths: number; totems: number; cps: number; elytra: number } };
};

export type Ranked = { id: string; name: string; verified: boolean; likes: number };

export type BuildIndex = {
  name: string;
  files: { path: string; fileSize: number }[];
  dependencies: Record<string, string>;
  pack?: { source: string; project: string; file: string };
  removed?: string[];
};

export type Share =
  | { kind: "build"; data: BuildIndex; created: number; from: { id: string; name: string; verified: boolean } }
  | { kind: "log"; text: string }
  | { kind: "screenshot"; url: string };

async function get(path: string) {
  try {
    return await fetch(API + path, { cache: "no-store" });
  } catch {
    return null;
  }
}

export async function player(name: string): Promise<Player | null> {
  if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) return null;
  const res = await get(`/v1/users/${name}`);
  return res?.ok ? res.json() : null;
}

export async function top(): Promise<Ranked[] | null> {
  const res = await get("/v1/top");
  return res?.ok ? res.json() : null;
}

export async function search(q: string): Promise<Omit<Ranked, "likes">[] | null> {
  const res = await get(`/v1/users?q=${encodeURIComponent(q)}`);
  return res?.ok ? res.json() : null;
}

export async function share(code: string): Promise<Share | null> {
  if (!/^[A-Za-z0-9]{4,16}$/.test(code)) return null;
  const res = await get(`/share/${code}`);
  if (!res?.ok) return null;
  const type = res.headers.get("content-type") ?? "";
  if (type.startsWith("image/")) return { kind: "screenshot", url: `${API}/share/${code.toUpperCase()}` };
  if (type.startsWith("text/plain")) return { kind: "log", text: await res.text() };
  return res.json();
}

export type Release = { version: string; published: string; files: { platform: string; name: string; size: number; url: string }[] };

export async function release(): Promise<Release | null> {
  const res = await get("/download");
  return res?.ok ? res.json() : null;
}

export type Now = { playing: number; servers: { host: string; players: number }[] };

export async function now(): Promise<Now | null> {
  const res = await get("/v1/now");
  return res?.ok ? res.json() : null;
}

export type PublicBuild = { code: string; name: string; mc: string | null; loader: string; mods: number; created: number; from: { id: string; name: string; verified: boolean } };

export async function builds(q: string, page: number): Promise<PublicBuild[] | null> {
  const res = await get(`/v1/builds?q=${encodeURIComponent(q)}&page=${page}`);
  return res?.ok ? res.json() : null;
}
