"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { MoonIcon, SunIcon } from "@heroicons/react/24/outline";

const BUTTON_CLASS =
  "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-base-content/10 transition-colors hover:border-base-content/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

/** One round button that shows the theme it switches to: a sun in dark, a moon in light. */
export const SwitchTheme = ({ className }: { className?: string }) => {
  const { setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  const isDarkMode = resolvedTheme === "dark";

  const handleToggle = () => {
    if (isDarkMode) {
      setTheme("light");
      return;
    }
    setTheme("dark");
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return <span aria-hidden className={`h-10 w-10 shrink-0 ${className ?? ""}`} />;

  return (
    <button
      type="button"
      className={`${BUTTON_CLASS} ${className ?? ""}`}
      onClick={handleToggle}
      aria-label={isDarkMode ? "Switch to light theme" : "Switch to dark theme"}
    >
      {isDarkMode ? <SunIcon aria-hidden className="h-4.5 w-4.5" /> : <MoonIcon aria-hidden className="h-4.5 w-4.5" />}
    </button>
  );
};
