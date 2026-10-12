import { useEffect, useState } from 'react'
import { HashRouter, Routes, Route, Navigate, useNavigate } from 'react-router'
import { Toaster } from '@/components/ui/sonner'
import { toast } from 'sonner'
import { useAuthStore } from '@/store/authStore'
import { setUnauthorizedHandler } from '@/api'
import Layout from '@/components/Layout'
import Login from '@/pages/Login'
import Dashboard from '@/pages/Dashboard'
import School from '@/pages/School'
import Today from '@/pages/Today'
import Students from '@/pages/Students'
import Evaluation from '@/pages/Evaluation'
import IEP from '@/pages/IEP'
import Teaching from '@/pages/Teaching'
import Templates from '@/pages/Templates'
import Parents from '@/pages/Parents'
import System from '@/pages/System'
import AdminConsole from '@/pages/AdminConsole'

/**
 * 认证守卫：未登录用户重定向到登录页
 */
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />
}

/**
 * 菜单权限守卫：检查用户是否有指定菜单的访问权限
 * 无权限时重定向到首页，并弹一次提示——
 * v14 真实浏览器冒烟实测：教师直接访问 /#/templates 会被静默跳回今日工作台，
 * 用户看到的是"我点的页面没反应"，比看到"无权限"更困惑。
 */
function RouteGuard({ menuKey, children }: { menuKey: string; children: React.ReactNode }) {
  const { hasMenu } = useAuthStore();
  const allowed = hasMenu(menuKey);
  useEffect(() => {
    if (!allowed) toast.info('无权限访问该页面，已返回首页');
  }, [allowed]);
  return allowed ? <>{children}</> : <Navigate to="/" replace />;
}

/**
 * 首页路由：默认落在「今日工作台」，而不是统计仪表盘。
 *
 * 为什么要换：旧首页回答的是「系统里现在有多少东西」（九宫格 + 六张统计卡），
 * 那是教导主任的视角；教师早上打开电脑真正要问的是「今天我要为哪几个孩子做什么」。
 * 旧仪表盘没有删，降级为 /dashboard 二级页面，教师排斥新首页时可随时切回。
 */
function HomeRoute() {
  const { hasMenu } = useAuthStore();
  if (hasMenu('today')) return <Today />;
  // 家长等无教学待办的账号，落到与其最相关的页面
  if (hasMenu('parents')) return <Navigate to="/parents" replace />;
  if (hasMenu('dashboard')) return <Dashboard />;
  return <Navigate to="/iep" replace />;
}

/**
 * 兜底路由：未知地址不再白屏。
 *
 * 2026-10-11 真实浏览器冒烟实测：访问不存在的路由（如 /#/today——
 * 「今日」的真实路径是 /），页面渲染为完全空白，用户看到的是"系统坏了"，
 * 而实际只是链接失效或书签过期。白屏比报错更伤信任。
 */
function NotFound() {
  const navigate = useNavigate();
  const { hasMenu } = useAuthStore();
  const home = hasMenu('today') ? '/' : hasMenu('parents') ? '/parents' : '/dashboard';
  return (
    <div className="mx-auto max-w-[900px] py-24 text-center">
      <p className="text-sm text-[#64748B]">这个地址没有对应的页面，可能链接已失效。</p>
      <button
        type="button"
        onClick={() => navigate(home)}
        className="mt-4 rounded-md border border-[#E2E8F0] px-4 py-2 text-sm text-[#475569] hover:bg-[#F8FAFC] cursor-pointer"
      >
        返回首页
      </button>
    </div>
  );
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
          <Route index element={<HomeRoute />} />
          {/* 旧统计仪表盘：保留为二级页面，教师排斥新首页时可切回 */}
          <Route path="dashboard" element={<RouteGuard menuKey="dashboard"><Dashboard /></RouteGuard>} />
          <Route path="students" element={<RouteGuard menuKey="students"><Students /></RouteGuard>} />
          <Route path="evaluation" element={<RouteGuard menuKey="evaluation"><Evaluation /></RouteGuard>} />
          <Route path="iep" element={<RouteGuard menuKey="iep"><IEP /></RouteGuard>} />
          <Route path="teaching" element={<RouteGuard menuKey="teaching"><Teaching /></RouteGuard>} />
          <Route path="templates" element={<RouteGuard menuKey="templates"><Templates /></RouteGuard>} />
          <Route path="parents" element={<RouteGuard menuKey="parents"><Parents /></RouteGuard>} />
          <Route path="school" element={<RouteGuard menuKey="school"><School /></RouteGuard>} />
          <Route path="system" element={<RouteGuard menuKey="system"><System /></RouteGuard>} />
          {/* 管理控制台：仅权限组 1（超级管理员）的 menu_permissions 含 "admin" */}
          <Route path="admin" element={<RouteGuard menuKey="admin"><AdminConsole /></RouteGuard>} />
          {/* 兜底：未知地址显示明确提示，杜绝白屏 */}
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
      <Toaster position="top-right" />
    </HashRouter>
  )
}
