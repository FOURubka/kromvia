import type { Metadata } from "next";
import { Roadmap, type Item } from "@/components/Roadmap";
import { API } from "@/lib/api";
import { getLang } from "@/lib/i18n";

const ITEMS: Record<"en" | "uk", Record<string, [string, string]>> = {
  en: {
    "crash-bisect": ["Find the mod that crashes the game", "The launcher starts the game in the background with half the mods, then half of those, until it names the one to blame."],
    "try-mod": ["Try a mod without risk", "A throwaway copy of the instance and its world. Keep the mod if you like it, otherwise the copy disappears."],
    "auto-tune": ["Measured auto-tuning", "The client flies a set path through a test world while the launcher tries a few presets and keeps the one with the best 1% low."],
    "world-relay": ["Pass-around world", "A shared world without a server: whoever is online hosts it, and it moves between friends' launchers."],
    "proximity-voice": ["Proximity voice on any server", "Hear your party louder the closer they are, without a server plugin."],
    "afk-telegram": ["AFK alerts in Telegram", "A message when you get kicked, run low on health, fill your inventory or someone mentions you in chat."],
    "screenshot-place": ["Screenshots that remember the place", "Seed, coordinates, dimension and server saved in the picture, with a button to go back there."],
    "session-recap": ["Session recap", "A card after you quit: deaths, distance, combos and screenshots, with a link to share."],
    "second-screen": ["Second-screen launcher", "While you play, the launcher shows chat, players and a frame-time graph, and you can type in chat from it."],
    "join-by-ip": ["Join by IP", "Paste a server address and the launcher sets up a matching instance, with the mod list for Forge servers."],
    "mods-rollback": ["Undo \"update all\"", "A snapshot of your mods before every bulk update, rolled back with one click."],
    "world-backups": ["Automatic world backups", "A copy of your worlds before every launch, keeping the last few."],
    "portable": ["Portable mode", "All launcher data next to the exe, for a USB stick."],
    "slot-lock": ["Slot lock", "Lock a hotbar slot so Q never drops your sword."],
  },
  uk: {
    "crash-bisect": ["Знайти мод, що крашить гру", "Лаунчер сам запускає гру у фоні з половиною модів, потім з половиною від них, поки не назве винного."],
    "try-mod": ["Спробувати мод без ризику", "Тимчасова копія збірки разом зі світом. Сподобався мод — лишаєш, ні — копія зникає."],
    "auto-tune": ["Виміряний автотюнінг", "Клієнт летить заданим маршрутом по тестовому світу, а лаунчер пробує кілька пресетів і бере той, де найкращий 1% low."],
    "world-relay": ["Естафета світу", "Спільний світ без сервера: хостить той, хто онлайн, і світ переходить між лаунчерами друзів."],
    "proximity-voice": ["Голос поблизу на будь-якому сервері", "Чуєш паті голосніше, чим ближче вони, без плагіна на сервері."],
    "afk-telegram": ["AFK-сповіщення в Telegram", "Повідомлення, коли тебе кікнуло, мало HP, повний інвентар чи тебе згадали в чаті."],
    "screenshot-place": ["Скріни, що памʼятають місце", "Сід, координати, вимір і сервер у самій картинці, і кнопка, щоб повернутись туди."],
    "session-recap": ["Підсумок сесії", "Картка після виходу: смерті, дистанція, комбо й скріни, з посиланням, щоб поділитись."],
    "second-screen": ["Лаунчер на другому моніторі", "Поки граєш, лаунчер показує чат, гравців і графік frametime, і з нього можна писати в чат."],
    "join-by-ip": ["Вхід по IP", "Вставляєш адресу сервера, і лаунчер збирає під нього збірку, а для Forge-серверів ще й зі списком модів."],
    "mods-rollback": ["Відкат «оновити все»", "Знімок модів перед кожним масовим оновленням і відкат одним кліком."],
    "world-backups": ["Автобекап світів", "Копія світів перед кожним запуском, зберігаються останні кілька."],
    "portable": ["Портативний режим", "Усі дані лаунчера поруч з exe, для флешки."],
    "slot-lock": ["Замок слотів", "Блокуєш слот хотбару, і Q вже не викине меч."],
  },
};

const T = {
  en: { meta: { title: "Roadmap", description: "What we might build next in Kromvia. Vote for what you want first." }, head: "Roadmap", lede: "Ideas we haven't built yet. Vote for the ones you want; one vote per network for each idea, click again to take it back.", offline: "Votes didn't load. Try again later.", votes: "votes" },
  uk: { meta: { title: "Роадмап", description: "Що ми можемо зробити в Kromvia далі. Голосуй за те, що хочеш першим." }, head: "Роадмап", lede: "Ідеї, яких ще нема. Голосуй за ті, що хочеш; один голос з мережі на кожну ідею, повторний клік його знімає.", offline: "Голоси не завантажились. Спробуй пізніше.", votes: "голосів" },
};

export async function generateMetadata(): Promise<Metadata> {
  return T[await getLang()].meta;
}

export default async function RoadmapPage() {
  const lang = await getLang();
  const text = ITEMS[lang];
  let counts: { id: string; votes: number; voted: boolean }[] | null = null;
  try {
    const res = await fetch(`${API}/v1/roadmap`, { cache: "no-store" });
    if (res.ok) counts = await res.json();
  } catch {}
  const items: Item[] = Object.entries(text).map(([id, [title, body]]) => ({ id, title, body, votes: counts?.find((c) => c.id === id)?.votes ?? 0 }));
  return (
    <div className="wrap">
      <header className="page-head">
        <h1>{T[lang].head}</h1>
        <p>{T[lang].lede}</p>
      </header>
      <Roadmap api={API} items={items} offline={counts === null ? T[lang].offline : null} votesLabel={T[lang].votes} />
    </div>
  );
}
