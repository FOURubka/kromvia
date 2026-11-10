import { useEffect, useRef, useState, type CSSProperties } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { LANGUAGES, language, setLanguage, useI18n } from "./i18n";
import { Select } from "./ui/Select";
import type { MessageKey } from "./i18n/en";
import { Accounts } from "./accounts/Accounts";
import { Builds } from "./builds/Builds";
import { Content, type Kind } from "./content/Content";
import { Friends } from "./friends/Friends";
import { SocialProvider, useSocial } from "./friends/social";
import { Home, requestNewInstance } from "./home/Home";
import { Profile } from "./profile/Profile";
import { Rooms } from "./rooms/Rooms";
import { LauncherProvider, useLauncher } from "./lib/launcher";
import { JavaSettings } from "./settings/JavaSettings";
import { Storage } from "./settings/Storage";
import { UpdatePrompt, Updates, useUpdate } from "./settings/Updates";
import { Palette } from "./ui/Palette";
import { Legal } from "./settings/Legal";
import { AppearanceExtras, SettingsBackup, useAppearance } from "./settings/Appearance";
import { UiEditor, useUiProfile } from "./settings/UiEditor";
import { HotkeyHelp, needsOnboarding, Onboarding } from "./home/Onboarding";
import { Intro } from "./home/Intro";
import { Wardrobe } from "./skins/Wardrobe";
import { useTheme, type ThemePref } from "./theme";
import { Icon, type IconName } from "./ui/Icon";
import { Glyph } from "./ui/Glyph";
import { Recover } from "./ui/Recover";
import { MiniPlayer, miniPlayerOn, setMiniPlayerOn } from "./ui/MiniPlayer";

type Page = "home" | "profile" | "rooms" | "friends" | "builds" | "content" | "skins" | "accounts" | "settings";
const PAGES: Page[] = ["home", "profile", "rooms", "friends", "builds", "content", "skins", "accounts", "settings"];
const ICONS: Record<Page, IconName> = {
  home: "home",
  profile: "profile",
  rooms: "rooms",
  friends: "friends",
  builds: "library",
  content: "content",
  skins: "wardrobe",
  accounts: "accounts",
  settings: "settings",
};
const THEMES: ThemePref[] = ["system", "light", "dark"];
const HIDEABLE = PAGES.filter((p) => p !== "home" && p !== "settings");

function App() {
  const { t } = useI18n();
  const [page, setPage] = useState<Page>("home");
  const [palette, setPalette] = useState(false);
  const [contentTab, setContentTab] = useState<Kind>("mod");
  const [theme, setTheme] = useTheme();
  const background = useAppearance();
  const [intro, setIntro] = useState(needsOnboarding);
  const [onboarding, setOnboarding] = useState(needsOnboarding);
  const [keysHelp, setKeysHelp] = useState(false);
  const ui = useUiProfile();
  const pages = PAGES.filter((p) => !ui.hidden.includes(p));
  const pagesRef = useRef(pages);
  pagesRef.current = pages;
  const main = useRef<HTMLElement>(null);

  useEffect(() => {
    main.current?.scrollTo(0, 0);
  }, [page]);

  useEffect(() => {
    if (!pages.includes(page)) setPage("home");
  }, [pages, page]);

  useEffect(() => {
    const take = () =>
      invoke<string | null>("pack_request").then((code) => {
        if (!code) return;
        setPage("home");
        requestNewInstance(code);
      });
    take();
    const un = listen("pack-request", take);
    return () => {
      un.then((f) => f());
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName));
      const mod = e.ctrlKey || e.metaKey;
      if (e.key === "Escape") setKeysHelp(false);
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((v) => !v);
        return;
      }
      if (mod && /^[1-9]$/.test(e.key) && pagesRef.current[Number(e.key) - 1]) {
        e.preventDefault();
        setPage(pagesRef.current[Number(e.key) - 1]);
      } else if (mod && e.key === ",") {
        e.preventDefault();
        setPage("settings");
      } else if (!typing && !mod && e.key === "?") {
        setKeysHelp((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    invoke("tray_labels", { show: t("tray.show"), quit: t("tray.quit") }).catch(() => {});
  }, [t]);

  return (
    <LauncherProvider onNeedAccount={() => setPage("accounts")}>
      <SocialProvider>
        {background && <img className="app-bg" src={background} alt="" aria-hidden />}
        <div className="shell">
          <nav className="rail" aria-label="Kromvia">
            <img className="rail-logo" src="/logo.svg" alt="Kromvia" width="34" height="34" />
            <div className="rail-items" style={{ "--nav-index": pages.indexOf(page) } as CSSProperties}>
              <div className="rail-marker" aria-hidden="true" />
              {pages.map((p) => (
                <button
                  key={p}
                  className="rail-btn"
                  aria-current={page === p ? "page" : undefined}
                  onClick={() => setPage(p)}
                >
                  <Icon name={ICONS[p]} size={18} />
                  <span className="rail-label">{t(`nav.${p}` as MessageKey)}</span>
                  {p === "friends" && <UnreadBadge />}
                  {p === "settings" && <UpdateBadge />}
                </button>
              ))}
            </div>
            <MiniPlayer />
          </nav>
          <main className="main" ref={main}>
            <div className="page" key={page} data-page={page}>
              <Recover page>
                {page === "home" && <Home onNavigate={setPage} />}
                {page === "profile" && <Profile onFriends={() => setPage("friends")} />}
                {page === "rooms" && <Rooms />}
                {page === "friends" && <Friends />}
                {page === "builds" && (
                  <Builds
                    onAccounts={() => setPage("accounts")}
                    onAddContent={(kind) => {
                      setContentTab(kind);
                      setPage("content");
                    }}
                  />
                )}
                {page === "content" && <Content initialTab={contentTab} />}
                {page === "skins" && <Wardrobe />}
                {page === "accounts" && <Accounts />}
                {page === "settings" && <Settings theme={theme} setTheme={setTheme} />}
              </Recover>
            </div>
          </main>
        </div>
        {intro && <Intro onDone={() => setIntro(false)} />}
        {onboarding && !intro && (
          <Onboarding
            theme={theme}
            setTheme={setTheme}
            onDone={(go) => {
              setOnboarding(false);
              setPage(go);
            }}
          />
        )}
        {keysHelp && <HotkeyHelp onClose={() => setKeysHelp(false)} />}
        {!intro && <UpdatePrompt />}
        {palette && <Palette pages={pages} onPage={setPage} onClose={() => setPalette(false)} />}
        <LaunchKeys onPage={setPage} />
      </SocialProvider>
    </LauncherProvider>
  );
}

function LaunchKeys({ onPage }: { onPage: (p: Page) => void }) {
  const l = useLauncher();
  const ref = useRef(l);
  ref.current = l;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const { current, runOf, jobOf, play } = ref.current;
      const key = e.key.toLowerCase();
      if (e.key === "Enter" && current) {
        e.preventDefault();
        const run = runOf(current.id);
        if (run) invoke("game_stop", { runId: run.runId });
        else if (!jobOf(current.id)) play(current);
      } else if (key === "n" && !e.shiftKey) {
        e.preventDefault();
        onPage("home");
        requestNewInstance();
      } else if (key === "b" && current) {
        e.preventDefault();
        onPage("builds");
      } else if (key === "f") {
        const search = document.querySelector<HTMLInputElement>(".page [data-search]");
        if (search) {
          e.preventDefault();
          search.focus();
          search.select();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return null;
}

function UnreadBadge() {
  const { totalUnread } = useSocial();
  return totalUnread > 0 ? <span className="unread">{totalUnread}</span> : null;
}

function UpdateBadge() {
  return useUpdate() ? <span className="unread">↑</span> : null;
}

function MiniPlayerToggle() {
  const { t } = useI18n();
  const [on, setOn] = useState(miniPlayerOn);
  return (
    <label className="muted">
      <input
        type="checkbox"
        checked={on}
        onChange={(e) => {
          setOn(e.currentTarget.checked);
          setMiniPlayerOn(e.currentTarget.checked);
        }}
      />{" "}
      {t("player.setting")}
    </label>
  );
}

const DISCORD_INVITE = "https://discord.gg/vTh3e8YpgF";
const SUPPORT_JAR = "https://send.monobank.ua/jar/7k6Bs5BVdY";

function Settings({ theme, setTheme }: { theme: ThemePref; setTheme: (t: ThemePref) => void }) {
  const { t } = useI18n();
  const [version, setVersion] = useState("");

  useEffect(() => {
    getVersion().then(setVersion, () => {});
  }, []);

  return (
    <>
      <h1 className="page-title">{t("nav.settings")}</h1>
      <Updates />
      <section className="card">
        <h2>{t("settings.appearance")}</h2>
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
        <div className="field">
          <span>{t("settings.language")}</span>
          <Select
            value={language}
            label={t("settings.language")}
            options={Object.entries(LANGUAGES).map(([value, label]) => ({ value, label }))}
            onChange={setLanguage}
          />
        </div>
        <MiniPlayerToggle />
        <AppearanceExtras />
      </section>
      <UiEditor pages={HIDEABLE} />
      <JavaSettings />
      <Storage />
      <SettingsBackup />
      <div className="actions">
        <button className="btn btn-ghost" onClick={() => invoke("launcher_log_open")}>
          <Glyph name="folder" /> {t("settings.launcherLog")}
        </button>
        <button className="btn btn-ghost" onClick={() => openUrl(DISCORD_INVITE)}>
          <Glyph name="brand-discord" /> {t("settings.discord")}
        </button>
        <button className="btn btn-ghost" onClick={() => openUrl(SUPPORT_JAR)}>
          <Glyph name="heart" /> {t("settings.support")}
        </button>
      </div>
      {version && <p className="version muted">{t("settings.version", { version })}</p>}
      <Legal />
    </>
  );
}

export default App;
