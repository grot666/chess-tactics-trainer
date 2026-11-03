import { useProgressStore } from './store/progressStore'
import { HomePage } from './pages/HomePage'
import { TrainingPage } from './pages/TrainingPage'
import { SummaryPage } from './pages/SummaryPage'
import { PgnPage } from './pages/PgnPage'
import { EditorPage } from './pages/EditorPage'
import { TopNav } from './components/TopNav'
import { useTab } from './lib/route'

export default function App() {
  const view = useProgressStore((s) => s.view)
  const tab = useTab()

  return (
    <div className={`app-shell ${tab === 'train' ? '' : 'wide'}`}>
      <TopNav tab={tab} />
      {tab === 'train' && (
        <>
          {view === 'home' && <HomePage />}
          {view === 'training' && <TrainingPage />}
          {view === 'summary' && <SummaryPage />}
        </>
      )}
      {tab === 'pgn' && <PgnPage />}
      {tab === 'editor' && <EditorPage />}
    </div>
  )
}
