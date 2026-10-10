import { expect, test } from 'vitest'
import { randomUUID } from 'node:crypto'
import { mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { readCache, writeCache } from '../src/usage-cache.js'

const day = '2026-10-09'

test('per-session cache preserves the two skill-call categories by day', async () => {
  const root = path.join(process.cwd(), '.debug', `usage-cache-${randomUUID()}`)
  const ctx = { logger: { warn() {} } }
  await mkdir(root, { recursive: true })
  try {
    const sessions = new Map([['session-a', {
      size: 1,
      mtimeMs: 2,
      hours: new Array(24).fill(0),
      days: new Map(),
      skillDays: new Map([[day, new Map([
        ['plan-review', { explicitCalls: 2, modelCalls: 0 }],
        ['code-review', { explicitCalls: 0, modelCalls: 1 }],
      ])]]),
    }]])
    writeCache(ctx as never, root, sessions as never)
    const restored = readCache(ctx as never, root).get('session-a') as { skillDays?: Map<string, Map<string, { explicitCalls: number, modelCalls: number }>> } | undefined
    expect(restored?.skillDays instanceof Map).toBe(true)
    expect(restored?.skillDays?.get(day)?.get('plan-review')).toEqual({ explicitCalls: 2, modelCalls: 0 })
    expect(restored?.skillDays?.get(day)?.get('code-review')).toEqual({ explicitCalls: 0, modelCalls: 1 })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
