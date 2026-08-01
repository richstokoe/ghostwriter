// Theme preference: follow the OS by default, or override to Light / Dark.
// The choice is persisted in localStorage and applied via a `data-theme`
// attribute on <html>; the actual palettes live in styles.css. A matching
// pre-paint snippet in index.html applies the stored choice before first
// paint to avoid a flash of the wrong theme.

export type ThemePref = 'system' | 'light' | 'dark'

const KEY = 'gw.theme'

export function getThemePref(): ThemePref {
  const v = localStorage.getItem(KEY)
  return v === 'light' || v === 'dark' ? v : 'system'
}

export function applyThemePref(pref: ThemePref): void {
  const el = document.documentElement
  if (pref === 'system') {
    delete el.dataset.theme // let the prefers-color-scheme media query decide
    localStorage.removeItem(KEY)
  } else {
    el.dataset.theme = pref
    localStorage.setItem(KEY, pref)
  }
}
