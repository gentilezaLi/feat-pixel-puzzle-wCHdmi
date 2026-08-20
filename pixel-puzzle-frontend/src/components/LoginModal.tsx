// 登录/注册弹窗
import { useState } from 'react'

interface LoginModalProps {
  onClose: () => void
  onLogin: (username: string, password: string) => Promise<unknown>
  onRegister: (username: string, password: string) => Promise<unknown>
}

export default function LoginModal({ onClose, onLogin, onRegister }: LoginModalProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!username.trim() || !password) {
      setError('请输入用户名和密码')
      return
    }
    setBusy(true)
    setError('')
    try {
      if (mode === 'login') {
        await onLogin(username.trim(), password)
      } else {
        await onRegister(username.trim(), password)
      }
      onClose()
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? // @ts-expect-error axios error
            err.response?.data?.message || '请求失败'
          : '网络错误'
      setError(msg)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-modal-overlay" onClick={onClose}>
      <div className="login-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>
          ×
        </button>
        <h2 className="modal-title">{mode === 'login' ? '登录' : '注册'}</h2>

        <div className="modal-tabs">
          <button
            className={`modal-tab ${mode === 'login' ? 'active' : ''}`}
            onClick={() => setMode('login')}
          >
            登录
          </button>
          <button
            className={`modal-tab ${mode === 'register' ? 'active' : ''}`}
            onClick={() => setMode('register')}
          >
            注册
          </button>
        </div>

        <form className="modal-form" onSubmit={submit}>
          <input
            className="modal-input"
            type="text"
            placeholder="用户名"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
          />
          <input
            className="modal-input"
            type="password"
            placeholder="密码"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          />
          {error && <div className="modal-error">{error}</div>}
          <button className="btn primary modal-submit" type="submit" disabled={busy}>
            {busy ? '处理中…' : mode === 'login' ? '登录' : '注册'}
          </button>
        </form>
      </div>
    </div>
  )
}
