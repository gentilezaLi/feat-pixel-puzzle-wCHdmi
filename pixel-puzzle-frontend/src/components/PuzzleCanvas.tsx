// 拼图画布：使用 PixiJS v8 WebGL 渲染像素网格
import { Application, Graphics } from 'pixi.js'
import { useEffect, useRef } from 'react'
import type { PaletteColor } from '../types'

interface PuzzleCanvasProps {
  cols: number
  rows: number
  palette: PaletteColor[]
  target: number[]
  filled: number[]
  selected: number
  hint: boolean
  revealed: boolean
  onCellPaint: (idx: number) => void
  onCellPick: (idx: number) => void
}

// 颜色常量
const BG_CELL = 0x1a1030 // 未涂色格子背景
const WRONG = 0xff3b6b // 错误标记色
const HOVER = 0x2de2e6 // hover 高亮色

interface Layout {
  cell: number
  gap: number
  ox: number
  oy: number
  totalW: number
  totalH: number
}

export default function PuzzleCanvas(props: PuzzleCanvasProps) {
  const {
    cols,
    rows,
    palette,
    target,
    filled,
    hint,
    revealed,
    onCellPaint,
    onCellPick,
  } = props

  const containerRef = useRef<HTMLDivElement | null>(null)
  const appRef = useRef<Application | null>(null)
  const cellsRef = useRef<Graphics[]>([])
  const overlayRef = useRef<Graphics | null>(null)
  const layoutRef = useRef<Layout>({ cell: 0, gap: 0, ox: 0, oy: 0, totalW: 0, totalH: 0 })

  // 是否已完成 PixiJS 异步初始化
  const readyRef = useRef(false)

  // 缓存上一帧状态，用于局部重绘对比
  const prevFilledRef = useRef<number[] | null>(null)
  const prevTargetRef = useRef<number[] | null>(null)
  const prevPaletteRef = useRef<PaletteColor[] | null>(null)
  const prevHintRef = useRef<boolean>(hint)
  const prevRevealedRef = useRef<boolean>(revealed)
  const prevSizeRef = useRef<{ cols: number; rows: number }>({ cols, rows })

  // 交互状态
  const paintingRef = useRef(false)
  const lastIdxRef = useRef(-1)
  const hoverIdxRef = useRef(-1)

  // 回调 ref，避免事件监听器过期
  const cbRef = useRef({ onCellPaint, onCellPick, hint, revealed, cols, rows })
  cbRef.current = { onCellPaint, onCellPick, hint, revealed, cols, rows }

  // 计算布局
  function computeLayout(w: number, h: number, c: number, r: number): Layout {
    const pad = 12
    const availW = Math.max(0, w - pad * 2)
    const availH = Math.max(0, h - pad * 2)
    const cell = Math.max(1, Math.floor(Math.min(availW / c, availH / r)))
    const gap = Math.max(1, Math.floor(cell / 10))
    const totalW = cell * c
    const totalH = cell * r
    const ox = Math.floor((w - totalW) / 2)
    const oy = Math.floor((h - totalH) / 2)
    return { cell, gap, ox, oy, totalW, totalH }
  }

  // 命中测试：屏幕坐标 -> 格子索引
  function hitTest(clientX: number, clientY: number): number {
    const app = appRef.current
    const canvas = app?.canvas
    if (!app || !canvas) return -1
    const rect = canvas.getBoundingClientRect()
    const lx = clientX - rect.left
    const ly = clientY - rect.top
    const L = layoutRef.current
    if (L.cell <= 0) return -1
    const col = Math.floor((lx - L.ox) / L.cell)
    const row = Math.floor((ly - L.oy) / L.cell)
    const { cols: c, rows: r } = cbRef.current
    if (col < 0 || col >= c || row < 0 || row >= r) return -1
    return row * c + col
  }

  // 绘制单个格子
  function drawCell(idx: number) {
    const g = cellsRef.current[idx]
    if (!g) return
    const L = layoutRef.current
    const c = cbRef.current.cols
    const col = idx % c
    const row = Math.floor(idx / c)
    const x = L.ox + col * L.cell
    const y = L.oy + row * L.cell
    const inset = L.gap
    const w = L.cell - inset * 2
    const h = L.cell - inset * 2
    g.clear()

    const tgt = target[idx] ?? -1
    const fil = filled[idx] ?? -1

    let color = BG_CELL
    let alpha = 1

    if (revealed) {
      // 显示完整图
      if (tgt >= 0 && tgt < palette.length) {
        const p = palette[tgt]
        color = (p.r << 16) | (p.g << 8) | p.b
      } else {
        color = BG_CELL
      }
    } else if (fil >= 0 && fil < palette.length) {
      // 已涂色
      const p = palette[fil]
      color = (p.r << 16) | (p.g << 8) | p.b
    } else if (hint && tgt >= 0 && tgt < palette.length) {
      // hint 模式：半透明目标色覆盖深色背景
      g.rect(x + inset, y + inset, w, h).fill({ color: BG_CELL, alpha: 1 })
      const p = palette[tgt]
      color = (p.r << 16) | (p.g << 8) | p.b
      alpha = 0.35
    } else {
      color = BG_CELL
    }

    g.rect(x + inset, y + inset, w, h).fill({ color, alpha })

    // 错误标记：已涂但颜色与目标不符
    if (!revealed && fil >= 0 && tgt >= 0 && fil !== tgt) {
      const lw = Math.max(1, Math.floor(L.cell / 6))
      g.moveTo(x + inset, y + inset)
        .lineTo(x + inset + w, y + inset + h)
        .stroke({ color: WRONG, width: lw })
      g.moveTo(x + inset + w, y + inset)
        .lineTo(x + inset, y + inset + h)
        .stroke({ color: WRONG, width: lw })
    }
  }

  // 绘制 hover 高亮（覆盖层）
  function drawOverlay() {
    const g = overlayRef.current
    const app = appRef.current
    if (!g || !app) return
    g.clear()
    const idx = hoverIdxRef.current
    if (idx < 0) return
    const L = layoutRef.current
    const c = cbRef.current.cols
    const col = idx % c
    const row = Math.floor(idx / c)
    const x = L.ox + col * L.cell
    const y = L.oy + row * L.cell
    const lw = Math.max(1, Math.floor(L.cell / 8))
    g.rect(x + 0.5, y + 0.5, L.cell - 1, L.cell - 1)
      .stroke({ color: HOVER, width: lw, alpha: 0.9 })
  }

  function redrawAll() {
    const total = cbRef.current.cols * cbRef.current.rows
    for (let i = 0; i < total; i++) drawCell(i)
    drawOverlay()
  }

  // 确保 cell 数量匹配 cols*rows（不匹配则重建）
  function ensureCells(total: number) {
    const app = appRef.current
    if (!app) return
    if (cellsRef.current.length === total) return
    // 销毁旧格子
    for (const g of cellsRef.current) g.destroy()
    const cells: Graphics[] = []
    for (let i = 0; i < total; i++) {
      const g = new Graphics()
      app.stage.addChild(g)
      cells.push(g)
    }
    cellsRef.current = cells
    // 把覆盖层移到最上层
    if (overlayRef.current) app.stage.addChild(overlayRef.current)
  }

  // 全量同步：重算布局 + 重建格子 + 重绘
  function fullSync() {
    const container = containerRef.current
    const app = appRef.current
    if (!container || !app) return
    const w = container.clientWidth || 600
    const h = container.clientHeight || 600
    app.renderer.resize(w, h)
    const total = cbRef.current.cols * cbRef.current.rows
    ensureCells(total)
    layoutRef.current = computeLayout(w, h, cbRef.current.cols, cbRef.current.rows)
    redrawAll()
  }

  // 初始化 PixiJS 应用（仅在挂载时执行一次）
  useEffect(() => {
    let destroyed = false
    const container = containerRef.current
    if (!container) return

    const app = new Application()
    appRef.current = app

    let ro: ResizeObserver | null = null
    let cleanupFn: (() => void) | null = null

    ;(async () => {
      await app.init({
        background: '#0d0820',
        antialias: false,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
        width: container.clientWidth || 600,
        height: container.clientHeight || 600,
      })
      if (destroyed) {
        app.destroy()
        return
      }
      container.appendChild(app.canvas)
      app.canvas.style.width = '100%'
      app.canvas.style.height = '100%'
      app.canvas.style.display = 'block'
      app.canvas.style.touchAction = 'none'

      // 覆盖层（hover 高亮）
      const overlay = new Graphics()
      app.stage.addChild(overlay)
      overlayRef.current = overlay

      readyRef.current = true

      // 初始绘制（使用当前 props）
      fullSync()
      // 初始化缓存
      prevFilledRef.current = filled.slice()
      prevTargetRef.current = target.slice()
      prevPaletteRef.current = palette
      prevHintRef.current = hint
      prevRevealedRef.current = revealed
      prevSizeRef.current = { cols, rows }

      // 指针事件
      const canvas = app.canvas
      const onDown = (e: PointerEvent) => {
        const idx = hitTest(e.clientX, e.clientY)
        if (idx < 0) return
        lastIdxRef.current = idx
        const cb = cbRef.current
        if (cb.hint) {
          cb.onCellPick(idx)
        } else {
          paintingRef.current = true
          cb.onCellPaint(idx)
        }
      }
      const onMove = (e: PointerEvent) => {
        const idx = hitTest(e.clientX, e.clientY)
        if (idx !== hoverIdxRef.current) {
          hoverIdxRef.current = idx
          drawOverlay()
        }
        if (paintingRef.current && idx >= 0 && idx !== lastIdxRef.current) {
          lastIdxRef.current = idx
          cbRef.current.onCellPaint(idx)
        }
      }
      const onUp = () => {
        paintingRef.current = false
        lastIdxRef.current = -1
      }
      const onLeave = () => {
        hoverIdxRef.current = -1
        drawOverlay()
      }
      canvas.addEventListener('pointerdown', onDown)
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      canvas.addEventListener('pointerleave', onLeave)

      // 自适应尺寸
      ro = new ResizeObserver(() => {
        if (destroyed || !container) return
        const w = container.clientWidth
        const h = container.clientHeight
        app.renderer.resize(w, h)
        layoutRef.current = computeLayout(w, h, cbRef.current.cols, cbRef.current.rows)
        redrawAll()
      })
      ro.observe(container)

      // 记录清理函数
      cleanupFn = () => {
        ro?.disconnect()
        canvas.removeEventListener('pointerdown', onDown)
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        canvas.removeEventListener('pointerleave', onLeave)
      }
    })()

    return () => {
      destroyed = true
      cleanupFn?.()
      const app = appRef.current
      if (app) {
        app.destroy(true, { children: true })
        appRef.current = null
      }
      readyRef.current = false
      cellsRef.current = []
      overlayRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 数据 / 尺寸变化时局部重绘
  useEffect(() => {
    if (!readyRef.current) return

    const sizeChanged =
      prevSizeRef.current.cols !== cols || prevSizeRef.current.rows !== rows

    if (sizeChanged) {
      // 尺寸变化：全量同步
      fullSync()
      prevSizeRef.current = { cols, rows }
      prevFilledRef.current = filled.slice()
      prevTargetRef.current = target.slice()
      prevPaletteRef.current = palette
      prevHintRef.current = hint
      prevRevealedRef.current = revealed
      return
    }

    const prevFilled = prevFilledRef.current
    const prevTarget = prevTargetRef.current
    const prevPalette = prevPaletteRef.current

    const total = cols * rows
    const needFull =
      prevPalette !== palette ||
      prevHintRef.current !== hint ||
      prevRevealedRef.current !== revealed ||
      !prevTarget ||
      prevTarget.length !== target.length ||
      prevTarget.some((v, i) => v !== target[i])

    if (needFull) {
      if (cellsRef.current.length !== total) ensureCells(total)
      redrawAll()
    } else if (prevFilled && prevFilled.length === filled.length) {
      // 仅重绘变化的格子（局部重绘优化）
      for (let i = 0; i < filled.length; i++) {
        if (prevFilled[i] !== filled[i]) drawCell(i)
      }
      drawOverlay()
    }

    prevFilledRef.current = filled.slice()
    prevTargetRef.current = target.slice()
    prevPaletteRef.current = palette
    prevHintRef.current = hint
    prevRevealedRef.current = revealed
  }, [cols, rows, palette, target, filled, hint, revealed])

  return <div className="puzzle-canvas" ref={containerRef} />
}
