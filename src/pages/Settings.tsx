import type { ReactNode } from 'react'
import { useState } from 'react'
import { Lock, Monitor, Moon, Plus, Sun, X } from 'lucide-react'
import { Page, PageHeader } from '@/components/layout/Page'
import { Button } from '@/components/ui/Button'
import { Badge, Input, Panel, Segmented, Select, Switch } from '@/components/ui/primitives'
import { useSettings } from '@/stores/settings'
import { toast } from '@/stores/toasts'

export default function Settings() {
  const s = useSettings()
  const [exclusion, setExclusion] = useState('')

  return (
    <Page>
      <PageHeader title="Configuración" description="Preferencias de apariencia, organización y privacidad. Se guardan en este equipo." />

      <div className="space-y-5">
        <Section title="Apariencia">
          <Row label="Tema" hint="Sistema sigue la configuración de Windows.">
            <Segmented
              name="theme"
              value={s.theme}
              onChange={(theme) => s.set({ theme })}
              options={[
                { value: 'light', label: 'Claro', icon: Sun },
                { value: 'dark', label: 'Oscuro', icon: Moon },
                { value: 'system', label: 'Sistema', icon: Monitor },
              ]}
            />
          </Row>
          <Row label="Animaciones" hint="Reducidas quita desplazamientos y transiciones; Sistema respeta la opción de Windows.">
            <Segmented
              name="motion"
              value={s.motion}
              onChange={(motion) => s.set({ motion })}
              options={[
                { value: 'system', label: 'Sistema' },
                { value: 'reduced', label: 'Reducidas' },
                { value: 'full', label: 'Completas' },
              ]}
            />
          </Row>
          <Row label="Idioma" hint="El inglés llegará en una próxima versión.">
            <Select aria-label="Idioma" value="es" onChange={() => {}} className="w-44">
              <option value="es">Español</option>
              <option value="en" disabled>
                English (próximamente)
              </option>
            </Select>
          </Row>
        </Section>

        <Section title="Organización">
          <Row label="Profundidad máxima" hint="Número máximo de niveles de carpetas que se crean.">
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={2}
                max={6}
                value={s.maxDepth}
                aria-label="Profundidad máxima"
                onChange={(e) => s.set({ maxDepth: Number(e.target.value) })}
                className="w-36"
              />
              <span className="w-16 text-[13px] font-medium text-text tabular-nums">{s.maxDepth} niveles</span>
            </div>
          </Row>
          <Row label="Subcarpetas por año" hint="Agrupa facturas, estudios y fotos por año.">
            <Switch checked={s.yearSubfolders} onChange={(v) => s.set({ yearSubfolders: v })} label="Subcarpetas por año" />
          </Row>
          <Row label="Incluir subcarpetas" hint="Analiza también las carpetas internas del origen.">
            <Switch checked={s.recursive} onChange={(v) => s.set({ recursive: v })} label="Incluir subcarpetas" />
          </Row>
          <Row label="Carpeta para revisar" hint="Donde van los archivos sin clasificación fiable.">
            <Input
              aria-label="Nombre de la carpeta para revisar"
              value={s.reviewFolderName}
              onChange={(e) => s.set({ reviewFolderName: e.target.value.replace(/[\\/:*?"<>|]/g, '') })}
              onBlur={(e) => !e.target.value.trim() && s.set({ reviewFolderName: 'Por revisar' })}
              className="w-44"
            />
          </Row>
          <Row label="Ignorar archivos ocultos" hint="Archivos de sistema y ocultos de Windows.">
            <Switch checked={s.skipHidden} onChange={(v) => s.set({ skipHidden: v })} label="Ignorar archivos ocultos" />
          </Row>
        </Section>

        <Section title="Exclusiones" description="DeskFlow nunca entra en estas rutas ni las modifica. Las carpetas del sistema están protegidas por defecto.">
          <ul className="flex flex-wrap gap-1.5 px-5 pt-1">
            {s.exclusions.map((e) => (
              <li key={e} className="flex h-7 items-center gap-1 rounded-md border border-border bg-surface-2 pr-1 pl-2.5 font-mono text-[11.5px] text-muted">
                {e}
                <button
                  type="button"
                  aria-label={`Quitar ${e}`}
                  onClick={() => s.removeExclusion(e)}
                  className="grid size-5 place-items-center rounded text-faint hover:bg-surface-3 hover:text-text"
                >
                  <X className="size-3" />
                </button>
              </li>
            ))}
          </ul>
          <form
            className="flex gap-2 px-5 pt-3 pb-4"
            onSubmit={(e) => {
              e.preventDefault()
              if (!exclusion.trim()) return
              s.addExclusion(exclusion.trim())
              setExclusion('')
            }}
          >
            <Input value={exclusion} onChange={(e) => setExclusion(e.target.value)} placeholder="Ruta o nombre de carpeta, ej. D:\Juegos" aria-label="Nueva exclusión" className="max-w-sm font-mono text-[12.5px]" />
            <Button type="submit" icon={Plus} disabled={!exclusion.trim()}>
              Añadir
            </Button>
          </form>
        </Section>

        <Section title="Privacidad">
          <Row label="Análisis de contenido local" hint="Lee el texto de PDF y documentos compatibles para clasificarlos mejor. Nunca sale de tu equipo.">
            <Switch checked={s.contentAnalysis} onChange={(v) => s.set({ contentAnalysis: v })} label="Análisis de contenido local" />
          </Row>
          <Row
            label={
              <span className="flex items-center gap-2">
                IA opcional <Badge>Próximamente</Badge>
              </span>
            }
            hint="Un modelo local para agrupar por temas. Siempre desactivado hasta que lo actives tú."
          >
            <Switch checked={false} onChange={() => {}} label="IA opcional" disabled />
          </Row>
          <div className="mx-5 mb-4 flex items-start gap-2.5 rounded-lg bg-surface-2 px-3.5 py-3 text-[12.5px] text-muted">
            <Lock className="mt-0.5 size-3.5 shrink-0 text-success" />
            DeskFlow funciona sin conexión. No envía archivos, nombres ni estadísticas a ningún servidor.
          </div>
        </Section>

        <div className="flex justify-end">
          <Button
            variant="ghost"
            onClick={() => {
              s.reset()
              toast({ tone: 'info', title: 'Preferencias restablecidas' })
            }}
          >
            Restablecer valores predeterminados
          </Button>
        </div>
      </div>
    </Page>
  )
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <Panel>
      <div className="px-5 pt-4 pb-2">
        <h2 className="text-[14px] font-semibold text-text">{title}</h2>
        {description && <p className="mt-0.5 text-[12.5px] text-muted">{description}</p>}
      </div>
      <div className="divide-y divide-border">{children}</div>
    </Panel>
  )
}

function Row({ label, hint, children }: { label: ReactNode; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 py-3.5">
      <div className="min-w-0 flex-1 basis-64">
        <div className="text-[13.5px] text-text">{label}</div>
        {hint && <div className="mt-0.5 text-[12px] leading-snug text-faint">{hint}</div>}
      </div>
      {children}
    </div>
  )
}
