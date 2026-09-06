import { useState } from 'react';
import { useLocation } from 'react-router';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bell,
  Settings,
  ChevronDown,
  LogOut,
  User,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';

const breadcrumbMap: Record<string, string> = {
  '/': '仪表盘',
  '/login': '登录',
  '/students': '学生管理',
  '/evaluation': '评估管理',
  '/iep': 'IEP管理',
  '/teaching': '教学记录',
  '/templates': '模板管理',
  '/parents': '家校协作',
  '/system': '系统管理',
};

export default function Topbar() {
  const location = useLocation();
  const { user, logout } = useAuthStore();
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const currentPath = location.pathname;
  const breadcrumb = breadcrumbMap[currentPath] || '页面';

  return (
    <header className="sticky top-0 z-20 h-14 bg-white border-b border-[#E2E8F0] flex items-center justify-between px-6">
      {/* Breadcrumb */}
      <nav className="flex items-center text-sm">
        <span className="text-[#64748B]">特教 IEP</span>
        <span className="mx-2 text-[#CBD5E1]">/</span>
        <span className="text-[#1E293B] font-medium">{breadcrumb}</span>
      </nav>

      {/* Right Actions */}
      <div className="flex items-center gap-2">
        {/* Notification Bell */}
        <button className="relative w-9 h-9 rounded-full flex items-center justify-center text-[#64748B] hover:bg-[#F7F6F4] hover:text-[#1E293B] transition-colors cursor-pointer">
          <Bell className="w-[18px] h-[18px]" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[#EF4444] rounded-full" />
        </button>

        {/* Settings */}
        <button className="w-9 h-9 rounded-full flex items-center justify-center text-[#64748B] hover:bg-[#F7F6F4] hover:text-[#1E293B] transition-colors cursor-pointer">
          <Settings className="w-[18px] h-[18px]" />
        </button>

        {/* User Avatar */}
        <div className="relative ml-1">
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-full hover:bg-[#F7F6F4] transition-colors cursor-pointer"
          >
            <div className="w-8 h-8 rounded-full bg-primary-500 flex items-center justify-center">
              <span className="text-xs font-bold text-white">
                {user?.name?.[0] || '用'}
              </span>
            </div>
            <ChevronDown className={`w-4 h-4 text-[#64748B] transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} />
          </button>

          <AnimatePresence>
            {userMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
                <motion.div
                  initial={{ opacity: 0, y: -8, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl shadow-lg border border-[#E2E8F0] z-50 py-1 overflow-hidden"
                >
                  <div className="px-4 py-3 border-b border-[#E2E8F0]">
                    <p className="text-sm font-medium text-[#1E293B]">{user?.name || '当前用户'}</p>
                    <p className="text-xs text-[#64748B]">{user?.role || '管理员'}</p>
                  </div>
                  <button
                    onClick={() => {
                      setUserMenuOpen(false);
                    }}
                    className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-[#1E293B] hover:bg-[#F7F6F4] transition-colors cursor-pointer"
                  >
                    <User className="w-4 h-4" />
                    个人资料
                  </button>
                  <button
                    onClick={() => {
                      setUserMenuOpen(false);
                      logout();
                    }}
                    className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-[#EF4444] hover:bg-[#FEF2F2] transition-colors cursor-pointer"
                  >
                    <LogOut className="w-4 h-4" />
                    退出登录
                  </button>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}
