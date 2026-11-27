import type { Metadata, Viewport } from "next";
import { Manrope, Unbounded } from "next/font/google";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { getLang } from "@/lib/i18n";
import "./globals.css";

const sans = Manrope({ variable: "--font-sans", subsets: ["latin", "cyrillic"] });
const display = Unbounded({ variable: "--font-display", subsets: ["latin", "cyrillic"], weight: ["500", "600", "700"] });

const META = {
  en: {
    title: "Kromvia: Minecraft launcher with a built-in client",
    description: "A Minecraft launcher for any version and loader, with a built-in PvP and HUD client, cosmetics, Rooms and friends.",
  },
  uk: {
    title: "Kromvia: лаунчер Minecraft з вбудованим клієнтом",
    description: "Лаунчер Minecraft для будь-якої версії й лоадера з вбудованим PvP- і HUD-клієнтом, косметикою, Кімнатами й друзями.",
  },
};

export async function generateMetadata(): Promise<Metadata> {
  const m = META[await getLang()];
  return {
    metadataBase: new URL("https://kromvia.com"),
    title: { default: m.title, template: "%s · Kromvia" },
    description: m.description,
    icons: { icon: "/logo.svg" },
    openGraph: { siteName: "Kromvia", images: ["/banner.jpg"], type: "website" },
    twitter: { card: "summary_large_image", images: ["/banner.jpg"] },
  };
}

export const viewport: Viewport = { themeColor: "#06050b", colorScheme: "dark" };

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const lang = await getLang();
  return (
    <html lang={lang} className={`${sans.variable} ${display.variable}`}>
      <body>
        <Header lang={lang} />
        <main>{children}</main>
        <Footer lang={lang} />
      </body>
    </html>
  );
}
