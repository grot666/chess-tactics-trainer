import { describe, expect, it } from 'vitest'
import { checkFen, fenToState, startState, stateToFen, validatePosition, emptyState } from './fen'

describe('FEN 校验', () => {
  it('初始局面合法且可往返', () => {
    const s = startState()
    expect(validatePosition(s)).toEqual([])
    expect(stateToFen(s)).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')
  })

  it('缺王 / 多王', () => {
    expect(validatePosition(emptyState())).toEqual(expect.arrayContaining(['白方没有王', '黑方没有王']))
    const r = checkFen('k7/8/8/8/8/8/8/KK6 w - - 0 1')
    expect(r.ok).toBe(false)
    expect(r.errors.join()).toContain('白方有 2 个王')
  })

  it('兵在底线', () => {
    const r = checkFen('k6P/8/8/8/8/8/8/K7 w - - 0 1')
    expect(r.ok).toBe(false)
    expect(r.errors.join()).toContain('兵不能放在第 1 或第 8 横线（h8）')
  })

  it('不走棋的一方被将军（用户之前录错的那个局面）', () => {
    // black king b1 attacked by rook d1, but white to move
    const r = checkFen('4KQ2/8/q7/PP4pP/4B3/8/ppp3pp/1k1R1R2 w - - 0 1')
    expect(r.ok).toBe(false)
    expect(r.errors.join()).toContain('轮到白方走，但黑方的王正被将军')
  })

  it('王相邻', () => {
    expect(checkFen('8/8/8/3kK3/8/8/8/8 w - - 0 1').errors).toContain('两个王不能相邻')
  })

  it('易位权会按王车位置自动去掉', () => {
    const r = fenToState('4k3/8/8/8/8/8/8/4K2R w KQkq - 0 1')
    expect(r.ok).toBe(true)
    if (r.ok) expect(stateToFen(r.state)).toBe('4k3/8/8/8/8/8/8/4K2R w K - 0 1')
  })

  it('吃过路兵格校验', () => {
    expect(checkFen('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 2').ok).toBe(true)
    const bad = checkFen('4k3/8/8/4P3/8/8/8/4K3 w - d6 0 2')
    expect(bad.ok).toBe(false)
    expect(bad.errors.join()).toContain('吃过路兵格 d6')
  })

  it('格式错误给出中文提示', () => {
    expect(checkFen('8/8/8 w - - 0 1').errors[0]).toContain('8 行')
    expect(checkFen('k7/8/8/8/8/8/8/K7 x - - 0 1').errors[0]).toContain('走棋方')
    expect(checkFen('k7/8/8/8/8/8/8/K6X w - - 0 1').errors[0]).toContain('无法识别的字符')
  })

  it('升变子数量不可能', () => {
    const r = checkFen('k7/8/8/8/8/8/PPPPPPPP/KQQ5 w - - 0 1')
    expect(r.ok).toBe(false)
    expect(r.errors.join()).toContain('升变')
  })
})
