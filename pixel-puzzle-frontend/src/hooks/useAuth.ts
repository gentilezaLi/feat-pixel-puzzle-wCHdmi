// 认证状态 hook
import { useCallback, useState } from 'react'
import type { User } from '../types'
import * as api from '../utils/api'

interface AuthHookState {
  user: User | null
  token: string | null
  loading: boolean
}

// 从 localStorage 初始化
function readStored(): AuthHookState {
  const token = localStorage.getItem('token')
  const userRaw = localStorage.getItem('user')
  let user: User | null = null
  if (userRaw) {
    try {
      user = JSON.parse(userRaw) as User
    } catch {
      user = null
    }
  }
  return { user, token, loading: false }
}

export function useAuth() {
  const [state, setState] = useState<AuthHookState>(readStored)

  const login = useCallback(async (username: string, password: string) => {
    setState((s) => ({ ...s, loading: true }))
    try {
      const { token, user } = await api.login(username, password)
      localStorage.setItem('token', token)
      localStorage.setItem('user', JSON.stringify(user))
      setState({ user, token, loading: false })
      return user
    } catch (e) {
      setState((s) => ({ ...s, loading: false }))
      throw e
    }
  }, [])

  const register = useCallback(async (username: string, password: string) => {
    setState((s) => ({ ...s, loading: true }))
    try {
      const { token, user } = await api.register(username, password)
      localStorage.setItem('token', token)
      localStorage.setItem('user', JSON.stringify(user))
      setState({ user, token, loading: false })
      return user
    } catch (e) {
      setState((s) => ({ ...s, loading: false }))
      throw e
    }
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    setState({ user: null, token: null, loading: false })
  }, [])

  return { ...state, login, register, logout }
}
