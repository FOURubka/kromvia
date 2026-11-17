import { useEffect, useState } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { useI18n } from "../i18n";
import type { MessageKey } from "../i18n/en";
import { useJobs } from "../lib/jobs";
import { formatBytes, formatDuration, useLauncher, type Instance } from "../lib/launcher";
import { Progress } from "../ui/Progress";
import { Glyph } from "../ui/Glyph";
import { usePaged } from "../ui/Pager";
import { Empty } from "../ui/Empty";
import { Select } from "../ui/Select";

type World = {
  folder: string;
  name: string;
  lastPlayed: number;
  mode: "survival" | "creative" | "adventure" | "spectator";
  hardcore: boolean;
  version: string | null;
  size: number;
  icon: string | null;
};
type SavedServer = { name: string; address: string; icon: string | null; pinned: boolean };
type Place = { kind: "world" | "server"; name: string };
type Screenshot = { name: string; path: string; taken: number; place: Place | null };
type Period = "all" | "day" | "week" | "month";
const PERIOD_DAYS: Record<Period, number> = { all: 0, day: 1, week: 7, month: 30 };
const placeKey = (p: Place | null) => (p ? `${p.kind}:${p.name}` : "");
type Info = {
  stats: { playSeconds: number; launches: number; lastPlayed: number };
  usage: { total: number; saves: number; mods: number; screenshots: number; junk: number };
};

export const validAddress = (a: string) => /^[a-zA-Z0-9.:-]{1,253}$/.test(a) && !a.startsWith("-");
export const quickPlayWorlds = (mc: string) => {
  const m = /^1\.(\d+)/.exec(mc);
  return m ? Number(m[1]) >= 20 : /^\d{2}\./.test(mc);
};

export function FolderButton({ inst, folder, label }: { inst: Instance; folder: string; label?: string }) {
  const { t } = useI18n();
  return (
    <button className="btn btn-ghost" onClick={() => invoke("instance_open_folder", { instanceId: inst.id, folder })}>
      <Glyph name="folder" /> {label ?? t("files.openFolder")}
    </button>
  );
}

export function Worlds({ inst }: { inst: Instance }) {
  const { t } = useI18n();
  const l = useLauncher();
  const [worlds, setWorlds] = useState<World[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ folder: string; name: string } | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const refresh = () => invoke<World[]>("world_list", { instanceId: inst.id }).then(setWorlds, (e) => (setWorlds([]), setError(String(e))));
  useEffect(() => {
    setWorlds(null);
    refresh();
  }, [inst.id]);

  const act = (p: Promise<unknown>, done?: string) => {
    setError(null);
    setNotice(null);
    p.then(() => (done && setNotice(done), refresh()), (e) => setError(String(e)));
  };
  const exportWorld = async (w: World) => {
    const path = await save({ defaultPath: `${w.name}.zip`, filters: [{ name: "Zip", extensions: ["zip"] }] });
    if (path) act(invoke("world_export", { instanceId: inst.id, folder: w.folder, path }), t("worlds.exported"));
  };
  const remove = (w: World) => {
    if (confirm !== w.folder) return setConfirm(w.folder);
    setConfirm(null);
    act(invoke("world_delete", { instanceId: inst.id, folder: w.folder }));
  };
  const canPlay = quickPlayWorlds(inst.mcVersion);
  const paged = usePaged(worlds ?? [], 8);

  return (
    <section className="card">
      <div className="card-head">
        {!canPlay && <p className="muted">{t("worlds.oldVersion")}</p>}
        <FolderButton inst={inst} folder="saves" />
      </div>
      {error && <p className="error">{error}</p>}
      {notice && <p className="muted">{notice}</p>}
      {worlds === null ? (
        <p className="muted">{t("common.loading")}</p>
      ) : worlds.length === 0 ? (
        <Empty bee="empty-worlds">{t("worlds.empty")}</Empty>
      ) : (
        <>
          <ul className="rows">
            {paged.items.map((w) => (
              <li key={w.folder} className="row plain">
                {w.icon ? <img className="world-icon" src={w.icon} alt="" /> : <span className="world-icon" />}
                <div className="list-main">
                  {renaming?.folder === w.folder ? (
                    <form
                      className="rename"
                      onSubmit={(e) => {
                        e.preventDefault();
                        act(invoke("world_rename", { instanceId: inst.id, folder: w.folder, name: renaming.name }));
                        setRenaming(null);
                      }}
                    >
                      <input className="input" autoFocus value={renaming.name} onChange={(e) => setRenaming({ ...renaming, name: e.currentTarget.value })} />
                      <button className="btn" disabled={!renaming.name.trim()}>
                        {t("common.save")}
                      </button>
                      <button type="button" className="btn btn-ghost" onClick={() => setRenaming(null)}>
                        {t("common.cancel")}
                      </button>
                    </form>
                  ) : (
                    <span>{w.name}</span>
                  )}
                  <span className="muted small">
                    {[
                      t(`worlds.mode.${w.mode}` as MessageKey),
                      w.hardcore && t("worlds.hardcore"),
                      w.version,
                      w.lastPlayed > 0 && new Date(w.lastPlayed).toLocaleDateString(),
                      formatBytes(w.size),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>
                <div className="row-tools">
                <button className="btn btn-ghost" title={t("worlds.rename")} aria-label={t("worlds.rename")} onClick={() => setRenaming({ folder: w.folder, name: w.name })}>
                  <Glyph name="pencil" />
                </button>
                <button className="btn btn-ghost" title={t("worlds.copy")} aria-label={t("worlds.copy")} onClick={() => act(invoke("world_duplicate", { instanceId: inst.id, folder: w.folder }))}>
                  <Glyph name="copy" />
                </button>
                <button className="btn btn-ghost" title={t("worlds.export")} aria-label={t("worlds.export")} onClick={() => exportWorld(w)}>
                  <Glyph name="file-export" />
                </button>
                <button className="btn btn-ghost" title={t("instance.delete")} aria-label={t("instance.delete")} onClick={() => remove(w)} onBlur={() => setConfirm(null)}>
                  {confirm === w.folder ? t("worlds.deleteConfirm") : <Glyph name="trash" />}
                </button>
                </div>
                {canPlay && (
                  <button className="btn" disabled={!!l.runOf(inst.id)} onClick={() => l.play(inst, { world: w.folder })}>
                    <Glyph name="player-play" /> {t("worlds.play")}
                  </button>
                )}
              </li>
            ))}
          </ul>
          {paged.pager}
        </>
      )}
    </section>
  );
}

type Status = { online: number; max: number; latencyMs: number };

export function SavedServers({ inst }: { inst: Instance }) {
  const { t } = useI18n();
  const l = useLauncher();
  const [servers, setServers] = useState<SavedServer[]>([]);
  const [status, setStatus] = useState<Record<string, Status | null>>({});
  const [draft, setDraft] = useState({ name: "", address: "" });
  const [error, setError] = useState<string | null>(null);
  const refresh = () => invoke<SavedServer[]>("saved_servers", { instanceId: inst.id }).then(setServers, (e) => setError(String(e)));
  useEffect(() => {
    refresh();
  }, [inst.id]);
  useEffect(() => {
    servers.forEach((s) =>
      invoke<Status>("server_status", { address: s.address }).then(
        (st) => setStatus((m) => ({ ...m, [s.address]: st })),
        () => setStatus((m) => ({ ...m, [s.address]: null })),
      ),
    );
  }, [servers]);

  const act = (p: Promise<unknown>) => {
    setError(null);
    p.then(refresh, (e) => setError(String(e)));
  };
  const draftOk = draft.name.trim() !== "" && validAddress(draft.address.trim());
  const paged = usePaged(servers, 8);

  return (
    <section className="card">
      <p className="muted">{t("savedServers.hint")}</p>
      {error && <p className="error">{error}</p>}
      {servers.length === 0 ? (
        <Empty bee="empty-servers">{t("savedServers.empty")}</Empty>
      ) : (
        <>
          <ul className="rows">
            {paged.items.map((s) => {
              const st = status[s.address];
              return (
                <li key={s.address} className="row plain">
                  {s.icon ? <img className="world-icon" src={s.icon} alt="" /> : <span className="world-icon" />}
                  <div className="list-main">
                    <span>{s.name}</span>
                    <span className="muted small">
                      {s.address}
                      {st === null && ` · ${t("savedServers.offline")}`}
                      {st && ` · ${st.online}/${st.max} · ${st.latencyMs} ms`}
                    </span>
                  </div>
                  <div className="row-tools">
                    <button
                      className="btn btn-ghost"
                      title={t(s.pinned ? "savedServers.unpin" : "savedServers.pin")}
                      aria-label={t(s.pinned ? "savedServers.unpin" : "savedServers.pin")}
                      aria-pressed={s.pinned}
                      onClick={() => act(invoke("saved_server_pin", { instanceId: inst.id, address: s.address, pinned: !s.pinned }))}
                    >
                      <Glyph name="pin" />
                    </button>
                    <button
                      className="btn btn-ghost"
                      title={t("servers.remove")}
                      aria-label={t("servers.remove")}
                      onClick={() => act(invoke("saved_server_remove", { instanceId: inst.id, address: s.address }))}
                    >
                      <Glyph name="trash" />
                    </button>
                  </div>
                  <button className="btn" disabled={!!l.runOf(inst.id)} onClick={() => l.play(inst, { join: s.address })}>
                    <Glyph name="login-2" /> {t("savedServers.join")}
                  </button>
                </li>
              );
            })}
          </ul>
          {paged.pager}
        </>
      )}
      <form
        className="saved-server-add"
        onSubmit={(e) => {
          e.preventDefault();
          if (!draftOk) return;
          act(invoke("saved_server_add", { instanceId: inst.id, name: draft.name.trim(), address: draft.address.trim() }));
          setDraft({ name: "", address: "" });
        }}
      >
        <input className="input" placeholder={t("servers.name")} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.currentTarget.value })} />
        <input className="input" placeholder={t("servers.address")} value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.currentTarget.value })} />
        <button className="btn" disabled={!draftOk}>
          <Glyph name="plus" /> {t("servers.add")}
        </button>
      </form>
    </section>
  );
}

export function Screenshots({ inst }: { inst: Instance }) {
  const { t } = useI18n();
  const [shots, setShots] = useState<Screenshot[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shared, setShared] = useState<string | null>(null);
  const share = (name: string) => {
    setError(null);
    invoke<string>("share_screenshot", { instanceId: inst.id, name }).then(
      (url) => {
        navigator.clipboard.writeText(url);
        setShared(name);
      },
      (e) => setError(String(e)),
    );
  };
  const refresh = () => invoke<Screenshot[]>("screenshot_list", { instanceId: inst.id }).then(setShots, (e) => (setShots([]), setError(String(e))));
  useEffect(() => {
    setShots(null);
    refresh();
  }, [inst.id]);
  const act = (p: Promise<unknown>) => p.then(refresh, (e) => setError(String(e)));
  const [where, setWhere] = useState("all");
  const [period, setPeriod] = useState<Period>("all");
  useEffect(() => setWhere("all"), [inst.id]);
  const places = [...new Map((shots ?? []).filter((s) => s.place).map((s) => [placeKey(s.place), s.place!])).entries()].sort((a, b) => a[1].name.localeCompare(b[1].name));
  const since = PERIOD_DAYS[period] ? Date.now() / 1000 - PERIOD_DAYS[period] * 86400 : 0;
  const shown = (shots ?? []).filter((s) => s.taken >= since && (where === "all" || placeKey(s.place) === where));
  const paged = usePaged(shown, 12);

  return (
    <section className="card">
      <div className="card-head">
        <span className="muted">{shots && shots.length > 0 ? shots.length : ""}</span>
        <FolderButton inst={inst} folder="screenshots" />
      </div>
      {error && <p className="error">{error}</p>}
      {shots === null ? (
        <p className="muted">{t("common.loading")}</p>
      ) : shots.length === 0 ? (
        <Empty bee="empty-shots">{t("shots.empty")}</Empty>
      ) : (
        <>
          <div className="installed-tools">
            {places.length > 0 && (
              <Select
                value={where}
                options={[
                  { value: "all", label: t("shots.everywhere") },
                  ...places.map(([key, p]) => ({ value: key, label: `${p.name} (${t(p.kind === "server" ? "shots.kind.server" : "shots.kind.world")})` })),
                ]}
                onChange={setWhere}
              />
            )}
            <div className="segmented">
              {(["all", "day", "week", "month"] as Period[]).map((p) => (
                <button key={p} aria-pressed={period === p} onClick={() => setPeriod(p)}>
                  {t(`shots.period.${p}` as MessageKey)}
                </button>
              ))}
            </div>
          </div>
          {shown.length === 0 && <p className="muted">{t("shots.noneHere")}</p>}
          <ul className="shots">
            {paged.items.map((s) => (
              <li key={s.name}>
                <button className="shot" title={s.name} onClick={() => act(invoke("screenshot_open", { instanceId: inst.id, name: s.name }))}>
                  <img src={convertFileSrc(s.path)} alt={s.name} loading="lazy" />
                </button>
                <div className="shot-bar">
                  <span className="muted small" title={s.place?.name}>
                    {new Date(s.taken * 1000).toLocaleString()}
                    {s.place && ` · ${s.place.name}`}
                  </span>
                  <button className="btn btn-ghost" title={t("shots.share")} aria-label={t("shots.share")} onClick={() => share(s.name)}>
                    <Glyph name={shared === s.name ? "check" : "copy"} />
                  </button>
                  <button
                    className="btn btn-ghost"
                    title={t("shots.discord")}
                    aria-label={t("shots.discord")}
                    onClick={() => invoke("screenshot_discord", { instanceId: inst.id, name: s.name }).catch((e) => setError(String(e)))}
                  >
                    <Glyph name="broadcast" />
                  </button>
                  <button
                    className="btn btn-ghost"
                    title={t("instance.delete")}
                    aria-label={t("instance.delete")}
                    onClick={() => act(invoke("screenshot_delete", { instanceId: inst.id, name: s.name }))}
                  >
                    <Glyph name="trash" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {paged.pager}
        </>
      )}
    </section>
  );
}

const QUICK_FOLDERS: [string, MessageKey][] = [
  ["", "quick.root"],
  ["mods", "files.mods"],
  ["resourcepacks", "content.tab.resourcepack"],
  ["shaderpacks", "content.tab.shader"],
  ["saves", "files.saves"],
  ["screenshots", "builds.screenshots"],
  ["config", "quick.config"],
  ["logs", "quick.logs"],
];

export function Files({ inst }: { inst: Instance }) {
  const { t } = useI18n();
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const refresh = () => invoke<Info>("instance_info", { id: inst.id }).then(setInfo, (e) => setError(String(e)));
  useEffect(() => {
    setInfo(null);
    refresh();
  }, [inst.id]);

  const repairs = useJobs("repair-", (_, e) => {
    const n = e && /^repaired (\d+)$/.exec(e);
    if (n) setNotice(t("files.repaired", { n: n[1] }));
    else if (e) setError(e);
    else setNotice(t("files.repairOk"));
  });
  const repairing = repairs.jobs[`repair-${inst.id}`];
  const repair = () => {
    setError(null);
    setNotice(null);
    invoke<number>("instance_repair", { id: inst.id }).then(
      (id) => repairs.started(`repair-${inst.id}`, id),
      (e) => setError(String(e)),
    );
  };
  const clean = () => {
    setError(null);
    setNotice(null);
    invoke<number>("instance_clean", { id: inst.id }).then(
      (freed) => (setNotice(t("files.cleaned", { size: formatBytes(freed) })), refresh()),
      (e) => setError(String(e)),
    );
  };

  const s = info?.stats;
  const u = info?.usage;
  return (
    <section className="card">
      {error && <p className="error">{error}</p>}
      {notice && <p className="muted">{notice}</p>}
      {!info ? (
        <p className="muted">{t("common.loading")}</p>
      ) : (
        <dl className="stats">
          {(
            [
              ["files.playTime", formatDuration(s!.playSeconds)],
              ["files.launches", s!.launches],
              ["files.lastPlayed", s!.lastPlayed > 0 ? new Date(s!.lastPlayed * 1000).toLocaleDateString() : t("files.never")],
              ["files.disk", formatBytes(u!.total)],
              ["files.saves", formatBytes(u!.saves)],
              ["files.mods", formatBytes(u!.mods)],
              ["builds.screenshots", formatBytes(u!.screenshots)],
              ["files.junk", formatBytes(u!.junk)],
            ] as [MessageKey, string | number][]
          ).map(([label, value]) => (
            <div key={label} className="stat">
              <dt>{t(label)}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      )}
      <h3>{t("quick.folders")}</h3>
      <div className="quick-folders">
        {QUICK_FOLDERS.map(([folder, label]) => (
          <FolderButton key={folder} inst={inst} folder={folder} label={t(label)} />
        ))}
      </div>
      <p className="muted">{t("files.repairHint")}</p>
      <div className="actions">
        <button className="btn btn-ghost" disabled={!u || u.junk === 0} onClick={clean}>
          <Glyph name="trash" /> {t("files.clean")}
        </button>
        {repairing ? (
          <div className="job">
            <Progress job={repairing} />
          </div>
        ) : (
          <button className="btn" onClick={repair}>
            <Glyph name="tool" /> {t("files.repair")}
          </button>
        )}
      </div>
    </section>
  );
}

type Backup = { name: string; created: number; size: number };

export function Backups({ inst, onRestored }: { inst: Instance; onRestored: () => void }) {
  const { t } = useI18n();
  const l = useLauncher();
  const [list, setList] = useState<Backup[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const refresh = () => invoke<Backup[]>("backup_list", { instanceId: inst.id }).then(setList, (e) => (setList([]), setError(String(e))));
  useEffect(() => {
    setList(null);
    refresh();
  }, [inst.id]);

  const jobs = useJobs("backup-", (_, e) => {
    if (e) setError(e);
    else setNotice(t("backups.created"));
    refresh();
  });
  const running = jobs.jobs[`backup-${inst.id}`];
  const create = () => {
    setError(null);
    setNotice(null);
    invoke<number>("backup_create", { instanceId: inst.id }).then(
      (id) => jobs.started(`backup-${inst.id}`, id),
      (e) => setError(String(e)),
    );
  };
  const restore = (b: Backup) => {
    if (confirm !== b.name) return setConfirm(b.name);
    setConfirm(null);
    setError(null);
    setNotice(null);
    setRestoring(true);
    invoke("backup_restore", { instanceId: inst.id, name: b.name })
      .then(() => (setNotice(t("backups.restored")), onRestored()), (e) => setError(String(e)))
      .finally(() => setRestoring(false));
  };
  const remove = (b: Backup) =>
    invoke("backup_delete", { instanceId: inst.id, name: b.name }).then(refresh, (e) => setError(String(e)));
  const paged = usePaged(list ?? [], 6);

  return (
    <section className="card">
      <div className="card-head">
        <p className="muted">{t("backups.hint")}</p>
        <div className="actions">
          <button className="btn btn-ghost" onClick={() => invoke("backup_open_folder", { instanceId: inst.id })}>
            <Glyph name="folder" /> {t("files.openFolder")}
          </button>
          {running ? (
            <div className="job">
              <Progress job={running} />
            </div>
          ) : (
            <button className="btn" disabled={restoring} onClick={create}>
              <Glyph name="device-floppy" /> {t("backups.create")}
            </button>
          )}
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      {notice && <p className="muted">{notice}</p>}
      {list === null ? (
        <p className="muted">{t("common.loading")}</p>
      ) : list.length === 0 ? (
        <Empty bee="empty-backups">{t("backups.empty")}</Empty>
      ) : (
        <>
          <ul className="rows">
            {paged.items.map((b) => (
              <li key={b.name} className="row plain">
                <div className="list-main">
                  <span>{new Date(b.created * 1000).toLocaleString()}</span>
                  <span className="muted small">{formatBytes(b.size)}</span>
                </div>
                <div className="row-tools">
                  <button className="btn btn-ghost" title={t("instance.delete")} aria-label={t("instance.delete")} disabled={restoring} onClick={() => remove(b)}>
                    <Glyph name="trash" />
                  </button>
                </div>
                <button className="btn" disabled={restoring || !!running || !!l.runOf(inst.id)} onClick={() => restore(b)} onBlur={() => setConfirm(null)}>
                  <Glyph name="refresh" /> {confirm === b.name ? t("backups.restoreConfirm") : t("backups.restore")}
                </button>
              </li>
            ))}
          </ul>
          {paged.pager}
        </>
      )}
    </section>
  );
}

type SyncEntry = { key: string; updated: number; size: number };

export function Cloud({ inst, onInstalled }: { inst: Instance; onInstalled: () => void }) {
  const { t } = useI18n();
  const { instances } = useLauncher();
  const [entries, setEntries] = useState<SyncEntry[]>([]);
  const [code, setCode] = useState<string | null>(null);
  const [left, setLeft] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = () => invoke<SyncEntry[]>("sync_list").then((e) => setEntries(e.filter((x) => x.key.startsWith("build."))), (e) => setError(String(e)));
  useEffect(() => {
    refresh();
  }, []);
  const uploads = useJobs("sync-", (_, e) => {
    if (e) setError(e);
    else setNotice(t("cloud.saved"));
    refresh();
  });
  const installs = useJobs("build-install", (_, e) => {
    if (e) setError(e);
    else setNotice(t("cloud.installed"));
    onInstalled();
  });
  const run = (p: Promise<unknown>) => {
    setError(null);
    setNotice(null);
    return p.catch((e) => setError(String(e)));
  };
  const install = (manifest: unknown) => run(invoke<number>("build_install", { manifest }).then((id) => installs.started("build-install", id)));
  const upload = uploads.jobs[`sync-${inst.id}`];
  const installing = installs.jobs["build-install"];

  return (
    <section className="card">
      <p className="muted">{t("cloud.about")}</p>
      <div className="actions">
        <button className="btn" disabled={!!upload} onClick={() => run(invoke<number>("sync_build", { instanceId: inst.id }).then((id) => uploads.started(`sync-${inst.id}`, id)))}>
          <Glyph name="upload" /> {t("cloud.save")}
        </button>
        <button
          className="btn btn-ghost"
          onClick={() =>
            run(
              invoke<{ code: string; missing: string[] }>("share_build", { instanceId: inst.id }).then((r) => {
                setCode(`https://kromvia.com/s/${r.code}`);
                setLeft(r.missing);
              }),
            )
          }
        >
          <Glyph name="copy" /> {t("cloud.share")}
        </button>
      </div>
      {upload && <Progress job={upload} />}
      {code && (
        <div className="room-code">
          <code>{code}</code>
          <button className="btn" onClick={() => navigator.clipboard.writeText(code)}>
            <Glyph name="copy" /> {t("rooms.copy")}
          </button>
        </div>
      )}
      {code && left.length > 0 && <p className="error">{t("cloud.missing", { files: left.map((f) => f.split("/").pop()).join(", ") })}</p>}
      <h3>{t("cloud.fromCode")}</h3>
      <div className="field">
        <input className="input" value={input} placeholder={t("cloud.codePlaceholder")} aria-label={t("cloud.codePlaceholder")} onChange={(e) => setInput(e.currentTarget.value.trim())} />
        <button className="btn" disabled={!input || !!installing} onClick={() => run(invoke<{ kind: string; data: unknown }>("share_get", { code: input.split("/").filter(Boolean).pop() ?? "" }).then((s) => (s.kind === "build" ? install(s.data) : setError(t("cloud.notBuild")))))}>
          <Glyph name="download" /> {t("cloud.install")}
        </button>
      </div>
      {entries.length > 0 && (
        <>
          <h3>{t("cloud.saved")}</h3>
          <ul className="list">
            {entries.map((e) => (
              <li key={e.key} className="list-row">
                <div className="list-main">
                  <span className="instance-name">{instances.find((i) => `build.${i.id}` === e.key)?.name ?? e.key.slice("build.".length)}</span>
                  <span className="muted">{new Date(e.updated).toLocaleString()}</span>
                </div>
                <button className="btn btn-ghost" onClick={() => run(invoke("sync_delete", { key: e.key }).then(refresh))}>
                  <Glyph name="trash" />
                </button>
                <button className="btn" disabled={!!installing} onClick={() => run(invoke<unknown>("sync_get", { key: e.key }).then((m) => m && install(m)))}>
                  <Glyph name="download" /> {t("cloud.install")}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {installing && <Progress job={installing} />}
      {notice && <p className="muted">{notice}</p>}
      {error && <p className="error">{error}</p>}
    </section>
  );
}
