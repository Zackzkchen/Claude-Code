/* 程序化生成"AI 素材"占位图：完全离线，同一提示词稳定产出同一张图。
   demo 里所有 AI 生成的图片 / 视频封面都来自这里。 */
window.Media = (function () {
  const PALETTES = {
    character: [
      ['#2b1c3a', '#6d3f7a', '#ffb9a3'],
      ['#101d33', '#2e5a8f', '#ffd9b3'],
      ['#301b1b', '#8c4a3a', '#ffe0c2'],
      ['#1b2430', '#4b6b8a', '#f2d6c4']
    ],
    scene: [
      ['#0d1b2a', '#1f6f7a', '#ffd166'],
      ['#20122b', '#6b3f8f', '#ffa1c4'],
      ['#0f1f16', '#2f7a55', '#e8f5a1'],
      ['#241408', '#a35a2a', '#ffd08a']
    ],
    product: [
      ['#101215', '#2a3340', '#8fd0ff'],
      ['#181017', '#3d2436', '#ffc2d6'],
      ['#0f1512', '#22382c', '#a8f0c8'],
      ['#15120a', '#3a3018', '#ffdf9e']
    ],
    generic: [
      ['#121722', '#2b3a55', '#8fb6ff'],
      ['#1a1424', '#40305c', '#c6a8ff']
    ]
  }

  function subKind(kind, prompt) {
    if (kind && PALETTES[kind]) return kind
    const p = String(prompt || '')
    if (/人物|角色|模特|女主|男主|主播|肖像|人像|少女|少年|女孩|男孩|女生|男生|美女|真人|口播|博主|舞者|老人|孩子/.test(p)) return 'character'
    if (/商品|产品|包装|瓶|盒|礼盒|静物|膏体|质感特写|主图/.test(p)) return 'product'
    if (/场景|背景|街|城市|山|海|房间|店|夜景|清晨|黄昏|外景|内景|森林|咖啡|办公室|厨房|卧室|江南/.test(p)) return 'scene'
    return 'generic'
  }

  function drawCharacter(ctx, w, h, colors, rnd) {
    const [bg1, bg2, skin] = colors
    const g = ctx.createLinearGradient(0, 0, w, h)
    g.addColorStop(0, bg1)
    g.addColorStop(1, bg2)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)

    // 背光
    const glow = ctx.createRadialGradient(w * 0.5, h * 0.34, 10, w * 0.5, h * 0.34, w * 0.55)
    glow.addColorStop(0, 'rgba(255,255,255,.22)')
    glow.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = glow
    ctx.fillRect(0, 0, w, h)

    const cx = w * (0.44 + rnd() * 0.12)
    const headR = h * (0.15 + rnd() * 0.03)
    const headY = h * 0.36

    // 肩部
    ctx.fillStyle = 'rgba(12,14,20,.55)'
    ctx.beginPath()
    ctx.moveTo(cx - w * 0.34, h)
    ctx.quadraticCurveTo(cx, h * 0.56, cx + w * 0.34, h)
    ctx.closePath()
    ctx.fill()

    // 头发
    ctx.fillStyle = 'rgba(10,10,16,.85)'
    ctx.beginPath()
    ctx.ellipse(cx, headY - headR * 0.18, headR * 1.2, headR * 1.25, 0, 0, Math.PI * 2)
    ctx.fill()

    // 脸
    ctx.fillStyle = skin
    ctx.beginPath()
    ctx.ellipse(cx, headY, headR * 0.82, headR, 0, 0, Math.PI * 2)
    ctx.fill()

    // 脖颈
    ctx.fillRect(cx - headR * 0.28, headY + headR * 0.7, headR * 0.56, headR * 0.6)

    // 轮廓光
    ctx.strokeStyle = 'rgba(255,255,255,.5)'
    ctx.lineWidth = Math.max(1.5, w * 0.004)
    ctx.beginPath()
    ctx.arc(cx, headY, headR * 1.02, -Math.PI * 0.85, -Math.PI * 0.25)
    ctx.stroke()
  }

  /** 场景变体：城市楼群剪影 */
  function drawCityScene(ctx, w, h, colors, rnd) {
    const [bg1, bg2, accent] = colors
    const sky = ctx.createLinearGradient(0, 0, 0, h)
    sky.addColorStop(0, bg1)
    sky.addColorStop(0.7, bg2)
    sky.addColorStop(1, bg1)
    ctx.fillStyle = sky
    ctx.fillRect(0, 0, w, h)

    const glow = ctx.createRadialGradient(w * 0.5, h * 0.75, 10, w * 0.5, h * 0.75, w * 0.7)
    glow.addColorStop(0, `${accent}44`)
    glow.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = glow
    ctx.fillRect(0, 0, w, h)

    let x = -w * 0.05
    while (x < w) {
      const bw = w * (0.08 + rnd() * 0.1)
      const bh = h * (0.22 + rnd() * 0.44)
      ctx.fillStyle = `rgba(8,10,16,${0.55 + rnd() * 0.35})`
      ctx.fillRect(x, h - bh, bw, bh)
      // 亮着的窗
      for (let wy = h - bh + h * 0.03; wy < h - h * 0.05; wy += h * 0.055) {
        for (let wx = x + bw * 0.14; wx < x + bw * 0.86; wx += bw * 0.26) {
          if (rnd() > 0.55) {
            ctx.fillStyle = `${accent}${rnd() > 0.5 ? 'cc' : '77'}`
            ctx.fillRect(wx, wy, bw * 0.13, h * 0.02)
          }
        }
      }
      x += bw + w * 0.012
    }
  }

  /** 场景变体：室内窗光 */
  function drawRoomScene(ctx, w, h, colors, rnd) {
    const [bg1, bg2, accent] = colors
    const g = ctx.createLinearGradient(w, 0, 0, h)
    g.addColorStop(0, bg2)
    g.addColorStop(1, bg1)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)

    // 窗
    const wx = w * (0.52 + rnd() * 0.16)
    const wy = h * 0.14
    const ww = w * 0.3
    const wh = h * 0.46
    ctx.fillStyle = `${accent}dd`
    ctx.fillRect(wx, wy, ww, wh)
    ctx.strokeStyle = 'rgba(10,12,18,.85)'
    ctx.lineWidth = Math.max(2, w * 0.008)
    ctx.strokeRect(wx, wy, ww, wh)
    ctx.beginPath()
    ctx.moveTo(wx + ww / 2, wy)
    ctx.lineTo(wx + ww / 2, wy + wh)
    ctx.moveTo(wx, wy + wh / 2)
    ctx.lineTo(wx + ww, wy + wh / 2)
    ctx.stroke()

    // 透进来的光
    ctx.save()
    ctx.globalAlpha = 0.3
    ctx.fillStyle = accent
    ctx.beginPath()
    ctx.moveTo(wx, wy + wh)
    ctx.lineTo(wx + ww, wy + wh)
    ctx.lineTo(wx + ww * 0.4, h)
    ctx.lineTo(-w * 0.1, h)
    ctx.closePath()
    ctx.fill()
    ctx.restore()

    // 桌面与静物剪影
    ctx.fillStyle = 'rgba(8,10,15,.7)'
    ctx.fillRect(0, h * 0.78, w, h * 0.22)
    ctx.beginPath()
    ctx.ellipse(w * 0.24, h * 0.78, w * 0.07, h * 0.11, 0, Math.PI, 0)
    ctx.fill()
  }

  function drawScene(ctx, w, h, colors, rnd) {
    const variant = Math.floor(rnd() * 3)
    if (variant === 1) return drawCityScene(ctx, w, h, colors, rnd)
    if (variant === 2) return drawRoomScene(ctx, w, h, colors, rnd)

    const [bg1, bg2, accent] = colors
    const sky = ctx.createLinearGradient(0, 0, 0, h)
    sky.addColorStop(0, bg1)
    sky.addColorStop(0.62, bg2)
    sky.addColorStop(1, bg1)
    ctx.fillStyle = sky
    ctx.fillRect(0, 0, w, h)

    // 太阳 / 月亮
    const sx = w * (0.2 + rnd() * 0.6)
    const sy = h * (0.24 + rnd() * 0.16)
    const sr = h * (0.07 + rnd() * 0.05)
    const halo = ctx.createRadialGradient(sx, sy, 1, sx, sy, sr * 5)
    halo.addColorStop(0, accent)
    halo.addColorStop(0.14, accent)
    halo.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.globalAlpha = 0.9
    ctx.fillStyle = halo
    ctx.fillRect(0, 0, w, h)
    ctx.globalAlpha = 1

    // 远近三层山
    const layers = 3
    for (let i = 0; i < layers; i++) {
      const base = h * (0.62 + i * 0.11)
      ctx.fillStyle = `rgba(6,9,14,${0.34 + i * 0.24})`
      ctx.beginPath()
      ctx.moveTo(0, h)
      ctx.lineTo(0, base)
      let x = 0
      while (x < w) {
        const step = w * (0.12 + rnd() * 0.14)
        const peak = base - h * (0.05 + rnd() * (0.16 - i * 0.04))
        ctx.lineTo(x + step / 2, peak)
        ctx.lineTo(x + step, base + h * 0.01 * rnd())
        x += step
      }
      ctx.lineTo(w, h)
      ctx.closePath()
      ctx.fill()
    }

    // 地面反光
    const refl = ctx.createLinearGradient(0, h * 0.86, 0, h)
    refl.addColorStop(0, 'rgba(255,255,255,.08)')
    refl.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = refl
    ctx.fillRect(0, h * 0.86, w, h * 0.14)
  }

  function drawProduct(ctx, w, h, colors, rnd) {
    const [bg1, bg2, accent] = colors
    const g = ctx.createRadialGradient(w * 0.5, h * 0.42, 10, w * 0.5, h * 0.6, w * 0.75)
    g.addColorStop(0, bg2)
    g.addColorStop(1, bg1)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)

    // 束光
    ctx.save()
    ctx.globalAlpha = 0.22
    ctx.fillStyle = accent
    ctx.beginPath()
    ctx.moveTo(w * 0.4, 0)
    ctx.lineTo(w * 0.6, 0)
    ctx.lineTo(w * 0.78, h * 0.82)
    ctx.lineTo(w * 0.22, h * 0.82)
    ctx.closePath()
    ctx.fill()
    ctx.restore()

    // 台面
    ctx.fillStyle = 'rgba(255,255,255,.08)'
    ctx.beginPath()
    ctx.ellipse(w * 0.5, h * 0.79, w * 0.3, h * 0.05, 0, 0, Math.PI * 2)
    ctx.fill()

    // 瓶体
    const bw = w * (0.16 + rnd() * 0.06)
    const bh = h * (0.36 + rnd() * 0.1)
    const bx = w * 0.5 - bw / 2
    const by = h * 0.78 - bh
    const r = bw * 0.28
    ctx.beginPath()
    ctx.moveTo(bx + r, by)
    ctx.lineTo(bx + bw - r, by)
    ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + r)
    ctx.lineTo(bx + bw, by + bh - r)
    ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - r, by + bh)
    ctx.lineTo(bx + r, by + bh)
    ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - r)
    ctx.lineTo(bx, by + r)
    ctx.quadraticCurveTo(bx, by, bx + r, by)
    ctx.closePath()
    const bg = ctx.createLinearGradient(bx, by, bx + bw, by + bh)
    bg.addColorStop(0, 'rgba(255,255,255,.94)')
    bg.addColorStop(0.45, accent)
    bg.addColorStop(1, 'rgba(20,24,32,.92)')
    ctx.fillStyle = bg
    ctx.fill()

    // 瓶盖
    ctx.fillStyle = 'rgba(18,20,28,.9)'
    ctx.fillRect(bx + bw * 0.3, by - h * 0.06, bw * 0.4, h * 0.06)

    // 高光
    ctx.fillStyle = 'rgba(255,255,255,.35)'
    ctx.fillRect(bx + bw * 0.16, by + bh * 0.12, bw * 0.08, bh * 0.7)
  }

  /** 兜底风格：抽象光斑，避免和商品图撞脸 */
  function drawGeneric(ctx, w, h, colors, rnd) {
    const [bg1, bg2, accent] = colors
    const g = ctx.createLinearGradient(0, h, w, 0)
    g.addColorStop(0, bg1)
    g.addColorStop(0.55, bg2)
    g.addColorStop(1, bg1)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)

    for (let i = 0; i < 7; i++) {
      const r = h * (0.08 + rnd() * 0.26)
      const cx = rnd() * w
      const cy = rnd() * h
      const bokeh = ctx.createRadialGradient(cx, cy, 1, cx, cy, r)
      bokeh.addColorStop(0, `${accent}55`)
      bokeh.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = bokeh
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.fill()
    }

    ctx.save()
    ctx.globalAlpha = 0.16
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = Math.max(1, w * 0.006)
    for (let i = 0; i < 4; i++) {
      const y = h * rnd()
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.quadraticCurveTo(w * 0.5, y + h * (rnd() - 0.5) * 0.4, w, y + h * (rnd() - 0.5) * 0.2)
      ctx.stroke()
    }
    ctx.restore()
  }

  function grainAndVignette(ctx, w, h, rnd) {
    // 颗粒
    for (let i = 0; i < w * h * 0.012; i++) {
      ctx.fillStyle = `rgba(255,255,255,${rnd() * 0.05})`
      ctx.fillRect(rnd() * w, rnd() * h, 1, 1)
    }
    // 暗角
    const v = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.32, w / 2, h / 2, Math.max(w, h) * 0.78)
    v.addColorStop(0, 'rgba(0,0,0,0)')
    v.addColorStop(1, 'rgba(0,0,0,.5)')
    ctx.fillStyle = v
    ctx.fillRect(0, 0, w, h)
  }

  const cache = new Map()

  /** 生成一张占位素材图，返回 dataURL */
  function poster(kind, prompt, w = 480, h = 360) {
    const k = subKind(kind, prompt)
    const key = `${k}|${prompt}|${w}x${h}`
    if (cache.has(key)) return cache.get(key)

    const seed = U.hash(key)
    const rnd = U.seeded(seed)
    const palette = PALETTES[k][Math.floor(rnd() * PALETTES[k].length)]

    const cv = document.createElement('canvas')
    cv.width = w
    cv.height = h
    const ctx = cv.getContext('2d')

    if (k === 'character') drawCharacter(ctx, w, h, palette, rnd)
    else if (k === 'product') drawProduct(ctx, w, h, palette, rnd)
    else if (k === 'scene') drawScene(ctx, w, h, palette, rnd)
    else drawGeneric(ctx, w, h, palette, rnd)
    grainAndVignette(ctx, w, h, rnd)

    const url = cv.toDataURL('image/jpeg', 0.82)
    cache.set(key, url)
    return url
  }

  function formatDuration(sec) {
    const s = Math.max(0, Math.round(sec))
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
  }

  return { poster, formatDuration, subKind }
})()
