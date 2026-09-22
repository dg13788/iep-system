/**
 * 学生详情 - 安全档案页签（v4 特教专业内核 6.4）
 *
 * 教学现场安全刚需：癫痫史与急救、过敏原与肾上腺素笔、饮食/吞咽禁忌、
 * 攻击行为触发与降阶、危机处置与禁止做法、走失风险、如厕依赖、看护等级。
 * 附「紧急情况一览卡」（可打印给代课/实习教师的一页纸）。
 */
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Save, Printer, ShieldAlert, AlertTriangle } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { useAuthStore } from '@/store/authStore';
import {
  fetchSafetyProfile,
  saveSafetyProfile,
  fetchEmergencyCard,
  DIET_TEXTURES,
  WANDERING_RISKS,
  TOILET_LEVELS,
  SUPERVISION_LEVELS,
} from '@/services/students';
import type { EmergencyCard, SafetyProfile } from '@/services/students';

function parseAllergens(raw: string | null | undefined): string {
  if (!raw) return '';
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.join('、') : raw;
  } catch {
    return raw;
  }
}

export default function SafetyTab({ studentId, studentName }: { studentId: number; studentName: string }) {
  const hasFeature = useAuthStore((s) => s.hasFeature);
  const canEdit = hasFeature('student_edit');

  const [profile, setProfile] = useState<SafetyProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCard, setShowCard] = useState(false);
  const [card, setCard] = useState<EmergencyCard | null>(null);
  const [cardLoading, setCardLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setProfile((await fetchSafetyProfile(studentId)) ?? {});
    } catch {
      setProfile({});
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const set = (patch: Partial<SafetyProfile>) => setProfile((p) => ({ ...(p ?? {}), ...patch }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = { ...(profile ?? {}), student_id: studentId };
      // 过敏原以数组形式回传（后端做 JSON 序列化）
      if (typeof payload.allergens === 'string') {
        payload.allergens = payload.allergens
          .split(/[、,，;；\n]/)
          .map((s: string) => s.trim())
          .filter(Boolean);
      }
      delete payload.id;
      await saveSafetyProfile(payload as Partial<SafetyProfile> & { student_id: number });
      toast.success('安全档案已保存');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const openCard = async () => {
    setCardLoading(true);
    setShowCard(true);
    try {
      setCard(await fetchEmergencyCard(studentId));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '紧急卡加载失败');
      setShowCard(false);
    } finally {
      setCardLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-[#E2E8F0] p-8 flex items-center justify-center text-[#64748B]">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> 安全档案加载中...
      </div>
    );
  }

  const p = profile ?? {};
  const Field = ({ label, k, placeholder }: { label: string; k: keyof SafetyProfile; placeholder?: string }) => (
    <div>
      <label className="block text-xs font-semibold text-[#1E293B] mb-1">{label}</label>
      {canEdit ? (
        <Textarea
          value={String(p[k] ?? '')}
          onChange={(e) => set({ [k]: e.target.value } as Partial<SafetyProfile>)}
          placeholder={placeholder}
          rows={2}
          className="text-sm"
        />
      ) : (
        <p className="text-sm text-[#475569] bg-[#F7F6F4] rounded-md px-3 py-2 min-h-[2.5rem]">
          {String(p[k] ?? '') || '—'}
        </p>
      )}
    </div>
  );

  const SelectField = ({
    label,
    k,
    options,
  }: {
    label: string;
    k: keyof SafetyProfile;
    options: Record<string, string> | readonly string[];
  }) => {
    const entries: Array<[string, string]> = Array.isArray(options)
      ? (options as readonly string[]).map((o) => [o, o] as [string, string])
      : Object.entries(options);
    return (
      <div>
        <label className="block text-xs font-semibold text-[#1E293B] mb-1">{label}</label>
        {canEdit ? (
          <select
            value={String(p[k] ?? '')}
            onChange={(e) => set({ [k]: e.target.value } as Partial<SafetyProfile>)}
            className="w-full h-9 px-3 rounded-md border border-[#E2E8F0] text-sm bg-white"
          >
            <option value="">未填写</option>
            {entries.map(([v, label2]) => (
              <option key={v} value={v}>{label2}</option>
            ))}
          </select>
        ) : (
          <p className="text-sm text-[#475569] bg-[#F7F6F4] rounded-md px-3 py-2">
            {entries.find(([v]) => v === p[k])?.[1] ?? (String(p[k] ?? '') || '—')}
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* 高危警示条 */}
      {(Number(p.has_epilepsy) === 1 || parseAllergens(p.allergens) || p.wandering_risk === 'high') && (
        <div className="bg-[#FEF2F2] border border-[#FECACA] rounded-lg px-4 py-3 flex items-start gap-2">
          <ShieldAlert className="w-4 h-4 text-[#DC2626] mt-0.5 shrink-0" />
          <div className="text-xs text-[#991B1B] leading-relaxed">
            <strong>高危提示：</strong>
            {Number(p.has_epilepsy) === 1 && '该生有癫痫史；'}
            {parseAllergens(p.allergens) && `过敏原：${parseAllergens(p.allergens)}；`}
            {p.wandering_risk === 'high' && '走失风险高。'}
            请全体带班教师熟知处置流程。
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-[#1E293B] flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-warning-500" /> 教学现场安全档案
        </h4>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void openCard()}
            className="flex items-center gap-1 h-8 px-3 rounded-md border border-[#977653] text-[#977653] text-xs font-medium hover:bg-[#F5F0EB] cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" /> 紧急情况一览卡
          </button>
          {canEdit && (
            <button
              onClick={() => void handleSave()}
              disabled={saving}
              className="flex items-center gap-1 h-8 px-3 rounded-md bg-[#977653] text-white text-xs font-medium hover:bg-[#7A5F42] cursor-pointer disabled:opacity-60"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              {saving ? '保存中...' : '保存档案'}
            </button>
          )}
        </div>
      </div>

      {/* 癫痫与急救 */}
      <div className="bg-white rounded-lg border border-[#E2E8F0] p-5 space-y-3">
        <h5 className="text-sm font-semibold text-[#1E293B]">癫痫史与急救</h5>
        <label className="flex items-center gap-2 text-sm text-[#475569] cursor-pointer">
          <input
            type="checkbox"
            checked={Number(p.has_epilepsy) === 1}
            disabled={!canEdit}
            onChange={(e) => set({ has_epilepsy: e.target.checked ? 1 : 0 })}
            className="w-4 h-4 rounded border-[#CBD5E1]"
          />
          有癫痫史
        </label>
        {Number(p.has_epilepsy) === 1 && (
          <div className="grid grid-cols-1 gap-3">
            <Field label="发作类型" k="seizure_type" placeholder="如：强直-阵挛发作，约2~3分钟" />
            <Field label="现场急救方案" k="seizure_first_aid" placeholder="侧卧、清理周围硬物、记录时长、不塞物入口..." />
            <Field label="急救药物与存放" k="rescue_medication" placeholder="如：地西泮直肠给药，存放于校医室" />
          </div>
        )}
      </div>

      {/* 过敏与饮食 */}
      <div className="bg-white rounded-lg border border-[#E2E8F0] p-5 space-y-3">
        <h5 className="text-sm font-semibold text-[#1E293B]">过敏与饮食安全</h5>
        <div>
          <label className="block text-xs font-semibold text-[#1E293B] mb-1">过敏原清单（顿号分隔）</label>
          {canEdit ? (
            <Textarea
              value={parseAllergens(p.allergens)}
              onChange={(e) => {
                const arr = e.target.value.split(/[、,，;；\n]/).map((s) => s.trim()).filter(Boolean);
                set({ allergens: JSON.stringify(arr) });
              }}
              placeholder="如：花生、牛奶、海鲜"
              rows={2}
              className="text-sm"
            />
          ) : (
            <p className="text-sm text-[#475569] bg-[#F7F6F4] rounded-md px-3 py-2">{parseAllergens(p.allergens) || '—'}</p>
          )}
        </div>
        <div className="grid grid-cols-1 gap-3">
          <Field label="过敏反应表现" k="allergy_reaction" />
          <Field label="严重过敏反应（过敏性休克）处置" k="anaphylaxis_action" />
          <Field label="肾上腺素笔位置" k="epipen_location" />
          <SelectField label="饮食性状" k="diet_texture" options={DIET_TEXTURES} />
          <Field label="吞咽/进食禁忌" k="swallowing_precaution" />
          <Field label="禁食清单" k="food_taboo" />
        </div>
      </div>

      {/* 行为与危机处置 */}
      <div className="bg-white rounded-lg border border-[#E2E8F0] p-5 space-y-3">
        <h5 className="text-sm font-semibold text-[#1E293B]">行为触发与危机处置</h5>
        <div className="grid grid-cols-1 gap-3">
          <Field label="攻击/自伤行为触发因素" k="aggression_trigger" />
          <Field label="降阶策略（先做什么）" k="deescalation" />
          <Field label="危机处置流程" k="crisis_procedure" />
          <Field label="禁止做法" k="prohibited_response" placeholder="如：禁止强行按压、禁止当众呵斥" />
        </div>
      </div>

      {/* 日常看护 */}
      <div className="bg-white rounded-lg border border-[#E2E8F0] p-5 space-y-3">
        <h5 className="text-sm font-semibold text-[#1E293B]">日常看护</h5>
        <div className="grid grid-cols-2 gap-3">
          <SelectField label="走失风险" k="wandering_risk" options={WANDERING_RISKS} />
          <SelectField label="如厕依赖等级" k="toilet_independence" options={TOILET_LEVELS} />
          <SelectField label="看护等级" k="supervision_level" options={SUPERVISION_LEVELS} />
        </div>
        <Field label="走失应对措施" k="wandering_response" />
        <Field label="行动辅具" k="mobility_aid" placeholder="如：轮椅、助行器" />
      </div>

      {p.emergency_updated_at && (
        <p className="text-xs text-[#94A3B8]">安全信息最近更新：{p.emergency_updated_at}</p>
      )}

      {/* 紧急情况一览卡（打印用） */}
      {showCard && (
        <div className="fixed inset-0 z-[80] bg-black/50 flex items-center justify-center p-6" onClick={() => setShowCard(false)}>
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-[560px] max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#E2E8F0] print:hidden">
              <h3 className="text-base font-semibold text-[#1E293B]">紧急情况一览卡</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-1 h-8 px-3 rounded-md bg-[#977653] text-white text-xs font-medium hover:bg-[#7A5F42] cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" /> 打印
                </button>
                <button onClick={() => setShowCard(false)} className="text-xs text-[#64748B] hover:underline cursor-pointer">关闭</button>
              </div>
            </div>
            {cardLoading || !card ? (
              <div className="p-10 flex items-center justify-center text-[#64748B]">
                <Loader2 className="w-5 h-5 animate-spin mr-2" /> 生成中...
              </div>
            ) : (
              <div className="p-6 space-y-4" id="emergency-card-print">
                <div className="border-2 border-[#DC2626] rounded-lg p-4">
                  <h3 className="text-xl font-bold text-center text-[#1E293B]">
                    紧急情况一览卡 —— {String(card.name ?? studentName)}
                  </h3>
                  <p className="text-center text-sm text-[#64748B] mt-1">
                    {String(card.class_name ?? '')} · {String(card.gender ?? '')} · {String(card.birth_date ?? '')}
                    {card.disability_type_name ? ` · ${String(card.disability_type_name)}` : ''}
                    {card.disability_level_name ? `（${String(card.disability_level_name)}）` : ''}
                  </p>
                </div>

                <CardBlock title="紧急联系" rows={[
                  ['监护人', `${String(card.guardian_name ?? '')} ${String(card.guardian_phone ?? '')}`],
                  ['紧急联系人', `${String(card.emergency_contact ?? '')} ${String(card.emergency_phone ?? '')}`],
                ]} />

                {Number(card.has_epilepsy) === 1 && (
                  <CardBlock danger title="癫痫急救" rows={[
                    ['发作类型', String(card.seizure_type ?? '')],
                    ['现场急救', String(card.seizure_first_aid ?? '')],
                    ['急救药物', String(card.rescue_medication ?? '')],
                  ]} />
                )}

                {(parseAllergens(String(card.allergens ?? '')) || Boolean(card.anaphylaxis_action)) && (
                  <CardBlock danger title="过敏与急救" rows={[
                    ['过敏原', parseAllergens(String(card.allergens ?? ''))],
                    ['反应表现', String(card.allergy_reaction ?? '')],
                    ['休克处置', String(card.anaphylaxis_action ?? '')],
                    ['肾上腺素笔', String(card.epipen_location ?? '')],
                  ]} />
                )}

                <CardBlock title="饮食与吞咽" rows={[
                  ['饮食性状', String(card.diet_texture ?? '')],
                  ['吞咽禁忌', String(card.swallowing_precaution ?? '')],
                  ['禁食清单', String(card.food_taboo ?? '')],
                ]} />

                <CardBlock title="行为与危机" rows={[
                  ['触发因素', String(card.aggression_trigger ?? '')],
                  ['降阶策略', String(card.deescalation ?? '')],
                  ['危机流程', String(card.crisis_procedure ?? '')],
                  ['禁止做法', String(card.prohibited_response ?? '')],
                ]} />

                <CardBlock title="看护与走失" rows={[
                  ['看护等级', String(card.supervision_level ?? '')],
                  ['走失风险', WANDERING_RISKS[String(card.wandering_risk ?? '')] ?? String(card.wandering_risk ?? '')],
                  ['如厕依赖', TOILET_LEVELS[String(card.toilet_independence ?? '')] ?? String(card.toilet_independence ?? '')],
                  ['行动辅具', String(card.mobility_aid ?? '')],
                ]} />

                {(card.communication_methods || card.communication_notes) && (
                  <CardBlock title="沟通方式" rows={[
                    ['沟通方式', String(card.communication_methods ?? '')],
                    ['辅具', String(card.aac_device ?? '')],
                    ['说明', String(card.communication_notes ?? '')],
                  ]} />
                )}

                <p className="text-xs text-center text-[#94A3B8]">
                  本卡信息最近更新：{String(card.emergency_updated_at ?? '—')} · 请带班教师随身携带
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CardBlock({
  title,
  rows,
  danger,
}: {
  title: string;
  rows: Array<[string, string]>;
  danger?: boolean;
}) {
  const visible = rows.filter(([, v]) => v && v.trim());
  if (visible.length === 0) return null;
  return (
    <div className={`border rounded-lg p-3.5 ${danger ? 'border-[#FECACA] bg-[#FFF7F7]' : 'border-[#E2E8F0]'}`}>
      <h4 className={`text-sm font-bold mb-2 ${danger ? 'text-[#DC2626]' : 'text-[#1E293B]'}`}>{title}</h4>
      <dl className="space-y-1.5">
        {visible.map(([k, v]) => (
          <div key={k} className="flex gap-3 text-sm">
            <dt className="shrink-0 w-20 text-[#64748B]">{k}</dt>
            <dd className="flex-1 text-[#1E293B]">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
