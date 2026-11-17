import type { Hono } from "hono";

type Account = { id: string; name: string; mc_uuid: string | null };
type Env = { DB: D1Database; WORLDS?: R2Bucket };
type App = Hono<{ Bindings: Env & Record<string, unknown>; Variables: { body: unknown; raw: Uint8Array; account: Account } & Record<string, unknown> }>;

type Relay = {
  id: string;
  owner: string;
  name: string;
  version: number;
  size: number;
  sha256: string | null;
  holder: string | null;
  lock_until: number;
  upload: string | null;
  upload_size: number;
  updated: number;
  updated_by: string | null;
};

export const RELAY_PART_PATH = /^\/v1\/relays\/[a-z0-9]{12}\/upload\/\d{1,3}$/;
export const PART_SIZE = 32 * 1024 * 1024;
export const MAX_WORLD = 1024 * 1024 * 1024;
// Everything relays keep in R2 together, held under the 10 GB free tier so the bucket never bills.
export const MAX_STORE = 8 * 1024 * 1024 * 1024;
export const MAX_OWN = 3;
export const MAX_MEMBERS = 8;
export const LOCK_MS = 10 * 60_000;
const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

const fail = (status: 400 | 403 | 404 | 409 | 413 | 503, error: string) => Response.json({ error }, { status });
const key = (id: string, version: number) => `relays/${id}/${version}`;
const parts = (size: number) => Math.max(1, Math.ceil(size / PART_SIZE));
const pub = (a: Account) => ({ id: a.id, name: a.name, verified: a.mc_uuid !== null });

export async function dropOwned(env: Env, owner: string) {
  const { results } = await env.DB.prepare("SELECT * FROM relays WHERE owner = ?").bind(owner).all<Relay>();
  for (const r of results) await removeObjects(env, r);
}

async function removeObjects(env: Env, r: Relay) {
  if (!env.WORLDS) return;
  if (r.upload) await env.WORLDS.resumeMultipartUpload(key(r.id, r.version + 1), r.upload).abort().catch(() => {});
  if (r.version > 0) await env.WORLDS.delete(key(r.id, r.version));
}

export function relays(app: App, deps: { notify: (env: never, ids: string[], msg: unknown) => Promise<void>; areFriends: (db: D1Database, a: string, b: string) => Promise<boolean> }) {
  const members = async (db: D1Database, id: string) =>
    (await db.prepare("SELECT a.id, a.name, a.mc_uuid FROM relay_members m JOIN accounts a ON a.id = m.account WHERE m.relay = ? ORDER BY a.name_lower").bind(id).all<Account>()).results;
  const tell = async (env: Env, id: string) => deps.notify(env as never, (await members(env.DB, id)).map((m) => m.id), { type: "relay", id });

  async function load(c: { env: Env; var: { account: Account }; req: { param(k: string): string } }): Promise<Relay | Response> {
    const id = c.req.param("id");
    const r = await c.env.DB.prepare("SELECT r.* FROM relays r JOIN relay_members m ON m.relay = r.id WHERE r.id = ? AND m.account = ?").bind(id, c.var.account.id).first<Relay>();
    return r ?? fail(404, "no such shared world");
  }

  async function view(env: Env, r: Relay, now: number) {
    const list = await members(env.DB, r.id);
    const name = (id: string | null) => list.find((m) => m.id === id) ?? null;
    const held = r.holder !== null && r.lock_until > now;
    return {
      id: r.id,
      name: r.name,
      owner: r.owner,
      version: r.version,
      size: r.size,
      sha256: r.sha256,
      updated: r.updated,
      updatedBy: r.updated_by && name(r.updated_by) ? pub(name(r.updated_by)!) : null,
      holder: held && name(r.holder) ? pub(name(r.holder)!) : null,
      lockUntil: held ? r.lock_until : 0,
      members: list.map(pub),
    };
  }

  app.get("/v1/relays", async (c) => {
    const { results } = await c.env.DB.prepare("SELECT r.* FROM relays r JOIN relay_members m ON m.relay = r.id WHERE m.account = ? ORDER BY r.updated DESC").bind(c.var.account.id).all<Relay>();
    const now = Date.now();
    return c.json(await Promise.all(results.map((r) => view(c.env, r, now))));
  });

  app.post("/v1/relays", async (c) => {
    const raw = (c.var.body as { name?: unknown } | undefined)?.name;
    const name = typeof raw === "string" ? raw.trim() : "";
    if (name.length < 1 || name.length > 32) return fail(400, "name is 1–32 characters");
    const me = c.var.account.id;
    const own = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM relays WHERE owner = ?").bind(me).first<number>("n");
    if ((own ?? 0) >= MAX_OWN) return fail(409, `you can own ${MAX_OWN} shared worlds`);
    const id = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => ID_ALPHABET[b % ID_ALPHABET.length]).join("");
    const now = Date.now();
    await c.env.DB.batch([
      c.env.DB.prepare("INSERT INTO relays (id, owner, name, updated) VALUES (?, ?, ?, ?)").bind(id, me, name, now),
      c.env.DB.prepare("INSERT INTO relay_members (relay, account) VALUES (?, ?)").bind(id, me),
    ]);
    const r = await c.env.DB.prepare("SELECT * FROM relays WHERE id = ?").bind(id).first<Relay>();
    return c.json(await view(c.env, r!, now), 201);
  });

  app.delete("/v1/relays/:id", async (c) => {
    const r = await load(c);
    if (r instanceof Response) return r;
    const me = c.var.account.id;
    if (r.owner === me) {
      const before = await members(c.env.DB, r.id);
      await removeObjects(c.env, r);
      await c.env.DB.prepare("DELETE FROM relays WHERE id = ?").bind(r.id).run();
      await deps.notify(c.env as never, before.map((m) => m.id), { type: "relay", id: r.id });
      return c.json({ ok: true });
    }
    if (r.holder === me) await release(c.env, r);
    await c.env.DB.prepare("DELETE FROM relay_members WHERE relay = ? AND account = ?").bind(r.id, me).run();
    await tell(c.env, r.id);
    return c.json({ ok: true });
  });

  app.post("/v1/relays/:id/members", async (c) => {
    const r = await load(c);
    if (r instanceof Response) return r;
    const me = c.var.account.id;
    if (r.owner !== me) return fail(403, "only the owner adds people");
    const who = (c.var.body as { id?: unknown } | undefined)?.id;
    if (typeof who !== "string" || !(await deps.areFriends(c.env.DB, me, who))) return fail(403, "you can only add friends");
    const count = (await members(c.env.DB, r.id)).length;
    if (count >= MAX_MEMBERS) return fail(409, `a shared world has at most ${MAX_MEMBERS} people`);
    await c.env.DB.prepare("INSERT OR IGNORE INTO relay_members (relay, account) VALUES (?, ?)").bind(r.id, who).run();
    await tell(c.env, r.id);
    return c.json(await view(c.env, r, Date.now()));
  });

  app.delete("/v1/relays/:id/members/:account", async (c) => {
    const r = await load(c);
    if (r instanceof Response) return r;
    if (r.owner !== c.var.account.id) return fail(403, "only the owner removes people");
    const who = c.req.param("account");
    if (who === r.owner) return fail(400, "the owner cannot leave, delete the world instead");
    if (r.holder === who) await release(c.env, r);
    await c.env.DB.prepare("DELETE FROM relay_members WHERE relay = ? AND account = ?").bind(r.id, who).run();
    await deps.notify(c.env as never, [who], { type: "relay", id: r.id });
    await tell(c.env, r.id);
    return c.json({ ok: true });
  });

  async function release(env: Env, r: Relay) {
    if (r.upload && env.WORLDS) await env.WORLDS.resumeMultipartUpload(key(r.id, r.version + 1), r.upload).abort().catch(() => {});
    await env.DB.prepare("UPDATE relays SET holder = NULL, lock_until = 0, upload = NULL, upload_size = 0 WHERE id = ?").bind(r.id).run();
  }

  app.post("/v1/relays/:id/lock", async (c) => {
    const r = await load(c);
    if (r instanceof Response) return r;
    const me = c.var.account.id;
    const now = Date.now();
    const taken = await c.env.DB.prepare("UPDATE relays SET holder = ?1, lock_until = ?2 WHERE id = ?3 AND (holder IS NULL OR holder = ?1 OR lock_until <= ?4)")
      .bind(me, now + LOCK_MS, r.id, now)
      .run();
    if (taken.meta.changes === 0) {
      const holder = (await members(c.env.DB, r.id)).find((m) => m.id === r.holder);
      return fail(409, `${holder?.name ?? "someone"} is playing it right now`);
    }
    if (r.holder !== me && r.upload) {
      if (c.env.WORLDS) await c.env.WORLDS.resumeMultipartUpload(key(r.id, r.version + 1), r.upload).abort().catch(() => {});
      await c.env.DB.prepare("UPDATE relays SET upload = NULL, upload_size = 0 WHERE id = ?").bind(r.id).run();
    }
    const fresh = (await c.env.DB.prepare("SELECT * FROM relays WHERE id = ?").bind(r.id).first<Relay>())!;
    if (r.holder !== me || r.lock_until <= now) await tell(c.env, r.id);
    return c.json(await view(c.env, fresh, now));
  });

  app.delete("/v1/relays/:id/lock", async (c) => {
    const r = await load(c);
    if (r instanceof Response) return r;
    if (r.holder !== c.var.account.id) return c.json({ ok: true });
    await release(c.env, r);
    await tell(c.env, r.id);
    return c.json({ ok: true });
  });

  app.get("/v1/relays/:id/world", async (c) => {
    const r = await load(c);
    if (r instanceof Response) return r;
    if (!c.env.WORLDS) return fail(503, "shared worlds are not set up yet");
    if (r.version === 0) return fail(404, "nobody has uploaded this world yet");
    const obj = await c.env.WORLDS.get(key(r.id, r.version));
    if (!obj) return fail(404, "the world file is missing");
    return new Response(obj.body, {
      headers: { "content-type": "application/zip", "content-length": String(obj.size), "x-relay-version": String(r.version), "x-relay-sha256": r.sha256 ?? "" },
    });
  });

  app.post("/v1/relays/:id/upload", async (c) => {
    const r = await load(c);
    if (r instanceof Response) return r;
    if (!c.env.WORLDS) return fail(503, "shared worlds are not set up yet");
    if (r.holder !== c.var.account.id) return fail(409, "take the world before uploading it");
    const size = (c.var.body as { size?: unknown } | undefined)?.size;
    if (typeof size !== "number" || !Number.isInteger(size) || size < 1) return fail(400, "bad size");
    if (size > MAX_WORLD) return fail(413, "the world is over 1 GB zipped");
    const used = await c.env.DB.prepare("SELECT COALESCE(SUM(size), 0) + COALESCE(SUM(CASE WHEN id = ? THEN 0 ELSE upload_size END), 0) AS n FROM relays").bind(r.id).first<number>("n");
    if ((used ?? 0) + size > MAX_STORE) return fail(503, "shared world storage is full, try later");
    if (r.upload) await c.env.WORLDS.resumeMultipartUpload(key(r.id, r.version + 1), r.upload).abort().catch(() => {});
    const up = await c.env.WORLDS.createMultipartUpload(key(r.id, r.version + 1), { httpMetadata: { contentType: "application/zip" } });
    await c.env.DB.prepare("UPDATE relays SET upload = ?, upload_size = ? WHERE id = ?").bind(up.uploadId, size, r.id).run();
    return c.json({ partSize: PART_SIZE, parts: parts(size) });
  });

  app.put("/v1/relays/:id/upload/:part", async (c) => {
    const r = await load(c);
    if (r instanceof Response) return r;
    if (!c.env.WORLDS) return fail(503, "shared worlds are not set up yet");
    if (r.holder !== c.var.account.id || !r.upload) return fail(409, "no upload in progress");
    const n = Number(c.req.param("part"));
    const total = parts(r.upload_size);
    if (!Number.isInteger(n) || n < 1 || n > total) return fail(400, "bad part number");
    const want = n < total ? PART_SIZE : r.upload_size - PART_SIZE * (total - 1);
    if (c.var.raw.length !== want) return fail(400, `part ${n} must be ${want} bytes`);
    const part = await c.env.WORLDS.resumeMultipartUpload(key(r.id, r.version + 1), r.upload).uploadPart(n, c.var.raw);
    return c.json({ etag: part.etag });
  });

  app.post("/v1/relays/:id/upload/complete", async (c) => {
    const r = await load(c);
    if (r instanceof Response) return r;
    if (!c.env.WORLDS) return fail(503, "shared worlds are not set up yet");
    const me = c.var.account.id;
    if (r.holder !== me || !r.upload) return fail(409, "no upload in progress");
    const body = c.var.body as { etags?: unknown; sha256?: unknown } | undefined;
    const etags = body?.etags;
    const sha = body?.sha256;
    if (!Array.isArray(etags) || etags.length !== parts(r.upload_size) || !etags.every((e) => typeof e === "string")) return fail(400, "bad part list");
    if (typeof sha !== "string" || !/^[0-9a-f]{64}$/.test(sha)) return fail(400, "bad sha256");
    const next = r.version + 1;
    const obj = await c.env.WORLDS.resumeMultipartUpload(key(r.id, next), r.upload).complete(etags.map((etag, i) => ({ partNumber: i + 1, etag: etag as string })));
    if (obj.size !== r.upload_size) {
      await c.env.WORLDS.delete(key(r.id, next));
      await c.env.DB.prepare("UPDATE relays SET upload = NULL, upload_size = 0 WHERE id = ?").bind(r.id).run();
      return fail(400, "uploaded size does not match");
    }
    const now = Date.now();
    await c.env.DB.prepare("UPDATE relays SET version = ?, size = ?, sha256 = ?, updated = ?, updated_by = ?, upload = NULL, upload_size = 0, holder = NULL, lock_until = 0 WHERE id = ?")
      .bind(next, r.upload_size, sha, now, me, r.id)
      .run();
    if (r.version > 0) await c.env.WORLDS.delete(key(r.id, r.version));
    await tell(c.env, r.id);
    const fresh = (await c.env.DB.prepare("SELECT * FROM relays WHERE id = ?").bind(r.id).first<Relay>())!;
    return c.json(await view(c.env, fresh, now));
  });
}
