import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'

export const MAX_AVATAR_BYTES = 512 * 1024
const AVATAR_DIR_PARTS = ['dsh-claude-style-plus', 'avatars']
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
const MEDIA_TYPES: Record<string, { extension: string, valid: (bytes: Buffer) => boolean }> = {
  'image/png': { extension: 'png', valid: bytes => bytes.length >= 8 && bytes.subarray(0, 8).equals(PNG_SIGNATURE) },
  'image/jpeg': { extension: 'jpg', valid: bytes => bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff },
  'image/webp': { extension: 'webp', valid: bytes => bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' },
}
const OBJECT_NAME_RE = /^avatar-([a-f0-9]{64})\.(png|jpg|webp)$/
const POINTER_NAME = 'current.json'

/** Resolve the dedicated data directory inside exactly one DSH profile. */
export function avatarDirectory(profileDir: string) {
  if (typeof profileDir !== 'string' || !isAbsolute(profileDir)) throw new Error('profile directory is unavailable')
  const root = resolve(profileDir)
  const directory = resolve(root, ...AVATAR_DIR_PARTS)
  const rel = relative(root, directory)
  if (rel === '' || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error('avatar directory escaped the profile')
  return directory
}

function checkedImage(mediaType: string, input: Uint8Array) {
  const type = typeof mediaType === 'string' ? mediaType.split(';', 1)[0].trim().toLowerCase() : ''
  const descriptor = MEDIA_TYPES[type]
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input)
  if (descriptor === undefined) throw new Error('unsupported avatar media type')
  if (bytes.length === 0 || bytes.length > MAX_AVATAR_BYTES) throw new Error('avatar image size is invalid')
  if (!descriptor.valid(bytes)) throw new Error('avatar image signature is invalid')
  return { type, descriptor, bytes }
}

function pointerPath(directory: string) {
  return join(directory, POINTER_NAME)
}

async function readPointer(directory: string): Promise<{ file: string, version: string, mediaType: string } | null> {
  try {
    const pointer = JSON.parse(await readFile(pointerPath(directory), 'utf8')) as { file?: unknown, version?: unknown }
    if (typeof pointer.file !== 'string' || !OBJECT_NAME_RE.test(pointer.file)) return null
    const match = OBJECT_NAME_RE.exec(pointer.file)
    if (match === null || match[1] !== pointer.version) return null
    const mediaType = match[2] === 'png' ? 'image/png' : match[2] === 'jpg' ? 'image/jpeg' : 'image/webp'
    return { file: pointer.file, version: match[1], mediaType }
  } catch {
    return null
  }
}

/** Persist the validated raster and atomically point the profile at the new version. */
export async function saveProfileAvatar(profileDir: string, mediaType: string, input: Uint8Array) {
  const { type, descriptor, bytes } = checkedImage(mediaType, input)
  const directory = avatarDirectory(profileDir)
  await mkdir(directory, { recursive: true, mode: 0o700 })

  const version = createHash('sha256').update(bytes).digest('hex')
  const file = `avatar-${version}.${descriptor.extension}`
  const imagePath = join(directory, file)
  const previous = await readPointer(directory)

  try {
    await writeFile(imagePath, bytes, { flag: 'wx', mode: 0o600 })
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== 'EEXIST') throw error
  }

  const pointerTemp = join(directory, `.current-${randomUUID()}.tmp`)
  try {
    await writeFile(pointerTemp, JSON.stringify({ version, file, mediaType: type }), { flag: 'wx', mode: 0o600 })
    await rename(pointerTemp, pointerPath(directory))
  } catch (error) {
    await rm(pointerTemp, { force: true }).catch(() => {})
    throw error
  }

  if (previous !== null && previous.file !== file) await rm(join(directory, previous.file), { force: true })
  return { path: imagePath, mediaType: type, version }
}

/** Read the one selected avatar and revalidate its name, bytes and digest before serving it. */
export async function readProfileAvatar(profileDir: string) {
  const directory = avatarDirectory(profileDir)
  const pointer = await readPointer(directory)
  if (pointer === null) return null
  const imagePath = join(directory, pointer.file)
  try {
    const bytes = await readFile(imagePath)
    const checked = checkedImage(pointer.mediaType, bytes)
    const version = createHash('sha256').update(checked.bytes).digest('hex')
    if (version !== pointer.version) return null
    return { path: imagePath, bytes, mediaType: pointer.mediaType, version }
  } catch {
    return null
  }
}

/** Remove the profile's avatar pointer and all owned image objects. */
export async function removeProfileAvatar(profileDir: string) {
  const directory = avatarDirectory(profileDir)
  let entries: string[]
  try {
    entries = await readdir(directory)
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return false
    throw error
  }
  let removed = false
  for (const entry of entries) {
    if (entry === POINTER_NAME || OBJECT_NAME_RE.test(entry) || /^\.current-[a-f0-9-]+\.tmp$/.test(entry)) {
      await rm(join(directory, entry), { force: true })
      removed = true
    }
  }
  return removed
}
