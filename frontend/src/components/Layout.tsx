import { useState, useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import { useAuthStore } from '@/store/authStore';

export default function Layout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { isAuthenticated } = useAuthStore();
  const navigate = useNavigate();

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
      const offset = mq.matches ? (sidebarCollapsed ? '64px' : '240px') : '0px';
      document.documentElement.style.setProperty('--sidebar-offset', offset);
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [sidebarCollapsed]);

  return (
    <div className="flex min-h-[100dvh]">
      {/* Sidebar */}
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      {/* Main Content Area */}
      <div
        className="flex-1 flex flex-col min-h-[100dvh] min-w-0 transition-[margin] duration-350 ease-in-out"
        style={{ marginLeft: 'var(--sidebar-offset, 0px)' }}
      >
        <Topbar />
        <main className="flex-1 px-4 py-5 sm:px-6 sm:py-6 min-w-0 overflow-y-auto bg-[#F7F6F4]">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
