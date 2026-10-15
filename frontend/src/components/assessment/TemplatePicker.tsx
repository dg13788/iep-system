/**
 * 评估模板选择器（2026-10-15 重构）
 * ============================================================================
 *
 * 背景（真实浏览器实测）：模板库随运营增长到 37 个，原实现两处都是
 * 「全部平铺 + 每张卡独立 stagger 入场动画」——主页面第 37 张卡的动画
 * 延迟累加到 2.4s+，数据量再涨页面加载/刷新明显变慢；教师要在 37 张
 * 长得差不多的卡片里找某一个，眼花且低效。
 *
 * 重构原则（科学布局 + 合理规划 + 方便实际操作）：
 *   1. 搜索优先——名称/分类/描述即时过滤，输入即筛选；
 *   2. 分类收敛——分类 chips 带计数，一次点击把视野缩到一个类；
 *   3. 渐进披露——主页面默认只展示前 9 张，「展开全部」按需加载视野，
 *      模板库继续增长也不会把首屏撑爆；
 *   4. 动画让位性能——整容器一次入场，不再每卡 stagger（37 个 motion
 *      组件的逐个延迟是实测卡顿的主因）；
 *   5. 抽屉内用紧凑列表 + 分类小标题，限高滚动，不把步骤页撑长。
 */
import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Brain,
  MessageSquare,
  Activity,
  Users,
  Home as HomeIcon,
  Heart,
  BookOpen,
  ClipboardCheck,
  FileText,
  Search,
  X,
  ChevronDown,
  ChevronUp,
  LayoutGrid,
  List,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/** 与 Evaluation.tsx 的 AssessmentTemplate 对齐（dimensions 在列表态为空） */
export interface PickerTemplate {
  id: string;
  name: string;
  category: string;
  icon: string;
  color: string;
  description: string;
  dimensions?: unknown[];
}

/** 模板卡片图标按分类取（分类取值见 assessment_templates.category） */
const CATEGORY_ICON_STYLE: Record<string, { icon: React.ReactNode; color: string }> = {
  '认知发展': { icon: <Brain className="w-8 h-8" style={{ color: 'rgb(var(--brand))' }} />, color: 'rgb(var(--brand))' },
  '沟通交往': { icon: <MessageSquare className="w-8 h-8" style={{ color: 'rgb(var(--info))' }} />, color: 'rgb(var(--info))' },
  '运动能力': { icon: <Activity className="w-8 h-8" style={{ color: 'rgb(var(--success))' }} />, color: 'rgb(var(--success))' },
  '社会适应': { icon: <Users className="w-8 h-8" style={{ color: 'rgb(var(--warning))' }} />, color: 'rgb(var(--warning))' },
  '生活自理': { icon: <HomeIcon className="w-8 h-8" style={{ color: 'rgb(var(--surface-inverse-2))' }} />, color: 'rgb(var(--surface-inverse-2))' },
  '情绪行为': { icon: <Heart className="w-8 h-8" style={{ color: 'rgb(var(--danger))' }} />, color: 'rgb(var(--danger))' },
  '学业准备': { icon: <BookOpen className="w-8 h-8" style={{ color: 'rgb(var(--violet))' }} />, color: 'rgb(var(--violet))' },
  '课程本位': { icon: <ClipboardCheck className="w-8 h-8" style={{ color: 'rgb(var(--info))' }} />, color: 'rgb(var(--info))' },
  '能力本位': { icon: <ClipboardCheck className="w-8 h-8" style={{ color: 'rgb(var(--info))' }} />, color: 'rgb(var(--info))' },
  '专项评估': { icon: <FileText className="w-8 h-8" style={{ color: 'rgb(var(--ink-2))' }} />, color: 'rgb(var(--ink-2))' },
};

export function templateIcon(t: PickerTemplate): React.ReactNode {
  return CATEGORY_ICON_STYLE[t.category]?.icon ?? <FileText className="w-8 h-8" style={{ color: 'rgb(var(--brand))' }} />;
}

export function templateColor(t: PickerTemplate): string {
  return CATEGORY_ICON_STYLE[t.category]?.color ?? 'rgb(var(--brand))';
}

/** 小号图标（列表行内用，与卡片大图标区分层次） */
function templateIconSm(t: PickerTemplate): React.ReactNode {
  const big = templateIcon(t);
  if (big && typeof big === 'object' && 'props' in (big as React.ReactElement)) {
    const el = big as React.ReactElement<{ className?: string }>;
    return { ...el, props: { ...el.props, className: 'w-5 h-5' } };
  }
  return big;
}

interface TemplatePickerProps<T extends PickerTemplate> {
  templates: T[];
  loading?: boolean;
  selectedId?: string | null;
  onSelect: (t: T) => void;
  /** cards：主页面卡片网格；list：抽屉内紧凑分组列表 */
  variant?: 'cards' | 'list';
  className?: string;
}

/** 主页面卡片变体默认展示张数，超出折叠为「展开全部」 */
const CARDS_INITIAL = 9;

export default function TemplatePicker<T extends PickerTemplate>({
  templates,
  loading = false,
  selectedId = null,
  onSelect,
  variant = 'cards',
  className,
}: TemplatePickerProps<T>) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [expanded, setExpanded] = useState(false);

  /** 分类统计（保持模板库返回顺序：系统模板优先、新的在前） */
  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of templates) counts.set(t.category, (counts.get(t.category) || 0) + 1);
    return [...counts.entries()].map(([name, count]) => ({ name, count }));
  }, [templates]);

  /** 搜索 + 分类过滤 */
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return templates.filter((t) => {
      if (category !== 'all' && t.category !== category) return false;
      if (!q) return true;
      return (
        t.name.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q) ||
        (t.description || '').toLowerCase().includes(q)
      );
    });
  }, [templates, query, category]);

  /** 列表变体按分类分组 */
  const grouped = useMemo(() => {
    const map = new Map<string, T[]>();
    for (const t of filtered) {
      const arr = map.get(t.category) || [];
      arr.push(t);
      map.set(t.category, arr);
    }
    return [...map.entries()];
  }, [filtered]);

  const isList = variant === 'list';
  const visibleCards = expanded ? filtered : filtered.slice(0, CARDS_INITIAL);
  const hiddenCount = filtered.length - visibleCards.length;
  const filtering = query.trim() !== '' || category !== 'all';

  const clearFilters = () => { setQuery(''); setCategory('all'); };

  if (loading) {
    return <div className="text-sm text-ink-3 py-6">模板加载中…</div>;
  }
  if (templates.length === 0) {
    return <div className="text-sm text-ink-3 py-6">暂无可用评估模板，请先在「模板管理」中创建</div>;
  }

  return (
    <div className={cn('space-y-3', className)}>
      {/* 搜索 + 计数 */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-3 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索模板名称、分类或描述…"
            aria-label="搜索评估模板"
            className="w-full h-10 pl-9 pr-9 rounded-md bg-canvas border border-line text-sm text-ink placeholder:text-ink-3 focus:border-line-focus focus:ring-[3px] focus:ring-[rgba(59,130,246,0.15)] outline-none"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              aria-label="清空搜索"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-ink-3 hover:text-ink hover:bg-surface-2 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <span className="text-sm text-ink-3 whitespace-nowrap">
          {filtering ? `筛选出 ${filtered.length} / ${templates.length} 个模板` : `共 ${templates.length} 个模板`}
        </span>
      </div>

      {/* 分类 chips（带计数，横向可滚动；触控 44px / 桌面 32px，同页码 select 口径） */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <button
          onClick={() => setCategory('all')}
          aria-pressed={category === 'all'}
          className={cn(
            'flex items-center gap-1.5 px-3 h-11 lg:h-8 rounded-full border text-sm whitespace-nowrap cursor-pointer transition-colors',
            category === 'all'
              ? 'bg-brand text-ink-on-dark border-brand'
              : 'bg-surface border-line text-ink-2 hover:border-brand hover:text-brand-ink'
          )}
        >
          全部 <span className="text-xs opacity-80">{templates.length}</span>
        </button>
        {categories.map((c) => (
          <button
            key={c.name}
            onClick={() => setCategory(category === c.name ? 'all' : c.name)}
            aria-pressed={category === c.name}
            className={cn(
              'flex items-center gap-1.5 px-3 h-11 lg:h-8 rounded-full border text-sm whitespace-nowrap cursor-pointer transition-colors',
              category === c.name
                ? 'bg-brand text-ink-on-dark border-brand'
                : 'bg-surface border-line text-ink-2 hover:border-brand hover:text-brand-ink'
            )}
          >
            {c.name} <span className="text-xs opacity-80">{c.count}</span>
          </button>
        ))}
      </div>

      {/* 空态 */}
      {filtered.length === 0 && (
        <div className="py-8 text-center">
          <p className="text-sm text-ink-2">
            未找到匹配{query.trim() ? `「${query.trim()}」` : ''}的模板
          </p>
          <button onClick={clearFilters} className="mt-2 text-sm text-brand-ink hover:underline cursor-pointer">
            清除筛选条件
          </button>
        </div>
      )}

      {/* 卡片变体：主页面 */}
      {!isList && filtered.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3"
        >
          {visibleCards.map((t) => {
            const selected = selectedId === t.id;
            return (
              <button
                key={t.id}
                onClick={() => onSelect(t)}
                className={cn(
                  'flex flex-col items-start p-4 bg-surface border rounded-lg text-left transition-all duration-150 hover:shadow-md hover:-translate-y-0.5 cursor-pointer group',
                  selected ? 'border-2' : 'border-line'
                )}
                style={selected ? { borderColor: templateColor(t) } : undefined}
              >
                <div className="mb-2">{templateIcon(t)}</div>
                <span className="text-sm font-semibold text-ink group-hover:text-brand-ink">{t.name}</span>
                <span className="text-xs text-ink-3 mt-1 line-clamp-2">{t.description || t.category}</span>
                <span className="mt-2 px-1.5 py-0.5 rounded bg-surface-2 text-xs text-ink-3">{t.category}</span>
              </button>
            );
          })}
        </motion.div>
      )}

      {/* 展开/收起 */}
      {!isList && hiddenCount > 0 && (
        <button
          onClick={() => setExpanded(true)}
          className="flex items-center gap-1 mx-auto px-4 h-11 lg:h-9 rounded-md border border-line text-sm text-ink-2 hover:text-brand-ink hover:border-brand cursor-pointer"
        >
          展开全部 {filtered.length} 个模板 <ChevronDown className="w-4 h-4" />
        </button>
      )}
      {!isList && expanded && filtered.length > CARDS_INITIAL && (
        <button
          onClick={() => setExpanded(false)}
          className="flex items-center gap-1 mx-auto px-4 h-11 lg:h-9 rounded-md border border-line text-sm text-ink-2 hover:text-brand-ink hover:border-brand cursor-pointer"
        >
          收起 <ChevronUp className="w-4 h-4" />
        </button>
      )}

      {/* 列表变体：抽屉内，分组 + 限高滚动 */}
      {isList && filtered.length > 0 && (
        <div className="max-h-[320px] overflow-y-auto rounded-md border border-line divide-y divide-line">
          {grouped.map(([cat, list]) => (
            <div key={cat}>
              <div className="sticky top-0 z-10 flex items-center gap-2 px-3 h-8 bg-surface-2 text-xs font-medium text-ink-2">
                {cat}
                <span className="text-ink-3">{list.length}</span>
              </div>
              {list.map((t) => {
                const selected = selectedId === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => onSelect(t)}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2.5 text-left cursor-pointer transition-colors',
                      selected ? 'bg-brand-soft' : 'hover:bg-surface-2'
                    )}
                  >
                    <span className="flex-shrink-0 text-ink-2">{templateIconSm(t)}</span>
                    <span className="flex-1 min-w-0">
                      <span className={cn('block text-sm truncate', selected ? 'text-brand-ink font-medium' : 'text-ink')}>{t.name}</span>
                      {t.description && <span className="block text-xs text-ink-3 truncate">{t.description}</span>}
                    </span>
                    {selected && <span className="flex-shrink-0 text-xs text-brand-ink">已选择</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* 变体提示图标（仅无障碍语义，不重复展示） */}
      <span className="hidden" aria-hidden>
        {isList ? <List /> : <LayoutGrid />}
      </span>
    </div>
  );
}
