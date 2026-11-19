import { describe, expect, it } from 'vitest'
import { dayBucket, groupByDay } from './date-groups'

// Thursday, 19 Nov 2026, 15:00 local time
const now = new Date(2026, 10, 19, 15, 0)
const at = (d: number, h = 10): string => new Date(2026, 10, d, h).toISOString()

describe('dayBucket', () => {
  it('classifies relative days', () => {
    expect(dayBucket(at(19, 0), now)).toBe('today')
    expect(dayBucket(at(18, 23), now)).toBe('yesterday')
    expect(dayBucket(at(16), now)).toBe('this_week') // Monday
    expect(dayBucket(at(15), now)).toBe('this_month') // previous Sunday
    expect(dayBucket(new Date(2026, 9, 30).toISOString(), now)).toBe('older')
    expect(dayBucket(null, now)).toBe('undated')
    expect(dayBucket('nonsense', now)).toBe('undated')
  })
})

describe('groupByDay', () => {
  it('keeps order and merges consecutive buckets', () => {
    const items = [at(19, 12), at(19, 9), at(18), at(16), at(19, 1)]
    const groups = groupByDay(items, (x) => x, now)
    expect(groups.map((g) => [g.bucket, g.items.length])).toEqual([
      ['today', 2],
      ['yesterday', 1],
      ['this_week', 1],
      ['today', 1]
    ])
  })
})
