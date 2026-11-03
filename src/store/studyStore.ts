import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { START_FEN } from '../lib/fen'

/** Persisted state for 打谱 / 摆棋 (separate key, does not touch training progress). */
type StudyStore = {
  /** Current working game as PGN. Empty = new game from the starting position. */
  pgn: string
  /** Path (child indexes) of the current move in the working game. */
  path: number[]
  orientation: 'white' | 'black'
  editorFen: string
  editorOrientation: 'white' | 'black'
  setPgn: (pgn: string, path?: number[]) => void
  setPath: (path: number[]) => void
  setOrientation: (o: 'white' | 'black') => void
  setEditorFen: (fen: string) => void
  setEditorOrientation: (o: 'white' | 'black') => void
}

export const useStudyStore = create<StudyStore>()(
  persist(
    (set) => ({
      pgn: '',
      path: [],
      orientation: 'white',
      editorFen: START_FEN,
      editorOrientation: 'white',
      setPgn: (pgn, path = []) => set({ pgn, path }),
      setPath: (path) => set({ path }),
      setOrientation: (orientation) => set({ orientation }),
      setEditorFen: (editorFen) => set({ editorFen }),
      setEditorOrientation: (editorOrientation) => set({ editorOrientation }),
    }),
    { name: 'chess-study-v1' },
  ),
)
