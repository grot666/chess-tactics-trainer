import { Chess, type Square } from 'chess.js'

/** Normalize a move for comparison: prefer UCI. */
export function moveToUci(from: string, to: string, promotion?: string): string {
  return `${from}${to}${promotion ?? ''}`
}

export function isSameMove(
  chessBefore: Chess,
  user: { from: string; to: string; promotion?: string },
  expectedSan: string,
  expectedUci?: string,
): boolean {
  if (expectedUci) {
    const u = moveToUci(user.from, user.to, user.promotion)
    if (u === expectedUci) return true
    if (u.toLowerCase() === expectedUci.toLowerCase()) return true
  }
  const clone = new Chess(chessBefore.fen())
  try {
    const played = clone.move({
      from: user.from as Square,
      to: user.to as Square,
      promotion: (user.promotion as 'q' | 'r' | 'b' | 'n') || undefined,
    })
    if (!played) return false
    return played.san === expectedSan
  } catch {
    return false
  }
}

export function playSan(chess: Chess, san: string) {
  return chess.move(san)
}

export function playUci(chess: Chess, uci: string) {
  const from = uci.slice(0, 2) as Square
  const to = uci.slice(2, 4) as Square
  const promotion = uci.length > 4 ? (uci[4] as 'q' | 'r' | 'b' | 'n') : undefined
  return chess.move({ from, to, promotion })
}
