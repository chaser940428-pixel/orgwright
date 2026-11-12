import { useCallback, useEffect, useState } from 'react';

export type ThemePref = 'light' | 'dark' | 'system';
const KEY = 'orgwright.theme';

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' || v === 'system' ? v : 'system';
  } catch {
    return 'system';
  }
}

function systemDark(): boolean {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
}

/** Puts .dark on <html> for the chosen theme ("system" follows prefers-color-scheme). */
export function applyTheme(pref: ThemePref = readPref()) {
  const dark = pref === 'dark' || (pref === 'system' && systemDark());
  document.documentElement.classList.toggle('dark', dark);
}

/** Theme preference, persisted in localStorage (falls back to system when storage is unavailable). */
export function useTheme() {
  const [pref, setPrefState] = useState<ThemePref>(readPref);

  useEffect(() => {
    applyTheme(pref);
    if (pref !== 'system') return;
    let mq: MediaQueryList | null = null;
    try {
      mq = window.matchMedia('(prefers-color-scheme: dark)');
    } catch {
      return;
    }
    const onChange = () => applyTheme('system');
    mq.addEventListener?.('change', onChange);
    return () => mq?.removeEventListener?.('change', onChange);
  }, [pref]);

  const setPref = useCallback((next: ThemePref) => {
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* storage blocked: keep it for this session only */
    }
    setPrefState(next);
  }, []);

  return { pref, setPref };
}
