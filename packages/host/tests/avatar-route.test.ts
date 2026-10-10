import { expect, test } from 'vitest'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { mkdir } from 'node:fs/promises'
import { Readable } from 'node:stream'
import path from 'node:path'
import { registerRoutes } from '../src/routes.js'

function registeredAvatarRoute() {
  const routes: { kind?: string, path: string, handler: (request: unknown, response: unknown) => unknown }[] = []
  const disposers: (() => void)[] = []
  const ctx = {
    get() { return undefined },
    logger: { warn() {}, info() {}, error() {} },
  }
  const scope = {
    ...ctx,
    webServer: { register(route: { kind?: string, path: string, handler: (request: unknown, response: unknown) => unknown }) { routes.push(route); return () => {} } },
    effect(run: () => (() => void) | void) { const dispose = run(); if (dispose) disposers.push(dispose) },
  }
  registerRoutes(ctx as never, scope as never)
  return {
    route: routes.find(route => route.kind === 'exact' && route.path === '/dsh-claude-style-plus/avatar'),
    dispose() { for (const dispose of disposers) dispose() },
  }
}

function request(method: string, body?: Buffer, headers: Record<string, string> = {}, remoteAddress = '127.0.0.1') {
  const stream = Readable.from(body ? [body] : []) as unknown as Record<string, unknown> & { on: Readable['on'] }
  stream.method = method
  stream.url = '/dsh-claude-style-plus/avatar'
  stream.headers = { host: '127.0.0.1:3081', origin: 'http://127.0.0.1:3081', 'sec-fetch-site': 'same-origin', ...headers }
  stream.socket = { remoteAddress }
  return stream
}

function response() {
  return {
    headersSent: false,
    writeHead(status: number, headers: Record<string, string> = {}) { this.status = status; this.headers = headers; this.headersSent = true },
    end(body?: Buffer) { this.body = body; this.ended = true },
    destroy() { this.destroyed = true },
  }
}

const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0])

test('the independent profile avatar route isolates bytes under the selected DSH profile', async () => {
  const previousProfile = process.env.DSH_PROFILE_DIR
  const debugRoot = path.join(process.cwd(), '.debug')
  await mkdir(debugRoot, { recursive: true })
  const profileDir = await mkdtemp(path.join(debugRoot, 'profile-avatar-'))
  process.env.DSH_PROFILE_DIR = profileDir
  const routes = registeredAvatarRoute()
  try {
    expect(routes.route).toBeDefined()
    if (!routes.route) return
    const denied = response()
    await routes.route.handler(request('PUT', png, { origin: 'https://evil.example', 'content-type': 'image/png' }), denied)
    expect(denied.status).toBe(403)

    const uploaded = response()
    await routes.route.handler(request('PUT', png, { 'content-type': 'image/png', 'content-length': String(png.length) }), uploaded)
    expect(uploaded.status).toBe(200)
    expect(JSON.parse((uploaded.body as Buffer).toString()).ok).toBe(true)

    const head = response()
    await routes.route.handler(request('HEAD'), head)
    expect(head.status).toBe(200)
    expect(head.headers['content-type']).toBe('image/png')

    const pointer = path.join(profileDir, 'dsh-claude-style-plus', 'avatars', 'current.json')
    expect((await stat(pointer)).isFile()).toBe(true)

    const removed = response()
    await routes.route.handler(request('DELETE'), removed)
    expect(removed.status).toBe(200)
    const absent = response()
    await routes.route.handler(request('HEAD'), absent)
    expect(absent.status).toBe(404)
  } finally {
    routes.dispose()
    if (previousProfile === undefined) delete process.env.DSH_PROFILE_DIR
    else process.env.DSH_PROFILE_DIR = previousProfile
    await rm(profileDir, { recursive: true, force: true })
  }
})

test('the avatar route refuses relative profile roots rather than writing under the process cwd', async () => {
  const previousProfile = process.env.DSH_PROFILE_DIR
  process.env.DSH_PROFILE_DIR = 'relative-avatar-profile'
  const routes = registeredAvatarRoute()
  try {
    expect(routes.route).toBeDefined()
    if (!routes.route) return
    const uploaded = response()
    await routes.route.handler(request('PUT', png, { 'content-type': 'image/png', 'content-length': String(png.length) }), uploaded)
    expect(uploaded.status).toBe(503)
  } finally {
    routes.dispose()
    if (previousProfile === undefined) delete process.env.DSH_PROFILE_DIR
    else process.env.DSH_PROFILE_DIR = previousProfile
  }
})

test('the legacy route fence rejects non-loopback peers and requests without browser-origin evidence', async () => {
  const routes = registeredAvatarRoute()
  try {
    expect(routes.route).toBeDefined()
    if (!routes.route) return

    const remote = response()
    await routes.route.handler(request('HEAD', undefined, {}, '198.51.100.24'), remote)
    expect(remote.status).toBe(403)

    const noProofRequest = request('HEAD')
    const noProofHeaders = noProofRequest.headers as Record<string, string>
    delete noProofHeaders.origin
    delete noProofHeaders['sec-fetch-site']
    const noProof = response()
    await routes.route.handler(noProofRequest, noProof)
    expect(noProof.status).toBe(403)

    const noHostRequest = request('HEAD')
    const noHostHeaders = noHostRequest.headers as Record<string, string>
    delete noHostHeaders.host
    delete noHostHeaders.origin
    delete noHostHeaders['sec-fetch-site']
    const noHost = response()
    await routes.route.handler(noHostRequest, noHost)
    expect(noHost.status).toBe(403)
  } finally {
    routes.dispose()
  }
})
