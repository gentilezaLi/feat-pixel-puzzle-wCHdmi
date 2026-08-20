// 用户注册 API
import { NextRequest, NextResponse } from 'next/server'
import { createUser, getUserByUsername } from '@/lib/db'
import { hashPassword, generateToken } from '@/lib/auth'

// POST /api/auth/register
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { username, password } = body as { username?: string; password?: string }

    // 验证：用户名 2-20 字符
    if (!username || username.trim().length < 2 || username.trim().length > 20) {
      return NextResponse.json({ error: '用户名长度必须为 2-20 字符' }, { status: 400 })
    }

    // 验证：密码 6-32 字符
    if (!password || password.length < 6 || password.length > 32) {
      return NextResponse.json({ error: '密码长度必须为 6-32 字符' }, { status: 400 })
    }

    const trimmedUsername = username.trim()

    // 检查用户名是否已存在
    if (getUserByUsername(trimmedUsername)) {
      return NextResponse.json({ error: '用户名已被使用' }, { status: 400 })
    }

    // 加密密码，存入数据库
    const passwordHash = hashPassword(password)
    const user = createUser(trimmedUsername, passwordHash)

    // 生成 JWT
    const token = generateToken({ id: user.id, username: user.username })

    return NextResponse.json({ token, user: { id: user.id, username: user.username } })
  } catch (error) {
    return NextResponse.json({ error: '注册失败，请检查请求参数' }, { status: 400 })
  }
}
