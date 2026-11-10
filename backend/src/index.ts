
import { Hono } from "hono";
import { b64url, verify } from "./auth";
import { DEV, NAME, isDev } from "./playing";
import { asset, downloads, manifest } from "./update";
export { Hub } from "./hub";

export type Env = {
  DB: D1Database;
  LIMIT: RateLimit;
  HUB: DurableObjectNamespace;
  SHOTS?: R2Bucket;
  DISCORD_CLIENT_ID?: string;
  DISCORD_CLIENT_SECRET?: string;
  TELEGRAM_BOT_NAME?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  CURSEFORGE_API_KEY?: string;
  GITHUB_TOKEN?: string;
  BOT_API_KEY?: string;
};

type Account = { id: string; pubkey: string; name: string; mc_uuid: string | null; cosmetics: string; created: number; seen: number };
type Vars = { key: string; body: unknown; raw: Uint8Array; account: Account };

const MAX_BODY = 16 * 1024;
const MAX_BIG_BODY = 256 * 1024;
const BIG_PATHS = /^\/v1\/(sync|shares)(\/|$)/;
const MAX_PARTY = 8;
const MAX_SYNC_KEYS = 64;
const SYNC_KEY = /^[A-Za-z0-9._-]{1,64}$/;
const SHARE_KINDS = ["build", "log"] as const;
const SHOT_PATH = "/v1/shares/screenshot";
const MAX_SHOT = 8 * 1024 * 1024;
const IMAGE_TYPES: [string, number[]][] = [
  ["image/png", [0x89, 0x50, 0x4e, 0x47]],
  ["image/jpeg", [0xff, 0xd8, 0xff]],
];
const SHARE_DAYS = 30;
const MAX_SHARES = 50;
const SHARE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const MAX_COSMETICS = 4 * 1024;
const MAX_FRIENDS = 200;
const SEEN_EVERY_MS = 60_000;
const SIGNUPS_PER_DAY = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

const app = new Hono<{ Bindings: Env; Variables: Vars }>();

const LINK_CODE_MS = 15 * 60_000;
const PROVIDERS = ["discord", "telegram"] as const;

const fail = (status: 400 | 401 | 403 | 404 | 409 | 413 | 429 | 503, error: string) => Response.json({ error }, { status });
const publicAccount = (a: Pick<Account, "id" | "name" | "mc_uuid">) => ({ id: a.id, name: a.name, verified: a.mc_uuid !== null });

function clientNet(req: Request): string {
  const ip = req.headers.get("cf-connecting-ip") ?? "unknown";
  if (!ip.includes(":")) return ip;
  const parts = ip.split("::")[0].split(":");
  return parts.slice(0, 4).join(":") + "::/64";
}

async function readCapped(req: Request, max: number): Promise<Uint8Array | null> {
  if (Number(req.headers.get("content-length") ?? 0) > max) return null;
  if (!req.body) return new Uint8Array();
  const out = new Uint8Array(max);
  let n = 0;
  const reader = req.body.getReader();
  for (let r = await reader.read(); !r.done; r = await reader.read()) {
    if (n + r.value.length > max) {
      await reader.cancel();
      return null;
    }
    out.set(r.value, n);
    n += r.value.length;
  }
  return out.subarray(0, n);
}

app.use("*", async (c, next) => {
  const { success } = await c.env.LIMIT.limit({ key: clientNet(c.req.raw) });
  if (!success) return fail(429, "too many requests, slow down");
  return next();
});

app.get("/health", (c) => c.json({ ok: true }));

app.get("/update/:target/:arch/:version", async (c) => {
  if (!c.env.GITHUB_TOKEN) return fail(503, "updates are not set up");
  const out = await manifest(c.env.GITHUB_TOKEN, new URL(c.req.url).origin);
  return out ? c.json(out) : fail(503, "no release");
});

app.get("/update/asset/:id{[0-9]+}", async (c) => {
  if (!c.env.GITHUB_TOKEN) return fail(503, "updates are not set up");
  const res = await asset(c.env.GITHUB_TOKEN, c.req.param("id"));
  if (!res.ok) return fail(404, "no such file");
  const headers = new Headers({ "content-type": "application/octet-stream" });
  const size = res.headers.get("content-length");
  if (size) headers.set("content-length", size);
  return new Response(res.body, { headers });
});

app.get("/download", async (c) => {
  if (!c.env.GITHUB_TOKEN) return fail(503, "downloads are not set up");
  const out = await downloads(c.env.GITHUB_TOKEN);
  if (!out) return fail(503, "no release");
  return c.json({ ...out, files: out.files.map(({ id: _, ...f }) => ({ ...f, url: `${new URL(c.req.url).origin}/download/${f.platform}` })) }, 200, {
    "cache-control": "public, max-age=300",
  });
});

app.get("/download/:platform", async (c) => {
  if (!c.env.GITHUB_TOKEN) return fail(503, "downloads are not set up");
  const file = (await downloads(c.env.GITHUB_TOKEN))?.files.find((f) => f.platform === c.req.param("platform"));
  if (!file) return fail(404, "no such download");
  const res = await asset(c.env.GITHUB_TOKEN, String(file.id));
  if (!res.ok) return fail(404, "no such file");
  const headers = new Headers({ "content-type": "application/octet-stream", "content-disposition": `attachment; filename="${file.name}"` });
  const size = res.headers.get("content-length");
  if (size) headers.set("content-length", size);
  return new Response(res.body, { headers });
});

const CF_ROUTES: [string, RegExp][] = [
  ["GET", /^\/v1\/mods\/search$/],
  ["GET", /^\/v1\/categories$/],
  ["GET", /^\/v1\/mods\/\d+$/],
  ["GET", /^\/v1\/mods\/\d+\/files$/],
  ["POST", /^\/v1\/mods$/],
  ["POST", /^\/v1\/mods\/files$/],
  ["POST", /^\/v1\/fingerprints\/432$/],
];
const CF_MAX_BODY = 64 * 1024;

app.on(["GET", "POST"], "/cf/*", async (c) => {
  const key = c.env.CURSEFORGE_API_KEY;
  if (!key) return fail(503, "curseforge is not configured");
  const url = new URL(c.req.url);
  const path = url.pathname.slice("/cf".length);
  const method = c.req.method;
  if (!CF_ROUTES.some(([m, re]) => m === method && re.test(path))) return fail(404, "not found");
  const body = method === "POST" ? await readCapped(c.req.raw, CF_MAX_BODY) : undefined;
  if (body === null) return fail(413, "body too large");
  const res = await fetch(`https://api.curseforge.com${path}${url.search}`, {
    method,
    headers: { "x-api-key": key, accept: "application/json", ...(body ? { "content-type": "application/json" } : {}) },
    body,
  });
  return new Response(res.body, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json", "cache-control": method === "GET" && res.ok ? "public, max-age=300" : "no-store" },
  });
});

async function claimCode(db: D1Database, code: unknown, provider: string): Promise<string | null> {
  if (typeof code !== "string" || !/^[A-Za-z0-9_-]{16,64}$/.test(code)) return null;
  const row = await db.prepare("DELETE FROM link_codes WHERE code = ? AND provider = ? AND created > ? RETURNING account").bind(code, provider, Date.now() - LINK_CODE_MS).first<{ account: string }>();
  return row?.account ?? null;
}

async function saveLink(db: D1Database, account: string, provider: string, extId: string, name: string) {
  await db.batch([
    db.prepare("DELETE FROM links WHERE provider = ? AND ext_id = ?").bind(provider, extId),
    db.prepare("INSERT OR REPLACE INTO links (account, provider, ext_id, name, created) VALUES (?, ?, ?, ?, ?)").bind(account, provider, extId, name, Date.now()),
  ]);
}

const linkPage = (ok: boolean) =>
  new Response(`<!doctype html><meta charset="utf-8"><title>Kromvia</title><body style="font-family:sans-serif;background:#0b0a10;color:#eee;display:grid;place-items:center;height:100vh;margin:0"><h2>${ok ? "Linked. You can close this tab." : "Link failed or expired. Try again from the launcher."}</h2>`, {
    status: ok ? 200 : 400,
    headers: { "content-type": "text/html; charset=utf-8" },
  });

const discordRedirect = (c: { req: { url: string } }) => new URL("/link/discord/callback", c.req.url).toString();

app.get("/link/discord/callback", async (c) => {
  const { DISCORD_CLIENT_ID: id, DISCORD_CLIENT_SECRET: secret } = c.env;
  if (!id || !secret) return fail(503, "discord linking is not configured");
  const account = await claimCode(c.env.DB, c.req.query("state"), "discord");
  const code = c.req.query("code");
  if (!account || !code) {
    console.error("discord link: bad or expired state", { account: !!account, code: !!code });
    return linkPage(false);
  }
  const token = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: id, client_secret: secret, grant_type: "authorization_code", code, redirect_uri: discordRedirect(c) }),
  }).then(async (r) => {
    if (r.ok) return r.json<{ access_token: string }>();
    console.error("discord token exchange failed", r.status, await r.text());
    return null;
  });
  if (!token) return linkPage(false);
  const user = await fetch("https://discord.com/api/users/@me", { headers: { authorization: `Bearer ${token.access_token}` } }).then((r) =>
    r.ok ? r.json<{ id: string; username: string }>() : null,
  );
  if (!user) return linkPage(false);
  await saveLink(c.env.DB, account, "discord", user.id, user.username);
  return linkPage(true);
});

app.post("/link/telegram/webhook", async (c) => {
  const { TELEGRAM_BOT_TOKEN: token, TELEGRAM_WEBHOOK_SECRET: secret } = c.env;
  if (!token || !secret || c.req.header("x-telegram-bot-api-secret-token") !== secret) return fail(403, "forbidden");
  const update = await c.req.json<{ message?: { text?: string; chat: { id: number }; from?: { id: number; username?: string; first_name?: string } } }>().catch(() => null);
  const msg = update?.message;
  const m = msg?.text?.match(/^\/start\s+(\S+)/);
  if (!msg?.from || !m) return c.json({ ok: true });
  const account = await claimCode(c.env.DB, m[1], "telegram");
  if (account) await saveLink(c.env.DB, account, "telegram", String(msg.from.id), msg.from.username ?? msg.from.first_name ?? String(msg.from.id));
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: msg.chat.id, text: account ? "Linked to Kromvia." : "This link has expired. Try again from the launcher." }),
  });
  return c.json({ ok: true });
});

export const EARLY_BEFORE = Date.UTC(2027, 0, 1);

app.get("/bot/links", async (c) => {
  const key = c.env.BOT_API_KEY;
  if (!key || c.req.header("authorization") !== `Bearer ${key}`) return fail(403, "forbidden");
  const { results } = await c.env.DB.prepare(
    "SELECT l.ext_id, a.name, a.created, a.mc_uuid, (SELECT COUNT(*) FROM likes WHERE to_id = a.id) AS likes FROM links l JOIN accounts a ON a.id = l.account WHERE l.provider = 'discord'",
  ).all<{ ext_id: string; name: string; created: number; mc_uuid: string | null; likes: number }>();
  return c.json(
    results.map((r) => ({
      discord: r.ext_id,
      name: r.name,
      badges: [
        r.created < EARLY_BEFORE && "early",
        r.mc_uuid !== null && "verified",
        r.likes >= 10 && "liked",
        r.likes >= 100 && "famous",
      ].filter(Boolean),
    })),
  );
});

app.get("/v1/top", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT a.id, a.name, a.mc_uuid, COUNT(*) AS likes FROM likes l JOIN accounts a ON a.id = l.to_id WHERE a.name_lower != ? GROUP BY l.to_id ORDER BY likes DESC, a.name_lower LIMIT 50",
  )
    .bind(DEV.toLowerCase())
    .all<{ id: string; name: string; mc_uuid: string | null; likes: number }>();
  return c.json(results.map((a) => ({ ...publicAccount(a), likes: a.likes })));
});

app.get("/v1/users", async (c) => {
  const q = (c.req.query("q") ?? "").trim().toLowerCase();
  if (!/^[a-z0-9_]{1,16}$/.test(q)) return c.json([]);
  const { results } = await c.env.DB.prepare(
    "SELECT a.id, a.name, a.mc_uuid FROM accounts a WHERE a.name_lower >= ?1 AND a.name_lower < ?1 || char(127) ORDER BY a.name_lower = ?1 DESC, a.seen DESC LIMIT 20",
  )
    .bind(q)
    .all<Pick<Account, "id" | "name" | "mc_uuid">>();
  return c.json(results.map(publicAccount));
});

app.get("/v1/users/:name", async (c) => {
  const a = await c.env.DB.prepare(
    "SELECT a.id, a.name, a.name_lower, a.mc_uuid, a.cosmetics, a.created, (SELECT COUNT(*) FROM likes WHERE to_id = a.id) AS likes, (SELECT l.ext_id FROM links l WHERE l.account = a.id AND l.provider = 'discord') AS discord FROM accounts a WHERE a.name_lower = ?",
  )
    .bind(c.req.param("name").toLowerCase())
    .first<Pick<Account, "id" | "name" | "mc_uuid" | "cosmetics" | "created"> & { name_lower: string; likes: number; discord: string | null }>();
  if (!a) return fail(404, "no such player");
  const cosmetics = JSON.parse(a.cosmetics);
  delete cosmetics.dev;
  if (isDev(a, a.discord)) cosmetics.dev = true;
  return c.json({ ...publicAccount(a), mc_uuid: a.mc_uuid, created: a.created, likes: a.likes, cosmetics });
});

app.get("/share/:code", async (c) => {
  const row = await c.env.DB.prepare("SELECT s.kind, s.data, s.created, a.id, a.name, a.mc_uuid FROM shares s JOIN accounts a ON a.id = s.account WHERE s.code = ? AND s.created > ?")
    .bind(c.req.param("code").toUpperCase(), Date.now() - SHARE_DAYS * DAY_MS)
    .first<{ kind: string; data: string; created: number; id: string; name: string; mc_uuid: string | null }>();
  if (!row) return fail(404, "no such share, or it expired");
  if (row.kind === "screenshot") {
    const img = await c.env.SHOTS?.get(`screenshots/${c.req.param("code").toUpperCase()}`);
    if (!img) return fail(404, "no such share, or it expired");
    return new Response(img.body, { headers: { "content-type": JSON.parse(row.data), "cache-control": "public, max-age=86400" } });
  }
  if (row.kind === "log") return new Response(JSON.parse(row.data), { headers: { "content-type": "text/plain; charset=utf-8" } });
  return c.json({ kind: row.kind, data: JSON.parse(row.data), created: row.created, from: publicAccount(row) });
});

const MAX_CRASH = 256 * 1024;
const CRASHES_PER_DAY = 30;
const CRASH_DAYS = 60;
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : null);

export function crashSig(cause: string, log: string, report: string): string {
  const exc = /^\s*(?:Caused by: )?([\w$]+\.)+[\w$]*(?:Exception|Error)\b.*$/m;
  const line = report.match(exc)?.[0] ?? log.split("\n").reverse().find((l) => exc.test(l)) ?? "";
  return `${cause}|${line.trim().replace(/\d+/g, "#").slice(0, 200)}`;
}

app.post("/crashes", async (c) => {
  const bytes = await readCapped(c.req.raw, MAX_CRASH);
  if (!bytes) return fail(413, "body too large");
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return fail(400, "body is not JSON");
  }
  const cause = str(body.cause, 32);
  const launcher = str(body.launcher, 32);
  const os = str(body.os, 16);
  const log = str(body.log, MAX_CRASH) ?? "";
  const report = str(body.report, MAX_CRASH) ?? "";
  if (!cause || !launcher || !os) return fail(400, "bad report");
  const net = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(clientNet(c.req.raw)))).slice(0, 8), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  const now = Date.now();
  await c.env.DB.prepare("DELETE FROM crashes WHERE created < ?").bind(now - CRASH_DAYS * DAY_MS).run();
  const n = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM crashes WHERE net = ? AND created > ?").bind(net, now - DAY_MS).first<number>("n");
  if ((n ?? 0) >= CRASHES_PER_DAY) return fail(429, "too many crash reports today");
  const loader = body.loader && typeof body.loader === "object" ? body.loader as Record<string, unknown> : null;
  const mods = Array.isArray(body.mods) ? body.mods.filter((m) => typeof m === "string").slice(0, 400).map((m) => (m as string).slice(0, 200)) : [];
  await c.env.DB.prepare(
    "INSERT INTO crashes (created, net, launcher, os, mc, loader, cause, sig, detail, mods, log, report) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(
      now, net, launcher, `${os}/${str(body.arch, 16) ?? "?"}`, str(body.mc, 32),
      loader ? `${str(loader.kind, 16) ?? "?"} ${str(loader.version, 64) ?? ""}`.trim() : null,
      cause, crashSig(cause, log, report), str(body.detail, 300), JSON.stringify(mods), log, report,
    )
    .run();
  return c.json({ ok: true }, 201);
});

app.use("/v1/*", async (c, next) => {
  const shot = c.req.path === SHOT_PATH;
  const bytes = await readCapped(c.req.raw, shot ? MAX_SHOT : BIG_PATHS.test(c.req.path) ? MAX_BIG_BODY : MAX_BODY);
  if (!bytes) return fail(413, "body too large");
  const auth = await verify(c.req.raw, bytes);
  if ("error" in auth) return fail(401, auth.error);
  c.set("key", auth.key);
  c.set("raw", bytes);
  if (bytes.length > 0 && !shot) {
    try {
      c.set("body", JSON.parse(new TextDecoder().decode(bytes)));
    } catch {
      return fail(400, "body is not JSON");
    }
  }
  if (c.req.path === "/v1/accounts" && c.req.method === "POST") return next();

  const account = await c.env.DB.prepare("SELECT * FROM accounts WHERE pubkey = ?").bind(auth.key).first<Account>();
  if (!account) return fail(403, "no account for this key");
  const now = Date.now();
  if (now - account.seen > SEEN_EVERY_MS) {
    await c.env.DB.prepare("UPDATE accounts SET seen = ? WHERE id = ?").bind(now, account.id).run();
  }
  c.set("account", account);
  return next();
});

const field = (body: unknown, key: string): unknown => (body && typeof body === "object" ? (body as Record<string, unknown>)[key] : undefined);

app.post("/v1/accounts", async (c) => {
  const existing = await c.env.DB.prepare("SELECT * FROM accounts WHERE pubkey = ?").bind(c.var.key).first<Account>();
  if (existing) return c.json(publicAccount(existing));
  const name = field(c.var.body, "name");
  if (typeof name !== "string" || !NAME.test(name)) return fail(400, "name must be 3–16 letters, digits or _");
  const now = Date.now();
  const net = clientNet(c.req.raw);
  const recent = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM signups WHERE net = ? AND created > ?").bind(net, now - DAY_MS).first<number>("n");
  if ((recent ?? 0) >= SIGNUPS_PER_DAY) return fail(429, "too many accounts from this network today");
  const id = crypto.randomUUID();
  try {
    await c.env.DB.batch([
      c.env.DB.prepare("INSERT INTO accounts (id, pubkey, name, name_lower, created, seen) VALUES (?, ?, ?, ?, ?, ?)").bind(id, c.var.key, name, name.toLowerCase(), now, now),
      c.env.DB.prepare("INSERT INTO signups (net, created) VALUES (?, ?)").bind(net, now),
      c.env.DB.prepare("DELETE FROM signups WHERE created < ?").bind(now - DAY_MS),
    ]);
  } catch (e) {
    if (String(e).includes("UNIQUE")) return fail(409, "name taken");
    throw e;
  }
  return c.json({ id, name, verified: false }, 201);
});

app.get("/v1/me", async (c) => {
  const me = c.var.account;
  const [likes, links] = await c.env.DB.batch<{ n?: number; provider?: string; name?: string; ext_id?: string }>([
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM likes WHERE to_id = ?").bind(me.id),
    c.env.DB.prepare("SELECT provider, name, ext_id FROM links WHERE account = ?").bind(me.id),
  ]);
  return c.json({
    ...publicAccount(me),
    created: me.created,
    cosmetics: JSON.parse(me.cosmetics),
    likes: likes.results[0]?.n ?? 0,
    links: Object.fromEntries(links.results.map((l) => [l.provider, l.name])),
    dev: isDev({ name_lower: me.name.toLowerCase(), mc_uuid: me.mc_uuid }, links.results.find((l) => l.provider === "discord")?.ext_id),
  });
});

app.get("/v1/likes", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT to_id FROM likes WHERE from_id = ?").bind(c.var.account.id).all<{ to_id: string }>();
  return c.json(results.map((r) => r.to_id));
});

app.put("/v1/likes/:id", async (c) => {
  const to = c.req.param("id");
  if (to === c.var.account.id) return fail(400, "that is you");
  if (!(await c.env.DB.prepare("SELECT 1 FROM accounts WHERE id = ?").bind(to).first())) return fail(404, "no such player");
  await c.env.DB.prepare("INSERT OR IGNORE INTO likes (from_id, to_id, created) VALUES (?, ?, ?)").bind(c.var.account.id, to, Date.now()).run();
  return c.json({ ok: true });
});

app.delete("/v1/likes/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM likes WHERE from_id = ? AND to_id = ?").bind(c.var.account.id, c.req.param("id")).run();
  return c.json({ ok: true });
});

app.post("/v1/me/links/:provider", async (c) => {
  const provider = c.req.param("provider");
  if (!PROVIDERS.includes(provider as (typeof PROVIDERS)[number])) return fail(404, "unknown provider");
  const ready = provider === "discord" ? c.env.DISCORD_CLIENT_ID && c.env.DISCORD_CLIENT_SECRET : c.env.TELEGRAM_BOT_NAME && c.env.TELEGRAM_BOT_TOKEN;
  if (!ready) return fail(503, `${provider} linking is not configured yet`);
  const code = b64url(crypto.getRandomValues(new Uint8Array(24)));
  const now = Date.now();
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM link_codes WHERE created < ?").bind(now - LINK_CODE_MS),
    c.env.DB.prepare("INSERT INTO link_codes (code, account, provider, created) VALUES (?, ?, ?, ?)").bind(code, c.var.account.id, provider, now),
  ]);
  const url =
    provider === "discord"
      ? `https://discord.com/oauth2/authorize?${new URLSearchParams({ client_id: c.env.DISCORD_CLIENT_ID!, response_type: "code", scope: "identify", state: code, redirect_uri: discordRedirect(c) })}`
      : `https://t.me/${c.env.TELEGRAM_BOT_NAME}?start=${code}`;
  return c.json({ url });
});

app.delete("/v1/me/links/:provider", async (c) => {
  await c.env.DB.prepare("DELETE FROM links WHERE account = ? AND provider = ?").bind(c.var.account.id, c.req.param("provider")).run();
  return c.json({ ok: true });
});

app.patch("/v1/me", async (c) => {
  const name = field(c.var.body, "name");
  if (typeof name !== "string" || !NAME.test(name)) return fail(400, "name must be 3–16 letters, digits or _");
  if (c.var.account.mc_uuid) return fail(403, "the name comes from the linked Minecraft account");
  try {
    await c.env.DB.prepare("UPDATE accounts SET name = ?, name_lower = ? WHERE id = ?").bind(name, name.toLowerCase(), c.var.account.id).run();
  } catch (e) {
    if (String(e).includes("UNIQUE")) return fail(409, "name taken");
    throw e;
  }
  return c.json({ ...publicAccount(c.var.account), name });
});

app.delete("/v1/me", async (c) => {
  const me = c.var.account.id;
  await leaveParty(c.env, me);
  const { results } = await c.env.DB.prepare("SELECT code FROM shares WHERE account = ? AND kind = 'screenshot'").bind(me).all<{ code: string }>();
  if (results.length && c.env.SHOTS) await c.env.SHOTS.delete(results.map((r) => `screenshots/${r.code}`));
  await c.env.DB.prepare("DELETE FROM accounts WHERE id = ?").bind(me).run();
  await (c.env.HUB.get(c.env.HUB.idFromName("hub")) as unknown as { drop(id: string): Promise<void> }).drop(me);
  return c.json({ ok: true });
});

app.put("/v1/me/cosmetics", async (c) => {
  const cosmetics = field(c.var.body, "cosmetics");
  if (!cosmetics || typeof cosmetics !== "object" || Array.isArray(cosmetics)) return fail(400, "cosmetics must be an object");
  const json = JSON.stringify(cosmetics);
  if (json.length > MAX_COSMETICS) return fail(413, "cosmetics too large");
  await c.env.DB.prepare("UPDATE accounts SET cosmetics = ? WHERE id = ?").bind(json, c.var.account.id).run();
  return c.json({ ok: true });
});

const pair = (x: string, y: string) => (x < y ? [x, y] : [y, x]);

app.get("/v1/friends", async (c) => {
  const me = c.var.account.id;
  const [friends, incoming, outgoing] = await c.env.DB.batch<{ id: string; name: string; mc_uuid: string | null; seen: number }>([
    c.env.DB.prepare(
      "SELECT a.id, a.name, a.mc_uuid, a.seen FROM friendships f JOIN accounts a ON a.id = CASE WHEN f.a = ?1 THEN f.b ELSE f.a END WHERE f.a = ?1 OR f.b = ?1 ORDER BY a.name_lower",
    ).bind(me),
    c.env.DB.prepare("SELECT a.id, a.name, a.mc_uuid, a.seen FROM friend_requests r JOIN accounts a ON a.id = r.from_id WHERE r.to_id = ? ORDER BY r.created DESC").bind(me),
    c.env.DB.prepare("SELECT a.id, a.name, a.mc_uuid, a.seen FROM friend_requests r JOIN accounts a ON a.id = r.to_id WHERE r.from_id = ? ORDER BY r.created DESC").bind(me),
  ]);
  return c.json({
    friends: friends.results.map((a) => ({ ...publicAccount(a), seen: a.seen })),
    incoming: incoming.results.map(publicAccount),
    outgoing: outgoing.results.map(publicAccount),
  });
});

app.post("/v1/friends/requests", async (c) => {
  const me = c.var.account.id;
  const name = field(c.var.body, "name");
  if (typeof name !== "string" || !NAME.test(name)) return fail(400, "bad name");
  const other = await c.env.DB.prepare("SELECT id, name, mc_uuid FROM accounts WHERE name_lower = ?").bind(name.toLowerCase()).first<Account>();
  if (!other) return fail(404, "no such player");
  if (other.id === me) return fail(400, "that is you");
  const [a, b] = pair(me, other.id);
  if (await c.env.DB.prepare("SELECT 1 FROM friendships WHERE a = ? AND b = ?").bind(a, b).first()) return c.json({ status: "friends", player: publicAccount(other) });

  const count = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM friendships WHERE a = ?1 OR b = ?1").bind(me).first<number>("n");
  if ((count ?? 0) >= MAX_FRIENDS) return fail(409, "friend list is full");
  const now = Date.now();
  if (await c.env.DB.prepare("SELECT 1 FROM friend_requests WHERE from_id = ? AND to_id = ?").bind(other.id, me).first()) {
    await c.env.DB.batch([
      c.env.DB.prepare("DELETE FROM friend_requests WHERE (from_id = ?1 AND to_id = ?2) OR (from_id = ?2 AND to_id = ?1)").bind(me, other.id),
      c.env.DB.prepare("INSERT OR IGNORE INTO friendships (a, b, created) VALUES (?, ?, ?)").bind(a, b, now),
    ]);
    return c.json({ status: "friends", player: publicAccount(other) });
  }
  await c.env.DB.prepare("INSERT OR IGNORE INTO friend_requests (from_id, to_id, created) VALUES (?, ?, ?)").bind(me, other.id, now).run();
  return c.json({ status: "requested", player: publicAccount(other) });
});

app.post("/v1/friends/requests/:id/accept", async (c) => {
  const me = c.var.account.id;
  const from = c.req.param("id");
  const removed = await c.env.DB.prepare("DELETE FROM friend_requests WHERE from_id = ? AND to_id = ?").bind(from, me).run();
  if (removed.meta.changes === 0) return fail(404, "no such request");
  const [a, b] = pair(me, from);
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM friend_requests WHERE from_id = ? AND to_id = ?").bind(me, from),
    c.env.DB.prepare("INSERT OR IGNORE INTO friendships (a, b, created) VALUES (?, ?, ?)").bind(a, b, Date.now()),
  ]);
  return c.json({ status: "friends" });
});

app.delete("/v1/friends/requests/:id", async (c) => {
  const me = c.var.account.id;
  const other = c.req.param("id");
  await c.env.DB.prepare("DELETE FROM friend_requests WHERE (from_id = ?1 AND to_id = ?2) OR (from_id = ?2 AND to_id = ?1)").bind(me, other).run();
  return c.json({ ok: true });
});

app.delete("/v1/friends/:id", async (c) => {
  const [a, b] = pair(c.var.account.id, c.req.param("id"));
  await c.env.DB.prepare("DELETE FROM friendships WHERE a = ? AND b = ?").bind(a, b).run();
  return c.json({ ok: true });
});

app.get("/v1/ws", (c) => {
  if (c.req.header("upgrade")?.toLowerCase() !== "websocket") return fail(400, "expected a WebSocket upgrade");
  const headers = new Headers(c.req.raw.headers);
  headers.set("x-account-id", c.var.account.id);
  headers.set("x-account-name", c.var.account.name);
  return c.env.HUB.get(c.env.HUB.idFromName("hub")).fetch(c.req.url, { headers });
});

app.get("/v1/messages/:id", async (c) => {
  const me = c.var.account.id;
  const [a, b] = pair(me, c.req.param("id"));
  const before = Number(c.req.query("before") ?? Number.MAX_SAFE_INTEGER);
  const { results } = await c.env.DB.prepare("SELECT id, from_id, text, created FROM messages WHERE a = ? AND b = ? AND id < ? ORDER BY id DESC LIMIT 50")
    .bind(a, b, Number.isFinite(before) ? before : Number.MAX_SAFE_INTEGER)
    .all<{ id: number; from_id: string; text: string; created: number }>();
  return c.json(results.reverse().map((m) => ({ id: m.id, from: m.from_id, to: m.from_id === a ? b : a, text: m.text, time: m.created })));
});

const notify = (env: Env, ids: string[], msg: unknown) => (env.HUB.get(env.HUB.idFromName("hub")) as unknown as { notify(ids: string[], msg: unknown): Promise<void> }).notify(ids, msg);

const areFriends = async (db: D1Database, x: string, y: string) => {
  const [a, b] = pair(x, y);
  return !!(await db.prepare("SELECT 1 FROM friendships WHERE a = ? AND b = ?").bind(a, b).first());
};

const partyMembers = async (db: D1Database, party: string) =>
  (await db.prepare("SELECT account FROM party_members WHERE party = ? ORDER BY joined").bind(party).all<{ account: string }>()).results.map((r) => r.account);

async function leaveParty(env: Env, account: string) {
  const row = await env.DB.prepare("SELECT party FROM party_members WHERE account = ?").bind(account).first<{ party: string }>();
  if (!row) return;
  await env.DB.prepare("DELETE FROM party_members WHERE account = ?").bind(account).run();
  const left = await partyMembers(env.DB, row.party);
  if (left.length === 0) {
    await env.DB.prepare("DELETE FROM parties WHERE id = ?").bind(row.party).run();
    return;
  }
  await env.DB.prepare("UPDATE parties SET leader = ?1 WHERE id = ?2 AND leader = ?3").bind(left[0], row.party, account).run();
  await notify(env, left, { type: "party" });
}

app.get("/v1/party", async (c) => {
  const me = c.var.account.id;
  const party = await c.env.DB.prepare("SELECT p.id, p.leader, p.room FROM party_members m JOIN parties p ON p.id = m.party WHERE m.account = ?")
    .bind(me)
    .first<{ id: string; leader: string; room: string | null }>();
  const [members, invites] = await c.env.DB.batch<{ id: string; name: string; mc_uuid: string | null; party?: string }>([
    c.env.DB.prepare("SELECT a.id, a.name, a.mc_uuid FROM party_members m JOIN accounts a ON a.id = m.account WHERE m.party = ? ORDER BY m.joined").bind(party?.id ?? ""),
    c.env.DB.prepare("SELECT i.party, a.id, a.name, a.mc_uuid FROM party_invites i JOIN accounts a ON a.id = i.from_id WHERE i.to_id = ? ORDER BY i.created DESC").bind(me),
  ]);
  return c.json({
    party: party && { ...party, members: members.results.map(publicAccount) },
    invites: invites.results.map((i) => ({ party: i.party, from: publicAccount(i) })),
  });
});

app.post("/v1/party/invites", async (c) => {
  const me = c.var.account;
  const to = field(c.var.body, "id");
  if (typeof to !== "string" || to === me.id) return fail(400, "bad id");
  if (!(await areFriends(c.env.DB, me.id, to))) return fail(403, "you can only invite friends");
  let party = (await c.env.DB.prepare("SELECT party FROM party_members WHERE account = ?").bind(me.id).first<{ party: string }>())?.party;
  const now = Date.now();
  if (!party) {
    party = crypto.randomUUID();
    await c.env.DB.batch([
      c.env.DB.prepare("INSERT INTO parties (id, leader, created) VALUES (?, ?, ?)").bind(party, me.id, now),
      c.env.DB.prepare("INSERT INTO party_members (account, party, joined) VALUES (?, ?, ?)").bind(me.id, party, now),
    ]);
  }
  const members = await partyMembers(c.env.DB, party);
  if (members.includes(to)) return fail(409, "already in your party");
  if (members.length >= MAX_PARTY) return fail(409, "party is full");
  await c.env.DB.prepare("INSERT OR REPLACE INTO party_invites (party, to_id, from_id, created) VALUES (?, ?, ?, ?)").bind(party, to, me.id, now).run();
  await notify(c.env, [to], { type: "party.invite", party, from: publicAccount(me) });
  await notify(c.env, members, { type: "party" });
  return c.json({ party });
});

app.post("/v1/party/join", async (c) => {
  const me = c.var.account.id;
  const party = field(c.var.body, "party");
  if (typeof party !== "string") return fail(400, "bad party");
  const removed = await c.env.DB.prepare("DELETE FROM party_invites WHERE party = ? AND to_id = ?").bind(party, me).run();
  if (removed.meta.changes === 0) return fail(404, "no such invite");
  const members = await partyMembers(c.env.DB, party);
  if (members.length === 0) return fail(404, "that party is gone");
  if (members.length >= MAX_PARTY) return fail(409, "party is full");
  await leaveParty(c.env, me);
  await c.env.DB.prepare("INSERT INTO party_members (account, party, joined) VALUES (?, ?, ?)").bind(me, party, Date.now()).run();
  await notify(c.env, members, { type: "party" });
  return c.json({ ok: true });
});

app.delete("/v1/party/invites/:party", async (c) => {
  await c.env.DB.prepare("DELETE FROM party_invites WHERE party = ? AND to_id = ?").bind(c.req.param("party"), c.var.account.id).run();
  return c.json({ ok: true });
});

app.post("/v1/party/leave", async (c) => {
  await leaveParty(c.env, c.var.account.id);
  return c.json({ ok: true });
});

app.put("/v1/party/room", async (c) => {
  const room = field(c.var.body, "room");
  if (room !== null && (typeof room !== "string" || !/^[A-Za-z0-9._:-]{1,128}$/.test(room))) return fail(400, "bad room code");
  const party = await c.env.DB.prepare("SELECT id FROM parties WHERE leader = ?").bind(c.var.account.id).first<{ id: string }>();
  if (!party) return fail(403, "only the party leader can do that");
  await c.env.DB.prepare("UPDATE parties SET room = ? WHERE id = ?").bind(room, party.id).run();
  await notify(c.env, await partyMembers(c.env.DB, party.id), { type: "party" });
  return c.json({ ok: true });
});

app.get("/v1/sync", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT key, updated, LENGTH(data) AS size FROM sync WHERE account = ? ORDER BY key").bind(c.var.account.id).all();
  return c.json(results);
});

app.get("/v1/sync/:key", async (c) => {
  const row = await c.env.DB.prepare("SELECT data, updated FROM sync WHERE account = ? AND key = ?").bind(c.var.account.id, c.req.param("key")).first<{ data: string; updated: number }>();
  if (!row) return fail(404, "nothing saved under that key");
  return c.json({ data: JSON.parse(row.data), updated: row.updated });
});

app.put("/v1/sync/:key", async (c) => {
  const key = c.req.param("key");
  if (!SYNC_KEY.test(key)) return fail(400, "bad key");
  const data = field(c.var.body, "data");
  if (data === undefined) return fail(400, "data is missing");
  const me = c.var.account.id;
  const count = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM sync WHERE account = ? AND key != ?").bind(me, key).first<number>("n");
  if ((count ?? 0) >= MAX_SYNC_KEYS) return fail(409, "too many saved entries");
  const updated = Date.now();
  await c.env.DB.prepare("INSERT OR REPLACE INTO sync (account, key, data, updated) VALUES (?, ?, ?, ?)").bind(me, key, JSON.stringify(data), updated).run();
  return c.json({ updated });
});

app.delete("/v1/sync/:key", async (c) => {
  await c.env.DB.prepare("DELETE FROM sync WHERE account = ? AND key = ?").bind(c.var.account.id, c.req.param("key")).run();
  return c.json({ ok: true });
});

async function newShare(env: Env, account: string): Promise<string | null> {
  const cutoff = Date.now() - SHARE_DAYS * DAY_MS;
  const { results } = await env.DB.prepare("SELECT code FROM shares WHERE created < ? AND kind = 'screenshot'").bind(cutoff).all<{ code: string }>();
  if (results.length && env.SHOTS) await env.SHOTS.delete(results.map((r) => `screenshots/${r.code}`));
  await env.DB.prepare("DELETE FROM shares WHERE created < ?").bind(cutoff).run();
  const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM shares WHERE account = ?").bind(account).first<number>("n");
  if ((count ?? 0) >= MAX_SHARES) return null;
  return Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => SHARE_ALPHABET[b % SHARE_ALPHABET.length]).join("");
}

app.post("/v1/shares", async (c) => {
  const kind = field(c.var.body, "kind");
  const data = field(c.var.body, "data");
  if (!SHARE_KINDS.includes(kind as (typeof SHARE_KINDS)[number])) return fail(400, "bad kind");
  if (data === undefined || (kind === "log" && typeof data !== "string")) return fail(400, "bad data");
  const me = c.var.account.id;
  const code = await newShare(c.env, me);
  if (!code) return fail(429, "too many shares, wait for old ones to expire");
  await c.env.DB.prepare("INSERT INTO shares (code, account, kind, data, created) VALUES (?, ?, ?, ?, ?)").bind(code, me, kind, JSON.stringify(data), Date.now()).run();
  return c.json({ code }, 201);
});

app.post(SHOT_PATH, async (c) => {
  if (!c.env.SHOTS) return fail(503, "screenshot sharing is not set up yet");
  const bytes = c.var.raw;
  const type = IMAGE_TYPES.find(([, magic]) => magic.every((b, i) => bytes[i] === b))?.[0];
  if (!type) return fail(400, "screenshots are PNG or JPEG");
  const me = c.var.account.id;
  const code = await newShare(c.env, me);
  if (!code) return fail(429, "too many shares, wait for old ones to expire");
  await c.env.SHOTS.put(`screenshots/${code}`, bytes, { httpMetadata: { contentType: type } });
  await c.env.DB.prepare("INSERT INTO shares (code, account, kind, data, created) VALUES (?, ?, 'screenshot', ?, ?)").bind(code, me, JSON.stringify(type), Date.now()).run();
  return c.json({ code }, 201);
});

app.notFound(() => fail(404, "not found"));

export default app;
