import { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { THEMES, useThemeStore, type ThemeId } from '@/store/themeStore';

/**
 * 主题选择面板
 * ============================================================================
 *
 * 设计取舍（都来自「教师是使用者，不是设计师」这个前提）：
 *
 * 1. 只给四套整体主题，不给自由调色。
 *    自由调色板 = 用户能调出对比度不足的界面，而"看不清字"在特教场景里
 *    不是审美问题而是可用性问题。四套主题是预先校准过对比度的成品。
 *
 * 2. 每项写「什么场景用」，不只写颜色名。
 *    教师晚上八点打开系统时，需要知道的是"哪个适合夜里"，而不是色号。
 *
 * 3. 点选即生效，不设「应用」按钮。
 *    换错了再点一下就行，多一个"保存"反而制造"我是不是没生效"的犹豫。
 *
 * 4. 用原生 radio 而非 div 模拟。
 *    方向键在单选组内切换、读屏播报"已选中"、Tab 只占一个停靠点——
 *    这些用 div + onClick 全要自己写，且很容易写漏。
 */

/** 面板内容（不含外层容器），供顶栏下拉与用户菜单复用 */
export function ThemeOptions({ onDone }: { onDone?: () => void }) {
  const { pref, setTheme } = useThemeStore();

  const pick = (t: ThemeId | 'system') => {
    setTheme(t);
    onDone?.();
  };

  return (
    <fieldset className="p-1">
      <legend className="sr-only">界面外观主题</legend>

      <Option
        checked={pref === 'system'}
        onSelect={() => pick('system')}
        title="跟随系统"
        desc="按操作系统的深浅色设置自动切换"
        swatches={[THEMES[0].preview.bg, THEMES[0].preview.fg, THEMES[1].preview.bg, THEMES[1].preview.fg]}
      />

      <div className="my-1 h-px bg-line" />

      {THEMES.map((t) => (
        <Option
          key={t.id}
          checked={pref === t.id}
          onSelect={() => pick(t.id)}
          title={t.name}
          desc={t.scene}
          swatches={[t.preview.bg, t.preview.fg, t.preview.accent]}
        />
      ))}
    </fieldset>
  );
}

function Option({
  checked,
  onSelect,
  title,
  desc,
  swatches,
}: {
  checked: boolean;
  onSelect: () => void;
  title: string;
  desc: string;
  swatches: string[];
}) {
  return (
    <label className="block cursor-pointer">
      <input type="radio" name="iep-theme" checked={checked} onChange={onSelect} className="peer sr-only" />
      <span
        data-on={checked}
        className="flex min-tap-h items-center gap-3 rounded-lg px-3 py-2.5 transition-colors
                   hover:bg-surface-2 data-[on=true]:bg-brand-soft
                   peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2
                   peer-focus-visible:outline-line-focus"
      >
        {/* 预览色块：真实反映该主题的画布 / 文字 / 主色 */}
        <span aria-hidden="true" className="flex h-8 w-11 shrink-0 overflow-hidden rounded-md border border-line shadow-xs">
          {swatches.map((c, i) => (
            <span key={i} className="h-full flex-1" style={{ backgroundColor: c }} />
          ))}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-ink">{title}</span>
          <span className="block text-xs text-ink-2 truncate">{desc}</span>
        </span>

        {/* 选中态必须有形状标记，不能只靠底色差（色觉障碍用户看不出差别） */}
        {checked && (
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand text-ink-on-dark">
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
        )}
      </span>
    </label>
  );
}

/**
 * 顶栏「换肤」入口 + 下拉面板
 *
 * 为什么放顶栏：换肤是「当下环境变了」的即时反应（进教室 / 天黑 / 投影），
 * 藏进设置页等于要求用户先想清楚去哪找。顶栏是每个页面都在的位置。
 */
export function ThemeButton() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { theme, pref } = useThemeStore();
  const current = THEMES.find((t) => t.id === theme);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const label =
    pref === 'system'
      ? `换肤：当前跟随系统（${current?.name ?? ''}）`
      : `换肤：当前${current?.name ?? ''}`;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={label}
        title="切换界面外观"
        className="min-tap flex items-center justify-center rounded-lg text-ink-2 hover:bg-surface-2 press cursor-pointer"
      >
        <SwatchIcon />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="界面外观"
          className="absolute right-0 top-full z-50 mt-2 w-64 rounded-xl border border-line bg-surface p-1.5 shadow-float"
        >
          <p className="px-3 pb-1 pt-2 text-xs text-ink-3">界面外观</p>
          <ThemeOptions onDone={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}

/** 小色板图标：不为一个符号引入第三方图标依赖 */
function SwatchIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <circle cx="10" cy="10" r="7.5" />
      <path d="M10 2.5v15" strokeLinecap="round" />
      <path d="M10 2.5a7.5 7.5 0 0 1 0 15z" fill="currentColor" stroke="none" />
    </svg>
  );
}