// 提示组件：显示消息并自动消失
import { useEffect, useState } from 'react'

interface ToastProps {
  message: string
  show: boolean
}

export default function Toast({ message, show }: ToastProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (show) {
      setVisible(true)
      const t = setTimeout(() => setVisible(false), 1800)
      return () => clearTimeout(t)
    }
    setVisible(false)
  }, [show, message])

  if (!visible) return null

  return <div className="toast">{message}</div>
}
