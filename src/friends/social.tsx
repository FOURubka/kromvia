import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useI18n } from "../i18n";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useLauncher } from "../lib/launcher";
import { headOf } from "./Head";
import { outfitWorn, pushOutfit, savedOutfit, storeOutfit } from "../lib/outfit";
import { pushNote } from "../lib/notes";
import type { Game, Presence } from "../profile/card";
import { gameCard } from "../profile/gameCard";
import { addGameStats, storeStarred, syncStats } from "../profile/stats";

export type MyStatus = Exclude<Presence, "offline">;
export type ClanMessage = { id: number; from: string; name: string; text: string; time: number };
export type ClanMember = { id: string; name: string; verified: boolean; role: string; online: boolean; status: Presence; server: string | null; game: Game | null };
const STATUS_KEY = "kromvia.status";

export type ChatMessage = { id: number; from: string; to: string; text: string; time: number };
type Player = { id: string; name: string; verified: boolean };
export type Party = { id: string; leader: string; room: string | null; members: Player[] };
export type PartyInvite = { party: string; from: Player };
export type FriendRoom = { room: string; mc: string };

type HubEvent =
  | { type: "connected" | "disconnected" | "stopped" }
  | { type: "presence"; online: string[]; rooms?: Record<string, FriendRoom>; servers?: Record<string, string>; statuses?: Record<string, Presence>; games?: Record<string, Game> }
  | { type: "status"; id: string; status: Presence }
  | ({ type: "clan.chat" } & ClanMessage)
  | { type: "clan.presence"; clan: string | null; members: ClanMember[] }
  | { type: "game"; id: string; game: Game | null }
  | { type: "server"; id: string; host: string | null }
  | { type: "room"; id: string; room: FriendRoom | null }
  | { type: "online"; id: string; status?: Presence; quiet?: boolean }
  | { type: "offline"; id: string }
  | ({ type: "chat" } & ChatMessage)
  | { type: "error"; error: string }
  | { type: "party" }
  | { type: "party.invite"; party: string; from: Player };

type GameAsk = { do?: string; id?: string; to?: string; text?: string; party?: string; url?: string; name?: string; ids?: unknown; data?: unknown; share?: unknown };

const LOCAL_HOST = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.|[^.]*$)/;
const joinable = (servers: Record<string, string>) => Object.fromEntries(Object.entries(servers).filter(([, h]) => !LOCAL_HOST.test(h)));

type MeLite = { id: string; dev?: boolean; clan?: { id: string; tag: string } | null; profile?: { nameColor?: string; nameColor2?: string; nameFont?: string } };
const nameColors = (m: MeLite) => {
  const font = m.profile?.nameFont && m.profile.nameFont !== "default" ? m.profile.nameFont : null;
  return m.profile?.nameColor || m.profile?.nameColor2 || font ? { a: m.profile?.nameColor ?? null, b: m.profile?.nameColor2 ?? null, font } : null;
};

const SHOT = /^https:\/\/api\.kromvia\.com\/share\/[A-Za-z0-9]{4,16}$/;

function useSocialState() {
  const { t } = useI18n();
  const [myId, setMyId] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [online, setOnline] = useState<Set<string>>(new Set());
  const [rooms, setRooms] = useState<Record<string, FriendRoom>>({});
  const [servers, setServers] = useState<Record<string, string>>({});
  const [statuses, setStatuses] = useState<Record<string, Presence>>({});
  const [games, setGames] = useState<Record<string, Game>>({});
  const [myClan, setMyClan] = useState<{ id: string; tag: string } | null>(null);
  const [clanChat, setClanChat] = useState<ClanMessage[]>([]);
  const [clanMembers, setClanMembers] = useState<ClanMember[]>([]);
  const [clanUnread, setClanUnread] = useState(0);
  const clanOpen = useRef(false);
  const addClan = (msgs: ClanMessage[]) =>
    setClanChat((c) => {
      const known = new Set(c.map((m) => m.id));
      return [...c, ...msgs.filter((m) => !known.has(m.id))].sort((a, b) => a.id - b.id).slice(-200);
    });
  const [myStatus, setMyStatusState] = useState<MyStatus>(() => {
    try {
      const v = localStorage.getItem(STATUS_KEY);
      return v === "idle" || v === "dnd" || v === "invisible" ? v : "online";
    } catch {
      return "online";
    }
  });
  const dnd = useRef(myStatus === "dnd");
  dnd.current = myStatus === "dnd";
  const setMyStatus = (v: MyStatus) => {
    setMyStatusState(v);
    try {
      localStorage.setItem(STATUS_KEY, v);
    } catch {}
  };
  useEffect(() => {
    invoke("social_status", { status: myStatus }).catch(() => {});
  }, [myStatus]);
  useEffect(() => {
    setClanChat([]);
    setClanMembers([]);
    if (!myClan) return;
    invoke<ClanMessage[]>("social_clan", { method: "GET", path: "/v1/me/clan/messages", body: null }).then(addClan, () => {});
    invoke("social_clan_presence").catch(() => {});
    const id = setInterval(() => invoke("social_clan_presence").catch(() => {}), 30_000);
    return () => clearInterval(id);
  }, [myClan?.id]);
  const [hideServer, setHideServerState] = useState(() => {
    try {
      return localStorage.getItem("kromvia.hideServer") === "1";
    } catch {
      return false;
    }
  });
  const setHideServer = (hide: boolean) => {
    setHideServerState(hide);
    try {
      localStorage.setItem("kromvia.hideServer", hide ? "1" : "0");
    } catch {}
  };
  useEffect(() => {
    invoke("social_hide_server", { hide: hideServer }).catch(() => {});
  }, [hideServer]);
  const [chats, setChats] = useState<Record<string, ChatMessage[]>>({});
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [party, setParty] = useState<Party | null>(null);
  const [invites, setInvites] = useState<PartyInvite[]>([]);
  const loadParty = () =>
    invoke<{ party: Party | null; invites: PartyInvite[] }>("social_party").then((p) => {
      setParty(p.party);
      setInvites(p.invites);
    }, () => {});
  const open = useRef<string | null>(null);
  const me = useRef<string | null>(null);
  const names = useRef<Record<string, string>>({});
  const [gameFriends, setGameFriends] = useState<{ id: string; name: string }[]>([]);
  const gameChat = useRef<string | null>(null);
  const gameAsked = useRef(false);
  const [gameTick, setGameTick] = useState(0);
  const [heads, setHeads] = useState<Record<string, string>>({});
  const [setup, setSetup] = useState<Record<string, unknown> | null>(null);
  const [myName, setMyName] = useState<{ a: string | null; b: string | null; font: string | null } | null>(null);
  const [card, setCard] = useState<Record<string, unknown> | null>(null);
  const cardFor = useRef<(name: string) => void>(() => {});
  const instancesRef = useRef<{ id: string }[]>([]);
  const joinFriend = useRef<(id: string) => void>(() => {});
  const loadFriends = () =>
    invoke<{ friends: { id: string; name: string }[] }>("social_friends").then((f) => {
      for (const x of f.friends) names.current[x.id] = x.name;
      setGameFriends(f.friends.map((x) => ({ id: x.id, name: x.name })));
      for (const x of f.friends) headOf(x.name).then((h) => h && setHeads((m) => (m[x.id] === h ? m : { ...m, [x.id]: h })));
    }, () => {});

  const toast = async (id: string, text: (name: string) => string, action?: Record<string, string>) => {
    if (!names.current[id]) {
      const list = await invoke<{ friends: { id: string; name: string }[] }>("social_friends").catch(() => null);
      for (const f of list?.friends ?? []) names.current[f.id] = f.name;
    }
    const name = names.current[id];
    if (name) invoke("game_toast", { title: "Kromvia", text: text(name), action: action ?? null }).catch(() => {});
  };

  const add = (other: string, msgs: ChatMessage[]) =>
    setChats((c) => {
      const known = new Set((c[other] ?? []).map((m) => m.id));
      return { ...c, [other]: [...(c[other] ?? []), ...msgs.filter((m) => !known.has(m.id))].sort((a, b) => a.id - b.id) };
    });

  useEffect(() => {
    const off = listen<HubEvent>("social", ({ payload: e }) => {
      if (e.type === "connected") {
        setConnected(true);
        invoke("social_clan_presence").catch(() => {});
      }
      else if (e.type === "disconnected" || e.type === "stopped") {
        setConnected(false);
        setOnline(new Set());
        setRooms({});
        setServers({});
        setStatuses({});
        setGames({});
      } else if (e.type === "presence") {
        setOnline(new Set(e.online));
        setRooms(e.rooms ?? {});
        setServers(joinable(e.servers ?? {}));
        setStatuses(e.statuses ?? {});
        setGames(e.games ?? {});
      } else if (e.type === "status") setStatuses((m) => ({ ...m, [e.id]: e.status }));
      else if (e.type === "clan.presence") setClanMembers(e.members);
      else if (e.type === "clan.chat") {
        addClan([e]);
        if (e.from !== me.current) {
          if (!clanOpen.current) setClanUnread((n) => n + 1);
          if (!dnd.current) invoke("game_toast", { title: "Kromvia", text: `[${t("clan.title")}] ${e.name}: ${e.text}`, action: null }).catch(() => {});
        }
      }
      else if (e.type === "game")
        setGames(({ [e.id]: _, ...rest }) => (e.game ? { ...rest, [e.id]: e.game } : rest));
      else if (e.type === "server")
        setServers(({ [e.id]: _, ...rest }) => (e.host ? { ...rest, ...joinable({ [e.id]: e.host }) } : rest));
      else if (e.type === "room")
        setRooms(({ [e.id]: _, ...rest }) => (e.room ? { ...rest, [e.id]: e.room } : rest));
      else if (e.type === "online") {
        setOnline((s) => new Set(s).add(e.id));
        setStatuses(({ [e.id]: _, ...rest }) => (e.status && e.status !== "online" ? { ...rest, [e.id]: e.status } : rest));
        if (!e.quiet && !dnd.current) toast(e.id, (name) => t("friends.toastOnline", { name }), { chat: e.id });
      }
      else if (e.type === "offline") {
        setRooms(({ [e.id]: _, ...rest }) => rest);
        setServers(({ [e.id]: _, ...rest }) => rest);
        setStatuses(({ [e.id]: _, ...rest }) => rest);
        setGames(({ [e.id]: _, ...rest }) => rest);
        setOnline((s) => {
          const n = new Set(s);
          n.delete(e.id);
          return n;
        });
      }
      else if (e.type === "chat") {
        const other = e.from === me.current ? e.to : e.from;
        add(other, [e]);
        if (e.from !== me.current && open.current !== other && gameChat.current !== other) {
          setUnread((u) => ({ ...u, [other]: (u[other] ?? 0) + 1 }));
          const name = names.current[other];
          if (name && !dnd.current) pushNote({ id: `chat:${other}`, kind: "message", text: `${name}: ${e.text}`, page: "friends" });
        }
        if (e.from !== me.current && !dnd.current) toast(e.from, (name) => `${name}: ${e.text}`, { chat: e.from });
      } else if (e.type === "party") loadParty();
      else if (e.type === "party.invite") {
        loadParty();
        pushNote({ id: `party:${e.party}`, kind: "party", text: t("party.toastInvite", { name: e.from.name }), page: "friends" });
        invoke("game_toast", { title: "Kromvia", text: t("party.toastInvite", { name: e.from.name }), action: { party: e.party } }).catch(() => {});
      } else if (e.type === "error") setError(e.error);
    });
    return () => {
      off.then((f) => f());
    };
  }, []);

  const connect = (id: string) => {
    me.current = id;
    setMyId(id);
    invoke("social_connect");
    loadParty();
  };
  useEffect(() => {
    const syncDev = (m: { dev?: boolean }) => {
      const o = savedOutfit();
      if (!!o.dev !== !!m.dev) {
        const next = { ...o, dev: !!m.dev };
        storeOutfit(next);
        pushOutfit(next).catch(() => {});
      }
    };
    invoke<MeLite | null>("social_me").then((m) => {
      if (!m) return;
      setMyClan(m.clan ?? null);
      setMyName(nameColors(m));
      connect(m.id);
      syncDev(m);
      invoke("social_cosmetics", { worn: outfitWorn(savedOutfit()) }).catch(() => {});
    }, () => {});
    const onFocus = () => invoke<MeLite | null>("social_me").then((m) => m && (syncDev(m), setMyClan(m.clan ?? null), setMyName(nameColors(m))), () => {});
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const openChat = (id: string | null) => {
    open.current = id;
    if (!id) return;
    setUnread((u) => ({ ...u, [id]: 0 }));
    invoke<ChatMessage[]>("social_messages", { id }).then((m) => add(id, m), (e) => setError(String(e)));
  };
  const sendClan = (text: string) => {
    setError(null);
    return invoke("social_clan_chat", { text }).catch((e) => setError(String(e)));
  };
  const openClan = (open: boolean) => {
    clanOpen.current = open;
    if (open) setClanUnread(0);
  };
  const reloadClan = () =>
    invoke<{ clan?: { id: string; tag: string } | null } | null>("social_me").then((m) => setMyClan(m?.clan ?? null), () => {});
  const send = (to: string, text: string) => {
    setError(null);
    return invoke("social_chat", { to, text }).catch((e) => setError(String(e)));
  };
  const partyAct = (p: Promise<unknown>) => {
    setError(null);
    return p.then(loadParty, (e) => setError(String(e)));
  };
  const partyActions = {
    invite: (id: string) => partyAct(invoke("social_party_invite", { id })),
    join: (party: string) => partyAct(invoke("social_party_join", { party })),
    decline: (party: string) => partyAct(invoke("social_party_decline", { party })),
    leave: () => partyAct(invoke("social_party_leave")),
    setRoom: (room: string | null) => partyAct(invoke("social_party_room", { room })),
  };
  const l = useLauncher();
  instancesRef.current = l.instances;
  cardFor.current = (name: string) => {
    const f = gameFriends.find((x) => x.name.toLowerCase() === name.toLowerCase());
    const host = f && servers[f.id] && !LOCAL_HOST.test(servers[f.id]) ? servers[f.id] : null;
    gameCard(name, t, host, f?.id ?? null, myId).then(
      (c) => setCard({ ...c, at: Date.now() }),
      (e) => setCard({ name, error: String(e), at: Date.now() }),
    );
  };
  useEffect(() => {
    if (!myId || !l.instances.length) return;
    syncStats(instancesRef.current);
    const off = listen("game-exit", () => syncStats(instancesRef.current));
    return () => {
      off.then((f) => f());
    };
  }, [myId, l.instances.length]);
  const playingInst = l.running.length ? l.instances.find((i) => i.id === l.running[0].instanceId) : undefined;
  const playingMc = playingInst?.mcVersion ?? null;
  useEffect(() => {
    invoke("social_game", playingMc ? { mc: playingMc, since: Date.now() } : { mc: null, since: null }).catch(() => {});
  }, [playingMc]);
  const hostedRoom = (l.hosting && l.rooms[l.hosting]) || null;
  const leads = !!party && party.leader === myId;
  const hostedMc = (l.hosting && l.instances.find((i) => i.id === l.hosting)?.mcVersion) || null;
  useEffect(() => {
    if (connected) invoke("social_room", { room: hostedRoom, mc: hostedRoom ? hostedMc : null, instance: hostedRoom ? l.hosting : null }).catch(() => {});
  }, [connected, hostedRoom, hostedMc]);
  useEffect(() => {
    if (leads && party!.room !== hostedRoom) partyActions.setRoom(hostedRoom);
  }, [leads, hostedRoom]);
  useEffect(() => {
    const off = listen<GameAsk>("game-social", ({ payload: a }) => {
      gameAsked.current = true;
      if (a.do === "load") {
        loadFriends();
        loadParty();
      } else if (a.do === "open") {
        const id = a.id ?? null;
        gameChat.current = id;
        if (id) {
          setUnread((u) => ({ ...u, [id]: 0 }));
          invoke<ChatMessage[]>("social_messages", { id }).then((m) => add(id, m), () => {});
        }
      } else if (a.do === "send" && a.to && a.text?.trim()) send(a.to, a.text.trim().slice(0, 500));
      else if (a.do === "clanSend" && a.text?.trim()) sendClan(a.text.trim().slice(0, 500));
      else if (a.do === "clanOpen") {
        setClanUnread(0);
        invoke("social_clan_presence").catch(() => {});
      }
      else if (a.do === "invite" && a.id) partyActions.invite(a.id);
      else if (a.do === "join" && a.party) partyActions.join(a.party);
      else if (a.do === "decline" && a.party) partyActions.decline(a.party);
      else if (a.do === "leave") partyActions.leave();
      else if (a.do === "url" && a.url && SHOT.test(a.url)) openUrl(a.url).catch(() => {});
      else if (a.do === "joinFriend" && a.id) joinFriend.current(a.id);
      else if (a.do === "card" && a.name) cardFor.current(a.name);
      else if (a.do === "setupDone") setSetup(null);
      else if (a.do === "like" && a.id && a.name) {
        const name = a.name;
        invoke("social_like", { id: a.id, on: a.text !== "off" }).then(() => cardFor.current(name), () => {});
      } else if (a.do === "friendAdd" && a.name) {
        const name = a.name;
        invoke("social_friend_request", { name }).then(
          () => setCard((c) => (c && c.name === name ? { ...c, requested: true, at: Date.now() } : c)),
          (e) => setCard((c) => (c && c.name === name ? { ...c, notice: String(e), at: Date.now() } : c)),
        );
      }
      else if (a.do === "setup") invoke("social_setup", { setup: a.data ?? null }).catch(() => {});
      else if (a.do === "getSetup" && a.name) {
        const name = a.name;
        invoke<{ name: string; setup: unknown }>("social_user_setup", { name }).then(
          (r) => setSetup({ name: r.name, data: r.setup, at: Date.now() }),
          (e) => setSetup({ name, error: String(e), at: Date.now() }),
        );
      }
      else if (a.do === "starred" && storeStarred(a.ids)) syncStats(instancesRef.current);
      else if (a.do === "gameStats" && addGameStats(a.data, a.share)) syncStats(instancesRef.current);
      setGameTick((n) => n + 1);
    });
    return () => {
      off.then((f) => f());
    };
  }, []);
  useEffect(() => {
    if (!gameAsked.current) return;
    const chatWith = gameChat.current;
    const state = {
      me: myId,
      clan: myClan
        ? {
            ...myClan,
            unread: clanUnread,
            members: clanMembers.map((m) => ({ id: m.id, name: m.name, online: m.online, server: m.server && !LOCAL_HOST.test(m.server) ? m.server : null, me: m.id === myId })),
            chat: clanChat.slice(-50).map((m) => ({ from: m.name, text: m.text, time: m.time })),
          }
        : null,
      connected,
      error,
      friends: gameFriends.map((f) => ({ ...f, online: online.has(f.id), unread: unread[f.id] ?? 0, head: heads[f.id] ?? null, room: rooms[f.id]?.room ?? null, server: servers[f.id] ?? null })),
      party,
      invites,
      card,
      name: myName,
      setup,
      chat: chatWith ? { with: chatWith, messages: (chats[chatWith] ?? []).slice(-50).map((m) => ({ from: m.from, text: m.text, time: m.time })) } : null,
    };
    invoke("game_social", { state }).catch(() => {});
  }, [gameTick, card, setup, myName, myId, myClan, clanChat, clanMembers, clanUnread, connected, error, gameFriends, online, unread, party, invites, chats, heads, rooms, servers]);
  const totalUnread = Object.values(unread).reduce((a, b) => a + b, 0);
  const join = (id: string) => {
    const r = rooms[id];
    if (!r) return;
    setError(null);
    if (!l.joinRoom(r.room, r.mc, id)) setError(t("friends.noBuildFor", { mc: r.mc }));
  };
  joinFriend.current = join;
  const joinServer = (id: string) => {
    const host = servers[id];
    if (!host) return;
    setError(null);
    if (!l.current) return setError(t("friends.noInstance"));
    l.play(l.current, { join: host });
  };

  return { party, invites, partyActions, myId, connected, online, rooms, join, servers, joinServer, hideServer, setHideServer, statuses, games, myStatus, setMyStatus, myClan, reloadClan, clanChat, clanMembers, clanUnread, sendClan, openClan, chats, unread, totalUnread, error, connect, openChat, send, refreshPresence: () => invoke("social_presence").catch(() => {}) };
}

type Social = ReturnType<typeof useSocialState>;
const Ctx = createContext<Social | null>(null);

export function SocialProvider({ children }: { children: ReactNode }) {
  return <Ctx.Provider value={useSocialState()}>{children}</Ctx.Provider>;
}

export function useSocial() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useSocial outside SocialProvider");
  return s;
}
