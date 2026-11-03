import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { PlayBoard } from '../components/PlayBoard'
import { useToast } from '../components/Toast'
import { copyText, downloadText } from '../lib/clipboard'
import { positionStatus } from '../lib/fen'
import { goTab } from '../lib/route'
import {
  addMove,
  deleteFrom,
  lastOfLine,
  lichessAnalysisUrl,
  moveNumberLabel,
  newGame,
  nodeAtPath,
  parseGame,
  parseMulti,
  pathOf,
  PgnError,
  promoteToMain,
  toPgn,
  type GameTree,
  type MoveNode,
} from '../lib/pgn'
import { useStudyStore } from '../store/studyStore'

const NAG_GLYPH: Record<number, string> = { 1: '!', 2: '?', 3: '!!', 4: '??', 5: '!?', 6: '?!' }
const RESULT_OPTIONS = ['*', '1-0', '0-1', '1/2-1/2']

function loadInitial(pgn: string): GameTree {
  if (pgn.trim()) {
    try {
      return parseGame(pgn)
    } catch {
      /* fall back */
    }
  }
  return newGame()
}

function isInRealVariation(node: MoveNode): boolean {
  let n = node
  while (n.parent) {
    if (n.parent.children[0] !== n) return true
    n = n.parent
  }
  return false
}

export function PgnPage() {
  const storedPgn = useStudyStore((s) => s.pgn)
  const storedPath = useStudyStore((s) => s.path)
  const orientation = useStudyStore((s) => s.orientation)
  const setOrientation = useStudyStore((s) => s.setOrientation)
  const setPgn = useStudyStore((s) => s.setPgn)
  const setPath = useStudyStore((s) => s.setPath)
  const setEditorFen = useStudyStore((s) => s.setEditorFen)

  const [tree, setTree] = useState<GameTree>(() => loadInitial(storedPgn))
  const [cur, setCur] = useState<MoveNode>(() => nodeAtPath(tree.root, storedPath))
  const [rev, setRev] = useState(0)
  const [importText, setImportText] = useState('')
  const [importError, setImportError] = useState<string | null>(null)
  const [games, setGames] = useState<ReturnType<typeof parseMulti>>([])
  const [gameIdx, setGameIdx] = useState(0)
  const [importOpen, setImportOpen] = useState(() => !storedPgn.trim())
  const toast = useToast()
  const listRef = useRef<HTMLDivElement>(null)

  const pgnText = useMemo(() => toPgn(tree), [tree, rev]) // eslint-disable-line react-hooks/exhaustive-deps

  // persist working game
  useEffect(() => {
    setPgn(pgnText, pathOf(cur))
  }, [pgnText]) // eslint-disable-line react-hooks/exhaustive-deps

  const go = useCallback(
    (n: MoveNode) => {
      setCur(n)
      setPath(pathOf(n))
    },
    [setPath],
  )

  const mutate = (next: MoveNode) => {
    setRev((r) => r + 1)
    go(next)
  }

  const loadTree = (t: GameTree, at: 'start' | 'end' = 'start') => {
    setTree(t)
    setRev((r) => r + 1)
    go(at === 'end' ? lastOfLine(t.root) : t.root)
  }

  // keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable))
        return
      if (e.key === 'ArrowLeft') {
        if (cur.parent) go(cur.parent)
      } else if (e.key === 'ArrowRight') {
        if (cur.children[0]) go(cur.children[0])
      } else if (e.key === 'Home' || e.key === 'ArrowUp') {
        go(tree.root)
      } else if (e.key === 'End' || e.key === 'ArrowDown') {
        go(lastOfLine(cur))
      } else if (e.key === 'f' || e.key === 'F') {
        setOrientation(orientation === 'white' ? 'black' : 'white')
      } else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cur, tree, go, orientation, setOrientation])

  // keep the active move visible inside the list (without scrolling the page)
  useEffect(() => {
    const box = listRef.current
    const el = box?.querySelector<HTMLElement>('.mv.active')
    if (!box || !el) return
    const top = el.offsetTop - box.offsetTop
    if (top < box.scrollTop || top > box.scrollTop + box.clientHeight - 32) {
      box.scrollTop = Math.max(0, top - box.clientHeight / 2)
    }
  }, [cur, rev])

  const onMove = (m: { from: string; to: string; promotion?: string }) => {
    const node = addMove(cur, m)
    if (!node) return false
    mutate(node)
    return true
  }

  // ---- import
  const doImport = (text: string) => {
    setImportError(null)
    const list = parseMulti(text)
    if (!list.length) {
      setImportError('没有找到棋谱内容')
      return
    }
    setGames(list)
    pickGame(list, 0)
  }

  const pickGame = (list: ReturnType<typeof parseMulti>, i: number) => {
    setGameIdx(i)
    try {
      const t = parseGame(list[i].raw)
      loadTree(t, 'start')
      setImportError(null)
      if (list.length === 1) setImportOpen(false)
      toast.show(`已载入：${list[i].label.replace(/^\d+\.\s*/, '')}`)
    } catch (e) {
      setImportError(e instanceof PgnError ? e.message : `无法解析这局棋谱：${(e as Error).message}`)
    }
  }

  const onFile = async (f: File | undefined) => {
    if (!f) return
    const text = await f.text()
    setImportText(text)
    doImport(text)
  }

  const newBlank = () => {
    const hasMoves = tree.root.children.length > 0
    if (hasMoves && !window.confirm('当前棋谱会被替换为新的空白对局，确定吗？')) return
    loadTree(newGame())
    setGames([])
  }

  // ---- headers
  const headerValue = (k: string) => {
    const v = tree.headers[k] ?? ''
    return /^[?.]+$/.test(v) ? '' : v
  }
  const setHeader = (k: string, v: string) => {
    tree.headers[k] = v.trim() ? v : k === 'Date' ? '????.??.??' : '?'
    setRev((r) => r + 1)
  }

  const fileName = () => {
    const w = tree.headers.White && tree.headers.White !== '?' ? tree.headers.White : 'white'
    const b = tree.headers.Black && tree.headers.Black !== '?' ? tree.headers.Black : 'black'
    return `${w}-vs-${b}.pgn`.replace(/[\\/:*?"<>|\s]+/g, '_')
  }

  // ---- move list rendering
  const renderMove = (node: MoveNode, forceNum: boolean): ReactNode => (
    <span key={node.id} className="mv-wrap">
      {node.startComment && <span className="mv-comment">{node.startComment}</span>}
      <button
        className={`mv ${node === cur ? 'active' : ''}`}
        onClick={() => go(node)}
        data-ply={node.ply}
      >
        {moveNumberLabel(node, forceNum || !!node.startComment) && (
          <span className="mv-num">{moveNumberLabel(node, forceNum || !!node.startComment)}</span>
        )}
        {node.san}
        {node.nags.map((n) => NAG_GLYPH[n] ?? '').join('')}
      </button>
      {node.comment && <span className="mv-comment">{node.comment}</span>}
    </span>
  )

  const renderLine = (from: MoveNode, needNum: boolean, depth: number): ReactNode[] => {
    const out: ReactNode[] = []
    let p = from
    let need = needNum
    while (p.children.length) {
      const [main, ...alts] = p.children
      out.push(renderMove(main, need))
      need = !!main.comment
      if (alts.length) {
        out.push(
          <span key={`v-${main.id}`} className={`variations depth-${Math.min(depth + 1, 3)}`}>
            {alts.map((alt) => (
              <span key={`alt-${alt.id}`} className="variation">
                {renderMove(alt, true)}
                {renderLine(alt, !!alt.comment, depth + 1)}
              </span>
            ))}
          </span>,
        )
        need = true
      }
      p = main
    }
    return out
  }

  const status = positionStatus(cur.fen)
  const lastMove = cur.uci ? { from: cur.uci.slice(0, 2), to: cur.uci.slice(2, 4) } : null
  const white = tree.headers.White && tree.headers.White !== '?' ? tree.headers.White : '白方'
  const black = tree.headers.Black && tree.headers.Black !== '?' ? tree.headers.Black : '黑方'
  const top = orientation === 'white' ? black : white
  const bottom = orientation === 'white' ? white : black
  const moveCount = tree.root.children.length

  return (
    <div className="page study">
      <div className="study-grid">
        <div className="study-board-col">
          <div className="player-bar">
            <span className={`player-dot ${orientation === 'white' ? 'black' : 'white'}`} />
            {top}
          </div>
          <PlayBoard fen={cur.fen} orientation={orientation} lastMove={lastMove} onMove={onMove} />
          <div className="player-bar">
            <span className={`player-dot ${orientation === 'white' ? 'white' : 'black'}`} />
            {bottom}
          </div>
          <div className="nav-controls" role="toolbar" aria-label="打谱控制">
            <button className="icon-btn" onClick={() => go(tree.root)} disabled={!cur.parent} aria-label="开局" title="开局 (Home)">
              ⏮
            </button>
            <button className="icon-btn" onClick={() => cur.parent && go(cur.parent)} disabled={!cur.parent} aria-label="上一步" title="上一步 (←)">
              ◀
            </button>
            <button className="icon-btn" onClick={() => cur.children[0] && go(cur.children[0])} disabled={!cur.children[0]} aria-label="下一步" title="下一步 (→)">
              ▶
            </button>
            <button className="icon-btn" onClick={() => go(lastOfLine(cur))} disabled={!cur.children[0]} aria-label="最后" title="最后 (End)">
              ⏭
            </button>
            <button className="icon-btn" onClick={() => setOrientation(orientation === 'white' ? 'black' : 'white')} aria-label="翻转棋盘" title="翻转棋盘 (F)">
              ⇅
            </button>
          </div>
          <p className="status-line">{status}</p>
        </div>

        <div className="study-side-col">
          <section className="card game-head">
            <div className="game-title">
              {white} <span className="vs">vs</span> {black}
              <span className="result-chip">{tree.headers.Result ?? '*'}</span>
            </div>
            <div className="game-sub">
              {[tree.headers.Event, tree.headers.Site, tree.headers.Date, tree.headers.Round && `第 ${tree.headers.Round} 轮`]
                .filter((x) => x && !/^[?.]+$/.test(x) && x !== '第 ? 轮')
                .join(' · ') || '未命名对局'}
              {tree.headers.FEN && <span className="tag setup-tag">自定义局面</span>}
            </div>
          </section>

          <section className="card move-list-card">
            <div className="move-list" ref={listRef} aria-label="着法列表">
              {tree.root.comment && <span className="mv-comment">{tree.root.comment}</span>}
              {moveCount === 0 ? (
                <p className="empty-hint">在棋盘上走子，就会记录在这里</p>
              ) : (
                renderLine(tree.root, true, 0)
              )}
              {moveCount > 0 && <span className="mv-result">{tree.headers.Result ?? '*'}</span>}
            </div>
            {cur.parent && (
              <div className="move-tools">
                <input
                  className="comment-input"
                  placeholder={`给 ${moveNumberLabel(cur, true)} ${cur.san} 加注释`}
                  value={cur.comment ?? ''}
                  onChange={(e) => {
                    cur.comment = e.target.value || undefined
                    setRev((r) => r + 1)
                  }}
                />
                <div className="btn-row compact">
                  {isInRealVariation(cur) && (
                    <button
                      className="btn small"
                      onClick={() => {
                        promoteToMain(cur)
                        mutate(cur)
                      }}
                    >
                      设为主线
                    </button>
                  )}
                  <button
                    className="btn small danger"
                    onClick={() => {
                      const p = deleteFrom(cur)
                      if (p) mutate(p)
                    }}
                  >
                    删除此步及之后
                  </button>
                </div>
              </div>
            )}
          </section>

          <details className="card fold" open={importOpen} onToggle={(e) => setImportOpen((e.target as HTMLDetailsElement).open)}>
            <summary>导入棋谱</summary>
            <textarea
              className="pgn-input"
              rows={5}
              placeholder={'粘贴 PGN，例如：\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6'}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
            />
            <div className="btn-row compact">
              <button className="btn primary small" onClick={() => doImport(importText)} disabled={!importText.trim()}>
                载入
              </button>
              <label className="btn small file-btn">
                打开 .pgn 文件
                <input type="file" accept=".pgn,.txt,application/x-chess-pgn,text/plain" onChange={(e) => onFile(e.target.files?.[0])} hidden />
              </label>
              <button className="btn small" onClick={newBlank}>
                新对局
              </button>
            </div>
            {games.length > 1 && (
              <label className="field">
                <span>文件里有 {games.length} 局，选择一局：</span>
                <select className="game-select" value={gameIdx} onChange={(e) => pickGame(games, Number(e.target.value))}>
                  {games.map((g, i) => (
                    <option key={i} value={i}>
                      {g.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {importError && <p className="error-text">{importError}</p>}
          </details>

          <details className="card fold">
            <summary>导出 PGN</summary>
            <div className="header-grid">
              <label className="field">
                <span>白方</span>
                <input placeholder="?" value={headerValue('White')} onChange={(e) => setHeader('White', e.target.value)} />
              </label>
              <label className="field">
                <span>黑方</span>
                <input placeholder="?" value={headerValue('Black')} onChange={(e) => setHeader('Black', e.target.value)} />
              </label>
              <label className="field">
                <span>赛事</span>
                <input placeholder="?" value={headerValue('Event')} onChange={(e) => setHeader('Event', e.target.value)} />
              </label>
              <label className="field">
                <span>日期</span>
                <input placeholder="?" value={headerValue('Date')} onChange={(e) => setHeader('Date', e.target.value)} />
              </label>
              <label className="field">
                <span>结果</span>
                <select value={tree.headers.Result ?? '*'} onChange={(e) => setHeader('Result', e.target.value)}>
                  {RESULT_OPTIONS.map((r) => (
                    <option key={r} value={r}>
                      {r === '*' ? '* 未结束' : r}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <textarea className="pgn-output" readOnly rows={8} value={pgnText} onFocus={(e) => e.target.select()} />
            <div className="btn-row compact">
              <button className="btn primary small" onClick={async () => toast.show((await copyText(pgnText)) ? 'PGN 已复制' : '复制失败，请手动选择')}>
                复制 PGN
              </button>
              <button className="btn small" onClick={() => downloadText(fileName(), pgnText)}>
                下载 .pgn
              </button>
            </div>
          </details>

          <section className="card fen-card">
            <div className="fen-label">当前局面 FEN</div>
            <code className="fen-text">{cur.fen}</code>
            <div className="btn-row compact">
              <button className="btn small" onClick={async () => toast.show((await copyText(cur.fen)) ? 'FEN 已复制' : '复制失败')}>
                复制 FEN
              </button>
              <button
                className="btn small"
                onClick={() => {
                  setEditorFen(cur.fen)
                  goTab('editor')
                }}
              >
                在摆棋中编辑
              </button>
              <a className="btn small" href={lichessAnalysisUrl(cur.fen)} target="_blank" rel="noreferrer">
                Lichess 分析 ↗
              </a>
            </div>
          </section>
        </div>
      </div>
      {toast.node}
    </div>
  )
}
