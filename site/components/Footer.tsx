import Link from "next/link";
import { DISCORD_INVITE, SUPPORT_JAR, type Lang } from "@/lib/i18n-shared";
import s from "./Footer.module.css";

const T = {
  en: {
    home: "Kromvia home", download: "Download", features: "Features", cosmetics: "Cosmetics", changelog: "Changelog",
    community: "Community", players: "Find players", top: "Top players", rooms: "Rooms", support: "Support Kromvia",
    legal: "Legal", privacy: "Privacy", terms: "Terms",
    disclaimer: "Not an official Minecraft product. Not approved by or associated with Mojang or Microsoft.",
  },
  uk: {
    home: "Kromvia, головна", download: "Завантажити", features: "Можливості", cosmetics: "Косметика", changelog: "Зміни",
    community: "Спільнота", players: "Пошук гравців", top: "Топ гравців", rooms: "Кімнати", support: "Підтримати Kromvia",
    legal: "Правове", privacy: "Конфіденційність", terms: "Умови",
    disclaimer: "Не є офіційним продуктом Minecraft. Не схвалено Mojang чи Microsoft і не повʼязано з ними.",
  },
};

export function Footer({ lang }: { lang: Lang }) {
  const t = T[lang];
  return (
    <footer className={s.footer}>
      <div className={s.base}>
      <div className={`wrap ${s.grid}`}>
        <Link href="/" className={s.brand} aria-label={t.home}>
          <img src="/logo-mark.svg" alt="" width={36} height={36} />
          <div>
            <strong>Kromvia</strong>
            <p className="dim">Play · Create · Together</p>
          </div>
        </Link>
        <nav className={s.col}>
          <b>Kromvia</b>
          <Link href="/download">{t.download}</Link>
          <Link href="/features">{t.features}</Link>
          <Link href="/cosmetics">{t.cosmetics}</Link>
          <Link href="/changelog">{t.changelog}</Link>
        </nav>
        <nav className={s.col}>
          <b>{t.community}</b>
          <Link href="/players">{t.players}</Link>
          <Link href="/top">{t.top}</Link>
          <Link href="/rooms">{t.rooms}</Link>
          <Link href="/faq">FAQ</Link>
          <a href={DISCORD_INVITE} target="_blank" rel="noopener">Discord</a>
          <a href={SUPPORT_JAR} target="_blank" rel="noopener">{t.support}</a>
        </nav>
        <nav className={s.col}>
          <b>{t.legal}</b>
          <Link href="/privacy">{t.privacy}</Link>
          <Link href="/terms">{t.terms}</Link>
        </nav>
      </div>
      <div className={`wrap ${s.legal}`}>
        <span>© {new Date().getFullYear()} Kromvia</span>
        <span>{t.disclaimer}</span>
      </div>
      </div>
    </footer>
  );
}
