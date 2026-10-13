import { useProgressStore } from './store/progressStore'
import { HomePage } from './pages/HomePage'
import { TrainingPage } from './pages/TrainingPage'
import { SummaryPage } from './pages/SummaryPage'

export default function App() {
  const view = useProgressStore((s) => s.view)

  return (
    <div className="app-shell">
      {view === 'home' && <HomePage />}
      {view === 'training' && <TrainingPage />}
      {view === 'summary' && <SummaryPage />}
    </div>
  )
}
