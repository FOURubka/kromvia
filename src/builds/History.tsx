import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { language, useI18n } from "../i18n";
import type { MessageKey } from "../i18n/en";
import { Empty } from "../ui/Empty";

export type Regression = { beforeLow: number; afterLow: number; dropPercent: number; added: string[]; removed: string[]; beforeSet: string };
type Entry = { id: string; time: number; reason: string; modSet: string; mods: number; added: string[]; removed: string[]; configs: number; current: boolean };

const SHOWN = 8;
const REASONS = ["launch", "change", "before restore", "restored"];

function list(items: string[]) {
  return items.slice(0, 3).join(", ") + (items.length > 3 ? ` +${items.length - 3}` : "");
}

export function History({ instanceId, running }: { instanceId: string; running: boolean }) {
  const { t } = useI18n();
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [regression, setRegression] = useState<Regression | null>(null);
  const [all, setAll] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<{ text: string; error?: boolean } | null>(null);

  const load = () => {
    invoke<Entry[]>("instance_history", { id: instanceId }).then(setEntries, (e) => (setEntries([]), setStatus({ text: String(e), error: true })));
    invoke<Regression | null>("instance_regression", { id: instanceId }).then(setRegression, () => setRegression(null));
  };
  useEffect(() => {
    setEntries(null);
    setStatus(null);
    load();
  }, [instanceId]);

  const restore = (args: { commit?: string; modSet?: string }, key: string) => {
    setBusy(key);
    setStatus(null);
    invoke("instance_history_restore", { id: instanceId, commit: args.commit ?? null, modSet: args.modSet ?? null })
      .then(() => setStatus({ text: t("history.restored") }), (e) => setStatus({ text: String(e), error: true }))
      .finally(() => {
        setBusy(null);
        load();
      });
  };

  if (!entries) return null;
  const shown = all ? entries : entries.slice(0, SHOWN);
  return (
    <section className="card history">
      <h2>{t("history.title")}</h2>
      <p className="muted">{t("history.hint")}</p>
      {regression && (
        <div className="history-alert">
          <span>
            {t("history.dropped", { drop: regression.dropPercent, before: Math.round(regression.beforeLow), after: Math.round(regression.afterLow) })}
            {regression.added.length > 0 && <> {t("history.after", { mods: list(regression.added) })}</>}
          </span>
          <button className="btn" disabled={running || !!busy} onClick={() => restore({ modSet: regression.beforeSet }, "rollback")}>
            {t("history.rollback")}
          </button>
        </div>
      )}
      {entries.length === 0 ? (
        <Empty bee="idle">{t("history.empty")}</Empty>
      ) : (
        <ol className="history-list">
          {shown.map((e) => (
            <li key={e.id}>
              <div>
                <strong>{new Date(e.time * 1000).toLocaleString(language, { dateStyle: "medium", timeStyle: "short" })}</strong>
                <span className="muted">
                  {REASONS.includes(e.reason) ? t(`history.reason.${e.reason.replace(" ", "")}` as MessageKey) : e.reason} · {t("history.mods", { n: e.mods })}
                  {e.configs > 0 && <> · {t("history.configs", { n: e.configs })}</>}
                </span>
                {e.added.length > 0 && <span className="history-add">+ {list(e.added)}</span>}
                {e.removed.length > 0 && <span className="history-del">− {list(e.removed)}</span>}
              </div>
              {e.current ? (
                <span className="muted">{t("history.current")}</span>
              ) : (
                <button className="btn btn-ghost" disabled={running || !!busy} onClick={() => restore({ commit: e.id }, e.id)}>
                  {busy === e.id ? "…" : t("history.restore")}
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
      {entries.length > SHOWN && (
        <button className="btn btn-ghost" onClick={() => setAll((a) => !a)}>
          {all ? t("history.less") : t("history.more", { n: entries.length - SHOWN })}
        </button>
      )}
      {running && <p className="muted">{t("history.running")}</p>}
      {status && <p className={status.error ? "error" : "muted"}>{status.text}</p>}
    </section>
  );
}
