import { useState } from "react";
import { useI18n } from "../i18n";
import type { MessageKey } from "../i18n/en";
import { emblemUrl } from "../art/emblems";
import { Glyph } from "../ui/Glyph";
import { BADGES, earned, progress, seriesOf, type Badge, type Facts } from "./badges";

const value = (b: Badge, f: Facts) => (b.metric ? Math.floor(f[b.metric]) : earned(b, f) ? 1 : 0);

export function BadgeMedal({ b, size = 56, locked }: { b: Badge; size?: number; locked?: boolean }) {
  return (
    <span className="badge-medal" data-tier={b.tier} data-locked={locked || undefined} style={{ width: size, height: size }}>
      <img src={emblemUrl(b.emblem)} width={Math.round(size * 0.6)} height={Math.round(size * 0.6)} alt="" />
    </span>
  );
}

export function badgeTip(t: ReturnType<typeof useI18n>["t"], b: Badge, f?: Facts) {
  const name = t(`badge.${b.id}` as MessageKey);
  const hint = t(`badge.${b.id}.hint` as MessageKey);
  if (!f || !b.metric || earned(b, f)) return `${name}\n${hint}`;
  return `${name}\n${hint}\n${value(b, f)} / ${b.goal}`;
}

export function BadgesDialog({ facts, onClose }: { facts: Facts; onClose: () => void }) {
  const { t } = useI18n();
  const sorted = [...BADGES].sort((a, b) => Number(earned(b, facts)) - Number(earned(a, facts)));
  const [pick, setPick] = useState<Badge>(sorted[0]);
  const has = earned(pick, facts);
  const series = seriesOf(pick);
  const got = BADGES.filter((b) => earned(b, facts)).length;

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label={t("profile.badges")} onClick={onClose}>
      <section className="badges-dialog" onClick={(e) => e.stopPropagation()}>
        <button className="btn btn-ghost btn-icon badges-close" aria-label={t("common.close")} onClick={onClose}>
          <Glyph name="x" />
        </button>
        <div className="badges-list">
          <h2>
            {t("profile.badges")} <span className="muted">{got}/{BADGES.length}</span>
          </h2>
          <p className="muted small">{t("card.badgesHint")}</p>
          <div className="badges-grid">
            {sorted.map((b) => (
              <button key={b.id} className="badges-cell" aria-pressed={pick.id === b.id} title={t(`badge.${b.id}` as MessageKey)} onClick={() => setPick(b)}>
                <BadgeMedal b={b} size={46} locked={!earned(b, facts)} />
              </button>
            ))}
          </div>
        </div>
        <div className="badges-detail">
          <BadgeMedal b={pick} size={132} locked={!has} />
          <span className="badges-tier" data-tier={pick.tier}>
            {t(`card.tier.${pick.tier}` as MessageKey)}
          </span>
          <h3>{t(`badge.${pick.id}` as MessageKey)}</h3>
          <p className="muted">{t(`badge.${pick.id}.hint` as MessageKey)}</p>
          <div className="badges-progress">
            <div className="badges-progress-head">
              <span>{has ? t("card.unlocked") : t("card.progress")}</span>
              {pick.metric && (
                <span className="muted">
                  {Math.min(value(pick, facts), pick.goal!)} / {pick.goal}
                </span>
              )}
            </div>
            <div className="badges-bar">
              <span style={{ width: `${Math.round(progress(pick, facts) * 100)}%` }} />
            </div>
          </div>
          {series.length > 1 && (
            <div className="badges-series">
              {series.map((b) => (
                <button key={b.id} className="badges-step" aria-pressed={b.id === pick.id} onClick={() => setPick(b)}>
                  <BadgeMedal b={b} size={44} locked={!earned(b, facts)} />
                  <b>{t(`badge.${b.id}` as MessageKey)}</b>
                  <small className="muted">{b.goal}</small>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
