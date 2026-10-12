import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import {
  AlertTriangle,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Edit3,
  Inbox,
  RefreshCw,
  Sparkles,
  Timer,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuthStore } from '@/store/authStore';
import { CHANGE_TYPE_LABEL, saveAdjustment } from '@/services/iep';
import {
  fetchWorkbench,
  type AttentionItem,
  type DueItem,
  type UpcomingItem,
  type WorkbenchData,
} from '@/services/workbench';
import TrialCounter from './iep/TrialCounter';

/**
 * 今日工作台 —— 「教师的一天」主视角
 *
 * 与旧仪表盘的区别不是视觉，是问题：
 *   旧首页问「系统里现在有多少东西」（九宫格 + 六张统计卡，教导主任视角）；
 *   新首页问「今天我要为哪几个孩子做什么」（教师视角）。
 *
 * 三块内容的排序原则：
 *   1. 今日待采 —— 系统替教师记住「该采集了」，而不是让教师自己记
 *   2. 需要关注 —— 消费 Step 1 的决策结论，只显示 adjust / watch / mastered
 *   3. 临期事项 —— 程序性时限（复审 / 审批 / 家长签署 / 干预效果复核）
 *
 * 本页不产生任何判断，所有结论文案均来自后端。
 */

const DUE_VISIBLE = 8;

const LEVEL_META: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  adjust:   { label: '建议调整干预', bg: 'bg-[#FEF2F2]', text: 'text-[#B91C1C]', dot: '#DC2626' },
  watch:    { label: '需关注',       bg: 'bg-[#FFFBEB]', text: 'text-[#B45309]', dot: '#D97706' },
  mastered: { label: '已达标待复核', bg: 'bg-[#EFF6FF]', text: 'text-[#1D4ED8]', dot: '#2563EB' },
};

const KIND_META: Record<string, { label: string; bg: string; text: string }> = {
  review_due:        { label: '复审',     bg: 'bg-[#EFF6FF]', text: 'text-[#1D4ED8]' },
  approval:          { label: '审批',     bg: 'bg-[#FFFBEB]', text: 'text-[#B45309]' },
  parent_sign:       { label: '家长签署', bg: 'bg-[#F5F3FF]', text: 'text-[#6D28D9]' },
  draft:             { label: '草稿',     bg: 'bg-[#F1F5F9]', text: 'text-[#475569]' },
  adjustment_review: { label: '效果复核', bg: 'bg-[#ECFDF5]', text: 'text-[#047857]' },
};

function greeting(): string {
  const h = new Date().getHours();
  if (h < 11) return '早上好';
  if (h < 14) return '中午好';
  if (h < 18) return '下午好';
  return '晚上好';
}

export default function Today() {
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [data, setData] = useState<WorkbenchData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dueExpanded, setDueExpanded] = useState(false);
  const [counterItem, setCounterItem] = useState<DueItem | null>(null);
  const [adjGoal, setAdjGoal] = useState<AttentionItem | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchWorkbench());
    } catch (e) {
      setError(e instanceof Error ? e.message : '工作台加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleDue = useMemo(() => {
    const list = data?.due ?? [];
    return dueExpanded ? list : list.slice(0, DUE_VISIBLE);
  }, [data?.due, dueExpanded]);

  const openPlan = useCallback(
    (planId: number) => navigate(`/iep?plan=${planId}`),
    [navigate],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-3">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary-200 border-t-primary-600" />
          <p className="text-sm text-[#64748B]">正在排今天的安排…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-[900px] mx-auto py-16 text-center">
        <p className="text-sm text-[#B91C1C]">{error}</p>
        <Button variant="outline" className="mt-4" onClick={load}>
          重试
        </Button>
      </div>
    );
  }

  const wb = data!;
  const total = wb.counts.due + wb.counts.attention + wb.counts.upcoming;

  return (
    <div className="max-w-[980px] mx-auto pb-16">
      {/* 头部 */}
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h1 className="text-xl font-semibold text-[#1E293B]">
            {greeting()}，{user?.name || '老师'}
          </h1>
          <p className="mt-1 text-sm text-[#64748B]">
            {total === 0
              ? '今天没有待办，可以安心上课。'
              : `今天有 ${wb.counts.due} 项目标待采集、${wb.counts.attention} 个目标需要关注、${wb.counts.upcoming} 项事项临近时限。`}
          </p>
        </div>
        <Button variant="outline" className="h-8 shrink-0" onClick={load}>
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
          刷新
        </Button>
      </div>

      {wb.readonly && (
        <div className="mb-5 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3 text-xs text-[#64748B]">
          {wb.note || '当前账号为只读视角，不提供教学待办。'}
        </div>
      )}

      {/* ---------- 1. 今日待采 ---------- */}
      <Section
        icon={<Timer className="w-4 h-4" />}
        title="今日待采"
        count={wb.counts.due}
        hint={
          wb.counts.overdue > 0
            ? `其中 ${wb.counts.overdue} 项已超过设定的采集频率`
            : '按目标设定的监控频率排程'
        }
        footnote={
          (wb.counts.no_objective_goals ?? 0) > 0
            ? `另有 ${wb.counts.no_objective_goals} 个长期目标没有短期目标，无法采集试次，需要先补建短期目标`
            : undefined
        }
      >
        {wb.due.length === 0 ? (
          <Empty text="所有目标都在采集周期内，今天没有需要补记的数据。" />
        ) : (
          <>
            <div className="divide-y divide-[#F1F5F9]">
              {visibleDue.map((it) => (
                <DueRow
                  key={`${it.objective_id}`}
                  item={it}
                  readonly={wb.readonly}
                  onRecord={() => setCounterItem(it)}
                  onOpen={() => openPlan(it.plan_id)}
                />
              ))}
            </div>
            {wb.due.length > DUE_VISIBLE && (
              <button
                onClick={() => setDueExpanded((v) => !v)}
                className="mt-3 flex items-center gap-1 text-xs text-[#2563EB] hover:underline cursor-pointer"
              >
                {dueExpanded ? '收起' : `展开全部 ${wb.due.length} 项`}
                <ChevronDown className={cn('w-3 h-3 transition-transform', dueExpanded && 'rotate-180')} />
              </button>
            )}
          </>
        )}
      </Section>

      {/* ---------- 2. 需要关注 ---------- */}
      <Section
        icon={<AlertTriangle className="w-4 h-4" />}
        title="需要关注"
        count={wb.counts.attention}
        hint="依据已采集数据自动判断，仅供参考，最终由 IEP 团队决定"
      >
        {wb.attention.length === 0 ? (
          <Empty text="没有目标触发调整或关注信号。" />
        ) : (
          <div className="divide-y divide-[#F1F5F9]">
            {wb.attention.map((it) => (
              <AttentionRow
                key={it.goal_id}
                item={it}
                readonly={wb.readonly}
                onOpen={() => openPlan(it.plan_id)}
                onAdjust={() => setAdjGoal(it)}
              />
            ))}
          </div>
        )}
      </Section>

      {/* ---------- 3. 临期事项 ---------- */}
      <Section
        icon={<CalendarClock className="w-4 h-4" />}
        title="临期事项"
        count={wb.counts.upcoming}
        hint="程序性时限：复审、审批、家长签署、干预效果复核"
      >
        {wb.upcoming.length === 0 ? (
          <Empty text="30 天内没有到期的程序性事项。" />
        ) : (
          <div className="divide-y divide-[#F1F5F9]">
            {wb.upcoming.map((it, i) => (
              <UpcomingRow key={`${it.kind}-${it.plan_id}-${i}`} item={it} onOpen={() => openPlan(it.plan_id)} />
            ))}
          </div>
        )}
      </Section>

      <p className="mt-6 text-[11px] text-[#94A3B8]">
        数据范围：{wb.scope_type === 'all' ? '全校' : '我负责的班级/学生'} ·
        生成于 {wb.generated_at} · 旧统计仪表盘仍在左侧「仪表盘」
      </p>

      {counterItem && (
        <TrialCounter
          item={counterItem}
          onClose={() => setCounterItem(null)}
          onSaved={() => void load()}
        />
      )}

      {adjGoal && (
        <QuickAdjust
          item={adjGoal}
          onClose={() => setAdjGoal(null)}
          onSaved={() => {
            setAdjGoal(null);
            void load();
          }}
        />
      )}
    </div>
  );
}

/* ============================================================
 * 区块容器
 * ============================================================ */

function Section({
  icon,
  title,
  count,
  hint,
  footnote,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  hint?: string;
  footnote?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-5 rounded-xl border border-[#E2E8F0] bg-white overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[#F1F5F9]">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[#475569]">{icon}</span>
          <h2 className="text-sm font-semibold text-[#1E293B]">{title}</h2>
          <span className="px-1.5 py-0.5 rounded-full bg-[#F1F5F9] text-[11px] font-medium text-[#475569]">
            {count}
          </span>
        </div>
        {hint && <p className="text-[11px] text-[#94A3B8] truncate hidden sm:block">{hint}</p>}
      </div>
      <div className="px-4 py-3">{children}</div>
      {footnote && (
        <p className="px-4 py-2.5 border-t border-[#F1F5F9] bg-[#FFFBEB] text-[11px] text-[#B45309]">
          {footnote}
        </p>
      )}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 py-6 justify-center text-xs text-[#94A3B8]">
      <Inbox className="w-4 h-4" />
      {text}
    </div>
  );
}

/* ============================================================
 * 今日待采行
 * ============================================================ */

function DueRow({
  item,
  readonly,
  onRecord,
  onOpen,
}: {
  item: DueItem;
  readonly: boolean;
  onRecord: () => void;
  onOpen: () => void;
}) {
  const overdue = item.days_overdue > 0;
  const dueToday = item.days_overdue === 0;

  return (
    <div className="flex items-center gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-[#1E293B]">{item.student_name}</span>
          {item.class_name && <span className="text-[11px] text-[#94A3B8]">{item.class_name}</span>}
          <span
            className={cn(
              'px-1.5 py-0.5 rounded text-[10px] font-medium',
              overdue ? 'bg-[#FEE2E2] text-[#B91C1C]' : dueToday ? 'bg-[#FFFBEB] text-[#B45309]' : 'bg-[#F1F5F9] text-[#64748B]',
            )}
          >
            {overdue ? `逾期 ${item.days_overdue} 天` : dueToday ? '今天该采集' : `${-item.days_overdue} 天后`}
          </span>
          {item.record_count === 0 && (
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-[#EFF6FF] text-[#1D4ED8]">从未采集</span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-[#475569] truncate">{item.objective_title}</p>
        <p className="mt-0.5 text-[11px] text-[#94A3B8] truncate">
          长期目标：{item.goal_title}
          {item.last_date ? ` · 上次 ${item.last_date}` : ''}
          {item.frequency ? ` · ${item.frequency}${item.frequency_defaulted ? '（未设定，按周排）' : ''}` : ''}
        </p>
      </div>
      {readonly ? (
        <Button variant="outline" className="h-8 shrink-0 text-xs" onClick={onOpen}>
          查看
          <ChevronRight className="w-3 h-3 ml-0.5" />
        </Button>
      ) : (
        <Button className="h-8 shrink-0" onClick={onRecord}>
          <ClipboardList className="w-3.5 h-3.5 mr-1.5" />
          记录试次
        </Button>
      )}
    </div>
  );
}

/* ============================================================
 * 需要关注行
 * ============================================================ */

function AttentionRow({
  item,
  readonly,
  onOpen,
  onAdjust,
}: {
  item: AttentionItem;
  readonly: boolean;
  onOpen: () => void;
  onAdjust: () => void;
}) {
  const m = LEVEL_META[item.level] ?? LEVEL_META.watch;
  return (
    <div className="py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-[#1E293B]">{item.student_name}</span>
            <span className={cn('px-1.5 py-0.5 rounded-full text-[10px] font-medium', m.bg, m.text)}>
              {item.level_text}
            </span>
            {item.points > 0 && (
              <span className="text-[10px] text-[#94A3B8]">{item.points} 个数据点</span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-[#475569] truncate">{item.goal_title}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Button variant="outline" className="h-7 text-xs" onClick={onOpen}>
            目标详情
            <ChevronRight className="w-3 h-3 ml-0.5" />
          </Button>
          {!readonly && (
            <Button variant="outline" className="h-7 text-xs" onClick={onAdjust}>
              <Edit3 className="w-3 h-3 mr-1" />
              登记调整
            </Button>
          )}
        </div>
      </div>

      <ul className="mt-2 space-y-0.5">
        {item.reasons.slice(0, 2).map((r, i) => (
          <li key={i} className="text-[11px] text-[#64748B] leading-relaxed">
            · {r}
          </li>
        ))}
      </ul>

      {item.suggestions.length > 0 && (
        <div className="mt-2 flex items-start gap-1.5 bg-[#F8FAFC] rounded-md px-2.5 py-2">
          <Sparkles className="w-3 h-3 text-[#94A3B8] mt-0.5 shrink-0" />
          <p className="text-[11px] text-[#64748B] leading-relaxed">
            可考虑的方向：{item.suggestions.map((s) => s.text).join('；')}
          </p>
        </div>
      )}
    </div>
  );
}

/* ============================================================
 * 临期事项行
 * ============================================================ */

function UpcomingRow({ item, onOpen }: { item: UpcomingItem; onOpen: () => void }) {
  const k = KIND_META[item.kind] ?? KIND_META.draft;
  return (
    <button
      onClick={onOpen}
      className="w-full flex items-center gap-3 py-2.5 text-left hover:bg-[#F8FAFC] -mx-1 px-1 rounded cursor-pointer"
    >
      <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0', k.bg, k.text)}>
        {k.label}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-[#1E293B] truncate">
          {item.student_name} · {item.title}
        </p>
        <p
          className={cn(
            'text-[11px] truncate',
            item.severity === 'overdue' ? 'text-[#B91C1C]' : 'text-[#64748B]',
          )}
        >
          {item.text}
        </p>
      </div>
      <ChevronRight className="w-3.5 h-3.5 text-[#CBD5E1] shrink-0" />
    </button>
  );
}

/* ============================================================
 * 快速登记干预调整（DBI Step 4）
 * ============================================================ */

function QuickAdjust({
  item,
  onClose,
  onSaved,
}: {
  item: AttentionItem;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [detail, setDetail] = useState('');
  const [type, setType] = useState('other');
  const [due, setDue] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().slice(0, 10);
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (detail.trim() === '') {
      toast.error('请写清「具体改了什么」——这是后续复盘的依据');
      return;
    }
    setSaving(true);
    try {
      await saveAdjustment({
        goal_id: item.goal_id,
        change_detail: detail.trim(),
        change_type: type,
        trigger_type: item.level === 'adjust' ? 'below_aimline' : 'team_decision',
        trigger_detail: item.reasons.join('；'),
        review_due_date: due,
      });
      toast.success('已登记干预调整，到期会提醒复核效果');
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <div className="w-full sm:max-w-[520px] bg-white rounded-t-2xl sm:rounded-2xl shadow-xl">
        <div className="px-5 py-4 border-b border-[#E2E8F0]">
          <h3 className="text-base font-semibold text-[#1E293B]">登记干预调整</h3>
          <p className="mt-0.5 text-xs text-[#64748B] truncate">
            {item.student_name} · {item.goal_title}
          </p>
        </div>

        <div className="px-5 py-4">
          <div className="rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] p-3 mb-4">
            <p className="text-[11px] font-medium text-[#475569] mb-1">系统给出的判断依据</p>
            <ul className="space-y-0.5">
              {item.reasons.map((r, i) => (
                <li key={i} className="text-[11px] text-[#64748B] leading-relaxed">· {r}</li>
              ))}
            </ul>
          </div>

          <p className="text-xs font-medium text-[#475569] mb-1.5">调整类型</p>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="h-9 mb-3">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(CHANGE_TYPE_LABEL).map(([v, label]) => (
                <SelectItem key={v} value={v}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <p className="text-xs font-medium text-[#475569] mb-1.5">具体改了什么（必填）</p>
          <Textarea
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            rows={3}
            placeholder="例：把「独立穿脱外套」拆成 5 步任务分析，先练第 3 步「拉拉链」；每节课试次从 5 次增加到 8 次"
            className="text-xs"
          />

          <p className="text-xs font-medium text-[#475569] mt-3 mb-1.5">再监控到期日</p>
          <input
            type="date"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            className="h-9 px-3 rounded-md border border-[#E2E8F0] text-xs text-[#1E293B]"
          />
          <p className="mt-1.5 text-[11px] text-[#94A3B8]">
            到期后会出现在「临期事项」，提醒你回头看这次调整到底有没有用。
          </p>
        </div>

        <div className="px-5 py-4 border-t border-[#E2E8F0] flex items-center justify-end gap-2">
          <Button variant="outline" className="h-9" onClick={onClose}>取消</Button>
          <Button className="h-9" onClick={save} disabled={saving}>
            {saving ? '保存中…' : '保存'}
          </Button>
        </div>
      </div>
    </div>
  );
}
