import { Bangers, Caveat, Comfortaa, Creepster, Orbitron, Pacifico, Pixelify_Sans, Press_Start_2P, Righteous, Rubik_Mono_One, Zilla_Slab } from "next/font/google";

const pixel = Pixelify_Sans({ subsets: ["latin"], weight: "600", display: "swap" });
const arcade = Press_Start_2P({ subsets: ["latin"], weight: "400", display: "swap" });
const comic = Bangers({ subsets: ["latin"], weight: "400", display: "swap" });
const script = Pacifico({ subsets: ["latin"], weight: "400", display: "swap" });
const tech = Orbitron({ subsets: ["latin"], weight: "700", display: "swap" });
const retro = Righteous({ subsets: ["latin"], weight: "400", display: "swap" });
const spooky = Creepster({ subsets: ["latin"], weight: "400", display: "swap" });
const slab = Zilla_Slab({ subsets: ["latin"], weight: "700", display: "swap" });
const heavy = Rubik_Mono_One({ subsets: ["latin"], weight: "400", display: "swap" });
const round = Comfortaa({ subsets: ["latin"], weight: "700", display: "swap" });
const hand = Caveat({ subsets: ["latin"], weight: "700", display: "swap" });

export const NAME_FONTS: Record<string, string> = {
  default: "var(--font-sans), sans-serif",
  display: "var(--font-display), sans-serif",
  mono: "ui-monospace, monospace",
  pixel: pixel.style.fontFamily,
  arcade: arcade.style.fontFamily,
  comic: comic.style.fontFamily,
  script: script.style.fontFamily,
  tech: tech.style.fontFamily,
  retro: retro.style.fontFamily,
  spooky: spooky.style.fontFamily,
  slab: slab.style.fontFamily,
  heavy: heavy.style.fontFamily,
  round: round.style.fontFamily,
  hand: hand.style.fontFamily,
};
