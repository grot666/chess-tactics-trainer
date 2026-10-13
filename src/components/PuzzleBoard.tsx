import { useCallback, useEffect, useState } from 'react'
import { Chess, type Square } from 'chess.js'
import { Chessboard } from 'react-chessboard'
import type { Puzzle } from '../lib/types'
import { isSameMove, playSan, playUci } from '../lib/chessUtils'

type Status = 'playing' | 'correct' | 'wrong'

type Props = {
  puzzle: Puzzle
  onSolved: () => void
  onFailed: (solutionSan: string[]) => void
  disabled?: boolean
}

export function PuzzleBoard({ puzzle, onSolved, onFailed, disabled }: Props) {
  const [game, setGame] = useState(() => new Chess(puzzle.fen))
  const [fen, setFen] = useState(puzzle.fen)
  const [moveIndex, setMoveIndex] = useState(0) // index into puzzle.moves (player + opponent interleaved; player moves are even if side starts)
  const [status, setStatus] = useState<Status>('playing')
  const [selected, setSelected] = useState<string | null>(null)
  const [optionSquares, setOptionSquares] = useState<Record<string, React.CSSProperties>>({})
  const [lastMoveSquares, setLastMoveSquares] = useState<Record<string, React.CSSProperties>>({})

  useEffect(() => {
    const g = new Chess(puzzle.fen)
    setGame(g)
    setFen(puzzle.fen)
    setMoveIndex(0)
    setStatus('playing')
    setSelected(null)
    setOptionSquares({})
    setLastMoveSquares({})
  }, [puzzle.id, puzzle.fen])

  const orientation = puzzle.sideToMove

  const highlightMove = (from: string, to: string) => {
    setLastMoveSquares({
      [from]: { background: 'rgba(255, 255, 0, 0.35)' },
      [to]: { background: 'rgba(255, 255, 0, 0.5)' },
    })
  }

  const getMoveOptions = useCallback(
    (square: string) => {
      const moves = game.moves({ square: square as Square, verbose: true })
      if (moves.length === 0) {
        setOptionSquares({})
        return false
      }
      const styles: Record<string, React.CSSProperties> = {}
      for (const m of moves) {
        styles[m.to] = {
          background:
            game.get(m.to as Square)
              ? 'radial-gradient(circle, rgba(0,0,0,.15) 85%, transparent 85%)'
              : 'radial-gradient(circle, rgba(0,0,0,.15) 25%, transparent 25%)',
          borderRadius: '50%',
        }
      }
      styles[square] = { background: 'rgba(255, 255, 0, 0.4)' }
      setOptionSquares(styles)
      return true
    },
    [game],
  )

  const finishCorrect = useCallback(() => {
    setStatus('correct')
    onSolved()
  }, [onSolved])

  const finishWrong = useCallback(() => {
    setStatus('wrong')
    onFailed(puzzle.moves)
  }, [onFailed, puzzle.moves])

  const applyUserMove = useCallback(
    (from: string, to: string, promotion?: string) => {
      if (status !== 'playing' || disabled) return false

      const expectedIdx = moveIndex
      const expectedSan = puzzle.moves[expectedIdx]
      const expectedUci = puzzle.movesUci?.[expectedIdx]

      const before = new Chess(game.fen())
      const legal = before
        .moves({ verbose: true })
        .some((m) => m.from === from && m.to === to)
      if (!legal) return false

      const ok = isSameMove(before, { from, to, promotion }, expectedSan, expectedUci)
      if (!ok) {
        // Play the wrong move briefly for feedback, then fail
        const g = new Chess(game.fen())
        try {
          g.move({
            from: from as Square,
            to: to as Square,
            promotion: (promotion as 'q' | 'r' | 'b' | 'n') || 'q',
          })
          setFen(g.fen())
          highlightMove(from, to)
        } catch {
          /* ignore */
        }
        finishWrong()
        return true
      }

      const g = new Chess(game.fen())
      const played = puzzle.movesUci?.[expectedIdx]
        ? playUci(g, puzzle.movesUci[expectedIdx])
        : playSan(g, expectedSan)
      if (!played) {
        finishWrong()
        return false
      }
      highlightMove(played.from, played.to)
      setGame(g)
      setFen(g.fen())
      setOptionSquares({})
      setSelected(null)

      const nextIdx = expectedIdx + 1
      // If next is opponent reply, auto-play it
      if (nextIdx < puzzle.moves.length) {
        const replySan = puzzle.moves[nextIdx]
        const replyUci = puzzle.movesUci?.[nextIdx]
        window.setTimeout(() => {
          const g2 = new Chess(g.fen())
          const reply = replyUci ? playUci(g2, replyUci) : playSan(g2, replySan)
          if (reply) {
            setGame(g2)
            setFen(g2.fen())
            highlightMove(reply.from, reply.to)
          }
          const afterReply = nextIdx + 1
          if (afterReply >= puzzle.moves.length) {
            finishCorrect()
          } else {
            setMoveIndex(afterReply)
          }
        }, 350)
      } else {
        finishCorrect()
      }
      return true
    },
    [status, disabled, moveIndex, puzzle, game, finishCorrect, finishWrong],
  )

  const onPieceDrop = ({
    sourceSquare,
    targetSquare,
  }: {
    sourceSquare: string
    targetSquare: string | null
  }) => {
    if (!targetSquare) return false
    return applyUserMove(sourceSquare, targetSquare)
  }

  const onSquareClick = ({ square }: { square: string }) => {
    if (status !== 'playing' || disabled) return
    if (selected) {
      if (selected === square) {
        setSelected(null)
        setOptionSquares({})
        return
      }
      const moved = applyUserMove(selected, square)
      if (!moved) {
        // try select new piece of our color
        const piece = game.get(square as Square)
        if (piece && piece.color === game.turn()) {
          setSelected(square)
          getMoveOptions(square)
        } else {
          setSelected(null)
          setOptionSquares({})
        }
      }
      return
    }
    const piece = game.get(square as Square)
    if (piece && piece.color === game.turn()) {
      setSelected(square)
      getMoveOptions(square)
    }
  }

  const squareStyles = { ...optionSquares, ...lastMoveSquares }

  return (
    <div className={`board-wrap status-${status}`}>
      <Chessboard
        options={{
          id: `puzzle-${puzzle.id}`,
          position: fen,
          boardOrientation: orientation,
          allowDragging: status === 'playing' && !disabled,
          onPieceDrop,
          onSquareClick,
          squareStyles,
          animationDurationInMs: 200,
          boardStyle: {
            borderRadius: '8px',
            boxShadow: '0 8px 24px rgba(0,0,0,.35)',
            width: '100%',
          },
        }}
      />
    </div>
  )
}
