import { beforeEach, expect, test } from "bun:test";
import app from "../src/index";
import { b64url, payload, WINDOW_MS } from "../src/auth";
import { testDb } from "./d1";
import { DEV_DISCORD, normHost, setPlaying, STALE_MS, wornAround, wornOn } from "../src/playing";

let env: { DB: D1Database; LIMIT: RateLimit; HUB: unknown; SHOTS: unknown };
let r2: Map<string, Uint8Array>;
let sent: { ids: string[]; msg: any }[];
let dropped: string[];
let hits: Map<string, number>;
let ip: string;
const BURST = 1000;
beforeEach(() => {
  hits = new Map();
  ip = "203.0.113.7";
  sent = [];
  dropped = [];
  r2 = new Map();
  env = {
    SHOTS: {
      put: async (k: string, v: Uint8Array) => void r2.set(k, v),
      get: async (k: string) => (r2.has(k) ? { body: r2.get(k) } : null),
      delete: async (ks: string[]) => ks.forEach((k) => r2.delete(k)),
    },
    HUB: { idFromName: () => "hub", get: () => ({ notify: async (ids: string[], msg: unknown) => void sent.push({ ids, msg }), drop: async (id: string) => void dropped.push(id) }) },
    DB: testDb(),
    LIMIT: { limit: async ({ key }) => ({ success: hits.set(key, (hits.get(key) ?? 0) + 1).get(key)! <= BURST }) },
  };
});

type Device = { pub: string; priv: CryptoKey };

async function device(): Promise<Device> {
  const k = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as CryptoKeyPair;
  return { pub: b64url(await crypto.subtle.exportKey("raw", k.publicKey)), priv: k.privateKey };
}

async function call(d: Device | null, method: string, path: string, body?: unknown, opts: { time?: number; signer?: Device } = {}) {
  const bytes = body === undefined ? new Uint8Array() : body instanceof Uint8Array ? body : new TextEncoder().encode(JSON.stringify(body));
  const headers: Record<string, string> = { "cf-connecting-ip": ip };
  if (d) {
    const time = String(opts.time ?? Date.now());
    const sig = await crypto.subtle.sign({ name: "Ed25519" }, (opts.signer ?? d).priv, await payload(method, path, time, bytes));
    Object.assign(headers, { "x-kromvia-key": d.pub, "x-kromvia-time": time, "x-kromvia-sig": b64url(sig) });
  }
  const res = await app.fetch(new Request(`https://api.test${path}`, { method, headers, body: body === undefined ? undefined : bytes }), env);
  const type = res.headers.get("content-type") ?? "";
  return { status: res.status, type, json: (type.includes("json") ? await res.json() : null) as any };
}

async function signup(name: string) {
  const d = await device();
  const r = await call(d, "POST", "/v1/accounts", { name });
  expect(r.status).toBe(201);
  return { ...d, id: r.json.id as string };
}

test("signs up once per key and keeps names unique", async () => {
  const d = await device();
  expect((await call(d, "POST", "/v1/accounts", { name: "x" })).status).toBe(400);
  const a = await call(d, "POST", "/v1/accounts", { name: "Steve" });
  expect(a.status).toBe(201);
  expect(a.json).toMatchObject({ name: "Steve", verified: false });
  expect((await call(d, "POST", "/v1/accounts", { name: "Other" })).json.id).toBe(a.json.id);
  expect((await call(await device(), "POST", "/v1/accounts", { name: "steve" })).status).toBe(409);
  expect((await call(d, "GET", "/v1/me")).json).toMatchObject({ name: "Steve", created: expect.any(Number), cosmetics: {} });
});

test("refuses unsigned, forged and stale requests", async () => {
  const d = await signup("Alex");
  expect((await call(null, "GET", "/v1/me")).status).toBe(401);
  expect((await call(d, "GET", "/v1/me", undefined, { signer: await device() })).json.error).toBe("bad signature");
  expect((await call(d, "GET", "/v1/me", undefined, { time: Date.now() - WINDOW_MS - 1000 })).status).toBe(401);
  expect((await call(await device(), "GET", "/v1/me")).status).toBe(403);
  expect((await call(d, "GET", "/v1/me")).status).toBe(200);
  const time = String(Date.now());
  const sig = b64url(await crypto.subtle.sign({ name: "Ed25519" }, d.priv, await payload("GET", "/v1/me", time, new Uint8Array())));
  const alias = sig.slice(0, -1) + "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"[("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_".indexOf(sig.at(-1)!) ^ 1)];
  const res = await app.fetch(new Request("https://api.test/v1/me", { headers: { "x-kromvia-key": d.pub, "x-kromvia-time": time, "x-kromvia-sig": alias } }), env);
  expect(res.status).toBe(401);
});

test("signature covers the body", async () => {
  const d = await signup("Alex");
  const time = String(Date.now());
  const sig = await crypto.subtle.sign({ name: "Ed25519" }, d.priv, await payload("PATCH", "/v1/me", time, new TextEncoder().encode('{"name":"Good"}')));
  const res = await app.fetch(
    new Request("https://api.test/v1/me", {
      method: "PATCH",
      headers: { "x-kromvia-key": d.pub, "x-kromvia-time": time, "x-kromvia-sig": b64url(sig) },
      body: '{"name":"Evil"}',
    }),
    env,
  );
  expect(res.status).toBe(401);
});

test("renames", async () => {
  const d = await signup("Alex");
  await signup("Taken");
  expect((await call(d, "PATCH", "/v1/me", { name: "taken" })).status).toBe(409);
  expect((await call(d, "PATCH", "/v1/me", { name: "Alex2" })).json.name).toBe("Alex2");
});

test("friend requests, accept, decline, remove", async () => {
  const a = await signup("Alice");
  const b = await signup("Bob");
  const c = await signup("Carol");
  expect((await call(a, "POST", "/v1/friends/requests", { name: "nobody" })).status).toBe(404);
  expect((await call(a, "POST", "/v1/friends/requests", { name: "alice" })).status).toBe(400);

  expect((await call(a, "POST", "/v1/friends/requests", { name: "bob" })).json.status).toBe("requested");
  let fb = (await call(b, "GET", "/v1/friends")).json;
  expect(fb.incoming.map((x: any) => x.name)).toEqual(["Alice"]);
  expect((await call(a, "GET", "/v1/friends")).json.outgoing.map((x: any) => x.name)).toEqual(["Bob"]);

  expect((await call(b, "POST", `/v1/friends/requests/${a.id}/accept`)).json.status).toBe("friends");
  fb = (await call(b, "GET", "/v1/friends")).json;
  expect([fb.friends.map((x: any) => x.name), fb.incoming, fb.outgoing]).toEqual([["Alice"], [], []]);
  expect((await call(a, "GET", "/v1/friends")).json.friends.map((x: any) => x.name)).toEqual(["Bob"]);
  expect((await call(b, "POST", `/v1/friends/requests/${a.id}/accept`)).status).toBe(404);

  await call(c, "POST", "/v1/friends/requests", { name: "Alice" });
  expect((await call(a, "POST", "/v1/friends/requests", { name: "Carol" })).json.status).toBe("friends");

  await call(b, "DELETE", `/v1/friends/${a.id}`);
  expect((await call(a, "GET", "/v1/friends")).json.friends.map((x: any) => x.name)).toEqual(["Carol"]);

  await call(b, "POST", "/v1/friends/requests", { name: "Carol" });
  await call(c, "DELETE", `/v1/friends/requests/${b.id}`);
  expect((await call(b, "GET", "/v1/friends")).json.outgoing).toEqual([]);
});

test("cosmetics are private to write, public to read", async () => {
  const a = await signup("Alice");
  await signup("Bob");
  expect((await call(a, "PUT", "/v1/me/cosmetics", { cosmetics: [] })).status).toBe(400);
  expect((await call(a, "PUT", "/v1/me/cosmetics", { cosmetics: { x: "y".repeat(5000) } })).status).toBe(413);
  expect((await call(a, "PUT", "/v1/me/cosmetics", { cosmetics: { style: "custom", art: "AAAA" } })).status).toBe(400);
  expect((await call(a, "PUT", "/v1/me/cosmetics", { cosmetics: { style: "custom", art: Buffer.alloc(640, 9).toString("base64") } })).status).toBe(200);
  expect((await call(a, "PUT", "/v1/me/cosmetics", { cosmetics: { cape: "kromvia", colors: { cape: "#ff00ff" } } })).status).toBe(200);
  expect((await call(a, "GET", "/v1/me")).json.cosmetics).toEqual({ cape: "kromvia", colors: { cape: "#ff00ff" } });
});

test("cosmetics show only to players on that server, for nicks that are a Kromvia name", async () => {
  const a = await signup("Alice");
  const b = await signup("Bob");
  const c = await signup("Carol");
  await call(a, "PUT", "/v1/me/cosmetics", { cosmetics: { models: ["horns"] } });
  expect((await call(null, "GET", "/v1/cosmetics?server=play.test&names=alice")).status).toBe(401);
  const look = (who: string, names: unknown) => wornAround(env.DB, who, names);
  expect(await look(c.id, ["alice"])).toBeNull();
  await setPlaying(env.DB, { id: c.id, name: "Carol" }, "play.test", "Carol");
  expect(await look(c.id, ["alice"])).toEqual({ host: "play.test", worn: {} });

  expect(await setPlaying(env.DB, { id: a.id, name: "Alice" }, "Play.Test:25565", "Alice")).toBeNull();
  expect(await look(c.id, ["ALICE", "bob", "bad name", 5])).toEqual({ host: "play.test", worn: { alice: { models: ["horns"] } } });
  expect(await look(c.id, "alice")).toEqual({ host: "play.test", worn: {} });
  await setPlaying(env.DB, { id: c.id, name: "Carol" }, "other.test", "Carol");
  expect(await look(c.id, ["alice"])).toEqual({ host: "other.test", worn: {} });

  expect(await setPlaying(env.DB, { id: b.id, name: "Bob" }, "play.test", "Alice")).toBe("someone else plays as Alice there");
  expect(await setPlaying(env.DB, { id: b.id, name: "Bob" }, "other.test", "Alice")).toBeNull();
  expect(await look(c.id, ["alice"])).toEqual({ host: "other.test", worn: {} });
  expect(await setPlaying(env.DB, { id: a.id, name: "Alice" }, "other.test", "Alice")).toBeNull();
  expect(await look(c.id, ["alice"])).toEqual({ host: "other.test", worn: { alice: { models: ["horns"] } } });

  expect(await setPlaying(env.DB, { id: a.id, name: "Alice" }, null, null)).toBeNull();
  expect(await look(c.id, ["alice"])).toEqual({ host: "other.test", worn: {} });
  await setPlaying(env.DB, { id: b.id, name: "Bob" }, "other.test", "Bob");
  const realNow = Date.now;
  Date.now = () => realNow() + STALE_MS + 1;
  try {
    expect(await wornOn(env.DB, "other.test", ["bob"])).toEqual({});
    expect(await look(c.id, ["bob"])).toBeNull();
  } finally {
    Date.now = realNow;
  }
  expect(await setPlaying(env.DB, { id: b.id, name: "Bob" }, "not a host", "Bob")).toBe("bad server address");
  expect(await setPlaying(env.DB, { id: b.id, name: "Bob" }, "other.test", "x")).toBe("bad nick");
});

test("only the licensed _4rubka_ account is marked dev", async () => {
  const dev = await signup("_4rubka_");
  const fake = await signup("Faker");
  await call(fake, "PUT", "/v1/me/cosmetics", { cosmetics: { dev: true } });
  await setPlaying(env.DB, { id: dev.id, name: "_4rubka_" }, "dev.test", "_4rubka_");
  await setPlaying(env.DB, { id: fake.id, name: "Faker" }, "dev.test", "Faker");
  expect(await wornOn(env.DB, "dev.test", ["_4rubka_", "faker"])).toEqual({ _4rubka_: {}, faker: {} });
  await env.DB.prepare("UPDATE accounts SET mc_uuid = ? WHERE id = ?").bind("00000000000000000000000000000001", dev.id).run();
  expect(await wornOn(env.DB, "dev.test", ["_4rubka_", "faker"])).toEqual({ _4rubka_: { dev: true }, faker: {} });
});

test("server addresses are compared normalised", () => {
  expect(normHost(" Play.Example.NET.:25565")).toBe("play.example.net");
  expect(normHost("10.0.0.1:25570")).toBe("10.0.0.1:25570");
  expect(normHost("a b")).toBeNull();
  expect(normHost(5)).toBeNull();
});

test("caps sign-ups per network per day, IPv6 by /64", async () => {
  const first = await signup("Bot0");
  for (let i = 1; i < 5; i++) await signup(`Bot${i}`);
  const r = await call(await device(), "POST", "/v1/accounts", { name: "Bot5" });
  expect(r.status).toBe(429);
  ip = "2001:db8:1:2:aaaa::1";
  for (let i = 0; i < 5; i++) await signup(`Six${i}`);
  ip = "2001:db8:1:2:bbbb::9";
  expect((await call(await device(), "POST", "/v1/accounts", { name: "Six5" })).status).toBe(429);
  ip = "198.51.100.1";
  await signup("Human");
  ip = "203.0.113.7";
  expect((await call(first, "POST", "/v1/accounts", { name: "Bot0" })).json.id).toBe(first.id);
});

test("too many requests from one network get 429", async () => {
  hits.set(ip, BURST);
  expect((await call(null, "GET", "/health")).status).toBe(429);
  ip = "198.51.100.1";
  expect((await call(null, "GET", "/health")).status).toBe(200);
});

test("rejects oversized bodies and non-JSON", async () => {
  const d = await signup("Alex");
  expect((await call(d, "PATCH", "/v1/me", { name: "a".repeat(20_000) })).status).toBe(413);
  expect((await call(null, "GET", "/nope")).status).toBe(404);
  const big = new ReadableStream({ start: (c) => (c.enqueue(new Uint8Array(20_000)), c.close()) });
  const res = await app.fetch(new Request("https://api.test/v1/me", { method: "PATCH", body: big, duplex: "half" } as RequestInit), env);
  expect(res.status).toBe(413);
});

test("likes count, rank the top and can be taken back", async () => {
  const a = await signup("Alice");
  const b = await signup("Bob");
  const c = await signup("Carol");
  const dev = await signup("_4rubka_");
  expect((await call(a, "PUT", `/v1/likes/${a.id}`)).status).toBe(400);
  expect((await call(a, "PUT", "/v1/likes/nobody")).status).toBe(404);
  await call(a, "PUT", `/v1/likes/${b.id}`);
  await call(a, "PUT", `/v1/likes/${b.id}`);
  await call(c, "PUT", `/v1/likes/${b.id}`);
  await call(b, "PUT", `/v1/likes/${c.id}`);
  await call(a, "PUT", `/v1/likes/${dev.id}`);
  await call(b, "PUT", `/v1/likes/${dev.id}`);
  await call(c, "PUT", `/v1/likes/${dev.id}`);
  expect((await call(dev, "GET", "/v1/me")).json.likes).toBe(3);
  expect((await call(b, "GET", "/v1/me")).json.likes).toBe(2);
  expect((await call(a, "GET", "/v1/likes")).json.sort()).toEqual([b.id, dev.id].sort());
  const top = await call(null, "GET", "/v1/top");
  expect(top.json.map((p: any) => [p.name, p.likes])).toEqual([["Bob", 2], ["Carol", 1]]);
  await call(a, "DELETE", `/v1/likes/${b.id}`);
  expect((await call(b, "GET", "/v1/me")).json.likes).toBe(1);
});

test("public profiles by name, any case", async () => {
  const a = await signup("Alice");
  const b = await signup("Bob");
  await call(a, "PUT", `/v1/likes/${b.id}`);
  await call(b, "PUT", "/v1/me/cosmetics", { cosmetics: { items: ["cap"], cape: true } });
  const p = await call(null, "GET", "/v1/users/bob");
  expect(p.status).toBe(200);
  expect(p.json).toMatchObject({ id: b.id, name: "Bob", verified: false, mc_uuid: null, likes: 1, cosmetics: { items: ["cap"], cape: true } });
  expect(p.json.pubkey).toBeUndefined();
  expect((await call(null, "GET", "/v1/users/nobody")).status).toBe(404);
});

test("players are searchable by name prefix", async () => {
  await signup("Alice");
  await signup("Alfred");
  await signup("Bob");
  const names = async (q: string) => (await call(null, "GET", `/v1/users?q=${q}`)).json.map((p: any) => p.name).sort();
  expect(await names("al")).toEqual(["Alfred", "Alice"]);
  expect(await names("ALI")).toEqual(["Alice"]);
  expect(await names("x")).toEqual([]);
  expect(await names("%")).toEqual([]);
});

test("the dev badge follows the owner's Discord, not just the nick", async () => {
  const a = await signup("Alice");
  const c = await signup("Carol");
  await call(a, "PUT", "/v1/me/cosmetics", { cosmetics: { cape: true, dev: true } });
  await setPlaying(env.DB, { id: a.id, name: "Alice" }, "play.test", "Alice");
  await setPlaying(env.DB, { id: c.id, name: "Carol" }, "play.test", "Carol");
  expect(await wornOn(env.DB, "play.test", ["alice"])).toEqual({ alice: { cape: true } });
  expect((await call(a, "GET", "/v1/me")).json.dev).toBe(false);
  await env.DB.prepare("INSERT INTO links (account, provider, ext_id, name, created) VALUES (?, 'discord', ?, 'x', 0)").bind(a.id, DEV_DISCORD).run();
  expect(await wornOn(env.DB, "play.test", ["alice"])).toEqual({ alice: { cape: true, dev: true } });
  expect((await call(a, "GET", "/v1/me")).json.dev).toBe(true);
});

test("links need keys, then a one-time code links the account", async () => {
  const a = await signup("Alice");
  expect((await call(a, "POST", "/v1/me/links/discord")).status).toBe(503);
  expect((await call(a, "POST", "/v1/me/links/myspace")).status).toBe(404);
  Object.assign(env, { TELEGRAM_BOT_NAME: "kromvia_bot", TELEGRAM_BOT_TOKEN: "t", TELEGRAM_WEBHOOK_SECRET: "s" });
  const { url } = (await call(a, "POST", "/v1/me/links/telegram")).json;
  const code = new URL(url).searchParams.get("start");
  const sent: string[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (u: string) => (sent.push(String(u)), new Response("{}"))) as any;
  const hook = (secret: string, text: string) =>
    app.fetch(
      new Request("https://api.test/link/telegram/webhook", {
        method: "POST",
        headers: { "x-telegram-bot-api-secret-token": secret, "content-type": "application/json", "cf-connecting-ip": ip },
        body: JSON.stringify({ message: { text, chat: { id: 5 }, from: { id: 42, username: "alice_tg" } } }),
      }),
      env,
    );
  try {
    expect((await hook("wrong", `/start ${code}`)).status).toBe(403);
    expect((await hook("s", `/start ${code}`)).status).toBe(200);
    expect((await hook("s", `/start ${code}`)).status).toBe(200);
  } finally {
    globalThis.fetch = realFetch;
  }
  expect(sent.length).toBe(2);
  expect((await call(a, "GET", "/v1/me")).json.links).toEqual({ telegram: "alice_tg" });
  await call(a, "DELETE", "/v1/me/links/telegram");
  expect((await call(a, "GET", "/v1/me")).json.links).toEqual({});
});

test("proxies only the CurseForge calls the launcher makes, with the key added", async () => {
  const req = (method: string, path: string, body?: string) =>
    app.fetch(new Request(`https://api.test${path}`, { method, headers: { "cf-connecting-ip": ip }, body }), env as any);
  expect((await req("GET", "/cf/v1/mods/search?gameId=432")).status).toBe(503);

  const seen: { url: string; key: string | null; method: string }[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    seen.push({ url: String(input), key: new Headers(init?.headers).get("x-api-key"), method: init?.method ?? "GET" });
    return Response.json({ data: [] });
  }) as typeof fetch;
  try {
    Object.assign(env, { CURSEFORGE_API_KEY: "secret" });
    expect((await req("GET", "/cf/v1/mods/search?gameId=432&searchFilter=jei")).status).toBe(200);
    expect((await req("POST", "/cf/v1/mods/files", JSON.stringify({ fileIds: [1] }))).status).toBe(200);
    expect((await req("GET", "/cf/v1/mods/238222/files")).status).toBe(200);
    expect((await req("DELETE", "/cf/v1/mods/1")).status).toBe(404);
    expect((await req("GET", "/cf/v1/games")).status).toBe(404);
    expect((await req("GET", "/cf/v1/mods/../games")).status).toBe(404);
    expect((await req("POST", "/cf/v1/mods/files", "x".repeat(70 * 1024))).status).toBe(413);
    expect(seen).toEqual([
      { url: "https://api.curseforge.com/v1/mods/search?gameId=432&searchFilter=jei", key: "secret", method: "GET" },
      { url: "https://api.curseforge.com/v1/mods/files", key: "secret", method: "POST" },
      { url: "https://api.curseforge.com/v1/mods/238222/files", key: "secret", method: "GET" },
    ]);
  } finally {
    globalThis.fetch = real;
  }
});

async function befriend(x: Device & { id: string }, y: Device & { id: string }, yName: string) {
  await call(x, "POST", "/v1/friends/requests", { name: yName });
  await call(y, "POST", `/v1/friends/requests/${x.id}/accept`);
}

test("parties: invite friends, join, share a room, leave", async () => {
  const a = await signup("Alpha");
  const b = await signup("Bravo");
  const s = await signup("Stranger");
  await befriend(a, b, "Bravo");
  expect((await call(a, "POST", "/v1/party/invites", { id: s.id })).status).toBe(403);
  const inv = await call(a, "POST", "/v1/party/invites", { id: b.id });
  expect(inv.status).toBe(200);
  expect(sent.find((m) => m.msg.type === "party.invite")).toMatchObject({ ids: [b.id], msg: { party: inv.json.party, from: { name: "Alpha" } } });
  expect((await call(b, "GET", "/v1/party")).json.invites).toEqual([{ party: inv.json.party, from: expect.objectContaining({ name: "Alpha" }) }]);
  expect((await call(s, "POST", "/v1/party/join", { party: inv.json.party })).status).toBe(404);
  expect((await call(b, "POST", "/v1/party/join", { party: inv.json.party })).status).toBe(200);
  expect((await call(b, "PUT", "/v1/party/room", { room: "abc" })).status).toBe(403);
  expect((await call(a, "PUT", "/v1/party/room", { room: "quiet-fox.e4mc.link" })).status).toBe(200);
  const p = (await call(b, "GET", "/v1/party")).json.party;
  expect(p).toMatchObject({ leader: a.id, room: "quiet-fox.e4mc.link" });
  expect(p.members.map((m: any) => m.name)).toEqual(["Alpha", "Bravo"]);
  await call(a, "POST", "/v1/party/leave");
  expect((await call(b, "GET", "/v1/party")).json.party).toMatchObject({ leader: b.id, members: [expect.objectContaining({ name: "Bravo" })] });
  await call(b, "POST", "/v1/party/leave");
  expect((await call(b, "GET", "/v1/party")).json.party).toBeNull();
});

test("sync keeps entries per account", async () => {
  const a = await signup("Alpha");
  const b = await signup("Bravo");
  expect((await call(a, "PUT", "/v1/sync/bad!key", { data: 1 })).status).toBe(400);
  expect((await call(a, "PUT", "/v1/sync/settings", { data: { theme: "dark" } })).status).toBe(200);
  expect((await call(a, "GET", "/v1/sync/settings")).json.data).toEqual({ theme: "dark" });
  expect((await call(b, "GET", "/v1/sync/settings")).status).toBe(404);
  expect((await call(a, "GET", "/v1/sync")).json).toEqual([{ key: "settings", updated: expect.any(Number), size: 16 }]);
  await call(a, "DELETE", "/v1/sync/settings");
  expect((await call(a, "GET", "/v1/sync")).json).toEqual([]);
  const big = "x".repeat(100 * 1024);
  expect((await call(a, "PUT", "/v1/sync/big", { data: big })).status).toBe(200);
  expect((await call(a, "PATCH", "/v1/me", { name: big })).status).toBe(413);
});

test("shares are public by code", async () => {
  const a = await signup("Alpha");
  expect((await call(a, "POST", "/v1/shares", { kind: "log", data: { not: "text" } })).status).toBe(400);
  const r = await call(a, "POST", "/v1/shares", { kind: "build", data: { name: "Pack" } });
  expect(r.status).toBe(201);
  expect(r.json.code).toMatch(/^[2-9A-Z]{8}$/);
  const got = await call(null, "GET", `/share/${r.json.code.toLowerCase()}`);
  expect(got.json).toMatchObject({ kind: "build", data: { name: "Pack" }, from: { name: "Alpha" } });
  expect((await call(null, "GET", "/share/NOPE2345")).status).toBe(404);
});

test("only builds the owner lists show up in the public catalog", async () => {
  const a = await signup("Alpha");
  const b = await signup("Bravo");
  const hidden = await call(a, "POST", "/v1/shares", { kind: "build", data: { name: "Secret", dependencies: { minecraft: "1.21.1" }, files: [] } });
  const listed = await call(a, "POST", "/v1/shares", { kind: "build", data: { name: "PvP Pack", dependencies: { minecraft: "1.21.1", "fabric-loader": "0.16" }, files: [{}, {}] }, public: true });
  expect(listed.status).toBe(201);
  const all = await call(null, "GET", "/v1/builds");
  expect(all.json).toEqual([expect.objectContaining({ code: listed.json.code, name: "PvP Pack", mc: "1.21.1", loader: "fabric", mods: 2, from: expect.objectContaining({ name: "Alpha" }) })]);
  expect(all.json.some((x: { code: string }) => x.code === hidden.json.code)).toBe(false);
  expect((await call(null, "GET", "/v1/builds?q=pvp")).json).toHaveLength(1);
  expect((await call(null, "GET", "/v1/builds?q=nope")).json).toHaveLength(0);
  expect((await call(b, "POST", `/v1/shares/${listed.json.code}/private`)).status).toBe(404);
  expect((await call(a, "POST", `/v1/shares/${listed.json.code}/private`)).status).toBe(200);
  expect((await call(null, "GET", "/v1/builds")).json).toEqual([]);
});

test("screenshots and logs open in a browser", async () => {
  const a = await signup("Alpha");
  expect((await call(a, "POST", "/v1/shares/screenshot", new Uint8Array([1, 2, 3]))).status).toBe(400);
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, 0, 0]);
  const r = await call(a, "POST", "/v1/shares/screenshot", png);
  expect(r.status).toBe(201);
  const got = await call(null, "GET", `/share/${r.json.code}`);
  expect(got.type).toBe("image/png");
  const log = await call(a, "POST", "/v1/shares", { kind: "log", data: "[main/INFO] hi" });
  expect((await call(null, "GET", `/share/${log.json.code}`)).type).toStartWith("text/plain");
  await env.DB.prepare("UPDATE shares SET created = 0 WHERE code = ?").bind(r.json.code).run();
  await call(a, "POST", "/v1/shares", { kind: "build", data: {} });
  expect(r2.size).toBe(0);
});

test("deleting the account removes everything it owns and frees the name", async () => {
  const a = await signup("Alpha");
  const b = await signup("Bravo");
  await befriend(a, b, "Bravo");
  await call(a, "POST", "/v1/party/invites", { id: b.id });
  await call(b, "POST", "/v1/party/join", { party: (await call(b, "GET", "/v1/party")).json.invites[0].party });
  await call(b, "PUT", `/v1/likes/${a.id}`);
  await call(a, "PUT", "/v1/sync/settings", { data: 1 });
  const shot = await call(a, "POST", "/v1/shares/screenshot", new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0]));
  expect((await call(a, "DELETE", "/v1/me")).status).toBe(200);
  expect(dropped).toEqual([a.id]);
  expect(r2.size).toBe(0);
  expect((await call(null, "GET", `/share/${shot.json.code}`)).status).toBe(404);
  expect((await call(a, "GET", "/v1/me")).status).toBe(403);
  expect((await call(b, "GET", "/v1/friends")).json.friends).toEqual([]);
  expect((await call(b, "GET", "/v1/party")).json.party).toMatchObject({ leader: b.id, members: [expect.objectContaining({ name: "Bravo" })] });
  expect((await call(a, "POST", "/v1/accounts", { name: "Alpha" })).status).toBe(201);
});

test("crash reports need no account and are capped per network", async () => {
  const send = (body: unknown) => app.request("/crashes", { method: "POST", body: JSON.stringify(body), headers: { "cf-connecting-ip": ip } }, env);
  const report = { launcher: "0.1.1", os: "linux", arch: "x86_64", mc: "1.21.1", loader: { kind: "fabric", version: "0.19.5" }, cause: "brokenMod", mods: ["a.jar"], log: "x\njava.lang.IllegalStateException: boom 42\n", report: "" };
  expect((await send({ cause: "x" })).status).toBe(400);
  expect((await send(report)).status).toBe(201);
  const row = await env.DB.prepare("SELECT * FROM crashes").first<any>();
  expect(row.sig).toBe("brokenMod|java.lang.IllegalStateException: boom #");
  expect(row.loader).toBe("fabric 0.19.5");
  expect(row.net).not.toContain("203");
  for (let i = 1; i < 30; i++) await send(report);
  expect((await send(report)).status).toBe(429);
});

test("the bot lists linked Discord accounts with badges", async () => {
  const a = await signup("Linked");
  await env.DB.prepare("INSERT INTO links (account, provider, ext_id, name, created) VALUES (?, 'discord', '42', 'x', 0)").bind(a.id).run();
  const get = (auth?: string) => app.request("/bot/links", { headers: { "cf-connecting-ip": ip, ...(auth && { authorization: auth }) } }, { ...env, BOT_API_KEY: "k" });
  expect((await get()).status).toBe(403);
  expect((await get("Bearer nope")).status).toBe(403);
  const list = await (await get("Bearer k")).json();
  expect(list).toEqual([{ discord: "42", name: "Linked", badges: Date.now() < Date.UTC(2027, 0, 1) ? ["early"] : [] }]);
});

test("roadmap votes toggle once per network", async () => {
  const vote = (id: string) => app.request(`/v1/roadmap/${id}/vote`, { method: "POST", headers: { "cf-connecting-ip": ip, origin: "https://kromvia.com" } }, env);
  const item = (list: any[]) => list.find((x) => x.id === "crash-bisect");
  expect((await vote("nope")).status).toBe(404);
  const first = await vote("crash-bisect");
  expect(first.headers.get("access-control-allow-origin")).toBe("https://kromvia.com");
  expect(item(await first.json())).toEqual({ id: "crash-bisect", votes: 1, voted: true });
  ip = "198.51.100.9";
  expect(item(await (await vote("crash-bisect")).json())).toEqual({ id: "crash-bisect", votes: 2, voted: true });
  expect(item(await (await vote("crash-bisect")).json())).toEqual({ id: "crash-bisect", votes: 1, voted: false });
  const list = await (await app.request("/v1/roadmap", { headers: { "cf-connecting-ip": ip } }, env)).json();
  expect(item(list)).toEqual({ id: "crash-bisect", votes: 1, voted: false });
  expect(list.find((x: any) => x.id === "portable")).toEqual({ id: "portable", votes: 0, voted: false });
});

test("room mods are shared with friends only", async () => {
  const a = await signup("Hosty");
  const b = await signup("Guesty");
  const s = await signup("Outsider");
  await befriend(a, b, "Guesty");
  expect((await call(b, "GET", `/v1/friends/${a.id}/room-mods`)).status).toBe(404);
  expect((await call(a, "PUT", "/v1/me/room-mods", { mods: [{ p: "../x", v: "AABBCCDD" }] })).status).toBe(400);
  const mods = [{ p: "P7dR8mSH", v: "AABBCCDD" }];
  expect((await call(a, "PUT", "/v1/me/room-mods", { mods })).status).toBe(200);
  expect((await call(b, "GET", `/v1/friends/${a.id}/room-mods`)).json).toEqual({ mods });
  expect((await call(s, "GET", `/v1/friends/${a.id}/room-mods`)).status).toBe(403);
  await call(a, "DELETE", "/v1/me/room-mods");
  expect((await call(b, "GET", `/v1/friends/${a.id}/room-mods`)).status).toBe(404);
});

test("perf runs and crashes feed mod insight", async () => {
  const A = "AAAAAAAA", B = "BBBBBBBB", C = "CCCCCCCC";
  const post = (path: string, body: unknown, from: string) => app.request(path, { method: "POST", body: JSON.stringify(body), headers: { "cf-connecting-ip": from } }, env);
  const run = (n: number, projects: string[], fps: number) => post("/perf", { launcher: "0.1.15", os: "linux", gpu: "NVIDIA GeForce RTX 3060/PCIe/SSE2", cpu: "x", ramGb: 16, mc: "1.21.11", loader: "fabric", projects, fpsAvg: fps, fpsLow: fps / 2, seconds: 600 }, `198.51.100.${n}`);
  expect((await post("/perf", { os: "linux" }, "198.51.100.1")).status).toBe(400);
  for (let i = 1; i <= 6; i++) expect((await run(i, [A, C], 100)).status).toBe(201);
  for (let i = 11; i <= 16; i++) await run(i, [A, B, C], 70);
  const crash = { launcher: "0.1.15", os: "linux", arch: "x86_64", mc: "1.21.11", cause: "brokenMod", mods: [], projects: [A, B], log: "x", report: "" };
  for (let i = 21; i <= 24; i++) await post("/crashes", crash, `198.51.100.${i}`);
  const res = await app.request(`/perf/insight?mod=${B}&gpu=${encodeURIComponent("NVIDIA GeForce RTX 3060/PCIe/SSE2")}&mc=1.21.11&with=${A},${C}`, { headers: { "cf-connecting-ip": ip } }, env);
  const body = (await res.json()) as any;
  expect(body.cost).toEqual({ fps: 30, with: 6, without: 6 });
  expect(body.pairs).toEqual([{ project: A, crashed: 4, rate: 0.4 }]);
});

test("profile cards are checked, saved and public", async () => {
  const a = await signup("Carded");
  const bad = [
    { banner: "red" },
    { frame: "rainbow" },
    { bannerAngle: 400 },
    { nameFont: "comic sans" },
    { status: "x".repeat(81) },
    { mains: ["a", "b", "c", "d", "e", "f"] },
    { server: "not a host!" },
    { bio: "hi‮evil" },
    { showLinks: "yes" },
    { music: { title: "Sweden", url: "https://evil.example/x" } },
    { looking: ["pvp", "griefing"] },
    { mods: ["Sodium!"] },
    { shot: "../etc" },
  ];
  for (const profile of bad) expect((await call(a, "PUT", "/v1/me/profile", { profile })).status).toBe(400);
  const r = await call(a, "PUT", "/v1/me/profile", {
    profile: { banner: "#8B5CF6", status: "  building  a\tbase ", bio: "line one\r\n\n\n\nline two", frame: "gold", effect: "snow", mains: ["Bedwars", "bedwars", "SMP"], server: " Mc.Hypixel.net ", showLinks: false, junk: 1 },
  });
  expect(r.status).toBe(200);
  expect(r.json).toEqual({ banner: "#8b5cf6", status: "building a base", bio: "line one\n\nline two", frame: "gold", effect: "snow", mains: ["Bedwars", "SMP"], server: "mc.hypixel.net" });
  expect((await call(a, "GET", "/v1/me")).json.profile).toEqual(r.json);
  const p = await call(null, "GET", "/v1/users/carded");
  expect(p.json.profile).toEqual(r.json);
  expect(p.json.links).toBeUndefined();
  await call(a, "PUT", "/v1/me/profile", { profile: { showLinks: true } });
  expect((await call(null, "GET", "/v1/users/carded")).json.links).toEqual({});
});

test("profile extras: clan, music, favourites, looking for, mods, showcase", async () => {
  const a = await signup("Extras");
  const r = await call(a, "PUT", "/v1/me/profile", {
    profile: { music: { title: "Sweden", artist: "C418", url: "https://open.spotify.com/track/abc" }, mob: "Axolotl", block: "Amethyst", biome: "Cherry Grove", version: "1.21.11", looking: ["smp", "pvp"], mods: ["sodium", "sodium", "iris"], shot: "ab23cd45" },
  });
  expect(r.status).toBe(200);
  expect(r.json).toEqual({ music: { title: "Sweden", artist: "C418", url: "https://open.spotify.com/track/abc" }, mob: "Axolotl", block: "Amethyst", biome: "Cherry Grove", version: "1.21.11", looking: ["pvp", "smp"], mods: ["sodium", "iris"], shot: "AB23CD45" });
});

test("clans: create, open join, closed requests, owner hand-over, Kromvia clan", async () => {
  const a = await signup("ClanBoss");
  const b = await signup("ClanMate");
  const k = await call(null, "GET", "/v1/clans/kromvia");
  expect(k.json).toMatchObject({ id: "kromvia", name: "Kromvia", tag: "Kromvia", icon: "kromvia", open: true });
  expect((await call(a, "POST", "/v1/clans", { name: "x", tag: "TOOLONGTAG", icon: "sword" })).status).toBe(400);
  expect((await call(a, "POST", "/v1/clans", { name: "Fake", tag: "KV", icon: "kromvia" })).status).toBe(400);
  const made = await call(a, "POST", "/v1/clans", { name: "Night Owls", tag: "OWLS", icon: "moon", open: false });
  expect(made.status).toBe(201);
  expect((await call(b, "POST", "/v1/clans", { name: "night owls", tag: "x2", icon: "moon" })).status).toBe(409);
  expect((await call(b, "POST", `/v1/clans/${made.json.id}/join`)).json.status).toBe("requested");
  const mine = await call(a, "GET", "/v1/me/clan");
  expect(mine.json.role).toBe("owner");
  expect(mine.json.requests.map((r: any) => r.name)).toEqual(["ClanMate"]);
  expect((await call(a, "POST", `/v1/clans/${made.json.id}/requests/${b.id}`)).status).toBe(200);
  expect((await call(null, "GET", "/v1/users/clanmate")).json.clan).toMatchObject({ tag: "OWLS", icon: "moon" });
  await call(a, "DELETE", "/v1/me/clan");
  expect((await call(b, "GET", "/v1/me/clan")).json.role).toBe("owner");
  expect((await call(b, "POST", "/v1/clans/kromvia/join")).json.status).toBe("member");
  expect((await call(null, "GET", `/v1/clans/${made.json.id}`)).status).toBe(404);
  expect((await call(null, "GET", "/v1/clans?q=krom")).json[0]).toMatchObject({ id: "kromvia", members: 1 });
});

test("clan cape is the owner's to set and shows in the clan", async () => {
  const a = await signup("CapeBoss");
  const made = await call(a, "POST", "/v1/clans", { name: "Capers", tag: "CAPE", icon: "sword" });
  expect((await call(a, "PATCH", `/v1/clans/${made.json.id}`, { cape: "nope" })).status).toBe(400);
  const art = "A".repeat(854) + "==";
  expect((await call(a, "PATCH", `/v1/clans/${made.json.id}`, { cape: art })).status).toBe(200);
  expect((await call(null, "GET", `/v1/clans/${made.json.id}`)).json.cape).toBe(art);
  expect((await call(a, "GET", "/v1/me/clan/messages")).json).toEqual([]);
});
