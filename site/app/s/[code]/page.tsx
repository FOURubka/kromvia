import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Glyph } from "@/components/Glyph";
import { share } from "@/lib/api";
import { getLang } from "@/lib/i18n";
import s from "./share.module.css";

const T = {
  en: {
    title: "Shared from Kromvia", shot: "Shared screenshot", from: (c: string) => `Shared from Kromvia · code ${c}`, log: "Shared log",
    mods: (n: number) => `${n} mods`, packs: (n: number) => `${n} packs and shaders`,
    pack: (src: string) => `Modpack from ${src}`, added: (n: number) => `${n} added on top`,
    by: "From", open: "Open in Kromvia", get: "Get Kromvia",
    install: (c: string) => <>Nothing happened? In Kromvia, press &quot;New instance&quot;, pick &quot;Friend&apos;s code&quot; and enter <b>{c}</b>.</>,
    buildDesc: (n: string, mc: string, mods: number) => `Kromvia instance "${n}" for Minecraft ${mc}, ${mods} mods.`,
  },
  uk: {
    title: "Поширено з Kromvia", shot: "Скріншот", from: (c: string) => `Поширено з Kromvia · код ${c}`, log: "Лог",
    mods: (n: number) => `модів: ${n}`, packs: (n: number) => `паків і шейдерів: ${n}`,
    pack: (src: string) => `Модпак з ${src}`, added: (n: number) => `додано зверху: ${n}`,
    by: "Від", open: "Відкрити в Kromvia", get: "Завантажити Kromvia",
    install: (c: string) => <>Нічого не сталось? У Kromvia натисни «Нова збірка», обери «Код друга» і введи <b>{c}</b>.</>,
    buildDesc: (n: string, mc: string, mods: number) => `Збірка Kromvia «${n}» для Minecraft ${mc}, модів: ${mods}.`,
  },
};

export async function generateMetadata({ params }: PageProps<"/s/[code]">): Promise<Metadata> {
  const [sh, lang] = await Promise.all([share((await params).code), getLang()]);
  const t = T[lang];
  if (sh?.kind === "build") {
    const mods = sh.data.files.filter((f) => f.path.startsWith("mods/")).length;
    return { title: sh.data.name, description: t.buildDesc(sh.data.name, sh.data.dependencies.minecraft, mods) };
  }
  return { title: sh?.kind === "log" ? t.log : t.title };
}

const LOADER_KEYS: Record<string, string> = { "fabric-loader": "Fabric", "quilt-loader": "Quilt", forge: "Forge", neoforge: "NeoForge" };

export default async function Shared({ params }: PageProps<"/s/[code]">) {
  const { code } = await params;
  const [sh, lang] = await Promise.all([share(code), getLang()]);
  if (!sh) notFound();
  const t = T[lang];

  if (sh.kind === "screenshot")
    return (
      <div className={`wrap ${s.page}`}>
        <img src={sh.url} alt={t.shot} className={s.shot} />
        <p className="dim">{t.from(code.toUpperCase())}</p>
      </div>
    );

  if (sh.kind === "log")
    return (
      <div className={`wrap ${s.page}`}>
        <h1 className={s.title}>{t.log}</h1>
        <pre className={`block ${s.log}`}>{sh.text}</pre>
      </div>
    );

  const { data, from } = sh;
  const loader = Object.entries(data.dependencies).find(([k]) => k !== "minecraft");
  const mods = data.files.filter((f) => f.path.startsWith("mods/"));
  const other = data.files.length - mods.length;
  return (
    <div className={`wrap ${s.page}`}>
      <h1 className={s.title}>{data.name}</h1>
      <div className={s.chips}>
        <span className="chip on">Minecraft {data.dependencies.minecraft}</span>
        {loader && <span className="chip">{LOADER_KEYS[loader[0]] ?? loader[0]} {loader[1]}</span>}
        {data.pack && <span className="chip">{t.pack(data.pack.source === "curseforge" ? "CurseForge" : "Modrinth")}</span>}
        <span className="chip">{data.pack ? t.added(data.files.length) : t.mods(mods.length)}</span>
        {!data.pack && other > 0 && <span className="chip">{t.packs(other)}</span>}
      </div>
      <p className="muted">
        {t.by} <Link href={`/u/${from.name}`}>{from.name}</Link>
      </p>
      <div className={s.actions}>
        <a href={`kromvia://pack/${code.toUpperCase()}`} className="btn big">
          <Glyph name="download" size={20} /> {t.open}
        </a>
        <Link href="/download" className="btn ghost">
          {t.get}
        </Link>
      </div>
      <p className="dim">{t.install(code.toUpperCase())}</p>
      <ul className={`block ${s.files}`}>
        {data.files.map((f) => (
          <li key={f.path}>
            <span>{f.path.split("/").pop()}</span>
            <span className="dim">{f.path.split("/")[0]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
