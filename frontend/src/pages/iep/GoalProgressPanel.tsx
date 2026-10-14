import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  ChevronDown,
  CheckCircle2,
  Edit3,
  Info,
  Lightbulb,
  Plus,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  CHANGE_TYPE_LABEL,
  DECISION_META,
  OUTCOME_LABEL,
  deleteAdjustment,
  saveAdjustment,
} from '@/services/iep';
import type { ConsistencyCheck, DecisionLevel, GoalAnalysis, ProgressPoint } from '@/services/iep';
import { PROMPT_LEVEL_LABEL, PROMPT_LEVEL_ORDER } from '@/services/iep';

/* ============================================================
 * 说明：本组件取代原先「一条硬编码 y=80 的水平线 + 空趋势图」。
 *
 * 三条线的含义（均与后端 progress_analysis.php 同源，前端不另算一套）：
 *   实测线   —— 逐次采集的数据点（优先离散试次达成率，其次 0-5 评级折算）
 *   目标线   —— aim line：从该目标的基线连到它自己的期末目标，是一条斜线
 *   趋势线   —— 最近 4 个数据点的最小二乘拟合，用来看「实际增速」够不够
 * 另用竖直虚线标出干预调整发生的日期（NCII 明文要求在图上标出调整位置）。
 * ============================================================ */

interface GoalProgressPanelProps {
  planId: string | number;
  analysis: GoalAnalysis;
  /** 当前用户能否为该目标录入干预调整 */
  editable: boolean;
  onChanged: () => void;
  /** 备用录入路径：0-5 主观评级（首选应是短期目标页的试次记录） */
  onRecordProgress?: () => void;
}

const TRIGGER_LABEL: Record<string, string> = {
  below_aimline: '连续低于目标线',
  plateau: '进入平台期',
  regression: '出现倒退',
  mastered: '已达成待提升',
  parent_request: '家长提出',
  team_decision: '团队会议决定',
  other: '其他',
};

/** 线性插值求目标线在任意日期的取值 */
function aimAt(analysis: GoalAnalysis, date: string): number | null {
  const aim = analysis.aim;
  if (!aim?.valid || !aim.start_date || !aim.end_date) return null;
  const t0 = Date.parse(aim.start_date);
  const t1 = Date.parse(aim.end_date);
  const t = Date.parse(date);
  if (Number.isNaN(t0) || Number.isNaN(t1) || Number.isNaN(t)) return null;
  const v0 = aim.start_value ?? 0;
  const v1 = aim.end_value ?? 0;
  if (t1 === t0) return v1;
  if (t <= t0) return v0;
  if (t >= t1) return v1;
  return v0 + ((t - t0) / (t1 - t0)) * (v1 - v0);
}

function trendAt(analysis: GoalAnalysis, date: string): number | null {
  const tr = analysis.trend;
  if (!tr) return null;
  const t0 = Date.parse(tr.start_date);
  const t1 = Date.parse(tr.end_date);
  const t = Date.parse(date);
  if (Number.isNaN(t) || Number.isNaN(t0) || Number.isNaN(t1)) return null;
  if (t < t0 || t > t1) return null;
  if (t1 === t0) return tr.end_value;
  return tr.start_value + ((t - t0) / (t1 - t0)) * (tr.end_value - tr.start_value);
}

interface Row {
  date: string;
  value: number | null;
  raw?: string;
  prompt?: string | null;
  aim: number | null;
  trend: number | null;
}

export default function GoalProgressPanel({
  planId,
  analysis,
  editable,
  onChanged,
  onRecordProgress,
}: GoalProgressPanelProps) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    adjusted_at: new Date().toISOString().slice(0, 10),
    trigger_type: 'below_aimline',
    change_type: 'prompt_level',
    change_detail: '',
    hypothesis: '',
    review_due_date: '',
  });

  const meta = DECISION_META[analysis.decision.level] ?? DECISION_META.nodata;

  // ---- 图表数据：把实测点、目标线端点、调整日期合并成同一组 X 轴刻度 ----
  const rows = useMemo<Row[]>(() => {
    const byDate = new Map<string, ProgressPoint>();
    (analysis.points ?? []).forEach((p) => {
      byDate.set(p.date, p);
    });

    const dates = new Set<string>(byDate.keys());
    if (analysis.aim?.valid) {
      if (analysis.aim.start_date) dates.add(analysis.aim.start_date);
      if (analysis.aim.end_date) dates.add(analysis.aim.end_date);
    }
    (analysis.adjustments ?? []).forEach((a) => dates.add(a.date));

    return [...dates]
      .sort((a, b) => a.localeCompare(b))
      .map((date) => {
        const p = byDate.get(date);
        return {
          date,
          value: p ? p.value : null,
          raw: p?.raw,
          prompt: p?.prompt_level,
          aim: aimAt(analysis, date),
          trend: trendAt(analysis, date),
        };
      });
  }, [analysis]);

  const sourceLabel =
    analysis.series?.source === 'objective_trial' ? '离散试次达成率' : '0-5 评级折算';

  // 判定层级：不同辅助层级下的成功率不是一个含义，必须让用户知道结论基于哪一级
  const judgedLevel = analysis.series?.judged_level ?? analysis.decision.evidence?.judged_level ?? null;
  const judgedLevelLabel = judgedLevel ? (PROMPT_LEVEL_LABEL[judgedLevel] ?? judgedLevel) : null;
  const isDecrease = analysis.direction === 'decrease';

  const submit = useCallback(async () => {
    if (!form.change_detail.trim()) {
      toast.error('请写清「具体改了什么」，这是后续复盘的依据');
      return;
    }
    setSaving(true);
    try {
      await saveAdjustment({
        plan_id: Number(planId),
        goal_id: analysis.goal_id,
        adjusted_at: form.adjusted_at,
        trigger_type: form.trigger_type,
        change_type: form.change_type,
        change_detail: form.change_detail,
        hypothesis: form.hypothesis || undefined,
        review_due_date: form.review_due_date || undefined,
      });
      toast.success('已记录干预调整');
      setForm((f) => ({ ...f, change_detail: '', hypothesis: '', review_due_date: '' }));
      setOpen(false);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }, [form, planId, analysis.goal_id, onChanged]);

  const remove = useCallback(
    async (id: number) => {
      try {
        await deleteAdjustment(id);
        toast.success('已删除');
        onChanged();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : '删除失败');
      }
    },
    [onChanged],
  );

  return (
    <div className="border border-line rounded-lg p-4 space-y-3">
      {/* 头部：决策结论 */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-ink truncate">{analysis.title}</span>
            <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', meta.bg, meta.text)}>
              {meta.label}
            </span>
          </div>
          <p className="mt-0.5 text-[11px] text-ink-3">
            数据来源：{sourceLabel}　共 {analysis.points?.length ?? 0} 个数据点
            {judgedLevelLabel && `　判定层级：${judgedLevelLabel}`}
            {isDecrease && '　本目标越低越好（如发生率）'}
          </p>
        </div>
        {editable && (
          <div className="flex items-center gap-2">
            {onRecordProgress && (
              <button
                onClick={onRecordProgress}
                title="首选路径：在「短期目标」页记录离散试次（成功数/试次数）。此处为无短期目标时的备用录入，0-5 主观评级，精度较低"
                className="shrink-0 flex items-center gap-1 h-7 px-2.5 rounded-md border border-line-2 text-xs text-ink-2 hover:bg-canvas cursor-pointer"
              >
                <Edit3 className="w-3 h-3" />
                录入评级（备用）
              </button>
            )}
            <button
              onClick={() => setOpen((v) => !v)}
              className="shrink-0 flex items-center gap-1 h-7 px-2.5 rounded-md border border-line-2 text-xs text-ink-2 hover:bg-canvas cursor-pointer"
            >
              <Plus className="w-3 h-3" />
              记录干预调整
              <ChevronDown className={cn('w-3 h-3 transition-transform', open && 'rotate-180')} />
            </button>
          </div>
        )}
      </div>

      {/* 目标线不可用：明确告知原因，而不是画一条假线 */}
      {!analysis.aim?.valid ? (
        <div className="flex items-start gap-2 bg-warning-soft border border-warning-soft rounded-md p-3">
          <Info className="w-4 h-4 text-warning-strong mt-0.5 shrink-0" />
          <p className="text-xs text-warning-strong">{analysis.aim?.reason ?? '暂无法计算目标线'}</p>
        </div>
      ) : (
        <p className="text-[11px] text-ink-2">
          目标线：{analysis.aim.start_value}% ({analysis.aim.start_date}) → {analysis.aim.end_value}% (
          {analysis.aim.end_date})
          <span className="ml-1 text-ink-3">
            · 目标值取自{analysis.aim.source?.target_scale === 'objectives_mastery_avg' ? '短期目标掌握阈值' : '目标设定'}
          </span>
        </p>
      )}

      {/* 图表 */}
      {rows.length === 0 ? (
        <div className="h-[200px] flex flex-col items-center justify-center gap-2">
          <TrendingUp className="w-8 h-8 text-ink-4" />
          <p className="text-xs text-ink-2">暂无进度数据</p>
        </div>
      ) : (
        <div className="h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={rows} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--surface-2))" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: 'rgb(var(--ink-3))' }}
                tickLine={false}
                axisLine={{ stroke: 'rgb(var(--line))' }}
                tickFormatter={(v: string) => (v ? v.slice(5) : '')}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 10, fill: 'rgb(var(--ink-3))' }}
                tickLine={false}
                axisLine={{ stroke: 'rgb(var(--line))' }}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const row = payload[0].payload as Row;
                  return (
                    <div className="bg-surface border border-line rounded-lg px-3 py-2 shadow-sm text-xs">
                      <p className="text-ink-3">{label}</p>
                      {row.value !== null && (
                        <p className="font-semibold text-brand-ink">
                          实测 {Math.round(row.value)}%{row.raw ? `（${row.raw}）` : ''}
                        </p>
                      )}
                      {row.aim !== null && (
                        <p className="text-success-strong">目标线 {Math.round(row.aim)}%</p>
                      )}
                      {row.trend !== null && (
                        <p className="text-violet">趋势线 {Math.round(row.trend)}%</p>
                      )}
                      {row.prompt && <p className="text-ink-2">辅助：{row.prompt}</p>}
                    </div>
                  );
                }}
              />
              {analysis.aim?.valid && (
                <Line
                  type="linear"
                  dataKey="aim"
                  stroke="rgb(var(--success-strong))"
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
              )}
              {analysis.trend && (
                <Line
                  type="linear"
                  dataKey="trend"
                  stroke="rgb(var(--violet))"
                  strokeWidth={1.5}
                  strokeDasharray="2 3"
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
              )}
              <Line
                type="monotone"
                dataKey="value"
                stroke="rgb(var(--brand))"
                strokeWidth={2.5}
                dot={{ r: 3, fill: 'rgb(var(--brand))', stroke: '#fff', strokeWidth: 1.5 }}
                connectNulls
                isAnimationActive={false}
              />
              {(analysis.adjustments ?? []).map((a, i) => (
                <ReferenceLine
                  key={a.id}
                  x={a.date}
                  stroke="rgb(var(--warning))"
                  strokeDasharray="3 3"
                  strokeWidth={1.5}
                  label={i === 0 ? { value: '干预调整', position: 'insideTopRight', fill: 'rgb(var(--warning-strong))', fontSize: 10 } : undefined}
                />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 图例 */}
      <div className="flex items-center gap-4 text-[11px] text-ink-2">
        <span className="flex items-center gap-1">
          <span className="w-4 h-0.5 bg-brand" />实测
        </span>
        <span className="flex items-center gap-1">
          <span className="w-4 h-0.5 bg-success-strong" />目标线（aim line）
        </span>
        {analysis.trend && (
          <span className="flex items-center gap-1">
            <span className="w-4 h-0.5 bg-violet" />趋势线
          </span>
        )}
        {(analysis.adjustments ?? []).length > 0 && (
          <span className="flex items-center gap-1">
            <span className="w-4 h-0.5 bg-warning" />干预调整
          </span>
        )}
      </div>

      {/* 撤提示进展：各辅助层级各自的达成率（后端已按层级分组，禁止混算） */}
      <PromptFadePanel analysis={analysis} />

      {/* 决策依据 */}
      <div
        className={cn(
          'rounded-md p-3 border',
          analysis.decision.level === 'adjust'
            ? 'bg-danger-soft border-danger-line'
            : analysis.decision.level === 'watch'
              ? 'bg-warning-soft border-warning-soft'
              : 'bg-surface-3 border-line',
        )}
      >
        <div className="flex items-center gap-1.5 mb-1">
          {analysis.decision.level === 'adjust' ? (
            <AlertTriangle className="w-3.5 h-3.5 text-danger-strong" />
          ) : (
            <CheckCircle2 className="w-3.5 h-3.5 text-ink-2" />
          )}
          <span className="text-xs font-semibold text-ink">判断依据</span>
        </div>
        <ul className="space-y-0.5">
          {analysis.decision.reasons.map((r, i) => (
            <li key={i} className="text-xs text-ink-2 flex gap-1.5">
              <span className="text-ink-3">·</span>
              <span>{r}</span>
            </li>
          ))}
        </ul>
        {analysis.decision.suggestions?.length > 0 && (
          <div className="mt-2 pt-2 border-t border-line/5">
            <div className="flex items-center gap-1.5 mb-1">
              <Lightbulb className="w-3.5 h-3.5 text-warning-strong" />
              <span className="text-xs font-semibold text-ink">可考虑的调整方向（由 IEP 团队判断）</span>
            </div>
            <ul className="space-y-0.5">
              {analysis.decision.suggestions.map((s, i) => (
                <li key={i} className="text-xs text-ink-2 flex gap-1.5">
                  <span className="text-ink-3">·</span>
                  <span>{s.text}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* 干预调整记录 */}
      {(analysis.adjustments ?? []).length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-ink">干预调整留痕</p>
          {analysis.adjustments.map((a) => (
            <div key={a.id} className="flex items-start justify-between gap-2 bg-brand-soft rounded-md p-2.5 border border-brand-line">
              <div className="min-w-0">
                <p className="text-[11px] text-ink-3">
                  {a.date}　{CHANGE_TYPE_LABEL[a.change_type] ?? a.change_type}
                  <span className="ml-1 px-1.5 py-0.5 rounded bg-surface border border-line">
                    {OUTCOME_LABEL[a.outcome] ?? a.outcome}
                  </span>
                  {a.review_due_date && <span className="ml-1">· 再监控 {a.review_due_date}</span>}
                </p>
                <p className="text-xs text-ink-2 mt-0.5">{a.change_detail}</p>
                {a.hypothesis && (
                  <p className="text-[11px] text-ink-2 mt-0.5">假设：{a.hypothesis}</p>
                )}
              </div>
              {editable && (
                <button
                  onClick={() => remove(a.id)}
                  className="shrink-0 p-1 text-ink-3 hover:text-danger-strong cursor-pointer"
                  aria-label="删除"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 录入表单 */}
      {open && editable && (
        <div className="space-y-2 bg-surface border border-line rounded-md p-3">
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[11px] text-ink-2">调整日期</label>
              <input
                type="date"
                value={form.adjusted_at}
                onChange={(e) => setForm((f) => ({ ...f, adjusted_at: e.target.value }))}
                className="w-full h-8 mt-0.5 px-2 rounded-md border border-line-2 text-xs"
              />
            </div>
            <div>
              <label className="text-[11px] text-ink-2">触发原因</label>
              <Select
                value={form.trigger_type}
                onValueChange={(v) => setForm((f) => ({ ...f, trigger_type: v }))}
              >
                <SelectTrigger className="h-8 mt-0.5 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TRIGGER_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={k} className="text-xs">
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[11px] text-ink-2">调整维度</label>
              <Select
                value={form.change_type}
                onValueChange={(v) => setForm((f) => ({ ...f, change_type: v }))}
              >
                <SelectTrigger className="h-8 mt-0.5 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CHANGE_TYPE_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={k} className="text-xs">
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <label className="text-[11px] text-ink-2">
              具体改了什么 <span className="text-danger-strong">*</span>
              <span className="text-ink-3">（建议一次只改少量变量，便于判断哪一项起了作用）</span>
            </label>
            <Textarea
              value={form.change_detail}
              onChange={(e) => setForm((f) => ({ ...f, change_detail: e.target.value }))}
              rows={2}
              className="mt-0.5 text-xs"
              placeholder="例：由手势提示退回「示范+手势」双提示，连续 3 次正确后再撤一层"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] text-ink-2">对「为何无效」的假设（选填）</label>
              <Textarea
                value={form.hypothesis}
                onChange={(e) => setForm((f) => ({ ...f, hypothesis: e.target.value }))}
                rows={2}
                className="mt-0.5 text-xs"
                placeholder="例：辅助撤除过快，学生在手势提示下不稳定"
              />
            </div>
            <div>
              <label className="text-[11px] text-ink-2">再监控到期日（选填）</label>
              <input
                type="date"
                value={form.review_due_date}
                onChange={(e) => setForm((f) => ({ ...f, review_due_date: e.target.value }))}
                className="w-full h-8 mt-0.5 px-2 rounded-md border border-line-2 text-xs"
              />
              <p className="mt-1 text-[10px] text-ink-3">
                建议在调整后再采集至少 4 个数据点再下结论
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button
              onClick={() => setOpen(false)}
              className="h-8 px-3 rounded-md border border-line-2 text-xs text-ink-2 hover:bg-surface cursor-pointer"
            >
              取消
            </button>
            <button
              onClick={submit}
              disabled={saving}
              className="h-8 px-3 rounded-md bg-brand text-ink-on-dark text-xs font-medium hover:bg-brand-strong disabled:opacity-60 cursor-pointer"
            >
              {saving ? '保存中…' : '保存'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================
 * 计划级决策概览：按决策等级汇总各目标数量
 * ============================================================ */

/**
 * 撤提示进展（ADR-010 / ADR-022）
 *
 * 不同辅助层级下的「成功」不是一个含义：肢体辅助下 80% 与独立完成 80%
 * 是天差地别的两件事。因此序列必须按层级分组展示——
 * 把它们 SUM 成一条混合线，会把「撤掉全部辅助」的巨大进步算成退步。
 *
 * 判定用的是「达标判定层级」（默认 independent）那条序列，其余层级并列展示为证据。
 */
export function PromptFadePanel({ analysis }: { analysis: GoalAnalysis }) {
  const byLevel = analysis.by_level ?? {};
  const hasLevel = (k: string) => (byLevel[k] ?? []).length > 0;
  const ordered = [
    ...PROMPT_LEVEL_ORDER.filter(hasLevel),
    ...Object.keys(byLevel).filter((k) => !(PROMPT_LEVEL_ORDER as readonly string[]).includes(k) && hasLevel(k)),
  ];

  // 只有一个层级时不存在「撤提示」可言，展示无意义
  if (ordered.length < 2) return null;

  const judged = analysis.series?.judged_level ?? analysis.decision.evidence?.judged_level ?? null;
  const faded = analysis.series?.judged_level_faded === true;
  const target = analysis.series?.target_level ?? null;
  const fewer = analysis.direction === 'decrease';

  const statOf = (pts: ProgressPoint[]) => {
    const n = pts.length;
    const avg = n > 0 ? pts.reduce((s, p) => s + p.value, 0) / n : 0;
    return { n, avg, first: pts[0]?.date ?? '', last: pts[n - 1]?.date ?? '' };
  };

  const head = statOf(byLevel[ordered[0]] ?? []);
  const tail = statOf(byLevel[ordered[ordered.length - 1]] ?? []);
  // 递增型目标：撤提示后达成率不降反升即为有效；递减型（发生率）反之
  const delta = tail.avg - head.avg;
  const effective = fewer ? delta <= 0.5 : delta >= -0.5;

  return (
    <div className="rounded-md p-3 border border-line bg-surface-3 space-y-2">
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-semibold text-ink">撤提示进展</span>
        <span className="text-[11px] text-ink-3">
          辅助由多到少，达成率{ fewer ? '下降' : '不降' }即为撤提示有效
        </span>
      </div>

      <div className="space-y-1.5">
        {ordered.map((lv) => {
          const s = statOf(byLevel[lv] ?? []);
          const isJudged = lv === judged;
          return (
            <div key={lv} className="flex items-center gap-2">
              <span
                className={cn(
                  'w-16 shrink-0 text-[11px]',
                  isJudged ? 'font-semibold text-ink' : 'text-ink-2',
                )}
              >
                {PROMPT_LEVEL_LABEL[lv] ?? lv}
              </span>
              <div className="flex-1 h-4 bg-surface-2 rounded overflow-hidden">
                <div
                  className={cn('h-full rounded', isJudged ? 'bg-brand' : 'bg-surface-2')}
                  style={{ width: `${Math.max(2, Math.min(100, s.avg))}%` }}
                />
              </div>
              <span className="w-11 shrink-0 text-right text-[11px] tabular-nums text-ink-2">
                {Math.round(s.avg)}%
              </span>
              <span className="w-24 shrink-0 text-right text-[10px] text-ink-3 tabular-nums">
                {s.first.slice(5)}~{s.last.slice(5)}
              </span>
              {isJudged && (
                <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] bg-brand/10 text-brand-ink">
                  判定依据
                </span>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-[11px] text-ink-2">
        {ordered[0] === ordered[ordered.length - 1]
          ? null
          : `${PROMPT_LEVEL_LABEL[ordered[0]] ?? ordered[0]} ${Math.round(head.avg)}% → ${
              PROMPT_LEVEL_LABEL[ordered[ordered.length - 1]] ?? ordered[ordered.length - 1]
            } ${Math.round(tail.avg)}%（${delta >= 0 ? '+' : ''}${Math.round(delta)} 个百分点），`}
        {effective
          ? fewer
            ? '发生率随辅助撤除同步下降，撤提示有效'
            : '辅助减少的同时达成率未下滑，撤提示有效'
          : fewer
            ? '辅助撤除后发生率反而上升，需复核撤提示节奏'
            : '辅助减少后达成率下滑，需复核撤提示节奏'}
      </p>

      {faded && (
        <div className="flex items-start gap-2 bg-warning-soft border border-warning-soft rounded-md p-2">
          <Info className="w-3.5 h-3.5 text-warning-strong mt-0.5 shrink-0" />
          <p className="text-[11px] text-warning-strong">
            判定层级（{PROMPT_LEVEL_LABEL[target ?? ''] ?? target ?? '未指定'}）暂无足够数据，
            已回退到「{PROMPT_LEVEL_LABEL[judged ?? ''] ?? judged ?? '—'}」层级判定，结论需谨慎。
          </p>
        </div>
      )}
    </div>
  );
}

export function DecisionSummary({ summary }: { summary: Partial<Record<DecisionLevel, number>> }) {
  // 补 regression：概览漏掉倒退计数时，教师看到的是「本计划没有倒退目标」，
  // 与后端判定不符（后端 regression 严重度最高）。
  const order: DecisionLevel[] = ['regression', 'adjust', 'watch', 'stale', 'nodata', 'on_track', 'mastered'];
  const total = order.reduce((s, k) => s + (summary[k] ?? 0), 0);
  if (total === 0) return null;

  return (
    <div className="border border-line rounded-lg p-4">
      <p className="text-sm font-semibold text-ink mb-3">本计划目标进展概览</p>
      <div className="flex flex-wrap gap-2">
        {order.map((k) => {
          const n = summary[k] ?? 0;
          if (n === 0) return null;
          const m = DECISION_META[k];
          return (
            <div
              key={k}
              className={cn('flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium', m.bg, m.text)}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: m.dot }} />
              {m.label}
              <span className="font-semibold">{n}</span>
            </div>
          );
        })}
      </div>
      {(summary.adjust ?? 0) > 0 && (
        <p className="mt-3 text-xs text-danger-strong">
          有 {summary.adjust} 个目标的数据提示当前教学方案效果不足，建议按下方判断依据组织团队讨论并调整干预，
          调整后再采集至少 4 个数据点验证效果。
        </p>
      )}
    </div>
  );
}

/* ============================================================
 * 提交前自检：把 IEP 质量量规直接摆在老师面前，而不是等到点「提交审核」
 * 才弹一条错误提示。error 级问题会真的阻断提交。
 * ============================================================ */

export function ConsistencyPanel({ check, loading }: { check: ConsistencyCheck | null; loading: boolean }) {
  const [expanded, setExpanded] = useState(false);
  if (loading || !check) return null;

  const clean = check.error_count === 0 && check.warn_count === 0;
  const tone = check.error_count > 0
    ? 'border-danger-line bg-danger-soft'
    : check.warn_count > 0
      ? 'border-warning-soft bg-warning-soft'
      : 'border-success-soft bg-success-soft';
  const warnText = check.warn_count > 0 ? '　' + String(check.warn_count) + ' 项建议完善' : '';

  return (
    <div className={cn('border rounded-lg p-4', tone)}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {clean ? (
            <CheckCircle2 className="w-4 h-4 text-success-strong shrink-0" />
          ) : (
            <AlertTriangle
              className={cn('w-4 h-4 shrink-0', check.error_count > 0 ? 'text-danger-strong' : 'text-warning-strong')}
            />
          )}
          <span className="text-sm font-semibold text-ink">提交前自检</span>
          <span className="text-xs text-ink-2">
            {clean ? '未发现问题' : String(check.error_count) + ' 项必须处理' + warnText}
          </span>
        </div>
        {!clean && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="shrink-0 flex items-center gap-1 h-7 px-2.5 rounded-md border border-line-2 text-xs text-ink-2 hover:bg-surface cursor-pointer"
          >
            {expanded ? '收起' : '查看详情'}
            <ChevronDown className={cn('w-3 h-3 transition-transform', expanded && 'rotate-180')} />
          </button>
        )}
      </div>

      {expanded && (
        <ul className="mt-3 space-y-2">
          {check.issues.map((i, idx) => (
            <li key={i.code + '-' + String(idx)} className="bg-surface/70 rounded-md p-2.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={cn(
                    'px-1.5 py-0.5 rounded text-[10px] font-medium',
                    i.level === 'error' ? 'bg-danger-soft text-danger-strong' : 'bg-warning-soft text-warning-strong',
                  )}
                >
                  {i.level === 'error' ? '必须处理' : '建议完善'}
                </span>
                <span className="text-xs font-semibold text-ink">{i.title}</span>
                <span className="text-[10px] text-ink-3">{i.code}</span>
              </div>
              <p className="mt-1 text-xs text-ink-2">{i.detail}</p>
              {i.ref?.samples && i.ref.samples.length > 0 && (
                <p className="mt-1 text-[11px] text-ink-3">
                  涉及目标：{i.ref.samples.join('、')}
                  {i.ref.count && i.ref.count > i.ref.samples.length ? ' 等 ' + String(i.ref.count) + ' 个' : ''}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
