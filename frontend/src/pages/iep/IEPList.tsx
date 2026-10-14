import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Plus,
  Eye,
  Pencil,
  Trash2,
  MoreHorizontal,
  ChevronLeft,
  ChevronRight,
  FileText,
  CheckCircle,
  Clock,
  Send,
  ClipboardCheck,
  Copy,
  Archive,
  User,
  Target,
  TrendingUp,
  CheckSquare,
  PauseCircle,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { IEPPlan, IEPStatus, IEPGoal } from './types';
import { STATUS_COLORS, GOAL_STATUS_COLORS } from './types';
import ImportExportActions from '@/components/io/ImportExportActions';
import type { StudentOption } from '@/services/iep';
import type { IEPLevel } from '@/store/authStore';

const statusTabs: { label: IEPStatus | '全部'; color?: string }[] = [
  { label: '全部' },
  { label: '草稿', color: 'rgb(var(--info))' },
  { label: '审核中', color: 'rgb(var(--warning))' },
  { label: '已通过', color: 'rgb(var(--success))' },
  { label: '已签名', color: 'rgb(var(--surface-inverse-2))' },
  { label: '执行中', color: 'rgb(var(--violet))' },
  { label: '已完成', color: 'rgb(var(--brand-strong))' },
  { label: '已驳回', color: 'rgb(var(--danger))' },
];

interface IEPListProps {
  plans: IEPPlan[];
  /** 首屏/刷新加载中 */
  loading?: boolean;
  /** 加载失败信息，配合 onRetry 展示重试入口 */
  error?: string | null;
  onRetry?: () => void;
  /** 学生下拉选项（/students/options） */
  students?: StudentOption[];
  /** 制定人下拉选项（真实用户 + 已在计划中出现过的负责人） */
  teachers?: string[];
  /** 参与教师视角：本人负责的目标（已按权限过滤） */
  myGoals?: IEPGoal[];
  iepLevel: IEPLevel;
  currentUserName: string;
  currentUserId: string;
  onView: (plan: IEPPlan) => void;
  onEdit: (plan: IEPPlan) => void;
  onDelete: (plan: IEPPlan) => void;
  onCreate: () => void;
  onSubmitForReview: (plan: IEPPlan) => void;
  onCopy: (plan: IEPPlan) => void;
  onUpdateGoalProgress?: (goalId: string, completionRate: number, status: string, notes: string) => void;
  /** 导入完成后由父组件刷新列表 */
  onImported?: () => void;
}

export default function IEPList({
  plans,
  loading = false,
  error = null,
  onRetry,
  students = [],
  teachers = [],
  myGoals = [],
  iepLevel,
  currentUserName,
  currentUserId,
  onView,
  onEdit,
  onDelete,
  onCreate,
  onSubmitForReview,
  onCopy,
  onImported,
}: IEPListProps) {
  // 数据范围由后端 getDataScope() 在 SQL 层过滤，前端不再重复裁剪
  const scopePlans = plans;

  const isNone = iepLevel === 'none';
  const isView = iepLevel === 'view';
  const isParticipate = iepLevel === 'participate';
  const isFull = iepLevel === 'full';

  // iepLevel 'none': cannot do anything
  const canCreate = isFull;
  const canEditPlan = isFull || isParticipate;
  const canDeletePlan = isFull;
  const canApprovePlan = isFull;
  const canCopyPlan = isFull || isParticipate || isView;

  const [activeTab, setActiveTab] = useState<IEPStatus | '全部'>('全部');
  const [searchQuery, setSearchQuery] = useState('');
  const [studentFilter, setStudentFilter] = useState('');
  const [teacherFilter, setTeacherFilter] = useState('');
  const [academicYearFilter, setAcademicYearFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const pageSizeOptions = [10, 20, 50];

  const availableStudents = students;

  // For participate users: compute summary stats of goals they are responsible for
  const myGoalsSummary = useMemo(() => {
    if (!isParticipate) return null;
    const active = myGoals.filter((g) => g.status === '进行中').length;
    const completed = myGoals.filter((g) => g.status === '已完成').length;
    const pending = myGoals.filter((g) => g.status === '未开始').length;
    const paused = myGoals.filter((g) => g.status === '暂停').length;
    return { active, completed, pending, paused, total: myGoals.length, goals: myGoals };
  }, [isParticipate, myGoals]);

  // For participate users: derive plans that contain at least one goal they own
  const relevantPlanIds = useMemo(() => {
    if (!isParticipate || !myGoalsSummary) return new Set<string>(scopePlans.map((p) => p.id));
    return new Set(myGoalsSummary.goals.map((g) => g.iep_plan_id));
  }, [isParticipate, myGoalsSummary, scopePlans]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { '全部': scopePlans.length };
    const statuses: IEPStatus[] = ['草稿', '审核中', '已通过', '已签名', '执行中', '已完成', '已驳回'];
    statuses.forEach((s) => {
      counts[s] = scopePlans.filter((p) => p.status === s).length;
    });
    return counts;
  }, [scopePlans]);

  const filteredPlans = useMemo(() => {
    return scopePlans.filter((plan) => {
      // For participate users, only show plans that contain their goals
      if (isParticipate && !relevantPlanIds.has(plan.id)) return false;
      if (activeTab !== '全部' && plan.status !== activeTab) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const match =
          plan.title.toLowerCase().includes(q) ||
          plan.plan_code.toLowerCase().includes(q) ||
          plan.student_name.toLowerCase().includes(q) ||
          plan.student_number.toLowerCase().includes(q);
        if (!match) return false;
      }
      if (studentFilter && plan.student_id !== studentFilter) return false;
      if (teacherFilter && plan.primary_teacher !== teacherFilter) return false;
      if (academicYearFilter && plan.academic_year !== academicYearFilter) return false;
      return true;
    });
  }, [scopePlans, activeTab, searchQuery, studentFilter, teacherFilter, academicYearFilter, isParticipate, relevantPlanIds]);

  const totalPages = Math.ceil(filteredPlans.length / pageSize);
  const paginatedPlans = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredPlans.slice(start, start + pageSize);
  }, [filteredPlans, currentPage, pageSize]);

  const canEdit = (status: IEPStatus) => ['草稿', '已驳回'].includes(status);
  const canDelete = (status: IEPStatus) => canDeletePlan && ['草稿', '已驳回'].includes(status);
  const canSubmit = (status: IEPStatus) => status === '草稿';
  const canApprove = (status: IEPStatus) => canApprovePlan && status === '审核中';

  // iepLevel 'none': show empty state with permission denied message
  if (isNone) {
    return (
      <div className="space-y-6">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.25 }}
          className="flex items-center justify-between"
        >
          <div>
            <h1 className="text-[28px] font-bold text-ink leading-tight">IEP 管理</h1>
            <p className="text-sm text-ink-2 mt-1">个别化教育计划的制定、审批与跟踪</p>
          </div>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-surface rounded-lg p-16 shadow-sm text-center"
        >
          <FileText className="w-12 h-12 text-ink-4 mx-auto mb-3" />
          <p className="text-base font-semibold text-ink mb-1">暂无权限</p>
          <p className="text-sm text-ink-2">您没有查看 IEP 计划的权限</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-[28px] font-bold text-ink leading-tight">
            {isParticipate ? '我的 IEP 目标' : 'IEP 管理'}
          </h1>
          <p className="text-sm text-ink-2 mt-1">
            {isParticipate
              ? `查看和更新您负责的目标 (${currentUserName})`
              : isView
                ? '查看 IEP 计划（只读模式）'
                : '个别化教育计划的制定、审批与跟踪'}
          </p>
        </div>
        {canCreate && (
          <button
            onClick={onCreate}
            className="flex items-center gap-2 h-11 lg:h-10 px-4 rounded-md bg-brand text-ink-on-dark text-sm font-medium hover:bg-brand-strong active:bg-brand-deep transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            制定 IEP
          </button>
        )}
      </motion.div>

      {/* Participate User: My Goals Summary Cards */}
      {isParticipate && myGoalsSummary && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.02 }}
          className="grid grid-cols-4 gap-4"
        >
          {/* Total Goals Card */}
          <div className="bg-surface rounded-lg p-4 shadow-sm border border-line">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-ink-2">我负责的目标</span>
              <div className="w-8 h-8 rounded-full bg-brand-soft flex items-center justify-center">
                <Target className="w-4 h-4 text-brand-ink" />
              </div>
            </div>
            <div className="text-2xl font-bold text-ink">{myGoalsSummary.total}</div>
            <div className="text-xs text-ink-3 mt-1">跨越 {relevantPlanIds.size} 个IEP计划</div>
          </div>
          {/* Active Goals Card */}
          <div className="bg-surface rounded-lg p-4 shadow-sm border border-line">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-ink-2">进行中</span>
              <div className="w-8 h-8 rounded-full bg-violet-soft flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-violet" />
              </div>
            </div>
            <div className="text-2xl font-bold text-violet">{myGoalsSummary.active}</div>
            <div className="text-xs text-ink-3 mt-1">需要持续跟进</div>
          </div>
          {/* Completed Goals Card */}
          <div className="bg-surface rounded-lg p-4 shadow-sm border border-line">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-ink-2">已完成</span>
              <div className="w-8 h-8 rounded-full bg-success-soft flex items-center justify-center">
                <CheckSquare className="w-4 h-4 text-success-strong" />
              </div>
            </div>
            <div className="text-2xl font-bold text-success-strong">{myGoalsSummary.completed}</div>
            <div className="text-xs text-ink-3 mt-1">目标已达成</div>
          </div>
          {/* Pending Goals Card */}
          <div className="bg-surface rounded-lg p-4 shadow-sm border border-line">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-ink-2">未开始</span>
              <div className="w-8 h-8 rounded-full bg-surface-2 flex items-center justify-center">
                <PauseCircle className="w-4 h-4 text-ink-2" />
              </div>
            </div>
            <div className="text-2xl font-bold text-ink-2">{myGoalsSummary.pending}</div>
            <div className="text-xs text-ink-3 mt-1">待制定教学方案</div>
          </div>
        </motion.div>
      )}

      {/* Status Filter Tabs - hidden for participate and view users */}
      {!isParticipate && !isView && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.05 }}
          className="bg-surface rounded-lg p-4 shadow-sm"
        >
          <div className="flex flex-wrap gap-2">
            {statusTabs.map((tab, index) => {
              const isActive = activeTab === tab.label;
              const count = statusCounts[tab.label] || 0;
              const color = tab.color;
              return (
                <motion.button
                  key={tab.label}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: index * 0.04 }}
                  onClick={() => { setActiveTab(tab.label); setCurrentPage(1); }}
                  className={cn(
                    'flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium border transition-all duration-150 cursor-pointer min-h-11 lg:min-h-9',
                    isActive && color
                      ? `border-[${color}] bg-opacity-10`
                      : isActive && !color
                        ? 'border-ink bg-canvas text-ink'
                        : 'border-line bg-surface text-ink-2 hover:border-line-2 hover:bg-canvas'
                  )}
                  style={isActive && color ? {
                    borderColor: color,
                    backgroundColor: color + '14',
                    color: color,
                  } : {}}
                >
                  <span>{tab.label}</span>
                  <span
                    className="px-1.5 py-0.5 rounded text-xs font-semibold text-ink-on-dark"
                    style={color ? { backgroundColor: color } : { backgroundColor: 'rgb(var(--ink-2))' }}
                  >
                    {count}
                  </span>
                </motion.button>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* View-only user: show info banner */}
      {isView && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.05 }}
          className="bg-violet-soft rounded-lg p-4 border border-violet/20"
        >
          <p className="text-sm text-violet">
            您当前处于只读模式，可以查看 IEP 计划但无法编辑或操作。
          </p>
        </motion.div>
      )}

      {/* Participate view: My Goals Quick List */}
      {isParticipate && myGoalsSummary && myGoalsSummary.goals.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.05 }}
          className="bg-surface rounded-lg p-4 shadow-sm"
        >
          <h3 className="text-sm font-semibold text-ink mb-3">我负责的目标概览</h3>
          <div className="space-y-2 max-h-[200px] overflow-y-auto">
            {myGoalsSummary.goals.slice(0, 8).map((goal, index) => (
              <motion.div
                key={goal.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.04 }}
                className="flex items-center gap-3 p-2 rounded-md hover:bg-canvas transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-ink truncate">{goal.title}</span>
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium text-ink-on-dark flex-shrink-0"
                      style={{ backgroundColor: GOAL_STATUS_COLORS[goal.status]?.bg ? undefined : 'rgb(var(--ink-2))' }}>
                      <span className={cn('px-1.5 py-0.5 rounded-full text-[10px] font-medium', GOAL_STATUS_COLORS[goal.status]?.bg, GOAL_STATUS_COLORS[goal.status]?.text)}>
                        {goal.status}
                      </span>
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-ink-3">{goal.area}</span>
                    <span className="text-xs text-ink-4">|</span>
                    <span className="text-xs text-ink-3">{goal.goal_type}</span>
                    <span className="text-xs text-ink-4">|</span>
                    <span className="text-xs text-brand-ink">{goal.progress_percent}%</span>
                  </div>
                </div>
                {/* Mini progress bar */}
                <div className="w-20 h-1.5 bg-surface-2 rounded-full overflow-hidden flex-shrink-0">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${goal.progress_percent}%`,
                      background: goal.progress_percent >= 100
                        ? 'rgb(var(--success))'
                        : 'linear-gradient(90deg, rgb(var(--brand)), rgb(var(--brand)))',
                    }}
                  />
                </div>
              </motion.div>
            ))}
            {myGoalsSummary.goals.length > 8 && (
              <p className="text-xs text-ink-3 text-center py-1">
                还有 {myGoalsSummary.goals.length - 8} 个目标...
              </p>
            )}
          </div>
        </motion.div>
      )}

      {/* Filter Bar */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: 0.1 }}
        className="bg-surface rounded-lg p-4 shadow-sm"
      >
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-3" />
            <input
              type="text"
              placeholder="搜索学生姓名、IEP编号..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              className="h-10 w-[240px] pl-9 pr-3 rounded-md border border-line-2 text-sm text-ink placeholder:text-ink-3 focus:outline-none focus:border-line-focus focus:shadow-[0_0_0_3px_rgba(59,130,246,0.15)] transition-all"
            />
          </div>

          <select
            value={studentFilter}
            onChange={(e) => { setStudentFilter(e.target.value); setCurrentPage(1); }}
            className="h-11 lg:h-10 px-3 rounded-md border border-line-2 text-sm text-ink bg-surface focus:outline-none focus:border-line-focus focus:shadow-[0_0_0_3px_rgba(59,130,246,0.15)] transition-all cursor-pointer"
            style={{ width: '180px' }}
          >
            <option value="">全部学生</option>
            {availableStudents.map((s) => (
              <option key={s.id} value={String(s.id)}>{s.name}</option>
            ))}
          </select>

          {!isParticipate && (
            <select
              value={teacherFilter}
              onChange={(e) => { setTeacherFilter(e.target.value); setCurrentPage(1); }}
              className="h-11 lg:h-10 px-3 rounded-md border border-line-2 text-sm text-ink bg-surface focus:outline-none focus:border-line-focus focus:shadow-[0_0_0_3px_rgba(59,130,246,0.15)] transition-all cursor-pointer"
              style={{ width: '160px' }}
            >
              <option value="">全部制定人</option>
              {teachers.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          )}

          <select
            value={academicYearFilter}
            onChange={(e) => { setAcademicYearFilter(e.target.value); setCurrentPage(1); }}
            className="h-11 lg:h-10 px-3 rounded-md border border-line-2 text-sm text-ink bg-surface focus:outline-none focus:border-line-focus focus:shadow-[0_0_0_3px_rgba(59,130,246,0.15)] transition-all cursor-pointer"
            style={{ width: '160px' }}
          >
            <option value="">全部学年</option>
            <option value="2024-2025">2024-2025</option>
            <option value="2023-2024">2023-2024</option>
          </select>

          <div className="flex gap-2 ml-auto">
            <button
              onClick={() => {
                setSearchQuery('');
                setStudentFilter('');
                setTeacherFilter('');
                setAcademicYearFilter('');
                setCurrentPage(1);
              }}
              className="h-11 lg:h-10 px-3 rounded-md text-sm text-ink-2 hover:bg-canvas transition-colors cursor-pointer"
            >
              重置
            </button>
            <ImportExportActions
              module="iep"
              filenameBase="IEP计划"
              onImported={onImported}
              readOnly={!canCreate && !canEditPlan}
              exportParams={{
                student_id: studentFilter ? Number(studentFilter) : undefined,
                status: activeTab !== '全部' ? activeTab : undefined,
              }}
            />
          </div>
        </div>
      </motion.div>

      {/* Data Table */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: 0.15 }}
        className="bg-surface rounded-lg shadow-sm overflow-hidden"
      >
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-canvas">
                <th className="px-4 py-3 text-left text-xs font-semibold text-ink-3 tracking-wider w-[45px]">
                  <input type="checkbox" className="w-6 h-6 rounded border-line-2 cursor-pointer" />
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-ink-3 tracking-wider">学生</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-ink-3 tracking-wider min-w-[180px]">IEP 期间</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-ink-3 tracking-wider">制定人</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-ink-3 tracking-wider">状态</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-ink-3 tracking-wider">目标数</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-ink-3 tracking-wider min-w-[120px]">进度</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-ink-3 tracking-wider">家长签名</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-ink-3 tracking-wider w-[100px]">操作</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence mode="popLayout">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-16 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <Loader2 className="w-8 h-8 text-brand-ink animate-spin" />
                        <p className="text-sm text-ink-2">正在加载 IEP 计划...</p>
                      </div>
                    </td>
                  </tr>
                ) : error ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-16 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <AlertCircle className="w-12 h-12 text-ink-4" />
                        <p className="text-base font-semibold text-ink">IEP 计划加载失败</p>
                        <p className="text-sm text-ink-2">{error}</p>
                        {onRetry && (
                          <button
                            onClick={onRetry}
                            className="mt-2 flex items-center gap-2 h-9 px-4 rounded-md border border-line-2 text-sm font-medium text-ink-2 hover:bg-canvas transition-colors cursor-pointer"
                          >
                            <Loader2 className="w-4 h-4" />
                            点击重试
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : paginatedPlans.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-16 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <FileText className="w-12 h-12 text-ink-4" />
                        <p className="text-base font-semibold text-ink">
                          {isParticipate ? '暂无与您相关的 IEP 计划' : '暂无 IEP 计划'}
                        </p>
                        <p className="text-sm text-ink-2">
                          {isParticipate ? '您尚未被分配任何目标' : '点击上方按钮制定第一个 IEP'}
                        </p>
                        {canCreate && (
                          <button
                            onClick={onCreate}
                            className="mt-2 flex items-center gap-2 h-9 px-4 rounded-md bg-brand text-ink-on-dark text-sm font-medium hover:bg-brand-strong transition-colors cursor-pointer"
                          >
                            <Plus className="w-4 h-4" />
                            制定 IEP
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedPlans.map((plan, index) => {
                    const statusColor = STATUS_COLORS[plan.status];
                    const progress = plan.progress_percent ?? 0;
                    return (
                      <motion.tr
                        key={plan.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.2, delay: index * 0.05 }}
                        className="border-b border-line hover:bg-canvas transition-colors duration-150 group"
                      >
                        <td className="px-4 py-4">
                          <input type="checkbox" className="w-6 h-6 rounded border-line-2 cursor-pointer" />
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-brand-soft flex items-center justify-center flex-shrink-0">
                              <User className="w-4 h-4 text-brand-ink" />
                            </div>
                            <div>
                              <div className="text-sm font-semibold text-ink">{plan.student_name}</div>
                              <div className="text-xs text-ink-3">{plan.student_number || '—'}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="text-xs text-ink">
                            {plan.start_date} ~ {plan.end_date}
                          </div>
                          <div className="text-xs text-ink-3 mt-0.5">{plan.academic_year} {plan.semester}</div>
                        </td>
                        <td className="px-4 py-4 text-sm text-ink">{plan.primary_teacher}</td>
                        <td className="px-4 py-4">
                          <span className={cn(
                            'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
                            statusColor.lightBg,
                            statusColor.text
                          )}>
                            {plan.status === '审核中' && (
                              <span className="w-1.5 h-1.5 rounded-full bg-current mr-1 animate-pulse" />
                            )}
                            {plan.status}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-sm text-ink">{plan.goals_count} 个</td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-surface-2 rounded-full overflow-hidden min-w-[60px]">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${progress}%` }}
                                transition={{ duration: 0.5, delay: index * 0.05 }}
                                className="h-full rounded-full"
                                style={{
                                  background: progress > 0
                                    ? 'linear-gradient(90deg, rgb(var(--brand)), rgb(var(--brand)))'
                                    : 'transparent',
                                }}
                              />
                            </div>
                            <span className="text-xs text-ink-2 w-8">
                              {plan.progress_percent === undefined ? '—' : `${plan.progress_percent}%`}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          {plan.signature_status === '已签名' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-success-soft text-success-strong">
                              <CheckCircle className="w-3 h-3" />
                              已签名
                            </span>
                          ) : plan.signature_status === '待签名' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-warning-soft text-warning-strong">
                              <Clock className="w-3 h-3" />
                              待签名
                            </span>
                          ) : (
                            <span className="text-xs text-ink-3">—</span>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-1 relative">
                            <button
                              onClick={() => onView(plan)}
                              className="p-3 lg:p-1.5 rounded-md min-h-11 min-w-11 lg:min-h-7 lg:min-w-7 flex items-center justify-center text-ink-2 hover:bg-canvas hover:text-ink transition-colors cursor-pointer"
                              title="查看"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            {(canEdit(plan.status) && canEditPlan) && (
                              <button
                                onClick={() => onEdit(plan)}
                                className="p-3 lg:p-1.5 rounded-md min-h-11 min-w-11 lg:min-h-7 lg:min-w-7 flex items-center justify-center text-ink-2 hover:bg-canvas hover:text-ink transition-colors cursor-pointer"
                                title="编辑"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              onClick={() => setOpenMenuId(openMenuId === plan.id ? null : plan.id)}
                              className="p-3 lg:p-1.5 rounded-md min-h-11 min-w-11 lg:min-h-7 lg:min-w-7 flex items-center justify-center text-ink-2 hover:bg-canvas hover:text-ink transition-colors cursor-pointer"
                              title="更多"
                            >
                              <MoreHorizontal className="w-4 h-4" />
                            </button>

                            {/* Dropdown Menu */}
                            <AnimatePresence>
                              {openMenuId === plan.id && (
                                <>
                                  <div className="fixed inset-0 z-40" onClick={() => setOpenMenuId(null)} />
                                  <motion.div
                                    initial={{ opacity: 0, scale: 0.95, y: -4 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.95, y: -4 }}
                                    transition={{ duration: 0.15 }}
                                    className="absolute right-0 top-full mt-1 w-44 bg-surface rounded-lg shadow-lg border border-line z-50 py-1"
                                  >
                                    {canSubmit(plan.status) && isFull && (
                                      <button
                                        onClick={() => { onSubmitForReview(plan); setOpenMenuId(null); }}
                                        className="flex items-center gap-2 w-full px-3 py-2 text-sm text-ink hover:bg-canvas transition-colors cursor-pointer"
                                      >
                                        <Send className="w-4 h-4 text-brand-ink" />
                                        提交审核
                                      </button>
                                    )}
                                    {canApprove(plan.status) && (
                                      <button
                                        onClick={() => { onView(plan); setOpenMenuId(null); }}
                                        className="flex items-center gap-2 w-full px-3 py-2 text-sm text-ink hover:bg-canvas transition-colors cursor-pointer"
                                      >
                                        <ClipboardCheck className="w-4 h-4 text-success" />
                                        审批
                                      </button>
                                    )}
                                    {canCopyPlan && (
                                      <button
                                        onClick={() => { onCopy(plan); setOpenMenuId(null); }}
                                        className="flex items-center gap-2 w-full px-3 py-2 text-sm text-ink hover:bg-canvas transition-colors cursor-pointer"
                                      >
                                        <Copy className="w-4 h-4 text-ink-2" />
                                        复制 IEP
                                      </button>
                                    )}
                                    {plan.status === '已完成' && isFull && (
                                      <button className="flex items-center gap-2 w-full px-3 py-2 text-sm text-ink hover:bg-canvas transition-colors cursor-pointer">
                                        <Archive className="w-4 h-4 text-ink-2" />
                                        归档
                                      </button>
                                    )}
                                    {canDelete(plan.status) && (
                                      <button
                                        onClick={() => { onDelete(plan); setOpenMenuId(null); }}
                                        className="flex items-center gap-2 w-full px-3 py-2 text-sm text-danger hover:bg-danger-soft transition-colors cursor-pointer"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                        删除
                                      </button>
                                    )}
                                  </motion.div>
                                </>
                              )}
                            </AnimatePresence>
                          </div>
                        </td>
                      </motion.tr>
                    );
                  })
                )}
              </AnimatePresence>
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {filteredPlans.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-line">
            <div className="text-sm text-ink-2">
              共 <span className="font-medium text-ink">{filteredPlans.length}</span> 条
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="p-3 lg:p-1.5 rounded-md min-h-11 min-w-11 lg:min-h-7 lg:min-w-7 flex items-center justify-center text-ink-2 hover:bg-canvas disabled:text-ink-4 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={cn(
                    'min-w-[44px] h-11 lg:h-8 px-2 rounded-md text-sm font-medium transition-colors cursor-pointer',
                    page === currentPage
                      ? 'bg-brand text-ink-on-dark'
                      : 'text-ink-2 hover:bg-canvas'
                  )}
                >
                  {page}
                </button>
              ))}
              <button
                onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                className="p-3 lg:p-1.5 rounded-md min-h-11 min-w-11 lg:min-h-7 lg:min-w-7 flex items-center justify-center text-ink-2 hover:bg-canvas disabled:text-ink-4 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm text-ink-2">每页</span>
              <select
                value={pageSize}
                onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                className="h-11 lg:h-8 px-2 rounded-md border border-line-2 text-sm text-ink bg-surface focus:outline-none focus:border-line-focus cursor-pointer"
              >
                {pageSizeOptions.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
              <span className="text-sm text-ink-2">条</span>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
