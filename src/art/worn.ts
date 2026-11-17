import { useEffect } from "react";
import type { SkinViewer } from "skinview3d";
import { capeFor } from "./capes";
import { wearDevCape } from "./devCape";
import { boxItem, wearBox } from "./procedural";
import { wear, wearable } from "./wear";

export type Worn = { models?: string[]; items?: string[]; cape?: boolean; style?: string; art?: string; colors?: Record<string, number>; dev?: boolean };

export function useWorn(viewer: SkinViewer | null, worn: Worn | undefined) {
  const models = (worn?.models ?? []).filter(wearable);
  const items = (worn?.items ?? []).filter((id) => boxItem(id)?.pieces.length);
  const style = worn?.style;
  const art = worn?.style === "custom" ? worn.art : undefined;
  const wings = models.some((id) => id.startsWith("wings")) || items.some((id) => boxItem(id)?.slot === "back");
  const cape = !!worn?.cape && !wings;
  const dev = cape && !!worn?.dev;

  useEffect(() => {
    if (!viewer || !worn) return;
    if (dev) {
      const off = wearDevCape(viewer);
      return () => {
        off();
        viewer.loadCape(null);
      };
    }
    if (cape) viewer.loadCape(capeFor(style, art));
    else viewer.loadCape(null);
  }, [viewer, !!worn, cape, dev, style, art]);

  const modelKey = models.join(",");
  useEffect(() => {
    if (!viewer) return;
    let offs: (() => void)[] = [];
    let alive = true;
    Promise.all(models.map((id) => wear(viewer, id).catch(() => () => {}))).then((fns) => {
      if (alive) offs = fns;
      else fns.forEach((f) => f());
    });
    return () => {
      alive = false;
      offs.forEach((f) => f());
    };
  }, [viewer, modelKey]);

  const colors = worn?.colors ?? {};
  const itemKey = items.map((id) => `${id}:${colors[id] ?? ""}`).join(",");
  useEffect(() => {
    if (!viewer) return;
    const offs = items.map((id) => {
      const c = colors[id] ?? boxItem(id)?.color ?? 0xffffffff;
      return wearBox(viewer, id, () => c);
    });
    return () => offs.forEach((f) => f());
  }, [viewer, itemKey]);
}
