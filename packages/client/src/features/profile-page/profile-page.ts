import * as React from 'react'
import { getUsername, onCustomAvatarChanged, refreshCustomAvatar, resolveAvatarUrl } from '../../core/host'
import type { HostContext } from '../../core/host'
import { activeLocale, copyLabel } from '../../core/i18n'
import type { FeatureUi } from '../../core/feature'
import type { CloseReason, ProfilePageHandle } from '../../core/scheduler'
import { formatCompactTokens } from '../../shared/format'
import {
  HOME_RANGES,
  createHomeUsage,
  formatHomeCount,
  homeDayKey,
  homePanelData,
  homeRangeStart,
  homeShortDate,
  homeShortDateFormat,
} from '../home/data'
import { buildProfileHeatmap, moveProfileHeatFocus, rankProfileModels, summarizeProfileActivity, usesProfileSessionSummary } from './profile-analytics'
import { ProfileModels } from './profile-models'
import { ProfileUsage } from './profile-usage'
import manifest from './profile-page.manifest'

type ProfileFeatureUi = FeatureUi<typeof manifest>
const PROFILE_OVERLAY_ID = 'dsh-claude-style-plus-profile'

/** Full-screen activity page, opened by the sidebar account username. */
export function install(ctx: HostContext, ui: ProfileFeatureUi) {
  const usage = createHomeUsage(ctx)
  const openListeners = new Set<() => void>()
  let isOpen = false
  let profileLoadRequested = false
  let restoreFocus: HTMLElement | null = null
  let slotFiber: ReturnType<NonNullable<HostContext['inject']>> | null = null

  function notifyOpenChange() {
    for (const listener of openListeners) listener()
  }

  function subscribeOpen(listener: () => void) {
    openListeners.add(listener)
    return () => { openListeners.delete(listener) }
  }

  function openProfile(trigger?: HTMLElement) {
    if (isOpen) return
    profileLoadRequested = true
    usage.load(true)
    usage.loadList(true)
    restoreFocus = trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null)
    isOpen = true
    notifyOpenChange()
    if (typeof ui.schedule === 'function') ui.schedule()
  }

  function closeProfile() {
    if (!isOpen) return
    isOpen = false
    notifyOpenChange()
    const target = restoreFocus
    restoreFocus = null
    if (target !== null && target.isConnected) requestAnimationFrame(() => {
      if (target.isConnected) target.focus()
    })
    if (typeof ui.schedule === 'function') ui.schedule()
  }

  function ProfileOverlay() {
    const [, bump] = React.useState(0)
    const [visible, setVisible] = React.useState(isOpen)
    const [range, setRange] = React.useState('all')
    const closeRef = React.useRef<HTMLButtonElement | null>(null)
    const heatGridRef = React.useRef<HTMLDivElement | null>(null)
    const [heatFocusIndex, setHeatFocusIndex] = React.useState(0)
    const [avatarFailed, setAvatarFailed] = React.useState(false)

    React.useEffect(() => subscribeOpen(() => {
      setVisible(isOpen)
      bump(value => value + 1)
    }), [])
    React.useEffect(() => usage.subscribe(() => { bump(value => value + 1) }), [])
    React.useEffect(() => onCustomAvatarChanged(() => {
      setAvatarFailed(false)
      bump(value => value + 1)
    }), [])
    React.useEffect(() => {
      if (!visible) return
      let active = true
      void refreshCustomAvatar().then(() => {
        if (active) bump(value => value + 1)
      }).catch(() => {})
      return () => { active = false }
    }, [visible])
    React.useEffect(() => {
      if (visible) closeRef.current?.focus()
    }, [visible])

    if (!visible) return null

    const state = usage.state()
    const listed = usage.list()
    const data = homePanelData(state, listed, range, 0)
    const rangeDays = HOME_RANGES.find(item => item.id === range)?.days ?? 0
    const firstDate = homeRangeStart(rangeDays)
    const firstMs = firstDate === null ? Number.NEGATIVE_INFINITY : new Date(`${firstDate}T00:00:00`).getTime()
    const today = homeDayKey(new Date())
    const endMs = new Date(`${today}T23:59:59.999`).getTime()
    const modelRows = rankProfileModels(range, data.models, data.modelDays, listed?.entries ?? null, firstDate, firstMs, today, endMs)
    const routeDays = state.value !== null && Array.isArray(state.value.days) ? state.value.days : null
    const useRouteDays = routeDays !== null && (routeDays.length > 0 || listed === null)
    const dayRows = useRouteDays ? routeDays : listed?.days ?? routeDays ?? []
    const messagesAvailable = useRouteDays && routeDays.every(day => typeof day.calls === 'number')
    const routeModelDetails = range === 'all'
      ? state.value !== null && Array.isArray(state.value.models) && state.value.models.length > 0
      : data.modelDays !== null && data.modelDays.some(day => Object.keys(day.models ?? {}).length > 0)
    const hasSessionSummary = listed !== null && (listed.days.length > 0 || listed.entries.length > 0)
    const fallback = usesProfileSessionSummary(useRouteDays, routeModelDetails, hasSessionSummary)
    const heatmap = buildProfileHeatmap(dayRows, range, today, messagesAvailable)
    const activity = summarizeProfileActivity(heatmap.cells.filter(cell => cell.inRange), today)
    const firstHeatFocusIndex = heatmap.cells.findIndex(cell => cell.inRange)
    const resolvedHeatFocusIndex = heatmap.cells[heatFocusIndex]?.inRange ? heatFocusIndex : firstHeatFocusIndex
    const dateFormat = homeShortDateFormat()
    const monthFormat = new Intl.DateTimeFormat(activeLocale(), { month: 'short' })
    const waiting = state.loading || state.computing || usage.listLoading()
    const hasError = !data.known && profileLoadRequested && !waiting
    const skeleton = !data.known && !hasError
    const noActivity = data.known && data.tokens === 0 && (data.calls ?? 0) === 0 && (data.sessions ?? 0) === 0

    const stats = [
      ['sessions', copyLabel('homeSessions', 'Sessions'), data.sessions === null ? '—' : formatHomeCount(data.sessions)],
      ['calls', copyLabel('profileResponses', 'Model responses'), data.calls === null ? '—' : formatHomeCount(data.calls)],
      ['tokens', copyLabel('homeTokens', 'Total tokens'), formatCompactTokens(data.tokens)],
      ['days', copyLabel('homeActiveDays', 'Active days'), data.activeDays === null ? '—' : formatHomeCount(data.activeDays)],
      ['peak', copyLabel('profilePeakHour', 'Peak activity hour'), data.peakHour ?? '—'],
      ['model', copyLabel('homeTopModel', 'Favorite model'), data.model ?? '—'],
    ]

    function statCell(key: string, label: string, value: string) {
      return React.createElement('div', {
        key,
        className: 'dsh-claude-style-plus-home-stat',
        'data-stat': key,
        'data-skeleton': skeleton ? '' : undefined,
      },
      React.createElement('span', { className: 'dsh-claude-style-plus-home-stat-label' }, label),
      React.createElement('span', { className: 'dsh-claude-style-plus-home-stat-value', title: skeleton ? undefined : value }, skeleton ? '' : value))
    }

    function renderHeatCell(cell: (typeof heatmap.cells)[number], index: number) {
      const date = homeShortDate(dateFormat, cell.date)
      const tokenText = formatCompactTokens(cell.tokens)
      const responseCount = cell.messages === null ? null : formatHomeCount(cell.messages)
      const tip = !cell.inRange ? undefined : responseCount === null
        ? copyLabel('homeHeatTipTokens', '{date} — {tokens} tokens', { date, tokens: tokenText })
        : copyLabel('profileHeatTip', '{date} — {tokens} tokens · {responses} responses', { date, tokens: tokenText, responses: responseCount })
      const column = Math.floor(index / 7)
      const edge = column < 3 ? 'start' : column >= heatmap.columns - 3 ? 'end' : undefined
      return React.createElement('span', {
        key: cell.date,
        role: 'img',
        tabIndex: cell.inRange && index === resolvedHeatFocusIndex ? 0 : -1,
        'data-profile-heat-index': index,
        'data-row': index % 7,
        className: 'dsh-claude-style-plus-home-heat-cell dsh-claude-style-plus-profile-heat-cell',
        'data-level': cell.level,
        'data-tip': tip,
        'aria-label': tip,
        'data-edge': edge,
        'aria-hidden': tip === undefined ? 'true' : undefined,
        onFocus() { if (cell.inRange) setHeatFocusIndex(index) },
      })
    }

    const monthLabels = heatmap.months.map(month => {
      const [year, monthNumber] = month.date.split('-').map(Number)
      const date = new Date(year, monthNumber - 1, 1)
      return React.createElement('span', {
        key: month.date,
        className: 'dsh-claude-style-plus-profile-heat-month',
        style: { gridColumnStart: month.column + 1 },
      }, monthFormat.format(date))
    })

    const avatarUrl = avatarFailed ? '' : resolveAvatarUrl()
    const userName = getUsername()
    const activityTiles = [
      {
        key: 'peak-day',
        label: copyLabel('profilePeakDay', 'Peak day'),
        value: activity.peakDay === null ? '—' : formatCompactTokens(activity.peakDay.tokens),
        detail: activity.peakDay === null ? '' : homeShortDate(dateFormat, activity.peakDay.date),
      },
      {
        key: 'current-streak',
        label: copyLabel('profileCurrentStreak', 'Current streak'),
        value: formatHomeCount(activity.currentStreak),
        detail: copyLabel('profileDaysSuffix', 'days'),
      },
      {
        key: 'longest-streak',
        label: copyLabel('profileLongestStreak', 'Longest streak'),
        value: formatHomeCount(activity.longestStreak),
        detail: copyLabel('profileDaysSuffix', 'days'),
      },
    ]

    return React.createElement('div', {
      className: 'dsh-claude-style-plus-profile-page',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': 'dsh-claude-style-plus-profile-title',
      'data-dsh-profile-page': '',
      onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          closeProfile()
          return
        }
        if (event.key !== 'Tab') return
        const root = event.currentTarget
        const focusable = Array.from(root.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
        ))
        if (focusable.length === 0) {
          event.preventDefault()
          return
        }
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        const active = document.activeElement
        if (!root.contains(active)) {
          event.preventDefault()
          first.focus()
        } else if (event.shiftKey && active === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && active === last) {
          event.preventDefault()
          first.focus()
        }
      },
    },
    React.createElement('main', { className: 'dsh-claude-style-plus-profile-shell' },
      React.createElement('header', { className: 'dsh-claude-style-plus-profile-header' },
        React.createElement('div', { className: 'dsh-claude-style-plus-profile-identity' },
          React.createElement('div', { className: 'dsh-claude-style-plus-profile-avatar' },
            avatarUrl
              ? React.createElement('img', { src: avatarUrl, alt: '', draggable: false, referrerPolicy: 'no-referrer', onError() { setAvatarFailed(true) } })
              : React.createElement('svg', {
                viewBox: '0 0 24 24', width: 28, height: 28, fill: 'none', stroke: 'currentColor',
                strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true',
              }, React.createElement('circle', { cx: 12, cy: 8, r: 3.4 }), React.createElement('path', { d: 'M5.3 20c.4-3.6 2.9-5.7 6.7-5.7s6.3 2.1 6.7 5.7' })),
          ),
          React.createElement('div', { className: 'dsh-claude-style-plus-profile-identity-copy' },
            React.createElement('h1', { id: 'dsh-claude-style-plus-profile-title' }, userName),
            React.createElement('p', null, copyLabel('profilePageSubtitle', 'Personal activity and Token usage')),
          ),
        ),
        React.createElement('button', {
          ref: closeRef,
          type: 'button',
          className: 'dsh-claude-style-plus-profile-close',
          'aria-label': copyLabel('profileClose', 'Close profile'),
          onClick: closeProfile,
        }, React.createElement('svg', {
          viewBox: '0 0 24 24', width: 18, height: 18, fill: 'none', stroke: 'currentColor',
          strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true',
        }, React.createElement('path', { d: 'M6 6l12 12M18 6 6 18' })),
        ),
      ),
      React.createElement('div', { className: 'dsh-claude-style-plus-profile-range-row' },
        React.createElement('span', { className: 'dsh-claude-style-plus-profile-range-label' }, copyLabel('profileRangeLabel', 'Usage range')),
        React.createElement('div', { className: 'dsh-claude-style-plus-home-ranges', role: 'group', 'aria-label': copyLabel('profileRangeLabel', 'Usage range') },
          HOME_RANGES.map(item => React.createElement('button', {
            key: item.id,
            type: 'button',
            className: 'dsh-claude-style-plus-home-range',
            'data-active': range === item.id ? '' : undefined,
            'aria-pressed': range === item.id,
            onClick() { setRange(item.id) },
          }, copyLabel(item.labelKey, item.fallback))),
        ),
      ),
      fallback ? React.createElement('p', { className: 'dsh-claude-style-plus-profile-source-note', role: 'note' },
        copyLabel('profileFallbackHint', 'Some day and model details come from session summaries and may be less precise.'),
      ) : null,
      hasError ? React.createElement('p', { className: 'dsh-claude-style-plus-profile-error', role: 'alert' }, copyLabel('profileUsageFailed', 'Usage data could not be loaded. Check the DSH session store.')) : null,
      React.createElement('section', { className: 'dsh-claude-style-plus-profile-overview', 'aria-busy': skeleton || state.computing ? 'true' : 'false' },
        React.createElement('div', { className: 'dsh-claude-style-plus-profile-stats dsh-claude-style-plus-home-stats' }, stats.map(item => statCell(item[0], item[1], item[2]))),
        React.createElement('div', { className: 'dsh-claude-style-plus-profile-section-head' },
          React.createElement('div', null,
            React.createElement('h2', { className: 'dsh-claude-style-plus-profile-section-title' }, copyLabel('profileHeatTitle', 'Token activity')),
            React.createElement('p', { className: 'dsh-claude-style-plus-profile-section-hint' },
              range === 'all'
                ? copyLabel('profileHeatYearHint', 'Daily Token usage · last 52 weeks')
                : range === '30d' ? copyLabel('profileHeat30dHint', 'Daily Token usage · last 30 days') : copyLabel('profileHeat7dHint', 'Daily Token usage · last 7 days'),
            ),
          ),
          heatmap.peak > 0 ? React.createElement('span', { className: 'dsh-claude-style-plus-profile-heat-peak' }, formatCompactTokens(heatmap.peak)) : null,
        ),
        React.createElement('div', { className: 'dsh-claude-style-plus-profile-heat-scroll', role: 'group', 'aria-label': copyLabel('profileHeatTitle', 'Token activity') },
          React.createElement('div', { className: 'dsh-claude-style-plus-profile-heat-inner' },
            React.createElement('div', {
              className: 'dsh-claude-style-plus-profile-heat-months',
              style: { gridTemplateColumns: `repeat(${heatmap.columns}, 12px)` },
              'aria-hidden': 'true',
            }, monthLabels),
            React.createElement('div', {
              className: 'dsh-claude-style-plus-home-heat dsh-claude-style-plus-profile-heat-grid',
              'data-skeleton': skeleton ? '' : undefined,
              style: { gridTemplateColumns: `repeat(${heatmap.columns}, 12px)`, gridTemplateRows: 'repeat(7, 12px)' },
              role: 'group',
              'aria-label': copyLabel('profileHeatTitle', 'Token activity'),
              ref: heatGridRef,
              onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
                const key = event.key
                if (key !== 'ArrowLeft' && key !== 'ArrowRight' && key !== 'ArrowUp' && key !== 'ArrowDown') return
                event.preventDefault()
                const target = event.target instanceof HTMLElement ? Number(event.target.getAttribute('data-profile-heat-index')) : Number.NaN
                const current = Number.isInteger(target) ? target : resolvedHeatFocusIndex
                const next = moveProfileHeatFocus(heatmap.cells, current, key)
                setHeatFocusIndex(next)
                const grid = event.currentTarget
                requestAnimationFrame(() => grid.querySelector<HTMLElement>(`[data-profile-heat-index="${next}"]`)?.focus())
              },
            }, heatmap.cells.map(renderHeatCell)),
            noActivity ? React.createElement('p', { className: 'dsh-claude-style-plus-profile-empty', role: 'status' }, copyLabel('profileNoActivity', 'No usage was recorded in this range.')) : null,
          ),
        ),
      ),
      React.createElement('section', { className: 'dsh-claude-style-plus-profile-highlights' },
        React.createElement('h2', { className: 'dsh-claude-style-plus-profile-section-title' }, copyLabel('profileHighlightsTitle', 'Activity highlights')),
        React.createElement('div', { className: 'dsh-claude-style-plus-profile-highlight-grid' }, activityTiles.map(tile =>
          React.createElement('article', { key: tile.key, className: 'dsh-claude-style-plus-profile-highlight' },
            React.createElement('span', { className: 'dsh-claude-style-plus-profile-highlight-label' }, tile.label),
            React.createElement('strong', { className: 'dsh-claude-style-plus-profile-highlight-value' }, tile.value),
            React.createElement('span', { className: 'dsh-claude-style-plus-profile-highlight-detail' }, tile.detail),
          ),
        )),
      ),
      React.createElement(ProfileModels, { rows: modelRows, loading: waiting, range }),
      React.createElement(ProfileUsage, { report: state.value?.workspaceUsage ?? null, range, startDate: firstDate, endDate: today, loading: waiting }),
      React.createElement('p', { className: 'dsh-claude-style-plus-profile-footnote' }, copyLabel('profileDataNote', 'Token totals include input, output, and cache usage recorded by this DSH home.')),
    ),
    )
  }

  function registerOverlay() {
    if (typeof ctx.inject !== 'function') return
    slotFiber = ctx.inject(['slots'], scope => {
      const slots = scope.get('slots')
      if (slots === null || slots === undefined || typeof slots.inject !== 'function' || typeof slots.register !== 'function') return
      scope.effect(() => slots.inject('shell.overlay', () => slots.register({
        name: 'shell.overlay',
        id: PROFILE_OVERLAY_ID,
        order: 1000,
        label: () => copyLabel('profilePageTitle', 'Personal activity'),
      }, ProfileOverlay)), 'dsh-claude-style-plus: personal activity page')
    })
  }

  const handle: ProfilePageHandle = {
    open: openProfile,
    close(reason?: CloseReason) {
      if (reason === 'composer' || reason === 'outside') return
      closeProfile()
    },
    isOpen() { return isOpen },
    onCopyChange() { notifyOpenChange() },
  }
  ui.profile = handle
  registerOverlay()

  return () => {
    closeProfile()
    usage.stop()
    if (slotFiber !== null) slotFiber.dispose()
    openListeners.clear()
    if (ui.profile === handle) delete ui.profile
  }
}
