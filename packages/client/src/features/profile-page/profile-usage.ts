import * as React from 'react'
import { copyLabel } from '../../core/i18n'
import { formatHomeCount } from '../home/data'
import { formatCompactTokens } from '../../shared/format'
import type { WorkspaceUsageReport } from '@dsh-claude-style-plus/contracts/usage'
import { profileCardWindow, profileSkillBarWidths, rankProfileSkills, rankProfileWorkspaces } from './profile-analytics'

type WorkspaceRows = NonNullable<ReturnType<typeof rankProfileWorkspaces>>

export interface ProfileUsageProps {
  report: WorkspaceUsageReport | null
  range: string
  startDate: string | null
  endDate: string
  loading: boolean
}

/** Range-aware Workspace and Skill breakdowns from the same Host Session-log report. */
export function ProfileUsage({ report, range, startDate, endDate, loading }: ProfileUsageProps) {
  const [expandedId, setExpandedId] = React.useState<string | null>(null)
  const [showAllWorkspaces, setShowAllWorkspaces] = React.useState(false)
  const [showAllSkills, setShowAllSkills] = React.useState(false)
  const workspaces = rankProfileWorkspaces(report?.workspaces ?? null, range, startDate, endDate)
  const skills = rankProfileSkills(report?.workspaces ?? null, range, startDate, endDate)

  if (report === null && loading) {
    return React.createElement('div', { className: 'dsh-claude-style-plus-profile-usage-loading', role: 'status', 'aria-busy': 'true' },
      React.createElement('div', { className: 'dsh-claude-style-plus-profile-usage-skeleton' }),
      React.createElement('div', { className: 'dsh-claude-style-plus-profile-usage-skeleton' }),
      React.createElement('span', null, copyLabel('profileWorkspaceLoading', 'Loading Workspace and Skill activity…')),
    )
  }

  if (report === null) {
    return React.createElement('section', { className: 'dsh-claude-style-plus-profile-usage-section' },
      React.createElement('h2', { className: 'dsh-claude-style-plus-profile-section-title' }, copyLabel('profileWorkspacesTitle', 'Workspace activity')),
      React.createElement('p', { className: 'dsh-claude-style-plus-profile-usage-empty', role: 'note' },
        copyLabel('profileWorkspaceUnavailable', 'Workspace and Skill details are unavailable from the Session store.'),
      ),
    )
  }

  const rows = workspaces ?? []
  const totalTokens = rows.reduce((sum, row) => sum + row.tokens, 0)
  const workspaceWindow = profileCardWindow(rows, showAllWorkspaces)
  const membershipUnavailable = report.workspaceRegistryUnavailable === true
  const workspaceContent = rows.length === 0
    ? React.createElement('p', { className: 'dsh-claude-style-plus-profile-usage-empty', role: 'status' }, copyLabel('profileWorkspaceEmpty', 'No Workspace activity in this range.'))
    : React.createElement('div', { className: 'dsh-claude-style-plus-profile-workspace-list', id: 'dsh-claude-style-plus-profile-workspace-grid' },
      workspaceWindow.visible.map((row, index) => workspaceRow(row, index, expandedId, setExpandedId, totalTokens, membershipUnavailable)),
    )
  const skillWindow = profileCardWindow(skills ?? [], showAllSkills)
  const peakSkillCalls = (skills ?? []).reduce((peak, skill) => Math.max(peak, skill.explicitCalls + skill.modelCalls), 0)
  const skillContent = skills === null || skills.length === 0
    ? React.createElement('p', { className: 'dsh-claude-style-plus-profile-usage-empty', role: 'status' }, copyLabel('profileSkillsEmpty', 'No Skill calls in this range.'))
    : React.createElement('div', { className: 'dsh-claude-style-plus-profile-skill-chart' },
      React.createElement('div', { className: 'dsh-claude-style-plus-profile-skill-legend', role: 'group', 'aria-label': copyLabel('profileSkillLegend', 'Skill call types') },
        React.createElement('span', { className: 'dsh-claude-style-plus-profile-skill-legend-item' },
          React.createElement('span', { className: 'dsh-claude-style-plus-profile-skill-swatch dsh-claude-style-plus-profile-skill-swatch-explicit', 'aria-hidden': 'true' }),
          copyLabel('profileSkillLegendExplicit', 'Explicit invocations'),
        ),
        React.createElement('span', { className: 'dsh-claude-style-plus-profile-skill-legend-item' },
          React.createElement('span', { className: 'dsh-claude-style-plus-profile-skill-swatch dsh-claude-style-plus-profile-swatch-model', 'aria-hidden': 'true' }),
          copyLabel('profileSkillLegendModel', 'Model tool calls'),
        ),
      ),
      React.createElement('div', { className: 'dsh-claude-style-plus-profile-skill-list', id: 'dsh-claude-style-plus-profile-skill-chart' },
        skillWindow.visible.map((skill, index) => skillChartRow(skill, index, peakSkillCalls)),
      ),
    )

  return React.createElement('div', { className: 'dsh-claude-style-plus-profile-usage' },
    React.createElement('section', { className: 'dsh-claude-style-plus-profile-usage-section' },
      React.createElement('header', { className: 'dsh-claude-style-plus-profile-section-head' },
        React.createElement('div', null,
          React.createElement('h2', { className: 'dsh-claude-style-plus-profile-section-title' }, copyLabel('profileWorkspacesTitle', 'Workspace activity')),
          React.createElement('p', { className: 'dsh-claude-style-plus-profile-section-hint' }, copyLabel('profileWorkspacesHint', 'Token use and Skills grouped by current Workspace membership.')),
        ),
        React.createElement('div', { className: 'dsh-claude-style-plus-profile-section-actions' },
          React.createElement('span', { className: 'dsh-claude-style-plus-profile-workspace-total' }, formatCompactTokens(totalTokens)),
          rows.length > 6 ? React.createElement('button', {
            type: 'button',
            className: 'dsh-claude-style-plus-profile-section-more',
            'aria-expanded': showAllWorkspaces,
            'data-expanded': showAllWorkspaces ? '' : undefined,
            'aria-controls': 'dsh-claude-style-plus-profile-workspace-grid',
            onClick() {
              if (showAllWorkspaces) setExpandedId(null)
              setShowAllWorkspaces(value => !value)
            },
          }, showAllWorkspaces
            ? copyLabel('profileWorkspacesLess', 'Show fewer Workspaces')
            : copyLabel('profileWorkspacesMore', 'View {count} more Workspaces', { count: formatHomeCount(workspaceWindow.remaining) })) : null,
        ),
      ),
      React.createElement('p', { className: 'dsh-claude-style-plus-profile-source-note', role: 'note' },
        copyLabel('profileWorkspaceSource', 'Workspace rows use readable Session logs; ledger-only totals are not assigned to a Workspace.'),
      ),
      membershipUnavailable ? React.createElement('p', { className: 'dsh-claude-style-plus-profile-source-note', role: 'note' },
        copyLabel('profileWorkspaceRegistryUnavailable', 'Current Workspace membership could not be read; session data is shown with unknown attribution.'),
      ) : null,
      report.failed > 0 ? React.createElement('p', { className: 'dsh-claude-style-plus-profile-source-note', role: 'note' },
        copyLabel('profileWorkspacePartial', '{count} Session logs could not be read; these breakdowns may be partial.', { count: formatHomeCount(report.failed) }),
      ) : null,
      loading ? React.createElement('p', { className: 'dsh-claude-style-plus-profile-usage-updating', role: 'status' }, copyLabel('profileWorkspaceUpdating', 'Refreshing Session history…')) : null,
      workspaceContent,
      React.createElement('div', { className: 'dsh-claude-style-plus-profile-skill-subsection' },
        React.createElement('header', { className: 'dsh-claude-style-plus-profile-section-head' },
          React.createElement('div', null,
            React.createElement('h3', { className: 'dsh-claude-style-plus-profile-section-title' }, copyLabel('profileSkillsTitle', 'Skill activity')),
            React.createElement('p', { className: 'dsh-claude-style-plus-profile-section-hint' }, copyLabel('profileSkillsHint', 'Explicit Skill invocations and model skill-tool calls are counted separately.')),
          ),
          React.createElement('div', { className: 'dsh-claude-style-plus-profile-section-actions' },
            skills && skills.length > 0 ? React.createElement('span', { className: 'dsh-claude-style-plus-profile-workspace-total' }, formatHomeCount(skills.reduce((sum, skill) => sum + skill.explicitCalls + skill.modelCalls, 0))) : null,
            skills && skills.length > 6 ? React.createElement('button', {
              type: 'button',
              className: 'dsh-claude-style-plus-profile-section-more',
              'aria-expanded': showAllSkills,
              'data-expanded': showAllSkills ? '' : undefined,
              'aria-controls': 'dsh-claude-style-plus-profile-skill-chart',
              onClick() { setShowAllSkills(value => !value) },
            }, showAllSkills
              ? copyLabel('profileSkillsLess', 'Show fewer Skills')
              : copyLabel('profileSkillsMore', 'View {count} more Skills', { count: formatHomeCount(skillWindow.remaining) })) : null,
          ),
        ),
        skillContent,
      ),
    ),
  )
}

function workspaceRow(
  row: WorkspaceRows[number],
  index: number,
  expandedId: string | null,
  setExpandedId: React.Dispatch<React.SetStateAction<string | null>>,
  totalTokens: number,
  membershipUnavailable: boolean,
) {
  const key = row.workspaceId ?? '__unassigned__'
  const expanded = expandedId === key
  const title = row.workspaceId === null
    ? copyLabel(membershipUnavailable ? 'profileWorkspaceUnknown' : 'profileUnassignedWorkspace', membershipUnavailable ? 'Workspace membership unavailable' : 'Unassigned sessions')
    : row.title || row.path || copyLabel('profileUnassignedWorkspace', 'Unassigned sessions')
  const share = totalTokens > 0 ? Math.round(row.tokens / totalTokens * 1000) / 10 : 0
  const detailsId = `dsh-claude-style-plus-profile-workspace-details-${index}`
  const topModels = row.models.slice(0, 3)

  return React.createElement('article', { key, className: 'dsh-claude-style-plus-profile-workspace-row', 'data-expanded': expanded ? '' : undefined },
    React.createElement('button', {
      type: 'button',
      className: 'dsh-claude-style-plus-profile-workspace-trigger',
      'aria-expanded': expanded,
      'aria-controls': detailsId,
      onClick() { setExpandedId(current => current === key ? null : key) },
    },
    React.createElement('span', { className: 'dsh-claude-style-plus-profile-workspace-main' },
      React.createElement('span', { className: 'dsh-claude-style-plus-profile-workspace-title', title }, title),
      row.path && row.title ? React.createElement('span', { className: 'dsh-claude-style-plus-profile-workspace-path', title: row.path }, row.path) : null,
      React.createElement('span', { className: 'dsh-claude-style-plus-profile-workspace-meta' },
        copyLabel('profileWorkspaceMeta', '{sessions} active sessions · {days} days', { sessions: formatHomeCount(row.sessions), days: formatHomeCount(row.activeDays) }),
      ),
    ),
    React.createElement('span', { className: 'dsh-claude-style-plus-profile-workspace-meter', role: 'progressbar', 'aria-label': `${title}: ${share}%`, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': share },
      React.createElement('span', { style: { width: `${share}%` } }),
    ),
    React.createElement('span', { className: 'dsh-claude-style-plus-profile-workspace-tokens' }, formatCompactTokens(row.tokens)),
    React.createElement('span', { className: 'dsh-claude-style-plus-profile-workspace-chevron', 'aria-hidden': 'true' }, expanded ? '−' : '+'),
    ),
    expanded ? React.createElement('div', { className: 'dsh-claude-style-plus-profile-workspace-details', id: detailsId },
      React.createElement('dl', { className: 'dsh-claude-style-plus-profile-workspace-buckets' },
        [
          ['input', copyLabel('profileTokenInput', 'Input'), row.input],
          ['output', copyLabel('profileTokenOutput', 'Output'), row.output],
          ['cacheRead', copyLabel('profileTokenCacheRead', 'Cache read'), row.cacheRead],
          ['cacheWrite', copyLabel('profileTokenCacheWrite', 'Cache write'), row.cacheWrite],
        ].map(([id, label, value]) => React.createElement('div', { key: String(id), className: 'dsh-claude-style-plus-profile-workspace-bucket' },
          React.createElement('dt', null, String(label)),
          React.createElement('dd', null, formatCompactTokens(Number(value) || 0)),
        )),
      ),
      React.createElement('div', { className: 'dsh-claude-style-plus-profile-workspace-details-grid' },
        React.createElement('div', { className: 'dsh-claude-style-plus-profile-workspace-detail-group' },
          React.createElement('h3', null, copyLabel('profileWorkspaceModels', 'Top models')),
          topModels.length === 0 ? React.createElement('p', null, copyLabel('profileModelsEmpty', 'No model usage in this range.')) : topModels.map(model =>
            React.createElement('div', { key: model.id, className: 'dsh-claude-style-plus-profile-workspace-detail-line' },
              React.createElement('span', { title: model.id }, model.id),
              React.createElement('span', null, formatCompactTokens(model.tokens)),
            ),
          ),
        ),
        React.createElement('div', { className: 'dsh-claude-style-plus-profile-workspace-detail-group' },
          React.createElement('h3', null, copyLabel('profileWorkspaceSkills', 'Skills')),
          row.skills.length === 0 ? React.createElement('p', null, copyLabel('profileSkillsEmpty', 'No Skill calls in this range.')) : row.skills.map(skill =>
            React.createElement('div', { key: skill.name, className: 'dsh-claude-style-plus-profile-workspace-detail-line' },
              React.createElement('span', { title: skill.name }, skill.name),
              React.createElement('span', null, copyLabel('profileSkillCounts', '{explicit} explicit · {model} tool calls', { explicit: formatHomeCount(skill.explicitCalls), model: formatHomeCount(skill.modelCalls) })),
            ),
          ),
        ),
      ),
    ) : null,
  )
}

function skillChartRow(
  skill: NonNullable<ReturnType<typeof rankProfileSkills>>[number],
  index: number,
  peakCalls: number,
) {
  const total = skill.explicitCalls + skill.modelCalls
  const widths = profileSkillBarWidths(skill.explicitCalls, skill.modelCalls, peakCalls)
  const ariaLabel = copyLabel('profileSkillChartAria', '{name}: {explicit} explicit calls and {model} model tool calls', {
    name: skill.name,
    explicit: formatHomeCount(skill.explicitCalls),
    model: formatHomeCount(skill.modelCalls),
  })
  return React.createElement('article', { key: skill.name, className: 'dsh-claude-style-plus-profile-skill-row' },
    React.createElement('div', { className: 'dsh-claude-style-plus-profile-skill-heading' },
      React.createElement('span', { className: 'dsh-claude-style-plus-profile-skill-rank', 'aria-hidden': 'true' }, String(index + 1).padStart(2, '0')),
      React.createElement('strong', { className: 'dsh-claude-style-plus-profile-skill-name', title: skill.name }, skill.name),
      React.createElement('span', { className: 'dsh-claude-style-plus-profile-skill-total' }, copyLabel('profileSkillTotalCalls', '{count} calls', { count: formatHomeCount(total) })),
    ),
    React.createElement('div', { className: 'dsh-claude-style-plus-profile-skill-chart-track', role: 'img', 'aria-label': ariaLabel },
      React.createElement('span', { className: 'dsh-claude-style-plus-profile-skill-chart-segment dsh-claude-style-plus-profile-skill-chart-explicit', style: { width: `${widths.explicitPercent}%` } }),
      React.createElement('span', { className: 'dsh-claude-style-plus-profile-skill-chart-segment dsh-claude-style-plus-profile-skill-chart-model', style: { width: `${widths.modelPercent}%` } }),
    ),
    React.createElement('div', { className: 'dsh-claude-style-plus-profile-skill-breakdown' },
      React.createElement('span', { className: 'dsh-claude-style-plus-profile-skill-count dsh-claude-style-plus-profile-skill-count-explicit' },
        React.createElement('span', { className: 'dsh-claude-style-plus-profile-skill-swatch', 'aria-hidden': 'true' }),
        copyLabel('profileSkillExplicit', 'Explicit {count}', { count: formatHomeCount(skill.explicitCalls) }),
      ),
      React.createElement('span', { className: 'dsh-claude-style-plus-profile-skill-count dsh-claude-style-plus-profile-skill-count-model' },
        React.createElement('span', { className: 'dsh-claude-style-plus-profile-skill-swatch', 'aria-hidden': 'true' }),
        copyLabel('profileSkillModel', 'Model tool calls {count}', { count: formatHomeCount(skill.modelCalls) }),
      ),
      React.createElement('span', null, copyLabel('profileSkillSessions', '{count} sessions', { count: formatHomeCount(skill.sessions) })),
      React.createElement('span', null, copyLabel('profileSkillWorkspaces', '{count} Workspaces', { count: formatHomeCount(skill.workspaces) })),
    ),
  )
}
