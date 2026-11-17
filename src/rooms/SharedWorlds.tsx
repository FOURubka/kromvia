import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useI18n } from "../i18n";
import { useLauncher } from "../lib/launcher";
import { useSocial } from "../friends/social";
import { Glyph } from "../ui/Glyph";
import { Select } from "../ui/Select";

type Player = { id: string; name: string; verified: boolean };
type Relay = {
  id: string;
  name: string;
  owner: string;
  version: number;
  size: number;
  updated: number;
  updatedBy: Player | null;
  holder: Player | null;
  members: Player[];
};
type Held = { id: string; instance: string; folder: string };
type Step = { id: string; stage: string; done: number; total: number };

const MB = 1024 * 1024;

export function SharedWorlds() {
  const { t } = useI18n();
  const l = useLauncher();
  const social = useSocial();
  const [relays, setRelays] = useState<Relay[] | null>(null);
  const [held, setHeld] = useState<Held | null>(null);
  const [friends, setFriends] = useState<Player[]>([]);
  const [worlds, setWorlds] = useState<{ folder: string; name: string }[]>([]);
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [step, setStep] = useState<Step | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { current } = l;

  const load = () => {
    invoke<Held | null>("relay_held").then(setHeld, () => {});
    invoke<Relay[]>("relay_list").then(setRelays, (e) => setError(String(e)));
  };

  useEffect(() => {
    if (!social.myId) return;
    load();
    invoke<{ friends: Player[] }>("social_friends").then((f) => setFriends(f.friends), () => {});
    const offs = [
      listen<{ type: string }>("social", ({ payload }) => payload.type === "relay" && load()),
      listen<Step>("relay-progress", ({ payload }) => setStep(payload)),
      listen<{ ok: boolean; error: string | null }>("relay-sync", ({ payload }) => {
        setStep(null);
        if (!payload.ok && payload.error) setError(payload.error);
        load();
      }),
    ];
    return () => offs.forEach((o) => o.then((f) => f()));
  }, [social.myId]);

  useEffect(() => {
    if (!current) return;
    invoke<{ folder: string; name: string }[]>("world_list", { instanceId: current.id }).then(
      (w) => setWorlds(w.filter((x) => !x.folder.startsWith("relay-"))),
      () => setWorlds([]),
    );
  }, [current?.id]);

  if (!social.myId) {
    return (
      <section className="card shared-worlds">
        <h2>{t("relay.title")}</h2>
        <p className="muted">{t("relay.needAccount")}</p>
      </section>
    );
  }

  const run = async (key: string, f: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    try {
      await f();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
      setStep(null);
      load();
    }
  };

  const running = current ? !!l.runOf(current.id) || !!l.jobOf(current.id) : true;

  const take = (r: Relay) =>
    current &&
    run(`take:${r.id}`, async () => {
      const folder = await invoke<string>("relay_take", { id: r.id, instanceId: current.id });
      l.play(current, { world: folder, room: true });
    });

  const create = () =>
    current &&
    pick &&
    run("create", () => invoke("relay_create", { instanceId: current.id, world: pick, name: worlds.find((w) => w.folder === pick)?.name ?? pick }).then(() => setPick("")));

  const pct = step && step.total ? Math.floor((step.done / step.total) * 100) : null;

  return (
    <section className="card shared-worlds">
      <h2>{t("relay.title")}</h2>
      <p className="muted">{t("relay.hint")}</p>

      {held && (
        <div className="relay-held">
          <span>{t("relay.holding", { name: relays?.find((r) => r.id === held.id)?.name ?? held.folder })}</span>
          <button className="btn" disabled={!!busy || running} onClick={() => run("put", () => invoke("relay_put_back"))}>
            <Glyph name="upload" /> {t("relay.putBack")}
          </button>
          <button className="btn btn-ghost" disabled={!!busy} onClick={() => run("release", () => invoke("relay_release", { id: held.id }))}>
            {t("relay.release")}
          </button>
        </div>
      )}

      {step && (
        <div className="progress-wrap">
          <span className="muted">
            {t(step.stage === "upload" ? "relay.uploading" : "relay.downloading")}
            {pct !== null && ` ${pct}% · ${Math.round(step.done / MB)}/${Math.round(step.total / MB)} MB`}
          </span>
          <div className="progress">
            <div className="progress-bar" style={{ width: pct !== null ? `${pct}%` : "100%" }} data-indeterminate={pct === null} />
          </div>
        </div>
      )}

      {relays === null ? (
        <p className="muted">{t("relay.loading")}</p>
      ) : relays.length === 0 ? (
        <p className="muted">{t("relay.empty")}</p>
      ) : (
        <ul className="relay-list">
          {relays.map((r) => {
            const mine = r.owner === social.myId;
            const takenByOther = r.holder && r.holder.id !== social.myId;
            const addable = friends.filter((f) => !r.members.some((m) => m.id === f.id));
            return (
              <li key={r.id} className="relay-item">
                <div className="relay-head">
                  <strong>{r.name}</strong>
                  <span className="muted small">
                    {r.holder ? t("relay.playing", { name: r.holder.name }) : r.updatedBy ? t("relay.lastBy", { name: r.updatedBy.name, size: Math.max(1, Math.round(r.size / MB)) }) : ""}
                  </span>
                </div>
                <div className="relay-members muted small">{r.members.map((m) => m.name).join(", ")}</div>
                <div className="relay-actions">
                  <button className="btn" disabled={!!busy || running || !!takenByOther || (!!held && held.id !== r.id) || !current?.loader} onClick={() => take(r)}>
                    <Glyph name="player-play" /> {t("relay.take")}
                  </button>
                  {mine && addable.length > 0 && (
                    <Select
                      value=""
                      label={t("relay.add")}
                      options={[{ value: "", label: t("relay.add") }, ...addable.map((f) => ({ value: f.id, label: f.name }))]}
                      onChange={(id) => id && run(`add:${r.id}`, () => invoke("relay_add", { id: r.id, friend: id }))}
                    />
                  )}
                  {mine &&
                    r.members
                      .filter((m) => m.id !== social.myId)
                      .map((m) => (
                        <button key={m.id} className="btn btn-ghost" disabled={!!busy} onClick={() => run(`kick:${r.id}`, () => invoke("relay_kick", { id: r.id, account: m.id }))}>
                          {t("relay.kick", { name: m.name })}
                        </button>
                      ))}
                  <button
                    className="btn btn-ghost"
                    disabled={!!busy}
                    onClick={() => confirm(t(mine ? "relay.deleteAsk" : "relay.leaveAsk", { name: r.name })) && run(`del:${r.id}`, () => invoke("relay_delete", { id: r.id }))}
                  >
                    {t(mine ? "relay.delete" : "relay.leave")}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="relay-new">
        <Select
          value={pick}
          label={t("relay.pickWorld")}
          options={[{ value: "", label: t("relay.pickWorld") }, ...worlds.map((w) => ({ value: w.folder, label: w.name }))]}
          onChange={setPick}
        />
        <button className="btn" disabled={!pick || !!busy || running || !!held} onClick={create}>
          <Glyph name="upload" /> {t("relay.share")}
        </button>
      </div>
      {current && !current.loader && <p className="muted small">{t("rooms.needLoader")}</p>}
      {error && <p className="error">{error}</p>}
    </section>
  );
}
