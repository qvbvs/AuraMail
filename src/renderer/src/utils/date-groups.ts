export type DayBucket = 'today' | 'yesterday' | 'this_week' | 'this_month' | 'older' | 'undated'

const startOfDay = (d: Date): number => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()

/** Buckets a date relative to `now` for list section headers. Weeks start on Monday. */
export function dayBucket(value: string | null | undefined, now: Date = new Date()): DayBucket {
  if (!value) return 'undated'
  const d = new Date(value)
  if (isNaN(d.getTime())) return 'undated'
  const today = startOfDay(now)
  const day = startOfDay(d)
  if (day >= today) return 'today'
  if (day >= today - 86_400_000) return 'yesterday'
  const weekStart = today - ((now.getDay() + 6) % 7) * 86_400_000
  if (day >= weekStart) return 'this_week'
  if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) return 'this_month'
  return 'older'
}

/** Groups already-sorted items into consecutive buckets, preserving order. */
export function groupByDay<T>(items: T[], getDate: (item: T) => string | null | undefined, now: Date = new Date()): { bucket: DayBucket; items: T[] }[] {
  const groups: { bucket: DayBucket; items: T[] }[] = []
  for (const item of items) {
    const bucket = dayBucket(getDate(item), now)
    const last = groups[groups.length - 1]
    if (last && last.bucket === bucket) last.items.push(item)
    else groups.push({ bucket, items: [item] })
  }
  return groups
}
