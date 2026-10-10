import { expect, test } from 'vitest'
import { buildProfileHeatmap, moveProfileHeatFocus, rankProfileModels, summarizeProfileActivity } from './profile-analytics'
import * as profileAnalytics from './profile-analytics'

test('profile summary computes peak day and both streak boundaries from unordered cells', () => {
  expect(summarizeProfileActivity([
    { date: '2026-10-07', tokens: 30 },
    { date: '2026-10-03', tokens: 200 },
    { date: '2026-10-01', tokens: 0 },
    { date: '2026-10-06', tokens: 20 },
    { date: '2026-10-05', tokens: 50 },
    { date: '2026-10-04', tokens: 100 },
    { date: '2026-10-08', tokens: 0 },
    { date: '2026-10-02', tokens: 10 },
  ], '2026-10-08')).toEqual({
    peakDay: { date: '2026-10-03', tokens: 200 },
    longestStreak: 6,
    currentStreak: 6,
  })
})

test('all-range heatmap remains 52 Sunday-first columns and ignores future usage', () => {
  const all = buildProfileHeatmap([
    { date: '2026-10-08', total: 10, calls: 1 },
    { date: '2026-10-09', total: 9000, calls: 90 },
  ], 'all', '2026-10-08', true)
  expect(all.cells).toHaveLength(364)
  expect(all.columns).toBe(52)
  expect(new Date(`${all.cells[0].date}T00:00:00Z`).getUTCDay()).toBe(0)
  expect(all.cells.find(cell => cell.date === '2026-10-08')?.tokens).toBe(10)
  expect(all.cells.some(cell => cell.date === '2026-10-09' && cell.tokens > 0)).toBe(false)
})

test('seven-day keyboard movement does not escape its active dates', () => {
  const grid = buildProfileHeatmap([], '7d', '2026-10-08', false)
  const first = grid.cells.findIndex(cell => cell.inRange)
  expect(moveProfileHeatFocus(grid.cells, first, 'ArrowUp')).toBe(first)
  const last = grid.cells.findLastIndex(cell => cell.inRange)
  expect(moveProfileHeatFocus(grid.cells, last, 'ArrowRight')).toBe(last)
})

test('ranged model ranking excludes future daily and session records', () => {
  expect(rankProfileModels('30d', null, [
    { date: '2026-10-08', models: { 'model-current': 10 } },
    { date: '2026-10-09', models: { 'model-future': 9000 } },
  ], null, '2026-09-09', Date.UTC(2026, 8, 9), '2026-10-08', Date.UTC(2026, 9, 8, 23, 59, 59, 999))).toEqual([
    { id: 'model-current', tokens: 10 },
  ])
  expect(rankProfileModels('7d', null, null, [
    { at: Date.UTC(2026, 9, 8, 10), tokens: 20, model: 'model-current' },
    { at: Date.UTC(2026, 9, 9, 10), tokens: 900, model: 'model-future' },
  ], '2026-10-02', Date.UTC(2026, 9, 2), '2026-10-08', Date.UTC(2026, 9, 8, 23, 59, 59, 999))).toEqual([
    { id: 'model-current', tokens: 20, sessions: 1 },
  ])
})

test('workspace and global skill summaries filter future days and union sessions', () => {
  const rankWorkspaces = (profileAnalytics as unknown as {
    rankProfileWorkspaces?: (rows: unknown, range: string, start: string | null, end: string) => {
      workspaceId: string | null
      tokens: number
      sessions: number
      activeDays: number
      models: { id: string, tokens: number }[]
      skills: { name: string, explicitCalls: number, modelCalls: number, sessions: number }[]
    }[] | null
  }).rankProfileWorkspaces
  const rankSkills = (profileAnalytics as unknown as {
    rankProfileSkills?: (rows: unknown, range: string, start: string | null, end: string) => {
      name: string
      explicitCalls: number
      modelCalls: number
      sessions: number
      workspaces: number
    }[] | null
  }).rankProfileSkills
  expect(typeof rankWorkspaces).toBe('function')
  expect(typeof rankSkills).toBe('function')
  if (typeof rankWorkspaces !== 'function' || typeof rankSkills !== 'function') return

  const rows = [
    {
      workspaceId: 'workspace-a', title: 'Workspace A', path: 'C:/repo', registeredSessions: 4,
      totals: {}, models: [{ id: 'model-a', tokens: 900 }], skills: [],
      days: [
        { date: '2026-10-02', input: 2, output: 0, cacheRead: 0, cacheWrite: 0, calls: 1, sessions: 1, sessionIds: ['s1'], models: { 'model-a': 2 }, skills: { 'plan-review': { explicitCalls: 1, modelCalls: 0, sessionIds: ['s1'] } } },
        { date: '2026-10-08', input: 5, output: 0, cacheRead: 0, cacheWrite: 0, calls: 1, sessions: 1, sessionIds: ['s1'], models: { 'model-a': 5 }, skills: { 'plan-review': { explicitCalls: 0, modelCalls: 1, sessionIds: ['s1'] } } },
        { date: '2026-10-09', input: 900, output: 0, cacheRead: 0, cacheWrite: 0, calls: 9, sessions: 1, sessionIds: ['future'], models: { 'model-future': 900 }, skills: { future: { explicitCalls: 0, modelCalls: 50, sessionIds: ['future'] } } },
      ],
    },
    {
      workspaceId: null, title: null, path: null, registeredSessions: 1,
      totals: {}, models: [], skills: [],
      days: [
        { date: '2026-10-08', input: 0, output: 0, cacheRead: 0, cacheWrite: 0, calls: 0, sessions: 1, sessionIds: ['s2'], skills: { 'code-review': { explicitCalls: 0, modelCalls: 1, sessionIds: ['s2'] } } },
      ],
    },
  ] as never
  const workspaces = rankWorkspaces(rows, '7d', '2026-10-02', '2026-10-08')!
  const repo = workspaces.find(row => row.workspaceId === 'workspace-a')!
  expect(repo.tokens).toBe(7)
  expect(repo.sessions).toBe(1)
  expect(repo.activeDays).toBe(2)
  expect(repo.models).toEqual([{ id: 'model-a', tokens: 7 }])
  expect(repo.skills).toEqual([{ name: 'plan-review', explicitCalls: 1, modelCalls: 1, sessions: 1 }])
  expect(rankSkills(rows, '7d', '2026-10-02', '2026-10-08')).toEqual([
    { name: 'plan-review', explicitCalls: 1, modelCalls: 1, sessions: 1, workspaces: 1 },
    { name: 'code-review', explicitCalls: 0, modelCalls: 1, sessions: 1, workspaces: 1 },
  ])
})

test('Workspace and Token card windows default to six entries and expose the remaining count', () => {
  const cardWindow = (profileAnalytics as unknown as {
    profileCardWindow?: <T>(rows: readonly T[], expanded: boolean, limit?: number) => { visible: readonly T[], remaining: number }
  }).profileCardWindow
  expect(typeof cardWindow).toBe('function')
  if (typeof cardWindow !== 'function') return
  const cards = Array.from({ length: 8 }, (_, index) => `card-${index + 1}`)
  expect(cardWindow(cards, false)).toEqual({ visible: cards.slice(0, 6), remaining: 2 })
  expect(cardWindow(cards, true)).toEqual({ visible: cards, remaining: 0 })
  expect(cardWindow(cards.slice(0, 4), false)).toEqual({ visible: cards.slice(0, 4), remaining: 0 })
})

test('Skill chart bars encode explicit and model calls as shares of the busiest Skill', () => {
  const barWidths = (profileAnalytics as unknown as {
    profileSkillBarWidths?: (explicitCalls: number, modelCalls: number, peakCalls: number) => { explicitPercent: number, modelPercent: number }
  }).profileSkillBarWidths
  expect(typeof barWidths).toBe('function')
  if (typeof barWidths !== 'function') return
  expect(barWidths(3, 1, 8)).toEqual({ explicitPercent: 37.5, modelPercent: 12.5 })
  expect(barWidths(0, 4, 8)).toEqual({ explicitPercent: 0, modelPercent: 50 })
  expect(barWidths(3, 1, 0)).toEqual({ explicitPercent: 0, modelPercent: 0 })
})
