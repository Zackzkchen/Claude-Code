/* 应用装配：底部工具栏、文件上传、分栏拖拽、演示引导 */
window.App = (function () {
  let pendingNodeId = null

  /* ---------------- 新增节点 ---------------- */
  function createNodeAtCenter(type, opts = {}) {
    const center = Canvas.viewCenter()
    const size = Store.SIZE[type]
    const spot = Store.findFreeSpot(center.x - size.w / 2, center.y - size.h / 2, size.w, size.h)
    Store.pushUndo()
    return Store.addNode({ type, x: spot.x, y: spot.y, ...opts })
  }

  function createTextNode(pos = null) {
    const node = pos
      ? (Store.pushUndo(), Store.addNode({ type: 'text', title: '文本', ...pos }))
      : createNodeAtCenter('text', { title: '文本' })
    Canvas.startEditing(node.id)
    return node
  }

  function createMediaNode(type, pos = null) {
    const node = pos
      ? (Store.pushUndo(), Store.addNode({ type, ...pos }))
      : createNodeAtCenter(type)
    Store.setSelection([node.id])
    if (!pos) Canvas.focusNode(node.id, { select: false })
    return node
  }

  /* ---------------- 本地素材上传 ---------------- */
  function pickFileInto(nodeId) {
    const node = Store.nodeById(nodeId)
    if (!node) return
    pendingNodeId = nodeId
    document.getElementById(node.type === 'video' ? 'file-video' : 'file-image').click()
  }

  function loadFileInto(nodeId, file) {
    const node = Store.nodeById(nodeId)
    if (!node || !file) return
    const isVideo = file.type.startsWith('video')
    if ((node.type === 'video') !== isVideo) {
      U.toast(`该节点需要${node.type === 'video' ? '视频' : '图片'}文件`)
      return
    }
    const url = URL.createObjectURL(file)
    Store.pushUndo()
    Store.patchNode(nodeId, {
      status: 'ready',
      progress: 1,
      source: 'upload',
      mediaKind: 'file',
      src: url,
      kind: 'upload',
      title: `本地${isVideo ? '视频' : '图片'} · ${U.truncate(file.name.replace(/\.[^.]+$/, ''), 8)}`
    })
    U.toast(`已导入本地素材：<span class="k">${U.escapeHtml(U.truncate(file.name, 18))}</span>`)
    probeMediaSize(nodeId, url, isVideo)
  }

  /** 读一下本地素材的真实尺寸 / 时长，详情页要展示 */
  function probeMediaSize(nodeId, url, isVideo) {
    if (isVideo) {
      const v = document.createElement('video')
      v.preload = 'metadata'
      v.addEventListener('loadedmetadata', () => {
        Store.patchNode(nodeId, { mediaW: v.videoWidth, mediaH: v.videoHeight, duration: v.duration || 0 })
      })
      v.src = url
      return
    }
    const img = new Image()
    img.onload = () => Store.patchNode(nodeId, { mediaW: img.naturalWidth, mediaH: img.naturalHeight })
    img.src = url
  }

  function createNodeFromFile(file, pos) {
    const isVideo = file.type.startsWith('video')
    if (!isVideo && !file.type.startsWith('image')) {
      U.toast('目前仅支持图片 / 视频素材')
      return null
    }
    Store.pushUndo()
    const node = Store.addNode({ type: isVideo ? 'video' : 'image', x: pos.x, y: pos.y })
    loadFileInto(node.id, file)
    return node
  }

  /* ---------------- 分栏拖拽 ---------------- */
  function bindResizer() {
    const resizer = document.getElementById('pane-resizer')
    const pane = document.getElementById('chat-pane')
    resizer.addEventListener('pointerdown', (e) => {
      e.preventDefault()
      const startX = e.clientX
      const startW = pane.offsetWidth
      const move = (ev) => {
        const w = U.clamp(startW - (ev.clientX - startX), 320, 620)
        pane.style.flex = `0 0 ${w}px`
        pane.style.width = `${w}px`
        Canvas.applyViewport()
      }
      const up = () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    })
  }

  /* ---------------- 引导 / 说明 ---------------- */
  const GUIDE_HTML = `
    <p>左边是无限画布，右边是全民创作 Agent，两边共享同一份素材图谱。<b>卡片默认只显示内容本身</b>，功能藏在 hover / 右键里。</p>
    <h4>一、画布视口</h4>
    <ul>
      <li>空白处拖拽 = 平移；<kbd>空格</kbd> / 中键 / <kbd>Alt</kbd>+拖拽 也可平移</li>
      <li>滚轮 = 以光标为中心缩放；右上角三个图标依次是「整理布局」「适配画面」和缩放</li>
      <li><kbd>Shift</kbd>+空白拖拽 = 框选；<kbd>Shift</kbd>+点选 = 多选</li>
    </ul>
    <h4>二、新建素材</h4>
    <ul>
      <li>双击画布空白处 = 新建文本并立刻进入输入；底部 Dock 三个按钮分别新建文本 / 图片 / 视频</li>
      <li>图片、视频卡片里只有两个入口：<b>上传本地</b> 或 <b>AI 生成</b>（写一句提示词）</li>
      <li>本地文件可以直接拖到画布空白处，或拖到空节点上</li>
    </ul>
    <h4>三、节点上的功能（hover 才出现）</h4>
    <ul>
      <li>鼠标移到卡片上（或选中它），卡片上方浮出一条<b>图标凸巴</b>，把鼠标停在图标上会显示它是什么</li>
      <li>文本：继续生成 / 编辑 / 复制 / 下载 / 删除；图片：继续生成 / 查看详情 / 下载 / 删除；视频：查看详情 / 下载 / 删除</li>
      <li>卡片下方那行小字是标题和来源，同样只在 hover / 选中时出现</li>
      <li><b>右键</b>任意卡片可以拿到同一套功能（多选时右键则是「合成为一条成片」）</li>
      <li>双击：文本 = 改字，图片 / 视频 = 打开局部放大预览</li>
    </ul>
    <h4>四、派生与血缘（核心）</h4>
    <ul>
      <li>文本 → <b>文生图</b> / <b>文生视频</b>：文本本身就是提示词，点了立刻开始生成，出现占位卡 + 进度</li>
      <li>文本 → <b>拆分镜</b>：一条脚本拆成 3 条分镜文本</li>
      <li>图片 → <b>图生视频</b>：先落一个空视频节点，把这张图作为<b>参考图</b>挂进它的提示词框，你补一句运镜再生成</li>
      <li>多选 → 右键「合成为一条成片」，形成多对一血缘</li>
      <li>连线标签就是能力名（文生图 / 图生视频 / 合成）；选中节点会高亮它的整条血缘链</li>
    </ul>
    <h4>五、查看详情 = 局部放大预览</h4>
    <ul>
      <li>凸巴上的 <kbd>⤢</kbd>、右键「查看详情」或双击卡片都能打开</li>
      <li>它不是另一套界面，就是<b>把这块画布放大</b>：同样的卡片、同样的连线标签，只把范围收敛到「当前节点 + 直接上下游」</li>
      <li>右侧详情栏放卡片上放不下的信息：提示词、素材尺寸、血缘路径、下游产物、继续生成</li>
      <li>点上下游卡片继续深入，<kbd>←</kbd> <kbd>→</kbd> 翻同批产物，<kbd>Esc</kbd> 返回</li>
    </ul>
    <h4>六、编辑与安全</h4>
    <ul>
      <li>拖拽移动（多选整组移动）、<kbd>Delete</kbd> 删除、<kbd>Ctrl/⌘+Z</kbd> 撤销 / <kbd>Shift+Z</kbd> 重做、<kbd>Ctrl/⌘+A</kbd> 全选、<kbd>Enter</kbd> 打开选中节点</li>
    </ul>
    <h4>刻意砍掉的东西</h4>
    <ul>
      <li>卡片上常驻的标题栏、类型徽标、来源脚注、派生计数、右侧 ⊕ 手柄 —— 与凸巴 / 右键重复，或本来就能从内容看出来</li>
      <li>手动菜单里的「人物图 / 场景图 / 商品图」三选一 —— 收敛成「文生图」，复杂意图交给右侧 Agent 去说</li>
      <li>视频的「提取封面 / 延长镜头」、图片的「同系列图 / 看图写文案」、节点「复制」—— 低频，不进 MVP</li>
      <li>手动拉线连节点、编组画框、minimap、局部重绘、多人协作 —— 下一版再看</li>
    </ul>
  `

  function bindGuide() {
    const modal = document.getElementById('guide-modal')
    document.getElementById('guide-body').innerHTML = GUIDE_HTML
    const open = () => { modal.hidden = false }
    const close = () => { modal.hidden = true }
    document.getElementById('btn-guide').addEventListener('click', open)
    document.getElementById('btn-guide-close').addEventListener('click', close)
    modal.addEventListener('click', (e) => { if (e.target === modal) close() })
  }

  /* ---------------- 初始内容 ---------------- */
  function seed() {
    const node = Store.addNode({
      type: 'text',
      kind: 'script',
      title: '脚本 · 示例',
      x: -520,
      y: -100,
      text: Generate.makeScript('国风护手霜'),
      source: 'manual'
    })
    Store.setSelection([])
    Canvas.fitView(Store.state.nodes, 120, 1)
    return node
  }

  async function welcome() {
    await Chat.pushAgent(
      '我是<b>全民创作 Agent</b>。左边这块是无限画布，右边是我。<br>' +
      '你可以：① 在画布上新建<b>文本 / 图片 / 视频</b>素材；② 选中任意节点让我<b>继续派生</b>（脚本→图→视频→成片）；③ 直接一句话让我把整条链路做完。<br>' +
      '画布上已经放了一段示例脚本，选中它试试卡片右侧的 <b>＋</b>。'
    )
    Chat.pushSuggestions(['帮我做一条国风护手霜的短视频', '基于这段脚本生成人物图', '在画布上加一段脚本文本'])
  }

  function reset() {
    Store.reset()
    seed()
    document.getElementById('chat-scroll').replaceChildren()
    Chat.pushSystem('已重置画布与对话')
    welcome()
  }

  /* ---------------- 装配 ---------------- */
  function init() {
    UI.init()
    Canvas.init()
    Preview.init()
    Chat.init((text) => Agent.handle(text))

    document.getElementById('dock-text').addEventListener('click', () => createTextNode())
    document.getElementById('dock-image').addEventListener('click', () => createMediaNode('image'))
    document.getElementById('dock-video').addEventListener('click', () => createMediaNode('video'))

    document.getElementById('btn-fit').addEventListener('click', () => Canvas.fitView())
    document.getElementById('btn-zoom-in').addEventListener('click', () => Canvas.zoomBy(1.18))
    document.getElementById('btn-zoom-out').addEventListener('click', () => Canvas.zoomBy(1 / 1.18))
    document.getElementById('btn-zoom-reset').addEventListener('click', () => Canvas.resetZoom())
    document.getElementById('btn-tidy').addEventListener('click', async () => {
      Store.tidyLayout()
      await Canvas.fitView(Store.state.nodes, 90, 1)
      U.toast('已按血缘层级整理布局')
    })

    document.getElementById('btn-reset').addEventListener('click', reset)
    document.getElementById('btn-autoplay').addEventListener('click', () => {
      if (Agent.isBusy()) return
      Store.reset()
      seed()
      Chat.setInput('')
      Agent.handle('帮我做一条国风护手霜的短视频')
    })

    document.querySelectorAll('[data-noop]').forEach((el) => {
      el.addEventListener('click', () => U.toast('Demo 只实现了「全民创作 Agent」这一个模块'))
    })

    ;['file-image', 'file-video'].forEach((id) => {
      document.getElementById(id).addEventListener('change', (e) => {
        const file = e.target.files?.[0]
        if (file && pendingNodeId) loadFileInto(pendingNodeId, file)
        pendingNodeId = null
        e.target.value = ''
      })
    })

    bindResizer()
    bindGuide()

    window.addEventListener('resize', () => Canvas.applyViewport())

    seed()
    welcome()
  }

  return { init, createTextNode, createMediaNode, createNodeAtCenter, createNodeFromFile, pickFileInto, loadFileInto, reset }
})()

document.addEventListener('DOMContentLoaded', () => window.App.init())
