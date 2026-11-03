import { goTab, type Tab } from '../lib/route'

const TABS: Array<{ id: Tab; label: string; icon: string }> = [
  { id: 'train', label: '训练', icon: '♞' },
  { id: 'pgn', label: '打谱', icon: '📖' },
  { id: 'editor', label: '摆棋', icon: '♜' },
]

export function TopNav({ tab }: { tab: Tab }) {
  return (
    <nav className="top-nav" aria-label="主导航">
      {TABS.map((t) => (
        <button
          key={t.id}
          className={`nav-tab ${tab === t.id ? 'active' : ''}`}
          aria-current={tab === t.id ? 'page' : undefined}
          onClick={() => goTab(t.id)}
        >
          <span className="nav-icon" aria-hidden>
            {t.icon}
          </span>
          {t.label}
        </button>
      ))}
    </nav>
  )
}
