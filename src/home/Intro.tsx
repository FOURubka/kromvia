import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useI18n } from "../i18n";

export const INTRO_CREDITS = [
  "Intro animation: “If Minecraft had a Netflix Opening Credits” by Cube Canvas (https://www.youtube.com/watch?v=5NARjQQKgf4).",
  "Music: “Aria Math” by C418, “Aria Math x Cinematic Orchestra” arrangement by AMBNT.",
  "Minecraft © Mojang AB / Microsoft. Kromvia is not an official Minecraft product and is not approved by or associated with Mojang or Microsoft.",
];

const CHUNK = 256 * 1024;

async function readIntro(ext: string) {
  const parts: Uint8Array<ArrayBuffer>[] = [];
  for (let offset = 0; ; ) {
    const b64 = await invoke<string>("intro_video", { ext, offset });
    const buf = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    if (buf.length) parts.push(buf);
    offset += buf.length;
    if (buf.length < CHUNK) return parts;
  }
}

const WEBM = 'video/webm; codecs="vp9,opus"';

function stream(v: HTMLVideoElement, blob: Blob) {
  return blob.arrayBuffer().then(
    (data) =>
      new Promise<void>((resolve, reject) => {
        const ms = new MediaSource();
        ms.addEventListener(
          "sourceopen",
          () => {
            const sb = ms.addSourceBuffer(WEBM);
            sb.addEventListener("updateend", () => ms.endOfStream(), { once: true });
            sb.addEventListener("error", reject, { once: true });
            sb.appendBuffer(data);
            resolve();
          },
          { once: true },
        );
        v.src = URL.createObjectURL(ms);
      }),
  );
}

export function Intro({ onDone }: { onDone: () => void }) {
  const { t } = useI18n();
  const video = useRef<HTMLVideoElement>(null);
  const tries = useRef(["webm", "mp4"]);

  const play = (v: HTMLVideoElement) =>
    v.play().catch(() => {
      v.muted = true;
      return v.play();
    });

  const busy = useRef(false);

  const fallback = () => {
    if (busy.current) return;
    const v = video.current;
    const ext = tries.current.shift();
    if (!v || !ext) return onDone();
    busy.current = true;
    readIntro(ext)
      .catch(() => fetch(`/intro.${ext}`).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject())))
      .then((buf) => {
        const blob = new Blob(Array.isArray(buf) ? buf : [buf], { type: `video/${ext}` });
        v.muted = false;
        return (ext === "webm" && "MediaSource" in window && MediaSource.isTypeSupported(WEBM) ? stream(v, blob) : Promise.resolve((v.src = URL.createObjectURL(blob)))).then(() =>
          play(v).finally(() => (busy.current = false)),
        );
      })
      .catch(() => {
        busy.current = false;
        fallback();
      });
  };

  useEffect(() => {
    const v = video.current;
    if (v) play(v).catch(fallback);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="intro" role="dialog" aria-modal="true" aria-label="Kromvia">
      <video ref={video} playsInline onEnded={onDone} onError={fallback}>
        <source src="/intro.webm" type="video/webm" />
        <source src="/intro.mp4" type="video/mp4" onError={fallback} />
      </video>
      <div className="intro-credits">
        {INTRO_CREDITS.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
      <button className="btn btn-ghost intro-skip" onClick={onDone}>
        {t("onboarding.skip")}
      </button>
    </div>
  );
}
