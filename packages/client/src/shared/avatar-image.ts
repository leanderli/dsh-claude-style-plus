export const AVATAR_MAX_FILE_BYTES = 5 * 1024 * 1024
export const AVATAR_MAX_DATA_URL_CHARS = 256_000
export const AVATAR_MAX_OUTPUT_BYTES = 256 * 1024
export const AVATAR_OUTPUT_SIZE = 128

const ACCEPTED_AVATAR_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])
export const AVATAR_CROP_VIEWPORT = 192

export interface AvatarCropState {
  zoom: number
  panX: number
  panY: number
}

export interface AvatarCropGeometry extends AvatarCropState {
  scale: number
  displayWidth: number
  displayHeight: number
  left: number
  top: number
  sourceX: number
  sourceY: number
  sourceSize: number
}

/** Map an interactive viewport pan/zoom to a bounded square source-image crop. */
export function getAvatarCropGeometry(width: number, height: number, crop: AvatarCropState, viewportSize = AVATAR_CROP_VIEWPORT): AvatarCropGeometry {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 || viewportSize <= 0) {
    throw new Error('invalid-file')
  }
  const zoom = Number.isFinite(crop.zoom) ? Math.max(1, Math.min(4, crop.zoom)) : 1
  const scale = Math.max(viewportSize / width, viewportSize / height) * zoom
  const displayWidth = width * scale
  const displayHeight = height * scale
  const maxPanX = Math.max(0, (displayWidth - viewportSize) / 2)
  const maxPanY = Math.max(0, (displayHeight - viewportSize) / 2)
  const panX = Number.isFinite(crop.panX) ? Math.max(-maxPanX, Math.min(maxPanX, crop.panX)) : 0
  const panY = Number.isFinite(crop.panY) ? Math.max(-maxPanY, Math.min(maxPanY, crop.panY)) : 0
  const sourceSize = viewportSize / scale
  const sourceX = Math.max(0, Math.min(width - sourceSize, (width - sourceSize) / 2 - panX / scale))
  const sourceY = Math.max(0, Math.min(height - sourceSize, (height - sourceSize) / 2 - panY / scale))
  return {
    zoom, panX, panY, scale, displayWidth, displayHeight,
    left: (viewportSize - displayWidth) / 2 + panX,
    top: (viewportSize - displayHeight) / 2 + panY,
    sourceX, sourceY, sourceSize,
  }
}

export type AvatarFileError = 'invalid-file' | 'unsupported-type' | 'too-large'

/** Validate the bytes the browser reports before decoding an uploaded image. */
export function validateAvatarFile(file: { type?: unknown, size?: unknown } | null | undefined): AvatarFileError | null {
  if (file === null || file === undefined || typeof file.size !== 'number' || !Number.isFinite(file.size) || file.size <= 0) {
    return 'invalid-file'
  }
  if (typeof file.type !== 'string' || !ACCEPTED_AVATAR_TYPES.has(file.type.toLowerCase())) {
    return 'unsupported-type'
  }
  if (file.size > AVATAR_MAX_FILE_BYTES) return 'too-large'
  return null
}

/** Only small, base64 raster images from the earlier browser-local version may be migrated. */
export function isStoredAvatarDataUrl(value: unknown): value is string {
  return typeof value === 'string'
    && value.length <= AVATAR_MAX_DATA_URL_CHARS
    && /^data:image\/(?:webp|png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)
}

function canvasToBlob(canvas: HTMLCanvasElement, mediaType: string, quality: number) {
  return new Promise<Blob | null>(resolve => {
    try { canvas.toBlob(resolve, mediaType, quality) } catch { resolve(null) }
  })
}

/** Decode, center-crop and downsample a user image to a compact raster Blob for server upload. */
export async function createAvatarBlob(file: File, crop: AvatarCropState = { zoom: 1, panX: 0, panY: 0 }): Promise<Blob> {
  const error = validateAvatarFile(file)
  if (error !== null) throw new Error(error)
  if (typeof createImageBitmap !== 'function') throw new Error('image-processing-unavailable')

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error('invalid-file')
  }

  try {
    if (bitmap.width <= 0 || bitmap.height <= 0) throw new Error('invalid-file')
    if (bitmap.width * bitmap.height > 40_000_000) throw new Error('image-dimensions-too-large')
    const canvas = document.createElement('canvas')
    canvas.width = AVATAR_OUTPUT_SIZE
    canvas.height = AVATAR_OUTPUT_SIZE
    const context = canvas.getContext('2d')
    if (context === null) throw new Error('image-processing-unavailable')

    const geometry = getAvatarCropGeometry(bitmap.width, bitmap.height, crop)
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    context.drawImage(bitmap, geometry.sourceX, geometry.sourceY, geometry.sourceSize, geometry.sourceSize, 0, 0, AVATAR_OUTPUT_SIZE, AVATAR_OUTPUT_SIZE)

    let output = await canvasToBlob(canvas, 'image/webp', 0.88)
    if (output === null || !ACCEPTED_AVATAR_TYPES.has(output.type.toLowerCase())) output = await canvasToBlob(canvas, 'image/jpeg', 0.86)
    if (output !== null && output.size > AVATAR_MAX_OUTPUT_BYTES) output = await canvasToBlob(canvas, 'image/jpeg', 0.72)
    canvas.width = 0
    canvas.height = 0
    if (output === null || !ACCEPTED_AVATAR_TYPES.has(output.type.toLowerCase())) throw new Error('image-processing-unavailable')
    if (output.size <= 0 || output.size > AVATAR_MAX_OUTPUT_BYTES) throw new Error('image-too-large')
    return output
  } finally {
    bitmap.close()
  }
}
