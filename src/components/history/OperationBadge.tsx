import { CircleCheck, CircleDashed, CircleExclamationPoint, RotateCcw, TriangleExclamationPoint, LoaderCircle } from 'lucide-react'
import type { OperationStatus } from '@/types'
import { Badge } from '@/components/ui/primitives'

const MAP: Record<OperationStatus, { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' | 'primary'; icon: typeof CircleCheck }> = {
  pending: { label: 'Pendiente', tone: 'neutral', icon: CircleDashed },
  in_progress: { label: 'En curso', tone: 'primary', icon: LoaderCircle },
  completed: { label: 'Completada', tone: 'success', icon: CircleCheck },
  partial: { label: 'Con avisos', tone: 'warning', icon: TriangleExclamationPoint },
  failed: { label: 'Fallida', tone: 'danger', icon: CircleExclamationPoint },
  rolled_back: { label: 'Deshecha', tone: 'neutral', icon: RotateCcw },
}

export function OperationBadge({ status }: { status: OperationStatus }) {
  const s = MAP[status]
  return (
    <Badge tone={s.tone} icon={s.icon}>
      {s.label}
    </Badge>
  )
}

// Windows en español muestra estas carpetas con su nombre traducido.
const KNOWN: Record<string, string> = {
  downloads: 'Descargas',
  desktop: 'Escritorio',
  documents: 'Documentos',
  pictures: 'Imágenes',
  videos: 'Vídeos',
  music: 'Música',
}

export const folderName = (path: string) => {
  const last = path.split(/[\\/]/).filter(Boolean).pop() ?? path
  return KNOWN[last.toLowerCase()] ?? last
}
