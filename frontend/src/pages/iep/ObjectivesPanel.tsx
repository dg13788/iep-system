/**
 * IEP 详情 - 短期目标面板（v4 特教专业内核 6.1）
 *
 * 三级闭环的中间层：
 *   长期目标（iep_goals）
 *     └─ 短期目标（iep_objectives，本面板）
 *          └─ 任务分析步骤（iep_objective_steps）+ 试次记录（iep_objective_records）
 *
 * 数据来源：services/iep.ts 的 fetchObjectives / saveObjective / deleteObjective /
 * fetchObjectiveRecords / addObjectiveRecord / rollupGoals。
 * 长期目标进度不再依赖 0~5 主观打分，由「由短期目标汇总」一键反推。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  X,
  Plus,
  Trash2,
  ClipboardList,
  RefreshCw,
  Loader2,
  ListOrdered,
  History,
  CheckCircle,
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
import type { IEPGoal } from './types';
import {
  addObjectiveRecord,
  deleteObjective,
  fetchObjectiveRecords,
  fetchObjectives,
  rollupGoals,
  saveObjective,
  OBJECTIVE_STATUS_CN,
  PROMPT_LEVEL_CN,
} from '@/services/iep';
import type { IEPObjective, ObjectiveRecord } from '@/services/iep';

const OBJECTIVE_STATUS_COLORS: Record<string, string> = {
  not_started: 'bg-[#F1F5F9] text-[#64748B]',
  in_progress: 'bg-[#EFF6FF] text-[#2563EB]',
  mastered: 'bg-[#ECFDF5] text-[#059669]',
  not_mastered: 'bg-[#FEF3C7] text-[#D97706]',
  discontinued: 'bg-[#F1F5F9] text-[#94A3B8]',
};

const PROMPT_LEVEL_ORDER = ['independent', 'gesture', 'verbal', 'model', 'physical'];

interface ObjectivesPanelProps {
  planId: number;
  goals: IEPGoal[];
  /** 是否具有 goal_update / record_create 等编辑权限（iep_level full/participate） */
  canEdit: boolean;
  /** 数据变更后通知外层刷新计划详情（进度等） */
  onChanged?: () => Promise<void> | void;
}

export default function ObjectivesPanel({ planId, goals, canEdit, onChanged }: ObjectivesPanelProps) {
  const [objectives, setObjectives] = useState<IEPObjective[]>([]);
  const [loading, setLoading] = useState(true);
  const [rolling, setRolling] = useState(false);

  // 试次记录抽屉
  const [recordObj, setRecordObj] = useState<IEPObjective | null>(null);
  // 新增/编辑短期目标抽屉
  const [editObj, setEditObj] = useState<IEPObjective | null>(null);
  const [editGoalId, setEditGoalId] = useState<number | null>(null);
  // 历史记录展开
  const [historyObjId, setHistoryObjId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchObjectives(planId);
      setObjectives(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '短期目标加载失败');
    } finally {
      setLoading(false);
    }
  }, [planId]);

  useEffect(() => {
    void load();
  }, [load]);

  // 按长期目标分组
  const grouped = useMemo(() => {
    const map = new Map<number, IEPObjective[]>();
    objectives.forEach((o) => {
      const gid = Number(o.goal_id);
      if (!map.has(gid)) map.set(gid, []);
      map.get(gid)!.push(o);
    });
    return map;
  }, [objectives]);

  const handleDelete = async (obj: IEPObjective) => {
    try {
      await deleteObjective(obj.id);
      toast.success('短期目标已删除');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '删除失败');
    }
  };

  const handleRollup = async () => {
    setRolling(true);
    try {
      const count = await rollupGoals(planId);
      toast.success(`已按试次数据汇总 ${count} 条长期目标`);
      await onChanged?.();
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '汇总失败');
    } finally {
      setRolling(false);
    }
  };

  const openCreate = (goalId: number) => {
    setEditObj(null);
    setEditGoalId(goalId);
  };
  const openEdit = (obj: IEPObjective) => {
    setEditObj(obj);
    setEditGoalId(Number(obj.goal_id));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-[#64748B]">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> 短期目标加载中...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 顶部说明 + 汇总操作 */}
      <div className="flex items-start justify-between gap-4">
        <div className="bg-[#FFF9F0] border border-[#F5E6C8] rounded-lg px-4 py-3 flex-1">
          <p className="text-xs text-[#B45309] leading-relaxed">
            短期目标是长期目标的<strong>任务分析拆解</strong>：每个目标按「试次（trial）」记录达成率，
            连续 3 次达到掌握阈值（默认 80%）自动判定为「已掌握」。
            点击「由短期目标汇总」可将试次数据反推为长期目标进度与状态，替代主观打分。
          </p>
        </div>
        {canEdit && (
          <button
            onClick={() => void handleRollup()}
            disabled={rolling || objectives.length === 0}
            className="shrink-0 flex items-center gap-1.5 h-9 px-3 rounded-md bg-[#EFF6FF] text-[#2563EB] text-sm font-medium hover:bg-[#DBEAFE] transition-colors cursor-pointer disabled:opacity-50"
          >
            {rolling ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            由短期目标汇总
          </button>
        )}
      </div>

      {goals.length === 0 && (
        <div className="bg-[#F7F6F4] rounded-lg p-8 text-center">
          <p className="text-sm text-[#64748B]">请先在「长短期目标」页签中建立长期目标</p>
        </div>
      )}

      {goals.map((goal) => {
        const gid = Number(goal.id);
        const objs = grouped.get(gid) ?? [];
        return (
          <section key={goal.id} className="border border-[#E2E8F0] rounded-xl overflow-hidden">
            {/* 长期目标标题栏 */}
            <div className="flex items-center justify-between px-4 py-3 bg-[#F7F6F4]">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className="px-2 py-0.5 rounded-full text-xs font-medium text-white"
                    style={{ backgroundColor: '#977653' }}
                  >
                    长期目标
                  </span>
                  <h4 className="text-sm font-semibold text-[#1E293B] truncate">{goal.title}</h4>
                </div>
                {goal.area && <p className="text-xs text-[#94A3B8] mt-1">领域：{goal.area}</p>}
              </div>
              {canEdit && (
                <button
                  onClick={() => openCreate(gid)}
                  className="shrink-0 flex items-center gap-1 h-8 px-3 rounded-md border border-[#977653] text-[#977653] text-xs font-medium hover:bg-[#F5F0EB] transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> 新增短期目标
                </button>
              )}
            </div>

            {/* 短期目标列表 */}
            <div className="divide-y divide-[#F1F5F9]">
              {objs.length === 0 && (
                <p className="px-4 py-6 text-sm text-[#94A3B8] text-center">
                  尚无短期目标，请将长期目标拆解为可教可测的步骤
                </p>
              )}
              {objs.map((obj) => (
                <ObjectiveCard
                  key={obj.id}
                  objective={obj}
                  canEdit={canEdit}
                  historyOpen={historyObjId === obj.id}
                  onToggleHistory={() => setHistoryObjId(historyObjId === obj.id ? null : obj.id)}
                  onRecord={() => setRecordObj(obj)}
                  onEdit={() => openEdit(obj)}
                  onDelete={() => void handleDelete(obj)}
                />
              ))}
            </div>
          </section>
        );
      })}

      {/* 试次记录抽屉 */}
      <AnimatePresence>
        {recordObj && (
          <TrialRecordSheet
            key="trial"
            objective={recordObj}
            onClose={() => setRecordObj(null)}
            onSaved={async () => {
              setRecordObj(null);
              await load();
            }}
          />
        )}
      </AnimatePresence>

      {/* 新增/编辑短期目标抽屉 */}
      <AnimatePresence>
        {editGoalId !== null && (
          <ObjectiveEditSheet
            key="obj-edit"
            planId={planId}
            goalId={editGoalId}
            objective={editObj}
            onClose={() => { setEditObj(null); setEditGoalId(null); }}
            onSaved={async () => {
              setEditObj(null);
              setEditGoalId(null);
              await load();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ============================================================
 * 单个短期目标卡片
 * ============================================================ */
function ObjectiveCard({
  objective: obj,
  canEdit,
  historyOpen,
  onToggleHistory,
  onRecord,
  onEdit,
  onDelete,
}: {
  objective: IEPObjective;
  canEdit: boolean;
  historyOpen: boolean;
  onToggleHistory: () => void;
  onRecord: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const pct = Math.round(Number(obj.overall_pct) || 0);
  return (
    <div className="px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-[#94A3B8]">#{obj.seq_no}</span>
            <h5 className="text-sm font-semibold text-[#1E293B]">{obj.title}</h5>
            <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', OBJECTIVE_STATUS_COLORS[obj.status] ?? OBJECTIVE_STATUS_COLORS.not_started)}>
              {OBJECTIVE_STATUS_CN[obj.status] ?? obj.status}
            </span>
          </div>
          {obj.target_behavior && (
            <p className="text-xs text-[#64748B] mt-1.5">目标行为：{obj.target_behavior}</p>
          )}
          {obj.criteria && <p className="text-xs text-[#94A3B8] mt-0.5">达标标准：{obj.criteria}</p>}

          {/* 任务分析步骤 */}
          {obj.steps.length > 0 && (
            <div className="mt-2.5 bg-[#F7F6F4] rounded-lg px-3 py-2.5">
              <div className="flex items-center gap-1.5 text-xs font-medium text-[#64748B] mb-1.5">
                <ListOrdered className="w-3.5 h-3.5" /> 任务分析步骤
              </div>
              <ol className="space-y-1">
                {obj.steps.map((s) => (
                  <li key={s.id} className="flex items-start gap-2 text-xs text-[#475569]">
                    <span className="shrink-0 w-4 h-4 rounded-full bg-white border border-[#E2E8F0] text-[10px] flex items-center justify-center text-[#64748B]">
                      {s.step_no}
                    </span>
                    <span>
                      {s.title}
                      {Number(s.is_critical) === 1 && (
                        <span className="ml-1 text-[#DC2626]">*</span>
                      )}
                      {s.teaching_prompt && (
                        <span className="text-[#94A3B8]">（{s.teaching_prompt}）</span>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>

        {/* 右侧进度与操作 */}
        <div className="shrink-0 w-44">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-[#64748B]">总体达成率</span>
            <span className="text-sm font-semibold text-[#977653]">{pct}%</span>
          </div>
          <div className="h-2 bg-[#F1F5F9] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.min(pct, 100)}%`,
                background: pct >= Number(obj.mastery_pct || 80) ? '#10B981' : 'linear-gradient(90deg,#AC9174,#977653)',
              }}
            />
          </div>
          <p className="text-[11px] text-[#94A3B8] mt-1">
            {obj.record_count} 次记录 / {obj.total_trials} 试次 · 阈值 {Math.round(Number(obj.mastery_pct) || 80)}%
          </p>
          {obj.last_record_date && (
            <p className="text-[11px] text-[#94A3B8]">最近：{obj.last_record_date}</p>
          )}
          <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
            {canEdit && (
              <button
                onClick={onRecord}
                className="flex items-center gap-1 h-7 px-2 rounded bg-[#977653] text-white text-xs hover:bg-[#7A5F42] transition-colors cursor-pointer"
              >
                <ClipboardList className="w-3 h-3" /> 记录试次
              </button>
            )}
            <button
              onClick={onToggleHistory}
              className="flex items-center gap-1 h-7 px-2 rounded border border-[#E2E8F0] text-xs text-[#64748B] hover:bg-[#F7F6F4] transition-colors cursor-pointer"
            >
              <History className="w-3 h-3" /> {historyOpen ? '收起' : '记录'}
            </button>
            {canEdit && (
              <>
                <button onClick={onEdit} className="h-7 px-2 rounded border border-[#E2E8F0] text-xs text-[#64748B] hover:bg-[#F7F6F4] cursor-pointer">编辑</button>
                <button onClick={onDelete} className="h-7 px-1.5 rounded border border-[#FECACA] text-xs text-[#DC2626] hover:bg-[#FEF2F2] cursor-pointer" title="删除">
                  <Trash2 className="w-3 h-3" />
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 历史试次记录 */}
      {historyOpen && <TrialHistory objectiveId={obj.id} />}
    </div>
  );
}

function TrialHistory({ objectiveId }: { objectiveId: number }) {
  const [records, setRecords] = useState<ObjectiveRecord[] | null>(null);
  useEffect(() => {
    let alive = true;
    fetchObjectiveRecords(objectiveId)
      .then((rows) => { if (alive) setRecords(rows); })
      .catch(() => { if (alive) setRecords([]); });
    return () => { alive = false; };
  }, [objectiveId]);

  if (records === null) {
    return <p className="mt-3 text-xs text-[#94A3B8]">记录加载中...</p>;
  }
  if (records.length === 0) {
    return <p className="mt-3 text-xs text-[#94A3B8]">尚无试次记录</p>;
  }
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-[#94A3B8] border-b border-[#F1F5F9]">
            <th className="py-1.5 pr-3 font-medium">日期</th>
            <th className="py-1.5 pr-3 font-medium">步骤</th>
            <th className="py-1.5 pr-3 font-medium">试次/成功</th>
            <th className="py-1.5 pr-3 font-medium">达成率</th>
            <th className="py-1.5 pr-3 font-medium">提示层级</th>
            <th className="py-1.5 pr-3 font-medium">泛化</th>
            <th className="py-1.5 pr-3 font-medium">记录人</th>
            <th className="py-1.5 font-medium">备注</th>
          </tr>
        </thead>
        <tbody>
          {records.slice(0, 12).map((r) => (
            <tr key={r.id} className="border-b border-[#F8FAFC] text-[#475569]">
              <td className="py-1.5 pr-3 whitespace-nowrap">{r.record_date}</td>
              <td className="py-1.5 pr-3">{r.step_title || '—'}</td>
              <td className="py-1.5 pr-3">{r.trial_count}/{r.success_count}</td>
              <td className="py-1.5 pr-3">
                <span className={cn(
                  'font-semibold',
                  Number(r.achievement_pct) >= 80 ? 'text-[#059669]' : 'text-[#D97706]',
                )}>
                  {Math.round(Number(r.achievement_pct))}%
                </span>
              </td>
              <td className="py-1.5 pr-3">{PROMPT_LEVEL_CN[r.prompt_level] ?? r.prompt_level}</td>
              <td className="py-1.5 pr-3">{Number(r.is_generalized) === 1 ? '是' : '—'}</td>
              <td className="py-1.5 pr-3">{r.recorder_name || '—'}</td>
              <td className="py-1.5 text-[#94A3B8] max-w-[160px] truncate" title={r.notes ?? ''}>{r.notes || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ============================================================
 * 试次记录抽屉
 * ============================================================ */
function TrialRecordSheet({
  objective,
  onClose,
  onSaved,
}: {
  objective: IEPObjective;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const today = new Date().toISOString().split('T')[0];
  const [recordDate, setRecordDate] = useState(today);
  const [stepId, setStepId] = useState<string>('0');
  const [sessionType, setSessionType] = useState('个训课');
  const [trialCount, setTrialCount] = useState(5);
  const [successCount, setSuccessCount] = useState(0);
  const [promptLevel, setPromptLevel] = useState('independent');
  const [generalized, setGeneralized] = useState(false);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const livePct = trialCount > 0 ? Math.round((successCount / trialCount) * 100) : 0;

  const handleSave = async () => {
    if (trialCount < 1) { toast.error('试次数至少为 1'); return; }
    if (successCount < 0 || successCount > trialCount) { toast.error('成功数不能大于试次数'); return; }
    setSaving(true);
    try {
      const result = await addObjectiveRecord({
        objective_id: objective.id,
        step_id: Number(stepId) > 0 ? Number(stepId) : null,
        record_date: recordDate,
        session_type: sessionType,
        trial_count: trialCount,
        success_count: successCount,
        prompt_level: promptLevel,
        is_generalized: generalized,
        notes,
      });
      if (result.objective_status === 'mastered') {
        toast.success('记录成功：该短期目标已连续达标，自动判定为「已掌握」');
      } else {
        toast.success(`记录成功，本次达成率 ${result.achievement_pct}%`);
      }
      await onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '记录失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/40 z-[70] flex justify-end"
      onClick={onClose}
    >
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-[460px] h-full bg-white shadow-xl flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-label="记录试次"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E2E8F0]">
          <div>
            <h3 className="text-lg font-semibold text-[#1E293B]">记录教学试次</h3>
            <p className="text-xs text-[#64748B] mt-0.5">{objective.title}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md text-[#64748B] hover:bg-[#F7F6F4] cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-[#1E293B] mb-1.5">记录日期</label>
              <input
                type="date"
                value={recordDate}
                onChange={(e) => setRecordDate(e.target.value)}
                className="w-full h-10 px-3 rounded-md border border-[#E2E8F0] text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-[#1E293B] mb-1.5">课型</label>
              <Select value={sessionType} onValueChange={setSessionType}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['个训课', '集体课', '小组课', '生活情境', '家庭练习'].map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {objective.steps.length > 0 && (
            <div>
              <label className="block text-sm font-semibold text-[#1E293B] mb-1.5">对应任务步骤（可选）</label>
              <Select value={stepId} onValueChange={setStepId}>
                <SelectTrigger className="h-10"><SelectValue placeholder="整目标（不限步骤）" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">整目标（不限步骤）</SelectItem>
                  {objective.steps.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>第{s.step_no}步：{s.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-[#1E293B] mb-1.5">试次数</label>
              <input
                type="number"
                min={1}
                max={500}
                value={trialCount}
                onChange={(e) => setTrialCount(Math.max(1, Math.min(500, Number(e.target.value) || 1)))}
                className="w-full h-10 px-3 rounded-md border border-[#E2E8F0] text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-[#1E293B] mb-1.5">成功数</label>
              <input
                type="number"
                min={0}
                max={trialCount}
                value={successCount}
                onChange={(e) => setSuccessCount(Math.max(0, Math.min(trialCount, Number(e.target.value) || 0)))}
                className="w-full h-10 px-3 rounded-md border border-[#E2E8F0] text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-[#1E293B] mb-1.5">提示层级</label>
            <div className="grid grid-cols-5 gap-1.5">
              {PROMPT_LEVEL_ORDER.map((lv) => (
                <button
                  key={lv}
                  onClick={() => setPromptLevel(lv)}
                  className={cn(
                    'h-9 rounded-md text-xs font-medium border transition-all cursor-pointer',
                    promptLevel === lv
                      ? 'border-transparent text-white bg-[#977653]'
                      : 'border-[#E2E8F0] text-[#64748B] hover:border-[#CBD5E1]',
                  )}
                >
                  {PROMPT_LEVEL_CN[lv]}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-[#94A3B8] mt-1.5">提示应随学生进步逐级撤除：身体辅助 → 示范 → 语言 → 手势 → 独立</p>
          </div>

          <label className="flex items-center gap-2 text-sm text-[#475569] cursor-pointer">
            <input
              type="checkbox"
              checked={generalized}
              onChange={(e) => setGeneralized(e.target.checked)}
              className="w-4 h-4 rounded border-[#CBD5E1]"
            />
            已在自然情境中泛化
          </label>

          <div>
            <label className="block text-sm font-semibold text-[#1E293B] mb-1.5">备注</label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="学生表现、需要调整的策略..."
              rows={3}
              className="text-sm"
            />
          </div>

          <div className="bg-[#F1F5F9] rounded-lg px-4 py-3 flex items-center justify-between">
            <span className="text-xs text-[#64748B]">本次达成率</span>
            <span className={cn('text-lg font-bold', livePct >= 80 ? 'text-[#059669]' : 'text-[#977653]')}>
              {livePct}%
            </span>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#E2E8F0]">
          <button
            onClick={onClose}
            disabled={saving}
            className="h-10 px-4 rounded-md border border-[#CBD5E1] text-sm font-medium text-[#64748B] hover:bg-[#F7F6F4] cursor-pointer disabled:opacity-60"
          >
            取消
          </button>
          <button
            onClick={() => void handleSave()}
            disabled={saving}
            className="flex items-center gap-1.5 h-10 px-4 rounded-md bg-[#977653] text-white text-sm font-medium hover:bg-[#7A5F42] cursor-pointer disabled:opacity-60"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            {saving ? '保存中...' : '保存记录'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ============================================================
 * 新增/编辑短期目标抽屉（含任务分析步骤编辑）
 * ============================================================ */
interface StepDraft {
  title: string;
  teaching_prompt: string;
  is_critical: boolean;
}

function ObjectiveEditSheet({
  planId,
  goalId,
  objective,
  onClose,
  onSaved,
}: {
  planId: number;
  goalId: number;
  objective: IEPObjective | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const [title, setTitle] = useState(objective?.title ?? '');
  const [targetBehavior, setTargetBehavior] = useState(objective?.target_behavior ?? '');
  const [criteria, setCriteria] = useState(objective?.criteria ?? '');
  const [masteryPct, setMasteryPct] = useState(Math.round(Number(objective?.mastery_pct) || 80));
  const [status, setStatus] = useState(objective?.status ?? 'not_started');
  const [steps, setSteps] = useState<StepDraft[]>(
    objective?.steps.map((s) => ({
      title: s.title,
      teaching_prompt: s.teaching_prompt ?? '',
      is_critical: Number(s.is_critical) === 1,
    })) ?? [{ title: '', teaching_prompt: '', is_critical: false }],
  );
  const [saving, setSaving] = useState(false);

  const setStep = (i: number, patch: Partial<StepDraft>) => {
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  };

  const handleSave = async () => {
    if (!title.trim()) { toast.error('短期目标标题不能为空'); return; }
    setSaving(true);
    try {
      await saveObjective({
        id: objective?.id,
        goal_id: goalId,
        title: title.trim(),
        target_behavior: targetBehavior || undefined,
        criteria: criteria || undefined,
        mastery_pct: masteryPct,
        status,
        steps: steps.filter((s) => s.title.trim()).map((s) => ({
          title: s.title.trim(),
          teaching_prompt: s.teaching_prompt || undefined,
          is_critical: s.is_critical,
        })),
      });
      toast.success(objective ? '短期目标已更新' : '短期目标已创建');
      await onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/40 z-[70] flex justify-end"
      onClick={onClose}
    >
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-[520px] h-full bg-white shadow-xl flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-label={objective ? '编辑短期目标' : '新增短期目标'}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E2E8F0]">
          <h3 className="text-lg font-semibold text-[#1E293B]">{objective ? '编辑短期目标' : '新增短期目标'}</h3>
          <button onClick={onClose} className="p-1.5 rounded-md text-[#64748B] hover:bg-[#F7F6F4] cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <div>
            <label className="block text-sm font-semibold text-[#1E293B] mb-1.5">目标标题 *</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="如：能使用勺子独立吃完一顿饭"
              className="w-full h-10 px-3 rounded-md border border-[#E2E8F0] text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-[#1E293B] mb-1.5">目标行为（可观察、可测量）</label>
            <Textarea
              value={targetBehavior}
              onChange={(e) => setTargetBehavior(e.target.value)}
              placeholder="在什么条件下，做什么，做到什么程度"
              rows={2}
              className="text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-[#1E293B] mb-1.5">达标标准</label>
            <input
              value={criteria}
              onChange={(e) => setCriteria(e.target.value)}
              placeholder="如：连续3次课达成率≥80%"
              className="w-full h-10 px-3 rounded-md border border-[#E2E8F0] text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-[#1E293B] mb-1.5">掌握阈值（%）</label>
              <input
                type="number"
                min={50}
                max={100}
                value={masteryPct}
                onChange={(e) => setMasteryPct(Math.max(50, Math.min(100, Number(e.target.value) || 80)))}
                className="w-full h-10 px-3 rounded-md border border-[#E2E8F0] text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-[#1E293B] mb-1.5">状态</label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(OBJECTIVE_STATUS_CN).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* 任务分析步骤 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-semibold text-[#1E293B]">任务分析步骤</label>
              <button
                onClick={() => setSteps((prev) => [...prev, { title: '', teaching_prompt: '', is_critical: false }])}
                className="flex items-center gap-1 text-xs text-[#977653] hover:underline cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> 添加步骤
              </button>
            </div>
            <p className="text-[11px] text-[#94A3B8] mb-2">
              把目标拆成 3~6 个可教的小步骤，如「握勺 → 舀取 → 平移 → 送入口中」；带 * 为关键步。
            </p>
            <div className="space-y-2">
              {steps.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="shrink-0 w-6 h-6 rounded-full bg-[#F7F6F4] border border-[#E2E8F0] text-xs flex items-center justify-center text-[#64748B]">
                    {i + 1}
                  </span>
                  <input
                    value={s.title}
                    onChange={(e) => setStep(i, { title: e.target.value })}
                    placeholder="步骤名称"
                    className="flex-1 h-9 px-2.5 rounded-md border border-[#E2E8F0] text-sm"
                  />
                  <input
                    value={s.teaching_prompt}
                    onChange={(e) => setStep(i, { teaching_prompt: e.target.value })}
                    placeholder="提示方式"
                    className="w-28 h-9 px-2.5 rounded-md border border-[#E2E8F0] text-sm"
                  />
                  <button
                    onClick={() => setStep(i, { is_critical: !s.is_critical })}
                    title="关键步"
                    className={cn(
                      'shrink-0 w-8 h-9 rounded-md border text-sm font-bold cursor-pointer',
                      s.is_critical ? 'border-[#FECACA] text-[#DC2626] bg-[#FEF2F2]' : 'border-[#E2E8F0] text-[#CBD5E1]',
                    )}
                  >
                    *
                  </button>
                  <button
                    onClick={() => setSteps((prev) => prev.filter((_, idx) => idx !== i))}
                    className="shrink-0 w-8 h-9 rounded-md border border-[#E2E8F0] text-[#94A3B8] hover:text-[#DC2626] cursor-pointer flex items-center justify-center"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#E2E8F0]">
          <button
            onClick={onClose}
            disabled={saving}
            className="h-10 px-4 rounded-md border border-[#CBD5E1] text-sm font-medium text-[#64748B] hover:bg-[#F7F6F4] cursor-pointer disabled:opacity-60"
          >
            取消
          </button>
          <button
            onClick={() => void handleSave()}
            disabled={saving}
            className="flex items-center gap-1.5 h-10 px-4 rounded-md bg-[#977653] text-white text-sm font-medium hover:bg-[#7A5F42] cursor-pointer disabled:opacity-60"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// 类型再导出，供其他面板复用
export type { IEPObjective, ObjectiveRecord };
