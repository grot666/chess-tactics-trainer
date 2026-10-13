export type Puzzle = {
  id: string
  fen: string
  setupFen?: string
  setupUci?: string
  moves: string[]
  movesUci?: string[]
  themes: string[]
  allThemes?: string[]
  rating: number
  popularity?: number
  nbPlays?: number
  sideToMove: 'white' | 'black'
  explanation?: string
}

export type ThemeStat = { correct: number; total: number }

export type DailyProgress = {
  date: string
  puzzleIds: string[]
  results: Array<'correct' | 'wrong' | null>
  index: number
}

export type ProgressState = {
  solved: string[]
  wrong: string[]
  themeStats: Record<string, ThemeStat>
  streak: number
  lastPlayed: string | null
  daily: DailyProgress | null
}
