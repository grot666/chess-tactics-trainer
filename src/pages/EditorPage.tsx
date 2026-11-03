import { useEffect, useMemo, useState } from 'react'
import type { Square } from 'chess.js'
import { Chessboard, ChessboardProvider, SparePiece, type PieceDropHandlerArgs } from 'react-chessboard'
import { useToast } from '../components/Toast'
import { copyText } from '../lib/clipboard'
import {
  canCastle,
  emptyState,
  epCandidates,
  fenToState,
  positionStatus,
  startState,
  stateToFen,
  validatePosition,
  type CastleKey,
  type EditorState,
  type PieceCode,
} from '../lib/fen'
import { lichessAnalysisUrl, newGame, toPgn } from '../lib/pgn'
import { goTab } from '../lib/route'
import { useStudyStore } from '../store/studyStore'

type Tool = 'move' | 'erase' | PieceCode

const WHITE_PIECES: PieceCode[] = ['wK', 'wQ', 'wR', 'wB', 'wN', 'wP']
const BLACK_PIECES: PieceCode[] = ['bK', 'bQ', 'bR', 'bB', 'bN', 'bP']
const PIECE_NAME: Record<string, string> = { K: '王', Q: '后', R: '车', B: '象', N: '马', P: '兵' }
const CASTLE_LABEL: Record<CastleKey, string> = { K: '白 O-O', Q: '白 O-O-O', k: '黑 O-O', q: '黑 O-O-O' }

function initialState(fen: string): EditorState {
  const r = fenToState(fen)
  return r.ok ? r.state : startState()
}

export function EditorPage() {
  const storedFen = useStudyStore((s) => s.editorFen)
  const setEditorFen = useStudyStore((s) => s.setEditorFen)
  const orientation = useStudyStore((s) => s.editorOrientation)
  const setOrientation = useStudyStore((s) => s.setEditorOrientation)
  const setPgn = useStudyStore((s) => s.setPgn)

  const [state, setStateRaw] = useState<EditorState>(() => initialState(storedFen))
  const [tool, setTool] = useState<Tool>('move')
  const [selected, setSelected] = useState<Square | null>(null)
  const [fenInput, setFenInput] = useState('')
  const [fenError, setFenError] = useState<string | null>(null)
  const toast = useToast()

  const fen = stateToFen(state)
  const errors = useMemo(() => validatePosition(state), [state])
  const valid = errors.length === 0
  const epOptions = epCandidates(state.board, state.turn)

  const setState = (updater: (s: EditorState) => EditorState) => setStateRaw(updater)

  useEffect(() => {
    setEditorFen(fen)
  }, [fen, setEditorFen])

  const setBoard = (fn: (b: EditorState['board']) => EditorState['board']) =>
    setState((s) => {
      const board = fn({ ...s.board })
      const ep = s.ep && epCandidates(board, s.turn).includes(s.ep) ? s.ep : ''
      return { ...s, board, ep }
    })

  const position = useMemo(() => {
    const pos: Record<string, { pieceType: string }> = {}
    for (const [sq, p] of Object.entries(state.board)) if (p) pos[sq] = { pieceType: p }
    return pos
  }, [state.board])

  const onPieceDrop = ({ piece, sourceSquare, targetSquare }: PieceDropHandlerArgs): boolean => {
    setSelected(null)
    if (piece.isSparePiece) {
      if (!targetSquare) return false
      setBoard((b) => ({ ...b, [targetSquare]: piece.pieceType as PieceCode }))
      return true
    }
    if (!targetSquare) {
      // dragged off the board → remove
      setBoard((b) => {
        delete b[sourceSquare as Square]
        return b
      })
      return true
    }
    if (targetSquare === sourceSquare) return false
    setBoard((b) => {
      const p = b[sourceSquare as Square]
      delete b[sourceSquare as Square]
      if (p) b[targetSquare as Square] = p
      return b
    })
    return true
  }

  const onSquareClick = ({ square }: { square: string }) => {
    const sq = square as Square
    if (tool === 'erase') {
      setBoard((b) => {
        delete b[sq]
        return b
      })
      return
    }
    if (tool !== 'move') {
      setBoard((b) => {
        if (b[sq] === tool) delete b[sq]
        else b[sq] = tool
        return b
      })
      return
    }
    // move tool: tap a piece, then tap a target square
    if (selected) {
      if (selected !== sq) {
        setBoard((b) => {
          const p = b[selected]
          delete b[selected]
          if (p) b[sq] = p
          return b
        })
      }
      setSelected(null)
    } else if (state.board[sq]) {
      setSelected(sq)
    }
  }

  const loadFen = () => {
    const r = fenToState(fenInput)
    if (!r.ok) {
      setFenError(r.error)
      return
    }
    setFenError(null)
    setState(() => r.state)
    setFenInput('')
    toast.show('已载入 FEN')
  }

  const startStudy = () => {
    if (!valid) return
    const t = newGame(fen)
    setPgn(toPgn(t), [])
    goTab('pgn')
  }

  const squareStyles: Record<string, React.CSSProperties> = {}
  if (selected) squareStyles[selected] = { background: 'rgba(108, 140, 255, 0.5)' }

  const toolBtn = (t: Tool, content: React.ReactNode, label: string) => (
    <button
      key={t}
      className={`palette-btn ${tool === t ? 'active' : ''}`}
      onClick={() => {
        setTool(tool === t && t !== 'move' ? 'move' : t)
        setSelected(null)
      }}
      aria-label={label}
      aria-pressed={tool === t}
      title={label}
    >
      {content}
    </button>
  )

  const paletteRow = (pieces: PieceCode[]) => (
    <div className="palette-row">
      {pieces.map((p) =>
        toolBtn(
          p,
          <span className="spare">
            <SparePiece pieceType={p} />
          </span>,
          `${p[0] === 'w' ? '白' : '黑'}${PIECE_NAME[p[1]]}`,
        ),
      )}
    </div>
  )

  return (
    <div className="page study editor">
      <ChessboardProvider
        options={{
          id: 'editor-board',
          position,
          boardOrientation: orientation,
          allowDragging: true,
          allowDragOffBoard: true,
          onPieceDrop,
          onSquareClick,
          squareStyles,
          animationDurationInMs: 0,
          boardStyle: { borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,.35)', width: '100%' },
        }}
      >
        <div className="study-grid">
          <div className="study-board-col">
            <div className="palette">
              {paletteRow(orientation === 'white' ? BLACK_PIECES : WHITE_PIECES)}
            </div>
            <div className="board-wrap">
              <Chessboard />
            </div>
            <div className="palette">
              {paletteRow(orientation === 'white' ? WHITE_PIECES : BLACK_PIECES)}
              <div className="palette-row tools">
                {toolBtn('move', '✋ 移动', '移动棋子')}
                {toolBtn('erase', '⌫ 擦除', '擦除')}
              </div>
            </div>
            <p className="hint">
              {tool === 'move'
                ? '拖动棋子摆放；拖出棋盘即删除。也可以先点棋子再点目标格。'
                : tool === 'erase'
                  ? '点棋盘上的棋子把它擦掉'
                  : `点格子放置${tool[0] === 'w' ? '白' : '黑'}${PIECE_NAME[tool[1]]}，再点一次移除`}
            </p>
          </div>

          <div className="study-side-col">
            <section className="card">
              <div className="btn-row compact">
                <button className="btn small" onClick={() => setState(() => startState())}>
                  初始局面
                </button>
                <button className="btn small" onClick={() => setState(() => emptyState())}>
                  清空棋盘
                </button>
                <button className="btn small" onClick={() => setOrientation(orientation === 'white' ? 'black' : 'white')}>
                  ⇅ 翻转
                </button>
              </div>

              <div className="opt-group">
                <span className="opt-label">谁先走</span>
                <div className="seg">
                  {(['w', 'b'] as const).map((c) => (
                    <button
                      key={c}
                      className={`seg-btn ${state.turn === c ? 'active' : ''}`}
                      onClick={() => setState((s) => ({ ...s, turn: c, ep: '' }))}
                    >
                      {c === 'w' ? '白先' : '黑先'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="opt-group">
                <span className="opt-label">易位</span>
                <div className="checks">
                  {(['K', 'Q', 'k', 'q'] as CastleKey[]).map((k) => {
                    const possible = canCastle(state.board, k)
                    return (
                      <label key={k} className={`check ${possible ? '' : 'disabled'}`}>
                        <input
                          type="checkbox"
                          disabled={!possible}
                          checked={possible && state.castling[k]}
                          onChange={(e) =>
                            setState((s) => ({ ...s, castling: { ...s.castling, [k]: e.target.checked } }))
                          }
                        />
                        {CASTLE_LABEL[k]}
                      </label>
                    )
                  })}
                </div>
              </div>

              <div className="opt-group">
                <span className="opt-label">吃过路兵</span>
                <select
                  value={epOptions.includes(state.ep as Square) ? state.ep : ''}
                  onChange={(e) => setState((s) => ({ ...s, ep: e.target.value as Square | '' }))}
                  disabled={!epOptions.length}
                >
                  <option value="">无</option>
                  {epOptions.map((sq) => (
                    <option key={sq} value={sq}>
                      {sq}
                    </option>
                  ))}
                </select>
              </div>
            </section>

            <section className={`card validity ${valid ? 'ok' : 'bad'}`}>
              {valid ? (
                <div className="valid-line">✓ 局面合法 · {positionStatus(fen)}</div>
              ) : (
                <ul className="error-list">
                  {errors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              )}
              <div className="btn-row compact">
                <button className="btn primary small" disabled={!valid} onClick={startStudy}>
                  从这里开始下 / 打谱
                </button>
                {valid && (
                  <a className="btn small" href={lichessAnalysisUrl(fen)} target="_blank" rel="noreferrer">
                    Lichess 分析 ↗
                  </a>
                )}
              </div>
            </section>

            <section className="card fen-card">
              <div className="fen-label">FEN</div>
              <code className="fen-text" data-testid="editor-fen">
                {fen}
              </code>
              <div className="btn-row compact">
                <button className="btn small" onClick={async () => toast.show((await copyText(fen)) ? 'FEN 已复制' : '复制失败')}>
                  复制 FEN
                </button>
              </div>
              <div className="fen-load">
                <input
                  placeholder="粘贴 FEN 载入局面"
                  value={fenInput}
                  onChange={(e) => setFenInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && fenInput.trim() && loadFen()}
                />
                <button className="btn small" onClick={loadFen} disabled={!fenInput.trim()}>
                  载入
                </button>
              </div>
              {fenError && <p className="error-text">{fenError}</p>}
            </section>
          </div>
        </div>
      </ChessboardProvider>
      {toast.node}
    </div>
  )
}
