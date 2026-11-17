import Link from "next/link";
import { BeeCards } from "@/components/BeeCard";
import { Glyph } from "@/components/Glyph";
import { HeroMontage } from "@/components/HeroMontage";
import { Showcase } from "@/components/Showcase";
import { content } from "@/lib/content";
import { getLang, getOs, OS_NAME } from "@/lib/i18n";
import s from "./home.module.css";

const T = {
  en: {
    title: "Minecraft launcher with its own built-in client",
    lede: "Install it, pick a version and press Play. The HUD, zoom, keystrokes and cosmetics are already in the game on Right Shift, so there are no mods to hunt for.",
    launch: "Launch your world", downloadFor: (os: string) => `Download for ${os}`, features: "See features",
    menuTitle: "Everything opens with Right Shift",
    menuText: "You don't have to hunt for mods. The Kromvia client is added to every instance, and its menu holds the HUD, PvP tools, visuals and cosmetics.",
    dressTitle: "Dress up your player",
    dressText: "Wings, capes, hats and auras. Put them on in the launcher wardrobe or in game, and other Kromvia players on your server will see them.",
    browse: "Browse cosmetics",
    boring: "The launcher handles the boring part",
    friends: "Play with friends without running a server",
    roomsAlt: "A Kromvia bee opening a door",
    shotAlt: "The Instances page of the Kromvia launcher with a list of installed mods",
  },
  uk: {
    title: "Лаунчер Minecraft з власним вбудованим клієнтом",
    lede: "Встанови, вибери версію й натисни «Грати». HUD, зум, keystrokes і косметика вже в грі на Right Shift, тож моди шукати не треба.",
    launch: "Запустити свій світ", downloadFor: (os: string) => `Завантажити для ${os}`, features: "Усі можливості",
    menuTitle: "Усе відкривається на Right Shift",
    menuText: "Не треба шукати моди. Клієнт Kromvia додається в кожну збірку, а в його меню HUD, PvP-інструменти, візуали й косметика.",
    dressTitle: "Вдягни свого гравця",
    dressText: "Крила, плащі, капелюхи й аури. Вдягай у гардеробі лаунчера чи в грі, і інші гравці Kromvia на твоєму сервері це побачать.",
    browse: "Переглянути косметику",
    boring: "Нудну частину лаунчер бере на себе",
    friends: "Грай з друзями без свого сервера",
    roomsAlt: "Бджілка Kromvia відчиняє двері",
    shotAlt: "Сторінка збірок у лаунчері Kromvia зі списком встановлених модів",
  },
};

export default async function Home() {
  const lang = await getLang();
  const os = await getOs();
  const t = T[lang];
  const { CLIENT, LAUNCHER, SOCIAL } = content(lang);
  return (
    <>
      <section className={s.hero}>
        <div className={`wrap ${s.heroGrid}`}>
          <div className={s.heroText}>
            <h1 className={s.title}>{t.title}</h1>
            <p className={s.lede}>{t.lede}</p>
            <div className={s.actions}>
              <Link href="/download" className="btn big">
                {os ? t.downloadFor(OS_NAME[os]) : t.launch} <Glyph name="arrow" size={22} />
              </Link>
              <Link href="/features" className={`btn ghost ${s.second}`}>
                {t.features}
              </Link>
            </div>
          </div>
          <div className={s.heroMock}>
            <HeroMontage alt={t.shotAlt} />
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <div className="section-head">
            <h2>{t.menuTitle}</h2>
            <p>{t.menuText}</p>
          </div>
          <div className={s.shots}>
            <img src="/shots/client-title.webp" alt="" width={1672} height={940} loading="lazy" className={s.shot} />
            <img src="/shots/client-menu.webp" alt="" width={1680} height={850} loading="lazy" className={s.shot} />
          </div>
          <BeeCards cards={CLIENT} />
        </div>
      </section>

      <section className="section">
        <div className={`wrap ${s.split}`}>
          <Showcase />
          <div className="section-head">
            <h2>{t.dressTitle}</h2>
            <p>{t.dressText}</p>
            <div className={s.actionsLeft}>
              <Link href="/cosmetics" className="btn">
                {t.browse} <Glyph name="arrow" size={16} />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <div className="section-head center">
            <h2>{t.boring}</h2>
          </div>
          <img src="/shots/launcher-instances.webp" alt={t.shotAlt} width={1440} height={900} loading="lazy" className={s.shot} />
          <div className={s.feats}>
            {LAUNCHER.map((c) => (
              <div key={c.title}>
                <b>{c.title}</b>
                <p>{c.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className={`wrap ${s.split}`}>
          <div className="section-head">
            <h2>{t.friends}</h2>
            {SOCIAL.map((c) => (
              <div key={c.title} className={s.socialRow}>
                <div>
                  <b>{c.title}</b>
                  <p>{c.text}</p>
                </div>
              </div>
            ))}
          </div>
          <div className={s.roomsArt}>
            <img src="/bee/rooms.webp" alt={t.roomsAlt} className={s.roomsBee} />
          </div>
        </div>
      </section>

    </>
  );
}
