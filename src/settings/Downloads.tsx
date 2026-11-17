import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useI18n } from "../i18n";

type Limits = { parallel: number; kbps: number };

export function Downloads() {
  const { t } = useI18n();
  const [limits, setLimits] = useState<Limits | null>(null);
  const [speed, setSpeed] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    invoke<Limits>("network_get").then((l) => (setLimits(l), setSpeed(l.kbps ? String(Math.round((l.kbps / 1024) * 10) / 10) : "")), () => {});
  }, []);

  const save = (next: Limits) => {
    setLimits(next);
    invoke("network_set", { limits: next }).then(() => setError(null), (e) => setError(String(e)));
  };
  if (!limits) return null;

  return (
    <section className="card">
      <h2>{t("downloads.title")}</h2>
      <div className="field">
        <span>{t("downloads.parallel")}</span>
        <input
          className="input"
          type="number"
          min={1}
          max={32}
          value={limits.parallel}
          onChange={(e) => {
            const n = Math.round(Number(e.currentTarget.value));
            if (n >= 1 && n <= 32) save({ ...limits, parallel: n });
          }}
        />
      </div>
      <div className="field">
        <span>{t("downloads.speed")}</span>
        <input
          className="input"
          inputMode="decimal"
          value={speed}
          placeholder={t("downloads.unlimited")}
          onChange={(e) => setSpeed(e.currentTarget.value)}
          onBlur={() => {
            const mb = Number(speed.replace(",", "."));
            if (speed.trim() && !(mb > 0)) return setSpeed(limits.kbps ? String(limits.kbps / 1024) : "");
            save({ ...limits, kbps: speed.trim() ? Math.max(1, Math.round(mb * 1024)) : 0 });
          }}
        />
      </div>
      {error && <p className="error">{error}</p>}
    </section>
  );
}
