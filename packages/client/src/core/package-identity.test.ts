import { expect, test } from 'vitest'
import { ROUTE_PREFIX } from '@dsh-claude-style-plus/contracts/routes'
import { PACKAGE_NAME, SETTINGS_ENTRY_FALLBACK, STYLE_ID } from '../constants'
import * as constants from '../constants'

test('the fork has isolated package, loader, settings, stylesheet and route identities', () => {
  const localIds = constants as unknown as { SETTINGS_SECTION_ID?: string, HOME_USAGE_SLOT_ID?: string }
  expect(PACKAGE_NAME).toBe('dsh-claude-style-plus')
  expect(SETTINGS_ENTRY_FALLBACK).toBe('ui-skin-claude-style-plus')
  expect(localIds.SETTINGS_SECTION_ID).toBe('claude-style-plus')
  expect(localIds.HOME_USAGE_SLOT_ID).toBe('claude-style-plus-usage')
  expect(STYLE_ID).toBe('dsh-claude-style-plus-style')
  expect(ROUTE_PREFIX).toBe('/dsh-claude-style-plus')
})
