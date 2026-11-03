import { describe, expect, it } from 'vitest'
import { Chess } from 'chess.js'
import { addMove, mainline, newGame, parseGame, parseMulti, promoteToMain, toPgn, deleteFrom } from './pgn'

const SAMPLE = `[Event "Test"]
[Site "?"]
[Date "2024.01.01"]
[Round "1"]
[White "Alice"]
[Black "Bob"]
[Result "1-0"]

1. e4 e5 2. Nf3 {main} (2. f4 exf4 (2... d5) 3. Nf3) 2... Nc6 3. Bb5! a6 $6 4. Ba4 1-0

[Event "Second"]
[White "C"]
[Black "D"]
[Result "*"]

1. d4 d5 *
`

describe('PGN 解析', () => {
  it('多局拆分', () => {
    const games = parseMulti(SAMPLE)
    expect(games).toHaveLength(2)
    expect(games[0].label).toContain('Alice vs Bob')
    expect(games[1].headers.Event).toBe('Second')
  })

  it('主线、变着、注释、NAG', () => {
    const t = parseGame(parseMulti(SAMPLE)[0].raw)
    expect(mainline(t.root).map((n) => n.san)).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4'])
    const e5 = t.root.children[0].children[0]
    expect(e5.children.map((c) => c.san)).toEqual(['Nf3', 'f4'])
    const f4 = e5.children[1]
    expect(f4.children.map((c) => c.san)).toEqual(['exf4', 'd5'])
    expect(e5.children[0].comment).toBe('main')
    const bb5 = mainline(t.root)[4]
    expect(bb5.nags).toEqual([1])
  })

  it('非法着法报中文错误', () => {
    expect(() => parseGame('1. e4 e5 2. Ke3')).toThrow(/2\. 步 “Ke3” 不合法/)
  })
})

describe('PGN 导出', () => {
  it('导出后可被 chess.js 读回，且保留变着', () => {
    const t = parseGame(parseMulti(SAMPLE)[0].raw)
    const pgn = toPgn(t)
    expect(pgn).toContain('(2. f4 exf4 (2... d5) 3. Nf3)')
    expect(pgn).toContain('2... Nc6')
    expect(pgn.trim().endsWith('1-0')).toBe(true)
    const c = new Chess()
    c.loadPgn(pgn)
    expect(c.history()).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4'])
    // round trip through our own parser
    expect(toPgn(parseGame(pgn))).toBe(pgn)
  })

  it('从摆好的局面开始：写入 SetUp/FEN，黑先用 N... 编号', () => {
    const fen = '4k3/8/8/8/8/8/4P3/4K3 b - - 0 10'
    const t = newGame(fen, { White: '我', Black: '对手' })
    const a = addMove(t.root, 'Kd7')!
    const b = addMove(a, 'e4')!
    expect(b).not.toBeNull()
    const pgn = toPgn(t)
    expect(pgn).toContain('[SetUp "1"]')
    expect(pgn).toContain(`[FEN "${fen}"]`)
    expect(pgn).toContain('10... Kd7 11. e4 *')
    const c = new Chess()
    c.loadPgn(pgn)
    expect(c.history()).toEqual(['Kd7', 'e4'])
  })

  it('自由走子：新分支、提升主线、删除', () => {
    const t = newGame()
    const e4 = addMove(t.root, { from: 'e2', to: 'e4' })!
    const d4 = addMove(t.root, 'd4')!
    expect(addMove(t.root, 'e4')).toBe(e4) // same move reused
    expect(t.root.children).toEqual([e4, d4])
    promoteToMain(d4)
    expect(t.root.children[0]).toBe(d4)
    deleteFrom(e4)
    expect(t.root.children).toEqual([d4])
    expect(toPgn(t)).toContain('1. d4 *')
    expect(toPgn(t)).not.toContain('SetUp')
  })
})
