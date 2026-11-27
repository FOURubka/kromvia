import type { Metadata } from "next";
import Link from "next/link";
import { builds } from "@/lib/api";
import { getLang } from "@/lib/i18n";
import s from "../list.module.css";

const T = {
  en: {
    meta: { title: "Public builds", description: "Modpacks Kromvia players chose to share. Install any of them in one click." },
    head: "Public builds", lede: "Builds their owners chose to list. Open one to see the mods, or install it straight into Kromvia.",
    placeholder: "Build name", go: "Search", mods: (n: number) => `${n} ${n === 1 ? "file" : "files"}`, by: "by",
    open: "Open", empty: "No public builds match that yet.", offline: "Can't reach Kromvia servers right now.", more: "More", back: "Back",
  },
  uk: {
    meta: { title: "Публічні збірки", description: "Збірки, якими поділились гравці Kromvia. Встановлюються в один клік." },
    head: "Публічні збірки", lede: "Збірки, які власники самі виставили. Відкрий, щоб побачити моди, або встанови одразу в Kromvia.",
    placeholder: "Назва збірки", go: "Шукати", mods: (n: number) => `файлів: ${n}`, by: "від",
    open: "Відкрити", empty: "Поки нема публічних збірок під цей запит.", offline: "Сервери Kromvia зараз недоступні.", more: "Далі", back: "Назад",
  },
};

export async function generateMetadata(): Promise<Metadata> {
  return T[await getLang()].meta;
}

export default async function Builds({ searchParams }: PageProps<"/builds">) {
  const sp = await searchParams;
  const q = (typeof sp.q === "string" ? sp.q : "").trim().slice(0, 40);
  const page = Math.max(0, Math.min(50, Number(typeof sp.page === "string" ? sp.page : 0) || 0));
  const [list, lang] = await Promise.all([builds(q, page), getLang()]);
  const t = T[lang];
  const href = (p: number) => `/builds?${new URLSearchParams({ ...(q ? { q } : {}), ...(p ? { page: String(p) } : {}) })}`;
  return (
    <div className="wrap">
      <header className="page-head">
        <h1>{t.head}</h1>
        <p>{t.lede}</p>
      </header>
      <form className={s.form} action="/builds" role="search">
        <input className="field" name="q" defaultValue={q} placeholder={t.placeholder} maxLength={40} autoComplete="off" />
        <button className="btn" type="submit">
          {t.go}
        </button>
      </form>
      {list === null ? (
        <p className="muted">{t.offline}</p>
      ) : list.length === 0 ? (
        <p className="muted">{t.empty}</p>
      ) : (
        <ul className={s.list}>
          {list.map((b) => (
            <li key={b.code} className={`block ${s.row}`}>
              <div>
                <div className={s.title}>{b.name}</div>
                <div className={s.meta}>
                  {[b.mc, b.loader, t.mods(b.mods)].filter(Boolean).join(" · ")} · {t.by} <Link href={`/u/${b.from.name}`}>{b.from.name}</Link>
                </div>
              </div>
              <Link href={`/s/${b.code}`} className="btn">
                {t.open}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {list && (page > 0 || list.length === 24) && (
        <nav className={s.pager}>
          {page > 0 && (
            <Link className="btn ghost" href={href(page - 1)}>
              {t.back}
            </Link>
          )}
          {list.length === 24 && (
            <Link className="btn ghost" href={href(page + 1)}>
              {t.more}
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
