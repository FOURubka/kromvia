import type { Metadata } from "next";
import { now } from "@/lib/api";
import { getLang } from "@/lib/i18n";
import s from "../list.module.css";

const T = {
  en: {
    meta: { title: "Servers", description: "Public Minecraft servers where Kromvia players are playing right now." },
    head: "Where people play", lede: "Public servers where Kromvia players are playing right now, busiest first. Updated every minute.",
    empty: "Nobody is on a public server right now. Check back later.", offline: "Can't reach Kromvia servers right now.",
  },
  uk: {
    meta: { title: "Сервери", description: "Публічні сервери Minecraft, де зараз грають гравці Kromvia." },
    head: "Де зараз грають", lede: "Публічні сервери, де зараз грають гравці Kromvia, найпопулярніші зверху. Оновлюється щохвилини.",
    empty: "Зараз ніхто не грає на публічних серверах. Зазирни пізніше.", offline: "Сервери Kromvia зараз недоступні.",
  },
};

export async function generateMetadata(): Promise<Metadata> {
  return T[await getLang()].meta;
}

export default async function Servers() {
  const [data, lang] = await Promise.all([now(), getLang()]);
  const t = T[lang];
  return (
    <div className="wrap">
      <header className="page-head">
        <h1>{t.head}</h1>
        <p>{t.lede}</p>
      </header>
      {!data ? (
        <p className="muted">{t.offline}</p>
      ) : data.servers.length === 0 ? (
        <p className="muted">{t.empty}</p>
      ) : (
        <ol className={s.list}>
          {data.servers.map((sv) => (
            <li key={sv.host} className={`block ${s.row}`} style={{ gridTemplateColumns: "1fr" }}>
              <code className={s.title}>{sv.host}</code>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
