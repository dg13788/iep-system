import { useState, type ReactNode } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

/**
 * 危险操作二次确认
 *
 * 此前全项目零处二次确认：删除学生、清空数据这类不可逆操作点一下就执行了。
 * alert-dialog 组件早就封装好了，但业务代码从没引用过
 * （既没有 Radix 版，也没有 window.confirm —— 属于"裸奔"）。
 *
 * 设计要点：
 *  - 确认按钮默认不聚焦，避免手快连按回车误触发；焦点落在「取消」上。
 *  - 破坏性操作必须让用户知道后果是什么，所以 description 是必填的
 *    （调用方必须写清"会发生什么、能否撤销"）。
 *  - 异步执行期间保持打开并禁用按钮，避免重复提交。
 */

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** 必须说清后果与是否可撤销 */
  description: ReactNode;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
}

export default function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmText = '确认',
  cancelText = '取消',
  destructive = true,
  onConfirm,
}: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <AlertDialogContent className="w-[calc(100vw-2rem)] max-w-[420px] rounded-2xl p-5 sm:p-6">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-base">{title}</AlertDialogTitle>
          <AlertDialogDescription className="text-sm leading-relaxed text-ink-2">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="mt-5 gap-2">
          <AlertDialogCancel
            disabled={busy}
            className="min-tap-h mt-0 rounded-lg border-line sm:min-w-[88px]"
            // 焦点默认落在取消：手快连按回车不会误删
            autoFocus
          >
            {cancelText}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={(e) => {
              e.preventDefault();
              void run();
            }}
            className={
              destructive
                ? 'min-tap-h mt-0 rounded-lg bg-danger-strong text-ink-on-dark hover:bg-danger-strong sm:min-w-[88px]'
                : 'min-tap-h mt-0 rounded-lg sm:min-w-[88px]'
            }
          >
            {busy ? '处理中…' : confirmText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
