import { useEffect, useState, lazy, Suspense } from 'react'
import { HashRouter, Routes, Route, Navigate, useNavigate, useLocation, useNavigationType } from 'react-router'
import { MotionConfig } from 'framer-motion'
import { Toaster } from '@/components/ui/sonner'
import { toast } from 'sonner'
import { useAuthStore } from '@/store/authStore'
import { setUnauthorizedHandler } from '@/api'
import Layout from '@/components/Layout'
import ErrorBoundary from '@/components/feedback/ErrorBoundary'
import { Skel, CardSkeleton } from '@/components/feedback/PageState'
import { ConfirmProvider } from '@/components/feedback/ConfirmProvider'
import Login from '@/pages/Login'

// 首屏页面静态引入：教师打开系统第一眼看到的就是「今日工作台」，
// 它必须在最快的时间里画出来，不该等别的东西。
import Today from '@/pages/Today'

// 其余页面按需加载。
// 原先 11 个页面全量静态打包，首屏要背 906KB 主 chunk + 352KB 图表库
// （Dashboard/Evaluation/IEP 图表都静态引入了 recharts），
// 而教师早上真正打开的是 Today——它一行图表都不用。
const Dashboard = lazy(() => import('@/pages/Dashboard'))
const School = lazy(() => import('@/pages/School'))
const Students = lazy(() => import('@/pages/Students'))
const Evaluation = lazy(() => import('@/pages/Evaluation'))
const IEP = lazy(() => import('@/pages/IEP'))
const Teaching = lazy(() => import('@/pages/Teaching'))
const Templates = lazy(() => import('@/pages/Templates'))
const Parents = lazy(() => import('@/pages/Parents'))
const System = lazy(() => import('@/pages/System'))
const AdminConsole = lazy(() => import('@/pages/AdminConsole'))

/**
 * 路由切换时的加载占位。
 * 用骨架屏而不是转圈：骨架屏保留了页面的大致形状，
 * 教师知道「要来的是什么」，等待感明显更短；转圈只说明"在忙"，不说明"在忙什么"。
 */
function RouteFallback() {
  return (
    <div className="mx-auto max-w-[1100px] space-y-4" aria-busy="true" aria-label="页面加载中">
      <Skel className="h-7 w-44" />
      <CardSkeleton rows={4} />
    </div>
  )
}

/**
 * 滚动位置管理
 *  - 新进页面：回到顶部（教师点开一页就该从头看）
 *  - 浏览器后退：回到离开时的位置（翻了半天的学生列表，不该被弹回第一行）
 *
 * 坑（实测踩到）：主内容区 <main id="main-content"> 虽然写了 overflow-y-auto，
 * 但它的父容器用的是 min-h-[100dvh]，高度会被内容撑开，
 * 所以 main 自身 scrollHeight === clientHeight，根本不滚动——
 * 真正滚的是 window/document。第一版照着 main 滚，结果是空转，一点效果都没有。
 * 现在改为滚 window，并对「懒加载还没渲染完、页面还不够高」做重试。
 */
function ScrollManager() {
  const { pathname } = useLocation();
  const navType = useNavigationType();

  useEffect(() => {
    const key = 'iep:scroll:' + pathname;
    // POP = 后退/前进；其余（PUSH/REPLACE）视为新进页面
    const target = navType === 'POP' ? Number(sessionStorage.getItem(key) || 0) : 0;
    let tries = 0;
    const apply = () => {
      window.scrollTo(0, target);
      // 路由懒加载时，页面可能还没撑到足够高，滚不动就等下一帧再试
      if (Math.abs(window.scrollY - target) > 4 && tries++ < 12) {
        requestAnimationFrame(apply);
      }
    };
    apply();
  }, [pathname, navType]);

  useEffect(() => {
    const key = 'iep:scroll:' + pathname;
    const save = () => sessionStorage.setItem(key, String(window.scrollY));
    window.addEventListener('scroll', save, { passive: true });
    return () => {
      save();
      window.removeEventListener('scroll', save);
    };
  }, [pathname]);

  return null;
}

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
  // 手机上 Toast 固定在右上角会压住顶栏的菜单按钮，且底部还有标签栏，
  // 窄屏改为居顶部居中并下移让开顶栏。
  const [narrow, setNarrow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches
  )

  // 刷新页面后向后端换取真实权限，避免权限仅依赖 localStorage 中被篡改的副本
  useEffect(() => {
    restore().finally(() => setRestored(true))
  }, [restore])

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)')
    const apply = () => setNarrow(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

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
    // reducedMotion="user"：framer-motion 全局尊重系统的「减弱动态效果」。
    // 各页面散落着 295 处 motion 用法，逐个改不现实，也容易漏；
    // 在根节点统一接管，配合 index.css 里的 prefers-reduced-motion 兜底。
    <ErrorBoundary>
    <MotionConfig reducedMotion="user">
    {/* 命令式二次确认：删除学生 / 删除 IEP 等不可逆操作在此统一兜底 */}
    <ConfirmProvider>
    <HashRouter>
      <Suspense fallback={<RouteFallback />}>
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
      </Suspense>
      <ScrollManager />
      <Toaster
        position={narrow ? 'top-center' : 'top-right'}
        offset={narrow ? 72 : 16}
        closeButton={narrow}
        toastOptions={{ className: narrow ? 'w-[calc(100vw-2rem)]' : undefined }}
      />
    </HashRouter>
    </ConfirmProvider>
    </MotionConfig>
    </ErrorBoundary>
  )
}
