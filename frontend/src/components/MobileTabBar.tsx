import { useLocation, useNavigate } from 'react-router';
import { MoreHorizontal } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { MENU_KEY_BY_PATH, NAV_ITEMS, TAB_PRIORITY } from './navConfig';

/**
 * 移动端底部标签栏
 *
 * 为什么不是只保留汉堡抽屉：教师在教室里是单手持机、拇指操作，
 * 屏幕上半部是拇指最难够到的区域（"拇指热区"研究结论一致）。
 * 主导航放在底部，是最省力的位置——这也是 iOS 人机界面准则的建议。
 * 抽屉保留给低频页面（模板、系统、控制台），通过「更多」进入。
 */

export default function MobileTabBar({ onOpenMore }: { onOpenMore: () => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { hasMenu } = useAuthStore();

  const visible = NAV_ITEMS.filter((i) => i.always || hasMenu(MENU_KEY_BY_PATH[i.path]));
  const tabs = TAB_PRIORITY.map((p) => visible.find((i) => i.path === p)).filter(
    (i): i is (typeof NAV_ITEMS)[number] => Boolean(i),
  );
  const hasMore = visible.length > tabs.length;

  if (tabs.length === 0) return null;

  return (
    <nav
      aria-label="底部导航"
      className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/90 backdrop-blur-md border-t border-[#E2E8F0] flex"
      style={{ paddingBottom: 'var(--safe-bottom)' }}
    >
      {tabs.map((item) => {
        const active = location.pathname === item.path;
        const Icon = item.icon;
        return (
          <button
            key={item.path}
            type="button"
            onClick={() => navigate(item.path)}
            aria-current={active ? 'page' : undefined}
            className={`flex-1 min-tap-h flex flex-col items-center justify-center gap-0.5 press cursor-pointer ${
              active ? 'text-[#2563EB]' : 'text-[#64748B]'
            }`}
          >
            <Icon className="w-5 h-5" strokeWidth={active ? 2.2 : 1.8} />
            <span className={`text-[10px] ${active ? 'font-semibold' : ''}`}>
              {item.short ?? item.label}
            </span>
          </button>
        );
      })}

      {hasMore && (
        <button
          type="button"
          onClick={onOpenMore}
          aria-label="更多页面"
          className="flex-1 min-tap-h flex flex-col items-center justify-center gap-0.5 text-[#64748B] press cursor-pointer"
        >
          <MoreHorizontal className="w-5 h-5" strokeWidth={1.8} />
          <span className="text-[10px]">更多</span>
        </button>
      )}
    </nav>
  );
}
