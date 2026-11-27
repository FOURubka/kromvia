
export const NAME = /^[A-Za-z0-9_]{3,16}$/;

export const RESEND_MS = 5 * 60_000;
export const STALE_MS = 2 * RESEND_MS + 60_000;
export const MAX_LOOKUP = 100;
export const DEV = "_4rubka_";
export const DEV_DISCORD = "936175383332675624";

export const isDev = (a: { name_lower: string; mc_uuid: string | null }, discordId: string | null | undefined) =>
  (a.mc_uuid !== null && a.name_lower === DEV) || discordId === DEV_DISCORD;

export function normHost(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const host = raw.trim().toLowerCase().replace(/:25565$/, "").replace(/\.$/, "");
  return /^[a-z0-9.-]{1,253}(:[0-9]{1,5})?$/.test(host) ? host : null;
}

export async function setPlaying(db: D1Database, who: { id: string; name: string }, host: unknown, nick: unknown): Promise<string | null> {
  if (host === null || host === undefined) {
    await db.prepare("DELETE FROM playing WHERE account = ?").bind(who.id).run();
    return null;
  }
  const h = normHost(host);
  if (!h) return "bad server address";
  if (typeof nick !== "string" || !NAME.test(nick)) return "bad nick";
  const lower = nick.toLowerCase();
  const owned = who.name.toLowerCase() === lower ? 1 : 0;
  const now = Date.now();
  const other = await db
    .prepare("SELECT owned FROM playing WHERE host = ? AND nick_lower = ? AND account != ? AND updated > ?")
    .bind(h, lower, who.id, now - STALE_MS)
    .first<{ owned: number }>();
  if (other && (other.owned || !owned)) return `someone else plays as ${nick} there`;
  await db.batch([
    db.prepare("DELETE FROM playing WHERE host = ? AND nick_lower = ? AND account != ?").bind(h, lower, who.id),
    db.prepare("INSERT OR REPLACE INTO playing (account, host, nick, nick_lower, owned, updated) VALUES (?, ?, ?, ?, ?, ?)").bind(who.id, h, nick, lower, owned, now),
  ]);
  return null;
}

export async function wornOn(db: D1Database, host: string, nicks: string[]): Promise<Record<string, unknown>> {
  const { results } = await db
    .prepare(
      `SELECT p.nick_lower, a.cosmetics, a.profile, a.name_lower, a.mc_uuid,
         (SELECT l.ext_id FROM links l WHERE l.account = a.id AND l.provider = 'discord') AS discord,
         c.id AS clan_id, c.tag AS clan_tag, c.icon AS clan_icon
       FROM playing p JOIN accounts a ON a.id = p.account
       LEFT JOIN clan_members cm ON cm.account = a.id LEFT JOIN clans c ON c.id = cm.clan
       WHERE p.host = ? AND p.updated > ? AND p.owned = 1 AND p.nick_lower IN (${nicks.map(() => "?").join(",")})`,
    )
    .bind(host, Date.now() - STALE_MS, ...nicks)
    .all<{ nick_lower: string; cosmetics: string; profile: string; name_lower: string; mc_uuid: string | null; discord: string | null; clan_id: string | null; clan_tag: string | null; clan_icon: string | null }>();
  return Object.fromEntries(
    results.map((r) => {
      const worn = JSON.parse(r.cosmetics);
      delete worn.dev;
      if (isDev(r, r.discord)) worn.dev = true;
      delete worn.clan;
      if (r.clan_tag) worn.clan = { id: r.clan_id, tag: r.clan_tag, icon: r.clan_icon };
      delete worn.name;
      const profile = JSON.parse(r.profile ?? "{}");
      const font = profile.nameFont && profile.nameFont !== "default" ? profile.nameFont : null;
      if (profile.nameColor || profile.nameColor2 || font) worn.name = { a: profile.nameColor ?? null, b: profile.nameColor2 ?? null, font };
      return [r.nick_lower, worn];
    }),
  );
}

export async function wornAround(db: D1Database, who: string, nicks: unknown): Promise<{ host: string; worn: Record<string, unknown> } | null> {
  const me = await db.prepare("SELECT host FROM playing WHERE account = ? AND updated > ?").bind(who, Date.now() - STALE_MS).first<{ host: string }>();
  if (!me) return null;
  const names = Array.isArray(nicks) ? [...new Set(nicks.filter((n): n is string => typeof n === "string" && NAME.test(n)).map((n) => n.toLowerCase()))].slice(0, MAX_LOOKUP) : [];
  return { host: me.host, worn: names.length ? await wornOn(db, me.host, names) : {} };
}
