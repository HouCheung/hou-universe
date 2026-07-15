export type Theme = "dark" | "light";

export const DEFAULT_THEME: Theme = "dark";

export const STORAGE_KEY = "hou-universe-theme";

export function isValidTheme(value: string | null): value is Theme {
  return value === "dark" || value === "light";
}
