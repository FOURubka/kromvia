import { useEffect, useRef, useState, type CSSProperties } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { useI18n } from "../i18n";
import type { MessageKey } from "../i18n/en";
import { useJobs } from "../lib/jobs";
import { Progress } from "../ui/Progress";
import { Select } from "../ui/Select";
import { LaunchError } from "../ui/LaunchError";
import { LOADER_NAMES, useLauncher, type Instance } from "../lib/launcher";
import { VersionPicker, versionReady, type VersionChoice } from "../home/VersionPicker";
import { Glyph } from "../ui/Glyph";
import { usePaged } from "../ui/Pager";
import { Empty } from "../ui/Empty";
import { InstanceIcon } from "../art/ModelIcon";
import { PIXEL_ICONS, pixelIcon } from "../art/pixelIcons";
import { MOD_QUERY_KEY } from "../ui/Palette";
import { aimContent, InstalledList, type Installed, type Kind } from "../content/Content";
import { PackOrder, SafetyCheck } from "../content/Tools";
import { ContentUpdates } from "../content/Updates";
import { Backups, Cloud, Files, FolderButton, SavedServers, Screenshots, Worlds } from "./InstanceExtras";
import { Conflicts } from "./Conflicts";
import { LagCheck } from "./LagCheck";
import { Memory } from "./Memory";
import { Metrics } from "./Metrics";

type Preset = "auto" | "maxFps" | "balanced" | "quality";
const PRESETS: Preset[] = ["auto", "maxFps", "balanced", "quality"];

type Tab = "content" | "conflicts" | "worlds" | "servers" | "screenshots" | "settings" | "performance" | "files" | "backups" | "cloud" | "icon";
const TABS: Tab[] = ["content", "worlds", "servers", "screenshots", "settings", "performance"];
const MORE_TABS: Tab[] = ["conflicts", "cloud"];
const TAB_LABELS: Record<Tab, MessageKey> = {
  content: "builds.content",
  conflicts: "conflicts.title",
  worlds: "builds.worlds",
  servers: "builds.servers",
  screenshots: "builds.screenshots",
  settings: "builds.settings",
  performance: "builds.performance",
  files: "builds.files",
  backups: "backups.title",
  cloud: "cloud.title",
  icon: "builds.icon",
};

export function Builds({ onAddContent, onAccounts }: { onAddContent: (kind: Kind) => void; onAccounts: () => void }) {
  const { t } = useI18n();
  const [instances, setInstances] = useState<Instance[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("content");
  const [more, setMore] = useState(false);
  const [actions, setActions] = useState<DOMRect | null>(null);
  const actionsButton = useRef<HTMLButtonElement>(null);
  const actionsMenu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!actions) return;
    const close = () => (setActions(null), setConfirmDelete(null));
    const outside = (e: Event) => {
      const target = e.target as Node;
      if (!actionsMenu.current?.contains(target) && !actionsButton.current?.contains(target)) close();
    };
    document.addEventListener("mousedown", outside);
    document.addEventListener("scroll", outside, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("scroll", outside, true);
      window.removeEventListener("resize", close);
    };
  }, [actions]);
  const [dropping, setDropping] = useState(false);
  const [contentRev, setContentRev] = useState(0);

  const launcher = useLauncher();
  const { selected, setSelected } = launcher;
  const refresh = () => {
    launcher.refresh();
    return invoke<Instance[]>("instance_list").then(setInstances);
  };
  useEffect(() => {
    refresh();
  }, []);

  const imports = useJobs("modpack-file-", (_, e) => {
    setError(e);
    if (!e) refresh();
  });
  const exports = useJobs("export-", (_, e) => {
    setError(e);
    if (!e) setNotice(t("builds.exported"));
  });

  const inst = instances.find((i) => i.id === selected) ?? instances[0];
  const groups = [...new Set(instances.map((i) => i.group).filter((g): g is string => !!g))].sort((a, b) => a.localeCompare(b));
  const ordered = [...instances].sort((a, b) => (a.group ?? "").localeCompare(b.group ?? ""));
  const list = usePaged(ordered, 10);
  const [cover, setCover] = useState<string | null>(null);
  const [coverRev, setCoverRev] = useState(0);
  useEffect(() => {
    setCover(null);
    if (inst) invoke<string | null>("instance_cover", { id: inst.id }).then(setCover, () => {});
  }, [inst?.id, coverRev]);

  const [broken, setBroken] = useState(0);
  useEffect(() => {
    setBroken(0);
    if (inst)
      invoke<{ severity: string }[] | null>("content_conflicts", { instanceId: inst.id }).then(
        (list) => setBroken(list?.filter((c) => c.severity === "error").length ?? 0),
        () => {},
      );
  }, [inst?.id, contentRev, tab]);

  const instRef = useRef(inst);
  instRef.current = inst;
  useEffect(() => {
    const off = getCurrentWebview().onDragDropEvent(({ payload }) => {
      const target = instRef.current;
      if (payload.type === "over" || payload.type === "enter") return setDropping(!!target);
      setDropping(false);
      if (payload.type !== "drop" || !target) return;
      const packs = payload.paths.filter((p) => p.toLowerCase().endsWith(".mrpack"));
      const files = payload.paths.filter((p) => !packs.includes(p));
      packs.forEach((path) =>
        invoke<number>("modpack_import", { path }).then(
          (id) => imports.started(`modpack-file-${path}`, id),
          (e) => setError(String(e)),
        ),
      );
      if (files.length === 0) return;
      setError(null);
      setNotice(null);
      invoke<string[]>("content_add_files", { instanceId: target.id, paths: files })
        .then((added) => {
          setNotice(t("builds.dropped", { n: String(added.length), name: target.name }));
          setTab("content");
          setContentRev((r) => r + 1);
        })
        .catch((e) => setError(String(e)));
    });
    return () => {
      off.then((f) => f());
    };
  }, []);

  const importPack = async () => {
    setError(null);
    const path = await open({ filters: [{ name: "Modpack", extensions: ["mrpack", "zip"] }] });
    if (!path) return;
    invoke<number>("modpack_import", { path }).then(
      (id) => imports.started(`modpack-file-${path}`, id),
      (e) => setError(String(e)),
    );
  };

  const exportPack = async (i: Instance) => {
    setError(null);
    setNotice(null);
    const path = await save({ defaultPath: `${i.name}.mrpack`, filters: [{ name: "Modrinth modpack", extensions: ["mrpack"] }] });
    if (!path) return;
    invoke<number>("modpack_export", { instanceId: i.id, path }).then(
      (id) => exports.started(`export-${i.id}`, id),
      (e) => setError(String(e)),
    );
  };

  const shortcut = (i: Instance) => {
    setError(null);
    setNotice(null);
    invoke<string>("shortcut_create", { instanceId: i.id }).then(
      (path) => setNotice(t("builds.shortcutMade", { path })),
      (e) => setError(String(e)),
    );
  };

  const saveTemplate = (i: Instance) => {
    setError(null);
    setNotice(null);
    invoke("template_save", { instanceId: i.id, name: i.name }).then(
      () => setNotice(t("builds.templateSaved", { name: i.name })),
      (e) => setError(String(e)),
    );
  };

  const duplicate = (i: Instance) =>
    invoke<Instance>("instance_duplicate", { id: i.id }).then(
      (copy) => (refresh(), setSelected(copy.id)),
      (e) => setError(String(e)),
    );

  const remove = (i: Instance) => {
    if (confirmDelete !== i.id) return setConfirmDelete(i.id);
    setConfirmDelete(null);
    invoke("instance_delete", { id: i.id }).then(
      () => (refresh(), setSelected(null)),
      (e) => setError(String(e)),
    );
  };

  const presets = useJobs("preset-", (_, e) => {
    setError(e);
    if (!e) setNotice(t("builds.presetApplied"));
  });
  const applyPreset = (i: Instance, preset: Preset) => {
    setError(null);
    setNotice(null);
    invoke<number>("preset_apply", { instanceId: i.id, preset }).then(
      (id) => presets.started(`preset-${i.id}`, id),
      (e) => setError(String(e)),
    );
  };

  const importing = Object.values(imports.jobs)[0];
  const presetJob = inst && presets.jobs[`preset-${inst.id}`];
  const exporting = inst && exports.jobs[`export-${inst.id}`];

  return (
    <>
      <div className="page-head">
        <h1 className="page-title">{t("nav.builds")}</h1>
        {importing ? (
          <div className="job">
            <Progress job={importing} />
          </div>
        ) : (
          <button className="btn btn-ghost" onClick={importPack}>
            <Glyph name="file-import" /> {t("builds.import")}
          </button>
        )}
      </div>
      {error && <p className="error">{error}</p>}
      {notice && <p className="muted">{notice}</p>}
      {instances.length === 0 ? (
        <Empty bee="empty-builds">{t("builds.empty")}</Empty>
      ) : (
        <div className="builds">
          <div className="builds-side">
            <div className="builds-scroll">
              <ul className="list instances">
                {list.items.map((i, n) => [
                  (n === 0 || list.items[n - 1].group !== i.group) && (i.group || n > 0) && (
                    <li key={`group-${i.group ?? ""}`} className="instance-group muted">
                      {i.group ?? t("builds.ungrouped")}
                    </li>
                  ),
                  <li key={i.id} className="list-row instance" data-selected={i.id === inst?.id} onClick={() => setSelected(i.id)} onDoubleClick={() => launcher.play(i)}>
                    <InstanceIcon inst={i} size={32} />
                    <div className="list-main">
                      <span className="instance-name">{i.name}</span>
                      <span className="muted">
                        {i.mcVersion} · {i.loader ? LOADER_NAMES[i.loader.kind] : t("instance.vanilla")}
                      </span>
                    </div>
                  </li>,
                ])}
              </ul>
              {list.pager}
            </div>
          </div>
          {inst && (
            <div className="build">
              <header className="card build-head" data-cover={cover ? "" : undefined} style={cover ? ({ "--cover": `url("${cover}")` } as CSSProperties) : undefined}>
                <button className="build-icon" title={t("builds.icon")} aria-label={t("builds.icon")} onClick={() => setTab("icon")}>
                  <InstanceIcon inst={inst} size={56} />
                </button>
                <div className="list-main">
                  <h2>{inst.name}</h2>
                  <span className="muted">
                    {inst.mcVersion} · {inst.loader ? `${LOADER_NAMES[inst.loader.kind]} ${inst.loader.version}` : t("instance.vanilla")}
                  </span>
                </div>
                <div className="actions">
                  <PlayButton inst={inst} />
                  {exporting && (
                    <div className="job">
                      <Progress job={exporting} />
                    </div>
                  )}
                  <button
                    ref={actionsButton}
                    className="btn btn-ghost"
                    title={t("builds.more")}
                    aria-label={t("builds.more")}
                    aria-expanded={!!actions}
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      setActions((a) => (a ? null : rect));
                    }}
                  >
                    <Glyph name="dots" />
                  </button>
                  {actions &&
                    createPortal(
                      <div
                        ref={actionsMenu}
                        className="tabs-menu"
                        role="menu"
                        style={{ position: "fixed", zIndex: 100, top: actions.bottom + 4, right: window.innerWidth - actions.right }}
                      >
                        <button className="btn btn-ghost" role="menuitem" onClick={() => (setActions(null), shortcut(inst))}>
                          <Glyph name="external-link" /> {t("builds.shortcut")}
                        </button>
                        <button className="btn btn-ghost" role="menuitem" onClick={() => (setActions(null), duplicate(inst))}>
                          <Glyph name="copy" /> {t("builds.duplicate")}
                        </button>
                        <button className="btn btn-ghost" role="menuitem" onClick={() => (setActions(null), saveTemplate(inst))}>
                          <Glyph name="device-floppy" /> {t("builds.saveTemplate")}
                        </button>
                        <button className="btn btn-ghost" role="menuitem" disabled={!!exporting} onClick={() => (setActions(null), exportPack(inst))}>
                          <Glyph name="file-export" /> {t("builds.export")}
                        </button>
                        <button className="btn btn-danger" role="menuitem" onClick={() => (confirmDelete === inst.id && setActions(null), remove(inst))}>
                          <Glyph name="trash" /> {confirmDelete === inst.id ? t("instance.deleteConfirm") : t("instance.delete")}
                        </button>
                      </div>,
                      document.body,
                    )}
                </div>
              </header>
              <LaunchError instanceId={inst.id} onAccounts={onAccounts} />
              <div className="tabs-row">
                <div className="segmented tabs">
                  {TABS.map((k) => (
                    <button key={k} aria-pressed={tab === k} onClick={() => setTab(k)}>
                      {t(TAB_LABELS[k])}
                      {k === "content" && broken > 0 && <span className="tab-alert" title={t("conflicts.title")}>{broken}</span>}
                    </button>
                  ))}
                </div>
                <div className="tabs-more" onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setMore(false)}>
                  <button className={MORE_TABS.includes(tab) ? "btn" : "btn btn-ghost"} aria-expanded={more} onClick={() => setMore((m) => !m)}>
                    {MORE_TABS.includes(tab) ? t(TAB_LABELS[tab]) : t("builds.more")} <Glyph name="chevron-down" />
                  </button>
                  {more && (
                    <div className="tabs-menu" role="menu">
                      {MORE_TABS.map((k) => (
                        <button key={k} className="btn btn-ghost" role="menuitem" onClick={() => (setTab(k), setMore(false))}>
                          {t(TAB_LABELS[k])}
                          {k === "conflicts" && broken > 0 && <span className="tab-alert">{broken}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              {tab === "content" && (
                <InstanceContent
                  inst={inst}
                  rev={contentRev}
                  onAdd={(kind) => {
                    aimContent(inst.id);
                    onAddContent(kind);
                  }}
                />
              )}
              {tab === "conflicts" && (
                <Conflicts
                  instanceId={inst.id}
                  onFind={(query) => {
                    aimContent(inst.id, query);
                    onAddContent("mod");
                  }}
                />
              )}
              {tab === "worlds" && <Worlds inst={inst} />}
              {tab === "servers" && <SavedServers inst={inst} />}
              {tab === "screenshots" && <Screenshots inst={inst} />}
              {tab === "cloud" && <Cloud inst={inst} onInstalled={refresh} />}
              {tab === "settings" && (
                <>
                  <InstanceSettings key={inst.id} inst={inst} groups={groups} onSaved={refresh} />
                  <Backups inst={inst} onRestored={refresh} />
                  <Files inst={inst} />
                </>
              )}
              {tab === "performance" && (
                <>
                  <LagCheck
                    instanceId={inst.id}
                    onFind={(query) => {
                      aimContent(inst.id, query);
                      onAddContent("mod");
                    }}
                    onConflicts={() => setTab("conflicts")}
                  />
                  <section className="card">
                    <Memory inst={inst} onSaved={refresh} />
                    <p className="muted">{t(inst.loader ? "builds.presetHint" : "builds.presetVanilla")}</p>
                    {presetJob ? (
                      <div className="job">
                        <Progress job={presetJob} />
                      </div>
                    ) : (
                      <div className="segmented">
                        {PRESETS.map((p) => (
                          <button key={p} onClick={() => applyPreset(inst, p)}>
                            {t(`preset.${p}` as MessageKey)}
                          </button>
                        ))}
                      </div>
                    )}
                  </section>
                  <Metrics instanceId={inst.id} />
                </>
              )}
              {tab === "icon" && (
                <>
                  <IconPicker inst={inst} onChange={refresh} onError={setError} />
                  <CoverPicker inst={inst} hasCover={!!cover} onChange={() => setCoverRev((r) => r + 1)} onError={setError} />
                </>
              )}
            </div>
          )}
        </div>
      )}
      {dropping &&
        inst &&
        createPortal(
          <div className="drop-hint" aria-hidden>
            <Glyph name="upload" /> {t("builds.dropHere", { name: inst.name })}
          </div>,
          document.body,
        )}
    </>
  );
}

function PlayButton({ inst }: { inst: Instance }) {
  const { t } = useI18n();
  const l = useLauncher();
  const job = l.jobOf(inst.id);
  const run = l.runOf(inst.id);
  if (job) return <Progress job={job} />;
  if (run)
    return (
      <button className="btn btn-danger" onClick={() => invoke("game_stop", { runId: run.runId })}>
        <Glyph name="player-stop" /> {t("game.stop")}
      </button>
    );
  return (
    <button className="btn" onClick={() => l.play(inst)}>
      <Glyph name="player-play" /> {t("game.play")}
    </button>
  );
}

function InstanceSettings({ inst, groups, onSaved }: { inst: Instance; groups: string[]; onSaved: () => void }) {
  const { t } = useI18n();
  const [name, setName] = useState(inst.name);
  const [choice, setChoice] = useState<VersionChoice>({
    mc: inst.mcVersion,
    loader: inst.loader?.kind ?? null,
    build: inst.loader?.version ?? "",
  });
  const [java, setJava] = useState(inst.javaPath ?? "");
  const [jvmArgs, setJvmArgs] = useState(inst.jvmArgs ?? "");
  const [gpu, setGpu] = useState(inst.gpu);
  const [client, setClient] = useState(!inst.noClient);
  const [group, setGroup] = useState(inst.group ?? "");
  const [width, setWidth] = useState(inst.resolution ? String(inst.resolution.width) : "");
  const [height, setHeight] = useState(inst.resolution ? String(inst.resolution.height) : "");
  const [status, setStatus] = useState<{ error: boolean; text: string } | null>(null);

  const submit = () => {
    setStatus(null);
    const num = (s: string) => (s.trim() ? Number(s) : null);
    const [w, h] = [num(width), num(height)];
    invoke<Instance>("instance_update", {
      id: inst.id,
      settings: {
        name,
        mcVersion: choice.mc,
        loader: choice.loader ? { kind: choice.loader, version: choice.build } : null,
        memoryMb: inst.memoryMb,
        javaPath: java,
        jvmArgs,
        gpu,
        group,
        noClient: !client,
        resolution: w && h ? { width: w, height: h } : null,
      },
    }).then(
      () => (setStatus({ error: false, text: t("builds.saved") }), onSaved()),
      (e) => setStatus({ error: true, text: String(e) }),
    );
  };

  return (
    <section className="card">
      <div className="field">
        <span>{t("instance.name")}</span>
        <input className="input" value={name} onChange={(e) => setName(e.currentTarget.value)} />
      </div>
      <div className="field">
        <span>{t("builds.group")}</span>
        <input className="input" list="instance-groups" value={group} maxLength={32} placeholder={t("builds.ungrouped")} onChange={(e) => setGroup(e.currentTarget.value)} />
        <datalist id="instance-groups">
          {groups.map((g) => (
            <option key={g} value={g} />
          ))}
        </datalist>
      </div>
      <VersionPicker value={choice} onChange={setChoice} />
      <h3>{t("builds.launch")}</h3>
      <Memory inst={inst} onSaved={onSaved} />
      <div className="field">
        <span>{t("java.title")}</span>
        <input className="input" value={java} placeholder={t("builds.auto")} onChange={(e) => setJava(e.currentTarget.value)} />
      </div>
      <div className="field">
        <span>{t("builds.jvmArgs")}</span>
        <input className="input" value={jvmArgs} placeholder="-Dfoo=bar" onChange={(e) => setJvmArgs(e.currentTarget.value)} />
      </div>
      {choice.loader && choice.loader !== "legacyfabric" && choice.loader !== "ornithe" && (
        <div className="field">
          <span>{t("builds.client")}</span>
          <div className="segmented wrap">
            {[true, false].map((on) => (
              <button key={String(on)} aria-pressed={client === on} onClick={() => setClient(on)}>
                {t(on ? "builds.clientOn" : "builds.clientOff")}
              </button>
            ))}
          </div>
          <span className="muted small">{t("builds.clientHint")}</span>
        </div>
      )}
      <RendererChoice inst={inst} />
      {!navigator.userAgent.includes("Mac") && (
        <div className="field">
          <span>{t("builds.gpu")}</span>
          <div className="segmented wrap">
            {([null, "discrete", "integrated"] as const).map((g) => (
              <button key={g ?? "auto"} aria-pressed={gpu === g} onClick={() => setGpu(g)}>
                {t(g === "discrete" ? "builds.gpuDiscrete" : g === "integrated" ? "builds.gpuIntegrated" : "builds.gpuSystem")}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="field">
        <span>{t("builds.window")}</span>
        <div className="resolution">
          <input className="input" inputMode="numeric" value={width} placeholder="854" onChange={(e) => setWidth(e.currentTarget.value)} />
          <span className="muted">×</span>
          <input className="input" inputMode="numeric" value={height} placeholder="480" onChange={(e) => setHeight(e.currentTarget.value)} />
        </div>
      </div>
      {status && <p className={status.error ? "error" : "muted"}>{status.text}</p>}
      <div className="actions">
        <button className="btn" disabled={!versionReady(choice)} onClick={submit}>
          <Glyph name="device-floppy" /> {t("builds.save")}
        </button>
      </div>
    </section>
  );
}

async function toIcon(file: Blob) {
  const img = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const g = canvas.getContext("2d")!;
  const k = Math.min(64 / img.width, 64 / img.height);
  g.imageSmoothingEnabled = k < 1;
  const [w, h] = [img.width * k, img.height * k];
  g.drawImage(img, (64 - w) / 2, (64 - h) / 2, w, h);
  return canvas.toDataURL("image/png");
}

function RendererChoice({ inst }: { inst: Instance }) {
  const { t } = useI18n();
  const [vulkan, setVulkan] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = () => invoke<boolean>("renderer_get", { instanceId: inst.id }).then(setVulkan, () => setVulkan(false));
  const jobs = useJobs("renderer-", (_, e) => (setError(e), load()));
  useEffect(() => {
    load();
  }, [inst.id]);
  if (inst.loader?.kind !== "fabric" && inst.loader?.kind !== "quilt") return null;
  const job = jobs.jobs[`renderer-${inst.id}`];
  const pick = (on: boolean) => {
    setError(null);
    invoke<number>("renderer_set", { instanceId: inst.id, vulkan: on }).then(
      (id) => jobs.started(`renderer-${inst.id}`, id),
      (e) => setError(String(e)),
    );
  };
  return (
    <div className="field">
      <span>{t("builds.renderer")}</span>
      {job ? (
        <div className="job">
          <Progress job={job} />
        </div>
      ) : (
        <div className="segmented wrap">
          <button aria-pressed={vulkan === false} disabled={vulkan === null} onClick={() => vulkan && pick(false)}>
            OpenGL
          </button>
          <button aria-pressed={vulkan === true} disabled={vulkan === null} onClick={() => !vulkan && pick(true)}>
            {t("builds.rendererVulkan")}
          </button>
        </div>
      )}
      <span className="muted">{t("builds.rendererHint")}</span>
      {error && <span className="error">{error}</span>}
    </div>
  );
}

async function toCover(file: Blob) {
  const img = await createImageBitmap(file);
  const k = Math.min(1, 1280 / img.width, 480 / img.height);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * k);
  canvas.height = Math.round(img.height * k);
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.85);
}

function CoverPicker({ inst, hasCover, onChange, onError }: { inst: Instance; hasCover: boolean; onChange: () => void; onError: (e: string) => void }) {
  const { t } = useI18n();
  const set = (cover: string | null) => invoke("instance_set_cover", { id: inst.id, cover }).then(onChange, (e) => onError(String(e)));
  return (
    <section className="card">
      <h3>{t("builds.cover")}</h3>
      <div className="actions">
        <label className="btn btn-ghost">
          <Glyph name="upload" /> {t("builds.coverUpload")}
          <input
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            hidden
            onChange={(e) => {
              const file = e.currentTarget.files?.[0];
              e.currentTarget.value = "";
              if (file) toCover(file).then(set, (err) => onError(String(err)));
            }}
          />
        </label>
        {hasCover && (
          <button className="btn btn-ghost" onClick={() => set(null)}>
            <Glyph name="trash" /> {t("builds.coverRemove")}
          </button>
        )}
      </div>
    </section>
  );
}

function IconPicker({ inst, onChange, onError }: { inst: Instance; onChange: () => void; onError: (e: string) => void }) {
  const { t } = useI18n();
  const set = (icon: string | null) => invoke("instance_set_icon", { id: inst.id, icon }).then(onChange, (e) => onError(String(e)));
  return (
    <section className="card icon-picker">
      <InstanceIcon inst={inst} size={56} />
      <div className="icon-choices">
        {PIXEL_ICONS.map((id) => (
          <button key={id} className="icon-choice" aria-pressed={inst.icon === pixelIcon(id)} aria-label={id} title={id} onClick={() => set(pixelIcon(id))}>
            <img className="pixel-icon" src={pixelIcon(id)} width={32} height={32} alt="" />
          </button>
        ))}
        <label className="btn btn-ghost">
          <Glyph name="upload" /> {t("builds.iconUpload")}
          <input
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            hidden
            onChange={(e) => {
              const file = e.currentTarget.files?.[0];
              e.currentTarget.value = "";
              if (file) toIcon(file).then(set, (err) => onError(String(err)));
            }}
          />
        </label>
        {inst.icon && (
          <button className="btn btn-ghost" onClick={() => set(null)}>
            <Glyph name="rotate" /> {t("builds.iconReset")}
          </button>
        )}
      </div>
    </section>
  );
}

type Duplicate = { kind: string; id: string; name: string | null; files: string[] };

const FOLDERS: { folder: string; kind: Kind }[] = [
  { folder: "mods", kind: "mod" },
  { folder: "resourcepacks", kind: "resourcepack" },
  { folder: "shaderpacks", kind: "shader" },
];

function InstanceContent({ inst, rev, onAdd }: { inst: Instance; rev: number; onAdd: (kind: Kind) => void }) {
  const { t } = useI18n();
  const [files, setFiles] = useState<Installed[]>([]);
  const [tab, setTab] = useState(FOLDERS[0]);
  const [query, setQuery] = useState(() => {
    try {
      const q = sessionStorage.getItem(MOD_QUERY_KEY) ?? "";
      sessionStorage.removeItem(MOD_QUERY_KEY);
      return q;
    } catch {
      return "";
    }
  });
  const [packsRev, setPacksRev] = useState(0);
  const [dupes, setDupes] = useState<Duplicate[]>([]);
  const refresh = () => {
    setPacksRev((r) => r + 1);
    invoke<Duplicate[]>("content_conflicts", { instanceId: inst.id }).then((c) => setDupes(c.filter((x) => x.kind === "duplicate")), () => setDupes([]));
    return invoke<Installed[]>("content_list", { instanceId: inst.id }).then(setFiles, () => setFiles([]));
  };
  const others = useLauncher().instances.filter((i) => i.id !== inst.id && i.loader);
  const [copyError, setCopyError] = useState<string | null>(null);
  const copies = useJobs("copymods-", (_, e) => {
    setCopyError(e);
    refresh();
  });
  const copyJob = copies.jobs[`copymods-${inst.id}`];
  const copyFrom = (fromId: string) => {
    setCopyError(null);
    invoke<number>("content_copy_mods", { instanceId: inst.id, fromId }).then(
      (id) => copies.started(`copymods-${inst.id}`, id),
      (e) => setCopyError(String(e)),
    );
  };
  const keepOnly = (d: Duplicate, keep: string) =>
    Promise.all(d.files.filter((f) => f !== keep).map((file) => invoke("content_remove", { instanceId: inst.id, folder: "mods", file }))).finally(refresh);
  const q = query.trim().toLowerCase();
  const shown = files.filter((x) => x.folder === tab.folder && (!q || x.title.toLowerCase().includes(q) || x.file.toLowerCase().includes(q)));
  useEffect(() => {
    refresh().then(() => invoke<number>("content_identify", { instanceId: inst.id })).then((n) => {
      if (n) refresh();
    }, () => {});
  }, [inst.id, rev]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F5") {
        e.preventDefault();
        refresh();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [inst.id]);

  return (
    <section className="card">
      <div className="card-head">
        <div className="segmented">
          {FOLDERS.map((f) => (
            <button key={f.folder} aria-pressed={tab.folder === f.folder} onClick={() => setTab(f)}>
              {t(`content.tab.${f.kind}` as MessageKey)} · {files.filter((x) => x.folder === f.folder).length}
            </button>
          ))}
        </div>
        <div className="actions">
          <FolderButton inst={inst} folder={tab.folder} />
          {tab.folder === "mods" && inst.loader && others.length > 0 && (
            <Select value={t("builds.copyMods")} disabled={!!copyJob} options={others.map((i) => ({ value: i.id, label: `${i.name} · ${i.mcVersion}` }))} onChange={copyFrom} />
          )}
          <button className="btn" onClick={() => onAdd(tab.kind)}>
            <Glyph name="plus" /> {t("builds.add")}
          </button>
        </div>
      </div>
      <input
        data-search
        className="input content-filter"
        placeholder={t("builds.filter")}
        aria-label={t("builds.filter")}
        value={query}
        onChange={(e) => setQuery(e.currentTarget.value)}
      />
      {tab.folder === "mods" &&
        dupes.map((d) => (
          <div key={d.id} className="dupe-warning">
            <p>
              <strong>{t("dupes.title", { name: d.name ?? d.id })}</strong> {t("dupes.hint")}
            </p>
            <div className="actions">
              {d.files.map((f) => (
                <button key={f} className="btn btn-ghost" title={f} onClick={() => keepOnly(d, f)}>
                  {t("dupes.keep", { file: f })}
                </button>
              ))}
            </div>
          </div>
        ))}
      {copyJob && (
        <div className="job">
          <Progress job={copyJob} />
        </div>
      )}
      {copyError && <p className="error">{copyError}</p>}
      <ContentUpdates instanceId={inst.id} onChange={refresh} />
      <InstalledList files={shown} instanceId={inst.id} onChange={refresh} />
      {tab.folder === "mods" && <SafetyCheck instanceId={inst.id} />}
      {tab.folder === "resourcepacks" && <PackOrder instanceId={inst.id} version={packsRev} />}
    </section>
  );
}
