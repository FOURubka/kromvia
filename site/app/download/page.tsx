import type { Metadata } from "next";
import { Glyph } from "@/components/Glyph";
import { release } from "@/lib/api";
import { getLang, getOs, type Os } from "@/lib/i18n";
import { DISCORD_INVITE } from "@/lib/i18n-shared";
import s from "./download.module.css";

const T = {
  en: {
    meta: { title: "Download", description: "Download the Kromvia launcher for Windows, macOS and Linux." },
    head: "Get Kromvia",
    released: (v: string, d: string) => `Version ${v}, released ${d}. It updates itself after that.`,
    soon: "The first release is on its way. Check back soon.",
    notes: { windows: "Windows 10 and 11, 64-bit", macos: "Apple Silicon", linux: "AppImage for any distro, or a .deb for Debian and Ubuntu" },
    download: "Download", comingSoon: "Coming soon", yours: "Your system",
    after: "After installing",
    steps: ["Sign in with Microsoft, or play offline with a nickname.", "Create an instance: pick a version and a loader.", "Press Play. In game, Right Shift opens the Kromvia menu."],
    help: "Stuck? Ask in our Discord.",
  },
  uk: {
    meta: { title: "Завантажити", description: "Завантаж лаунчер Kromvia для Windows, macOS і Linux." },
    head: "Отримати Kromvia",
    released: (v: string, d: string) => `Версія ${v}, вийшла ${d}. Далі оновлюється сама.`,
    soon: "Перший реліз уже на підході. Заглядай незабаром.",
    notes: { windows: "Windows 10 і 11, 64-біт", macos: "Apple Silicon", linux: "AppImage для будь-якого дистрибутива або .deb для Debian і Ubuntu" },
    download: "Завантажити", comingSoon: "Скоро", yours: "Твоя система",
    after: "Після встановлення",
    steps: ["Увійди через Microsoft або грай офлайн з ніком.", "Створи збірку: вибери версію й лоадер.", "Натисни Грати. У грі Right Shift відкриває меню Kromvia."],
    help: "Щось не виходить? Питай у нашому Discord.",
  },
};

export async function generateMetadata(): Promise<Metadata> {
  return T[await getLang()].meta;
}

const PLATFORMS: { os: Os; name: string; bee: string; files: { id: string; label?: string }[] }[] = [
  { os: "windows", name: "Windows", bee: "os-windows", files: [{ id: "windows" }] },
  { os: "macos", name: "macOS", bee: "os-macos", files: [{ id: "macos" }] },
  { os: "linux", name: "Linux", bee: "os-linux", files: [{ id: "linux-appimage", label: "AppImage" }, { id: "linux-deb", label: ".deb" }] },
];

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(0)} MB`;

export default async function Download() {
  const [rel, lang, os] = await Promise.all([release(), getLang(), getOs()]);
  const t = T[lang];
  const platforms = [...PLATFORMS].sort((a, b) => Number(b.os === os) - Number(a.os === os));
  return (
    <div className="wrap">
      <header className={`page-head ${s.head}`}>
        <h1>{t.head}</h1>
        <p>
          {rel
            ? t.released(rel.version, new Date(rel.published).toLocaleDateString(lang, { day: "numeric", month: "long", year: "numeric" }))
            : t.soon}
        </p>
      </header>
      <div className={s.grid}>
        {platforms.map((p) => {
          const files = p.files.flatMap((f) => {
            const file = rel?.files.find((r) => r.platform === f.id);
            return file ? [{ ...file, label: f.label ?? t.download }] : [];
          });
          return (
            <div key={p.os} className={`block ${s.card}`} data-yours={p.os === os || undefined}>
              <img loading="lazy" decoding="async" src={`/bee/${p.bee}.webp`} alt="" className={s.bee} />
              {p.os === os && <span className={`chip on ${s.yours}`}>{t.yours}</span>}
              <h2>{p.name}</h2>
              <p className={`dim ${s.note}`}>{t.notes[p.os]}</p>
              <div className={s.buttons}>
                {files.length ? (
                  files.map((f) => (
                    <a key={f.platform} href={f.url} className="btn">
                      <Glyph name="download" size={16} /> {f.label} <span className={s.size}>{mb(f.size)}</span>
                    </a>
                  ))
                ) : (
                  <span className="btn ghost" aria-disabled="true">
                    {t.comingSoon}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className={s.after}>
        <div>
          <h3>{t.after}</h3>
          <ol>
            {t.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <p>
            <a href={DISCORD_INVITE} target="_blank" rel="noopener">
              {t.help}
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
