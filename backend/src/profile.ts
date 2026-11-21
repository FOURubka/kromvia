export const FRAMES = ["none", "violet", "gold", "pixel", "glow"] as const;
export const EFFECTS = ["none", "stars", "snow", "embers", "rain"] as const;
export const PLATES = ["none", "aurora", "nether", "end", "ocean", "forest", "gold", "sunset", "frost"] as const;
export const FONTS = ["default", "display", "mono", "pixel", "arcade", "comic", "script", "tech", "retro", "spooky", "slab", "heavy", "round", "hand"] as const;
export const LOOKING = ["pvp", "smp", "build", "minigames", "modded", "redstone", "chat"] as const;

export type Profile = {
  banner?: string;
  banner2?: string;
  bannerAngle?: number;
  bannerShot?: boolean;
  nameColor?: string;
  nameColor2?: string;
  status?: string;
  tagline?: string;
  bio?: string;
  nameFont?: (typeof FONTS)[number];
  frame?: (typeof FRAMES)[number];
  effect?: (typeof EFFECTS)[number];
  plate?: (typeof PLATES)[number];
  server?: string;
  mains?: string[];
  showLinks?: boolean;
  music?: { title: string; artist?: string; url?: string };
  mob?: string;
  block?: string;
  biome?: string;
  version?: string;
  looking?: (typeof LOOKING)[number][];
  mods?: string[];
  shot?: string;
  shots?: string[];
};

const SLUG = /^[a-z0-9_-]{2,64}$/;
const SHARE = /^[A-Z0-9]{4,16}$/;
const MC_VERSION = /^[0-9a-z.+ -]{1,16}$/i;
const MUSIC_HOSTS = ["open.spotify.com", "music.youtube.com", "www.youtube.com", "youtube.com", "youtu.be", "soundcloud.com", "music.apple.com", "www.deezer.com", "deezer.com"];

const COLOR = /^#[0-9a-f]{6}$/i;
const HOST = /^[a-z0-9.-]{1,253}(:[0-9]{1,5})?$/i;
const LIMITS = { status: 80, tagline: 40, bio: 400, main: 20, mains: 5 };

function text(v: unknown, max: number, lines = false): string | undefined | Error {
  if (v === undefined || v === null || v === "") return undefined;
  if (typeof v !== "string") return new Error("text fields must be strings");
  const t = (lines ? v.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n") : v.replace(/\s+/g, " ")).trim();
  if ([...t].length > max) return new Error(`too long, ${max} characters at most`);
  if (/[\u0000-\u0008\u000b-\u001f\u007f‪-‮⁦-⁩]/.test(t)) return new Error("control characters are not allowed");
  return t || undefined;
}

function pick<T extends readonly string[]>(v: unknown, list: T): T[number] | undefined | Error {
  if (v === undefined || v === null) return undefined;
  return typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T[number]) : new Error(`must be one of ${list.join(", ")}`);
}

export function readProfile(raw: unknown): Profile | string {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return "profile must be an object";
  const r = raw as Record<string, unknown>;
  const out: Profile = {};
  const fields: [keyof Profile, unknown][] = [
    ["status", text(r.status, LIMITS.status)],
    ["tagline", text(r.tagline, LIMITS.tagline)],
    ["bio", text(r.bio, LIMITS.bio, true)],
    ["nameFont", pick(r.nameFont, FONTS)],
    ["frame", pick(r.frame, FRAMES)],
    ["effect", pick(r.effect, EFFECTS)],
    ["plate", pick(r.plate, PLATES)],
  ];
  for (const [k, v] of fields) {
    if (v instanceof Error) return `${k}: ${v.message}`;
    if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  }
  if (r.bannerAngle !== undefined && r.bannerAngle !== null) {
    if (typeof r.bannerAngle !== "number" || !Number.isInteger(r.bannerAngle) || r.bannerAngle < 0 || r.bannerAngle > 359) return "bannerAngle: 0–359";
    out.bannerAngle = r.bannerAngle;
  }
  for (const k of ["banner", "banner2", "nameColor", "nameColor2"] as const) {
    const v = r[k];
    if (v === undefined || v === null || v === "") continue;
    if (typeof v !== "string" || !COLOR.test(v)) return `${k}: must be a #rrggbb colour`;
    out[k] = v.toLowerCase();
  }
  if (r.server !== undefined && r.server !== null && r.server !== "") {
    if (typeof r.server !== "string" || !HOST.test(r.server.trim())) return "server: bad server address";
    out.server = r.server.trim().toLowerCase();
  }
  if (r.mains !== undefined && r.mains !== null) {
    if (!Array.isArray(r.mains) || r.mains.length > LIMITS.mains) return `mains: up to ${LIMITS.mains} tags`;
    const mains: string[] = [];
    for (const m of r.mains) {
      const t = text(m, LIMITS.main);
      if (t instanceof Error) return `mains: ${t.message}`;
      if (t && !mains.some((x) => x.toLowerCase() === t.toLowerCase())) mains.push(t);
    }
    if (mains.length) out.mains = mains;
  }
  for (const k of ["mob", "block", "biome"] as const) {
    const t = text(r[k], 24);
    if (t instanceof Error) return `${k}: ${t.message}`;
    if (t) out[k] = t;
  }
  if (r.version !== undefined && r.version !== null && r.version !== "") {
    if (typeof r.version !== "string" || !MC_VERSION.test(r.version.trim())) return "version: bad Minecraft version";
    out.version = r.version.trim();
  }
  if (r.music !== undefined && r.music !== null) {
    if (typeof r.music !== "object" || Array.isArray(r.music)) return "music: must be an object";
    const m = r.music as Record<string, unknown>;
    const title = text(m.title, 60), artist = text(m.artist, 60);
    if (title instanceof Error) return `music.title: ${title.message}`;
    if (artist instanceof Error) return `music.artist: ${artist.message}`;
    let url: string | undefined;
    if (m.url !== undefined && m.url !== null && m.url !== "") {
      let u: URL;
      try {
        u = new URL(String(m.url));
      } catch {
        return "music.url: bad link";
      }
      if (u.protocol !== "https:" || !MUSIC_HOSTS.includes(u.hostname) || u.href.length > 200) return "music.url: Spotify, YouTube, SoundCloud, Apple Music or Deezer links only";
      url = u.href;
    }
    if (title) out.music = { title, ...(artist ? { artist } : {}), ...(url ? { url } : {}) };
  }
  if (r.looking !== undefined && r.looking !== null) {
    if (!Array.isArray(r.looking) || r.looking.some((x) => !(LOOKING as readonly unknown[]).includes(x))) return `looking: pick from ${LOOKING.join(", ")}`;
    const looking = LOOKING.filter((x) => (r.looking as unknown[]).includes(x));
    if (looking.length) out.looking = looking;
  }
  if (r.mods !== undefined && r.mods !== null) {
    if (!Array.isArray(r.mods) || r.mods.length > 6 || r.mods.some((x) => typeof x !== "string" || !SLUG.test(x))) return "mods: up to 6 Modrinth project slugs";
    const mods = [...new Set(r.mods as string[])];
    if (mods.length) out.mods = mods;
  }
  if (r.shot !== undefined && r.shot !== null && r.shot !== "") {
    const shot = typeof r.shot === "string" ? r.shot.trim().toUpperCase() : "";
    if (!SHARE.test(shot)) return "shot: bad share code";
    out.shot = shot;
  }
  if (r.shots !== undefined && r.shots !== null) {
    if (!Array.isArray(r.shots) || r.shots.length > 6 || r.shots.some((x) => typeof x !== "string" || !SHARE.test(x.trim().toUpperCase()))) return "shots: up to 6 share codes";
    const shots = [...new Set((r.shots as string[]).map((x) => x.trim().toUpperCase()))];
    if (shots.length) out.shots = shots;
  }
  if (r.bannerShot !== undefined && typeof r.bannerShot !== "boolean") return "bannerShot: must be true or false";
  if (r.bannerShot) out.bannerShot = true;
  if (r.showLinks !== undefined && typeof r.showLinks !== "boolean") return "showLinks: must be true or false";
  if (r.showLinks) out.showLinks = true;
  return out;
}

export type Game = { kills: number; deaths: number; totems: number; cps: number; elytra: number };
export type Stats = { hours?: number; launches?: number; worlds?: number; badges?: string[]; modules?: string[]; game?: Game; at?: number };

function ids(v: unknown, max: number, re: RegExp): string[] | undefined | Error {
  if (v === undefined || v === null) return undefined;
  if (!Array.isArray(v) || v.length > max || v.some((x) => typeof x !== "string" || !re.test(x))) return new Error(`up to ${max} ids`);
  const out = [...new Set(v as string[])];
  return out.length ? out : undefined;
}

function count(v: unknown, max: number): number | undefined | Error {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > max) return new Error(`0–${max}`);
  return v;
}

export function readStats(raw: unknown): Stats | string {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return "stats must be an object";
  const r = raw as Record<string, unknown>;
  const out: Stats = {};
  const fields: [keyof Stats, unknown][] = [
    ["hours", count(r.hours, 1_000_000)],
    ["launches", count(r.launches, 10_000_000)],
    ["worlds", count(r.worlds, 100_000)],
    ["badges", ids(r.badges, 60, /^[A-Za-z0-9]{1,32}$/)],
    ["modules", ids(r.modules, 8, /^[a-z0-9_]{1,32}$/)],
  ];
  for (const [k, v] of fields) {
    if (v instanceof Error) return `${k}: ${v.message}`;
    if (v !== undefined) (out as Record<string, unknown>)[k] = k === "hours" ? Math.round((v as number) * 10) / 10 : k === "launches" || k === "worlds" ? Math.round(v as number) : v;
  }
  if (r.game !== undefined && r.game !== null) {
    if (typeof r.game !== "object" || Array.isArray(r.game)) return "game: must be an object";
    const g = r.game as Record<string, unknown>;
    const game = {} as Game;
    for (const [k, max] of [["kills", 10_000_000], ["deaths", 10_000_000], ["totems", 10_000_000], ["cps", 50], ["elytra", 10_000_000]] as const) {
      const v = count(g[k], max);
      if (v instanceof Error) return `game.${k}: ${v.message}`;
      game[k] = k === "elytra" ? Math.round((v ?? 0) * 10) / 10 : Math.round(v ?? 0);
    }
    out.game = game;
  }
  out.at = Date.now();
  return out;
}
