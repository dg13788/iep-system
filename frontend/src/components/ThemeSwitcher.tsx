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

  /**
   * 键盘 / 指针分流（2026-10-14 真实浏览器实测后修）
   * ------------------------------------------------------------------
   * 原来的写法是「选谁都会话面板」。鼠标无感，但键盘用户按方向键切换主题时，
   * change 事件同样走进来 → 面板收起 → radio 随之卸载 → 焦点掉回 body：
   * 每按一次方向键就"失焦"一次，想连续比较几个主题根本做不到。
   *
   * 现在按输入方式分流：
   *   - 方向键切换：面板保持打开，焦点留在 radio 组内，可连续浏览
   *   - 鼠标 / 触屏点选：面板收起（指针用户的预期）
   *   - Enter / Space 键盘确认：选中并收起
   * 判据用 pointerdown 旗标而不是嗅探事件构造器——方向键的 change 是裸
   * Event，鼠标的也不带可靠特征，嗅探等于猜。
   */
  const pick = (t: ThemeId | 'system', via: 'pointer' | 'key' | 'confirm') => {
    setTheme(t);
    if (via !== 'key') onDone?.();
  };

  return (
    <fieldset className="p-1">
      <legend className="sr-only">界面外观主题</legend>

      <Option
        checked={pref === 'system'}
        onSelect={(via) => pick('system', via)}
        title="跟随系统"
        desc="按操作系统的深浅色设置自动切换"
        swatches={[THEMES[0].preview.bg, THEMES[0].preview.fg, THEMES[1].preview.bg, THEMES[1].preview.fg]}
      />

      <div className="my-1 h-px bg-line" />

      {THEMES.map((t) => (
        <Option
          key={t.id}
          checked={pref === t.id}
          onSelect={(via) => pick(t.id, via)}
          title={t.name}
          desc={t.scene}
          swatches={[t.preview.bg, t.preview.fg, t.preview.accent]}
        />
      ))}
    </fieldset>
  );
}

/** 单个主题选项。输入方式分流逻辑见 ThemeOptions 的 pick 注释。 */
function Option({
  checked,
  onSelect,
  title,
  desc,
  swatches,
}: {
  checked: boolean;
  onSelect: (via: 'pointer' | 'key' | 'confirm') => void;
  title: string;
  desc: string;
  swatches: string[];
}) {
  // pointerdown 先于 change 发生：鼠标 / 触屏路径置 true，键盘方向键路径保持 false。
  // 不用事件构造器嗅探——方向键的 change 是裸 Event，鼠标的也不带可靠特征。
  const viaPointer = useRef(false);

  return (
    <label
      className="block cursor-pointer"
      onPointerDown={() => { viaPointer.current = true; }}
      onClick={() => {
        // 重点「当前已选中」的主题：radio 状态没变，不会触发 change，
        // 面板就永远不关——用户点一下毫无反应（2026-10-14 实测发现）。
        // 键盘 Enter/Space 已在 onKeyDown 里拦掉并 preventDefault，
        // 不会走到这里，所以 onClick 一定是指针路径。
        if (checked) onSelect('pointer');
      }}
      onKeyDown={(e) => {
        // 方向键一来就清掉指针旗标：指针点过一次之后，
        // 用户可能改用键盘，不清就会把方向键误判成指针路径。
        if (e.key.startsWith('Arrow')) viaPointer.current = false;
        // Enter / Space = 键盘「确认」：选中并收起面板。
        // Space 默认会滚动页面，必须拦掉。
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect('confirm');
        }
      }}
    >
      <input
        type="radio"
        name="iep-theme"
        checked={checked}
        onChange={() => {
          const via = viaPointer.current ? 'pointer' : 'key';
          viaPointer.current = false;
          onSelect(via);
        }}
        className="peer sr-only"
      />
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
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(false);
  /** 键盘打开（Enter/Space 触发的 click，detail===0）时移焦点入面板；指针打开不抢 */
  const viaKeyboard = useRef(false);
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

  /**
   * 键盘打开时焦点移入首个选项（APG 菜单按钮惯例）。
   * 指针打开不抢焦点——用户正盯着鼠标点选，焦点乱跳反而扰人。
   * 面板是非模态 popover（无背罩、焦点可回页面），故不做圈禁。
   */
  useEffect(() => {
    if (!open || !viaKeyboard.current) return;
    viaKeyboard.current = false;
    const first = panelRef.current?.querySelector<HTMLElement>('input[type="radio"]');
    first?.focus();
  }, [open]);

  /**
   * 焦点归还（2026-10-14 实测后补）
   * ------------------------------------------------------------------
   * 面板收起时，里面的 radio 会随之卸载。若焦点当时在 radio 上
   * （指针点选后也会聚焦到 radio），焦点会掉回 body——键盘用户下一次
   * 按 Tab 从页面最头上开始，等于"被弹回了山顶"。
   * 所以只要检测到焦点掉回 body，就还给触发按钮。
   * wasOpen 守卫：避免页面初次加载（open 恒 false）就抢焦点。
   */
  useEffect(() => {
    if (open) { wasOpen.current = true; return; }
    if (!wasOpen.current) return;
    if (document.activeElement === document.body) btnRef.current?.focus();
  }, [open]);

  const label =
    pref === 'system'
      ? `换肤：当前跟随系统（${current?.name ?? ''}）`
      : `换肤：当前${current?.name ?? ''}`;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        ref={btnRef}
        onClick={(e) => {
          if (!open && e.detail === 0) viaKeyboard.current = true;
          setOpen((v) => !v);
        }}
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
          ref={panelRef}
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