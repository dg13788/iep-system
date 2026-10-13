import type { ReactNode } from 'react';
import { Inbox, RotateCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton as UiSkeleton } from '@/components/ui/skeleton';

/**
 * 页面三态：加载中 / 空 / 出错
 *
 * 此前各页面各写各的：Today 自建了一个 8 行的 Empty，
 * ClassManagement 又内联了一份，加载态则是 43 处 `Loader2 animate-spin` 各写各的文案。
 * 同一件事有 N 种说法，教师在不同页面看到的是不同的措辞和不同的视觉重量。
 * 这里统一成一套，并且：
 *   - 加载用骨架屏而非转圈：骨架屏保留了内容的形状，
 *     教师知道"大概会有什么、有多少"，等待的心理时长更短。
 *     转圈只告诉用户"在忙"，不告诉用户"在忙什么"。
 *   - 空状态必须说清"为什么空、以及要不要做点什么"。
 *     「暂无数据」四个字等于没说，教师不知道是系统坏了还是今天真的没事。
 */

/** 单块骨架 */
export function Skel({ className }: { className?: string }) {
  return <UiSkeleton className={cn('shimmer bg-[#EEF1F5]', className)} />;
}

/** 列表骨架：用于待办 / 台账类区块 */
export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skel className="h-9 w-9 rounded-full shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Skel className="h-3.5 w-[42%]" />
            <Skel className="h-3 w-[68%]" />
          </div>
          <Skel className="h-8 w-20 rounded-md shrink-0" />
        </div>
      ))}
    </div>
  );
}

/** 卡片骨架 */
export function CardSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="rounded-xl border border-[#E2E8F0] bg-white overflow-hidden" aria-hidden="true">
      <div className="px-4 py-3 border-b border-[#F1F5F9] flex items-center gap-2">
        <Skel className="h-4 w-4 rounded" />
        <Skel className="h-3.5 w-24" />
      </div>
      <div className="px-4 py-3">
        <ListSkeleton rows={rows} />
      </div>
    </div>
  );
}

/** 空状态 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center px-4 py-8',
        className,
      )}
    >
      <div className="w-11 h-11 rounded-full bg-[#F1F5F9] flex items-center justify-center">
        {icon ?? <Inbox className="w-5 h-5 text-[#94A3B8]" />}
      </div>
      <p className="mt-3 text-sm font-medium text-[#475569]">{title}</p>
      {description && (
        <p className="mt-1 text-xs leading-relaxed text-[#94A3B8] max-w-[36ch]">
          {description}
        </p>
      )}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

/** 出错状态 */
export function ErrorState({
  message,
  onRetry,
  compact = false,
}: {
  message: string;
  onRetry?: () => void;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compact ? 'py-6' : 'py-14',
      )}
      role="alert"
    >
      <p className="text-sm text-[#B91C1C]">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 min-tap-h inline-flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] px-4 text-sm text-[#475569] hover:bg-[#F7F6F4] press cursor-pointer"
        >
          <RotateCw className="w-3.5 h-3.5" />
          重试
        </button>
      )}
    </div>
  );
}
