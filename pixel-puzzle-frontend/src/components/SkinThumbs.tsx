// 皮肤缩略图选择器
import type { Skin } from '../types'
import { getSkinImage } from '../utils/api'

interface SkinThumbsProps {
  skins: Skin[]
  currentSkinId: string
  onSelect: (skin: Skin) => void
  isLocked: (skin: Skin) => boolean
}

export default function SkinThumbs({
  skins,
  currentSkinId,
  onSelect,
  isLocked,
}: SkinThumbsProps) {
  return (
    <div className="thumbs">
      {skins.map((skin) => {
        const locked = isLocked(skin)
        const active = skin.id === currentSkinId
        return (
          <button
            key={skin.id}
            className={`thumb ${active ? 'active' : ''} ${locked ? 'locked' : ''}`}
            onClick={() => !locked && onSelect(skin)}
            title={skin.name}
            disabled={locked}
          >
            <img src={getSkinImage(skin.id)} alt={skin.name} loading="lazy" />
            <span className="thumb-name">{skin.name}</span>
          </button>
        )
      })}
    </div>
  )
}
