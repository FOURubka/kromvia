import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { useI18n } from "../i18n";
import type { MessageKey } from "../i18n/en";
import { useJobs } from "../lib/jobs";
import { Progress } from "../ui/Progress";
import { describe, type Instance } from "../lib/launcher";
import { Glyph } from "../ui/Glyph";
import { Pager, usePaged } from "../ui/Pager";
import { Empty } from "../ui/Empty";
import { ProjectPage } from "./ProjectPage";
import { Select } from "../ui/Select";

export type Kind = "mod" | "modpack" | "resourcepack" | "shader" | "datapack";
type Source = "modrinth" | "curseforge";
const SOURCES: [Source, string][] = [
  ["modrinth", "Modrinth"],
  ["curseforge", "CurseForge"],
];
type Tab = Kind | "installed";
type Hit = {
  project_id: string;
  slug: string;
  title: string;
  description: string;
  icon_url: string | null;
  downloads: number;
  author: string;
  follows: number;
  date_modified: string;
};
type Category = { id: string; name: string };
type Sort = "relevance" | "downloads" | "follows" | "newest" | "updated";
const SORTS: Sort[] = ["relevance", "downloads", "follows", "newest", "updated"];
const LOADERS: [string, string][] = [
  ["fabric", "Fabric"],
  ["forge", "Forge"],
  ["neoforge", "NeoForge"],
  ["quilt", "Quilt"],
];
export type Installed = { folder: string; file: string; enabled: boolean; title: string; projectId: string | null; size: number; modified: number; locked: boolean };

const TABS: Tab[] = ["mod", "modpack", "resourcepack", "shader", "datapack", "installed"];
const TARGET_KEY = "kromvia.contentTarget";

export function aimContent(instanceId: string, query?: string) {
  try {
    localStorage.setItem(TARGET_KEY, instanceId);
    if (query) sessionStorage.setItem(QUERY_KEY, query);
  } catch {}
}

const QUERY_KEY = "kromvia.contentQuery";

function takeQuery() {
  try {
    const q = sessionStorage.getItem(QUERY_KEY) ?? "";
    sessionStorage.removeItem(QUERY_KEY);
    return q;
  } catch {
    return "";
  }
}

function savedTarget() {
  try {
    return localStorage.getItem(TARGET_KEY);
  } catch {
    return null;
  }
}

export function Content({ initialTab = "mod" }: { initialTab?: Tab }) {
  const { t } = useI18n();
  const [instances, setInstances] = useState<Instance[]>([]);
  const [target, setTarget] = useState<string | null>(savedTarget);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [source, setSource] = useState<Source>("modrinth");
  const [query, setQuery] = useState(takeQuery);
  const [hits, setHits] = useState<Hit[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState<Set<string>>(new Set());
  const [installed, setInstalled] = useState<Installed[]>([]);
  const [open, setOpen] = useState<Hit | null>(null);
  const [asking, setAsking] = useState<{ hit: Hit; versionId: string | null } | null>(null);
  const [sort, setSort] = useState<Sort>("relevance");
  const [cats, setCats] = useState<string[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [gameVersion, setGameVersion] = useState("");
  const [loader, setLoader] = useState("");
  const [mcVersions, setMcVersions] = useState<string[]>([]);
  const [popular, setPopular] = useState<Hit[]>([]);
  const curseforgeAllowed = tab !== "datapack";
  const from: Source = curseforgeAllowed ? source : "modrinth";

  const inst = instances.find((i) => i.id === target) ?? instances[0];
  const needsLoader = (tab === "mod" || tab === "shader") && inst && !inst.loader;

  const setError = (key: string, error: string | null) =>
    setErrors(({ [key]: _, ...rest }) => (error ? { ...rest, [key]: error } : rest));
  const onFinished = (key: string, error: string | null) => {
    setError(key, error);
    if (!error) setDone((d) => new Set(d).add(key));
    if (inst) refreshInstalled(inst.id);
    invoke<Instance[]>("instance_list").then(setInstances);
  };
  const content = useJobs("content-", onFinished);
  const modpacks = useJobs("modpack-", onFinished);

  const refreshInstalled = (id: string) => invoke<Installed[]>("content_list", { instanceId: id }).then(setInstalled, () => setInstalled([]));

  useEffect(() => {
    invoke<Instance[]>("instance_list").then(setInstances);
  }, []);

  useEffect(() => {
    if (inst) refreshInstalled(inst.id);
  }, [inst?.id]);

  const filters = (sortBy: Sort) => ({
    sort: sortBy,
    categories: cats,
    game_version: tab === "modpack" && gameVersion ? gameVersion : null,
    loader: tab === "modpack" && loader ? loader : null,
  });
  const request = (offset: number, sortBy: Sort, q: string) =>
    invoke<{ hits: Hit[]; total_hits: number }>("content_search", {
      query: q,
      kind: tab,
      instanceId: tab === "modpack" ? null : inst?.id ?? null,
      offset,
      source: from,
      filters: filters(sortBy),
    });

  const search = (page: number) => {
    if (tab === "installed" || needsLoader) return;
    setLoading(true);
    setPage(page);
    request(page * SEARCH_PAGE, sort, query).then(
      (r) => {
        setHits(r.hits);
        setTotal(r.total_hits);
        setError("search", null);
      },
      (e) => setError("search", String(e)),
    ).finally(() => setLoading(false));
  };

  useEffect(() => {
    const timer = setTimeout(() => search(0), 300);
    return () => clearTimeout(timer);
  }, [query, tab, inst?.id, source, sort, cats, gameVersion, loader]);

  useEffect(() => {
    setPopular([]);
    if (tab === "installed" || needsLoader) return;
    let live = true;
    request(0, "downloads", "").then((r) => live && setPopular(r.hits.slice(0, 7)), () => {});
    return () => {
      live = false;
    };
  }, [tab, inst?.id, source, cats, gameVersion, loader]);

  useEffect(() => {
    setOpen(null);
    setCats([]);
    setCategories([]);
    if (tab === "installed") return;
    invoke<Category[]>("content_categories", { kind: tab, source: from }).then(setCategories, () => {});
  }, [tab, source]);

  useEffect(() => {
    if (tab !== "modpack" || mcVersions.length) return;
    invoke<{ id: string; type: string }[]>("mc_versions").then((v) => setMcVersions(v.filter((x) => x.type === "release").map((x) => x.id)), () => {});
  }, [tab]);

  const toggleCat = (id: string) => setCats((c) => (c.includes(id) ? c.filter((x) => x !== id) : c.length < 10 ? [...c, id] : c));

  const pickTarget = (id: string) => {
    setTarget(id);
    try {
      localStorage.setItem(TARGET_KEY, id);
    } catch {}
  };

  const install = (hit: Hit, versionId: string | null = null, world: string | null = null, into = inst) => {
    const isPack = tab === "modpack";
    const key = isPack ? `modpack-${hit.project_id}` : `content-${into!.id}-${hit.project_id}`;
    setError(key, null);
    const call = isPack
      ? invoke<number>("modpack_install", { projectId: hit.project_id, source: from })
      : invoke<number>("content_install", { instanceId: into!.id, projectId: hit.project_id, kind: tab, source: from, versionId, world });
    call.then(
      (id) => (isPack ? modpacks : content).started(key, id),
      (e) => setError(key, String(e)),
    );
  };

  const askInstall = (hit: Hit, versionId: string | null = null, world: string | null = null) => {
    if (tab === "modpack" || tab === "datapack" || instances.length < 2) install(hit, versionId, world);
    else setAsking({ hit, versionId });
  };

  const installInto = (i: Instance) => {
    const a = asking!;
    setAsking(null);
    pickTarget(i.id);
    install(a.hit, i.id === inst?.id ? a.versionId : null, null, i);
  };

  const installedIds = new Set(installed.map((f) => f.projectId).filter(Boolean));

  const keyOf = (hit: Hit) => (tab === "modpack" ? `modpack-${hit.project_id}` : `content-${inst?.id}-${hit.project_id}`);
  const action = (hit: Hit, compact: boolean) => {
    const key = keyOf(hit);
    const job = (tab === "modpack" ? modpacks : content).jobs[key];
    const have = tab !== "modpack" && installedIds.has(hit.project_id);
    const label = tab === "datapack" ? t("content.pickWorld") : t("content.install");
    if (job)
      return (
        <div className="job">
          <Progress job={job} />
        </div>
      );
    if (have || done.has(key))
      return (
        <span className="muted got">
          <Glyph name="check" size={14} /> {compact ? "" : tab === "modpack" ? t("content.packCreated") : t("content.installed")}
        </span>
      );
    return (
      <button
        className="btn btn-get"
        title={compact ? label : undefined}
        aria-label={compact ? label : undefined}
        onClick={() => (tab === "datapack" ? setOpen(hit) : askInstall(hit))}
      >
        <Glyph name="download" /> {!compact && label}
      </button>
    );
  };

  return (
    <>
      <div className="page-head">
        <h1 className="page-title">{t("nav.content")}</h1>
        {tab !== "installed" && !open && (
          <div className="segmented source-pick">
            {SOURCES.filter(([s]) => curseforgeAllowed || s === "modrinth").map(([s, name]) => (
              <button key={s} aria-pressed={from === s} onClick={() => setSource(s)}>
                {name}
              </button>
            ))}
          </div>
        )}
        {instances.length > 0 && (
          <label className="nick">
            <span className="muted">{t("content.target")}</span>
            <Select value={inst?.id ?? ""} options={instances.map((i) => ({ value: i.id, label: i.name }))} onChange={pickTarget} />
          </label>
        )}
      </div>

      <div className="content-bar">
        <div className="segmented tabs content-tabs">
          {TABS.map((k) => (
            <button key={k} aria-pressed={tab === k} onClick={() => setTab(k)}>
              {t(`content.tab.${k}` as MessageKey)}
            </button>
          ))}
        </div>
        {tab !== "installed" && !open && !needsLoader && (inst || tab === "modpack") && (
          <label className="search-box">
            <Glyph name="search" size={14} />
            <input
              className="input search"
              data-search
              value={query}
              placeholder={t(from === "curseforge" ? "content.searchCurseforge" : "content.search")}
              onChange={(e) => setQuery(e.currentTarget.value)}
            />
          </label>
        )}
      </div>

      {!inst && tab !== "modpack" ? (
        <p className="muted">{t("content.noInstance")}</p>
      ) : tab === "installed" ? (
        <InstalledList files={installed} instanceId={inst!.id} onChange={() => refreshInstalled(inst!.id)} />
      ) : needsLoader ? (
        <p className="muted">{t("content.needsLoader")}</p>
      ) : open ? (
        (() => {
          const key = tab === "modpack" ? `modpack-${open.project_id}` : `content-${inst?.id}-${open.project_id}`;
          return (
            <>
              {errors[key] && <p className="error">{errors[key]}</p>}
              <ProjectPage
                projectId={open.project_id}
                kind={tab}
                inst={inst}
                job={(tab === "modpack" ? modpacks : content).jobs[key]}
                installed={(tab !== "modpack" && tab !== "datapack" && installedIds.has(open.project_id)) || done.has(key)}
                onInstall={(versionId, world) => askInstall(open, versionId, world)}
                onBack={() => setOpen(null)}
              />
            </>
          );
        })()
      ) : (
        <div className="browse">
          <aside className="filters">
            <h2>{t("content.filters")}</h2>
            <section>
              <h3>{t("content.filter.version")}</h3>
              {tab === "modpack" ? (
                <Select
                  value={gameVersion}
                  options={[{ value: "", label: t("content.filter.any") }, ...mcVersions.map((v) => ({ value: v, label: v }))]}
                  onChange={setGameVersion}
                />
              ) : (
                <span className="filter-lock" title={t("content.filter.fromBuild", { name: inst!.name })}>
                  {inst!.mcVersion}
                </span>
              )}
            </section>
            {(tab === "modpack" || tab === "mod") && (
              <section>
                <h3>{t("content.filter.loader")}</h3>
                {tab === "modpack" ? (
                  <div className="filter-list">
                    {[["", t("content.filter.any")], ...LOADERS].map(([id, name]) => (
                      <label key={id} className="check">
                        <input type="radio" name="loader" checked={loader === id} onChange={() => setLoader(id)} />
                        {name}
                      </label>
                    ))}
                  </div>
                ) : (
                  <span className="filter-lock" title={t("content.filter.fromBuild", { name: inst!.name })}>
                    {inst!.loader ? describe(inst!, t("instance.vanilla")) : t("instance.vanilla")}
                  </span>
                )}
              </section>
            )}
            {categories.length > 0 && (
              <section>
                <h3>
                  {t("content.filter.categories")}
                  {cats.length > 0 && (
                    <button className="link filter-clear" onClick={() => setCats([])}>
                      {t("content.filter.clear")}
                    </button>
                  )}
                </h3>
                <div className="filter-list scroll">
                  {categories.map((c) => (
                    <label key={c.id} className="check">
                      <input type="checkbox" checked={cats.includes(c.id)} onChange={() => toggleCat(c.id)} />
                      {c.name}
                    </label>
                  ))}
                </div>
              </section>
            )}
          </aside>

          <div className="browse-main">
            <div className="browse-tools">
              <Select value={sort} options={SORTS.map((s) => ({ value: s, label: t(`content.sort.${s}` as MessageKey) }))} onChange={(v) => setSort(v as Sort)} />
              <span className="muted results">{t("content.results", { count: total.toLocaleString() })}</span>
              <Pager page={page} pages={Math.ceil(total / SEARCH_PAGE)} onPage={search} />
            </div>

            {!query.trim() && page === 0 && popular.length > 0 && (
              <section className="popular">
                <h3>{t("content.popular")}</h3>
                <ol>
                  {popular.map((hit, i) => (
                    <li key={hit.project_id} className="pop-card">
                      {hit.icon_url && <img className="pop-glow" src={hit.icon_url} alt="" aria-hidden />}
                      <span className="pop-rank">#{i + 1}</span>
                      {hit.icon_url ? <img className="hit-icon" src={hit.icon_url} alt="" loading="lazy" /> : <div className="hit-icon" />}
                      <button className="link pop-title" disabled={from !== "modrinth"} onClick={() => setOpen(hit)}>
                        {hit.title}
                      </button>
                      <span className="muted pop-stat">
                        <Glyph name="download" size={12} /> {formatCount(hit.downloads)}
                      </span>
                      {action(hit, true)}
                    </li>
                  ))}
                </ol>
              </section>
            )}

            {errors.search && <Empty bee="offline">{errors.search}</Empty>}
            {!loading && !errors.search && query.trim() && hits.length === 0 && <Empty bee="not-found">{t("content.noResults")}</Empty>}
            <ul className="hits">
              {hits.map((hit) => {
                const key = keyOf(hit);
                return (
                  <li key={hit.project_id} className="row plain hit">
                    {hit.icon_url ? <img className="hit-icon" src={hit.icon_url} alt="" loading="lazy" /> : <div className="hit-icon" />}
                    <div className="list-main">
                      <span className="hit-head">
                        {from === "modrinth" ? (
                          <button className="link hit-title" onClick={() => setOpen(hit)}>
                            {hit.title}
                          </button>
                        ) : (
                          <span className="hit-title">{hit.title}</span>
                        )}
                        <span className="muted hit-author">{t("content.by", { author: hit.author })}</span>
                      </span>
                      <span className="muted hit-desc">{hit.description}</span>
                      {errors[key] && <span className="error">{errors[key]}</span>}
                    </div>
                    <div className="hit-side">
                      {action(hit, false)}
                      <span className="muted hit-stats">
                        <span>
                          <Glyph name="download" size={12} /> {formatCount(hit.downloads)}
                        </span>
                        {hit.follows > 0 && (
                          <span>
                            <Glyph name="heart" size={12} /> {formatCount(hit.follows)}
                          </span>
                        )}
                        {hit.date_modified && (
                          <span>
                            <Glyph name="refresh" size={12} /> {formatDate(hit.date_modified)}
                          </span>
                        )}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
            {loading && <p className="muted">{t("common.loading")}</p>}
            <Pager page={page} pages={Math.ceil(total / SEARCH_PAGE)} onPage={search} />
          </div>
        </div>
      )}

      {asking &&
        createPortal(
          <div className="overlay" role="dialog" aria-modal="true" aria-label={t("content.target")} onClick={() => setAsking(null)}>
            <section className="card onboarding" onClick={(e) => e.stopPropagation()}>
              <h2>
                {t("content.target")} · {asking.hit.title}
              </h2>
              <ul className="rows compact">
                {instances.map((i) => (
                  <li key={i.id}>
                    <button className="row plain pick-instance" aria-pressed={i.id === inst?.id} onClick={() => installInto(i)}>
                      <span className="instance-name">{i.name}</span>
                      <span className="muted">{describe(i, t("instance.vanilla"))}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <div className="actions">
                <button className="btn btn-ghost" onClick={() => setAsking(null)}>
                  {t("common.cancel")}
                </button>
              </div>
            </section>
          </div>,
          document.body,
        )}
    </>
  );
}

type InstalledSort = "name" | "date" | "size";
type Show = "all" | "on" | "off";

export function InstalledList({ files, instanceId, onChange }: { files: Installed[]; instanceId: string; onChange: () => void }) {
  const { t } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<InstalledSort>("name");
  const [show, setShow] = useState<Show>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<Installed[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<Installed[]>([]);
  pendingRef.current = pending;

  const key = (f: Installed) => f.folder + "/" + f.file;
  const hidden = new Set(pending.map(key));
  const visible = files
    .filter((f) => !hidden.has(key(f)) && (show === "all" || f.enabled === (show === "on")))
    .sort((a, b) => (sort === "date" ? b.modified - a.modified : sort === "size" ? b.size - a.size : 0));
  const paged = usePaged(visible, PAGE);
  const picked = visible.filter((f) => selected.has(key(f)));

  const act = (p: Promise<unknown>) => p.then(() => (setError(null), onChange()), (e) => setError(String(e)));
  const commit = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const doomed = pendingRef.current;
    if (doomed.length === 0) return;
    setPending([]);
    act(Promise.all(doomed.map((f) => invoke("content_remove", { instanceId, folder: f.folder, file: f.file }))));
  };
  const remove = (list: Installed[]) => {
    commit();
    setSelected(new Set());
    setPending(list);
    timer.current = setTimeout(commit, 5000);
  };
  const undo = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setPending([]);
  };
  const setEnabled = (list: Installed[], enabled: boolean) =>
    act(Promise.all(list.filter((f) => f.folder === "mods" && f.enabled !== enabled).map((f) => invoke("content_set_enabled", { instanceId, file: f.file, enabled }))));
  const [copied, setCopied] = useState(false);
  const copyList = () => {
    const rows = files.filter((f) => f.folder === "mods" && f.enabled).map((f) => (f.projectId && !/^\d+$/.test(f.projectId) ? `- [${f.title}](https://modrinth.com/mod/${f.projectId})` : `- ${f.title}`));
    navigator.clipboard.writeText(rows.join("\n"));
    setCopied(true);
  };
  const toggle = (f: Installed) =>
    setSelected((s) => {
      const next = new Set(s);
      if (!next.delete(key(f))) next.add(key(f));
      return next;
    });

  useEffect(() => commit, [instanceId]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Delete" || picked.length === 0 || (e.target as HTMLElement).closest("input, textarea, select")) return;
      e.preventDefault();
      remove(picked);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (files.length === 0) return <p className="muted">{t("content.nothingInstalled")}</p>;
  const mods = files.some((f) => f.folder === "mods");
  return (
    <>
      {error && <p className="error">{error}</p>}
      <div className="installed-tools">
        <div className="segmented">
          {(["name", "date", "size"] as InstalledSort[]).map((k) => (
            <button key={k} aria-pressed={sort === k} onClick={() => setSort(k)}>
              {t(`installed.sort.${k}` as MessageKey)}
            </button>
          ))}
        </div>
        {mods && (
          <div className="segmented">
            {(["all", "on", "off"] as Show[]).map((k) => (
              <button key={k} aria-pressed={show === k} onClick={() => setShow(k)}>
                {t(`installed.show.${k}` as MessageKey)}
              </button>
            ))}
          </div>
        )}
        <button className="btn btn-ghost" onClick={() => setSelected(picked.length === visible.length ? new Set() : new Set(visible.map(key)))}>
          {t(picked.length === visible.length && visible.length > 0 ? "installed.selectNone" : "installed.selectAll")}
        </button>
        {mods && (
          <button className="btn btn-ghost" onClick={copyList}>
            <Glyph name="copy" /> {copied ? t("console.copied") : t("installed.copyList")}
          </button>
        )}
      </div>
      {picked.length > 0 && (
        <div className="installed-bulk">
          <span>{t("installed.selected", { n: String(picked.length) })}</span>
          {mods && (
            <>
              <button className="btn btn-ghost" onClick={() => setEnabled(picked, true)}>
                {t("installed.enable")}
              </button>
              <button className="btn btn-ghost" onClick={() => setEnabled(picked, false)}>
                {t("installed.disable")}
              </button>
            </>
          )}
          <button className="btn btn-danger" onClick={() => remove(picked)}>
            <Glyph name="trash" /> {t("instance.delete")}
          </button>
        </div>
      )}
      <ul className="rows compact">
        {paged.items.map((f) => (
          <li key={key(f)} className="row plain" data-selected={selected.has(key(f))} onClick={() => toggle(f)}>
            {f.folder === "mods" && (
              <input
                type="checkbox"
                checked={f.enabled}
                title={t("content.enabled")}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setEnabled([f], e.currentTarget.checked)}
              />
            )}
            <ContentIcon instanceId={instanceId} folder={f.folder} file={f.file} />
            <div className="list-main" title={`${f.title}\n${f.folder}/${f.file}`}>
              <span className={f.enabled ? "" : "muted"}>{f.title}</span>
              <span className="path muted">
                {f.folder}/{f.file}
              </span>
            </div>
            <div className="row-tools">
              <button
                className="btn btn-ghost"
                aria-pressed={f.locked}
                title={t(f.locked ? "installed.unlock" : "installed.lock")}
                aria-label={t(f.locked ? "installed.unlock" : "installed.lock")}
                onClick={(e) => (e.stopPropagation(), act(invoke("content_set_locked", { instanceId, folder: f.folder, file: f.file, locked: !f.locked })))}
              >
                <Glyph name="lock" />
              </button>
              <button
                className="btn btn-ghost"
                title={t("instance.delete")}
                aria-label={t("instance.delete")}
                onClick={(e) => (e.stopPropagation(), remove([f]))}
              >
                <Glyph name="trash" />
              </button>
            </div>
          </li>
        ))}
      </ul>
      {paged.pager}
      {pending.length > 0 &&
        createPortal(
          <div className="undo-toast" role="status">
            <span>{pending.length === 1 ? t("installed.removedOne", { name: pending[0].title }) : t("installed.removed", { n: String(pending.length) })}</span>
            <button className="btn btn-ghost" onClick={undo}>
              {t("installed.undo")}
            </button>
          </div>,
          document.body,
        )}
    </>
  );
}

function ContentIcon({ instanceId, folder, file }: { instanceId: string; folder: string; file: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setSrc(null);
    invoke<string | null>("content_icon", { instanceId, folder, file }).then((s) => live && setSrc(s), () => {});
    return () => {
      live = false;
    };
  }, [instanceId, folder, file]);
  return src ? <img className="content-icon" src={src} alt="" /> : <span className="content-icon" />;
}

const PAGE = 20;
const SEARCH_PAGE = 20;

function formatDate(iso: string) {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatCount(n: number) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}K`;
  return String(n);
}
