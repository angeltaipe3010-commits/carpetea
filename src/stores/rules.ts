import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { prefsStorage } from '@/services/prefs'
import { DEFAULT_RULES } from '@/data/mock'
import type { Rule } from '@/types'

interface RulesState {
  rules: Rule[]
  save: (rule: Rule) => void
  remove: (id: string) => void
  toggle: (id: string) => void
  move: (id: string, dir: -1 | 1) => void
}

export const useRules = create<RulesState>()(
  persist(
    (set) => ({
      rules: DEFAULT_RULES,
      save: (rule) =>
        set((s) => {
          const i = s.rules.findIndex((r) => r.id === rule.id)
          if (i === -1) return { rules: [...s.rules, rule] }
          const rules = [...s.rules]
          rules[i] = rule
          return { rules }
        }),
      remove: (id) => set((s) => ({ rules: s.rules.filter((r) => r.id !== id) })),
      toggle: (id) => set((s) => ({ rules: s.rules.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r)) })),
      move: (id, dir) =>
        set((s) => {
          const i = s.rules.findIndex((r) => r.id === id)
          const j = i + dir
          if (i < 0 || j < 0 || j >= s.rules.length) return s
          const rules = [...s.rules]
          ;[rules[i], rules[j]] = [rules[j], rules[i]]
          return { rules }
        }),
    }),
    { name: 'carpetea:rules', storage: prefsStorage },
  ),
)
