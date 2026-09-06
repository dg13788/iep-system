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

  // Set CSS variable for sidebar offset on desktop
  useEffect(() => {
    const offset = sidebarCollapsed ? '64px' : '240px';
    document.documentElement.style.setProperty('--sidebar-offset', offset);
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
        className="flex-1 flex flex-col min-h-[100dvh] transition-[margin] duration-350 ease-in-out"
        style={{ marginLeft: 'var(--sidebar-offset, 240px)' }}
      >
        <Topbar />
        <main className="flex-1 px-6 py-6 overflow-y-auto bg-[#F7F6F4]">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
