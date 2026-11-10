import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useJobs, type JobProgress } from "./jobs";
import { useAccounts, type Account } from "../accounts/Accounts";
import { outfitFromGame, outfitWorn, pushOutfit, savedOutfit, type Outfit } from "./outfit";
import type { LogLine } from "../home/Console";

export type LoaderKind = "fabric" | "quilt" | "legacyfabric" | "ornithe" | "forge" | "neoforge";
export type Instance = {
  id: string;
  name: string;
  mcVersion: string;
  loader: { kind: LoaderKind; version: string } | null;
  memoryMb: number | null;
  javaPath: string | null;
  jvmArgs: string | null;
  gpu: "discrete" | "integrated" | null;
  group: string | null;
  resolution: { width: number; height: number } | null;
  created: number;
  icon: string | null;
  noClient: boolean;
};

export const LOADER_NAMES: Record<LoaderKind, string> = {
  fabric: "Fabric",
  quilt: "Quilt",
  legacyfabric: "Legacy Fabric",
  ornithe: "Ornithe",
  forge: "Forge",
  neoforge: "NeoForge",
};

type RunInfo = { runId: number; instanceId: string };
export type CrashCause = "outOfMemory" | "tooMuchMemory" | "wrongJava" | "missingMod" | "duplicateMod" | "brokenMod" | "modRemoved" | "driver" | "unknown";
export type Crash = { cause: CrashCause; detail: string | null; report: string | null; auto: boolean };
export type ModsChange = { removed: string[]; added: string[] };
type ExitEvent = RunInfo & { code: number | null; crash: Crash | null };
export type LaunchExtra = { join?: string; world?: string; room?: boolean };

const NICK_KEY = "kromvia.nickname";
const OFFLINE_KEY = "kromvia.offlineAccounts";
export const NICK = /^[A-Za-z0-9_]{3,16}$/;
const MAX_LINES = 5000;
const ROOM_LINE = /Domain assigned: (\S+)/;

function savedNick() {
  try {
    return localStorage.getItem(NICK_KEY) ?? "";
  } catch {
    return "";
  }
}

function savedOffline(): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(OFFLINE_KEY) ?? "[]");
    return Array.isArray(list) ? list.filter((n) => typeof n === "string") : [];
  } catch {
    return [];
  }
}

function useLauncherState(onNeedAccount: () => void) {
  const [instances, setInstances] = useState<Instance[]>([]);
  const [nick, setNickState] = useState(savedNick);
  const [offline, setOfflineState] = useState(savedOffline);
  const [running, setRunning] = useState<RunInfo[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [exits, setExits] = useState<Record<string, number | null>>({});
  const [crashes, setCrashes] = useState<Record<string, Crash>>({});
  const [modsChanged, setModsChanged] = useState<Record<string, ModsChange>>({});
  const [logs, setLogs] = useState<Record<string, LogLine[]>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [rooms, setRooms] = useState<Record<string, string>>({});
  const [hosting, setHosting] = useState<string | null>(null);

  const { accounts, refresh: refreshAccounts } = useAccounts();
  const account: Account | undefined = accounts.find((a) => a.active);

  const refresh = () => invoke<Instance[]>("instance_list").then(setInstances);
  const setError = (id: string, error: string | null) =>
    setErrors(({ [id]: _, ...rest }) => (error ? { ...rest, [id]: error } : rest));

  const { jobs, started } = useJobs("launch-", (key, error) => setError(key.slice("launch-".length), error));

  useEffect(() => {
    refresh();
    const runs: Record<number, string> = {};
    invoke<RunInfo[]>("game_running").then((list) => {
      list.forEach((r) => (runs[r.runId] = r.instanceId));
      setRunning(list);
    });
    const unStart = listen<RunInfo>("game-started", ({ payload }) => {
      runs[payload.runId] = payload.instanceId;
      setRunning((r) => [...r, payload]);
      setLogs((l) => ({ ...l, [payload.instanceId]: [] }));
      setExits(({ [payload.instanceId]: _, ...rest }) => rest);
      setCrashes(({ [payload.instanceId]: _, ...rest }) => rest);
      setModsChanged(({ [payload.instanceId]: _, ...rest }) => rest);
    });
    const unMods = listen<ModsChange & { instanceId: string }>("game-mods-changed", ({ payload: { instanceId, removed, added } }) =>
      setModsChanged(({ [instanceId]: _, ...rest }) => (removed.length || added.length ? { ...rest, [instanceId]: { removed, added } } : rest)),
    );
    const unLog = listen<{ runId: number; line: LogLine }>("game-log", ({ payload }) => {
      const id = runs[payload.runId];
      if (!id) return;
      const room = ROOM_LINE.exec(payload.line.text);
      if (room) {
        setRooms((r) => ({ ...r, [id]: room[1] }));
        setHosting(id);
      }
      setLogs((l) => {
        const lines = [...(l[id] ?? []), payload.line];
        return { ...l, [id]: lines.length > MAX_LINES ? lines.slice(-MAX_LINES) : lines };
      });
    });
    const unExit = listen<ExitEvent>("game-exit", ({ payload }) => {
      setRunning((r) => r.filter((x) => x.runId !== payload.runId));
      setModsChanged(({ [payload.instanceId]: _, ...rest }) => rest);
      setExits((e) => ({ ...e, [payload.instanceId]: payload.code }));
      const crash = payload.crash;
      if (crash) setCrashes((c) => ({ ...c, [payload.instanceId]: crash }));
      setRooms(({ [payload.instanceId]: _, ...rest }) => rest);
      setHosting((h) => (h === payload.instanceId ? null : h));
    });
    const unScene = listen<{ runId: number; scene: string }>("game-scene", ({ payload }) => {
      const id = runs[payload.runId];
      if (!id || payload.scene !== "menu") return;
      setRooms(({ [id]: _, ...rest }) => rest);
      setHosting((h) => (h === id ? null : h));
    });
    const playRequested = (id: string | null) => {
      if (!id) return;
      Promise.all([invoke<Instance[]>("instance_list"), invoke<Account[]>("account_list")]).then(([list, accs]) => {
        const inst = list.find((i) => i.id === id);
        if (inst) launch(inst, {}, accs.find((a) => a.active)?.id ?? null, savedNick().trim());
      });
    };
    invoke<string | null>("launch_request").then(playRequested);
    const unRequest = listen<string>("launch-request", ({ payload }) => playRequested(payload));
    const unJoin = listen<{ host: string; mc: string | null }>("discord-join", ({ payload }) => {
      Promise.all([invoke<Instance[]>("instance_list"), invoke<Account[]>("account_list"), invoke<RunInfo[]>("game_running")]).then(([list, accs, runs]) => {
        const inst = list.find((i) => i.mcVersion === payload.mc) ?? list[0];
        if (inst && !runs.some((r) => r.instanceId === inst.id)) launch(inst, { join: payload.host }, accs.find((a) => a.active)?.id ?? null, savedNick().trim());
      });
    });
    invoke<Omit<Outfit, "colors"> & { colors: Record<string, number> } | null>("wardrobe_get").then(
      (w) => (w ? outfitFromGame(w) : pushOutfit()),
      () => pushOutfit(),
    ).catch(() => {});
    const unWardrobe = listen<Parameters<typeof outfitFromGame>[0]>("wardrobe-changed", ({ payload }) => {
      outfitFromGame(payload);
      invoke("social_cosmetics", { worn: outfitWorn(savedOutfit()) }).catch(() => {});
    });
    const unSwitch = listen<{ id: string | null; name: string }>("account-switched", ({ payload }) => {
      if (!payload.id) setNick(payload.name);
      refreshAccounts();
    });
    return () => {
      [unStart, unMods, unLog, unExit, unScene, unRequest, unJoin, unWardrobe, unSwitch].forEach((u) => u.then((f) => f()));
    };
  }, []);

  const setNick = (value: string) => {
    setNickState(value);
    try {
      localStorage.setItem(NICK_KEY, value);
    } catch {}
  };
  const setOffline = (list: string[]) => {
    setOfflineState(list);
    try {
      localStorage.setItem(OFFLINE_KEY, JSON.stringify(list));
    } catch {}
  };
  const rememberNick = (value = nick) => {
    const name = value.trim();
    if (NICK.test(name) && !offline.includes(name)) setOffline([...offline, name]);
  };
  const pickOffline = (name: string) => {
    setNick(name);
    rememberNick(name);
    return invoke("account_select", { id: null }).then(refreshAccounts);
  };
  const pickAccount = (id: string | null) => invoke("account_select", { id }).then(refreshAccounts);

  const launch = (inst: Instance, extra: LaunchExtra, accountId: string | null, username: string) => {
    setError(inst.id, null);
    setSelected(inst.id);
    if (extra.room) setHosting(inst.id);
    invoke<number>("game_launch", {
      instanceId: inst.id,
      username,
      accountId,
      join: extra.join ?? null,
      world: extra.world ?? null,
      room: extra.room ?? false,
    }).then(
      (id) => started(`launch-${inst.id}`, id),
      (e) => {
        setError(inst.id, String(e));
        if (extra.room) setHosting(null);
      },
    );
  };

  const play = (inst: Instance, extra: LaunchExtra = {}) => {
    if (!account && !NICK.test(nick.trim())) return onNeedAccount();
    if (!account) rememberNick();
    launch(inst, extra, account?.id ?? null, nick.trim());
  };
  const joinRoom = (room: string, mc: string) => {
    const inst = (current?.mcVersion === mc ? current : undefined) ?? instances.find((i) => i.mcVersion === mc && i.loader) ?? instances.find((i) => i.mcVersion === mc);
    if (!inst) return false;
    play(inst, { join: room });
    return true;
  };
  const name = account?.name ?? nick.trim();

  const current = instances.find((i) => i.id === selected) ?? instances[0];
  const jobOf = (id: string): JobProgress | undefined => jobs[`launch-${id}`];
  const runOf = (id: string) => running.find((r) => r.instanceId === id);

  return {
    instances,
    refresh,
    current,
    selected,
    setSelected,
    nick,
    setNick,
    name,
    offline,
    setOffline,
    rememberNick,
    pickOffline,
    pickAccount,
    accounts,
    account,
    refreshAccounts,
    running,
    errors,
    setError,
    exits,
    crashes,
    modsChanged,
    logs,
    rooms,
    hosting,
    joinRoom,
    play,
    jobOf,
    runOf,
  };
}

type Launcher = ReturnType<typeof useLauncherState>;
const Ctx = createContext<Launcher | null>(null);

export function LauncherProvider({ children, onNeedAccount }: { children: ReactNode; onNeedAccount: () => void }) {
  return <Ctx.Provider value={useLauncherState(onNeedAccount)}>{children}</Ctx.Provider>;
}

export function useLauncher() {
  const l = useContext(Ctx);
  if (!l) throw new Error("useLauncher outside LauncherProvider");
  return l;
}

export function updateInstance(inst: Instance, patch: Partial<Pick<Instance, "memoryMb" | "javaPath">>) {
  const next = { ...inst, ...patch };
  return invoke<Instance>("instance_update", {
    id: inst.id,
    settings: {
      name: next.name,
      mcVersion: next.mcVersion,
      loader: next.loader,
      memoryMb: next.memoryMb,
      javaPath: next.javaPath,
      jvmArgs: next.jvmArgs,
      resolution: next.resolution,
      gpu: next.gpu,
      group: next.group,
    },
  });
}

export function formatBytes(n: number) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) (n /= 1024), i++;
  return `${n < 10 && i > 0 ? n.toFixed(1) : Math.round(n)} ${units[i]}`;
}

export function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h} h ${m} min`;
  if (m > 0) return `${m} min`;
  return `${seconds} s`;
}

export function describe(inst: Instance, vanilla: string) {
  return `${inst.loader ? LOADER_NAMES[inst.loader.kind] : vanilla} ${inst.mcVersion}`;
}
