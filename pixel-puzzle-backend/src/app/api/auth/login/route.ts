// 用户登录 API
import { NextRequest, NextResponse } from 'next/server'
import { getUserByUsername } from '@/lib/db'
import { comparePassword, generateToken } from '@/lib/auth'

// POST /api/auth/login
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { username, password } = body as { username?: string; password?: string }

    if (!username || !password) {
      return NextResponse.json({ error: '用户名和密码不能为空' }, { status: 401 })
    }

    // 查找用户
    const user = getUserByUsername(username.trim())
    if (!user) {
      return NextResponse.json({ error: '用户名或密码错误' }, { status: 401 })
    }

    // 比较密码
    if (!comparePassword(password, user.password_hash)) {
      return NextResponse.json({ error: '用户名或密码错误' }, { status: 401 })
    }

    // 生成 JWT
    const token = generateToken({ id: user.id, username: user.username })

    return NextResponse.json({ token, user: { id: user.id, username: user.username } })
  } catch (error) {
    return NextResponse.json({ error: '登录失败' }, { status: 401 })
  }
}
