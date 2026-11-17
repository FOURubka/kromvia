import { invoke } from "@tauri-apps/api/core";
import { wearable } from "../art/wear";
import { boxItem } from "../art/procedural";
import { capeFor, type CapeStyle } from "../art/capes";
import type { Worn } from "../art/worn";

export const OUTFIT_KEY = "kromvia.outfit";

export type Back = "none" | "cape" | "elytra";
export type OutfitSlot = "head" | "face" | "neck" | "back" | "weapon" | "body" | "feet" | "effect";
export type OutfitStyle = CapeStyle | "custom";
export type Outfit = { equipped: Partial<Record<OutfitSlot, string>>; back: Back; style: OutfitStyle; art?: string; colors?: Record<string, number>; dev?: boolean };

export const OUTFIT_EVENT = "kromvia-outfit";

export function savedOutfit(): Outfit {
  try {
    const o = JSON.parse(localStorage.getItem(OUTFIT_KEY) ?? "");
    if (o && typeof o === "object" && o.equipped) return o;
  } catch {}
  return { equipped: {}, back: "cape", style: "kromvia" };
}

export function storeOutfit(o: Outfit) {
  try {
    localStorage.setItem(OUTFIT_KEY, JSON.stringify(o));
  } catch {}
  window.dispatchEvent(new Event(OUTFIT_EVENT));
}

function gameCape(style: OutfitStyle, art?: string) {
  const src = capeFor(style, art);
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 32;
  const g = c.getContext("2d")!;
  g.drawImage(src, 0, 0);
  g.clearRect(1, 1, 10, 16);
  g.clearRect(12, 1, 10, 16);
  g.drawImage(src, 1, 1, 10, 16, 12, 1, 10, 16);
  g.drawImage(src, 12, 1, 10, 16, 1, 1, 10, 16);
  return c.toDataURL("image/png");
}

export function outfitWorn(o: Outfit): Worn {
  const ids = Object.values(o.equipped).filter((id): id is string => !!id);
  return { models: ids.filter((id) => wearable(id)), items: ids.filter((id) => boxItem(id)), cape: o.back === "cape", style: o.style, ...(o.style === "custom" && o.art ? { art: o.art } : {}), colors: o.colors, dev: o.dev };
}

export function pushOutfit(o = savedOutfit()) {
  const w = outfitWorn(o);
  return invoke("wardrobe_push", {
    wardrobe: o,
    capePng: o.back === "cape" ? gameCape(o.style, o.art) : null,
    models: w.models,
    items: w.items,
  });
}

export function outfitFromGame(w: Omit<Outfit, "colors"> & { colors: Record<string, number> }) {
  storeOutfit({ ...savedOutfit(), ...w });
}
