// 皮肤图片 API
import { NextRequest, NextResponse } from 'next/server'
import { getSkinBySkinId } from '@/lib/db'
import fs from 'fs'
import path from 'path'

// 皮肤图片所在目录
const SKINS_DIR = 'D:\\learn\\pixel-puzzle-backend\\skins'

// GET /api/skins/:skinId/image
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  // 从数据库查找对应 skin_id 的皮肤
  const skin = getSkinBySkinId(params.id)
  if (!skin) {
    return NextResponse.json({ error: '皮肤不存在' }, { status: 404 })
  }

  const filePath = path.join(SKINS_DIR, skin.file)

  // 检查文件是否存在
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: '图片文件不存在' }, { status: 404 })
  }

  try {
    // 读取图片文件并返回
    const fileBuffer = fs.readFileSync(filePath)
    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  } catch (error) {
    return NextResponse.json({ error: '读取图片失败' }, { status: 404 })
  }
}
