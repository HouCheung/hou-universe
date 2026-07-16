"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { type Theme, DEFAULT_THEME, STORAGE_KEY, isValidTheme } from "@/lib/theme";

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function getStoredTheme(): Theme {
  if (typeof window === "undefined") return DEFAULT_THEME;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isValidTheme(stored)) return stored;
  } catch {
    // localStorage unavailable (private browsing, etc.)
  }
  // Mobile devices (<768px) default to dark theme on first visit (no stored preference).
  // Desktop keeps the existing DEFAULT_THEME behavior unchanged.
  if (window.innerWidth < 768) {
    return "dark";
  }
  return DEFAULT_THEME;
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;

  // Add transition class for smooth switching
  root.classList.add("theme-transition");

  // Set data-theme attribute for CSS custom property overrides
  root.setAttribute("data-theme", theme);

  // Toggle Tailwind dark class for shadcn/ui dark: variants
  if (theme === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }

  // Remove transition class after animations complete
  setTimeout(() => {
    root.classList.remove("theme-transition");
  }, 350);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(DEFAULT_THEME);
  const [mounted, setMounted] = useState(false);

  // On mount: read stored theme and apply
  useEffect(() => {
    const stored = getStoredTheme();
    setThemeState(stored);
    applyTheme(stored);
    setMounted(true);
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    applyTheme(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // localStorage unavailable
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  // Avoid rendering children until mounted to prevent hydration mismatch
  // (server always renders dark, client may have stored light)
  return (
    <ThemeContext.Provider value={{ theme: mounted ? theme : DEFAULT_THEME, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return ctx;
}
