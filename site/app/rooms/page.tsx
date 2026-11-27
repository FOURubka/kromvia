import type { Metadata } from "next";
import Link from "next/link";
import { getLang } from "@/lib/i18n";
import s from "./rooms.module.css";

const T = {
  en: {
    meta: { title: "Rooms", description: "Play your singleplayer Minecraft world with friends through a code, without a server." },
    head: "Rooms",
    lede: "Play your singleplayer world with friends. Nobody has to run a server or open ports on their router: Kromvia relays the connection.",
    host: "Host your world",
    hostSteps: [
      "Open Rooms in the launcher and press Host a room. The game starts with the relay mod added.",
      "Open any singleplayer world. The room opens by itself.",
      "A code appears in the launcher. Send it to your friends.",
    ],
    join: "Join a friend",
    joinSteps: [
      "Open Rooms in the launcher.",
      "Paste the code your friend sent and press Join.",
      "You land in their world. Your instance has to be on the same Minecraft version as theirs.",
    ],
    good: "Good to know",
    notes: [
      "Rooms need an instance with a mod loader. Fabric works best.",
      "The world stays on the host's computer. When the host closes the game, the room closes.",
      "Friends in your Kromvia party can join from the friends list without typing a code.",
    ],
    noKromvia: "Don't have Kromvia yet?", here: "Download it here",
  },
  uk: {
    meta: { title: "Кімнати", description: "Грай у свій одиночний світ Minecraft з друзями за кодом, без сервера." },
    head: "Кімнати",
    lede: "Грай у свій одиночний світ з друзями. Нікому не треба тримати сервер чи відкривати порти на роутері: зʼєднання передає Kromvia.",
    host: "Відкрий свій світ",
    hostSteps: [
      "Відкрий Кімнати в лаунчері й натисни «Створити кімнату». Гра запуститься з модом-ретранслятором.",
      "Зайди в будь-який одиночний світ. Кімната відкриється сама.",
      "У лаунчері зʼявиться код. Надішли його друзям.",
    ],
    join: "Зайди до друга",
    joinSteps: [
      "Відкрий Кімнати в лаунчері.",
      "Встав код від друга й натисни «Приєднатися».",
      "Ти потрапиш у його світ. Твоя збірка має бути на тій самій версії Minecraft.",
    ],
    good: "Варто знати",
    notes: [
      "Для Кімнат потрібна збірка з мод-лоадером. Найкраще працює Fabric.",
      "Світ лишається на компʼютері того, хто хостить. Закрив гру, кімната закрилась.",
      "Друзі з твого паті в Kromvia заходять зі списку друзів без коду.",
    ],
    noKromvia: "Ще нема Kromvia?", here: "Завантаж тут",
  },
};

export async function generateMetadata(): Promise<Metadata> {
  return T[await getLang()].meta;
}

export default async function Rooms() {
  const t = T[await getLang()];
  return (
    <div className="wrap">
      <header className={`page-head ${s.head}`}>
        <div>
          <h1>{t.head}</h1>
          <p>{t.lede}</p>
        </div>
        <img loading="lazy" decoding="async" src="/bee/card-rooms.webp" alt="" className={s.bee} />
      </header>

      <div className={s.cols}>
        <section className={`block ${s.col}`}>
          <h2>{t.host}</h2>
          <ol>
            {t.hostSteps.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ol>
        </section>
        <section className={`block ${s.col}`}>
          <h2>{t.join}</h2>
          <ol>
            {t.joinSteps.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ol>
        </section>
      </div>

      <div className="prose">
        <h2>{t.good}</h2>
        <ul>
          {t.notes.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
        <p>
          {t.noKromvia} <Link href="/download">{t.here}</Link>.
        </p>
      </div>
    </div>
  );
}
