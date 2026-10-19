"use client";

import { useEffect } from "react";
import { useSettingsStore } from "@/store/settings";

/** Applies the persisted theme preference to <html> and tracks OS changes. */
export function useTheme(): void {
  const theme = useSettingsStore((s) => s.theme);

  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia("(prefers-color-scheme: dark)");

    const apply = () => {
      const dark = theme === "dark" || (theme === "system" && media.matches);
      root.classList.toggle("dark", dark);
      root.style.colorScheme = dark ? "dark" : "light";
    };

    apply();
    if (theme !== "system") return;

    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);
}
