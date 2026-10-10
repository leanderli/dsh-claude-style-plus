import { expect, test } from 'vitest'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import path from 'node:path'
import { createUsage } from '../src/usage.js'
import { foldSession } from '../src/usage-fold.js'
import * as usageSummary from '../src/usage-summary.js'

const date = '2026-10-09'
const at = new Date(2026, 9, 9, 12, 0, 0).getTime()

function event(type: string, data: unknown, time = at) {
  return { type, seq: 1, time, data }
}

test('the host fold counts explicit and model-loaded skill calls per session day', () => {
  const events = [
    event('user/message', { role: 'user', content: [], source: { kind: 'skill-invocation', name: 'plan-review', form: 'instructions' } }),
    event('tool/call', { turn: 1, step: 1, callId: 'call-1', name: 'skill', arguments: '{"name":"code-review"}' }, at + 60_000),
    event('tool/call', { turn: 1, step: 1, callId: 'call-2', name: 'read', arguments: '{"name":"ignored"}' }, at + 120_000),
  ] as unknown as Parameters<typeof foldSession>[0]

  const folded = foldSession(events)
  expect(folded.skillDays instanceof Map).toBe(true)
  const day = folded.skillDays?.get(date)
  expect(day?.get('plan-review')).toEqual({ explicitCalls: 1, modelCalls: 0 })
  expect(day?.get('code-review')).toEqual({ explicitCalls: 0, modelCalls: 1 })
  expect(day?.has('ignored')).toBe(false)
})

test('workspace summarization groups registered sessions and keeps unassigned activity distinct', () => {
  const summarizeWorkspaces = (usageSummary as unknown as {
    summarizeWorkspaces?: (sessions: Map<string, unknown>, workspaces: { id: string, title: string, path: string, sessionIds: string[] }[]) => { workspaceId: string | null, title: string | null, totals: { input: number }, skills: { name: string, explicitCalls: number, modelCalls: number }[] }[]
  }).summarizeWorkspaces
  expect(typeof summarizeWorkspaces).toBe('function')
  if (typeof summarizeWorkspaces !== 'function') return

  const bucket = (input: number) => ({ input, output: 0, cacheRead: 0, cacheWrite: 0, calls: 1, models: new Map() })
  const sessions = new Map<string, unknown>([
    ['s-in-workspace', {
      size: 1, mtimeMs: 1, hours: new Array(24).fill(0),
      days: new Map([[date, { ...bucket(12), sessions: 1, sessionIds: ['s-in-workspace'] }]]),
      skillDays: new Map([[date, new Map([['plan-review', { explicitCalls: 1, modelCalls: 1 }]])]]),
    }],
    ['s-unassigned', {
      size: 1, mtimeMs: 1, hours: new Array(24).fill(0),
      days: new Map([[date, { ...bucket(7), sessions: 1, sessionIds: ['s-unassigned'] }]]),
      skillDays: new Map(),
    }],
  ])
  const rows = summarizeWorkspaces(sessions, [{ id: 'workspace-a', title: 'Workspace A', path: 'C:/repo', sessionIds: ['s-in-workspace'] }])
  expect(rows.find(row => row.workspaceId === 'workspace-a')).toMatchObject({
    title: 'Workspace A', path: 'C:/repo', totals: { input: 12 },
    skills: [{ name: 'plan-review', explicitCalls: 1, modelCalls: 1 }],
  })
  expect(rows.find(row => row.workspaceId === null)).toMatchObject({ title: null, totals: { input: 7 } })
})

test('skill counts exclude invocations copied in a fork-inherited Session prefix', () => {
  const inheritedPrefix = [
    { type: 'user/message', seq: 0, time: at, data: { role: 'user', content: [], source: { kind: 'skill-invocation', name: 'inherited-explicit', form: 'instructions' } } },
    { type: 'tool/call', seq: 1, time: at + 60_000, data: { turn: 1, step: 1, callId: 'call-old', name: 'skill', arguments: '{"name":"inherited-tool"}' } },
  ]
  const ownEvents = [
    { type: 'tool/call', seq: 2, time: at + 120_000, data: { turn: 2, step: 1, callId: 'call-new', name: 'skill', arguments: '{"name":"own-tool"}' } },
    { type: 'user/message', seq: 3, time: at + 180_000, data: { role: 'user', content: [], source: { kind: 'skill-invocation', name: 'own-explicit', form: 'instructions' } } },
  ]
  const folded = foldSession([...inheritedPrefix, ...ownEvents] as unknown as Parameters<typeof foldSession>[0], 2)
  const day = folded.skillDays.get(date)
  expect(day?.has('inherited-explicit')).toBe(false)
  expect(day?.has('inherited-tool')).toBe(false)
  expect(day?.get('own-tool')).toEqual({ explicitCalls: 0, modelCalls: 1 })
  expect(day?.get('own-explicit')).toEqual({ explicitCalls: 1, modelCalls: 0 })
})

test('workspace registry failures do not suppress the global usage summary', async () => {
  const debugRoot = path.join(process.cwd(), '.debug')
  await mkdir(debugRoot, { recursive: true })
  const home = await mkdtemp(path.join(debugRoot, 'workspace-registry-'))
  const ctx = {
    get(name: string) {
      if (name === 'dshHomePath') return (...segments: string[]) => path.join(home, ...segments)
      if (name === 'workspaceRegistry') return { list() { throw new Error('registry unavailable') } }
      return undefined
    },
    logger: { warn() {} },
  }
  const usage = createUsage(ctx as never)
  try {
    await usage.refresh()
    const snapshot = usage.snapshot()
    expect(snapshot.value).not.toBeNull()
    expect(snapshot.value?.workspaceUsage?.workspaceRegistryUnavailable).toBe(true)
  } finally {
    usage.dispose()
    await rm(home, { recursive: true, force: true })
  }
})
