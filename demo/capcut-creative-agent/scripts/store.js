/* 画布数据模型：节点 / 关系（血缘）/ 选区 / 视口 / 撤销栈 */
window.Store = (function () {
  // 卡片不再有标题栏/脚注，尺寸按内容本身给：图片近方、视频 16:9
  const SIZE = {
    text: { w: 300, h: 190 },
    image: { w: 240, h: 240 },
    video: { w: 304, h: 171 }
  }

  const TYPE_LABEL = { text: '文本', image: '图片', video: '视频' }

  const KIND_LABEL = {
    script: '脚本',
    shot: '分镜',
    copy: '文案',
    idea: '想法',
    character: '人物图',
    scene: '场景图',
    product: '商品图',
    cover: '封面图',
    upload: '本地素材',
    ai: 'AI 生成',
    final: '成片'
  }

  const state = {
    nodes: [],
    edges: [],
    selection: [],
    viewport: { x: 0, y: 0, scale: 1 }
  }

  const listeners = new Set()
  let undoStack = []
  let redoStack = []

  function subscribe(fn) {
    listeners.add(fn)
    return () => listeners.delete(fn)
  }

  function emit(reason = 'change') {
    listeners.forEach((fn) => fn(state, reason))
  }

  /* ---------------- 撤销 ---------------- */
  function snapshot() {
    return JSON.stringify({ nodes: state.nodes, edges: state.edges, selection: state.selection })
  }

  function pushUndo() {
    undoStack.push(snapshot())
    if (undoStack.length > 60) undoStack.shift()
    redoStack = []
  }

  function restore(json) {
    const data = JSON.parse(json)
    state.nodes = data.nodes
    state.edges = data.edges
    state.selection = data.selection
    emit('restore')
  }

  function undo() {
    if (!undoStack.length) return false
    redoStack.push(snapshot())
    restore(undoStack.pop())
    return true
  }

  function redo() {
    if (!redoStack.length) return false
    undoStack.push(snapshot())
    restore(redoStack.pop())
    return true
  }

  /* ---------------- 节点 ---------------- */
  function nodeById(id) {
    return state.nodes.find((n) => n.id === id)
  }

  function defaultTitle(node) {
    if (node.type === 'text') return `${KIND_LABEL[node.kind] || '文本'}`
    return `${KIND_LABEL[node.kind] || TYPE_LABEL[node.type]}`
  }

  function addNode(patch = {}) {
    const type = patch.type || 'text'
    const size = SIZE[type]
    const node = Object.assign(
      {
        id: U.uid(type[0]),
        type,
        kind: type === 'text' ? 'script' : 'blank',
        x: 0,
        y: 0,
        w: size.w,
        h: size.h,
        status: type === 'text' ? 'ready' : 'empty',
        progress: 0,
        source: 'manual',
        text: '',
        prompt: '',
        refs: [],
        src: '',
        poster: '',
        duration: 0,
        createdAt: Date.now(),
        fresh: true
      },
      patch
    )
    if (!node.id) node.id = U.uid(type[0])
    if (!node.w) node.w = size.w
    if (!node.h) node.h = size.h
    if (!node.title) node.title = defaultTitle(node)
    state.nodes.push(node)
    emit('node:add')
    return node
  }

  function patchNode(id, patch, reason = 'node:patch') {
    const node = nodeById(id)
    if (!node) return null
    Object.assign(node, patch)
    emit(reason)
    return node
  }

  function removeNodes(ids) {
    const set = new Set(ids)
    state.nodes = state.nodes.filter((n) => !set.has(n.id))
    state.edges = state.edges.filter((e) => !set.has(e.from) && !set.has(e.to))
    state.selection = state.selection.filter((id) => !set.has(id))
    emit('node:remove')
  }

  /* ---------------- 关系 ---------------- */
  function addEdge(from, to, label, status = 'ready') {
    const edge = { id: U.uid('e'), from, to, label: label || '', status }
    state.edges.push(edge)
    emit('edge:add')
    return edge
  }

  function patchEdge(id, patch) {
    const edge = state.edges.find((e) => e.id === id)
    if (edge) {
      Object.assign(edge, patch)
      emit('edge:patch')
    }
    return edge
  }

  const childrenOf = (id) => state.edges.filter((e) => e.from === id).map((e) => nodeById(e.to)).filter(Boolean)
  const parentEdgesOf = (id) => state.edges.filter((e) => e.to === id)
  const parentsOf = (id) => parentEdgesOf(id).map((e) => nodeById(e.from)).filter(Boolean)

  /* ---------------- 选区 ---------------- */
  function setSelection(ids) {
    state.selection = [...new Set(ids)].filter((id) => nodeById(id))
    emit('selection')
  }

  function toggleSelection(id) {
    const has = state.selection.includes(id)
    setSelection(has ? state.selection.filter((x) => x !== id) : [...state.selection, id])
  }

  const selectedNodes = () => state.selection.map(nodeById).filter(Boolean)

  /* ---------------- 布局 ---------------- */
  const GAP_X = 118
  const GAP_Y = 26

  function overlaps(a, b, margin = 18) {
    return !(
      a.x + a.w + margin < b.x ||
      b.x + b.w + margin < a.x ||
      a.y + a.h + margin < b.y ||
      b.y + b.h + margin < a.y
    )
  }

  /** 找到不与已有节点重叠的落点（从建议位置向下寻找） */
  function findFreeSpot(x, y, w, h, ignore = []) {
    const ignoreSet = new Set(ignore)
    const box = { x, y, w, h }
    for (let i = 0; i < 400; i++) {
      const hit = state.nodes.find((n) => !ignoreSet.has(n.id) && overlaps(box, n))
      if (!hit) return { x: box.x, y: box.y }
      box.y = hit.y + hit.h + GAP_Y
    }
    return { x: box.x, y: box.y }
  }

  /** 计算派生子节点的落点：父节点右侧一列，按数量垂直居中排布 */
  function childSpot(parent, indexInBatch = 0, batchSize = 1, type = 'image') {
    const size = SIZE[type]
    const totalH = batchSize * size.h + (batchSize - 1) * GAP_Y
    // 起点按批次垂直居中于父节点，已有的子节点交给 findFreeSpot 向下避让
    const startY = parent.y + parent.h / 2 - totalH / 2
    const wish = {
      x: parent.x + parent.w + GAP_X,
      y: startY + indexInBatch * (size.h + GAP_Y)
    }
    return findFreeSpot(wish.x, wish.y, size.w, size.h)
  }

  /** 按血缘层级重新排布整张画布 */
  function tidyLayout() {
    pushUndo()
    const depth = new Map()
    const roots = state.nodes.filter((n) => parentEdgesOf(n.id).length === 0)
    const queue = roots.map((n) => ({ n, d: 0 }))
    roots.forEach((n) => depth.set(n.id, 0))
    while (queue.length) {
      const { n, d } = queue.shift()
      childrenOf(n.id).forEach((c) => {
        const nd = Math.max(depth.get(c.id) ?? 0, d + 1)
        if (!depth.has(c.id) || nd > depth.get(c.id)) {
          depth.set(c.id, nd)
          queue.push({ n: c, d: nd })
        }
      })
    }
    state.nodes.forEach((n) => { if (!depth.has(n.id)) depth.set(n.id, 0) })

    const columns = new Map()
    state.nodes.forEach((n) => {
      const d = depth.get(n.id)
      if (!columns.has(d)) columns.set(d, [])
      columns.get(d).push(n)
    })

    // 让子节点尽量贴近父节点的顺序
    const order = new Map()
    state.nodes.forEach((n, i) => order.set(n.id, i))
    let x = 0
    ;[...columns.keys()].sort((a, b) => a - b).forEach((d) => {
      const col = columns.get(d)
      col.sort((a, b) => {
        const pa = parentsOf(a.id)[0]
        const pb = parentsOf(b.id)[0]
        const ka = pa ? order.get(pa.id) : order.get(a.id)
        const kb = pb ? order.get(pb.id) : order.get(b.id)
        return ka - kb
      })
      const colW = Math.max(...col.map((n) => n.w))
      const totalH = col.reduce((s, n) => s + n.h, 0) + (col.length - 1) * GAP_Y
      let y = -totalH / 2
      col.forEach((n) => {
        n.x = x
        n.y = y
        y += n.h + GAP_Y
      })
      x += colW + GAP_X
    })
    emit('layout')
  }

  function bounds(nodes = state.nodes) {
    if (!nodes.length) return null
    const minX = Math.min(...nodes.map((n) => n.x))
    const minY = Math.min(...nodes.map((n) => n.y))
    const maxX = Math.max(...nodes.map((n) => n.x + n.w))
    const maxY = Math.max(...nodes.map((n) => n.y + n.h))
    return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY }
  }

  function reset() {
    state.nodes = []
    state.edges = []
    state.selection = []
    undoStack = []
    redoStack = []
    emit('reset')
  }

  return {
    SIZE, TYPE_LABEL, KIND_LABEL,
    state, subscribe, emit,
    pushUndo, undo, redo,
    nodeById, addNode, patchNode, removeNodes,
    addEdge, patchEdge, childrenOf, parentsOf, parentEdgesOf,
    setSelection, toggleSelection, selectedNodes,
    findFreeSpot, childSpot, tidyLayout, bounds, reset
  }
})()
