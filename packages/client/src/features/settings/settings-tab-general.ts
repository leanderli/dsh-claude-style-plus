import * as React from 'react'
import { AUTO_POPOVER_ACCOUNT, AUTO_POPOVER_ALL, AUTO_POPOVER_OFF, MOTION_FULL, MOTION_REDUCED, MOTION_SYSTEM, USERNAME_MAX } from '../../constants'
import { settingsCopy } from '../../core/i18n'
import type { SettingsTab, SettingsView } from './settings-controls'
import { CustomAvatarSetting } from './avatar-setting'

/**
 * The settings page's General tab: the profile avatar, username, animation
 * choice and hover-open popovers.
 *
 * Each tab is a `{ id, label, rows(view) }` record: `rows` runs on every
 * render of the page (packages/client/src/features/settings/settings.ts) with the page's
 * view — the preferences, the write path, the controls and the username
 * field's state.
 */
export function createSettingsGeneralTab(): SettingsTab {
  function rows(view: SettingsView) {
    const prefs = view.prefs
    const write = view.write
    const controls = view.controls
    const motionOptions = [
      { value: MOTION_SYSTEM, label: settingsCopy('motionSystem', 'Follow the system') },
      { value: MOTION_REDUCED, label: settingsCopy('motionReduced', 'Reduced') },
      { value: MOTION_FULL, label: settingsCopy('motionFull', 'Always') },
    ]
    const autoPopoverOptions = [
      { value: AUTO_POPOVER_OFF, label: settingsCopy('autoPopoverOff', 'Off') },
      { value: AUTO_POPOVER_ACCOUNT, label: settingsCopy('autoPopoverAccount', 'Account only') },
      { value: AUTO_POPOVER_ALL, label: settingsCopy('autoPopoverAll', 'All') },
    ]
    const username = view.username
    return [
      {
        rank: 5,
        node: controls.row(
          'avatar',
          settingsCopy('avatarTitle', 'Profile photo'),
          settingsCopy('avatarDesc', 'Shown in the lower-left account row. Drag and zoom to choose a square crop stored in this DSH web profile.'),
          React.createElement(CustomAvatarSetting),
          true,
        ),
      },
      {
        rank: 10,
        node: controls.row(
          'username',
          settingsCopy('usernameTitle', 'Username'),
          settingsCopy('usernameDesc', 'The name shown in the new-conversation greeting and the account row. Leave empty to use the signed-in account name, then the HDSL launcher name, then the local system user.'),
          React.createElement('input', {
            type: 'text',
            className: 'dsh-claude-style-plus-settings-input',
            value: username.value,
            maxLength: USERNAME_MAX,
            placeholder: settingsCopy('usernamePlaceholder', 'Auto-detect account or host user'),
            spellCheck: false,
            autoComplete: 'off',
            onChange: username.onChange,
            onBlur: username.onBlur,
            onKeyDown: username.onKeyDown,
          }),
        ),
      },
      {
        rank: 20,
        node: controls.row(
          'motion',
          settingsCopy('motionTitle', 'Animation'),
          settingsCopy('motionDesc', 'Follow the system keeps the system\'s animation setting in charge; Reduced holds animations on their still frame; Always plays them. The background-work ring turns in every setting.'),
          controls.segment(motionOptions, prefs.motion, value => { write({ motion: value }) }),
        ),
      },
      {
        rank: 30,
        node: controls.row(
          'autoPopover',
          settingsCopy('autoPopoverTitle', 'Open popovers on hover'),
          settingsCopy('autoPopoverDesc', 'Which popovers open on hover. "Account only" keeps it to the sidebar account popover; "All" adds the permission, model, session-stats and home-page pickers. Off leaves every popover click-to-open.'),
          controls.segment(autoPopoverOptions, prefs.autoPopover, value => { write({ autoPopover: value }) }),
        ),
      },
    ]
  }
  return { id: 'general', label: () => settingsCopy('tabGeneral', 'General'), rows }
}
