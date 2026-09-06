import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  Users,
  ClipboardCheck,
  FileText,
  BookOpen,
  Layers,
  Home,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Brain,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';

const navItems = [
  { path: '/', label: '仪表盘', icon: LayoutDashboard },
  { path: '/students', label: '学生管理', icon: Users },
  { path: '/evaluation', label: '评估管理', icon: ClipboardCheck },
  { path: '/iep', label: 'IEP管理', icon: FileText },
  { path: '/teaching', label: '教学记录', icon: BookOpen },
  { path: '/templates', label: '模板管理', icon: Layers },
  { path: '/parents', label: '家校协作', icon: Home },
  { path: '/system', label: '系统管理', icon: Settings },
];

// 路径到菜单权限key的映射
const pathToMenuKey: Record<string, string> = {
  '/': 'dashboard',
  '/students': 'students',
  '/evaluation': 'evaluation',
  '/iep': 'iep',
  '/teaching': 'teaching',
  '/templates': 'templates',
  '/parents': 'parents',
  '/system': 'system',
};

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export default function Sidebar({ collapsed }: SidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, hasMenu } = useAuthStore();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // 根据用户权限过滤导航项
  const visibleNavItems = navItems.filter((item) => {
    const key = pathToMenuKey[item.path];
    return hasMenu(key);
  });

  const sidebarContent = (
    <>
      {/* Logo Area */}
      <div className="flex items-center h-16 px-4 border-b border-[#334155]">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="flex-shrink-0 w-9 h-9 rounded-full bg-primary-500 flex items-center justify-center">
            <Brain className="w-5 h-5 text-white" />
          </div>
          <AnimatePresence>
            {!collapsed && (
              <motion.div
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden whitespace-nowrap"
              >
                <span className="text-lg font-bold text-white">特教 IEP</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Navigation Items */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {visibleNavItems.map((item) => {
          const isActive = location.pathname === item.path;
          const Icon = item.icon;
          return (
            <button
              key={item.path}
              onClick={() => {
                navigate(item.path);
                setMobileOpen(false);
              }}
              className={`
                relative flex items-center w-full h-11 px-3 gap-3 rounded-md
                transition-colors duration-150 cursor-pointer
                ${isActive
                  ? 'bg-[#334155] text-white'
                  : 'text-[#94A3B8] hover:bg-[#334155] hover:text-white'
                }
              `}
            >
              {isActive && (
                <motion.div
                  layoutId="sidebar-active"
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 bg-[#3B82F6] rounded-r-full"
                  transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
                />
              )}
              <Icon className="flex-shrink-0 w-[18px] h-[18px]" />
              <AnimatePresence>
                {!collapsed && (
                  <motion.span
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: 'auto' }}
                    exit={{ opacity: 0, width: 0 }}
                    transition={{ duration: 0.2 }}
                    className="text-sm whitespace-nowrap overflow-hidden"
                  >
                    {item.label}
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
          );
        })}
      </nav>

      {/* User Section */}
      <div className="px-3 py-4 border-t border-[#334155]">
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary-500 flex items-center justify-center">
            <span className="text-xs font-bold text-white">
              {user?.name?.[0] || '用'}
            </span>
          </div>
          <AnimatePresence>
            {!collapsed && (
              <motion.div
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.2 }}
                className="flex-1 min-w-0 overflow-hidden"
              >
                <p className="text-sm text-white truncate">{user?.name || '当前用户'}</p>
                <p className="text-xs text-[#94A3B8] truncate">
                  {user?.permission_group_name || '用户'}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
          <AnimatePresence>
            {!collapsed && (
              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={handleLogout}
                className="flex-shrink-0 p-1.5 rounded-md text-[#94A3B8] hover:text-white hover:bg-[#334155] transition-colors cursor-pointer"
                title="退出登录"
              >
                <LogOut className="w-4 h-4" />
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Mobile toggle button */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="fixed top-3 left-3 z-50 lg:hidden p-2 rounded-md bg-[#1E293B] text-white"
      >
        {mobileOpen ? <ChevronLeft className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
      </button>

      {/* Desktop Sidebar */}
      <motion.aside
        animate={{ width: collapsed ? 64 : 240 }}
        transition={{ duration: 0.35, ease: [0.45, 0, 0.55, 1] as [number, number, number, number] }}
        className="hidden lg:flex flex-col fixed left-0 top-0 h-screen bg-[#1E293B] z-30 overflow-hidden"
      >
        {sidebarContent}
      </motion.aside>

      {/* Mobile Sidebar */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.aside
            initial={{ x: -240 }}
            animate={{ x: 0 }}
            exit={{ x: -240 }}
            transition={{ duration: 0.35, ease: [0.45, 0, 0.55, 1] as [number, number, number, number] }}
            className="fixed lg:hidden left-0 top-0 w-[240px] h-screen bg-[#1E293B] z-50 flex flex-col"
          >
            {sidebarContent}
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}
