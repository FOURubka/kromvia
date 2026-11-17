import type { Lang } from "./i18n-shared";
import MODULES_JSON from "./modules.json";

export type ModuleEntry = { id: string; name: string; cat: "PvP" | "HUD" | "Utility & visuals"; text: string };
export const MODULE_LIST = MODULES_JSON as ModuleEntry[];

export const MODULES: Record<ModuleEntry["cat"], string[]> = { PvP: [], HUD: [], "Utility & visuals": [] };
for (const m of MODULE_LIST) MODULES[m.cat].push(m.name);

export const MODULE_COUNT = Object.values(MODULES).reduce((n, l) => n + l.length, 0);

export type Card = { bee: string; title: string; text: string };

export const LAUNCHER: Card[] = [
  { bee: "card-versions", title: "Any version, any loader", text: "Releases, snapshots, beta and alpha. Fabric, Quilt, Forge, NeoForge, Legacy Fabric and Ornithe, and the launcher downloads the right Java for each one." },
  { bee: "card-tuned", title: "Tuned out of the box", text: "The Max FPS, Balance and Quality presets install Sodium and similar mods from Modrinth and size the JVM memory to your RAM." },
  { bee: "card-mods", title: "Modrinth and CurseForge", text: "Search mods, resource packs, shaders and datapacks for your exact version. Kromvia installs the dependencies for you." },
  { bee: "card-safe", title: "Safe mods", text: "Kromvia checks every file against its hash. Anything that matches known malware goes to quarantine before the game starts." },
  { bee: "card-import", title: "Bring your instances", text: "Import from Prism, MultiMC, CurseForge App, Modrinth App, ATLauncher, GDLauncher or the official launcher." },
  { bee: "card-worlds", title: "Worlds, servers, screenshots", text: "Back up and copy worlds, ping and pin servers, and browse screenshots. When the game crashes, the analyser suggests a fix you can apply in one click." },
];

export const CLIENT: Card[] = [
  { bee: "card-menu", title: "Right Shift menu", text: "One menu for every module. Drag HUD elements around, change colours and switch modules on or off. It comes with every instance." },
  { bee: "card-pvp", title: "PvP that stays fair", text: "Keystrokes, CPS, combo and reach displays, hit colours. There is no reach hack, killaura or X-ray, so the client won't get you banned." },
  { bee: "card-cosmetics", title: "Cosmetics", text: "56 voxel items and 10 full costumes: wings, helmets, horns, armour and weapons. Other Kromvia players on your server see them too." },
  { bee: "card-visuals", title: "Visuals", text: "Motion blur, trails, jump circles, your own crosshair, fog off, and control over time and weather." },
];

export const SOCIAL: Card[] = [
  { bee: "card-rooms", title: "Rooms", text: "Open your singleplayer world to friends with a code. You don't need a server or port forwarding." },
  { bee: "card-friends", title: "Friends and chat", text: "See who's online and what they're playing, chat with them, and join their party in one click." },
  { bee: "card-profile", title: "Profile and badges", text: "Your skin, cosmetics, likes and badges, on a public page at kromvia.com/u/yourname." },
];

export const VERSIONS = "1.15.2 to 26.3";
export const FORGE_VERSIONS = "1.20.6 to 26.3";

export const FAQ: { q: string; a: string }[] = [
  { q: "Is Kromvia free?", a: "Yes. The launcher, the built-in client and the default cosmetics are free." },
  { q: "Is the built-in client allowed on servers?", a: "It only has modules that don't give you an unfair edge: HUD, visuals and quality-of-life tweaks. There is no reach hack, killaura or X-ray." },
  { q: "Which versions does the client support?", a: `The built-in client runs on Fabric and Quilt for Minecraft ${VERSIONS}, and on Forge and NeoForge for ${FORGE_VERSIONS}. The launcher itself starts any version, from alpha to the latest snapshot, on any loader.` },
  { q: "Do I need a Minecraft account?", a: "You need one for online servers, and you sign in with Microsoft. Without an account you can still play offline." },
  { q: "Does it touch my existing .minecraft?", a: "No. Kromvia keeps its own folder and can import your instances from other launchers." },
];

export const MORE_FAQ: { q: string; a: string }[] = [
  { q: "Why doesn't Right Shift open the menu?", a: `The Kromvia client runs on Fabric and Quilt instances, and on Forge and NeoForge for Minecraft ${FORGE_VERSIONS}. On older Forge and NeoForge, on vanilla, or with the client switched off in the build settings, the game starts without it.` },
  { q: "Who can see my cosmetics?", a: "Other Kromvia players on the same server as you. Players on other launchers see a normal skin." },
  { q: "Can I play with a friend who doesn't have Kromvia?", a: "On a regular server, yes. Rooms need Kromvia on both sides, because the launcher relays the connection." },
  { q: "Does Kromvia make Minecraft faster?", a: "The Max FPS preset installs Sodium, Lithium, FerriteCore and a few more performance mods from Modrinth, and sizes Java memory to your RAM. How much it helps depends on your PC." },
  { q: "Where are my worlds and screenshots?", a: "Each instance has its own folder inside Kromvia's game folder. You can move the whole game folder in Settings." },
  { q: "How can I support Kromvia?", a: "Kromvia has no paid features. If you want to help, drop something into our Monobank jar (link at the bottom of the page) or tell a friend about it." },
  { q: "How do I delete my Kromvia account?", a: "Open Profile in the launcher and press Delete account. Your nickname, friends, chats, likes, links, cloud saves and shares are removed from our servers." },
];

const UK = {
  LAUNCHER: [
    { bee: "card-versions", title: "Будь-яка версія, будь-який лоадер", text: "Релізи, снапшоти, beta й alpha. Fabric, Quilt, Forge, NeoForge, Legacy Fabric та Ornithe, а потрібну Java лаунчер завантажить сам." },
    { bee: "card-tuned", title: "Налаштований з коробки", text: "Пресети Макс FPS, Баланс і Якість ставлять Sodium та схожі моди з Modrinth і підбирають памʼять JVM під твою RAM." },
    { bee: "card-mods", title: "Modrinth і CurseForge", text: "Шукай моди, ресурспаки, шейдери й датапаки під свою версію. Залежності Kromvia поставить сам." },
    { bee: "card-safe", title: "Безпечні моди", text: "Kromvia перевіряє кожен файл за хешем. Усе, що схоже на відомий вірус, іде в карантин ще до запуску гри." },
    { bee: "card-import", title: "Перенеси свої збірки", text: "Імпорт з Prism, MultiMC, CurseForge App, Modrinth App, ATLauncher, GDLauncher чи офіційного лаунчера." },
    { bee: "card-worlds", title: "Світи, сервери, скріншоти", text: "Бекапи й копії світів, пінг і закріплення серверів, галерея скріншотів. Коли гра падає, аналізатор пропонує фікс в один клік." },
  ],
  CLIENT: [
    { bee: "card-menu", title: "Меню на Right Shift", text: "Одне меню для всіх модулів. Перетягуй HUD, міняй кольори, вмикай і вимикай модулі. Є в кожній збірці." },
    { bee: "card-pvp", title: "Чесне PvP", text: "Keystrokes, CPS, комбо й reach-дисплей, кольори ударів. Ні reach-хаків, ні killaura, ні X-ray, тож за клієнт не забанять." },
    { bee: "card-cosmetics", title: "Косметика", text: "56 воксельних речей і 10 повних костюмів: крила, шоломи, роги, броня й зброя. Інші гравці Kromvia на твоєму сервері теж їх бачать." },
    { bee: "card-visuals", title: "Візуали", text: "Motion blur, трейли, кола від стрибків, свій приціл, без туману, керування часом і погодою." },
  ],
  SOCIAL: [
    { bee: "card-rooms", title: "Кімнати", text: "Відкрий свій одиночний світ друзям за кодом. Без сервера й без прокидання портів." },
    { bee: "card-friends", title: "Друзі й чат", text: "Дивись, хто онлайн і у що грає, пиши їм і заходь у їхнє паті в один клік." },
    { bee: "card-profile", title: "Профіль і бейджі", text: "Твій скін, косметика, лайки й бейджі на публічній сторінці kromvia.com/u/твійнік." },
  ],
  FAQ: [
    { q: "Kromvia безкоштовний?", a: "Так. Лаунчер, вбудований клієнт і стандартна косметика безкоштовні." },
    { q: "Чи можна з вбудованим клієнтом на сервери?", a: "У ньому тільки модулі, що не дають нечесної переваги: HUD, візуали й зручності. Ні reach-хаків, ні killaura, ні X-ray." },
    { q: "Які версії підтримує клієнт?", a: `Вбудований клієнт працює на Fabric і Quilt для Minecraft ${VERSIONS.replace(" to ", " до ")}, а на Forge і NeoForge для ${FORGE_VERSIONS.replace(" to ", "–")}. Сам лаунчер запускає будь-яку версію, від alpha до найсвіжішого снапшоту, на будь-якому лоадері.` },
    { q: "Чи потрібен акаунт Minecraft?", a: "Для онлайн-серверів так, вхід через Microsoft. Без акаунта можна грати офлайн." },
    { q: "Він чіпає мою .minecraft?", a: "Ні. У Kromvia своя папка, а збірки з інших лаунчерів можна імпортувати." },
  ],
  MORE_FAQ: [
    { q: "Чому Right Shift не відкриває меню?", a: `Клієнт Kromvia працює в збірках на Fabric і Quilt, а на Forge і NeoForge для Minecraft ${FORGE_VERSIONS.replace(" to ", "–")}. На старіших Forge і NeoForge, на ванілі або коли клієнт вимкнено в налаштуваннях збірки, гра запускається без нього.` },
    { q: "Хто бачить мою косметику?", a: "Інші гравці Kromvia на тому ж сервері. Гравці з інших лаунчерів бачать звичайний скін." },
    { q: "Можна грати з другом без Kromvia?", a: "На звичайному сервері так. Для Кімнат Kromvia потрібен обом, бо зʼєднання йде через лаунчер." },
    { q: "Kromvia прискорює Minecraft?", a: "Пресет Макс FPS ставить Sodium, Lithium, FerriteCore та ще кілька модів для продуктивності з Modrinth і підбирає памʼять Java під твою RAM. Наскільки допоможе, залежить від ПК." },
    { q: "Де мої світи й скріншоти?", a: "У кожної збірки своя папка всередині ігрової папки Kromvia. Всю ігрову папку можна перенести в Налаштуваннях." },
    { q: "Як підтримати Kromvia?", a: "Платних функцій у Kromvia нема. Хочеш допомогти, кинь щось у банку Monobank (посилання внизу сторінки) або розкажи другу." },
    { q: "Як видалити акаунт Kromvia?", a: "Відкрий Профіль у лаунчері й натисни «Видалити акаунт». Нік, друзі, чати, лайки, привʼязки, хмарні збереження й поширення зникнуть з наших серверів." },
  ],
  CATEGORIES: { PvP: "PvP", HUD: "HUD", "Utility & visuals": "Утиліти й візуали" } as Record<string, string>,
};

const EN = { LAUNCHER, CLIENT, SOCIAL, FAQ, MORE_FAQ, CATEGORIES: {} as Record<string, string> };

export const content = (lang: Lang) => (lang === "uk" ? UK : EN);
