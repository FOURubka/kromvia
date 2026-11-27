import type { Metadata } from "next";
import Link from "next/link";
import { Glyph } from "@/components/Glyph";
import { top } from "@/lib/api";
import { getLang } from "@/lib/i18n";
import s from "./top.module.css";

const T = {
  en: {
    meta: { title: "Top players", description: "The most liked players on Kromvia." },
    head: "Top players", lede: "The most liked Kromvia players. To like someone, open Profile → Top in the launcher.",
    offline: "Can't reach Kromvia servers right now. Try again in a minute.", empty: "Nobody has any likes yet. Be the first.",
  },
  uk: {
    meta: { title: "Топ гравців", description: "Гравці Kromvia з найбільшою кількістю лайків." },
    head: "Топ гравців", lede: "Гравці Kromvia з найбільшою кількістю лайків. Лайкнути когось: Профіль → Топ у лаунчері.",
    offline: "Сервери Kromvia зараз недоступні. Спробуй за хвилину.", empty: "Лайків ще ні в кого нема. Будь першим.",
  },
};

export async function generateMetadata(): Promise<Metadata> {
  return T[await getLang()].meta;
}

export default async function Top() {
  const [list, lang] = await Promise.all([top(), getLang()]);
  const t = T[lang];
  return (
    <div className="wrap">
      <header className="page-head">
        <h1>{t.head}</h1>
        <p>{t.lede}</p>
      </header>
      {list === null ? (
        <Empty bee="offline" text={t.offline} />
      ) : list.length === 0 ? (
        <Empty bee="friends-alone" text={t.empty} />
      ) : (
        <ol className={s.list}>
          {list.map((p, i) => (
            <li key={p.id}>
              <Link href={`/u/${p.name}`} className={`block ${s.row}`} data-rank={i < 3 ? i + 1 : undefined}>
                <span className={s.rank}>{i + 1}</span>
                <img loading="lazy" decoding="async" src={`https://mc-heads.net/avatar/${p.name}/40`} alt="" width={40} height={40} className={s.head} />
                <span className={s.name}>
                  {p.name}
                  {p.verified && <Glyph name="verified" size={16} />}
                </span>
                <span className={s.likes}>
                  <Glyph name="heart" size={16} /> {p.likes}
                </span>
              </Link>
            </li>
          ))}
        </ol>
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
