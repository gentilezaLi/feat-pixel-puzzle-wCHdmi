// 拼豆工坊后端 - API 信息首页
const endpoints = [
  { method: 'POST', path: '/api/auth/register', desc: '用户注册（用户名 2-20 字符，密码 6-32 字符）' },
  { method: 'POST', path: '/api/auth/login', desc: '用户登录，返回 JWT token' },
  { method: 'GET', path: '/api/skins', desc: '获取皮肤列表（已登录返回全部，未登录仅返回免费皮肤）' },
  { method: 'GET', path: '/api/skins/:skinId/image', desc: '获取皮肤图片（返回 image/jpeg）' },
]

export default function Home() {
  return (
    <main
      style={{
        fontFamily: 'monospace',
        maxWidth: 820,
        margin: '40px auto',
        padding: 24,
        color: '#222',
      }}
    >
      <h1 style={{ marginBottom: 4 }}>拼豆工坊 · 像素画后端 API</h1>
      <p style={{ marginTop: 0, color: '#888' }}>Pixel Puzzle Backend · Next.js 14 + SQLite</p>

      <h2>可用端点</h2>
      <ul style={{ lineHeight: 1.9 }}>
        {endpoints.map((ep) => (
          <li key={ep.path}>
            <strong style={{ color: '#0a7' }}>[{ep.method}]</strong>{' '}
            <code style={{ background: '#f3f3f3', padding: '2px 6px', borderRadius: 4 }}>
              {ep.path}
            </code>
            <br />
            <span style={{ color: '#666' }}>{ep.desc}</span>
          </li>
        ))}
      </ul>

      <h2>认证说明</h2>
      <p style={{ color: '#666' }}>
        登录或注册成功后会返回 <code>token</code>，调用需要鉴权的接口时请在请求头携带：
        <br />
        <code>Authorization: Bearer &lt;token&gt;</code>
      </p>
    </main>
  )
}
