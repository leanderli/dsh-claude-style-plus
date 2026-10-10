import { expect, test } from 'vitest'
import { createHomeUsage, homeDayKey, homeModelDays, homePanelData } from './data'
import type { HomeUsageState, ListSummary } from './data'
import type { UsageReport } from '@dsh-claude-style-plus/contracts/usage'

function localDay(offset: number) {
  const date = new Date()
  date.setHours(12, 0, 0, 0)
  date.setDate(date.getDate() + offset)
  return { date, key: homeDayKey(date) }
}

test('ranged report cards and model-day projection exclude dates after today', () => {
  const today = localDay(0)
  const future = localDay(1)
  const report = {
    source: 'local', computedAt: Date.now(),
    days: [
      { date: today.key, input: 4, output: 2, cacheRead: 0, cacheWrite: 0, calls: 1, sessions: 1, sessionIds: ['today'], models: { 'model-current': 6 } },
      { date: future.key, input: 900, output: 0, cacheRead: 0, cacheWrite: 0, calls: 9, sessions: 1, sessionIds: ['future'], models: { future: 900 } },
    ],
    models: [], firstDay: today.key, lastDay: future.key,
    totals: { input: 904, output: 2, cacheRead: 0, cacheWrite: 0, calls: 10, sessions: 2, activeDays: 2 },
  } as UsageReport
  const state: HomeUsageState = { value: report, computing: false, error: null, loading: false, polls: 0 }
  expect(homePanelData(state, null, '7d', 0).tokens).toBe(6)
  expect(homeModelDays(report, 7)?.map(day => day.date)).toEqual([today.key])
})

test('session-list fallback excludes future-dated sessions and active days', () => {
  const today = localDay(0)
  const future = localDay(1)
  const listed: ListSummary = {
    tokens: 906, sessions: 2, activeDays: 2, model: null, models: [],
    days: [{ date: today.key, total: 6 }, { date: future.key, total: 900 }],
    entries: [
      { at: today.date.getTime(), tokens: 6, model: 'model-now' },
      { at: future.date.getTime(), tokens: 900, model: 'model-future' },
    ],
  }
  const state: HomeUsageState = { value: null, computing: false, error: null, loading: false, polls: 0 }
  const panel = homePanelData(state, listed, '7d', 0)
  expect(panel.tokens).toBe(6)
  expect(panel.sessions).toBe(1)
  expect(panel.activeDays).toBe(1)
})

test('profile reopen can force-refresh an already cached session-list summary', async () => {
  let requests = 0
  const sessions = {
    list() {
      requests += 1
      return Promise.resolve({ ok: true, value: { items: [] } })
    },
  }
  const store = createHomeUsage({ get(name: string) { return name === 'remote.session' ? sessions : undefined } } as never)
  store.loadList()
  await Promise.resolve()
  store.loadList()
  await Promise.resolve()
  expect(requests).toBe(1)
  ;(store.loadList as (force?: boolean) => void)(true)
  await Promise.resolve()
  expect(requests).toBe(2)
  store.stop()
})
