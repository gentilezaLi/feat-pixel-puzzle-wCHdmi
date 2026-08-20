// SQLite 数据库管理模块
import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'

// 数据库文件路径
const DB_PATH = 'D:\\learn\\pixel-puzzle-backend\\data\\puzzle.db'

// 自动创建 data 目录
const dbDir = path.dirname(DB_PATH)
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true })
}

// 创建数据库实例
const db = new Database(DB_PATH)

// 开启 WAL 模式以提升并发性能
db.pragma('journal_mode = WAL')

// 初始化数据库表
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS skins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    skin_id TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    file TEXT NOT NULL,
    palette_size INTEGER DEFAULT 16,
    is_free INTEGER DEFAULT 0
  );
`)

// 种子数据：如果 skins 表为空则插入
const countRow = db.prepare('SELECT COUNT(*) AS count FROM skins').get() as { count: number }

if (countRow.count === 0) {
  const insertStmt = db.prepare(
    'INSERT INTO skins (skin_id, name, file, palette_size, is_free) VALUES (?, ?, ?, ?, ?)'
  )

  // 内置皮肤列表
  const seedSkins = [
    { skin_id: 'simple', name: '极简·四色', file: 'simple.jpg', palette_size: 4, is_free: 1 },
    { skin_id: 'diaochan', name: '霓裳·貂蝉', file: 'diaochan.jpg', palette_size: 16, is_free: 0 },
    { skin_id: 'libai', name: '剑仙·李白', file: 'libai.jpg', palette_size: 16, is_free: 0 },
    { skin_id: 'hanxin', name: '神枪·韩信', file: 'hanxin.jpg', palette_size: 16, is_free: 0 },
    { skin_id: 'daji', name: '九尾·妲己', file: 'daji.jpg', palette_size: 16, is_free: 0 },
    { skin_id: 'wukong', name: '齐天·悟空', file: 'wukong.jpg', palette_size: 16, is_free: 0 },
    { skin_id: 'qingming', name: '汴河·赛博清明上河图', file: 'qingming.jpg', palette_size: 16, is_free: 0 },
    { skin_id: 'qingming_wide', name: '汴河·赛博清明上河图·横卷', file: 'qingming_wide.jpg', palette_size: 16, is_free: 0 },
  ]

  // 事务批量插入
  const insertMany = db.transaction((skins) => {
    for (const skin of skins) {
      insertStmt.run(skin.skin_id, skin.name, skin.file, skin.palette_size, skin.is_free)
    }
  })
  insertMany(seedSkins)
}

// 用户类型
export interface UserRow {
  id: number
  username: string
  password_hash: string
  created_at: string
}

// 皮肤类型
export interface SkinRow {
  id: number
  skin_id: string
  name: string
  file: string
  palette_size: number
  is_free: number
}

// 辅助函数：获取所有皮肤
export function getAllSkins(): SkinRow[] {
  return db.prepare('SELECT * FROM skins ORDER BY id ASC').all() as SkinRow[]
}

// 辅助函数：获取免费皮肤（is_free = 1）
export function getFreeSkins(): SkinRow[] {
  return db.prepare('SELECT * FROM skins WHERE is_free = 1 ORDER BY id ASC').all() as SkinRow[]
}

// 辅助函数：根据 skin_id 获取皮肤
export function getSkinBySkinId(skinId: string): SkinRow | undefined {
  return db.prepare('SELECT * FROM skins WHERE skin_id = ?').get(skinId) as SkinRow | undefined
}

// 辅助函数：创建用户
export function createUser(username: string, passwordHash: string): { id: number; username: string } {
  const stmt = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)')
  const info = stmt.run(username, passwordHash)
  return { id: Number(info.lastInsertRowid), username }
}

// 辅助函数：根据用户名获取用户
export function getUserByUsername(username: string): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username) as UserRow | undefined
}

export default db
