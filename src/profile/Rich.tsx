import { useMemo, useState, type ReactNode } from "react";
import groups from "unicode-emoji-json/data-by-group.json";
import { useI18n } from "../i18n";
import { EMBLEMS, emblemUrl } from "../art/emblems";
import { Glyph } from "../ui/Glyph";

export const CUSTOM: Record<string, string> = {
  kromvia: "/logo.svg",
  ...Object.fromEntries(Object.keys(EMBLEMS).map((k) => [k, emblemUrl(k)])),
};

const CODE = /:([a-z0-9_]{2,24}):/g;

export function Rich({ text }: { text: string }) {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(CODE)) {
    const src = CUSTOM[m[1]];
    if (!src) continue;
    if (m.index! > last) out.push(text.slice(last, m.index));
    out.push(<img key={m.index} className="emoji" src={src} alt={m[0]} title={m[0]} draggable={false} />);
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}

type Group = { name: string; slug: string; emojis: { emoji: string; name: string; slug: string }[] };
const GROUPS = (groups as Group[]).filter((g) => g.slug !== "component");
const TAB_ICON: Record<string, string> = {
  smileys_emotion: "😀",
  people_body: "👋",
  animals_nature: "🐻",
  food_drink: "🍎",
  travel_places: "✈️",
  activities: "⚽",
  objects: "💡",
  symbols: "❤️",
  flags: "🏳️",
};

export function EmojiPicker({ onPick }: { onPick: (text: string) => void }) {
  const { t } = useI18n();
  const [tab, setTab] = useState("kromvia");
  const [q, setQ] = useState("");
  const found = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return null;
    const custom = Object.keys(CUSTOM)
      .filter((k) => k.includes(s))
      .map((k) => ({ key: `:${k}:`, node: <img src={CUSTOM[k]} alt="" />, title: `:${k}:` }));
    const std = GROUPS.flatMap((g) => g.emojis)
      .filter((e) => e.name.includes(s) || e.slug.includes(s))
      .slice(0, 160)
      .map((e) => ({ key: e.emoji, node: e.emoji, title: e.name }));
    return [...custom, ...std];
  }, [q]);
  const items =
    found ??
    (tab === "kromvia"
      ? Object.keys(CUSTOM).map((k) => ({ key: `:${k}:`, node: <img src={CUSTOM[k]} alt="" />, title: `:${k}:` }))
      : (GROUPS.find((g) => g.slug === tab)?.emojis ?? []).map((e) => ({ key: e.emoji, node: e.emoji, title: e.name })));

  return (
    <div className="emoji-picker" role="dialog" aria-label={t("card.emoji")}>
      <input className="input" autoFocus placeholder={t("card.emojiSearch")} value={q} onChange={(e) => setQ(e.currentTarget.value)} />
      {!found && (
        <div className="emoji-tabs" role="tablist">
          <button role="tab" aria-selected={tab === "kromvia"} title="Kromvia" onClick={() => setTab("kromvia")}>
            <img src="/logo.svg" alt="" />
          </button>
          {GROUPS.map((g) => (
            <button key={g.slug} role="tab" aria-selected={tab === g.slug} title={g.name} onClick={() => setTab(g.slug)}>
              {TAB_ICON[g.slug] ?? g.emojis[0]?.emoji}
            </button>
          ))}
        </div>
      )}
      <div className="emoji-grid">
        {items.map((i) => (
          <button key={i.key} title={i.title} onClick={() => onPick(i.key)}>
            {i.node}
          </button>
        ))}
        {items.length === 0 && <p className="muted small">{t("card.emojiNone")}</p>}
      </div>
    </div>
  );
}

export function EmojiButton({ onPick }: { onPick: (text: string) => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <span className="emoji-anchor">
      <button type="button" className="btn btn-ghost btn-icon" title={t("card.emoji")} aria-expanded={open} onClick={() => setOpen(!open)}>
        <Glyph name="mood-smile" />
      </button>
      {open && (
        <>
          <span className="emoji-backdrop" onClick={() => setOpen(false)} />
          <EmojiPicker onPick={onPick} />
        </>
      )}
    </span>
  );
}
