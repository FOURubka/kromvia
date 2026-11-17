import { useEffect, useState } from "react";
import { ModInsight } from "./ModInsight";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useI18n } from "../i18n";
import { formatBytes, type Instance } from "../lib/launcher";
import { Glyph } from "../ui/Glyph";
import { Progress } from "../ui/Progress";
import type { JobProgress } from "../lib/jobs";
import { Markdown } from "./Markdown";
import type { Kind } from "./Content";
import { Select } from "../ui/Select";

type Project = {
  id: string;
  slug: string;
  title: string;
  description: string;
  body: string;
  icon_url: string | null;
  gallery: { url: string; title: string | null }[];
  source_url: string | null;
  issues_url: string | null;
  wiki_url: string | null;
  downloads: number;
  followers: number;
};
type Version = { id: string; version_number: string; name: string; version_type: string; date_published: string; game_versions: string[]; loaders: string[] };
type Plan = { files: { projectId: string; title: string; versionNumber: string; file: string; size: number }[]; conflicts: string[] };
type World = { folder: string; name: string };

export function ProjectPage({
  projectId,
  kind,
  inst,
  job,
  installed,
  onInstall,
  onBack,
}: {
  projectId: string;
  kind: Kind;
  inst: Instance | undefined;
  job: JobProgress | undefined;
  installed: boolean;
  onInstall: (versionId: string | null, world: string | null) => void;
  onBack: () => void;
}) {
  const { t } = useI18n();
  const [project, setProject] = useState<Project | null>(null);
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [version, setVersion] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [worlds, setWorlds] = useState<World[]>([]);
  const [world, setWorld] = useState("");
  const [error, setError] = useState<string | null>(null);
  const isPack = kind === "modpack";

  useEffect(() => {
    invoke<Project>("content_project", { projectId }).then(setProject, (e) => setError(String(e)));
    invoke<Version[]>("content_versions", { projectId, kind, instanceId: isPack ? null : inst?.id ?? null }).then(
      (list) => {
        setVersions(list);
        setVersion((list.find((v) => v.version_type === "release") ?? list[0])?.id ?? "");
      },
      (e) => setError(String(e)),
    );
  }, [projectId, inst?.id]);

  useEffect(() => {
    if (kind !== "datapack" || !inst) return;
    invoke<World[]>("world_list", { instanceId: inst.id }).then((w) => {
      setWorlds(w);
      setWorld(w[0]?.folder ?? "");
    }, () => setWorlds([]));
  }, [kind, inst?.id]);

  useEffect(() => {
    setPlan(null);
    if (!inst || !version || isPack || kind === "datapack") return;
    invoke<Plan>("content_plan", { instanceId: inst.id, projectId, versionId: version, kind }).then(setPlan, (e) => setError(String(e)));
  }, [version, inst?.id]);

  const links = project ? ([["source", project.source_url], ["issues", project.issues_url], ["wiki", project.wiki_url]] as const).filter(([, u]) => u) : [];
  const canInstall = !!version && (kind !== "datapack" || !!world) && !(plan && plan.conflicts.length);

  return (
    <section className="card project-page">
      <button className="btn btn-ghost" onClick={onBack}>
        <Glyph name="chevron-left" /> {t("content.back")}
      </button>
      {error && <p className="error">{error}</p>}
      {project && (
        <>
          <header className="project-head">
            {project.icon_url ? <img className="hit-icon" src={project.icon_url} alt="" /> : <div className="hit-icon" />}
            <div className="list-main">
              <h2>{project.title}</h2>
              <span className="muted">{project.description}</span>
              <span className="muted">
                {t("content.stats", { downloads: project.downloads.toLocaleString(), followers: project.followers.toLocaleString() })}
              </span>
            </div>
            <div className="actions">
              {links.map(([k, u]) => (
                <button key={k} className="btn btn-ghost" onClick={() => openUrl(u!)}>
                  <Glyph name="external-link" /> {t(`content.link.${k}`)}
                </button>
              ))}
              <button className="btn btn-ghost" onClick={() => openUrl(`https://modrinth.com/project/${project.slug}`)}>
                <Glyph name="external-link" /> Modrinth
              </button>
            </div>
          </header>

          {kind === "mod" && inst && <ModInsight instanceId={inst.id} projectId={projectId} />}
          <div className="project-install">
            {versions === null ? (
              <span className="muted">{t("common.loading")}</span>
            ) : versions.length === 0 ? (
              <span className="muted">{t("content.noVersions")}</span>
            ) : (
              <>
                <label className="field">
                  <span>{t("content.version")}</span>
                  <Select
                    value={version}
                    options={versions.map((v) => ({
                      value: v.id,
                      label: `${v.name || v.version_number} · ${v.version_type} · ${v.game_versions.slice(-3).join(", ")} · ${v.date_published.slice(0, 10)}`,
                    }))}
                    onChange={setVersion}
                  />
                </label>
                {kind === "datapack" && (
                  <label className="field">
                    <span>{t("content.world")}</span>
                    {worlds.length === 0 ? (
                      <span className="muted">{t("content.noWorlds")}</span>
                    ) : (
                      <Select value={world} options={worlds.map((w) => ({ value: w.folder, label: w.name }))} onChange={setWorld} />
                    )}
                  </label>
                )}
                {plan && (
                  <div className="field">
                    <span>{t("content.willInstall")}</span>
                    <ul className="rows compact">
                      {plan.files.map((f) => (
                        <li key={f.file} className="row plain">
                          <div className="list-main">
                            <span>
                              {f.title} <span className="muted">{f.versionNumber}</span>
                            </span>
                            <span className="path muted">{f.file}</span>
                          </div>
                          <span className="muted">{formatBytes(f.size)}</span>
                        </li>
                      ))}
                    </ul>
                    {plan.files.length === 0 && <span className="muted">{t("content.alreadyThere")}</span>}
                    {plan.conflicts.map((c) => (
                      <span key={c} className="error">
                        {t("content.conflict", { pair: c })}
                      </span>
                    ))}
                  </div>
                )}
                <div className="actions">
                  {job ? (
                    <div className="job">
                      <Progress job={job} />
                    </div>
                  ) : installed ? (
                    <span className="muted">{isPack ? t("content.packCreated") : t("content.installed")}</span>
                  ) : (
                    <button className="btn" disabled={!canInstall} onClick={() => onInstall(version || null, kind === "datapack" ? world : null)}>
                      <Glyph name="download" /> {t("content.install")}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>

          {project.gallery.length > 0 && (
            <div className="gallery">
              {project.gallery.map((g) => (
                <img key={g.url} src={g.url} alt={g.title ?? ""} loading="lazy" onClick={() => openUrl(g.url)} />
              ))}
            </div>
          )}
          <Markdown source={project.body} />
        </>
      )}
    </section>
  );
}
