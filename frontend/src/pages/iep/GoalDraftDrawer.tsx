import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Info,
  Loader2,
  Sparkles,
  Wand2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  adoptGoalDraft,
  fetchDraftProfile,
  fetchDraftRecords,
  fetchPlaafpDraft,
  generateGoalDrafts,
  savePlaafpDraft,
  type AssessmentProfile,
  type DimensionProfile,
  type GoalDraft,
  type PlaafpDraft,
} from '@/services/goalDraft';

/**
 * 从评估起草目标（Step 3：评估 → IEP 因果链闭合）
 *
 * 为什么是「确定性引擎」而不是接一个大模型：
 *   1) 学生数据不出校是相对普惠 SaaS 的结构性优势，一次外部 API 调用就废掉；
 *   2) 目标要进法定文书，每个要素必须能指回具体评估条目，模型给的句子无法溯源；
 *   3) 离线可用——特校/村小的网络不保证。
 *
 * 因此本抽屉的每一条草案都带 evidence 与 reason，
 * 并把「系统不敢确定的部分」（领域归类 / 完成条件 / 达成期限 / 期末目标值）
 * 显式列为 needs_confirm，交给 IEP 团队判断 —— 引擎不冒充教师做决定。
 */

interface GoalDraftDrawerProps {
  planId: number | string;
  studentName?: string;
  editable: boolean;
  /** 锁定某次评估。从评估详情页进入时必须传，否则会用"最近一次评估"而非教师正在看的那次 */
  assessmentId?: number | string;
  onClose: () => void;
  onAdopted: () => void;
}

const BAND_META: Record<string, { label: string; dot: string; bg: string; text: string }> = {
  priority: { label: '优先需求', dot: '#DC2626', bg: 'bg-[#FEE2E2]', text: 'text-[#B91C1C]' },
  emerging: { label: '发展中', dot: '#D97706', bg: 'bg-[#FEF3C7]', text: 'text-[#B45309]' },
  mastered: { label: '已达掌握线', dot: '#059669', bg: 'bg-[#D1FAE5]', text: 'text-[#047857]' },
  unknown: { label: '无法判断', dot: '#94A3B8', bg: 'bg-[#F1F5F9]', text: 'text-[#64748B]' },
};

export default function GoalDraftDrawer({
  planId,
  studentName,
  editable,
  assessmentId,
  onClose,
  onAdopted,
}: GoalDraftDrawerProps) {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<AssessmentProfile | null>(null);
  const [plaafp, setPlaafp] = useState<PlaafpDraft | null>(null);
  const [drafts, setDrafts] = useState<GoalDraft[]>([]);
  const [draftNote, setDraftNote] = useState<string | null>(null);

  const [strengths, setStrengths] = useState('');
  const [needs, setNeeds] = useState('');
  const [savedPlaafp, setSavedPlaafp] = useState(false);
  const [savingPlaafp, setSavingPlaafp] = useState(false);

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [adopting, setAdopting] = useState(false);
  const [adoptedIds, setAdoptedIds] = useState<Set<number>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = await fetchDraftProfile(planId, assessmentId);
      setProfile(p);
      if (!p.has_assessment) {
        setLoading(false);
        return;
      }
      const pl = await fetchPlaafpDraft(planId, assessmentId);
      setPlaafp(pl);
      setStrengths(pl.strengths_text);
      setNeeds(pl.needs_text);

      // 先复用上次生成但尚未采纳的草案。
      // 若每次打开抽屉都重新生成并落库，草稿留痕会被"打开次数"污染，
      // 教研数据（引擎建议了什么 vs 教师定了什么）就失去统计意义。
      const history = await fetchDraftRecords(planId).catch(() => []);
      const pending = history.filter(
        (r) => r.draft_kind === 'goal' && r.adopted !== 1 && r.draft_json,
      );
      if (pending.length > 0) {
        const reuse = pending
          .map((r) => ({
            ...(r.draft_json as unknown as GoalDraft),
            draft_id: r.id,
          }))
          .sort(
            (a, b) => (a.baseline_value ?? 999) - (b.baseline_value ?? 999),
          );
        setDrafts(reuse);
        setDraftNote('以下为上次生成、尚未采纳的草案。如需按最新评估重新生成，请先删除旧草案。');
      } else {
        const gen = await generateGoalDrafts(planId, assessmentId);
        setDrafts(gen.drafts);
        setDraftNote(gen.note);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '起草失败');
    } finally {
      setLoading(false);
    }
  }, [planId, assessmentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const needsDims = useMemo(
    () => (profile?.dimensions ?? []).filter((d) => d.band === 'priority' || d.band === 'emerging'),
    [profile],
  );
  const strengthDims = useMemo(
    () => (profile?.dimensions ?? []).filter((d) => d.band === 'mastered'),
    [profile],
  );

  const toggle = (id: number) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const handleSavePlaafp = async () => {
    setSavingPlaafp(true);
    try {
      await savePlaafpDraft({
        plan_id: planId,
        strengths,
        needs,
        draft_strengths: plaafp?.strengths_text ?? '',
        draft_needs: plaafp?.needs_text ?? '',
        ...(profile?.assessment ? { assessment_id: profile.assessment.id } : {}),
      });
      setSavedPlaafp(true);
      toast.success('PLAAFP 已写入计划（已标记起草来源，便于日后区分人写与机写）');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '写入失败');
    } finally {
      setSavingPlaafp(false);
    }
  };

  const handleAdopt = async () => {
    const ids = [...selected].filter((i) => !adoptedIds.has(i));
    if (ids.length === 0) return;
    setAdopting(true);
    let ok = 0;
    const newAdopted = new Set(adoptedIds);
    for (const id of ids) {
      const d = drafts.find((x) => x.draft_id === id);
      if (!d) continue;
      try {
        const r = await adoptGoalDraft(planId, id, {
          area: d.area ?? '未分类',
          title: d.title,
          target_behavior: d.target_behavior,
          criteria: d.criteria,
          baseline: d.baseline,
          baseline_value: d.baseline_value,
          baseline_date: d.baseline_date,
          target_value: d.target_value,
          target_date: d.target_date,
          monitor_frequency: d.monitor_frequency,
          evaluation_method: d.evaluation_method,
          priority: d.priority,
          description: d.baseline,
        });
        newAdopted.add(id);
        ok += 1;
        if (r.edited_fields.length > 0) {
          toast.info(`「${d.title}」已采纳，记录您的调整：${r.edited_fields.join('、')}`);
        }
      } catch (e) {
        toast.error(`「${d.title}」采纳失败：${e instanceof Error ? e.message : '未知错误'}`);
      }
    }
    setAdoptedIds(newAdopted);
    setSelected(new Set());
    setAdopting(false);
    if (ok > 0) {
      toast.success(`已采纳 ${ok} 条目标，均带评估溯源`);
      onAdopted();
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-[720px] h-full bg-white flex flex-col shadow-2xl">
        {/* 头部 */}
        <div className="flex items-center justify-between gap-3 px-5 h-14 border-b border-[#E2E8F0] shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Wand2 className="w-4 h-4 text-[#4F46E5] shrink-0" />
            <span className="text-sm font-semibold text-[#1E293B]">从评估起草</span>
            {studentName && (
              <span className="text-xs text-[#64748B] truncate">· {studentName}</span>
            )}
          </div>
          <button
            onClick={onClose}
            className="shrink-0 w-7 h-7 flex items-center justify-center rounded-md hover:bg-[#F1F5F9] cursor-pointer"
          >
            <X className="w-4 h-4 text-[#64748B]" />
          </button>
        </div>

        {/* 内容 */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading && (
            <div className="h-40 flex items-center justify-center text-sm text-[#94A3B8]">
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              正在归纳评估数据…
            </div>
          )}

          {!loading && profile && !profile.has_assessment && (
            <div className="border border-[#FDE68A] bg-[#FFFBEB] rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-4 h-4 text-[#B45309]" />
                <span className="text-sm font-semibold text-[#1E293B]">没有可用的评估数据</span>
              </div>
              <p className="text-xs text-[#475569] leading-relaxed">
                {profile.reason}
              </p>
            </div>
          )}

          {!loading && profile?.has_assessment && (
            <div className="space-y-5">
              {/* 依据 */}
              <div className="border border-[#E2E8F0] rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <ClipboardList className="w-4 h-4 text-[#475569]" />
                  <span className="text-sm font-semibold text-[#1E293B]">起草依据</span>
                </div>
                <p className="text-xs text-[#475569]">
                  {profile.assessment?.template_name || '评估'} ·{' '}
                  {profile.assessment?.date} · {profile.assessment?.item_count} 个条目
                  {profile.assessment?.assessor_name ? ` · 评估人 ${profile.assessment.assessor_name}` : ''}
                </p>
                <p className="mt-1.5 text-[11px] text-[#94A3B8]">
                  画像限定在<b>本次评估</b>内计算。跨评估平均会把"前测 1 分 + 后测 5 分"平均成 3 分，
                  那既不是前测也不是后测。
                </p>
              </div>

              {/* 维度画像 */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-4 h-4 text-[#475569]" />
                  <span className="text-sm font-semibold text-[#1E293B]">维度画像</span>
                  <span className="text-[11px] text-[#94A3B8]">
                    需求 {needsDims.length} · 已达掌握线 {strengthDims.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {[...needsDims, ...strengthDims].map((d) => (
                    <DimCard key={d.dimension} dim={d} />
                  ))}
                </div>
              </div>

              {/* PLAAFP */}
              {plaafp && (
                <div className="border border-[#E2E8F0] rounded-lg p-4">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-sm font-semibold text-[#1E293B]">PLAAFP 初稿</span>
                    {savedPlaafp && (
                      <span className="flex items-center gap-1 text-xs text-[#059669]">
                        <CheckCircle2 className="w-3 h-3" />
                        已写入计划
                      </span>
                    )}
                  </div>

                  {plaafp.caveats.length > 0 && (
                    <div className="mb-3 space-y-1">
                      {plaafp.caveats.map((c, i) => (
                        <div key={i} className="flex gap-2 bg-[#FFFBEB] rounded-md p-2">
                          <AlertTriangle className="w-3.5 h-3.5 text-[#B45309] shrink-0 mt-0.5" />
                          <p className="text-[11px] text-[#92400E] leading-relaxed">{c}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  <label className="text-xs text-[#475569]">优势与现有水平（可修改）</label>
                  <Textarea
                    value={strengths}
                    onChange={(e) => setStrengths(e.target.value)}
                    rows={3}
                    disabled={!editable}
                    className="mt-1 text-xs"
                  />
                  <label className="block mt-3 text-xs text-[#475569]">需求与差距（可修改）</label>
                  <Textarea
                    value={needs}
                    onChange={(e) => setNeeds(e.target.value)}
                    rows={3}
                    disabled={!editable}
                    className="mt-1 text-xs"
                  />
                  <p className="mt-1.5 text-[11px] text-[#94A3B8]">{plaafp.source_text}</p>
                  {editable && (
                    <Button
                      className="mt-3 h-8"
                      disabled={savingPlaafp}
                      onClick={() => void handleSavePlaafp()}
                    >
                      {savingPlaafp ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : null}
                      写入计划
                    </Button>
                  )}
                </div>
              )}

              {/* 目标草案 */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-sm font-semibold text-[#1E293B]">目标草案</span>
                  {draftNote && <span className="text-[11px] text-[#B45309]">{draftNote}</span>}
                </div>
                {drafts.length === 0 ? (
                  <p className="text-xs text-[#94A3B8]">
                    本次评估未发现低于掌握线的领域，无需新立年度目标。
                  </p>
                ) : (
                  <div className="space-y-2">
                    {drafts.map((d) => (
                      <DraftCard
                        key={d.draft_id}
                        draft={d}
                        checked={selected.has(d.draft_id ?? -1)}
                        adopted={adoptedIds.has(d.draft_id ?? -1)}
                        disabled={!editable}
                        onToggle={() => toggle(d.draft_id ?? -1)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 底部操作 */}
        {!loading && profile?.has_assessment && editable && drafts.length > 0 && (
          <div className="shrink-0 flex items-center justify-between gap-3 px-5 h-14 border-t border-[#E2E8F0]">
            <span className="text-xs text-[#64748B]">
              已选 {[...selected].filter((i) => !adoptedIds.has(i)).length} 条
              {adoptedIds.size > 0 ? ` · 已采纳 ${adoptedIds.size} 条` : ''}
            </span>
            <div className="flex items-center gap-2">
              <Button variant="outline" className="h-8" onClick={onClose}>
                关闭
              </Button>
              <Button
                className="h-8"
                disabled={adopting || [...selected].filter((i) => !adoptedIds.has(i)).length === 0}
                onClick={() => void handleAdopt()}
              >
                {adopting ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : null}
                采纳为正式目标
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- 维度卡片 ---------------- */

function DimCard({ dim }: { dim: DimensionProfile }) {
  const [open, setOpen] = useState(false);
  const m = BAND_META[dim.band] ?? BAND_META.unknown;

  return (
    <div className="border border-[#E2E8F0] rounded-lg">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: m.dot }} />
        <span className="text-sm font-medium text-[#1E293B]">{dim.dimension}</span>
        <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium', m.bg, m.text)}>
          {m.label}
        </span>
        {dim.avg_pct !== null ? (
          <span className="text-xs text-[#475569]">{dim.avg_pct}%</span>
        ) : (
          <span className="text-xs text-[#94A3B8]">无得分</span>
        )}
        <span className="text-[10px] text-[#94A3B8]">{dim.item_count} 项</span>
        {dim.uneven && (
          <span className="px-1.5 py-0.5 rounded text-[10px] bg-[#FEF3C7] text-[#B45309]">
            内部差异大
          </span>
        )}
        <button
          onClick={() => setOpen((v) => !v)}
          className="ml-auto flex items-center gap-1 text-[11px] text-[#64748B] hover:text-[#334155] cursor-pointer"
        >
          依据
          <ChevronDown className={cn('w-3 h-3 transition-transform', open && 'rotate-180')} />
        </button>
      </div>
      {open && (
        <div className="px-3 pb-3 space-y-1.5">
          <p className="text-[11px] text-[#475569] leading-relaxed">{dim.reason}</p>
          <div className="flex flex-wrap gap-1">
            {dim.items.map((it) => (
              <span
                key={it.item_id}
                className="px-1.5 py-0.5 rounded bg-[#F8FAFC] border border-[#E2E8F0] text-[10px] text-[#475569]"
              >
                {it.item_name}
                {it.pct !== null ? ` ${it.pct}%` : ''}
                {it.level ? ` · ${it.level}` : ''}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- 草案卡片 ---------------- */

function DraftCard({
  draft,
  checked,
  adopted,
  disabled,
  onToggle,
}: {
  draft: GoalDraft;
  checked: boolean;
  adopted: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const [open, setOpen] = useState(false);
  const id = draft.draft_id ?? -1;

  return (
    <div
      className={cn(
        'border rounded-lg',
        adopted ? 'border-[#BBF7D0] bg-[#F0FDF4]' : checked ? 'border-[#818CF8] bg-[#EEF2FF]' : 'border-[#E2E8F0]',
      )}
    >
      <div className="flex items-start gap-2.5 px-3 py-2.5">
        {!adopted && !disabled ? (
          <input
            type="checkbox"
            checked={checked}
            onChange={onToggle}
            className="mt-0.5 w-3.5 h-3.5 cursor-pointer"
          />
        ) : (
          <span className="mt-0.5 w-3.5 h-3.5 flex items-center justify-center">
            {adopted && <CheckCircle2 className="w-3.5 h-3.5 text-[#059669]" />}
          </span>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-[#1E293B]">{draft.title}</span>
            <span className="text-[10px] text-[#94A3B8]">{draft.dimension}</span>
            {draft.priority === 'high' && (
              <span className="px-1.5 py-0.5 rounded text-[10px] bg-[#FEE2E2] text-[#B91C1C]">
                优先
              </span>
            )}
            {adopted && (
              <span className="px-1.5 py-0.5 rounded text-[10px] bg-[#D1FAE5] text-[#047857]">
                已采纳
              </span>
            )}
          </div>
          <p className="mt-1 text-[11px] text-[#475569]">
            基线 {draft.baseline_value ?? '—'}% → 目标 {draft.target_value ?? '—'}%
            {draft.target_date ? ` · 期限 ${draft.target_date}` : ' · 期限待定'}
          </p>
          {draft.needs_confirm.length > 0 && (
            <p className="mt-1 flex items-start gap-1 text-[11px] text-[#B45309]">
              <Info className="w-3 h-3 shrink-0 mt-0.5" />
              待确认：{draft.needs_confirm.join('；')}
            </p>
          )}
        </div>

        <button
          onClick={() => setOpen((v) => !v)}
          className="shrink-0 flex items-center gap-1 text-[11px] text-[#64748B] hover:text-[#334155] cursor-pointer"
        >
          详情
          <ChevronDown className={cn('w-3 h-3 transition-transform', open && 'rotate-180')} />
        </button>
      </div>

      {open && (
        <div className="px-3 pb-3 space-y-2 border-t border-[#F1F5F9] pt-2">
          <Row label="达成标准" value={draft.criteria} />
          <Row label="基线依据" value={draft.baseline} />
          <Row label="基线数值" value={draft.baseline_value !== null ? `${draft.baseline_value}%` : '—'} />
          <Row label="期末目标" value={`${draft.target_value ?? '—'}%（${draft.target_value_note}）`} />
          <Row
            label="完成条件"
            value={draft.condition_text ? `${draft.condition_text}（${draft.condition_from}）` : draft.condition_from}
          />
          <Row label="评估方法" value={draft.evaluation_method} />
          <Row label="监控频率" value={`${draft.monitor_frequency}（${draft.monitor_frequency_note}）`} />
          <Row label="目标领域" value={draft.area ?? '未归类，需人工指定'} />
          <Row label="起草来源" value={draft.drafted_from === 'item' ? '按条目（该维度内部差异过大）' : '按维度'} />
          <p className="text-[11px] text-[#64748B] leading-relaxed pt-1">{draft.reason}</p>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="shrink-0 w-16 text-[11px] text-[#94A3B8]">{label}</span>
      <span className="text-[11px] text-[#475569] leading-relaxed">{value}</span>
    </div>
  );
}
