/**
 * screenKeyframeCache.ts — keep the last full screen frame per capture session.
 *
 * Why: a capture session is shared. The agent starts streaming when the first
 * viewer connects and afterwards sends delta frames only. Any viewer that joins
 * an ALREADY RUNNING capture therefore never receives a full frame: it cannot
 * learn the screen size, the canvas keeps its default 300x150 backing store,
 * and the standalone window sits on the buffering overlay forever (black).
 *
 * Reproduced 2026-10-26 on hardware: start the dashboard tile, then open
 * /view/:id -> the joining socket received delta frames only (flags bit1 set,
 * resolution 0x0); opening the popout with no active capture worked because the
 * agent then sent a fresh full frame.
 *
 * The stored blob is byte-identical to what viewers receive, so replaying it is
 * indistinguishable from a normal first frame.
 */

export interface CachedKeyframe {
  data: Buffer | string
  binary: boolean
  width: number
  height: number
  seq: number
  at: number
}

const MAX_ENTRIES = 32          // sessions, not frames
const MAX_BYTES   = 4 * 1024 * 1024

const cache = new Map<string, CachedKeyframe>()

export function rememberKeyframe(sessionId: string, frame: CachedKeyframe): void {
  if (!sessionId) return
  const size = frame.binary
    ? (frame.data as Buffer).length
    : Buffer.byteLength(frame.data as string)
  if (size > MAX_BYTES) return
  cache.delete(sessionId)         // re-insert so insertion order stays = recency
  cache.set(sessionId, frame)
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next()
    if (oldest.done) break
    cache.delete(oldest.value)
  }
}

/** Peek: several viewers may join the same session, so the entry is not consumed. */
export function getKeyframe(sessionId: string): CachedKeyframe | undefined {
  return cache.get(sessionId)
}

export function forgetKeyframe(sessionId: string): void {
  cache.delete(sessionId)
}

export function keyframeCacheSize(): number {
  return cache.size
}
