"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div
        className={`h-10 rounded-full bg-muted/40 animate-pulse-slow ${compact ? "w-10 mx-auto" : "w-full"}`}
      />
    );
  }

  const isDark = resolvedTheme === "dark";

  if (compact) {
    return (
      <button
        type="button"
        onClick={() => setTheme(isDark ? "light" : "dark")}
        className="flex h-10 w-10 items-center justify-center rounded-full border border-border/80 bg-card hover:bg-muted/40 text-foreground transition duration-150 cursor-pointer mx-auto"
        title={`Switch to ${isDark ? "Light" : "Dark"} Mode`}
      >
        {isDark ? (
          <Sun className="h-4.5 w-4.5" strokeWidth={1.75} />
        ) : (
          <Moon className="h-4.5 w-4.5" strokeWidth={1.75} />
        )}
      </button>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-1 rounded border border-border/80 bg-card p-0.5 text-[10px] font-mono font-medium">
      <button
        type="button"
        onClick={() => setTheme("light")}
        className={`flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded transition duration-150 cursor-pointer ${
          !isDark
            ? "bg-secondary text-foreground font-bold shadow-glow"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <Sun className="h-3.5 w-3.5" strokeWidth={2} />
        <span>LIGHT</span>
      </button>
      <button
        type="button"
        onClick={() => setTheme("dark")}
        className={`flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded transition duration-150 cursor-pointer ${
          isDark
            ? "bg-secondary text-foreground font-bold shadow-glow"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <Moon className="h-3.5 w-3.5" strokeWidth={2} />
        <span>DARK</span>
      </button>
    </div>
  );
}
