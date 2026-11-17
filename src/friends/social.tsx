import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useI18n } from "../i18n";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useLauncher } from "../lib/launcher";
import { headOf } from "./Head";
import { outfitWorn, pushOutfit, savedOutfit, storeOutfit } from "../lib/outfit";
import { pushNote } from "../lib/notes";

export type ChatMessage = { id: number; from: string; to: string; text: string; time: number };
type Player = { id: string; name: string; verified: boolean };
export type Party = { id: string; leader: string; room: string | null; members: Player[] };
export type PartyInvite = { party: string; from: Player };
export type FriendRoom = { room: string; mc: string };

type HubEvent =
  | { type: "connected" | "disconnected" | "stopped" }
  | { type: "presence"; online: string[]; rooms?: Record<string, FriendRoom> }
  | { type: "room"; id: string; room: FriendRoom | null }
  | { type: "online" | "offline"; id: string }
  | ({ type: "chat" } & ChatMessage)
  | { type: "error"; error: string }
  | { type: "party" }
  | { type: "party.invite"; party: string; from: Player };

type GameAsk = { do?: string; id?: string; to?: string; text?: string; party?: string; url?: string };

const SHOT = /^https:\/\/api\.kromvia\.com\/share\/[A-Za-z0-9]{4,16}$/;

function useSocialState() {
  const { t } = useI18n();
  const [myId, setMyId] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [online, setOnline] = useState<Set<string>>(new Set());
  const [rooms, setRooms] = useState<Record<string, FriendRoom>>({});
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
      if (e.type === "connected") setConnected(true);
      else if (e.type === "disconnected" || e.type === "stopped") {
        setConnected(false);
        setOnline(new Set());
        setRooms({});
      } else if (e.type === "presence") {
        setOnline(new Set(e.online));
        setRooms(e.rooms ?? {});
      } else if (e.type === "room")
        setRooms(({ [e.id]: _, ...rest }) => (e.room ? { ...rest, [e.id]: e.room } : rest));
      else if (e.type === "online") {
        setOnline((s) => new Set(s).add(e.id));
        toast(e.id, (name) => t("friends.toastOnline", { name }), { chat: e.id });
      }
      else if (e.type === "offline") {
        setRooms(({ [e.id]: _, ...rest }) => rest);
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
          if (name) pushNote({ id: `chat:${other}`, kind: "message", text: `${name}: ${e.text}`, page: "friends" });
        }
        if (e.from !== me.current) toast(e.from, (name) => `${name}: ${e.text}`, { chat: e.from });
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
    invoke<{ id: string; dev?: boolean } | null>("social_me").then((m) => {
      if (!m) return;
      connect(m.id);
      syncDev(m);
      invoke("social_cosmetics", { worn: outfitWorn(savedOutfit()) }).catch(() => {});
    }, () => {});
    const onFocus = () => invoke<{ dev?: boolean } | null>("social_me").then((m) => m && syncDev(m), () => {});
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const openChat = (id: string | null) => {
    open.current = id;
    if (!id) return;
    setUnread((u) => ({ ...u, [id]: 0 }));
    invoke<ChatMessage[]>("social_messages", { id }).then((m) => add(id, m), (e) => setError(String(e)));
  };
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
      else if (a.do === "invite" && a.id) partyActions.invite(a.id);
      else if (a.do === "join" && a.party) partyActions.join(a.party);
      else if (a.do === "decline" && a.party) partyActions.decline(a.party);
      else if (a.do === "leave") partyActions.leave();
      else if (a.do === "url" && a.url && SHOT.test(a.url)) openUrl(a.url).catch(() => {});
      else if (a.do === "joinFriend" && a.id) joinFriend.current(a.id);
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
      connected,
      error,
      friends: gameFriends.map((f) => ({ ...f, online: online.has(f.id), unread: unread[f.id] ?? 0, head: heads[f.id] ?? null, room: rooms[f.id]?.room ?? null })),
      party,
      invites,
      chat: chatWith ? { with: chatWith, messages: (chats[chatWith] ?? []).slice(-50).map((m) => ({ from: m.from, text: m.text, time: m.time })) } : null,
    };
    invoke("game_social", { state }).catch(() => {});
  }, [gameTick, myId, connected, error, gameFriends, online, unread, party, invites, chats, heads, rooms]);
  const totalUnread = Object.values(unread).reduce((a, b) => a + b, 0);
  const join = (id: string) => {
    const r = rooms[id];
    if (!r) return;
    setError(null);
    if (!l.joinRoom(r.room, r.mc, id)) setError(t("friends.noBuildFor", { mc: r.mc }));
  };
  joinFriend.current = join;

  return { party, invites, partyActions, myId, connected, online, rooms, join, chats, unread, totalUnread, error, connect, openChat, send, refreshPresence: () => invoke("social_presence").catch(() => {}) };
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
