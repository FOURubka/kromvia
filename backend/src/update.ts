
const REPO = "https://api.github.com/repos/4rubka/kromvia";

type Asset = { id: number; name: string; size?: number };
type Manifest = { platforms?: Record<string, { url: string; signature: string }> };

function github(token: string, path: string, accept = "application/vnd.github+json") {
  return fetch(REPO + path, {
    headers: { authorization: `Bearer ${token}`, accept, "user-agent": "kromvia-api", "x-github-api-version": "2022-11-28" },
  });
}

async function release(token: string, beta: boolean): Promise<{ assets: Asset[] } | null> {
  if (!beta) {
    const res = await github(token, "/releases/latest");
    return res.ok ? ((await res.json()) as { assets: Asset[] }) : null;
  }
  const res = await github(token, "/releases?per_page=10");
  if (!res.ok) return null;
  const list = (await res.json()) as { draft: boolean; assets: Asset[] }[];
  return list.find((r) => !r.draft && r.assets.some((a) => a.name === "latest.json")) ?? null;
}

export async function manifest(token: string, origin: string, beta = false): Promise<Manifest | null> {
  const rel = await release(token, beta);
  if (!rel) return null;
  const assets = rel.assets;
  const file = assets.find((a) => a.name === "latest.json");
  if (!file) return null;
  const json = await github(token, `/releases/assets/${file.id}`, "application/octet-stream");
  if (!json.ok) return null;
  const out = (await json.json()) as Manifest;
  for (const p of Object.values(out.platforms ?? {})) {
    const name = decodeURIComponent(p.url.split("/").pop() ?? "");
    const asset = assets.find((a) => a.name === name);
    if (asset) p.url = `${origin}/update/asset/${asset.id}`;
  }
  return out;
}

export function asset(token: string, id: string) {
  return github(token, `/releases/assets/${id}`, "application/octet-stream");
}

const INSTALLERS: [string, RegExp][] = [
  ["windows", /_x64-setup\.exe$/],
  ["macos", /_aarch64\.dmg$/],
  ["linux-appimage", /\.AppImage$/],
  ["linux-deb", /\.deb$/],
];

export async function downloads(token: string) {
  const res = await github(token, "/releases/latest");
  if (!res.ok) return null;
  const release = (await res.json()) as { tag_name: string; published_at: string; body: string | null; assets: Asset[] };
  const files = INSTALLERS.flatMap(([platform, re]) => {
    const a = release.assets.find((x) => re.test(x.name));
    return a ? [{ platform, id: a.id, name: a.name, size: a.size ?? 0 }] : [];
  });
  return { version: release.tag_name.replace(/^v/, ""), published: release.published_at, notes: release.body ?? "", files };
}
