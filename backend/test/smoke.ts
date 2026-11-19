import { b64url, payload } from "../src/auth";

const base = process.argv[2] ?? "http://localhost:8787";
const tag = Math.random().toString(36).slice(2, 8);

async function device() {
  const k = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as CryptoKeyPair;
  return { pub: b64url((await crypto.subtle.exportKey("raw", k.publicKey)) as ArrayBuffer), priv: k.privateKey };
}

async function call(d: Awaited<ReturnType<typeof device>>, method: string, path: string, body?: unknown) {
  const bytes = body === undefined ? new Uint8Array() : new TextEncoder().encode(JSON.stringify(body));
  const time = String(Date.now());
  const sig = await crypto.subtle.sign({ name: "Ed25519" }, d.priv, await payload(method, path, time, bytes));
  const res = await fetch(base + path, {
    method,
    headers: { "x-kromvia-key": d.pub, "x-kromvia-time": time, "x-kromvia-sig": b64url(sig), "content-type": "application/json" },
    body: body === undefined ? undefined : bytes,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${JSON.stringify(json)}`);
  return json as any;
}

const a = await device();
const b = await device();
const an = `smokeA_${tag}`;
const bn = `smokeB_${tag}`;
const ia = await call(a, "POST", "/v1/accounts", { name: an });
const ib = await call(b, "POST", "/v1/accounts", { name: bn });
await call(a, "POST", "/v1/friends/requests", { name: bn });
await call(b, "POST", `/v1/friends/requests/${ia.id}/accept`);
const friends = await call(a, "GET", "/v1/friends");
if (friends.friends[0]?.name !== bn) throw new Error("not friends: " + JSON.stringify(friends));
await call(a, "PUT", "/v1/me/cosmetics", { cosmetics: { cape: "kromvia" } });
const forged = await fetch(base + "/v1/me", { headers: { "x-kromvia-key": a.pub, "x-kromvia-time": String(Date.now()), "x-kromvia-sig": b64url(new Uint8Array(64)) } });
if (forged.status !== 401) throw new Error("forged request got " + forged.status);

async function wsHeaders(d: Awaited<ReturnType<typeof device>>) {
  const time = String(Date.now());
  const sig = await crypto.subtle.sign({ name: "Ed25519" }, d.priv, await payload("GET", "/v1/ws", time, new Uint8Array()));
  return { "x-kromvia-key": d.pub, "x-kromvia-time": time, "x-kromvia-sig": b64url(sig) };
}

async function socket(d: Awaited<ReturnType<typeof device>>, headers?: Record<string, string>) {
  const ws = new WebSocket(base.replace(/^http/, "ws") + "/v1/ws", { headers: headers ?? (await wsHeaders(d)) } as any);
  const inbox: any[] = [];
  const waiters: ((m: any) => void)[] = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(String(e.data));
    const w = waiters.shift();
    w ? w(m) : inbox.push(m);
  };
  await new Promise((ok, err) => ((ws.onopen = ok), (ws.onerror = err)));
  const next = () =>
    inbox.length ? Promise.resolve(inbox.shift()) : new Promise<any>((ok, err) => (waiters.push(ok), setTimeout(() => err(new Error("no message")), 5000)));
  return { ws, next };
}

const replayed = await wsHeaders(a);
const sa = await socket(a, replayed);
const replay = await fetch(base + "/v1/ws", { headers: { ...replayed, upgrade: "websocket", connection: "Upgrade", "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==", "sec-websocket-version": "13" } });
if (replay.status !== 401) throw new Error("replayed upgrade got " + replay.status);
const p0 = await sa.next();
if (p0.type !== "presence" || p0.online.length !== 0) throw new Error("presence: " + JSON.stringify(p0));
const sb = await socket(b);
if ((await sb.next()).online[0] !== ia.id) throw new Error("b should see a online");
const on = await sa.next();
if (on.type !== "online" || on.id !== ib.id) throw new Error("a should hear b come online: " + JSON.stringify(on));
sa.ws.send(JSON.stringify({ type: "chat", to: ib.id, text: "  hi there " }));
const [ga, gb] = [await sa.next(), await sb.next()];
if (ga.text !== "hi there" || gb.text !== "hi there" || gb.from !== ia.id) throw new Error("chat: " + JSON.stringify([ga, gb]));
const history = await call(b, "GET", `/v1/messages/${ia.id}`);
if (history.length !== 1 || history[0].text !== "hi there") throw new Error("history: " + JSON.stringify(history));
sa.ws.send(JSON.stringify({ type: "game", game: { mc: "1.21.11", since: Date.now() - 60_000 } }));
const g1 = await sb.next();
if (g1.type !== "game" || g1.id !== ia.id || g1.game?.mc !== "1.21.11") throw new Error("b should see a's game: " + JSON.stringify(g1));
sa.ws.send(JSON.stringify({ type: "status", status: "dnd" }));
const st = await sb.next();
if (st.type !== "status" || st.status !== "dnd") throw new Error("b should see dnd: " + JSON.stringify(st));
sa.ws.send(JSON.stringify({ type: "status", status: "invisible" }));
const gone = await sb.next();
if (gone.type !== "offline" || gone.id !== ia.id) throw new Error("invisible should look offline: " + JSON.stringify(gone));
sb.ws.send(JSON.stringify({ type: "presence" }));
const hidden = await sb.next();
if (hidden.online.includes(ia.id)) throw new Error("invisible a is in presence: " + JSON.stringify(hidden));
sa.ws.send(JSON.stringify({ type: "status", status: "online" }));
const back = await sb.next();
if (back.type !== "online" || !back.quiet) throw new Error("a should come back quietly: " + JSON.stringify(back));
const backGame = await sb.next();
if (backGame.type !== "game") throw new Error("a's game should come back: " + JSON.stringify(backGame));
sa.ws.send(JSON.stringify({ type: "game", game: null }));
if ((await sb.next()).game !== null) throw new Error("game should clear");
sa.ws.send(JSON.stringify({ type: "server", host: `smoke-${tag}.test`, nick: an }));
const seen = await sb.next();
if (seen.type !== "server" || seen.id !== ia.id || seen.host !== `smoke-${tag}.test`) throw new Error("b should see where a plays: " + JSON.stringify(seen));
sb.ws.send(JSON.stringify({ type: "lookup", names: [an] }));
const notThere = await sb.next();
if (notThere.type !== "worn" || notThere.host !== null) throw new Error("b is on no server, yet: " + JSON.stringify(notThere));
sb.ws.send(JSON.stringify({ type: "server", host: `smoke-${tag}.test`, nick: bn }));
if ((await sa.next()).type !== "server") throw new Error("a should see where b plays");
let cos: any = {};
for (let i = 0; i < 20 && !cos.worn?.[an.toLowerCase()]; i++) {
  await new Promise((ok) => setTimeout(ok, 100));
  sb.ws.send(JSON.stringify({ type: "lookup", names: [an] }));
  cos = await sb.next();
}
if (cos.type !== "worn" || cos.worn[an.toLowerCase()]?.cape !== "kromvia") throw new Error("cosmetics on server: " + JSON.stringify(cos));
const clan = await call(a, "POST", "/v1/clans", { name: `Smoke ${tag}`, tag: `S${tag.slice(0, 5)}`, icon: "sword" });
await call(b, "POST", `/v1/clans/${clan.id}/join`);
sa.ws.send(JSON.stringify({ type: "clan.chat", text: "clan hi" }));
const [ca, cb] = [await sa.next(), await sb.next()];
if (ca.type !== "clan.chat" || cb.text !== "clan hi" || cb.from !== ia.id) throw new Error("clan chat: " + JSON.stringify([ca, cb]));
sb.ws.send(JSON.stringify({ type: "clan.presence" }));
const roster = await sb.next();
if (roster.type !== "clan.presence" || roster.members.length !== 2 || !roster.members.find((m: any) => m.id === ia.id)?.online) throw new Error("clan presence: " + JSON.stringify(roster));
const clanHistory = await call(b, "GET", "/v1/me/clan/messages");
if (clanHistory.at(-1)?.text !== "clan hi") throw new Error("clan history: " + JSON.stringify(clanHistory));
await call(b, "DELETE", "/v1/me/clan");
await call(a, "DELETE", "/v1/me/clan");
sb.ws.close();
const off = await sa.next();
if (off.type !== "offline" || off.id !== ib.id) throw new Error("a should hear b leave: " + JSON.stringify(off));
sa.ws.close();

console.log(`OK ${base}: ${an} ⇄ ${bn}, signatures, presence, chat and cosmetics on a server work`);
console.log(`cleanup ids: ${ia.id} ${ib.id}`);
