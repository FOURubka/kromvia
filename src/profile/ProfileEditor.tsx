import { useState, type KeyboardEvent, type ReactNode } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { useI18n } from "../i18n";
import type { MessageKey } from "../i18n/en";
import { useLauncher } from "../lib/launcher";
import { useSocial } from "../friends/social";
import { Glyph } from "../ui/Glyph";
import { ProfileCard } from "./ProfileCard";
import { EmojiButton } from "./Rich";
import { BANNERS, EFFECTS, FONTS, FONT_FAMILY, FRAMES, LOOKING, NAME_COLORS, PLATES, SHOT_URL, type Card, type CardOwner } from "./card";

type Shot = { name: string; path: string; taken: number };
type BannerMode = "color" | "gradient" | "shot";

function Colors({ value, list, onChange }: { value?: string; list: string[]; onChange: (v?: string) => void }) {
  return (
    <div className="pedit-colors">
      {list.map((c) => (
        <button key={c} className="pedit-swatch" style={{ background: c }} aria-pressed={value === c} aria-label={c} onClick={() => onChange(c)} />
      ))}
      <label className="pedit-swatch pedit-custom" aria-pressed={!!value && !list.includes(value)} style={value && !list.includes(value) ? { background: value } : undefined}>
        <input type="color" value={value ?? "#8b5cf6"} onChange={(e) => onChange(e.currentTarget.value)} />
        <Glyph name="plus" size={12} />
      </label>
    </div>
  );
}

function Choice<T extends string>({ value, list, label, onChange }: { value?: T; list: readonly T[]; label: (v: T) => string; onChange: (v: T) => void }) {
  return (
    <div className="segmented pedit-choice">
      {list.map((v) => (
        <button key={v} aria-pressed={(value ?? list[0]) === v} onClick={() => onChange(v)}>
          {label(v)}
        </button>
      ))}
    </div>
  );
}

function Tags({ value, max, maxLen, placeholder, clean, onChange }: { value?: string[]; max: number; maxLen: number; placeholder: string; clean?: (s: string) => string; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const list = value ?? [];
  const add = () => {
    const v = (clean ? clean(draft) : draft).trim();
    if (v && list.length < max && !list.some((x) => x.toLowerCase() === v.toLowerCase())) onChange([...list, v]);
    setDraft("");
  };
  const key = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add();
    } else if (e.key === "Backspace" && !draft && list.length) onChange(list.slice(0, -1));
  };
  return (
    <div className="pedit-tags">
      {list.map((v) => (
        <button key={v} className="pcard-chip" onClick={() => onChange(list.filter((x) => x !== v))}>
          {v} <Glyph name="x" size={11} />
        </button>
      ))}
      {list.length < max && <input className="input" value={draft} maxLength={maxLen} placeholder={placeholder} onChange={(e) => setDraft(e.currentTarget.value)} onKeyDown={key} onBlur={add} />}
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="pedit-group">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function Text({ label, value, max, placeholder, onChange, area }: { label: string; value?: string; max: number; placeholder?: string; onChange: (v: string) => void; area?: boolean }) {
  const add = (e: string) => {
    const next = (value ?? "") + e;
    if ([...next].length <= max) onChange(next);
  };
  return (
    <div className="pedit-field">
      <span>
        {label}
        <small className="muted">
          {[...(value ?? "")].length}/{max}
        </small>
      </span>
      <div className="pedit-text">
        {area ? (
          <textarea className="input" rows={4} value={value ?? ""} placeholder={placeholder} onChange={(e) => onChange(e.currentTarget.value)} />
        ) : (
          <input className="input" value={value ?? ""} placeholder={placeholder} onChange={(e) => onChange(e.currentTarget.value)} />
        )}
        <EmojiButton onPick={add} />
      </div>
    </div>
  );
}

export function ProfileEditor({ initial, owner, badges, onSaved, onClose }: { initial: Card; owner: CardOwner; badges?: ReactNode; onSaved: (c: Card) => void; onClose: () => void }) {
  const { t } = useI18n();
  const l = useLauncher();
  const social = useSocial();
  const [card, setCard] = useState<Card>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shots, setShots] = useState<Shot[] | null>(null);
  const [sharing, setSharing] = useState<string | null>(null);
  const set = <K extends keyof Card>(k: K, v: Card[K]) => setCard((c) => ({ ...c, [k]: v === "" ? undefined : v }));
  const dirty = JSON.stringify(card) !== JSON.stringify(initial);
  const bannerMode: BannerMode = card.bannerShot && card.shot ? "shot" : card.banner2 ? "gradient" : "color";
  const [nameGradient, setNameGradient] = useState(!!initial.nameColor2);

  const save = () => {
    setSaving(true);
    setError(null);
    invoke<Card>("social_profile", { profile: card })
      .then(
        (saved) => {
          setCard(saved);
          onSaved(saved);
        },
        (e) => setError(String(e)),
      )
      .finally(() => setSaving(false));
  };

  const pickShots = () =>
    shots
      ? setShots(null)
      : l.current
        ? invoke<Shot[]>("screenshot_list", { instanceId: l.current.id }).then((s) => setShots(s.slice(0, 24)), () => setShots([]))
        : setShots([]);
  const chooseShot = (name: string) => {
    if (!l.current) return;
    setSharing(name);
    setError(null);
    invoke<string>("share_screenshot", { instanceId: l.current.id, name })
      .then(
        (url) => {
          set("shot", url.split("/").pop()!.toUpperCase());
          setShots(null);
        },
        (e) => setError(String(e)),
      )
      .finally(() => setSharing(null));
  };
  const setBannerMode = (m: BannerMode) =>
    setCard((c) => ({
      ...c,
      bannerShot: m === "shot" ? true : undefined,
      banner2: m === "gradient" ? (c.banner2 ?? "#12907e") : undefined,
      bannerAngle: m === "gradient" ? (c.bannerAngle ?? 135) : undefined,
    }));
  const music = card.music ?? { title: "" };
  const setMusic = (m: Partial<NonNullable<Card["music"]>>) => {
    const next = { ...music, ...m };
    for (const k of ["title", "artist", "url"] as const) if (!next[k]) delete next[k];
    set("music", next.title || next.artist || next.url ? (next as Card["music"]) : undefined);
  };
  const toggleLook = (v: (typeof LOOKING)[number]) => {
    const cur = card.looking ?? [];
    set("looking", cur.includes(v) ? cur.filter((x) => x !== v) : LOOKING.filter((x) => cur.includes(x) || x === v));
  };

  return (
    <div className="pedit">
      <div className="pedit-form">
        <div className="pedit-head">
          <h2>{t("card.edit")}</h2>
          <button className="btn btn-ghost" onClick={onClose}>
            <Glyph name="x" /> {t("common.close")}
          </button>
        </div>

        <Group title={t("card.groupWho")}>
          <Text label={t("card.status")} value={card.status} max={80} placeholder={t("card.statusHint")} onChange={(v) => set("status", v)} />
          <Text label={t("card.tagline")} value={card.tagline} max={40} placeholder={t("card.taglineHint")} onChange={(v) => set("tagline", v)} />
          <Text label={t("card.about")} value={card.bio} max={400} placeholder={t("card.bioHint")} area onChange={(v) => set("bio", v)} />
        </Group>

        <Group title={t("card.banner")}>
          <Choice<BannerMode> value={bannerMode} list={card.shot ? ["color", "gradient", "shot"] : ["color", "gradient"]} label={(v) => t(`card.bannerMode.${v}` as MessageKey)} onChange={setBannerMode} />
          {bannerMode !== "shot" && (
            <div className="pedit-field">
              <span>{bannerMode === "gradient" ? t("card.colorFrom") : t("card.color")}</span>
              <Colors value={card.banner} list={BANNERS} onChange={(v) => set("banner", v)} />
            </div>
          )}
          {bannerMode === "gradient" && (
            <>
              <div className="pedit-field">
                <span>{t("card.colorTo")}</span>
                <Colors value={card.banner2} list={BANNERS} onChange={(v) => set("banner2", v)} />
              </div>
              <label className="pedit-field">
                <span>
                  {t("card.angle")} <small className="muted">{card.bannerAngle ?? 135}°</small>
                </span>
                <input type="range" min={0} max={359} value={card.bannerAngle ?? 135} onChange={(e) => set("bannerAngle", Number(e.currentTarget.value))} />
              </label>
            </>
          )}
          {!card.shot && <small className="muted">{t("card.bannerShotHint")}</small>}
          <div className="pedit-field">
            <span>{t("card.effect")}</span>
            <Choice value={card.effect} list={EFFECTS} label={(v) => t(`card.effect.${v}` as MessageKey)} onChange={(v) => set("effect", v === "none" ? undefined : v)} />
          </div>
          <div className="pedit-field">
            <span>{t("card.frame")}</span>
            <Choice value={card.frame} list={FRAMES} label={(v) => t(`card.frame.${v}` as MessageKey)} onChange={(v) => set("frame", v === "none" ? undefined : v)} />
          </div>
        </Group>

        <Group title={t("card.groupName")}>
          <div className="pedit-field">
            <span>{t("card.nameFont")}</span>
            <div className="pedit-fonts">
              {FONTS.map((f) => (
                <button key={f} className="pedit-font" aria-pressed={(card.nameFont ?? "default") === f} onClick={() => set("nameFont", f === "default" ? undefined : f)}>
                  <b style={{ fontFamily: FONT_FAMILY[f] }}>{owner.name}</b>
                  <small className="muted">{t(`card.font.${f}` as MessageKey)}</small>
                </button>
              ))}
            </div>
          </div>
          <div className="pedit-field">
            <span>{nameGradient ? t("card.colorFrom") : t("card.nameColor")}</span>
            <Colors value={card.nameColor} list={NAME_COLORS} onChange={(v) => set("nameColor", v)} />
          </div>
          <label className="pedit-check">
            <input
              type="checkbox"
              checked={nameGradient}
              onChange={(e) => {
                const on = e.currentTarget.checked;
                setNameGradient(on);
                set("nameColor2", on ? (card.nameColor2 ?? "#7ec8ff") : undefined);
              }}
            />
            {t("card.nameGradient")}
          </label>
          {nameGradient && (
            <div className="pedit-field">
              <span>{t("card.colorTo")}</span>
              <Colors value={card.nameColor2} list={NAME_COLORS} onChange={(v) => set("nameColor2", v)} />
            </div>
          )}
          <div className="pedit-field">
            <span>{t("card.plate")}</span>
            <div className="pedit-plates">
              {PLATES.map((p) => (
                <button key={p} className="pedit-plate" data-plate={p === "none" ? undefined : p} aria-pressed={(card.plate ?? "none") === p} onClick={() => set("plate", p === "none" ? undefined : p)}>
                  <b>{owner.name}</b>
                  <small>{t(`card.plate.${p}` as MessageKey)}</small>
                </button>
              ))}
            </div>
          </div>
        </Group>

        <Group title={t("card.music")}>
          <div className="pedit-pair">
            <input className="input" value={music.title} maxLength={60} placeholder={t("card.musicTitle")} onChange={(e) => setMusic({ title: e.currentTarget.value })} />
            <input className="input" value={music.artist ?? ""} maxLength={60} placeholder={t("card.musicArtist")} onChange={(e) => setMusic({ artist: e.currentTarget.value })} />
          </div>
          <input className="input" value={music.url ?? ""} maxLength={200} placeholder="https://open.spotify.com/track/…" onChange={(e) => setMusic({ url: e.currentTarget.value.trim() })} />
          <small className="muted">{t("card.musicHint")}</small>
        </Group>

        <Group title={t("card.favourites")}>
          <div className="pedit-pair">
            <input className="input" value={card.mob ?? ""} maxLength={24} placeholder={t("card.mob")} onChange={(e) => set("mob", e.currentTarget.value)} />
            <input className="input" value={card.block ?? ""} maxLength={24} placeholder={t("card.block")} onChange={(e) => set("block", e.currentTarget.value)} />
          </div>
          <div className="pedit-pair">
            <input className="input" value={card.biome ?? ""} maxLength={24} placeholder={t("card.biome")} onChange={(e) => set("biome", e.currentTarget.value)} />
            <input className="input" value={card.version ?? ""} maxLength={16} placeholder={t("card.version")} onChange={(e) => set("version", e.currentTarget.value.trim())} />
          </div>
          <input className="input" value={card.server ?? ""} maxLength={64} placeholder={`${t("card.server")}: play.example.net`} onChange={(e) => set("server", e.currentTarget.value.trim())} />
        </Group>

        <Group title={t("card.looking")}>
          <div className="pcard-chips">
            {LOOKING.map((v) => (
              <button key={v} className="pcard-chip" data-on={card.looking?.includes(v) || undefined} aria-pressed={!!card.looking?.includes(v)} onClick={() => toggleLook(v)}>
                {t(`card.look.${v}` as MessageKey)}
              </button>
            ))}
          </div>
          <Tags value={card.mains} max={5} maxLen={20} placeholder={t("card.mainsHint")} onChange={(v) => set("mains", v.length ? v : undefined)} />
        </Group>

        <Group title={t("card.mods")}>
          <Tags
            value={card.mods}
            max={6}
            maxLen={64}
            placeholder={t("card.modsHint")}
            clean={(s) =>
              s
                .trim()
                .replace(/^https?:\/\/modrinth\.com\/[a-z]+\//, "")
                .replace(/\/.*$/, "")
                .toLowerCase()
                .replace(/[^a-z0-9_-]/g, "")
            }
            onChange={(v) => set("mods", v.length ? v : undefined)}
          />
        </Group>

        <Group title={t("card.shot")}>
          <div className="pedit-shot">
            {card.shot && <img src={SHOT_URL(card.shot)} alt="" />}
            <div className="actions">
              <button className="btn btn-ghost" onClick={pickShots}>
                <Glyph name="photo" /> {t("card.shotPick")}
              </button>
              {card.shot && (
                <button className="btn btn-ghost" onClick={() => setCard((c) => ({ ...c, shot: undefined, bannerShot: undefined }))}>
                  <Glyph name="x" /> {t("card.shotRemove")}
                </button>
              )}
            </div>
          </div>
          {shots && shots.length === 0 && <p className="muted small">{t("card.shotNone")}</p>}
          {shots && shots.length > 0 && (
            <div className="pedit-shots">
              {shots.map((s) => (
                <button key={s.name} className="pedit-shot-pick" disabled={!!sharing} onClick={() => chooseShot(s.name)} title={s.name}>
                  <img src={convertFileSrc(s.path)} alt="" loading="lazy" />
                  {sharing === s.name && <span>{t("card.uploading")}</span>}
                </button>
              ))}
            </div>
          )}
        </Group>

        <Group title={t("card.privacy")}>
          <label className="pedit-check">
            <input type="checkbox" checked={!!card.showLinks} onChange={(e) => set("showLinks", e.currentTarget.checked || undefined)} />
            {t("card.showLinks")}
          </label>
          <label className="pedit-check">
            <input type="checkbox" checked={social.hideServer} onChange={(e) => social.setHideServer(e.currentTarget.checked)} />
            {t("card.hideServer")}
          </label>
        </Group>

        <div className="pedit-save">
          {error && <p className="error">{error}</p>}
          <button className="btn btn-ghost" disabled={!dirty || saving} onClick={() => setCard(initial)}>
            {t("card.reset")}
          </button>
          <button className="btn" disabled={!dirty || saving} onClick={save}>
            <Glyph name="device-floppy" /> {saving ? t("card.saving") : t("card.save")}
          </button>
        </div>
      </div>
      <div className="pedit-preview">
        <ProfileCard card={card} owner={owner} badges={badges} />
      </div>
    </div>
  );
}
