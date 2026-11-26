import { useMemo } from 'react'
import { LIBRARY_LABEL, localFs } from '@/services/localFs'
import { useOrganizer } from '@/stores/organizer'
import { useSettings } from '@/stores/settings'
import { makeResolver } from '@/utils/destination'
import type { Draft } from '@/utils/plan'

/** Borrador actual de la organización, con el destino resuelto a rutas absolutas. */
export function useDraft(): Draft {
  const files = useOrganizer((s) => s.files)
  const plan = useOrganizer((s) => s.plan)
  const excluded = useOrganizer((s) => s.excluded)
  const extraFolders = useOrganizer((s) => s.extraFolders)
  const existing = useOrganizer((s) => s.existing)
  // El destino es una preferencia: se recuerda la última elección.
  const destination = useSettings((s) => s.destination)
  const sourcePath = useOrganizer((s) => s.source?.path ?? '')
  const sourceName = useOrganizer((s) => s.source?.name)

  const resolve = useMemo(
    () => makeResolver(destination, sourcePath, localFs.libraries(), LIBRARY_LABEL, sourceName),
    [destination, sourcePath, sourceName],
  )

  return useMemo(
    () => ({ files, plan, excluded, extraFolders, existing, resolve, dirExists: localFs.exists }),
    [files, plan, excluded, extraFolders, existing, resolve],
  )
}
