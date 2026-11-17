export type CapeStyle = "kromvia" | "ember" | "frost";

type Palette = {
  body: string[];
  trim: string;
  trimDark: string;
  mark: [string, string, string];
  feather: string[];
};

const PALETTES: Record<CapeStyle, Palette> = {
  kromvia: {
    body: ["#a35fd6", "#8a5ce8", "#6a5cf0", "#4f5ee6", "#3460dc", "#1f63d6"],
    trim: "#c9b5ff",
    trimDark: "#8b5cf6",
    mark: ["#e4dcff", "#c9b5ff", "#2f55c8"],
    feather: ["#c9b5ff", "#a78bfa", "#8b5cf6", "#6a5cf0", "#3460dc", "#2f55c8"],
  },
  ember: {
    body: ["#c2412d", "#b13a28", "#9e3323", "#8a2c1f", "#76251a", "#621e15"],
    trim: "#f2c94c",
    trimDark: "#e0a53c",
    mark: ["#f2c94c", "#f08a24", "#4a1610"],
    feather: ["#ffe08a", "#f2c94c", "#f08a24", "#d9532b", "#a63a22", "#6e2418"],
  },
  frost: {
    body: ["#4f8fd9", "#4683cc", "#3e77bd", "#366aac", "#2e5d9a", "#265088"],
    trim: "#e6f4ff",
    trimDark: "#b9dcf5",
    mark: ["#e6f4ff", "#9fd3f5", "#1c3a66"],
    feather: ["#ffffff", "#e6f4ff", "#b9dcf5", "#7fb6e8", "#4f8fd9", "#2e5d9a"],
  },
};

const MARK = ["11...11", "22..112", "22.112.", "22122..", "22.223.", "22..223", "33...33"];

function rng(seed: number) {
  return () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
}

export function capeTexture(style: CapeStyle) {
  const p = PALETTES[style];
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 32;
  const g = c.getContext("2d")!;
  const r = rng(style.length * 977);
  const put = (x: number, y: number, col: string) => {
    g.fillStyle = col;
    g.fillRect(x, y, 1, 1);
  };
  const shade = (y: number, h: number) => {
    const f = (y / h) * (p.body.length - 1);
    const i = Math.min(p.body.length - 1, Math.floor(f + (r() < f % 1 ? 1 : 0)));
    return p.body[i];
  };

  for (const [ox, outside] of [[1, true], [12, false]] as const) {
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 10; x++) {
        let col = shade(y, 16);
        if ((x === 3 || x === 6) && y > 2) col = p.body[Math.min(p.body.length - 1, p.body.indexOf(col) + 1)];
        if (!outside) col = p.body[Math.min(p.body.length - 1, p.body.indexOf(col) + 2)];
        put(ox + x, 1 + y, col);
      }
    for (let x = 0; x < 10; x++) {
      put(ox + x, 1, p.trim);
      put(ox + x, 16, x % 2 ? p.trim : p.trimDark);
    }
    for (let y = 1; y < 17; y++) {
      put(ox, y, p.trimDark);
      put(ox + 9, y, p.trimDark);
    }
    if (outside)
      MARK.forEach((row, y) =>
        [...row].forEach((m, x) => m !== "." && put(ox + 1 + x, 5 + y, p.mark[Number(m) - 1])),
      );
  }
  for (let x = 1; x < 21; x++) {
    put(x, 0, p.trim);
  }
  for (let y = 1; y < 17; y++) {
    put(0, y, p.trimDark);
    put(11, y, p.trimDark);
  }

  const F = p.feather;
  for (const ox of [24, 36]) {
    for (let y = 0; y < 20; y++) {
      const cut = y < 12 ? 0 : Math.round((y - 11) * 1.25);
      for (let x = 0; x < 10 - cut; x++) {
        const fx = ox === 24 ? x : 9 - x;
        let col: string;
        if (y < 2) col = y === 0 ? p.trim : p.trimDark; // the wing's bone
        else {
          const band = Math.min(F.length - 2, Math.floor((y - 2) / 4));
          const k = (y - 2) % 4;
          const shaft = x % 3 === 1;
          col = F[band];
          if (k === 3 && !shaft) col = F[band + 1]; // shadow under the row's feather tips
          if (k === 0 && shaft) col = F[Math.max(0, band - 1)]; // light catching the quill
          if (k === 2 && x % 3 === 0) col = F[band + 1];
        }
        put(ox + fx, 2 + y, col);
      }
    }
  }
  for (let x = 24; x < 46; x++) {
    put(x, 0, p.trimDark);
    put(x, 1, p.trimDark);
  }
  for (let y = 2; y < 22; y++) {
    put(22, y, p.trimDark);
    put(23, y, p.trimDark);
    put(34, y, p.trimDark);
    put(35, y, p.trimDark);
  }
  return c;
}

export const ART_W = 10;
export const ART_H = 16;
const ART_LEN = ART_W * ART_H * 4;

export function decodeArt(art: string | undefined | null): Uint8ClampedArray | null {
  if (!art) return null;
  try {
    const bin = atob(art);
    if (bin.length !== ART_LEN) return null;
    const out = new Uint8ClampedArray(ART_LEN);
    for (let i = 0; i < ART_LEN; i++) out[i] = bin.charCodeAt(i);
    for (let i = 3; i < ART_LEN; i += 4) out[i] = 255;
    return out;
  } catch {
    return null;
  }
}

export function encodeArt(px: Uint8ClampedArray) {
  let bin = "";
  for (let i = 0; i < ART_LEN; i++) bin += String.fromCharCode(i % 4 === 3 ? 255 : px[i]);
  return btoa(bin);
}

export function artFrom(style: CapeStyle) {
  return encodeArt(capeTexture(style).getContext("2d")!.getImageData(1, 1, ART_W, ART_H).data);
}

export function customCapeTexture(art: string) {
  const px = decodeArt(art) ?? decodeArt(artFrom("kromvia"))!;
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 32;
  const g = c.getContext("2d")!;
  const front = new ImageData(new Uint8ClampedArray(px), ART_W, ART_H);
  const back = new ImageData(new Uint8ClampedArray(px.map((v, i) => (i % 4 === 3 ? v : v * 0.72))), ART_W, ART_H);
  g.putImageData(front, 1, 1);
  g.putImageData(back, 12, 1);
  g.drawImage(c, 1, 1, ART_W, 1, 1, 0, ART_W, 1);
  g.drawImage(c, 1, ART_H, ART_W, 1, 11, 0, ART_W, 1);
  g.drawImage(c, 1, 1, 1, ART_H, 0, 1, 1, ART_H);
  g.drawImage(c, ART_W, 1, 1, ART_H, 11, 1, 1, ART_H);
  return c;
}

export const CAPE_STYLES: CapeStyle[] = ["kromvia", "ember", "frost"];

export function capeFor(style: string | undefined, art?: string | null) {
  if (style === "custom" && art) return customCapeTexture(art);
  return capeTexture(CAPE_STYLES.includes(style as CapeStyle) ? (style as CapeStyle) : "kromvia");
}
