import type { LucideIcon } from 'lucide-react'
import {
  AppWindow,
  CircleDashed,
  CircleCheck,
  CircleExclamationPoint,
  File,
  FileArchive,
  FileCode,
  FileImage,
  FileMusic,
  FileQuestionMark,
  FileSpreadsheet,
  FileText,
  FileVideoCamera,
  Presentation,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import type { Category, Confidence } from '@/types'
import { Badge } from '@/components/ui/primitives'

const CAT_ICON: Record<Category, LucideIcon> = {
  documents: FileText,
  images: FileImage,
  videos: FileVideoCamera,
  audio: FileMusic,
  archives: FileArchive,
  programs: AppWindow,
  code: FileCode,
  other: FileQuestionMark,
}

// Un tinte suave por categoría ayuda a escanear listas largas sin saturar.
const CAT_TINT: Record<Category, string> = {
  documents: 'text-[#5865D9] bg-[#5865D9]/10',
  images: 'text-[#2F9A6E] bg-[#2F9A6E]/10',
  videos: 'text-[#B5568C] bg-[#B5568C]/10',
  audio: 'text-[#8A63D2] bg-[#8A63D2]/10',
  archives: 'text-[#B97D2C] bg-[#B97D2C]/10',
  programs: 'text-[#3E8BB5] bg-[#3E8BB5]/10',
  code: 'text-[#5F6679] bg-[#5F6679]/12 dark:text-[#A2A8B8]',
  other: 'text-faint bg-surface-2',
}

export function FileIcon({ category, ext, className }: { category: Category; ext?: string; className?: string }) {
  let Icon = CAT_ICON[category]
  if (ext && ['xls', 'xlsx', 'csv', 'ods'].includes(ext)) Icon = FileSpreadsheet
  if (ext && ['ppt', 'pptx', 'odp'].includes(ext)) Icon = Presentation
  if (!Icon) Icon = File
  return (
    <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg', CAT_TINT[category], className)}>
      <Icon className="size-4" strokeWidth={1.8} aria-hidden />
    </span>
  )
}

const CONF: Record<Confidence, { label: string; tone: 'success' | 'warning' | 'neutral'; icon: LucideIcon }> = {
  high: { label: 'Alta', tone: 'success', icon: CircleCheck },
  medium: { label: 'Media', tone: 'warning', icon: CircleDashed },
  low: { label: 'Baja', tone: 'neutral', icon: CircleExclamationPoint },
}

export function ConfidenceBadge({ value, compact }: { value: Confidence; compact?: boolean }) {
  const c = CONF[value]
  return (
    <Badge tone={c.tone} icon={c.icon}>
      {compact ? c.label : `Confianza ${c.label.toLowerCase()}`}
    </Badge>
  )
}

export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  high: 'Alta confianza',
  medium: 'Requiere revisión',
  low: 'Sin clasificar',
}
