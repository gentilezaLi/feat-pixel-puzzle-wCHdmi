// API 客户端：基于 axios
import axios from 'axios'
import type { Skin, User } from '../types'

const instance = axios.create({
  baseURL: '/api',
})

// 请求拦截：附加 token
instance.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

interface AuthResp {
  token: string
  user: User
}

// 注册
export async function register(username: string, password: string): Promise<AuthResp> {
  const { data } = await instance.post<AuthResp>('/auth/register', { username, password })
  return data
}

// 登录
export async function login(username: string, password: string): Promise<AuthResp> {
  const { data } = await instance.post<AuthResp>('/auth/login', { username, password })
  return data
}

// 获取皮肤列表（未登录只返回免费，已登录返回全部）
export async function getSkins(token?: string): Promise<Skin[]> {
  const headers: Record<string, string> = {}
  const t = token || localStorage.getItem('token') || undefined
  if (t) headers.Authorization = `Bearer ${t}`
  const { data } = await instance.get<Skin[]>('/skins', { headers })
  return data
}

// 获取皮肤图片 URL
export function getSkinImage(skinId: string): string {
  return `/api/skins/${skinId}/image`
}
