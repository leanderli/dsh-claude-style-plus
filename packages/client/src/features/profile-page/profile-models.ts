import * as React from 'react'
import { copyLabel } from '../../core/i18n'
import { formatHomeCount } from '../home/data'
import { profileCardWindow } from './profile-analytics'
import type { ProfileModelRow } from './profile-analytics'
import { formatCompactTokens } from '../../shared/format'

export interface ProfileModelsProps {
  rows: readonly ProfileModelRow[] | null
  loading: boolean
  range: string
}

/** Ranked model usage, with bucket detail only when the source carries it. */
export function ProfileModels({ rows, loading, range }: ProfileModelsProps) {
  const [expanded, setExpanded] = React.useState(false)
  const list = rows ?? []
  const total = list.reduce((sum, row) => sum + Math.max(0, Number(row.tokens) || 0), 0)
  const cardWindow = profileCardWindow(list, expanded)

  return React.createElement('section', { className: 'dsh-claude-style-plus-profile-model-section' },
    React.createElement('header', { className: 'dsh-claude-style-plus-profile-section-head' },
      React.createElement('div', null,
        React.createElement('h2', { className: 'dsh-claude-style-plus-profile-section-title' }, copyLabel('profileModelsTitle', 'Model usage')),
        React.createElement('p', { className: 'dsh-claude-style-plus-profile-section-hint' },
          range === 'all'
            ? copyLabel('profileModelsAllHint', 'Lifetime ranking; input, output, and cache buckets are shown when available.')
            : copyLabel('profileModelsRangeHint', 'Ranked in this range; only total tokens are available in daily model records.'),
        ),
      ),
      React.createElement('div', { className: 'dsh-claude-style-plus-profile-section-actions' },
        total > 0 ? React.createElement('span', { className: 'dsh-claude-style-plus-profile-model-total' }, formatCompactTokens(total)) : null,
        list.length > 6 ? React.createElement('button', {
          type: 'button',
          className: 'dsh-claude-style-plus-profile-section-more',
          'aria-expanded': expanded,
          'data-expanded': expanded ? '' : undefined,
          'aria-controls': 'dsh-claude-style-plus-profile-model-grid',
          onClick() { setExpanded(value => !value) },
        }, expanded
          ? copyLabel('profileModelsLess', 'Show fewer models')
          : copyLabel('profileModelsMore', 'Show {count} more models', { count: formatHomeCount(cardWindow.remaining) })) : null,
      ),
    ),
    loading && rows === null
      ? React.createElement('div', { className: 'dsh-claude-style-plus-profile-model-empty', role: 'status', 'aria-busy': 'true' }, copyLabel('profileLoading', 'Loading usage…'))
      : list.length === 0
        ? React.createElement('div', { className: 'dsh-claude-style-plus-profile-model-empty', role: 'status' }, copyLabel('profileModelsEmpty', 'No model usage in this range.'))
        : React.createElement('div', { className: 'dsh-claude-style-plus-profile-model-list', id: 'dsh-claude-style-plus-profile-model-grid' },
          cardWindow.visible.map((model, index) => {
            const splitAvailable = model.input !== undefined || model.output !== undefined
              || model.cacheRead !== undefined || model.cacheWrite !== undefined
            const share = total > 0 ? Math.round((model.tokens / total) * 1000) / 10 : 0
            return React.createElement('article', { key: model.id, className: 'dsh-claude-style-plus-profile-model' },
              React.createElement('div', { className: 'dsh-claude-style-plus-profile-model-heading' },
                React.createElement('span', { className: 'dsh-claude-style-plus-profile-model-rank', 'aria-hidden': 'true' }, String(index + 1).padStart(2, '0')),
                React.createElement('span', { className: 'dsh-claude-style-plus-profile-model-name', title: model.id }, model.id),
                model.sessions === undefined ? null : React.createElement('span', { className: 'dsh-claude-style-plus-profile-model-sessions' },
                  copyLabel('profileModelSessions', '{count} sessions', { count: formatHomeCount(model.sessions) }),
                ),
                React.createElement('span', { className: 'dsh-claude-style-plus-profile-model-tokens' }, formatCompactTokens(model.tokens)),
              ),
              splitAvailable
                ? React.createElement('dl', { className: 'dsh-claude-style-plus-profile-model-buckets' },
                  [
                    ['input', copyLabel('profileTokenInput', 'Input'), model.input],
                    ['output', copyLabel('profileTokenOutput', 'Output'), model.output],
                    ['cacheRead', copyLabel('profileTokenCacheRead', 'Cache read'), model.cacheRead],
                    ['cacheWrite', copyLabel('profileTokenCacheWrite', 'Cache write'), model.cacheWrite],
                  ].map(([key, label, value]) => React.createElement('div', { key: String(key), className: 'dsh-claude-style-plus-profile-model-bucket' },
                    React.createElement('dt', null, String(label)),
                    React.createElement('dd', null, formatCompactTokens(Number(value) || 0)),
                  )),
                )
                : React.createElement('p', { className: 'dsh-claude-style-plus-profile-model-unsplit' }, copyLabel('profileModelTotalsOnly', 'This data source only provides model totals.')),
              React.createElement('div', {
                className: 'dsh-claude-style-plus-profile-model-bar',
                role: 'progressbar',
                'aria-label': `${model.id}: ${share}%`,
                'aria-valuemin': 0,
                'aria-valuemax': 100,
                'aria-valuenow': share,
              }, React.createElement('span', { style: { width: `${share}%` } })),
            )
          }),
        ),
  )
}
