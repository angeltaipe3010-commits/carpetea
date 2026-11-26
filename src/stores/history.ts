import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { SAMPLE_HISTORY } from '@/data/mock'
import type { Operation } from '@/types'

interface HistoryState {
  operations: Operation[]
  add: (op: Operation) => void
  replace: (op: Operation) => void
  clearSamples: () => void
}

export const useHistory = create<HistoryState>()(
  persist(
    (set) => ({
      operations: SAMPLE_HISTORY,
      add: (op) => set((s) => ({ operations: [op, ...s.operations] })),
      replace: (op) => set((s) => ({ operations: s.operations.map((o) => (o.id === op.id ? op : o)) })),
      clearSamples: () => set((s) => ({ operations: s.operations.filter((o) => !o.sample) })),
    }),
    { name: 'deskflow:history' },
  ),
)
