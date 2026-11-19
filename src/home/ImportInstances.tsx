import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useI18n } from "../i18n";
import { useJobs } from "../lib/jobs";
import { LOADER_NAMES, type Instance } from "../lib/launcher";
import { ModelIcon } from "../art/ModelIcon";
import { Glyph } from "../ui/Glyph";
import { Progress } from "../ui/Progress";

type Found = { source: keyof typeof SOURCES; path: string; name: string; mcVersion: string; loader: Instance["loader"] };

const SOURCES = {
  prism: "Prism",
  modrinth: "Modrinth",
  curseforge: "CurseForge",
  vanilla: "Minecraft Launcher",
  atlauncher: "ATLauncher",
  gdlauncher: "GDLauncher",
  tlauncher: "TLauncher",
  sklauncher: "SKLauncher",
  minecraft: ".minecraft",
  folder: "Folder",
};

export function ImportInstances({ onImported, onClose }: { onImported: () => void; onClose: () => void }) {
  const { t } = useI18n();
  const [found, setFound] = useState<Found[] | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [pickEmpty, setPickEmpty] = useState(false);
  const [packError, setPackError] = useState<string | null>(null);
  const packs = useJobs("modpack-file-", (_, error) => {
    setPackError(error);
    if (!error) onImported();
  });
  const { jobs, started } = useJobs("import-", (key, error) => {
    const path = key.slice("import-".length);
    if (error) setErrors((e) => ({ ...e, [path]: error }));
    else {
      setDone((d) => ({ ...d, [path]: true }));
      onImported();
    }
  });

  useEffect(() => {
    invoke<Found[]>("import_list").then(setFound, () => setFound([]));
  }, []);

  const pick = async () => {
    const dir = await open({ directory: true });
    if (typeof dir !== "string") return;
    const more = await invoke<Found[]>("import_scan", { path: dir }).catch(() => []);
    setPickEmpty(more.length === 0);
    setFound((cur) => [...more, ...(cur ?? []).filter((f) => !more.some((m) => m.path === f.path))]);
  };

  const pickPack = async () => {
    setPackError(null);
    const path = await open({ filters: [{ name: "Modpack", extensions: ["mrpack", "zip"] }] });
    if (typeof path !== "string") return;
    invoke<number>("modpack_import", { path }).then(
      (id) => packs.started(`modpack-file-${path}`, id),
      (e) => setPackError(String(e)),
    );
  };

  const start = (f: Found) => {
    setErrors(({ [f.path]: _, ...rest }) => rest);
    invoke<number>("import_instance", { path: f.path }).then(
      (id) => started(`import-${f.path}`, id),
      (e) => setErrors((x) => ({ ...x, [f.path]: String(e) })),
    );
  };

  const waiting = (found ?? []).filter((f) => !jobs[`import-${f.path}`] && !done[f.path]);
  const packJob = Object.values(packs.jobs)[0];

  return (
    <section className="card import">
      <div className="library-head">
        <h2 className="section-title">{t("import.title")}</h2>
        {waiting.length > 1 && (
          <button className="btn" onClick={() => waiting.forEach(start)}>
            <Glyph name="file-import" /> {t("import.all", { n: String(waiting.length) })}
          </button>
        )}
        <button className="btn btn-ghost" onClick={pickPack} disabled={!!packJob}>
          <Glyph name="package" /> {t("import.file")}
        </button>
        <button className="btn btn-ghost" onClick={pick}>
          <Glyph name="folder" /> {t("import.pick")}
        </button>
        <button className="btn btn-ghost" onClick={onClose}>
          <Glyph name="x" /> {t("common.close")}
        </button>
      </div>
      {packJob && <Progress job={packJob} />}
      {packError && <p className="error">{packError}</p>}
      {pickEmpty && <p className="error">{t("import.pickEmpty")}</p>}
      {found === null ? (
        <p className="muted">{t("import.searching")}</p>
      ) : found.length === 0 ? (
        <p className="muted">{t("import.none")}</p>
      ) : (
        <ul className="rows">
          {found.map((f) => {
            const job = jobs[`import-${f.path}`];
            return (
              <li key={f.path} className="row">
                <ModelIcon loader={f.loader?.kind ?? "vanilla"} size={36} />
                <div className="row-main">
                  <span className="row-name">
                    {f.name}
                    <span className="pill source">{SOURCES[f.source]}</span>
                  </span>
                  <small className="muted">
                    {f.loader ? `${LOADER_NAMES[f.loader.kind]} ${f.mcVersion}` : `${t("instance.vanilla")} ${f.mcVersion}`}
                  </small>
                  {errors[f.path] && <span className="error">{errors[f.path]}</span>}
                </div>
                <div className="row-action">
                  {job ? (
                    <span className="muted small">
                      {job.total ? t("import.copying", { done: String(job.done), total: String(job.total) }) : t("import.scanning")}
                    </span>
                  ) : done[f.path] ? (
                    <span className="pill live">{t("import.done")}</span>
                  ) : (
                    <button className="btn" onClick={() => start(f)}>
                      <Glyph name="file-import" /> {t("import.go")}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
