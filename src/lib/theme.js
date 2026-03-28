export const SUPPORTED_THEMES = ["neutral", "warm", "cosy"];
export const MANUAL_THEME_STORAGE_KEY = "light-form-manual-theme";

export function getSessionStorage() {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function getManualThemeOverride() {
  const storage = getSessionStorage();
  if (!storage) return null;

  const savedTheme = storage.getItem(MANUAL_THEME_STORAGE_KEY);
  return SUPPORTED_THEMES.includes(savedTheme) ? savedTheme : null;
}

export function saveManualThemeOverride(theme) {
  const storage = getSessionStorage();
  if (!storage || !SUPPORTED_THEMES.includes(theme)) return;
  storage.setItem(MANUAL_THEME_STORAGE_KEY, theme);
}

export function getSingaporeHour() {
  try {
    const hourText = new Intl.DateTimeFormat("en-SG", {
      hour: "numeric",
      hour12: false,
      timeZone: "Asia/Singapore"
    }).format(new Date());
    return Number.parseInt(hourText, 10);
  } catch {
    return new Date().getHours();
  }
}

export function getAutoThemeForSingaporeTime() {
  const singaporeHour = getSingaporeHour();
  if (singaporeHour >= 6 && singaporeHour < 12) return "neutral";
  if (singaporeHour >= 12 && singaporeHour < 18) return "warm";
  return "cosy";
}

export function getInitialTheme() {
  return getManualThemeOverride() || getAutoThemeForSingaporeTime();
}
