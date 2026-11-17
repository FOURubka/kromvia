import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { MOUSE, Mesh, Object3D, Raycaster, Vector2 } from "three";
import { SkinViewer } from "skinview3d";
import { useI18n } from "../i18n";
import { Glyph } from "../ui/Glyph";

type Tool = "pencil" | "eraser" | "fill";
type Layer = "base" | "overlay";
const TOOLS: Tool[] = ["pencil", "eraser", "fill"];
const SIZE = 64;
const HISTORY = 50;
const PALETTE = [
  "#000000", "#3f3f46", "#a1a1aa", "#ffffff",
  "#f5d0b0", "#d9a37a", "#a0663f", "#5c3a21",
  "#e45c5c", "#f2994a", "#f2c94c", "#7bd93a",
  "#2dd4bf", "#3b82f6", "#8b5cf6", "#ec4899",
];
const PARTS = ["head", "body", "rightArm", "leftArm", "rightLeg", "leftLeg"] as const;

function hexToRgba(hex: string): [number, number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
}

function rgbaToHex([r, g, b]: number[]) {
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
}

function meshes(root: Object3D): Mesh[] {
  const out: Mesh[] = [];
  root.traverse((o) => {
    if ((o as Mesh).isMesh) out.push(o as Mesh);
  });
  return out;
}

export function SkinEditor({ initial, initialSlim, onSaved }: { initial: string | null; initialSlim: boolean; onSaved: () => void }) {
  const { t } = useI18n();
  const view = useRef<HTMLCanvasElement>(null);
  const viewer = useRef<SkinViewer | null>(null);
  const tex = useRef<HTMLCanvasElement>(document.createElement("canvas"));
  const history = useRef<ImageData[]>([]);
  const last = useRef<[number, number] | null>(null);
  const [tool, setTool] = useState<Tool>("pencil");
  const [layer, setLayer] = useState<Layer>("base");
  const [showOverlay, setShowOverlay] = useState(true);
  const [color, setColor] = useState("#8b5cf6");
  const [recent, setRecent] = useState<string[]>([]);
  const [slim, setSlim] = useState(initialSlim);
  const [name, setName] = useState("");
  const [status, setStatus] = useState<{ error: boolean; text: string } | null>(null);
  const state = useRef({ tool, layer, color, slim });
  state.current = { tool, layer, color, slim };

  const ctx = () => tex.current.getContext("2d", { willReadFrequently: true })!;
  const refresh = () => viewer.current?.loadSkin(tex.current, { model: state.current.slim ? "slim" : "default" });

  useEffect(() => {
    tex.current.width = SIZE;
    tex.current.height = SIZE;
    const v = new SkinViewer({ canvas: view.current!, width: 420, height: 520 });
    v.zoom = 0.9;
    v.controls.enablePan = false;
    v.controls.mouseButtons = { LEFT: -1 as unknown as MOUSE, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.ROTATE };
    viewer.current = v;
    const box = view.current!.parentElement!;
    const ro = new ResizeObserver(() => {
      const w = Math.max(200, Math.min(440, box.clientWidth - 32));
      v.width = w;
      v.height = Math.round((w * 520) / 420);
    });
    ro.observe(box);
    return () => {
      ro.disconnect();
      v.dispose();
    };
  }, []);

  useEffect(() => {
    const c = ctx();
    c.clearRect(0, 0, SIZE, SIZE);
    history.current = [];
    if (!initial) return refresh();
    const img = new Image();
    img.onload = () => {
      c.drawImage(img, 0, 0);
      refresh();
    };
    img.src = initial;
  }, [initial]);

  useEffect(refresh, [slim]);

  useEffect(() => {
    const v = viewer.current;
    if (!v) return;
    for (const p of PARTS) v.playerObject.skin[p].outerLayer.visible = showOverlay || layer === "overlay";
  }, [showOverlay, layer]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

  const snapshot = () => {
    history.current.push(ctx().getImageData(0, 0, SIZE, SIZE));
    if (history.current.length > HISTORY) history.current.shift();
  };

  const undo = () => {
    const prev = history.current.pop();
    if (prev) {
      ctx().putImageData(prev, 0, 0);
      refresh();
    }
  };

  const pixelAt = (e: React.PointerEvent): [number, number] | null => {
    const v = viewer.current!;
    const r = view.current!.getBoundingClientRect();
    const ray = new Raycaster();
    ray.setFromCamera(new Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), v.camera);
    const targets = PARTS.flatMap((p) => meshes(state.current.layer === "overlay" ? v.playerObject.skin[p].outerLayer : v.playerObject.skin[p].innerLayer));
    const hit = ray.intersectObjects(targets, false)[0];
    if (!hit?.uv || !hit.face) return null;
    const uv = (hit.object as Mesh).geometry.attributes.uv;
    const us = [hit.face.a, hit.face.b, hit.face.c].map((i) => uv.getX(i));
    const vs = [hit.face.a, hit.face.b, hit.face.c].map((i) => 1 - uv.getY(i));
    const clamp = (n: number, lo: number[]) => Math.min(Math.ceil(Math.max(...lo) * SIZE) - 1, Math.max(Math.floor(Math.min(...lo) * SIZE), n));
    return [clamp(Math.floor(hit.uv.x * SIZE), us), clamp(Math.floor((1 - hit.uv.y) * SIZE), vs)];
  };

  const plot = (x: number, y: number) => {
    const c = ctx();
    const { tool, layer, color } = state.current;
    if (tool === "eraser") {
      if (layer === "overlay") c.clearRect(x, y, 1, 1);
      return;
    }
    c.fillStyle = color;
    c.fillRect(x, y, 1, 1);
  };

  const line = (from: [number, number], to: [number, number]) => {
    if (Math.abs(to[0] - from[0]) > 2 || Math.abs(to[1] - from[1]) > 2) return plot(...to);
    let [x, y] = from;
    const dx = Math.abs(to[0] - x);
    const dy = -Math.abs(to[1] - y);
    const sx = x < to[0] ? 1 : -1;
    const sy = y < to[1] ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      plot(x, y);
      if (x === to[0] && y === to[1]) break;
      const e2 = 2 * err;
      if (e2 >= dy) (err += dy), (x += sx);
      if (e2 <= dx) (err += dx), (y += sy);
    }
  };

  const fill = (x: number, y: number) => {
    const c = ctx();
    const img = c.getImageData(0, 0, SIZE, SIZE);
    const d = img.data;
    const idx = (px: number, py: number) => (py * SIZE + px) * 4;
    const target = Array.from(d.slice(idx(x, y), idx(x, y) + 4));
    const paint = hexToRgba(state.current.color);
    if (target.every((v, i) => v === paint[i])) return;
    const same = (i: number) => target.every((v, k) => d[i + k] === v);
    const stack = [[x, y]];
    while (stack.length) {
      const [px, py] = stack.pop()!;
      if (px < 0 || py < 0 || px >= SIZE || py >= SIZE) continue;
      const i = idx(px, py);
      if (!same(i)) continue;
      paint.forEach((v, k) => (d[i + k] = v));
      stack.push([px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]);
    }
    c.putImageData(img, 0, 0);
  };

  const use = (hex: string) => {
    setColor(hex);
    setRecent((r) => [hex, ...r.filter((c) => c !== hex)].slice(0, 8));
  };

  const down = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const p = pixelAt(e);
    if (!p) return;
    if (e.altKey) {
      const px = ctx().getImageData(p[0], p[1], 1, 1).data;
      if (px[3] > 0) use(rgbaToHex(Array.from(px)));
      return;
    }
    view.current!.setPointerCapture(e.pointerId);
    snapshot();
    if (state.current.tool === "fill") {
      fill(...p);
      refresh();
      return;
    }
    plot(...p);
    last.current = p;
    refresh();
  };

  const move = (e: React.PointerEvent) => {
    if (!last.current) return;
    const p = pixelAt(e);
    if (!p) return;
    line(last.current, p);
    last.current = p;
    refresh();
  };

  const up = () => {
    if (last.current && !recent.includes(color)) use(color);
    last.current = null;
  };

  const save = () => {
    setStatus(null);
    invoke("wardrobe_add_data", { dataUrl: tex.current.toDataURL("image/png"), name: name.trim() || "Edited skin", slim }).then(
      () => (setStatus({ error: false, text: t("editor.saved") }), onSaved()),
      (e) => setStatus({ error: true, text: String(e) }),
    );
  };

  return (
    <div className="wardrobe skin-edit">
      <section className="card wardrobe-stage">
        <canvas
          ref={view}
          className="skin-paint"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          onContextMenu={(e) => e.preventDefault()}
        />
        <small className="muted">{t("editor.hint")}</small>
      </section>
      <section className="card skin-editor">
        <div className="segmented">
          {(["base", "overlay"] as Layer[]).map((k) => (
            <button key={k} aria-pressed={layer === k} onClick={() => setLayer(k)}>
              {t(`editor.${k}` as const)}
            </button>
          ))}
        </div>
        <label className="muted">
          <input type="checkbox" checked={showOverlay} onChange={(e) => setShowOverlay(e.currentTarget.checked)} /> {t("editor.showOverlay")}
        </label>
        <div className="segmented">
          {TOOLS.map((k) => (
            <button key={k} aria-pressed={tool === k} disabled={k === "eraser" && layer === "base"} onClick={() => setTool(k)}>
              {t(`editor.${k}` as const)}
            </button>
          ))}
        </div>
        <div className="skin-palette">
          {PALETTE.map((c) => (
            <button key={c} style={{ background: c }} aria-label={c} aria-pressed={color === c} onClick={() => use(c)} />
          ))}
          <label className="skin-custom" style={{ background: color }} title={t("editor.color")}>
            <input type="color" value={color} aria-label={t("editor.color")} onChange={(e) => setColor(e.currentTarget.value)} />
          </label>
        </div>
        {recent.length > 0 && (
          <div className="skin-palette recent">
            {recent.map((c) => (
              <button key={c} style={{ background: c }} aria-label={c} aria-pressed={color === c} onClick={() => setColor(c)} />
            ))}
          </div>
        )}
        <div className="actions">
          <button className="btn btn-ghost" onClick={undo}>
            <Glyph name="rotate" /> {t("editor.undo")}
          </button>
          <label className="muted">
            <input type="checkbox" checked={slim} onChange={(e) => setSlim(e.currentTarget.checked)} /> {t("editor.slim")}
          </label>
        </div>
        <div className="actions">
          <input className="input" value={name} placeholder={t("editor.name")} onChange={(e) => setName(e.currentTarget.value)} />
          <button className="btn" onClick={save}>
            <Glyph name="device-floppy" /> {t("editor.save")}
          </button>
        </div>
        {status && <p className={status.error ? "error" : "muted"}>{status.text}</p>}
      </section>
    </div>
  );
}
