import { expect, test } from 'vitest'
import { getAvatarCropGeometry, validateAvatarFile } from './avatar-image'

test('custom avatar input accepts only bounded PNG, JPEG, and WebP files', () => {
  expect(validateAvatarFile({ type: 'image/png', size: 1 })).toBeNull()
  expect(validateAvatarFile({ type: 'image/jpeg', size: 1 })).toBeNull()
  expect(validateAvatarFile({ type: 'image/webp', size: 1 })).toBeNull()
  expect(validateAvatarFile({ type: 'image/gif', size: 1 })).toBe('unsupported-type')
  expect(validateAvatarFile({ type: 'image/png', size: 5 * 1024 * 1024 + 1 })).toBe('too-large')
  expect(validateAvatarFile({ type: 'image/png', size: 0 })).toBe('invalid-file')
})

test('crop geometry clamps drag and zoom so the square preview never exposes blank pixels', () => {
  const crop = getAvatarCropGeometry(1200, 600, { zoom: 8, panX: 9999, panY: -9999 }, 192)
  expect(crop.zoom).toBe(4)
  expect(crop.sourceX).toBeGreaterThanOrEqual(0)
  expect(crop.sourceY).toBeGreaterThanOrEqual(0)
  expect(crop.sourceX + crop.sourceSize).toBeLessThanOrEqual(1200)
  expect(crop.sourceY + crop.sourceSize).toBeLessThanOrEqual(600)
})
