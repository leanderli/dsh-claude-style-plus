import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const root = process.cwd()
const accountPath = path.join(root, 'packages/client/src/features/account/account-footer.ts')
const profilePath = path.join(root, 'packages/client/src/features/profile-page/profile-page.ts')
const profileStylePath = path.join(root, 'packages/client/src/features/profile-page/profile-page.css')

test('opening the activity page closes the account menu before mounting its overlay', () => {
  const source = readFileSync(accountPath, 'utf8')
  const openHandler = source.match(/openProfile\(trigger: HTMLElement\) \{([\s\S]*?)\n\s*\}/)?.[1] ?? ''
  assert.notEqual(openHandler, '', 'the account username row should have a Profile open path')
  assert.ok(openHandler.indexOf('closeSurface()') !== -1, 'opening Profile must close the current account surface')
  assert.ok(openHandler.indexOf('closeSurface()') < openHandler.indexOf('ui.profile.open('), 'close the menu before mounting the page')
  assert.match(openHandler, /hostMenu\.trigger\(\).*accountBtn/s, 'closing Profile should focus the actual footer trigger')
})

test('top heatmap cells place their hover tooltip below the scroll edge', () => {
  assert.equal(existsSync(profilePath), true, 'the real activity page source should exist')
  assert.equal(existsSync(profileStylePath), true, 'the activity page stylesheet should exist')
  const page = readFileSync(profilePath, 'utf8')
  const css = readFileSync(profileStylePath, 'utf8')
  assert.match(page, /'data-row': index % 7/)
  const topRows = css.slice(css.indexOf('[data-row="0"]'), css.indexOf('}', css.indexOf('[data-row="0"]')))
  assert.match(topRows, /data-row="1"/)
  assert.match(topRows, /top:\s*calc\(100% \+ 6px\)/)
  assert.match(topRows, /bottom:\s*auto/)
})

test('the Fake account-hold page and its locale preference are removed', () => {
  const banPage = path.join(root, 'packages/client/src/features/ban-screen/ban-screen.ts')
  assert.equal(existsSync(banPage), false, 'the Fake account-hold feature must not ship in Plus')
  const constants = readFileSync(path.join(root, 'packages/client/src/constants.ts'), 'utf8')
  const general = readFileSync(path.join(root, 'packages/client/src/features/settings/settings-tab-general.ts'), 'utf8')
  assert.doesNotMatch(constants, /BAN_LOCALE|banLocale/)
  assert.doesNotMatch(general, /banLocale|Account-hold easter egg language/)
})

test('custom avatar crop is reachable from General settings', () => {
  const generalPath = path.join(root, 'packages/client/src/features/settings/settings-tab-general.ts')
  const avatarPath = path.join(root, 'packages/client/src/features/settings/avatar-setting.ts')
  const avatarStylePath = path.join(root, 'packages/client/src/features/settings/avatar-setting.css')
  assert.equal(existsSync(avatarPath), true, 'the crop-and-upload setting should exist')
  assert.equal(existsSync(avatarStylePath), true, 'the avatar setting stylesheet should exist')
  assert.match(readFileSync(generalPath, 'utf8'), /CustomAvatarSetting/)
  assert.match(readFileSync(avatarPath, 'utf8'), /AVATAR_CROP_VIEWPORT/)
})

test('Profile page consumes Host Workspace and global Skill breakdowns', () => {
  const page = readFileSync(profilePath, 'utf8')
  assert.match(page, /ProfileUsage/)
  assert.match(page, /workspaceUsage/)
})

test('Token cards precede Workspace cards and both sections cap their default grid at six', () => {
  const modelPath = path.join(root, 'packages/client/src/features/profile-page/profile-models.ts')
  const usagePath = path.join(root, 'packages/client/src/features/profile-page/profile-usage.ts')
  const usageStylePath = path.join(root, 'packages/client/src/features/profile-page/profile-usage.css')
  const modelSource = readFileSync(modelPath, 'utf8')
  const usageSource = readFileSync(usagePath, 'utf8')
  const modelStyle = readFileSync(profileStylePath, 'utf8')
  const usageStyle = readFileSync(usageStylePath, 'utf8')
  const page = readFileSync(profilePath, 'utf8')
  assert.ok(page.indexOf('React.createElement(ProfileModels') < page.indexOf('React.createElement(ProfileUsage'), 'Token/model block must appear above Workspace data')
  assert.match(modelSource, /profileCardWindow/)
  assert.match(usageSource, /profileCardWindow/)
  assert.match(modelSource, /profile-section-more/)
  assert.match(usageSource, /profile-section-more/)
  assert.match(usageSource, /profileSkillBarWidths/)
  assert.match(usageSource, /profile-skill-chart-track/)
  assert.match(modelStyle, /profile-model-list\s*\{[^}]*grid-template-columns:\s*repeat\(3,/s)
  assert.match(usageStyle, /profile-workspace-list[^{}]*\{[^}]*grid-template-columns:\s*repeat\(3,/s)
  assert.match(usageStyle, /profile-skill-chart-explicit/)
  assert.match(usageStyle, /profile-skill-chart-model/)
})

test('sidebar Search is a persistent New Session-style icon row with no hover swap or shortcut chips', () => {
  const searchSource = readFileSync(path.join(root, 'packages/client/src/features/search/search.ts'), 'utf8')
  const searchCss = readFileSync(path.join(root, 'packages/client/src/features/search/search.css'), 'utf8')
  assert.match(searchSource, /SIDEBAR_NEW_SESSION_SELECTOR/)
  assert.match(searchSource, /insertBefore\(trigger,\s*newSession\.nextSibling\)/)
  assert.match(searchSource, /searchButtonLabel/)
  assert.doesNotMatch(searchSource, /syncTriggerKeys|triggerKeys/)
  assert.doesNotMatch(searchSource, /data-dsh-claude-style-plus-search-row/)
  assert.doesNotMatch(searchCss, /\[data-slot="sidebar"\]:hover[^\n]*search-row/)
  assert.doesNotMatch(searchCss, /search-row.*opacity/s)
  assert.match(searchCss, /\.dsh-claude-style-plus-search-trigger\s*\{[^}]*opacity:\s*1/s)
})
