// 取色板：6 列网格显示颜色
import type { PaletteColor } from '../types'

interface PaletteProps {
  palette: PaletteColor[]
  selected: number
  onSelect: (idx: number) => void
}

export default function Palette({ palette, selected, onSelect }: PaletteProps) {
  return (
    <div className="palette-grid">
      {palette.map((c, i) => (
        <button
          key={i}
          className={`swatch ${i === selected ? 'selected' : ''}`}
          style={{ backgroundColor: c.hex }}
          onClick={() => onSelect(i)}
          title={c.hex}
        />
      ))}
    </div>
  )
}
