"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { Icon, type IconName } from "@launcher/ui/Icon";
import { Glyph } from "./Glyph";
import { Player3D } from "./Player3D";
import s from "./LauncherMock.module.css";

const W = 960;
const H = 600;

const RAIL: IconName[] = ["home", "library", "content", "wardrobe", "rooms", "friends", "profile", "settings"];

const SERVERS = [
  { name: "My SMP", online: "12", hue: 270 },
  { name: "Skyblock", online: "340", hue: 205 },
  { name: "Bedwars", online: "1.2k", hue: 140 },
];

const INSTANCES = [
  { name: "Fabric 26.3", meta: "26.3 · Fabric", hue: 270 },
  { name: "Survival with friends", meta: "1.21.11 · Fabric", hue: 140 },
  { name: "Create modpack", meta: "1.20.1 · Forge", hue: 30 },
];

function offsetIn(el: HTMLElement, root: HTMLElement) {
  let x = el.offsetWidth / 2;
  let y = el.offsetHeight / 2;
  for (let n: HTMLElement | null = el; n && n !== root; n = n.offsetParent as HTMLElement | null) {
    x += n.offsetLeft;
    y += n.offsetTop;
  }
  return { x, y };
}

function useDemo(stage: React.RefObject<HTMLDivElement | null>, win: React.RefObject<HTMLDivElement | null>, ready: boolean) {
  useEffect(() => {
    if (!ready) return;
    const root = win.current!;
    const q = (k: string) => root.querySelector<HTMLElement>(`[data-d=${k}]`)!;
    const [play, game, key, menu, cursor] = ["play", "game", "key", "menu", "cursor"].map(q);
    const panel = menu.firstElementChild as HTMLElement;
    const p = offsetIn(play, root);
    const at = `${p.x}px ${p.y}px`;

    const ctx = gsap.context(() => {
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
        gsap.set(game, { clipPath: `circle(150% at ${at})`, autoAlpha: 1 });
        gsap.set(menu, { autoAlpha: 1 });
        return;
      }
      const tl = gsap.timeline({ repeat: -1, repeatDelay: 0.6, delay: 1.6 });
      tl.set(cursor, { x: W * 0.62, y: H * 0.95, autoAlpha: 0 })
        .set(game, { clipPath: `circle(0% at ${at})`, autoAlpha: 1 })
        .set(menu, { autoAlpha: 0 })
        .set(panel, { scale: 0.92 })
        .set(key, { autoAlpha: 0, y: 30 })
        .to(cursor, { autoAlpha: 1, duration: 0.2 })
        .to(cursor, { x: p.x - 4, y: p.y - 2, duration: 0.9, ease: "power3.inOut" })
        .to([cursor, play], { scale: 0.88, duration: 0.09, yoyo: true, repeat: 1 })
        .to(cursor, { autoAlpha: 0, duration: 0.2 })
        .to(game, { clipPath: `circle(150% at ${at})`, duration: 0.9, ease: "power2.in" }, "<")
        .to(key, { autoAlpha: 1, y: 0, duration: 0.45, ease: "back.out(2)" }, "+=0.5")
        .to(key, { y: 4, duration: 0.08, yoyo: true, repeat: 1 }, "+=0.25")
        .to(menu, { autoAlpha: 1, duration: 0.25 }, "<0.1")
        .to(panel, { scale: 1, duration: 0.45, ease: "back.out(1.6)" }, "<")
        .to(key, { autoAlpha: 0, y: 30, duration: 0.3 }, "+=0.3")
        .to([menu, game], { autoAlpha: 0, duration: 0.6 }, "+=3");
      const io = new IntersectionObserver(([e]) => (e.isIntersecting ? tl.play() : tl.pause()));
      io.observe(stage.current!);
      return () => io.disconnect();
    }, root);
    return () => ctx.revert();
  }, [ready, stage, win]);
}

export function LauncherMock() {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState<number | null>(null);
  const win = useRef<HTMLDivElement>(null);
  useDemo(box, win, scale !== null);

  useEffect(() => {
    const el = box.current!;
    const ro = new ResizeObserver(() => setScale(Math.min(1, el.clientWidth / W)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={box} className={s.stage} style={{ height: H * (scale ?? 1), opacity: scale === null ? 0 : 1, transition: "opacity 400ms" }}>
      <div
        ref={win}
        className={s.window}
        style={{
          width: W,
          height: H,
          transform: `scale(${scale ?? 1})`,
        }}
        aria-label="The Kromvia launcher"
        role="img"
      >
        <div className={s.titlebar}>
          <img src="/logo-mark.svg" alt="" width={14} height={14} />
          <span>Kromvia</span>
          <i className={s.dots}>
            <b style={{ background: "#f2c94c" }} />
            <b style={{ background: "#7bd93a" }} />
            <b style={{ background: "#e45c5c" }} />
          </i>
        </div>
        <div className={s.body}>
          <nav className={s.rail}>
            <img src="/logo-mark.svg" alt="" width={26} height={26} className={s.railLogo} />
            {RAIL.map((name, i) => (
              <span key={name} className={i === 0 ? s.railOn : s.railItem}>
                <Icon name={name} size={16} />
              </span>
            ))}
          </nav>

          <main className={s.main}>
            <div className={`block ${s.quickbar}`}>
              <span className={s.label}>Quick play</span>
              {SERVERS.map((sv) => (
                <span key={sv.name} className={s.server} style={{ "--h": sv.hue } as React.CSSProperties}>
                  <b>{sv.name[0]}</b>
                  {sv.name}
                  <em>● {sv.online}</em>
                </span>
              ))}
              <span className={s.plus}>
                <Icon name="plus" size={10} />
              </span>
            </div>

            <div className={`block ${s.launchpad}`}>
              <img src="/bee/empty-home.webp" alt="" className={s.padBee} />
              <div className={s.padCenter}>
                <span className={s.launch} data-d="play">
                  <b>Play 26.3</b>
                  <em>Fabric 26.3</em>
                </span>
                <span className={`btn ghost ${s.open}`}>
                  <Glyph name="tool" /> Open instance
                </span>
                <span className={s.pick}>Fabric 26.3 · Fabric 26.3</span>
              </div>
            </div>

            <div className={s.instances}>
              <strong>Instances</strong>
              <span className={`field ${s.search}`}>Search instances</span>
              <span className={`btn ghost ${s.import}`}>Import</span>
            </div>
            <div className={s.list}>
              {INSTANCES.map((it) => (
                <div key={it.name} className={`block ${s.row}`}>
                  <b style={{ "--h": it.hue } as React.CSSProperties} />
                  <span>
                    {it.name}
                    <em>{it.meta}</em>
                  </span>
                  <Icon name="play" size={12} />
                </div>
              ))}
            </div>
          </main>

          <aside className={s.aside}>
            <div className={`block ${s.side} ${s.playing}`}>
              <span className={s.label}>Playing as</span>
              <Player3D className={s.player} cosmetics={{ cape: true, style: "kromvia" }} zoom={0.9} turn={0.6} drag={false} />
              <strong className={s.nick}>Kromvia</strong>
              <span className={`field ${s.nickField}`}>Kromvia</span>
            </div>
            <div className={`block ${s.side}`}>
              <span className={s.label}>Rooms</span>
              <p>Play your singleplayer world with friends. No server, no port forwarding.</p>
              <span className={`btn ghost ${s.sideBtn}`}>
                <Icon name="rooms" size={10} /> Open rooms
              </span>
            </div>
            <div className={`block ${s.side}`}>
              <span className={s.label}>What&apos;s new</span>
              <b>Rooms</b>
              <p>Play your singleplayer world with friends through a code.</p>
            </div>
          </aside>
        </div>
        <Demo />
      </div>
    </div>
  );
}

function Demo() {
  return (
    <div className={s.demo} aria-hidden="true">
      <div className={s.game} data-d="game">
        <img src="/game/tower.webp" alt="" />
      </div>
      <div className={s.menu} data-d="menu">
        <img src="/game/menu.webp" alt="" className={s.panel} />
      </div>
      <span className={s.key} data-d="key">
        <kbd>⇧ Right Shift</kbd>
      </span>
      <svg className={s.cursor} data-d="cursor" width="26" height="26" viewBox="0 0 24 24">
        <path d="M4 2l15 11.5-6.6.9 3.9 7.4-2.8 1.4-3.8-7.5L4 20.5z" fill="#fff" stroke="#111" strokeWidth="1.4" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
