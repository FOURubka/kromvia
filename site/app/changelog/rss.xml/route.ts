import { CHANGELOG } from "@/lib/changelog";

const SITE = "https://kromvia.com";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function GET() {
  const items = CHANGELOG.map(
    (e) => `<item>
<title>${esc(e.title)}</title>
<link>${SITE}/changelog</link>
<guid isPermaLink="false">${e.date}-${esc(e.title)}</guid>
<pubDate>${new Date(e.date).toUTCString()}</pubDate>
<description>${esc(`<ul>${e.items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`)}</description>
</item>`,
  ).join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
<title>Kromvia changelog</title>
<link>${SITE}/changelog</link>
<description>What's new in the Kromvia launcher and client.</description>
${items}
</channel>
</rss>`;
  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
}
