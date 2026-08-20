// 顶栏：品牌、统计、登录/用户区
import type { AuthState } from '../types'

interface TopBarProps {
  stats: { pct: number; done: number; total: number }
  auth: AuthState
  onLoginClick: () => void
  onLogout: () => void
}

export default function TopBar({ stats, auth, onLoginClick, onLogout }: TopBarProps) {
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-name">拼豆工坊</span>
        <span className="brand-sub">// NEON PIXELS</span>
      </div>

      <div className="stats">
        <div className="stat-card">
          <span className="stat-label">完成度</span>
          <span className="stat-value neon-cyan">{stats.pct}%</span>
        </div>
        <div className="stat-divider" />
        <div className="stat-card">
          <span className="stat-label">已涂格</span>
          <span className="stat-value neon-magenta">{stats.done}</span>
        </div>
        <div className="stat-divider" />
        <div className="stat-card">
          <span className="stat-label">总格数</span>
          <span className="stat-value neon-purple">{stats.total}</span>
        </div>
      </div>

      <div className="auth-area">
        {!auth.user ? (
          <button className="btn ghost" onClick={onLoginClick}>
            登录
          </button>
        ) : (
          <div className="user-box">
            <span className="username">{auth.user.username}</span>
            <button className="btn ghost" onClick={onLogout}>
              退出
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
