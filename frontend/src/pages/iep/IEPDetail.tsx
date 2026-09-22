import { useState, useCallback, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  X,
  Pencil,
  Printer,
  Download,
  CheckCircle,
  Clock,
  User,
  ChevronRight,
  Target,
  TrendingUp,
  FileText,
  Pen,
  Send,
  AlertCircle,
  RotateCcw,
  UserCheck,
  Play,
  Archive,
  BarChart3,
  Edit3,
  Eye,
  Loader2,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { cn } from '@/lib/utils';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { IEPPlan, GoalStatus, IEPGoal, ProgressRecord } from './types';
import { STATUS_COLORS, GOAL_AREA_COLORS, GOAL_STATUS_COLORS } from './types';
import SignaturePad from './SignaturePad';
import { useDataScopeConfig } from '@/utils/dataScope';
import { useDrawerA11y } from '@/hooks/useDrawerA11y';
import { exportIEPDetailToPDF, exportIEPDetailToWord } from '@/utils/documentExport';
import { approveIEP, fetchIEP, signIEP, updateIEP, fetchIEPMeta } from '@/services/iep';
import type { ApprovalDecision } from '@/services/iep';
import type { IEPLevel } from '@/store/authStore';
import ObjectivesPanel from './ObjectivesPanel';
import ServicesMeetingPanel from './ServicesMeetingPanel';

type DetailTab = '基本信息' | '长短期目标' | '短期目标' | '进度追踪' | '服务与会议' | '审批记录' | '家长签名';

const tabs: DetailTab[] = ['基本信息', '长短期目标', '短期目标', '进度追踪', '服务与会议', '审批记录', '家长签名'];

const actionIcons: Record<string, React.ReactNode> = {
  '提交草稿': <FileText className="w-4 h-4" />,
  '提交审核': <Send className="w-4 h-4" />,
  '审批通过': <CheckCircle className="w-4 h-4" />,
  '审批驳回': <AlertCircle className="w-4 h-4" />,
  '退回修改': <RotateCcw className="w-4 h-4" />,
  '家长签名': <Pen className="w-4 h-4" />,
  '开始执行': <Play className="w-4 h-4" />,
  '执行完成': <Archive className="w-4 h-4" />,
};

const actionColors: Record<string, string> = {
  '提交草稿': '#3B82F6',
  '提交审核': '#F59E0B',
  '审批通过': '#10B981',
  '审批驳回': '#EF4444',
  '退回修改': '#8B5CF6',
  '家长签名': '#405680',
  '开始执行': '#8B5CF6',
  '执行完成': '#7A5F42',
};

interface IEPDetailProps {
  plan: IEPPlan;
  iepLevel: IEPLevel;
  currentUserName: string;
  currentUserId: string;
  onClose: () => void;
  onEdit: (plan: IEPPlan) => void;
  onUpdateGoalProgress?: (
    goalId: string,
    completionRate: number,
    status: GoalStatus,
    notes: string,
  ) => Promise<void> | void;
  /** 数据变更后通知外层刷新列表 */
  onRefresh?: () => Promise<void> | void;
  /** 计划级进度由目标均值算出，回填给列表（后端无该字段） */
  onPlanProgress?: (planId: string, progress: number) => void;
}

export default function IEPDetail({
  plan,
  iepLevel,
  currentUserName,
  currentUserId,
  onClose,
  onEdit,
  onUpdateGoalProgress,
  onRefresh,
  onPlanProgress,
}: IEPDetailProps) {
  // P0-2 修复：改为订阅 authStore，登录/权限变化后自动刷新
  const config = useDataScopeConfig();
  // P3-1 修复：自研详情抽屉补充 Esc 关闭（window 级监听，交给最上层原生 dialog 处理）
  useDrawerA11y(true, onClose);

  const isNone = iepLevel === 'none';
  const isView = iepLevel === 'view';
  const isParticipate = iepLevel === 'participate';
  const isFull = iepLevel === 'full';
  const readOnly = isNone || isView;

  const [activeTab, setActiveTab] = useState<DetailTab>('基本信息');
  const [signatureSaved, setSignatureSaved] = useState(false);

  // ---- 详情数据（GET /iep/get）----
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof fetchIEP>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [approveComment, setApproveComment] = useState('');
  const [signing, setSigning] = useState(false);
  const [savingProgress, setSavingProgress] = useState(false);
  /** 后端没有进度历史查询接口，这里记录本次会话中真实提交过的记录用于趋势图 */
  const [progressHistory, setProgressHistory] = useState<ProgressRecord[]>([]);

  const loadDetail = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await fetchIEP(Number(plan.id));
      setDetail(data);
      onPlanProgress?.(String(plan.id), data.progress_percent ?? 0);
    } catch (e) {
      setDetail(null);
      setLoadError(e instanceof Error ? e.message : 'IEP 详情加载失败');
    } finally {
      setLoading(false);
    }
  }, [plan.id, onPlanProgress]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  // Progress update sheet state
  const [progressSheetOpen, setProgressSheetOpen] = useState(false);
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const [progressRate, setProgressRate] = useState<number[]>([0]);
  const [progressStatus, setProgressStatus] = useState<GoalStatus>('进行中');
  const [progressNotes, setProgressNotes] = useState('');

  // Get all goals for this plan
  const allGoals = useMemo<IEPGoal[]>(() => detail?.goals ?? [], [detail]);

  // Check if a goal is editable by current user
  // 后端只返回 responsible_teacher_id（数字），据此与当前登录用户 ID 比对
  const isGoalEditable = useCallback(
    (goal: IEPGoal) => {
      if (isFull) return true;
      if (isParticipate) {
        return (
          String(goal.responsible_teacher_id ?? '') === String(currentUserId) ||
          (!!goal.responsible_teacher_name && goal.responsible_teacher_name === currentUserName)
        );
      }
      return false;
    },
    [isFull, isParticipate, currentUserId, currentUserName],
  );

  // For display: editable goals first, then viewable goals
  const displayGoals = useMemo(() => {
    if (!isParticipate || isFull) return allGoals;
    return [...allGoals.filter(isGoalEditable), ...allGoals.filter((g) => !isGoalEditable(g))];
  }, [allGoals, isFull, isParticipate, isGoalEditable]);

  const approvalLogs = useMemo(() => detail?.approvalLogs ?? [], [detail]);
  const signature = useMemo(
    () => detail?.signatures.find((s) => s.status === '已签名') ?? null,
    [detail],
  );

  // 计划信息优先用详情返回的最新值，未加载完时回退到列表传入的快照
  const currentPlan = detail ?? plan;
  const statusColor = STATUS_COLORS[currentPlan.status];

  const workflowSteps = ['草稿', '审核中', '已通过', '已签名', '执行中', '已完成'];
  const currentWorkflowIndex = workflowSteps.indexOf(
    currentPlan.status === '已驳回' ? '草稿' : currentPlan.status,
  );
  const planProgress = currentPlan.progress_percent ?? 0;

  // 趋势图数据：仅使用本会话真实提交的进度记录，没有则不展示图表
  const goalProgressData = useMemo(
    () =>
      progressHistory.map((r) => ({
        date: r.record_date,
        score: r.max_score > 0 ? Math.round((r.score / r.max_score) * 100) : r.score,
        promptLevel: r.prompt_level || '—',
      })),
    [progressHistory],
  );

  // Open progress update sheet
  const openProgressSheet = (goal: IEPGoal) => {
    if (!isGoalEditable(goal)) return;
    setSelectedGoalId(goal.id);
    setProgressRate([goal.progress_percent]);
    setProgressStatus(goal.status);
    setProgressNotes(goal.progress_notes || '');
    setProgressSheetOpen(true);
  };

  // Save progress update (POST /iep/progress)
  const handleSaveProgress = async () => {
    if (!selectedGoalId) return;
    setSavingProgress(true);
    try {
      await onUpdateGoalProgress?.(selectedGoalId, progressRate[0], progressStatus, progressNotes);
      const today = new Date().toISOString().split('T')[0];
      setProgressHistory((prev) => [
        ...prev,
        {
          id: `local-${Date.now()}`,
          goal_id: selectedGoalId,
          record_date: today,
          score: Math.round((progressRate[0] / 100) * 5),
          max_score: 5,
          prompt_level: progressStatus === '已完成' ? '独立' : '',
          notes: progressNotes,
          teacher: currentUserName,
          created_at: today,
        },
      ]);
      setProgressSheetOpen(false);
      setSelectedGoalId(null);
      await loadDetail();
      await onRefresh?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '进度更新失败');
    } finally {
      setSavingProgress(false);
    }
  };

  // Approve / reject (POST /iep/approve)
  const handleApprove = async (decision: ApprovalDecision) => {
    setApproving(true);
    try {
      await approveIEP(Number(plan.id), decision, approveComment);
      toast.success(decision === 'approve' ? '审批通过' : '已驳回');
      setApproveComment('');
      await loadDetail();
      await onRefresh?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '审批失败');
    } finally {
      setApproving(false);
    }
  };

  // Parent signature (POST /iep/sign)
  const handleSign = async (dataUrl: string, signatureType: 'handwritten' | 'digital' | 'fingerprint') => {
    setSigning(true);
    try {
      await signIEP(Number(plan.id), dataUrl, signatureType, {
        parent_id: Number(currentUserId) || undefined,
      });
      setSignatureSaved(true);
      toast.success('签名已保存');
      await loadDetail();
      await onRefresh?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '签名失败');
    } finally {
      setSigning(false);
    }
  };

  const selectedGoal = allGoals.find((g) => g.id === selectedGoalId);

  // P3-1 修复：进度更新子抽屉补充 Esc 关闭（仅在子抽屉打开时生效）
  useDrawerA11y(progressSheetOpen && !!selectedGoal, () => setProgressSheetOpen(false));

  // iepLevel 'none': show permission denied
  if (isNone) {
    return (
      <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="权限提示">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          onClick={onClose}
        />
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
          className="relative w-full max-w-[900px] h-full bg-white shadow-xl flex flex-col items-center justify-center"
        >
          <AlertCircle className="w-12 h-12 text-[#CBD5E1] mb-3" />
          <p className="text-base font-semibold text-[#1E293B] mb-1">暂无权限</p>
          <p className="text-sm text-[#64748B]">您没有查看 IEP 详情的权限</p>
          <button
            onClick={onClose}
            className="mt-4 h-10 px-4 rounded-md border border-[#CBD5E1] text-sm text-[#64748B] hover:bg-[#F7F6F4] transition-colors cursor-pointer"
          >
            返回
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={`IEP 详情 - ${currentPlan?.student_name ?? ''}`}>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
        className="relative w-full max-w-[900px] h-full bg-white shadow-xl flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E2E8F0] flex-shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="p-1.5 rounded-md text-[#64748B] hover:bg-[#F7F6F4] transition-colors cursor-pointer">
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-lg font-semibold text-[#1E293B]">IEP 详情 - {currentPlan.student_name}</h2>
            {isView && (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-[#F5F3FF] text-[#8B5CF6]">
                只读
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isFull && (
              <button
                onClick={() => onEdit(plan)}
                className="flex items-center gap-1.5 h-9 px-3 rounded-md border border-[#CBD5E1] text-sm text-[#64748B] hover:bg-[#F7F6F4] transition-colors cursor-pointer"
              >
                <Pencil className="w-4 h-4" />
                编辑
              </button>
            )}
            <button
              onClick={() => exportIEPDetailToPDF(currentPlan, allGoals, `IEP详情_${currentPlan.student_name}_${currentPlan.title}`)}
              className="flex items-center gap-1.5 h-9 px-3 rounded-md border border-[#CBD5E1] text-sm text-[#64748B] hover:bg-[#F7F6F4] transition-colors cursor-pointer"
            >
              <FileText className="w-4 h-4" />
              导出PDF
            </button>
            <button
              onClick={() => exportIEPDetailToWord(currentPlan, allGoals, `IEP详情_${currentPlan.student_name}_${currentPlan.title}`)}
              className="flex items-center gap-1.5 h-9 px-3 rounded-md border border-[#CBD5E1] text-sm text-[#64748B] hover:bg-[#F7F6F4] transition-colors cursor-pointer"
            >
              <Download className="w-4 h-4" />
              导出Word
            </button>
            <button className="flex items-center gap-1.5 h-9 px-3 rounded-md border border-[#CBD5E1] text-sm text-[#64748B] hover:bg-[#F7F6F4] transition-colors cursor-pointer">
              <Printer className="w-4 h-4" />
              打印
            </button>
          </div>
        </div>

        {/* Info Card */}
        <div className="px-6 py-4 border-b border-[#E2E8F0] flex-shrink-0">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-full bg-[#EBE3DA] flex items-center justify-center">
                  <User className="w-5 h-5 text-[#977653]" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-[#1E293B]">{currentPlan.student_name}</div>
                  <div className="text-xs text-[#64748B]">
                    {currentPlan.student_number || '—'} · {currentPlan.student_class || '—'}
                  </div>
                </div>
              </div>
              <div className="h-8 w-px bg-[#E2E8F0]" />
              <div>
                <div className="text-xs text-[#94A3B8]">IEP 期间</div>
                <div className="text-sm text-[#1E293B]">{currentPlan.start_date} ~ {currentPlan.end_date}</div>
              </div>
              <div className="h-8 w-px bg-[#E2E8F0]" />
              <div>
                <div className="text-xs text-[#94A3B8]">制定人</div>
                <div className="text-sm text-[#1E293B]">{currentPlan.primary_teacher || '—'}</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className={cn(
                'inline-flex items-center px-3 py-1 rounded-full text-sm font-medium',
                statusColor.lightBg,
                statusColor.text
              )}>
                {currentPlan.status}
              </span>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-[#64748B]">总进度</span>
            <div className="flex-1 h-2 bg-[#F1F5F9] rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${planProgress}%` }}
                transition={{ duration: 0.5 }}
                className="h-full rounded-full"
                style={{
                  background: planProgress > 0
                    ? 'linear-gradient(90deg, #AC9174, #977653)'
                    : 'transparent',
                }}
              />
            </div>
            <span className="text-sm font-semibold text-[#977653]">
              {currentPlan.progress_percent === undefined ? '—' : `${planProgress}%`}
            </span>
          </div>

          {/* Workflow Steps */}
          <div className="flex items-center mt-4 gap-1">
            {workflowSteps.map((step, index) => {
                  const isActive = index <= currentWorkflowIndex;
                  const isCurrent = step === currentPlan.status;
              return (
                <div key={step} className="flex items-center flex-1 last:flex-none">
                  <div className="flex flex-col items-center">
                    <div className={cn(
                      'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors',
                      isCurrent ? 'bg-[#977653] text-white ring-2 ring-[#977653] ring-offset-2' :
                      isActive ? 'bg-[#10B981] text-white' :
                      'bg-[#F1F5F9] text-[#94A3B8]'
                    )}>
                      {isActive && !isCurrent ? <CheckCircle className="w-3.5 h-3.5" /> : index + 1}
                    </div>
                    <span className={cn(
                      'text-xs mt-1',
                      isCurrent ? 'text-[#977653] font-medium' :
                      isActive ? 'text-[#10B981]' :
                      'text-[#94A3B8]'
                    )}>{step}</span>
                  </div>
                  {index < workflowSteps.length - 1 && (
                    <div className={cn(
                      'flex-1 h-0.5 mx-1 mb-4',
                      index < currentWorkflowIndex ? 'bg-[#10B981]' : 'bg-[#E2E8F0]'
                    )} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Tabs */}
        <div className="px-6 border-b border-[#E2E8F0] flex-shrink-0">
          <div className="flex gap-0">
            {tabs.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  'relative px-4 py-3 text-sm font-medium transition-colors cursor-pointer',
                  activeTab === tab ? 'text-[#977653]' : 'text-[#64748B] hover:text-[#1E293B]'
                )}
              >
                {tab}
                {activeTab === tab && (
                  <motion.div
                    layoutId="detail-tab-indicator"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#977653]"
                    transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
                  />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <AnimatePresence mode="wait">
            {loading ? (
              <motion.div
                key="detail-loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="flex flex-col items-center justify-center gap-3 py-24"
              >
                <Loader2 className="w-8 h-8 text-[#977653] animate-spin" />
                <p className="text-sm text-[#64748B]">正在加载 IEP 详情...</p>
              </motion.div>
            ) : loadError ? (
              <motion.div
                key="detail-error"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="flex flex-col items-center justify-center gap-3 py-24"
              >
                <AlertCircle className="w-12 h-12 text-[#CBD5E1]" />
                <p className="text-base font-semibold text-[#1E293B]">IEP 详情加载失败</p>
                <p className="text-sm text-[#64748B]">{loadError}</p>
                <button
                  onClick={() => void loadDetail()}
                  className="mt-2 h-10 px-4 rounded-md border border-[#CBD5E1] text-sm font-medium text-[#64748B] hover:bg-[#F7F6F4] transition-colors cursor-pointer"
                >
                  点击重试
                </button>
              </motion.div>
            ) : (
              <>
            {activeTab === '基本信息' && (
              <motion.div
                key="basic"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="space-y-6"
              >
                <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                  <InfoRow label="计划编号" value={currentPlan.plan_code || '—'} />
                  <InfoRow label="计划标题" value={currentPlan.title} />
                  <InfoRow label="学生姓名" value={currentPlan.student_name} />
                  <InfoRow label="学生学号" value={currentPlan.student_number || '—'} />
                  <InfoRow label="所在班级" value={currentPlan.student_class || '—'} />
                  <InfoRow label="学年" value={currentPlan.academic_year || '—'} />
                  <InfoRow label="学期" value={currentPlan.semester || '—'} />
                  <InfoRow label="开始日期" value={currentPlan.start_date || '—'} />
                  <InfoRow label="结束日期" value={currentPlan.end_date || '—'} />
                  <InfoRow label="主要制定人" value={currentPlan.primary_teacher || '—'} />
                  <InfoRow label="团队成员" value={currentPlan.team_members.join('、') || '—'} />
                  <InfoRow label="目标数量" value={`${currentPlan.goals_count} 个`} />
                </div>

                {/* v4 特教内核（6.2）：教育安置形式与 IEP 会议要件 */}
                <PlacementMeetingCard
                  plan={currentPlan}
                  canEdit={!readOnly}
                  onSaved={loadDetail}
                />

                {/* Current Levels Preview */}
                <div>
                  <h4 className="text-sm font-semibold text-[#1E293B] mb-3">学生现况描述</h4>
                  {Object.keys(currentPlan.current_levels).length === 0 && (
                    <p className="text-sm text-[#94A3B8]">暂无现况描述</p>
                  )}
                  <div className="space-y-3">
                    {Object.entries(currentPlan.current_levels).map(([key, value]) => (
                      <div key={key} className="border border-[#E2E8F0] rounded-lg p-4">
                        <div className="text-xs font-medium text-[#94A3B8] mb-1">{key}</div>
                        <div className="text-sm text-[#1E293B]">{value || '—'}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === '长短期目标' && (
              <motion.div
                key="goals"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="space-y-4"
              >
                {/* Permission hint for participate users */}
                {isParticipate && (
                  <div className="bg-[#F5F3FF] rounded-lg p-3 border border-[#8B5CF6]/20 mb-4">
                    <p className="text-xs text-[#8B5CF6]">
                      您只能编辑自己负责的目标，其他目标仅可查看。
                    </p>
                  </div>
                )}
                {displayGoals.length === 0 ? (
                  <div className="text-center py-12">
                    <Target className="w-10 h-10 text-[#CBD5E1] mx-auto mb-3" />
                    <p className="text-sm text-[#64748B]">暂无目标数据</p>
                  </div>
                ) : (
                  displayGoals.map((goal, index) => {
                    const editableGoal = isGoalEditable(goal);
                    return (
                      <motion.div
                        key={goal.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.08 }}
                        className={cn(
                          "border rounded-lg p-5",
                          editableGoal ? "border-[#E2E8F0]" : "border-[#E2E8F0] bg-[#FAFBFC]"
                        )}
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs text-[#94A3B8]">目标 {index + 1}</span>
                            <span className="text-sm font-semibold text-[#1E293B]">{goal.title}</span>
                            <span
                              className="px-2 py-0.5 rounded-full text-xs font-medium text-white"
                              style={{ backgroundColor: GOAL_AREA_COLORS[goal.area] || '#64748B' }}
                            >
                              {goal.area}
                            </span>
                            <span className={cn(
                              'px-2 py-0.5 rounded-full text-xs font-medium',
                              goal.goal_type === '长期目标' ? 'bg-[#F5F0EB] text-[#7A5F42]' : 'bg-[#EFF6FF] text-[#2563EB]'
                            )}>
                              {goal.goal_type}
                            </span>
                            <span className={cn(
                              'px-2 py-0.5 rounded-full text-xs font-medium',
                              GOAL_STATUS_COLORS[goal.status]?.bg,
                              GOAL_STATUS_COLORS[goal.status]?.text,
                            )}>
                              {goal.status}
                            </span>
                            {!editableGoal && (isParticipate || isView) && (
                              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-[#F0F2F5] text-[#94A3B8]">
                                <Eye className="w-3 h-3 inline mr-0.5" />
                                只读
                              </span>
                            )}
                          </div>
                          {/* Update Progress Button - only for editable goals */}
                          {editableGoal && (
                            <motion.button
                              whileHover={{ scale: 1.02 }}
                              whileTap={{ scale: 0.98 }}
                              onClick={() => openProgressSheet(goal)}
                              className="flex items-center gap-1.5 h-7 px-2.5 rounded-md bg-[#977653] text-white text-xs font-medium hover:bg-[#7A5F42] transition-colors cursor-pointer flex-shrink-0"
                            >
                              <BarChart3 className="w-3 h-3" />
                              更新进度
                            </motion.button>
                          )}
                        </div>

                        <div className="space-y-2 mb-4">
                          <p className="text-sm text-[#1E293B]">{goal.description}</p>
                          <p className="text-xs text-[#64748B]"><span className="font-medium">成功标准:</span> {goal.criteria}</p>
                          <p className="text-xs text-[#64748B]"><span className="font-medium">教学策略:</span> {goal.teaching_strategies}</p>
                          <p className="text-xs text-[#64748B]"><span className="font-medium">基线:</span> {goal.baseline}</p>
                          {/* Responsible Teacher */}
                          <p className="text-xs text-[#64748B]">
                            <span className="font-medium">责任人:</span>
                            <span className="inline-flex items-center gap-1 ml-1 px-2 py-0.5 rounded-full bg-[#F5F0EB] text-[#7A5F42] font-medium">
                              <User className="w-3 h-3" />
                              {goal.responsible_teacher_name || goal.responsible_teacher}
                              {editableGoal && <span className="text-[10px] text-[#977653]">(我)</span>}
                            </span>
                          </p>
                          {goal.progress_notes && (
                            <p className="text-xs text-[#977653]"><span className="font-medium">进展备注:</span> {goal.progress_notes}</p>
                          )}
                        </div>

                        {/* Progress */}
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-[#64748B]">进度</span>
                          <div className="flex-1 h-2 bg-[#F1F5F9] rounded-full overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${goal.progress_percent}%` }}
                              transition={{ duration: 0.5, delay: index * 0.08 }}
                              className="h-full rounded-full"
                              style={{
                                background: goal.progress_percent >= 100
                                  ? '#10B981'
                                  : `linear-gradient(90deg, ${GOAL_AREA_COLORS[goal.area] || '#977653'}, ${GOAL_AREA_COLORS[goal.area] || '#977653'}aa)`,
                              }}
                            />
                          </div>
                          <span className="text-xs font-semibold text-[#1E293B] w-8">{goal.progress_percent}%</span>
                          <span className="text-xs text-[#94A3B8]">
                            {goal.current_score}/{goal.target_score}
                          </span>
                        </div>
                      </motion.div>
                    );
                  })
                )}
              </motion.div>
            )}

            {activeTab === '短期目标' && (
              <motion.div
                key="objectives"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <ObjectivesPanel
                  planId={Number(plan.id)}
                  goals={allGoals}
                  canEdit={!readOnly}
                  onChanged={loadDetail}
                />
              </motion.div>
            )}

            {activeTab === '服务与会议' && (
              <motion.div
                key="services-meeting"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <ServicesMeetingPanel planId={Number(plan.id)} canEdit={!readOnly} />
              </motion.div>
            )}

            {activeTab === '进度追踪' && (
              <motion.div
                key="progress"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="space-y-6"
              >
                {/* Goal Progress Trend Chart */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="border border-[#E2E8F0] rounded-lg p-5"
                >
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-base font-semibold text-[#1E293B]">目标达成趋势</h4>
                    <span className="text-xs text-[#94A3B8]">辅助级别变化</span>
                  </div>
                  {goalProgressData.length === 0 ? (
                    <div className="h-[280px] flex flex-col items-center justify-center gap-3">
                      <TrendingUp className="w-10 h-10 text-[#CBD5E1]" />
                      <p className="text-sm text-[#64748B]">暂无进度记录，更新目标进度后显示趋势</p>
                    </div>
                  ) : (
                  <>
                  <div className="h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={goalProgressData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                        <defs>
                          <linearGradient id="scoreGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#977653" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#977653" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                        <XAxis
                          dataKey="date"
                          tick={{ fontSize: 12, fill: '#94A3B8' }}
                          tickLine={false}
                          axisLine={{ stroke: '#E2E8F0' }}
                        />
                        <YAxis
                          domain={[0, 100]}
                          tick={{ fontSize: 12, fill: '#94A3B8' }}
                          tickLine={false}
                          axisLine={{ stroke: '#E2E8F0' }}
                        />
                        <Tooltip
                          content={({ active, payload, label }) => {
                            if (active && payload && payload.length) {
                              const data = payload[0].payload;
                              return (
                                <div className="bg-white border border-[#E2E8F0] rounded-lg px-3 py-2 shadow-sm">
                                  <p className="text-xs text-[#94A3B8]">{label}</p>
                                  <p className="text-sm font-semibold text-[#977653]">得分: {data.score}</p>
                                  <p className="text-xs text-[#64748B]">辅助级别: {data.promptLevel}</p>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <ReferenceLine
                          y={80}
                          stroke="#10B981"
                          strokeDasharray="6 3"
                          strokeWidth={2}
                          label={{ value: '目标线 80', position: 'right', fill: '#10B981', fontSize: 12 }}
                        />
                        <Area
                          type="monotone"
                          dataKey="score"
                          stroke="#977653"
                          strokeWidth={2.5}
                          fill="url(#scoreGradient)"
                          dot={{ r: 4, fill: '#977653', stroke: '#fff', strokeWidth: 2 }}
                          activeDot={{ r: 6, fill: '#977653', stroke: '#fff', strokeWidth: 2 }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                  {/* Prompt level labels below chart */}
                  <div className="mt-3 flex items-center justify-between px-2">
                    {goalProgressData.map((item, index) => (
                      <motion.div
                        key={`${item.date}-${index}`}
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 + index * 0.05 }}
                        className="flex flex-col items-center"
                      >
                        <span className="text-[10px] text-[#977653] font-medium bg-[#F5F0EB] px-1.5 py-0.5 rounded">
                          {item.promptLevel}
                        </span>
                      </motion.div>
                    ))}
                  </div>
                  </>
                  )}
                </motion.div>

                {/* Permission hint for participate users */}
                {isParticipate && (
                  <div className="bg-[#F5F3FF] rounded-lg p-3 border border-[#8B5CF6]/20">
                    <p className="text-xs text-[#8B5CF6]">
                      您只能更新自己负责的目标进度，其他目标仅可查看。
                    </p>
                  </div>
                )}

                {allGoals.length === 0 ? (
                  <div className="text-center py-12">
                    <TrendingUp className="w-10 h-10 text-[#CBD5E1] mx-auto mb-3" />
                    <p className="text-sm text-[#64748B]">暂无进度数据</p>
                  </div>
                ) : (
                  allGoals.map((goal) => {
                    const records = progressHistory.filter((r) => r.goal_id === goal.id);
                    const userIsOwner = isGoalEditable(goal);
                    return (
                      <motion.div
                        key={goal.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={cn(
                          "border rounded-lg p-5",
                          userIsOwner ? "border-[#E2E8F0]" : "border-[#E2E8F0] bg-[#FAFBFC]"
                        )}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <span
                              className="px-2 py-0.5 rounded-full text-xs font-medium text-white"
                              style={{ backgroundColor: GOAL_AREA_COLORS[goal.area] || '#64748B' }}
                            >
                              {goal.area}
                            </span>
                            <span className="text-sm font-semibold text-[#1E293B]">{goal.title}</span>
                            <span className={cn(
                              'px-2 py-0.5 rounded-full text-xs font-medium',
                              GOAL_STATUS_COLORS[goal.status]?.bg,
                              GOAL_STATUS_COLORS[goal.status]?.text,
                            )}>
                              {goal.status}
                            </span>
                            {!userIsOwner && (isParticipate || isView) && (
                              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-[#F0F2F5] text-[#94A3B8]">
                                <Eye className="w-3 h-3 inline mr-0.5" />
                                只读
                              </span>
                            )}
                          </div>
                          {userIsOwner && (
                            <motion.button
                              whileHover={{ scale: 1.02 }}
                              whileTap={{ scale: 0.98 }}
                              onClick={() => openProgressSheet(goal)}
                              className="flex items-center gap-1.5 h-7 px-2.5 rounded-md bg-[#977653] text-white text-xs font-medium hover:bg-[#7A5F42] transition-colors cursor-pointer"
                            >
                              <Edit3 className="w-3 h-3" />
                              更新
                            </motion.button>
                          )}
                        </div>

                        {/* Responsible teacher badge */}
                        <div className="flex items-center gap-1 mb-2">
                          <span className="text-xs text-[#94A3B8]">责任人:</span>
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-[#F5F0EB] text-[#7A5F42]">
                            <User className="w-3 h-3" />
                            {goal.responsible_teacher_name || goal.responsible_teacher}
                            {userIsOwner && <span className="text-[#977653]">(我)</span>}
                          </span>
                        </div>

                        {records.length === 0 ? (
                          <p className="text-sm text-[#94A3B8] py-4">暂无教学记录</p>
                        ) : (
                          <div className="overflow-hidden rounded-lg border border-[#E2E8F0]">
                            <table className="w-full">
                              <thead className="bg-[#F7F6F4]">
                                <tr>
                                  <th className="px-3 py-2 text-left text-xs font-semibold text-[#94A3B8]">日期</th>
                                  <th className="px-3 py-2 text-left text-xs font-semibold text-[#94A3B8]">教师</th>
                                  <th className="px-3 py-2 text-left text-xs font-semibold text-[#94A3B8]">得分</th>
                                  <th className="px-3 py-2 text-left text-xs font-semibold text-[#94A3B8]">辅助级别</th>
                                  <th className="px-3 py-2 text-left text-xs font-semibold text-[#94A3B8]">备注</th>
                                </tr>
                              </thead>
                              <tbody>
                                {records.map((record) => (
                                  <tr key={record.id} className="border-t border-[#F1F5F9]">
                                    <td className="px-3 py-2 text-sm text-[#1E293B]">{record.record_date}</td>
                                    <td className="px-3 py-2 text-sm text-[#1E293B]">{record.teacher}</td>
                                    <td className="px-3 py-2">
                                      <span className={cn(
                                        'text-sm font-medium',
                                        record.score >= 4 ? 'text-[#10B981]' :
                                        record.score >= 3 ? 'text-[#977653]' :
                                        'text-[#F59E0B]'
                                      )}>
                                        {record.score}/{record.max_score}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2 text-sm text-[#64748B]">{record.prompt_level}</td>
                                    <td className="px-3 py-2 text-sm text-[#64748B]">{record.notes}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}

                        {/* Mini trend visualization */}
                        {records.length > 1 && (
                          <div className="mt-3 flex items-end gap-1 h-16">
                            {records.map((r, i) => (
                              <motion.div
                                key={r.id}
                                initial={{ height: 0 }}
                                animate={{ height: `${(r.score / r.max_score) * 100}%` }}
                                transition={{ duration: 0.3, delay: i * 0.05 }}
                                className="flex-1 rounded-t"
                                style={{
                                  backgroundColor: r.score >= 4 ? '#10B981' : r.score >= 3 ? '#977653' : '#F59E0B',
                                  minHeight: '4px',
                                }}
                                title={`${r.record_date}: ${r.score}/${r.max_score}`}
                              />
                            ))}
                          </div>
                        )}
                      </motion.div>
                    );
                  })
                )}
              </motion.div>
            )}

            {activeTab === '审批记录' && (
              <motion.div
                key="approval"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="space-y-0"
              >
                {/* 审批操作：仅 full 权限且计划处于审核中 */}
                {isFull && currentPlan.status === '审核中' && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="border border-[#E2E8F0] rounded-lg p-4 mb-6"
                  >
                    <h4 className="text-sm font-semibold text-[#1E293B] mb-2">审批意见</h4>
                    <Textarea
                      value={approveComment}
                      onChange={(e) => setApproveComment(e.target.value)}
                      placeholder="请填写审批意见（驳回时建议说明原因）..."
                      rows={3}
                      disabled={approving}
                      className="w-full resize-y text-sm"
                    />
                    <div className="flex items-center justify-end gap-3 mt-3">
                      <button
                        onClick={() => void handleApprove('reject')}
                        disabled={approving}
                        className="h-10 px-4 rounded-md border border-[#CBD5E1] text-sm font-medium text-[#DC2626] hover:bg-[#FEF2F2] transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        驳回
                      </button>
                      <button
                        onClick={() => void handleApprove('approve')}
                        disabled={approving}
                        className="h-10 px-4 rounded-md bg-[#10B981] text-white text-sm font-medium hover:bg-[#059669] transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {approving ? '提交中...' : '通过'}
                      </button>
                    </div>
                  </motion.div>
                )}
                {approvalLogs.length === 0 ? (
                  <div className="text-center py-12">
                    <Clock className="w-10 h-10 text-[#CBD5E1] mx-auto mb-3" />
                    <p className="text-sm text-[#64748B]">暂无审批记录</p>
                  </div>
                ) : (
                  <div className="relative pl-6">
                    {/* Timeline line */}
                    <div className="absolute left-2 top-0 bottom-0 w-0.5 bg-[#E2E8F0]" />

                    {approvalLogs.map((log, index) => {
                      const color = actionColors[log.action] || '#64748B';
                      return (
                        <motion.div
                          key={log.id}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.08 }}
                          className="relative pb-6"
                        >
                          {/* Timeline dot */}
                          <div
                            className="absolute -left-6 top-0 w-4 h-4 rounded-full border-2 bg-white flex items-center justify-center"
                            style={{ borderColor: color }}
                          >
                            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
                          </div>

                          <div className="border border-[#E2E8F0] rounded-lg p-4 ml-2">
                            <div className="flex items-center gap-2 mb-1">
                              <span style={{ color }}>{actionIcons[log.action]}</span>
                              <span className="text-sm font-semibold text-[#1E293B]">{log.action}</span>
                              <span className="text-xs text-[#94A3B8] ml-auto">{log.created_at}</span>
                            </div>
                            <div className="flex items-center gap-1 text-xs text-[#64748B] mb-1">
                              <UserCheck className="w-3 h-3" />
                              {log.operator} ({log.operator_role})
                            </div>
                            {log.comment && (
                              <p className="text-sm text-[#64748B] mt-1 bg-[#F7F6F4] p-2 rounded">{log.comment}</p>
                            )}
                            {log.from_status && (
                              <div className="flex items-center gap-1 mt-1 text-xs text-[#94A3B8]">
                                <span>{log.from_status}</span>
                                <ChevronRight className="w-3 h-3" />
                                <span>{log.to_status}</span>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === '家长签名' && (
              <motion.div
                key="signature"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="max-w-lg mx-auto"
              >
                <div className="text-center mb-6">
                  <h3 className="text-lg font-semibold text-[#1E293B]">特教特殊教育学校</h3>
                  <p className="text-sm text-[#64748B] mt-1">IEP 计划签名确认</p>
                </div>

                <div className="bg-[#F7F6F4] rounded-lg p-5 mb-6 space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-[#64748B]">学生</span>
                    <span className="text-sm font-medium text-[#1E293B]">{currentPlan.student_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-[#64748B]">IEP 期间</span>
                    <span className="text-sm font-medium text-[#1E293B]">{currentPlan.start_date} ~ {currentPlan.end_date}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-[#64748B]">制定人</span>
                    <span className="text-sm font-medium text-[#1E293B]">{currentPlan.primary_teacher || '—'}</span>
                  </div>
                </div>

                <div className="border border-[#E2E8F0] rounded-lg p-5 mb-6">
                  <p className="text-sm text-[#1E293B] mb-4">
                    我已阅读并确认以上 IEP 计划内容，同意按照计划执行。
                  </p>

                  {currentPlan.status === '已通过' || currentPlan.status === '已签名' || currentPlan.status === '执行中' || currentPlan.status === '已完成' ? (
                    <div className="space-y-3">
                      {signature?.status === '已签名' ? (
                        <div className="flex items-center gap-2 p-4 bg-[#ECFDF5] rounded-lg">
                          <CheckCircle className="w-5 h-5 text-[#10B981]" />
                          <div>
                            <p className="text-sm font-medium text-[#059669]">家长已签名确认</p>
                            <p className="text-xs text-[#10B981]">
                              签名时间: {signature.signed_at || '—'}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <>
                          {/* Parent can sign if they are the guardian */}
                          {!readOnly && config.parentName && currentPlan.student_name.startsWith(config.parentName.substring(0, 1)) ? (
                            <>
                              <SignaturePad
                                signatureType="handwritten"
                                onSave={(dataUrl, signatureType) => { void handleSign(dataUrl, signatureType); }}
                              />
                              {signing && (
                                <motion.div
                                  initial={{ opacity: 0, y: 5 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  className="flex items-center gap-2 p-3 bg-[#F7F6F4] rounded-lg"
                                >
                                  <Loader2 className="w-4 h-4 text-[#977653] animate-spin" />
                                  <span className="text-sm text-[#64748B]">签名提交中...</span>
                                </motion.div>
                              )}
                            </>
                          ) : (
                            <div className="flex items-center gap-2 p-4 bg-[#FFFBEB] rounded-lg">
                              <Clock className="w-5 h-5 text-[#D97706]" />
                              <p className="text-sm text-[#D97706]">等待家长签名</p>
                            </div>
                          )}
                          {signatureSaved && (
                            <motion.div
                              initial={{ opacity: 0, y: 5 }}
                              animate={{ opacity: 1, y: 0 }}
                              className="flex items-center gap-2 p-3 bg-[#ECFDF5] rounded-lg"
                            >
                              <CheckCircle className="w-4 h-4 text-[#10B981]" />
                              <span className="text-sm text-[#059669]">签名已保存</span>
                            </motion.div>
                          )}
                        </>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 p-4 bg-[#FEF2F2] rounded-lg">
                      <AlertCircle className="w-5 h-5 text-[#EF4444]" />
                      <p className="text-sm text-[#DC2626]">
                        IEP 状态为「{currentPlan.status}」，暂不可签名
                      </p>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
              </>
            )}
          </AnimatePresence>
        </div>

        {/* Progress Update Sheet */}
        <AnimatePresence>
          {progressSheetOpen && selectedGoal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[60] flex justify-end"
            >
              {/* Backdrop */}
              <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={() => setProgressSheetOpen(false)}
              />

              {/* Sheet Panel */}
              <motion.div
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
                className="relative w-full max-w-[480px] h-full bg-white shadow-xl flex flex-col z-10"
                role="dialog"
                aria-modal="true"
                aria-label="更新目标进度"
                data-state="open"
              >
                {/* Sheet Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-[#E2E8F0]">
                  <div>
                    <h3 className="text-lg font-semibold text-[#1E293B]">更新目标进度</h3>
                    <p className="text-xs text-[#64748B] mt-0.5">{selectedGoal.title}</p>
                  </div>
                  <button
                    onClick={() => setProgressSheetOpen(false)}
                    className="p-1.5 rounded-md text-[#64748B] hover:bg-[#F7F6F4] transition-colors cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Sheet Body */}
                <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
                  {/* Current Info Card */}
                  <div className="bg-[#F7F6F4] rounded-lg p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-[#64748B]">目标领域</span>
                      <span
                        className="px-2 py-0.5 rounded-full text-xs font-medium text-white"
                        style={{ backgroundColor: GOAL_AREA_COLORS[selectedGoal.area] || '#64748B' }}
                      >
                        {selectedGoal.area}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-[#64748B]">目标类型</span>
                      <span className="text-xs font-medium text-[#1E293B]">{selectedGoal.goal_type}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-[#64748B]">当前完成率</span>
                      <span className="text-sm font-semibold text-[#977653]">{selectedGoal.progress_percent}%</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-[#64748B]">当前状态</span>
                      <span className={cn(
                        'px-2 py-0.5 rounded-full text-xs font-medium',
                        GOAL_STATUS_COLORS[selectedGoal.status]?.bg,
                        GOAL_STATUS_COLORS[selectedGoal.status]?.text,
                      )}>
                        {selectedGoal.status}
                      </span>
                    </div>
                  </div>

                  {/* Completion Rate Slider */}
                  <div>
                    <label className="block text-sm font-semibold text-[#1E293B] mb-3">
                      完成率 <span className="text-[#977653]">{progressRate[0]}%</span>
                    </label>
                    <div className="px-1">
                      <Slider
                        value={progressRate}
                        onValueChange={setProgressRate}
                        min={0}
                        max={100}
                        step={5}
                        className="w-full"
                      />
                    </div>
                    <div className="flex justify-between mt-2">
                      <span className="text-xs text-[#94A3B8]">0%</span>
                      <span className="text-xs text-[#94A3B8]">25%</span>
                      <span className="text-xs text-[#94A3B8]">50%</span>
                      <span className="text-xs text-[#94A3B8]">75%</span>
                      <span className="text-xs text-[#94A3B8]">100%</span>
                    </div>
                  </div>

                  {/* Status Selection */}
                  <div>
                    <label className="block text-sm font-semibold text-[#1E293B] mb-2">目标状态</label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['进行中', '已完成', '暂停'] as GoalStatus[]).map((s) => (
                        <button
                          key={s}
                          onClick={() => setProgressStatus(s)}
                          className={cn(
                            'h-10 rounded-md text-sm font-medium border transition-all cursor-pointer',
                            progressStatus === s
                              ? cn(
                                  'border-transparent text-white',
                                  s === '进行中' ? 'bg-[#8B5CF6]' :
                                  s === '已完成' ? 'bg-[#10B981]' :
                                  'bg-[#F59E0B]'
                                )
                              : 'border-[#E2E8F0] text-[#64748B] hover:border-[#CBD5E1]'
                          )}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Progress Notes */}
                  <div>
                    <label className="block text-sm font-semibold text-[#1E293B] mb-2">进展备注</label>
                    <Textarea
                      value={progressNotes}
                      onChange={(e) => setProgressNotes(e.target.value)}
                      placeholder="记录本次教学进展、学生表现、需要调整的策略等..."
                      rows={4}
                      className="w-full resize-y text-sm"
                    />
                  </div>

                  {/* Preview of new progress */}
                  <div>
                    <label className="block text-sm font-semibold text-[#1E293B] mb-2">预览</label>
                    <div className="flex items-center gap-3 p-3 bg-[#F1F5F9] rounded-lg">
                      <span className="text-xs text-[#64748B]">更新后进度</span>
                      <div className="flex-1 h-2 bg-white rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{
                            width: `${progressRate[0]}%`,
                            background: progressRate[0] >= 100
                              ? '#10B981'
                              : 'linear-gradient(90deg, #AC9174, #977653)',
                          }}
                        />
                      </div>
                      <span className="text-sm font-semibold text-[#977653]">{progressRate[0]}%</span>
                    </div>
                  </div>
                </div>

                {/* Sheet Footer */}
                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#E2E8F0]">
                  <button
                    onClick={() => setProgressSheetOpen(false)}
                    disabled={savingProgress}
                    className="h-10 px-4 rounded-md border border-[#CBD5E1] text-sm font-medium text-[#64748B] hover:bg-[#F7F6F4] transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    取消
                  </button>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => void handleSaveProgress()}
                    disabled={savingProgress}
                    className="flex items-center gap-1.5 h-10 px-4 rounded-md bg-[#977653] text-white text-sm font-medium hover:bg-[#7A5F42] transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <CheckCircle className="w-4 h-4" />
                    {savingProgress ? '保存中...' : '保存更新'}
                  </motion.button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-[#94A3B8] mb-0.5">{label}</div>
      <div className="text-sm text-[#1E293B] font-medium">{value}</div>
    </div>
  );
}

/**
 * v4 特教内核（6.2）：教育安置形式与 IEP 会议要件。
 * 展示优先用详情接口返回的最新值；可编辑时提供就地修改，
 * 安置形式为提交审核的法定必填项（后端 submit 强制校验）。
 */
function PlacementMeetingCard({
  plan,
  canEdit,
  onSaved,
}: {
  plan: IEPPlan;
  canEdit: boolean;
  onSaved: () => Promise<void> | void;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [placementTypes, setPlacementTypes] = useState<string[]>([]);
  const [placementType, setPlacementType] = useState(plan.placement_type ?? '');
  const [placementNotes, setPlacementNotes] = useState(plan.placement_notes ?? '');
  const [meetingDate, setMeetingDate] = useState(plan.meeting_date ?? '');
  const [meetingPlace, setMeetingPlace] = useState(plan.meeting_place ?? '');
  const [nextReviewDate, setNextReviewDate] = useState(plan.next_review_date ?? '');

  // 切换计划时同步本地表单
  useEffect(() => {
    setPlacementType(plan.placement_type ?? '');
    setPlacementNotes(plan.placement_notes ?? '');
    setMeetingDate(plan.meeting_date ?? '');
    setMeetingPlace(plan.meeting_place ?? '');
    setNextReviewDate(plan.next_review_date ?? '');
    setEditing(false);
  }, [plan.id, plan.placement_type, plan.placement_notes, plan.meeting_date, plan.meeting_place, plan.next_review_date]);

  useEffect(() => {
    let alive = true;
    fetchIEPMeta()
      .then((m) => { if (alive) setPlacementTypes(m.placement_types); })
      .catch(() => { /* 字典加载失败时回退为自由输入 */ });
    return () => { alive = false; };
  }, []);

  const handleSave = async () => {
    if (!placementType) {
      toast.error('教育安置形式为必填项');
      return;
    }
    setSaving(true);
    try {
      await updateIEP(plan.id, {
        placement_type: placementType,
        placement_notes: placementNotes || undefined,
        meeting_date: meetingDate || undefined,
        meeting_place: meetingPlace || undefined,
        next_review_date: nextReviewDate || undefined,
      });
      toast.success('安置与会议信息已保存');
      setEditing(false);
      await onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border border-[#E2E8F0] rounded-lg p-5">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-[#1E293B]">教育安置与 IEP 会议</h4>
        {canEdit && !editing && (
          <button
            onClick={() => setEditing(true)}
            className="text-xs text-[#977653] hover:underline cursor-pointer"
          >
            编辑
          </button>
        )}
      </div>

      {!editing ? (
        <div className="grid grid-cols-2 gap-x-8 gap-y-4">
          <InfoRow
            label="教育安置形式"
            value={plan.placement_type || '—（提交审核前必填）'}
          />
          <InfoRow label="安置说明" value={plan.placement_notes || '—'} />
          <InfoRow label="IEP 会议日期" value={plan.meeting_date || '—'} />
          <InfoRow label="会议地点" value={plan.meeting_place || '—'} />
          <InfoRow label="下次评估日期" value={plan.next_review_date || '—'} />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#1E293B] mb-1.5">教育安置形式 *</label>
              {placementTypes.length > 0 ? (
                <Select value={placementType} onValueChange={setPlacementType}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="请选择" /></SelectTrigger>
                  <SelectContent>
                    {placementTypes.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <input
                  value={placementType}
                  onChange={(e) => setPlacementType(e.target.value)}
                  className="w-full h-9 px-3 rounded-md border border-[#E2E8F0] text-sm"
                />
              )}
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#1E293B] mb-1.5">IEP 会议日期</label>
              <input
                type="date"
                value={meetingDate}
                onChange={(e) => setMeetingDate(e.target.value)}
                className="w-full h-9 px-3 rounded-md border border-[#E2E8F0] text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#1E293B] mb-1.5">会议地点</label>
              <input
                value={meetingPlace}
                onChange={(e) => setMeetingPlace(e.target.value)}
                className="w-full h-9 px-3 rounded-md border border-[#E2E8F0] text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#1E293B] mb-1.5">下次评估日期</label>
              <input
                type="date"
                value={nextReviewDate}
                onChange={(e) => setNextReviewDate(e.target.value)}
                className="w-full h-9 px-3 rounded-md border border-[#E2E8F0] text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#1E293B] mb-1.5">安置说明</label>
            <input
              value={placementNotes}
              onChange={(e) => setPlacementNotes(e.target.value)}
              placeholder="如：每周二/四下午在资源教室接受补救教学"
              className="w-full h-9 px-3 rounded-md border border-[#E2E8F0] text-sm"
            />
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => setEditing(false)}
              disabled={saving}
              className="h-8 px-3 rounded-md border border-[#CBD5E1] text-xs font-medium text-[#64748B] hover:bg-[#F7F6F4] cursor-pointer disabled:opacity-60"
            >
              取消
            </button>
            <button
              onClick={() => void handleSave()}
              disabled={saving}
              className="flex items-center gap-1 h-8 px-3 rounded-md bg-[#977653] text-white text-xs font-medium hover:bg-[#7A5F42] cursor-pointer disabled:opacity-60"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
