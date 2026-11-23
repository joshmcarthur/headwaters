export type ThemePreference = "system" | "paper" | "dusk";
export type ResolvedTheme = "paper" | "dusk";

export const THEME_STORAGE_KEY = "headwaters-theme";
export const THEME_EVENT = "headwaters:theme";

export function readPreference(stored: string | null): ThemePreference {
  if (stored === "system" || stored === "paper" || stored === "dusk") {
    return stored;
  }
  return "system";
}

export function cyclePreference(current: ThemePreference): ThemePreference {
  switch (current) {
    case "system":
      return "paper";
    case "paper":
      return "dusk";
    case "dusk":
      return "system";
    default: {
      const _exhaustive: never = current;
      return _exhaustive;
    }
  }
}

export function resolveTheme(
  preference: ThemePreference,
  prefersDark: boolean,
): ResolvedTheme {
  switch (preference) {
    case "paper":
      return "paper";
    case "dusk":
      return "dusk";
    case "system":
      return prefersDark ? "dusk" : "paper";
    default: {
      const _exhaustive: never = preference;
      return _exhaustive;
    }
  }
}

export function loadPreference(storage: Pick<Storage, "getItem">): ThemePreference {
  try {
    return readPreference(storage.getItem(THEME_STORAGE_KEY));
  } catch {
    return "system";
  }
}

export function savePreference(
  storage: Pick<Storage, "setItem">,
  preference: ThemePreference,
): void {
  try {
    storage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Private mode can throw. Keep the in-memory preference.
  }
}

export function applyResolvedTheme(root: HTMLElement, theme: ResolvedTheme): void {
  root.setAttribute("data-theme", theme);
}

export function mountTheme(button: HTMLButtonElement): void {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");

  const sync = (preference: ThemePreference): void => {
    const theme = resolveTheme(preference, mq.matches);
    applyResolvedTheme(document.documentElement, theme);
    window.dispatchEvent(
      new CustomEvent(THEME_EVENT, { detail: { preference, theme } }),
    );
  };

  let preference = loadPreference(localStorage);
  sync(preference);

  button.addEventListener("click", () => {
    preference = cyclePreference(preference);
    savePreference(localStorage, preference);
    sync(preference);
  });

  mq.addEventListener("change", () => {
    if (loadPreference(localStorage) === "system") {
      sync("system");
    }
  });
}
