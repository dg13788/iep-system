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

export function useDialogFocus(open: boolean, ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    if (!open) return;
    const panel = ref.current;
    if (!panel) return;

    // 关闭时要把焦点还给打开前的那一个（可能是页面上的「新增」按钮）
    const prev = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const focusables = visibleFocusables(panel);
    // 面板本身也要能接焦点：没有可聚焦子元素时（纯展示型详情），
    // 焦点落到面板上，读屏才能顺着模态往下读。
    if (!panel.hasAttribute('tabindex')) panel.setAttribute('tabindex', '-1');
    (focusables[0] ?? panel).focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
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
      // 触发元素已被卸载（比如列表刷新了）就不强求，别把焦点丢到已经不存在的节点上
      if (prev && document.contains(prev) && prev.isConnected) {
        prev.focus();
      }
    };
  }, [open, ref]);
}
