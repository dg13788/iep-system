import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
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
 * 命令式二次确认（useConfirm）
 * ------------------------------------------------------------
 * 为什么要有这一套：项目里散落着十来处删除，其中「删除学生档案」「删除 IEP 计划」
 * 这类不可逆操作此前点一下就执行了（全系统 window.confirm 零使用）。
 * 逐个组件加 open/onOpenChange 状态 + 内嵌 JSX 会侵入每个页面的结构，
 * 改动面大、容易破坏布局；这里改成命令式：
 *
 *   const confirm = useConfirm();
 *   if (!(await confirm({ title: '…', description: '…' }))) return;
 *
 * 设计要点沿用 ConfirmDialog：
 *  - 焦点默认落在「取消」，手快连按回车不会误删
 *  - description 必填，调用方必须说清后果与能否撤销
 *  - 返回 Promise<boolean>，调用方自己决定要不要继续
 */

export interface ConfirmOptions {
  title: string;
  /** 必须说清后果与是否可撤销 */
  description: ReactNode;
  confirmText?: string;
  cancelText?: string;
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((o) => {
    setOpts(o);
    return new Promise<boolean>((res) => {
      // 若上一个还没关闭，先把旧的按取消处理，避免 Promise 悬挂
      resolver.current?.(false);
      resolver.current = res;
    });
  }, []);

  const close = (v: boolean) => {
    setOpts(null);
    const r = resolver.current;
    resolver.current = null;
    r?.(v);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog open={opts !== null} onOpenChange={(o) => !o && close(false)}>
        <AlertDialogContent className="w-[calc(100vw-2rem)] max-w-[420px] rounded-2xl p-5 sm:p-6">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base">{opts?.title}</AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-relaxed text-[#64748B]">
              {opts?.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-5 gap-2">
            <AlertDialogCancel
              autoFocus
              className="min-tap-h mt-0 rounded-lg border-[#E2E8F0] sm:min-w-[88px]"
            >
              {opts?.cancelText || '取消'}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                close(true);
              }}
              className="min-tap-h mt-0 rounded-lg bg-[#DC2626] text-white hover:bg-[#B91C1C] sm:min-w-[88px]"
            >
              {opts?.confirmText || '删除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const fn = useContext(ConfirmContext);
  if (!fn) {
    // 未挂载 Provider 时退化为一律放行，避免直接崩页面（但绝不静默删除）
    return async () => true;
  }
  return fn;
}
