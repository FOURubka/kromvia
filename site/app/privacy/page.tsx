import type { Metadata } from "next";
import { getLang } from "@/lib/i18n";

const T = {
  en: {
    meta: { title: "Privacy", description: "What Kromvia stores about you and why." },
    head: "Privacy",
    lede: "What Kromvia keeps on its servers, and what never leaves your computer.",
    localH: "Stays on your computer",
    local:
      "Your Microsoft and Ely.by sign-in tokens, your instances, worlds, mods, screenshots and settings. The launcher talks to Microsoft, Mojang, Modrinth and CurseForge to download the game and content, and those services see the requests it makes.",
    serverH: "Kept on our servers",
    serverIntro: "You only get a Kromvia account if you make one in the launcher. With an account, we store:",
    server: [
      "the nickname you chose, and the public half of a key the launcher creates on your computer to sign requests;",
      "your Minecraft account ID, if you verify it;",
      "the cosmetics you wear, so other Kromvia players can see them;",
      "your friends, friend requests, parties and the chat messages you send to friends;",
      "the likes you give and get;",
      "your Discord or Telegram name and ID, if you link them. On our Discord server a linked account gets the Player role and roles for your badges;",
      "while you play on a server, its address and the nickname you use there, so your cosmetics show up for other players;",
      "instances you save to the cloud;",
      "instances, logs and screenshots you share. Shares are deleted after 30 days.",
    ],
    profile:
      "Your profile at kromvia.com/u/yourname is public: it shows your nickname, cosmetics, likes, when you joined, and whether your Minecraft account is verified.",
    crashH: "Crash reports",
    crash:
      "When the game crashes, the launcher can send the end of the game log, the crash report, your mod file names, the Minecraft, loader and launcher versions and your operating system to us. It only does that when you press Send or turn on automatic reports in Settings. Before sending, the launcher removes your nickname, account ID, home folder path and sign-in tokens. Reports aren't tied to your Kromvia account and are deleted after 60 days.",
    abuseH: "Abuse protection",
    abuse:
      "To limit spam, we count requests, new accounts and crash reports per network. For sign-ups we keep your IP network (for IPv6, the /64 block) for 24 hours; for crash reports we keep only a hash of it. Our hosting provider, Cloudflare, keeps short-lived request logs.",
    deleteH: "Deleting your data",
    delete: (
      <>
        Open Profile in the launcher and press <b>Delete account</b>. That removes your nickname, friends, chats, likes, links, cloud saves and shares from our
        servers right away.
      </>
    ),
    adsH: "No ads, no selling",
    ads: "We don't show ads, and we don't sell or share your data with anyone for marketing.",
  },
  uk: {
    meta: { title: "Конфіденційність", description: "Що Kromvia зберігає про тебе і навіщо." },
    head: "Конфіденційність",
    lede: "Що Kromvia тримає на своїх серверах, а що ніколи не покидає твій компʼютер.",
    localH: "Лишається на твоєму компʼютері",
    local:
      "Токени входу Microsoft і Ely.by, збірки, світи, моди, скріншоти й налаштування. Лаунчер звертається до Microsoft, Mojang, Modrinth і CurseForge, щоб завантажити гру й контент, і ці сервіси бачать його запити.",
    serverH: "Зберігається на наших серверах",
    serverIntro: "Акаунт Kromvia зʼявляється, тільки якщо ти створиш його в лаунчері. Для акаунта ми зберігаємо:",
    server: [
      "нік, який ти вибрав, і публічну половину ключа, який лаунчер створює на твоєму компʼютері для підпису запитів;",
      "ID акаунта Minecraft, якщо ти його підтвердив;",
      "косметику, яку ти носиш, щоб її бачили інші гравці Kromvia;",
      "друзів, заявки в друзі, паті й повідомлення, які ти пишеш друзям;",
      "лайки, які ти ставиш і отримуєш;",
      "імʼя та ID у Discord чи Telegram, якщо ти їх привʼязав. На нашому Discord-сервері привʼязаний акаунт отримує роль Player і ролі за бейджі;",
      "поки ти граєш на сервері, його адресу й нік, під яким ти там граєш, щоб інші бачили твою косметику;",
      "збірки, які ти зберігаєш у хмару;",
      "збірки, логи й скріншоти, якими ти ділишся. Вони видаляються через 30 днів.",
    ],
    profile:
      "Профіль kromvia.com/u/твійнік публічний: там видно нік, косметику, лайки, коли ти приєднався і чи підтверджено акаунт Minecraft.",
    crashH: "Звіти про падіння",
    crash:
      "Коли гра падає, лаунчер може надіслати нам кінець ігрового логу, краш-репорт, назви файлів модів, версії Minecraft, лоадера й лаунчера та твою ОС. Він робить це тільки коли ти натиснеш «Надіслати» або ввімкнеш автоматичні звіти в Налаштуваннях. Перед відправкою лаунчер прибирає нік, ID акаунта, шлях до домашньої папки й токени входу. Звіти не привʼязані до акаунта Kromvia і видаляються через 60 днів.",
    abuseH: "Захист від зловживань",
    abuse:
      "Щоб обмежити спам, ми рахуємо запити, нові акаунти й звіти про падіння по мережах. Для реєстрацій ми зберігаємо твою IP-мережу (для IPv6 блок /64) на 24 години, для звітів про падіння тільки її хеш. Наш хостинг Cloudflare зберігає короткочасні логи запитів.",
    deleteH: "Видалення даних",
    delete: (
      <>
        Відкрий Профіль у лаунчері й натисни <b>Видалити акаунт</b>. Нік, друзі, чати, лайки, привʼязки, хмарні збереження й поширення одразу зникнуть з наших
        серверів.
      </>
    ),
    adsH: "Без реклами й продажу",
    ads: "Ми не показуємо рекламу й не продаємо та не передаємо твої дані нікому для маркетингу.",
  },
};

export async function generateMetadata(): Promise<Metadata> {
  return T[await getLang()].meta;
}

export default async function Privacy() {
  const t = T[await getLang()];
  return (
    <div className="wrap">
      <header className="page-head">
        <h1>{t.head}</h1>
        <p>{t.lede}</p>
      </header>
      <div className="prose">
        <h2>{t.localH}</h2>
        <p>{t.local}</p>

        <h2>{t.serverH}</h2>
        <p>{t.serverIntro}</p>
        <ul>
          {t.server.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
        <p>{t.profile}</p>

        <h2>{t.crashH}</h2>
        <p>{t.crash}</p>

        <h2>{t.abuseH}</h2>
        <p>{t.abuse}</p>

        <h2>{t.deleteH}</h2>
        <p>{t.delete}</p>

        <h2>{t.adsH}</h2>
        <p>{t.ads}</p>
      </div>
    </div>
  );
}
