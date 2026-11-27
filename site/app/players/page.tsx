import type { Metadata } from "next";
import Link from "next/link";
import { Glyph } from "@/components/Glyph";
import { PlayerInput } from "@/components/PlayerInput";
import { search } from "@/lib/api";
import { getLang } from "@/lib/i18n";
import s from "./players.module.css";

const T = {
  en: {
    meta: { title: "Find players", description: "Look up any Kromvia player's profile, skin and cosmetics." },
    head: "Find players", lede: "Type any part of a nickname to open someone's profile, skin and cosmetics.",
    placeholder: "Nickname", go: "Search", bad: "Nicknames use only letters, digits and _.",
    offline: "Can't reach Kromvia servers right now. Try again in a minute.", empty: (q: string) => `No players with “${q}” in their nickname.`,
  },
  uk: {
    meta: { title: "Пошук гравців", description: "Знайди профіль, скін і косметику будь-якого гравця Kromvia." },
    head: "Пошук гравців", lede: "Введи нік або його частину, щоб відкрити профіль, скін і косметику гравця.",
    placeholder: "Нік", go: "Шукати", bad: "У ніку лише літери, цифри та _.",
    offline: "Сервери Kromvia зараз недоступні. Спробуй за хвилину.", empty: (q: string) => `Нема гравців з «${q}» у ніку.`,
  },
};

export async function generateMetadata(): Promise<Metadata> {
  return T[await getLang()].meta;
}

export default async function Players({ searchParams }: PageProps<"/players">) {
  const raw = (await searchParams).q;
  const q = (typeof raw === "string" ? raw : "").trim().slice(0, 16);
  const valid = /^[A-Za-z0-9_]{1,16}$/.test(q);
  const [list, lang] = await Promise.all([valid ? search(q) : null, getLang()]);
  const t = T[lang];
  return (
    <div className="wrap">
      <header className="page-head">
        <h1>{t.head}</h1>
        <p>{t.lede}</p>
      </header>
      <form className={s.form} action="/players" role="search">
        <PlayerInput defaultValue={q} placeholder={t.placeholder} />
        <button className="btn" type="submit">
          <Glyph name="search" size={16} /> {t.go}
        </button>
      </form>
      {q === "" ? null : !valid ? (
        <p className="muted">{t.bad}</p>
      ) : list === null ? (
        <Empty bee="offline" text={t.offline} />
      ) : list.length === 0 ? (
        <Empty bee="not-found" text={t.empty(q)} />
      ) : (
        <ul className={s.list}>
          {list.map((p) => (
            <li key={p.id}>
              <Link href={`/u/${p.name}`} className={`block ${s.row}`}>
                <img loading="lazy" decoding="async" src={`https://mc-heads.net/avatar/${p.name}/40`} alt="" width={40} height={40} className={s.head} />
                <span className={s.name}>
                  {p.name}
                  {p.verified && <Glyph name="verified" size={16} />}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Empty({ bee, text }: { bee: string; text: string }) {
  return (
    <div className={s.empty}>
      <img loading="lazy" decoding="async" src={`/bee/${bee}.webp`} alt="" />
      <p className="muted">{text}</p>
    </div>
  );
}
