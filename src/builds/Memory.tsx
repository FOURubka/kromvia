import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useI18n } from "../i18n";
import type { Instance } from "../lib/launcher";

const STEP = 512;
const gb = (mb: number) => `${(mb / 1024).toFixed(mb % 1024 ? 1 : 0)} GB`;

export function Memory({ inst, onSaved }: { inst: Instance; onSaved: () => void }) {
  const { t } = useI18n();
  const [info, setInfo] = useState<[number, number] | null>(null);
  const [value, setValue] = useState(inst.memoryMb);
  useEffect(() => {
    invoke<[number, number]>("memory_info", { instanceId: inst.id }).then(setInfo);
  }, [inst.id]);
  useEffect(() => setValue(inst.memoryMb), [inst.memoryMb]);
  if (!info) return null;
  const [total, auto] = info;
  const max = Math.max(Math.floor(total / STEP) * STEP, 1024);
  const shown = value ?? auto;
  const save = (mb: number | null) => {
    setValue(mb);
    invoke("instance_set_memory", { instanceId: inst.id, memoryMb: mb }).then(onSaved);
  };
  const commit = () => value !== inst.memoryMb && save(value);

  return (
    <div className="field memory">
      <span>{t("builds.memory").split(",")[0]}</span>
      <div className="memory-row">
        <button className="btn btn-ghost" aria-pressed={value === null} onClick={() => save(value === null ? auto : null)}>
          {t("builds.auto")}
        </button>
        <input
          type="range"
          min={1024}
          max={max}
          step={STEP}
          value={Math.min(shown, max)}
          style={{ "--fill": `${((Math.min(shown, max) - 1024) / Math.max(max - 1024, 1)) * 100}%` } as React.CSSProperties}
          onChange={(e) => setValue(Number(e.currentTarget.value))}
          onPointerUp={commit}
          onKeyUp={commit}
          onBlur={commit}
        />
        <span className="memory-value">
          {gb(shown)} <span className="muted">/ {gb(total)}</span>
        </span>
      </div>
    </div>
  );
}
