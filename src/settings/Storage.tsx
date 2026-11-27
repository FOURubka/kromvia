import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useI18n } from "../i18n";
import type { MessageKey } from "../i18n/en";
import { useJobs } from "../lib/jobs";
import { formatBytes } from "../lib/launcher";
import { Progress } from "../ui/Progress";
import { Glyph } from "../ui/Glyph";
import { Skeleton } from "../ui/Skeleton";

type Usage = {
  instances: number;
  versions: number;
  libraries: number;
  assets: number;
  runtimes: number;
  backups: number;
  temp: number;
  lastDedup: { files: number; saved: number; removed: number } | null;
};

type Location = { path: string; moved: boolean };

const ROWS = ["instances", "versions", "libraries", "assets", "runtimes", "backups", "temp"] as const;

export function Storage() {
  const { t } = useI18n();
  const [usage, setUsage] = useState<Usage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const refresh = () => invoke<Usage>("storage_usage").then(setUsage, (e) => setError(String(e)));
  const [location, setLocation] = useState<Location | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  useEffect(() => {
    refresh();
    invoke<Location>("storage_location").then(setLocation);
  }, []);

  const moves = useJobs("move", (_, e) => setError(e));
  const moving = moves.jobs.move;
  const pick = () =>
    open({ directory: true, title: t("storage.pickFolder") }).then((dir) => typeof dir === "string" && setTarget(dir));
  const move = (folder: string) => {
    setError(null);
    setTarget(null);
    invoke<number>("storage_move", { folder }).then(
      (id) => moves.started("move", id),
      (e) => setError(String(e)),
    );
  };

  const dedups = useJobs("dedup", (_, e) => {
    setError(e);
    refresh();
  });
  const job = dedups.jobs.dedup;
  const dedup = () => {
    setError(null);
    setNotice(null);
    invoke<number>("storage_dedup").then(
      (id) => dedups.started("dedup", id),
      (e) => setError(String(e)),
    );
  };
  const clearTemp = () => {
    setError(null);
    invoke<number>("storage_clear_temp").then(
      (n) => (setNotice(t("storage.cleared", { size: formatBytes(n) })), refresh()),
      (e) => setError(String(e)),
    );
  };

  const last = usage?.lastDedup;
  return (
    <section className="card">
      <h2>{t("storage.title")}</h2>
      {error && <p className="error">{error}</p>}
      {notice && <p className="muted">{notice}</p>}
      {!usage ? (
        <Skeleton rows={3} icon={false} />
      ) : (
        <dl className="stats">
          {ROWS.map((k) => (
            <div key={k} className="stat">
              <dt>{t(`storage.${k}` as MessageKey)}</dt>
              <dd>{formatBytes(usage[k])}</dd>
            </div>
          ))}
        </dl>
      )}
      <h3>{t("storage.location")}</h3>
      <p className="muted">{location?.path}</p>
      {target && <p>{t("storage.moveConfirm", { path: target })}</p>}
      <div className="actions">
        {moving ? (
          <div className="job">
            <Progress job={moving} />
          </div>
        ) : target ? (
          <>
            <button className="btn" onClick={() => move(target)}>
              {t("storage.moveNow")}
            </button>
            <button className="btn btn-ghost" onClick={() => setTarget(null)}>
              {t("common.cancel")}
            </button>
          </>
        ) : (
          <button className="btn btn-ghost" disabled={!location} onClick={pick}>
            <Glyph name="folder" /> {t("storage.move")}
          </button>
        )}
      </div>
      <p className="muted">{t("storage.dedupHint")}</p>
      {last && <p className="muted">{t("storage.saved", { files: String(last.files), size: formatBytes(last.saved) })}</p>}
      <div className="actions">
        <button className="btn btn-ghost" disabled={!usage || usage.temp === 0} onClick={clearTemp}>
          <Glyph name="trash" /> {t("storage.clearTemp")}
        </button>
        {job ? (
          <div className="job">
            <Progress job={job} />
          </div>
        ) : (
          <button className="btn" onClick={dedup}>
            <Glyph name="copy" /> {t("storage.dedup")}
          </button>
        )}
      </div>
    </section>
  );
}
