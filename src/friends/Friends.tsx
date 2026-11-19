import { ProfileCard } from "../profile/ProfileCard";
import type { Card, CardOwner, ClanTag } from "../profile/card";
import { ClanChip } from "../profile/ProfileCard";
import { Rich } from "../profile/Rich";
import { useEffect, useRef, useState } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useI18n } from "../i18n";
import { NICK, useLauncher } from "../lib/launcher";
import { Glyph } from "../ui/Glyph";
import { Empty } from "../ui/Empty";
import { SkinArt } from "../art/SkinArt";
import type { Worn } from "../art/worn";
import { useSocial } from "./social";
import { Head, skinOf } from "./Head";
import "./friends.css";

type Player = { id: string; name: string; verified: boolean };
type Me = Player & { cosmetics: Record<string, unknown> };
type FriendList = { friends: (Player & { seen: number; clan?: ClanTag | null; note?: string | null })[]; incoming: Player[]; outgoing: Player[] };
type PublicProfile = Player & { created: number; likes: number; cosmetics: Record<string, unknown>; profile?: Card; links?: CardOwner["links"]; clan?: ClanTag | null };
type View = { chat: string } | { profile: string } | null;

const SHOT = /^https:\/\/api\.kromvia\.com\/share\/[A-Za-z0-9]{4,16}$/;

export function Friends() {
  const { t } = useI18n();
  const l = useLauncher();
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [list, setList] = useState<FriendList | null>(null);
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Player[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const social = useSocial();
  const [view, setView] = useState<View>(null);
  const chat = view && "chat" in view ? view.chat : null;

  const tried = useRef(false);
  const load = () =>
    invoke<Me | null>("social_me").then((m) => {
      setMe(m);
      if (m) return invoke<FriendList>("social_friends").then(setList);
    }, (e) => setError(String(e)));
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    if (me === null) {
      setName(l.name);
      if (!tried.current && NICK.test(l.name)) {
        tried.current = true;
        act(invoke("social_sign_up", { name: l.name }));
      }
    }
    if (me && social.myId !== me.id) social.connect(me.id);
  }, [me]);
  useEffect(() => {
    social.openChat(chat);
    return () => social.openChat(null);
  }, [chat]);
  useEffect(() => {
    const q = query.trim();
    if (!q) return setFound(null);
    const timer = setTimeout(() => invoke<Player[]>("social_search", { q }).then(setFound, () => setFound([])), 250);
    return () => clearTimeout(timer);
  }, [query]);

  const act = (p: Promise<unknown>) => {
    setError(null);
    return p.then(load, (e) => setError(String(e)));
  };

  if (me === undefined) return error ? <Empty bee="offline">{error}</Empty> : <p className="muted">{t("friends.loading")}</p>;

  if (me === null)
    return (
      <>
        <h1 className="page-title">{t("nav.friends")}</h1>
        <section className="card">
          <h2>{t("friends.createTitle")}</h2>
          <p className="muted">{t("friends.createHint")}</p>
          <div className="field">
            <input
              className="input"
              autoFocus
              maxLength={16}
              value={name}
              placeholder={t("home.nickname")}
              aria-label={t("home.nickname")}
              onChange={(e) => setName(e.currentTarget.value)}
              onKeyDown={(e) => e.key === "Enter" && NICK.test(name) && act(invoke("social_sign_up", { name }))}
            />
            <button className="btn" disabled={!NICK.test(name)} onClick={() => act(invoke("social_sign_up", { name }))}>
              <Glyph name="user-plus" /> {t("friends.create")}
            </button>
          </div>
          {name && !NICK.test(name) && <p className="error">{t("account.badNick")}</p>}
          {error && <p className="error">{error}</p>}
        </section>
      </>
    );

  const rename = () => act(invoke("social_rename", { name })).then(() => setRenaming(false));
  const relation = (id: string) =>
    id === me.id
      ? "me"
      : list?.friends.some((f) => f.id === id)
        ? "friend"
        : list?.outgoing.some((f) => f.id === id)
          ? "sent"
          : list?.incoming.some((f) => f.id === id)
            ? "incoming"
            : "none";
  const request = (p: Player) => act(invoke("social_friend_request", { name: p.name }));
  const friend = chat ? list?.friends.find((f) => f.id === chat) : undefined;

  return (
    <>
      <div className="page-head">
        <h1 className="page-title">{t("nav.friends")}</h1>
        <div className="actions">
          {renaming ? (
            <>
              <input
                className="input"
                autoFocus
                maxLength={16}
                value={name}
                aria-label={t("home.nickname")}
                onChange={(e) => setName(e.currentTarget.value)}
                onKeyDown={(e) => e.key === "Enter" && NICK.test(name) && rename()}
              />
              <button className="btn btn-ghost" onClick={() => setRenaming(false)}>
                <Glyph name="x" /> {t("common.cancel")}
              </button>
              <button className="btn" disabled={!NICK.test(name)} onClick={rename}>
                <Glyph name="check" /> {t("builds.save")}
              </button>
            </>
          ) : (
            <button className="btn btn-ghost" title={t("friends.rename")} disabled={me.verified} onClick={() => (setName(me.name), setRenaming(true))}>
              <Head name={me.name} size={18} /> {me.name} <Glyph name="pencil" />
            </button>
          )}
        </div>
      </div>
      {error && <p className="error">{error}</p>}

      <div className="friends-split">
        <aside className="card friends-side">
          <div className="friends-search">
            <Glyph name="search" />
            <input
              className="input"
              maxLength={16}
              value={query}
              placeholder={t("friends.search")}
              aria-label={t("friends.search")}
              onChange={(e) => setQuery(e.currentTarget.value)}
            />
          </div>

          {found && (
            <ul className="friends-list">
              {found.length === 0 && <li className="muted small friends-note">{t("friends.searchNone")}</li>}
              {found.map((p) => (
                <li key={p.id}>
                  <button className="friend-row" onClick={() => (setView({ profile: p.name }), setQuery(""))}>
                    <Head name={p.name} />
                    <span className="friend-name">{p.name}</span>
                    {p.verified && <Glyph name="user-check" />}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {list && list.incoming.length > 0 && (
            <>
              <h3 className="friends-heading">{t("friends.incoming")}</h3>
              <ul className="friends-list">
                {list.incoming.map((p) => (
                  <li key={p.id} className="friend-row">
                    <Head name={p.name} />
                    <button className="friend-name link" onClick={() => setView({ profile: p.name })}>
                      {p.name}
                    </button>
                    <button className="btn btn-ghost btn-icon" title={t("friends.decline")} onClick={() => act(invoke("social_request_delete", { id: p.id }))}>
                      <Glyph name="x" />
                    </button>
                    <button className="btn btn-icon" title={t("friends.accept")} onClick={() => act(invoke("social_friend_accept", { id: p.id })).then(social.refreshPresence)}>
                      <Glyph name="check" />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          <PartyCard current={l.current} onJoin={(room) => l.current && l.play(l.current, { join: room })} />

          <h3 className="friends-heading">{t("nav.friends")}</h3>
          {list && list.friends.length === 0 && <p className="muted small friends-note">{t("friends.none")}</p>}
          <ul className="friends-list">
            {[...(list?.friends ?? [])]
              .sort((a, b) => Number(social.online.has(b.id)) - Number(social.online.has(a.id)))
              .map((p) => (
                <li key={p.id}>
                  <button className="friend-row" aria-pressed={chat === p.id} onClick={() => setView({ chat: p.id })}>
                    <span className="head-wrap">
                      <Head name={p.name} />
                      <span className="presence-dot" data-online={social.online.has(p.id)} data-presence={social.online.has(p.id) ? (social.statuses[p.id] ?? "online") : undefined} />
                    </span>
                    <span className="friend-text">
                      <span className="friend-name">
                        {p.name} {p.clan && <ClanChip clan={p.clan} />}
                      </span>
                      {social.online.has(p.id) && (social.games[p.id] || social.servers[p.id] || p.note) && (
                        <small className="friend-activity">
                          {social.games[p.id] ? (
                            <>
                              <Glyph name="device-gamepad" size={12} /> Minecraft {social.games[p.id].mc}
                              {social.servers[p.id] ? ` · ${social.servers[p.id]}` : ""}
                            </>
                          ) : social.servers[p.id] ? (
                            social.servers[p.id]
                          ) : (
                            <Rich text={p.note!} />
                          )}
                        </small>
                      )}
                    </span>
                    {!!social.unread[p.id] && <span className="unread">{social.unread[p.id]}</span>}
                  </button>
                  {social.rooms[p.id] ? (
                    <button className="btn friend-join" title={t("friends.hosting", { mc: social.rooms[p.id].mc })} onClick={() => social.join(p.id)}>
                      <Glyph name="login-2" /> {t("friends.join")}
                    </button>
                  ) : (
                    social.servers[p.id] && (
                      <button className="btn friend-join" title={t("friends.playingOn", { host: social.servers[p.id] })} onClick={() => social.joinServer(p.id)}>
                        <Glyph name="login-2" /> {t("friends.join")}
                      </button>
                    )
                  )}
                </li>
              ))}
          </ul>

          {list && list.outgoing.length > 0 && (
            <>
              <h3 className="friends-heading">{t("friends.outgoing")}</h3>
              <ul className="friends-list">
                {list.outgoing.map((p) => (
                  <li key={p.id} className="friend-row">
                    <Head name={p.name} />
                    <span className="friend-name muted">{p.name}</span>
                    <button className="btn btn-ghost btn-icon" title={t("common.cancel")} onClick={() => act(invoke("social_request_delete", { id: p.id }))}>
                      <Glyph name="x" />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </aside>

        <section className="card friends-main">
          {friend ? (
            <Chat
              friend={friend}
              myId={me.id}
              onProfile={() => setView({ profile: friend.name })}
              onRemove={() => act(invoke("social_friend_remove", { id: friend.id })).then(() => setView(null))}
            />
          ) : view && "profile" in view ? (
            <PlayerView
              name={view.profile}
              relation={relation}
              onRequest={request}
              onAccept={(p) => act(invoke("social_friend_accept", { id: p.id })).then(social.refreshPresence)}
              onChat={(p) => setView({ chat: p.id })}
            />
          ) : (
            <Empty bee="friends-online">{t("friends.pick")}</Empty>
          )}
        </section>
      </div>
    </>
  );
}

function PlayerView({
  name,
  relation,
  onRequest,
  onAccept,
  onChat,
}: {
  name: string;
  relation: (id: string) => string;
  onRequest: (p: Player) => void;
  onAccept: (p: Player) => void;
  onChat: (p: Player) => void;
}) {
  const { t } = useI18n();
  const social = useSocial();
  const launcher = useLauncher();
  const [p, setP] = useState<PublicProfile | null | undefined>(undefined);
  const [skin, setSkin] = useState<{ dataUrl: string; slim: boolean } | null>(null);
  const [liked, setLiked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setP(undefined);
    setSkin(null);
    invoke<PublicProfile>("social_user", { name }).then(setP, (e) => (setP(null), setError(String(e))));
    skinOf(name).then(setSkin);
  }, [name]);
  useEffect(() => {
    if (p) invoke<string[]>("social_likes").then((l) => setLiked(l.includes(p.id)), () => {});
  }, [p?.id]);

  if (p === undefined) return <p className="muted">{t("friends.loading")}</p>;
  if (p === null) return <Empty bee="not-found">{error}</Empty>;
  const rel = relation(p.id);
  const c = p.cosmetics ?? {};
  const like = () =>
    invoke("social_like", { id: p.id, on: !liked }).then(() => {
      setLiked(!liked);
      setP({ ...p, likes: p.likes + (liked ? -1 : 1) });
    }, (e) => setError(String(e)));

  return (
    <div className="player-view">
      <div className="player-art">
        <SkinArt skin={skin?.dataUrl ?? null} slim={skin?.slim ?? false} back="cape" worn={c as Worn} zoom={0.85} />
      </div>
      <div className="player-info">
        <ProfileCard
          card={p.profile ?? {}}
          owner={{
            name: p.name,
            verified: p.verified,
            created: p.created,
            likes: p.likes,
            links: p.links,
            clan: p.clan ?? null,
            presence: social.online.has(p.id) ? (social.statuses[p.id] ?? "online") : "offline",
            playing: social.servers[p.id] ?? null,
            game: social.games[p.id] ?? null,
          }}
          onJoinServer={launcher.current ? (host) => launcher.play(launcher.current!, { join: host }) : undefined}
          actions={
            <>
              {rel === "friend" && (
                <button className="btn" onClick={() => onChat(p)}>
                  <Glyph name="pencil" /> {t("friends.chat")}
                </button>
              )}
              {rel === "none" && (
                <button className="btn" onClick={() => onRequest(p)}>
                  <Glyph name="user-plus" /> {t("friends.send")}
                </button>
              )}
              {rel === "incoming" && (
                <button className="btn" onClick={() => onAccept(p)}>
                  <Glyph name="check" /> {t("friends.accept")}
                </button>
              )}
              {rel === "sent" && <span className="muted">{t("friends.pending")}</span>}
              {rel !== "me" && (
                <button className="btn btn-ghost profile-like" data-on={liked} onClick={like}>
                  <Glyph name="heart" /> {t("profile.like")}
                </button>
              )}
            </>
          }
        />
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}

function PartyCard({ current, onJoin }: { current: unknown; onJoin: (room: string) => void }) {
  const { t } = useI18n();
  const social = useSocial();
  const { party, invites, partyActions: act } = social;
  if (!party && invites.length === 0) return null;
  return (
    <div className="friends-party">
      <h3 className="friends-heading">{t("party.title")}</h3>
      {invites.map((i) => (
        <div key={i.party} className="friend-row">
          <Head name={i.from.name} />
          <span className="friend-name small">{t("party.invited", { name: i.from.name })}</span>
          <button className="btn btn-ghost btn-icon" title={t("friends.decline")} onClick={() => act.decline(i.party)}>
            <Glyph name="x" />
          </button>
          <button className="btn btn-icon" title={t("party.join")} onClick={() => act.join(i.party)}>
            <Glyph name="check" />
          </button>
        </div>
      ))}
      {party && (
        <>
          <ul className="friends-list">
            {party.members.map((m) => (
              <li key={m.id} className="friend-row">
                <span className="head-wrap">
                  <Head name={m.name} />
                  <span className="presence-dot" data-online={m.id === social.myId || social.online.has(m.id)} />
                </span>
                <span className="friend-name">{m.name}</span>
                {m.id === party.leader && <span className="muted small">{t("party.leader")}</span>}
              </li>
            ))}
          </ul>
          {party.room && party.leader !== social.myId && (
            <p className="muted small">
              {t("party.room", { room: party.room })}{" "}
              <button className="btn" disabled={!current} onClick={() => onJoin(party.room!)}>
                <Glyph name="login-2" /> {t("rooms.join")}
              </button>
            </p>
          )}
          <button className="btn btn-ghost" onClick={act.leave}>
            <Glyph name="logout" /> {t("party.leave")}
          </button>
        </>
      )}
      {social.error && <p className="error">{social.error}</p>}
    </div>
  );
}

type Shot = { name: string; path: string; taken: number };

function Chat({ friend, myId, onProfile, onRemove }: { friend: Player; myId: string; onProfile: () => void; onRemove: () => void }) {
  const { t } = useI18n();
  const l = useLauncher();
  const social = useSocial();
  const [text, setText] = useState("");
  const [shots, setShots] = useState<Shot[] | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const log = useRef<HTMLDivElement>(null);
  const messages = social.chats[friend.id] ?? [];
  const online = social.online.has(friend.id);
  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [messages.length]);
  useEffect(() => {
    setShots(null);
    setText("");
  }, [friend.id]);

  const send = () => {
    const body = text.trim();
    if (!body) return;
    social.send(friend.id, body);
    setText("");
  };
  const upload = (p: Promise<string>) => {
    setShots(null);
    setSending(true);
    setError(null);
    p.then((url) => social.send(friend.id, url), (e) => setError(String(e))).finally(() => setSending(false));
  };
  const toggleShots = () =>
    shots
      ? setShots(null)
      : l.current
        ? invoke<Shot[]>("screenshot_list", { instanceId: l.current.id }).then((s) => setShots(s.slice(0, 24)), () => setShots([]))
        : setShots([]);
  const fromFile = () => {
    setShots(null);
    setSending(true);
    setError(null);
    invoke<string | null>("share_screenshot_file")
      .then((url) => url && social.send(friend.id, url), (e) => setError(String(e)))
      .finally(() => setSending(false));
  };

  return (
    <div className="chat">
      <div className="chat-head">
        <button className="friend-row" onClick={onProfile} title={t("friends.profile")}>
          <span className="head-wrap">
            <Head name={friend.name} size={32} />
            <span className="presence-dot" data-online={online} />
          </span>
          <span className="list-main">
            <span className="instance-name">{friend.name}</span>
            <span className="muted small">
              {social.rooms[friend.id]
                ? t("friends.hosting", { mc: social.rooms[friend.id].mc })
                : social.servers[friend.id]
                  ? t("friends.playingOn", { host: social.servers[friend.id] })
                  : online
                    ? t("friends.online")
                    : t("friends.offline")}
            </span>
          </span>
        </button>
        <div className="actions">
          {social.rooms[friend.id] ? (
            <button className="btn" onClick={() => social.join(friend.id)}>
              <Glyph name="login-2" /> {t("friends.join")}
            </button>
          ) : (
            social.servers[friend.id] && (
              <button className="btn" onClick={() => social.joinServer(friend.id)}>
                <Glyph name="login-2" /> {t("friends.join")}
              </button>
            )
          )}
          {online && !social.party?.members.some((m) => m.id === friend.id) && (
            <button className="btn btn-ghost" onClick={() => social.partyActions.invite(friend.id)}>
              <Glyph name="users-group" /> {t("party.invite")}
            </button>
          )}
          <button className="btn btn-ghost btn-icon" title={t("friends.remove")} onClick={onRemove}>
            <Glyph name="trash" />
          </button>
        </div>
      </div>
      <div className="chat-log" ref={log}>
        {messages.length === 0 && <p className="muted">{t("friends.noMessages")}</p>}
        {messages.map((m) => (
          <div key={m.id} className="chat-msg" data-mine={m.from === myId} data-shot={SHOT.test(m.text)}>
            {SHOT.test(m.text) ? (
              <button className="chat-img" onClick={() => openUrl(m.text)}>
                <img src={m.text} alt="" loading="lazy" />
              </button>
            ) : (
              m.text
            )}
            <time>{new Date(m.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
          </div>
        ))}
      </div>
      {shots && (
        <div className="chat-shots">
          {shots.length === 0 && <span className="muted small">{t("friends.noShots")}</span>}
          {shots.map((s) => (
            <button key={s.name} className="shot" title={s.name} onClick={() => upload(invoke<string>("share_screenshot", { instanceId: l.current!.id, name: s.name }).then((url) => url.replace("https://kromvia.com/s/", "https://api.kromvia.com/share/")))}>
              <img src={convertFileSrc(s.path)} alt="" loading="lazy" />
            </button>
          ))}
          <button className="btn btn-ghost" onClick={fromFile}>
            <Glyph name="upload" /> {t("friends.fromFile")}
          </button>
        </div>
      )}
      {!social.connected && <p className="muted small">{t("friends.connecting")}</p>}
      {(error || social.error) && <p className="error">{error ?? social.error}</p>}
      <div className="field">
        <button className="btn btn-ghost btn-icon" title={t("friends.attach")} aria-pressed={!!shots} disabled={!social.connected || sending} onClick={toggleShots}>
          <Glyph name="photo" />
        </button>
        <input
          className="input"
          autoFocus
          maxLength={500}
          value={text}
          placeholder={sending ? t("friends.uploading") : t("friends.messagePlaceholder")}
          aria-label={t("friends.messagePlaceholder")}
          onChange={(e) => setText(e.currentTarget.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
        />
        <button className="btn" disabled={!social.connected || !text.trim()} onClick={send}>
          <Glyph name="check" /> {t("friends.sendMessage")}
        </button>
      </div>
    </div>
  );
}
