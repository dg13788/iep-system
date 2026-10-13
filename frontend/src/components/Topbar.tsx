import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'framer-motion';
import { LogOut, Menu } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { labelForPath } from './navConfig';

/**
 * 顶栏
 *
 * 改动要点（均来自实测问题，不是视觉偏好）：
 *  1. 汉堡按钮移进顶栏：此前它作为 fixed top-3 left-3 的浮层渲染在侧栏组件里，
 *     在移动端正好压住顶栏面包屑文字（顶栏 px-6 起始于 24px，浮层占据 12~48px），
 *     两行文字重叠。现在它是顶栏正常流内的第一个元素。
 *  2. 移除「通知铃 + 常亮红点」与「设置」按钮：两者都没有 onClick，
 *     红点还在持续暗示"你有未读"。界面上不存在的东西不该出现在界面上。
 *     有系统管理权限的用户可从侧栏进入系统管理。
 *  3. 触控目标 44×44、焦点可见、Esc 关闭菜单。
 */

export default function Topbar({ onOpenNav }: { onOpenNav: () => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, hasMenu } = useAuthStore();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const breadcrumb = labelForPath(location.pathname);

  // Esc 关闭用户菜单（此前只能点遮罩，键盘用户出不来）
  useEffect(() => {
    if (!userMenuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setUserMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [userMenuOpen]);

  return (
    <header className="sticky top-0 z-20 h-14 bg-white/85 backdrop-blur-md border-b border-[#E2E8F0] flex items-center gap-1 px-2 sm:px-4 lg:px-6">
      {/* 移动端主导航入口 */}
      <button
        type="button"
        onClick={onOpenNav}
        aria-label="打开主导航"
        className="lg:hidden min-tap flex items-center justify-center -ml-1 rounded-lg text-[#475569] hover:bg-[#F1F5F9] press cursor-pointer"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* 面包屑：窄屏只留当前页名，省下的宽度给内容 */}
      <nav className="flex items-center text-sm min-w-0" aria-label="当前位置">
        <span className="hidden sm:inline text-[#64748B]">特教 IEP</span>
        <span className="hidden sm:inline mx-2 text-[#CBD5E1]">/</span>
        <span className="text-[#1E293B] font-medium truncate">{breadcrumb}</span>
      </nav>

      <div className="flex-1" />

      {/* 右侧：身份 + 用户菜单 */}
      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setUserMenuOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={userMenuOpen}
          className="min-tap-h flex items-center gap-2 pl-1 pr-2 rounded-full hover:bg-[#F1F5F9] press cursor-pointer"
        >
          <div className="w-8 h-8 rounded-full bg-primary-500 flex items-center justify-center">
            <span className="text-xs font-bold text-white">{user?.name?.[0] || '用'}</span>
          </div>
          <span className="hidden md:block text-sm text-[#334155] max-w-[10rem] truncate">
            {user?.name || '当前用户'}
          </span>
        </button>

        <AnimatePresence>
          {userMenuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
              <motion.div
                role="menu"
                initial={{ opacity: 0, y: -8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.96 }}
                transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                className="absolute right-0 top-full mt-2 w-52 bg-white rounded-xl shadow-float border border-[#E2E8F0] z-50 py-1 overflow-hidden"
              >
                <div className="px-4 py-3 border-b border-[#E2E8F0]">
                  <p className="text-sm font-medium text-[#1E293B]">{user?.name || '当前用户'}</p>
                  <p className="mt-0.5 text-xs text-[#64748B]">
                    {user?.permission_group_name || user?.role || '未分配角色'}
                  </p>
                </div>
                {hasMenu('system') && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setUserMenuOpen(false);
                      navigate('/system');
                    }}
                    className="flex items-center gap-2 w-full px-4 py-3 text-sm text-[#1E293B] hover:bg-[#F7F6F4] transition-colors cursor-pointer"
                  >
                    系统管理
                  </button>
                )}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setUserMenuOpen(false);
                    logout();
                  }}
                  className="flex items-center gap-2 w-full px-4 py-3 text-sm text-[#DC2626] hover:bg-[#FEF2F2] transition-colors cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  退出登录
                </button>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    </header>
  );
}
