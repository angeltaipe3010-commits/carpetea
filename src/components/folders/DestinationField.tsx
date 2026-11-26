import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowRight, CircleExclamationPoint, Cloud, FolderOpen, HardDrive, ShieldCheck, TriangleExclamationPoint } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Segmented } from '@/components/ui/primitives'
import { cn } from '@/lib/cn'
import { ease } from '@/lib/motion'
import { api, isNative } from '@/services/api'
import { LIBRARY_LABEL } from '@/services/localFs'
import { cloudLibrariesOf, librariesOf, useEnv } from '@/stores/env'
import { toast } from '@/stores/toasts'
import type { Destination, DestinationMode } from '@/types'
import { baseName, cloudProvider, destinationProblem } from '@/utils/destination'
import { CloudConfirm, type CloudTarget } from './CloudConfirm'
import { FolderPicker } from './FolderPicker'

/** Proveedores de nube que afectan a un destino (vacío = todo local). */
export function destinationCloud(d: Destination): string[] {
  if (d.mode === 'custom') {
    const p = d.cloudProvider ?? (d.customPath ? cloudProvider(d.customPath) : null)
    return p ? [p] : []
  }
  if (d.mode === 'libraries') return [...new Set(cloudLibrariesOf(useEnv.getState().env).map((c) => c.provider))]
  return []
}

/** Indica si el destino se puede usar: válido y, si toca la nube, confirmado. */
export function destinationReady(d: Destination): boolean {
  if (d.mode === 'custom' && (!d.customPath || destinationProblem(d.customPath))) return false
  return destinationCloud(d).length === 0 || !!d.allowCloud
}

/** Elige dónde se guarda lo organizado: misma carpeta, bibliotecas de Windows u otra carpeta. */
export function DestinationField({
  value,
  onChange,
  sourceName,
}: {
  value: Destination
  onChange: (d: Destination) => void
  sourceName?: string
}) {
  const [picking, setPicking] = useState(false)
  // Destino pendiente de confirmar porque toca la nube.
  const [pending, setPending] = useState<{ dest: Destination; target: CloudTarget } | null>(null)
  const env = useEnv((s) => s.env)
  const libs = librariesOf(env)
  const cloudLibs = cloudLibrariesOf(env)
  const customProblem = value.customPath ? destinationProblem(value.customPath) : null
  const cloud = destinationCloud(value)
  const where = sourceName ?? 'la carpeta que organices'

  /** Aplica un destino; si toca la nube y no está confirmado, pregunta primero. */
  const request = (dest: Destination) => {
    const providers = destinationCloud(dest)
    if (providers.length && !dest.allowCloud) {
      const what =
        dest.mode === 'libraries'
          ? `Tus bibliotecas ${cloudLibs.map((c) => c.label).join(' e ')}`
          : `La carpeta ${baseName(dest.customPath)}`
      setPending({ dest, target: { providers, what, plural: dest.mode === 'libraries' && cloudLibs.length > 1 } })
      return
    }
    onChange(dest)
  }

  const applyLocalDocuments = async () => {
    let result: { path: string; created: boolean }
    try {
      result = await api.localDocuments()
    } catch (e) {
      toast({ tone: 'danger', title: 'No se pudo preparar una carpeta local', description: e instanceof Error ? e.message : String(e) })
      return
    }
    const { path, created } = result
    onChange({ mode: 'custom', customPath: path, allowCloud: false })
    toast({
      tone: 'success',
      title: created ? 'Se creó una carpeta Documentos local' : 'Se usará tu carpeta Documentos local',
      description: `${path}. Puedes cambiarla cuando quieras.`,
    })
  }

  /** En escritorio, el selector nativo de Windows; en el navegador, el simulado. */
  const openPicker = async () => {
    if (!isNative) return setPicking(true)
    try {
      const picked = await api.pickFolder('Elegir carpeta de destino', value.customPath || undefined)
      if (!picked) return
      if (picked.problem) return toast({ tone: 'danger', title: 'No se puede usar esa carpeta', description: picked.problem })
      request({ mode: 'custom', customPath: picked.path, cloudProvider: picked.cloud })
    } catch (e) {
      toast({ tone: 'danger', title: 'No se pudo abrir el selector', description: e instanceof Error ? e.message : String(e) })
    }
  }

  const setMode = (mode: DestinationMode) => {
    if (mode === 'custom') {
      if (value.customPath) request({ mode, customPath: value.customPath, cloudProvider: value.cloudProvider })
      else openPicker()
      return
    }
    request({ mode, customPath: value.customPath })
  }

  return (
    <div>
      <Segmented
        name="destination"
        size="sm"
        value={value.mode}
        onChange={setMode}
        options={[
          { value: 'source', label: 'Misma carpeta' },
          { value: 'libraries', label: 'Bibliotecas' },
          { value: 'custom', label: 'Otra carpeta' },
        ]}
      />

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={value.mode}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0, transition: { duration: 0.2, ease: ease.out } }}
          exit={{ opacity: 0, transition: { duration: 0.1 } }}
          className="mt-3"
        >
          {value.mode === 'source' && (
            <div className="space-y-2 text-[12.5px]">
              <p className="text-muted">
                Las carpetas se crean dentro de <span className="font-medium text-text">{where}</span>.
              </p>
              <p className="flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2 text-text">
                <TriangleExclamationPoint className="mt-0.5 size-3.5 shrink-0 text-warning" />
                Lo que descargues después volverá a quedar suelto en la raíz.
              </p>
            </div>
          )}

          {value.mode === 'libraries' && (
            <div className="space-y-2 text-[12.5px]">
              <ul className="space-y-1 rounded-lg border border-border px-3 py-2.5">
                {(
                  [
                    ['Documentos y Proyectos', 'documents'],
                    ['Imágenes', 'pictures'],
                    ['Videos', 'videos'],
                    ['Audio', 'music'],
                  ] as const
                ).map(([from, key]) => {
                  const provider = cloudProvider(libs[key])
                  return (
                    <li key={from} className="flex items-center gap-2">
                      <span className="w-[44%] shrink-0 text-text">{from}</span>
                      <ArrowRight className="size-3 shrink-0 text-faint" />
                      <span className="min-w-0 truncate text-muted" title={libs[key]}>
                        {LIBRARY_LABEL[key]}
                      </span>
                      {provider && (
                        <span className="ml-auto flex shrink-0 items-center gap-1 text-[11px] text-warning" title={libs[key]}>
                          <Cloud className="size-3" />
                          {provider}
                        </span>
                      )}
                    </li>
                  )
                })}
                <li className="flex items-center gap-2 pt-1 text-faint">
                  <span className="w-[44%] shrink-0">Programas, comprimidos, por revisar</span>
                  <ArrowRight className="size-3 shrink-0" />
                  <span className="min-w-0">se quedan en {where}</span>
                </li>
              </ul>
              {cloud.length === 0 && (
                <p className="flex items-center gap-2 text-success">
                  <ShieldCheck className="size-3.5 shrink-0" />
                  Las bibliotecas están en este equipo, no en la nube.
                </p>
              )}
            </div>
          )}

          {value.mode === 'custom' && (
            <div className="space-y-2">
              <div className={cn('flex items-center gap-3 rounded-lg border px-3 py-2.5', customProblem ? 'border-danger/40 bg-danger-soft' : 'border-border')}>
                {cloud.length ? (
                  <Cloud className="size-4 shrink-0 text-warning" strokeWidth={1.8} />
                ) : (
                  <FolderOpen className={cn('size-4 shrink-0', value.customPath ? 'text-primary' : 'text-faint')} strokeWidth={1.8} />
                )}
                <div className="min-w-0 flex-1">
                  {value.customPath ? (
                    <>
                      <div className="truncate text-[13px] font-medium text-text">{baseName(value.customPath)}</div>
                      <div className="truncate font-mono text-[11px] text-faint" title={value.customPath}>
                        {value.customPath}
                      </div>
                    </>
                  ) : (
                    <div className="text-[13px] text-faint">Ninguna carpeta elegida</div>
                  )}
                </div>
                <Button size="sm" onClick={openPicker}>
                  {value.customPath ? 'Cambiar' : 'Elegir…'}
                </Button>
              </div>
              {customProblem && (
                <p className="flex items-center gap-2 text-[12px] text-danger">
                  <CircleExclamationPoint className="size-3.5 shrink-0" />
                  {customProblem}
                </p>
              )}
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Estado de la nube para el destino actual */}
      {cloud.length > 0 &&
        (value.allowCloud ? (
          <p className="mt-2.5 flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2 text-[12px] text-text">
            <Cloud className="mt-0.5 size-3.5 shrink-0 text-warning" />
            <span>
              Aceptaste guardar en {cloud.join(' y ')}: lo organizado se subirá a la nube.{' '}
              <button type="button" onClick={applyLocalDocuments} className="font-medium text-primary hover:underline">
                Usar una carpeta local
              </button>
            </span>
          </p>
        ) : (
          <div className="mt-2.5 rounded-lg border border-warning/40 bg-warning-soft px-3 py-2.5 text-[12px]">
            <p className="flex items-start gap-2 text-text">
              <Cloud className="mt-0.5 size-3.5 shrink-0 text-warning" />
              Este destino está conectado a {cloud.join(' y ')}. Confirma qué hacer antes de organizar.
            </p>
            <div className="mt-2 flex flex-wrap gap-2 pl-5.5">
              <Button size="sm" variant="primary" icon={HardDrive} onClick={applyLocalDocuments}>
                Usar carpeta local
              </Button>
              <Button size="sm" icon={Cloud} onClick={() => onChange({ ...value, allowCloud: true })}>
                Guardar en la nube
              </Button>
            </div>
          </div>
        ))}

      <FolderPicker
        open={picking}
        initialPath={value.customPath || undefined}
        onClose={() => setPicking(false)}
        onPick={(path) => {
          setPicking(false)
          request({ mode: 'custom', customPath: path })
        }}
      />

      <CloudConfirm
        target={pending?.target ?? null}
        onAccept={() => {
          if (pending) onChange({ ...pending.dest, allowCloud: true })
          setPending(null)
        }}
        onDecline={() => {
          setPending(null)
          applyLocalDocuments()
        }}
        onCancel={() => setPending(null)}
      />
    </div>
  )
}
