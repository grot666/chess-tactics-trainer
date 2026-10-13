import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { DailyProgress, ProgressState, Puzzle } from '../lib/types'
import { todayKey, yesterdayKey } from '../lib/date'

const DAILY_COUNT = 10
const STORAGE_KEY = 'chess-tactics-progress-v1'

type View = 'home' | 'training' | 'summary'

type Store = ProgressState & {
  view: View
  setView: (v: View) => void
  ensureDaily: (puzzles: Puzzle[]) => DailyProgress
  recordResult: (puzzle: Puzzle, correct: boolean) => void
  advanceIndex: () => void
  resetDailyAttempt: () => void
  dailyDone: () => boolean
  todayCorrect: () => number
  todayAnswered: () => number
}

function emptyProgress(): ProgressState {
  return {
    solved: [],
    wrong: [],
    themeStats: {},
    streak: 0,
    lastPlayed: null,
    daily: null,
  }
}

function pickDailyIds(puzzles: Puzzle[], solved: string[], count: number): string[] {
  const solvedSet = new Set(solved)
  const unsolved = puzzles.filter((p) => !solvedSet.has(p.id))
  const pool = unsolved.length >= count ? unsolved : [...puzzles]
  // Deterministic-ish shuffle seeded by date
  const seed = todayKey()
    .split('')
    .reduce((a, c) => a + c.charCodeAt(0), 0)
  const arr = [...pool]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (seed * 31 + i * 17) % (i + 1)
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  // Prefer variety of ratings
  return arr.slice(0, count).map((p) => p.id)
}

export const useProgressStore = create<Store>()(
  persist(
    (set, get) => ({
      ...emptyProgress(),
      view: 'home',

      setView: (v) => set({ view: v }),

      ensureDaily: (puzzles) => {
        const today = todayKey()
        const cur = get().daily
        if (cur && cur.date === today && cur.puzzleIds.length === DAILY_COUNT) {
          return cur
        }
        const ids = pickDailyIds(puzzles, get().solved, DAILY_COUNT)
        const daily: DailyProgress = {
          date: today,
          puzzleIds: ids,
          results: Array(ids.length).fill(null),
          index: 0,
        }
        // streak: if lastPlayed was yesterday keep; if today already counted keep; else reset
        let streak = get().streak
        const last = get().lastPlayed
        if (last === yesterdayKey()) {
          // will increment when first result today
        } else if (last !== today) {
          streak = 0
        }
        set({ daily, streak })
        return daily
      },

      recordResult: (puzzle, correct) => {
        const today = todayKey()
        const state = get()
        const daily = state.daily
        if (!daily || daily.date !== today) return

        const results = [...daily.results]
        // Only count first attempt for this slot
        if (results[daily.index] == null) {
          results[daily.index] = correct ? 'correct' : 'wrong'
        }

        const solved = new Set(state.solved)
        const wrong = new Set(state.wrong)
        if (correct) {
          solved.add(puzzle.id)
          wrong.delete(puzzle.id)
        } else {
          wrong.add(puzzle.id)
        }

        const themeStats = { ...state.themeStats }
        for (const t of puzzle.themes) {
          const s = themeStats[t] ?? { correct: 0, total: 0 }
          themeStats[t] = {
            correct: s.correct + (correct ? 1 : 0),
            total: s.total + 1,
          }
        }

        let streak = state.streak
        let lastPlayed = state.lastPlayed
        if (lastPlayed !== today) {
          if (lastPlayed === yesterdayKey()) streak = streak + 1
          else streak = 1
          lastPlayed = today
        }

        set({
          daily: { ...daily, results },
          solved: [...solved],
          wrong: [...wrong],
          themeStats,
          streak,
          lastPlayed,
        })
      },

      advanceIndex: () => {
        const daily = get().daily
        if (!daily) return
        const next = Math.min(daily.index + 1, daily.puzzleIds.length)
        set({ daily: { ...daily, index: next } })
        if (next >= daily.puzzleIds.length) {
          set({ view: 'summary' })
        }
      },

      resetDailyAttempt: () => {
        // allow redo current puzzle without changing stored first-result
      },

      dailyDone: () => {
        const d = get().daily
        if (!d) return false
        return d.index >= d.puzzleIds.length && d.results.every((r) => r != null)
      },

      todayCorrect: () => {
        const d = get().daily
        if (!d || d.date !== todayKey()) return 0
        return d.results.filter((r) => r === 'correct').length
      },

      todayAnswered: () => {
        const d = get().daily
        if (!d || d.date !== todayKey()) return 0
        return d.results.filter((r) => r != null).length
      },
    }),
    {
      name: STORAGE_KEY,
      partialize: (s) => ({
        solved: s.solved,
        wrong: s.wrong,
        themeStats: s.themeStats,
        streak: s.streak,
        lastPlayed: s.lastPlayed,
        daily: s.daily,
      }),
    },
  ),
)

export { DAILY_COUNT }
