import puzzles from '../data/puzzles.json'
import type { Puzzle } from '../lib/types'
import { useProgressStore, DAILY_COUNT } from '../store/progressStore'
import { todayKey } from '../lib/date'

const allPuzzles = puzzles as Puzzle[]

export function HomePage() {
  const ensureDaily = useProgressStore((s) => s.ensureDaily)
  const setView = useProgressStore((s) => s.setView)
  const streak = useProgressStore((s) => s.streak)
  const solved = useProgressStore((s) => s.solved)
  const daily = useProgressStore((s) => s.daily)
  const todayCorrect = useProgressStore((s) => s.todayCorrect)
  const todayAnswered = useProgressStore((s) => s.todayAnswered)

  const today = todayKey()
  const progress =
    daily && daily.date === today
      ? `${todayAnswered()}/${DAILY_COUNT}`
      : `0/${DAILY_COUNT}`
  const doneToday =
    daily &&
    daily.date === today &&
    daily.results.every((r) => r != null) &&
    daily.index >= daily.puzzleIds.length

  const start = () => {
    ensureDaily(allPuzzles)
    const d = useProgressStore.getState().daily
    if (d && d.results.every((r) => r != null) && d.index >= d.puzzleIds.length) {
      setView('summary')
    } else {
      setView('training')
    }
  }

  return (
    <div className="page home">
      <header className="hero">
        <div className="logo">♞</div>
        <h1>国际象棋战术训练</h1>
        <p className="subtitle">每日精选战术题 · 本地进度 · 纯前端</p>
      </header>

      <section className="card stats-card">
        <div className="stat">
          <div className="stat-value">{progress}</div>
          <div className="stat-label">今日进度</div>
        </div>
        <div className="stat">
          <div className="stat-value">{streak}</div>
          <div className="stat-label">连续天数</div>
        </div>
        <div className="stat">
          <div className="stat-value">{solved.length}</div>
          <div className="stat-label">累计解出</div>
        </div>
        <div className="stat">
          <div className="stat-value">{todayCorrect()}</div>
          <div className="stat-label">今日正确</div>
        </div>
      </section>

      <button className="btn primary large" onClick={start}>
        {doneToday ? '查看今日总结' : todayAnswered() > 0 ? '继续每日训练' : '开始每日训练'}
      </button>

      <p className="hint">
        题库共 {allPuzzles.length} 道战术题（来自 Lichess 公开数据，CC0），每日 {DAILY_COUNT}{' '}
        题。进度保存在本机浏览器。
      </p>
    </div>
  )
}
