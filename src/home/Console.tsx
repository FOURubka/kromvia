import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useI18n } from "../i18n";
import { Select } from "../ui/Select";

export type LogLine = { level: string; thread: string; text: string; noise: boolean };

type Level = "all" | "warn" | "error";
const LEVELS: Record<Level, string[] | null> = { all: null, warn: ["WARN", "ERROR", "FATAL"], error: ["ERROR", "FATAL"] };

const plain = (lines: LogLine[]) => lines.map((l) => (l.thread ? `[${l.thread}/${l.level}] ${l.text}` : l.text)).join("\n");

export function Console({ lines, instanceId }: { lines: LogLine[]; instanceId: string }) {
  const { t } = useI18n();
  const [showNoise, setShowNoise] = useState(false);
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState<Level>("all");
  const [shared, setShared] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const share = () => {
    invoke<string>("share_log", { text: plain(lines).slice(-120_000) }).then(
      (url) => {
        navigator.clipboard.writeText(url);
        setShared(url);
      },
      (e) => setShared(String(e)),
    );
  };
  const copy = () => {
    navigator.clipboard.writeText(plain(lines).slice(-120_000));
    setCopied(true);
  };
  const send = () => {
    invoke("support_report_send", { instanceId, log: plain(lines), note: note ?? "" }).then(
      () => setSent(t("console.sent")),
      (e) => setSent(String(e)),
    );
    setNote(null);
  };
  const box = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  const quiet = showNoise ? lines : lines.filter((l) => !l.noise);
  const hidden = lines.length - quiet.length;
  const wanted = LEVELS[level];
  const needle = query.trim().toLowerCase();
  const visible = quiet.filter((l) => (!wanted || wanted.includes(l.level)) && (!needle || l.text.toLowerCase().includes(needle)));

  useEffect(() => {
    if (stick.current && box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [visible.length]);

  return (
    <section className="console-wrap">
      <div className="console-head">
        <h2>{t("console.title")}</h2>
        <label className="muted">
          <input type="checkbox" checked={showNoise} onChange={(e) => setShowNoise(e.currentTarget.checked)} />{" "}
          {t("console.showNoise", { count: hidden })}
        </label>
      </div>
      <div className="console-tools">
        <input className="input" type="search" value={query} placeholder={t("console.search")} onChange={(e) => setQuery(e.currentTarget.value)} />
        <Select
          value={level}
          options={(["all", "warn", "error"] as const).map((v) => ({ value: v, label: t(`console.level.${v}`) }))}
          onChange={(v) => setLevel(v as Level)}
        />
        <button className="btn btn-ghost" onClick={copy}>
          {copied ? t("console.copied") : t("console.copy")}
        </button>
        <button className="btn btn-ghost" onClick={share}>
          {shared ?? t("console.share")}
        </button>
        <button className="btn btn-ghost" onClick={() => setNote("")} disabled={sent === t("console.sent")}>
          {sent ?? t("console.send")}
        </button>
      </div>
      {note !== null && (
        <div className="console-tools">
          <input className="input" autoFocus value={note} maxLength={300} placeholder={t("console.sendNote")} onChange={(e) => setNote(e.currentTarget.value)} onKeyDown={(e) => e.key === "Enter" && send()} />
          <button className="btn" onClick={send}>
            {t("console.send")}
          </button>
          <span className="muted">{t("console.sendHint")}</span>
        </div>
      )}
      <div
        ref={box}
        className="console"
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
        }}
      >
        {visible.map((l, i) => (
          <div key={i} className="log-line" data-level={l.level}>
            {l.thread && <span className="muted">[{l.thread}/{l.level}] </span>}
            {l.text}
          </div>
        ))}
      </div>
    </section>
  );
}
