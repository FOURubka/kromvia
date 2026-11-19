
import { DurableObject } from "cloudflare:workers";
import type { Env } from "./index";
import { WINDOW_MS } from "./auth";
import { normHost, setPlaying, STALE_MS, wornAround } from "./playing";
import { clanMates, clanRoster } from "./clans";

type Status = "online" | "idle" | "dnd" | "invisible";
type Game = { mc: string; since: number };
type Who = { id: string; name: string; room?: Room | null; server?: string | null; status?: Status; game?: Game | null };

const STATUSES: Status[] = ["online", "idle", "dnd", "invisible"];
const readStatus = (v: unknown): Status | null => (STATUSES.includes(v as Status) ? (v as Status) : null);
type Room = { room: string; mc: string };

const ROOM_HOST = /^[a-z0-9-]{1,63}(\.[a-z0-9-]{1,63}){1,6}(:[0-9]{1,5})?$/;
const MC_VERSION = /^[0-9a-z.+-]{1,32}$/i;

export const MAX_TEXT = 500;

export const NO_PINGS = [
  "hypixel.net",
  "minemen.club",
  "pvp.land",
  "cubecraft.net",
  "mineplex.com",
  "blocksmc.com",
  "pika-network.net",
  "jartexnetwork.com",
  "bedwarspractice.club",
  "mccentral.org",
  "hoplite.gg",
  "mcplayhd.net",
  "zonix.us",
  "stray.gg",
  "ranked.gg",
  "minehut.com",
];

export const pingsOff = (host: string) => {
  const h = host.toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
  return NO_PINGS.some((s) => h === s || h.endsWith("." + s));
};

const DIMENSION = /^[a-z0-9_.-]{1,32}:[a-z0-9_./-]{1,64}$/;

export class Hub extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS used_sigs (sig TEXT PRIMARY KEY, time INTEGER NOT NULL)");
  }

  async fetch(req: Request) {
    const who: Who = { id: req.headers.get("x-account-id")!, name: req.headers.get("x-account-name")!, status: readStatus(req.headers.get("x-kromvia-status")) ?? "online" };
    const sql = this.ctx.storage.sql;
    sql.exec("DELETE FROM used_sigs WHERE time < ?", Date.now() - 2 * WINDOW_MS);
    if (sql.exec("INSERT OR IGNORE INTO used_sigs (sig, time) VALUES (?, ?)", req.headers.get("x-kromvia-sig"), Date.now()).rowsWritten === 0) {
      return Response.json({ error: "signature already used" }, { status: 401 });
    }
    const wasOnline = this.visible(who.id);
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server, [who.id]);
    server.serializeAttachment(who);
    const friends = await this.friendsOf(who.id);
    server.send(JSON.stringify(this.presence(friends)));
    if (!wasOnline && this.visible(who.id)) this.tell(friends, { type: "online", id: who.id, status: this.statusOf(who.id) });
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    const who = ws.deserializeAttachment() as Who;
    let msg: { type?: unknown; to?: unknown; text?: unknown; host?: unknown; nick?: unknown; hide?: unknown; status?: unknown; game?: unknown; names?: unknown; room?: unknown; mc?: unknown; dim?: unknown; x?: unknown; y?: unknown; z?: unknown };
    try {
      msg = JSON.parse(typeof raw === "string" ? raw : new TextDecoder().decode(raw));
    } catch {
      return ws.send(JSON.stringify({ type: "error", error: "not JSON" }));
    }
    if (msg.type === "presence") {
      const friends = await this.friendsOf(who.id);
      return ws.send(JSON.stringify(this.presence(friends)));
    }
    if (msg.type === "status") return this.setStatus(ws, who, msg.status);
    if (msg.type === "game") return this.setGame(ws, who, msg.game);
    if (msg.type === "room") return this.setRoom(ws, who, msg.room, msg.mc);
    if (msg.type === "chat") return this.chat(ws, who, msg.to, msg.text);
    if (msg.type === "clan.chat") return this.clanChat(ws, who, msg.text);
    if (msg.type === "clan.presence") return this.clanPresence(ws, who);
    if (msg.type === "ping") return this.ping(ws, who, msg);
    if (msg.type === "server") {
      if (!(await this.env.LIMIT.limit({ key: `server:${who.id}` })).success) return ws.send(JSON.stringify({ type: "error", error: "too many messages, slow down" }));
      const error = await setPlaying(this.env.DB, who, msg.host, msg.nick);
      if (error) return ws.send(JSON.stringify({ type: "error", error }));
      const before = this.serverOf(who.id);
      const server = msg.host == null || msg.hide === true ? null : normHost(msg.host);
      ws.serializeAttachment({ ...(ws.deserializeAttachment() as Who), server });
      const now = this.serverOf(who.id);
      if (now !== before && this.visible(who.id)) this.tell(await this.friendsOf(who.id), { type: "server", id: who.id, host: now });
      return;
    }
    if (msg.type === "lookup") {
      if (!(await this.env.LIMIT.limit({ key: `lookup:${who.id}` })).success) return ws.send(JSON.stringify({ type: "error", error: "too many messages, slow down" }));
      const found = await wornAround(this.env.DB, who.id, msg.names);
      return ws.send(JSON.stringify({ type: "worn", ...(found ?? { host: null, worn: {} }) }));
    }
    ws.send(JSON.stringify({ type: "error", error: "unknown message" }));
  }

  async webSocketClose(ws: WebSocket) {
    const who = ws.deserializeAttachment() as Who;
    ws.close();
    if (who.room && !this.roomOf(who.id, ws)) this.tell(await this.friendsOf(who.id), { type: "room", id: who.id, room: null });
    if (who.server && this.online(who.id, ws) && !this.serverOf(who.id, ws)) this.tell(await this.friendsOf(who.id), { type: "server", id: who.id, host: null });
    if (who.game && this.visible(who.id, ws) && !this.gameOf(who.id, ws)) this.tell(await this.friendsOf(who.id), { type: "game", id: who.id, game: null });
    if (this.online(who.id, ws)) {
      if (who.status !== "invisible" && !this.visible(who.id, ws)) this.tell(await this.friendsOf(who.id), { type: "offline", id: who.id });
      return;
    }
    await setPlaying(this.env.DB, who, null, null);
    this.tell(await this.friendsOf(who.id), { type: "offline", id: who.id });
  }

  async webSocketError(ws: WebSocket) {
    await this.webSocketClose(ws);
  }

  private async chat(ws: WebSocket, who: Who, to: unknown, text: unknown) {
    const fail = (error: string) => ws.send(JSON.stringify({ type: "error", error }));
    if (typeof to !== "string" || typeof text !== "string") return fail("bad chat message");
    const body = text.trim();
    if (!body || body.length > MAX_TEXT) return fail(`messages are 1–${MAX_TEXT} characters`);
    if (!(await this.env.LIMIT.limit({ key: `chat:${who.id}` })).success) return fail("too many messages, slow down");
    const [a, b] = who.id < to ? [who.id, to] : [to, who.id];
    if (!(await this.env.DB.prepare("SELECT 1 FROM friendships WHERE a = ? AND b = ?").bind(a, b).first())) return fail("you can only message friends");
    const time = Date.now();
    const row = await this.env.DB.prepare("INSERT INTO messages (a, b, from_id, text, created) VALUES (?, ?, ?, ?, ?) RETURNING id")
      .bind(a, b, who.id, body, time)
      .first<number>("id");
    this.tell([who.id, to], { type: "chat", id: row, from: who.id, to, text: body, time });
  }

  private async clanChat(ws: WebSocket, who: Who, text: unknown) {
    const fail = (error: string) => ws.send(JSON.stringify({ type: "error", error }));
    if (typeof text !== "string") return fail("bad chat message");
    const body = text.trim();
    if (!body || body.length > MAX_TEXT) return fail(`messages are 1–${MAX_TEXT} characters`);
    if (!(await this.env.LIMIT.limit({ key: `chat:${who.id}` })).success) return fail("too many messages, slow down");
    const mates = await clanMates(this.env.DB, who.id);
    if (!mates) return fail("you are not in a clan");
    const time = Date.now();
    const id = await this.env.DB.prepare("INSERT INTO clan_messages (clan, from_id, text, created) VALUES (?, ?, ?, ?) RETURNING id").bind(mates.clan, who.id, body, time).first<number>("id");
    this.tell(mates.ids, { type: "clan.chat", id, from: who.id, name: who.name, text: body, time });
  }

  private async clanPresence(ws: WebSocket, who: Who) {
    const roster = await clanRoster(this.env.DB, who.id);
    if (!roster) return ws.send(JSON.stringify({ type: "clan.presence", clan: null, members: [] }));
    const members = roster.members.map((m) => {
      const on = m.id === who.id || this.visible(m.id);
      return { ...m, online: on, status: on ? this.statusOf(m.id) : "offline", server: on ? this.serverOf(m.id) : null, game: on ? this.gameOf(m.id) : null };
    });
    ws.send(JSON.stringify({ type: "clan.presence", clan: roster.clan, members }));
  }

  private async ping(ws: WebSocket, who: Who, msg: { host?: unknown; dim?: unknown; x?: unknown; y?: unknown; z?: unknown }) {
    const fail = (error: string) => ws.send(JSON.stringify({ type: "ping.error", error }));
    const { host, dim, x, y, z } = msg;
    const coord = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && Math.abs(n) < 3e7;
    if (typeof host !== "string" || !ROOM_HOST.test(host.toLowerCase()) && !/^[0-9.]{7,15}(:[0-9]{1,5})?$/.test(host)) return fail("bad server");
    if (typeof dim !== "string" || !DIMENSION.test(dim) || !coord(x) || !coord(y) || !coord(z)) return fail("bad ping");
    if (pingsOff(host)) return fail("Pings are off on this server: it is a PvP server.");
    if (!(await this.env.LIMIT.limit({ key: `ping:${who.id}` })).success) return fail("too many pings, slow down");
    const { results } = await this.env.DB.prepare("SELECT m.account FROM party_members m JOIN party_members me ON me.party = m.party WHERE me.account = ? AND m.account != me.account")
      .bind(who.id)
      .all<{ account: string }>();
    const to = new Set(results.map((r) => r.account));
    const h = normHost(host);
    const mates = await clanMates(this.env.DB, who.id);
    if (mates && h) {
      const others = mates.ids.filter((id) => id !== who.id);
      if (others.length) {
        const here = await this.env.DB.prepare(`SELECT account FROM playing WHERE host = ? AND updated > ? AND account IN (${others.map(() => "?").join(",")})`)
          .bind(h, Date.now() - STALE_MS, ...others)
          .all<{ account: string }>();
        here.results.forEach((r) => to.add(r.account));
      }
    }
    if (to.size === 0) return fail(mates ? "No party or clanmates on this server." : "You are not in a party.");
    this.tell([...to], { type: "ping", from: who.id, name: who.name, host: host.toLowerCase(), dim, x, y, z });
  }

  private async setRoom(ws: WebSocket, who: Who, room: unknown, mc: unknown) {
    const next: Room | null =
      typeof room === "string" && ROOM_HOST.test(room.toLowerCase()) && typeof mc === "string" && MC_VERSION.test(mc) ? { room: room.toLowerCase(), mc } : null;
    if (room !== null && !next) return ws.send(JSON.stringify({ type: "error", error: "bad room" }));
    ws.serializeAttachment({ ...who, room: next });
    this.tell(await this.friendsOf(who.id), { type: "room", id: who.id, room: next });
  }

  private roomOf(id: string, except?: WebSocket): Room | null {
    for (const s of this.ctx.getWebSockets(id)) {
      if (s === except || s.readyState !== WebSocket.OPEN) continue;
      const room = (s.deserializeAttachment() as Who).room;
      if (room) return room;
    }
    return null;
  }

  private async setStatus(ws: WebSocket, who: Who, raw: unknown) {
    const status = readStatus(raw);
    if (!status) return ws.send(JSON.stringify({ type: "error", error: "bad status" }));
    const before = this.visible(who.id) ? this.statusOf(who.id) : "invisible";
    ws.serializeAttachment({ ...(ws.deserializeAttachment() as Who), status });
    const after = this.visible(who.id) ? this.statusOf(who.id) : "invisible";
    if (before === after) return;
    const friends = await this.friendsOf(who.id);
    if (after === "invisible") return this.tell(friends, { type: "offline", id: who.id });
    if (before === "invisible") {
      this.tell(friends, { type: "online", id: who.id, status: after, quiet: true });
      const game = this.gameOf(who.id);
      if (game) this.tell(friends, { type: "game", id: who.id, game });
      const server = this.serverOf(who.id);
      if (server) this.tell(friends, { type: "server", id: who.id, host: server });
      return;
    }
    this.tell(friends, { type: "status", id: who.id, status: after });
  }

  private async setGame(ws: WebSocket, who: Who, raw: unknown) {
    let game: Game | null = null;
    if (raw !== null && raw !== undefined) {
      const g = raw as { mc?: unknown; since?: unknown };
      if (typeof g !== "object" || typeof g.mc !== "string" || !MC_VERSION.test(g.mc) || typeof g.since !== "number" || !Number.isFinite(g.since)) {
        return ws.send(JSON.stringify({ type: "error", error: "bad game" }));
      }
      game = { mc: g.mc, since: Math.min(g.since, Date.now()) };
    }
    const before = this.gameOf(who.id);
    ws.serializeAttachment({ ...(ws.deserializeAttachment() as Who), game });
    const after = this.gameOf(who.id);
    if (JSON.stringify(before) !== JSON.stringify(after) && this.visible(who.id)) this.tell(await this.friendsOf(who.id), { type: "game", id: who.id, game: after });
  }

  private statusOf(id: string, except?: WebSocket): Status {
    let best: Status = "invisible";
    for (const s of this.ctx.getWebSockets(id)) {
      if (s === except || s.readyState !== WebSocket.OPEN) continue;
      const st = (s.deserializeAttachment() as Who).status ?? "online";
      if (STATUSES.indexOf(st) < STATUSES.indexOf(best)) best = st;
    }
    return best;
  }

  private visible(id: string, except?: WebSocket) {
    return this.online(id, except) && this.statusOf(id, except) !== "invisible";
  }

  private gameOf(id: string, except?: WebSocket): Game | null {
    for (const s of this.ctx.getWebSockets(id)) {
      if (s === except || s.readyState !== WebSocket.OPEN) continue;
      const game = (s.deserializeAttachment() as Who).game;
      if (game) return game;
    }
    return null;
  }

  private serverOf(id: string, except?: WebSocket): string | null {
    for (const s of this.ctx.getWebSockets(id)) {
      if (s === except || s.readyState !== WebSocket.OPEN) continue;
      const server = (s.deserializeAttachment() as Who).server;
      if (server) return server;
    }
    return null;
  }

  private presence(friends: string[]) {
    const online = friends.filter((f) => this.visible(f));
    const rooms: Record<string, Room> = {};
    const servers: Record<string, string> = {};
    const statuses: Record<string, Status> = {};
    const games: Record<string, Game> = {};
    for (const f of online) {
      const room = this.roomOf(f);
      if (room) rooms[f] = room;
      const server = this.serverOf(f);
      if (server) servers[f] = server;
      const status = this.statusOf(f);
      if (status !== "online") statuses[f] = status;
      const game = this.gameOf(f);
      if (game) games[f] = game;
    }
    return { type: "presence", online, rooms, servers, statuses, games };
  }

  notify(ids: string[], msg: unknown) {
    this.tell(ids, msg);
  }

  drop(id: string) {
    for (const s of this.ctx.getWebSockets(id)) {
      try {
        s.close(4403, "account deleted");
      } catch {
      }
    }
  }

  private online(id: string, except?: WebSocket) {
    return this.ctx.getWebSockets(id).some((s) => s !== except && s.readyState === WebSocket.OPEN);
  }

  private tell(ids: string[], msg: unknown) {
    const text = JSON.stringify(msg);
    for (const id of ids) {
      for (const s of this.ctx.getWebSockets(id)) {
        try {
          s.send(text);
        } catch {
        }
      }
    }
  }

  private async friendsOf(id: string): Promise<string[]> {
    const { results } = await this.env.DB.prepare("SELECT CASE WHEN a = ?1 THEN b ELSE a END AS id FROM friendships WHERE a = ?1 OR b = ?1")
      .bind(id)
      .all<{ id: string }>();
    return results.map((r) => r.id);
  }
}
