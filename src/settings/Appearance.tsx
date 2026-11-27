import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { useI18n } from "../i18n";
import { Glyph } from "../ui/Glyph";
import { Select } from "../ui/Select";
import { setUiSounds, uiSoundsOn } from "../lib/uiSound";

type Theme = { id: string; name: string };
const THEME_KEY = "kromvia.customTheme";
const CHANGED = "kromvia-appearance";

function savedTheme() {
  try {
    return localStorage.getItem(THEME_KEY);
  } catch {
    return null;
  }
}

function changed() {
  window.dispatchEvent(new Event(CHANGED));
}

export function useAppearance() {
  const [background, setBackground] = useState<string | null>(null);
  useEffect(() => {
    const apply = () => {
      invoke<string | null>("background_get").then(setBackground, () => setBackground(null));
      const id = savedTheme();
      const style = document.getElementById("custom-theme") ?? Object.assign(document.head.appendChild(document.createElement("style")), { id: "custom-theme" });
      if (!id) {
        style.textContent = "";
        return;
      }
      invoke<string>("theme_css", { id }).then(
        (css) => (style.textContent = css),
        () => (style.textContent = ""),
      );
    };
    apply();
    window.addEventListener(CHANGED, apply);
    return () => window.removeEventListener(CHANGED, apply);
  }, []);
  return background;
}

async function toBackground(file: Blob) {
  const img = await createImageBitmap(file);
  const k = Math.min(1, 1920 / img.width, 1080 / img.height);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * k);
  canvas.height = Math.round(img.height * k);
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.85);
}

export function AppearanceExtras() {
  const { t } = useI18n();
  const [themes, setThemes] = useState<Theme[]>([]);
  const [active, setActive] = useState(savedTheme() ?? "");
  const [hasBackground, setHasBackground] = useState(false);
  const [autostart, setAutostart] = useState(false);
  const [crashReports, setCrashReports] = useState(true);
  const [perfReports, setPerfReports] = useState(true);
  const [sounds, setSounds] = useState(uiSoundsOn);
  const [compact, setCompact] = useState(() => localStorage.getItem("kromvia.density") === "compact");
  const [status, setStatus] = useState<{ error: boolean; text: string } | null>(null);
  const fail = (e: unknown) => setStatus({ error: true, text: String(e) });

  const load = () => {
    invoke<Theme[]>("theme_list").then(setThemes, () => setThemes([]));
    invoke<string | null>("background_get").then((b) => setHasBackground(!!b), () => {});
  };
  useEffect(() => {
    load();
    invoke<boolean>("autostart_get").then(setAutostart, () => {});
    invoke<boolean>("crash_reports_get").then(setCrashReports, () => {});
    invoke<boolean>("perf_reports_get").then(setPerfReports, () => {});
  }, []);

  const pick = (id: string) => {
    setActive(id);
    try {
      if (id) localStorage.setItem(THEME_KEY, id);
      else localStorage.removeItem(THEME_KEY);
    } catch {}
    changed();
  };

  const importTheme = async () => {
    setStatus(null);
    const path = await open({ filters: [{ name: "Theme", extensions: ["css", "zip"] }] });
    if (!path) return;
    invoke<Theme>("theme_import", { path }).then((th) => (load(), pick(th.id)), fail);
  };

  const removeTheme = () => invoke("theme_delete", { id: active }).then(() => (pick(""), load()), fail);

  const setBackground = (image: string | null) =>
    invoke("background_set", { image }).then(() => (setHasBackground(!!image), changed()), fail);

  const toggleAutostart = (on: boolean) => invoke("autostart_set", { on }).then(() => setAutostart(on), fail);
  const togglePerfReports = (on: boolean) => invoke("perf_reports_set", { on }).then(() => setPerfReports(on), fail);
  const toggleCrashReports = (on: boolean) => invoke("crash_reports_set", { on }).then(() => setCrashReports(on), fail);

  return (
    <>
      <div className="field">
        <span>{t("settings.customTheme")}</span>
        <div className="actions">
          <Select
            value={active}
            options={[{ value: "", label: t("settings.noCustomTheme") }, ...themes.map((th) => ({ value: th.id, label: th.name }))]}
            onChange={pick}
          />
          <button className="btn btn-ghost" onClick={importTheme}>
            <Glyph name="file-import" /> {t("settings.importTheme")}
          </button>
          {active && (
            <button className="btn btn-ghost" onClick={removeTheme}>
              <Glyph name="trash" /> {t("settings.deleteTheme")}
            </button>
          )}
        </div>
        <span className="muted">{t("settings.themeHint")}</span>
      </div>
      <div className="field">
        <span>{t("settings.background")}</span>
        <div className="actions">
          <label className="btn btn-ghost">
            <Glyph name="upload" /> {t("settings.backgroundUpload")}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              hidden
              onChange={(e) => {
                const file = e.currentTarget.files?.[0];
                e.currentTarget.value = "";
                if (file) toBackground(file).then(setBackground, fail);
              }}
            />
          </label>
          {hasBackground && (
            <button className="btn btn-ghost" onClick={() => setBackground(null)}>
              <Glyph name="rotate" /> {t("settings.backgroundReset")}
            </button>
          )}
        </div>
      </div>
      <MenuMedia />
      <div className="setting-checks">
        <label className="muted">
          <input type="checkbox" checked={autostart} onChange={(e) => toggleAutostart(e.currentTarget.checked)} /> {t("settings.autostart")}
        </label>
        <label className="muted">
          <input type="checkbox" checked={crashReports} onChange={(e) => toggleCrashReports(e.currentTarget.checked)} /> {t("settings.crashReports")}
        </label>
        <label className="muted">
          <input type="checkbox" checked={perfReports} onChange={(e) => togglePerfReports(e.currentTarget.checked)} /> {t("settings.perfReports")}
        </label>
        <label className="muted">
          <input
            type="checkbox"
            checked={sounds}
            onChange={(e) => {
              setUiSounds(e.currentTarget.checked);
              setSounds(e.currentTarget.checked);
            }}
          />{" "}
          {t("settings.uiSounds")}
        </label>
        <label className="muted">
          <input
            type="checkbox"
            checked={compact}
            onChange={(e) => {
              const on = e.currentTarget.checked;
              localStorage.setItem("kromvia.density", on ? "compact" : "normal");
              if (on) document.documentElement.dataset.density = "compact";
              else delete document.documentElement.dataset.density;
              setCompact(on);
            }}
          />{" "}
          {t("settings.compact")}
        </label>
      </div>
      {status && <p className={status.error ? "error" : "muted"}>{status.text}</p>}
    </>
  );
}

type Media = { images: string[]; music: string[] };

function MenuMedia() {
  const { t } = useI18n();
  const [media, setMedia] = useState<Media>({ images: [], music: [] });
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    invoke<Media>("menu_media_list").then(setMedia, () => {});
  }, []);
  const done = (p: Promise<Media>) => (setError(null), p.then(setMedia, (e) => setError(String(e))));
  const add = async () => {
    const paths = await open({ multiple: true, filters: [{ name: "PNG, OGG", extensions: ["png", "ogg"] }] });
    if (paths?.length) done(invoke<Media>("menu_media_add", { paths }));
  };
  const list = (kind: keyof Media) =>
    media[kind].map((name) => (
      <span key={kind + name} className="media-chip">
        {name}
        <button className="media-chip-x" title={t("menuMedia.remove")} aria-label={t("menuMedia.remove")} onClick={() => done(invoke<Media>("menu_media_remove", { kind, name }))}>
          <Glyph name="x" />
        </button>
      </span>
    ));
  return (
    <div className="field">
      <span>{t("menuMedia.title")}</span>
      <div className="actions">
        <button className="btn btn-ghost" onClick={add}>
          <Glyph name="file-import" /> {t("menuMedia.add")}
        </button>
        {list("images")}
        {list("music")}
      </div>
      <span className="muted">{t("menuMedia.hint")}</span>
      {error && <p className="error">{error}</p>}
    </div>
  );
}

export function SettingsBackup() {
  const { t } = useI18n();
  const [status, setStatus] = useState<{ error: boolean; text: string } | null>(null);

  const exportAll = async () => {
    setStatus(null);
    const path = await save({ defaultPath: "kromvia-settings.json", filters: [{ name: "JSON", extensions: ["json"] }] });
    if (!path) return;
    const local: Record<string, string> = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)!;
        if (k.startsWith("kromvia.")) local[k] = localStorage.getItem(k)!;
      }
    } catch {}
    invoke("settings_export", { path, local }).then(
      () => setStatus({ error: false, text: t("backup.exported") }),
      (e) => setStatus({ error: true, text: String(e) }),
    );
  };

  const localSettings = () => {
    const local: Record<string, string> = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)!;
        if (k.startsWith("kromvia.")) local[k] = localStorage.getItem(k)!;
      }
    } catch {}
    return local;
  };
  const cloudSave = () => {
    setStatus(null);
    invoke("sync_put", { key: "settings", data: localSettings() }).then(
      () => setStatus({ error: false, text: t("cloud.saved") }),
      (e) => setStatus({ error: true, text: String(e) }),
    );
  };
  const cloudRestore = () => {
    setStatus(null);
    invoke<Record<string, string> | null>("sync_get", { key: "settings" }).then(
      (local) => {
        if (!local) return setStatus({ error: true, text: t("cloud.nothing") });
        try {
          for (const [k, v] of Object.entries(local)) if (k.startsWith("kromvia.") && typeof v === "string") localStorage.setItem(k, v);
        } catch {}
        location.reload();
      },
      (e) => setStatus({ error: true, text: String(e) }),
    );
  };

  const importAll = async () => {
    setStatus(null);
    const path = await open({ filters: [{ name: "JSON", extensions: ["json"] }] });
    if (!path) return;
    invoke<Record<string, string>>("settings_import", { path }).then(
      (local) => {
        try {
          for (const [k, v] of Object.entries(local)) localStorage.setItem(k, v);
        } catch {}
        location.reload();
      },
      (e) => setStatus({ error: true, text: String(e) }),
    );
  };

  return (
    <section className="card">
      <h2>{t("backup.title")}</h2>
      <p className="muted">{t("backup.hint")}</p>
      <div className="actions">
        <button className="btn btn-ghost" onClick={exportAll}>
          <Glyph name="file-export" /> {t("backup.export")}
        </button>
        <button className="btn btn-ghost" onClick={importAll}>
          <Glyph name="file-import" /> {t("backup.import")}
        </button>
        <button className="btn btn-ghost" onClick={cloudSave}>
          <Glyph name="upload" /> {t("cloud.saveSettings")}
        </button>
        <button className="btn btn-ghost" onClick={cloudRestore}>
          <Glyph name="download" /> {t("cloud.restoreSettings")}
        </button>
      </div>
      {status && <p className={status.error ? "error" : "muted"}>{status.text}</p>}
    </section>
  );
}
