import { useEffect, useSyncExternalStore } from 'react'
import { useSettings } from '@/stores/settings'

const media = () => window.matchMedia('(prefers-color-scheme: dark)')
const subscribe = (cb: () => void) => {
  const m = media()
  m.addEventListener('change', cb)
  return () => m.removeEventListener('change', cb)
}

export function useSystemDark() {
  return useSyncExternalStore(subscribe, () => media().matches)
}

export function useResolvedTheme(): 'light' | 'dark' {
  const theme = useSettings((s) => s.theme)
  const systemDark = useSystemDark()
  return theme === 'system' ? (systemDark ? 'dark' : 'light') : theme
}

/** Aplica tema y preferencia de movimiento como clases en <html>. */
export function useApplyPreferences() {
  const resolved = useResolvedTheme()
  const motion = useSettings((s) => s.motion)
  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolved === 'dark')
  }, [resolved])
  useEffect(() => {
    const c = document.documentElement.classList
    c.toggle('motion-reduced', motion === 'reduced')
    c.toggle('motion-full', motion === 'full')
  }, [motion])
}
