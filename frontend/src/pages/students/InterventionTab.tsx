/**
 * 学生详情 - 行为干预页签（v4 特教专业内核 6.5）
 *
 * BIP（行为干预计划）：目标行为 + ABC 分析（前因/行为/后果）+ 干预策略 +
 * 事件台账（用于验证干预有效性）。
 * 数据来源：services/intervention.ts。
 */
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Plus, Save, Trash2, Activity, FilePlus2, ChevronDown, ChevronUp } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { useAuthStore } from '@/store/authStore';
import {
  addIncident,
  deleteBip,
  fetchBipList,
  fetchIncidents,
  saveBip,
  BIP_STATUS_CN,
  BIP_INTENSITIES,
} from '@/services/intervention';
import type { BipIncident, BipPlan, IncidentStat } from '@/services/intervention';

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-[#F1F5F9] text-[#64748B]',
  active: 'bg-[#ECFDF5] text-[#059669]',
  revised: 'bg-[#EFF6FF] text-[#2563EB]',
  closed: 'bg-[#F1F5F9] text-[#94A3B8]',
};

const FUNCTION_OPTIONS = ['获得关注', '逃避任务', '获得实物/活动', '自我刺激', '感觉调节', '其他'];

export default function InterventionTab({ studentId, studentName }: { studentId: number; studentName: string }) {
  const hasFeature = useAuthStore((s) => s.hasFeature);
  const canEdit = hasFeature('iep_edit');
  const canRecord = hasFeature('record_create');

  const [list, setList] = useState<BipPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<BipPlan | null>(null);
  const [creating, setCreating] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setList(await fetchBipList(studentId));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'BIP 加载失败');
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDelete = async (bip: BipPlan) => {
    try {
      await deleteBip(bip.id);
      toast.success('BIP 已删除');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '删除失败');
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-[#E2E8F0] p-8 flex items-center justify-center text-[#64748B]">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> 行为干预计划加载中...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-[#1E293B] flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary-500" /> 行为干预计划（BIP）
        </h4>
        {canEdit && (
          <button
            onClick={() => { setEditing(null); setCreating(true); }}
            className="flex items-center gap-1 h-8 px-3 rounded-md border border-[#977653] text-[#977653] text-xs font-medium hover:bg-[#F5F0EB] cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" /> 新建 BIP
          </button>
        )}
      </div>

      {(creating || editing) && (
        <BipEditor
          key={editing?.id ?? 'new'}
          studentId={studentId}
          bip={editing}
          onCancel={() => { setCreating(false); setEditing(null); }}
          onSaved={async () => { setCreating(false); setEditing(null); await load(); }}
        />
      )}

      {list.length === 0 && !creating && (
        <div className="bg-white rounded-lg border border-[#E2E8F0] p-8 text-center">
          <p className="text-sm text-[#64748B]">{studentName} 尚无行为干预计划</p>
          <p className="text-xs text-[#94A3B8] mt-1">当学生出现持续的问题行为时，应制定 BIP 并进行 ABC 功能分析</p>
        </div>
      )}

      {list.map((bip) => (
        <div key={bip.id} className="bg-white rounded-lg border border-[#E2E8F0] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h5 className="text-sm font-semibold text-[#1E293B]">{bip.target_behavior}</h5>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[bip.status] ?? STATUS_COLORS.draft}`}>
                  {BIP_STATUS_CN[bip.status] ?? bip.status}
                </span>
              </div>
              <p className="text-xs text-[#94A3B8] mt-1">
                {bip.plan_code} · 功能假设：{bip.behavior_function || '—'} · 开始：{bip.start_date || '—'}
                {bip.next_review_date ? ` · 复评：${bip.next_review_date}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => setExpandedId(expandedId === bip.id ? null : bip.id)}
                className="h-8 px-2.5 rounded-md border border-[#E2E8F0] text-xs text-[#64748B] hover:bg-[#F7F6F4] cursor-pointer flex items-center gap-1"
              >
                {expandedId === bip.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                {expandedId === bip.id ? '收起' : '详情'}
              </button>
              {canEdit && (
                <button
                  onClick={() => { setEditing(bip); setCreating(false); }}
                  className="h-8 px-2.5 rounded-md border border-[#E2E8F0] text-xs text-[#64748B] hover:bg-[#F7F6F4] cursor-pointer"
                >
                  编辑
                </button>
              )}
              {canEdit && (
                <button
                  onClick={() => void handleDelete(bip)}
                  className="h-8 px-2 rounded-md border border-[#FECACA] text-xs text-[#DC2626] hover:bg-[#FEF2F2] cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {expandedId === bip.id && (
            <BipDetail bip={bip} canRecord={canRecord} />
          )}
        </div>
      ))}
    </div>
  );
}

/* ============================================================
 * BIP 详情（ABC + 策略 + 事件台账）
 * ============================================================ */
function BipDetail({ bip, canRecord }: { bip: BipPlan; canRecord: boolean }) {
  const [incidents, setIncidents] = useState<BipIncident[] | null>(null);
  const [stat, setStat] = useState<IncidentStat | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetchIncidents(bip.id);
      setIncidents(r.list);
      setStat(r.stat);
    } catch {
      setIncidents([]);
      setStat(null);
    }
  }, [bip.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const Row = ({ label, value }: { label: string; value?: string | null }) =>
    value ? (
      <div>
        <p className="text-xs text-[#94A3B8] mb-0.5">{label}</p>
        <p className="text-sm text-[#475569]">{value}</p>
      </div>
    ) : null;

  return (
    <div className="border-t border-[#F1F5F9] px-4 py-4 space-y-4">
      {/* ABC 分析 */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-[#FFF9F0] rounded-lg p-3">
          <p className="text-xs font-bold text-[#B45309] mb-1">A · 前因</p>
          <p className="text-sm text-[#475569]">{bip.antecedent || '—'}</p>
        </div>
        <div className="bg-[#FEF2F2] rounded-lg p-3">
          <p className="text-xs font-bold text-[#DC2626] mb-1">B · 行为</p>
          <p className="text-sm text-[#475569]">{bip.behavior_desc || '—'}</p>
        </div>
        <div className="bg-[#EFF6FF] rounded-lg p-3">
          <p className="text-xs font-bold text-[#2563EB] mb-1">C · 后果</p>
          <p className="text-sm text-[#475569]">{bip.consequence || '—'}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
        <Row label="设定事件" value={bip.setting_events} />
        <Row label="替代行为" value={bip.replacement_behavior} />
        <Row label="前事干预" value={bip.prevention_strategy} />
        <Row label="强化策略" value={bip.reinforcement_strategy} />
        <Row label="强化时程" value={bip.reinforcement_schedule} />
        <Row label="后果策略" value={bip.consequence_strategy} />
        <Row label="危机处置" value={bip.crisis_procedure} />
      </div>

      {/* 事件台账 */}
      <div className="border-t border-[#F1F5F9] pt-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <h6 className="text-xs font-semibold text-[#1E293B]">行为事件台账（{incidents?.length ?? 0} 条）</h6>
            {stat && Number(stat.cnt) > 0 && (
              <span className="text-[11px] text-[#94A3B8]">
                平均有效性 {Number(stat.avg_effect ?? 0).toFixed(1)}/5
                {stat.avg_minutes != null && <> · 平均时长 {Number(stat.avg_minutes).toFixed(1)} 分钟</>}
                {Number(stat.injury_count ?? 0) > 0 && (
                  <> · <span className="text-[#DC2626]">受伤 {stat.injury_count} 次</span></>
                )}
              </span>
            )}
          </div>
          {canRecord && (
            <button
              onClick={() => setAdding(!adding)}
              className="flex items-center gap-1 text-xs text-[#977653] hover:underline cursor-pointer"
            >
              <FilePlus2 className="w-3.5 h-3.5" /> 登记事件
            </button>
          )}
        </div>

        {adding && (
          <IncidentForm
            bipId={bip.id}
            onCancel={() => setAdding(false)}
            onSaved={async () => { setAdding(false); await load(); }}
          />
        )}

        {incidents === null ? (
          <p className="text-xs text-[#94A3B8]">台账加载中...</p>
        ) : incidents.length === 0 ? (
          <p className="text-xs text-[#94A3B8]">尚无事件记录</p>
        ) : (
          <div className="space-y-2">
            {incidents.slice(0, 10).map((r) => (
              <div key={r.id} className="bg-[#F7F6F4] rounded-lg px-3 py-2.5 text-xs">
                <div className="flex items-center gap-2 flex-wrap text-[#64748B]">
                  <span className="font-medium text-[#1E293B]">{r.occurred_at}</span>
                  {r.location && <span>@{r.location}</span>}
                  <span className={`px-1.5 py-0.5 rounded ${
                    r.intensity === '重度' ? 'bg-[#FEE2E2] text-[#DC2626]' :
                    r.intensity === '中度' ? 'bg-[#FEF3C7] text-[#D97706]' :
                    'bg-[#ECFDF5] text-[#059669]'
                  }`}>{r.intensity}</span>
                  {Number(r.has_injury) === 1 && <span className="px-1.5 py-0.5 rounded bg-[#FEE2E2] text-[#DC2626]">有受伤</span>}
                  {r.effectiveness != null && <span>干预有效性 {r.effectiveness}/5</span>}
                  {r.reporter_name && <span>记录：{r.reporter_name}</span>}
                </div>
                {(r.antecedent || r.behavior || r.consequence) && (
                  <p className="mt-1.5 text-[#475569] leading-relaxed">
                    {r.antecedent && <>前因：{r.antecedent}；</>}
                    {r.behavior && <>行为：{r.behavior}；</>}
                    {r.consequence && <>后果：{r.consequence}</>}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================
 * BIP 编辑器
 * ============================================================ */
function BipEditor({
  studentId,
  bip,
  onCancel,
  onSaved,
}: {
  studentId: number;
  bip: BipPlan | null;
  onCancel: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const [form, setForm] = useState({
    target_behavior: bip?.target_behavior ?? '',
    behavior_function: bip?.behavior_function ?? '',
    antecedent: bip?.antecedent ?? '',
    behavior_desc: bip?.behavior_desc ?? '',
    consequence: bip?.consequence ?? '',
    setting_events: bip?.setting_events ?? '',
    replacement_behavior: bip?.replacement_behavior ?? '',
    prevention_strategy: bip?.prevention_strategy ?? '',
    reinforcement_strategy: bip?.reinforcement_strategy ?? '',
    reinforcement_schedule: bip?.reinforcement_schedule ?? '',
    consequence_strategy: bip?.consequence_strategy ?? '',
    crisis_procedure: bip?.crisis_procedure ?? '',
    start_date: bip?.start_date ?? '',
    status: bip?.status ?? 'draft',
  });
  const [saving, setSaving] = useState(false);

  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.target_behavior.trim()) { toast.error('目标行为不能为空'); return; }
    setSaving(true);
    try {
      await saveBip({
        id: bip?.id,
        student_id: studentId,
        ...form,
      });
      toast.success(bip ? 'BIP 已更新' : 'BIP 已创建');
      await onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const Area = ({ label, k, placeholder }: { label: string; k: keyof typeof form; placeholder?: string }) => (
    <div>
      <label className="block text-xs font-semibold text-[#1E293B] mb-1">{label}</label>
      <Textarea value={form[k]} onChange={(e) => set(k)(e.target.value)} placeholder={placeholder} rows={2} className="text-sm" />
    </div>
  );

  return (
    <div className="bg-[#FFFDF8] rounded-lg border border-[#F5E6C8] p-4 space-y-3">
      <h5 className="text-sm font-semibold text-[#1E293B]">{bip ? '编辑 BIP' : '新建 BIP'}</h5>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-[#1E293B] mb-1">目标行为（可观察描述）*</label>
          <input
            value={form.target_behavior}
            onChange={(e) => set('target_behavior')(e.target.value)}
            placeholder="如：集体课中离座奔跑"
            className="w-full h-9 px-3 rounded-md border border-[#E2E8F0] text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-[#1E293B] mb-1">行为功能假设</label>
          <select
            value={form.behavior_function}
            onChange={(e) => set('behavior_function')(e.target.value)}
            className="w-full h-9 px-3 rounded-md border border-[#E2E8F0] text-sm bg-white"
          >
            <option value="">请选择</option>
            {FUNCTION_OPTIONS.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Area label="A · 前因" k="antecedent" placeholder="行为发生前的情境" />
        <Area label="B · 行为描述" k="behavior_desc" placeholder="具体行为与强度" />
        <Area label="C · 后果" k="consequence" placeholder="行为后得到的反应" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Area label="替代行为" k="replacement_behavior" />
        <Area label="前事干预" k="prevention_strategy" />
        <Area label="强化策略" k="reinforcement_strategy" />
        <Area label="强化时程" k="reinforcement_schedule" />
        <Area label="后果策略" k="consequence_strategy" />
        <Area label="危机处置" k="crisis_procedure" />
      </div>
      <div className="grid grid-cols-3 gap-3 items-end">
        <div>
          <label className="block text-xs font-semibold text-[#1E293B] mb-1">开始日期</label>
          <input type="date" value={form.start_date} onChange={(e) => set('start_date')(e.target.value)} className="w-full h-9 px-3 rounded-md border border-[#E2E8F0] text-sm" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-[#1E293B] mb-1">状态</label>
          <select value={form.status} onChange={(e) => set('status')(e.target.value)} className="w-full h-9 px-3 rounded-md border border-[#E2E8F0] text-sm bg-white">
            {Object.entries(BIP_STATUS_CN).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2 justify-end">
          <button onClick={onCancel} disabled={saving} className="h-9 px-3 rounded-md border border-[#CBD5E1] text-xs font-medium text-[#64748B] hover:bg-[#F7F6F4] cursor-pointer disabled:opacity-60">
            取消
          </button>
          <button
            onClick={() => void handleSave()}
            disabled={saving}
            className="flex items-center gap-1 h-9 px-3 rounded-md bg-[#977653] text-white text-xs font-medium hover:bg-[#7A5F42] cursor-pointer disabled:opacity-60"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
 * 事件登记表单
 * ============================================================ */
function IncidentForm({
  bipId,
  onCancel,
  onSaved,
}: {
  bipId: number;
  onCancel: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const [occurredAt, setOccurredAt] = useState(
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`,
  );
  const [location, setLocation] = useState('');
  const [antecedent, setAntecedent] = useState('');
  const [behavior, setBehavior] = useState('');
  const [consequence, setConsequence] = useState('');
  const [intensity, setIntensity] = useState<string>('中度');
  const [intervention, setIntervention] = useState('');
  const [effectiveness, setEffectiveness] = useState(3);
  const [hasInjury, setHasInjury] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!occurredAt) { toast.error('发生时间不能为空'); return; }
    setSaving(true);
    try {
      await addIncident({
        bip_id: bipId,
        occurred_at: occurredAt.replace('T', ' ') + ':00',
        location: location || undefined,
        antecedent: antecedent || undefined,
        behavior: behavior || undefined,
        consequence: consequence || undefined,
        intensity,
        intervention_used: intervention || undefined,
        effectiveness,
        has_injury: hasInjury,
      });
      toast.success('事件已登记');
      await onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '登记失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-lg border border-[#F5E6C8] p-3.5 space-y-3 mb-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-[#1E293B] mb-1">发生时间 *</label>
          <input type="datetime-local" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} className="w-full h-9 px-3 rounded-md border border-[#E2E8F0] text-sm" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-[#1E293B] mb-1">地点</label>
          <input value={location} onChange={(e) => setLocation(e.target.value)} className="w-full h-9 px-3 rounded-md border border-[#E2E8F0] text-sm" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-semibold text-[#1E293B] mb-1">前因</label>
          <input value={antecedent} onChange={(e) => setAntecedent(e.target.value)} className="w-full h-9 px-3 rounded-md border border-[#E2E8F0] text-sm" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-[#1E293B] mb-1">行为</label>
          <input value={behavior} onChange={(e) => setBehavior(e.target.value)} className="w-full h-9 px-3 rounded-md border border-[#E2E8F0] text-sm" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-[#1E293B] mb-1">后果</label>
          <input value={consequence} onChange={(e) => setConsequence(e.target.value)} className="w-full h-9 px-3 rounded-md border border-[#E2E8F0] text-sm" />
        </div>
      </div>
      <div className="grid grid-cols-4 gap-3 items-end">
        <div>
          <label className="block text-xs font-semibold text-[#1E293B] mb-1">强度</label>
          <select value={intensity} onChange={(e) => setIntensity(e.target.value)} className="w-full h-9 px-3 rounded-md border border-[#E2E8F0] text-sm bg-white">
            {BIP_INTENSITIES.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-[#1E293B] mb-1">所用干预</label>
          <input value={intervention} onChange={(e) => setIntervention(e.target.value)} className="w-full h-9 px-3 rounded-md border border-[#E2E8F0] text-sm" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-[#1E293B] mb-1">干预有效性 {effectiveness}/5</label>
          <input type="range" min={1} max={5} value={effectiveness} onChange={(e) => setEffectiveness(Number(e.target.value))} className="w-full" />
        </div>
        <label className="flex items-center gap-2 text-xs text-[#475569] cursor-pointer pb-2">
          <input type="checkbox" checked={hasInjury} onChange={(e) => setHasInjury(e.target.checked)} className="w-4 h-4 rounded border-[#CBD5E1]" />
          有人员受伤
        </label>
      </div>
      <div className="flex items-center justify-end gap-2">
        <button onClick={onCancel} disabled={saving} className="h-8 px-3 rounded-md border border-[#CBD5E1] text-xs font-medium text-[#64748B] hover:bg-[#F7F6F4] cursor-pointer disabled:opacity-60">取消</button>
        <button
          onClick={() => void handleSave()}
          disabled={saving}
          className="flex items-center gap-1 h-8 px-3 rounded-md bg-[#977653] text-white text-xs font-medium hover:bg-[#7A5F42] cursor-pointer disabled:opacity-60"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          {saving ? '登记中...' : '登记'}
        </button>
      </div>
    </div>
  );
}
