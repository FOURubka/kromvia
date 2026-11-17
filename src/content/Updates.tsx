import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useI18n } from "../i18n";
import { useJobs } from "../lib/jobs";
import { Progress } from "../ui/Progress";
import { Glyph } from "../ui/Glyph";
import { Empty } from "../ui/Empty";
import { Markdown } from "./Markdown";

type Update = { folder: string; file: string; title: string; newFile: string; version: string; changelog: string | null };
type Issue = { kind: "incompatible" | "missing"; title: string; other: string };

const BIG_UPDATE = 5;

export function ContentUpdates({ instanceId, onChange }: { instanceId: string; onChange: () => void }) {
  const { t } = useI18n();
  const [updates, setUpdates] = useState<Update[] | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const check = () => {
    setChecking(true);
    setError(null);
    Promise.all([invoke<Update[]>("content_updates", { instanceId }), invoke<Issue[]>("content_audit", { instanceId }).catch(() => [])])
      .then(
        ([u, i]) => (setUpdates(u), setIssues(i)),
        (e) => setError(String(e)),
      )
      .finally(() => setChecking(false));
  };
  const jobs = useJobs("update-", (_, e) => {
    setError(e);
    onChange();
    check();
  });
  const job = jobs.jobs[`update-${instanceId}`];
  const [asking, setAsking] = useState(false);
  const backups = useJobs("backup-", (key, e) => {
    if (key !== `backup-${instanceId}`) return;
    if (e) setError(e);
    else run(null);
  });
  const backup = backups.jobs[`backup-${instanceId}`];
  const backupThenRun = () => {
    setAsking(false);
    invoke<number>("backup_create", { instanceId }).then(
      (id) => backups.started(`backup-${instanceId}`, id),
      (e) => setError(String(e)),
    );
  };

  useEffect(() => {
    setUpdates(null);
    setIssues([]);
    setError(null);
  }, [instanceId]);

  const run = (files: string[] | null) =>
    invoke<number>("content_update", { instanceId, files }).then(
      (id) => jobs.started(`update-${instanceId}`, id),
      (e) => setError(String(e)),
    );

  return (
    <div className="content-updates">
      <div className="actions">
        {backup || job ? (
          <div className="job">
            <Progress job={(backup ?? job)!} />
          </div>
        ) : (
          <>
            <button className="btn btn-ghost" disabled={checking} onClick={check}>
              <Glyph name="refresh" /> {checking ? t("updates.checking") : t("updates.check")}
            </button>
            {updates && updates.length > 0 && (
              <button className="btn" onClick={() => (updates.length >= BIG_UPDATE ? setAsking(true) : run(null))}>
                <Glyph name="download" /> {t("updates.all", { n: String(updates.length) })}
              </button>
            )}
          </>
        )}
      </div>
      {asking && updates && (
        <div className="dupe-warning">
          <p>{t("updates.backupAsk", { n: String(updates.length) })}</p>
          <div className="actions">
            <button className="btn btn-ghost" onClick={() => setAsking(false)}>
              {t("common.cancel")}
            </button>
            <button className="btn btn-ghost" onClick={() => (setAsking(false), run(null))}>
              {t("updates.noBackup")}
            </button>
            <button className="btn" onClick={backupThenRun}>
              {t("updates.backupFirst")}
            </button>
          </div>
        </div>
      )}
      {error && <p className="error">{error}</p>}
      {issues.map((i) => (
        <p key={i.kind + i.title + i.other} className="error">
          {t(i.kind === "missing" ? "audit.missing" : "audit.incompatible", { a: i.title, b: i.other })}
        </p>
      ))}
      {updates?.length === 0 && <Empty bee="success">{t("updates.none")}</Empty>}
      {updates && updates.length > 0 && (
        <ul className="rows compact">
          {updates.map((u) => (
            <li key={u.folder + u.file} className="row plain">
              <div className="list-main">
                <span>
                  {u.title} <span className="muted">· {u.version}</span>
                </span>
                <span className="path muted">
                  {u.file} → {u.newFile}
                </span>
                {u.changelog && (
                  <details className="update-notes">
                    <summary>{t("updates.changelog")}</summary>
                    <Markdown source={u.changelog} />
                  </details>
                )}
              </div>
              <div className="row-tools">
                <button className="btn btn-ghost" disabled={!!job} onClick={() => run([`${u.folder}/${u.file}`])}>
                  <Glyph name="download" /> {t("updates.one")}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
