import { describe, expect, it } from 'vitest'
import { layoutDay } from './calendar-layout'

const day = new Date(2026, 10, 19).getTime()
const at = (h: number, m = 0): number => day + (h * 60 + m) * 60_000
const ev = (id: string, s: number, e: number): { id: string; start: number; end: number } => ({ id, start: s, end: e })

describe('layoutDay', () => {
  it('positions by minutes and gives overlapping events separate lanes', () => {
    const out = layoutDay([ev('a', at(9), at(10)), ev('b', at(9, 30), at(11)), ev('c', at(12), at(13))], day)
    const byId = Object.fromEntries(out.map((p) => [p.item.id, p]))
    expect(byId.a).toMatchObject({ top: 540, height: 60, lane: 0, lanes: 2 })
    expect(byId.b).toMatchObject({ top: 570, height: 90, lane: 1, lanes: 2 })
    expect(byId.c).toMatchObject({ top: 720, lane: 0, lanes: 1 })
  })

  it('reuses a freed lane and clips events crossing midnight', () => {
    const out = layoutDay([ev('a', at(9), at(10)), ev('b', at(9), at(12)), ev('c', at(10), at(11)), ev('late', at(23), at(26))], day)
    const byId = Object.fromEntries(out.map((p) => [p.item.id, p]))
    expect(byId.b.lane).toBe(0) // longest first
    expect(byId.c.lane).toBe(byId.a.lane) // a ends exactly when c starts
    expect(byId.c.lanes).toBe(2)
    expect(byId.late).toMatchObject({ top: 1380, height: 60 })
  })

  it('enforces a minimum height and ignores other days', () => {
    const out = layoutDay([ev('zero', at(8), at(8)), ev('other', at(30), at(31))], day)
    expect(out).toHaveLength(1)
    expect(out[0].height).toBe(20)
  })
})
