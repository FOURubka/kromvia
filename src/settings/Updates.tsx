import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { useI18n } from "../i18n";
import { useJobs } from "../lib/jobs";
import { Progress } from "../ui/Progress";
import { Markdown } from "../content/Markdown";

type Available = { version: string; notes: string | null };

const AUTO_KEY = "kromvia.autoUpdate";
const BETA_KEY = "kromvia.betaUpdates";
const DISMISSED_KEY = "kromvia.updateDismissed";
const NOTES_KEY = "kromvia.updateNotes";

const read = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key: string, value: string | null) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {}
};

const beta = () => read(BETA_KEY) === "1";

let checked: Promise<Available | null> | null = null;
const check = () => (checked ??= invoke<Available | null>("update_check", { beta: beta() }).catch(() => null));

export function useUpdate() {
  const [update, setUpdate] = useState<Available | null>(null);
  useEffect(() => {
    check().then(setUpdate);
  }, []);
  return update;
}

function useInstall() {
  const [error, setError] = useState<string | null>(null);
  const updates = useJobs("update", (_, e) => setError(e));
  const install = (update: Available) => {
    setError(null);
    write(NOTES_KEY, JSON.stringify(update));
    invoke<number>("update_install", { beta: beta() }).then(
      (id) => updates.started("update", id),
      (e) => setError(String(e)),
    );
  };
  return { install, job: updates.jobs.update, error };
}

export function Updates() {
  const { t } = useI18n();
  const update = useUpdate();
  const { install, job, error } = useInstall();
  const [auto, setAuto] = useState(read(AUTO_KEY) === "1");
  const [isBeta, setBeta] = useState(beta);
  return (
    <section className="card">
      <h2>{update ? t("update.title", { version: update.version }) : t("update.section")}</h2>
      <label className="field">
        <span>{t("update.auto")}</span>
        <input
          type="checkbox"
          checked={auto}
          onChange={(e) => {
            const on = e.currentTarget.checked;
            write(AUTO_KEY, on ? "1" : null);
            setAuto(on);
          }}
        />
      </label>
      <label className="field">
        <span>{t("update.beta")}</span>
        <input
          type="checkbox"
          checked={isBeta}
          onChange={(e) => {
            const on = e.currentTarget.checked;
            write(BETA_KEY, on ? "1" : null);
            setBeta(on);
            checked = null;
          }}
        />
      </label>
      {error && <p className="error">{error}</p>}
      {update?.notes && (
        <div className="update-notes">
          <Markdown source={update.notes} />
        </div>
      )}
      {update && (
        <div className="actions">
          {job ? (
            <div className="job">
              <Progress job={job} />
            </div>
          ) : (
            <button className="btn" onClick={() => install(update)}>
              {t("update.install")}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

export function UpdatePrompt() {
  const { t } = useI18n();
  const update = useUpdate();
  const { install, job, error } = useInstall();
  const [hidden, setHidden] = useState(false);
  const [installed, setInstalled] = useState<Available | null>(null);

  useEffect(() => {
    const saved = read(NOTES_KEY);
    if (!saved) return;
    getVersion().then((v) => {
      const notes = JSON.parse(saved) as Available;
      if (notes.version === v && notes.notes?.trim()) setInstalled(notes);
      write(NOTES_KEY, null);
    }, () => {});
  }, []);

  useEffect(() => {
    if (update && read(AUTO_KEY) === "1") install(update);
  }, [update?.version]);

  if (installed) {
    return (
      <div className="overlay" role="dialog" aria-modal="true" aria-label={t("update.whatsNew", { version: installed.version })} onClick={() => setInstalled(null)}>
        <section className="card onboarding update-dialog" onClick={(e) => e.stopPropagation()}>
          <h2>{t("update.whatsNew", { version: installed.version })}</h2>
          {installed.notes && (
            <div className="update-notes">
              <Markdown source={installed.notes} />
            </div>
          )}
          <div className="actions">
            <button className="btn" onClick={() => setInstalled(null)}>
              {t("keys.ok")}
            </button>
          </div>
        </section>
      </div>
    );
  }

  const auto = read(AUTO_KEY) === "1";
  if (!update || hidden || (!auto && read(DISMISSED_KEY) === update.version)) return null;
  if (auto && !job && !error) return null;
  const later = () => {
    write(DISMISSED_KEY, update.version);
    setHidden(true);
  };
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label={t("update.title", { version: update.version })}>
      <section className="card onboarding update-dialog">
        <h2>{t("update.title", { version: update.version })}</h2>
        {update.notes && (
          <div className="update-notes">
            <Markdown source={update.notes} />
          </div>
        )}
        {error && <p className="error">{error}</p>}
        <div className="actions">
          {job ? (
            <div className="job">
              <Progress job={job} />
            </div>
          ) : (
            <>
              <button className="btn btn-ghost" onClick={later}>
                {t("update.later")}
              </button>
              <button className="btn" onClick={() => install(update)}>
                {t("update.install")}
              </button>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
