import { useState, useCallback, useEffect, useMemo } from 'react';
import { AnimatePresence } from 'framer-motion';
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
  submitIEP,
  updateIEP,
} from '@/services/iep';
import type { StudentOption, TeacherOption } from '@/services/iep';

/** 列表一次性拉取上限（后端 pageSize 上限 100），前端再做分页/筛选 */
const LIST_PAGE_SIZE = 100;

export default function IEP() {
  const { user, permissions } = useAuthStore();
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
  }, []);

  const handleDelete = useCallback(async (plan: IEPPlan) => {
    // Only full permission users can delete
    if (!isFull) {
      toast.error('您没有权限删除IEP计划');
      return;
    }
    await deleteIEP(Number(plan.id));
    toast.success('IEP 计划已删除');
    await loadPlans();
  }, [isFull, loadPlans]);

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
    await submitIEP(Number(plan.id));
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
            onClose={() => { setDetailOpen(false); setViewingPlan(null); }}
            onEdit={(plan) => {
              setDetailOpen(false);
              setViewingPlan(null);
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
