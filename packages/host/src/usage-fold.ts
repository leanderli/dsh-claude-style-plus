/**
 * The session logs: which ones exist, how to read one, and the fold that turns
 * its events into per-day buckets and hour histograms.
 *
 * The events come through the host's own `sessionQuery` service. The logs are
 * multi-frame zstd (one frame per appended batch: a 9 MB log holds ~4000 frames)
 * and `node:zlib` decodes only the first frame, silently discarding the rest — so
 * the frames are left to the engine's reader and only the aggregation is ours.
 *
 * The fold mirrors the host's own `tokenUsage` projection (see
 * `@deepseek-ai/dsh-token-meter/usage-projection`): one durable Assistant
 * settlement contributes the last usage sample embedded in its stream, a retry on
 * the same turn/step replaces that sample instead of adding to it, and the four
 * buckets are disjoint. The one addition is the day dimension: a replaced sample
 * is subtracted from the day it was recorded on.
 */
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { DshContext } from './dsh.js'
import { BUCKET_KEYS, addBuckets, emptyBuckets } from './usage-ledger.js'
import type { Buckets, DayBuckets } from './usage-ledger.js'

/** Session log names: v0 is `session.jsonl`, vN is `session.vN.jsonl`, `.zstd` appended. */
const SESSION_LOG = /^session(?:\.v([1-9][0-9]*))?\.jsonl(?:\.zstd)?$/i

/** One raw log event, as the usage samples are read out of it. */
interface UsageEvent {
  type?: string
  seq?: number
  time?: number
  turn?: number
  step?: number
  data?: {
    usage?: UsageSample
    turn?: number
    step?: number
    stream?: { type?: string, chunk?: { type?: string, usage?: UsageSample } }[]
    message?: { source?: { model?: unknown, kind?: unknown, name?: unknown }, usage?: UsageSample }
    source?: { kind?: unknown, name?: unknown }
    name?: unknown
    arguments?: unknown
  }
}

/** Per-skill invocation counts for one local day in a single Session log. */
export interface SkillDayCounts {
  explicitCalls: number
  modelCalls: number
}

export type SkillDays = Map<string, Map<string, SkillDayCounts>>

/** One usage sample, in the host's own token names. */
interface UsageSample {
  inputTokens?: unknown
  outputTokens?: unknown
  cacheReadTokens?: unknown
  cacheWriteTokens?: unknown
}

/** One session log on disk: its id, its path and its fingerprint. */
export interface SessionLog {
  id: string
  path: string
  size: number
  mtimeMs: number
}

/** What one session's fold produced: its days and its hours. */
interface FoldedSession {
  days: Map<string, DayBuckets>
  hours: number[]
  skillDays: SkillDays
}

/**
 * A local calendar day, the same key the cost-meter ledger uses. Also how the
 * service places a session log's last write on the calendar.
 */
export function dayKey(time: number): string | null {
  const date = new Date(time)
  if (!Number.isFinite(date.getTime())) return null
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/**
 * The usage one durable Assistant settlement reports for its attempt.
 *
 * `assistant/message` may carry it directly; otherwise the sample is the last
 * raw `usage` chunk of the settlement's compact stream.
 */
function usageOf(event: UsageEvent): UsageSample | undefined {
  const data = event?.data
  if (data === null || data === undefined || typeof data !== 'object') return undefined
  if (event.type === 'assistant/message' && data.usage !== undefined) return data.usage
  if (event.type !== 'assistant/message' && event.type !== 'assistant/attempt') return undefined
  const stream = data.stream
  if (!Array.isArray(stream)) return undefined
  for (let index = stream.length - 1; index >= 0; index -= 1) {
    const record = stream[index]
    if (record !== null && typeof record === 'object' && record.type === 'chunk'
      && record.chunk !== null && typeof record.chunk === 'object' && record.chunk.type === 'usage') {
      return record.chunk.usage
    }
  }
  return undefined
}

/** The four disjoint buckets of one usage sample. */
function bucketsFrom(usage: UsageSample | null | undefined): Buckets {
  const count = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : 0)
  return {
    input: count(usage?.inputTokens),
    output: count(usage?.outputTokens),
    cacheRead: count(usage?.cacheReadTokens),
    cacheWrite: count(usage?.cacheWriteTokens),
    calls: 1,
  }
}

function bucketsEqual(left: Buckets, right: Buckets) {
  return BUCKET_KEYS.every((key) => left[key] === right[key])
}

/**
 * The route a settlement's sample belongs to, or null when the event names none.
 *
 * Only `assistant/message` carries the assembled message; an `assistant/attempt`
 * that committed no surface message keeps its usage but has no route to attribute
 * it to, and its tokens then count toward the day alone.
 */
function modelOf(event: UsageEvent): string | null {
  const model = event?.data?.message?.source?.model
  return typeof model === 'string' && model !== '' ? model : null
}

type SkillCall = { name: string, kind: 'explicit' | 'model' }

/** Read only the two durable skill-call forms; catalog and unrelated tool events do not count. */
function skillCallOf(event: UsageEvent): SkillCall | null {
  if (event.type === 'user/message') {
    const source = event.data?.source
    if (source?.kind === 'skill-invocation' && typeof source.name === 'string' && source.name !== '') {
      return { name: source.name, kind: 'explicit' }
    }
  }
  if (event.type !== 'tool/call' || event.data?.name !== 'skill' || typeof event.data.arguments !== 'string') return null
  // A malformed model argument has no attributable skill name and must not break the usage pass.
  let args: unknown
  try {
    args = JSON.parse(event.data.arguments)
  } catch {
    return null
  }
  if (args === null || typeof args !== 'object') return null
  const name = (args as { name?: unknown }).name
  return typeof name === 'string' && name !== '' ? { name, kind: 'model' } : null
}

/**
 * Fold one session's events into per-day buckets, plus a settlement count per
 * hour of day — the dashboard's peak-hour cell — both for the whole session and
 * for each day, so a range window can sum its own days' hours. A replaced
 * sample leaves its hour the same way it leaves its day. Skill counts omit the
 * exact fork-inherited prefix supplied by `sessionQuery.readSession()`.
 *
 * @param events - the session's durable events, in sequence order.
 * @param inheritedEventCount - the number of prefix events copied from a parent Session.
 * @returns day buckets, an hour histogram, and Skill call buckets.
 */
export function foldSession(events: UsageEvent[], inheritedEventCount = 0): FoldedSession {
  const inheritedCut = Number.isFinite(inheritedEventCount) ? Math.max(0, inheritedEventCount) : 0
  const days = new Map<string, DayBuckets>()
  const hours = new Array(24).fill(0) as number[]
  const skillDays: SkillDays = new Map()
  const recordSkill = (day: string, skill: SkillCall) => {
    let byName = skillDays.get(day)
    if (byName === undefined) {
      byName = new Map<string, SkillDayCounts>()
      skillDays.set(day, byName)
    }
    const counts = byName.get(skill.name) ?? { explicitCalls: 0, modelCalls: 0 }
    if (skill.kind === 'explicit') counts.explicitCalls++
    else counts.modelCalls++
    byName.set(skill.name, counts)
  }
  const bump = (day: string, hour: number, buckets: Buckets, sign: number, model: string | null) => {
    hours[hour] += sign
    let target = days.get(day)
    if (target === undefined) {
      if (sign < 0) return
      const fresh: DayBuckets = emptyBuckets()
      fresh.hours = new Array(24).fill(0)
      fresh.models = new Map<string, Buckets>()
      days.set(day, fresh)
      target = fresh
    }
    const targetHours = target.hours ?? (target.hours = new Array(24).fill(0))
    targetHours[hour] += sign
    addBuckets(target, buckets, sign)
    // The same day, per route: what the models chart stacks. A sample whose
    // event names no route still counts toward the day, and only there.
    if (model !== null) {
      const models = target.models ?? (target.models = new Map<string, Buckets>())
      let cell = models.get(model)
      if (cell === undefined && sign > 0) {
        if (target.models === undefined) target.models = new Map()
        cell = emptyBuckets()
        models.set(model, cell)
      }
      if (cell !== undefined) {
        addBuckets(cell, buckets, sign)
        if (sign < 0 && BUCKET_KEYS.every((key) => cell[key] === 0) && cell.calls === 0) models.delete(model)
      }
    }
    if (sign < 0 && BUCKET_KEYS.every((key) => target[key] === 0) && target.calls === 0) days.delete(day)
  }
  // The replacement slot: one settlement per turn/step, replaced on retry.
  type Settlement = { turn?: number, step?: number, buckets: Buckets, day: string, hour: number, model: string | null }
  let last: Settlement | null = null
  for (const event of events) {
    const ownEvent = inheritedCut === 0 || (typeof event.seq === 'number' && event.seq >= inheritedCut)
    const skill = ownEvent ? skillCallOf(event) : null
    if (skill !== null && typeof event.time === 'number') {
      const skillDay = dayKey(event.time)
      if (skillDay !== null) recordSkill(skillDay, skill)
    }
    const type = event?.type
    if (type === 'llm/retry-started') {
      const data = event.data
      if (last !== null && last.turn === data?.turn && last.step === data?.step) last = null
      continue
    }
    if (type !== 'assistant/message' && type !== 'assistant/attempt') continue
    const usage = usageOf(event)
    if (usage === undefined) continue
    if (typeof event.time !== 'number') continue
    const day = dayKey(event.time)
    if (day === null) continue
    const hour = new Date(event.time).getHours()
    const buckets = bucketsFrom(usage)
    const model = modelOf(event)
    const turn = event.data?.turn
    const step = event.data?.step
    const previous = last as Settlement | null
    const replacing = previous !== null && previous.turn === turn && previous.step === step
    if (replacing && previous !== null && bucketsEqual(previous.buckets, buckets)) continue
    if (replacing && previous !== null) bump(previous.day, previous.hour, previous.buckets, -1, previous.model)
    bump(day, hour, buckets, 1, model)
    last = { turn, step, buckets, day, hour, model }
  }
  return { days, hours, skillDays }
}

/** The newest generation of a session directory's log, with its fingerprint. */
function newestLog(dir: string): { path: string, size: number, mtimeMs: number } | null {
  let best: { name: string, version: number, compressed: boolean } | null = null
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile()) continue
    const match = SESSION_LOG.exec(entry.name)
    if (match === null) continue
    const version = Number(match[1] ?? 0)
    const compressed = /\.zstd$/i.test(entry.name)
    if (best === null || version > best.version
      || (version === best.version && Number(compressed) > Number(best.compressed))) {
      best = { name: entry.name, version, compressed }
    }
  }
  if (best === null) return null
  const path = join(dir, best.name)
  const stat = statSync(path)
  return { path, size: stat.size, mtimeMs: stat.mtimeMs }
}

/**
 * Every stored session: id, newest log, and that log's fingerprint. A harness
 * home that has never stored a session has no sessions root yet.
 */
export function listSessionLogs(root: string): SessionLog[] {
  const out: SessionLog[] = []
  if (!existsSync(root)) return out
  for (const project of readdirSync(root, { withFileTypes: true })) {
    if (!project.isDirectory()) continue
    for (const session of readdirSync(join(root, project.name), { withFileTypes: true })) {
      if (!session.isDirectory()) continue
      const log = newestLog(join(root, project.name, session.name))
      if (log === null) continue
      out.push({ id: session.name, ...log })
    }
  }
  return out
}

/**
 * Read one session's events through the host's own reader; null when there is no
 * reader or the log cannot be read.
 *
 * @param ctx - host plugin context, for the `sessionQuery` service.
 * @param sessionId - the session whose log is read.
 */
export async function readEvents(ctx: DshContext, sessionId: string) {
  const query = ctx.get('sessionQuery')
  if (query === null || query === undefined || typeof query.readSession !== 'function') return null
  let snapshot
  try {
    snapshot = await query.readSession(sessionId)
  } catch (error) {
    // The query service throws these two to say a stored log is unreadable
    // or went away between the listing and the read: that session is
    // skipped and retried on the next pass (docs/decisions D12).
    const failure = error as { code?: string, message?: string }
    if (failure?.code !== 'SESSION_QUERY_CORRUPT_SESSION' && failure?.code !== 'SESSION_QUERY_SESSION_NOT_FOUND') throw error
    ctx.logger?.warn?.(`dsh-claude-style-plus: session ${sessionId} left out of the usage roll-up: ${failure.message}`)
    return null
  }
  const events = snapshot?.events
  if (!Array.isArray(events)) return null
  const inherited = Number(snapshot?.inheritedEventCount)
  return {
    events: events as UsageEvent[],
    inheritedEventCount: Number.isFinite(inherited) ? Math.max(0, inherited) : 0,
  }
}
