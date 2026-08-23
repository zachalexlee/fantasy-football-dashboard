"use client";

import { useEffect, useState } from "react";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<string | null>(null);

  useEffect(() => {
    // Resolve the *effective* theme (explicit choice, else system) so the icon
    // matches what's actually on screen — not just what's in localStorage.
    const root = document.documentElement;
    if (root.dataset.theme) {
      setTheme(root.dataset.theme);
    } else {
      setTheme(window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    }
  }, []);

  const toggle = () => {
    const root = document.documentElement;
    const isDark =
      root.dataset.theme === "dark" ||
      (!root.dataset.theme && window.matchMedia("(prefers-color-scheme: dark)").matches);
    const next = isDark ? "light" : "dark";
    root.dataset.theme = next;
    setTheme(next);
    try {
      localStorage.setItem("theme", next);
    } catch {}
  };

  return (
    <button
      onClick={toggle}
      aria-label="Toggle dark mode"
      className="rounded-full border border-hairline px-2.5 py-1 text-sm text-ink2 hover:bg-surface2"
    >
      {theme === "dark" ? "☀️" : "🌙"}
    </button>
  );
}
