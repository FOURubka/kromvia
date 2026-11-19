const O = "#191523";
const S = `stroke="${O}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"`;

export const EMBLEMS: Record<string, string> = {
  sword: `
    <path d="M34 7h7v7L19 36l-7-7z" fill="#dfe4ee" ${S}/>
    <path d="M41 7v7L19 36l-3.5-3.5z" fill="#a7b0c3"/>
    <path d="M35.5 9.5L16 29" stroke="#fff" stroke-width="1.4" stroke-linecap="round" opacity=".8"/>
    <path d="M9 25l14 14-3 3L6 28z" fill="#e0b04a" ${S}/>
    <path d="M12.5 35.5l3 3-6 6-3-3z" fill="#7a4a24" ${S}/>
    <circle cx="6.5" cy="43.5" r="2.6" fill="#e0b04a" ${S}/>`,
  pickaxe: `
    <path d="M13 41l20-20" stroke="${O}" stroke-width="6.5" stroke-linecap="round"/>
    <path d="M13 41l20-20" stroke="#8a5a2b" stroke-width="3.6" stroke-linecap="round"/>
    <path d="M14.5 38.5l17-17" stroke="#b07a42" stroke-width="1.2" stroke-linecap="round"/>
    <path d="M7 15C14 6 30 4 41 13l-3 4C29 11 17 11 10 19z" fill="#9aa4b8" ${S}/>
    <path d="M9.5 14.5C16 8.5 28 7.5 37 12.5" stroke="#e4e8f0" stroke-width="1.6" fill="none" stroke-linecap="round"/>
    <rect x="29" y="12" width="8" height="8" rx="1.5" transform="rotate(45 33 16)" fill="#6c7487" ${S}/>`,
  heart: `
    <path d="M24 41C10 31 5 23 5 16.5 5 10.5 9.8 6 15.5 6c3.8 0 6.8 2.2 8.5 5 1.7-2.8 4.7-5 8.5-5C38.2 6 43 10.5 43 16.5 43 23 38 31 24 41z" fill="#e5484d" ${S}/>
    <path d="M24 41c14-10 19-18 19-24.5 0-3-1.2-5.6-3.2-7.5C40 21 33 31 24 37z" fill="#b8323a"/>
    <ellipse cx="14" cy="14" rx="4.5" ry="3" transform="rotate(-35 14 14)" fill="#fff" opacity=".55"/>`,
  potion: `
    <rect x="19" y="4" width="10" height="5" rx="1.5" fill="#a26a3a" ${S}/>
    <path d="M20 9h8v7c6 2.5 10 7.5 10 13.5C38 37.5 31.7 44 24 44S10 37.5 10 29.5C10 23.5 14 18.5 20 16z" fill="#eef1f7" ${S}/>
    <path d="M11.2 28h25.6c.1.5.2 1 .2 1.5C37 37 31.2 42.5 24 42.5S11 37 11 29.5c0-.5.1-1 .2-1.5z" fill="#8b5cf6"/>
    <path d="M24 42.5c7.2 0 13-5.5 13-13 0-.5-.1-1-.2-1.5H32c0 7-3 12-8 14.5z" fill="#6a3fd0"/>
    <circle cx="18" cy="33" r="2" fill="#c9b5ff"/><circle cx="23" cy="37" r="1.3" fill="#c9b5ff"/><circle cx="27" cy="31.5" r="1" fill="#c9b5ff"/>
    <path d="M14.5 22.5c1.5-2 3.5-3.3 5.5-4" stroke="#fff" stroke-width="1.8" stroke-linecap="round" fill="none"/>`,
  apple: `
    <path d="M24 14c-4-3-14-3-16 7-1.5 8 3 18 9 21 2.5 1.2 4.5.5 7-.5 2.5 1 4.5 1.7 7 .5 6-3 10.5-13 9-21-2-10-12-10-16-7z" fill="#e5484d" ${S}/>
    <path d="M24 41.5c2.5 1 4.5 1.7 7 .5 6-3 10.5-13 9-21-.6-3-2-5-3.8-6.2C37 26 32 36 24 39z" fill="#b8323a"/>
    <path d="M24 14c0-4 1-7 3-9" stroke="#6b4423" stroke-width="2.4" stroke-linecap="round" fill="none"/>
    <path d="M26 9c3-4 8-4 11-2-2 4-7 5-11 2z" fill="#5fb83f" ${S}/>
    <ellipse cx="15" cy="21" rx="3" ry="4.5" transform="rotate(25 15 21)" fill="#fff" opacity=".5"/>`,
  chest: `
    <path d="M6 20h36v20a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z" fill="#a8672f" ${S}/>
    <path d="M6 20c0-7 4-12 10-12h16c6 0 10 5 10 12z" fill="#c07a3a" ${S}/>
    <path d="M6 26h36" stroke="${O}" stroke-width="1.6"/>
    <path d="M13 9v33M35 9v33" stroke="#7a4a24" stroke-width="2.4"/>
    <rect x="20" y="22" width="8" height="9" rx="1.5" fill="#e0b04a" ${S}/>
    <circle cx="24" cy="26.5" r="1.4" fill="${O}"/>
    <path d="M10 14c1.5-2 3.5-3 6-3.3" stroke="#e7a865" stroke-width="1.6" stroke-linecap="round" fill="none"/>`,
  torch: `
    <path d="M21 22h6l-2 22h-2z" fill="#8a5a2b" ${S}/>
    <path d="M24 3c6 6 9 10 9 14a9 9 0 0 1-18 0c0-4 3-8 9-14z" fill="#ff9a3c" ${S}/>
    <path d="M24 9c3.5 4 5 6.5 5 9a5 5 0 0 1-10 0c0-2.5 1.5-5 5-9z" fill="#ffd36e"/>
    <path d="M24 14c1.5 2 2.2 3.2 2.2 4.4a2.2 2.2 0 0 1-4.4 0c0-1.2.7-2.4 2.2-4.4z" fill="#fff6d6"/>`,
  key: `
    <circle cx="15" cy="17" r="10" fill="#e0b04a" ${S}/>
    <circle cx="15" cy="17" r="4" fill="#3a2f12" ${S}/>
    <path d="M22 24l18 18M31 33l4-4M36 38l4-4" stroke="${O}" stroke-width="6" stroke-linecap="round"/>
    <path d="M22 24l18 18M31 33l4-4M36 38l4-4" stroke="#e0b04a" stroke-width="3" stroke-linecap="round"/>
    <path d="M9 12.5a7 7 0 0 1 6-3" stroke="#fff3c4" stroke-width="1.8" stroke-linecap="round" fill="none"/>`,
  moon: `
    <path d="M30 5a19 19 0 1 0 13 26A15 15 0 0 1 30 5z" fill="#f2e3a3" ${S}/>
    <path d="M43 31A19 19 0 0 1 9 34c8 4 22 3 30-8z" fill="#d6c27a"/>
    <circle cx="18" cy="20" r="3" fill="#d6c27a"/><circle cx="23" cy="33" r="2" fill="#d6c27a"/><circle cx="14" cy="30" r="1.5" fill="#d6c27a"/>`,
  sun: `
    <g fill="#ff9a3c" ${S}>
      <path d="M24 2l3 7h-6zM24 46l-3-7h6zM2 24l7-3v6zM46 24l-7 3v-6zM8.4 8.4l7 2.8-4.2 4.2zM39.6 39.6l-7-2.8 4.2-4.2zM8.4 39.6l2.8-7 4.2 4.2zM39.6 8.4l-2.8 7-4.2-4.2z"/>
    </g>
    <circle cx="24" cy="24" r="11" fill="#ffd36e" ${S}/>
    <path d="M24 35a11 11 0 0 0 11-11c0-2-.5-3.8-1.4-5.4C34 27 29 33 19.8 34.2c1.3.5 2.7.8 4.2.8z" fill="#f2b33d"/>
    <path d="M17 20a8 8 0 0 1 5-4.6" stroke="#fff6d6" stroke-width="2" stroke-linecap="round" fill="none"/>`,
  rocket: `
    <path d="M17 32l-7 3 3-9 6-2zM31 32l7 3-3-9-6-2z" fill="#e5484d" ${S}/>
    <path d="M24 4c7 6 9 16 7 30H17C15 20 17 10 24 4z" fill="#eef1f7" ${S}/>
    <path d="M24 4c7 6 9 16 7 30h-5c2-12 1-22-2-30z" fill="#c4cad8"/>
    <circle cx="24" cy="18" r="4" fill="#7ec8ff" ${S}/>
    <path d="M20 34h8l-1 4h-6z" fill="#6c7487" ${S}/>
    <path d="M21 38c0 3 1.5 5 3 7 1.5-2 3-4 3-7z" fill="#ff9a3c" ${S}/>`,
  mushroom: `
    <path d="M19 26h10l2 15a2 2 0 0 1-2 2H19a2 2 0 0 1-2-2z" fill="#efe4cf" ${S}/>
    <path d="M4 25C4 14 13 6 24 6s20 8 20 19z" fill="#d9363e" ${S}/>
    <path d="M44 25C44 15 37 8 28 6.5 35 10 39 17 38.5 25z" fill="#a8262d"/>
    <circle cx="15" cy="16" r="3.2" fill="#fff"/><circle cx="26" cy="12" r="2.4" fill="#fff"/><circle cx="34" cy="19" r="2.8" fill="#fff"/><circle cx="21" cy="21" r="1.8" fill="#fff"/>`,
  slime: `
    <rect x="6" y="9" width="36" height="32" rx="7" fill="#7ad36b" ${S}/>
    <rect x="13" y="15" width="22" height="20" rx="4" fill="#5cb34e"/>
    <rect x="15" y="20" width="5" height="5" rx="1" fill="${O}"/><rect x="28" y="20" width="5" height="5" rx="1" fill="${O}"/>
    <rect x="22" y="29" width="4" height="3" rx="1" fill="${O}"/>
    <path d="M10 15c1-2 2.5-3 4.5-3.4" stroke="#c9f5bf" stroke-width="2" stroke-linecap="round" fill="none"/>`,
  fish: `
    <path d="M36 24l9-9v18z" fill="#2f8fbf" ${S}/>
    <path d="M4 24c5-9 14-13 22-13 6 0 10 5 12 13-2 8-6 13-12 13-8 0-17-4-22-13z" fill="#4bb3e6" ${S}/>
    <path d="M6 26c6 6 13 9 20 9 5 0 9-4 11-11-8 5-20 5-31 2z" fill="#2f8fbf"/>
    <path d="M22 12c3 3 4 6 4 9" stroke="#2f8fbf" stroke-width="2" stroke-linecap="round" fill="none"/>
    <circle cx="13" cy="21" r="2.6" fill="#fff" ${S}/><circle cx="13.5" cy="21" r="1" fill="${O}"/>`,
  cake: `
    <path d="M4 40h40v3H4z" fill="#c4cad8" ${S}/>
    <rect x="8" y="22" width="32" height="18" rx="2" fill="#d79a5c" ${S}/>
    <path d="M8 31h32" stroke="#a8672f" stroke-width="2.4"/>
    <path d="M8 24c0-3 1-4 3-4h26c2 0 3 1 3 4v2c-2 0-2 3-4 3s-2-3-4-3-2 4-4 4-2-4-4-4-2 3-4 3-2-3-4-3-2 2-4 2z" fill="#fff" ${S}/>
    <circle cx="17" cy="17" r="3" fill="#d9363e" ${S}/><circle cx="31" cy="17" r="3" fill="#d9363e" ${S}/>
    <path d="M17 14c0-3 1-5 3-6M31 14c0-3-1-5-3-6" stroke="#4a8a3a" stroke-width="1.6" stroke-linecap="round" fill="none"/>`,
  crown: `
    <path d="M6 16l9 8 9-14 9 14 9-8-4 22H10z" fill="#e0b04a" ${S}/>
    <path d="M10 38l-1.4-8h30.8L38 38z" fill="#b8862c"/>
    <rect x="9" y="37" width="30" height="5" rx="1.5" fill="#f2c45e" ${S}/>
    <circle cx="24" cy="30" r="2.8" fill="#e5484d" ${S}/><circle cx="16" cy="31" r="2" fill="#7ec8ff" ${S}/><circle cx="32" cy="31" r="2" fill="#7ee0b0" ${S}/>
    <circle cx="6" cy="15" r="2.4" fill="#f2c45e" ${S}/><circle cx="24" cy="9" r="2.4" fill="#f2c45e" ${S}/><circle cx="42" cy="15" r="2.4" fill="#f2c45e" ${S}/>`,
  shield: `
    <path d="M24 4l17 6v12c0 11-7 18-17 22C14 40 7 33 7 22V10z" fill="#3a6fd9" ${S}/>
    <path d="M24 4l17 6v12c0 11-7 18-17 22z" fill="#2c56b0"/>
    <path d="M24 9l12 4.3V22c0 8-5 13.5-12 16.6C17 35.5 12 30 12 22v-8.7z" fill="none" stroke="#e0b04a" stroke-width="2.2"/>
    <path d="M24 14v20M17 21h14" stroke="#e0b04a" stroke-width="3.2" stroke-linecap="round"/>`,
  tree: `
    <path d="M21 30h6v13h-6z" fill="#7a4a24" ${S}/>
    <circle cx="24" cy="18" r="13" fill="#4a9a3a" ${S}/>
    <circle cx="15" cy="25" r="8" fill="#4a9a3a" ${S}/><circle cx="33" cy="25" r="8" fill="#4a9a3a" ${S}/>
    <path d="M9 27c3 4 9 5 15 3 6 2 12 1 15-3-4 1-9 0-15-2-6 2-11 3-15 2z" fill="#357a2a"/>
    <circle cx="19" cy="13" r="3.5" fill="#7ad36b"/><circle cx="29" cy="20" r="2" fill="#7ad36b"/>`,
  planet: `
    <circle cx="24" cy="24" r="13" fill="#8b5cf6" ${S}/>
    <path d="M37 24a13 13 0 0 1-23.5 7.6C24 34 33 30 36.4 20.2c.4 1.2.6 2.5.6 3.8z" fill="#6a3fd0"/>
    <path d="M14 18c4-1 9 0 12 2M18 29c3 0 6 1 8 3" stroke="#c9b5ff" stroke-width="1.6" stroke-linecap="round" fill="none"/>
    <ellipse cx="24" cy="26" rx="22" ry="6" transform="rotate(-18 24 26)" fill="none" stroke="${O}" stroke-width="4.4"/>
    <ellipse cx="24" cy="26" rx="22" ry="6" transform="rotate(-18 24 26)" fill="none" stroke="#ffd36e" stroke-width="2"/>
    <path d="M11 22a13 13 0 0 1 26 0" fill="#8b5cf6" stroke="${O}" stroke-width="1.6"/>
    <path d="M14 18c4-1 9 0 12 2" stroke="#c9b5ff" stroke-width="1.6" stroke-linecap="round" fill="none"/>`,
  gem: `
    <path d="M14 7h20l10 11-20 25L4 18z" fill="#5ad1e6" ${S}/>
    <path d="M4 18h40M14 7l4 11 6 25 6-25 4-11M18 18l6-11 6 11" fill="none" stroke="${O}" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M30 18h14L24 43z" fill="#2fa3c0"/>
    <path d="M18 18l6-11 6 11z" fill="#a8f0fb"/>`,
  sprout: `
    <path d="M6 38c4-3 10-4 18-4s14 1 18 4v4H6z" fill="#7a4a24" ${S}/>
    <path d="M24 35V20" stroke="${O}" stroke-width="4.4" stroke-linecap="round"/>
    <path d="M24 35V20" stroke="#4a9a3a" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M24 22C20 12 12 11 7 13c2 7 9 11 17 9z" fill="#7ad36b" ${S}/>
    <path d="M24 20c3-8 10-11 17-9-1 7-8 11-17 9z" fill="#5fb83f" ${S}/>
    <path d="M10 14c4 0 8 2 11 5" stroke="#c9f5bf" stroke-width="1.4" stroke-linecap="round" fill="none"/>`,
  play: `
    <circle cx="24" cy="24" r="19" fill="#8b5cf6" ${S}/>
    <path d="M43 24a19 19 0 0 1-33 12.8C22 40 37 33 41.6 17c.9 2.2 1.4 4.6 1.4 7z" fill="#6a3fd0"/>
    <path d="M19 15l14 9-14 9z" fill="#fff" ${S}/>`,
  hourglass: `
    <rect x="9" y="4" width="30" height="5" rx="1.5" fill="#8a5a2b" ${S}/>
    <rect x="9" y="39" width="30" height="5" rx="1.5" fill="#8a5a2b" ${S}/>
    <path d="M13 9h22c0 8-7 11-7 15s7 7 7 15H13c0-8 7-11 7-15s-7-7-7-15z" fill="#dbe9f5" ${S}/>
    <path d="M17 13h14c-1 4-5 6-7 8-2-2-6-4-7-8zM15 37c1-5 6-7 9-9 3 2 8 4 9 9z" fill="#f2b33d"/>
    <path d="M24 21v8" stroke="#f2b33d" stroke-width="1.4"/>`,
  crates: `
    <rect x="5" y="24" width="18" height="18" rx="2" fill="#c07a3a" ${S}/>
    <rect x="25" y="24" width="18" height="18" rx="2" fill="#a8672f" ${S}/>
    <rect x="15" y="6" width="18" height="18" rx="2" fill="#d79a5c" ${S}/>
    <path d="M5 24l18 18M23 24L5 42M25 24l18 18M15 6l18 18" stroke="#7a4a24" stroke-width="1.6"/>`,
  globe: `
    <circle cx="24" cy="24" r="19" fill="#3a8fd9" ${S}/>
    <path d="M13 12c4 1 6 4 5 7s-5 3-5 7 4 4 3 8c-1 2-3 3-5 3A19 19 0 0 1 13 12zM28 7c5 1 8 4 9 8-3 1-5 0-7 2s0 5-2 6-5-1-5-4 3-4 3-7-1-4 2-5zM30 30c3-1 7 0 9 3a19 19 0 0 1-8 8c-2-3-4-8-1-11z" fill="#5fb83f" ${S}/>
    <path d="M43 24a19 19 0 0 1-31 14.7C24 41 38 34 42 18.5c.7 1.8 1 3.6 1 5.5z" fill="#000" opacity=".18"/>`,
  duo: `
    <circle cx="16" cy="16" r="7" fill="#ffcf9e" ${S}/>
    <path d="M3 41c0-8 6-13 13-13s13 5 13 13z" fill="#3a8fd9" ${S}/>
    <circle cx="32" cy="18" r="7" fill="#e9b07a" ${S}/>
    <path d="M19 43c0-8 6-13 13-13s13 5 13 13z" fill="#8b5cf6" ${S}/>`,
  group: `
    <circle cx="11" cy="19" r="5.5" fill="#e9b07a" ${S}/><path d="M1 40c0-6 4.5-10 10-10s10 4 10 10z" fill="#5fb83f" ${S}/>
    <circle cx="37" cy="19" r="5.5" fill="#ffcf9e" ${S}/><path d="M27 40c0-6 4.5-10 10-10s10 4 10 10z" fill="#e0b04a" ${S}/>
    <circle cx="24" cy="15" r="7" fill="#ffcf9e" ${S}/><path d="M11 43c0-8 6-13 13-13s13 5 13 13z" fill="#8b5cf6" ${S}/>`,
  verified: `
    <path d="M24 4l17 6v12c0 11-7 18-17 22C14 40 7 33 7 22V10z" fill="#5fb83f" ${S}/>
    <path d="M24 4l17 6v12c0 11-7 18-17 22z" fill="#4a9a3a"/>
    <path d="M16 23l6 6 11-12" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
  link: `
    <rect x="4" y="16" width="24" height="16" rx="8" transform="rotate(-35 16 24)" fill="none" stroke="${O}" stroke-width="7"/>
    <rect x="4" y="16" width="24" height="16" rx="8" transform="rotate(-35 16 24)" fill="none" stroke="#b8c0cc" stroke-width="4"/>
    <rect x="20" y="16" width="24" height="16" rx="8" transform="rotate(-35 32 24)" fill="none" stroke="${O}" stroke-width="7"/>
    <rect x="20" y="16" width="24" height="16" rx="8" transform="rotate(-35 32 24)" fill="none" stroke="#8b5cf6" stroke-width="4"/>`,
  medal: `
    <path d="M14 3h8l5 14h-8zM34 3h-8l-5 14h8z" fill="#e5484d" ${S}/>
    <path d="M26 3h8l-5 14h-8z" fill="#3a6fd9" ${S}/>
    <circle cx="24" cy="30" r="13" fill="#e0b04a" ${S}/>
    <circle cx="24" cy="30" r="9" fill="#f2c45e" stroke="#b8862c" stroke-width="1.4"/>
    <path d="M24 23.5l2 4.2 4.6.6-3.4 3.2.9 4.5-4.1-2.3-4.1 2.3.9-4.5-3.4-3.2 4.6-.6z" fill="#fff6d6" stroke="#b8862c" stroke-width="1"/>`,
};

export const PICKER_EMBLEMS = ["sword", "pickaxe", "heart", "potion", "apple", "chest", "torch", "key", "moon", "sun", "rocket", "mushroom", "slime", "fish", "cake", "crown", "shield", "tree", "planet", "gem"];

export const emblemSvg = (id: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">${EMBLEMS[id] ?? ""}</svg>`;
export const emblemUrl = (id: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(emblemSvg(id))}`;

const pngs = new Map<string, Promise<string>>();

export function emblemPng(id: string, size = 128): Promise<string> {
  let p = pngs.get(id);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = c.height = size;
        c.getContext("2d")!.drawImage(img, 0, 0, size, size);
        resolve(c.toDataURL("image/png"));
      };
      img.onerror = reject;
      img.src = emblemUrl(id);
    });
    pngs.set(id, p);
  }
  return p;
}
