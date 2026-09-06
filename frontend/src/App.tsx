import { useEffect, useState } from 'react'
import { HashRouter, Routes, Route, Navigate, useNavigate } from 'react-router'
import { Toaster } from '@/components/ui/sonner'
import { useAuthStore } from '@/store/authStore'
import { setUnauthorizedHandler } from '@/api'
import Layout from '@/components/Layout'
import Login from '@/pages/Login'
import Dashboard from '@/pages/Dashboard'
import Students from '@/pages/Students'
import Evaluation from '@/pages/Evaluation'
import IEP from '@/pages/IEP'
import Teaching from '@/pages/Teaching'
import Templates from '@/pages/Templates'
import Parents from '@/pages/Parents'
import System from '@/pages/System'

/**
 * 认证守卫：未登录用户重定向到登录页
 */
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />
}

/**
 * 菜单权限守卫：检查用户是否有指定菜单的访问权限
 * 无权限时重定向到首页
 */
function RouteGuard({ menuKey, children }: { menuKey: string; children: React.ReactNode }) {
  const { hasMenu } = useAuthStore();
  return hasMenu(menuKey) ? <>{children}</> : <Navigate to="/" replace />;
}

export default function App() {
  const restore = useAuthStore((s) => s.restore)
  const [restored, setRestored] = useState(false)

  // 刷新页面后向后端换取真实权限，避免权限仅依赖 localStorage 中被篡改的副本
  useEffect(() => {
    restore().finally(() => setRestored(true))
  }, [restore])

  // 全局 401 处理：凭证失效时清理状态并回到登录页
  useEffect(() => {
    setUnauthorizedHandler(() => {
      useAuthStore.getState().logout()
      window.location.hash = '#/login'
    })
  }, [])

  // 会话恢复完成前不渲染受保护路由，防止菜单按空权限闪烁
  if (!restored) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-200 border-t-primary-600" />
          <p className="text-sm text-gray-500">正在恢复会话…</p>
        </div>
      </div>
    )
  }

  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="students" element={<RouteGuard menuKey="students"><Students /></RouteGuard>} />
          <Route path="evaluation" element={<RouteGuard menuKey="evaluation"><Evaluation /></RouteGuard>} />
          <Route path="iep" element={<RouteGuard menuKey="iep"><IEP /></RouteGuard>} />
          <Route path="teaching" element={<RouteGuard menuKey="teaching"><Teaching /></RouteGuard>} />
          <Route path="templates" element={<RouteGuard menuKey="templates"><Templates /></RouteGuard>} />
          <Route path="parents" element={<RouteGuard menuKey="parents"><Parents /></RouteGuard>} />
          <Route path="system" element={<RouteGuard menuKey="system"><System /></RouteGuard>} />
        </Route>
      </Routes>
      <Toaster position="top-right" />
    </HashRouter>
  )
}
