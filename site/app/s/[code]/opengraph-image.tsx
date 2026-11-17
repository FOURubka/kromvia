import { ImageResponse } from "next/og";
import { share } from "@/lib/api";
import { OG_SIZE, ogCard } from "@/lib/og";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Shared from Kromvia";

export default async function Image({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const sh = await share(code);
  if (sh?.kind === "screenshot") {
    return new ImageResponse(<img src={sh.url} width={OG_SIZE.width} height={OG_SIZE.height} alt="" style={{ objectFit: "cover" }} />, OG_SIZE);
  }
  if (sh?.kind === "build") {
    const mods = sh.data.files.filter((f) => f.path.startsWith("mods/")).length;
    const loader = Object.entries(sh.data.dependencies).find(([k]) => k !== "minecraft");
    return ogCard({
      title: sh.data.name,
      badge: "Instance",
      lines: [`Minecraft ${sh.data.dependencies.minecraft}${loader ? ` · ${loader[0].replace("-loader", "")}` : ""} · ${mods} mods`, `by ${sh.from.name} · code ${code.toUpperCase()}`],
    });
  }
  return ogCard({ title: sh?.kind === "log" ? "Shared log" : "Kromvia", lines: [`kromvia.com/s/${code.toUpperCase()}`] });
}
