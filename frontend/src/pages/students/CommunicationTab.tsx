/**
 * 学生详情 - 沟通方式页签（v4 特教专业内核 6.5）
 *
 * 口语 / 手势 / 手语 / PECS / AAC 等沟通方式直接影响目标设定与评量方式。
 * 沟通方式 code 由 /iep/meta 的 dict_common(communication_method) 提供，后端写入时强校验。
 */
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Save, MessagesSquare } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { useAuthStore } from '@/store/authStore';
import { fetchCommunication, saveCommunication } from '@/services/students';
import type { CommunicationProfile } from '@/services/students';
import { fetchIEPMeta } from '@/services/iep';

const LEVEL_OPTIONS = ['独立', '少量提示', '中度辅助', '完全依赖'];

export default function CommunicationTab({ studentId }: { studentId: number }) {
  const hasFeature = useAuthStore((s) => s.hasFeature);
  const canEdit = hasFeature('student_edit');

  const [profile, setProfile] = useState<CommunicationProfile>({
    communication_methods: [],
    communication_notes: '',
    aac_device: '',
    receptive_level: '',
    expressive_level: '',
  });
  const [methodDict, setMethodDict] = useState<Array<{ code: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, meta] = await Promise.all([fetchCommunication(studentId), fetchIEPMeta()]);
      setProfile(p);
      setMethodDict(meta.communication_methods.map((m) => ({ code: m.code, name: m.name })));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleMethod = (code: string) => {
    if (!canEdit) return;
    setProfile((prev) => ({
      ...prev,
      communication_methods: prev.communication_methods.includes(code)
        ? prev.communication_methods.filter((c) => c !== code)
        : [...prev.communication_methods, code],
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveCommunication({ student_id: studentId, ...profile });
      toast.success('沟通方式已保存');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-[#E2E8F0] p-8 flex items-center justify-center text-[#64748B]">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> 沟通方式加载中...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg border border-[#E2E8F0] p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-[#1E293B] flex items-center gap-2">
            <MessagesSquare className="w-4 h-4 text-primary-500" /> 沟通方式
          </h4>
          {canEdit && (
            <button
              onClick={() => void handleSave()}
              disabled={saving}
              className="flex items-center gap-1 h-8 px-3 rounded-md bg-[#977653] text-white text-xs font-medium hover:bg-[#7A5F42] cursor-pointer disabled:opacity-60"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              {saving ? '保存中...' : '保存'}
            </button>
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold text-[#1E293B] mb-2">主要沟通方式（可多选）</label>
          <div className="flex flex-wrap gap-2">
            {(methodDict.length > 0
              ? methodDict
              : [
                  { code: 'speech', name: '口语' },
                  { code: 'gesture', name: '手势' },
                  { code: 'sign', name: '手语' },
                  { code: 'pecs', name: 'PECS 图片交换' },
                  { code: 'aac', name: 'AAC 辅具' },
                ]
            ).map((m) => {
              const active = profile.communication_methods.includes(m.code);
              return (
                <button
                  key={m.code}
                  onClick={() => toggleMethod(m.code)}
                  disabled={!canEdit}
                  className={`h-9 px-4 rounded-full border text-sm font-medium transition-all cursor-pointer disabled:cursor-default ${
                    active
                      ? 'border-transparent bg-[#977653] text-white'
                      : 'border-[#E2E8F0] text-[#64748B] hover:border-[#CBD5E1]'
                  }`}
                >
                  {m.name}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-[#1E293B] mb-1.5">理解水平（接受性语言）</label>
            <select
              value={profile.receptive_level}
              disabled={!canEdit}
              onChange={(e) => setProfile((p) => ({ ...p, receptive_level: e.target.value }))}
              className="w-full h-9 px-3 rounded-md border border-[#E2E8F0] text-sm bg-white disabled:bg-[#F7F6F4]"
            >
              <option value="">未评估</option>
              {LEVEL_OPTIONS.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#1E293B] mb-1.5">表达水平（表达性语言）</label>
            <select
              value={profile.expressive_level}
              disabled={!canEdit}
              onChange={(e) => setProfile((p) => ({ ...p, expressive_level: e.target.value }))}
              className="w-full h-9 px-3 rounded-md border border-[#E2E8F0] text-sm bg-white disabled:bg-[#F7F6F4]"
            >
              <option value="">未评估</option>
              {LEVEL_OPTIONS.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-[#1E293B] mb-1.5">AAC 辅具</label>
          {canEdit ? (
            <input
              value={profile.aac_device}
              onChange={(e) => setProfile((p) => ({ ...p, aac_device: e.target.value }))}
              placeholder="如：平板沟通软件（TD Snap）、PECS 沟通本"
              className="w-full h-9 px-3 rounded-md border border-[#E2E8F0] text-sm"
            />
          ) : (
            <p className="text-sm text-[#475569] bg-[#F7F6F4] rounded-md px-3 py-2">{profile.aac_device || '—'}</p>
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold text-[#1E293B] mb-1.5">沟通说明（教学提示）</label>
          {canEdit ? (
            <Textarea
              value={profile.communication_notes}
              onChange={(e) => setProfile((p) => ({ ...p, communication_notes: e.target.value }))}
              placeholder="如：指令需配合实物呈现；等待反应时间不少于 5 秒；能指认 30 张图卡"
              rows={3}
              className="text-sm"
            />
          ) : (
            <p className="text-sm text-[#475569] bg-[#F7F6F4] rounded-md px-3 py-2 min-h-[3rem]">
              {profile.communication_notes || '—'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
