/**
 * 受控分页控件（业务在用的版本）
 * ------------------------------------------------------------
 * 这个文件原本是 shadcn 的英文脚手架（Previous / Next），全系统零引用；
 * 而评估 / 教学记录 / 模板三处各写了一份手写分页，都是
 * `Array.from({length: totalPages})` 把所有页码一次铺开——
 * 数据一多几十个方块挤在窄屏上溢出视口（实测模板页「下一页」越界 13px），
 * 且按钮 32px 不达触控下限。这就是典型的「封装了却没人用，用的人自己抄一份」。
 *
 * 现统一为这一个组件，三处接线。设计取舍（教师视角 + 触控优先）：
 *  1. 页码窗口化：只渲染 首页 … 当前±1 … 末页，页码再多也不挤爆
 *  2. 手机上不铺页码方块，改为「第 3 / 12 页」文字 + 两个大翻页按钮
 *     （手指在小屏上点 32px 的数字方块是折磨）
 *  3. 触屏 40px / 桌面 36px（ADR-050：触控断点跟 lg(1024)，不跟 sm）
 *  4. 键盘可达 + aria-current 标注当前页
 */
import * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PaginationProps {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
  /** 左侧说明，如「共 128 条」 */
  summary?: React.ReactNode;
  /** 右侧附加控件（如每页条数选择器） */
  trailing?: React.ReactNode;
  className?: string;
}

/** 生成页码窗口：1 … 3 [4] 5 … 20 */
function pageWindow(page: number, total: number, siblings = 1): (number | 'gap')[] {
  const slots = siblings * 2 + 5; // 首尾 + 当前 + 两侧兄弟 + 两个省略号
  if (total <= slots) return Array.from({ length: total }, (_, i) => i + 1);

  const left = Math.max(page - siblings, 1);
  const right = Math.min(page + siblings, total);
  const items: (number | 'gap')[] = [1];

  if (left > 2) items.push('gap');
  for (let p = Math.max(left, 2); p <= Math.min(right, total - 1); p++) items.push(p);
  if (right < total - 1) items.push('gap');
  if (total > 1) items.push(total);

  return items;
}

export function Pagination({
  page,
  totalPages,
  onChange,
  summary,
  trailing,
  className,
}: PaginationProps) {
  const items = React.useMemo(() => pageWindow(page, totalPages), [page, totalPages]);

  if (totalPages <= 1 && !summary && !trailing) return null;

  const btn =
    'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors press ' +
    'disabled:opacity-40 disabled:pointer-events-none cursor-pointer outline-none';

  return (
    <nav
      aria-label="分页"
      className={cn(
        // 窄屏纵向堆叠：原实现 justify-between 不换行，「下一页」会被挤出视口
        'flex flex-col sm:flex-row items-center justify-between gap-3',
        className,
      )}
    >
      <div className="flex items-center gap-3 justify-center">
        {summary && <div className="text-sm text-ink-2">{summary}</div>}
        {totalPages > 1 && (
          <div className="text-sm text-ink-2 sm:hidden tabular-nums">
            第 {page} / {totalPages} 页
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap justify-center">
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="上一页"
              disabled={page <= 1}
              onClick={() => onChange(Math.max(1, page - 1))}
              className={cn(
                btn,
                'h-11 lg:h-9 min-w-11 lg:min-w-9 px-3 border border-line bg-surface text-ink-2 hover:bg-canvas',
              )}
            >
              <ChevronLeft className="w-4 h-4 sm:hidden" />
              <span className="hidden sm:inline">上一页</span>
            </button>

            {/* 页码方块只在 sm 以上渲染 */}
            <div className="hidden sm:flex items-center gap-1">
              {items.map((it, idx) =>
                it === 'gap' ? (
                  <span
                    key={`gap-${idx}`}
                    aria-hidden="true"
                    className="w-8 text-center text-ink-3 select-none"
                  >
                    …
                  </span>
                ) : (
                  <button
                    key={it}
                    type="button"
                    aria-label={`第 ${it} 页`}
                    aria-current={it === page ? 'page' : undefined}
                    onClick={() => onChange(it)}
                    className={cn(
                      btn,
                      'h-11 lg:h-9 min-w-11 lg:min-w-9 px-2 tabular-nums',
                      it === page
                        ? 'bg-brand text-ink-on-dark'
                        : 'text-ink-2 hover:bg-canvas',
                    )}
                  >
                    {it}
                  </button>
                ),
              )}
            </div>

            <button
              type="button"
              aria-label="下一页"
              disabled={page >= totalPages}
              onClick={() => onChange(Math.min(totalPages, page + 1))}
              className={cn(
                btn,
                'h-11 lg:h-9 min-w-11 lg:min-w-9 px-3 border border-line bg-surface text-ink-2 hover:bg-canvas',
              )}
            >
              <span className="hidden sm:inline">下一页</span>
              <ChevronRight className="w-4 h-4 sm:hidden" />
            </button>
          </div>
        )}
        {trailing}
      </div>
    </nav>
  );
}

export default Pagination;
