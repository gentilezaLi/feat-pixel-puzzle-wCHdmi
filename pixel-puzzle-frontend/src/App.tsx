// 主组件：整合拼豆工坊所有功能
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from './hooks/useAuth'
import * as api from './utils/api'
import {
  downsample,
  loadImage,
  medianCut,
  nearestPalette,
  dedupePalette,
} from './utils/colorQuantization'
import type { PaletteColor, RGB, Skin } from './types'
import TopBar from './components/TopBar'
import LoginModal from './components/LoginModal'
import SkinThumbs from './components/SkinThumbs'
import SizeSwitch from './components/SizeSwitch'
import Palette from './components/Palette'
import PuzzleCanvas from './components/PuzzleCanvas'
import VictoryOverlay from './components/VictoryOverlay'
import Toast from './components/Toast'

// 近白判定：接近纯白的格子视为空（-1）
function isNearWhite(p: RGB): boolean {
  return p[0] >= 248 && p[1] >= 248 && p[2] >= 248
}

// 技术栈标签
const STACK = ['React', 'Vite', 'TypeScript', 'PixiJS v8', 'WebGL']

// 规则说明
const RULES = [
  '点击调色板选画笔，再点格子涂色。',
  '颜色与底图匹配才会被涂上，不匹配会提示。',
  '开启「显示底图」可看到半透明目标色提示。',
  '查看完成图可一键看全图，重置清空画作。',
]

export default function App() {
  const auth = useAuth()

  const [skins, setSkins] = useState<Skin[]>([])
  const [skin, setSkin] = useState<Skin | null>(null)
  const [cols, setCols] = useState(45)
  const [rows, setRows] = useState(60)
  const [palette, setPalette] = useState<PaletteColor[]>([])
  const [target, setTarget] = useState<number[]>([])
  const [filled, setFilled] = useState<number[]>([])
  const [selected, setSelected] = useState(0)
  const [hint, setHint] = useState(false)
  const [revealed, setRevealed] = useState(false)

  const [showLogin, setShowLogin] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [victory, setVictory] = useState(false)

  // toast
  const [toastKey, setToastKey] = useState(0)
  const [toastMsg, setToastMsg] = useState('')
  const toast = useCallback((msg: string) => {
    setToastMsg(msg)
    setToastKey((k) => k + 1)
  }, [])

  // 图片缓存（避免尺寸切换时重新下载）
  const imgRef = useRef<HTMLImageElement | null>(null)
  const imgSkinRef = useRef<string>('')

  // 加载皮肤列表（随登录状态刷新）
  useEffect(() => {
    api
      .getSkins()
      .then(setSkins)
      .catch(() => setSkins([]))
  }, [auth.user])

  // 核心处理：加载图片 -> 降采样 -> 中位切分量化 -> 生成目标网格
  const processSkin = useCallback(
    async (s: Skin, c: number, r: number) => {
      setProcessing(true)
      try {
        let img = imgRef.current
        if (!img || imgSkinRef.current !== s.id) {
          img = await loadImage(api.getSkinImage(s.id))
          imgRef.current = img
          imgSkinRef.current = s.id
        }
        const { px, rows: actualRows } = downsample(img, c, r)
        let pal = dedupePalette(medianCut(px, s.paletteSize || 16), 30)
        if (!pal.length) pal = [{ r: 0, g: 0, b: 0, hex: '#000000' }]
        const tgt = px.map((p) => (isNearWhite(p) ? -1 : nearestPalette(p, pal)))
        setSkin(s)
        setCols(c)
        setRows(actualRows)
        setPalette(pal)
        setTarget(tgt)
        setFilled(new Array(tgt.length).fill(-1))
        setSelected(0)
        setHint(false)
        setRevealed(false)
        setVictory(false)
      } catch {
        toast('皮肤加载失败')
      } finally {
        setProcessing(false)
      }
    },
    [toast],
  )

  // 默认加载 simple 皮肤
  useEffect(() => {
    if (!skins.length || skin) return
    const def =
      skins.find((s) => s.id === 'simple') ||
      skins.find((s) => s.isFree) ||
      skins[0]
    processSkin(def, cols, rows)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skins])

  // 切换皮肤
  const handleSelectSkin = useCallback(
    (s: Skin) => {
      if (s.id === skin?.id) return
      processSkin(s, cols, rows)
    },
    [processSkin, skin, cols, rows],
  )

  // 尺寸应用
  const handleApplySize = useCallback(
    (c: number, r: number) => {
      if (!skin) return
      processSkin(skin, c, r)
    },
    [processSkin, skin],
  )

  // 涂色校验
  const handlePaint = useCallback(
    (idx: number) => {
      if (revealed || victory) return
      const tgt = target[idx]
      if (tgt === -1) {
        toast('这格是空的')
        return
      }
      if (filled[idx] === tgt) return
      if (selected === tgt) {
        setFilled((f) => {
          const nf = f.slice()
          nf[idx] = selected
          return nf
        })
      } else {
        toast('颜色不对，换一支画笔吧')
      }
    },
    [revealed, victory, target, filled, selected, toast],
  )

  // 取色（hint 模式）
  const handlePick = useCallback(
    (idx: number) => {
      const tgt = target[idx]
      if (tgt === -1) return
      setSelected(tgt)
    },
    [target],
  )

  // 一键涂满
  const handleAutoFill = useCallback(() => {
    setFilled(target.map((t) => (t === -1 ? -1 : t)))
    setRevealed(false)
    setHint(false)
  }, [target])

  // 逐行涂
  const handleAutoFillRow = useCallback(() => {
    setFilled((f) => {
      const nf = f.slice()
      for (let row = 0; row < rows; row++) {
        let incomplete = false
        for (let col = 0; col < cols; col++) {
          const idx = row * cols + col
          if (target[idx] !== -1 && nf[idx] !== target[idx]) {
            incomplete = true
            break
          }
        }
        if (incomplete) {
          for (let col = 0; col < cols; col++) {
            const idx = row * cols + col
            if (target[idx] !== -1) nf[idx] = target[idx]
          }
          break
        }
      }
      return nf
    })
  }, [cols, rows, target])

  // 重置
  const handleReset = useCallback(() => {
    setFilled(new Array(target.length).fill(-1))
    setRevealed(false)
    setHint(false)
    setVictory(false)
  }, [target.length])

  // 统计
  const stats = useMemo(() => {
    const total = target.filter((t) => t !== -1).length
    const done = filled.filter((f, i) => target[i] !== -1 && f !== -1).length
    const pct = total ? Math.round((done / total) * 100) : 0
    return { total, done, pct }
  }, [target, filled])

  // 胜利检测
  useEffect(() => {
    if (stats.total === 0) return
    if (stats.done >= stats.total && !victory) setVictory(true)
  }, [stats, victory])

  // 当前画笔颜色
  const brushColor = palette[selected]?.hex ?? '#000'

  const isLocked = useCallback(
    (s: Skin) => !auth.user && !s.isFree,
    [auth.user],
  )

  return (
    <div className="app">
      <div className="scanlines" />

      <TopBar
        stats={stats}
        auth={{ user: auth.user, token: auth.token }}
        onLoginClick={() => setShowLogin(true)}
        onLogout={auth.logout}
      />

      <main className="layout">
        {/* 左侧：画布 */}
        <section className="canvas-pane">
          <div className="pane-head">
            <span className="pane-title">画布</span>
            <span className="pane-size">
              {cols}×{rows}
            </span>
          </div>
          <div className="canvas-wrap">
            <PuzzleCanvas
              cols={cols}
              rows={rows}
              palette={palette}
              target={target}
              filled={filled}
              selected={selected}
              hint={hint}
              revealed={revealed}
              onCellPaint={handlePaint}
              onCellPick={handlePick}
            />
            {processing && <div className="loading-veil">渲染中…</div>}
          </div>
        </section>

        {/* 右侧：控制面板 */}
        <aside className="control-pane">
          {/* 画笔显示 */}
          <div className="block">
            <div className="block-title">画笔</div>
            <div className="brush-row">
              <span
                className="brush-chip"
                style={{ backgroundColor: brushColor }}
              />
              <span className="brush-hex">{brushColor}</span>
            </div>
          </div>

          {/* 色板 */}
          <div className="block">
            <div className="block-title">色板</div>
            {palette.length ? (
              <Palette palette={palette} selected={selected} onSelect={setSelected} />
            ) : (
              <div className="muted">加载中…</div>
            )}
          </div>

          {/* 操作按钮 */}
          <div className="block">
            <div className="block-title">操作</div>
            <div className="btn-row">
              <button
                className={`btn ghost ${hint ? 'active' : ''}`}
                onClick={() => setHint((v) => !v)}
              >
                显示底图
              </button>
              <button
                className={`btn ghost ${revealed ? 'active' : ''}`}
                onClick={() => setRevealed((v) => !v)}
              >
                查看完成图
              </button>
            </div>
            <div className="btn-row">
              <button className="btn cheat" onClick={handleAutoFill}>
                一键涂满
              </button>
              <button className="btn cheat" onClick={handleAutoFillRow}>
                逐行涂
              </button>
            </div>
            <div className="btn-row">
              <button className="btn ghost" onClick={handleReset}>
                重置
              </button>
            </div>
          </div>

          {/* 皮肤选择 */}
          <div className="block">
            <div className="block-title">皮肤</div>
            <SkinThumbs
              skins={skins}
              currentSkinId={skin?.id ?? ''}
              onSelect={handleSelectSkin}
              isLocked={isLocked}
            />
          </div>

          {/* 尺寸 */}
          <div className="block">
            <div className="block-title">尺寸</div>
            <SizeSwitch cols={cols} rows={rows} onApply={handleApplySize} />
          </div>

          {/* 规则 */}
          <div className="block">
            <div className="block-title">规则</div>
            <ul className="rules">
              {RULES.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>

          {/* 技术栈 */}
          <div className="block">
            <div className="block-title">技术栈</div>
            <div className="stack-tags">
              {STACK.map((t) => (
                <span className="stack-tag" key={t}>
                  {t}
                </span>
              ))}
            </div>
          </div>
        </aside>
      </main>

      {showLogin && (
        <LoginModal
          onClose={() => setShowLogin(false)}
          onLogin={auth.login}
          onRegister={auth.register}
        />
      )}

      <VictoryOverlay show={victory} onReset={handleReset} />
      <Toast key={toastKey} message={toastMsg} show={true} />
    </div>
  )
}
