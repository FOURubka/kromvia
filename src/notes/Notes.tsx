import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useI18n } from "../i18n";
import { clearNotes, pushNote, readNotes, useNotes, type NoteKind } from "../lib/notes";
import type { Instance } from "../lib/launcher";
import { useUpdate } from "../settings/Updates";
import { Empty } from "../ui/Empty";
import { Glyph, type GlyphName } from "../ui/Glyph";

const GLYPH: Record<NoteKind, GlyphName> = {
  message: "users-group",
  party: "user-plus",
  crash: "x",
  update: "download",
  pack: "refresh",
  perf: "bolt",
};

export function NoteSources() {
  const { t } = useI18n();
  const update = useUpdate();
  useEffect(() => {
    if (update) pushNote({ id: `update:${update.version}`, kind: "update", text: t("notes.update", { version: update.version }), page: "settings" }, true);
  }, [update]);
  useEffect(() => {
    invoke<Instance[]>("instance_list").then(async (list) => {
      for (const inst of list) {
        const up = await invoke<{ project: string; version: string } | null>("modpack_update_check", { instanceId: inst.id }).catch(() => null);
        if (up) pushNote({ id: `pack:${inst.id}:${up.version}`, kind: "pack", text: t("notes.pack", { name: inst.name, version: up.version }), page: "builds" }, true);
      }
    }, () => {});
  }, []);
  return null;
}

export function Notes({ onPage }: { onPage: (page: string) => void }) {
  const { t } = useI18n();
  const notes = useNotes();
  useEffect(() => () => readNotes(), []);
  return (
    <>
      <h1 className="page-title">{t("nav.notes")}</h1>
      {notes.length === 0 ? (
        <Empty bee="idle">{t("notes.empty")}</Empty>
      ) : (
        <section className="card">
          <div className="actions">
            <button className="btn btn-ghost" onClick={readNotes}>
              <Glyph name="check" /> {t("notes.readAll")}
            </button>
            <button className="btn btn-ghost" onClick={clearNotes}>
              <Glyph name="trash" /> {t("notes.clear")}
            </button>
          </div>
          <ul className="list">
            {notes.map((n) => (
              <li key={n.id} className="list-row note" data-unread={!n.read || undefined}>
                <Glyph name={GLYPH[n.kind]} />
                <button className="list-main note-text" onClick={() => onPage(n.page)}>
                  <span>{n.text}</span>
                  <span className="muted">{new Date(n.at).toLocaleString()}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

export function NotesBadge() {
  const n = useNotes().filter((x) => !x.read).length;
  return n > 0 ? <span className="unread">{n}</span> : null;
}
