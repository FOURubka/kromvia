import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { language, useI18n } from "../i18n";
import { formatBytes } from "../lib/launcher";
import { Empty } from "../ui/Empty";

type Run = { started: number; seconds: number; ramAvgMb: number; ramPeakMb: number; cpuAvg: number; mods: string[] };

const W = 560;
const H = 180;
const PAD = { top: 16, right: 12, bottom: 28, left: 12 };

function gb(mb: number) {
  return `${(mb / 1024).toFixed(1)} GB`;
}

function diff(runs: Run[], i: number) {
  if (i === 0) return { added: [], removed: [] };
  const before = new Set(runs[i - 1].mods);
  const now = new Set(runs[i].mods);
  return { added: runs[i].mods.filter((m) => !before.has(m)), removed: runs[i - 1].mods.filter((m) => !now.has(m)) };
}

export function Metrics({ instanceId }: { instanceId: string }) {
  const { t } = useI18n();
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [disk, setDisk] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    setRuns(null);
    setHover(null);
    invoke<Run[]>("instance_metrics", { id: instanceId }).then(setRuns, () => setRuns([]));
    invoke<{ usage: { total: number } }>("instance_info", { id: instanceId }).then((i) => setDisk(i.usage.total), () => {});
  }, [instanceId]);

  if (!runs) return null;
  const last = runs[runs.length - 1];
  const max = Math.max(1024, ...runs.map((r) => r.ramAvgMb)) * 1.15;
  const x = (i: number) => PAD.left + (runs.length === 1 ? (W - PAD.left - PAD.right) / 2 : (i / (runs.length - 1)) * (W - PAD.left - PAD.right));
  const y = (mb: number) => PAD.top + (1 - mb / max) * (H - PAD.top - PAD.bottom);
  const line = runs.map((r, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(r.ramAvgMb).toFixed(1)}`).join(" ");
  const area = `${line} L${x(runs.length - 1).toFixed(1)},${H - PAD.bottom} L${x(0).toFixed(1)},${H - PAD.bottom} Z`;
  const marks = runs.map((_, i) => ({ i, ...diff(runs, i) })).filter((d) => d.added.length > 0);
  const shown = hover;
  const tip = shown !== null ? { run: runs[shown], ...diff(runs, shown) } : null;

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    let best = 0;
    runs.forEach((_, i) => Math.abs(x(i) - px) < Math.abs(x(best) - px) && (best = i));
    setHover(best);
  };

  return (
    <section className="card metrics">
      <h2>{t("metrics.title")}</h2>
      <p className="muted">{t("metrics.hint")}</p>
      <div className="metric-tiles">
        <div className="metric-tile">
          <span className="muted">{t("metrics.ram")}</span>
          <strong>{last ? gb(last.ramAvgMb) : "-"}</strong>
          {last && <span className="muted">{t("metrics.peak", { v: gb(last.ramPeakMb) })}</span>}
        </div>
        <div className="metric-tile">
          <span className="muted">{t("metrics.cpu")}</span>
          <strong>{last ? `${Math.round(last.cpuAvg)}%` : "-"}</strong>
        </div>
        <div className="metric-tile">
          <span className="muted">{t("metrics.disk")}</span>
          <strong>{disk !== null ? formatBytes(disk) : "-"}</strong>
        </div>
      </div>
      {runs.length < 2 ? (
        <Empty bee="idle">{t("metrics.empty")}</Empty>
      ) : (
        <div className="metric-chart">
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t("metrics.chart")} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
            {[0.25, 0.5, 0.75].map((f) => (
              <line key={f} className="metric-grid" x1={PAD.left} x2={W - PAD.right} y1={y(max * f)} y2={y(max * f)} />
            ))}
            <path className="metric-area" d={area} />
            <path className="metric-line" d={line} />
            {marks.map((m) => (
              <g key={m.i}>
                <line className="metric-mark" x1={x(m.i)} x2={x(m.i)} y1={PAD.top} y2={H - PAD.bottom} />
                <text className="metric-mark-label" x={x(m.i)} y={H - 10} textAnchor="middle">
                  + {m.added[0]}
                  {m.added.length > 1 ? ` +${m.added.length - 1}` : ""}
                </text>
              </g>
            ))}
            {shown !== null && (
              <>
                <line className="metric-cross" x1={x(shown)} x2={x(shown)} y1={PAD.top} y2={H - PAD.bottom} />
                <circle className="metric-dot" cx={x(shown)} cy={y(runs[shown].ramAvgMb)} r={4} />
              </>
            )}
          </svg>
          {tip && (
            <div className="metric-tip" style={{ left: `${(x(shown!) / W) * 100}%`, transform: `translateX(${x(shown!) / W < 0.25 ? 0 : x(shown!) / W > 0.75 ? -100 : -50}%)` }}>
              <strong>{new Date(tip.run.started * 1000).toLocaleString(language, { dateStyle: "short", timeStyle: "short" })}</strong>
              <span>
                {t("metrics.ram")}: {gb(tip.run.ramAvgMb)} · {t("metrics.peak", { v: gb(tip.run.ramPeakMb) })}
              </span>
              <span>
                {t("metrics.cpu")}: {Math.round(tip.run.cpuAvg)}%
              </span>
              {tip.added.length > 0 && <span>+ {tip.added.slice(0, 3).join(", ")}{tip.added.length > 3 ? ` +${tip.added.length - 3}` : ""}</span>}
              {tip.removed.length > 0 && <span>− {tip.removed.slice(0, 3).join(", ")}{tip.removed.length > 3 ? ` +${tip.removed.length - 3}` : ""}</span>}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
