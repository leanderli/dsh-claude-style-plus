import { AVATAR_PATH } from '@dsh-claude-style-plus/contracts/routes'
import { isStoredAvatarDataUrl } from './avatar-image'

export const AVATAR_ROUTE = AVATAR_PATH
export const MAX_AVATAR_UPLOAD_BYTES = 512 * 1024
const LEGACY_AVATAR_STORAGE_KEY = 'dsh-claude-style-plus.custom-avatar'
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])

type AvatarStorage = Pick<Storage, 'getItem' | 'removeItem'>
export type AvatarFetcher = (url: string, init?: RequestInit) => Promise<Response>

function legacyAvatarBlob(storage: AvatarStorage | null) {
  if (storage === null) return null
  try {
    const dataUrl = storage.getItem(LEGACY_AVATAR_STORAGE_KEY)
    if (!dataUrl) return null
    if (!isStoredAvatarDataUrl(dataUrl)) {
      storage.removeItem(LEGACY_AVATAR_STORAGE_KEY)
      return null
    }
    const comma = dataUrl.indexOf(',')
    const mediaType = dataUrl.slice(5, dataUrl.indexOf(';'))
    const binary = atob(dataUrl.slice(comma + 1))
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
    return new Blob([bytes], { type: mediaType })
  } catch {
    try { storage.removeItem(LEGACY_AVATAR_STORAGE_KEY) } catch {}
    return null
  }
}

function clearLegacyAvatar(storage: AvatarStorage | null) {
  try { storage?.removeItem(LEGACY_AVATAR_STORAGE_KEY) } catch {}
}

/** The browser-facing API for the profile-owned avatar endpoint. */
export function createServerAvatarClient(fetcher: AvatarFetcher, legacyStorage: AvatarStorage | null = null) {
  let currentUrl = ''
  let loading: Promise<string> | null = null
  let mutationVersion = 0
  const listeners = new Set<() => void>()

  function publish(next: string) {
    if (next === currentUrl) return
    currentUrl = next
    mutationVersion += 1
    for (const listener of [...listeners]) listener()
  }

  function versionFrom(response: Response, payload?: { version?: unknown }) {
    const header = response.headers.get('etag') || response.headers.get('last-modified')
    const value = typeof payload?.version === 'string' ? payload.version : header || String(Date.now())
    return value.replace(/^"|"$/g, '')
  }

  async function upload(blob: Blob) {
    if (!ALLOWED_TYPES.has(blob.type.toLowerCase())) throw new Error('unsupported-type')
    if (blob.size <= 0 || blob.size > MAX_AVATAR_UPLOAD_BYTES) throw new Error('too-large')
    const response = await fetcher(AVATAR_ROUTE, {
      method: 'PUT',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'content-type': blob.type.toLowerCase() },
      body: blob,
    })
    const payload = await response.json().catch(() => null) as { ok?: unknown, version?: unknown, error?: unknown } | null
    if (!response.ok || payload?.ok !== true) throw new Error(typeof payload?.error === 'string' ? payload.error : 'server-unavailable')
    clearLegacyAvatar(legacyStorage)
    const next = `${AVATAR_ROUTE}?v=${encodeURIComponent(versionFrom(response, payload))}`
    publish(next)
    return next
  }

  async function remove() {
    const response = await fetcher(AVATAR_ROUTE, { method: 'DELETE', credentials: 'same-origin', cache: 'no-store' })
    const payload = await response.json().catch(() => null) as { ok?: unknown, error?: unknown } | null
    if (!response.ok || payload?.ok !== true) throw new Error(typeof payload?.error === 'string' ? payload.error : 'server-unavailable')
    clearLegacyAvatar(legacyStorage)
    publish('')
    return true
  }

  return {
    get() { return currentUrl },
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    load() {
      if (loading !== null) return loading
      const observedMutation = mutationVersion
      loading = (async () => {
        const response = await fetcher(AVATAR_ROUTE, { method: 'HEAD', credentials: 'same-origin', cache: 'no-store' })
        if (mutationVersion !== observedMutation) return currentUrl
        if (response.status === 404) {
          const previousBrowserAvatar = legacyAvatarBlob(legacyStorage)
          if (previousBrowserAvatar !== null) return upload(previousBrowserAvatar)
          clearLegacyAvatar(legacyStorage)
          publish('')
          return ''
        }
        if (!response.ok) throw new Error('server-unavailable')
        clearLegacyAvatar(legacyStorage)
        const next = `${AVATAR_ROUTE}?v=${encodeURIComponent(versionFrom(response))}`
        publish(next)
        return next
      })().finally(() => { loading = null })
      return loading
    },
    upload,
    remove,
  }
}

function browserLegacyStorage(): AvatarStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

const serverAvatar = createServerAvatarClient((url, init) => fetch(url, init), browserLegacyStorage())

export const getServerAvatarUrl = () => serverAvatar.get()
export const subscribeServerAvatar = (listener: () => void) => serverAvatar.subscribe(listener)
export const refreshServerAvatar = () => serverAvatar.load()
export const uploadServerAvatar = (blob: Blob) => serverAvatar.upload(blob)
export const removeServerAvatar = () => serverAvatar.remove()
