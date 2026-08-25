/* 无限画布：视口（平移/缩放）、节点渲染、血缘连线、选区、节点内交互 */
window.Canvas = (function () {
  const nodeEls = new Map()
  let R = {}
  let spaceDown = false
  let interaction = null // 当前手势：pan / drag / marquee
  let genMenuCtx = null

  const KIND_ICON = { text: 'T', image: '▣', video: '▶' }

  /* ============ 初始化 ============ */
  function init() {
    R = {
      pane: document.getElementById('canvas-pane'),
      viewport: document.getElementById('viewport'),
      grid: document.getElementById('grid'),
      world: document.getElementById('world'),
      nodeLayer: document.getElementById('node-layer'),
      edgePaths: document.getElementById('edge-paths'),
      edgeLabels: document.getElementById('edge-labels'),
      marquee: document.getElementById('marquee'),
      toolbar: document.getElementById('node-toolbar'),
      genMenu: document.getElementById('gen-menu'),
      genMenuHead: document.getElementById('gen-menu-head'),
      genMenuList: document.getElementById('gen-menu-list'),
      meta: document.getElementById('canvas-meta'),
      empty: document.getElementById('canvas-empty'),
      zoomLabel: document.getElementById('btn-zoom-reset')
    }

    bindViewport()
    bindKeyboard()
    bindToolbar()
    bindDropZone()

    Store.subscribe(() => render())
    applyViewport()
    render()
  }

  /* ============ 视口 ============ */
  function vp() { return Store.state.viewport }

  function applyViewport() {
    const { x, y, scale } = vp()
    R.world.style.transform = `translate(${x}px, ${y}px) scale(${scale})`
    const step = 24 * scale
    R.grid.style.backgroundSize = `${step}px ${step}px`
    R.grid.style.backgroundPosition = `${x}px ${y}px`
    R.zoomLabel.textContent = `${Math.round(scale * 100)}%`
    positionToolbar()
  }

  function paneRect() { return R.viewport.getBoundingClientRect() }

  function screenToWorld(clientX, clientY) {
    const rect = paneRect()
    const { x, y, scale } = vp()
    return { x: (clientX - rect.left - x) / scale, y: (clientY - rect.top - y) / scale }
  }

  function worldToScreen(wx, wy) {
    const { x, y, scale } = vp()
    return { x: wx * scale + x, y: wy * scale + y }
  }

  function zoomAt(nextScale, clientX, clientY) {
    const rect = paneRect()
    const v = vp()
    const s = U.clamp(nextScale, 0.2, 2.2)
    const cx = (clientX ?? rect.left + rect.width / 2) - rect.left
    const cy = (clientY ?? rect.top + rect.height / 2) - rect.top
    const wx = (cx - v.x) / v.scale
    const wy = (cy - v.y) / v.scale
    v.scale = s
    v.x = cx - wx * s
    v.y = cy - wy * s
    applyViewport()
  }

  function zoomBy(factor) { zoomAt(vp().scale * factor) }

  function resetZoom() {
    const v = vp()
    const rect = paneRect()
    const center = screenToWorld(rect.left + rect.width / 2, rect.top + rect.height / 2)
    v.scale = 1
    v.x = rect.width / 2 - center.x
    v.y = rect.height / 2 - center.y
    applyViewport()
  }

  function animateTo(target, duration = 420) {
    const v = vp()
    return new Promise((resolve) => {
      U.tween({
        from: { x: v.x, y: v.y, scale: v.scale },
        to: target,
        duration,
        onUpdate: (cur) => { v.x = cur.x; v.y = cur.y; v.scale = cur.scale; applyViewport() },
        onDone: resolve
      })
    })
  }

  function fitView(nodes = Store.state.nodes, padding = 90, maxScale = 1.05) {
    const b = Store.bounds(nodes)
    if (!b) return Promise.resolve()
    const rect = paneRect()
    const scale = U.clamp(
      Math.min((rect.width - padding * 2) / b.w, (rect.height - padding * 2) / b.h),
      0.25,
      maxScale
    )
    return animateTo({
      scale,
      x: rect.width / 2 - (b.minX + b.w / 2) * scale,
      y: rect.height / 2 - (b.minY + b.h / 2) * scale
    })
  }

  function focusNode(id, { select = true, scale } = {}) {
    const node = Store.nodeById(id)
    if (!node) return Promise.resolve()
    if (select) Store.setSelection([id])
    const rect = paneRect()
    const s = scale || U.clamp(vp().scale, 0.6, 1.15)
    return animateTo({
      scale: s,
      x: rect.width / 2 - (node.x + node.w / 2) * s,
      y: rect.height / 2 - (node.y + node.h / 2) * s
    })
  }

  function flashNode(id) {
    const el = nodeEls.get(id)
    if (!el) return
    el.classList.remove('agent-flash')
    void el.offsetWidth
    el.classList.add('agent-flash')
    setTimeout(() => el.classList.remove('agent-flash'), 1200)
  }

  /** 视口中心（世界坐标），用于在可视区域新增节点 */
  function viewCenter() {
    const rect = paneRect()
    return screenToWorld(rect.left + rect.width / 2, rect.top + rect.height / 2)
  }

  /* ============ 视口手势 ============ */
  function bindViewport() {
    R.viewport.addEventListener('wheel', (e) => {
      e.preventDefault()
      if (e.shiftKey || e.altKey) {
        const v = vp()
        v.x -= e.deltaX || e.deltaY
        v.y -= e.shiftKey ? 0 : e.deltaY
        applyViewport()
        return
      }
      const factor = Math.pow(0.999, e.deltaY * (e.ctrlKey || e.metaKey ? 2.4 : 1.1))
      zoomAt(vp().scale * factor, e.clientX, e.clientY)
    }, { passive: false })

    R.viewport.addEventListener('pointerdown', (e) => {
      const nodeEl = e.target.closest('.node')
      closeGenMenu()

      // 中键 / 空格：平移
      if (e.button === 1 || spaceDown || (e.button === 0 && !nodeEl && e.altKey)) {
        startPan(e)
        return
      }
      if (nodeEl) return // 节点自身的 pointerdown 处理

      if (e.button !== 0) return
      // 空白处：默认拖拽平移（面向大众用户更好上手），Shift+拖拽才是框选
      if (e.shiftKey) startMarquee(e)
      else startPan(e, { clearSelectionOnClick: true })
    })

    R.viewport.addEventListener('dblclick', (e) => {
      if (e.target.closest('.node')) return
      const p = screenToWorld(e.clientX, e.clientY)
      window.App.createTextNode({ x: p.x - Store.SIZE.text.w / 2, y: p.y - Store.SIZE.text.h / 2 })
    })
  }

  function startPan(e, { clearSelectionOnClick = false } = {}) {
    const v = vp()
    const start = { x: e.clientX, y: e.clientY, vx: v.x, vy: v.y }
    let moved = false
    R.viewport.classList.add('is-panning')
    interaction = 'pan'
    const move = (ev) => {
      const dx = ev.clientX - start.x
      const dy = ev.clientY - start.y
      if (Math.abs(dx) + Math.abs(dy) > 3) moved = true
      v.x = start.vx + dx
      v.y = start.vy + dy
      applyViewport()
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      R.viewport.classList.remove('is-panning')
      interaction = null
      // 空白处单击（没拖动）= 取消选择
      if (!moved && clearSelectionOnClick) Store.setSelection([])
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  function startMarquee(e) {
    const rect = paneRect()
    const origin = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    const additive = e.shiftKey
    const baseSelection = additive ? [...Store.state.selection] : []
    let moved = false
    interaction = 'marquee'

    const move = (ev) => {
      const cur = { x: ev.clientX - rect.left, y: ev.clientY - rect.top }
      const box = {
        left: Math.min(origin.x, cur.x),
        top: Math.min(origin.y, cur.y),
        width: Math.abs(cur.x - origin.x),
        height: Math.abs(cur.y - origin.y)
      }
      if (!moved && box.width + box.height > 6) {
        moved = true
        R.marquee.hidden = false
      }
      if (!moved) return
      Object.assign(R.marquee.style, {
        left: `${box.left}px`, top: `${box.top}px`,
        width: `${box.width}px`, height: `${box.height}px`
      })
      const a = screenToWorld(box.left + rect.left, box.top + rect.top)
      const b = screenToWorld(box.left + box.width + rect.left, box.top + box.height + rect.top)
      const hit = Store.state.nodes
        .filter((n) => !(n.x + n.w < a.x || n.x > b.x || n.y + n.h < a.y || n.y > b.y))
        .map((n) => n.id)
      Store.setSelection([...baseSelection, ...hit])
    }

    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      R.marquee.hidden = true
      interaction = null
      if (!moved && !additive) Store.setSelection([])
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  function bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      const typing = /^(input|textarea)$/i.test(e.target.tagName) || e.target.isContentEditable
      if (e.code === 'Space' && !typing) {
        spaceDown = true
        R.viewport.classList.add('space-down')
      }
      if (e.key === 'Escape') {
        closeGenMenu()
        if (typing) e.target.blur()
        else Store.setSelection([])
      }
      if (typing) return

      if ((e.key === 'Delete' || e.key === 'Backspace') && Store.state.selection.length) {
        e.preventDefault()
        Store.pushUndo()
        const ids = [...Store.state.selection]
        Store.removeNodes(ids)
        U.toast(`已删除 <span class="k">${ids.length}</span> 个节点（Ctrl+Z 撤销）`)
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        const ok = e.shiftKey ? Store.redo() : Store.undo()
        U.toast(ok ? (e.shiftKey ? '已重做' : '已撤销') : '没有可撤销的操作')
      }
      if (e.key === 'a' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        Store.setSelection(Store.state.nodes.map((n) => n.id))
      }
      if (e.shiftKey && e.code === 'Digit1') fitView()
      if (e.shiftKey && e.code === 'Digit0') resetZoom()
    })

    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') {
        spaceDown = false
        R.viewport.classList.remove('space-down')
      }
    })
  }

  function bindToolbar() {
    R.toolbar.addEventListener('click', (e) => {
      const act = e.target.closest('button')?.dataset.act
      if (!act) return
      const nodes = Store.selectedNodes()
      if (!nodes.length) return
      if (act === 'generate') {
        const rect = e.target.getBoundingClientRect()
        openGenMenu(nodes, { x: rect.left, y: rect.bottom + 6 })
      } else if (act === 'delete') {
        Store.pushUndo()
        Store.removeNodes(nodes.map((n) => n.id))
      } else if (act === 'duplicate') {
        Store.pushUndo()
        const copies = nodes.map((n) => {
          const spot = Store.findFreeSpot(n.x + 40, n.y + 40, n.w, n.h)
          return Store.addNode({ ...n, id: undefined, x: spot.x, y: spot.y, fresh: true, title: n.title })
        })
        Store.setSelection(copies.map((n) => n.id))
      } else if (act === 'edit') {
        const node = nodes[0]
        focusNode(node.id)
        const el = nodeEls.get(node.id)
        if (node.type === 'text') el?.querySelector('.node-text')?.focus()
        else if (node.status === 'empty') Store.patchNode(node.id, { status: 'prompt' })
        else U.toast('图片 / 视频节点可在卡片内重新生成或替换素材')
      }
    })

    document.addEventListener('pointerdown', (e) => {
      if (!R.genMenu.hidden && !e.target.closest('.gen-menu') && !e.target.closest('[data-act="generate"]') && !e.target.closest('.node-handle')) {
        closeGenMenu()
      }
    })
  }

  function bindDropZone() {
    R.viewport.addEventListener('dragover', (e) => { e.preventDefault() })
    R.viewport.addEventListener('drop', (e) => {
      e.preventDefault()
      const files = [...(e.dataTransfer?.files || [])]
      if (!files.length) return
      const p = screenToWorld(e.clientX, e.clientY)
      files.slice(0, 6).forEach((file, i) => {
        window.App.createNodeFromFile(file, { x: p.x + i * 24, y: p.y + i * 24 })
      })
    })
  }

  /* ============ 悬浮操作条 ============ */
  function positionToolbar() {
    const sel = Store.selectedNodes()
    if (!sel.length || interaction === 'marquee') {
      R.toolbar.hidden = true
      return
    }
    const b = Store.bounds(sel)
    const p = worldToScreen(b.minX + b.w / 2, b.minY)
    const paneBox = paneRect()
    R.toolbar.hidden = false
    const width = R.toolbar.offsetWidth || 220
    const left = U.clamp(p.x - width / 2, 12, paneBox.width - width - 12)
    R.toolbar.style.left = `${left}px`
    R.toolbar.style.top = `${U.clamp(p.y - 40, 52, paneBox.height - 60)}px`
    R.toolbar.querySelector('[data-act="edit"]').hidden = sel.length > 1
    R.toolbar.querySelector('[data-act="generate"]').textContent = sel.length > 1 ? `✦ 批量生成 (${sel.length})` : '✦ 生成'
  }

  /* ============ 生成菜单 ============ */
  function openGenMenu(nodes, screenPos) {
    const list = window.Generate.actionsFor(nodes)
    if (!list.length) {
      U.toast('该节点暂不支持继续派生')
      return
    }
    genMenuCtx = { nodes }
    R.genMenuHead.textContent = nodes.length > 1
      ? `以选中的 ${nodes.length} 个节点为素材继续生成`
      : `以「${U.truncate(nodes[0].title, 12)}」为素材继续生成`
    R.genMenuList.innerHTML = ''
    list.forEach((action) => {
      if (action.sep) {
        R.genMenuList.appendChild(U.el('div', { class: 'gen-sep' }))
        return
      }
      R.genMenuList.appendChild(U.el('button', {
        class: 'gen-item',
        onclick: () => {
          closeGenMenu()
          window.Generate.run(nodes, action)
        }
      }, [
        U.el('span', { class: `ic ic-${action.to}`, text: KIND_ICON[action.to] }),
        U.el('span', { class: 'tx' }, [
          document.createTextNode(action.label),
          U.el('em', { text: action.desc })
        ])
      ]))
    })
    R.genMenu.hidden = false
    const paneBox = paneRect()
    const w = 216
    R.genMenu.style.left = `${U.clamp(screenPos.x - paneBox.left, 12, paneBox.width - w - 12)}px`
    R.genMenu.style.top = `${U.clamp(screenPos.y - paneBox.top, 52, paneBox.height - R.genMenu.offsetHeight - 20)}px`
  }

  function closeGenMenu() {
    R.genMenu.hidden = true
    genMenuCtx = null
  }

  /* ============ 渲染 ============ */
  function render() {
    const seen = new Set()
    Store.state.nodes.forEach((node) => {
      seen.add(node.id)
      let el = nodeEls.get(node.id)
      if (!el) {
        el = buildNodeShell(node)
        nodeEls.set(node.id, el)
        R.nodeLayer.appendChild(el)
        if (node.fresh) {
          el.classList.add('just-created')
          node.fresh = false
          setTimeout(() => el.classList.remove('just-created'), 400)
        }
      }
      updateNodeEl(el, node)
    })
    nodeEls.forEach((el, id) => {
      if (!seen.has(id)) {
        el.remove()
        nodeEls.delete(id)
      }
    })
    renderEdges()
    renderChrome()
    positionToolbar()
  }

  /** 单选时高亮血缘：自身 + 全部祖先 + 全部后代 */
  function lineageSet() {
    const sel = Store.state.selection
    if (sel.length !== 1) return null
    const keep = new Set(sel)
    const walk = (id, dir) => {
      const next = dir === 'down' ? Store.childrenOf(id) : Store.parentsOf(id)
      next.forEach((n) => {
        if (!keep.has(n.id)) {
          keep.add(n.id)
          walk(n.id, dir)
        }
      })
    }
    walk(sel[0], 'down')
    walk(sel[0], 'up')
    return keep
  }

  function renderChrome() {
    const n = Store.state.nodes.length
    const e = Store.state.edges.length
    R.meta.textContent = `${n} 个节点 · ${e} 条关系`
    R.empty.hidden = n > 0
  }

  function edgePath(from, to) {
    const x1 = from.x + from.w
    const y1 = from.y + from.h / 2
    const x2 = to.x
    const y2 = to.y + to.h / 2
    const dx = Math.max(52, Math.abs(x2 - x1) * 0.48)
    return {
      d: `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`,
      mid: {
        x: (x1 + 3 * (x1 + dx) + 3 * (x2 - dx) + x2) / 8,
        y: (y1 + 3 * y1 + 3 * y2 + y2) / 8
      }
    }
  }

  function renderEdges() {
    const lineage = lineageSet()
    const pathsFrag = document.createDocumentFragment()
    const labelsFrag = document.createDocumentFragment()
    const NS = 'http://www.w3.org/2000/svg'

    Store.state.edges.forEach((edge) => {
      const from = Store.nodeById(edge.from)
      const to = Store.nodeById(edge.to)
      if (!from || !to) return
      const { d, mid } = edgePath(from, to)
      const active = lineage && lineage.has(edge.from) && lineage.has(edge.to)
      const dim = lineage && !active

      const path = document.createElementNS(NS, 'path')
      path.setAttribute('d', d)
      path.setAttribute('class', `edge-path${active ? ' is-active' : ''}${dim ? ' is-dim' : ''}${edge.status === 'pending' ? ' is-pending' : ''}`)
      path.setAttribute('marker-end', 'url(#arrow)')
      path.style.color = active ? '#ededed' : '#3a3a3c'
      pathsFrag.appendChild(path)

      if (edge.label) {
        const g = document.createElementNS(NS, 'g')
        g.setAttribute('class', `edge-chip${active ? ' is-active' : ''}${dim ? ' is-dim' : ''}`)
        const width = edge.label.length * 11 + 14
        const rect = document.createElementNS(NS, 'rect')
        rect.setAttribute('x', mid.x - width / 2)
        rect.setAttribute('y', mid.y - 9)
        rect.setAttribute('width', width)
        rect.setAttribute('height', 18)
        rect.setAttribute('rx', 6)
        const text = document.createElementNS(NS, 'text')
        text.setAttribute('x', mid.x)
        text.setAttribute('y', mid.y + 1)
        text.textContent = edge.label
        g.appendChild(rect)
        g.appendChild(text)
        labelsFrag.appendChild(g)
      }
    })

    R.edgePaths.replaceChildren(pathsFrag)
    R.edgeLabels.replaceChildren(labelsFrag)

    // 血缘淡出
    nodeEls.forEach((el, id) => {
      el.classList.toggle('is-dim', !!lineage && !lineage.has(id))
    })
  }

  /* ============ 节点 DOM ============ */
  function buildNodeShell(node) {
    const el = U.el('div', { class: 'node', 'data-id': node.id, 'data-type': node.type })
    el.appendChild(U.el('div', { class: 'node-head' }, [
      U.el('span', { class: 'node-kind', text: KIND_ICON[node.type] }),
      U.el('span', { class: 'node-title' }),
      U.el('span', { class: 'node-badge' })
    ]))
    el.appendChild(U.el('div', { class: 'node-body' }))
    el.appendChild(U.el('div', { class: 'node-foot' }, [
      U.el('span', { class: 'from' }),
      U.el('span', { class: 'spacer' }),
      U.el('span', { class: 'cnt' })
    ]))
    el.appendChild(U.el('button', {
      class: 'node-handle',
      title: '以该节点为素材继续生成',
      text: '＋',
      onclick: (e) => {
        e.stopPropagation()
        Store.setSelection([node.id])
        const r = e.currentTarget.getBoundingClientRect()
        openGenMenu([Store.nodeById(node.id)], { x: r.right + 8, y: r.top - 10 })
      }
    }))

    // 选中 + 拖拽
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return
      if (spaceDown) return
      const interactive = e.target.closest('textarea, input, button, .media-play')
      const id = node.id
      if (e.shiftKey) Store.toggleSelection(id)
      else if (!Store.state.selection.includes(id)) Store.setSelection([id])
      if (interactive) return
      startNodeDrag(e, id)
    })

    return el
  }

  function startNodeDrag(e, id) {
    const scale = vp().scale
    const ids = Store.state.selection.includes(id) ? [...Store.state.selection] : [id]
    const starts = ids.map((nid) => {
      const n = Store.nodeById(nid)
      return { id: nid, x: n.x, y: n.y }
    })
    const origin = { x: e.clientX, y: e.clientY }
    let moved = false
    interaction = 'drag'

    const move = (ev) => {
      const dx = (ev.clientX - origin.x) / scale
      const dy = (ev.clientY - origin.y) / scale
      if (!moved && Math.abs(dx) + Math.abs(dy) < 2 / scale) return
      if (!moved) {
        moved = true
        Store.pushUndo()
        ids.forEach((nid) => nodeEls.get(nid)?.classList.add('is-dragging'))
      }
      starts.forEach((s) => {
        const n = Store.nodeById(s.id)
        if (!n) return
        n.x = s.x + dx
        n.y = s.y + dy
        const el = nodeEls.get(s.id)
        if (el) el.style.transform = `translate(${n.x}px, ${n.y}px)`
      })
      renderEdges()
      positionToolbar()
    }

    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      interaction = null
      ids.forEach((nid) => nodeEls.get(nid)?.classList.remove('is-dragging'))
      if (moved) Store.emit('node:move')
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  function badgeFor(node) {
    if (node.status === 'generating') return { cls: 'run', text: `生成中 ${Math.round((node.progress || 0) * 100)}%` }
    if (node.status === 'failed') return { cls: 'fail', text: '生成失败' }
    if (node.status === 'empty') return { cls: '', text: '待添加素材' }
    if (node.status === 'prompt') return { cls: 'ai', text: '待生成' }
    if (node.kind === 'final') return { cls: 'final', text: '成片' }
    if (node.source === 'upload') return { cls: 'upload', text: '本地' }
    if (node.source === 'ai' || node.source === 'agent') return { cls: 'ai', text: 'AI 生成' }
    if (node.type === 'text') return { cls: '', text: Store.KIND_LABEL[node.kind] || '文本' }
    return { cls: '', text: '' }
  }

  function bodyKey(node) {
    return [node.type, node.status, node.src ? 'src' : 'nosrc', node.mediaKind || ''].join('|')
  }

  function updateNodeEl(el, node) {
    el.style.transform = `translate(${node.x}px, ${node.y}px)`
    el.style.width = `${node.w}px`
    el.style.height = `${node.h}px`
    el.classList.toggle('is-selected', Store.state.selection.includes(node.id))
    el.classList.toggle('is-final', node.kind === 'final')

    el.querySelector('.node-title').textContent = node.title
    const badge = badgeFor(node)
    const badgeEl = el.querySelector('.node-badge')
    badgeEl.className = `node-badge ${badge.cls}`
    badgeEl.textContent = badge.text
    badgeEl.hidden = !badge.text

    const body = el.querySelector('.node-body')
    const key = bodyKey(node)
    if (body.dataset.key !== key) {
      body.dataset.key = key
      body.replaceChildren(buildBody(node))
    } else {
      refreshBody(body, node)
    }

    // 血缘脚注
    const parents = Store.parentsOf(node.id)
    const fromEl = el.querySelector('.node-foot .from')
    if (parents.length > 1) {
      fromEl.textContent = `来自 ${parents.length} 个素材`
      fromEl.onclick = (e) => {
        e.stopPropagation()
        fitView([...parents, node], 140, 1)
        U.toast(`已框出「${U.truncate(node.title, 10)}」用到的 <span class="k">${parents.length}</span> 个素材`)
      }
    } else if (parents.length === 1) {
      const edge = Store.parentEdgesOf(node.id)[0]
      fromEl.textContent = `来自：${U.truncate(parents[0].title, 10)}${edge?.label ? ` · ${edge.label}` : ''}`
      fromEl.onclick = (e) => { e.stopPropagation(); focusNode(parents[0].id) }
    } else {
      fromEl.textContent = node.source === 'upload' ? '本地上传' : node.source === 'agent' ? 'Agent 创建' : '手动创建'
      fromEl.onclick = null
    }
    const children = Store.childrenOf(node.id).length
    el.querySelector('.node-foot .cnt').textContent = children ? `↳ ${children} 个派生` : ''
  }

  function refreshBody(body, node) {
    if (node.status === 'generating') {
      const bar = body.querySelector('.loading-bar i')
      if (bar) bar.style.width = `${Math.round((node.progress || 0) * 100)}%`
      const label = body.querySelector('.loading-label')
      if (label) label.textContent = node.loadingLabel || 'AI 正在生成…'
    }
    if (node.type === 'text') {
      const ta = body.querySelector('.node-text')
      if (ta && document.activeElement !== ta && ta.value !== (node.text || '')) ta.value = node.text || ''
    }
  }

  function buildBody(node) {
    if (node.type === 'text') return buildTextBody(node)
    if (node.status === 'empty') return buildSlotBody(node)
    if (node.status === 'prompt') return buildPromptBody(node)
    if (node.status === 'generating') return buildLoadingBody(node)
    if (node.status === 'failed') return buildFailBody(node)
    return buildMediaBody(node)
  }

  function buildTextBody(node) {
    const ta = U.el('textarea', {
      class: 'node-text',
      placeholder: '点击这里用键盘输入文本 / 脚本…',
      spellcheck: 'false'
    })
    ta.value = node.text || ''
    ta.addEventListener('input', () => {
      const n = Store.nodeById(node.id)
      if (n) n.text = ta.value // 输入过程中不触发整树重绘
    })
    ta.addEventListener('change', () => Store.emit('text:commit'))
    ta.addEventListener('blur', () => {
      const n = Store.nodeById(node.id)
      if (n && n.text.trim() && n.title === '文本' ) n.title = U.truncate(n.text, 10)
      Store.emit('text:commit')
    })
    ta.addEventListener('focus', () => Store.setSelection([node.id]))
    ta.addEventListener('keydown', (e) => e.stopPropagation())
    return ta
  }

  function buildSlotBody(node) {
    const isImage = node.type === 'image'
    const slot = U.el('div', { class: 'node-slot' }, [
      U.el('div', { class: 'slot-hint', text: `拖入本地${isImage ? '图片' : '视频'}，或选择：` }),
      U.el('button', {
        class: 'slot-btn',
        html: `<span>⬆</span> 上传本地${isImage ? '图片' : '视频'}`,
        onclick: (e) => { e.stopPropagation(); window.App.pickFileInto(node.id) }
      }),
      U.el('button', {
        class: 'slot-btn ai',
        html: `<span>✦</span> AI 生成${isImage ? '图片' : '视频'}`,
        onclick: (e) => { e.stopPropagation(); Store.patchNode(node.id, { status: 'prompt' }) }
      })
    ])
    slot.addEventListener('dragover', (e) => { e.preventDefault(); slot.classList.add('drag-over') })
    slot.addEventListener('dragleave', () => slot.classList.remove('drag-over'))
    slot.addEventListener('drop', (e) => {
      e.preventDefault()
      e.stopPropagation()
      slot.classList.remove('drag-over')
      const file = e.dataTransfer?.files?.[0]
      if (file) window.App.loadFileInto(node.id, file)
    })
    return slot
  }

  function buildPromptBody(node) {
    const isImage = node.type === 'image'
    const ta = U.el('textarea', {
      placeholder: isImage ? '描述想要的画面，例如：国风少女特写，暖光，胶片质感' : '描述想要的镜头，例如：产品旋转展示，慢推镜头，柔光'
    })
    ta.value = node.prompt || ''
    ta.addEventListener('keydown', (e) => {
      e.stopPropagation()
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) go()
    })

    const go = () => {
      const prompt = ta.value.trim()
      if (!prompt) {
        ta.focus()
        U.toast('先写一句提示词，再让 AI 生成')
        return
      }
      window.Generate.generateInto(node.id, prompt)
    }

    const chips = (isImage
      ? ['人物图 · 女主角特写', '场景图 · 江南清晨街巷', '商品图 · 护手霜礼盒质感']
      : ['产品慢推镜头 5s', '人物走位空镜 4s', '氛围转场镜头 3s'])
      .map((t) => U.el('button', {
        class: 'prompt-chip',
        text: t,
        onclick: (e) => { e.stopPropagation(); ta.value = t; ta.focus() }
      }))

    setTimeout(() => ta.focus(), 30)

    return U.el('div', { class: 'prompt-pad' }, [
      ta,
      U.el('div', { class: 'prompt-chips' }, chips),
      U.el('div', { class: 'prompt-actions' }, [
        U.el('button', {
          class: 'slot-btn',
          text: '返回',
          onclick: (e) => { e.stopPropagation(); Store.patchNode(node.id, { status: 'empty' }) }
        }),
        U.el('button', { class: 'slot-btn go', html: '✦ 生成', onclick: (e) => { e.stopPropagation(); go() } })
      ])
    ])
  }

  function buildLoadingBody(node) {
    return U.el('div', { class: 'node-loading' }, [
      U.el('div', { class: 'loading-label', text: node.loadingLabel || 'AI 正在生成…' }),
      U.el('div', { class: 'loading-bar' }, [U.el('i', { style: { width: `${Math.round((node.progress || 0) * 100)}%` } })]),
      node.prompt ? U.el('div', { class: 'loading-prompt', text: U.truncate(node.prompt, 34) }) : null
    ])
  }

  function buildFailBody(node) {
    return U.el('div', { class: 'node-fail' }, [
      U.el('div', { text: '生成失败：算力排队超时' }),
      U.el('button', {
        class: 'slot-btn',
        text: '重试',
        onclick: (e) => { e.stopPropagation(); window.Generate.generateInto(node.id, node.prompt) }
      })
    ])
  }

  function buildMediaBody(node) {
    const media = U.el('div', { class: 'node-media' })

    if (node.type === 'image') {
      media.appendChild(U.el('img', { src: node.src, alt: node.title, draggable: 'false' }))
      return media
    }

    // 视频：本地文件用真实 <video>，AI 生成用封面 + 模拟播放
    if (node.mediaKind === 'file') {
      const video = U.el('video', { src: node.src, muted: 'true', playsinline: 'true', loop: 'true', preload: 'metadata' })
      const overlay = U.el('button', { class: 'media-play', html: '<span>▶</span>' })
      const timeline = U.el('div', { class: 'media-timeline' }, [U.el('i')])
      const dur = U.el('div', { class: 'media-dur', text: '00:00' })
      video.addEventListener('loadedmetadata', () => { dur.textContent = Media.formatDuration(video.duration) })
      video.addEventListener('timeupdate', () => {
        timeline.firstChild.style.width = `${(video.currentTime / (video.duration || 1)) * 100}%`
      })
      overlay.addEventListener('click', (e) => {
        e.stopPropagation()
        if (video.paused) { video.play(); overlay.style.opacity = '0' } else { video.pause(); overlay.style.opacity = '1' }
      })
      media.append(video, overlay, timeline, dur)
      return media
    }

    const img = U.el('img', { src: node.poster || node.src, alt: node.title, draggable: 'false' })
    const overlay = U.el('button', { class: 'media-play', html: '<span>▶</span>' })
    const timeline = U.el('div', { class: 'media-timeline' }, [U.el('i')])
    const dur = U.el('div', { class: 'media-dur', text: Media.formatDuration(node.duration || 5) })
    let raf = 0
    overlay.addEventListener('click', (e) => {
      e.stopPropagation()
      if (raf) {
        cancelAnimationFrame(raf)
        raf = 0
        img.classList.remove('kenburns')
        overlay.style.opacity = '1'
        timeline.firstChild.style.width = '0%'
        return
      }
      overlay.style.opacity = '0'
      img.classList.add('kenburns')
      const total = (node.duration || 5) * 1000
      const start = performance.now()
      const step = (now) => {
        const t = ((now - start) % total) / total
        timeline.firstChild.style.width = `${t * 100}%`
        raf = requestAnimationFrame(step)
      }
      raf = requestAnimationFrame(step)
    })
    media.append(img, overlay, timeline, dur)
    return media
  }

  return {
    init, render, applyViewport, screenToWorld, worldToScreen, viewCenter,
    zoomBy, resetZoom, fitView, focusNode, flashNode, openGenMenu, closeGenMenu
  }
})()
