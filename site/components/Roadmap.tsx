"use client";

import { useEffect, useState } from "react";
import s from "./Roadmap.module.css";

export type Item = { id: string; title: string; body: string; votes: number };
type Count = { id: string; votes: number; voted: boolean };

export function Roadmap({ api, items, offline, votesLabel }: { api: string; items: Item[]; offline: string | null; votesLabel: string }) {
  const [counts, setCounts] = useState<Count[] | null>(null);
  const [error, setError] = useState(offline);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${api}/v1/roadmap`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((c: Count[]) => {
        setCounts(c);
        setError(null);
      })
      .catch(() => {});
  }, [api]);

  async function vote(id: string) {
    setBusy(id);
    try {
      const r = await fetch(`${api}/v1/roadmap/${id}/vote`, { method: "POST" });
      if (!r.ok) throw new Error();
      setCounts(await r.json());
      setError(null);
    } catch {
      setError(offline ?? "");
    } finally {
      setBusy(null);
    }
  }

  const rows = items
    .map((i) => {
      const c = counts?.find((x) => x.id === i.id);
      return { ...i, votes: c?.votes ?? i.votes, voted: c?.voted ?? false };
    })
    .sort((a, b) => b.votes - a.votes);

  return (
    <>
      {error && <p className="muted">{error}</p>}
      <ol className={s.list}>
        {rows.map((r) => (
          <li key={r.id} className={`block ${s.item}`}>
            <button className={s.vote} data-on={r.voted || undefined} disabled={busy === r.id || counts === null} onClick={() => vote(r.id)} aria-pressed={r.voted}>
              <span className={s.arrow}>▲</span>
              <span className={s.n}>{r.votes}</span>
              <span className={s.hidden}>{votesLabel}</span>
            </button>
            <div>
              <h2>{r.title}</h2>
              <p className="muted">{r.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </>
  );
}
