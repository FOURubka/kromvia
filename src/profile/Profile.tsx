import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useI18n } from "../i18n";
import { describe, formatDuration, useLauncher, type Instance } from "../lib/launcher";
import { InstanceIcon } from "../art/ModelIcon";
import { emblemUrl } from "../art/emblems";
import { BADGES, earned as isEarned, type Facts } from "./badges";
import { factsOf } from "./stats";
import { BadgeMedal, BadgesDialog, badgeTip } from "./BadgesView";
import { Clans } from "./Clans";
import type { ClanTag } from "./card";
import type { MyStatus } from "../friends/social";
import type { MessageKey } from "../i18n/en";
import { SkinArt } from "../art/SkinArt";
import { outfitWorn, savedOutfit } from "../lib/outfit";
import { useSocial } from "../friends/social";
import { Head } from "../friends/Head";
import { Glyph } from "../ui/Glyph";
import { Empty } from "../ui/Empty";
import { ProfileCard } from "./ProfileCard";
import { ProfileEditor } from "./ProfileEditor";
import type { Card } from "./card";
import "./profile.css";

type Me = { id: string; name: string; verified: boolean; created?: number; likes?: number; links?: Partial<Record<Provider, string>>; profile?: Card; clan?: ClanTag | null; dev?: boolean };
type Provider = "discord" | "telegram";
type Ranked = Friend & { likes: number };
type Friend = { id: string; name: string; verified: boolean };
type Stats = { playSeconds: number; launches: number; lastPlayed: number };
type World = { folder: string; name: string; lastPlayed: number; mode: string; icon: string | null };
type LibrarySkin = { id: string; slim: boolean; dataUrl: string };

export function Profile({ onFriends, onPlayer }: { onFriends: () => void; onPlayer: (name: string) => void }) {
  const { t } = useI18n();
  const l = useLauncher();
  const social = useSocial();
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [stats, setStats] = useState<Record<string, Stats>>({});
  const [worlds, setWorlds] = useState<(World & { inst: Instance })[]>([]);
  const [skin, setSkin] = useState<LibrarySkin | null>(null);
  const [tab, setTab] = useState<"overview" | "clan" | "friends" | "top">("overview");
  const [badgesOpen, setBadgesOpen] = useState(false);
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [top, setTop] = useState<Ranked[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);

  const loadMe = () =>
    invoke<Me | null>("social_me").then((m) => {
      setMe(m);
      if (m) {
        invoke<{ friends: Friend[] }>("social_friends").then((f) => setFriends(f.friends), () => {});
        invoke<string[]>("social_likes").then((l) => setLiked(new Set(l)), () => {});
      }
    }, () => setMe(null));
  const loadTop = () => invoke<Ranked[]>("social_top").then(setTop, () => {});
  useEffect(() => {
    loadMe();
    loadTop();
  }, []);

  const like = (id: string) => {
    const on = !liked.has(id);
    setError(null);
    invoke("social_like", { id, on }).then(
      () => {
        setLiked((s) => {
          const n = new Set(s);
          if (on) n.add(id);
          else n.delete(id);
          return n;
        });
        loadTop();
      },
      (e) => setError(String(e)),
    );
  };
  const link = (p: Provider) => {
    setError(null);
    invoke(me?.links?.[p] ? "social_unlink" : "social_link", { provider: p }).then(loadMe, (e) => setError(String(e)));
  };

  const remove = () => {
    if (!deleting) return setDeleting(true);
    setDeleting(false);
    setError(null);
    invoke("social_delete").then(() => {
      setMe(null);
      setFriends([]);
      setLiked(new Set());
      loadTop();
    }, (e) => setError(String(e)));
  };

  const who = l.account?.name ?? l.nick.trim();
  useEffect(() => {
    const look = (name: string) => invoke<LibrarySkin>("skin_lookup", { nick: name });
    invoke<LibrarySkin[]>("wardrobe_list")
      .then((list) => list[0] ?? Promise.reject())
      .catch(() => look(who || "MHF_Steve"))
      .catch(() => look("MHF_Steve"))
      .then(setSkin, () => {});
  }, [who]);

  const ids = l.instances.map((i) => i.id).join(",");
  useEffect(() => {
    l.instances.forEach((inst) => {
      invoke<{ stats: Stats }>("instance_info", { id: inst.id }).then((info) => setStats((s) => ({ ...s, [inst.id]: info.stats })), () => {});
    });
    Promise.all(l.instances.map((inst) => invoke<World[]>("world_list", { instanceId: inst.id }).then((ws) => ws.map((w) => ({ ...w, inst })), () => [])))
      .then((all) => setWorlds(all.flat().sort((a, b) => b.lastPlayed - a.lastPlayed)));
  }, [ids]);

  if (me === undefined) return <p className="muted">{t("friends.loading")}</p>;

  const name = me?.name ?? l.account?.name ?? (l.nick.trim() || t("home.guest"));
  const all = Object.values(stats);
  const played = all.reduce((n, s) => n + s.playSeconds, 0);
  const launches = all.reduce((n, s) => n + s.launches, 0);
  const builds = [...l.instances]
    .filter((i) => (stats[i.id]?.playSeconds ?? 0) > 0)
    .sort((a, b) => stats[b.id].playSeconds - stats[a.id].playSeconds)
    .slice(0, 5);
  const facts: Facts = factsOf(me ?? null, played, launches, l.instances.length, worlds.length, friends.length);
  const badges = BADGES.map((b) => ({ ...b, has: isEarned(b, facts) })).sort((a, b) => Number(b.has) - Number(a.has));
  const earned = [
    ...badges
      .filter((b) => b.has)
      .map((b) => (
        <button key={b.id} className="pcard-badge" data-tier={b.tier} data-tip={badgeTip(t, b)} aria-label={t(`badge.${b.id}` as MessageKey)} onClick={() => setBadgesOpen(true)}>
          <img src={emblemUrl(b.emblem)} width={20} height={20} alt="" />
        </button>
      )),
    <button key="all" className="pcard-badge pcard-badge-all" data-tip={t("card.allBadges")} aria-label={t("card.allBadges")} onClick={() => setBadgesOpen(true)}>
      <Glyph name="trophy" size={15} />
    </button>,
  ];
  const ownerBase = {
    name,
    verified: !!me?.verified,
    created: me?.created,
    likes: me?.likes,
    links: me?.links,
    clan: me?.clan ?? null,
    presence: me ? (social.connected ? social.myStatus : "offline") : undefined,
  } as const;
  const likeButton = (id: string) =>
    me && id !== me.id ? (
      <button className="btn btn-ghost profile-like" data-on={liked.has(id)} title={t("profile.like")} onClick={() => like(id)}>
        ♥
      </button>
    ) : null;
  const online = friends.filter((f) => social.online.has(f.id));
  const sorted = [...online, ...friends.filter((f) => !social.online.has(f.id))];

  return (
    <>
      {editing && me ? (
        <ProfileEditor
          initial={me.profile ?? {}}
          owner={ownerBase}
          badges={earned}
          onSaved={(profile) => setMe({ ...me, profile })}
          onClose={() => setEditing(false)}
        />
      ) : (
      <div className="profile-hero">
        <ProfileCard
          card={me?.profile ?? {}}
          owner={ownerBase}
          badges={earned}
          onClan={() => setTab("clan")}
          actions={
            me ? (
              <>
                <button className="btn" onClick={() => setEditing(true)}>
                  <Glyph name="pencil" /> {t("card.edit")}
                </button>
                <StatusPicker value={social.myStatus} onChange={social.setMyStatus} />
              </>
            ) : (
              <button className="btn" onClick={onFriends}>
                <Glyph name="user-plus" /> {t("friends.create")}
              </button>
            )
          }
        />
        <div className="profile-side">
          <div className="profile-art">
            <SkinArt skin={skin?.dataUrl ?? null} slim={skin?.slim ?? false} back="cape" worn={outfitWorn(savedOutfit())} zoom={0.9} />
          </div>
          {!me && <p className="muted">{t("profile.noAccount")}</p>}
          <dl className="stats profile-stats">
            {(
              [
                [t("files.playTime"), formatDuration(played)],
                [t("files.launches"), launches],
                [t("builds.worlds"), worlds.length],
                [t("nav.friends"), friends.length],
              ] as [string, string | number][]
            ).map(([label, value]) => (
              <div key={label} className="stat">
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
      )}

      {!editing && (
      <>
      <div className="segmented tabs" role="tablist">
        {(["overview", "clan", "friends", "top"] as const).map((k) => (
          <button key={k} role="tab" aria-pressed={tab === k} aria-selected={tab === k} onClick={() => setTab(k)}>
            {k === "friends" ? `${t("nav.friends")} ${online.length}/${friends.length}` : t(k === "top" ? "profile.top" : k === "clan" ? "clan.title" : "profile.overview")}
          </button>
        ))}
      </div>
      {error && <p className="error">{error}</p>}

      {tab === "overview" && (
        <>
          <section className="card">
            <div className="library-head">
              <h2>
                {t("profile.badges")} <span className="muted">{badges.filter((b) => b.has).length}/{badges.length}</span>
              </h2>
              <button className="btn btn-ghost" onClick={() => setBadgesOpen(true)}>
                <Glyph name="trophy" /> {t("card.allBadges")}
              </button>
            </div>
            <div className="profile-badges">
              {badges.map((b) => (
                <button key={b.id} className="profile-badge" data-has={b.has} onClick={() => setBadgesOpen(true)}>
                  <BadgeMedal b={b} size={52} locked={!b.has} />
                  <b className="small">{t(`badge.${b.id}` as MessageKey)}</b>
                  <span className="muted small">{t(`badge.${b.id}.hint` as MessageKey)}</span>
                </button>
              ))}
            </div>
          </section>
          {me && (
            <section className="card">
              <h2>{t("profile.links")}</h2>
              <ul className="list">
                {(["discord", "telegram"] as const).map((p) => (
                  <li key={p} className="list-row">
                    <div className="list-main">
                      <span className="instance-name">{p === "discord" ? "Discord" : "Telegram"}</span>
                      <span className="muted">{me.links?.[p] ?? t("profile.notLinked")}</span>
                    </div>
                    <button className={me.links?.[p] ? "btn btn-ghost" : "btn"} onClick={() => link(p)}>
                      <Glyph name={me.links?.[p] ? "x" : "external-link"} /> {t(me.links?.[p] ? "profile.unlink" : "profile.link")}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {me && (
            <section className="card">
              <h2>{t("profile.delete")}</h2>
              <p className="muted">{t("profile.deleteHint")}</p>
              <button className="btn btn-danger" onClick={remove} onBlur={() => setDeleting(false)}>
                <Glyph name="trash" /> {t(deleting ? "profile.deleteConfirm" : "profile.delete")}
              </button>
            </section>
          )}
        <div className="profile-columns">
          <section className="card">
            <h2>{t("profile.topBuilds")}</h2>
            {builds.length === 0 && <p className="muted">{t("profile.noPlay")}</p>}
            <ul className="list">
              {builds.map((inst) => (
                <li key={inst.id} className="list-row">
                  <InstanceIcon inst={inst} size={32} />
                  <div className="list-main">
                    <span className="instance-name">{inst.name}</span>
                    <span className="muted">{describe(inst, t("instance.vanilla"))}</span>
                  </div>
                  <span className="muted">{formatDuration(stats[inst.id].playSeconds)}</span>
                </li>
              ))}
            </ul>
          </section>
          <section className="card">
            <h2>{t("profile.recentWorlds")}</h2>
            {worlds.length === 0 && <Empty bee="empty-worlds">{t("worlds.empty")}</Empty>}
            <ul className="list">
              {worlds.slice(0, 5).map((w) => (
                <li key={`${w.inst.id}/${w.folder}`} className="list-row">
                  {w.icon ? <img className="profile-world-icon" src={w.icon} alt="" /> : <InstanceIcon inst={w.inst} size={32} />}
                  <div className="list-main">
                    <span className="instance-name">{w.name}</span>
                    <span className="muted">{w.inst.name}</span>
                  </div>
                  {w.lastPlayed > 0 && <span className="muted">{new Date(w.lastPlayed).toLocaleDateString()}</span>}
                </li>
              ))}
            </ul>
          </section>
        </div>
        </>
      )}
      {tab === "clan" && <Clans signedIn={!!me} onChange={loadMe} />}
      {tab === "top" && (
        <section className="card">
          {top.length === 0 && <p className="muted">{t("profile.topEmpty")}</p>}
          <ol className="list">
            {top.map((p, i) => (
              <li key={p.id} className="list-row" data-selected={p.id === me?.id}>
                <span className="profile-rank">{i + 1}</span>
                <button className="friend-row profile-top-open" onClick={() => onPlayer(p.name)}>
                  <Head name={p.name} size={32} />
                  <div className="list-main">
                    <span className="instance-name">{p.name}</span>
                    <span className="muted">{t("profile.likes", { n: p.likes })}</span>
                  </div>
                </button>
                {likeButton(p.id)}
              </li>
            ))}
          </ol>
        </section>
      )}
      {tab === "friends" && (
        <section className="card">
          {friends.length === 0 && <p className="muted">{t("friends.none")}</p>}
          <div className="profile-friends">
            {sorted.map((f) => (
              <div key={f.id} className="profile-friend">
                <span className="profile-avatar" aria-hidden>
                  {f.name[0].toUpperCase()}
                </span>
                <span className="instance-name">{f.name}</span>
                <span className="muted small">
                  <span className="presence-dot" data-online={social.online.has(f.id)} />{" "}
                  {social.online.has(f.id) ? t("friends.online") : t("friends.offline")}
                </span>
                {likeButton(f.id)}
              </div>
            ))}
          </div>
        </section>
      )}
      </>
      )}
      {badgesOpen && <BadgesDialog facts={facts} onClose={() => setBadgesOpen(false)} />}
    </>
  );
}

const STATUSES: MyStatus[] = ["online", "idle", "dnd", "invisible"];

function StatusPicker({ value, onChange }: { value: MyStatus; onChange: (v: MyStatus) => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <span className="status-picker">
      <button className="btn btn-ghost" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="pcard-online" data-presence={value}>
          {t(`presence.${value}` as MessageKey)}
        </span>
        <Glyph name="chevron-down" size={14} />
      </button>
      {open && (
        <>
          <span className="emoji-backdrop" onClick={() => setOpen(false)} />
          <div className="status-menu" role="menu">
            {STATUSES.map((s) => (
              <button
                key={s}
                role="menuitemradio"
                aria-checked={s === value}
                onClick={() => {
                  onChange(s);
                  setOpen(false);
                }}
              >
                <span className="status-dot" data-presence={s} />
                <span>
                  <b>{t(`presence.${s}` as MessageKey)}</b>
                  {s !== "online" && <small className="muted">{t(`presence.${s}.hint` as MessageKey)}</small>}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </span>
  );
}
