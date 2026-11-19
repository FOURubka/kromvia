import { useState } from "react";
import { LANGUAGES, language, setLanguage, useI18n } from "../i18n";
import type { MessageKey } from "../i18n/en";
import { useLauncher } from "../lib/launcher";
import type { ThemePref } from "../theme";
import { Select } from "../ui/Select";
import { Glyph } from "../ui/Glyph";
import { requestNewInstance } from "./Home";

const DONE_KEY = "kromvia.onboarded";
const THEMES: ThemePref[] = ["system", "light", "dark"];

export function needsOnboarding() {
  try {
    if (localStorage.getItem(DONE_KEY) === "1") return false;
    for (let i = 0; i < localStorage.length; i++) if (localStorage.key(i)?.startsWith("kromvia.")) return false;
    return true;
  } catch {
    return false;
  }
}

function finish() {
  try {
    localStorage.setItem(DONE_KEY, "1");
  } catch {}
}

export function Onboarding({
  theme,
  setTheme,
  onDone,
}: {
  theme: ThemePref;
  setTheme: (t: ThemePref) => void;
  onDone: (go: "home" | "accounts" | "builds") => void;
}) {
  const { t } = useI18n();
  const l = useLauncher();
  const [step, setStep] = useState(0);
  const done = (go: "home" | "accounts" | "builds") => {
    finish();
    onDone(go);
  };

  const STEPS = 3;
  return (
    <div className="onboard" role="dialog" aria-modal="true" aria-label={t("onboarding.title")}>
      <div className="onboard-brand">
        <img src="/logo.svg" alt="" width={44} height={44} draggable={false} />
        <span>Kromvia</span>
      </div>
      <section className="onboard-panel">
        <ol className="onboard-steps" aria-label={t("onboarding.step", { n: step + 1, total: STEPS })}>
          {Array.from({ length: STEPS }, (_, i) => (
            <li key={i} data-on={i <= step || undefined} />
          ))}
        </ol>
        <div className="onboard-body" key={step}>
          {step === 0 && (
            <>
              <h2>{t("onboarding.title")}</h2>
              <p className="muted">{t("onboarding.intro")}</p>
              <div className="field">
                <span>{t("settings.language")}</span>
                <Select value={language} label={t("settings.language")} options={Object.entries(LANGUAGES).map(([value, label]) => ({ value, label }))} onChange={setLanguage} />
              </div>
              <div className="field">
                <span>{t("settings.theme")}</span>
                <div className="segmented">
                  {THEMES.map((th) => (
                    <button key={th} aria-pressed={theme === th} onClick={() => setTheme(th)}>
                      {t(`settings.theme.${th}` as MessageKey)}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
          {step === 1 && (
            <>
              <h2>{t("onboarding.accountTitle")}</h2>
              <p className="muted">{t("onboarding.accountText")}</p>
              <button className="onboard-choice" onClick={() => done("accounts")}>
                <Glyph name="login-2" />
                <span>
                  <b>{t("onboarding.microsoft")}</b>
                  <small className="muted">{t("onboarding.microsoftHint")}</small>
                </span>
              </button>
              <div className="field">
                <span>{t("onboarding.nick")}</span>
                <input className="input" value={l.nick} maxLength={16} placeholder="Steve" onChange={(e) => l.setNick(e.currentTarget.value)} onBlur={() => l.rememberNick()} />
              </div>
            </>
          )}
          {step === 2 && (
            <>
              <h2>{t("onboarding.buildTitle")}</h2>
              <p className="muted">{t("onboarding.buildText")}</p>
              <button className="onboard-choice" onClick={() => (done("home"), requestNewInstance())}>
                <Glyph name="plus" />
                <span>
                  <b>{t("onboarding.newBuild")}</b>
                  <small className="muted">{t("onboarding.newBuildHint")}</small>
                </span>
              </button>
              <button className="onboard-choice" onClick={() => done("builds")}>
                <Glyph name="file-import" />
                <span>
                  <b>{t("onboarding.import")}</b>
                  <small className="muted">Prism, Modrinth App, CurseForge, ATLauncher, .mrpack</small>
                </span>
              </button>
              <p className="muted small">{t("onboarding.keys")}</p>
            </>
          )}
        </div>
        <div className="onboard-nav">
          <button className="btn btn-ghost" onClick={() => done("home")}>
            {t("onboarding.skip")}
          </button>
          <span />
          {step > 0 && (
            <button className="btn btn-ghost" aria-label={t("onboarding.back")} onClick={() => setStep(step - 1)}>
              <Glyph name="chevron-left" />
            </button>
          )}
          {step < STEPS - 1 && (
            <button className="btn" onClick={() => setStep(step + 1)}>
              {t("onboarding.next")} <Glyph name="chevron-right" />
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

export const HOTKEYS: [string, MessageKey][] = [
  ["Ctrl+1…9", "keys.pages"],
  ["Ctrl+,", "keys.settings"],
  ["Ctrl+Enter", "keys.play"],
  ["Ctrl+N", "keys.new"],
  ["Ctrl+B", "keys.build"],
  ["Ctrl+F", "keys.search"],
  ["Ctrl+K", "keys.palette"],
  ["?", "keys.help"],
  ["Esc", "keys.close"],
];

export function HotkeyHelp({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label={t("keys.title")} onClick={onClose}>
      <section className="card onboarding" onClick={(e) => e.stopPropagation()}>
        <h2>{t("keys.title")}</h2>
        <ul className="rows compact">
          {HOTKEYS.map(([k, label]) => (
            <li key={k} className="row plain">
              <kbd>{k}</kbd>
              <span>{t(label)}</span>
            </li>
          ))}
        </ul>
        <div className="actions">
          <button className="btn" onClick={onClose}>
            {t("keys.ok")}
          </button>
        </div>
      </section>
    </div>
  );
}
