/* 全民创作 Agent：把自然语言指令翻译成画布操作（建节点 / 派生生成 / 连血缘 / 排布局） */
window.Agent = (function () {
  let busy = false

  const A = (type, id) => window.Generate.ACTIONS[type].find((a) => a.id === id)

  function extractTopic(text) {
    let t = String(text || '')
      .replace(/^(帮我|请|麻烦|我想|我要|给我|来)\s*/g, '')
      .replace(/^(做|生成|写|创作|策划|出)\s*/g, '')
      .replace(/^(一条|一个|一支|一版|一份)\s*/g, '')
      .replace(/(的)?(短视频|带货视频|视频|成片|脚本|文案|广告|素材)\s*$/g, '')
      .trim()
    return t || '新品短视频'
  }

  /** 取指令的作用对象：优先选区，其次画布上最近的同类节点 */
  function target(types) {
    const wanted = [].concat(types)
    const sel = Store.selectedNodes().filter((n) => wanted.includes(n.type))
    if (sel.length) return { nodes: sel, fromSelection: true }
    const fallback = [...Store.state.nodes].reverse().find((n) => wanted.includes(n.type) && n.status === 'ready')
    return { nodes: fallback ? [fallback] : [], fromSelection: false }
  }

  function createTextNode({ title, text = '', source = 'agent' }) {
    const center = Canvas.viewCenter()
    const size = Store.SIZE.text
    const spot = Store.findFreeSpot(center.x - size.w / 2 - 220, center.y - size.h / 2, size.w, size.h)
    Store.pushUndo()
    return Store.addNode({ type: 'text', kind: 'script', title, text, x: spot.x, y: spot.y, source })
  }

  async function noteTarget(t, label) {
    if (!t.fromSelection && t.nodes.length) {
      await Chat.pushAgent(`没有选中节点，我默认基于画布上最近的${label}<b>「${U.escapeHtml(U.truncate(t.nodes[0].title, 12))}」</b>继续。`)
      Store.setSelection([t.nodes[0].id])
      await Canvas.focusNode(t.nodes[0].id)
    }
  }

  /* ---------------- 完整链路：一句话到成片 ---------------- */
  async function fullPipeline(userText) {
    const topic = extractTopic(userText)
    await Chat.pushAgent(`收到，我按「脚本 → 分素材 → 视频镜头 → 成片」的链路来做，全部产物会直接落在左侧画布上，并用连线标出继承关系。`)
    const card = Chat.taskCard(`${U.truncate(topic, 12)} · 15s 竖屏短视频`, [
      '拆解需求，规划创作链路',
      '生成带货脚本（文本节点）',
      '按脚本生成人物图 / 场景图 / 商品图',
      '把关键图转成视频镜头',
      '合成成片，标注素材血缘'
    ])

    card.start(0)
    await U.sleep(700)
    card.done(0, '链路：脚本 → 3 张图 → 2 个镜头 → 成片')

    // 1. 脚本
    card.start(1)
    const script = createTextNode({ title: `脚本 · ${U.truncate(topic, 8)}`, text: '' })
    Store.setSelection([script.id])
    await Canvas.focusNode(script.id, { scale: 1 })
    Canvas.flashNode(script.id)
    await Generate.typeText(script.id, Generate.makeScript(topic))
    card.done(1, '脚本已生成：4 个镜头 / 15s')

    // 2. 三类图片（同一父节点派生，形成一对多血缘）
    card.start(2)
    const imgActions = [
      { ...A('text', 'character'), count: 1, variants: ['女主角 · 正面特写'] },
      { ...A('text', 'scene'), count: 1, variants: ['使用场景'] },
      { ...A('text', 'product'), count: 1, variants: ['商品主图'] }
    ]
    const images = []
    for (const action of imgActions) {
      const ids = await Generate.run([script], action, { source: 'agent', follow: false, select: false })
      images.push(...ids)
    }
    await Canvas.fitView(Store.state.nodes, 110, 1)
    card.done(2, '已生成 3 张图：人物 / 场景 / 商品')
    card.addNodes(images)

    // 3. 图生视频
    card.start(3)
    const videoParents = images.slice(1) // 场景图 + 商品图
    const videos = []
    for (const id of videoParents) {
      const ids = await Generate.run([Store.nodeById(id)], { ...A('image', 'i2v'), count: 1 }, {
        source: 'agent', follow: false, select: false
      })
      videos.push(...ids)
    }
    await Canvas.fitView(Store.state.nodes, 110, 1)
    card.done(3, '已生成 2 个视频镜头（图生视频）')
    card.addNodes(videos)

    // 4. 合成成片
    card.start(4)
    const finals = await Generate.run(videos.map(Store.nodeById), Generate.COMPOSE, {
      source: 'agent', follow: false, select: false
    })
    Store.tidyLayout()
    await Canvas.fitView(Store.state.nodes, 90, 1)
    card.done(4, '成片已生成，血缘已标注')
    card.addNodes(finals)

    Store.setSelection(finals)
    await Chat.pushAgent(
      `做完了。画布上现在是一条完整的创作链路：<b>脚本</b> → <b>3 张分类素材图</b> → <b>2 个视频镜头</b> → <b>成片</b>，连线上的标签就是每一步的生成关系。<br>点击成片节点可以沿连线回溯到它用了哪些素材；想改哪一环，选中那个节点继续对我说就行。`
    )
    Chat.pushSuggestions(['把人物图也做成视频镜头', '商品图换成礼盒质感重新生成', '整理一下画布布局'])
  }

  /* ---------------- 单步意图 ---------------- */
  async function genScript(userText) {
    const topic = extractTopic(userText)
    const card = Chat.taskCard(`脚本 · ${U.truncate(topic, 12)}`, ['理解主题与卖点', '在画布新建文本节点', '逐句写入脚本'])
    card.start(0)
    await U.sleep(420)
    card.done(0)
    card.start(1)
    const node = createTextNode({ title: `脚本 · ${U.truncate(topic, 8)}`, text: '' })
    Store.setSelection([node.id])
    await Canvas.focusNode(node.id, { scale: 1 })
    Canvas.flashNode(node.id)
    card.done(1)
    card.start(2)
    await Generate.typeText(node.id, Generate.makeScript(topic))
    card.done(2)
    card.addNodes([node.id])
    await Chat.pushAgent('脚本已经写到画布上了。选中它就能继续派生人物图 / 场景图 / 商品图，或者直接生成视频。')
    Chat.pushSuggestions(['基于这段脚本生成人物图', '拆成 3 条分镜', '直接生成视频'])
  }

  async function genImages(userText, kind) {
    const t = target('text')
    if (!t.nodes.length) {
      await Chat.pushAgent('画布上还没有可用的脚本文本。要不要我先写一段脚本？')
      Chat.pushSuggestions(['写一个 15s 带货脚本', '帮我做一条国风护手霜的短视频'])
      return
    }
    await noteTarget(t, '脚本节点')
    const label = { character: '人物图', scene: '场景图', product: '商品图' }[kind]
    const count = /(\d+)\s*张/.test(userText) ? U.clamp(parseInt(RegExp.$1, 10), 1, 4) : 2
    const card = Chat.taskCard(`基于脚本生成 ${count} 张${label}`, [`读取「${U.truncate(t.nodes[0].title, 10)}」`, `生成 ${count} 张${label}并连线`])
    card.start(0)
    await U.sleep(360)
    card.done(0)
    card.start(1)
    const base = A('text', kind)
    const ids = await Generate.run(t.nodes, {
      ...base,
      count,
      variants: base.variants.concat(['补充机位 A', '补充机位 B'])
    }, { source: 'agent', select: false })
    card.done(1)
    card.addNodes(ids)
    Store.setSelection(ids)
    await Chat.pushAgent(`${count} 张${label}已挂在脚本节点下方，连线标签是「${base.edge}」。选中任意一张可以继续「图生视频」。`)
    Chat.pushSuggestions(['把这些图生成视频镜头', '再生成两张同系列图', '整理一下画布布局'])
  }

  async function genVideoFromText() {
    const t = target('text')
    if (!t.nodes.length) {
      await Chat.pushAgent('先给我一段脚本或选中一个文本节点，我才能文生视频。')
      return
    }
    await noteTarget(t, '脚本节点')
    const card = Chat.taskCard('文生视频', ['解析脚本镜头', '生成 5s 竖屏视频'])
    card.start(0)
    await U.sleep(340)
    card.done(0)
    card.start(1)
    const ids = await Generate.run(t.nodes, A('text', 't2v'), { source: 'agent', select: false })
    card.done(1)
    card.addNodes(ids)
    Store.setSelection(ids)
    await Chat.pushAgent('视频已生成，连线标签「文生视频」表示它直接继承自脚本节点。')
    Chat.pushSuggestions(['提取封面图', '再延长 3s', '把选中的素材合成一条成片'])
  }

  async function genVideoFromImage() {
    const t = target('image')
    if (!t.nodes.length) {
      await Chat.pushAgent('画布上还没有图片素材。可以先上传一张，或让我按脚本生成。')
      Chat.pushSuggestions(['基于这段脚本生成人物图', '写一个 15s 带货脚本'])
      return
    }
    await noteTarget(t, '图片节点')
    const card = Chat.taskCard(`图生视频 × ${t.nodes.length}`, ['以图片为首帧规划运镜', '生成视频并连线'])
    card.start(0)
    await U.sleep(320)
    card.done(0)
    card.start(1)
    const ids = await Generate.run(t.nodes, A('image', 'i2v'), { source: 'agent', select: false })
    card.done(1)
    card.addNodes(ids)
    Store.setSelection(ids)
    await Chat.pushAgent('镜头出来了。画布上「图片 → 视频」的连线就是这次的继承关系。')
    Chat.pushSuggestions(['把选中的素材合成一条成片', '提取封面图', '整理一下画布布局'])
  }

  async function genShots() {
    const t = target('text')
    if (!t.nodes.length) {
      await Chat.pushAgent('先要有脚本文本，我才能拆分镜。')
      return
    }
    await noteTarget(t, '脚本节点')
    const card = Chat.taskCard('拆分镜', ['按节奏切分镜头', '生成 3 条分镜文本'])
    card.start(0)
    await U.sleep(300)
    card.done(0)
    card.start(1)
    const ids = await Generate.run(t.nodes, A('text', 'shots'), { source: 'agent', select: false })
    card.done(1)
    card.addNodes(ids)
    await Chat.pushAgent('已拆成 3 条分镜文本，每条都挂在原脚本下面。可以对单条分镜继续生成画面。')
    Chat.pushSuggestions(['给分镜 1 生成场景图', '把分镜都生成视频', '整理一下画布布局'])
  }

  async function compose() {
    let nodes = Store.selectedNodes()
    if (nodes.length < 2) {
      nodes = Store.state.nodes.filter((n) => n.type === 'video' && n.status === 'ready' && n.kind !== 'final')
    }
    if (nodes.length < 2) {
      await Chat.pushAgent('至少要有 2 个素材才能合成成片。先选中画布上的多个节点（Shift 点选），或者让我先生成几个镜头。')
      return
    }
    const card = Chat.taskCard(`合成成片（${nodes.length} 个素材）`, ['排列镜头顺序 / 转场', '渲染成片并标注血缘'])
    card.start(0)
    await U.sleep(420)
    card.done(0)
    card.start(1)
    const ids = await Generate.run(nodes, Generate.COMPOSE, { source: 'agent', select: false })
    card.done(1)
    card.addNodes(ids)
    Store.setSelection(ids)
    await Chat.pushAgent('成片节点已生成，它同时连着刚才用到的每个素材——这就是画布上的多对一血缘。')
    Chat.pushSuggestions(['整理一下画布布局', '把成片再延长 3s'])
  }

  async function simpleDerive(actionType, actionId, typeLabel) {
    const t = target(actionType)
    if (!t.nodes.length) {
      await Chat.pushAgent(`画布上暂时没有${typeLabel}节点。`)
      return
    }
    await noteTarget(t, `${typeLabel}节点`)
    const action = A(actionType, actionId)
    const card = Chat.taskCard(action.label, ['准备素材', `${action.label}并连线`])
    card.start(0)
    await U.sleep(280)
    card.done(0)
    card.start(1)
    const ids = await Generate.run(t.nodes, action, { source: 'agent', select: false })
    card.done(1)
    card.addNodes(ids)
    Store.setSelection(ids)
    await Chat.pushAgent(`已完成「${action.label}」，连线标签为「${action.edge}」。`)
  }

  async function addBlank(type) {
    const node = window.App.createNodeAtCenter(type, { source: 'agent' })
    Store.setSelection([node.id])
    await Canvas.focusNode(node.id)
    Canvas.flashNode(node.id)
    const tip = {
      text: '我在画布上放了一个文本节点，直接点进去用键盘输入就行。',
      image: '图片节点已就位：卡片里可以「上传本地图片」，也可以点「AI 生成图片」写提示词。',
      video: '视频节点已就位：支持「上传本地视频」或「AI 生成视频」。'
    }
    await Chat.pushAgent(tip[type])
  }

  async function tidy() {
    Store.tidyLayout()
    await Canvas.fitView(Store.state.nodes, 90, 1)
    await Chat.pushAgent('已按血缘层级重新排布：同一代素材在同一列，从左到右就是生成顺序。')
  }

  async function fallback(text) {
    await Chat.pushAgent(
      `我可以直接在左侧画布上帮你干这些活：<br>` +
      `· 写<b>脚本 / 分镜 / 口播文案</b>（文本节点）<br>` +
      `· 按脚本生成<b>人物图 / 场景图 / 商品图</b><br>` +
      `· <b>文生视频</b>、<b>图生视频</b>、把多个素材<b>合成成片</b><br>` +
      `· 整理画布布局、按血缘回溯素材来源<br><br>` +
      `你也可以先在画布上选中一个节点，再对我说"基于它做什么"。`
    )
    Chat.pushSuggestions(['帮我做一条国风护手霜的短视频', '写一个 15s 带货脚本', '在画布上加一段脚本文本'])
  }

  /* ---------------- 意图路由 ---------------- */
  async function route(text) {
    const sel = Store.selectedNodes()
    const hasImageSel = sel.some((n) => n.type === 'image')
    const hasTextSel = sel.some((n) => n.type === 'text')

    if (/整理|排版|布局|对齐/.test(text)) return tidy()
    if (/合成|串成|成片|拼成/.test(text)) return compose()
    if (/封面/.test(text)) return simpleDerive('video', 'cover', '视频')
    if (/延长|加长|再来\s*\d*s/.test(text)) return simpleDerive('video', 'extend', '视频')
    if (/(加|新增|添加|插入).*(文本|文字|脚本节点)/.test(text)) return addBlank('text')
    if (/(加|新增|添加|插入).*(图片|图)/.test(text) && !/生成/.test(text)) return addBlank('image')
    if (/(加|新增|添加|插入).*(视频)/.test(text) && !/生成/.test(text)) return addBlank('video')
    if (/分镜/.test(text) && /拆|切|分成|拆成/.test(text)) return genShots()
    if (/口播|卖点文案|看图写/.test(text) && hasImageSel) return simpleDerive('image', 'copy', '图片')

    if (/人物|角色|模特|主角/.test(text)) return genImages(text, 'character')
    if (/场景|环境|背景|空镜/.test(text)) return genImages(text, 'scene')
    if (/商品|产品图|静物|礼盒/.test(text) && !/视频/.test(text)) return genImages(text, 'product')

    if (/视频|镜头/.test(text)) {
      // 明显的"整条链路"诉求优先走全流程
      if (/一键|完整|全流程|全套|帮我做|做一条|做一支|做一个/.test(text)) return fullPipeline(text)
      if (/图生|这张图|图片|把图|用图/.test(text) || (hasImageSel && !hasTextSel)) return genVideoFromImage()
      if (hasTextSel || /脚本|文生/.test(text)) return genVideoFromText()
      // 描述性需求 → 走完整链路
      if (/(做|生成|创作|来).*(短视频|视频|成片)/.test(text)) return fullPipeline(text)
      return genVideoFromImage()
    }

    if (/脚本|文案|台词/.test(text)) return genScript(text)
    if (/一键|完整|全流程|全套|帮我做/.test(text)) return fullPipeline(text)
    return fallback(text)
  }

  async function handle(text) {
    if (busy) return
    busy = true
    Chat.setBusy(true)
    Chat.pushUser(text)
    try {
      await route(text)
    } catch (err) {
      console.error(err)
      await Chat.pushAgent('刚才那步执行失败了，可以再说一次。')
    } finally {
      busy = false
      Chat.setBusy(false)
      Chat.syncContext()
    }
  }

  const isBusy = () => busy

  return { handle, isBusy, fullPipeline, extractTopic }
})()
