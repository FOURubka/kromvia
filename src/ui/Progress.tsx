import { useI18n } from "../i18n";
import type { MessageKey } from "../i18n/en";
import type { JobProgress } from "../lib/jobs";

const MB = 1024 * 1024;

export function Progress({ job }: { job: JobProgress }) {
  const { t } = useI18n();
  const pct = job.total ? Math.floor((job.done / job.total) * 100) : null;
  return (
    <div className="progress-wrap">
      <span className="muted">
        {t(`stage.${job.stage}` as MessageKey)}
        {pct !== null && ` ${pct}%`}
        {job.total ? ` · ${Math.round(job.done / MB)}/${Math.round(job.total / MB)} MB` : ""}
      </span>
      <div className="progress">
        <div className="progress-bar" style={{ width: pct !== null ? `${pct}%` : "100%" }} data-indeterminate={pct === null} />
      </div>
    </div>
  );
}

const STEPS = ["prepare", "java", "files", "loader", "start"] as const;
const STEP_OF: Record<string, number> = { resolve: 0, signin: 0, xbox: 0, "room-mods": 0, extract: 1, download: 2, verify: 2, patch: 3, natives: 4 };

export function LaunchProgress({ job }: { job: JobProgress }) {
  const { t } = useI18n();
  const pct = job.total ? Math.floor((job.done / job.total) * 100) : null;
  const step = STEP_OF[job.stage] ?? 0;
  const overall = Math.round(((step + (pct ?? 0) / 100) / STEPS.length) * 100);
  return (
    <div className="launch-progress">
      <div className="launch-progress-fill" style={{ width: `${overall}%` }} />
      <span className="launch-progress-label">
        {t(`stage.${job.stage}` as MessageKey)}
        {pct !== null && ` ${pct}%`}
      </span>
      <ol className="launch-steps">
        {STEPS.map((s, i) => (
          <li key={s} data-state={i < step ? "done" : i === step ? "now" : "next"}>
            {t(`launch.step.${s}` as MessageKey)}
          </li>
        ))}
      </ol>
    </div>
  );
}
