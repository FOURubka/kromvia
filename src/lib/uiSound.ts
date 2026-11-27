import { listen } from "@tauri-apps/api/event";

const KEY = "kromvia.uiSounds";
let ctx: AudioContext | null = null;

export const uiSoundsOn = () => localStorage.getItem(KEY) !== "0";
export const setUiSounds = (on: boolean) => localStorage.setItem(KEY, on ? "1" : "0");

function tone(at: number, freq: number, length: number, volume: number) {
  const c = ctx!;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = "triangle";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(volume, at + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
  osc.connect(gain).connect(c.destination);
  osc.start(at);
  osc.stop(at + length + 0.02);
}

export function uiSound(kind: "click" | "start" | "error") {
  if (!uiSoundsOn()) return;
  ctx ??= new AudioContext();
  const now = ctx.currentTime;
  if (kind === "click") tone(now, 1400, 0.05, 0.05);
  else if (kind === "start") [660, 880, 1320].forEach((f, i) => tone(now + i * 0.08, f, i === 2 ? 0.3 : 0.1, 0.06));
  else [330, 247].forEach((f, i) => tone(now + i * 0.12, f, 0.22, 0.07));
}

export function initUiSounds() {
  document.addEventListener(
    "click",
    (e) => {
      const el = (e.target as Element | null)?.closest("button, .btn, a[href], [role=button]");
      if (el && !(el as HTMLButtonElement).disabled) uiSound("click");
    },
    true,
  );
  listen("game-started", () => uiSound("start"));
  listen<{ error: string | null }>("job-finished", ({ payload }) => {
    if (payload.error && payload.error !== "cancelled") uiSound("error");
  });
}
