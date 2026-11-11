import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useI18n } from "../i18n";
import { Glyph } from "./Glyph";

type Track = {
  player: string;
  title: string;
  artist: string;
  album: string;
  art: string | null;
  playing: boolean;
  positionMs: number;
  lengthMs: number;
  at: number;
};

const KEY = "kromvia.miniPlayer";
const CHANGED = "kromvia-mini-player";

export function miniPlayerOn() {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

export function setMiniPlayerOn(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
  }
  window.dispatchEvent(new Event(CHANGED));
}

function useTrack() {
  const [track, setTrack] = useState<Track | null>(null);
  useEffect(() => {
    invoke<Track | null>("media_now").then(setTrack, () => {});
    const off = listen<Track | null>("media", (e) => setTrack(e.payload));
    return () => {
      off.then((f) => f());
    };
  }, []);
  return track;
}

function useOn() {
  const [on, setOn] = useState(miniPlayerOn);
  useEffect(() => {
    const update = () => setOn(miniPlayerOn());
    window.addEventListener(CHANGED, update);
    return () => window.removeEventListener(CHANGED, update);
  }, []);
  return on;
}

function time(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function Progress({ track }: { track: Track }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!track.playing) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [track.playing]);
  const pos = Math.min(track.lengthMs || Infinity, track.positionMs + (track.playing ? Math.max(0, now - track.at) : 0));
  if (!track.lengthMs) return null;
  return (
    <div className="mini-progress">
      <span>{time(pos)}</span>
      <div className="mini-bar">
        <div style={{ width: `${(pos / track.lengthMs) * 100}%` }} />
      </div>
      <span>{time(track.lengthMs)}</span>
    </div>
  );
}

export function MiniPlayer() {
  const { t } = useI18n();
  const track = useTrack();
  const on = useOn();
  const [open, setOpen] = useState(false);

  if (!on || !track) return null;
  const control = (action: string) => invoke("media_control", { action }).catch(() => {});

  return (
    <div className="mini-player">
      <button
        className="mini-cover"
        data-playing={track.playing || undefined}
        aria-expanded={open}
        aria-label={`${track.title} - ${track.artist}`}
        onClick={() => setOpen((v) => !v)}
      >
        {track.art ? <img src={track.art} alt="" /> : <Glyph name="music" size={16} />}
      </button>
      {open && (
        <div className="mini-card" role="dialog" aria-label={t("player.title")}>
          <div className="mini-head">
            {track.art ? <img className="mini-art" src={track.art} alt="" /> : <div className="mini-art"><Glyph name="music" size={22} /></div>}
            <div className="mini-text">
              <strong title={track.title}>{track.title}</strong>
              <span title={track.artist}>{track.artist}</span>
              <small>{track.player}</small>
            </div>
          </div>
          <Progress track={track} />
          <div className="mini-controls">
            <button className="btn btn-ghost" aria-label={t("player.previous")} onClick={() => control("previous")}>
              <Glyph name="player-skip-back" />
            </button>
            <button className="btn" aria-label={track.playing ? t("player.pause") : t("player.play")} onClick={() => control("play_pause")}>
              <Glyph name={track.playing ? "player-pause" : "player-play"} />
            </button>
            <button className="btn btn-ghost" aria-label={t("player.next")} onClick={() => control("next")}>
              <Glyph name="player-skip-forward" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
