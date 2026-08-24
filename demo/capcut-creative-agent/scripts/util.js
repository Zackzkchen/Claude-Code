/* 通用工具：不依赖任何外部库，直接以 <script> 引入，挂载到 window.U */
window.U = (function () {
  let seq = 0

  const uid = (prefix = 'n') => `${prefix}_${(++seq).toString(36)}${Math.random().toString(36).slice(2, 6)}`

  const clamp = (v, min, max) => Math.min(max, Math.max(min, v))

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

  /**
   * 用于进度轮询的等待：页面被隐藏时浏览器会把 setTimeout 节流到秒级甚至分钟级，
   * 这里额外监听 visibilitychange，页面一回到前台立刻补一次 tick，避免进度看起来卡死。
   */
  function tick(ms) {
    return new Promise((resolve) => {
      const finish = () => {
        clearTimeout(timer)
        document.removeEventListener('visibilitychange', onVisible)
        resolve()
      }
      const onVisible = () => { if (!document.hidden) finish() }
      const timer = setTimeout(finish, ms)
      document.addEventListener('visibilitychange', onVisible)
    })
  }

  const rand = (min, max) => min + Math.random() * (max - min)

  const pick = (list) => list[Math.floor(Math.random() * list.length)]

  /** 字符串稳定哈希，用于让同一提示词生成同一张"AI 素材" */
  function hash(str) {
    let h = 2166136261
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i)
      h = Math.imul(h, 16777619)
    }
    return (h >>> 0)
  }

  /** 以种子驱动的伪随机数发生器 */
  function seeded(seed) {
    let s = seed >>> 0 || 1
    return function () {
      s ^= s << 13; s >>>= 0
      s ^= s >> 17
      s ^= s << 5; s >>>= 0
      return s / 4294967296
    }
  }

  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3)

  /** 简易补间动画，返回取消函数 */
  function tween({ from, to, duration = 320, ease = easeOutCubic, onUpdate, onDone }) {
    const start = performance.now()
    let raf = 0
    const keys = Object.keys(from)
    const step = (now) => {
      const t = clamp((now - start) / duration, 0, 1)
      const k = ease(t)
      const cur = {}
      keys.forEach((key) => { cur[key] = from[key] + (to[key] - from[key]) * k })
      onUpdate(cur)
      if (t < 1) raf = requestAnimationFrame(step)
      else if (onDone) onDone()
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }

  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag)
    Object.entries(attrs).forEach(([k, v]) => {
      if (v === null || v === undefined || v === false) return
      if (k === 'class') node.className = v
      else if (k === 'text') node.textContent = v
      else if (k === 'html') node.innerHTML = v
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v)
      else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v)
      else node.setAttribute(k, v)
    })
    ;[].concat(children).filter(Boolean).forEach((c) => {
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c)
    })
    return node
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
  }

  function truncate(s, n) {
    const str = String(s || '').replace(/\s+/g, ' ').trim()
    return str.length > n ? `${str.slice(0, n)}…` : str
  }

  let toastTimer = new Map()
  function toast(text, ms = 2000) {
    const wrap = document.getElementById('toast-wrap')
    if (!wrap) return
    const t = el('div', { class: 'toast', html: text })
    wrap.appendChild(t)
    const id = setTimeout(() => {
      t.style.transition = 'opacity .2s ease'
      t.style.opacity = '0'
      setTimeout(() => t.remove(), 220)
    }, ms)
    toastTimer.set(t, id)
  }

  return { uid, clamp, sleep, tick, rand, pick, hash, seeded, tween, easeOutCubic, el, escapeHtml, truncate, toast }
})()
