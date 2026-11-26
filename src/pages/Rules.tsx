import { folderPathProblem, normalizeFolderPath } from '@/utils/names'
import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowDown, ArrowUp, CornerDownRight, Inbox, Pencil, Plus, Trash, Workflow, X } from 'lucide-react'
import { Page, PageHeader } from '@/components/layout/Page'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Badge, EmptyState, Input, Label, Panel, Segmented, Select, Switch } from '@/components/ui/primitives'
import { cn } from '@/lib/cn'
import { uid } from '@/lib/id'
import { plural } from '@/lib/format'
import { ease } from '@/lib/motion'
import { MOCK_FILES } from '@/data/mock'
import { categoryOf } from '@/services/classifier'
import { isNative } from '@/services/api'
import { useRules } from '@/stores/rules'
import { useSettings } from '@/stores/settings'
import { toast } from '@/stores/toasts'
import type { Rule, RuleCondition, RuleField } from '@/types'
import { CATEGORY_OPTIONS, FIELD_LABEL, OPERATORS, describeCondition, ruleMatches } from '@/utils/rules'

const SAMPLE = Object.values(MOCK_FILES).flat()
const countMatches = (r: Rule) => SAMPLE.filter((f) => ruleMatches(r, f, categoryOf(f.ext))).length

const DEST_SUGGESTIONS = [
  'Documentos/Finanzas/Facturas',
  'Documentos/Estudios',
  'Documentos/Contratos',
  'Imágenes/Capturas',
  'Imágenes/Fotografías',
  'Videos/Grabaciones',
  'Programas/Instaladores',
  'Proyectos/Desarrollo',
]

export default function Rules() {
  const { rules, toggle, move, remove, save } = useRules()
  const [editing, setEditing] = useState<Rule | null>(null)
  const [deleting, setDeleting] = useState<Rule | null>(null)

  const blank = (): Rule => ({
    id: uid('rule'),
    name: '',
    enabled: true,
    action: 'move',
    destination: '',
    conditions: [{ id: uid('c'), field: 'extension', operator: 'is', value: '' }],
  })

  return (
    <Page>
      <PageHeader
        title="Reglas"
        description="Tus reglas se aplican antes que la clasificación automática, de arriba abajo. La primera que coincide decide el destino."
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setEditing(blank())}>
            Nueva regla
          </Button>
        }
      />

      {rules.length === 0 ? (
        <Panel>
          <EmptyState
            icon={Workflow}
            title="Aún no tienes reglas"
            description="Crea reglas como “Todos los PDF con ‘factura’ van a Documentos/Finanzas/Facturas”."
            action={
              <Button variant="primary" icon={Plus} onClick={() => setEditing(blank())}>
                Crear la primera regla
              </Button>
            }
          />
        </Panel>
      ) : (
        <ol className="space-y-2.5">
          <AnimatePresence initial={false}>
            {rules.map((r, i) => (
              <motion.li
                key={r.id}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0, marginTop: 0 }}
                transition={{ duration: 0.25, ease: ease.out }}
              >
                <Panel className={cn('flex items-center gap-4 px-4 py-3.5 transition-opacity', !r.enabled && 'opacity-60')}>
                  <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-surface-2 text-[12px] font-semibold text-muted tabular-nums" title="Prioridad">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[13.5px] font-medium text-text">{r.name}</span>
                      {r.action === 'review' ? <Badge tone="warning" icon={Inbox}>Marcar para revisión</Badge> : null}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px] text-muted">
                      {r.conditions.map((c, j) => (
                        <span key={c.id} className="flex items-center gap-1.5">
                          {j > 0 && <span className="text-[10.5px] font-semibold text-faint">Y</span>}
                          <span className="rounded-md bg-surface-2 px-1.5 py-0.5">{describeCondition(c)}</span>
                        </span>
                      ))}
                    </div>
                    {r.action === 'move' && (
                      <div className="mt-1 flex items-center gap-1.5 font-mono text-[11.5px] text-faint">
                        <CornerDownRight className="size-3" />
                        {r.destination}
                      </div>
                    )}
                  </div>
                  {!isNative && (
                    <span className="text-right text-[11.5px] text-faint max-[700px]:hidden">{plural(countMatches(r), 'coincidencia', 'coincidencias')}</span>
                  )}
                  <div className="flex items-center gap-0.5">
                    <Button size="sm" variant="ghost" icon={ArrowUp} aria-label={`Subir prioridad de ${r.name}`} disabled={i === 0} onClick={() => move(r.id, -1)} />
                    <Button size="sm" variant="ghost" icon={ArrowDown} aria-label={`Bajar prioridad de ${r.name}`} disabled={i === rules.length - 1} onClick={() => move(r.id, 1)} />
                    <Button size="sm" variant="ghost" icon={Pencil} aria-label={`Editar ${r.name}`} onClick={() => setEditing(r)} />
                    <Button size="sm" variant="ghost" icon={Trash} aria-label={`Eliminar ${r.name}`} onClick={() => setDeleting(r)} />
                  </div>
                  <Switch checked={r.enabled} onChange={() => toggle(r.id)} label={`Activar ${r.name}`} />
                </Panel>
              </motion.li>
            ))}
          </AnimatePresence>
        </ol>
      )}

      {editing && (
        <RuleEditor
          initial={editing}
          isNew={!rules.some((r) => r.id === editing.id)}
          onClose={() => setEditing(null)}
          onSave={(r) => {
            save(r)
            setEditing(null)
            toast({ tone: 'success', title: 'Regla guardada', description: 'Se aplicará en el próximo análisis.' })
          }}
        />
      )}

      <Dialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="¿Eliminar esta regla?"
        description={deleting ? `“${deleting.name}” dejará de aplicarse. No afecta a archivos ya organizados.` : ''}
        width="sm"
        footer={
          <>
            <Button onClick={() => setDeleting(null)}>Cancelar</Button>
            <Button
              variant="danger"
              icon={Trash}
              onClick={() => {
                if (deleting) remove(deleting.id)
                setDeleting(null)
              }}
            >
              Eliminar regla
            </Button>
          </>
        }
      >
        <span />
      </Dialog>
    </Page>
  )
}

function RuleEditor({ initial, isNew, onClose, onSave }: { initial: Rule; isNew: boolean; onClose: () => void; onSave: (r: Rule) => void }) {
  const [rule, setRule] = useState<Rule>(initial)
  const reviewName = useSettings((s) => s.reviewFolderName)
  const matches = useMemo(() => countMatches(rule), [rule])
  const valid = rule.name.trim() && rule.conditions.every((c) => c.value.trim()) && (rule.action === 'review' || !folderPathProblem(rule.destination))

  const updateCond = (id: string, patch: Partial<RuleCondition>) =>
    setRule((r) => ({ ...r, conditions: r.conditions.map((c) => (c.id === id ? { ...c, ...patch } : c)) }))

  return (
    <Dialog
      open
      onClose={onClose}
      width="lg"
      title={isNew ? 'Nueva regla' : 'Editar regla'}
      description="Todas las condiciones deben cumplirse. Separa varios valores con comas."
      footer={
        <>
          <span className="mr-auto self-center text-[12.5px] text-muted">
            {isNative ? (
              'Verás qué archivos coinciden en la vista previa de Organizar.'
            ) : (
              <>
                Coincide con <strong className="font-semibold text-text tabular-nums">{matches}</strong> de {SAMPLE.length} archivos de ejemplo
              </>
            )}
          </span>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" disabled={!valid} onClick={() => onSave({ ...rule, name: rule.name.trim(), destination: normalizeFolderPath(rule.destination) })}>
            Guardar regla
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div>
          <Label htmlFor="rule-name">Nombre</Label>
          <Input id="rule-name" value={rule.name} onChange={(e) => setRule({ ...rule, name: e.target.value })} placeholder="Ej. Facturas en PDF" />
        </div>

        <div>
          <Label>Condiciones</Label>
          <div className="space-y-2">
            <AnimatePresence initial={false}>
              {rule.conditions.map((c, i) => (
                <motion.div
                  key={c.id}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2, ease: ease.out }}
                  className="overflow-hidden"
                >
                  <div className="flex items-center gap-2 max-[640px]:flex-wrap">
                    <span className="w-6 shrink-0 text-center text-[11px] font-semibold text-faint">{i === 0 ? 'SI' : 'Y'}</span>
                    <div className="w-[180px] shrink-0">
                    <Select
                      aria-label="Campo"
                      value={c.field}
                      onChange={(e) => {
                        const field = e.target.value as RuleField
                        updateCond(c.id, { field, operator: OPERATORS[field][0].op, value: field === 'category' ? 'documents' : '' })
                      }}
                    >
                      {(Object.keys(FIELD_LABEL) as RuleField[]).map((f) => (
                        <option key={f} value={f}>
                          {FIELD_LABEL[f]}
                        </option>
                      ))}
                    </Select>
                    </div>
                    <div className="w-[140px] shrink-0">
                    <Select aria-label="Operador" value={c.operator} onChange={(e) => updateCond(c.id, { operator: e.target.value as RuleCondition['operator'] })}>
                      {OPERATORS[c.field].map((o) => (
                        <option key={o.op} value={o.op}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                    </div>
                    <div className="min-w-0 flex-1">
                    {c.field === 'category' ? (
                      <Select aria-label="Valor" value={c.value} onChange={(e) => updateCond(c.id, { value: e.target.value })}>
                        {CATEGORY_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      <Input
                        aria-label="Valor"
                        type={c.field === 'modified' ? 'date' : c.field === 'size' ? 'number' : 'text'}
                        value={c.value}
                        onChange={(e) => updateCond(c.id, { value: e.target.value })}
                        placeholder={c.field === 'extension' ? 'pdf, docx' : c.field === 'size' ? '500' : 'factura, boleta'}
                      />
                    )}
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={X}
                      aria-label="Quitar condición"
                      disabled={rule.conditions.length === 1}
                      onClick={() => setRule((r) => ({ ...r, conditions: r.conditions.filter((x) => x.id !== c.id) }))}
                    />
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
          <Button
            size="sm"
            variant="ghost"
            icon={Plus}
            className="mt-2 ml-6"
            onClick={() => setRule((r) => ({ ...r, conditions: [...r.conditions, { id: uid('c'), field: 'name', operator: 'contains', value: '' }] }))}
          >
            Añadir condición
          </Button>
        </div>

        <div>
          <Label>Acción</Label>
          <Segmented
            name="rule-action"
            value={rule.action}
            onChange={(action) => setRule({ ...rule, action })}
            options={[
              { value: 'move', label: 'Mover a una carpeta' },
              { value: 'review', label: `Enviar a “${reviewName}”` },
            ]}
          />
          <AnimatePresence initial={false}>
            {rule.action === 'move' && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                <div className="pt-3">
                  <Label htmlFor="rule-dest" hint="relativa a la carpeta que organices">
                    Carpeta de destino
                  </Label>
                  <Input
                    id="rule-dest"
                    list="dest-suggestions"
                    value={rule.destination}
                    onChange={(e) => setRule({ ...rule, destination: e.target.value })}
                    placeholder="Documentos/Finanzas/Facturas"
                    className="font-mono text-[13px]"
                  />
                  <datalist id="dest-suggestions">
                    {DEST_SUGGESTIONS.map((d) => (
                      <option key={d} value={d} />
                    ))}
                  </datalist>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </Dialog>
  )
}
