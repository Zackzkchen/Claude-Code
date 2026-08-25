/* 无限画布：视口（平移/缩放）、节点渲染、血缘连线、选区、节点内交互
   卡片默认只显示内容本身；功能收在 hover / 选中才浮出的「凸巴」和右键菜单里。 */
window.Canvas = (function () {
  const nodeEls = new Map()
  const editing = new Set() // 正在文本编辑态的节点
  let R = {}
  let spaceDown = false
  let interaction = null // pan / drag / marquee

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
      meta: document.getElementById('canvas-meta'),
      empty: document.getElementById('canvas-empty'),
      zoomLabel: document.getElementById('btn-zoom-reset')
    }

    bindViewport()
    bindKeyboard()
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
      zoomAt(vp().scale * Math.pow(0.999, e.deltaY * (e.ctrlKey || e.metaKey ? 2.4 : 1.1)), e.clientX, e.clientY)
    }, { passive: false })

    R.viewport.addEventListener('pointerdown', (e) => {
      const nodeEl = e.target.closest('.node')
      UI.closeMenu()

      if (e.button === 1 || spaceDown || (e.button === 0 && !nodeEl && e.altKey)) {
        startPan(e)
        return
      }
      if (nodeEl) return
      if (e.button !== 0) return
      // 空白处：默认拖拽平移（面向大众用户更好上手），Shift+拖拽才是框选
      if (e.shiftKey) startMarquee(e)
      else startPan(e, { clearSelectionOnClick: true })
    })

    R.viewport.addEventListener('dblclick', (e) => {
      const nodeEl = e.target.closest('.node')
      if (nodeEl) {
        if (e.target.closest('textarea, input, button')) return
        const node = Store.nodeById(nodeEl.dataset.id)
        if (!node) return
        // 文本的主操作是改字，媒体的主操作是看大图
        if (node.type === 'text') startEditing(node.id)
        else if (node.status === 'ready') window.Preview.open(node.id)
        return
      }
      const p = screenToWorld(e.clientX, e.clientY)
      window.App.createTextNode({ x: p.x - Store.SIZE.text.w / 2, y: p.y - Store.SIZE.text.h / 2 })
    })

    // 画布空白右键
    R.viewport.addEventListener('contextmenu', (e) => {
      if (e.target.closest('.node')) return
      e.preventDefault()
      const p = screenToWorld(e.clientX, e.clientY)
      UI.menu([
        { label: '新建文本', hint: '双击空白', onClick: () => window.App.createTextNode({ x: p.x, y: p.y }) },
        { label: '新建图片', onClick: () => window.App.createMediaNode('image', { x: p.x, y: p.y }) },
        { label: '新建视频', onClick: () => window.App.createMediaNode('video', { x: p.x, y: p.y }) },
        { sep: true },
        { label: '整理布局', onClick: () => { Store.tidyLayout(); fitView(Store.state.nodes, 90, 1) } },
        { label: '适配画面', hint: 'Shift+1', onClick: () => fitView() }
      ], { x: e.clientX, y: e.clientY })
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
      if (!moved && clearSelectionOnClick) Store.setSelection([])
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  function startMarquee(e) {
    const rect = paneRect()
    const origin = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    const baseSelection = [...Store.state.selection]
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
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  function bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      if (window.Preview?.isOpen()) return
      const typing = /^(input|textarea)$/i.test(e.target.tagName) || e.target.isContentEditable
      if (e.code === 'Space' && !typing) {
        spaceDown = true
        R.viewport.classList.add('space-down')
      }
      if (e.key === 'Escape') {
        UI.closeMenu()
        if (typing) e.target.blur()
        else Store.setSelection([])
      }
      if (typing) return

      if ((e.key === 'Delete' || e.key === 'Backspace') && Store.state.selection.length) {
        e.preventDefault()
        removeNodes([...Store.state.selection])
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
      if (e.key === 'Enter' && Store.state.selection.length === 1) {
        const node = Store.nodeById(Store.state.selection[0])
        if (node?.type === 'text') startEditing(node.id)
        else if (node?.status === 'ready') window.Preview.open(node.id)
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

  /* ============ 节点动作 ============ */
  function removeNodes(ids) {
    if (!ids.length) return
    Store.pushUndo()
    Store.removeNodes(ids)
    U.toast(`已删除 <span class="k">${ids.length}</span> 个节点（Ctrl+Z 撤销）`)
  }

  function startEditing(id) {
    const node = Store.nodeById(id)
    if (!node || node.type !== 'text') return
    editing.add(id)
    Store.setSelection([id])
    render()
    requestAnimationFrame(() => {
      const ta = nodeEls.get(id)?.querySelector('textarea.node-text')
      if (!ta) return
      ta.focus()
      ta.setSelectionRange(ta.value.length, ta.value.length)
    })
  }

  function stopEditing(id) {
    if (!editing.delete(id)) return
    render()
  }

  /** 让「待输入」的空节点把光标落进提示词框 */
  function focusPromptInput(id) {
    requestAnimationFrame(() => {
      nodeEls.get(id)?.querySelector('.prompt-pad textarea')?.focus()
    })
  }

  function safeName(node) {
    return (node.title || '素材').replace(/[\\/:*?"<>|]/g, '_')
  }

  function saveUrl(url, filename, revoke = false) {
    const a = U.el('a', { href: url, download: filename })
    document.body.appendChild(a)
    a.click()
    a.remove()
    if (revoke) setTimeout(() => URL.revokeObjectURL(url), 2000)
  }

  function downloadNode(node) {
    if (node.type === 'text') {
      const blob = new Blob([node.text || ''], { type: 'text/plain;charset=utf-8' })
      saveUrl(URL.createObjectURL(blob), `${safeName(node)}.txt`, true)
      U.toast('已下载文本')
      return
    }
    const isFile = node.mediaKind === 'file'
    const url = node.type === 'video' ? (isFile ? node.src : node.poster) : node.src
    if (!url) {
      U.toast('这个节点还没有素材可下载')
      return
    }
    saveUrl(url, `${safeName(node)}.${node.type === 'video' && isFile ? 'mp4' : 'jpg'}`)
    U.toast(node.type === 'video' && !isFile ? 'Demo 里 AI 视频只有封面，已下载封面图' : '已下载素材')
  }

  async function copyToClipboard(text, okMsg) {
    try {
      await navigator.clipboard.writeText(text)
      U.toast(okMsg)
    } catch {
      U.toast('浏览器拦截了剪贴板，可手动选中复制')
    }
  }

  function anchorOf(e) {
    const r = e.currentTarget.getBoundingClientRect()
    return { x: r.left, y: r.bottom + 6 }
  }

  /** 「继续生成」菜单：与右键菜单共用一套实现 */
  function openGenMenu(nodes, screenPos) {
    const list = window.Generate.actionsFor(nodes)
    if (!list.length) {
      U.toast('这个节点没有可继续派生的能力')
      return
    }
    UI.menu(list.filter((a) => !a.sep).map((action) => ({
      label: action.label,
      hint: action.hintText,
      onClick: () => window.Generate.run(nodes, action)
    })), screenPos)
  }

  function closeGenMenu() { UI.closeMenu() }

  function nodeMenuItems(nodes) {
    if (nodes.length > 1) {
      return [
        { title: `已选中 ${nodes.length} 个节点` },
        ...window.Generate.actionsFor(nodes).map((a) => ({
          label: a.label,
          onClick: () => window.Generate.run(nodes, a)
        })),
        { sep: true },
        { label: `删除 ${nodes.length} 个节点`, hint: 'Delete', danger: true, onClick: () => removeNodes(nodes.map((n) => n.id)) }
      ]
    }

    const node = nodes[0]
    const items = window.Generate.actionsFor([node]).map((a) => ({
      label: a.label,
      hint: a.hintText,
      onClick: () => window.Generate.run([node], a)
    }))
    if (items.length) items.push({ sep: true })

    if (node.type === 'text') {
      items.push({ label: '编辑文本', hint: '双击', onClick: () => startEditing(node.id) })
      items.push({ label: '复制文本', onClick: () => copyToClipboard(node.text || '', '已复制文本') })
    } else if (node.status === 'ready') {
      items.push({ label: '查看详情', hint: '双击', onClick: () => window.Preview.open(node.id) })
      if (node.prompt) items.push({ label: '复制提示词', onClick: () => copyToClipboard(node.prompt, '已复制提示词') })
    }
    if (node.type === 'text' || node.status === 'ready') {
      items.push({ label: '下载到本地', onClick: () => downloadNode(node) })
    }
    items.push({ sep: true })
    items.push({ label: '删除节点', hint: 'Delete', danger: true, onClick: () => removeNodes([node.id]) })
    return items
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
        editing.delete(id)
      }
    })
    renderEdges()
    renderChrome()
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
    R.meta.textContent = e ? `${n} 节点 · ${e} 关系` : `${n} 节点`
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
      path.style.color = active ? '#ededed' : '#48484b'
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

    nodeEls.forEach((el, id) => {
      el.classList.toggle('is-dim', !!lineage && !lineage.has(id))
    })
  }

  /* ============ 节点 DOM ============ */
  function buildNodeShell(node) {
    const el = U.el('div', { class: 'node', 'data-id': node.id, 'data-type': node.type })
    el.appendChild(U.el('div', { class: 'node-body' }))
    el.appendChild(U.el('div', { class: 'node-meta' }))
    el.appendChild(U.el('div', { class: 'node-bar-wrap' }, [U.el('div', { class: 'node-bar' })]))

    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || spaceDown) return
      const interactive = e.target.closest('textarea, input, button, .media-play, .node-bar-wrap')
      const id = node.id
      if (e.shiftKey) Store.toggleSelection(id)
      else if (!Store.state.selection.includes(id)) Store.setSelection([id])
      if (interactive) return
      startNodeDrag(e, id)
    })

    el.addEventListener('contextmenu', (e) => {
      e.preventDefault()
      e.stopPropagation()
      const id = node.id
      const sel = Store.state.selection.includes(id) && Store.state.selection.length > 1
        ? Store.selectedNodes()
        : [Store.nodeById(id)]
      if (!Store.state.selection.includes(id)) Store.setSelection([id])
      UI.menu(nodeMenuItems(sel.filter(Boolean)), { x: e.clientX, y: e.clientY })
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

  /** 卡片下方那行小字：标题 +（有父节点时）来自谁 */
  function metaHtml(node) {
    const parents = Store.parentsOf(node.id)
    const title = U.escapeHtml(U.truncate(node.title, 16))
    if (!parents.length) return `<b>${title}</b>`
    const from = parents.length > 1
      ? `${parents.length} 个素材`
      : U.escapeHtml(U.truncate(parents[0].title, 10))
    return `<b>${title}</b> <span class="from">← ${from}</span>`
  }

  function barKey(node) {
    return [node.type, node.status, editing.has(node.id) ? 'edit' : ''].join('|')
  }

  function buildBar(node) {
    const btns = []
    const gen = window.Generate.actionsFor([node])
    if (gen.length && (node.status === 'ready' || node.type === 'text')) {
      btns.push(UI.iconBtn('✦', '继续生成', (e) => openGenMenu([Store.nodeById(node.id)], anchorOf(e))))
    }
    if (node.type === 'text') {
      btns.push(UI.iconBtn('✎', '编辑文本', () => startEditing(node.id)))
      btns.push(UI.iconBtn('⧉', '复制文本', () => copyToClipboard(Store.nodeById(node.id)?.text || '', '已复制文本')))
    } else if (node.status === 'ready') {
      btns.push(UI.iconBtn('⤢', '查看详情（局部放大）', () => window.Preview.open(node.id)))
    }
    if (node.type === 'text' || node.status === 'ready') {
      btns.push(UI.iconBtn('↓', '下载到本地', () => downloadNode(Store.nodeById(node.id))))
    }
    btns.push(UI.iconBtn('✕', '删除', () => removeNodes([node.id]), { cls: 'danger' }))
    return btns
  }

  function bodyKey(node) {
    return [
      node.type, node.status, node.src ? 'src' : 'nosrc', node.mediaKind || '',
      editing.has(node.id) ? 'edit' : ''
    ].join('|')
  }

  function updateNodeEl(el, node) {
    el.style.transform = `translate(${node.x}px, ${node.y}px)`
    el.style.width = `${node.w}px`
    el.style.height = `${node.h}px`
    el.classList.toggle('is-selected', Store.state.selection.includes(node.id))
    el.classList.toggle('is-final', node.kind === 'final')

    const body = el.querySelector('.node-body')
    const key = bodyKey(node)
    if (body.dataset.key !== key) {
      body.dataset.key = key
      body.replaceChildren(buildBody(node))
    } else {
      refreshBody(body, node)
    }

    const bar = el.querySelector('.node-bar')
    const bKey = barKey(node)
    if (bar.dataset.key !== bKey) {
      bar.dataset.key = bKey
      bar.replaceChildren(...buildBar(node))
    }

    el.querySelector('.node-meta').innerHTML = metaHtml(node)
  }

  function refreshBody(body, node) {
    if (node.status === 'generating') {
      const bar = body.querySelector('.loading-bar i')
      if (bar) bar.style.width = `${Math.round((node.progress || 0) * 100)}%`
      const label = body.querySelector('.loading-label')
      if (label) label.textContent = `${node.loadingLabel || 'AI 正在生成…'} ${Math.round((node.progress || 0) * 100)}%`
    }
    if (node.type === 'text') {
      const ta = body.querySelector('textarea.node-text')
      if (ta && document.activeElement !== ta && ta.value !== (node.text || '')) ta.value = node.text || ''
      const div = body.querySelector('div.node-text')
      if (div) {
        div.textContent = node.text || '空文本 · 双击输入'
        div.classList.toggle('is-empty', !node.text)
      }
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
    if (!editing.has(node.id)) {
      return U.el('div', {
        class: `node-text${node.text ? '' : ' is-empty'}`,
        text: node.text || '空文本 · 双击输入'
      })
    }
    const ta = U.el('textarea', { class: 'node-text', placeholder: '直接键盘输入…', spellcheck: 'false' })
    ta.value = node.text || ''
    ta.addEventListener('input', () => {
      const n = Store.nodeById(node.id)
      if (n) n.text = ta.value // 输入过程中不触发整树重绘
    })
    ta.addEventListener('blur', () => {
      const n = Store.nodeById(node.id)
      if (n && n.text.trim() && n.title === '文本') n.title = U.truncate(n.text, 12)
      stopEditing(node.id)
      Store.emit('text:commit')
    })
    ta.addEventListener('keydown', (e) => e.stopPropagation())
    return ta
  }

  function buildSlotBody(node) {
    const isImage = node.type === 'image'
    const slot = U.el('div', { class: 'node-slot' }, [
      U.el('button', {
        class: 'slot-btn',
        html: '<span>⬆</span> 上传本地',
        onclick: (e) => { e.stopPropagation(); window.App.pickFileInto(node.id) }
      }),
      U.el('button', {
        class: 'slot-btn',
        html: '<span>✦</span> AI 生成',
        onclick: (e) => { e.stopPropagation(); Store.patchNode(node.id, { status: 'prompt' }); focusPromptInput(node.id) }
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
    slot.dataset.hint = isImage ? '图片' : '视频'
    return slot
  }

  /** 待输入节点：继承来的参考图 + 提示词框，用户补一句就能生成 */
  function buildPromptBody(node) {
    const refs = (node.refs || []).map(Store.nodeById).filter(Boolean)
    const ref = refs.find((n) => n.type === 'image' || n.type === 'video') || refs[0]
    const isVideo = node.type === 'video'

    const ta = U.el('textarea', {
      placeholder: ref
        ? (isVideo ? '补充运镜 / 动作，例如：缓慢推近，人物转身' : '补充画面要求，例如：换成暖光')
        : (isVideo ? '描述想要的镜头' : '描述想要的画面')
    })
    ta.value = node.prompt || ''
    ta.addEventListener('keydown', (e) => {
      e.stopPropagation()
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        go()
      }
    })

    const go = () => {
      const text = ta.value.trim()
      if (!text) {
        ta.focus()
        U.toast('写一句想要的效果，再点生成')
        return
      }
      const prompt = ref ? `参考「${U.truncate(ref.title, 10)}」，${text}` : text
      window.Generate.generateInto(node.id, prompt, {
        kind: ref?.posterKind,
        title: node.title
      })
    }

    const children = []
    if (ref) {
      const thumb = ref.type === 'image' ? ref.src : ref.poster
      children.push(U.el('div', { class: 'ref-strip' }, [
        thumb ? U.el('img', { src: thumb, alt: '' }) : null,
        U.el('span', { class: 'ref-tx' }, [
          U.el('b', { text: '参考图' }),
          U.el('em', { text: U.truncate(ref.title, 14) })
        ])
      ]))
    }
    children.push(ta)
    children.push(U.el('div', { class: 'prompt-actions' }, [
      ref ? null : U.el('button', {
        class: 'slot-btn',
        text: '返回',
        onclick: (e) => { e.stopPropagation(); Store.patchNode(node.id, { status: 'empty' }) }
      }),
      U.el('button', { class: 'slot-btn go', text: '生成', onclick: (e) => { e.stopPropagation(); go() } })
    ]))

    return U.el('div', { class: 'prompt-pad' }, children)
  }

  function buildLoadingBody(node) {
    return U.el('div', { class: 'node-loading' }, [
      U.el('div', { class: 'loading-label', text: `${node.loadingLabel || 'AI 正在生成…'} ${Math.round((node.progress || 0) * 100)}%` }),
      U.el('div', { class: 'loading-bar' }, [U.el('i', { style: { width: `${Math.round((node.progress || 0) * 100)}%` } })]),
      node.prompt ? U.el('div', { class: 'loading-prompt', text: U.truncate(node.prompt, 30) }) : null
    ])
  }

  function buildFailBody(node) {
    return U.el('div', { class: 'node-fail' }, [
      U.el('div', { text: '生成失败' }),
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
        if (video.paused) { video.play(); media.classList.add('is-playing') } else { video.pause(); media.classList.remove('is-playing') }
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
        media.classList.remove('is-playing')
        timeline.firstChild.style.width = '0%'
        return
      }
      media.classList.add('is-playing')
      img.classList.add('kenburns')
      const total = (node.duration || 5) * 1000
      const start = performance.now()
      const step = (now) => {
        timeline.firstChild.style.width = `${(((now - start) % total) / total) * 100}%`
        raf = requestAnimationFrame(step)
      }
      raf = requestAnimationFrame(step)
    })
    media.append(img, overlay, timeline, dur)
    return media
  }

  return {
    init, render, applyViewport, screenToWorld, worldToScreen, viewCenter,
    zoomBy, resetZoom, fitView, focusNode, flashNode,
    openGenMenu, closeGenMenu, startEditing, focusPromptInput, downloadNode,
    // 供局部放大预览页复用，保证两处的卡片、连线完全一致
    mediaBody: buildMediaBody, edgeGeometry: edgePath, KIND_ICON
  }
})()
