// 全局类型定义

// RGB 三元组
export type RGB = [number, number, number]

// 调色板颜色：包含原始 rgb 与对应十六进制字符串
export interface PaletteColor {
  r: number
  g: number
  b: number
  hex: string
}

// 皮肤（拼豆图案）定义
export interface Skin {
  id: string
  name: string
  file: string
  paletteSize: number
  isFree: boolean
}

// 用户信息
export interface User {
  id: number
  username: string
}

// 认证状态
export interface AuthState {
  user: User | null
  token: string | null
}

// 游戏拼图状态
export interface PuzzleState {
  skin: Skin | null
  cols: number
  rows: number
  palette: PaletteColor[]
  target: number[] // 每个格子的目标调色板索引，-1 表示空
  filled: number[] // 每个格子当前填充的调色板索引，-1 表示未涂
  selected: number // 当前选中画笔的调色板索引
  painting: boolean // 是否正在拖拽涂色
  hint: boolean // 是否显示半透明底图提示
  revealed: boolean // 是否显示完整答案
  autoFilling: boolean // 是否一键涂满中
}
