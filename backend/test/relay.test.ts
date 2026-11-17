import { beforeEach, expect, test } from "bun:test";
import app from "../src/index";
import { b64url, payload } from "../src/auth";
import { testDb } from "./d1";
import { LOCK_MS, MAX_OWN, PART_SIZE } from "../src/relay";

let objects: Map<string, Uint8Array>;
let uploads: Map<string, { key: string; parts: Map<number, Uint8Array>; aborted: boolean }>;
let sent: { ids: string[]; msg: any }[];
let env: Record<string, unknown>;

beforeEach(() => {
  objects = new Map();
  uploads = new Map();
  sent = [];
  const resume = (key: string, id: string) => {
    const u = uploads.get(id)!;
    return {
      uploadPart: async (n: number, data: Uint8Array) => {
        u.parts.set(n, data.slice());
        return { partNumber: n, etag: `e${n}` };
      },
      abort: async () => void (u.aborted = true),
      complete: async (list: { partNumber: number; etag: string }[]) => {
        const chunks = list.map((p) => u.parts.get(p.partNumber)!);
        const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
        let at = 0;
        for (const c of chunks) out.set(c, (at += c.length) - c.length);
        objects.set(key, out);
        return { size: out.length };
      },
    };
  };
  env = {
    DB: testDb(),
    LIMIT: { limit: async () => ({ success: true }) },
    HUB: { idFromName: () => "hub", get: () => ({ notify: async (ids: string[], msg: unknown) => void sent.push({ ids, msg }), drop: async () => {} }) },
    WORLDS: {
      get: async (k: string) => (objects.has(k) ? { body: objects.get(k), size: objects.get(k)!.length } : null),
      delete: async (k: string) => void objects.delete(k),
      createMultipartUpload: async (k: string) => {
        const id = `u${uploads.size + 1}`;
        uploads.set(id, { key: k, parts: new Map(), aborted: false });
        return { uploadId: id };
      },
      resumeMultipartUpload: resume,
    },
  };
});

type Dev = { pub: string; priv: CryptoKey; id: string };

async function call(d: Dev, method: string, path: string, body?: unknown) {
  const bytes = body === undefined ? new Uint8Array() : body instanceof Uint8Array ? body : new TextEncoder().encode(JSON.stringify(body));
  const time = String(Date.now());
  const sig = await crypto.subtle.sign({ name: "Ed25519" }, d.priv, await payload(method, path, time, bytes));
  const headers = { "cf-connecting-ip": "203.0.113.9", "x-kromvia-key": d.pub, "x-kromvia-time": time, "x-kromvia-sig": b64url(sig) };
  const res = await app.fetch(new Request(`https://api.test${path}`, { method, headers, body: body === undefined ? undefined : bytes }), env);
  const type = res.headers.get("content-type") ?? "";
  return { status: res.status, json: (type.includes("json") ? await res.json() : null) as any, bytes: type.includes("zip") ? new Uint8Array(await res.arrayBuffer()) : null };
}

async function signup(name: string): Promise<Dev> {
  const k = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const d = { pub: b64url(await crypto.subtle.exportKey("raw", k.publicKey)), priv: k.privateKey, id: "" };
  const r = await call(d, "POST", "/v1/accounts", { name });
  expect(r.status).toBe(201);
  return { ...d, id: r.json.id };
}

async function friends(a: Dev, b: Dev) {
  await call(a, "POST", "/v1/friends/requests", { name: (await call(b, "GET", "/v1/me")).json.name });
  expect((await call(b, "POST", `/v1/friends/requests/${a.id}/accept`)).json.status).toBe("friends");
}

const sha = "a".repeat(64);

async function upload(d: Dev, id: string, data: Uint8Array) {
  const start = await call(d, "POST", `/v1/relays/${id}/upload`, { size: data.length });
  expect(start.status).toBe(200);
  const etags: string[] = [];
  for (let n = 1; n <= start.json.parts; n++) {
    const part = await call(d, "PUT", `/v1/relays/${id}/upload/${n}`, data.subarray((n - 1) * PART_SIZE, n * PART_SIZE));
    expect(part.status).toBe(200);
    etags.push(part.json.etag);
  }
  return call(d, "POST", `/v1/relays/${id}/upload/complete`, { etags, sha256: sha });
}

test("a shared world passes between friends with a lock", async () => {
  const alex = await signup("Alex");
  const sam = await signup("Sam");
  const eve = await signup("Eve");
  await friends(alex, sam);

  const made = await call(alex, "POST", "/v1/relays", { name: "Our base" });
  expect(made.status).toBe(201);
  const id = made.json.id;
  expect((await call(alex, "POST", `/v1/relays/${id}/members`, { id: eve.id })).status).toBe(403);
  expect((await call(alex, "POST", `/v1/relays/${id}/members`, { id: sam.id })).status).toBe(200);
  expect((await call(sam, "GET", "/v1/relays")).json.map((r: any) => r.name)).toEqual(["Our base"]);
  expect((await call(eve, "GET", `/v1/relays/${id}/world`)).status).toBe(404);
  expect((await call(sam, "GET", `/v1/relays/${id}/world`)).status).toBe(404);

  expect((await call(alex, "POST", `/v1/relays/${id}/upload`, { size: 10 })).status).toBe(409);
  const lock = await call(alex, "POST", `/v1/relays/${id}/lock`);
  expect(lock.json.holder.name).toBe("Alex");
  const busy = await call(sam, "POST", `/v1/relays/${id}/lock`);
  expect(busy.status).toBe(409);
  expect(busy.json.error).toContain("Alex");

  const world = new Uint8Array([1, 2, 3, 4, 5]);
  const done = await upload(alex, id, world);
  expect(done.status).toBe(200);
  expect(done.json).toMatchObject({ version: 1, size: 5, holder: null, updatedBy: { name: "Alex" } });
  expect(sent.some((s) => s.ids.includes(sam.id) && s.msg.type === "relay")).toBe(true);

  expect((await call(sam, "POST", `/v1/relays/${id}/lock`)).status).toBe(200);
  expect((await call(sam, "GET", `/v1/relays/${id}/world`)).bytes).toEqual(world);
  const v2 = new Uint8Array([9, 9]);
  expect((await upload(sam, id, v2)).json.version).toBe(2);
  expect([...objects.keys()]).toEqual([`relays/${id}/2`]);
});

test("an expired lock can be taken over and the old holder's upload is refused", async () => {
  const alex = await signup("Alex");
  const sam = await signup("Sam");
  await friends(alex, sam);
  const id = (await call(alex, "POST", "/v1/relays", { name: "W" })).json.id;
  await call(alex, "POST", `/v1/relays/${id}/members`, { id: sam.id });
  await call(alex, "POST", `/v1/relays/${id}/lock`);
  await call(alex, "POST", `/v1/relays/${id}/upload`, { size: 3 });
  const real = Date.now;
  Date.now = () => real() + LOCK_MS + 1000;
  try {
    expect((await call(sam, "POST", `/v1/relays/${id}/lock`)).json.holder.name).toBe("Sam");
  } finally {
    Date.now = real;
  }
  expect([...uploads.values()][0].aborted).toBe(true);
  expect((await call(alex, "PUT", `/v1/relays/${id}/upload/1`, new Uint8Array(3))).status).toBe(409);
  expect((await call(alex, "POST", `/v1/relays/${id}/lock`)).status).toBe(409);
});

test("big worlds go up in parts and parts must have the exact size", async () => {
  const alex = await signup("Alex");
  const id = (await call(alex, "POST", "/v1/relays", { name: "Big" })).json.id;
  await call(alex, "POST", `/v1/relays/${id}/lock`);
  const big = new Uint8Array(PART_SIZE + 7).map((_, i) => i % 251);
  const start = await call(alex, "POST", `/v1/relays/${id}/upload`, { size: big.length });
  expect(start.json.parts).toBe(2);
  expect((await call(alex, "PUT", `/v1/relays/${id}/upload/2`, new Uint8Array(8))).status).toBe(400);
  expect((await call(alex, "PUT", `/v1/relays/${id}/upload/3`, new Uint8Array(7))).status).toBe(400);
  expect((await upload(alex, id, big)).json.size).toBe(big.length);
  expect(objects.get(`relays/${id}/1`)).toEqual(big);
});

test("limits: owned worlds, size and leaving", async () => {
  const alex = await signup("Alex");
  const sam = await signup("Sam");
  await friends(alex, sam);
  const ids: string[] = [];
  for (let i = 0; i < MAX_OWN; i++) ids.push((await call(alex, "POST", "/v1/relays", { name: `W${i}` })).json.id);
  expect((await call(alex, "POST", "/v1/relays", { name: "one more" })).status).toBe(409);
  expect((await call(alex, "POST", "/v1/relays", { name: "" })).status).toBe(400);
  await call(alex, "POST", `/v1/relays/${ids[0]}/lock`);
  expect((await call(alex, "POST", `/v1/relays/${ids[0]}/upload`, { size: 2 * 1024 * 1024 * 1024 })).status).toBe(413);

  await call(alex, "POST", `/v1/relays/${ids[1]}/members`, { id: sam.id });
  expect((await call(sam, "POST", `/v1/relays/${ids[1]}/members`, { id: alex.id })).status).toBe(403);
  expect((await call(sam, "DELETE", `/v1/relays/${ids[1]}`)).status).toBe(200);
  expect((await call(sam, "GET", "/v1/relays")).json).toEqual([]);
  expect((await call(alex, "GET", "/v1/relays")).json).toHaveLength(MAX_OWN);

  await upload(alex, ids[0], new Uint8Array([1]));
  expect(objects.size).toBe(1);
  expect((await call(alex, "DELETE", "/v1/me")).status).toBe(200);
  expect(objects.size).toBe(0);
});
