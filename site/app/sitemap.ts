import type { MetadataRoute } from "next";
import { MODULE_LIST } from "@/lib/content";

const PAGES = ["", "download", "features", "cosmetics", "rooms", "players", "top", "servers", "builds", "compare", "status", "faq", "changelog", "privacy", "terms"];

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    ...PAGES.map((p) => ({ url: `https://kromvia.com/${p}`, priority: p === "" ? 1 : p === "download" ? 0.9 : 0.5 })),
    ...MODULE_LIST.map((m) => ({ url: `https://kromvia.com/features/${m.id}`, priority: 0.4 })),
  ];
}
