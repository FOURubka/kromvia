export const FRAMES = ["none", "violet", "gold", "pixel", "glow"] as const;
export const EFFECTS = ["none", "stars", "snow", "embers", "rain"] as const;
export const PLATES = ["none", "aurora", "nether", "end", "ocean", "forest", "gold", "sunset", "frost"] as const;
export const FONTS = ["default", "display", "mono", "pixel", "arcade", "comic", "script", "tech", "retro", "spooky", "slab", "heavy", "round", "hand"] as const;
export const FONT_FAMILY: Record<(typeof FONTS)[number], string> = {
  default: "var(--font-sans)",
  display: "var(--font-display)",
  mono: "var(--font-mono)",
  pixel: '"Pixelify Sans", sans-serif',
  arcade: '"Press Start 2P", monospace',
  comic: "Bangers, sans-serif",
  script: "Pacifico, cursive",
  tech: "Orbitron, sans-serif",
  retro: "Righteous, sans-serif",
  spooky: "Creepster, sans-serif",
  slab: '"Zilla Slab", serif',
  heavy: '"Rubik Mono One", sans-serif',
  round: "Comfortaa, sans-serif",
  hand: "Caveat, cursive",
};
export const LOOKING = ["pvp", "smp", "build", "minigames", "modded", "redstone", "chat"] as const;
export const BANNERS = ["#2a1f4d", "#3b1f86", "#8b5cf6", "#1f3a5f", "#12907e", "#2f6b2f", "#8a5a1c", "#8f2d3c", "#26232f", "#0b0912"];
export const NAME_COLORS = ["#f3f1fa", "#c9b5ff", "#8b5cf6", "#7ec8ff", "#7ee0b0", "#ffd36e", "#ff9a7a", "#ff7ab8"];

export type Card = {
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

export type ClanTag = { id: string; name: string; tag: string; icon: string };
export type Presence = "online" | "idle" | "dnd" | "invisible" | "offline";
export type Game = { mc: string; since: number };

export const bannerBg = (c: Card) => (c.banner2 ? `linear-gradient(${c.bannerAngle ?? 135}deg, ${c.banner ?? "#2a1f4d"}, ${c.banner2})` : (c.banner ?? "#2a1f4d"));
export const nameStyle = (c: Card) =>
  c.nameColor2
    ? { backgroundImage: `linear-gradient(90deg, ${c.nameColor ?? "#f3f1fa"}, ${c.nameColor2})`, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }
    : c.nameColor
      ? { color: c.nameColor }
      : undefined;

export type CardOwner = {
  name: string;
  verified: boolean;
  created?: number;
  likes?: number;
  links?: Partial<Record<"discord" | "telegram", string>>;
  online?: boolean;
  presence?: Presence;
  playing?: string | null;
  game?: Game | null;
  clan?: ClanTag | null;
};

export const SHOT_URL = (code: string) => `https://api.kromvia.com/share/${code}`;
