import { Chess, DEFAULT_POSITION } from 'chess.js'

/** A node in the move tree. The root has san '' and holds the start position. */
export type MoveNode = {
  id: number
  san: string
  uci: string
  /** Position after this move (root: start position). */
  fen: string
  /** Absolute ply count (0 = before White's first move of game 1). */
  ply: number
  parent: MoveNode | null
  /** children[0] is the main continuation, the rest are variations. */
  children: MoveNode[]
  /** Comment after the move (root: comment before the first move). */
  comment?: string
  /** Comment placed right at the start of a variation, before this move. */
  startComment?: string
  nags: number[]
}

export type GameTree = {
  headers: Record<string, string>
  root: MoveNode
  startFen: string
}

let nextId = 1
const newId = () => nextId++

export const START_FEN = DEFAULT_POSITION

const RESULTS = new Set(['1-0', '0-1', '1/2-1/2', '*'])
const GLYPH_TO_NAG: Record<string, number> = { '!': 1, '?': 2, '!!': 3, '??': 4, '!?': 5, '?!': 6 }

export class PgnError extends Error {}

function plyFromFen(fen: string): number {
  const parts = fen.trim().split(/\s+/)
  const turn = parts[1] === 'b' ? 1 : 0
  const full = Math.max(1, parseInt(parts[5] ?? '1', 10) || 1)
  return (full - 1) * 2 + turn
}

function makeRoot(fen: string): MoveNode {
  return { id: newId(), san: '', uci: '', fen, ply: plyFromFen(fen), parent: null, children: [], nags: [] }
}

/** Create an empty game, optionally from a custom position. */
export function newGame(fen: string = START_FEN, headers: Record<string, string> = {}): GameTree {
  const chess = new Chess(fen) // throws on invalid FEN
  const startFen = chess.fen()
  const h: Record<string, string> = {
    Event: '?',
    Site: '?',
    Date: todayPgnDate(),
    Round: '?',
    White: '?',
    Black: '?',
    Result: '*',
    ...headers,
  }
  if (startFen !== START_FEN) {
    h.SetUp = '1'
    h.FEN = startFen
  } else {
    delete h.SetUp
    delete h.FEN
  }
  return { headers: h, root: makeRoot(startFen), startFen }
}

export function todayPgnDate(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`
}

/** Play a move from `parent`. Reuses an existing child with the same move. Returns null if illegal. */
export function addMove(
  parent: MoveNode,
  move: string | { from: string; to: string; promotion?: string },
): MoveNode | null {
  const chess = new Chess(parent.fen)
  let m
  try {
    m = chess.move(move as never)
  } catch {
    return null
  }
  if (!m) return null
  const uci = m.from + m.to + (m.promotion ?? '')
  const existing = parent.children.find((c) => c.uci === uci)
  if (existing) return existing
  const node: MoveNode = {
    id: newId(),
    san: m.san,
    uci,
    fen: chess.fen(),
    ply: parent.ply + 1,
    parent,
    children: [],
    nags: [],
  }
  parent.children.push(node)
  return node
}

// ---------------------------------------------------------------- splitting

/** Split a PGN file containing one or more games into per-game strings. */
export function splitGames(text: string): string[] {
  const src = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
  const lines = src.split('\n')
  const games: string[] = []
  let cur: string[] = []
  let seenMoves = false
  let inComment = false
  for (const line of lines) {
    const t = line.trim()
    if (!inComment && t.startsWith('[') && seenMoves) {
      games.push(cur.join('\n'))
      cur = []
      seenMoves = false
    }
    cur.push(line)
    if (!inComment && t && !t.startsWith('[') && !t.startsWith('%')) seenMoves = true
    // track multi-line comments so a "[" inside a comment does not split
    for (const ch of line) {
      if (ch === '{') inComment = true
      else if (ch === '}') inComment = false
    }
  }
  if (cur.join('').trim()) games.push(cur.join('\n'))
  return games.map((g) => g.trim()).filter(Boolean)
}

export function parseHeaders(text: string): Record<string, string> {
  const headers: Record<string, string> = {}
  const re = /^\s*\[\s*([A-Za-z0-9_]+)\s+"((?:[^"\\]|\\.)*)"\s*\]\s*$/gm
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    headers[m[1]] = m[2].replace(/\\(["\\])/g, '$1')
  }
  return headers
}

export function gameLabel(headers: Record<string, string>, index: number): string {
  const w = headers.White && headers.White !== '?' ? headers.White : '白方'
  const b = headers.Black && headers.Black !== '?' ? headers.Black : '黑方'
  const extra = [headers.Result, headers.Date && headers.Date !== '????.??.??' ? headers.Date : '']
    .filter(Boolean)
    .join(' · ')
  return `${index + 1}. ${w} vs ${b}${extra ? ` (${extra})` : ''}`
}

// ---------------------------------------------------------------- parsing

type Token =
  | { t: 'comment'; v: string }
  | { t: 'open' }
  | { t: 'close' }
  | { t: 'nag'; v: number }
  | { t: 'result'; v: string }
  | { t: 'san'; v: string; glyph?: string }

function tokenize(movetext: string): Token[] {
  const out: Token[] = []
  let i = 0
  const s = movetext
  while (i < s.length) {
    const c = s[i]
    if (/\s/.test(c)) {
      i++
      continue
    }
    if (c === '{') {
      const end = s.indexOf('}', i + 1)
      const v = s.slice(i + 1, end === -1 ? s.length : end)
      out.push({ t: 'comment', v: v.replace(/\s+/g, ' ').trim() })
      i = end === -1 ? s.length : end + 1
      continue
    }
    if (c === ';') {
      const end = s.indexOf('\n', i)
      out.push({ t: 'comment', v: s.slice(i + 1, end === -1 ? s.length : end).trim() })
      i = end === -1 ? s.length : end + 1
      continue
    }
    if (c === '%' && (i === 0 || s[i - 1] === '\n')) {
      const end = s.indexOf('\n', i)
      i = end === -1 ? s.length : end + 1
      continue
    }
    if (c === '(') {
      out.push({ t: 'open' })
      i++
      continue
    }
    if (c === ')') {
      out.push({ t: 'close' })
      i++
      continue
    }
    if (c === '$') {
      const m = /^\$(\d+)/.exec(s.slice(i))
      if (m) {
        out.push({ t: 'nag', v: parseInt(m[1], 10) })
        i += m[0].length
        continue
      }
      i++
      continue
    }
    const m = /^[^\s{}();$]+/.exec(s.slice(i))
    if (!m) {
      i++
      continue
    }
    i += m[0].length
    let word = m[0]
    if (RESULTS.has(word)) {
      out.push({ t: 'result', v: word })
      continue
    }
    // strip move numbers like "12." "12..." or a lone "..."
    word = word.replace(/^\d+\.*/, '').replace(/^\.+/, '')
    if (!word) continue
    const g = /([!?]{1,2})$/.exec(word)
    let glyph: string | undefined
    if (g) {
      glyph = g[1]
      word = word.slice(0, -g[1].length)
    }
    word = word.replace(/^0-0-0/, 'O-O-O').replace(/^0-0/, 'O-O')
    if (word === '--' || word === 'Z0') {
      throw new PgnError('不支持空着（null move）')
    }
    if (word) out.push({ t: 'san', v: word, glyph })
  }
  return out
}

/** Parse a single game's PGN text into a tree (variations and comments kept). */
export function parseGame(text: string): GameTree {
  const headers = parseHeaders(text)
  if (headers.Variant && !/^(standard|chess|from position)$/i.test(headers.Variant)) {
    throw new PgnError(`不支持的变体：${headers.Variant}`)
  }
  let startFen = START_FEN
  if (headers.FEN) {
    try {
      startFen = new Chess(headers.FEN).fen()
    } catch {
      throw new PgnError(`FEN 标签无效：${headers.FEN}`)
    }
  }
  const root = makeRoot(startFen)
  const movetext = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .filter((l) => !/^\s*\[.*\]\s*$/.test(l))
    .join('\n')

  const tokens = tokenize(movetext)
  let cur: MoveNode = root
  const stack: MoveNode[] = []
  let pendingStart: string | undefined
  let justOpened = false
  let result: string | undefined

  for (const tok of tokens) {
    switch (tok.t) {
      case 'comment': {
        if (!tok.v) break
        if (justOpened) {
          pendingStart = pendingStart ? `${pendingStart} ${tok.v}` : tok.v
        } else {
          cur.comment = cur.comment ? `${cur.comment} ${tok.v}` : tok.v
        }
        break
      }
      case 'open': {
        if (!cur.parent) throw new PgnError('变着位置错误：变着前面必须有一步棋')
        stack.push(cur)
        cur = cur.parent
        justOpened = true
        break
      }
      case 'close': {
        const back = stack.pop()
        if (!back) throw new PgnError('括号不匹配：多了一个 “)”')
        cur = back
        justOpened = false
        pendingStart = undefined
        break
      }
      case 'nag': {
        if (cur !== root && !cur.nags.includes(tok.v)) cur.nags.push(tok.v)
        break
      }
      case 'result': {
        if (stack.length === 0) result = tok.v
        break
      }
      case 'san': {
        const node = addMove(cur, tok.v)
        if (!node) {
          const moveNo = Math.floor(cur.ply / 2) + 1
          const prefix = cur.ply % 2 === 0 ? `${moveNo}.` : `${moveNo}...`
          throw new PgnError(`第 ${prefix} 步 “${tok.v}” 不合法或无法识别`)
        }
        if (tok.glyph && GLYPH_TO_NAG[tok.glyph] && !node.nags.includes(GLYPH_TO_NAG[tok.glyph])) {
          node.nags.push(GLYPH_TO_NAG[tok.glyph])
        }
        if (justOpened && pendingStart) node.startComment = pendingStart
        pendingStart = undefined
        justOpened = false
        cur = node
        break
      }
    }
  }
  if (stack.length) throw new PgnError('括号不匹配：变着没有用 “)” 结束')
  if (result && !headers.Result) headers.Result = result
  if (!headers.Result) headers.Result = '*'
  return { headers, root, startFen }
}

/** Parse every game in a (possibly multi-game) PGN text. Bad games become errors. */
export function parseMulti(text: string): Array<{ label: string; raw: string; headers: Record<string, string> }> {
  return splitGames(text).map((raw, i) => {
    const headers = parseHeaders(raw)
    return { raw, headers, label: gameLabel(headers, i) }
  })
}

// ---------------------------------------------------------------- tree helpers

export function mainline(root: MoveNode): MoveNode[] {
  const out: MoveNode[] = []
  let n = root
  while (n.children[0]) {
    n = n.children[0]
    out.push(n)
  }
  return out
}

export function lastOfLine(node: MoveNode): MoveNode {
  let n = node
  while (n.children[0]) n = n.children[0]
  return n
}

export function firstOfLine(node: MoveNode): MoveNode {
  let n = node
  while (n.parent) n = n.parent
  return n
}

/** Path of child indexes from root to node. */
export function pathOf(node: MoveNode): number[] {
  const path: number[] = []
  let n = node
  while (n.parent) {
    path.unshift(n.parent.children.indexOf(n))
    n = n.parent
  }
  return path
}

export function nodeAtPath(root: MoveNode, path: number[]): MoveNode {
  let n = root
  for (const i of path) {
    const c = n.children[i]
    if (!c) break
    n = c
  }
  return n
}

/** Remove node and everything after it. Returns the parent. */
export function deleteFrom(node: MoveNode): MoveNode | null {
  const p = node.parent
  if (!p) return null
  p.children = p.children.filter((c) => c !== node)
  return p
}

/** Promote the variation containing node to be the main line at every level. */
export function promoteToMain(node: MoveNode): void {
  let n: MoveNode = node
  while (n.parent) {
    const p: MoveNode = n.parent
    const idx = p.children.indexOf(n)
    if (idx > 0) {
      p.children.splice(idx, 1)
      p.children.unshift(n)
    }
    n = p
  }
}

export function moveNumberLabel(node: MoveNode, forceBlack: boolean): string {
  // node.ply is the ply *after* the move; white moves have odd ply
  const isWhite = node.ply % 2 === 1
  const num = Math.ceil(node.ply / 2)
  if (isWhite) return `${num}.`
  return forceBlack ? `${num}...` : ''
}

// ---------------------------------------------------------------- export

const ROSTER = ['Event', 'Site', 'Date', 'Round', 'White', 'Black', 'Result']
const ROSTER_DEFAULT: Record<string, string> = {
  Event: '?',
  Site: '?',
  Date: '????.??.??',
  Round: '?',
  White: '?',
  Black: '?',
  Result: '*',
}

const escapeHeader = (v: string) => v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
const cleanComment = (v: string) => v.replace(/[{}]/g, '').trim()

/** Serialize a tree to export-format PGN (variations, comments and NAGs kept). */
export function toPgn(tree: GameTree, { maxWidth = 80 }: { maxWidth?: number } = {}): string {
  const h: Record<string, string> = { ...tree.headers }
  if (tree.startFen !== START_FEN) {
    h.SetUp = '1'
    h.FEN = tree.startFen
  } else {
    delete h.SetUp
    delete h.FEN
  }
  const result = h.Result && RESULTS.has(h.Result) ? h.Result : '*'
  h.Result = result
  const headerLines: string[] = []
  for (const k of ROSTER) headerLines.push(`[${k} "${escapeHeader(h[k] ?? ROSTER_DEFAULT[k])}"]`)
  for (const [k, v] of Object.entries(h)) {
    if (ROSTER.includes(k)) continue
    headerLines.push(`[${k} "${escapeHeader(v)}"]`)
  }

  const toks: string[] = []
  const emitMove = (node: MoveNode, forceNum: boolean) => {
    if (node.startComment) {
      toks.push(`{ ${cleanComment(node.startComment)} }`)
      forceNum = true
    }
    const num = moveNumberLabel(node, forceNum)
    toks.push(num ? `${num} ${node.san}` : node.san)
    for (const n of node.nags) toks.push(`$${n}`)
    if (node.comment) toks.push(`{ ${cleanComment(node.comment)} }`)
  }
  const emitFrom = (parent: MoveNode, needNum: boolean) => {
    let p = parent
    let need = needNum
    while (p.children.length) {
      const [main, ...alts] = p.children
      emitMove(main, need)
      need = !!main.comment
      for (const alt of alts) {
        toks.push('(')
        emitMove(alt, true)
        emitFrom(alt, !!alt.comment)
        toks.push(')')
        need = true
      }
      p = main
    }
  }
  if (tree.root.comment) toks.push(`{ ${cleanComment(tree.root.comment)} }`)
  emitFrom(tree.root, true)
  toks.push(result)

  // join with spaces, no space after "(" or before ")", wrap at maxWidth
  const lines: string[] = []
  let line = ''
  let prev = ''
  for (const t of toks) {
    const sep = line === '' || prev === '(' || t === ')' ? '' : ' '
    if (line && line.length + sep.length + t.length > maxWidth) {
      lines.push(line)
      line = t
    } else {
      line += sep + t
    }
    prev = t
  }
  if (line) lines.push(line)
  return `${headerLines.join('\n')}\n\n${lines.join('\n')}\n`
}

/** Lichess analysis URL for a FEN. */
export function lichessAnalysisUrl(fen: string): string {
  return `https://lichess.org/analysis/standard/${encodeURI(fen.trim().replace(/\s+/g, '_'))}`
}
