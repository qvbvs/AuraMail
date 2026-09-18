import { describe, it, expect, beforeEach } from 'vitest'
import { getClampedPos } from './ContextMenu'

describe('ContextMenu - getClampedPos', () => {
  beforeEach(() => {
    ;(global as any).window = {
      innerWidth: 1920,
      innerHeight: 1080
    }
  })

  it('keeps normal coordinates within screen bounds', () => {
    const pos = getClampedPos(200, 300, 220, 250)
    expect(pos.x).toBe(200)
    expect(pos.y).toBe(300)
  })

  it('flips to the left when clicked near the right edge', () => {
    // 1900 + 220 = 2120 > 1920 - 8 (1912)
    // 1900 - 220 = 1680 (<= 1692)
    const pos = getClampedPos(1900, 300, 220, 250)
    expect(pos.x).toBe(1680)
    expect(pos.y).toBe(300)
  })

  it('flips upward when clicked near the bottom edge', () => {
    // 1000 + 250 = 1250 > 1080 - 8 (1072)
    // 1000 - 250 = 750 (<= 822)
    const pos = getClampedPos(500, 1000, 220, 250)
    expect(pos.x).toBe(500)
    expect(pos.y).toBe(750)
  })

  it('flips both horizontally and vertically and clamps within safe margins when clicked at extreme edges', () => {
    // 1915 + 220 > 1912, flipped x: 1915 - 220 = 1695. Clamped to max allowed: 1920 - 220 - 8 = 1692
    // 1075 + 250 > 1072, flipped y: 1075 - 250 = 825. Clamped to max allowed: 1080 - 250 - 8 = 822
    const pos = getClampedPos(1915, 1075, 220, 250)
    expect(pos.x).toBe(1692)
    expect(pos.y).toBe(822)
  })

  it('clamps to minimum margin on top-left edge', () => {
    const pos = getClampedPos(-10, -20, 220, 250)
    expect(pos.x).toBe(8)
    expect(pos.y).toBe(8)
  })
})
