import { useEffect, useState } from 'react'
import { applyThemePref, getThemePref, type ThemePref } from '../lib/theme'

const OPTIONS: { key: ThemePref; label: string; title: string }[] = [
  { key: 'system', label: 'Auto', title: 'Follow the system theme' },
  { key: 'light', label: 'Light', title: 'Always use the light theme' },
  { key: 'dark', label: 'Dark', title: 'Always use the dark theme' },
]

export function ThemeToggle() {
  const [pref, setPref] = useState<ThemePref>(() => getThemePref())

  useEffect(() => {
    applyThemePref(pref)
  }, [pref])

  return (
    <div className="theme-toggle" role="group" aria-label="Theme">
      {OPTIONS.map((o) => (
        <button
          key={o.key}
          className={pref === o.key ? 'active' : ''}
          title={o.title}
          aria-pressed={pref === o.key}
          onClick={() => setPref(o.key)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
