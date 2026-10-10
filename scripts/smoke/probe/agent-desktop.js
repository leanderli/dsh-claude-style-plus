/**
 * The host-API cases: the sync-fault case drives a session list that throws, and
 * the desktop case walks the 0.1.7 footer — the host's own account row, the menu
 * it portals, the container the skin injects into that menu, and the settings
 * dialog the host's shortcut opens.
 */
(function () {
  var probe = window.__dshSmokeProbe
  var sleep = probe.sleep
  var r = probe.report

  // The account menu is counted by content (its Sign out row): a role=menu
  // portal exists only while its menu is open — ours included — so the row
  // the host itself renders is the stable test.
  function accountMenuOpen() {
    var menus = document.querySelectorAll('body > [role="menu"]')
    for (var mi = 0; mi < menus.length; mi++) {
      var items = menus[mi].querySelectorAll('[role="menuitem"]')
      for (var ii = 0; ii < items.length; ii++) {
        if ((items[ii].textContent || '').trim() === 'Sign out') return true
      }
    }
    return false
  }

  probe.step(async function () {
    await probe.onlyFor(['sync-fault'], async function () {
      // A sync is retired after failing three passes in a row: drive four.
      for (var n = 0; n < 4; n++) { document.body.appendChild(document.createElement('i')); await sleep(80) }
    })
    await probe.onlyFor(['desktop'], async function () {
      // The footer entries are hidden in place from the first pass: nothing in
      // this case has opened the drawer yet, so this read is the state a fresh
      // page shows beside the account row. (The first pass runs on a frame.)
      await sleep(500)
      r.footerEntriesBeforeOpen = Array.prototype.map.call(
        document.querySelectorAll('[class*="footerActions"] [data-slot] > *'),
        function (entry) {
          return {
            hidden: entry.hasAttribute('data-dsh-claude-style-plus-footer-hidden'),
            display: getComputedStyle(entry).display,
          }
        })
      // The first login frame makes the skin read the profile once.
      window.__pushAccountFrame({ status: 'credential-stored', attempt: { phase: 'succeeded', id: 'smoke-1' } })
      await sleep(500)
      r.profileReadsAfterFirst = window.__profileReads
      // The same state again (a reconnect): no second read.
      window.__pushAccountFrame({ status: 'credential-stored', attempt: { phase: 'succeeded', id: 'smoke-1' } })
      await sleep(500)
      r.profileReadsAfterRepeat = window.__profileReads
      // The host's own account row is the entry: visible, and the skin builds
      // neither a trigger nor a popover of its own.
      var hostRow = document.getElementById('host-account')
      r.hostRowDisplay = hostRow ? getComputedStyle(hostRow).display : null
      r.hostRowVisible = !!(hostRow && hostRow.getBoundingClientRect().width > 0)
      r.syntheticBtn = !!document.querySelector('.dsh-claude-style-plus-account-btn')
      var triggerRow = document.querySelector('[class*="footArea"] [class*="triggerRow"]')
      r.triggerRowDisplay = triggerRow ? getComputedStyle(triggerRow).display : null
      r.hostRowText = hostRow ? (hostRow.textContent || '').trim() : null
      r.hostRowWidth = hostRow ? hostRow.getBoundingClientRect().width : null
      r.accountWidthVar = document.body.style.getPropertyValue('--dsh-claude-style-plus-account-width').trim()
      // The hover preference is on in this stand-in: a pointer dwelling on the
      // host's account row opens the host menu, and leaving it dismisses the
      // menu the host had mounted.
      if (hostRow) hostRow.dispatchEvent(new MouseEvent('mouseenter'))
      await sleep(250)
      r.hoverOpenedMenu = accountMenuOpen()
      if (hostRow) hostRow.dispatchEvent(new MouseEvent('mouseleave'))
      await sleep(350)
      r.hoverClosedMenu = !accountMenuOpen()
      // Read through the CSSOM: the sheet's text is minified, and the parsed
      // rules are what the page applies.
      var styleEl = document.getElementById('dsh-claude-style-plus-style')
      var sheetRules = styleEl && styleEl.sheet ? Array.prototype.slice.call(styleEl.sheet.cssRules) : []
      r.menuEntryKeyframes = sheetRules.some(function (rule) { return rule instanceof CSSKeyframesRule && rule.name === 'dsh-claude-style-plus-account-menu-in' })
      r.menuEntryAnimation = sheetRules.some(function (rule) {
        return rule instanceof CSSStyleRule && rule.style.animationName === 'dsh-claude-style-plus-account-menu-in' &&
          rule.style.animationDuration === '0.15s' && rule.style.animationTimingFunction === 'ease'
      })
      // Open the host's own menu: the card mounts with the host's rows, the skin
      // injects ours a frame later, and the host re-places the card a frame after
      // that. The card must stay unpainted until both have happened.
      var frame = function () { return new Promise(function (resolve) { requestAnimationFrame(function () { resolve() }) }) }
      var cardFrames = []
      if (hostRow) hostRow.click()
      for (var cardFrame = 0; cardFrame < 24; cardFrame++) {
        await frame()
        var card = document.querySelector('body > [role="menu"]')
        if (card === null) continue
        var cardRows = card.querySelector('.dsh-claude-style-plus-account-inject')
        cardFrames.push({
          ready: card.hasAttribute('data-dsh-claude-style-plus-account-ready'),
          rows: cardRows !== null && cardRows.childElementCount > 0,
          top: card.style.top,
          painted: getComputedStyle(card).visibility !== 'hidden',
        })
      }
      var revealedAt = -1
      for (var cf = 0; cf < cardFrames.length; cf++) { if (cardFrames[cf].ready) { revealedAt = cf; break } }
      var lastTop = cardFrames.length === 0 ? null : cardFrames[cardFrames.length - 1].top
      r.accountReveal = {
        frames: cardFrames.length,
        revealedAt: revealedAt,
        paintedWhileUnready: cardFrames.some(function (f) { return !f.ready && f.painted }),
        rowsAtReveal: revealedAt !== -1 && cardFrames[revealedAt].rows,
        placedAtReveal: revealedAt !== -1 && cardFrames[revealedAt].top === lastTop,
        mountTop: cardFrames.length === 0 ? null : cardFrames[0].top,
        topAtReveal: revealedAt === -1 ? null : cardFrames[revealedAt].top,
        topAtEnd: lastTop,
      }
      await sleep(400)
      var viewport = document.querySelector('body > [role="menu"] [role="presentation"]')
      var inject = document.querySelector('.dsh-claude-style-plus-account-inject')
      // The marker the stylesheet hangs the skin's card on. It sits on the
      // host's own role=menu card, derived from the list it injected into so a
      // hidden menu portal elsewhere in the page cannot answer for it.
      var accountMenu = viewport ? viewport.closest('[role="menu"]') : null
      r.accountMenuMarked = !!(accountMenu && accountMenu.hasAttribute('data-dsh-claude-style-plus-account-menu'))
      r.menuCardWidth = accountMenu ? accountMenu.getBoundingClientRect().width : null
      r.injectInViewport = !!(viewport && inject && inject.parentElement === viewport)
      r.injectFirst = !!(viewport && viewport.firstElementChild === inject)
      r.injectRows = inject ? Array.prototype.map.call(inject.children, function (c) {
        if (c.querySelector('[data-dsh-claude-style-plus-profile-row]')) return 'header'
        if (c.hasAttribute('data-action-index')) return 'action'
        if (c.hasAttribute('data-embed-index')) return 'embed'
        return 'other'
      }) : null
      var injectName = inject ? inject.querySelector('.dsh-claude-style-plus-account-popover-name') : null
      r.injectName = injectName ? injectName.textContent : null
      var htmlBefore = inject ? inject.innerHTML : null
      // React re-renders the list: the host empties the viewport and puts its own
      // rows back. The skin must re-insert our container, unchanged, first.
      window.__rerenderHostMenu()
      await sleep(400)
      var viewport2 = document.querySelector('body > [role="menu"] [role="presentation"]')
      var inject2 = document.querySelector('.dsh-claude-style-plus-account-inject')
      r.injectHealedFirst = !!(viewport2 && inject2 && viewport2.firstElementChild === inject2)
      r.injectHealedSame = !!(inject2 && inject2.innerHTML === htmlBefore)
      var profileRowLayout = inject2 ? inject2.querySelector('[data-dsh-claude-style-plus-profile-row]') : null
      var profileRowStyle = profileRowLayout ? getComputedStyle(profileRowLayout) : null
      r.profileRowLayout = profileRowStyle ? {
        display: profileRowStyle.display,
        alignItems: profileRowStyle.alignItems,
        width: profileRowStyle.width,
        boxSizing: profileRowStyle.boxSizing,
        marginTop: profileRowStyle.marginTop,
        marginBottom: profileRowStyle.marginBottom,
      } : null
      // The host's keyboard walk reaches our injected button.
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))
      await sleep(80)
      var focused = document.activeElement
      r.focusInInjected = !!(focused && inject2 && inject2.contains(focused) && focused.tagName === 'BUTTON')
      // The account username opens the real Profile overlay. Closing the host
      // menu must happen before the root slot's React component is presented.
      var profileEntry = document.querySelector('.dsh-claude-style-plus-account-inject [data-dsh-claude-style-plus-profile-row]')
      var profileId = 'dsh-claude-style-plus-profile'
      var profileComponent = (window.__slotComponents || {})[profileId]
      r.profileOverlayRegistered = Array.prototype.some.call(window.__slots || [], function (entry) {
        return entry.key === 'shell.overlay' && entry.id === profileId && entry.component === 'function'
      })
      r.profileMenuClosed = false
      r.profileDialogRendered = false
      r.profileTitleHasText = false
      r.profileEscapeCloses = false
      r.profileFocusRestored = false
      if (profileEntry && typeof profileComponent === 'function') {
        profileEntry.click()
        await sleep(80)
        r.profileMenuClosed = !accountMenuOpen() && document.querySelectorAll('.dsh-claude-style-plus-account-inject').length === 0
        var react = window.__react
        var renderProfile = function () {
          var wasRendering = react.rendering
          var oldStates = react.states
          react.rendering = true
          react.states = null
          try { return profileComponent({}) }
          finally { react.rendering = wasRendering; react.states = oldStates }
        }
        var findTreeNode = function (node, match) {
          if (Array.isArray(node)) {
            for (var ni = 0; ni < node.length; ni++) { var found = findTreeNode(node[ni], match); if (found) return found }
            return null
          }
          if (node === null || typeof node !== 'object') return null
          if (match(node)) return node
          return findTreeNode(node.props && node.props.children, match)
        }
        var treeText = function (node) {
          if (typeof node === 'string' || typeof node === 'number') return String(node)
          if (Array.isArray(node)) return node.map(treeText).join('')
          if (node === null || typeof node !== 'object') return ''
          return treeText(node.props && node.props.children)
        }
        var profileTree = renderProfile()
        var dialogNode = findTreeNode(profileTree, function (node) { return node.type === 'div' && node.props && node.props.role === 'dialog' })
        r.profileDialogRendered = !!(dialogNode && String(dialogNode.props['aria-modal']) === 'true' &&
          String(dialogNode.props.className).indexOf('dsh-claude-style-plus-profile-page') !== -1)
        var titleNode = findTreeNode(profileTree, function (node) { return node.type === 'h1' })
        r.profileTitleHasText = !!(titleNode && treeText(titleNode).trim() !== '')
        if (dialogNode && typeof dialogNode.props.onKeyDown === 'function') {
          var escapePrevented = false
          dialogNode.props.onKeyDown({ key: 'Escape', preventDefault() { escapePrevented = true }, stopPropagation() {} })
          await sleep(100)
          r.profileEscapeCloses = escapePrevented && renderProfile() === null
          r.profileFocusRestored = document.activeElement === hostRow
        }
      }
      // Closing the host's menu (its own Escape) leaves no container behind.
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
      await sleep(400)
      r.injectAfterClose = document.querySelectorAll('.dsh-claude-style-plus-account-inject').length
      r.accountMenuMarkAfterClose = document.querySelectorAll('[data-dsh-claude-style-plus-account-menu]').length
      // The account menu is counted by content (its Sign out row): a role=menu
      // portal exists only while its menu is open, ours included.
      r.hostMenuAfterClose = Array.prototype.filter.call(document.querySelectorAll('body > [role="menu"]'), function (m) {
        var items = m.querySelectorAll('[role="menuitem"]')
        for (var mi = 0; mi < items.length; mi++) {
          if ((items[mi].textContent || '').trim() === 'Sign out') return true
        }
        return false
      }).length
      // Ctrl+, opens the host's settings dialog through the account menu.
      document.dispatchEvent(new KeyboardEvent('keydown', { key: ',', ctrlKey: true, bubbles: true, cancelable: true }))
      await sleep(700)
      r.dialogAfterShortcut = document.querySelectorAll('[class*="settingsArea"] [role="dialog"]').length
    })
  })
})()
