import * as React from 'react'
import { getCustomAvatarUrl, onCustomAvatarChanged, refreshCustomAvatar, uploadCustomAvatar, removeCustomAvatar } from '../../core/host'
import { settingsCopy } from '../../core/i18n'
import {
  AVATAR_CROP_VIEWPORT,
  createAvatarBlob,
  getAvatarCropGeometry,
  validateAvatarFile,
} from '../../shared/avatar-image'
import type { AvatarCropState } from '../../shared/avatar-image'

interface ImageSize { width: number, height: number }
interface CropDrag {
  pointerId: number
  startX: number
  startY: number
  panX: number
  panY: number
  zoom: number
}

const INITIAL_CROP: AvatarCropState = { zoom: 1, panX: 0, panY: 0 }

/** Profile-avatar settings, including the interactive crop frame shown before upload. */
export function CustomAvatarSetting() {
  const [avatar, setAvatar] = React.useState(getCustomAvatarUrl())
  const [busy, setBusy] = React.useState(false)
  const [feedback, setFeedback] = React.useState<{ text: string, error: boolean } | null>(null)
  const [pendingFile, setPendingFile] = React.useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = React.useState('')
  const [imageSize, setImageSize] = React.useState<ImageSize | null>(null)
  const [crop, setCrop] = React.useState<AvatarCropState>(INITIAL_CROP)
  const [dragging, setDragging] = React.useState(false)
  const fileInput = React.useRef<HTMLInputElement | null>(null)
  const drag = React.useRef<CropDrag | null>(null)

  React.useEffect(() => {
    const unsubscribe = onCustomAvatarChanged(() => setAvatar(getCustomAvatarUrl()))
    void refreshCustomAvatar().catch(() => {})
    return unsubscribe
  }, [])

  React.useEffect(() => {
    if (pendingFile === null) {
      setPreviewUrl('')
      return undefined
    }
    const url = URL.createObjectURL(pendingFile)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [pendingFile])

  const geometry = imageSize === null
    ? null
    : getAvatarCropGeometry(imageSize.width, imageSize.height, crop, AVATAR_CROP_VIEWPORT)

  function showError(reason: string) {
    setFeedback({ text: avatarError(reason), error: true })
  }

  function chooseFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0] ?? null
    event.currentTarget.value = ''
    if (file === null) return
    const validation = validateAvatarFile(file)
    if (validation !== null) {
      showError(validation)
      return
    }
    setPendingFile(file)
    setImageSize(null)
    setCrop(INITIAL_CROP)
    setFeedback(null)
  }

  function setCropWithinImage(next: AvatarCropState) {
    if (imageSize === null) return
    const bounded = getAvatarCropGeometry(imageSize.width, imageSize.height, next, AVATAR_CROP_VIEWPORT)
    setCrop({ zoom: bounded.zoom, panX: bounded.panX, panY: bounded.panY })
  }

  function handleCropKey(event: React.KeyboardEvent<HTMLDivElement>) {
    if (imageSize === null || geometry === null) return
    const step = event.shiftKey ? 24 : 8
    const delta = event.key === 'ArrowLeft' ? { x: step, y: 0 }
      : event.key === 'ArrowRight' ? { x: -step, y: 0 }
      : event.key === 'ArrowUp' ? { x: 0, y: step }
      : event.key === 'ArrowDown' ? { x: 0, y: -step }
      : null
    if (delta === null) return
    event.preventDefault()
    setCropWithinImage({ ...crop, panX: geometry.panX + delta.x, panY: geometry.panY + delta.y })
  }

  function handleCropPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (geometry === null || imageSize === null || busy) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      panX: geometry.panX,
      panY: geometry.panY,
      zoom: crop.zoom,
    }
    setDragging(true)
  }

  function handleCropPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const start = drag.current
    if (start === null || start.pointerId !== event.pointerId || imageSize === null) return
    const bounded = getAvatarCropGeometry(imageSize.width, imageSize.height, {
      zoom: start.zoom,
      panX: start.panX + event.clientX - start.startX,
      panY: start.panY + event.clientY - start.startY,
    }, AVATAR_CROP_VIEWPORT)
    setCrop({ zoom: bounded.zoom, panX: bounded.panX, panY: bounded.panY })
  }

  function endCropDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (drag.current?.pointerId !== event.pointerId) return
    drag.current = null
    setDragging(false)
  }

  async function saveCrop() {
    if (pendingFile === null || imageSize === null || busy) return
    setBusy(true)
    setFeedback(null)
    try {
      const blob = await createAvatarBlob(pendingFile, crop)
      const avatarUrl = await uploadCustomAvatar(blob)
      setAvatar(avatarUrl)
      setPendingFile(null)
      setImageSize(null)
      setCrop(INITIAL_CROP)
      setFeedback({ text: settingsCopy('avatarSaved', 'Avatar updated.'), error: false })
    } catch (error) {
      showError(error instanceof Error ? error.message : 'server-unavailable')
    } finally {
      setBusy(false)
    }
  }

  function cancelCrop() {
    if (busy) return
    setPendingFile(null)
    setImageSize(null)
    setCrop(INITIAL_CROP)
    setFeedback(null)
  }

  async function removeAvatar() {
    if (busy) return
    setBusy(true)
    setFeedback(null)
    try {
      await removeCustomAvatar()
      setAvatar('')
    } catch (error) {
      showError(error instanceof Error ? error.message : 'server-unavailable')
    } finally {
      setBusy(false)
    }
  }

  function avatarError(reason: string) {
    const code = reason.toLowerCase()
    if (code === 'unsupported-type' || code === 'unsupported-avatar-type') return settingsCopy('avatarUnsupported', 'Choose a PNG, JPEG or WebP image.')
    if (code === 'too-large' || code === 'avatar-too-large') return settingsCopy('avatarTooLarge', 'The image must be 5 MB or smaller.')
    if (code === 'image-processing-unavailable') return settingsCopy('avatarProcessingUnavailable', 'This browser cannot process the image.')
    if (code === 'image-too-large') return settingsCopy('avatarOutputTooLarge', 'The processed image is still too large.')
    if (code === 'image-dimensions-too-large') return settingsCopy('avatarDimensionsTooLarge', 'The image dimensions are too large to process.')
    if (code === 'invalid-avatar-image') return settingsCopy('avatarInvalid', 'This image could not be opened.')
    if (code === 'profile-storage-unavailable' || code === 'avatar-storage-failed' || code === 'server-unavailable' || code.includes('fetch failed')) {
      return settingsCopy('avatarStorageFailed', 'The profile avatar store is unavailable.')
    }
    return settingsCopy('avatarInvalid', 'This image could not be opened.')
  }

  const placeholder = React.createElement('svg', {
    viewBox: '0 0 24 24', width: 20, height: 20, fill: 'none', stroke: 'currentColor',
    strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true',
  },
  React.createElement('circle', { cx: 12, cy: 8, r: 3.4 }),
  React.createElement('path', { d: 'M5.3 20c.4-3.6 2.9-5.7 6.7-5.7s6.3 2.1 6.7 5.7' }))

  const cropPanel = pendingFile === null ? null : React.createElement('div', { className: 'dsh-claude-style-plus-avatar-crop-panel' },
    React.createElement('div', {
      className: dragging ? 'dsh-claude-style-plus-avatar-crop-frame dsh-claude-style-plus-avatar-crop-dragging' : 'dsh-claude-style-plus-avatar-crop-frame',
      role: 'group',
      tabIndex: 0,
      'aria-label': settingsCopy('avatarCropPreview', 'Avatar crop preview. Drag to reposition; use arrow keys for fine movement.'),
      onPointerDown: handleCropPointerDown,
      onPointerMove: handleCropPointerMove,
      onPointerUp: endCropDrag,
      onPointerCancel: endCropDrag,
      onKeyDown: handleCropKey,
    },
    previewUrl ? React.createElement('img', {
      src: previewUrl,
      alt: '',
      draggable: false,
      onLoad(event: React.SyntheticEvent<HTMLImageElement>) {
        setImageSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })
        setCrop(INITIAL_CROP)
      },
      onError() { showError('invalid-file') },
      style: geometry === null ? {
        position: 'absolute',
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        pointerEvents: 'none',
        userSelect: 'none',
      } : {
        position: 'absolute',
        width: `${geometry.displayWidth}px`,
        height: `${geometry.displayHeight}px`,
        left: `${geometry.left}px`,
        top: `${geometry.top}px`,
        maxWidth: 'none',
        pointerEvents: 'none',
        userSelect: 'none',
      },
    }) : React.createElement('span', { className: 'dsh-claude-style-plus-avatar-crop-loading', role: 'status' }, settingsCopy('avatarProcessing', 'Processing…')),
    ),
    React.createElement('div', { className: 'dsh-claude-style-plus-avatar-crop-controls' },
      React.createElement('p', { className: 'dsh-claude-style-plus-avatar-crop-hint' }, settingsCopy('avatarCropHint', 'Drag to reposition. Use the arrow keys for fine adjustments.')),
      React.createElement('label', { className: 'dsh-claude-style-plus-avatar-crop-zoom' },
        React.createElement('span', null, settingsCopy('avatarZoom', 'Zoom')),
        React.createElement('input', {
          type: 'range',
          min: 1,
          max: 4,
          step: 0.05,
          value: crop.zoom,
          disabled: busy || imageSize === null,
          'aria-label': settingsCopy('avatarZoom', 'Zoom'),
          'aria-valuetext': `${Math.round(crop.zoom * 100)}%`,
          onChange(event: React.ChangeEvent<HTMLInputElement>) {
            setCropWithinImage({ ...crop, zoom: Number(event.currentTarget.value) })
          },
        }),
        React.createElement('span', { className: 'dsh-claude-style-plus-avatar-crop-zoom-value' }, `${Math.round(crop.zoom * 100)}%`),
      ),
      React.createElement('div', { className: 'dsh-claude-style-plus-avatar-crop-actions' },
        React.createElement('button', {
          type: 'button', className: 'dsh-claude-style-plus-avatar-action dsh-claude-style-plus-avatar-crop-cancel', disabled: busy,
          onClick: cancelCrop,
        }, settingsCopy('avatarCropCancel', 'Cancel')),
        React.createElement('button', {
          type: 'button', className: 'dsh-claude-style-plus-avatar-action dsh-claude-style-plus-avatar-crop-save', disabled: busy || imageSize === null,
          onClick: saveCrop,
        }, busy ? settingsCopy('avatarProcessing', 'Processing…') : settingsCopy('avatarCropSave', 'Use photo')),
      ),
    ),
  )

  return React.createElement('div', { className: 'dsh-claude-style-plus-avatar-setting' },
    React.createElement('div', { className: 'dsh-claude-style-plus-avatar-setting-preview', 'aria-hidden': 'true' },
      avatar ? React.createElement('img', { src: avatar, alt: '', draggable: false }) : placeholder),
    React.createElement('div', { className: 'dsh-claude-style-plus-avatar-setting-actions' },
      React.createElement('button', {
        type: 'button', className: 'dsh-claude-style-plus-avatar-action', disabled: busy,
        onClick() { fileInput.current?.click() },
      }, settingsCopy(avatar ? 'avatarChange' : 'avatarChoose', avatar ? 'Change photo' : 'Upload photo')),
      avatar ? React.createElement('button', {
        type: 'button', className: 'dsh-claude-style-plus-avatar-action dsh-claude-style-plus-avatar-remove', disabled: busy,
        onClick: removeAvatar,
      }, settingsCopy('avatarRemove', 'Remove')) : null,
      React.createElement('input', {
        ref: fileInput, className: 'dsh-claude-style-plus-avatar-file', type: 'file',
        accept: 'image/png,image/jpeg,image/webp', hidden: true,
        'aria-label': settingsCopy('avatarChoose', 'Upload photo'),
        onChange: chooseFile,
      }),
    ),
    cropPanel,
    feedback ? React.createElement('div', {
      className: 'dsh-claude-style-plus-avatar-feedback', role: feedback.error ? 'alert' : 'status', 'aria-live': 'polite',
    }, feedback.text) : null,
  )
}
