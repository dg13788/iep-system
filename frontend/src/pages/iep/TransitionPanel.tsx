import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ClipboardList,
  GraduationCap,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  ON_TRACK_DOT,
  ON_TRACK_TEXT,
  deleteTransitionGoal,
  deleteTransitionService,
  fetchQuarterlyReport,
  fetchTransitionOverview,
  saveParentMeetingInput,
  saveTransitionGoal,
  saveTransitionService,
  type OnTrackLabel,
  type ParentMeetingInput,
  type TransitionGoal,
  type TransitionService,
} from '@/services/transition';

/**
 * 转衔与家长闭环（Step 4）
 *
 * 为什么必须做结构化，而不是在 transition_plan 里写一段话：
 *   - IDEA 要求转衔目标 measurable（可测量）。自由文本无法判断"有没有进展"，
 *     也就无法在年度复审时证明这项服务产生了效果。
 *   - 家长参与不能只留一个签名。安大略审计发现 38–95% 的档案没有家长咨询证据，
 *     那属于程序性违规，直接危及 FAPE。所以这里把"家长的意见"本身存成证据，
 *     并记录来源（家长端自助 / 教师代录 / 纸质 / 电话）—— 代录不等于代签，说清楚来源才站得住。
 */

interface TransitionPanelProps {
  planId: number | string;
  canEdit: boolean;
}

const CATEGORIES: TransitionGoal['category'][] = ['升学', '就业', '独立生活'];

const CAT_ICON: Record<string, typeof GraduationCap> = {
  升学: GraduationCap,
  就业: Building2,
  独立生活: Users,
};

export default function TransitionPanel({ planId, canEdit }: TransitionPanelProps) {
  const [loading, setLoading] = useState(true);
  const [goals, setGoals] = useState<TransitionGoal[]>([]);
  const [services, setServices] = useState<TransitionService[]>([]);
  const [inputs, setInputs] = useState<ParentMeetingInput[]>([]);
  const [sigCount, setSigCount] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await fetchTransitionOverview(planId);
      setGoals(d.goals ?? []);
      setServices(d.services ?? []);
      setInputs(d.parent_inputs ?? []);
      setSigCount((d.signatures ?? []).filter((s) => !s.is_revoked).length);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [planId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="h-32 flex items-center justify-center text-sm text-ink-3">
        <Loader2 className="w-4 h-4 animate-spin mr-2" />
        加载中…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* 程序合规提示 */}
      <div
        className={cn(
          'border rounded-lg p-3 flex items-start gap-2',
          inputs.length > 0 ? 'border-success-soft bg-success-soft' : 'border-warning-soft bg-warning-soft',
        )}
      >
        {inputs.length > 0 ? (
          <CheckCircle2 className="w-4 h-4 text-success-strong shrink-0 mt-0.5" />
        ) : (
          <AlertTriangle className="w-4 h-4 text-warning-strong shrink-0 mt-0.5" />
        )}
        <div className="text-[11px] leading-relaxed">
          <span className="font-medium text-ink">家长参与证据：</span>
          <span className="text-ink-2">
            {inputs.length > 0
              ? `已记录 ${inputs.length} 条家长意见、${sigCount} 份签名。`
              : '尚未记录家长意见。仅有签名不足以证明"会前征求过家长意见"，' +
                '建议在会议前完成下面的结构化征集。'}
          </span>
        </div>
      </div>

      <ParentInputSection planId={planId} canEdit={canEdit} inputs={inputs} onSaved={load} />
      <QuarterlyReportSection planId={planId} />
      <TransitionGoalSection
        planId={planId}
        canEdit={canEdit}
        goals={goals}
        onChanged={load}
      />
      <TransitionServiceSection
        planId={planId}
        canEdit={canEdit}
        services={services}
        onChanged={load}
      />
    </div>
  );
}

/* ---------------- 家长意见征集 ---------------- */

function ParentInputSection({
  planId,
  canEdit,
  inputs,
  onSaved,
}: {
  planId: number | string;
  canEdit: boolean;
  inputs: ParentMeetingInput[];
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState({
    parent_name: '', relation: '', strengths: '', concerns: '', expectations: '', support_at_home: '',
  });

  const submit = async () => {
    if (!f.strengths && !f.concerns && !f.expectations && !f.support_at_home) {
      toast.error('请至少填写一项内容');
      return;
    }
    setSaving(true);
    try {
      await saveParentMeetingInput({
        plan_id: planId,
        parent_name: f.parent_name || undefined,
        relation: f.relation || undefined,
        strengths: f.strengths || undefined,
        concerns: f.concerns || undefined,
        expectations: f.expectations || undefined,
        support_at_home: f.support_at_home || undefined,
      });
      setF({ parent_name: '', relation: '', strengths: '', concerns: '', expectations: '', support_at_home: '' });
      setOpen(false);
      onSaved();
      toast.success('家长意见已记录');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="border border-line rounded-lg">
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-line">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-ink-2" />
          <span className="text-sm font-semibold text-ink">家长意见征集</span>
          <span className="text-[11px] text-ink-3">{inputs.length} 条</span>
        </div>
        {canEdit && (
          <Button variant="outline" className="h-7 text-xs" onClick={() => setOpen((v) => !v)}>
            <Plus className="w-3 h-3 mr-1" />
            新增
          </Button>
        )}
      </div>

      {open && (
        <div className="px-4 py-3 border-b border-line space-y-2 bg-surface-3">
          <div className="grid grid-cols-2 gap-2">
            <input
              value={f.parent_name}
              onChange={(e) => setF({ ...f, parent_name: e.target.value })}
              placeholder="家长姓名"
              className="h-8 px-2 rounded-md border border-line-2 text-xs"
            />
            <input
              value={f.relation}
              onChange={(e) => setF({ ...f, relation: e.target.value })}
              placeholder="与学生关系（如 母亲）"
              className="h-8 px-2 rounded-md border border-line-2 text-xs"
            />
          </div>
          {[
            ['strengths', '家长眼中的孩子优势'],
            ['concerns', '家庭的关切与困难'],
            ['expectations', '对孩子的期望'],
            ['support_at_home', '家庭可提供的支持'],
          ].map(([k, label]) => (
            <div key={k}>
              <label className="text-[11px] text-ink-2">{label}</label>
              <Textarea
                rows={2}
                className="mt-1 text-xs"
                value={(f as Record<string, string>)[k]}
                onChange={(e) => setF({ ...f, [k]: e.target.value })}
              />
            </div>
          ))}
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-ink-3">
              代录时会如实标记为"教师代录"，不会伪装成家长自助提交
            </span>
            <Button className="h-7 text-xs" disabled={saving} onClick={() => void submit()}>
              {saving && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
              保存
            </Button>
          </div>
        </div>
      )}

      <div className="divide-y divide-line">
        {inputs.length === 0 ? (
          <p className="px-4 py-4 text-xs text-ink-3">暂无家长意见记录</p>
        ) : (
          inputs.map((it) => (
            <div key={it.id} className="px-4 py-3">
              <div className="flex items-center gap-2 flex-wrap mb-1.5">
                <span className="text-xs font-medium text-ink">
                  {it.parent_name || '未署名'}
                </span>
                {it.relation && <span className="text-[10px] text-ink-3">{it.relation}</span>}
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-surface-2 text-ink-2">
                  {SOURCE_TEXT[it.source] ?? it.source}
                </span>
                <span className="text-[10px] text-ink-3">
                  {String(it.submitted_at).slice(0, 10)}
                </span>
              </div>
              {[
                ['优势', it.strengths],
                ['关切', it.concerns],
                ['期望', it.expectations],
                ['家庭支持', it.support_at_home],
              ].map(([label, v]) =>
                v ? (
                  <p key={label as string} className="text-[11px] text-ink-2 leading-relaxed">
                    <span className="text-ink-3">{label}：</span>
                    {v}
                  </p>
                ) : null,
              )}
            </div>
          ))
        )}
      </div>
    </section>
  );
}

const SOURCE_TEXT: Record<string, string> = {
  parent_portal: '家长端提交',
  teacher_proxy: '教师代录',
  paper: '纸质回执',
  phone: '电话记录',
};

/* ---------------- 季度进度报告 ---------------- */

function QuarterlyReportSection({ planId }: { planId: number | string }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchQuarterlyReport>> | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await fetchQuarterlyReport(planId));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '生成失败');
    } finally {
      setLoading(false);
    }
  }, [planId]);

  useEffect(() => {
    if (open && !data && !loading) void load();
  }, [open, data, loading, load]);

  const order: OnTrackLabel[] = ['achieved', 'on_track', 'watch', 'behind', 'unknown'];

  return (
    <section className="border border-line rounded-lg">
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-line">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-ink-2" />
          <span className="text-sm font-semibold text-ink">季度进度报告</span>
          <span className="text-[11px] text-ink-3">基线 / 当前 / 目标 / 是否按预期</span>
        </div>
        <Button variant="outline" className="h-7 text-xs" onClick={() => setOpen((v) => !v)}>
          {open ? '收起' : '生成'}
        </Button>
      </div>

      {open && (
        <div className="px-4 py-3">
          {loading && (
            <div className="h-16 flex items-center justify-center text-xs text-ink-3">
              <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" />
              正在汇总…
            </div>
          )}
          {data && (
            <>
              <div className="flex flex-wrap gap-2 mb-3">
                {order.map((k) => {
                  const n = data.summary[k] ?? 0;
                  if (!n) return null;
                  return (
                    <span
                      key={k}
                      className="flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] bg-surface-3 border border-line"
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: ON_TRACK_DOT[k] }}
                      />
                      {ON_TRACK_TEXT[k]}
                      <b>{n}</b>
                    </span>
                  );
                })}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="text-ink-3 border-b border-line">
                      <th className="text-left py-1.5 font-normal">目标</th>
                      <th className="text-right py-1.5 font-normal">基线</th>
                      <th className="text-right py-1.5 font-normal">当前</th>
                      <th className="text-right py-1.5 font-normal">期末目标</th>
                      <th className="text-left py-1.5 pl-2 font-normal">是否按预期</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.goals.map((g) => (
                      <tr key={g.goal_id} className="border-b border-line">
                        <td className="py-1.5 text-ink">{g.title}</td>
                        <td className="py-1.5 text-right text-ink-2">
                          {g.baseline_value ?? '—'}
                        </td>
                        <td className="py-1.5 text-right text-ink-2">
                          {g.current_value ?? '—'}
                        </td>
                        <td className="py-1.5 text-right text-ink-2">
                          {g.target_value ?? '—'}
                        </td>
                        <td className="py-1.5 pl-2">
                          <span className="flex items-center gap-1.5">
                            <span
                              className="w-1.5 h-1.5 rounded-full shrink-0"
                              style={{ backgroundColor: ON_TRACK_DOT[g.on_track] }}
                            />
                            <span className="text-ink-2">{ON_TRACK_TEXT[g.on_track]}</span>
                            {g.data_points === 0 && (
                              <span className="text-ink-3">（无数据）</span>
                            )}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-[11px] text-ink-3">{data.note}</p>
            </>
          )}
        </div>
      )}
    </section>
  );
}

/* ---------------- 转衔目标 ---------------- */

function TransitionGoalSection({
  planId,
  canEdit,
  goals,
  onChanged,
}: {
  planId: number | string;
  canEdit: boolean;
  goals: TransitionGoal[];
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState<Partial<TransitionGoal> | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!editing) return;
    if (!editing.title?.trim()) {
      toast.error('请填写目标标题');
      return;
    }
    setSaving(true);
    try {
      await saveTransitionGoal(planId, editing);
      setEditing(null);
      onChanged();
      toast.success('转衔目标已保存');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: number) => {
    try {
      await deleteTransitionGoal(planId, id);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '删除失败');
    }
  };

  const byCat = useMemo(() => {
    const m: Record<string, TransitionGoal[]> = {};
    for (const c of CATEGORIES) m[c] = goals.filter((g) => g.category === c);
    return m;
  }, [goals]);

  return (
    <section className="border border-line rounded-lg">
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-line">
        <div className="flex items-center gap-2">
          <ClipboardList className="w-4 h-4 text-ink-2" />
          <span className="text-sm font-semibold text-ink">转衔目标</span>
          <span className="text-[11px] text-ink-3">须可测量（IDEA）</span>
        </div>
        {canEdit && (
          <Button
            variant="outline"
            className="h-7 text-xs"
            onClick={() => setEditing({ category: '升学', status: 'not_started' })}
          >
            <Plus className="w-3 h-3 mr-1" />
            新增
          </Button>
        )}
      </div>

      {editing && (
        <div className="px-4 py-3 border-b border-line bg-surface-3 space-y-2">
          <div className="grid grid-cols-3 gap-2">
            <select
              value={editing.category ?? '升学'}
              onChange={(e) => setEditing({ ...editing, category: e.target.value as TransitionGoal['category'] })}
              className="h-8 px-2 rounded-md border border-line-2 text-xs"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <input
              value={editing.title ?? ''}
              onChange={(e) => setEditing({ ...editing, title: e.target.value })}
              placeholder="目标标题"
              className="col-span-2 h-8 px-2 rounded-md border border-line-2 text-xs"
            />
          </div>
          <div className="grid grid-cols-4 gap-2">
            {[
              ['baseline_value', '当前水平 %'],
              ['target_value', '期末目标 %'],
              ['target_date', '达成期限'],
              ['responsible_id', '责任人 ID'],
            ].map(([k, label]) => (
              <div key={k}>
                <label className="text-[10px] text-ink-3">{label}</label>
                <input
                  type={k === 'target_date' ? 'date' : 'number'}
                  value={String((editing as Record<string, unknown>)[k] ?? '')}
                  onChange={(e) => setEditing({ ...editing, [k]: e.target.value })}
                  className="w-full h-8 px-2 rounded-md border border-line-2 text-xs"
                />
              </div>
            ))}
          </div>
          <Textarea
            rows={2}
            placeholder="达成标准（可测量，如：连续 3 次独立完成…）"
            value={editing.criteria ?? ''}
            onChange={(e) => setEditing({ ...editing, criteria: e.target.value })}
            className="text-xs"
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" className="h-7 text-xs" onClick={() => setEditing(null)}>
              取消
            </Button>
            <Button className="h-7 text-xs" disabled={saving} onClick={() => void submit()}>
              {saving && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
              保存
            </Button>
          </div>
        </div>
      )}

      <div className="divide-y divide-line">
        {goals.length === 0 ? (
          <p className="px-4 py-4 text-xs text-ink-3">
            暂无转衔目标。升学 / 就业 / 独立生活三个领域应各有可测量目标。
          </p>
        ) : (
          CATEGORIES.map((c) => {
            const Icon = CAT_ICON[c];
            const list = byCat[c];
            if (!list.length) return null;
            return (
              <div key={c} className="px-4 py-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <Icon className="w-3.5 h-3.5 text-ink-2" />
                  <span className="text-xs font-medium text-ink-2">{c}</span>
                </div>
                <div className="space-y-1.5">
                  {list.map((g) => (
                    <div key={g.id} className="flex items-center gap-2">
                      <span className="flex-1 text-xs text-ink truncate">{g.title}</span>
                      <span className="text-[10px] text-ink-2">
                        {g.baseline_value ?? '—'} → {g.target_value ?? '—'}
                        {g.target_date ? ` · ${g.target_date}` : ''}
                      </span>
                      {canEdit && (
                        <button
                          onClick={() => void remove(g.id)}
                          className="shrink-0 w-6 h-6 flex items-center justify-center rounded hover:bg-danger-soft cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3 text-ink-3" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

/* ---------------- 转衔服务 ---------------- */

function TransitionServiceSection({
  planId,
  canEdit,
  services,
  onChanged,
}: {
  planId: number | string;
  canEdit: boolean;
  services: TransitionService[];
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState<Partial<TransitionService> | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!editing?.service_name?.trim()) {
      toast.error('请填写服务名称');
      return;
    }
    setSaving(true);
    try {
      await saveTransitionService(planId, editing);
      setEditing(null);
      onChanged();
      toast.success('转衔服务已保存');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="border border-line rounded-lg">
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-line">
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-ink-2" />
          <span className="text-sm font-semibold text-ink">转衔服务</span>
        </div>
        {canEdit && (
          <Button variant="outline" className="h-7 text-xs" onClick={() => setEditing({})}>
            <Plus className="w-3 h-3 mr-1" />
            新增
          </Button>
        )}
      </div>

      {editing && (
        <div className="px-4 py-3 border-b border-line bg-surface-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input
              value={editing.service_name ?? ''}
              onChange={(e) => setEditing({ ...editing, service_name: e.target.value })}
              placeholder="服务名称"
              className="h-8 px-2 rounded-md border border-line-2 text-xs"
            />
            <input
              value={editing.provider ?? ''}
              onChange={(e) => setEditing({ ...editing, provider: e.target.value })}
              placeholder="提供方"
              className="h-8 px-2 rounded-md border border-line-2 text-xs"
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[['start_date', '开始'], ['end_date', '结束'], ['frequency', '频次']].map(
              ([k, label]) => (
                <div key={k}>
                  <label className="text-[10px] text-ink-3">{label}</label>
                  <input
                    type={k === 'frequency' ? 'text' : 'date'}
                    value={String((editing as Record<string, unknown>)[k] ?? '')}
                    onChange={(e) => setEditing({ ...editing, [k]: e.target.value })}
                    className="w-full h-8 px-2 rounded-md border border-line-2 text-xs"
                  />
                </div>
              ),
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" className="h-7 text-xs" onClick={() => setEditing(null)}>
              取消
            </Button>
            <Button className="h-7 text-xs" disabled={saving} onClick={() => void submit()}>
              {saving && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
              保存
            </Button>
          </div>
        </div>
      )}

      <div className="divide-y divide-line">
        {services.length === 0 ? (
          <p className="px-4 py-4 text-xs text-ink-3">暂无转衔服务记录</p>
        ) : (
          services.map((s) => (
            <div key={s.id} className="px-4 py-2.5 flex items-center gap-2">
              <span className="flex-1 text-xs text-ink">{s.service_name}</span>
              <span className="text-[10px] text-ink-2">
                {s.provider ?? '—'}
                {s.frequency ? ` · ${s.frequency}` : ''}
              </span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
