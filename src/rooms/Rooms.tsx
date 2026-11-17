import { useState } from "react";
import { useI18n } from "../i18n";
import { describe, useLauncher } from "../lib/launcher";
import { Progress } from "../ui/Progress";
import { Glyph } from "../ui/Glyph";
import { Select } from "../ui/Select";
import { SharedWorlds } from "./SharedWorlds";

export function Rooms() {
  const { t } = useI18n();
  const l = useLauncher();
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);
  const { current, instances } = l;

  const job = current && l.jobOf(current.id);
  const run = current && l.runOf(current.id);
  const busy = !current || !!job || !!run;
  const roomCode = l.hosting ? l.rooms[l.hosting] : undefined;

  const copy = () => {
    if (!roomCode) return;
    navigator.clipboard.writeText(roomCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="rooms-page">
      <section className="card rooms-hero tile-art-host">
        <div className="feature-text">
          <h1>{t("rooms.title")}</h1>
          <p>{t("rooms.hint")}</p>
          {instances.length > 0 && current && (
            <Select
              value={current.id}
              label={t("home.pick")}
              options={instances.map((i) => ({ value: i.id, label: `${i.name} (${describe(i, t("instance.vanilla"))})` }))}
              onChange={l.setSelected}
            />
          )}
        </div>
        <div className="feature-art">
          <img className="rooms-bee" src="/bee/rooms.webp" alt="" draggable={false} />
        </div>
      </section>

      <div className="rooms-grid">
        <section className="card">
          <h2>{t("rooms.hostTitle")}</h2>
          <ol className="steps">
            <li>{t("rooms.step1")}</li>
            <li>{t("rooms.step2")}</li>
            <li>{t("rooms.step3")}</li>
          </ol>
          {l.hosting ? (
            roomCode ? (
              <div className="room-code">
                <code>{roomCode}</code>
                <button className="btn" onClick={copy}>
                  <Glyph name={copied ? "check" : "copy"} /> {copied ? t("rooms.copied") : t("rooms.copy")}
                </button>
              </div>
            ) : (
              <p className="room-wait">{t("rooms.waiting")}</p>
            )
          ) : job && current ? (
            <Progress job={job} />
          ) : (
            <button className="btn big" disabled={busy || !current?.loader} onClick={() => current && l.play(current, { room: true })}>
              <Glyph name="broadcast" /> {t("rooms.host")}
            </button>
          )}
          {current && !current.loader && <p className="muted small">{t("rooms.needLoader")}</p>}
          {current && l.errors[current.id] && <p className="error">{l.errors[current.id]}</p>}
        </section>

        <section className="card">
          <h2>{t("rooms.joinTitle")}</h2>
          <p className="muted">{t("rooms.joinHint")}</p>
          <div className="room-join">
            <input
              className="input"
              placeholder={t("rooms.codePlaceholder")}
              aria-label={t("rooms.codePlaceholder")}
              value={code}
              onChange={(e) => setCode(e.currentTarget.value.trim())}
            />
            <button className="btn" disabled={busy || !code} onClick={() => current && l.play(current, { join: code })}>
              <Glyph name="login-2" /> {t("rooms.join")}
            </button>
          </div>
        </section>
      </div>

      <SharedWorlds />
    </div>
  );
}
