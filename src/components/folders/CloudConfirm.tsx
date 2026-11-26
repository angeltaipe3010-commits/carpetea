import { Cloud, HardDrive } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'

export interface CloudTarget {
  /** Proveedores implicados, p. ej. ["OneDrive"]. */
  providers: string[]
  /** Qué se guardaría en la nube, p. ej. "D:\…" o "Documentos e Imágenes". */
  what: string
  /** `what` es plural (p. ej. varias bibliotecas). */
  plural?: boolean
}

/**
 * Aviso antes de guardar en una carpeta sincronizada con la nube.
 * Aceptar lo permite; rechazar hace que DeskFlow use una carpeta Documentos
 * local (y la cree si no existe). El usuario puede cambiarla después.
 */
export function CloudConfirm({
  target,
  onAccept,
  onDecline,
  onCancel,
}: {
  target: CloudTarget | null
  onAccept: () => void
  onDecline: () => void
  /** Cerrar sin decidir: no cambia el destino. */
  onCancel: () => void
}) {
  const provider = target ? target.providers.join(' y ') : ''
  return (
    <Dialog
      open={!!target}
      onClose={onCancel}
      width="md"
      title={`¿Guardar en ${provider}?`}
      description="Este destino está conectado a la nube."
      footer={
        <>
          <Button icon={Cloud} onClick={onAccept}>
            Sí, guardar en la nube
          </Button>
          <Button variant="primary" icon={HardDrive} onClick={onDecline} data-autofocus>
            No, usar una carpeta local
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-[13px] leading-relaxed text-muted">
        <p>
          <span className="font-medium text-text">{target?.what}</span> {target?.plural ? 'se sincronizan' : 'se sincroniza'} con {provider}. Todo lo que DeskFlow organice ahí se subirá
          a tu cuenta en la nube.
        </p>
        <p className="flex items-start gap-2 rounded-lg bg-surface-2 px-3 py-2.5">
          <HardDrive className="mt-0.5 size-3.5 shrink-0 text-success" />
          <span>
            Si eliges <span className="font-medium text-text">No</span>, DeskFlow buscará una carpeta Documentos que esté solo en este equipo y, si no
            existe, la creará. Podrás cambiarla después.
          </span>
        </p>
      </div>
    </Dialog>
  )
}
