import { invoke } from "@tauri-apps/api/core";
import { headOf } from "../friends/Head";
import { MODELS } from "../art/catalog";
import { BOX_ITEMS } from "../art/procedural";
import type { MessageKey } from "../i18n/en";
import type { Card, ClanTag } from "./card";
import type { PublicStats } from "./stats";

type User = { id: string; name: string; verified: boolean; created?: number; likes?: number; cosmetics?: { models?: string[]; items?: string[]; cape?: boolean; style?: string; dev?: boolean }; profile?: Card; stats?: PublicStats; clan?: ClanTag | null; hasSetup?: boolean };
type T = (key: MessageKey, vars?: Record<string, string | number>) => string;

const plain = (s?: string) => s?.replace(/:([a-z0-9_]{1,24}):/gi, "").replace(/\s+/g, " ").trim() || undefined;

export async function gameCard(name: string, t: T, playing: string | null, friendId: string | null, myId: string | null) {
  const [u, likes] = await Promise.all([invoke<User>("social_user", { name }), invoke<string[]>("social_likes").catch(() => [] as string[])]);
  const p = u.profile ?? {};
  const s = u.stats ?? {};
  const c = u.cosmetics ?? {};
  const wearing = [
    ...(c.models ?? []).map((id) => MODELS.find((m) => m.id === id)?.name),
    ...(c.items ?? []).map((id) => BOX_ITEMS.find((b) => b.id === id)?.name),
    c.dev ? "Developer cape" : c.cape ? `${(c.style ?? "kromvia").replace(/^\w/, (x) => x.toUpperCase())} cape` : undefined,
  ].filter((x): x is string => !!x);
  const favs = (["mob", "block", "biome", "version"] as const).filter((k) => p[k]).map((k) => [t(`card.${k}` as MessageKey), p[k]!]);
  return {
    id: u.id,
    me: u.id === myId,
    friend: friendId === u.id,
    liked: likes.includes(u.id),
    name: u.name,
    verified: u.verified,
    dev: !!c.dev,
    head: await headOf(u.name).catch(() => null),
    banner: p.banner ?? "#2a1f4d",
    banner2: p.banner2 ?? null,
    nameColor: p.nameColor ?? null,
    nameColor2: p.nameColor2 ?? null,
    clan: u.clan?.tag ?? null,
    tagline: plain(p.tagline) ?? null,
    status: plain(p.status) ?? null,
    bio: p.bio ? p.bio.replace(/:([a-z0-9_]{1,24}):/gi, "").trim() : null,
    music: p.music ? [p.music.title, p.music.artist].filter(Boolean).join(" · ") : null,
    favs,
    server: p.server ?? null,
    playing,
    chips: [...(p.looking ?? []).map((l) => t(`card.look.${l}` as MessageKey)), ...(p.mains ?? [])],
    badges: (s.badges ?? []).map((id) => t(`badge.${id}` as MessageKey)),
    hours: s.hours ?? null,
    launches: s.launches ?? null,
    modules: s.modules ?? [],
    wearing,
    since: u.created ? new Date(u.created).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : null,
    likes: u.likes ?? 0,
    hasSetup: !!u.hasSetup,
    game: s.game ?? null,
  };
}
