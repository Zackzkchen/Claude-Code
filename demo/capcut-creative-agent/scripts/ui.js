/* 两个共享基础组件：
   1) tooltip —— icon 按钮只放图标，文案挪到 hover 时才出现
   2) menu    —— 右键菜单与「继续生成」菜单共用同一套实现 */
window.UI = (function () {
  let tipEl = null
  let tipTimer = 0
  let menuEl = null

  function init() {
    tipEl = U.el('div', { class: 'ui-tip', hidden: true })
    document.body.appendChild(tipEl)

    document.addEventListener('pointerover', (e) => {
      const host = e.target.closest?.('[data-tip]')
      if (!host) return
      clearTimeout(tipTimer)
      tipTimer = setTimeout(() => showTip(host), 220)
    })
    document.addEventListener('pointerout', (e) => {
      if (e.target.closest?.('[data-tip]')) hideTip()
    })
    document.addEventListener('pointerdown', () => hideTip(), true)
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu() })
    window.addEventListener('blur', hideTip)
  }

  /* ---------------- tooltip ---------------- */
  function showTip(host) {
    const text = host.dataset.tip
    if (!text) return
    tipEl.textContent = text
    tipEl.hidden = false
    const r = host.getBoundingClientRect()
    const w = tipEl.offsetWidth
    const h = tipEl.offsetHeight
    let top = r.top - h - 8
    if (top < 6) top = r.bottom + 8
    tipEl.style.left = `${U.clamp(r.left + r.width / 2 - w / 2, 6, window.innerWidth - w - 6)}px`
    tipEl.style.top = `${top}px`
  }

  function hideTip() {
    clearTimeout(tipTimer)
    if (tipEl) tipEl.hidden = true
  }

  /* ---------------- menu ---------------- */
  /**
   * @param items [{ label, hint?, onClick, danger?, disabled? } | { sep: true } | { title: '…' }]
   * @param pos   { x, y } 屏幕坐标
   */
  function menu(items, pos) {
    closeMenu()
    const list = items.filter(Boolean)
    if (!list.length) return

    menuEl = U.el('div', { class: 'ui-menu' })
    list.forEach((item) => {
      if (item.sep) {
        menuEl.appendChild(U.el('div', { class: 'ui-menu-sep' }))
        return
      }
      if (item.title) {
        menuEl.appendChild(U.el('div', { class: 'ui-menu-title', text: item.title }))
        return
      }
      menuEl.appendChild(U.el('button', {
        class: `ui-menu-item${item.danger ? ' danger' : ''}${item.disabled ? ' disabled' : ''}`,
        onclick: () => {
          if (item.disabled) return
          closeMenu()
          item.onClick?.()
        }
      }, [
        U.el('span', { class: 'lb', text: item.label }),
        item.hint ? U.el('span', { class: 'hint', text: item.hint }) : null
      ]))
    })

    document.body.appendChild(menuEl)
    const w = menuEl.offsetWidth
    const h = menuEl.offsetHeight
    menuEl.style.left = `${U.clamp(pos.x, 6, window.innerWidth - w - 6)}px`
    menuEl.style.top = `${U.clamp(pos.y, 6, window.innerHeight - h - 6)}px`

    // 下一帧再挂关闭监听，避免把本次点击也当成"点外面"
    requestAnimationFrame(() => {
      document.addEventListener('pointerdown', onOutside, true)
      window.addEventListener('wheel', closeMenu, { passive: true, once: true })
    })
  }

  function onOutside(e) {
    if (menuEl && !e.target.closest('.ui-menu')) closeMenu()
  }

  function closeMenu() {
    if (!menuEl) return
    document.removeEventListener('pointerdown', onOutside, true)
    menuEl.remove()
    menuEl = null
  }

  const isMenuOpen = () => !!menuEl

  /** icon 按钮：只放一个字形，文案交给 tooltip */
  function iconBtn(icon, tip, onClick, { cls = '', stop = true } = {}) {
    return U.el('button', {
      class: `icon-btn ${cls}`.trim(),
      'data-tip': tip,
      text: icon,
      onclick: (e) => {
        if (stop) e.stopPropagation()
        hideTip()
        onClick(e)
      },
      onpointerdown: (e) => { if (stop) e.stopPropagation() }
    })
  }

  return { init, menu, closeMenu, isMenuOpen, iconBtn, hideTip }
})()
