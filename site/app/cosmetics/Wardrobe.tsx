"use client";

import { useEffect, useState } from "react";
import { modelShot, shot } from "@launcher/art/gltf";
import { boxModel } from "@launcher/art/procedural";
import { Player3D } from "@/components/Player3D";
import type { CatalogItem } from "@/lib/catalog";
import SETS from "@launcher/art/sets.json";
import s from "./cosmetics.module.css";

const SLOTS = ["head", "face", "neck", "back", "weapon", "body", "feet"];

type CosmeticSet = { id: string; name: string; items: string[] };

export function Wardrobe({ items }: { items: CatalogItem[] }) {
  const slotOf = (id: string) => items.find((i) => i.id === id)?.slot;
  const outfit = (set: CosmeticSet) => Object.fromEntries(set.items.flatMap((id) => (slotOf(id) ? [[slotOf(id)!, id]] : [])));
  const sets = SETS as CosmeticSet[];

  const [worn, setWorn] = useState<Record<string, string>>(() => outfit(sets.find((x) => x.id === "angel") ?? sets[0]));
  const [cape, setCape] = useState(false);
  const [slot, setSlot] = useState<string | null>(null);

  const toggle = (it: CatalogItem) =>
    setWorn((w) => {
      const next = { ...w };
      if (next[it.slot] === it.id) delete next[it.slot];
      else next[it.slot] = it.id;
      return next;
    });

  const ids = Object.values(worn);
  const byKind = (k: CatalogItem["kind"]) => ids.filter((id) => items.find((i) => i.id === id)?.kind === k);
  const shown = items.filter((i) => !slot || i.slot === slot);
  const credited = items.filter((i) => i.credit);

  return (
    <>
      <div className={s.layout}>
        <div className={`block glass ${s.stageBox}`}>
          <Player3D className={s.stage} cosmetics={{ models: byKind("model"), items: byKind("box"), cape }} zoom={0.72} />
          <div className={s.stageBar}>
            <button className={`chip ${cape ? "on" : ""}`} onClick={() => setCape(!cape)} aria-pressed={cape}>
              Kromvia cape
            </button>
            {ids.length > 0 && (
              <button className="chip" onClick={() => setWorn({})}>
                Take all off
              </button>
            )}
          </div>
        </div>
        <div>
          <div className={s.filters}>
            {sets.map((set) => {
              const want = outfit(set);
              const on = Object.keys(want).length === Object.keys(worn).length && Object.entries(want).every(([k, v]) => worn[k] === v);
              return (
                <button key={set.id} className={`chip ${on ? "on" : ""}`} aria-pressed={on} onClick={() => setWorn(outfit(set))}>
                  {set.name}
                </button>
              );
            })}
          </div>
          <div className={s.filters}>
            <button className={`chip ${slot === null ? "on" : ""}`} onClick={() => setSlot(null)}>All</button>
            {SLOTS.filter((sl) => items.some((i) => i.slot === sl)).map((sl) => (
              <button key={sl} className={`chip ${slot === sl ? "on" : ""}`} onClick={() => setSlot(sl)}>
                {sl[0].toUpperCase() + sl.slice(1)}
              </button>
            ))}
          </div>
          <div className={s.grid}>
            {shown.map((it) => (
              <Card key={it.id} item={it} on={worn[it.slot] === it.id} onClick={() => toggle(it)} />
            ))}
          </div>
        </div>
      </div>
      <p className={s.credits}>
        3D models under CC BY 4.0:{" "}
        {credited.map((c, i) => (
          <span key={c.id}>
            {i > 0 && ", "}
            {c.name} by <a href={c.credit!.url} target="_blank" rel="noreferrer">{c.credit!.author}</a>
          </span>
        ))}
        .
      </p>
    </>
  );
}

function Card({ item, on, onClick }: { item: CatalogItem; on: boolean; onClick: () => void }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    const p = item.kind === "model" ? modelShot(item.id, 256) : shot(`box:${item.id}`, async () => boxModel(item.id), 256);
    p.then(setSrc, () => {});
  }, [item]);
  return (
    <button className={`block ${s.card}`} aria-pressed={on} onClick={onClick}>
      {src ? <img loading="lazy" decoding="async" src={src} alt="" /> : <span className={s.ph} />}
      <span>{item.name}</span>
    </button>
  );
}
