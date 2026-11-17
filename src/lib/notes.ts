import { useSyncExternalStore } from "react";

export type NoteKind = "message" | "party" | "crash" | "update" | "pack" | "perf";
export type Note = { id: string; kind: NoteKind; text: string; at: number; read: boolean; page: string };

const KEY = "kromvia.notes";
const MAX = 100;
const listeners = new Set<() => void>();

function load(): Note[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

let notes = load();

function save(next: Note[]) {
  notes = next.slice(0, MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(notes));
  } catch {}
  listeners.forEach((l) => l());
}

export function pushNote(note: Omit<Note, "at" | "read">, once = false) {
  if (once && notes.some((n) => n.id === note.id)) return;
  save([{ ...note, at: Date.now(), read: false }, ...notes.filter((n) => n.id !== note.id)]);
}

export function readNotes() {
  if (notes.some((n) => !n.read)) save(notes.map((n) => (n.read ? n : { ...n, read: true })));
}

export function clearNotes() {
  save([]);
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useNotes() {
  return useSyncExternalStore(subscribe, () => notes);
}
