import { useEffect } from 'react';

/**
 * 自研抽屉的无障碍与键盘支持。
 *
 * 修复说明(P3-1)：项目里的自研抽屉（学生详情/表单、评估详情、家校协作表单等）
 * 只是两个 fixed 定位的 div，既没有 role="dialog"，也不响应 Esc 键：
 *   - 屏幕阅读器读不出这是一个对话框，读屏用户无法感知模态状态；
 *   - 键盘用户只能用鼠标去点右上角的 X 才能关闭。
 *
 * 本 hook 统一补上 Esc 关闭能力，调用方还需在面板根节点加上
 *   role="dialog" aria-modal="true" aria-label="…"
 *
 * 注意：若此时已有 Radix 的 Dialog / AlertDialog 处于打开状态
 * （例如详情抽屉里再弹出「确认删除」），Esc 应交给最上层的原生对话框处理，
 * 避免一次 Esc 把两层同时关掉。
 */
export function useDrawerA11y(open: boolean, onClose: () => void): void {
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // 已有原生对话框打开时，让位给它
      if (document.querySelector('[role="dialog"][data-state="open"]')) return;
      e.stopPropagation();
      onClose();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);
}
