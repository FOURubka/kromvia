import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useI18n } from "../i18n";
import { Face, useAccounts } from "../accounts/Accounts";
import { SkinViewer3D } from "./SkinViewer3D";
import { SkinEditor } from "./SkinEditor";
import { Cosmetics } from "./Cosmetics";
import { capeOn, setCapeOn } from "../lib/cape";
import { savedOutfit } from "../lib/outfit";
import { capeFor } from "../art/capes";
import { Glyph } from "../ui/Glyph";
import { usePaged } from "../ui/Pager";
import { Empty } from "../ui/Empty";
import { useLauncher } from "../lib/launcher";
import { Select } from "../ui/Select";

const KROMVIA_CAPE = "kromvia";
const OPTIFINE_CAPE = "optifine";

type LibrarySkin = { id: string; name: string; slim: boolean; added: number; dataUrl: string };
type Found = { name: string; slim: boolean; dataUrl: string; capeUrl: string | null };
type Cape = { id: string; state: string; url: string; alias: string };
type Profile = { id: string; name: string; skins: { state: string; url: string }[]; capes: Cape[] };

type Shown = { kind: "library"; skin: LibrarySkin } | { kind: "found"; skin: Found };

export function Wardrobe() {
  const { t } = useI18n();
  const { accounts } = useAccounts();
  const account = accounts.find((a) => a.active && a.provider !== "elyby");
  const elyActive = accounts.some((a) => a.active && a.provider === "elyby");
  const offlineNick = useLauncher().nick.trim();
  const [library, setLibrary] = useState<LibrarySkin[]>([]);
  const [shown, setShown] = useState<Shown | null>(null);
  const [nick, setNick] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tab, setTab] = useState<"skins" | "editor" | "cosmetics">("skins");
  const [optifineCape, setOptifineCape] = useState<string | null>(null);
  const [optifineShown, setOptifineShown] = useState(false);
  const skins = usePaged(library, 24);

  const refresh = () =>
    invoke<LibrarySkin[]>("wardrobe_list").then((list) => {
      setLibrary(list);
      return list;
    });

  const run = async <T,>(p: Promise<T>): Promise<T | undefined> => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      return await p;
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    refresh().then((list) => list[0] && setShown((s) => s ?? { kind: "library", skin: list[0] }));
  }, []);

  const [fallback, setFallback] = useState<Found | null>(null);
  const who = account?.name ?? offlineNick;
  useEffect(() => {
    if (shown) return;
    const look = (name: string) => invoke<Found>("skin_lookup", { nick: name });
    look(who || "MHF_Steve")
      .catch(() => look("MHF_Steve"))
      .then(setFallback, () => {});
  }, [shown, who]);

  useEffect(() => {
    setProfile(null);
    if (!account) return;
    run(invoke<Profile>("account_profile", { id: account.id })).then((p) => {
      if (!p) return;
      setProfile(p);
      refresh();
    });
  }, [account?.id]);

  const search = async (name = nick) => {
    const found = await run(invoke<Found>("skin_lookup", { nick: name }));
    if (found) setShown({ kind: "found", skin: found });
  };

  useEffect(() => {
    if (!offlineNick) return;
    invoke<{ active: boolean }[]>("account_list").then((list) => {
      if (list.some((a) => a.active)) return;
      setNick(offlineNick);
      search(offlineNick);
    });
  }, [account?.id, offlineNick]);

  const saveFound = async (name: string) => {
    const saved = await run(invoke<LibrarySkin>("wardrobe_add_nick", { nick: name }));
    if (!saved) return;
    const list = await refresh();
    const entry = list.find((s) => s.id === saved.id);
    if (entry) setShown({ kind: "library", skin: entry });
    return entry;
  };

  const wear = async (skin: LibrarySkin) => {
    if (!account) return;
    const p = await run(invoke<Profile>("skin_wear", { id: account.id, skinId: skin.id }));
    if (p) {
      setProfile(p);
      setNotice(t("wardrobe.worn", { name: skin.name }));
    }
  };

  const upload = async (slim: boolean) => {
    const path = await open({ filters: [{ name: "PNG", extensions: ["png"] }] });
    if (!path) return;
    const added = await run(invoke<LibrarySkin>("wardrobe_add_file", { path, slim }));
    if (!added) return;
    const list = await refresh();
    const entry = list.find((s) => s.id === added.id);
    if (entry) setShown({ kind: "library", skin: entry });
  };

  const remove = async (skin: LibrarySkin) => {
    await run(invoke("wardrobe_remove", { skinId: skin.id }));
    const list = await refresh();
    setShown(list[0] ? { kind: "library", skin: list[0] } : null);
  };

  const rename = async (skin: LibrarySkin, name: string) => {
    if (!name.trim() || name === skin.name) return;
    await run(invoke("wardrobe_rename", { skinId: skin.id, name }));
    const list = await refresh();
    const entry = list.find((s) => s.id === skin.id);
    if (entry) setShown({ kind: "library", skin: entry });
  };

  const capeNick = profile?.name ?? offlineNick;
  useEffect(() => {
    setOptifineCape(null);
    setOptifineShown(false);
    if (capeNick) invoke<string | null>("optifine_cape", { nick: capeNick }).then(setOptifineCape, () => {});
  }, [capeNick]);

  const cape = profile?.capes.find((c) => c.state === "ACTIVE");
  const [kromviaCape, setKromviaCape] = useState(capeOn);
  const setCape = async (id: string | null) => {
    if (id === OPTIFINE_CAPE) {
      setOptifineShown(true);
      return;
    }
    setOptifineShown(false);
    const kromvia = id === KROMVIA_CAPE;
    setCapeOn(kromvia);
    setKromviaCape(kromvia);
    const mojang = kromvia ? null : id;
    if (!account || (cape?.id ?? null) === mojang) return;
    const p = await run(invoke<Profile>("cape_select", { id: account.id, cape: mojang }));
    if (p) setProfile(p);
  };
  const capeField = (
      <div className="field">
        <span>{t("account.cape")}</span>
        <Select
          disabled={busy}
          value={optifineShown ? OPTIFINE_CAPE : kromviaCape ? KROMVIA_CAPE : cape?.id ?? ""}
          options={[
            { value: "", label: t("account.noCape") },
            { value: KROMVIA_CAPE, label: "Kromvia" },
            ...(optifineCape ? [{ value: OPTIFINE_CAPE, label: t("account.optifineCape") }] : []),
            ...(profile?.capes.map((c) => ({ value: c.id, label: c.alias || c.id })) ?? []),
          ]}
          onChange={(v) => setCape(v || null)}
        />
      </div>
  );

  const resetSkin = async () => {
    if (!account) return;
    const p = await run(invoke<Profile>("skin_reset", { id: account.id }));
    if (p) setProfile(p);
  };

  const s = shown?.skin;
  return (
    <>
      <div className="page-head">
        <h1 className="page-title">{t("nav.skins")}</h1>
        <form
          className="nick"
          onSubmit={(e) => {
            e.preventDefault();
            search();
          }}
        >
          <input
            className="input"
            value={nick}
            maxLength={16}
            placeholder={t("wardrobe.search")}
            onChange={(e) => setNick(e.currentTarget.value)}
          />
          <button className="btn" disabled={busy || !nick.trim()}>
            <Glyph name="search" /> {t("wardrobe.find")}
          </button>
        </form>
      </div>
      <div className="segmented tabs" role="tablist">
        {(["skins", "editor", "cosmetics"] as const).map((k) => (
          <button key={k} role="tab" aria-pressed={tab === k} aria-selected={tab === k} onClick={() => setTab(k)}>
            {t(`wardrobe.tab.${k}`)}
          </button>
        ))}
      </div>
      {error && <p className="error">{error}</p>}
      {notice && <p className="muted">{notice}</p>}

      {tab === "editor" ? (
        <SkinEditor
          initial={s?.dataUrl ?? library[0]?.dataUrl ?? null}
          initialSlim={s?.slim ?? false}
          onSaved={() => {
            refresh().then((list) => list[0] && setShown({ kind: "library", skin: list[0] }));
          }}
        />
      ) : tab === "cosmetics" ? (
        <Cosmetics skin={s?.dataUrl ?? library[0]?.dataUrl ?? null} slim={s?.slim ?? false} />
      ) : (
        <>
          {!account && <p className="muted">{t(elyActive ? "wardrobe.elyAccount" : "wardrobe.needAccount")}</p>}
          <div className="wardrobe">
            <section className="card wardrobe-stage">
              <SkinViewer3D skin={(s ?? fallback)?.dataUrl ?? null} slim={(s ?? fallback)?.slim ?? false} cape={optifineShown ? optifineCape : kromviaCape ? capeFor(savedOutfit().style, savedOutfit().art).toDataURL() : cape?.url ?? null} />
              {shown?.kind === "library" && (
                <input
                  key={shown.skin.id}
                  className="input stage-name"
                  defaultValue={shown.skin.name}
                  onBlur={(e) => rename(shown.skin, e.currentTarget.value)}
                />
              )}
              {shown?.kind === "found" && <span className="instance-name">{shown.skin.name}</span>}
              <div className="actions">
                {shown?.kind === "found" && (
                  <>
                    <button className="btn btn-ghost" disabled={busy} onClick={() => saveFound(shown.skin.name)}>
                      <Glyph name="device-floppy" /> {t("wardrobe.save")}
                    </button>
                    <button
                      className="btn"
                      disabled={busy || !account}
                      onClick={async () => {
                        const entry = await saveFound(shown.skin.name);
                        if (entry) wear(entry);
                      }}
                    >
                      <Glyph name="shirt" /> {t("wardrobe.wear")}
                    </button>
                  </>
                )}
                {shown?.kind === "library" && (
                  <>
                    <button className="btn btn-ghost" disabled={busy} onClick={() => remove(shown.skin)}>
                      <Glyph name="trash" /> {t("instance.delete")}
                    </button>
                    <button className="btn" disabled={busy || !account} onClick={() => wear(shown.skin)}>
                      <Glyph name="shirt" /> {t("wardrobe.wear")}
                    </button>
                  </>
                )}
              </div>
            </section>

            <div>
              <div className="actions wardrobe-add">
                <button className="btn btn-ghost" disabled={busy} onClick={() => upload(false)}>
                  <Glyph name="upload" /> {t("wardrobe.uploadClassic")}
                </button>
                <button className="btn btn-ghost" disabled={busy} onClick={() => upload(true)}>
                  <Glyph name="upload" /> {t("wardrobe.uploadSlim")}
                </button>
              </div>
              {library.length === 0 ? (
                <Empty bee="empty-wardrobe">{t("wardrobe.empty")}</Empty>
              ) : (
                <>
                  <ul className="skin-grid">
                    {skins.items.map((skin) => (
                      <li key={skin.id}>
                        <button
                          className="skin-tile"
                          aria-pressed={shown?.kind === "library" && shown.skin.id === skin.id}
                          onClick={() => setShown({ kind: "library", skin })}
                        >
                          <Face url={skin.dataUrl} size={48} />
                          <span>{skin.name}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  {skins.pager}
                </>
              )}

              {!(account && profile) && <section className="card">{capeField}</section>}
              {account && profile && (
                <section className="card">
                  <h2>{profile.name}</h2>
                  {capeField}
                  <div className="actions">
                    <button className="btn btn-ghost" disabled={busy} onClick={resetSkin}>
                      <Glyph name="rotate" /> {t("account.resetSkin")}
                    </button>
                  </div>
                </section>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
