import { useState, useCallback } from "react"

export interface Toast {
  id: string
  title?: string
  description?: string
  variant?: "default" | "destructive"
}

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([])

  const toast = useCallback(({ title, description, variant = "default" }: Omit<Toast, "id">) => {
    const id = Math.random().toString(36).substring(2, 9)
    const newToast: Toast = { id, title, description, variant }
    
    setToasts(prev => [...prev, newToast])
    
    // Auto-remove toast after 3 seconds
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 3000)
    
    // For now, just console.log the toast (in a real app, this would show a toast UI)
    console.log(`Toast: ${title} - ${description}`)
    
    return { id }
  }, [])

  const dismiss = useCallback((toastId: string) => {
    setToasts(prev => prev.filter(t => t.id !== toastId))
  }, [])

  return {
    toast,
    dismiss,
    toasts
  }
}