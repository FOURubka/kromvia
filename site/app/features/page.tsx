import type { Metadata } from "next";
import Link from "next/link";
import { BeeCards } from "@/components/BeeCard";
import { Glyph } from "@/components/Glyph";
import { ModuleSearch } from "@/components/ModuleSearch";
import { content, FORGE_VERSIONS, MODULE_COUNT, MODULE_LIST, VERSIONS } from "@/lib/content";
import { getLang } from "@/lib/i18n";
import s from "./features.module.css";

const T = {
  en: {
    meta: { title: "Features", description: `Everything in the Kromvia launcher and its built-in client: ${MODULE_COUNT}+ modules, any version, any loader.` },
    head: "Everything in Kromvia",
    lede: "The launcher handles versions, mods and Java. The built-in client adds the menu, HUD and cosmetics on top of every instance.",
    launcher: "Launcher", client: "Built-in client",
    clientNote: `Runs on Fabric and Quilt for Minecraft ${VERSIONS}, and on Forge and NeoForge for ${FORGE_VERSIONS}. Press Right Shift in any instance to open it.`,
    download: "Download Kromvia",
    search: "Search modules", none: "No module matches that.",
  },
  uk: {
    meta: { title: "Можливості", description: `Усе в лаунчері Kromvia і його вбудованому клієнті: ${MODULE_COUNT}+ модулів, будь-яка версія, будь-який лоадер.` },
    head: "Усе, що є в Kromvia",
    lede: "Лаунчер бере на себе версії, моди й Java. Вбудований клієнт додає меню, HUD і косметику в кожну збірку.",
    launcher: "Лаунчер", client: "Вбудований клієнт",
    clientNote: `Працює на Fabric і Quilt для Minecraft ${VERSIONS.replace(" to ", " до ")}, а на Forge і NeoForge для ${FORGE_VERSIONS.replace(" to ", "–")}. Натисни Right Shift у будь-якій збірці, щоб відкрити.`,
    download: "Завантажити Kromvia",
    search: "Пошук модулів", none: "Такого модуля нема.",
  },
};

export async function generateMetadata(): Promise<Metadata> {
  return T[await getLang()].meta;
}

const LOADERS = ["Vanilla", "Fabric", "Quilt", "Forge", "NeoForge", "Legacy Fabric", "Ornithe"];

export default async function Features() {
  const lang = await getLang();
  const t = T[lang];
  const { CLIENT, LAUNCHER, SOCIAL, CATEGORIES } = content(lang);
  return (
    <div className="wrap">
      <header className="page-head">
        <h1>{t.head}</h1>
        <p>{t.lede}</p>
      </header>

      <section className={s.block}>
        <h2>{t.launcher}</h2>
        <BeeCards cards={[...LAUNCHER, ...SOCIAL]} />
        <div className={s.loaders}>
          {LOADERS.map((l) => (
            <span key={l} className="chip">{l}</span>
          ))}
        </div>
      </section>

      <section className={s.block} id="client">
        <h2>{t.client}</h2>
        <p className="muted">{t.clientNote}</p>
        <BeeCards cards={CLIENT} />
        <ModuleSearch modules={MODULE_LIST} cats={CATEGORIES} placeholder={t.search} empty={t.none} />
      </section>

      <div className={s.cta}>
        <Link href="/download" className="btn big">
          <Glyph name="download" size={22} /> {t.download}
        </Link>
      </div>
    </div>
  );
}
