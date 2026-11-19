import type { Metadata } from "next";
import type { CSSProperties } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Glyph } from "@/components/Glyph";
import { Player3D } from "@/components/Player3D";
import { player } from "@/lib/api";
import { itemName } from "@/lib/catalog";
import { getLang } from "@/lib/i18n";
import s from "./profile.module.css";
import c from "./card.module.css";
import { NAME_FONTS } from "@/lib/nameFonts";
import { Rich, clanIcon } from "@/lib/rich";
import { bannerBg, nameStyle } from "@launcher/profile/card";

const T = {
  en: {
    desc: (n: string) => `${n} on Kromvia: skin, cosmetics and likes.`, missing: "Player not found",
    verified: "Verified Minecraft account", likes: "likes", joined: "joined", wearing: "Wearing", cape: "Kromvia cape", devCape: "Developer cape", nothing: "Nothing yet.", badges: "Badges",
    early: ["Early bird", "Joined in Kromvia's first year"], verifiedBadge: ["Verified", "Linked a Minecraft account"], liked: ["Liked", "10 likes or more"], famous: ["Famous", "100 likes or more"],
    like: (n: string) => `Like ${n} from the launcher: Profile → Top.`, get: "Get Kromvia",
    about: "About me", music: "On repeat", listen: "Listen", favourites: "Favourites", mob: "Mob", block: "Block", biome: "Biome", version: "Version",
    server: "Main server", looking: "Looking to play", mods: "Mods I use", shot: "Showcase", links: "Connections",
    look: { pvp: "PvP", smp: "SMP", build: "Building", minigames: "Minigames", modded: "Modded", redstone: "Redstone", chat: "Just hanging out" } as Record<string, string>,
  },
  uk: {
    desc: (n: string) => `${n} у Kromvia: скін, косметика й лайки.`, missing: "Гравця не знайдено",
    verified: "Підтверджений акаунт Minecraft", likes: "лайків", joined: "з нами від", wearing: "Вдягнено", cape: "Плащ Kromvia", devCape: "Плащ розробника", nothing: "Поки нічого.", badges: "Бейджі",
    early: ["Рання пташка", "Приєднався в перший рік Kromvia"], verifiedBadge: ["Підтверджений", "Привʼязав акаунт Minecraft"], liked: ["Улюбленець", "10 лайків і більше"], famous: ["Зірка", "100 лайків і більше"],
    like: (n: string) => `Лайкнути ${n} можна в лаунчері: Профіль → Топ.`, get: "Отримати Kromvia",
    about: "Про мене", music: "Зараз слухаю", listen: "Слухати", favourites: "Улюблене", mob: "Моб", block: "Блок", biome: "Біом", version: "Версія",
    server: "Основний сервер", looking: "Шукаю з ким грати", mods: "Мої моди", shot: "Вітрина", links: "Звʼязки",
    look: { pvp: "PvP", smp: "SMP", build: "Будівництво", minigames: "Мініігри", modded: "З модами", redstone: "Редстоун", chat: "Просто потусити" } as Record<string, string>,
  },
};

export async function generateMetadata({ params }: PageProps<"/u/[name]">): Promise<Metadata> {
  const [p, lang] = await Promise.all([player((await params).name), getLang()]);
  return p ? { title: p.name, description: p.profile?.tagline ? `${p.profile.tagline}. ${T[lang].desc(p.name)}` : T[lang].desc(p.name) } : { title: T[lang].missing };
}

export default async function Profile({ params }: PageProps<"/u/[name]">) {
  const [p, lang] = await Promise.all([player((await params).name), getLang()]);
  if (!p) notFound();
  const t = T[lang];
  const worn = [...(p.cosmetics.items ?? []), ...(p.cosmetics.models ?? [])];
  const joined = new Date(p.created).toLocaleDateString(lang, { month: "long", year: "numeric" });
  const badges = [
    p.created < Date.UTC(2027, 0, 1) && t.early,
    p.verified && t.verifiedBadge,
    p.likes >= 10 && t.liked,
    p.likes >= 100 && t.famous,
  ]
    .filter((b): b is string[] => !!b)
    .map(([name, text]) => ({ name, text }));
  const card = p.profile ?? {};
  const favs = (["mob", "block", "biome", "version"] as const).filter((k) => card[k]);
  const links = card.showLinks ? Object.entries(p.links ?? {}).filter(([, v]) => v) : [];

  return (
    <div className={`wrap ${s.page}`}>
      <div className={`block glass ${s.stageBox}`}>
        <Player3D className={s.stage} skin={`/api/skin/${p.verified && p.mc_uuid ? p.mc_uuid : p.name}`} cosmetics={p.cosmetics} zoom={0.75} />
      </div>
      <div className={s.info}>
        <header
          className={c.head}
          data-effect={card.effect && card.effect !== "none" ? card.effect : undefined}
          style={card.shot && card.bannerShot ? { backgroundImage: `url("https://api.kromvia.com/share/${card.shot}")` } : { background: bannerBg(card) }}
        >
          {card.status && (
            <p className={c.status}>
              <Rich text={card.status} className={c.emoji} />
            </p>
          )}
          <div className={c.plate} data-plate={card.plate && card.plate !== "none" ? card.plate : undefined}>
            <h1 className={s.name} style={{ fontFamily: NAME_FONTS[card.nameFont ?? "default"], ...(nameStyle(card) as CSSProperties) }}>
              {p.name}
            </h1>
            {p.verified && (
              <span className={s.verified} title={t.verified}>
                <Glyph name="verified" size={30} />
              </span>
            )}
          </div>
          {(p.clan || card.tagline) && (
            <p className={c.sub}>
              {p.clan && (
                <span className={c.clan} title={p.clan.name}>
                  <img src={clanIcon(p.clan.icon)} alt="" width={16} height={16} />
                  {p.clan.tag}
                </span>
              )}
              {card.tagline && <Rich text={card.tagline} className={c.emoji} />}
            </p>
          )}
        </header>
        <div className={s.facts}>
          <div className="block">
            <b>{p.likes}</b>
            <span><Glyph name="heart" size={14} /> {t.likes}</span>
          </div>
          <div className="block">
            <b>{joined}</b>
            <span>{t.joined}</span>
          </div>
        </div>

        {card.bio && (
          <>
            <h2 className={s.h2}>{t.about}</h2>
            <p className={c.bio}>
              <Rich text={card.bio} className={c.emoji} />
            </p>
          </>
        )}

        {card.music && (
          <>
            <h2 className={s.h2}>{t.music}</h2>
            <div className={`block ${c.jukebox}`}>
              <span className={c.disc} aria-hidden />
              <span className={c.track}>
                <b>{card.music.title}</b>
                {card.music.artist && <span>{card.music.artist}</span>}
              </span>
              {card.music.url && (
                <a href={card.music.url} target="_blank" rel="noopener noreferrer nofollow">
                  {t.listen} <Glyph name="external" size={14} />
                </a>
              )}
            </div>
          </>
        )}

        {favs.length > 0 && (
          <>
            <h2 className={s.h2}>{t.favourites}</h2>
            <div className={c.slots}>
              {favs.map((k) => (
                <div key={k} className={c.slot}>
                  <span>{t[k]}</span>
                  <b>{card[k]}</b>
                </div>
              ))}
            </div>
          </>
        )}

        {card.server && (
          <>
            <h2 className={s.h2}>{t.server}</h2>
            <p className={c.server}>{card.server}</p>
          </>
        )}

        {((card.looking?.length ?? 0) > 0 || (card.mains?.length ?? 0) > 0) && (
          <>
            <h2 className={s.h2}>{t.looking}</h2>
            <div className={s.chips}>
              {card.looking?.map((l) => (
                <span key={l} className="chip on">{t.look[l]}</span>
              ))}
              {card.mains?.map((m) => (
                <span key={m} className="chip">{m}</span>
              ))}
            </div>
          </>
        )}

        {card.mods && card.mods.length > 0 && (
          <>
            <h2 className={s.h2}>{t.mods}</h2>
            <div className={s.chips}>
              {card.mods.map((m) => (
                <a key={m} className="chip" href={`https://modrinth.com/mod/${m}`} target="_blank" rel="noopener noreferrer">
                  {m}
                </a>
              ))}
            </div>
          </>
        )}

        {card.shot && !card.bannerShot && (
          <>
            <h2 className={s.h2}>{t.shot}</h2>
            <Link href={`/s/${card.shot}`} className={c.shot}>
              <img src={`https://api.kromvia.com/share/${card.shot}`} alt={t.shot} loading="lazy" />
            </Link>
          </>
        )}

        {links.length > 0 && (
          <>
            <h2 className={s.h2}>{t.links}</h2>
            <div className={s.chips}>
              {links.map(([k, v]) => (
                <span key={k} className="chip">
                  {k === "discord" && <Glyph name="discord" size={14} />} {k === "telegram" ? "Telegram: " : ""}{v}
                </span>
              ))}
            </div>
          </>
        )}

        <h2 className={s.h2}>{t.wearing}</h2>
        {worn.length || p.cosmetics.cape ? (
          <div className={s.chips}>
            {p.cosmetics.cape && <span className="chip on">{p.cosmetics.dev ? t.devCape : t.cape}</span>}
            {worn.map((id) => (
              <span key={id} className="chip">{itemName(id)}</span>
            ))}
          </div>
        ) : (
          <p className="dim">{t.nothing}</p>
        )}

        {badges.length > 0 && (
          <>
            <h2 className={s.h2}>{t.badges}</h2>
            <div className={s.badges}>
              {badges.map((b) => (
                <div key={b.name} className={`block ${s.badge}`}>
                  <b>{b.name}</b>
                  <span>{b.text}</span>
                </div>
              ))}
            </div>
          </>
        )}

        <p className={s.like}>
          {t.like(p.name)} <Link href="/download">{t.get}</Link>
        </p>
      </div>
    </div>
  );
}
