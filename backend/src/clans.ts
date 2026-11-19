import type { Hono } from "hono";

type Account = { id: string; name: string; mc_uuid: string | null };
type Env = { DB: D1Database };
type App = Hono<{ Bindings: Env & Record<string, unknown>; Variables: { body: unknown; account: Account } & Record<string, unknown> }>;

export type Clan = { id: string; name: string; tag: string; icon: string; open: number; owner: string | null; created: number; cape: string | null };

const CAPE_ART = /^[A-Za-z0-9+/]{854}==$/;
const PAGE = 50;
export type ClanTag = { id: string; name: string; tag: string; icon: string };

export const CLAN_NAME = /^[\p{L}\p{N} _.-]{3,24}$/u;
export const CLAN_TAG = /^[A-Za-z0-9]{2,8}$/;
export const CLAN_ICONS = [
  "sword", "pickaxe", "heart", "potion", "apple", "chest", "torch", "key", "moon", "sun", "rocket", "mushroom", "slime", "fish",
  "cake", "crown", "shield", "tree", "planet", "gem", "sprout", "globe", "medal", "link",
];
export const RESERVED_ICON = "kromvia";
export const MAX_CLAN = 200;

const fail = (status: 400 | 403 | 404 | 409, error: string) => Response.json({ error }, { status });
const field = (body: unknown, key: string): unknown => (body && typeof body === "object" ? (body as Record<string, unknown>)[key] : undefined);
const pub = (a: Account) => ({ id: a.id, name: a.name, verified: a.mc_uuid !== null });
const tagOf = (c: Pick<Clan, "id" | "name" | "tag" | "icon">): ClanTag => ({ id: c.id, name: c.name, tag: c.tag, icon: c.icon });

export async function clanOf(db: D1Database, account: string): Promise<ClanTag | null> {
  const c = await db.prepare("SELECT c.id, c.name, c.tag, c.icon FROM clan_members m JOIN clans c ON c.id = m.clan WHERE m.account = ?").bind(account).first<Clan>();
  return c ? tagOf(c) : null;
}

async function members(db: D1Database, clan: string) {
  const { results } = await db
    .prepare("SELECT a.id, a.name, a.mc_uuid, m.role FROM clan_members m JOIN accounts a ON a.id = m.account WHERE m.clan = ? ORDER BY m.role = 'owner' DESC, m.joined")
    .bind(clan)
    .all<Account & { role: string }>();
  return results.map((a) => ({ ...pub(a), role: a.role }));
}

function readEdit(body: unknown, partial: boolean): { name?: string; tag?: string; icon?: string; open?: boolean; cape?: string | null } | string {
  const out: { name?: string; tag?: string; icon?: string; open?: boolean; cape?: string | null } = {};
  const cape = field(body, "cape");
  if (cape !== undefined) {
    if (cape !== null && (typeof cape !== "string" || !CAPE_ART.test(cape))) return "cape: bad cape art";
    out.cape = cape;
  }
  const name = field(body, "name"), tag = field(body, "tag"), icon = field(body, "icon"), open = field(body, "open");
  if (name !== undefined || !partial) {
    if (typeof name !== "string" || !CLAN_NAME.test(name.trim())) return "name: 3–24 letters, digits, spaces, . _ -";
    out.name = name.trim().replace(/\s+/g, " ");
  }
  if (tag !== undefined || !partial) {
    if (typeof tag !== "string" || !CLAN_TAG.test(tag.trim())) return "tag: 2–8 letters or digits";
    out.tag = tag.trim();
  }
  if (icon !== undefined || !partial) {
    if (typeof icon !== "string" || !CLAN_ICONS.includes(icon)) return "icon: pick one from the list";
    out.icon = icon;
  }
  if (open !== undefined) {
    if (typeof open !== "boolean") return "open: true or false";
    out.open = open;
  }
  return out;
}

async function leave(db: D1Database, me: string) {
  const m = await db.prepare("SELECT clan, role FROM clan_members WHERE account = ?").bind(me).first<{ clan: string; role: string }>();
  if (!m) return;
  await db.prepare("DELETE FROM clan_members WHERE account = ?").bind(me).run();
  if (m.role !== "owner") return;
  const next = await db.prepare("SELECT account FROM clan_members WHERE clan = ? ORDER BY joined LIMIT 1").bind(m.clan).first<{ account: string }>();
  if (next) {
    await db.batch([
      db.prepare("UPDATE clan_members SET role = 'owner' WHERE account = ?").bind(next.account),
      db.prepare("UPDATE clans SET owner = ? WHERE id = ?").bind(next.account, m.clan),
    ]);
  } else if (m.clan !== "kromvia") {
    await db.prepare("DELETE FROM clans WHERE id = ?").bind(m.clan).run();
  } else {
    await db.prepare("UPDATE clans SET owner = NULL WHERE id = ?").bind(m.clan).run();
  }
}

export function publicClans(app: App) {
  app.get("/v1/clans", async (c) => {
    const q = (c.req.query("q") ?? "").trim().toLowerCase().slice(0, 24);
    const { results } = await c.env.DB.prepare(
      `SELECT c.id, c.name, c.tag, c.icon, c.open, (SELECT COUNT(*) FROM clan_members m WHERE m.clan = c.id) AS members
       FROM clans c WHERE ?1 = '' OR c.name_lower LIKE '%' || ?1 || '%' OR c.tag_lower LIKE ?1 || '%'
       ORDER BY members DESC, c.name_lower LIMIT 30`,
    )
      .bind(q.replace(/[%_]/g, ""))
      .all<Clan & { members: number }>();
    return c.json(results.map((r) => ({ ...tagOf(r), open: r.open === 1, members: r.members })));
  });

  app.get("/v1/clans/:id", async (c) => {
    const clan = await c.env.DB.prepare("SELECT * FROM clans WHERE id = ?").bind(c.req.param("id")).first<Clan>();
    if (!clan) return fail(404, "no such clan");
    return c.json({ ...tagOf(clan), open: clan.open === 1, owner: clan.owner, created: clan.created, cape: clan.cape, members: await members(c.env.DB, clan.id) });
  });
}

export function privateClans(app: App) {
  app.get("/v1/me/clan", async (c) => {
    const me = c.var.account.id;
    const m = await c.env.DB.prepare("SELECT clan, role FROM clan_members WHERE account = ?").bind(me).first<{ clan: string; role: string }>();
    const pending = await c.env.DB.prepare("SELECT clan FROM clan_requests WHERE account = ?").bind(me).all<{ clan: string }>();
    if (!m) return c.json({ clan: null, pending: pending.results.map((r) => r.clan) });
    const clan = (await c.env.DB.prepare("SELECT * FROM clans WHERE id = ?").bind(m.clan).first<Clan>())!;
    const requests =
      m.role === "owner"
        ? (
            await c.env.DB.prepare("SELECT a.id, a.name, a.mc_uuid FROM clan_requests r JOIN accounts a ON a.id = r.account WHERE r.clan = ? ORDER BY r.created")
              .bind(clan.id)
              .all<Account>()
          ).results.map(pub)
        : [];
    return c.json({ clan: { ...tagOf(clan), open: clan.open === 1, created: clan.created, cape: clan.cape, members: await members(c.env.DB, clan.id) }, role: m.role, requests, pending: [] });
  });

  app.get("/v1/me/clan/messages", async (c) => {
    const m = await c.env.DB.prepare("SELECT clan FROM clan_members WHERE account = ?").bind(c.var.account.id).first<{ clan: string }>();
    if (!m) return c.json([]);
    const before = Number(c.req.query("before") ?? 0) || Number.MAX_SAFE_INTEGER;
    const { results } = await c.env.DB.prepare(
      "SELECT m.id, m.from_id AS \"from\", a.name, m.text, m.created AS time FROM clan_messages m JOIN accounts a ON a.id = m.from_id WHERE m.clan = ? AND m.id < ? ORDER BY m.id DESC LIMIT ?",
    )
      .bind(m.clan, before, PAGE)
      .all();
    return c.json(results.reverse());
  });

  app.post("/v1/clans", async (c) => {
    const me = c.var.account.id;
    const edit = readEdit(c.var.body, false);
    if (typeof edit === "string") return fail(400, edit);
    if (await c.env.DB.prepare("SELECT 1 FROM clan_members WHERE account = ?").bind(me).first()) return fail(409, "leave your clan first");
    const id = crypto.randomUUID().slice(0, 12);
    const now = Date.now();
    try {
      await c.env.DB.batch([
        c.env.DB.prepare("INSERT INTO clans (id, name, name_lower, tag, tag_lower, icon, open, owner, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(
          id, edit.name!, edit.name!.toLowerCase(), edit.tag!, edit.tag!.toLowerCase(), edit.icon!, edit.open === false ? 0 : 1, me, now,
        ),
        c.env.DB.prepare("INSERT INTO clan_members (account, clan, role, joined) VALUES (?, ?, 'owner', ?)").bind(me, id, now),
        c.env.DB.prepare("DELETE FROM clan_requests WHERE account = ?").bind(me),
      ]);
    } catch (e) {
      if (String(e).includes("UNIQUE")) return fail(409, "that name or tag is taken");
      throw e;
    }
    return c.json({ id }, 201);
  });

  app.patch("/v1/clans/:id", async (c) => {
    const id = c.req.param("id");
    const clan = await c.env.DB.prepare("SELECT * FROM clans WHERE id = ?").bind(id).first<Clan>();
    if (!clan) return fail(404, "no such clan");
    if (clan.owner !== c.var.account.id) return fail(403, "only the owner can change the clan");
    const edit = readEdit(c.var.body, true);
    if (typeof edit === "string") return fail(400, edit);
    const icon = clan.icon === RESERVED_ICON ? RESERVED_ICON : (edit.icon ?? clan.icon);
    const name = edit.name ?? clan.name, tag = edit.tag ?? clan.tag;
    try {
      await c.env.DB.prepare("UPDATE clans SET name = ?, name_lower = ?, tag = ?, tag_lower = ?, icon = ?, open = ?, cape = ? WHERE id = ?")
        .bind(name, name.toLowerCase(), tag, tag.toLowerCase(), icon, edit.open === undefined ? clan.open : edit.open ? 1 : 0, edit.cape === undefined ? clan.cape : edit.cape, id)
        .run();
    } catch (e) {
      if (String(e).includes("UNIQUE")) return fail(409, "that name or tag is taken");
      throw e;
    }
    return c.json({ ok: true });
  });

  app.post("/v1/clans/:id/join", async (c) => {
    const me = c.var.account.id;
    const clan = await c.env.DB.prepare("SELECT * FROM clans WHERE id = ?").bind(c.req.param("id")).first<Clan>();
    if (!clan) return fail(404, "no such clan");
    const count = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM clan_members WHERE clan = ?").bind(clan.id).first<number>("n");
    if ((count ?? 0) >= MAX_CLAN && clan.id !== "kromvia") return fail(409, "the clan is full");
    if (!clan.open) {
      if (await c.env.DB.prepare("SELECT 1 FROM clan_members WHERE account = ? AND clan = ?").bind(me, clan.id).first()) return c.json({ status: "member" });
      await c.env.DB.prepare("INSERT OR IGNORE INTO clan_requests (clan, account, created) VALUES (?, ?, ?)").bind(clan.id, me, Date.now()).run();
      return c.json({ status: "requested" });
    }
    await leave(c.env.DB, me);
    await c.env.DB.batch([
      c.env.DB.prepare("INSERT INTO clan_members (account, clan, role, joined) VALUES (?, ?, 'member', ?)").bind(me, clan.id, Date.now()),
      c.env.DB.prepare("DELETE FROM clan_requests WHERE account = ?").bind(me),
    ]);
    if (!clan.owner) await c.env.DB.batch([
      c.env.DB.prepare("UPDATE clans SET owner = ? WHERE id = ?").bind(me, clan.id),
      c.env.DB.prepare("UPDATE clan_members SET role = 'owner' WHERE account = ?").bind(me),
    ]);
    return c.json({ status: "member" });
  });

  app.delete("/v1/clans/:id/join", async (c) => {
    await c.env.DB.prepare("DELETE FROM clan_requests WHERE clan = ? AND account = ?").bind(c.req.param("id"), c.var.account.id).run();
    return c.json({ ok: true });
  });

  app.delete("/v1/me/clan", async (c) => {
    await leave(c.env.DB, c.var.account.id);
    return c.json({ ok: true });
  });

  const owned = async (c: { env: Env; req: { param: (k: string) => string }; var: { account: Account } }) => {
    const clan = await c.env.DB.prepare("SELECT * FROM clans WHERE id = ?").bind(c.req.param("id")).first<Clan>();
    return clan && clan.owner === c.var.account.id ? clan : null;
  };

  app.post("/v1/clans/:id/requests/:account", async (c) => {
    const clan = await owned(c);
    if (!clan) return fail(403, "only the owner can accept");
    const who = c.req.param("account");
    if (!(await c.env.DB.prepare("SELECT 1 FROM clan_requests WHERE clan = ? AND account = ?").bind(clan.id, who).first())) return fail(404, "no such request");
    await leave(c.env.DB, who);
    await c.env.DB.batch([
      c.env.DB.prepare("INSERT INTO clan_members (account, clan, role, joined) VALUES (?, ?, 'member', ?)").bind(who, clan.id, Date.now()),
      c.env.DB.prepare("DELETE FROM clan_requests WHERE account = ?").bind(who),
    ]);
    return c.json({ ok: true });
  });

  app.delete("/v1/clans/:id/requests/:account", async (c) => {
    const clan = await owned(c);
    if (!clan) return fail(403, "only the owner can decline");
    await c.env.DB.prepare("DELETE FROM clan_requests WHERE clan = ? AND account = ?").bind(clan.id, c.req.param("account")).run();
    return c.json({ ok: true });
  });

  app.delete("/v1/clans/:id/members/:account", async (c) => {
    const clan = await owned(c);
    if (!clan) return fail(403, "only the owner can remove members");
    const who = c.req.param("account");
    if (who === c.var.account.id) return fail(400, "leave instead");
    await c.env.DB.prepare("DELETE FROM clan_members WHERE clan = ? AND account = ?").bind(clan.id, who).run();
    return c.json({ ok: true });
  });
}

export async function clanMates(db: D1Database, account: string): Promise<{ clan: string; ids: string[] } | null> {
  const m = await db.prepare("SELECT clan FROM clan_members WHERE account = ?").bind(account).first<{ clan: string }>();
  if (!m) return null;
  const { results } = await db.prepare("SELECT account FROM clan_members WHERE clan = ?").bind(m.clan).all<{ account: string }>();
  return { clan: m.clan, ids: results.map((r) => r.account) };
}

export async function clanRoster(db: D1Database, account: string) {
  const m = await db.prepare("SELECT clan FROM clan_members WHERE account = ?").bind(account).first<{ clan: string }>();
  if (!m) return null;
  return { clan: m.clan, members: await members(db, m.clan) };
}
