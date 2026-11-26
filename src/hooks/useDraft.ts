import { useEffect, useMemo, useState } from 'react'
import { api } from '@/services/api'
import { LIBRARY_LABEL } from '@/services/localFs'
import { librariesOf, useEnv } from '@/stores/env'
import { useOrganizer } from '@/stores/organizer'
import { useSettings } from '@/stores/settings'
import { makeResolver, winJoin } from '@/utils/destination'
import type { Draft } from '@/utils/plan'

/**
 * Borrador actual de la organización, con el destino resuelto a rutas
 * absolutas. Qué carpetas existen y qué archivos contienen se pregunta al
 * motor (`probeDirs`), así los conflictos y las carpetas "Nueva" son reales.
 */
export function useDraft(): Draft {
  const files = useOrganizer((s) => s.files)
  const plan = useOrganizer((s) => s.plan)
  const excluded = useOrganizer((s) => s.excluded)
  const extraFolders = useOrganizer((s) => s.extraFolders)
  // El destino es una preferencia: se recuerda la última elección.
  const destination = useSettings((s) => s.destination)
  const sourcePath = useOrganizer((s) => s.source?.path ?? '')
  const sourceName = useOrganizer((s) => s.source?.name)
  const env = useEnv((s) => s.env)

  const resolve = useMemo(
    () => makeResolver(destination, sourcePath, librariesOf(env), LIBRARY_LABEL, sourceName),
    [destination, sourcePath, sourceName, env],
  )

  // Todas las carpetas de destino posibles (cada prefijo de cada ruta).
  const candidates = useMemo(() => {
    const set = new Set<string>()
    const add = (segs: string[]) => {
      for (let i = 1; i <= segs.length; i++) set.add(resolve.dir(segs.slice(0, i)))
    }
    for (const id in plan) add(plan[id].dest)
    for (const p of extraFolders) add(p.split('/'))
    return [...set].sort()
  }, [plan, extraFolders, resolve])

  const [probe, setProbe] = useState<Map<string, { exists: boolean; files: string[] }>>(new Map())
  const key = candidates.join('|')
  useEffect(() => {
    let alive = true
    api.probeDirs(candidates).then((res) => {
      if (alive) setProbe(new Map(res.map((r) => [r.path.toLowerCase(), { exists: r.exists, files: r.files }])))
    })
    return () => {
      alive = false
    }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  return useMemo(() => {
    const existing = [...probe.entries()].flatMap(([dir, p]) => p.files.map((f) => winJoin(dir, f)))
    return {
      files,
      plan,
      excluded,
      extraFolders,
      existing,
      resolve,
      dirExists: (abs: string) => probe.get(abs.toLowerCase())?.exists ?? false,
    }
  }, [files, plan, excluded, extraFolders, probe, resolve])
}
