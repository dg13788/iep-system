import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Edit3,
  RefreshCw,
  Sparkles,
  Timer,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { CardSkeleton, EmptyState, ErrorState, Skel } from '@/components/feedback/PageState';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuthStore } from '@/store/authStore';
import { useDialogFocus } from '@/hooks/useDialogFocus';
import { useDrawerA11y } from '@/hooks/useDrawerA11y';
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
  // 倒退是全部判定里最需要教师立刻改变教学的信号（后端严重度 6，最高），
  // 用实心强底色与「建议调整」区分；此前缺这一档，会静默兜底成 watch 的
  // 「需关注」文案与配色，把最紧急的信号降级成普通提醒。
  regression: { label: '出现倒退', bg: 'bg-danger-strong', text: 'text-surface', dot: 'rgb(var(--danger-strong))' },
  adjust:   { label: '建议调整干预', bg: 'bg-danger-soft', text: 'text-danger-strong', dot: 'rgb(var(--danger-strong))' },
  watch:    { label: '需关注',       bg: 'bg-warning-soft', text: 'text-warning-strong', dot: 'rgb(var(--warning-strong))' },
  mastered: { label: '已达标待复核', bg: 'bg-info-soft', text: 'text-info-strong', dot: 'rgb(var(--info-strong))' },
};

const KIND_META: Record<string, { label: string; bg: string; text: string }> = {
  review_due:        { label: '复审',     bg: 'bg-info-soft', text: 'text-info-strong' },
  approval:          { label: '审批',     bg: 'bg-warning-soft', text: 'text-warning-strong' },
  parent_sign:       { label: '家长签署', bg: 'bg-violet-soft', text: 'text-violet' },
  draft:             { label: '草稿',     bg: 'bg-surface-2', text: 'text-ink-2' },
  adjustment_review: { label: '效果复核', bg: 'bg-success-soft', text: 'text-success-strong' },
};

function greeting(): string {
  const h = new Date().getHours();
  if (h < 11) return '早上好';
  if (h < 14) return '中午好';
  if (h < 18) return '下午好';
  return '晚上好';
}

/** 今天是什么日子：教师抬头就该看见，不必自己去任务栏确认 */
function todayText(): string {
  const d = new Date();
  const week = '日一二三四五六'[d.getDay()];
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日 · 星期${week}`;
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

  // 骨架屏而非转圈：教师等待时能看到"大概会来什么、有几块"，
  // 而不是对着一个转圈猜系统是不是卡住了。
  if (loading) {
    return (
      <div className="max-w-[980px] mx-auto pb-16">
        <Skel className="h-6 w-52 mb-2" />
        <Skel className="h-3.5 w-72 mb-5" />
        <div className="space-y-5">
          <CardSkeleton rows={4} />
          <CardSkeleton rows={2} />
          <CardSkeleton rows={2} />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-[900px] mx-auto">
        <ErrorState message={error} onRetry={() => void load()} />
      </div>
    );
  }

  const wb = data!;
  const total = wb.counts.due + wb.counts.attention + wb.counts.upcoming;

  return (
    <div className="max-w-[980px] mx-auto pb-16">
      {/* 头部 */}
      <div className="flex items-start justify-between gap-3 mb-5">
        <div className="min-w-0">
          <p className="text-xs text-ink-3">{todayText()}</p>
          <h1 className="mt-0.5 text-xl sm:text-2xl font-semibold tracking-tight text-ink">
            {greeting()}，{user?.name || '老师'}
          </h1>
          <p className="mt-1.5 text-sm text-ink-2 leading-relaxed">
            {total === 0
              ? '今天没有待办，可以安心上课。'
              : `今天有 ${wb.counts.due} 项目标待采集、${wb.counts.attention} 个目标需要关注、${wb.counts.upcoming} 项事项临近时限。`}
          </p>
        </div>
        {/* 窄屏只留图标：省出的宽度给问候语，无障碍名补在 aria-label 上 */}
        <Button
          variant="outline"
          className="h-11 lg:h-9 min-w-11 shrink-0 press"
          onClick={load}
          aria-label="刷新今日待办"
          title="刷新"
        >
          <RefreshCw className="w-3.5 h-3.5 sm:mr-1.5" />
          <span className="hidden sm:inline">刷新</span>
        </Button>
      </div>

      {wb.readonly && (
        <div className="mb-5 rounded-lg border border-line bg-surface-3 px-4 py-3 text-xs text-ink-2">
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
          <Empty
            icon={<Timer className="w-5 h-5 text-ink-3" />}
            title="今天没有需要补记的数据"
            description="所有目标都在采集周期内。中途加练的试次可以随时从 IEP 计划里补记。"
          />
        ) : (
          <>
            <div className="divide-y divide-line">
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
                className="mt-2 flex items-center gap-1 text-xs text-info-strong cursor-pointer rounded-md px-2 -mx-2 min-h-11 lg:min-h-8 hover:bg-primary/5 press"
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
          <Empty
            icon={<CheckCircle2 className="w-5 h-5 text-ink-3" />}
            title="没有目标触发关注信号"
            description="依据已采集数据判断，暂不需要调整干预。继续按计划采集即可。"
          />
        ) : (
          <div className="divide-y divide-line">
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
          <Empty
            icon={<CalendarClock className="w-5 h-5 text-ink-3" />}
            title="30 天内没有到期事项"
            description="复审、审批、家长签署都在时限内。"
          />
        ) : (
          <div className="divide-y divide-line">
            {wb.upcoming.map((it, i) => (
              <UpcomingRow key={`${it.kind}-${it.plan_id}-${i}`} item={it} onOpen={() => openPlan(it.plan_id)} />
            ))}
          </div>
        )}
      </Section>

      <p className="mt-6 text-[11px] text-ink-3">
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
    // 用极轻的阴影 + 留白表达"这是一张卡片"，而不是靠一圈重边框把界面切成表格
    <section className="mb-5 rounded-xl border border-line bg-surface shadow-card overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-line">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-6 h-6 shrink-0 rounded-full bg-surface-2 flex items-center justify-center text-ink-2">
            {icon}
          </span>
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          <span className="px-1.5 py-0.5 rounded-full bg-surface-2 text-[11px] font-medium text-ink-2 tabular">
            {count}
          </span>
        </div>
        {hint && <p className="text-[11px] text-ink-3 truncate hidden sm:block">{hint}</p>}
      </div>
      <div className="px-4 py-3">{children}</div>
      {footnote && (
        <p className="px-4 py-2.5 border-t border-line bg-warning-soft text-[11px] text-warning-strong">
          {footnote}
        </p>
      )}
    </section>
  );
}

/** 空状态必须说清"为什么空、要不要做点什么"，只写"暂无数据"等于没说 */
function Empty({ title, description, icon }: { title: string; description: string; icon?: React.ReactNode }) {
  return <EmptyState icon={icon} title={title} description={description} className="py-6" />;
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
    // 手机上竖排：信息在上、按钮在下且占满整行宽度（拇指最好按的位置）；
    // 桌面上回到横排，保持信息密度。按钮在移动端 44px 高，桌面 36px。
    <div className="relative flex flex-col gap-2 py-3 pl-3 sm:flex-row sm:items-center sm:gap-3 sm:pl-4">
      {overdue && (
        <span
          className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full bg-danger-strong"
          aria-hidden="true"
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-ink">{item.student_name}</span>
          {item.class_name && <span className="text-[11px] text-ink-3">{item.class_name}</span>}
          <span
            className={cn(
              'px-1.5 py-0.5 rounded text-[10px] font-medium',
              overdue ? 'bg-danger-soft text-danger-strong' : dueToday ? 'bg-warning-soft text-warning-strong' : 'bg-surface-2 text-ink-2',
            )}
          >
            {overdue ? `逾期 ${item.days_overdue} 天` : dueToday ? '今天该采集' : `${-item.days_overdue} 天后`}
          </span>
          {item.record_count === 0 && (
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-info-soft text-info-strong">从未采集</span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-ink-2 truncate">{item.objective_title}</p>
        <p className="mt-0.5 text-[11px] text-ink-3 truncate">
          长期目标：{item.goal_title}
          {item.last_date ? ` · 上次 ${item.last_date}` : ''}
          {item.frequency ? ` · ${item.frequency}${item.frequency_defaulted ? '（未设定，按周排）' : ''}` : ''}
        </p>
      </div>
      {readonly ? (
        <Button
          variant="outline"
          className="h-11 lg:h-9 w-full sm:w-auto shrink-0 text-xs press"
          onClick={onOpen}
        >
          查看
          <ChevronRight className="w-3 h-3 ml-0.5" />
        </Button>
      ) : (
        <Button className="h-11 lg:h-9 w-full sm:w-auto shrink-0 press" onClick={onRecord}>
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

const RULE_TEXT: Record<string, string> = {
  A: '低于目标线',
  B: '增速不足',
  C: '数据已过期',
  D: '出现倒退',
  reached: '达到期末目标',
};

/**
 * 把后端算出的判据体，翻成教师当场能质证的一行话。
 *
 * 为什么必须上屏（评估报告第七节排序第 2 位）：
 *   progress_analysis 已经算出 evidence（用了几个点、窗口里几个低于目标线、
 *   增速比、距上次采集天数）与 rule_hit（命中哪条规则），但前端只取了
 *   judged_level 一个字符串。于是原则②「每个自动结论都可解释」
 *   **只在数据层兑现**——教师看到「建议调整干预」，不知道凭什么，
 *   既没法判断该不该信，也没法向家长解释，更不会据此改教学。
 *
 * 呈现原则：只显示后端真给出的字段；缺的就整项不显示，不补占位、不猜数值
 * （ADR-002）。
 */
function evidenceChips(item: AttentionItem): string[] {
  const ev = item.evidence ?? {};
  const out: string[] = [];

  if (typeof ev.points === 'number') {
    out.push(`${ev.points} 个数据点`);
  }
  if (
    typeof ev.below_count === 'number' &&
    typeof ev.below_window === 'number' &&
    ev.below_window > 0
  ) {
    out.push(`近 ${ev.below_window} 点中 ${ev.below_count} 个低于目标线`);
  }
  if (ev.trend_ratio !== null && ev.trend_ratio !== undefined) {
    const pct = Math.round(ev.trend_ratio * 100);
    out.push(ev.trend_ratio < 0 ? `方向与所需相反（${pct}%）` : `增速为所需速度的 ${pct}%`);
  }
  if (typeof ev.days_since_last === 'number') {
    const exp =
      ev.expected_days !== null && ev.expected_days !== undefined
        ? `，设定约每 ${Math.round(ev.expected_days)} 天一次`
        : '';
    out.push(`距上次采集 ${ev.days_since_last} 天${exp}`);
  }

  const raw = ev.rule_hit;
  const hits = Array.isArray(raw) ? raw : raw ? [raw] : [];
  if (hits.length > 0) {
    out.push('命中规则：' + hits.map((h) => RULE_TEXT[h] ?? h).join('、'));
  }

  return out;
}

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
  const chips = evidenceChips(item);
  return (
    <div className="py-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-ink">{item.student_name}</span>
            <span className={cn('px-1.5 py-0.5 rounded-full text-[10px] font-medium', m.bg, m.text)}>
              {item.level_text}
            </span>
            {item.points > 0 && (
              <span className="text-[10px] text-ink-3">{item.points} 个数据点</span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-ink-2 truncate">{item.goal_title}</p>
        </div>
        {/* 两个操作在手机上等分整行（各 44px 高），桌面上回到紧凑尺寸 */}
        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            variant="outline"
            className="h-11 lg:h-8 flex-1 sm:flex-none text-xs press"
            onClick={onOpen}
          >
            目标详情
            <ChevronRight className="w-3 h-3 ml-0.5" />
          </Button>
          {!readonly && (
            <Button
              variant="outline"
              className="h-11 lg:h-8 flex-1 sm:flex-none text-xs press"
              onClick={onAdjust}
            >
              <Edit3 className="w-3 h-3 mr-1" />
              登记调整
            </Button>
          )}
        </div>
      </div>

      <ul className="mt-2 space-y-0.5">
        {item.reasons.slice(0, 2).map((r, i) => (
          <li key={i} className="text-[11px] text-ink-2 leading-relaxed">
            · {r}
          </li>
        ))}
      </ul>

      {chips.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {chips.map((c, i) => (
            <span
              key={i}
              className="px-1.5 py-0.5 rounded text-[10px] bg-surface-2 text-ink-3 border border-line"
            >
              {c}
            </span>
          ))}
        </div>
      )}

      {item.suggestions.length > 0 && (
        <div className="mt-2 flex items-start gap-1.5 bg-surface-3 rounded-md px-2.5 py-2">
          <Sparkles className="w-3 h-3 text-ink-3 mt-0.5 shrink-0" />
          <p className="text-[11px] text-ink-2 leading-relaxed">
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
      className="w-full flex items-center gap-3 py-2.5 text-left hover:bg-surface-3 -mx-1 px-1 rounded cursor-pointer"
    >
      <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0', k.bg, k.text)}>
        {k.label}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-ink truncate">
          {item.student_name} · {item.title}
        </p>
        <p
          className={cn(
            'text-[11px] truncate',
            item.severity === 'overdue' ? 'text-danger-strong' : 'text-ink-2',
          )}
        >
          {item.text}
        </p>
      </div>
      <ChevronRight className="w-3.5 h-3.5 text-ink-4 shrink-0" />
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
  // 教师勾选「我采纳了这几条系统建议」——这是北极星指标（教师每周因系统数据
  // 而改变教学决策的次数）在系统内唯一的可计数事件。此前系统只把建议当文本
  // 展示，教师照做也无痕迹，回路是断的。
  const [picked, setPicked] = useState<string[]>([]);
  const [due, setDue] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().slice(0, 10);
  });
  const [saving, setSaving] = useState(false);

  // 本弹层是条件渲染（挂载=打开），走统一的焦点三件套：打开移入 / Tab 圈禁 /
  // 关闭归还。此前它是裸 div，键盘用户 Tab 会直接穿到页面背景里（ADR-052）。
  const panelRef = useRef<HTMLDivElement>(null);
  useDialogFocus(true, panelRef);
  useDrawerA11y(true, onClose);

  const togglePick = (sid: string, sugType: string) => {
    const willAdd = !picked.includes(sid);
    setPicked((prev) => (prev.includes(sid) ? prev.filter((x) => x !== sid) : [...prev, sid]));
    // 联动「调整类型」：建议的 type 与调整类型共用一套枚举（dosage/prompt_level/…）。
    // 仅当用户还没手动选过（仍是默认 other）时才自动带入，避免覆盖其判断。
    if (willAdd && type === 'other' && sugType in CHANGE_TYPE_LABEL) {
      setType(sugType);
    }
  };

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
        suggestion_ids: picked,
      });
      toast.success(
        picked.length > 0
          ? `已登记干预调整（采纳 ${picked.length} 条系统建议），到期会提醒复核效果`
          : '已登记干预调整（团队自行决定），到期会提醒复核效果',
      );
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-overlay/40 p-0 sm:p-4">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-adjust-title"
        className="w-full sm:max-w-[520px] bg-surface rounded-t-2xl sm:rounded-2xl shadow-xl"
      >
        <div className="px-5 py-4 border-b border-line">
          <h3 id="quick-adjust-title" className="text-base font-semibold text-ink">
            登记干预调整
          </h3>
          <p className="mt-0.5 text-xs text-ink-2 truncate">
            {item.student_name} · {item.goal_title}
          </p>
        </div>

        <div className="px-5 py-4">
          <div className="rounded-lg bg-surface-3 border border-line p-3 mb-4">
            <p className="text-[11px] font-medium text-ink-2 mb-1">系统给出的判断依据</p>
            <ul className="space-y-0.5">
              {item.reasons.map((r, i) => (
                <li key={i} className="text-[11px] text-ink-2 leading-relaxed">· {r}</li>
              ))}
            </ul>
          </div>

          {item.suggestions.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-medium text-ink-2 mb-1.5">
                是否采纳了系统的候选方向？（可多选，也可不选）
              </p>
              <div className="rounded-lg border border-line divide-y divide-line">
                {item.suggestions.map((s) => {
                  const sid = s.id ?? `${item.level}:${s.type}`;
                  const on = picked.includes(sid);
                  return (
                    <label
                      key={sid}
                      className={cn(
                        'flex items-start gap-2.5 px-2.5 py-2.5 min-h-[44px] cursor-pointer',
                        'text-[11px] leading-relaxed press',
                        on ? 'bg-brand-soft text-ink' : 'text-ink-2 hover:bg-surface-3',
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => togglePick(sid, s.type)}
                        className="mt-0.5 h-4 w-4 shrink-0 accent-brand"
                      />
                      <span>{s.text}</span>
                    </label>
                  );
                })}
              </div>
              <p className="mt-1.5 text-[11px] text-ink-3">
                一条都不选 = 团队自行决定。这也是有用信息：说明系统给的方向不贴合实际，我们会据此改进规则。
              </p>
            </div>
          )}

          <p className="text-xs font-medium text-ink-2 mb-1.5">调整类型</p>
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

          <p className="text-xs font-medium text-ink-2 mb-1.5">具体改了什么（必填）</p>
          <Textarea
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            rows={3}
            placeholder="例：把「独立穿脱外套」拆成 5 步任务分析，先练第 3 步「拉拉链」；每节课试次从 5 次增加到 8 次"
            className="text-xs"
          />

          <p className="text-xs font-medium text-ink-2 mt-3 mb-1.5">再监控到期日</p>
          <input
            type="date"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            className="h-9 px-3 rounded-md border border-line text-xs text-ink"
          />
          <p className="mt-1.5 text-[11px] text-ink-3">
            到期后会出现在「临期事项」，提醒你回头看这次调整到底有没有用。
          </p>
        </div>

        <div className="px-5 py-4 border-t border-line flex items-center justify-end gap-2">
          <Button variant="outline" className="h-9" onClick={onClose}>取消</Button>
          <Button className="h-9" onClick={save} disabled={saving}>
            {saving ? '保存中…' : '保存'}
          </Button>
        </div>
      </div>
    </div>
  );
}
