import { useCallback, useEffect, useState } from 'react'
import puzzles from '../data/puzzles.json'
import type { Puzzle } from '../lib/types'
import { useProgressStore, DAILY_COUNT } from '../store/progressStore'
import { PuzzleBoard } from '../components/PuzzleBoard'
import { ThemeTags } from '../components/ThemeTags'

const allPuzzles = puzzles as Puzzle[]
const byId = new Map(allPuzzles.map((p) => [p.id, p]))

export function TrainingPage() {
  const daily = useProgressStore((s) => s.daily)
  const ensureDaily = useProgressStore((s) => s.ensureDaily)
  const recordResult = useProgressStore((s) => s.recordResult)
  const advanceIndex = useProgressStore((s) => s.advanceIndex)
  const setView = useProgressStore((s) => s.setView)

  const [feedback, setFeedback] = useState<'idle' | 'correct' | 'wrong'>('idle')
  const [solution, setSolution] = useState<string[]>([])
  const [boardKey, setBoardKey] = useState(0)

  useEffect(() => {
    ensureDaily(allPuzzles)
  }, [ensureDaily])

  useEffect(() => {
    if (daily && daily.index >= daily.puzzleIds.length) {
      setView('summary')
    }
  }, [daily, setView])

  const index = daily?.index ?? 0
  const puzzleId = daily?.puzzleIds[index]
  const puzzle = puzzleId ? byId.get(puzzleId) : undefined

  const onSolved = useCallback(() => {
    if (!puzzle) return
    setFeedback('correct')
    recordResult(puzzle, true)
  }, [puzzle, recordResult])

  const onFailed = useCallback(
    (sol: string[]) => {
      if (!puzzle) return
      setFeedback('wrong')
      setSolution(sol)
      recordResult(puzzle, false)
    },
    [puzzle, recordResult],
  )

  const next = () => {
    setFeedback('idle')
    setSolution([])
    advanceIndex()
    setBoardKey((k) => k + 1)
  }

  const retry = () => {
    setFeedback('idle')
    setSolution([])
    setBoardKey((k) => k + 1)
  }

  if (!daily || !puzzle) {
    return (
      <div className="page">
        <p>正在准备今日题目…</p>
        <button className="btn" onClick={() => setView('home')}>
          返回
        </button>
      </div>
    )
  }

  const sideLabel = puzzle.sideToMove === 'white' ? '白方' : '黑方'

  return (
    <div className="page training">
      <div className="train-header">
        <button className="btn ghost" onClick={() => setView('home')} aria-label="返回">
          ← 首页
        </button>
        <div className="progress-pill">
          {Math.min(index + 1, DAILY_COUNT)} / {DAILY_COUNT}
        </div>
      </div>

      <div className="puzzle-meta">
        <div className="meta-row">
          <span className="side-badge">{sideLabel}走棋 · 找到最佳着法</span>
          <span className="rating">评级 {puzzle.rating}</span>
        </div>
        <ThemeTags themes={puzzle.themes} />
      </div>

      <PuzzleBoard
        key={`${puzzle.id}-${boardKey}`}
        puzzle={puzzle}
        onSolved={onSolved}
        onFailed={onFailed}
        disabled={feedback !== 'idle'}
      />

      {feedback === 'correct' && (
        <div className="feedback ok">
          <div className="feedback-title">✓ 正确！</div>
          <p className="solution-line">{puzzle.moves.join(' ')}</p>
          <button className="btn primary" onClick={next}>
            {index + 1 >= DAILY_COUNT ? '查看总结' : '下一题'}
          </button>
        </div>
      )}

      {feedback === 'wrong' && (
        <div className="feedback bad">
          <div className="feedback-title">✗ 走错了</div>
          <p>正解：</p>
          <p className="solution-line">{solution.join(' ')}</p>
          <div className="btn-row">
            <button className="btn" onClick={retry}>
              重做
            </button>
            <button className="btn primary" onClick={next}>
              {index + 1 >= DAILY_COUNT ? '查看总结' : '下一题'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
