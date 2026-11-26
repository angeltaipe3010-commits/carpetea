import { create } from 'zustand'
import { uid } from '@/lib/id'

export type ToastTone = 'success' | 'info' | 'warning' | 'danger'

export interface Toast {
  id: string
  tone: ToastTone
  title: string
  description?: string
}

interface ToastState {
  toasts: Toast[]
  push: (t: Omit<Toast, 'id'>) => void
  dismiss: (id: string) => void
}

export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],
  push: (t) => {
    const id = uid('toast')
    set((s) => ({ toasts: [...s.toasts.slice(-2), { ...t, id }] }))
    setTimeout(() => get().dismiss(id), 4200)
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

export const toast = (t: Omit<Toast, 'id'>) => useToasts.getState().push(t)
