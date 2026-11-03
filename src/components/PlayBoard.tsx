import { useEffect, useMemo, useState } from 'react'
import { Chess, type Square } from 'chess.js'
import { Chessboard } from 'react-chessboard'

type Promo = 'q' | 'r' | 'b' | 'n'

type Props = {
  fen: string
  orientation: 'white' | 'black'
  lastMove?: { from: string; to: string } | null
  /** Return true if the move was accepted. */
  onMove: (m: { from: string; to: string; promotion?: Promo }) => boolean
}

const PROMO_PIECES: Array<{ p: Promo; w: string; b: string; label: string }> = [
  { p: 'q', w: '♕', b: '♛', label: '后' },
  { p: 'r', w: '♖', b: '♜', label: '车' },
  { p: 'b', w: '♗', b: '♝', label: '象' },
  { p: 'n', w: '♘', b: '♞', label: '马' },
]

/** Free-play board: drag or tap-tap to move, with a promotion picker. */
export function PlayBoard({ fen, orientation, lastMove, onMove }: Props) {
  const game = useMemo(() => {
    try {
      return new Chess(fen)
    } catch {
      return null
    }
  }, [fen])
  const [selected, setSelected] = useState<string | null>(null)
  const [pendingPromo, setPendingPromo] = useState<{ from: string; to: string } | null>(null)

  useEffect(() => {
    setSelected(null)
    setPendingPromo(null)
  }, [fen])

  const legalFrom = (sq: string) => (game ? game.moves({ square: sq as Square, verbose: true }) : [])

  const tryMove = (from: string, to: string): boolean => {
    if (!game) return false
    const moves = legalFrom(from).filter((m) => m.to === to)
    if (!moves.length) return false
    if (moves.some((m) => m.promotion)) {
      setPendingPromo({ from, to })
      setSelected(null)
      return false
    }
    const ok = onMove({ from, to })
    if (ok) setSelected(null)
    return ok
  }

  const squareStyles: Record<string, React.CSSProperties> = {}
  if (lastMove) {
    squareStyles[lastMove.from] = { background: 'rgba(255, 255, 0, 0.3)' }
    squareStyles[lastMove.to] = { background: 'rgba(255, 255, 0, 0.45)' }
  }
  if (game?.isCheck()) {
    const kingSq = game
      .board()
      .flat()
      .find((p) => p && p.type === 'k' && p.color === game.turn())?.square
    if (kingSq)
      squareStyles[kingSq] = {
        background: 'radial-gradient(circle, rgba(255,60,60,.85) 0%, rgba(255,60,60,.25) 60%, transparent 75%)',
      }
  }
  if (selected) {
    squareStyles[selected] = { background: 'rgba(108, 140, 255, 0.45)' }
    for (const m of legalFrom(selected)) {
      squareStyles[m.to] = {
        ...(squareStyles[m.to] ?? {}),
        backgroundImage: game?.get(m.to as Square)
          ? 'radial-gradient(circle, transparent 58%, rgba(0,0,0,.22) 60%)'
          : 'radial-gradient(circle, rgba(0,0,0,.2) 24%, transparent 26%)',
      }
    }
  }

  const onSquareClick = ({ square }: { square: string }) => {
    if (!game || pendingPromo) return
    const piece = game.get(square as Square)
    if (selected) {
      if (selected === square) {
        setSelected(null)
        return
      }
      if (piece && piece.color === game.turn()) {
        setSelected(square)
        return
      }
      if (!tryMove(selected, square)) setSelected(null)
      return
    }
    if (piece && piece.color === game.turn()) setSelected(square)
  }

  const turnColor = game?.turn() === 'b' ? 'b' : 'w'

  return (
    <div className="board-wrap play-board">
      <Chessboard
        options={{
          id: 'play-board',
          position: fen,
          boardOrientation: orientation,
          allowDragging: !!game && !pendingPromo,
          canDragPiece: ({ piece }) => !!game && piece.pieceType[0] === game.turn(),
          onPieceDrop: ({ sourceSquare, targetSquare }) => (targetSquare ? tryMove(sourceSquare, targetSquare) : false),
          onPieceDrag: ({ square }) => {
            if (square) setSelected(square)
          },
          onSquareClick,
          squareStyles,
          animationDurationInMs: 180,
          boardStyle: { borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,.35)', width: '100%' },
        }}
      />
      {pendingPromo && (
        <div className="promo-overlay" role="dialog" aria-label="选择升变">
          <div className="promo-box">
            <div className="promo-title">升变为</div>
            <div className="promo-row">
              {PROMO_PIECES.map((x) => (
                <button
                  key={x.p}
                  className="promo-btn"
                  aria-label={x.label}
                  onClick={() => {
                    const pm = pendingPromo
                    setPendingPromo(null)
                    onMove({ ...pm, promotion: x.p })
                  }}
                >
                  {turnColor === 'w' ? x.w : x.b}
                </button>
              ))}
            </div>
            <button className="btn ghost" onClick={() => setPendingPromo(null)}>
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
