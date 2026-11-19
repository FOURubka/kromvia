import type { ReactNode } from "react";
import { EMBLEMS, emblemUrl } from "@launcher/art/emblems";

const CUSTOM: Record<string, string> = { kromvia: "/logo.svg", ...Object.fromEntries(Object.keys(EMBLEMS).map((k) => [k, emblemUrl(k)])) };

export function Rich({ text, className }: { text: string; className?: string }) {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(/:([a-z0-9_]{2,24}):/g)) {
    const src = CUSTOM[m[1]];
    if (!src) continue;
    if (m.index! > last) out.push(text.slice(last, m.index));
    out.push(<img key={m.index} className={className} src={src} alt={m[0]} title={m[0]} />);
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}

export const clanIcon = (icon: string) => (icon === "kromvia" ? "/logo.svg" : emblemUrl(icon));
