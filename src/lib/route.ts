import { useEffect, useState } from 'react'

export type Tab = 'train' | 'pgn' | 'editor'

function readHash(): Tab {
  const h = window.location.hash.replace(/^#\/?/, '')
  if (h === 'pgn') return 'pgn'
  if (h === 'editor') return 'editor'
  return 'train'
}

export function goTab(tab: Tab) {
  const target = tab === 'train' ? '#/' : `#/${tab}`
  if (window.location.hash !== target) window.location.hash = target
}

export function useTab(): Tab {
  const [tab, setTab] = useState<Tab>(readHash)
  useEffect(() => {
    const on = () => {
      setTab(readHash())
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return tab
}
