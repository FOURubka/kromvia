import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Glyph } from "@/components/Glyph";
import { content, FORGE_VERSIONS, MODULE_LIST, VERSIONS } from "@/lib/content";
import { getLang } from "@/lib/i18n";
import s from "./module.module.css";

const T = {
  en: {
    back: "All modules",
    how: `Open the menu with Right Shift in any instance and switch it on. Works on Fabric and Quilt for Minecraft ${VERSIONS}, and on Forge and NeoForge for ${FORGE_VERSIONS}; a few modules need a newer version.`,
    more: "More in",
    download: "Download Kromvia",
  },
  uk: {
    back: "Усі модулі",
    how: `Відкрий меню на Right Shift у будь-якій збірці й увімкни. Працює на Fabric і Quilt для Minecraft ${VERSIONS.replace(" to ", " до ")}, а на Forge і NeoForge для ${FORGE_VERSIONS.replace(" to ", "–")}; деяким модулям потрібна новіша версія.`,
    more: "Ще в категорії",
    download: "Завантажити Kromvia",
  },
};

export function generateStaticParams() {
  return MODULE_LIST.map((m) => ({ id: m.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const m = MODULE_LIST.find((x) => x.id === id);
  return m ? { title: m.name, description: m.text } : {};
}

export default async function ModulePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const m = MODULE_LIST.find((x) => x.id === id);
  if (!m) notFound();
  const lang = await getLang();
  const t = T[lang];
  const cat = content(lang).CATEGORIES[m.cat] ?? m.cat;
  const others = MODULE_LIST.filter((x) => x.cat === m.cat && x.id !== m.id).slice(0, 12);
  return (
    <div className="wrap">
      <Link href="/features#client" className={s.back}>
        ← {t.back}
      </Link>
      <header className="page-head">
        <span className="chip">{cat}</span>
        <h1>{m.name}</h1>
        <p>{m.text}</p>
      </header>
      <p className={`muted ${s.how}`}>{t.how}</p>
      <section className={s.more}>
        <h2>
          {t.more} {cat}
        </h2>
        <ul>
          {others.map((o) => (
            <li key={o.id}>
              <Link href={`/features/${o.id}`}>{o.name}</Link>
            </li>
          ))}
        </ul>
      </section>
      <div className={s.cta}>
        <Link href="/download" className="btn big">
          <Glyph name="download" size={22} /> {t.download}
        </Link>
      </div>
    </div>
  );
}
