import { b64url, payload } from "../src/auth";

const base = process.argv[2] ?? "https://api.kromvia.com";
type Dev = { pub: string; priv: CryptoKey; id?: string };

async function dev(): Promise<Dev> {
  const k = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as CryptoKeyPair;
  return { pub: b64url(await crypto.subtle.exportKey("raw", k.publicKey)), priv: k.privateKey };
}

async function call(d: Dev, method: string, path: string, body?: unknown) {
  const bytes = body === undefined ? new Uint8Array() : body instanceof Uint8Array ? body : new TextEncoder().encode(JSON.stringify(body));
  const time = String(Date.now());
  const sig = await crypto.subtle.sign({ name: "Ed25519" }, d.priv, await payload(method, path, time, bytes));
  const res = await fetch(base + path, { method, headers: { "x-kromvia-key": d.pub, "x-kromvia-time": time, "x-kromvia-sig": b64url(sig) }, body: body === undefined ? undefined : bytes });
  const type = res.headers.get("content-type") ?? "";
  const out = type.includes("json") ? await res.json() : new Uint8Array(await res.arrayBuffer());
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(out)}`);
  return out as any;
}

const tag = Math.random().toString(36).slice(2, 7);
const a = await dev(), b = await dev();
a.id = (await call(a, "POST", "/v1/accounts", { name: `relayA_${tag}` })).id;
b.id = (await call(b, "POST", "/v1/accounts", { name: `relayB_${tag}` })).id;
try {
  await call(a, "POST", "/v1/friends/requests", { name: `relayB_${tag}` });
  await call(b, "POST", `/v1/friends/requests/${a.id}/accept`);
  const r = await call(a, "POST", "/v1/relays", { name: "smoke" });
  await call(a, "POST", `/v1/relays/${r.id}/members`, { id: b.id });
  await call(a, "POST", `/v1/relays/${r.id}/lock`);
  const world = new Uint8Array(32 * 1024 * 1024 + 4096).map((_, i) => (i * 31) & 255);
  const sha = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", world)), (x) => x.toString(16).padStart(2, "0")).join("");
  const up = await call(a, "POST", `/v1/relays/${r.id}/upload`, { size: world.length });
  const etags: string[] = [];
  for (let n = 1; n <= up.parts; n++) etags.push((await call(a, "PUT", `/v1/relays/${r.id}/upload/${n}`, world.subarray((n - 1) * up.partSize, n * up.partSize))).etag);
  const done = await call(a, "POST", `/v1/relays/${r.id}/upload/complete`, { etags, sha256: sha });
  console.log("uploaded", up.parts, "parts, version", done.version, "size", done.size);
  const lock = await call(b, "POST", `/v1/relays/${r.id}/lock`);
  console.log("B holds:", lock.holder?.name);
  const got: Uint8Array = await call(b, "GET", `/v1/relays/${r.id}/world`);
  console.log("download matches:", got.length === world.length && got.every((x, i) => x === world[i]));
  try {
    await call(a, "POST", `/v1/relays/${r.id}/lock`);
    console.log("BUG: A took a held world");
  } catch (e) {
    console.log("A refused:", String(e).includes("409"));
  }
} finally {
  await call(a, "DELETE", "/v1/me").catch((e) => console.log("cleanup A", e));
  await call(b, "DELETE", "/v1/me").catch((e) => console.log("cleanup B", e));
  console.log("cleaned up");
}
