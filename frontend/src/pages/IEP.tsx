import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { useAuthStore } from '@/store/authStore';
import IEPList from './iep/IEPList';
import IEPWizard from './iep/IEPWizard';
import IEPDetail from './iep/IEPDetail';
import type { IEPGoal, IEPPlan, WizardFormData } from './iep/types';
import {
  buildPlanUpdatePayload,
  createIEP,
  deleteIEP,
  fetchGoalsForPlans,
  fetchIEP,
  fetchIEPList,
  fetchStudentOptions,
  fetchTeacherOptions,
  recordGoalProgress,
  saveGoals,
  QualityGateError,
  submitIEP,
  updateIEP,
} from '@/services/iep';
import type { StudentOption, TeacherOption } from '@/services/iep';
import { useConfirm } from '@/components/feedback/ConfirmProvider';

/** 列表一次性拉取上限（后端 pageSize 上限 100），前端再做分页/筛选 */
const LIST_PAGE_SIZE = 100;

export default function IEP() {
  const { user, permissions } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const iepLevel = permissions?.iep_level || 'full';
  const isParticipate = iepLevel === 'participate';
  const isFull = iepLevel === 'full';

  // Derive current user identity (fallback for demo)
  const currentUserName = user?.name || '张老师';
  const currentUserId = user?.id || 't1';

  const [plans, setPlans] = useState<IEPPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [teachers, setTeachers] = useState<TeacherOption[]>([]);
  const [myGoals, setMyGoals] = useState<IEPGoal[]>([]);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<IEPPlan | null>(null);
  const [viewingPlan, setViewingPlan] = useState<IEPPlan | null>(null);

  const loadPlans = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchIEPList({ page: 1, pageSize: LIST_PAGE_SIZE });
      setPlans(result.list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'IEP 计划加载失败');
      setPlans([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // 首屏：计划列表 + 学生/教师下拉选项
  useEffect(() => {
    void loadPlans();
  }, [loadPlans]);

  useEffect(() => {
    let cancelled = false;
    fetchStudentOptions()
      .then((list) => { if (!cancelled) setStudents(list); })
      .catch(() => { if (!cancelled) setStudents([]); });
    fetchTeacherOptions()
      .then((list) => { if (!cancelled) setTeachers(list); })
      .catch(() => { if (!cancelled) setTeachers([]); });
    return () => { cancelled = true; };
  }, []);

  // 参与教师视角：拉取各计划目标，筛出本人负责的目标
  useEffect(() => {
    if (!isParticipate || plans.length === 0) {
      setMyGoals([]);
      return;
    }
    let cancelled = false;
    const planIds = plans.slice(0, 20).map((p) => Number(p.id)).filter((id) => Number.isFinite(id) && id > 0);
    fetchGoalsForPlans(planIds)
      .then((goals) => {
        if (cancelled) return;
        setMyGoals(
          goals.filter(
            (g) =>
              String(g.responsible_teacher_id ?? '') === String(currentUserId) ||
              (g.responsible_teacher_name ?? '') === currentUserName,
          ),
        );
      })
      .catch(() => { if (!cancelled) setMyGoals([]); });
    return () => { cancelled = true; };
  }, [isParticipate, plans, currentUserId, currentUserName]);

  // 用学生档案补全班级（学号在数据库中不存在该字段，留空）
  const studentMap = useMemo(() => {
    const map = new Map<string, StudentOption>();
    students.forEach((s) => map.set(String(s.id), s));
    return map;
  }, [students]);

  const enrichedPlans = useMemo(
    () =>
      plans.map((p) => ({
        ...p,
        student_class: p.student_class || studentMap.get(String(p.student_id))?.class_name || '',
      })),
    [plans, studentMap],
  );

  // 打开详情后回填的计划级进度（后端不提供该字段，这里用目标均值缓存）
  const [progressMap, setProgressMap] = useState<Record<string, number>>({});
  const handlePlanProgress = useCallback((planId: string, progress: number) => {
    setProgressMap((prev) => (prev[planId] === progress ? prev : { ...prev, [planId]: progress }));
  }, []);

  const displayPlans = useMemo(
    () => enrichedPlans.map((p) => ({ ...p, progress_percent: progressMap[p.id] ?? p.progress_percent })),
    [enrichedPlans, progressMap],
  );

  const teacherNames = useMemo(() => {
    const names = new Set<string>();
    displayPlans.forEach((p) => { if (p.primary_teacher) names.add(p.primary_teacher); });
    teachers.forEach((t) => { if (t.name) names.add(t.name); });
    return Array.from(names);
  }, [displayPlans, teachers]);

  const handleCreate = useCallback(() => {
    setEditingPlan(null);
    setWizardOpen(true);
  }, []);

  const handleEdit = useCallback((plan: IEPPlan) => {
    // Participate users can only edit plans in draft or rejected status
    if (isParticipate && !['草稿', '已驳回'].includes(plan.status)) {
      toast.error('只有草稿或已驳回状态的IEP可以编辑');
      return;
    }
    setEditingPlan(plan);
    setWizardOpen(true);
  }, [isParticipate]);

  const handleView = useCallback((plan: IEPPlan) => {
    setViewingPlan(plan);
    setDetailOpen(true);
    // 深链状态同步：URL 带上 plan 参数，刷新/分享链接后仍落在该计划详情上
    if (searchParams.get('plan') !== String(plan.id)) {
      const next = new URLSearchParams(searchParams);
      next.set('plan', String(plan.id));
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  /**
   * 深链支持：/iep?plan=<id>
   *
   * 今日工作台里点「目标详情 / 复审 / 审批」时，用户要落在这个计划的详情上，
   * 而不是停在 21 条计划的列表里再自己找一遍。URL 带 plan 参数即在加载完成后自动展开。
   */
  const planIdParam = searchParams.get('plan');
  // 已自动展开过的深链参数（P0 修复的关键一环）。
  // setSearchParams 在 RR7 是 transition 更新：closeDetail 里紧急提交的
  // detailOpen=false 会先渲染，而 URL 参数还在过渡窗口（仍是旧值），
  // 此窗口内深链 effect 读到旧参数 + 已关状态会把抽屉再次打开——
  // 实测表现为「点 X / Esc / 遮罩都关不掉，URL 却已干净」。
  // 用 ref 记录已处理的参数值，同一参数只自动展开一次；
  // 用户主动关闭后即使参数因回退/竞态再次出现，也不重开。
  const handledPlanParamRef = useRef<string | null>(null);
  useEffect(() => {
    if (!planIdParam || plans.length === 0) return;
    if (handledPlanParamRef.current === planIdParam) return;
    const target = plans.find((p) => String(p.id) === planIdParam);
    if (target) {
      handledPlanParamRef.current = planIdParam;
      setViewingPlan(target);
      setDetailOpen(true);
    }
  }, [planIdParam, plans]);

  /**
   * 关闭详情抽屉。
   *
   * P0 修复（2026-10-15 真实浏览器实测）：必须同步清掉 URL 的 plan 参数，
   * 否则下方深链 effect 会看到 planIdParam 仍在、detailOpen 已关，
   * 立刻把同一个计划重新 setViewingPlan + setDetailOpen(true)——
   * 用户点 X / Esc / 遮罩全都像没反应，且全屏遮罩挡住侧栏导航，
   * 表现为「不能关闭、不能退出、无法返回其它页面」。
   */
  const closeDetail = useCallback(() => {
    setDetailOpen(false);
    setViewingPlan(null);
    if (searchParams.has('plan')) {
      const next = new URLSearchParams(searchParams);
      next.delete('plan');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const confirm = useConfirm();

  const handleDelete = useCallback(async (plan: IEPPlan) => {
    // Only full permission users can delete
    if (!isFull) {
      toast.error('您没有权限删除IEP计划');
      return;
    }
    const ok = await confirm({
      title: '删除这份 IEP 计划？',
      description: (
        <>
          将删除该 IEP 计划，连同其下全部长期目标、短期目标、任务步骤与试次记录。
          <b className="text-danger-strong">删除后不可撤销</b>
          ，学生的进度曲线会随之消失。如果只是填错了，建议改用编辑。
        </>
      ),
      confirmText: '删除计划',
    });
    if (!ok) return;
    await deleteIEP(Number(plan.id));
    toast.success('IEP 计划已删除');
    await loadPlans();
  }, [isFull, loadPlans, confirm]);

  const persistPlan = useCallback(
    async (planId: number, data: WizardFormData) => {
      await updateIEP(planId, buildPlanUpdatePayload(data));
      if (data.goals.length > 0) {
        await saveGoals(planId, data.goals as never[]);
      }
    },
    [],
  );

  const handleSaveWizard = useCallback(
    async (data: WizardFormData & { status: '草稿' | '审核中' }) => {
      const studentId = Number(data.student_id);
      const title = data.title || `${data.student_name || ''}的IEP计划`;
      if (!Number.isFinite(studentId) || studentId <= 0 || !title) {
        toast.error('请选择学生并填写计划标题');
        throw new Error('学生ID和计划标题不能为空');
      }

      const createPayload = {
        student_id: studentId,
        title,
        academic_year: data.academic_year,
        semester: data.semester,
        start_date: data.start_date || undefined,
        end_date: data.end_date || undefined,
      };

      if (editingPlan) {
        await persistPlan(Number(editingPlan.id), data);
        if (data.status === '审核中') await submitIEP(Number(editingPlan.id));
      } else {
        const created = await createIEP(createPayload);
        await persistPlan(created.id, data);
        if (data.status === '审核中') await submitIEP(created.id);
      }

      toast.success(data.status === '审核中' ? 'IEP 计划已提交审核' : 'IEP 草稿已保存');
      setWizardOpen(false);
      setEditingPlan(null);
      await loadPlans();
    },
    [editingPlan, loadPlans, persistPlan],
  );

  const handleSubmitForReview = useCallback(async (plan: IEPPlan) => {
    if (!isFull) {
      toast.error('您没有权限提交审核');
      return;
    }
    try {
      await submitIEP(Number(plan.id));
    } catch (e) {
      // v7：一致性质检不通过时，把具体问题逐条告诉老师，而不是一句「提交失败」
      if (e instanceof QualityGateError) {
        toast.error('未通过 IEP 一致性质检', {
          description: e.brief.join('　'),
          duration: 15000,
        });
        return;
      }
      toast.error(e instanceof Error ? e.message : '提交失败');
      return;
    }
    toast.success('IEP 计划已提交审核');
    await loadPlans();
  }, [isFull, loadPlans]);

  const handleCopy = useCallback(async (plan: IEPPlan) => {
    if (!isFull) {
      toast.error('您没有权限复制IEP');
      return;
    }
    const created = await createIEP({
      student_id: Number(plan.student_id),
      title: `${plan.title} (复制)`,
      academic_year: plan.academic_year,
      semester: plan.semester,
      start_date: plan.start_date || undefined,
      end_date: plan.end_date || undefined,
    });
    // 复制目标：取源计划目标后去掉 id，让后端走 INSERT 分支
    try {
      const source = await fetchIEP(Number(plan.id));
      if (source.goals.length > 0) {
        await saveGoals(
          created.id,
          source.goals.map((g) => ({ ...g, id: undefined }) as never),
        );
      }
    } catch {
      /* 目标复制失败不阻断主流程 */
    }
    toast.success('IEP 计划已复制');
    await loadPlans();
  }, [isFull, loadPlans]);

  // Handle goal progress update from detail view
  const handleUpdateGoalProgress = useCallback(
    async (goalId: string, completionRate: number, status: string, notes: string) => {
      const numericGoalId = Number(goalId);
      if (!Number.isFinite(numericGoalId) || numericGoalId <= 0) {
        toast.error('目标未找到');
        return;
      }
      await recordGoalProgress({
        goal_id: numericGoalId,
        completion_rate: completionRate,
        max_score: 5,
        notes,
        prompt_level: status === '已完成' ? '独立' : '',
      });
      toast.success(`目标进度已更新至 ${completionRate}%`);
      await loadPlans();
    },
    [loadPlans],
  );

  return (
    <>
      <IEPList
        plans={displayPlans}
        loading={loading}
        error={error}
        onRetry={loadPlans}
        students={students}
        teachers={teacherNames}
        myGoals={myGoals}
        iepLevel={iepLevel}
        currentUserName={currentUserName}
        currentUserId={currentUserId}
        onView={handleView}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onCreate={handleCreate}
        onSubmitForReview={handleSubmitForReview}
        onCopy={handleCopy}
        onUpdateGoalProgress={handleUpdateGoalProgress}
        onImported={loadPlans}
      />

      <AnimatePresence>
        {wizardOpen && (
          <IEPWizard
            plan={editingPlan}
            iepLevel={iepLevel}
            currentUserName={currentUserName}
            currentUserId={currentUserId}
            students={students}
            teachers={teachers}
            onClose={() => { setWizardOpen(false); setEditingPlan(null); }}
            onSave={handleSaveWizard}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {detailOpen && viewingPlan && (
          <IEPDetail
            plan={viewingPlan}
            iepLevel={iepLevel}
            currentUserName={currentUserName}
            currentUserId={currentUserId}
            onClose={closeDetail}
            onEdit={(plan) => {
              closeDetail();
              setEditingPlan(plan);
              setWizardOpen(true);
            }}
            onUpdateGoalProgress={handleUpdateGoalProgress}
            onRefresh={loadPlans}
            onPlanProgress={handlePlanProgress}
          />
        )}
      </AnimatePresence>
    </>
  );
}
