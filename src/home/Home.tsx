import { useEffect, useState, type CSSProperties } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useI18n } from "../i18n";
import { Progress } from "../ui/Progress";
import { LaunchError } from "../ui/LaunchError";
import { Glyph } from "../ui/Glyph";
import { usePaged } from "../ui/Pager";
import { Empty } from "../ui/Empty";
import { describe, useLauncher, type Instance } from "../lib/launcher";
import { useJobs } from "../lib/jobs";
import { SkinArt } from "../art/SkinArt";
import { InstanceIcon } from "../art/ModelIcon";
import { Console } from "./Console";
import { CrashHelp } from "./CrashHelp";
import { NewInstance } from "./NewInstance";
import { ImportInstances } from "./ImportInstances";
import { Flowers, Vines } from "./Decor";
import { MinimapOffer } from "./MinimapOffer";
import { TileMenu } from "./TileMenu";
import { Select } from "../ui/Select";

export type Nav = "builds" | "content" | "skins" | "rooms" | "accounts";
type LibrarySkin = { id: string; slim: boolean; dataUrl: string };

const SERVERS = [
  { name: "Hypixel", address: "mc.hypixel.net", color: "#e0a53c" },
  { name: "CubeCraft", address: "play.cubecraft.net", color: "#3a8fd9" },
  { name: "Wynncraft", address: "play.wynncraft.com", color: "#5fb83f" },
  { name: "Minemen", address: "eu.minemen.club", color: "#d94a4a" },
];

type ServerStatus = { online: number; max: number; version: string; latencyMs: number };
type Server = { name: string; address: string; color: string };

const SERVERS_KEY = "kromvia.servers";
const TINTS = ["#e0a53c", "#3a8fd9", "#5fb83f", "#d94a4a", "#b98cf0", "#12907e", "#d9466f"];
const validAddress = (a: string) => /^[a-zA-Z0-9.:-]{1,253}$/.test(a) && !a.startsWith("-");

function ago(seconds: number, t: ReturnType<typeof useI18n>["t"]) {
  const mins = Math.max(0, Math.floor(Date.now() / 1000 - seconds) / 60);
  if (mins < 1) return t("home.agoNow");
  if (mins < 60) return t("home.agoMin", { n: String(Math.floor(mins)) });
  if (mins < 60 * 24) return t("home.agoHour", { n: String(Math.floor(mins / 60)) });
  return t("home.agoDay", { n: String(Math.floor(mins / 60 / 24)) });
}

function savedServers(): Server[] {
  try {
    const list = JSON.parse(localStorage.getItem(SERVERS_KEY) ?? "[]");
    return Array.isArray(list) ? list.filter((s) => s && validAddress(s.address) && typeof s.name === "string") : [];
  } catch {
    return [];
  }
}

const compact = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n));

const NEWS = [
  { title: "Rooms", text: "Play your singleplayer world with friends through a code." },
  { title: "New Right Shift menu", text: "Blur, smooth scrolling and cards that react to you." },
  { title: "18 new modules", text: "Target HUD, TPS, Hit Colour, No Fog, Totem Pops and more." },
];

let newRequested: string | boolean = false;
export function requestNewInstance(code?: string) {
  newRequested = code ?? true;
  window.dispatchEvent(new Event("kromvia:new-instance"));
}
function takeNewRequest() {
  const r = newRequested;
  newRequested = false;
  return r;
}

export function Home({ onNavigate }: { onNavigate: (page: Nav) => void }) {
  const { t } = useI18n();
  const l = useLauncher();
  const { current, instances } = l;
  const [creating, setCreating] = useState(false);
  const [newCode, setNewCode] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [skin, setSkin] = useState<LibrarySkin | null>(null);
  const [showConsole, setShowConsole] = useState(false);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<Record<string, ServerStatus | null>>({});
  const [custom, setCustom] = useState<Server[]>(savedServers);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: "", address: "" });
  const servers = [...SERVERS, ...custom];
  const draftOk = draft.name.trim() !== "" && validAddress(draft.address.trim());

  const saveCustom = (list: Server[]) => {
    setCustom(list);
    try {
      localStorage.setItem(SERVERS_KEY, JSON.stringify(list));
    } catch {}
  };
  const addServer = () => {
    if (!draftOk) return;
    const address = draft.address.trim();
    saveCustom([
      ...custom.filter((c) => c.address !== address),
      { name: draft.name.trim(), address, color: TINTS[custom.length % TINTS.length] },
    ]);
    setDraft({ name: "", address: "" });
    setAdding(false);
  };
  const [clientVersions, setClientVersions] = useState<string[]>([]);
  useEffect(() => {
    invoke<string[]>("client_versions").then(setClientVersions, () => {});
  }, []);
  const [boosted, setBoosted] = useState<Record<string, string>>({});
  const boosts = useJobs("preset-", (key, error) => setBoosted((b) => ({ ...b, [key.slice("preset-".length)]: error ?? "" })));

  const boost = (inst: Instance) =>
    invoke<number>("preset_apply", { instanceId: inst.id, preset: "maxFps" }).then(
      (id) => boosts.started(`preset-${inst.id}`, id),
      (e) => setBoosted((b) => ({ ...b, [inst.id]: String(e) })),
    );

  const serverKey = servers.map((sv) => sv.address).join(",");
  useEffect(() => {
    const poll = () =>
      servers.forEach((sv) =>
        invoke<ServerStatus>("server_status", { address: sv.address }).then(
          (st) => setStatus((m) => ({ ...m, [sv.address]: st })),
          () => setStatus((m) => ({ ...m, [sv.address]: null })),
        ),
      );
    poll();
    const id = setInterval(poll, 60_000);
    return () => clearInterval(id);
  }, [serverKey]);

  const who = l.account?.name ?? l.nick.trim();
  useEffect(() => {
    const look = (name: string) => invoke<LibrarySkin>("skin_lookup", { nick: name });
    invoke<LibrarySkin[]>("wardrobe_list")
      .then((list) => list[0] ?? Promise.reject())
      .catch(() => look(who || "MHF_Steve"))
      .catch(() => look("MHF_Steve"))
      .then(setSkin, () => {});
  }, [who]);

  const [menu, setMenu] = useState<{ inst: Instance; x: number; y: number } | null>(null);
  const [summary, setSummary] = useState<Record<string, { lastPlayed: number; mods: number }>>({});
  const libraryKey = instances.map((i) => i.id).join(",");
  useEffect(() => {
    instances.forEach((i) =>
      invoke<{ lastPlayed: number; mods: number }>("instance_summary", { id: i.id }).then(
        (sm) => setSummary((m) => ({ ...m, [i.id]: sm })),
        () => {},
      ),
    );
  }, [libraryKey, l.exits]);
  const [cover, setCover] = useState<string | null>(null);
  useEffect(() => {
    setCover(null);
    if (current) invoke<string | null>("instance_cover", { id: current.id }).then(setCover, () => {});
  }, [current?.id]);
  const job = current && l.jobOf(current.id);
  const run = current && l.runOf(current.id);
  const [restarting, setRestarting] = useState<string | null>(null);
  useEffect(() => {
    if (!restarting || l.runOf(restarting)) return;
    const inst = instances.find((i) => i.id === restarting);
    setRestarting(null);
    if (inst) l.play(inst);
  }, [restarting, l.running]);
  const name = l.account?.name ?? (l.nick.trim() || t("home.guest"));
  const recent = [...instances].sort((a, b) => b.created - a.created).slice(0, 3);
  const shown = instances.filter((i) => i.name.toLowerCase().includes(query.trim().toLowerCase()));
  const library = usePaged(shown, 12);
  const roomCode = l.hosting ? l.rooms[l.hosting] : undefined;
  const forgeLike = current?.loader?.kind === "forge" || current?.loader?.kind === "neoforge";
  const clientNote =
    !current || clientVersions.length === 0
      ? null
      : forgeLike
        ? clientVersions.includes(`${current.mcVersion}-${current.loader?.kind}`)
          ? null
          : t("home.clientForgeMissing")
        : current.loader?.kind !== "fabric"
          ? t("home.clientFabricOnly")
          : !clientVersions.includes(current.mcVersion)
            ? t("home.clientMissing", { mc: current.mcVersion, versions: clientVersions.filter((v) => !v.endsWith("forge")).join(", ") })
            : null;

  useEffect(() => {
    const open = (r: string | boolean) => {
      if (!r) return;
      setNewCode(typeof r === "string" ? r : null);
      setCreating(true);
    };
    const onNew = () => open(takeNewRequest());
    window.addEventListener("kromvia:new-instance", onNew);
    open(takeNewRequest());
    return () => window.removeEventListener("kromvia:new-instance", onNew);
  }, []);

  const open = (inst: Instance) => {
    l.setSelected(inst.id);
    onNavigate("builds");
  };

  const remove = (id: string) => {
    if (confirmDelete !== id) return setConfirmDelete(id);
    setConfirmDelete(null);
    invoke("instance_delete", { id }).then(l.refresh, (e) => l.setError(id, String(e)));
  };

  const rowAction = (inst: Instance) => {
    const j = l.jobOf(inst.id);
    const r = l.runOf(inst.id);
    if (j) return <Progress job={j} />;
    if (r)
      return (
        <button className="btn btn-danger" onClick={() => invoke("game_stop", { runId: r.runId })}>
          <Glyph name="player-stop" /> {t("game.stop")}
        </button>
      );
    return (
      <button className="btn" onClick={() => l.play(inst)}>
        <Glyph name="player-play" /> {t("game.play")}
      </button>
    );
  };

  return (
    <div className="home">
      <div className="home-main">
        <div className="quickbar">
          <span className="quickbar-label">{t("home.quickPlay")}</span>
          {servers.map((sv) => {
            const st = status[sv.address];
            const mine = custom.some((c) => c.address === sv.address);
            return (
              <span key={sv.address} className="server-wrap">
                <button
                  className="server"
                  style={{ "--c": sv.color } as CSSProperties}
                  title={st ? `${sv.address} · ${st.version.replace(/§./g, "")} · ${st.latencyMs} ms` : sv.address}
                  disabled={!current || !!run || !!job}
                  onClick={() => current && l.play(current, { join: sv.address })}
                >
                  <span className="letter">
                    {sv.name[0]}
                  </span>
                  {sv.name}
                  {st !== undefined && (
                    <span className="online" data-up={!!st}>
                      {st ? compact(st.online) : t("home.offline")}
                    </span>
                  )}
                </button>
                {mine && (
                  <button
                    className="server-remove"
                    aria-label={t("servers.remove")}
                    onClick={() => saveCustom(custom.filter((c) => c.address !== sv.address))}
                  >
                    ✕
                  </button>
                )}
              </span>
            );
          })}
          {adding ? (
            <form
              className="server-form"
              onSubmit={(e) => {
                e.preventDefault();
                addServer();
              }}
            >
              <input
                className="input"
                autoFocus
                placeholder={t("servers.name")}
                aria-label={t("servers.name")}
                maxLength={24}
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.currentTarget.value })}
              />
              <input
                className="input"
                placeholder="play.example.net"
                aria-label={t("servers.address")}
                value={draft.address}
                onChange={(e) => setDraft({ ...draft, address: e.currentTarget.value })}
              />
              <button className="btn" disabled={!draftOk}>
                <Glyph name="plus" /> {t("servers.add")}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setAdding(false)}>
                <Glyph name="x" /> {t("common.cancel")}
              </button>
            </form>
          ) : (
            <button className="server add" aria-label={t("servers.addTitle")} title={t("servers.addTitle")} onClick={() => setAdding(true)}>
              <Glyph name="plus" />
            </button>
          )}
        </div>

        <section className="launchpad tile-art-host" data-cover={cover ? "" : undefined} style={cover ? ({ "--cover": `url("${cover}")` } as CSSProperties) : undefined}>
          <Vines />
          <div className="launchpad-art">
            <img className="launchpad-bee" src="/bee/empty-home.webp" alt="" draggable={false} />
          </div>
          {current ? (
            <div className="launchpad-center">
              {(job || run) && <img className="launch-bee" src={`/bee/${job ? "loading" : "idle"}.webp`} alt="" draggable={false} />}
              {job ? (
                <div className="launch busy">
                  <Progress job={job} />
                  <button className="btn btn-ghost" onClick={() => invoke("job_cancel", { id: job.id })}>
                    <Glyph name="x" /> {t("common.cancel")}
                  </button>
                </div>
              ) : run ? (
                <button className="launch stop" onClick={() => invoke("game_stop", { runId: run.runId })}>
                  <span className="launch-title">{t("game.stop")}</span>
                  <span className="launch-sub">{current.name}</span>
                </button>
              ) : (
                <span className="launch-wrap">
                  <Flowers />
                  <button className="launch" onClick={() => l.play(current)}>
                    <span className="launch-title">
                      {t("home.launch")} {current.mcVersion}
                    </span>
                    <span className="launch-sub">{current.name}</span>
                  </button>
                </span>
              )}
              {!job && (
                <button className="btn btn-ghost" onClick={() => open(current)}>
                  <Glyph name="tool" /> {t("home.openBuild")}
                </button>
              )}
              {instances.length > 1 && (
                <Select
                  className="launch-pick"
                  value={current.id}
                  label={t("home.pick")}
                  options={instances.map((i) => ({ value: i.id, label: `${i.name} · ${describe(i, t("instance.vanilla"))}` }))}
                  onChange={l.setSelected}
                />
              )}
              {clientNote && <small className="muted">{clientNote}</small>}
              <LaunchError instanceId={current.id} onAccounts={() => onNavigate("accounts")} />
              {run && <MinimapOffer inst={current} />}
            </div>
          ) : (
            <div className="launchpad-center">
              <button className="launch" onClick={() => setCreating(true)}>
                <span className="launch-title">{t("instance.new")}</span>
                <span className="launch-sub">{t("home.firstText")}</span>
              </button>
            </div>
          )}
        </section>

        {recent.length > 0 && (
          <section>
            <h2 className="section-title">{t("home.jumpIn")}</h2>
            <ul className="rows">
              {recent.map((inst) => (
                <li key={inst.id} className="row clickable" data-selected={inst.id === current?.id} title={t("home.openBuild")} onClick={() => open(inst)}>
                  <InstanceIcon inst={inst} size={44} />
                  <div className="row-main">
                    <span className="row-name">
                      {inst.name}
                      {l.runOf(inst.id) && <span className="pill live">{t("home.running")}</span>}
                    </span>
                    <small className="muted">{describe(inst, t("instance.vanilla"))}</small>
                  </div>
                  <div className="row-action" onClick={(e) => e.stopPropagation()}>
                    {(inst.loader?.kind === "fabric" || inst.loader?.kind === "quilt") &&
                      (boosts.jobs[`preset-${inst.id}`] ? (
                        <span className="muted small">{t("home.boosting")}</span>
                      ) : boosted[inst.id] !== undefined ? (
                        <span className="muted small" title={boosted[inst.id]}>
                          {boosted[inst.id] ? t("home.boostPartly") : t("home.boosted")}
                        </span>
                      ) : (
                        <button className="btn btn-ghost" title={t("home.boostHint")} onClick={() => boost(inst)}>
                          <Glyph name="bolt" /> {t("home.boost")}
                        </button>
                      ))}
                    {rowAction(inst)}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <div className="library-head">
            <h2 className="section-title">{t("home.instances")}</h2>
            <div className="library-tools">
              <input
                className="input"
                data-search
                placeholder={t("home.search")}
                aria-label={t("home.search")}
                value={query}
                onChange={(e) => setQuery(e.currentTarget.value)}
              />
              <button className="btn btn-ghost" onClick={() => setImporting((v) => !v)}>
                <Glyph name="file-import" /> {t("import.open")}
              </button>
              <button className="btn" title="Ctrl+N" onClick={() => setCreating(true)}>
                <Glyph name="plus" /> {t("instance.new")}
              </button>
            </div>
          </div>
          {importing && <ImportInstances onImported={l.refresh} onClose={() => setImporting(false)} />}
          {creating && (
            <NewInstance
              key={newCode ?? ""}
              initialCode={newCode}
              onDone={(inst) => {
                setCreating(false);
                setNewCode(null);
                if (inst) {
                  l.refresh();
                  l.setSelected(inst.id);
                }
              }}
            />
          )}
          {instances.length === 0 && !creating && <Empty bee="empty-builds">{t("home.empty")}</Empty>}
          <ul className="tiles">
            {library.items.map((inst) => {
              const exit = l.exits[inst.id];
              return (
                <li key={inst.id} onContextMenu={(e) => (e.preventDefault(), setMenu({ inst, x: e.clientX, y: e.clientY }))}>
                  <button className="tile" data-selected={inst.id === current?.id} title={t("home.openBuild")} onClick={() => open(inst)}>
                    <InstanceIcon inst={inst} size={56} />
                    <span className="tile-name">{inst.name}</span>
                    <small>{describe(inst, t("instance.vanilla"))}</small>
                    {summary[inst.id] && (
                      <small className="muted tile-meta">
                        {summary[inst.id].mods > 0 && t("home.modCount", { n: String(summary[inst.id].mods) })}
                        {summary[inst.id].mods > 0 && summary[inst.id].lastPlayed > 0 && " · "}
                        {summary[inst.id].lastPlayed > 0 && ago(summary[inst.id].lastPlayed, t)}
                      </small>
                    )}
                    {exit !== undefined && exit !== 0 && (
                      <span className="error-inline small">{t("game.crashed", { code: String(exit) })}</span>
                    )}
                  </button>
                  {!l.runOf(inst.id) && !l.jobOf(inst.id) && (
                    <button className="tile-play" aria-label={t("game.play")} title={t("game.play")} onClick={() => l.play(inst)}>
                      <Glyph name="player-play" />
                    </button>
                  )}
                  <button
                    className={confirmDelete === inst.id ? "tile-delete confirm" : "tile-delete"}
                    onClick={() => remove(inst.id)}
                    onBlur={() => setConfirmDelete(null)}
                    aria-label={t("instance.delete")}
                  >
                    {confirmDelete === inst.id ? t("instance.deleteConfirm") : "✕"}
                  </button>
                </li>
              );
            })}
          </ul>
          {library.pager}
          {menu && <TileMenu inst={menu.inst} x={menu.x} y={menu.y} onClose={() => setMenu(null)} onOpen={() => open(menu.inst)} />}
        </section>

        {current && run && l.modsChanged[current.id] && (
          <p className="error crash-help">
            {t("game.modsChanged", { files: [...l.modsChanged[current.id].removed, ...l.modsChanged[current.id].added].join(", ") })}
            <button className="btn" onClick={() => (setRestarting(current.id), invoke("game_stop", { runId: run.runId }))}>
              <Glyph name="refresh" /> {t("game.restart")}
            </button>
          </p>
        )}
        {current && l.crashes[current.id] && !run && <CrashHelp key={current.id} inst={current} crash={l.crashes[current.id]} />}
        {current && l.logs[current.id] && (
          <section>
            <button className="btn btn-ghost" onClick={() => setShowConsole((s) => !s)}>
              <Glyph name="terminal-2" /> {showConsole ? t("console.hide") : t("console.show")}
            </button>
            {showConsole && <Console lines={l.logs[current.id]} />}
          </section>
        )}
      </div>

      <aside className="home-side">
        <section className="side-block player">
          <span className="side-label">{t("home.playingAs")}</span>
          <SkinArt skin={skin?.dataUrl ?? null} slim={skin?.slim ?? false} back="cape" />
          <button className="player-name linkish" title={t("nav.accounts")} onClick={() => onNavigate("accounts")}>
            {name}
          </button>
          {(l.accounts.length > 0 || l.offline.length > 0) && (
            <Select
              label={t("home.playingAs")}
              value={l.account ? `acc:${l.account.id}` : l.offline.includes(l.nick.trim()) ? `off:${l.nick.trim()}` : ""}
              options={[
                ...l.accounts.map((a) => ({ value: `acc:${a.id}`, label: a.name })),
                ...l.offline.map((n) => ({ value: `off:${n}`, label: `${n} · ${t("home.offline")}` })),
                { value: "", label: t("home.newNick") },
              ]}
              onChange={(v) => {
                const [kind, id] = [v.slice(0, 4), v.slice(4)];
                if (kind === "acc:") l.pickAccount(id);
                else if (kind === "off:") l.pickOffline(id);
                else (l.setNick(""), l.pickAccount(null));
              }}
            />
          )}
          {!l.account && !l.offline.includes(l.nick.trim()) && (
            <input
              className="input"
              placeholder={t("home.nickname")}
              aria-label={t("home.nickname")}
              value={l.nick}
              maxLength={16}
              onChange={(e) => l.setNick(e.currentTarget.value)}
              onBlur={() => l.rememberNick()}
              onKeyDown={(e) => e.key === "Enter" && l.rememberNick()}
            />
          )}
        </section>

        <section className="side-block">
          <span className="side-label">{t("rooms.title")}</span>
          {l.hosting ? (
            roomCode ? (
              <button className="side-code linkish" title={t("rooms.copy")} onClick={() => navigator.clipboard.writeText(roomCode)}>
                {roomCode}
              </button>
            ) : (
              <p className="room-wait small">{t("rooms.waiting")}</p>
            )
          ) : (
            <p className="muted small">{t("rooms.hint")}</p>
          )}
          <button className="btn btn-ghost" onClick={() => onNavigate("rooms")}>
            <Glyph name="users-group" /> {t("rooms.open")}
          </button>
        </section>

        <section className="side-block">
          <span className="side-label">{t("news.title")}</span>
          <ul className="news">
            {NEWS.map((n) => (
              <li key={n.title}>
                <strong>{n.title}</strong>
                <span className="muted">{n.text}</span>
              </li>
            ))}
          </ul>
        </section>
      </aside>
    </div>
  );
}
