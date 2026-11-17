import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useI18n } from "../i18n";
import { Glyph } from "../ui/Glyph";

export function BugReport() {
  const { t } = useI18n();
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<{ error: boolean; text: string } | null>(null);
  const [sending, setSending] = useState(false);
  const send = () => {
    setSending(true);
    invoke("bug_report_send", { note })
      .then(
        () => (setStatus({ error: false, text: t("bug.sent") }), setNote("")),
        (e) => setStatus({ error: true, text: String(e) }),
      )
      .finally(() => setSending(false));
  };

  return (
    <section className="card">
      <h2>{t("bug.title")}</h2>
      <textarea className="input" rows={3} maxLength={300} value={note} placeholder={t("bug.placeholder")} onChange={(e) => setNote(e.currentTarget.value)} />
      <p className="muted small">{t("bug.hint")}</p>
      {status && <p className={status.error ? "error" : "muted"}>{status.text}</p>}
      <div className="actions">
        <button className="btn" disabled={sending || !note.trim()} onClick={send}>
          <Glyph name="upload" /> {t("bug.send")}
        </button>
      </div>
    </section>
  );
}
