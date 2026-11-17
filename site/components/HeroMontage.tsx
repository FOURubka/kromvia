import s from "./HeroMontage.module.css";

export function HeroMontage({ alt }: { alt: string }) {
  return (
    <div className={s.stage} role="img" aria-label={alt}>
      <img src="/shots/launcher-home.webp" alt="" width={1440} height={900} className={`${s.frame} ${s.launcher}`} />
      <img src="/shots/client-title.webp" alt="" width={1672} height={940} className={`${s.frame} ${s.title}`} />
      <img src="/shots/client-menu.webp" alt="" width={1680} height={850} className={`${s.frame} ${s.menu}`} />
      <span className={s.ring} />
      <svg className={s.cursor} width="26" height="26" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 2l15 11.5-6.6.9 3.9 7.4-2.8 1.4-3.8-7.5L4 20.5z" fill="#fff" stroke="#111" strokeWidth="1.4" strokeLinejoin="round" />
      </svg>
      <kbd className={s.key}>Right Shift</kbd>
    </div>
  );
}
