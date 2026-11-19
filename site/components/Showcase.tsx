"use client";

import { useEffect, useState } from "react";
import { shot } from "@launcher/art/gltf";
import { boxItem, boxModel } from "@launcher/art/procedural";
import { Player3D } from "./Player3D";
import s from "./Showcase.module.css";

const PICKS = ["royal_crown", "angel_halo", "demon_horns", "cyber_visor", "dragon_scarf", "dragon_wings", "phoenix_wings", "flame_blade", "angel_sword", "fox_tail"];

export function Showcase() {
  const [worn, setWorn] = useState<Record<string, string>>({ head: "royal_crown", back: "dragon_wings" });
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (touched) return;
    let i = 0;
    const id = setInterval(() => {
      i = (i + 1) % PICKS.length;
      const item = boxItem(PICKS[i]);
      if (item) setWorn((w) => ({ ...w, [item.slot]: item.id }));
    }, 2600);
    return () => clearInterval(id);
  }, [touched]);

  const toggle = (id: string) => {
    const slot = boxItem(id)!.slot;
    setTouched(true);
    setWorn((w) => {
      const next = { ...w };
      if (next[slot] === id) delete next[slot];
      else next[slot] = id;
      return next;
    });
  };

  return (
    <div className={s.showcase}>
      <div className={s.stage}>
        <Player3D className={s.player} skin="/api/skin/MHF_Steve" cosmetics={{ items: Object.values(worn) }} zoom={0.78} turn={0.7} />
      </div>
      <div className={s.picks}>
        {PICKS.map((id) => (
          <Pick key={id} id={id} on={Object.values(worn).includes(id)} onClick={() => toggle(id)} />
        ))}
      </div>
    </div>
  );
}

function Pick({ id, on, onClick }: { id: string; on: boolean; onClick: () => void }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    shot(`box:${id}`, async () => boxModel(id), 160).then(setSrc, () => {});
  }, [id]);
  return (
    <button className={s.pick} aria-pressed={on} onClick={onClick} title={boxItem(id)?.name}>
      {src && <img src={src} alt={boxItem(id)?.name ?? id} />}
    </button>
  );
}
