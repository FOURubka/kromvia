"use client";

import Link from "next/link";
import { useState } from "react";
import type { ModuleEntry } from "@/lib/content";
import s from "./ModuleSearch.module.css";

export function ModuleSearch({ modules, cats, placeholder, empty }: { modules: ModuleEntry[]; cats: Record<string, string>; placeholder: string; empty: string }) {
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const hits = query ? modules.filter((m) => m.name.toLowerCase().includes(query) || m.text.toLowerCase().includes(query)) : modules;
  const groups = (["PvP", "HUD", "Utility & visuals"] as const).map((c) => [c, hits.filter((m) => m.cat === c)] as const).filter(([, l]) => l.length);
  return (
    <div className={s.root}>
      <input className={s.input} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
      {groups.length === 0 ? (
        <p className="muted">{empty}</p>
      ) : (
        <div className={s.grid}>
          {groups.map(([cat, list]) => (
            <div key={cat} className={`block ${s.cat}`}>
              <h3>
                {cats[cat] ?? cat} <span className="dim">{list.length}</span>
              </h3>
              <ul>
                {list.map((m) => (
                  <li key={m.id}>
                    <Link href={`/features/${m.id}`}>{m.name}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
