// 胜利遮罩：COMPLETE 标题 + 彩虹屁 + 彩带动画
import { useMemo } from 'react'

interface VictoryOverlayProps {
  show: boolean
  onReset: () => void
}

// 鼓励文案（随机切换）
const PRAISES = [
  '像素之神，非你莫属！',
  '每一颗拼豆都在为你发光！',
  '完美还原，色彩大师就是你！',
  '这双手是被霓虹祝福过的吧！',
  '从噪点到杰作，只差一个你。',
  '拼豆工坊头号工匠上线！',
  '像素级精准，色彩级灵魂！',
]

// 彩带 emoji
const CONFETTI_EMOJI = ['🎉', '✨', '🌈', '⭐', '🎊', '💫', '🟣', '🟢', '🟡', '🟦']

export default function VictoryOverlay({ show, onReset }: VictoryOverlayProps) {
  // 随机鼓励文案
  const praise = useMemo(() => {
    return PRAISES[Math.floor(Math.random() * PRAISES.length)]
  }, [show])

  // 彩带粒子
  const confetti = useMemo(() => {
    if (!show) return []
    const arr: { emoji: string; left: number; delay: number; dur: number; size: number }[] = []
    for (let i = 0; i < 40; i++) {
      arr.push({
        emoji: CONFETTI_EMOJI[Math.floor(Math.random() * CONFETTI_EMOJI.length)],
        left: Math.random() * 100,
        delay: Math.random() * 2.5,
        dur: 2.5 + Math.random() * 2.5,
        size: 18 + Math.random() * 26,
      })
    }
    return arr
  }, [show])

  if (!show) return null

  return (
    <div className="victory-overlay">
      <div className="confetti-layer">
        {confetti.map((c, i) => (
          <span
            key={i}
            className="confetti-piece"
            style={{
              left: `${c.left}%`,
              animationDelay: `${c.delay}s`,
              animationDuration: `${c.dur}s`,
              fontSize: `${c.size}px`,
            }}
          >
            {c.emoji}
          </span>
        ))}
      </div>

      <div className="victory-card">
        <h1 className="victory-title rainbow-text">COMPLETE</h1>
        <p className="victory-praise">{praise}</p>
        <button className="btn primary" onClick={onReset}>
          再来一幅
        </button>
      </div>
    </div>
  )
}
