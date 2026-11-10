import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useI18n } from "../i18n";
import { useJobs } from "../lib/jobs";
import { Glyph } from "../ui/Glyph";
import { NICK, useLauncher } from "../lib/launcher";

export type Account = { id: string; name: string; active: boolean; provider: "microsoft" | "elyby" };

type LoginStart = { code: { userCode: string; verificationUri: string; expiresIn: number }; jobId: number };

export function useAccounts() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const refresh = () => invoke<Account[]>("account_list").then(setAccounts);
  useEffect(() => {
    refresh();
  }, []);
  return { accounts, refresh };
}

export function Face({ url, size = 32 }: { url: string; size?: number }) {
  const layer = (x: number) => ({
    backgroundImage: `url(${url})`,
    backgroundSize: `${size * 8}px auto`,
    backgroundPosition: `-${x * size}px -${size}px`,
  });
  return (
    <span className="face" style={{ width: size, height: size }}>
      <span style={layer(1)} />
      <span style={layer(5)} />
    </span>
  );
}

export function Accounts() {
  const { t } = useI18n();
  const { accounts, refresh } = useAccounts();
  const [login, setLogin] = useState<LoginStart | null>(null);
  const [error, setError] = useState<string | null>(null);
  useJobs("account-login", (_, e) => {
    setLogin(null);
    setError(e);
    refresh();
    l.refreshAccounts();
  });

  const start = () => {
    setError(null);
    invoke<LoginStart>("account_login").then(setLogin, (e) => setError(String(e)));
  };
  const cancel = () => login && invoke("job_cancel", { id: login.jobId });
  const act = (p: Promise<unknown>) => p.then(() => (refresh(), l.refreshAccounts()), (e) => setError(String(e)));

  const l = useLauncher();
  const { offline, setOffline: keepOffline } = l;
  const [newName, setNewName] = useState<string | null>(null);
  const pickOffline = (name: string) => act(l.pickOffline(name));
  const addOffline = () => {
    const name = newName?.trim() ?? "";
    if (!NICK.test(name)) return;
    setNewName(null);
    pickOffline(name);
  };
  const offlineActive = (name: string) => !accounts.some((a) => a.active) && l.nick.trim() === name;

  const [ely, setEly] = useState<{ username: string; password: string; totp: string; needsCode: boolean } | null>(null);
  const [elyBusy, setElyBusy] = useState(false);
  const signInEly = () => {
    if (!ely) return;
    setError(null);
    setElyBusy(true);
    invoke("account_login_elyby", { username: ely.username, password: ely.password, totp: ely.needsCode ? ely.totp : null })
      .then(
        () => (setEly(null), refresh(), l.refreshAccounts()),
        (e) => {
          const msg = String(e);
          if (/two.factor/i.test(msg) && !ely.needsCode) setEly({ ...ely, needsCode: true });
          else setError(msg);
        },
      )
      .finally(() => setElyBusy(false));
  };

  return (
    <>
      <div className="page-head">
        <h1 className="page-title">{t("nav.accounts")}</h1>
        {!login && (
          <div className="actions">
            <button className="btn btn-ghost" onClick={() => setNewName("")}>
              <Glyph name="user-plus" /> {t("account.addOffline")}
            </button>
            <button className="btn btn-ghost" onClick={() => setEly({ username: "", password: "", totp: "", needsCode: false })}>
              <Glyph name="user-plus" /> {t("account.addEly")}
            </button>
            <button className="btn" onClick={start}>
              <Glyph name="user-plus" /> {t("account.add")}
            </button>
          </div>
        )}
      </div>
      {error && <p className="error">{error}</p>}
      {!l.account && !NICK.test(l.nick.trim()) && !login && <p className="launch-error">{t("launch.needAccount")}</p>}
      {login && (
        <section className="card">
          <h2>{t("account.signin")}</h2>
          <p className="muted">{t("account.enterCode")}</p>
          <div className="field">
            <code className="user-code">{login.code.userCode}</code>
            <button className="btn btn-ghost" onClick={() => navigator.clipboard.writeText(login.code.userCode)}>
              <Glyph name="copy" /> {t("account.copy")}
            </button>
          </div>
          <div className="actions">
            <button className="btn btn-ghost" onClick={cancel}>
              <Glyph name="x" /> {t("common.cancel")}
            </button>
            <button className="btn" onClick={() => openUrl(login.code.verificationUri)}>
              <Glyph name="external-link" /> {t("account.openPage")}
            </button>
          </div>
        </section>
      )}
      {ely && (
        <section className="card">
          <h2>{t("account.addEly")}</h2>
          <p className="muted">{t("account.elyHint")}</p>
          <form
            className="field"
            onSubmit={(e) => {
              e.preventDefault();
              signInEly();
            }}
          >
            <input className="input" autoFocus autoComplete="username" value={ely.username} placeholder={t("account.elyLogin")} aria-label={t("account.elyLogin")} onChange={(e) => setEly({ ...ely, username: e.currentTarget.value })} />
            <input className="input" type="password" autoComplete="current-password" value={ely.password} placeholder={t("account.elyPassword")} aria-label={t("account.elyPassword")} onChange={(e) => setEly({ ...ely, password: e.currentTarget.value })} />
            {ely.needsCode && (
              <input className="input" inputMode="numeric" maxLength={8} value={ely.totp} placeholder={t("account.elyCode")} aria-label={t("account.elyCode")} onChange={(e) => setEly({ ...ely, totp: e.currentTarget.value })} />
            )}
            <div className="actions">
              <button type="button" className="btn btn-ghost" onClick={() => setEly(null)}>
                <Glyph name="x" /> {t("common.cancel")}
              </button>
              <button className="btn" disabled={elyBusy || !ely.username.trim() || !ely.password}>
                <Glyph name="login-2" /> {t("account.signinEly")}
              </button>
            </div>
          </form>
        </section>
      )}
      {newName !== null && (
        <section className="card">
          <h2>{t("account.addOffline")}</h2>
          <p className="muted">{t("account.offlineHint")}</p>
          <div className="field">
            <input
              className="input"
              autoFocus
              maxLength={16}
              value={newName}
              placeholder={t("home.nickname")}
              aria-label={t("home.nickname")}
              onChange={(e) => setNewName(e.currentTarget.value)}
              onKeyDown={(e) => e.key === "Enter" && addOffline()}
            />
          </div>
          {newName && !NICK.test(newName.trim()) && <p className="error">{t("account.badNick")}</p>}
          <div className="actions">
            <button className="btn btn-ghost" onClick={() => setNewName(null)}>
              <Glyph name="x" /> {t("common.cancel")}
            </button>
            <button className="btn" disabled={!NICK.test(newName.trim())} onClick={addOffline}>
              <Glyph name="plus" /> {t("account.addShort")}
            </button>
          </div>
        </section>
      )}
      {accounts.length === 0 && offline.length === 0 && !login && <p className="muted">{t("account.none")}</p>}
      <ul className="list">
        {accounts.map((a) => (
          <li key={a.id} className="list-row instance" data-selected={a.active}>
            <div className="list-main">
              <span className="instance-name">{a.name}</span>
              <span className="muted">{a.active ? t("account.active") : a.provider === "elyby" ? "Ely.by" : "Microsoft"}</span>
            </div>
            <button className="btn btn-ghost" onClick={() => act(invoke("account_remove", { id: a.id }))}>
              <Glyph name="logout" /> {t("account.signout")}
            </button>
            {!a.active && (
              <button className="btn" onClick={() => act(invoke("account_select", { id: a.id }))}>
                <Glyph name="user-check" /> {t("account.use")}
              </button>
            )}
          </li>
        ))}
        {offline.map((name) => (
          <li key={`offline-${name}`} className="list-row instance" data-selected={offlineActive(name)}>
            <div className="list-main">
              <span className="instance-name">{name}</span>
              <span className="muted">{offlineActive(name) ? t("account.active") : t("account.offline")}</span>
            </div>
            <button className="btn btn-ghost" onClick={() => keepOffline(offline.filter((n) => n !== name))}>
              <Glyph name="trash" /> {t("instance.delete")}
            </button>
            {!offlineActive(name) && (
              <button className="btn" onClick={() => pickOffline(name)}>
                <Glyph name="user-check" /> {t("account.use")}
              </button>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
