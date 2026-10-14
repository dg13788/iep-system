/**
 * IEP 详情 - 服务与会议面板（v4 特教专业内核 6.2）
 *
 * - 相关服务台账：康复训练 / 心理辅导 / 辅助器具等，从自由文本变为
 *   可开具、可追踪的执行台账（计划次数 / 已完成 / 频次 / 时长 / 状态）。
 * - IEP 会议参与人：签到留痕，team_members(JSON) 只是名单，不是签署证据。
 */
import { useCallback, useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { X, Plus, Trash2, Loader2, CheckCircle, Handshake, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDrawerA11y } from '@/hooks/useDrawerA11y';
import { useDialogFocus } from '@/hooks/useDialogFocus';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  deleteRelatedService,
  fetchIEPMeta,
  fetchMeetingParticipants,
  fetchRelatedServices,
  saveMeetingParticipant,
  saveRelatedService,
  SERVICE_STATUS_CN,
  PARTICIPANT_TYPE_CN,
  ATTENDANCE_CN,
} from '@/services/iep';
import type { IEPMeta, MeetingParticipant, RelatedService } from '@/services/iep';
import { useConfirm } from '@/components/feedback/ConfirmProvider';

const SERVICE_STATUS_COLORS: Record<string, string> = {
  planned: 'bg-surface-2 text-ink-2',
  active: 'bg-info-soft text-info-strong',
  completed: 'bg-success-soft text-success-strong',
  suspended: 'bg-warning-soft text-warning-strong',
};

interface ServicesMeetingPanelProps {
  planId: number;
  canEdit: boolean;
}

export default function ServicesMeetingPanel({ planId, canEdit }: ServicesMeetingPanelProps) {
  const [meta, setMeta] = useState<IEPMeta | null>(null);
  const [services, setServices] = useState<RelatedService[]>([]);
  const [participants, setParticipants] = useState<MeetingParticipant[]>([]);
  const [loading, setLoading] = useState(true);
  const [editService, setEditService] = useState<RelatedService | null>(null);
  const [serviceSheetOpen, setServiceSheetOpen] = useState(false);
  const [participantSheetOpen, setParticipantSheetOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [m, svcs, mps] = await Promise.all([
        fetchIEPMeta(),
        fetchRelatedServices(planId),
        fetchMeetingParticipants(planId),
      ]);
      setMeta(m);
      setServices(svcs);
      setParticipants(mps);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [planId]);

  useEffect(() => {
    void load();
  }, [load]);

  const confirm = useConfirm();

  const handleDeleteService = async (svc: RelatedService) => {
    const ok = await confirm({
      title: '删除这项相关服务？',
      description: (
        <>
          将删除「{svc.service_name || '该服务项'}」。
          <b className="text-danger-strong">删除后不可撤销</b>
          ，IEP 中的服务安排会相应减少。
        </>
      ),
      confirmText: '删除',
    });
    if (!ok) return;
    try {
      await deleteRelatedService(planId, svc.id);
      toast.success('服务项已删除');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '删除失败');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-ink-2">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> 加载中...
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* ============ 相关服务台账 ============ */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h4 className="flex items-center gap-2 text-base font-semibold text-ink">
            <Handshake className="w-4 h-4 text-brand-ink" /> 相关服务台账
          </h4>
          {canEdit && (
            <button
              onClick={() => { setEditService(null); setServiceSheetOpen(true); }}
              className="flex items-center gap-1 h-8 px-3 rounded-md border border-brand text-brand-ink text-xs font-medium hover:bg-brand-soft cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> 开具服务
            </button>
          )}
        </div>

        {services.length === 0 ? (
          <div className="bg-canvas rounded-lg p-8 text-center">
            <p className="text-sm text-ink-2">尚未开具相关服务（康复训练 / 心理辅导 / 辅助器具 / 交通等）</p>
          </div>
        ) : (
          <div className="border border-line rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-canvas text-left text-xs text-ink-2">
                  <th className="px-4 py-2.5 font-medium">服务项目</th>
                  <th className="px-4 py-2.5 font-medium">提供者</th>
                  <th className="px-4 py-2.5 font-medium">频次</th>
                  <th className="px-4 py-2.5 font-medium">时长</th>
                  <th className="px-4 py-2.5 font-medium">执行进度</th>
                  <th className="px-4 py-2.5 font-medium">状态</th>
                  {canEdit && <th className="px-4 py-2.5 font-medium w-24">操作</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {services.map((svc) => {
                  const planned = Number(svc.planned_sessions) || 0;
                  const done = Number(svc.completed_sessions) || 0;
                  const pct = planned > 0 ? Math.round((done / planned) * 100) : 0;
                  return (
                    <tr key={svc.id} className="text-ink-2">
                      <td className="px-4 py-3">
                        <div className="font-medium text-ink">{svc.service_name}</div>
                        {svc.location && <div className="text-xs text-ink-3">{svc.location}</div>}
                      </td>
                      <td className="px-4 py-3">
                        {svc.provider || '—'}
                        {svc.provider_role && <span className="text-xs text-ink-3">（{svc.provider_role}）</span>}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">{Number(svc.frequency_per_week) || 1} 次/周</td>
                      <td className="px-4 py-3 whitespace-nowrap">{Number(svc.minutes_per_session) || 40} 分钟</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-20 h-1.5 bg-surface-2 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${Math.min(pct, 100)}%`, background: 'rgb(var(--brand))' }}
                            />
                          </div>
                          <span className="text-xs text-ink-2 whitespace-nowrap">{done}/{planned}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', SERVICE_STATUS_COLORS[svc.status] ?? SERVICE_STATUS_COLORS.planned)}>
                          {SERVICE_STATUS_CN[svc.status] ?? svc.status}
                        </span>
                      </td>
                      {canEdit && (
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => { setEditService(svc); setServiceSheetOpen(true); }}
                              className="h-7 px-2 rounded border border-line text-xs text-ink-2 hover:bg-canvas cursor-pointer"
                            >
                              编辑
                            </button>
                            <button
                              onClick={() => void handleDeleteService(svc)}
                              className="h-7 px-1.5 rounded border border-danger-line text-xs text-danger-strong hover:bg-danger-soft cursor-pointer"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ============ IEP 会议参与人 ============ */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h4 className="flex items-center gap-2 text-base font-semibold text-ink">
            <Users className="w-4 h-4 text-brand-ink" /> IEP 会议参与人（签到留痕）
          </h4>
          {canEdit && (
            <button
              onClick={() => setParticipantSheetOpen(true)}
              className="flex items-center gap-1 h-8 px-3 rounded-md border border-brand text-brand-ink text-xs font-medium hover:bg-brand-soft cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> 添加参与人
            </button>
          )}
        </div>

        {participants.length === 0 ? (
          <div className="bg-canvas rounded-lg p-8 text-center">
            <p className="text-sm text-ink-2">尚未记录 IEP 会议参与人</p>
          </div>
        ) : (
          <div className="border border-line rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-canvas text-left text-xs text-ink-2">
                  <th className="px-4 py-2.5 font-medium">姓名</th>
                  <th className="px-4 py-2.5 font-medium">类型</th>
                  <th className="px-4 py-2.5 font-medium">角色</th>
                  <th className="px-4 py-2.5 font-medium">出席</th>
                  <th className="px-4 py-2.5 font-medium">签到时间</th>
                  <th className="px-4 py-2.5 font-medium">备注</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {participants.map((mp) => (
                  <tr key={mp.id} className="text-ink-2">
                    <td className="px-4 py-3 font-medium text-ink">{mp.name}</td>
                    <td className="px-4 py-3">{PARTICIPANT_TYPE_CN[mp.participant_type] ?? mp.participant_type}</td>
                    <td className="px-4 py-3">{mp.role || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        'px-2 py-0.5 rounded-full text-xs font-medium',
                        mp.attendance === 'present'
                          ? 'bg-success-soft text-success-strong'
                          : mp.attendance === 'proxy'
                            ? 'bg-info-soft text-info-strong'
                            : 'bg-surface-2 text-ink-3',
                      )}>
                        {ATTENDANCE_CN[mp.attendance] ?? mp.attendance}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs">{mp.signed_at || '—'}</td>
                    <td className="px-4 py-3 text-xs text-ink-3 max-w-[180px] truncate" title={mp.remark ?? ''}>
                      {mp.remark || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 开具/编辑服务抽屉 */}
      <AnimatePresence>
        {serviceSheetOpen && (
          <ServiceSheet
            key="svc"
            planId={planId}
            service={editService}
            dict={meta?.related_services ?? []}
            onClose={() => setServiceSheetOpen(false)}
            onSaved={async () => { setServiceSheetOpen(false); await load(); }}
          />
        )}
      </AnimatePresence>

      {/* 添加参与人抽屉 */}
      <AnimatePresence>
        {participantSheetOpen && (
          <ParticipantSheet
            key="mp"
            planId={planId}
            onClose={() => setParticipantSheetOpen(false)}
            onSaved={async () => { setParticipantSheetOpen(false); await load(); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ============================================================
 * 开具/编辑相关服务抽屉
 * ============================================================ */
function ServiceSheet({
  planId,
  service,
  dict,
  onClose,
  onSaved,
}: {
  planId: number;
  service: RelatedService | null;
  dict: IEPMeta['related_services'];
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const [serviceName, setServiceName] = useState(service?.service_name ?? '');
  const [provider, setProvider] = useState(service?.provider ?? '');
  const [providerRole, setProviderRole] = useState(service?.provider_role ?? '');
  const [frequency, setFrequency] = useState(Number(service?.frequency_per_week) || 1);
  const [minutes, setMinutes] = useState(Number(service?.minutes_per_session) || 40);
  const [planned, setPlanned] = useState(Number(service?.planned_sessions) || 0);
  const [completed, setCompleted] = useState(Number(service?.completed_sessions) || 0);
  const [location, setLocation] = useState(service?.location ?? '');
  const [status, setStatus] = useState(service?.status ?? 'planned');
  const [remark, setRemark] = useState(service?.remark ?? '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!serviceName.trim()) { toast.error('请选择或填写服务项目'); return; }
    setSaving(true);
    try {
      await saveRelatedService({
        id: service?.id,
        plan_id: planId,
        service_name: serviceName.trim(),
        provider: provider || undefined,
        provider_role: providerRole || undefined,
        frequency_per_week: frequency,
        minutes_per_session: minutes,
        planned_sessions: planned,
        completed_sessions: completed,
        location: location || undefined,
        status,
        remark: remark || undefined,
      });
      toast.success('服务项已保存');
      await onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SheetShell title={service ? '编辑相关服务' : '开具相关服务'} onClose={onClose}>
      <div>
        <label className="block text-sm font-semibold text-ink mb-1.5">服务项目 *</label>
        {dict.length > 0 ? (
          <Select value={serviceName} onValueChange={setServiceName}>
            <SelectTrigger className="h-10"><SelectValue placeholder="从服务字典选择" /></SelectTrigger>
            <SelectContent>
              {dict.map((d) => (
                <SelectItem key={d.code} value={d.name}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <input
            value={serviceName}
            onChange={(e) => setServiceName(e.target.value)}
            className="w-full h-11 lg:h-10 px-3 rounded-md border border-line text-sm"
          />
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-semibold text-ink mb-1.5">提供者</label>
          <input value={provider} onChange={(e) => setProvider(e.target.value)} className="w-full h-11 lg:h-10 px-3 rounded-md border border-line text-sm" />
        </div>
        <div>
          <label className="block text-sm font-semibold text-ink mb-1.5">提供者角色</label>
          <input value={providerRole} onChange={(e) => setProviderRole(e.target.value)} placeholder="如：言语治疗师" className="w-full h-11 lg:h-10 px-3 rounded-md border border-line text-sm" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-semibold text-ink mb-1.5">频次（次/周）</label>
          <input type="number" min={0.5} max={20} step={0.5} value={frequency} onChange={(e) => setFrequency(Number(e.target.value) || 1)} className="w-full h-11 lg:h-10 px-3 rounded-md border border-line text-sm" />
        </div>
        <div>
          <label className="block text-sm font-semibold text-ink mb-1.5">单次时长（分钟）</label>
          <input type="number" min={5} max={240} value={minutes} onChange={(e) => setMinutes(Number(e.target.value) || 40)} className="w-full h-11 lg:h-10 px-3 rounded-md border border-line text-sm" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-semibold text-ink mb-1.5">计划次数</label>
          <input type="number" min={0} max={500} value={planned} onChange={(e) => setPlanned(Math.max(0, Number(e.target.value) || 0))} className="w-full h-11 lg:h-10 px-3 rounded-md border border-line text-sm" />
        </div>
        <div>
          <label className="block text-sm font-semibold text-ink mb-1.5">已完成次数</label>
          <input type="number" min={0} max={planned || 500} value={completed} onChange={(e) => setCompleted(Math.max(0, Number(e.target.value) || 0))} className="w-full h-11 lg:h-10 px-3 rounded-md border border-line text-sm" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-semibold text-ink mb-1.5">地点</label>
          <input value={location} onChange={(e) => setLocation(e.target.value)} className="w-full h-11 lg:h-10 px-3 rounded-md border border-line text-sm" />
        </div>
        <div>
          <label className="block text-sm font-semibold text-ink mb-1.5">状态</label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(SERVICE_STATUS_CN).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <label className="block text-sm font-semibold text-ink mb-1.5">备注</label>
        <input value={remark} onChange={(e) => setRemark(e.target.value)} className="w-full h-11 lg:h-10 px-3 rounded-md border border-line text-sm" />
      </div>

      <div className="flex items-center justify-end gap-3 pt-2">
        <button onClick={onClose} disabled={saving} className="h-11 lg:h-10 px-4 rounded-md border border-line-2 text-sm font-medium text-ink-2 hover:bg-canvas cursor-pointer disabled:opacity-60">取消</button>
        <button onClick={() => void handleSave()} disabled={saving} className="flex items-center gap-1.5 h-11 lg:h-10 px-4 rounded-md bg-brand text-ink-on-dark text-sm font-medium hover:bg-brand-strong cursor-pointer disabled:opacity-60">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
          {saving ? '保存中...' : '保存'}
        </button>
      </div>
    </SheetShell>
  );
}

/* ============================================================
 * 添加会议参与人抽屉
 * ============================================================ */
function ParticipantSheet({
  planId,
  onClose,
  onSaved,
}: {
  planId: number;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const [name, setName] = useState('');
  const [pType, setPType] = useState('school');
  const [role, setRole] = useState('');
  const [attendance, setAttendance] = useState('present');
  const [signedAt, setSignedAt] = useState('');
  const [remark, setRemark] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) { toast.error('参与人姓名不能为空'); return; }
    setSaving(true);
    try {
      await saveMeetingParticipant({
        plan_id: planId,
        name: name.trim(),
        participant_type: pType,
        role: role || undefined,
        attendance,
        signed_at: signedAt ? signedAt.replace('T', ' ') + (signedAt.length === 16 ? ':00' : '') : undefined,
        remark: remark || undefined,
      });
      toast.success('参与人已记录');
      await onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SheetShell title="添加 IEP 会议参与人" onClose={onClose}>
      <div>
        <label className="block text-sm font-semibold text-ink mb-1.5">姓名 *</label>
        <input value={name} onChange={(e) => setName(e.target.value)} className="w-full h-11 lg:h-10 px-3 rounded-md border border-line text-sm" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-semibold text-ink mb-1.5">类型</label>
          <Select value={pType} onValueChange={setPType}>
            <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(PARTICIPANT_TYPE_CN).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="block text-sm font-semibold text-ink mb-1.5">角色</label>
          <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="如：班主任/治疗师" className="w-full h-11 lg:h-10 px-3 rounded-md border border-line text-sm" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-semibold text-ink mb-1.5">出席情况</label>
          <Select value={attendance} onValueChange={setAttendance}>
            <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(ATTENDANCE_CN).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="block text-sm font-semibold text-ink mb-1.5">签到时间</label>
          <input type="datetime-local" value={signedAt} onChange={(e) => setSignedAt(e.target.value)} className="w-full h-11 lg:h-10 px-3 rounded-md border border-line text-sm" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-semibold text-ink mb-1.5">备注</label>
        <input value={remark} onChange={(e) => setRemark(e.target.value)} className="w-full h-11 lg:h-10 px-3 rounded-md border border-line text-sm" />
      </div>

      <div className="flex items-center justify-end gap-3 pt-2">
        <button onClick={onClose} disabled={saving} className="h-11 lg:h-10 px-4 rounded-md border border-line-2 text-sm font-medium text-ink-2 hover:bg-canvas cursor-pointer disabled:opacity-60">取消</button>
        <button onClick={() => void handleSave()} disabled={saving} className="flex items-center gap-1.5 h-11 lg:h-10 px-4 rounded-md bg-brand text-ink-on-dark text-sm font-medium hover:bg-brand-strong cursor-pointer disabled:opacity-60">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
          {saving ? '保存中...' : '保存'}
        </button>
      </div>
    </SheetShell>
  );
}

/** 通用右侧抽屉外壳 */
function SheetShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  // 2026-10-14 焦点审计实测修复：服务/参与者两个抽屉共用本外壳，
  // 此前只有语义，缺 Esc 与焦点三件套。在此统一补。
  useDrawerA11y(true, onClose);
  const shellPanelRef = useRef<HTMLDivElement>(null);
  useDialogFocus(true, shellPanelRef);
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-overlay/40 z-[70] flex justify-end"
      onClick={onClose}
    >
      <motion.div
        ref={shellPanelRef}
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-[480px] h-full bg-surface shadow-xl flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-line">
          <h3 className="text-lg font-semibold text-ink">{title}</h3>
          <button onClick={onClose} className="p-1.5 rounded-md text-ink-2 hover:bg-canvas cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">{children}</div>
      </motion.div>
    </motion.div>
  );
}
