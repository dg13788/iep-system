import { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import MobileTabBar from './MobileTabBar';
import { useAuthStore } from '@/store/authStore';

export default function Layout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const { isAuthenticated } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
    }
  }, [isAuthenticated, navigate]);

  /**
   * 设置侧边栏让位宽度。
   *
   * 修复说明(P2-3)：原实现无条件把 --sidebar-offset 设为 240px/64px，
   * 而侧边栏本身是 `hidden lg:flex`（<1024px 时隐藏）。
   * 结果在手机/平板上下内容区仍被强行右移 240px，8 个页面全部横向溢出
   * （实测 390px 视口下文档宽达 648~1095px），必须横向拖动才能看到内容。
   *
   * 现仅在桌面断点（>=1024px，与 Tailwind 的 lg 一致）才让位，
   * 移动端偏移量为 0。
   */
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const apply = () => {
      const offset = mq.matches ? (sidebarCollapsed ? '68px' : '240px') : '0px';
      document.documentElement.style.setProperty('--sidebar-offset', offset);
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [sidebarCollapsed]);

  // 路由变化后自动收起移动端抽屉（此前跳转后抽屉会一直盖在页面上）
  useEffect(() => {
    setNavOpen(false);
  }, [location.hash]);

  return (
    <div className="flex min-h-[100dvh]">
      {/* 键盘/读屏用户直达内容：跳过整条导航 */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-[60] focus:m-3 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2 focus:text-sm focus:shadow-float"
      >
        跳到主要内容
      </a>

      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((v) => !v)}
        mobileOpen={navOpen}
        onCloseMobile={() => setNavOpen(false)}
      />

      <div
        className="flex-1 flex flex-col min-h-[100dvh] min-w-0 transition-[margin] duration-300 ease-out"
        style={{ marginLeft: 'var(--sidebar-offset, 0px)' }}
      >
        <Topbar onOpenNav={() => setNavOpen(true)} />
        <main
          id="main-content"
          className="flex-1 px-4 py-5 sm:px-6 sm:py-6 min-w-0 overflow-y-auto bg-canvas"
        >
          <Outlet />
          {/* 底部标签栏占位：避免最后一条内容被标签栏压住 */}
          <div
            className="lg:hidden"
            style={{ height: 'calc(60px + rgb(var(--safe-bottom)))' }}
            aria-hidden="true"
          />
        </main>
        <MobileTabBar onOpenMore={() => setNavOpen(true)} />
      </div>
    </div>
  );
}
