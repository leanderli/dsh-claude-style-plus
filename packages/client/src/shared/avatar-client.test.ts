import { expect, test } from 'vitest'
import { createServerAvatarClient, MAX_AVATAR_UPLOAD_BYTES } from './avatar-client'

const webp = new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80])
const blob = () => new Blob([webp], { type: 'image/webp' })

function dataUrl(bytes: Uint8Array) {
  return `data:image/webp;base64,${btoa(String.fromCharCode(...bytes))}`
}

test('avatar client discovers, uploads, cache-busts, and removes the profile avatar', async () => {
  const calls: { url: string, options: RequestInit }[] = []
  const fetcher = async (url: string, options: RequestInit = {}) => {
    calls.push({ url, options })
    if (options.method === 'HEAD') return new Response(null, { status: 200, headers: { etag: 'avatar-v1' } })
    if (options.method === 'PUT') return new Response(JSON.stringify({ ok: true, version: 'avatar-v2' }), { status: 200, headers: { 'content-type': 'application/json' } })
    if (options.method === 'DELETE') return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } })
    return new Response(null, { status: 405 })
  }
  const client = createServerAvatarClient(fetcher)
  let changes = 0
  client.subscribe(() => { changes += 1 })

  expect(await client.load()).toBe('/dsh-claude-style-plus/avatar?v=avatar-v1')
  expect(calls[0].options.method).toBe('HEAD')
  expect(await client.upload(blob())).toBe('/dsh-claude-style-plus/avatar?v=avatar-v2')
  expect(calls[1].url).toBe('/dsh-claude-style-plus/avatar')
  expect(calls[1].options.method).toBe('PUT')
  expect((calls[1].options.headers as Record<string, string>)['content-type']).toBe('image/webp')
  expect(calls[1].options.body).toBeInstanceOf(Blob)
  expect(await client.remove()).toBe(true)
  expect(calls[2].options.method).toBe('DELETE')
  expect(client.get()).toBe('')
  expect(changes).toBe(3)
})

test('avatar client rejects unsupported and oversized uploads before network I/O', async () => {
  const calls: RequestInfo[] = []
  const client = createServerAvatarClient(async (url, options) => { calls.push(url); return new Response(null, { status: 200 }) })
  await expect(client.upload(new Blob(['x'], { type: 'image/svg+xml' }))).rejects.toThrow(/unsupported/i)
  await expect(client.upload(new Blob([new Uint8Array(MAX_AVATAR_UPLOAD_BYTES + 1)], { type: 'image/png' }))).rejects.toThrow(/large|size/i)
  expect(calls).toHaveLength(0)
})

test('legacy Plus browser avatar migrates to the profile server when none exists', async () => {
  const storage = new Map<string, string>([['dsh-claude-style-plus.custom-avatar', dataUrl(webp)]])
  const legacyStorage = {
    getItem(key: string) { return storage.get(key) ?? null },
    removeItem(key: string) { storage.delete(key) },
  }
  const methods: string[] = []
  const fetcher = async (_url: string, options: RequestInit = {}) => {
    methods.push(options.method ?? 'GET')
    if (options.method === 'HEAD') return new Response(null, { status: 404 })
    if (options.method === 'PUT') {
      expect((options.body as Blob).type).toBe('image/webp')
      return new Response(JSON.stringify({ ok: true, version: 'migrated' }), { status: 200 })
    }
    throw new Error('unexpected method')
  }
  const client = createServerAvatarClient(fetcher, legacyStorage)
  expect(await client.load()).toBe('/dsh-claude-style-plus/avatar?v=migrated')
  expect(methods).toEqual(['HEAD', 'PUT'])
  expect(storage.has('dsh-claude-style-plus.custom-avatar')).toBe(false)
})

test('late initial avatar lookup cannot overwrite a newer upload', async () => {
  const headRequest: { finish?: (response: Response) => void } = {}
  const fetcher = async (_url: string, options: RequestInit = {}) => {
    if (options.method === 'HEAD') return new Promise<Response>(resolve => { headRequest.finish = resolve })
    if (options.method === 'PUT') return new Response(JSON.stringify({ ok: true, version: 'new-upload' }), { status: 200 })
    throw new Error('unexpected method')
  }
  const client = createServerAvatarClient(fetcher)
  const initialLoad = client.load()
  expect(await client.upload(blob())).toBe('/dsh-claude-style-plus/avatar?v=new-upload')
  const finishHead = headRequest.finish
  if (finishHead === undefined) throw new Error('initial HEAD request was not started')
  finishHead(new Response(null, { status: 200, headers: { etag: 'stale-avatar' } }))
  await initialLoad
  expect(client.get()).toBe('/dsh-claude-style-plus/avatar?v=new-upload')
})
