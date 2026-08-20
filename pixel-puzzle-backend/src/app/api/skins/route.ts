// 皮肤列表 API
import { NextRequest, NextResponse } from 'next/server'
import { getAllSkins, getFreeSkins } from '@/lib/db'
import { verifyToken } from '@/lib/auth'

// GET /api/skins
export async function GET(request: NextRequest) {
  // 读取 Authorization header 中的 Bearer token
  const authHeader = request.headers.get('authorization')
  let isLoggedIn = false

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim()
    const payload = verifyToken(token)
    if (payload) {
      isLoggedIn = true
    }
  }

  // 已登录返回全部皮肤，未登录只返回免费皮肤
  const skins = isLoggedIn ? getAllSkins() : getFreeSkins()

  // 统一返回格式，file 字段为图片访问路径
  return NextResponse.json(
    skins.map((skin) => ({
      id: skin.id,
      skinId: skin.skin_id,
      name: skin.name,
      file: `/api/skins/${skin.skin_id}/image`,
      paletteSize: skin.palette_size,
      isFree: skin.is_free === 1,
    }))
  )
}
