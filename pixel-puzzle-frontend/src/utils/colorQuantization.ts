// 颜色量化工具：从原项目迁移，保持算法完全一致
import type { PaletteColor, RGB } from '../types'

// 加载图片
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image()
    img.onload = () => res(img)
    img.onerror = rej
    img.src = src
  })
}

// 降采样到 cols×rows（rows 可指定，否则按宽高比计算）
export function downsample(
  img: HTMLImageElement,
  cols: number,
  rowsOverride?: number,
): { px: RGB[]; rows: number } {
  const ratio = img.naturalHeight / img.naturalWidth
  const rows = rowsOverride || Math.max(8, Math.round(cols * ratio))
  const c = document.createElement('canvas')
  c.width = cols
  c.height = rows
  const cx = c.getContext('2d')!
  cx.imageSmoothingEnabled = true
  cx.drawImage(img, 0, 0, cols, rows)
  const data = cx.getImageData(0, 0, cols, rows).data
  const px: RGB[] = new Array(cols * rows)
  for (let i = 0; i < cols * rows; i++) {
    px[i] = [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]]
  }
  return { px, rows }
}

// 计算盒子的最大单通道范围
export function boxRange(box: RGB[]): number {
  if (!box.length) return 0
  let minR = 255, maxR = 0, minG = 255, maxG = 0, minB = 255, maxB = 0
  for (const p of box) {
    if (p[0] < minR) minR = p[0]
    if (p[0] > maxR) maxR = p[0]
    if (p[1] < minG) minG = p[1]
    if (p[1] > maxG) maxG = p[1]
    if (p[2] < minB) minB = p[2]
    if (p[2] > maxB) maxB = p[2]
  }
  return Math.max(maxR - minR, maxG - minG, maxB - minB)
}

// 找出范围最大的通道索引
export function longestChannel(box: RGB[]): number {
  if (!box.length) return 0
  let minR = 255, maxR = 0, minG = 255, maxG = 0, minB = 255, maxB = 0
  for (const p of box) {
    if (p[0] < minR) minR = p[0]
    if (p[0] > maxR) maxR = p[0]
    if (p[1] < minG) minG = p[1]
    if (p[1] > maxG) maxG = p[1]
    if (p[2] < minB) minB = p[2]
    if (p[2] > maxB) maxB = p[2]
  }
  const dr = maxR - minR
  const dg = maxG - minG
  const db = maxB - minB
  if (dr >= dg && dr >= db) return 0
  if (dg >= db) return 1
  return 2
}

// 计算盒子平均色
export function avg(box: RGB[]): PaletteColor | null {
  if (!box.length) return null
  let r = 0, g = 0, b = 0
  for (const p of box) {
    r += p[0]
    g += p[1]
    b += p[2]
  }
  r = Math.round(r / box.length)
  g = Math.round(g / box.length)
  b = Math.round(b / box.length)
  return { r, g, b, hex: rgbToHex(r, g, b) }
}

// 中位切分量化
export function medianCut(pixels: RGB[], k: number): PaletteColor[] {
  let boxes: RGB[][] = [pixels.slice()]
  while (boxes.length < k) {
    let bi = -1, best = -1
    for (let i = 0; i < boxes.length; i++) {
      if (boxes[i].length < 2) continue
      const r = boxRange(boxes[i])
      if (r > best) {
        best = r
        bi = i
      }
    }
    if (bi === -1) break
    const box = boxes[bi]
    const ch = longestChannel(box)
    box.sort((a, b) => a[ch] - b[ch])
    const mid = box.length >> 1
    boxes.splice(bi, 1, box.slice(0, mid), box.slice(mid))
  }
  return boxes.map(avg).filter((x): x is PaletteColor => Boolean(x))
}

// 加权 RGB 色差：2*r*r + 4*g*g + 3*b*b
export function colorDist(a: RGB, b: RGB): number {
  const dr = a[0] - b[0]
  const dg = a[1] - b[1]
  const db = a[2] - b[2]
  return 2 * dr * dr + 4 * dg * dg + 3 * db * db
}

// 找到最近的调色板索引
export function nearestPalette(rgb: RGB, palette: PaletteColor[]): number {
  let bi = 0, best = Infinity
  for (let i = 0; i < palette.length; i++) {
    const p = palette[i]
    const d = colorDist(rgb, [p.r, p.g, p.b])
    if (d < best) {
      best = d
      bi = i
    }
  }
  return bi
}

// 去重：删除彼此色差小于阈值的颜色
export function dedupePalette(palette: PaletteColor[], thresh: number): PaletteColor[] {
  const out: PaletteColor[] = []
  for (const c of palette) {
    let dup = false
    for (const o of out) {
      if (colorDist([c.r, c.g, c.b], [o.r, o.g, o.b]) < thresh) {
        dup = true
        break
      }
    }
    if (!dup) out.push(c)
  }
  return out
}

// 计算亮度
export function lum(c: PaletteColor): number {
  return 0.299 * c.r + 0.587 * c.g + 0.114 * c.b
}

// rgb 转十六进制字符串 #rrggbb
export function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number) => n.toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`
}

// 十六进制字符串转数字 0xRRGGBB（供 PixiJS 使用）
export function hexToInt(hex: string): number {
  return parseInt(hex.replace('#', ''), 16)
}
