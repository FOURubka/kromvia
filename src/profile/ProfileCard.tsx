import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useI18n } from "../i18n";
import type { MessageKey } from "../i18n/en";
import { Head } from "../friends/Head";
import { Glyph } from "../ui/Glyph";
import { emblemUrl } from "../art/emblems";
import { FONT_FAMILY, SHOT_URL, bannerBg, nameStyle, type Card, type CardOwner, type ClanTag, type Game } from "./card";
import { Rich } from "./Rich";
import type { PublicStats } from "./stats";
import "./fonts";
import "./card.css";

const open = (url: string) => openUrl(url).catch(() => {});

export function ClanChip({ clan, onClick }: { clan: ClanTag; onClick?: () => void }) {
  const icon = clan.icon === "kromvia" ? "/logo.svg" : emblemUrl(clan.icon);
  const body = (
    <>
      <img src={icon} alt="" width={14} height={14} />
      {clan.tag}
    </>
  );
  return onClick ? (
    <button className="pcard-clan" title={clan.name} onClick={onClick}>
      {body}
    </button>
  ) : (
    <span className="pcard-clan" title={clan.name}>
      {body}
    </span>
  );
}

function elapsed(since: number) {
  const s = Math.max(0, Math.floor((Date.now() - since) / 1000));
  const h = Math.floor(s / 3600),
    m = Math.floor((s % 3600) / 60),
    sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}

export function GameTimer({ game }: { game: Game }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="pcard-timer">{elapsed(game.since)}</span>;
}

export function ProfileCard({
  card,
  owner,
  badges,
  actions,
  onJoinServer,
  onClan,
  stats,
}: {
  card: Card;
  owner: CardOwner;
  badges?: ReactNode;
  actions?: ReactNode;
  onJoinServer?: (host: string) => void;
  onClan?: () => void;
  stats?: PublicStats;
}) {
  const { t } = useI18n();
  const favs = (
    [
      ["mob", card.mob],
      ["block", card.block],
      ["biome", card.biome],
      ["version", card.version],
    ] as const
  ).filter(([, v]) => v);
  const links = card.showLinks ? Object.entries(owner.links ?? {}).filter(([, v]) => v) : [];
  const presence = owner.presence ?? (owner.online === undefined ? undefined : owner.online ? "online" : "offline");
  const shotBanner = !!(card.shot && card.bannerShot);
  const banner: CSSProperties = shotBanner ? { backgroundImage: `url("${SHOT_URL(card.shot!)}")` } : { background: bannerBg(card) };

  return (
    <article className="pcard" data-effect={card.effect && card.effect !== "none" ? card.effect : undefined}>
      <div className="pcard-banner" style={banner} />
      <div className="pcard-top">
        <span className="pcard-avatar" data-frame={card.frame && card.frame !== "none" ? card.frame : undefined}>
          <Head name={owner.name} size={84} />
        </span>
        {card.status && (
          <p className="pcard-status">
            <Rich text={card.status} />
          </p>
        )}
      </div>

      <header className="pcard-id">
        <div className="pcard-plate" data-plate={card.plate && card.plate !== "none" ? card.plate : undefined}>
          <h2 className="pcard-name" style={{ fontFamily: FONT_FAMILY[card.nameFont ?? "default"], ...nameStyle(card) }}>
            {owner.name}
          </h2>
          {owner.verified && (
            <span className="pcard-verified" title={t("profile.verified")}>
              <Glyph name="check" size={11} />
            </span>
          )}
        </div>
        <p className="pcard-sub">
          {presence && (
            <span className="pcard-online" data-presence={presence}>
              {t(`presence.${presence}` as MessageKey)}
            </span>
          )}
          {owner.clan && <ClanChip clan={owner.clan} onClick={onClan} />}
          {card.tagline && (
            <span>
              <Rich text={card.tagline} />
            </span>
          )}
        </p>
        {badges && <div className="pcard-badges">{badges}</div>}
        {actions && <div className="pcard-actions">{actions}</div>}
      </header>

      <div className="pcard-body">
        {owner.game && (
          <section>
            <h3>{t("card.playing")}</h3>
            <div className="pcard-row pcard-game">
              <img src="/logo.svg" alt="" width={40} height={40} />
              <span className="pcard-track">
                <b>Minecraft {owner.game.mc}</b>
                <small className="muted">{owner.playing ?? t("card.inGame")}</small>
                <small>
                  <Glyph name="device-gamepad" size={13} /> <GameTimer game={owner.game} />
                </small>
              </span>
              {owner.playing && onJoinServer && (
                <button className="btn btn-ghost" onClick={() => onJoinServer(owner.playing!)}>
                  <Glyph name="login-2" /> {t("friends.join")}
                </button>
              )}
            </div>
          </section>
        )}

        {stats && (stats.hours !== undefined || !!stats.game || (stats.modules?.length ?? 0) > 0) && (
          <section>
            <h3>{t("card.client")}</h3>
            <div className="pcard-chips">
              {stats.hours !== undefined && (
                <span className="pcard-chip">
                  <Glyph name="device-gamepad" size={13} /> {t("card.hours", { n: stats.hours })}
                </span>
              )}
              {stats.launches !== undefined && (
                <span className="pcard-chip">
                  <Glyph name="player-play" size={13} /> {t("card.launches", { n: stats.launches })}
                </span>
              )}
            </div>
            {stats.game && (
              <div className="pcard-chips">
                <span className="pcard-chip">{t("card.kills", { n: stats.game.kills })}</span>
                <span className="pcard-chip">{t("card.deaths", { n: stats.game.deaths })}</span>
                {stats.game.deaths > 0 && <span className="pcard-chip">K/D {Math.round((stats.game.kills / stats.game.deaths) * 100) / 100}</span>}
                {stats.game.cps > 0 && <span className="pcard-chip">{t("card.cps", { n: stats.game.cps })}</span>}
                {stats.game.elytra > 0 && <span className="pcard-chip">{t("card.elytra", { n: stats.game.elytra })}</span>}
                {stats.game.totems > 0 && <span className="pcard-chip">{t("card.totems", { n: stats.game.totems })}</span>}
              </div>
            )}
            {(stats.modules?.length ?? 0) > 0 && (
              <div className="pcard-chips" title={t("card.modules")}>
                {stats.modules!.map((m) => (
                  <span key={m} className="pcard-chip" data-on>
                    {m.replace(/_/g, " ").replace(/^\w/, (x) => x.toUpperCase())}
                  </span>
                ))}
              </div>
            )}
          </section>
        )}

        {card.bio && (
          <section>
            <h3>{t("card.about")}</h3>
            <p className="pcard-bio">
              <Rich text={card.bio} />
            </p>
          </section>
        )}

        {card.music && (
          <section>
            <h3>{t("card.music")}</h3>
            <div className="pcard-jukebox">
              <span className="pcard-disc" aria-hidden />
              <span className="pcard-track">
                <b>{card.music.title}</b>
                {card.music.artist && <small className="muted">{card.music.artist}</small>}
              </span>
              {card.music.url && (
                <button className="btn btn-ghost btn-icon" title={t("card.listen")} onClick={() => open(card.music!.url!)}>
                  <Glyph name="player-play" />
                </button>
              )}
            </div>
          </section>
        )}

        {favs.length > 0 && (
          <section>
            <h3>{t("card.favourites")}</h3>
            <div className="pcard-slots">
              {favs.map(([k, v]) => (
                <div key={k} className="pcard-slot">
                  <small>{t(`card.${k}` as MessageKey)}</small>
                  <b>{v}</b>
                </div>
              ))}
            </div>
          </section>
        )}

        {card.server && (
          <section>
            <h3>{t("card.server")}</h3>
            <div className="pcard-row">
              <Glyph name="broadcast" />
              <span className="pcard-row-main">{card.server}</span>
              {onJoinServer && (
                <button className="btn btn-ghost" onClick={() => onJoinServer(card.server!)}>
                  <Glyph name="login-2" /> {t("friends.join")}
                </button>
              )}
            </div>
          </section>
        )}

        {((card.looking?.length ?? 0) > 0 || (card.mains?.length ?? 0) > 0) && (
          <section>
            <h3>{t("card.looking")}</h3>
            <div className="pcard-chips">
              {card.looking?.map((l) => (
                <span key={l} className="pcard-chip" data-on>
                  {t(`card.look.${l}` as MessageKey)}
                </span>
              ))}
              {card.mains?.map((m) => (
                <span key={m} className="pcard-chip">
                  {m}
                </span>
              ))}
            </div>
          </section>
        )}

        {card.mods && card.mods.length > 0 && (
          <section>
            <h3>{t("card.mods")}</h3>
            <div className="pcard-chips">
              {card.mods.map((m) => (
                <button key={m} className="pcard-chip" onClick={() => open(`https://modrinth.com/mod/${m}`)}>
                  {m} <Glyph name="external-link" size={11} />
                </button>
              ))}
            </div>
          </section>
        )}

        {card.shot && !shotBanner && (
          <section>
            <h3>{t("card.shot")}</h3>
            <button className="pcard-shot" onClick={() => open(`https://kromvia.com/s/${card.shot}`)}>
              <img src={SHOT_URL(card.shot)} alt="" loading="lazy" />
            </button>
          </section>
        )}

        {(card.shots?.length ?? 0) > 0 && (
          <section>
            <h3>{t("card.gallery")}</h3>
            <div className="pcard-gallery">
              {card.shots!.map((code) => (
                <button key={code} className="pcard-shot" onClick={() => open(`https://kromvia.com/s/${code}`)}>
                  <img src={SHOT_URL(code)} alt="" loading="lazy" />
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="pcard-meta">
          {owner.created ? (
            <div>
              <h3>{t("card.since")}</h3>
              <p>{new Date(owner.created).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}</p>
            </div>
          ) : null}
          {owner.likes !== undefined && (
            <div>
              <h3>{t("profile.reputation")}</h3>
              <p>
                <Glyph name="heart" size={13} /> {owner.likes}
              </p>
            </div>
          )}
        </section>

        {links.length > 0 && (
          <section>
            <h3>{t("profile.links")}</h3>
            <div className="pcard-chips">
              {links.map(([p, v]) => (
                <span key={p} className="pcard-chip">
                  {p === "discord" ? <Glyph name="brand-discord" size={13} /> : <Glyph name="broadcast" size={13} />} {v}
                </span>
              ))}
            </div>
          </section>
        )}
      </div>
    </article>
  );
}
