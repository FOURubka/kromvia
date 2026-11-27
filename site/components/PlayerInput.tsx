"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import s from "./PlayerInput.module.css";

const API = "https://api.kromvia.com";

export function PlayerInput({ defaultValue, placeholder }: { defaultValue: string; placeholder: string }) {
  const [q, setQ] = useState(defaultValue);
  const [hits, setHits] = useState<{ id: string; name: string }[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const v = q.trim();
    if (!/^[A-Za-z0-9_]{2,16}$/.test(v)) return setHits([]);
    const ctl = new AbortController();
    const timer = setTimeout(() => {
      fetch(`${API}/v1/users?q=${encodeURIComponent(v)}`, { signal: ctl.signal })
        .then((r) => (r.ok ? r.json() : []))
        .then(setHits, () => {});
    }, 180);
    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  }, [q]);

  return (
    <div className={s.wrap}>
      <input
        className="field"
        name="q"
        value={q}
        onChange={(e) => {
          setQ(e.currentTarget.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        maxLength={16}
        autoComplete="off"
        spellCheck={false}
        autoFocus
        role="combobox"
        aria-expanded={open && hits.length > 0}
        aria-controls="player-hits"
      />
      {open && hits.length > 0 && (
        <ul id="player-hits" className={s.hits} role="listbox">
          {hits.slice(0, 8).map((h) => (
            <li key={h.id} role="option" aria-selected={false}>
              <Link href={`/u/${h.name}`}>
                <img src={`https://mc-heads.net/avatar/${h.name}/24`} alt="" width={24} height={24} />
                {h.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
