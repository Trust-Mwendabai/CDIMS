// Theme handling shared by the toggle, the profile preferences and the auth bootstrap.
// A preference is 'system' | 'light' | 'dark'. 'system' follows the device and is not stored locally.
const KEY = 'cdims-theme';

export const systemTheme = () =>
  window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

export function savedTheme() {
  try {
    const t = localStorage.getItem(KEY);
    return t === 'light' || t === 'dark' ? t : null;
  } catch {
    return null;
  }
}

export const currentTheme = () => document.documentElement.dataset.theme || savedTheme() || systemTheme();

export function applyThemePref(pref) {
  try {
    if (pref === 'light' || pref === 'dark') localStorage.setItem(KEY, pref);
    else localStorage.removeItem(KEY);
  } catch { /* storage unavailable */ }
  const effective = pref === 'light' || pref === 'dark' ? pref : systemTheme();
  document.documentElement.dataset.theme = effective;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', effective === 'dark' ? '#0d1420' : '#0b6e99');
  window.dispatchEvent(new CustomEvent('cdims-theme', { detail: effective }));
}

/** Call once at startup: follow the device while there is no saved choice. */
export function initTheme() {
  if (!window.matchMedia) return;
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (!savedTheme()) applyThemePref('system');
  });
}
