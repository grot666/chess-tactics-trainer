import { Chess, validateFen, type Square } from 'chess.js'

export type Color = 'w' | 'b'
export type PieceCode = `${Color}${'K' | 'Q' | 'R' | 'B' | 'N' | 'P'}`
export type BoardMap = Partial<Record<Square, PieceCode>>
export type CastleKey = 'K' | 'Q' | 'k' | 'q'

export type EditorState = {
  board: BoardMap
  turn: Color
  castling: Record<CastleKey, boolean>
  ep: Square | ''
  halfmove: number
  fullmove: number
}

export const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const
export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
export const EMPTY_FEN = '8/8/8/8/8/8/8/8 w - - 0 1'

const NO_CASTLE: Record<CastleKey, boolean> = { K: false, Q: false, k: false, q: false }

export function emptyState(): EditorState {
  return { board: {}, turn: 'w', castling: { ...NO_CASTLE }, ep: '', halfmove: 0, fullmove: 1 }
}

export function startState(): EditorState {
  const r = fenToState(START_FEN)
  if (!r.ok) throw new Error(r.error)
  return r.state
}

function pieceFromChar(ch: string): PieceCode | null {
  const lower = ch.toLowerCase()
  if (!'kqrbnp'.includes(lower)) return null
  const color: Color = ch === lower ? 'b' : 'w'
  return `${color}${lower.toUpperCase()}` as PieceCode
}

function charFromPiece(p: PieceCode): string {
  const t = p[1]
  return p[0] === 'w' ? t : t.toLowerCase()
}

export function placementToBoard(placement: string): BoardMap | string {
  const rows = placement.split('/')
  if (rows.length !== 8) return `棋盘部分必须有 8 行（用 “/” 分隔），现在是 ${rows.length} 行`
  const board: BoardMap = {}
  for (let r = 0; r < 8; r++) {
    const rank = 8 - r
    let file = 0
    for (const ch of rows[r]) {
      if (/[1-8]/.test(ch)) {
        file += parseInt(ch, 10)
        continue
      }
      const p = pieceFromChar(ch)
      if (!p) return `第 ${rank} 行有无法识别的字符 “${ch}”`
      if (file > 7) return `第 ${rank} 行超过 8 格`
      board[`${FILES[file]}${rank}` as Square] = p
      file++
    }
    if (file !== 8) return `第 ${rank} 行应为 8 格，现在是 ${file} 格`
  }
  return board
}

export function boardToPlacement(board: BoardMap): string {
  const rows: string[] = []
  for (let rank = 8; rank >= 1; rank--) {
    let row = ''
    let empty = 0
    for (const f of FILES) {
      const p = board[`${f}${rank}` as Square]
      if (p) {
        if (empty) row += empty
        empty = 0
        row += charFromPiece(p)
      } else empty++
    }
    if (empty) row += empty
    rows.push(row)
  }
  return rows.join('/')
}

/** Whether a castling right is physically possible (king and rook on home squares). */
export function canCastle(board: BoardMap, key: CastleKey): boolean {
  switch (key) {
    case 'K':
      return board.e1 === 'wK' && board.h1 === 'wR'
    case 'Q':
      return board.e1 === 'wK' && board.a1 === 'wR'
    case 'k':
      return board.e8 === 'bK' && board.h8 === 'bR'
    case 'q':
      return board.e8 === 'bK' && board.a8 === 'bR'
  }
}

/** En-passant target squares consistent with the side to move (a pawn just made a double step). */
export function epCandidates(board: BoardMap, turn: Color): Square[] {
  const out: Square[] = []
  for (const f of FILES) {
    if (turn === 'w') {
      // black just played x7-x5
      if (board[`${f}5` as Square] === 'bP' && !board[`${f}6` as Square] && !board[`${f}7` as Square])
        out.push(`${f}6` as Square)
    } else if (board[`${f}4` as Square] === 'wP' && !board[`${f}3` as Square] && !board[`${f}2` as Square]) {
      out.push(`${f}3` as Square)
    }
  }
  return out
}

/** Build a FEN, dropping castling/ep rights that the board cannot support. */
export function stateToFen(s: EditorState): string {
  const castle = (['K', 'Q', 'k', 'q'] as CastleKey[])
    .filter((k) => s.castling[k] && canCastle(s.board, k))
    .join('')
  const ep = s.ep && epCandidates(s.board, s.turn).includes(s.ep) ? s.ep : '-'
  return [
    boardToPlacement(s.board),
    s.turn,
    castle || '-',
    ep,
    String(Math.max(0, s.halfmove)),
    String(Math.max(1, s.fullmove)),
  ].join(' ')
}

/** Parse a FEN (lenient: missing trailing fields get defaults). Errors are in Chinese. */
export function fenToState(fen: string): { ok: true; state: EditorState } | { ok: false; error: string } {
  const parts = fen.trim().split(/\s+/)
  if (!parts[0]) return { ok: false, error: 'FEN 为空' }
  if (parts.length > 6) return { ok: false, error: 'FEN 字段过多（最多 6 段，用空格分隔）' }
  const board = placementToBoard(parts[0])
  if (typeof board === 'string') return { ok: false, error: board }
  const turnStr = parts[1] ?? 'w'
  if (turnStr !== 'w' && turnStr !== 'b') return { ok: false, error: `走棋方必须是 w 或 b，现在是 “${turnStr}”` }
  const castleStr = parts[2] ?? '-'
  if (!/^(-|[KQkq]{1,4})$/.test(castleStr) || new Set(castleStr).size !== castleStr.length)
    return { ok: false, error: `易位权格式错误：“${castleStr}”（应为 KQkq 的组合或 -）` }
  const castling = { ...NO_CASTLE }
  for (const ch of castleStr) if (ch !== '-') castling[ch as CastleKey] = true
  const epStr = parts[3] ?? '-'
  if (epStr !== '-' && !/^[a-h][36]$/.test(epStr))
    return { ok: false, error: `吃过路兵格式错误：“${epStr}”（应为第 3 或第 6 横线的格子或 -）` }
  const halfmove = parseInt(parts[4] ?? '0', 10)
  const fullmove = parseInt(parts[5] ?? '1', 10)
  if (Number.isNaN(halfmove) || halfmove < 0) return { ok: false, error: '半回合计数必须是非负整数' }
  if (Number.isNaN(fullmove) || fullmove < 1) return { ok: false, error: '回合数必须是正整数' }
  return {
    ok: true,
    state: {
      board,
      turn: turnStr,
      castling,
      ep: epStr === '-' ? '' : (epStr as Square),
      halfmove,
      fullmove,
    },
  }
}

const NAME: Record<Color, string> = { w: '白方', b: '黑方' }

/** Check a position for legality. Returns a list of Chinese error messages (empty = OK). */
export function validatePosition(s: EditorState): string[] {
  const errors: string[] = []
  const counts: Record<PieceCode, number> = {
    wK: 0, wQ: 0, wR: 0, wB: 0, wN: 0, wP: 0,
    bK: 0, bQ: 0, bR: 0, bB: 0, bN: 0, bP: 0,
  }
  const backRankPawns: string[] = []
  for (const [sq, p] of Object.entries(s.board) as [Square, PieceCode][]) {
    counts[p]++
    if (p[1] === 'P' && (sq[1] === '1' || sq[1] === '8')) backRankPawns.push(sq)
  }
  for (const c of ['w', 'b'] as Color[]) {
    const k = counts[`${c}K`]
    if (k === 0) errors.push(`${NAME[c]}没有王`)
    else if (k > 1) errors.push(`${NAME[c]}有 ${k} 个王，只能有一个`)
    const pawns = counts[`${c}P`]
    if (pawns > 8) errors.push(`${NAME[c]}有 ${pawns} 个兵，最多 8 个`)
    const total = (['K', 'Q', 'R', 'B', 'N', 'P'] as const).reduce((a, t) => a + counts[`${c}${t}`], 0)
    if (total > 16) errors.push(`${NAME[c]}有 ${total} 个棋子，最多 16 个`)
    const promoted =
      Math.max(0, counts[`${c}Q`] - 1) +
      Math.max(0, counts[`${c}R`] - 2) +
      Math.max(0, counts[`${c}B`] - 2) +
      Math.max(0, counts[`${c}N`] - 2)
    if (pawns <= 8 && pawns + promoted > 8)
      errors.push(`${NAME[c]}的后/车/象/马多于正常数量，但缺少的兵不够升变出这么多子`)
  }
  if (backRankPawns.length)
    errors.push(`兵不能放在第 1 或第 8 横线（${backRankPawns.sort().join('、')}）`)

  if (counts.wK === 1 && counts.bK === 1) {
    const find = (code: PieceCode) =>
      (Object.entries(s.board) as [Square, PieceCode][]).find(([, p]) => p === code)![0]
    const wk = find('wK')
    const bk = find('bK')
    const df = Math.abs(wk.charCodeAt(0) - bk.charCodeAt(0))
    const dr = Math.abs(Number(wk[1]) - Number(bk[1]))
    if (df <= 1 && dr <= 1) {
      errors.push('两个王不能相邻')
    } else if (!backRankPawns.length) {
      // is the side NOT to move in check?
      const other: Color = s.turn === 'w' ? 'b' : 'w'
      const flipped = [boardToPlacement(s.board), other, '-', '-', '0', '1'].join(' ')
      try {
        const g = new Chess(flipped, { skipValidation: true })
        if (g.isCheck()) {
          errors.push(
            `轮到${NAME[s.turn]}走，但${NAME[other]}的王正被将军——这不可能。请改成${NAME[other]}先走，或调整棋子。`,
          )
        }
      } catch {
        /* ignore */
      }
    }
  }

  if (s.ep && !epCandidates(s.board, s.turn).includes(s.ep)) {
    errors.push(`吃过路兵格 ${s.ep} 与局面不符（对方的兵并没有刚走两格到那里）`)
  }

  if (!errors.length) {
    const fen = stateToFen(s)
    const v = validateFen(fen)
    if (!v.ok) errors.push(`FEN 校验失败：${v.error ?? '未知错误'}`)
  }
  return errors
}

/** Validate a FEN string end to end (format + position). */
export function checkFen(fen: string): { ok: boolean; errors: string[]; state?: EditorState } {
  const r = fenToState(fen)
  if (!r.ok) return { ok: false, errors: [r.error] }
  const errors = validatePosition(r.state)
  return { ok: errors.length === 0, errors, state: r.state }
}

/** Human-readable status of a legal position. */
export function positionStatus(fen: string): string {
  try {
    const g = new Chess(fen)
    const side = g.turn() === 'w' ? '白方' : '黑方'
    if (g.isCheckmate()) return `${side}被将杀`
    if (g.isStalemate()) return `${side}无子可动（逼和）`
    if (g.isInsufficientMaterial()) return '子力不足，和棋'
    if (g.isCheck()) return `${side}走 · 正被将军`
    return `${side}走`
  } catch {
    return ''
  }
}
