/* 派生生成：菜单动作定义 + 生成过程模拟 + 血缘连线 */
window.Generate = (function () {
  const ACTIONS = {
    text: [
      {
        id: 'character', label: '生成人物图', desc: '从脚本提取角色形象', to: 'image', kind: 'character',
        edge: '生成人物图', count: 2, variants: ['女主角 · 正面特写', '女主角 · 侧脸中景'],
        hint: '人物特写，柔光，胶片质感，竖构图'
      },
      {
        id: 'scene', label: '生成场景图', desc: '按脚本生成环境氛围', to: 'image', kind: 'scene',
        edge: '生成场景图', count: 2, variants: ['清晨街巷', '室内暖光'],
        hint: '场景氛围，浅景深，电影感光线'
      },
      {
        id: 'product', label: '生成商品图', desc: '突出卖点的商品静物', to: 'image', kind: 'product',
        edge: '生成商品图', count: 2, variants: ['主图 · 正面', '细节 · 质感特写'],
        hint: '商品静物，柔光棚拍，高级质感'
      },
      { sep: true },
      {
        id: 't2v', label: '直接生成视频', desc: '文生视频，5s 竖屏', to: 'video', kind: 'ai',
        edge: '文生视频', count: 1, variants: ['文生视频 5s'], hint: '按脚本生成连续镜头，竖屏 9:16'
      },
      {
        id: 'shots', label: '拆分镜脚本', desc: '拆成 3 条分镜文本', to: 'text', kind: 'shot',
        edge: '拆分镜', count: 3, variants: ['分镜 1', '分镜 2', '分镜 3']
      }
    ],
    image: [
      {
        id: 'i2v', label: '图生视频', desc: '以该图为首帧生成运镜', to: 'video', kind: 'ai',
        edge: '图生视频', count: 1, variants: ['图生视频 5s'], hint: '以该图为首帧，缓慢推镜'
      },
      {
        id: 'variant', label: '生成同系列图', desc: '保持风格换角度', to: 'image', kind: 'same',
        edge: '同系列图', count: 2, variants: ['换角度 A', '换角度 B'], hint: '同风格不同机位'
      },
      { sep: true },
      {
        id: 'copy', label: '看图写文案', desc: '生成口播 / 卖点文案', to: 'text', kind: 'copy',
        edge: '看图写文案', count: 1, variants: ['口播文案']
      }
    ],
    video: [
      {
        id: 'cover', label: '提取封面图', desc: '取一帧做封面', to: 'image', kind: 'cover',
        edge: '提取封面', count: 1, variants: ['封面图'], hint: '高信息量首帧'
      },
      {
        id: 'extend', label: '延长镜头 3s', desc: '续接同风格镜头', to: 'video', kind: 'ai',
        edge: '延长镜头', count: 1, variants: ['延长 3s'], hint: '延续上一镜头运动'
      }
    ]
  }

  const COMPOSE = {
    id: 'compose', label: '合成为一条成片', desc: '把选中素材串成完整视频', to: 'video', kind: 'final',
    edge: '合成成片', count: 1, variants: ['成片 · 竖屏'], hint: '按素材顺序合成，带转场与配乐', multiParent: true
  }

  function actionsFor(nodes) {
    if (!nodes.length) return []
    if (nodes.length > 1) {
      const types = new Set(nodes.map((n) => n.type))
      const list = [COMPOSE]
      if (types.size === 1) list.push({ sep: true }, ...ACTIONS[nodes[0].type])
      return list
    }
    return ACTIONS[nodes[0].type] || []
  }

  /* ---------------- 文本内容模板 ---------------- */
  function topicOf(node) {
    if (!node) return '产品短视频'
    if (node.type === 'text') {
      const line = String(node.text || '').split('\n').find((l) => l.trim())
      return U.truncate((line || node.title).replace(/^[【\[]?(主题|标题)[】\]]?[:：]?/, ''), 18)
    }
    return U.truncate(node.prompt || node.title, 18)
  }

  function makeScript(topic) {
    return [
      `【主题】${topic}`,
      '【时长】15s 竖屏 · 卖点前置',
      '',
      `镜头 1（0-3s）钩子：痛点特写，画外音"${U.truncate(topic, 10)}到底值不值？"`,
      `镜头 2（3-7s）产品出场：${U.truncate(topic, 10)}从光影中推入，展示细节质感。`,
      '镜头 3（7-12s）实测演示：真人使用，字幕打出核心卖点。',
      '镜头 4（12-15s）行动号召：手持出镜，字幕"点击下单立减 30"。'
    ].join('\n')
  }

  function makeShot(topic, index) {
    const shots = [
      `镜头 ${index}｜特写\n画面：${topic}主体入画，光从右侧打入。\n运镜：微推 + 手持轻晃\n时长：3s\n字幕：换季必备`,
      `镜头 ${index}｜中景\n画面：人物使用产品，背景虚化。\n运镜：跟随平移\n时长：4s\n字幕：3 秒成膜`,
      `镜头 ${index}｜产品特写\n画面：${topic}质感展示，转台旋转。\n运镜：环绕\n时长：3s\n字幕：立减 30`
    ]
    return shots[(index - 1) % shots.length]
  }

  function makeCopy(topic) {
    return [
      `【口播文案】${topic}`,
      '',
      '开场：一到换季，手就干得像砂纸。',
      '卖点：三秒成膜，不黏手，通勤包里塞得下。',
      '收尾：主页领券，今天下单立减 30。'
    ].join('\n')
  }

  function textFor(action, parent, index) {
    const topic = topicOf(parent)
    if (action.kind === 'shot') return makeShot(topic, index + 1)
    if (action.kind === 'copy') return makeCopy(topic)
    return makeScript(topic)
  }

  /* ---------------- 生成过程模拟 ---------------- */
  const DURATION = { image: [1500, 2400], video: [2400, 3600], text: [900, 1500] }

  async function runProgress(nodeId, type) {
    const [min, max] = DURATION[type] || DURATION.image
    const total = U.rand(min, max)
    const start = performance.now()
    while (true) {
      const t = U.clamp((performance.now() - start) / total, 0, 1)
      const node = Store.nodeById(nodeId)
      if (!node) return false
      Store.patchNode(nodeId, { progress: t }, 'progress')
      if (t >= 1) return true
      await U.tick(120)
    }
  }

  function posterKind(node, action, parent) {
    if (action && ['same', 'cover'].includes(action.kind)) {
      return Media.subKind(null, parent?.prompt || parent?.title)
    }
    if (action && ['character', 'scene', 'product'].includes(action.kind)) return action.kind
    const kind = Media.subKind(null, node.prompt)
    // 视频兜底给场景，避免出现太抽象的封面
    return kind === 'generic' && node.type === 'video' ? 'scene' : kind
  }

  /** 把一个空节点变成"已生成"节点（节点内 AI 生成入口 / 重试都走这里） */
  async function generateInto(nodeId, prompt, opts = {}) {
    const node = Store.nodeById(nodeId)
    if (!node) return null
    Store.patchNode(nodeId, {
      status: 'generating',
      progress: 0,
      prompt,
      source: opts.source || 'ai',
      loadingLabel: node.type === 'video' ? 'AI 正在生成视频…' : 'AI 正在生成图片…'
    })
    const ok = await runProgress(nodeId, node.type)
    if (!ok) return null

    const kind = opts.kind || Media.subKind(null, prompt)
    const w = node.type === 'video' ? 640 : 480
    const h = node.type === 'video' ? 360 : 400
    const url = Media.poster(kind, prompt, w, h)
    const patch = {
      status: 'ready',
      progress: 1,
      mediaKind: 'ai',
      title: opts.title || `${node.type === 'video' ? '视频' : '图片'} · ${U.truncate(prompt, 8)}`
    }
    if (node.type === 'video') {
      patch.poster = url
      patch.duration = opts.duration || 5
    } else {
      patch.src = url
    }
    Store.patchNode(nodeId, patch, 'generate:done')

    // 待生成连线转为已完成
    Store.state.edges.filter((e) => e.to === nodeId && e.status === 'pending')
      .forEach((e) => Store.patchEdge(e.id, { status: 'ready' }))
    return Store.nodeById(nodeId)
  }

  async function typeText(nodeId, fullText) {
    const chunk = 9
    for (let i = 0; i <= fullText.length; i += chunk) {
      const node = Store.nodeById(nodeId)
      if (!node) return
      node.text = fullText.slice(0, i)
      Store.emit('typing')
      await U.tick(38)
    }
    Store.patchNode(nodeId, { text: fullText, status: 'ready', progress: 1 }, 'generate:done')
    Store.state.edges.filter((e) => e.to === nodeId && e.status === 'pending')
      .forEach((e) => Store.patchEdge(e.id, { status: 'ready' }))
  }

  /**
   * 执行一次派生：为每个父节点创建 count 个子节点（compose 为多父合一）
   * @returns 新建节点 id 列表
   */
  async function run(parents, action, opts = {}) {
    const list = [].concat(parents).filter(Boolean)
    if (!list.length) return []
    Store.pushUndo()

    const created = []
    const tasks = []

    const spawn = (parentsForNode, indexInBatch, batchSize, anchor) => {
      const spot = Store.childSpot(anchor, indexInBatch, batchSize, action.to)
      const variant = action.variants?.[indexInBatch % action.variants.length] || ''
      const topic = topicOf(anchor)
      // 变体写进提示词，保证同一批产出的素材彼此不同
      const prompt = [topic, action.hint, variant].filter(Boolean).join('，')
      const titleMap = {
        image: `${Store.KIND_LABEL[action.kind] || '图片'}${variant ? ` · ${variant}` : ''}`,
        video: action.kind === 'final' ? `成片 · ${list.length * 5}s 竖屏` : `视频 · ${variant || 'AI 生成'}`,
        text: `${Store.KIND_LABEL[action.kind] || '文本'}${variant ? ` · ${variant}` : ''}`
      }
      const isFinal = action.kind === 'final'
      const node = Store.addNode({
        type: action.to,
        kind: action.kind === 'same' ? (anchor.kind || 'ai') : action.kind,
        title: titleMap[action.to],
        x: spot.x,
        y: spot.y,
        // 成片是链路终点，卡片给得更大一些
        w: isFinal ? 340 : undefined,
        h: isFinal ? 288 : undefined,
        status: action.to === 'text' ? 'ready' : 'generating',
        progress: 0,
        prompt,
        source: opts.source || 'ai',
        loadingLabel: action.to === 'video' ? 'AI 正在生成视频…' : 'AI 正在生成图片…'
      })
      parentsForNode.forEach((p) => Store.addEdge(p.id, node.id, action.edge, 'pending'))
      created.push(node.id)

      const job = (async () => {
        await U.sleep(indexInBatch * 260)
        if (action.to === 'text') {
          await typeText(node.id, textFor(action, anchor, indexInBatch))
        } else {
          const kind = posterKind(node, action, anchor)
          await generateInto(node.id, prompt, {
            kind,
            source: opts.source || 'ai',
            title: titleMap[action.to],
            duration: action.kind === 'final' ? list.length * 5 : action.id === 'extend' ? 3 : 5
          })
        }
      })()
      tasks.push(job)
    }

    if (action.multiParent) {
      const anchor = list.reduce((a, b) => (b.x + b.w > a.x + a.w ? b : a), list[0])
      spawn(list, 0, 1, anchor)
    } else {
      list.forEach((parent) => {
        for (let i = 0; i < (action.count || 1); i++) spawn([parent], i, action.count || 1, parent)
      })
    }

    if (opts.follow !== false) {
      const focusNodes = Store.state.nodes.filter((n) => created.includes(n.id) || list.some((p) => p.id === n.id))
      Canvas.fitView(focusNodes, 120, 1)
    }
    created.forEach((id) => Canvas.flashNode(id))

    await Promise.all(tasks)
    if (opts.select !== false) Store.setSelection(created)
    return created
  }

  return { ACTIONS, COMPOSE, actionsFor, run, generateInto, typeText, makeScript, makeCopy, topicOf }
})()
