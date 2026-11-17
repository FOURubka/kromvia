import { useEffect, useState } from "react";

export type ThemePref = "system" | "light" | "dark";
const STORAGE_KEY = "kromvia.theme";

function initialTheme(): ThemePref {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark" || saved === "system") return saved;
  } catch {}
  return "dark";
}

const systemDark = window.matchMedia("(prefers-color-scheme: dark)");

function apply(theme: ThemePref) {
  document.documentElement.dataset.theme = theme === "system" ? (systemDark.matches ? "dark" : "light") : theme;
}

apply(initialTheme());

export function useTheme() {
  const [theme, setTheme] = useState<ThemePref>(initialTheme);

  useEffect(() => {
    apply(theme);
    const onSystem = () => apply(theme);
    systemDark.addEventListener("change", onSystem);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {}
    return () => systemDark.removeEventListener("change", onSystem);
  }, [theme]);

  return [theme, setTheme] as const;
}
