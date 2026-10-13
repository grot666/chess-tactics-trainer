import { useProgressStore, DAILY_COUNT } from '../store/progressStore'
import { todayKey } from '../lib/date'

export function SummaryPage() {
  const daily = useProgressStore((s) => s.daily)
  const setView = useProgressStore((s) => s.setView)
  const streak = useProgressStore((s) => s.streak)

  const today = todayKey()
  const results = daily && daily.date === today ? daily.results : []
  const correct = results.filter((r) => r === 'correct').length
  const answered = results.filter((r) => r != null).length
  const accuracy = answered ? Math.round((correct / answered) * 100) : 0

  return (
    <div className="page summary">
      <h1>今日训练完成</h1>
      <section className="card stats-card">
        <div className="stat">
          <div className="stat-value">
            {correct}/{DAILY_COUNT}
          </div>
          <div className="stat-label">正确题数</div>
        </div>
        <div className="stat">
          <div className="stat-value">{accuracy}%</div>
          <div className="stat-label">正确率</div>
        </div>
        <div className="stat">
          <div className="stat-value">{streak}</div>
          <div className="stat-label">连续天数</div>
        </div>
      </section>

      <div className="result-dots">
        {results.map((r, i) => (
          <span
            key={i}
            className={`dot ${r === 'correct' ? 'ok' : r === 'wrong' ? 'bad' : ''}`}
            title={`第 ${i + 1} 题`}
          />
        ))}
      </div>

      <button className="btn primary" onClick={() => setView('home')}>
        返回首页
      </button>
    </div>
  )
}
