import type { WorkspaceSkillDay, WorkspaceUsageRow } from '@dsh-claude-style-plus/contracts/usage'

export interface ProfileActivityCell {
  date: string
  tokens: number
}

export interface ProfileHeatCell extends ProfileActivityCell {
  messages: number | null
  level: number
  inRange: boolean
}

export interface ProfileHeatMonth {
  date: string
  column: number
}

export interface ProfileHeatmap {
  cells: ProfileHeatCell[]
  columns: number
  peak: number
  startDate: string
  endDate: string
  months: ProfileHeatMonth[]
}

const DAY_MS = 86_400_000
const HEAT_STEPS = 4

function dayKeyFromOrdinal(ordinal: number) {
  return new Date(ordinal * DAY_MS).toISOString().slice(0, 10)
}

/** Build a Sunday-first heatmap; All means the last year, like the profile reference. */
export function buildProfileHeatmap(
  days: readonly { date: string, total?: number, input?: number, output?: number, cacheRead?: number, cacheWrite?: number, calls?: number }[],
  range: string,
  today: string,
  messagesAvailable = true,
): ProfileHeatmap {
  const todayOrdinal = dayOrdinal(today)
  if (todayOrdinal === null) throw new Error('invalid-today')
  const allRange = range !== '7d' && range !== '30d'
  const periodDays = range === '7d' ? 7 : range === '30d' ? 30 : 52 * 7
  const todayWeekday = new Date(todayOrdinal * DAY_MS).getUTCDay()
  const firstOrdinal = allRange
    ? todayOrdinal - todayWeekday - (52 * 7 - 7)
    : todayOrdinal - periodDays + 1
  const gridStart = allRange ? firstOrdinal : firstOrdinal - new Date(firstOrdinal * DAY_MS).getUTCDay()
  const gridEnd = allRange ? gridStart + (52 * 7 - 1) : todayOrdinal
  const byDay = new Map<number, { tokens: number, calls: number }>()
  let countedMessages = messagesAvailable
  for (const day of days) {
    const ordinal = dayOrdinal(day.date)
    if (ordinal === null || ordinal > todayOrdinal) continue
    const rawTotal = day.total
    const tokens = Number.isFinite(rawTotal)
      ? Math.max(0, rawTotal as number)
      : Math.max(0, (Number(day.input) || 0) + (Number(day.output) || 0) + (Number(day.cacheRead) || 0) + (Number(day.cacheWrite) || 0))
    const calls = Number.isFinite(day.calls) ? Math.max(0, day.calls as number) : 0
    if (messagesAvailable && !Number.isFinite(day.calls)) countedMessages = false
    byDay.set(ordinal, { tokens, calls })
  }

  const cells: ProfileHeatCell[] = []
  let peak = 0
  for (let ordinal = gridStart; ordinal <= gridEnd; ordinal++) {
    const inRange = ordinal >= firstOrdinal && ordinal <= todayOrdinal
    const value = inRange ? byDay.get(ordinal) : undefined
    const tokens = value?.tokens ?? 0
    if (tokens > peak) peak = tokens
    cells.push({
      date: dayKeyFromOrdinal(ordinal),
      tokens,
      messages: countedMessages ? value?.calls ?? 0 : null,
      level: 0,
      inRange,
    })
  }
  for (const cell of cells) {
    if (cell.tokens > 0 && peak > 0) cell.level = Math.max(1, Math.min(HEAT_STEPS, Math.ceil(cell.tokens / peak * HEAT_STEPS)))
  }

  const columns = Math.ceil(cells.length / 7)
  const months: ProfileHeatMonth[] = []
  let lastColumn = -1
  for (let ordinal = firstOrdinal; ordinal <= todayOrdinal; ordinal++) {
    const date = new Date(ordinal * DAY_MS)
    if (date.getUTCDate() !== 1 && ordinal !== firstOrdinal) continue
    const column = Math.floor((ordinal - gridStart) / 7)
    if (column === lastColumn) continue
    months.push({ date: dayKeyFromOrdinal(ordinal), column })
    lastColumn = column
  }

  return {
    cells,
    columns,
    peak,
    startDate: dayKeyFromOrdinal(firstOrdinal),
    endDate: today,
    months,
  }
}

export interface ProfileActivitySummary {
  peakDay: { date: string, tokens: number } | null
  longestStreak: number
  currentStreak: number
}

function dayOrdinal(key: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  if (match === null) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const stamp = Date.UTC(year, month - 1, day)
  const parsed = new Date(stamp)
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return null
  return Math.floor(stamp / 86_400_000)
}

/** Derive peak-token day and active-day streaks from the same cells the heatmap displays. */
export function summarizeProfileActivity(cells: readonly ProfileActivityCell[], today: string): ProfileActivitySummary {
  const days = cells
    .map(cell => ({ date: cell.date, tokens: Number.isFinite(cell.tokens) ? Math.max(0, cell.tokens) : 0, ordinal: dayOrdinal(cell.date) }))
    .filter((cell): cell is { date: string, tokens: number, ordinal: number } => cell.ordinal !== null)
    .sort((left, right) => left.ordinal - right.ordinal)

  let peakDay: ProfileActivitySummary['peakDay'] = null
  let longestStreak = 0
  let run = 0
  let previousActiveDay: number | null = null
  for (const cell of days) {
    if (cell.tokens > 0) {
      if (peakDay === null || cell.tokens >= peakDay.tokens) peakDay = { date: cell.date, tokens: cell.tokens }
      run = previousActiveDay === cell.ordinal - 1 ? run + 1 : 1
      if (run > longestStreak) longestStreak = run
      previousActiveDay = cell.ordinal
    } else {
      run = 0
      previousActiveDay = null
    }
  }

  const todayOrdinal = dayOrdinal(today)
  let currentStreak = 0
  if (todayOrdinal !== null) {
    let index = days.findIndex(cell => cell.ordinal === todayOrdinal)
    if (index === -1 || days[index].tokens === 0) {
      index = days.findIndex(cell => cell.ordinal === todayOrdinal - 1)
    }
    let expected = index === -1 ? null : days[index].ordinal
    while (index >= 0 && expected !== null && days[index].ordinal === expected && days[index].tokens > 0) {
      currentStreak++
      expected--
      index--
    }
  }
  return { peakDay, longestStreak, currentStreak }
}

/** The compact/expanded window shared by Token and Workspace card grids. */
export function profileCardWindow<T>(rows: readonly T[], expanded: boolean, limit = 6): { visible: readonly T[], remaining: number } {
  const count = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 6
  const visible = expanded ? rows : rows.slice(0, count)
  return { visible, remaining: Math.max(0, rows.length - visible.length) }
}

/** Normalize explicit and model Skill calls against the busiest Skill's total. */
export function profileSkillBarWidths(explicitCalls: number, modelCalls: number, peakCalls: number) {
  const peak = Number.isFinite(peakCalls) ? Math.max(0, peakCalls) : 0
  const explicit = Number.isFinite(explicitCalls) ? Math.max(0, explicitCalls) : 0
  const model = Number.isFinite(modelCalls) ? Math.max(0, modelCalls) : 0
  if (peak === 0) return { explicitPercent: 0, modelPercent: 0 }
  return {
    explicitPercent: Math.min(100, Math.round(explicit / peak * 1000) / 10),
    modelPercent: Math.min(100, Math.round(model / peak * 1000) / 10),
  }
}

export interface ProfileModelRow {
  id: string
  tokens: number
  input?: number
  output?: number
  cacheRead?: number
  cacheWrite?: number
  sessions?: number
}

export interface ProfileModelDay {
  date: string
  models?: Record<string, number>
}

export interface ProfileModelSession {
  at: number
  tokens: number
  model?: string | null
}

/**
 * Rank model totals for the selected range. Only the lifetime report and
 * session-independent fold carry token buckets; range snapshots carry totals.
 */
export function rankProfileModels(
  range: string,
  lifetime: readonly ProfileModelRow[] | null,
  modelDays: readonly ProfileModelDay[] | null,
  sessionEntries: readonly ProfileModelSession[] | null,
  startDate: string | null,
  startMs = Number.NEGATIVE_INFINITY,
  endDate: string | null = null,
  endMs = Number.POSITIVE_INFINITY,
): ProfileModelRow[] | null {
  if (range === 'all') {
    return lifetime === null ? null : lifetime.slice().sort((left, right) => right.tokens - left.tokens)
  }
  const byModel = new Map<string, { tokens: number, sessions: number }>()
  if (modelDays !== null) {
    for (const day of modelDays) {
      if ((startDate !== null && day.date < startDate) || (endDate !== null && day.date > endDate)) continue
      for (const [id, value] of Object.entries(day.models ?? {})) {
        const tokens = Number(value)
        if (!Number.isFinite(tokens) || tokens <= 0) continue
        const current = byModel.get(id) ?? { tokens: 0, sessions: 0 }
        current.tokens += tokens
        byModel.set(id, current)
      }
    }
  }
  if (byModel.size === 0 && sessionEntries !== null) {
    for (const entry of sessionEntries) {
      if (entry.at < startMs || entry.at > endMs || !Number.isFinite(entry.at) || typeof entry.model !== 'string' || entry.model === '' || entry.tokens <= 0) continue
      const current = byModel.get(entry.model) ?? { tokens: 0, sessions: 0 }
      current.tokens += Number(entry.tokens) || 0
      current.sessions++
      byModel.set(entry.model, current)
    }
  }
  return [...byModel.entries()]
    .map(([id, value]) => ({ id, tokens: value.tokens, ...(value.sessions > 0 ? { sessions: value.sessions } : {}) }))
    .sort((left, right) => right.tokens - left.tokens || left.id.localeCompare(right.id))
}

/** True when any visible daily or model detail is using the coarser session-list projection. */
export function usesProfileSessionSummary(useRouteDays: boolean, hasRouteModelDetails: boolean, hasSessionSummary: boolean) {
  return hasSessionSummary && (!useRouteDays || !hasRouteModelDetails)
}

/** Move a roving keyboard focus cell inside the Sunday-first, seven-row heatmap. */
export function moveProfileHeatFocus(cells: readonly ProfileHeatCell[], index: number, key: string) {
  const direction = key === 'ArrowLeft' ? { column: -1, row: 0 }
    : key === 'ArrowRight' ? { column: 1, row: 0 }
    : key === 'ArrowUp' ? { column: 0, row: -1 }
    : key === 'ArrowDown' ? { column: 0, row: 1 }
    : null
  if (direction === null || index < 0 || index >= cells.length) return index
  let column = Math.floor(index / 7) + direction.column
  let row = index % 7 + direction.row
  while (column >= 0 && row >= 0 && row < 7) {
    const candidate = column * 7 + row
    if (candidate < 0 || candidate >= cells.length) return index
    if (cells[candidate].inRange) return candidate
    column += direction.column
    row += direction.row
  }
  return index
}

export interface ProfileWorkspaceSkill {
  name: string
  explicitCalls: number
  modelCalls: number
  sessions: number
}

export interface ProfileSkillSummary extends ProfileWorkspaceSkill {
  workspaces: number
}

export interface ProfileWorkspaceSummary {
  workspaceId: string | null
  title: string | null
  path: string | null
  registeredSessions: number
  tokens: number
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  calls: number
  sessions: number
  activeDays: number
  models: ProfileModelRow[]
  skills: ProfileWorkspaceSkill[]
}

function profileDayTokens(day: { total?: number, input?: number, output?: number, cacheRead?: number, cacheWrite?: number }) {
  const total = Number(day.total)
  if (Number.isFinite(total)) return Math.max(0, total)
  return Math.max(0, (Number(day.input) || 0) + (Number(day.output) || 0) + (Number(day.cacheRead) || 0) + (Number(day.cacheWrite) || 0))
}

function profileDaysInRange(row: WorkspaceUsageRow, range: string, startDate: string | null, endDate: string) {
  return row.days.filter(day => (range === 'all' || startDate === null || day.date >= startDate) && day.date <= endDate)
}

/** Rank current Workspace groups from their daily Session-log attribution. */
export function rankProfileWorkspaces(
  rows: readonly WorkspaceUsageRow[] | null,
  range: string,
  startDate: string | null,
  endDate: string,
): ProfileWorkspaceSummary[] | null {
  if (rows === null) return null
  return rows.map(row => {
    const days = profileDaysInRange(row, range, startDate, endDate)
    let input = 0
    let output = 0
    let cacheRead = 0
    let cacheWrite = 0
    let calls = 0
    const sessionIds = new Set<string>()
    let fallbackSessions = 0
    let everyDayHasIds = true
    const skillCounts = new Map<string, { explicitCalls: number, modelCalls: number, sessionIds: Set<string> }>()
    for (const day of days) {
      input += Number(day.input) || 0
      output += Number(day.output) || 0
      cacheRead += Number(day.cacheRead) || 0
      cacheWrite += Number(day.cacheWrite) || 0
      calls += Number(day.calls) || 0
      if (Array.isArray(day.sessionIds)) for (const id of day.sessionIds) sessionIds.add(id)
      else {
        everyDayHasIds = false
        fallbackSessions += Number(day.sessions) || 0
      }
      for (const [name, counts] of Object.entries(day.skills ?? {})) {
        const current = skillCounts.get(name) ?? { explicitCalls: 0, modelCalls: 0, sessionIds: new Set<string>() }
        current.explicitCalls += Number(counts.explicitCalls) || 0
        current.modelCalls += Number(counts.modelCalls) || 0
        for (const id of counts.sessionIds ?? []) current.sessionIds.add(id)
        skillCounts.set(name, current)
      }
    }
    const tokens = profileDayTokens({ input, output, cacheRead, cacheWrite })
    const modelDays = days.map(day => ({ date: day.date, models: day.models }))
    const models = rankProfileModels(range, row.models, modelDays, null, startDate, Number.NEGATIVE_INFINITY, endDate, Number.POSITIVE_INFINITY) ?? []
    const skills = [...skillCounts.entries()]
      .map(([name, counts]) => ({ name, explicitCalls: counts.explicitCalls, modelCalls: counts.modelCalls, sessions: counts.sessionIds.size }))
      .sort((left, right) => (right.explicitCalls + right.modelCalls) - (left.explicitCalls + left.modelCalls) || left.name.localeCompare(right.name))
    return {
      workspaceId: row.workspaceId,
      title: row.title,
      path: row.path,
      registeredSessions: row.registeredSessions,
      tokens,
      input,
      output,
      cacheRead,
      cacheWrite,
      calls,
      sessions: everyDayHasIds ? sessionIds.size : fallbackSessions,
      activeDays: days.length,
      models,
      skills,
    }
  }).sort((left, right) => right.tokens - left.tokens || (left.title ?? left.path ?? '').localeCompare(right.title ?? right.path ?? ''))
}

/** Rank distinct skill calls across all Workspace groups for the selected date range. */
export function rankProfileSkills(
  rows: readonly WorkspaceUsageRow[] | null,
  range: string,
  startDate: string | null,
  endDate: string,
): ProfileSkillSummary[] | null {
  if (rows === null) return null
  const totals = new Map<string, { explicitCalls: number, modelCalls: number, sessionIds: Set<string>, workspaces: Set<string> }>()
  for (const row of rows) {
    const workspaceKey = row.workspaceId ?? '__unassigned__'
    for (const day of profileDaysInRange(row, range, startDate, endDate)) {
      for (const [name, counts] of Object.entries(day.skills ?? {})) {
        const current = totals.get(name) ?? { explicitCalls: 0, modelCalls: 0, sessionIds: new Set<string>(), workspaces: new Set<string>() }
        current.explicitCalls += Number(counts.explicitCalls) || 0
        current.modelCalls += Number(counts.modelCalls) || 0
        for (const id of counts.sessionIds ?? []) current.sessionIds.add(id)
        current.workspaces.add(workspaceKey)
        totals.set(name, current)
      }
    }
  }
  return [...totals.entries()]
    .map(([name, counts]) => ({ name, explicitCalls: counts.explicitCalls, modelCalls: counts.modelCalls, sessions: counts.sessionIds.size, workspaces: counts.workspaces.size }))
    .sort((left, right) => (right.explicitCalls + right.modelCalls) - (left.explicitCalls + left.modelCalls) || left.name.localeCompare(right.name))
}
