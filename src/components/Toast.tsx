import { useCallback, useRef, useState } from 'react'

export function useToast() {
  const [msg, setMsg] = useState<string | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const show = useCallback((m: string) => {
    setMsg(m)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setMsg(null), 1800)
  }, [])
  const node = msg ? (
    <div className="toast" role="status">
      {msg}
    </div>
  ) : null
  return { show, node }
}
