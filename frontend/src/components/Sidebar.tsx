import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'framer-motion';
import { LogOut, X, Brain } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useDialogFocus } from '@/hooks/useDialogFocus';
import { MENU_KEY_BY_PATH, NAV_ITEMS } from './navConfig';

/**
 * 侧栏（桌面常驻 + 移动端抽屉）
 *
 * 改动要点：
 *  1. 抽屉改为受控（由 Layout 持有状态），移动端入口移到顶栏的汉堡按钮。
 *     原实现把汉堡按钮做成 fixed top-3 left-3 的浮层，压住了顶栏面包屑。
 *  2. 抽屉补齐对话框语义与键盘支持：role=dialog / aria-modal / Esc 关闭 /
 *     打开时锁定背景滚动 / 打开后焦点落在第一项。此前抽屉是纯 div，
 *     键盘用户既进不去也出不来。
 *  3. 导航项补 aria-current="page"，折叠态补 title 提示
 *     （折叠后只剩图标，没有提示等于让用户猜）。
 */

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export default function Sidebar({ collapsed, onToggle, mobileOpen, onCloseMobile }: SidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, hasMenu } = useAuthStore();
  const panelRef = useRef<HTMLElement>(null);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // 抽屉打开时：锁定背景滚动 + Esc 关闭。
  // 焦点三件套（移入/圈禁/归还）统一走 useDialogFocus——首聚焦刻意落在
  // 第一个导航项（打开导航的意图是"要去某个页面"，不是去点关闭按钮）。
  useDialogFocus(mobileOpen, panelRef, 'nav button, nav a');
  useEffect(() => {
    if (!mobileOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseMobile();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [mobileOpen, onCloseMobile]);

  // 首页（今日工作台）恒可见：它是登录后的落点，若因菜单权限缺失而隐藏，
  // 用户会看到「有页面却进不去」的空白感，侧栏也失去锚点。
  const visibleNavItems = NAV_ITEMS.filter((item) => {
    if (item.always) return true;
    return hasMenu(MENU_KEY_BY_PATH[item.path]);
  });

  const navList = (
    <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto" aria-label="主导航">
      {visibleNavItems.map((item) => {
        const isActive = location.pathname === item.path;
        const Icon = item.icon;
        return (
          <button
            key={item.path}
            type="button"
            onClick={() => {
              navigate(item.path);
              onCloseMobile();
            }}
            aria-current={isActive ? 'page' : undefined}
            title={collapsed ? item.label : undefined}
            className={`relative flex items-center w-full min-tap-h px-3 gap-3 rounded-md press cursor-pointer ${
              isActive
                ? 'bg-surface-inverse-2 text-ink-on-dark'
                : 'text-ink-3 hover:bg-surface-inverse-2 hover:text-ink-on-dark'
            }`}
          >
            {isActive && (
              <motion.span
                layoutId="sidebar-active"
                className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 bg-info rounded-r-full"
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
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
  );

  const userBlock = (
    <div className="px-3 py-4 border-t border-surface-inverse-2">
      <div className="flex items-center gap-3">
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary-500 flex items-center justify-center">
          <span className="text-xs font-bold text-ink-on-dark">{user?.name?.[0] || '用'}</span>
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
              <p className="text-sm text-ink-on-dark truncate">{user?.name || '当前用户'}</p>
              <p className="text-xs text-ink-3 truncate">
                {user?.permission_group_name || '用户'}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {!collapsed && (
            <motion.button
              type="button"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleLogout}
              aria-label="退出登录"
              title="退出登录"
              className="flex-shrink-0 p-2 rounded-md text-ink-3 hover:text-ink-on-dark hover:bg-surface-inverse-2 press cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </div>
  );

  const logoBlock = (
    <div className="flex items-center justify-between h-16 px-4 border-b border-surface-inverse-2">
      <div className="flex items-center gap-3 overflow-hidden">
        <div className="flex-shrink-0 w-9 h-9 rounded-full bg-primary-500 flex items-center justify-center">
          <Brain className="w-5 h-5 text-ink-on-dark" />
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
              <span className="text-lg font-bold text-ink-on-dark">特教 IEP</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {/* 移动端抽屉的关闭按钮（桌面侧栏不显示，那里用折叠箭头） */}
      <button
        type="button"
        onClick={onCloseMobile}
        aria-label="关闭主导航"
        className="lg:hidden min-tap flex items-center justify-center -mr-2 rounded-lg text-ink-3 hover:text-ink-on-dark press cursor-pointer"
      >
        <X className="w-5 h-5" />
      </button>
    </div>
  );

  return (
    <>
      {/* 移动端遮罩：模糊而非纯黑，让"后面的内容还在"这件事被看见 */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onCloseMobile}
            className="fixed inset-0 z-40 bg-surface-inverse/40 backdrop-blur-[2px] lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* 桌面侧栏 */}
      <motion.aside
        animate={{ width: collapsed ? 68 : 240 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="hidden lg:flex flex-col fixed left-0 top-0 h-screen bg-surface-inverse z-30 overflow-hidden"
      >
        {logoBlock}
        {navList}
        {userBlock}
        {/* 折叠开关：独立一行。
            注：onToggle 此前从未被任何元素调用——桌面侧栏实际上永远折叠不了。 */}
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? '展开侧栏' : '收起侧栏'}
          title={collapsed ? '展开侧栏' : '收起侧栏'}
          className="hidden lg:flex min-tap-h items-center justify-center gap-1.5 border-t border-surface-inverse-2 text-xs text-ink-3 hover:text-ink-on-dark hover:bg-surface-inverse-2 press cursor-pointer"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d={collapsed ? 'M6 3.5 L10.5 8 L6 12.5' : 'M10 3.5 L5.5 8 L10 12.5'}
                  stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {!collapsed && <span>收起侧栏</span>}
        </button>
      </motion.aside>

      {/* 移动端抽屉 */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.aside
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="主导航"
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="fixed lg:hidden left-0 top-0 w-[min(84vw,300px)] h-[100dvh] bg-surface-inverse z-50 flex flex-col"
            style={{ paddingTop: 'rgb(var(--safe-top))' }}
          >
            {logoBlock}
            {navList}
            {userBlock}
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}
