// JWT 认证工具模块
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'

// JWT 密钥（硬编码）
const JWT_SECRET = 'pixel-puzzle-secret-key-2024'

// JWT payload 结构
export interface JwtPayload {
  id: number
  username: string
}

// 生成 JWT token，过期时间 7 天
export function generateToken(user: { id: number; username: string }): string {
  return jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, {
    expiresIn: '7d',
  })
}

// 验证 JWT token，返回 payload 或 null
export function verifyToken(token: string): JwtPayload | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as JwtPayload
    return payload
  } catch (error) {
    return null
  }
}

// 使用 bcryptjs 加密密码
export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 10)
}

// 使用 bcryptjs 比较密码
export function comparePassword(password: string, hash: string): boolean {
  return bcrypt.compareSync(password, hash)
}
