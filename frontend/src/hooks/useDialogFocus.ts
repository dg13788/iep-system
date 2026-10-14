import { useEffect, type RefObject } from 'react';

/**
 * 自研抽屉 / 对话框的焦点管理
 * ============================================================================
 *
 * 为什么需要（2026-10-14 真实浏览器实测后补）
 * ------------------------------------------------------------------
 * 实测发现自研抽屉（学生表单、学生详情、评估详情等）只做了两件事：
 * role="dialog" + Esc 关闭（useDrawerA11y）。缺的三件全是键盘用户的刚需：
 *
 *   1. 打开后焦点不移入——activeElement 还停在 body，键盘用户按 Tab
 *      从页面最头上开始，抽屉里十几个字段要按十几次才能到；
 *   2. 没有焦点圈禁——Tab 到抽屉最后一个元素后继续按，焦点逃逸到
 *      页面背景（顶栏、侧栏），读屏用户的"模态"感知被打穿；
 *   3. 关闭后焦点不归还——焦点掉回 body，下次 Tab 又是从山顶开始。
 *
 * 本 hook 一次补上三件。Esc 关闭仍归 useDrawerA11y 管（那里还要处理
 * 「Radix 确认弹层在上层时让位」的逻辑），两边不重叠。
 *
 * 用法：
 *   const panelRef = useRef<HTMLDivElement>(null);
 *   useDialogFocus(open, panelRef);
 *   <div ref={panelRef} role="dialog" aria-modal="true" ...>
 */

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/** 只取真正可交互的：隐藏的（sr-only 等零尺寸）不算，否则圈禁会把焦点送给看不见的元素 */
function visibleFocusables(panel: HTMLElement): HTMLElement[] {
  return [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => el.getClientRects().length > 0
  );
}

/**
 * 是否存在「压在本面板之上」的打开中对话框：
 *   - 面板内嵌的子对话框（自研进度抽屉，在面板 DOM 内）；
 *   - Radix 确认框（Dialog / AlertDialog 经 portal 渲染到 body，在面板 DOM 外）。
 * 两者都带 data-state="open"。面板自身（个别模态自己带该标记）不算。
 */
function hasUpperLayerDialog(panel: HTMLElement): boolean {
  return [...document.querySelectorAll<HTMLElement>('[role="dialog"][data-state="open"]')]
    .some((d) => d !== panel);
}

/**
 * @param firstFocusSelector 可选：首聚焦目标选择器（如 'nav button'）。
 *   调用方对「焦点先落哪」有刻意判断时使用（Sidebar 移动抽屉希望焦点先落
 *   首个导航项而不是关闭按钮）；缺省用面板内第一个可聚焦元素。
 */
export function useDialogFocus(
  open: boolean,
  ref: RefObject<HTMLElement | null>,
  firstFocusSelector?: string
): void {
  useEffect(() => {
    if (!open) return;
    const panel = ref.current;
    if (!panel) return;

    // 关闭时要把焦点还给打开前的那一个（可能是页面上的「新增」按钮）
    let prev: HTMLElement | null =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const focusables = visibleFocusables(panel);
    const preferred = firstFocusSelector
      ? panel.querySelector<HTMLElement>(firstFocusSelector)
      : null;
    const firstTarget = () => preferred ?? visibleFocusables(panel)[0] ?? panel;
    // 面板本身也要能接焦点：没有可聚焦子元素时（纯展示型详情），
    // 焦点落到面板上，读屏才能顺着模态往下读。
    if (!panel.hasAttribute('tabindex')) panel.setAttribute('tabindex', '-1');
    firstTarget().focus();

    /**
     * 焦点守护（2026-10-14 实测后补）
     * ------------------------------------------------------------------
     * 抽屉常从 Radix 下拉菜单里打开（学生页「查看详情」）。Radix 关闭菜单
     * 时会把焦点归还给触发按钮，且时机在 rAF 里——晚于本 effect 的首次
     * 聚焦，实测会把刚移入抽屉的焦点原样抢走（焦点落回表格行的更多按钮，
     * Tab 圈禁随之失效：监听器挂在面板上，焦点在面板外时按键根本不经过它）。
     *
     * 开闸后 400ms 内，焦点若落到面板外（且面板内没有打开的子对话框），
     * 拉回首个目标。窗口只覆盖「打开瞬间」：用户有充分时间后主动移出焦点
     * （如去点地址栏）不会被拽回，避免长期霸占焦点。
     */
    const guardUntil = Date.now() + 400;
    const onFocusIn = (e: FocusEvent) => {
      if (Date.now() > guardUntil) return;
      const t = e.target as Node | null;
      if (t && panel.contains(t)) return;
      if (hasUpperLayerDialog(panel)) return;
      // 焦点被外部逻辑移到面板外（典型：Radix 菜单关闭时把焦点归还给
      // 触发按钮）。先记下这个目标——关闭抽屉时优先还到这里，那是用户
      // 来时的路；再把焦点拉回面板内。只记真实元素，body 不算。
      if (t instanceof HTMLElement && t !== document.body) prev = t;
      firstTarget().focus();
    };
    document.addEventListener('focusin', onFocusIn, true);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      // 压在本面板之上的对话框（内嵌子抽屉 / portal 出来的 Radix 确认框）
      // 拿着圈禁权时，父面板不抢焦点。与 useDrawerA11y 的 Esc 让位同一思路。
      if (hasUpperLayerDialog(panel)) return;
      const items = visibleFocusables(panel);
      if (items.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const idx = items.indexOf(document.activeElement as HTMLElement);
      // 焦点不在列表里（在面板自身上）→ Tab 从第一项开始，Shift+Tab 从最后一项开始
      if (idx === -1) {
        e.preventDefault();
        (e.shiftKey ? items[items.length - 1] : items[0]).focus();
        return;
      }
      if (e.shiftKey && idx === 0) {
        e.preventDefault();
        items[items.length - 1].focus();
      } else if (!e.shiftKey && idx === items.length - 1) {
        e.preventDefault();
        items[0].focus();
      }
    };

    panel.addEventListener('keydown', onKeyDown);
    return () => {
      panel.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('focusin', onFocusIn, true);
      // 触发元素已被卸载（比如列表刷新了）就不强求，别把焦点丢到已经不存在的节点上
      if (prev && document.contains(prev) && prev.isConnected) {
        prev.focus();
      }
    };
  }, [open, ref]);
}
