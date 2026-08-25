/* 右侧 Agent 对话面板：消息流、任务卡、产出节点回链、上下文胶囊 */
window.Chat = (function () {
  let R = {}
  let onSend = () => {}
  let busy = false

  function init(handler) {
    onSend = handler
    R = {
      scroll: document.getElementById('chat-scroll'),
      input: document.getElementById('chat-input'),
      send: document.getElementById('btn-send'),
      status: document.getElementById('chat-status'),
      contextBar: document.getElementById('context-bar'),
      chips: document.getElementById('quick-chips'),
      clear: document.getElementById('btn-clear-chat')
    }

    R.send.addEventListener('click', submit)
    R.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        submit()
      }
    })
    R.input.addEventListener('input', autoGrow)
    R.clear.addEventListener('click', () => {
      R.scroll.replaceChildren()
      pushSystem('对话已清空，画布内容保留')
    })

    // progress / typing 频率很高，跳过以免抖动
    Store.subscribe((_, reason) => {
      if (reason !== 'progress' && reason !== 'typing') syncContext()
    })
    syncContext()
  }

  function autoGrow() {
    R.input.style.height = 'auto'
    R.input.style.height = `${Math.min(116, R.input.scrollHeight)}px`
  }

  function submit() {
    const text = R.input.value.trim()
    if (!text || busy) return
    R.input.value = ''
    autoGrow()
    onSend(text)
  }

  function setBusy(flag) {
    busy = flag
    R.send.disabled = flag
    R.status.textContent = flag ? '正在执行任务…' : '在线 · 可直接操作画布'
    document.getElementById('agent-busy').hidden = !flag
  }

  function scrollToEnd() {
    R.scroll.scrollTop = R.scroll.scrollHeight
  }

  /* ---------------- 消息 ---------------- */
  function pushUser(text) {
    const msg = U.el('div', { class: 'msg user' }, [U.el('div', { class: 'bubble', text })])
    R.scroll.appendChild(msg)
    scrollToEnd()
    return msg
  }

  function pushSystem(text) {
    const msg = U.el('div', { class: 'msg system' }, [U.el('div', { class: 'bubble', html: text })])
    R.scroll.appendChild(msg)
    scrollToEnd()
    return msg
  }

  /** Agent 气泡，支持逐字输出 */
  async function pushAgent(text, { stream = true } = {}) {
    const bubble = U.el('div', { class: 'bubble' })
    const msg = U.el('div', { class: 'msg agent' }, [bubble])
    R.scroll.appendChild(msg)
    bubble.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>'
    scrollToEnd()
    await U.sleep(320)
    // 富文本一次性输出，避免逐字切断标签
    if (!stream || /<[a-z/]/i.test(text)) {
      bubble.innerHTML = text
      scrollToEnd()
      return msg
    }
    bubble.innerHTML = ''
    const chunk = 4
    for (let i = 0; i <= text.length; i += chunk) {
      bubble.innerHTML = text.slice(0, i)
      scrollToEnd()
      await U.sleep(16)
    }
    bubble.innerHTML = text
    scrollToEnd()
    return msg
  }

  /* ---------------- 任务卡 ---------------- */
  function taskCard(title, steps) {
    const stepEls = steps.map((label) => U.el('div', { class: 'task-step' }, [
      U.el('span', { class: 'ico', text: '' }),
      U.el('span', { class: 'lb', text: label })
    ]))
    const refsWrap = U.el('div', { class: 'node-refs' })
    refsWrap.hidden = true
    const card = U.el('div', { class: 'task-card' }, [
      U.el('div', { class: 'task-card-head' }, [
        U.el('span', { class: 'tag', text: 'Agent 任务' }),
        U.el('span', { class: 'ttl', text: title })
      ]),
      U.el('div', { class: 'task-steps' }, stepEls),
      refsWrap
    ])
    R.scroll.appendChild(U.el('div', { class: 'msg agent' }, [card]))
    scrollToEnd()

    const api = {
      start(i) {
        stepEls.forEach((el, idx) => {
          if (idx < i) el.className = 'task-step done'
        })
        stepEls[i].className = 'task-step run'
        stepEls[i].querySelector('.ico').textContent = ''
        scrollToEnd()
        return api
      },
      done(i, label) {
        if (!stepEls[i]) return api
        stepEls[i].className = 'task-step done'
        stepEls[i].querySelector('.ico').textContent = '✓'
        if (label) stepEls[i].querySelector('.lb').textContent = label
        scrollToEnd()
        return api
      },
      finishAll() {
        stepEls.forEach((el, i) => api.done(i))
        return api
      },
      addNodes(ids) {
        refsWrap.hidden = false
        ids.map((id) => Store.nodeById(id)).filter(Boolean).forEach((node) => {
          refsWrap.appendChild(nodeRef(node))
        })
        scrollToEnd()
        return api
      }
    }
    return api
  }

  function nodeRef(node) {
    const thumbSrc = node.type === 'image' ? node.src : node.poster
    const thumb = thumbSrc
      ? U.el('img', { class: 'thumb', src: thumbSrc, alt: '' })
      : U.el('span', { class: 'thumb', text: node.type === 'text' ? 'T' : node.type === 'video' ? '▶' : '▣' })
    return U.el('button', {
      class: 'node-ref',
      title: '在画布中定位该节点',
      onclick: async () => {
        await Canvas.focusNode(node.id)
        Canvas.flashNode(node.id)
      }
    }, [thumb, U.el('span', { class: 'nm', text: node.title })])
  }

  function pushNodeRefs(ids, label) {
    const wrap = U.el('div', { class: 'node-refs', style: { padding: '0' } })
    ids.map((id) => Store.nodeById(id)).filter(Boolean).forEach((n) => wrap.appendChild(nodeRef(n)))
    const msg = U.el('div', { class: 'msg agent' }, [
      label ? U.el('div', { class: 'bubble', html: label }) : null,
      wrap
    ])
    R.scroll.appendChild(msg)
    scrollToEnd()
  }

  function pushSuggestions(list) {
    if (!list?.length) return
    const wrap = U.el('div', { class: 'msg agent' }, [
      U.el('div', { class: 'msg-suggestions' }, list.map((t) => U.el('button', {
        class: 'sugg', text: t, onclick: () => { if (!busy) onSend(t) }
      })))
    ])
    R.scroll.appendChild(wrap)
    scrollToEnd()
  }

  /* ---------------- 上下文胶囊 + 快捷指令 ---------------- */
  const CHIPS = {
    none: ['帮我做一条国风护手霜的短视频', '写一个 15s 带货脚本', '在画布上加一段脚本文本'],
    text: ['基于这段脚本生成人物图', '拆成 3 条分镜', '直接生成视频'],
    image: ['把这张图变成视频', '再生成两张同系列图', '看图写口播文案'],
    video: ['把它和其他素材合成一条成片', '整理一下画布布局', '再做一版镜头'],
    multi: ['把选中的素材合成一条成片', '统一风格重新生成', '整理一下画布布局']
  }

  function syncContext() {
    const sel = Store.selectedNodes()
    if (!sel.length) {
      R.contextBar.hidden = true
      renderChips(CHIPS.none)
      return
    }
    R.contextBar.hidden = false
    const rows = [
      U.el('span', { class: 'ctx-icon', text: sel.length > 1 ? String(sel.length) : (sel[0].type === 'text' ? 'T' : sel[0].type === 'video' ? '▶' : '▣') }),
      U.el('span', {
        class: 'ctx-name',
        html: sel.length > 1
          ? `已选中 <b>${sel.length}</b> 个画布节点，指令将作用于它们`
          : `已选中 <b>${U.escapeHtml(U.truncate(sel[0].title, 16))}</b>，指令将基于它执行`
      }),
      U.el('button', { class: 'ctx-x', text: '×', title: '取消选择', onclick: () => Store.setSelection([]) })
    ]
    // 多选时把选中的节点列出来，避免"指令到底作用在哪几个"说不清
    if (sel.length > 1) {
      rows.push(U.el('div', { class: 'ctx-list' }, sel.slice(0, 6).map((n) => U.el('button', {
        class: 'ctx-chip',
        text: U.truncate(n.title, 10),
        title: '在画布中定位',
        onclick: async () => { await Canvas.focusNode(n.id, { select: false }); Canvas.flashNode(n.id) }
      })).concat(sel.length > 6 ? [U.el('span', { class: 'ctx-chip more', text: `+${sel.length - 6}` })] : [])))
    }
    R.contextBar.replaceChildren(...rows)
    renderChips(sel.length > 1 ? CHIPS.multi : CHIPS[sel[0].type])
  }

  function renderChips(list) {
    R.chips.replaceChildren(...list.map((t) => U.el('button', {
      class: 'sugg', text: t, onclick: () => { if (!busy) onSend(t) }
    })))
  }

  function setInput(text) {
    R.input.value = text
    autoGrow()
  }

  return { init, pushUser, pushAgent, pushSystem, pushSuggestions, pushNodeRefs, taskCard, setBusy, setInput, syncContext }
})()
