// 尺寸预设切换器（与原项目一致）
import { useState } from 'react'

interface SizeSwitchProps {
  cols: number
  rows: number
  onApply: (cols: number, rows: number) => void
}

// 预设：[名称, cols, rows]
const PRESETS: [string, number, number][] = [
  ['超小', 12, 16],
  ['小', 20, 26],
  ['中', 45, 60],
  ['大', 60, 80],
  ['超大', 90, 120],
  ['PLUS', 200, 250],
]

export default function SizeSwitch({ cols, rows, onApply }: SizeSwitchProps) {
  const [w, setW] = useState(cols)
  const [h, setH] = useState(rows)

  function apply(c: number, r: number) {
    if (c < 2 || r < 2) return
    setW(c)
    setH(r)
    onApply(c, r)
  }

  return (
    <div className="size-switch">
      <div className="size-inputs">
        <label>
          宽
          <input
            type="number"
            min={2}
            value={w}
            onChange={(e) => setW(Math.max(2, parseInt(e.target.value) || 0))}
          />
        </label>
        <span className="size-x">×</span>
        <label>
          高
          <input
            type="number"
            min={2}
            value={h}
            onChange={(e) => setH(Math.max(2, parseInt(e.target.value) || 0))}
          />
        </label>
        <button className="btn ghost" onClick={() => apply(w, h)}>
          应用
        </button>
      </div>
      <div className="size-presets">
        {PRESETS.map(([name, c, r]) => (
          <button
            key={name}
            className="btn ghost preset"
            onClick={() => apply(c, r)}
          >
            {name}
            <span className="preset-size">
              {c}×{r}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
