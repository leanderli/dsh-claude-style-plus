/**
 * The shell cases' page reads: the Claude palette, the classic hero's welcome,
 * the conversation view tabs' pill, the composer's marked host controls and the
 * sidebar's search row. The strip the view-tabs case builds and the root the
 * search case mounts are handed to the probe for the teardown step.
 */
(function () {
  var probe = window.__dshSmokeProbe
  var sleep = probe.sleep
  var pillState = probe.pillState
  var r = probe.report

  probe.step(async function () {
    await probe.onlyFor(['brand'], async function () {
      // The Claude palette, light and dark: the ivory and warm-black canvases,
      // the clay accent, the raised card fill.
      var claudeLight = getComputedStyle(document.body)
      r.claudePalette = {
        canvas: claudeLight.backgroundColor,
        accent: claudeLight.getPropertyValue('--dsw-alias-brand-primary').trim(),
      }
      document.body.setAttribute('data-ds-dark-theme', '')
      var claudeDark = getComputedStyle(document.body)
      r.claudePalette.dark = {
        canvas: claudeDark.backgroundColor,
        accent: claudeDark.getPropertyValue('--dsw-alias-brand-primary').trim(),
        raised: claudeDark.getPropertyValue('--dsh-claude-style-plus-raised').trim(),
      }
      document.body.removeAttribute('data-ds-dark-theme')
    })
    await probe.onlyFor(['hero'], async function () {
      // The classic hero's welcome is drawn on arrival and holds between
      // passes: the draw pinned to either end of its pool gives two different
      // lines, and a further pass leaves the drawn one alone.
      var greetRoot = document.createElement('div')
      greetRoot.className = '_x_root_1'
      greetRoot.setAttribute('data-phase', 'hero')
      var greetGroup = document.createElement('div')
      greetGroup.className = '_x_titleGroup_1'
      var greetSpan = document.createElement('span')
      greetSpan.textContent = 'Host greeting'
      greetGroup.appendChild(greetSpan)
      greetRoot.appendChild(greetGroup)
      var greetRandom = Math.random
      var arrive = async function (draw) {
        Math.random = function () { return draw }
        document.body.appendChild(greetRoot)
        await sleep(150)
        Math.random = greetRandom
        return greetSpan.textContent
      }
      r.greeting = { low: await arrive(0) }
      // The crab stands on the classic home page's card too, as Deepy does.
      r.classicCrab = document.querySelector('[data-composer-card] > .dsh-claude-style-plus-crab') !== null
      document.body.appendChild(document.createElement('i'))
      await sleep(150)
      r.greeting.held = greetSpan.textContent
      greetRoot.remove()
      await sleep(150)
      r.greeting.high = await arrive(0.999)
      greetRoot.remove()
      await sleep(150)
    })
    await probe.onlyFor(['view-tabs'], async function () {
      // The conversation view tabs (ConversationSession's strip): the pill is
      // drawn under the active tab without sliding in, then slides to the tab a
      // switch selects. The strip stays until the teardown, which must take the
      // pill back off it.
      var viewHeader = document.createElement('div')
      viewHeader.className = '_c_header_1'
      viewHeader.innerHTML = '<div class="_c_tabs_1" role="tablist" data-conversation-tabs="">' +
        '<button type="button" role="tab" aria-selected="true" class="_c_tab_1 _c_tabActive_1">Chat</button>' +
        '<button type="button" role="tab" aria-selected="false" class="_c_tab_1">Trajectory</button>' +
        '<button type="button" role="tab" aria-selected="false" class="_c_tab_1">Context</button></div>'
      document.body.appendChild(viewHeader)
      await sleep(150)
      probe.viewStrip = viewHeader.firstChild
      var viewTabs = probe.viewStrip.children
      r.viewPill = { stamped: probe.viewStrip.hasAttribute('data-dsh-view-tabs'), first: pillState(probe.viewStrip, viewTabs[0]) }
      viewTabs[0].setAttribute('aria-selected', 'false')
      viewTabs[0].className = '_c_tab_1'
      viewTabs[2].setAttribute('aria-selected', 'true')
      viewTabs[2].className = '_c_tab_1 _c_tabActive_1'
      await sleep(60)
      r.viewPill.switched = pillState(probe.viewStrip, viewTabs[2])
      // The slide plays whatever the system's motion setting: no reduced-motion
      // block in the shipped stylesheets may reach the pill.
      r.viewPill.reducedMotionRules = 0
      for (var sheetIndex = 0; sheetIndex < document.styleSheets.length; sheetIndex++) {
        var sheetRules = document.styleSheets[sheetIndex].cssRules
        for (var ruleIndex = 0; ruleIndex < sheetRules.length; ruleIndex++) {
          var mediaRule = sheetRules[ruleIndex]
          if (mediaRule instanceof CSSMediaRule && /prefers-reduced-motion/.test(mediaRule.conditionText) &&
            mediaRule.cssText.indexOf('data-dsh-claude-style-plus-pill') !== -1) r.viewPill.reducedMotionRules++
        }
      }
    })
    await probe.onlyFor(['composer'], async function () {
      // The composer's host controls are marked by what they are, read from
      // the host's structure; the submit button turning into stop (its glyph
      // becomes a rect) moves its mark with it.
      var controlOf = function (id) { var el = document.getElementById(id); return el && el.getAttribute('data-dsh-claude-style-plus-control') }
      var accessButton = document.querySelector('[data-slot="conversation.input.permission"] button:not([class*="dsh-claude"])')
      r.controls = { commands: controlOf('commands'), send: controlOf('send'), access: accessButton && accessButton.getAttribute('data-dsh-claude-style-plus-control') }
      var sendSvg = document.querySelector('#send svg')
      var sendGlyph = sendSvg.innerHTML
      sendSvg.innerHTML = '<rect x="3" y="3" width="10" height="10"></rect>'
      await sleep(60)
      r.controls.stopping = controlOf('send')
      sendSvg.innerHTML = sendGlyph
      await sleep(60)
      r.controls.back = controlOf('send')
    })
    await probe.onlyFor(['search'], async function () {
      // The fixed Search action belongs directly below the host's New Session row.
      var sidebarSlot = document.createElement('div')
      sidebarSlot.setAttribute('data-slot', 'sidebar')
      sidebarSlot.innerHTML = '<div class="_n_root_1"><div class="_n_logoRow_1" data-window-drag="true">' +
        '<button type="button" class="_n_brand_1 _n_wide_1" aria-label="New session">brand</button>' +
        '<button type="button" class="_n_iconButton_1 _n_toggle_1" aria-label="Collapse sidebar">toggle</button></div>' +
        '<button type="button" class="_n_newSession_1">New session</button></div>'
      var frame = document.createElement('div')
      frame.className = '_n_frame_1'
      var sidebarColumn = document.createElement('div')
      sidebarColumn.className = '_n_sidebarCol_1'
      sidebarColumn.appendChild(sidebarSlot)
      frame.appendChild(sidebarColumn)
      document.body.appendChild(frame)
      await sleep(150)
      var logoRow = sidebarSlot.querySelector('[class*="_logoRow"]')
      var brand = logoRow.querySelector('[class*="_brand"]')
      var newSession = sidebarSlot.querySelector('button[class*="newSession"]')
      var searchTrigger = sidebarSlot.querySelector('.dsh-claude-style-plus-search-trigger')
      var searchIcon = searchTrigger ? searchTrigger.querySelector('.dsh-claude-style-plus-search-trigger-icon svg') : null
      var searchStyle = searchTrigger ? getComputedStyle(searchTrigger) : null
      var newSessionStyle = newSession ? getComputedStyle(newSession) : null
      var searchLabel = searchTrigger ? searchTrigger.querySelector('.dsh-claude-style-plus-search-trigger-label') : null
      var rowStyleMatches = !!searchStyle && !!newSessionStyle &&
        searchStyle.height === newSessionStyle.height &&
        searchStyle.borderTopWidth === newSessionStyle.borderTopWidth &&
        searchStyle.borderRadius === newSessionStyle.borderRadius &&
        searchStyle.paddingLeft === newSessionStyle.paddingLeft &&
        searchStyle.backgroundColor === newSessionStyle.backgroundColor &&
        searchStyle.fontSize === newSessionStyle.fontSize &&
        searchStyle.fontWeight === newSessionStyle.fontWeight
      var rootsBefore = window.__roots.length
      if (searchTrigger) searchTrigger.click()
      await sleep(60)
      probe.searchRoot = window.__roots[rootsBefore]
      r.search = {
        placedBelowNewSession: !!newSession && newSession.nextElementSibling === searchTrigger,
        inSidebar: !!searchTrigger && sidebarSlot.contains(searchTrigger),
        resting: searchTrigger ? getComputedStyle(searchTrigger).visibility : null,
        opacity: searchTrigger ? getComputedStyle(searchTrigger).opacity : null,
        brandVisible: !!brand && getComputedStyle(brand).visibility === 'visible' && getComputedStyle(brand).opacity === '1',
        labelText: searchLabel ? searchLabel.textContent.trim() : null,
        iconSize: searchIcon ? getComputedStyle(searchIcon).width : null,
        ariaLabel: searchTrigger ? searchTrigger.getAttribute('aria-label') : null,
        buttonParts: searchTrigger ? searchTrigger.children.length : null,
        shortcutKeycaps: searchTrigger ? searchTrigger.querySelectorAll('kbd').length : null,
        rowStyleMatchesNewSession: rowStyleMatches,
        modalRendered: !!probe.searchRoot && probe.searchRoot.renders > 0,
      }
      var collapsedSidebar = document.createElement('div')
      collapsedSidebar.setAttribute('data-sidebar-collapsed', '')
      var collapsedSegments = document.createElement('div')
      collapsedSegments.className = 'dsh-claude-style-plus-ws-segments'
      var collapsedNewSession = document.createElement('button')
      collapsedNewSession.className = '_n_newSession_1'
      var collapsedLabel = document.createElement('span')
      collapsedLabel.className = '_n_newSessionLabelMask_1'
      collapsedNewSession.appendChild(collapsedLabel)
      collapsedSidebar.appendChild(collapsedSegments)
      collapsedSidebar.appendChild(collapsedNewSession)
      document.body.appendChild(collapsedSidebar)
      await sleep(40)
      r.search.collapsedWorkspaceDisplay = getComputedStyle(collapsedSegments).display
      r.search.collapsedNewSessionLabelDisplay = getComputedStyle(collapsedLabel).display
      collapsedSidebar.remove()
    })
  })
})()
