/* 局部放大预览页：把无限画布的一小块（当前节点 + 直接上下游）放大来看。
   刻意复用画布的卡片、连线与手势，让用户感觉"还在同一张画布上，只是凑近了看"。 */
window.Preview = (function () {
  let R = {}
  let opened = false
  let targetId = null
  const view = { x: 0, y: 0, scale: 1 }

  const MIN_SCALE = 0.4
  const MAX_SCALE = 3.2

  function init() {
    R = {
      layer: document.getElementById('preview-layer'),
      stage: document.getElementById('preview-stage'),
      world: document.getElementById('preview-world'),
      nodes: document.getElementById('preview-nodes'),
      edgePaths: document.getElementById('preview-edge-paths'),
      edgeLabels: document.getElementById('preview-edge-labels'),
      side: document.getElementById('preview-side'),
      kind: document.getElementById('preview-kind'),
      name: document.getElementById('preview-name'),
      badge: document.getElementById('preview-badge'),
      zoomLabel: document.getElementById('preview-zoom-fit')
    }

    document.getElementById('preview-back').addEventListener('click', close)
    document.getElementById('preview-locate').addEventListener('click', () => {
      const id = targetId
      close()
      Canvas.focusNode(id).then(() => Canvas.flashNode(id))
    })
    document.getElementById('preview-prev').addEventListener('click', () => step(-1))
    document.getElementById('preview-next').addEventListener('click', () => step(1))
    document.getElementById('preview-zoom-in').addEventListener('click', () => zoomBy(1.2))
    document.getElementById('preview-zoom-out').addEventListener('click', () => zoomBy(1 / 1.2))
    R.zoomLabel.addEventListener('click', fit)

    bindStage()

    window.addEventListener('keydown', (e) => {
      if (!opened) return
      const typing = /^(input|textarea)$/i.test(e.target.tagName)
      if (e.key === 'Escape') {
        e.stopPropagation()
        if (typing) e.target.blur()
        else close()
        return
      }
      if (typing) return
      if (e.key === 'ArrowLeft') step(-1)
      if (e.key === 'ArrowRight') step(1)
      if (e.key === '+' || e.key === '=') zoomBy(1.2)
      if (e.key === '-') zoomBy(1 / 1.2)
    }, true)

    Store.subscribe((_, reason) => {
      if (!opened) return
      if (!Store.nodeById(targetId)) {
        close()
        return
      }
      // 生成进度这类高频更新只刷内容，不动视口
      render({ keepView: true, skipSideInputs: reason === 'typing' || reason === 'progress' })
    })
  }

  /* ---------------- 视口 ---------------- */
  function applyView() {
    R.world.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`
    R.zoomLabel.textContent = `${Math.round(view.scale * 100)}%`
  }

  function stageRect() { return R.stage.getBoundingClientRect() }

  function zoomAt(next, clientX, clientY) {
    const rect = stageRect()
    const s = U.clamp(next, MIN_SCALE, MAX_SCALE)
    const cx = (clientX ?? rect.left + rect.width / 2) - rect.left
    const cy = (clientY ?? rect.top + rect.height / 2) - rect.top
    const wx = (cx - view.x) / view.scale
    const wy = (cy - view.y) / view.scale
    view.scale = s
    view.x = cx - wx * s
    view.y = cy - wy * s
    applyView()
  }

  const zoomBy = (factor) => zoomAt(view.scale * factor)

  function bindStage() {
    R.stage.addEventListener('wheel', (e) => {
      e.preventDefault()
      zoomAt(view.scale * Math.pow(0.999, e.deltaY * 1.1), e.clientX, e.clientY)
    }, { passive: false })

    R.stage.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return
      if (e.target.closest('.node, button')) return
      const start = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }
      R.stage.classList.add('is-panning')
      const move = (ev) => {
        view.x = start.vx + (ev.clientX - start.x)
        view.y = start.vy + (ev.clientY - start.y)
        applyView()
      }
      const up = () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        R.stage.classList.remove('is-panning')
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    })
  }

  /**
   * 默认视图：让当前节点占到舞台一半以上（"凑近看"的关键），
   * 上下游自然露在画面两侧边缘 —— 提示用户这仍然是同一张画布。
   */
  function fit() {
    const t = Store.nodeById(targetId)
    if (!t) return
    const rect = stageRect()
    const scale = U.clamp(
      Math.min(rect.width * 0.46 / t.w, rect.height * 0.62 / t.h),
      1.1,
      MAX_SCALE
    )
    view.scale = scale
    view.x = rect.width / 2 - (t.x + t.w / 2) * scale
    view.y = rect.height / 2 - (t.y + t.h / 2) * scale
    applyView()
  }

  /* ---------------- 邻域 ---------------- */
  function scope() {
    const node = Store.nodeById(targetId)
    if (!node) return { node: null, parents: [], children: [], siblings: [], all: [] }
    const parents = Store.parentsOf(node.id)
    const children = Store.childrenOf(node.id)
    const siblings = (parents[0] ? Store.childrenOf(parents[0].id) : [])
      .filter((n) => n.id !== node.id)
    const all = [node, ...parents, ...children, ...siblings]
    const seen = new Set()
    return { node, parents, children, siblings, all: all.filter((n) => !seen.has(n.id) && seen.add(n.id)) }
  }

  function siblingRing() {
    const node = Store.nodeById(targetId)
    const parents = Store.parentsOf(node.id)
    const list = parents[0]
      ? Store.childrenOf(parents[0].id)
      : Store.state.nodes.filter((n) => Store.parentsOf(n.id).length === 0)
    return list.length ? list : [node]
  }

  function step(dir) {
    const ring = siblingRing()
    const i = ring.findIndex((n) => n.id === targetId)
    const next = ring[(i + dir + ring.length) % ring.length]
    if (next && next.id !== targetId) setTarget(next.id)
  }

  /* ---------------- 渲染 ---------------- */
  function roleOf(node, sc) {
    if (node.id === sc.node.id) return '当前节点'
    if (sc.parents.some((n) => n.id === node.id)) return '上游素材'
    if (sc.children.some((n) => n.id === node.id)) return '下游产物'
    return '同批产物'
  }

  function card(node, sc) {
    const isTarget = node.id === sc.node.id
    const badge = Canvas.badgeOf(node)
    const el = U.el('div', {
      class: `node${isTarget ? ' is-target is-selected' : ''}`,
      'data-type': node.type,
      'data-id': node.id,
      style: {
        transform: `translate(${node.x}px, ${node.y}px)`,
        width: `${node.w}px`,
        height: `${node.h}px`
      }
    })

    el.appendChild(U.el('div', { class: 'preview-role', text: roleOf(node, sc) }))
    el.appendChild(U.el('div', { class: 'node-head' }, [
      U.el('span', { class: 'node-kind', text: Canvas.KIND_ICON[node.type] }),
      U.el('span', { class: 'node-title', text: node.title }),
      badge.text ? U.el('span', { class: `node-badge ${badge.cls}`, text: badge.text }) : null
    ]))

    el.appendChild(U.el('div', { class: 'node-body' }, [body(node, isTarget)]))

    const parents = Store.parentsOf(node.id)
    const children = Store.childrenOf(node.id)
    el.appendChild(U.el('div', { class: 'node-foot' }, [
      U.el('span', {
        class: 'from',
        text: parents.length > 1
          ? `来自 ${parents.length} 个素材`
          : parents.length === 1
            ? `来自：${U.truncate(parents[0].title, 10)}`
            : node.source === 'upload' ? '本地上传' : node.source === 'agent' ? 'Agent 创建' : '手动创建'
      }),
      U.el('span', { class: 'spacer' }),
      U.el('span', { class: 'cnt', text: children.length ? `↳ ${children.length} 个派生` : '' })
    ]))

    if (!isTarget) {
      el.addEventListener('click', () => setTarget(node.id))
      el.title = '点击深入这个节点'
    }
    return el
  }

  /** 当前节点的素材按 2 倍分辨率重绘一份（构图不变，只是更清楚） */
  function hiRes(node) {
    if (node.mediaKind === 'file' || !node.posterKind || !node.prompt) return node
    const w = (node.mediaW || 480) * 2
    const h = (node.mediaH || 400) * 2
    const url = Media.poster(node.posterKind, node.prompt, w, h)
    return node.type === 'video' ? { ...node, poster: url } : { ...node, src: url }
  }

  function body(node, isTarget) {
    if (node.type === 'text') {
      return U.el('div', { class: 'node-text', text: node.text || '（空文本节点）' })
    }
    if (node.status === 'ready') return Canvas.mediaBody(isTarget ? hiRes(node) : node)
    if (node.status === 'generating') {
      return U.el('div', { class: 'node-loading' }, [
        U.el('div', { class: 'loading-label', text: `AI 正在生成… ${Math.round((node.progress || 0) * 100)}%` }),
        U.el('div', { class: 'loading-bar' }, [U.el('i', { style: { width: `${Math.round((node.progress || 0) * 100)}%` } })]),
        node.prompt ? U.el('div', { class: 'loading-prompt', text: U.truncate(node.prompt, 34) }) : null
      ])
    }
    return U.el('div', { class: 'node-slot' }, [
      U.el('div', { class: 'slot-hint', text: '该节点还没有素材' }),
      U.el('button', {
        class: 'slot-btn',
        text: '返回画布添加',
        onclick: (e) => { e.stopPropagation(); close(); Canvas.focusNode(node.id) }
      })
    ])
  }

  function renderEdges(sc) {
    const NS = 'http://www.w3.org/2000/svg'
    const ids = new Set(sc.all.map((n) => n.id))
    const paths = document.createDocumentFragment()
    const labels = document.createDocumentFragment()

    Store.state.edges.forEach((edge) => {
      if (!ids.has(edge.from) || !ids.has(edge.to)) return
      const from = Store.nodeById(edge.from)
      const to = Store.nodeById(edge.to)
      const { d, mid } = Canvas.edgeGeometry(from, to)
      const active = edge.from === sc.node.id || edge.to === sc.node.id
      const path = document.createElementNS(NS, 'path')
      path.setAttribute('d', d)
      path.setAttribute('class', `edge-path${active ? ' is-active' : ''}${active ? '' : ' is-dim'}${edge.status === 'pending' ? ' is-pending' : ''}`)
      paths.appendChild(path)

      if (edge.label) {
        const g = document.createElementNS(NS, 'g')
        g.setAttribute('class', `edge-chip${active ? ' is-active' : ' is-dim'}`)
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
        g.append(rect, text)
        labels.appendChild(g)
      }
    })
    R.edgePaths.replaceChildren(paths)
    R.edgeLabels.replaceChildren(labels)
  }

  /* ---------------- 详情栏 ---------------- */
  function lineagePath(node) {
    const path = [node]
    let cur = node
    const guard = new Set([node.id])
    while (true) {
      const p = Store.parentsOf(cur.id)[0]
      if (!p || guard.has(p.id)) break
      guard.add(p.id)
      path.unshift(p)
      cur = p
    }
    return path
  }

  function sourceLabel(node) {
    if (node.source === 'upload') return '本地上传'
    if (node.source === 'agent') return 'Agent 生成'
    if (node.source === 'ai') return 'AI 生成'
    return '手动创建'
  }

  function metaRows(node) {
    const rows = [
      ['类型', `${Store.TYPE_LABEL[node.type]}${node.kind && Store.KIND_LABEL[node.kind] ? ` · ${Store.KIND_LABEL[node.kind]}` : ''}`],
      ['来源', sourceLabel(node)],
      ['状态', node.status === 'ready' ? '已完成' : node.status === 'generating' ? `生成中 ${Math.round((node.progress || 0) * 100)}%` : node.status === 'empty' ? '待添加素材' : node.status === 'prompt' ? '待生成' : '生成失败']
    ]
    if (node.type === 'video' && node.duration) rows.push(['时长', Media.formatDuration(node.duration)])
    if (node.type === 'text') rows.push(['字数', `${(node.text || '').replace(/\s/g, '').length} 字`])
    if (node.type !== 'text' && node.mediaW) rows.push(['素材尺寸', `${node.mediaW} × ${node.mediaH}`])
    rows.push(['创建时间', new Date(node.createdAt).toLocaleTimeString('zh-CN', { hour12: false })])
    return rows
  }

  function refChip(node) {
    return U.el('button', {
      class: 'node-ref',
      onclick: () => setTarget(node.id)
    }, [
      (node.type === 'image' ? node.src : node.poster)
        ? U.el('img', { class: 'thumb', src: node.type === 'image' ? node.src : node.poster, alt: '' })
        : U.el('span', { class: 'thumb', text: Canvas.KIND_ICON[node.type] }),
      U.el('span', { class: 'nm', text: U.truncate(node.title, 12) })
    ])
  }

  function renderSide(sc, { skipInputs = false } = {}) {
    if (skipInputs && R.side.querySelector('.side-text') === document.activeElement) return
    const node = sc.node
    const blocks = []

    blocks.push(U.el('div', { class: 'side-block' }, [
      U.el('h4', { text: '素材信息' }),
      U.el('div', { class: 'side-kv' }, metaRows(node).map(([k, v]) => U.el('div', { class: 'side-row' }, [
        U.el('span', { class: 'k', text: k }),
        U.el('span', { class: 'v', text: v })
      ])))
    ]))

    if (node.type === 'text') {
      const ta = U.el('textarea', { class: 'side-text', spellcheck: 'false' })
      ta.value = node.text || ''
      ta.addEventListener('input', () => {
        const n = Store.nodeById(node.id)
        if (n) n.text = ta.value
      })
      ta.addEventListener('blur', () => Store.emit('text:commit'))
      blocks.push(U.el('div', { class: 'side-block' }, [U.el('h4', { text: '文本内容（可直接改）' }), ta]))
    } else if (node.prompt) {
      blocks.push(U.el('div', { class: 'side-block' }, [
        U.el('h4', { text: '生成提示词' }),
        U.el('div', { class: 'side-prompt', text: node.prompt })
      ]))
    }

    const path = lineagePath(node)
    const pathEls = []
    path.forEach((n, i) => {
      if (i) pathEls.push(U.el('span', { class: 'sep', text: '›' }))
      pathEls.push(U.el('button', {
        class: `path-chip${n.id === node.id ? ' is-current' : ''}`,
        text: U.truncate(n.title, 10),
        onclick: () => n.id !== node.id && setTarget(n.id)
      }))
    })
    blocks.push(U.el('div', { class: 'side-block' }, [
      U.el('h4', { text: `血缘路径（第 ${path.length} 代）` }),
      U.el('div', { class: 'side-path' }, pathEls)
    ]))

    blocks.push(U.el('div', { class: 'side-block' }, [
      U.el('h4', { text: `下游产物（${sc.children.length}）` }),
      sc.children.length
        ? U.el('div', { class: 'side-refs' }, sc.children.map(refChip))
        : U.el('div', { class: 'side-empty', text: '还没有派生任何产物' })
    ]))

    const actions = [
      U.el('button', {
        class: 'side-btn primary',
        html: '✦ 以它为素材继续生成',
        onclick: () => {
          const id = node.id
          close()
          Store.setSelection([id])
          Canvas.focusNode(id).then(() => {
            const handle = document.querySelector(`.node[data-id="${id}"] .node-handle`)
            const r = handle?.getBoundingClientRect()
            Canvas.openGenMenu([Store.nodeById(id)], r ? { x: r.right + 8, y: r.top - 10 } : { x: 200, y: 200 })
          })
        }
      }),
      U.el('button', {
        class: 'side-btn',
        text: '在画布中定位',
        onclick: () => {
          const id = node.id
          close()
          Canvas.focusNode(id).then(() => Canvas.flashNode(id))
        }
      })
    ]
    if (node.prompt) {
      actions.push(U.el('button', {
        class: 'side-btn',
        text: '复制提示词',
        onclick: async () => {
          try {
            await navigator.clipboard.writeText(node.prompt)
            U.toast('提示词已复制')
          } catch {
            U.toast('浏览器拦截了剪贴板，可手动选中复制')
          }
        }
      }))
    }
    actions.push(U.el('button', {
      class: 'side-btn danger',
      text: '删除该节点',
      onclick: () => {
        Store.pushUndo()
        const id = node.id
        close()
        Store.removeNodes([id])
        U.toast('已删除节点（Ctrl+Z 撤销）')
      }
    }))
    blocks.push(U.el('div', { class: 'side-block' }, [U.el('h4', { text: '操作' }), U.el('div', { class: 'side-actions' }, actions)]))

    R.side.replaceChildren(...blocks)
  }

  function render({ keepView = false, skipSideInputs = false } = {}) {
    const sc = scope()
    if (!sc.node) return

    const badge = Canvas.badgeOf(sc.node)
    R.kind.textContent = Canvas.KIND_ICON[sc.node.type]
    R.kind.className = 'node-kind'
    R.name.textContent = sc.node.title
    R.badge.className = `node-badge ${badge.cls}`
    R.badge.textContent = badge.text
    R.badge.hidden = !badge.text
    // 让头部徽标沿用画布上同类型节点的填充方式
    R.kind.closest('.preview-title').dataset.type = sc.node.type

    R.nodes.replaceChildren(...sc.all.map((n) => card(n, sc)))
    renderEdges(sc)
    renderSide(sc, { skipInputs: skipSideInputs })
    if (!keepView) fit()
    else applyView()
  }

  /* ---------------- 开关 ---------------- */
  function setTarget(id) {
    if (!Store.nodeById(id)) return
    targetId = id
    Store.setSelection([id])
    render()
  }

  function open(id) {
    const node = Store.nodeById(id)
    if (!node) return
    targetId = id
    opened = true
    Store.setSelection([id])
    Canvas.closeGenMenu()
    R.layer.hidden = false
    render()
    // 画布本体同步凑近该节点，退出预览时视线是连续的
    Canvas.focusNode(id, { scale: 1.1 })
  }

  function close() {
    if (!opened) return
    opened = false
    R.layer.hidden = true
    R.nodes.replaceChildren()
  }

  const isOpen = () => opened

  return { init, open, close, isOpen, setTarget }
})()
