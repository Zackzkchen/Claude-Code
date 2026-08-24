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
    Store.setSelection([node.id])
    requestAnimationFrame(() => {
      const el = document.querySelector(`.node[data-id="${node.id}"] .node-text`)
      el?.focus()
    })
    U.toast('文本节点已创建，<span class="k">直接键盘输入</span>即可')
    return node
  }

  function createMediaNode(type) {
    const node = createNodeAtCenter(type)
    Store.setSelection([node.id])
    Canvas.focusNode(node.id, { select: false })
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
    <p>这是「全民创作 Agent」桌面端的可操作 Demo：<b>左侧无限画布</b> + <b>右侧 Agent 对话</b>，两边共享同一份素材图谱。</p>
    <h4>一、画布视口（MVP 必备）</h4>
    <ul>
      <li>空白处拖拽 = 平移；<kbd>空格</kbd>+拖拽 / 中键拖拽 / <kbd>Alt</kbd>+拖拽 也可平移</li>
      <li>滚轮 = 以光标为中心缩放；<kbd>Shift</kbd>/<kbd>Alt</kbd>+滚轮 = 平移</li>
      <li>右上角：<kbd>适配画面</kbd>（Shift+1）、<kbd>100%</kbd>、<kbd>整理布局</kbd>（按血缘层级重排）</li>
    </ul>
    <h4>二、素材节点（三类）</h4>
    <ul>
      <li><b>文本</b>：底部「文本」按 ＋ 新建后直接键盘输入；空白处双击也能快速建卡</li>
      <li><b>图片</b>：卡片内「上传本地图片」或「AI 生成图片」（写提示词 → 生成中进度 → 出图）</li>
      <li><b>视频</b>：卡片内「上传本地视频」或「AI 生成视频」；本地视频可点播，AI 视频用封面+时间轴模拟</li>
      <li>支持把本地文件直接拖到画布空白处或拖到空节点上</li>
    </ul>
    <h4>三、派生与血缘（核心）</h4>
    <ul>
      <li>选中节点 → 悬浮条「✦ 生成」或卡片右侧 <kbd>＋</kbd> 手柄，打开生成菜单</li>
      <li>文本 → 人物图 / 场景图 / 商品图 / 直接生成视频 / 拆分镜</li>
      <li>图片 → 图生视频 / 同系列图 / 看图写文案；视频 → 提取封面 / 延长镜头</li>
      <li>多选（<kbd>Shift</kbd>+点选，或 <kbd>Shift</kbd>+空白拖拽框选）→「合成为一条成片」，形成多对一血缘</li>
      <li>连线标签显示生成关系；选中节点会高亮它的整条血缘链，其余淡出；卡片底部「来自：…」可一键回溯父节点</li>
    </ul>
    <h4>四、对话与画布联动</h4>
    <ul>
      <li>选中节点后，输入框上方出现上下文胶囊，指令默认作用于该节点</li>
      <li>Agent 回复带任务卡：分步状态 + 产出节点列表，点节点条目可飞行定位到画布</li>
      <li>Agent 执行时画布顶部出现「Agent 正在操作画布」，新建节点带高亮呼吸</li>
    </ul>
    <h4>五、编辑与安全</h4>
    <ul>
      <li>拖拽移动（多选可整组移动）、<kbd>Delete</kbd> 删除、<kbd>Ctrl/⌘+Z</kbd> 撤销 / <kbd>Shift+Z</kbd> 重做、<kbd>Ctrl/⌘+A</kbd> 全选</li>
      <li>删除节点会同时清理它的连线；撤销可回到删除前</li>
    </ul>
    <h4>不在 MVP 里（下一版再做）</h4>
    <ul>
      <li>手动拉线连接任意两个节点、成组 / 画框、便签与批注</li>
      <li>缩略图导航（minimap）、多人协作光标、版本对比</li>
      <li>节点内多轮局部重绘（inpainting）、时间轴级剪辑</li>
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
    Canvas.init()
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
