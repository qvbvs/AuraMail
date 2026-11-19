export interface TimedItem {
  id: string
  start: number // ms
  end: number // ms
}

export interface PlacedItem<T> {
  item: T
  /** Minutes from the day's midnight, clamped to the day. */
  top: number
  height: number
  lane: number
  lanes: number
}

/**
 * Places timed events of one day into side-by-side lanes so overlapping events never cover each other.
 * Events are clipped to [dayStart, dayStart + 24h); each cluster of transitively overlapping events shares a lane count.
 */
export function layoutDay<T extends TimedItem>(items: T[], dayStart: number, minMinutes = 20): PlacedItem<T>[] {
  const dayEnd = dayStart + 86_400_000
  const visible = items
    .filter((e) => e.end > dayStart && e.start < dayEnd)
    .sort((a, b) => a.start - b.start || b.end - a.end)

  const placed: PlacedItem<T>[] = []
  let cluster: PlacedItem<T>[] = []
  let laneEnds: number[] = []
  let clusterEnd = -Infinity

  const flush = (): void => {
    for (const p of cluster) p.lanes = laneEnds.length
    placed.push(...cluster)
    cluster = []
    laneEnds = []
  }

  for (const e of visible) {
    const start = Math.max(e.start, dayStart)
    const end = Math.min(Math.max(e.end, e.start + minMinutes * 60_000), dayEnd)
    if (start >= clusterEnd) flush()
    let lane = laneEnds.findIndex((laneEnd) => laneEnd <= start)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(end)
    } else laneEnds[lane] = end
    clusterEnd = Math.max(clusterEnd, end)
    cluster.push({ item: e, top: (start - dayStart) / 60_000, height: (end - start) / 60_000, lane, lanes: 0 })
  }
  flush()
  return placed
}
