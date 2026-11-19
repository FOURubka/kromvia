import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useI18n } from "../i18n";
import { emblemUrl } from "../art/emblems";
import { Head } from "../friends/Head";
import { Glyph } from "../ui/Glyph";
import { ClanChip, GameTimer } from "./ProfileCard";
import { useSocial } from "../friends/social";
import { useLauncher } from "../lib/launcher";
import { CapePainter } from "../skins/Cosmetics";
import { ART_H, ART_W, artFrom, decodeArt } from "../art/capes";
import { pushOutfit, savedOutfit, storeOutfit } from "../lib/outfit";
import { Rich } from "./Rich";

type Member = { id: string; name: string; verified: boolean; role: string };
type ClanInfo = { id: string; name: string; tag: string; icon: string; open: boolean; created?: number; cape?: string | null; members: Member[] };
type Mine = { clan: ClanInfo | null; role?: string; requests: { id: string; name: string }[]; pending: string[] };
type Listed = { id: string; name: string; tag: string; icon: string; open: boolean; members: number };

const ICONS = ["sword", "pickaxe", "heart", "potion", "apple", "chest", "torch", "key", "moon", "sun", "rocket", "mushroom", "slime", "fish", "cake", "crown", "shield", "tree", "planet", "gem", "sprout", "globe", "medal", "link"];

const api = <T,>(method: string, path: string, body?: unknown) => invoke<T>("social_clan", { method, path, body: body ?? null });
const iconSrc = (icon: string) => (icon === "kromvia" ? "/logo.svg" : emblemUrl(icon));

function ClanForm({ initial, submit, onDone, onCancel }: { initial?: Partial<ClanInfo>; submit: string; onDone: (v: { name: string; tag: string; icon: string; open: boolean }) => Promise<unknown>; onCancel?: () => void }) {
  const { t } = useI18n();
  const [name, setName] = useState(initial?.name ?? "");
  const [tag, setTag] = useState(initial?.tag ?? "");
  const [icon, setIcon] = useState(initial?.icon ?? "shield");
  const [open, setOpen] = useState(initial?.open ?? true);
  const [busy, setBusy] = useState(false);
  const fixedIcon = initial?.icon === "kromvia";
  return (
    <div className="clan-form">
      <div className="pedit-pair">
        <label className="pedit-field">
          <span>{t("clan.name")}</span>
          <input className="input" value={name} maxLength={24} placeholder="Night Owls" onChange={(e) => setName(e.currentTarget.value)} />
        </label>
        <label className="pedit-field">
          <span>{t("clan.tag")}</span>
          <input className="input" value={tag} maxLength={8} placeholder="OWLS" onChange={(e) => setTag(e.currentTarget.value.replace(/[^A-Za-z0-9]/g, ""))} />
        </label>
      </div>
      {!fixedIcon && (
        <div className="pedit-field">
          <span>{t("clan.icon")}</span>
          <div className="clan-icons">
            {ICONS.map((i) => (
              <button key={i} className="clan-icon" aria-pressed={icon === i} aria-label={i} onClick={() => setIcon(i)}>
                <img src={emblemUrl(i)} alt="" width={26} height={26} />
              </button>
            ))}
          </div>
        </div>
      )}
      <label className="pedit-check">
        <input type="checkbox" checked={open} onChange={(e) => setOpen(e.currentTarget.checked)} />
        {t("clan.open")}
      </label>
      <div className="actions">
        {onCancel && (
          <button className="btn btn-ghost" onClick={onCancel}>
            {t("common.cancel")}
          </button>
        )}
        <button
          className="btn"
          disabled={busy || name.trim().length < 3 || tag.length < 2}
          onClick={() => {
            setBusy(true);
            onDone({ name: name.trim(), tag, icon, open }).finally(() => setBusy(false));
          }}
        >
          <Glyph name="check" /> {submit}
        </button>
      </div>
    </div>
  );
}

function ClanChat() {
  const { t } = useI18n();
  const social = useSocial();
  const [draft, setDraft] = useState("");
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    social.openClan(true);
    return () => social.openClan(false);
  }, []);
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [social.clanChat.length]);
  const send = () => {
    const text = draft.trim();
    if (!text) return;
    social.sendClan(text);
    setDraft("");
  };
  return (
    <div className="clan-chat">
      <div className="clan-chat-list" ref={list}>
        {social.clanChat.length === 0 && <p className="muted small">{t("clan.chatEmpty")}</p>}
        {social.clanChat.map((m) => (
          <div key={m.id} className="clan-msg" data-mine={m.from === social.myId || undefined}>
            <Head name={m.name} size={24} />
            <div>
              <b>{m.name}</b> <time className="muted">{new Date(m.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
              <p>
                <Rich text={m.text} />
              </p>
            </div>
          </div>
        ))}
      </div>
      <form
        className="clan-chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <input className="input" value={draft} maxLength={500} placeholder={t("clan.chatHint")} onChange={(e) => setDraft(e.currentTarget.value)} />
        <button className="btn" disabled={!draft.trim()}>
          <Glyph name="arrow-right" />
        </button>
      </form>
    </div>
  );
}

function artPng(art: string) {
  const px = decodeArt(art);
  if (!px) return null;
  const c = document.createElement("canvas");
  c.width = ART_W;
  c.height = ART_H;
  c.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(px), ART_W, ART_H), 0, 0);
  return c.toDataURL();
}

function ClanCape({ clan, owner, onSaved }: { clan: ClanInfo; owner: boolean; onSaved: () => void }) {
  const { t } = useI18n();
  const [art, setArt] = useState(clan.cape ?? artFrom("kromvia"));
  const [editing, setEditing] = useState(false);
  const [worn, setWorn] = useState(() => savedOutfit().style === "custom" && savedOutfit().art === clan.cape);
  const [error, setError] = useState<string | null>(null);
  const preview = clan.cape ? artPng(clan.cape) : null;
  const wear = () => {
    if (!clan.cape) return;
    const next = { ...savedOutfit(), back: "cape" as const, style: "custom" as const, art: clan.cape };
    storeOutfit(next);
    pushOutfit(next).then(() => setWorn(true), (e) => setError(String(e)));
  };
  return (
    <div className="clan-cape">
      {preview ? <img className="clan-cape-art" src={preview} alt="" /> : <p className="muted small">{t("clan.capeNone")}</p>}
      <div className="actions">
        {clan.cape && (
          <button className="btn" disabled={worn} onClick={wear}>
            <Glyph name="shirt" /> {worn ? t("clan.capeWorn") : t("clan.capeWear")}
          </button>
        )}
        {owner && (
          <button className="btn btn-ghost" onClick={() => setEditing(!editing)}>
            <Glyph name="pencil" /> {t("clan.capeEdit")}
          </button>
        )}
      </div>
      {owner && editing && (
        <>
          <CapePainter art={art} onChange={setArt} />
          <div className="actions">
            <button
              className="btn"
              onClick={() =>
                api("PATCH", `/v1/clans/${clan.id}`, { cape: art }).then(
                  () => (setEditing(false), onSaved()),
                  (e) => setError(String(e)),
                )
              }
            >
              <Glyph name="device-floppy" /> {t("card.save")}
            </button>
            {clan.cape && (
              <button className="btn btn-ghost" onClick={() => api("PATCH", `/v1/clans/${clan.id}`, { cape: null }).then(onSaved, (e) => setError(String(e)))}>
                <Glyph name="trash" /> {t("clan.capeRemove")}
              </button>
            )}
          </div>
        </>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}

export function Clans({ signedIn, onChange }: { signedIn: boolean; onChange: () => void }) {
  const { t } = useI18n();
  const social = useSocial();
  const launcher = useLauncher();
  const [mine, setMine] = useState<Mine | null>(null);
  const [list, setList] = useState<Listed[]>([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);

  const load = () => api<Mine>("GET", "/v1/me/clan").then(setMine, (e) => setError(String(e)));
  const search = (text: string) => api<Listed[]>("GET", text ? `/v1/clans?q=${encodeURIComponent(text)}` : "/v1/clans").then(setList, () => {});
  useEffect(() => {
    if (signedIn) load();
    search("");
  }, [signedIn]);
  useEffect(() => {
    const id = setTimeout(() => search(q.trim()), 250);
    return () => clearTimeout(id);
  }, [q]);

  const act = (p: Promise<unknown>) => {
    setError(null);
    return p.then(
      () => {
        load();
        search(q.trim());
        onChange();
        social.reloadClan();
      },
      (e) => setError(String(e)),
    );
  };

  if (!signedIn) return <p className="muted">{t("clan.signIn")}</p>;
  if (!mine) return <p className="muted">{t("friends.loading")}</p>;
  const clan = mine.clan;
  const owner = mine.role === "owner";

  return (
    <div className="clans">
      {error && <p className="error">{error}</p>}
      {clan ? (
        <section className="card clan-mine">
          <div className="clan-head">
            <img className="clan-logo" src={iconSrc(clan.icon)} alt="" width={56} height={56} />
            <div className="list-main">
              <h2>{clan.name}</h2>
              <span className="muted">
                <ClanChip clan={clan} /> · {t("clan.members", { n: clan.members.length })} · {clan.open ? t("clan.isOpen") : t("clan.isClosed")}
              </span>
            </div>
            {owner && (
              <button className="btn btn-ghost" onClick={() => setEditing(!editing)}>
                <Glyph name="settings" /> {t("clan.settings")}
              </button>
            )}
            <button className="btn btn-ghost" onClick={() => act(api("DELETE", "/v1/me/clan"))}>
              <Glyph name="logout" /> {t("clan.leave")}
            </button>
          </div>
          {owner && editing && (
            <ClanForm initial={clan} submit={t("card.save")} onCancel={() => setEditing(false)} onDone={(v) => act(api("PATCH", `/v1/clans/${clan.id}`, v)).then(() => setEditing(false))} />
          )}
          {owner && mine.requests.length > 0 && (
            <>
              <h3>{t("clan.requests")}</h3>
              <ul className="list">
                {mine.requests.map((r) => (
                  <li key={r.id} className="list-row">
                    <Head name={r.name} size={28} />
                    <span className="list-main instance-name">{r.name}</span>
                    <button className="btn" onClick={() => act(api("POST", `/v1/clans/${clan.id}/requests/${r.id}`))}>
                      <Glyph name="check" /> {t("friends.accept")}
                    </button>
                    <button className="btn btn-ghost btn-icon" aria-label={t("friends.decline")} onClick={() => act(api("DELETE", `/v1/clans/${clan.id}/requests/${r.id}`))}>
                      <Glyph name="x" />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="clan-columns">
            <div>
              <h3>{t("clan.chat")}</h3>
              <ClanChat />
            </div>
            <div>
              <h3>{t("clan.cape")}</h3>
              <ClanCape clan={clan} owner={owner} onSaved={load} />
            </div>
          </div>
          <h3>
            {t("clan.memberList")} <span className="muted">{t("clan.onlineCount", { n: social.clanMembers.filter((m) => m.online).length })}</span>
          </h3>
          <ul className="clan-members">
            {clan.members.map((m) => {
              const live = social.clanMembers.find((x) => x.id === m.id);
              return (
              <li key={m.id}>
                <span className="head-wrap">
                  <Head name={m.name} size={32} />
                </span>
                <span className="clan-member-text">
                  <span className="instance-name">
                    <span className="status-dot" data-presence={live?.online ? live.status : "offline"} /> {m.name}
                  </span>
                  {live?.online && (live.game || live.server) && (
                    <small className="muted">
                      {live.game ? `Minecraft ${live.game.mc}` : ""}
                      {live.server ? `${live.game ? " · " : ""}${live.server}` : ""}
                      {live.game && (
                        <>
                          {" · "}
                          <GameTimer game={live.game} />
                        </>
                      )}
                    </small>
                  )}
                </span>
                {live?.online && live.server && m.id !== social.myId && launcher.current && (
                  <button className="btn btn-ghost" onClick={() => launcher.play(launcher.current!, { join: live.server! })}>
                    <Glyph name="login-2" /> {t("friends.join")}
                  </button>
                )}
                {m.role === "owner" && <span className="pill">{t("clan.owner")}</span>}
                {owner && m.role !== "owner" && (
                  <button className="btn btn-ghost btn-icon" aria-label={t("clan.kick")} title={t("clan.kick")} onClick={() => act(api("DELETE", `/v1/clans/${clan.id}/members/${m.id}`))}>
                    <Glyph name="x" />
                  </button>
                )}
              </li>
              );
            })}
          </ul>
        </section>
      ) : creating ? (
        <section className="card">
          <h2>{t("clan.create")}</h2>
          <ClanForm submit={t("clan.create")} onCancel={() => setCreating(false)} onDone={(v) => act(api("POST", "/v1/clans", v)).then(() => setCreating(false))} />
        </section>
      ) : null}

      {!creating && (
        <section className="card">
          <div className="library-head">
            <h2 className="section-title">{t("clan.find")}</h2>
            <div className="library-tools">
              <input className="input" data-search placeholder={t("clan.search")} value={q} onChange={(e) => setQ(e.currentTarget.value)} />
              {!clan && (
                <button className="btn" onClick={() => setCreating(true)}>
                  <Glyph name="plus" /> {t("clan.create")}
                </button>
              )}
            </div>
          </div>
          <ul className="list">
            {list.map((c) => {
              const here = clan?.id === c.id;
              const pending = mine.pending.includes(c.id);
              return (
                <li key={c.id} className="list-row" data-selected={here || undefined}>
                  <img className="clan-logo" src={iconSrc(c.icon)} alt="" width={36} height={36} />
                  <div className="list-main">
                    <span className="instance-name">
                      {c.name} <ClanChip clan={c} />
                    </span>
                    <span className="muted">
                      {t("clan.members", { n: c.members })} · {c.open ? t("clan.isOpen") : t("clan.isClosed")}
                    </span>
                  </div>
                  {here ? (
                    <span className="pill live">{t("clan.yours")}</span>
                  ) : pending ? (
                    <button className="btn btn-ghost" onClick={() => act(api("DELETE", `/v1/clans/${c.id}/join`))}>
                      {t("clan.pending")} <Glyph name="x" size={13} />
                    </button>
                  ) : (
                    <button className="btn" onClick={() => act(api("POST", `/v1/clans/${c.id}/join`))}>
                      <Glyph name="login-2" /> {c.open ? t("clan.join") : t("clan.ask")}
                    </button>
                  )}
                </li>
              );
            })}
            {list.length === 0 && <p className="muted">{t("clan.none")}</p>}
          </ul>
        </section>
      )}
    </div>
  );
}
