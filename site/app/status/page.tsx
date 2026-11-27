import type { Metadata } from "next";
import { API } from "@/lib/api";
import { getLang } from "@/lib/i18n";
import s from "../list.module.css";

export const dynamic = "force-dynamic";

const T = {
  en: {
    meta: { title: "Status", description: "Whether Kromvia sign-in, friends, updates and downloads are working right now." },
    head: "Status", lede: "Checked live when you open this page.",
    ok: "Working", down: "Not answering", slow: "Slow", checked: "Checked at",
    parts: { api: "Accounts, friends and chat", now: "Who is playing", update: "Launcher updates", download: "Downloads" },
  },
  uk: {
    meta: { title: "Статус", description: "Чи працюють зараз вхід, друзі, оновлення й завантаження Kromvia." },
    head: "Статус", lede: "Перевіряється наживо, коли відкриваєш сторінку.",
    ok: "Працює", down: "Не відповідає", slow: "Повільно", checked: "Перевірено о",
    parts: { api: "Акаунти, друзі й чат", now: "Хто грає", update: "Оновлення лаунчера", download: "Завантаження" },
  },
};

const CHECKS = [
  ["api", "/health"],
  ["now", "/v1/now"],
  ["update", "/update/linux-x86_64/x86_64/0.0.0"],
  ["download", "/download"],
] as const;

async function probe(path: string) {
  const start = Date.now();
  try {
    const res = await fetch(API + path, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    return { ok: res.ok, ms: Date.now() - start };
  } catch {
    return { ok: false, ms: Date.now() - start };
  }
}

export async function generateMetadata(): Promise<Metadata> {
  return T[await getLang()].meta;
}

export default async function Status() {
  const [results, lang] = await Promise.all([Promise.all(CHECKS.map(([, p]) => probe(p))), getLang()]);
  const t = T[lang];
  const at = new Date().toLocaleTimeString(lang === "uk" ? "uk-UA" : "en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "UTC" });
  return (
    <div className="wrap">
      <header className="page-head">
        <h1>{t.head}</h1>
        <p>{t.lede}</p>
      </header>
      <ul className={s.list}>
        {CHECKS.map(([key], i) => {
          const r = results[i];
          const label = !r.ok ? t.down : r.ms > 2000 ? t.slow : t.ok;
          return (
            <li key={key} className={`block ${s.row}`}>
              <span className={s.title}>{t.parts[key]}</span>
              <span className={s.count} style={{ color: !r.ok ? "#e45c5c" : r.ms > 2000 ? "#ffd36e" : "#7ee0b0" }}>
                {label} · {r.ms} ms
              </span>
            </li>
          );
        })}
      </ul>
      <p className="muted" style={{ marginTop: -56, marginBottom: 80 }}>
        {t.checked} {at} UTC
      </p>
    </div>
  );
}
