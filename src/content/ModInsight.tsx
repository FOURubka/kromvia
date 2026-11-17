import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useI18n } from "../i18n";

type Insight = { cost: { fps: number; with: number; without: number } | null; pairs: { project: string; crashed: number; rate: number }[] };

export function ModInsight({ instanceId, projectId }: { instanceId: string; projectId: string }) {
  const { t } = useI18n();
  const [data, setData] = useState<Insight | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => {
    setData(null);
    invoke<Insight>("mod_insight", { instanceId, project: projectId }).then(setData, () => {});
  }, [instanceId, projectId]);
  useEffect(() => {
    const ids = data?.pairs.map((p) => p.project) ?? [];
    if (ids.length) invoke<Record<string, string>>("content_titles", { ids }).then(setNames, () => {});
  }, [data]);
  if (!data || (!data.cost && data.pairs.length === 0)) return null;
  return (
    <div className="mod-insight">
      {data.cost && (
        <span className="muted">
          {data.cost.fps > 0 ? t("insight.costs", { fps: data.cost.fps, n: data.cost.with + data.cost.without }) : t("insight.free", { n: data.cost.with + data.cost.without })}
        </span>
      )}
      {data.pairs.map((p) => (
        <span key={p.project} className="mod-insight-warn">
          {t("insight.pair", { mod: names[p.project] ?? p.project, rate: Math.round(p.rate * 100), n: p.crashed })}
        </span>
      ))}
    </div>
  );
}
