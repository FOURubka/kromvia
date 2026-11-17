import type { Metadata } from "next";
import { CHANGELOG } from "@/lib/changelog";
import { getLang } from "@/lib/i18n";
import s from "./changelog.module.css";

const T = {
  en: { meta: { title: "Changelog", description: "What's new in the Kromvia launcher and client." }, head: "Changelog", lede: "Kromvia isn't out yet. This is what we built so far, newest first." },
  uk: { meta: { title: "Зміни", description: "Що нового в лаунчері й клієнті Kromvia." }, head: "Зміни", lede: "Kromvia ще не вийшов. Ось що вже зроблено, від нового до старого. Записи поки англійською." },
};

export async function generateMetadata(): Promise<Metadata> {
  return { ...T[await getLang()].meta, alternates: { types: { "application/rss+xml": "/changelog/rss.xml" } } };
}

export default async function Changelog() {
  const lang = await getLang();
  return (
    <div className="wrap">
      <header className="page-head">
        <h1>{T[lang].head}</h1>
        <p>{T[lang].lede}</p>
      </header>
      <ol className={s.list}>
        {CHANGELOG.map((e) => (
          <li key={e.date} className={s.entry}>
            <time dateTime={e.date}>{new Date(e.date).toLocaleDateString(lang, { day: "numeric", month: "long", year: "numeric" })}</time>
            <div className={`block ${s.card}`}>
              <h2>{e.title}</h2>
              <ul>
                {e.items.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
