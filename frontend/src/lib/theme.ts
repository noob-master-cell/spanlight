import { createContext, useContext } from "react";

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

/** Keep in sync with public/theme-init.js, which applies the theme before React renders. */
export const THEME_STORAGE_KEY = "spanlight-theme";
export const DARK_QUERY = "(prefers-color-scheme: dark)";

/** With nothing saved the app is light; "system" follows the OS only when chosen. */
export const DEFAULT_THEME: ThemePreference = "light";

export interface ThemeContextValue {
  theme: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: ThemePreference) => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used inside <ThemeProvider>");
  }
  return context;
}
