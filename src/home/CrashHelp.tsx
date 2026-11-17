import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useI18n } from "../i18n";
import type { MessageKey } from "../i18n/en";
import { updateInstance, useLauncher, type Crash, type Instance } from "../lib/launcher";
import { Glyph } from "../ui/Glyph";
import { Empty } from "../ui/Empty";

const MAX_MB = 16384;

type Clash = { kind: string; id: string; name: string | null; files: string[]; wanted: string | null };

export function CrashHelp({ inst, crash }: { inst: Instance; crash: Crash }) {
  const { t } = useI18n();
  const l = useLauncher();
  const [error, setError] = useState<string | null>(null);
  const [fixed, setFixed] = useState(false);
  const [sent, setSent] = useState(crash.auto);
  const send = () => invoke("crash_report_send", { instanceId: inst.id }).then(() => setSent(true), (e) => setError(String(e)));
  const fix = (p: Promise<unknown>) =>
    p.then(
      () => (setFixed(true), l.refresh()),
      (e) => setError(String(e)),
    );
  const more = Math.min(MAX_MB, Math.ceil(((inst.memoryMb ?? 4096) * 1.5) / 512) * 512);
  const [clashes, setClashes] = useState<Clash[]>([]);
  const [off, setOff] = useState<string[]>([]);
  useEffect(() => {
    invoke<Clash[]>("content_conflicts", { instanceId: inst.id }).then(
      (list) => setClashes(list.filter((c) => (c.kind === "breaks" || c.kind === "duplicate") && c.files.length > 1)),
      () => {},
    );
  }, [inst.id]);
  const disable = (file: string) =>
    invoke("content_set_enabled", { instanceId: inst.id, file, enabled: false }).then(
      () => setOff((o) => [...o, file]),
      (e) => setError(String(e)),
    );
  const openMods = () => invoke("instance_open_folder", { instanceId: inst.id, folder: "mods" }).catch((e) => setError(String(e)));

  return (
    <Empty bee="crash">
      <div className="crash-help">
        <p className="error">{t(`crash.${crash.cause}` as MessageKey, { mod: crash.detail ?? "?" })}</p>
        {crash.detail && crash.cause !== "brokenMod" && crash.cause !== "modRemoved" && <p className="muted small">{crash.detail}</p>}
        {error && <p className="error">{error}</p>}
        {clashes.map((c) => (
          <div key={c.kind + c.files.join()} className="crash-clash">
            <p>
              {c.kind === "duplicate"
                ? t("crash.clashDuplicate", { mod: c.name ?? c.id })
                : t("crash.clash", { a: c.wanted ?? c.files[0], b: c.name ?? c.id })}
            </p>
            {c.files.map((f) =>
              off.includes(f) ? (
                <span key={f} className="muted small">
                  <Glyph name="check" /> {f}
                </span>
              ) : (
                <button key={f} className="btn btn-ghost" onClick={() => disable(f)}>
                  <Glyph name="x" /> {t("crash.disable", { file: f })}
                </button>
              ),
            )}
          </div>
        ))}
        {!fixed && crash.cause === "outOfMemory" && (inst.memoryMb ?? 0) < MAX_MB && (
          <button className="btn" onClick={() => fix(updateInstance(inst, { memoryMb: more }))}>
            <Glyph name="bolt" /> {t("crash.moreMemory", { mb: more })}
          </button>
        )}
        {!fixed && crash.cause === "tooMuchMemory" && inst.memoryMb !== null && (
          <button className="btn" onClick={() => fix(updateInstance(inst, { memoryMb: null }))}>
            <Glyph name="bolt" /> {t("crash.autoMemory")}
          </button>
        )}
        {!fixed && crash.cause === "wrongJava" && inst.javaPath && (
          <button className="btn" onClick={() => fix(updateInstance(inst, { javaPath: null }))}>
            <Glyph name="bolt" /> {t("crash.autoJava")}
          </button>
        )}
        {["missingMod", "duplicateMod", "brokenMod", "modRemoved"].includes(crash.cause) && (
          <button className="btn btn-ghost" onClick={openMods}>
            <Glyph name="folder" /> {t("crash.openMods")}
          </button>
        )}
        <button className="btn btn-ghost" title={t("game.safeHint")} onClick={() => l.play(inst, { safe: true })}>
          <Glyph name="player-play" /> {t("game.safe")}
        </button>
        {fixed && <Glyph name="check" />}
        {!sent && (
          <button className="btn btn-ghost" title={t("crash.sendHint")} onClick={send}>
            <Glyph name="upload" /> {t("crash.send")}
          </button>
        )}
        {crash.report && (
          <button
            className="btn btn-ghost"
            onClick={() => invoke("crash_report_open", { instanceId: inst.id, path: crash.report }).catch((e) => setError(String(e)))}
          >
            <Glyph name="external-link" /> {t("crash.report")}
          </button>
        )}
      </div>
      {sent && <p className="muted small">{t("crash.sent")}</p>}
    </Empty>
  );
}
