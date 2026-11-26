import type { Category, FileEntry, Rule, RuleCondition, RuleField, RuleOperator } from '@/types'

export const FIELD_LABEL: Record<RuleField, string> = {
  extension: 'Extensión',
  name: 'Nombre',
  size: 'Tamaño (MB)',
  modified: 'Fecha de modificación',
  category: 'Categoría',
}

export const OPERATORS: Record<RuleField, { op: RuleOperator; label: string }[]> = {
  extension: [{ op: 'is', label: 'es' }],
  name: [
    { op: 'contains', label: 'contiene' },
    { op: 'is', label: 'es exactamente' },
  ],
  size: [
    { op: 'gt', label: 'mayor que' },
    { op: 'lt', label: 'menor que' },
  ],
  modified: [
    { op: 'lt', label: 'anterior a' },
    { op: 'gt', label: 'posterior a' },
  ],
  category: [{ op: 'is', label: 'es' }],
}

export const CATEGORY_OPTIONS: { value: Category; label: string }[] = [
  { value: 'documents', label: 'Documentos' },
  { value: 'images', label: 'Imágenes' },
  { value: 'videos', label: 'Videos' },
  { value: 'audio', label: 'Audio' },
  { value: 'archives', label: 'Comprimidos' },
  { value: 'programs', label: 'Programas' },
  { value: 'code', label: 'Código' },
  { value: 'other', label: 'Otros' },
]

const list = (v: string) =>
  v
    .split(',')
    .map((s) => s.trim().toLowerCase().replace(/^\./, ''))
    .filter(Boolean)

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

function conditionMatches(c: RuleCondition, f: FileEntry, category: Category): boolean {
  const v = c.value.trim()
  if (!v) return false
  switch (c.field) {
    case 'extension':
      return list(v).includes(f.ext)
    case 'name': {
      const name = norm(f.name)
      const base = name.replace(/\.[^.]+$/, '')
      return c.operator === 'is' ? list(v).some((x) => norm(x) === base || norm(x) === name) : list(v).some((x) => name.includes(norm(x)))
    }
    case 'size': {
      const mb = Number(v.replace(',', '.'))
      if (Number.isNaN(mb)) return false
      const size = f.size / 1024 / 1024
      return c.operator === 'gt' ? size > mb : size < mb
    }
    case 'modified': {
      const t = Date.parse(v)
      if (Number.isNaN(t)) return false
      const m = Date.parse(f.modified)
      return c.operator === 'gt' ? m > t : m < t
    }
    case 'category':
      return list(v).includes(category)
  }
}

/** Todas las condiciones deben cumplirse (Y lógico). */
export function ruleMatches(rule: Rule, f: FileEntry, category: Category): boolean {
  return rule.conditions.length > 0 && rule.conditions.every((c) => conditionMatches(c, f, category))
}

export function describeCondition(c: RuleCondition): string {
  const op = OPERATORS[c.field].find((o) => o.op === c.operator)?.label ?? c.operator
  const value =
    c.field === 'category'
      ? CATEGORY_OPTIONS.find((o) => o.value === c.value)?.label ?? c.value
      : c.field === 'size'
        ? `${c.value} MB`
        : c.field === 'extension'
          ? list(c.value).map((e) => `.${e}`).join(', ')
          : `“${c.value}”`
  return `${FIELD_LABEL[c.field].replace(' (MB)', '')} ${op} ${value}`
}
