import { computed, ref, watch } from "vue";

/**
 * Global light/dark theme state.
 * Persists to localStorage and sets `data-theme` on the document element.
 */

export type ThemeMode = "light" | "dark";

const STORAGE_KEY = "neo-theme";

function isBrowser(): boolean {
  return typeof document !== "undefined" && typeof localStorage !== "undefined";
}

function readStoredTheme(): ThemeMode {
  if (!isBrowser()) return "light";
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "dark" || raw === "light") return raw;
  } catch {
    // ignore storage errors
  }
  return "light";
}

function applyTheme(theme: ThemeMode): void {
  if (!isBrowser()) return;
  document.documentElement.setAttribute("data-theme", theme);
}

const theme = ref<ThemeMode>(readStoredTheme());
applyTheme(theme.value);

watch(theme, (next) => {
  applyTheme(next);
  if (!isBrowser()) return;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // ignore storage errors
  }
});

export function useTheme() {
  function setTheme(value: ThemeMode): void {
    theme.value = value;
  }

  function toggleTheme(): void {
    theme.value = theme.value === "light" ? "dark" : "light";
  }

  return {
    theme,
    isDark: computed(() => theme.value === "dark"),
    setTheme,
    toggleTheme,
  };
}
