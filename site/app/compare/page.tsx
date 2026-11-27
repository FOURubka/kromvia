import type { Metadata } from "next";
import Link from "next/link";
import { getLang } from "@/lib/i18n";
import s from "./compare.module.css";

type Cell = "yes" | "no" | "part";

const ROWS: { en: string; uk: string; cells: [Cell, Cell, Cell] }[] = [
  { en: "HUD, PvP and utility modules built in", uk: "Вбудовані HUD, PvP і утиліти", cells: ["yes", "yes", "no"] },
  { en: "Your own modpacks on Fabric, Forge, NeoForge or Quilt", uk: "Свої збірки на Fabric, Forge, NeoForge чи Quilt", cells: ["yes", "part", "yes"] },
  { en: "Modrinth and CurseForge browser inside the launcher", uk: "Пошук модів з Modrinth і CurseForge у лаунчері", cells: ["yes", "part", "yes"] },
  { en: "Imports instances from other launchers", uk: "Імпорт збірок з інших лаунчерів", cells: ["yes", "no", "part"] },
  { en: "Cosmetics are free, no shop", uk: "Косметика безкоштовна, без магазину", cells: ["yes", "no", "no"] },
];

const T = {
  en: {
    meta: { title: "Kromvia compared", description: "How Kromvia compares with client launchers like Lunar and Feather and mod launchers like Prism." },
    head: "How Kromvia compares", lede: "Client launchers give you PvP modules but little control over mods. Mod launchers give you control but no client. Kromvia does both.",
    cols: ["Kromvia", "Lunar, Feather", "Prism, MultiMC"], yes: "Yes", no: "No", part: "Partly",
    note: "Prism and MultiMC have no cosmetics at all. Other launchers change over time, so tell us on Discord if a cell is out of date.",
    download: "Download Kromvia",
  },
  uk: {
    meta: { title: "Kromvia у порівнянні", description: "Чим Kromvia відрізняється від клієнтів на кшталт Lunar і Feather та лаунчерів модів на кшталт Prism." },
    head: "Kromvia у порівнянні", lede: "Клієнти дають PvP-модулі, але мало свободи з модами. Лаунчери модів дають свободу, але без клієнта. Kromvia вміє обидва.",
    cols: ["Kromvia", "Lunar, Feather", "Prism, MultiMC"], yes: "Так", no: "Ні", part: "Частково",
    note: "У Prism і MultiMC косметики нема взагалі. Інші лаунчери змінюються, тож якщо клітинка застаріла, напиши в Discord.",
    download: "Завантажити Kromvia",
  },
};

export async function generateMetadata(): Promise<Metadata> {
  return T[await getLang()].meta;
}

export default async function Compare() {
  const lang = await getLang();
  const t = T[lang];
  return (
    <div className="wrap">
      <header className="page-head">
        <h1>{t.head}</h1>
        <p>{t.lede}</p>
      </header>
      <div className={s.scroll}>
        <table className={s.table}>
          <thead>
            <tr>
              <th />
              {t.cols.map((c, i) => (
                <th key={c} data-own={i === 0 ? "" : undefined}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.en}>
                <th scope="row">{r[lang]}</th>
                {r.cells.map((c, i) => (
                  <td key={i} data-cell={c} data-own={i === 0 ? "" : undefined}>
                    {t[c]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted">{t.note}</p>
      <p className={s.cta}>
        <Link href="/download" className="btn big">
          {t.download}
        </Link>
      </p>
    </div>
  );
}
