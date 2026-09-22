import { useState, useCallback, useMemo } from 'react';
import { useDrawerA11y } from '@/hooks/useDrawerA11y';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Save,
  Plus,
  Trash2,
  Check,
  User,
  GraduationCap,
  Target,
  Settings2,
  Send,
  AlertCircle,
  XCircle,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { IEPPlan, WizardFormData, GoalArea, GoalType, IEPService, EvaluationMethod, EvaluationFrequency, Priority, GoalStatus } from './types';
import { GOAL_AREAS, GOAL_AREA_COLORS, SERVICE_TYPES, EVALUATION_METHODS, EVALUATION_FREQUENCIES, GOAL_STATUS_COLORS } from './types';
import type { StudentOption, TeacherOption } from '@/services/iep';
import type { IEPLevel } from '@/store/authStore';

const steps = [
  { label: '基本信息', icon: User },
  { label: '现况描述', icon: GraduationCap },
  { label: '目标设定', icon: Target },
  { label: '服务配置', icon: Settings2 },
  { label: '审核提交', icon: Send },
];

const areaLabels: Record<string, string> = {
  '认知发展': '认知发展',
  '语言能力': '语言能力',
  '运动能力': '运动能力',
  '社交适应': '社交适应',
  '生活自理': '生活自理',
  '情绪行为': '情绪行为',
};

interface IEPWizardProps {
  plan?: IEPPlan | null;
  iepLevel: IEPLevel;
  currentUserName: string;
  currentUserId: string;
  /** 真实学生下拉数据（来自 GET /students/options） */
  students?: StudentOption[];
  /** 真实教师下拉数据（来自 GET /system/users） */
  teachers?: TeacherOption[];
  onClose: () => void;
  onSave: (data: WizardFormData & { status: '草稿' | '审核中' }) => void;
}

const emptyForm: WizardFormData = {
  student_id: '',
  student_name: '',
  title: '',
  academic_year: '2024-2025',
  semester: '第二学期',
  start_date: '',
  end_date: '',
  primary_teacher: '',
  team_members: [],
  meeting_date: '',
  current_levels: {
    '认知发展': '',
    '语言能力': '',
    '运动能力': '',
    '社交适应': '',
    '生活自理': '',
    '情绪行为': '',
  },
  goals: [],
  services: [],
  teaching_adaptations: '',
  assistive_tech: '',
  transition_plan: '',
};

export default function IEPWizard({
  plan,
  iepLevel,
  currentUserName,
  currentUserId,
  students = [],
  teachers = [],
  onClose,
  onSave,
}: IEPWizardProps) {
  const isParticipate = iepLevel === 'participate';

  // P3-1 修复：裸抽屉补充 Esc 关闭能力
  useDrawerA11y(true, onClose);

  /**
   * 教师姓名列表：优先使用后端返回的真实教师，
   * 若当前用户无 user_manage 权限导致列表为空，则回退为「当前用户本人」。
   */
  const teacherNames = useMemo(() => {
    const names = teachers.map((t) => (t.name || '').trim()).filter(Boolean);
    if (currentUserName && !names.includes(currentUserName)) {
      names.unshift(currentUserName);
    }
    return names;
  }, [teachers, currentUserName]);

  const [currentStep, setCurrentStep] = useState(0);
  const [visitedSteps, setVisitedSteps] = useState<Set<number>>(new Set([0]));
  const [formData, setFormData] = useState<WizardFormData>(() => {
    if (plan) {
      return {
        ...emptyForm,
        student_id: plan.student_id,
        student_name: plan.student_name,
        title: plan.title,
        academic_year: plan.academic_year,
        semester: plan.semester,
        start_date: plan.start_date,
        end_date: plan.end_date,
        primary_teacher: plan.primary_teacher,
        team_members: plan.team_members,
        current_levels: plan.current_levels,
        teaching_adaptations: plan.teaching_adaptations,
        assistive_tech: plan.assistive_tech,
        transition_plan: plan.transition_plan,
        goals: [],
        services: [],
      };
    }
    // 默认将当前用户设为计划制定人（真实场景下不存在写死的教师姓名）
    return {
      ...emptyForm,
      primary_teacher: currentUserName,
    };
  });

  const [confirmChecks, setConfirmChecks] = useState<boolean[]>([false, false, false, false, false, false]);
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [, setEditingGoalIndex] = useState<number | null>(null);

  const updateForm = useCallback((updates: Partial<WizardFormData>) => {
    setFormData(prev => ({ ...prev, ...updates }));
  }, []);

  const handleNext = () => {
    if (currentStep < 4) {
      const next = currentStep + 1;
      setCurrentStep(next);
      setVisitedSteps(prev => new Set([...prev, next]));
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) setCurrentStep(currentStep - 1);
  };

  const goToStep = (step: number) => {
    if (visitedSteps.has(step) || step <= currentStep) {
      setCurrentStep(step);
      setVisitedSteps(prev => new Set([...prev, step]));
    }
  };

  const addGoal = (goal: Partial<IEPService> & { area?: GoalArea; title?: string; goal_type?: GoalType; description?: string; criteria?: string; teaching_strategies?: string; evaluation_method?: EvaluationMethod; evaluation_frequency?: EvaluationFrequency; priority?: Priority; responsible_teacher?: string; responsible_teacher_id?: string; responsible_teacher_name?: string }) => {
    setFormData(prev => ({
      ...prev,
      goals: [...prev.goals, goal],
    }));
    setShowGoalModal(false);
    setEditingGoalIndex(null);
  };

  const removeGoal = (index: number) => {
    setFormData(prev => ({
      ...prev,
      goals: prev.goals.filter((_, i) => i !== index),
    }));
  };

  const addService = () => {
    setFormData(prev => ({
      ...prev,
      services: [...prev.services, { service_type: '认知训练', frequency: '每周2次', duration: '30分钟', teacher: '', location: '' }],
    }));
  };

  const updateService = (index: number, field: keyof IEPService, value: string) => {
    setFormData(prev => ({
      ...prev,
      services: prev.services.map((s, i) => i === index ? { ...s, [field]: value } : s),
    }));
  };

  const removeService = (index: number) => {
    setFormData(prev => ({
      ...prev,
      services: prev.services.filter((_, i) => i !== index),
    }));
  };

  const allConfirmed = confirmChecks.every(Boolean);

  const selectedStudent = students.find(s => String(s.id) === String(formData.student_id));

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Drawer */}
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
            <h2 className="text-lg font-semibold text-[#1E293B]">
              {plan ? '编辑 IEP 计划' : '制定 IEP 计划'}
            </h2>
          </div>
          <button
            onClick={() => onSave({ ...formData, status: '草稿' })}
            className="flex items-center gap-2 h-9 px-3 rounded-md border border-[#CBD5E1] text-sm text-[#64748B] hover:bg-[#F7F6F4] transition-colors cursor-pointer"
          >
            <Save className="w-4 h-4" />
            保存草稿
          </button>
        </div>

        {/* Steps */}
        <div className="px-6 py-4 border-b border-[#E2E8F0] flex-shrink-0">
          <div className="flex items-center">
            {steps.map((step, index) => {
              const Icon = step.icon;
              const isActive = index === currentStep;
              const isCompleted = index < currentStep;
              const isVisited = visitedSteps.has(index);
              return (
                <div key={step.label} className="flex items-center flex-1 last:flex-none">
                  <button
                    onClick={() => goToStep(index)}
                    disabled={!isVisited && index > currentStep}
                    className={cn(
                      'flex items-center gap-2 transition-all cursor-pointer disabled:cursor-not-allowed',
                      isActive ? 'opacity-100' : 'opacity-70 hover:opacity-100'
                    )}
                  >
                    <div className={cn(
                      'w-8 h-8 rounded-full flex items-center justify-center transition-colors',
                      isActive ? 'bg-[#977653] text-white' :
                      isCompleted ? 'bg-[#10B981] text-white' :
                      isVisited ? 'bg-[#F0F2F5] text-[#64748B] border border-[#CBD5E1]' :
                      'bg-[#F0F2F5] text-[#94A3B8] border border-[#E2E8F0]'
                    )}>
                      {isCompleted ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                    </div>
                    <span className={cn(
                      'text-sm font-medium',
                      isActive ? 'text-[#977653]' :
                      isCompleted ? 'text-[#10B981]' :
                      isVisited ? 'text-[#64748B]' : 'text-[#94A3B8]'
                    )}>
                      {step.label}
                    </span>
                  </button>
                  {index < steps.length - 1 && (
                    <div className={cn(
                      'flex-1 h-0.5 mx-2 transition-colors',
                      isCompleted ? 'bg-[#10B981]' : 'bg-[#E2E8F0]'
                    )} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <AnimatePresence mode="wait">
            {currentStep === 0 && (
              <motion.div
                key="step0"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="space-y-6"
              >
                {/* Student Selection */}
                <div>
                  <label className="block text-sm font-medium text-[#1E293B] mb-1.5">
                    选择学生 <span className="text-[#EF4444]">*</span>
                  </label>
                  <select
                    value={formData.student_id}
                    onChange={(e) => {
                      const student = students.find(s => String(s.id) === String(e.target.value));
                      updateForm({
                        student_id: e.target.value,
                        student_name: student?.name || '',
                      });
                    }}
                    className="h-10 w-full px-3 rounded-md border border-[#CBD5E1] text-sm text-[#1E293B] bg-white focus:outline-none focus:border-[#3B82F6] focus:shadow-[0_0_0_3px_rgba(59,130,246,0.15)] transition-all cursor-pointer"
                  >
                    <option value="">请选择学生</option>
                    {students.length === 0 ? (
                      <option value="">暂无可选学生</option>
                    ) : (
                      students.map(s => (
                        <option key={s.id} value={String(s.id)}>
                          {s.name}{s.class_name ? ` (${s.class_name})` : ''}
                        </option>
                      ))
                    )}
                  </select>
                  {selectedStudent && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-3 p-4 bg-[#F7F6F4] rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-[#EBE3DA] flex items-center justify-center">
                          <User className="w-5 h-5 text-[#977653]" />
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-[#1E293B]">{selectedStudent.name}</div>
                          <div className="text-xs text-[#64748B]">
                            {selectedStudent.class_name || '未分班'}
                            {selectedStudent.gender ? ` · ${selectedStudent.gender}` : ''}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </div>

                {/* Title */}
                <div>
                  <label className="block text-sm font-medium text-[#1E293B] mb-1.5">
                    计划标题 <span className="text-[#EF4444]">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => updateForm({ title: e.target.value })}
                    placeholder="请输入IEP计划标题"
                    className="h-10 w-full px-3 rounded-md border border-[#CBD5E1] text-sm text-[#1E293B] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#3B82F6] focus:shadow-[0_0_0_3px_rgba(59,130,246,0.15)] transition-all"
                  />
                </div>

                {/* Date Range */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-[#1E293B] mb-1.5">
                      开始日期 <span className="text-[#EF4444]">*</span>
                    </label>
                    <input
                      type="date"
                      value={formData.start_date}
                      onChange={(e) => updateForm({ start_date: e.target.value })}
                      className="h-10 w-full px-3 rounded-md border border-[#CBD5E1] text-sm text-[#1E293B] focus:outline-none focus:border-[#3B82F6] focus:shadow-[0_0_0_3px_rgba(59,130,246,0.15)] transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#1E293B] mb-1.5">
                      结束日期 <span className="text-[#EF4444]">*</span>
                    </label>
                    <input
                      type="date"
                      value={formData.end_date}
                      onChange={(e) => updateForm({ end_date: e.target.value })}
                      className="h-10 w-full px-3 rounded-md border border-[#CBD5E1] text-sm text-[#1E293B] focus:outline-none focus:border-[#3B82F6] focus:shadow-[0_0_0_3px_rgba(59,130,246,0.15)] transition-all"
                    />
                  </div>
                </div>

                {/* Academic Year & Semester */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-[#1E293B] mb-1.5">学年</label>
                    <select
                      value={formData.academic_year}
                      onChange={(e) => updateForm({ academic_year: e.target.value })}
                      className="h-10 w-full px-3 rounded-md border border-[#CBD5E1] text-sm text-[#1E293B] bg-white focus:outline-none focus:border-[#3B82F6] cursor-pointer"
                    >
                      <option value="2024-2025">2024-2025</option>
                      <option value="2023-2024">2023-2024</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#1E293B] mb-1.5">学期</label>
                    <select
                      value={formData.semester}
                      onChange={(e) => updateForm({ semester: e.target.value })}
                      className="h-10 w-full px-3 rounded-md border border-[#CBD5E1] text-sm text-[#1E293B] bg-white focus:outline-none focus:border-[#3B82F6] cursor-pointer"
                    >
                      <option value="第一学期">第一学期</option>
                      <option value="第二学期">第二学期</option>
                    </select>
                  </div>
                </div>

                {/* Primary Teacher */}
                <div>
                  <label className="block text-sm font-medium text-[#1E293B] mb-1.5">主要制定人</label>
                  <select
                    value={formData.primary_teacher}
                    onChange={(e) => updateForm({ primary_teacher: e.target.value })}
                    disabled={isParticipate}
                    className={cn(
                      'h-10 w-full px-3 rounded-md border border-[#CBD5E1] text-sm text-[#1E293B] bg-white focus:outline-none focus:border-[#3B82F6] cursor-pointer',
                      isParticipate && 'bg-[#F7F6F4] cursor-not-allowed opacity-70'
                    )}
                  >
                    {teacherNames.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                  {isParticipate && (
                    <p className="text-xs text-[#94A3B8] mt-1">科任教师默认将自己设为制定人</p>
                  )}
                </div>

                {/* Team Members */}
                {!isParticipate && (
                  <div>
                    <label className="block text-sm font-medium text-[#1E293B] mb-1.5">团队成员</label>
                    <div className="flex flex-wrap gap-2">
                      {teacherNames.map((t) => (
                        <button
                          key={t}
                          onClick={() => {
                            const members = formData.team_members.includes(t)
                              ? formData.team_members.filter(m => m !== t)
                              : [...formData.team_members, t];
                            updateForm({ team_members: members });
                          }}
                          className={cn(
                            'px-3 py-1.5 rounded-full text-sm border transition-all cursor-pointer',
                            formData.team_members.includes(t)
                              ? 'border-[#977653] bg-[#F5F0EB] text-[#7A5F42]'
                              : 'border-[#E2E8F0] bg-white text-[#64748B] hover:border-[#CBD5E1]'
                          )}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {currentStep === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="space-y-4"
              >
                <p className="text-sm text-[#64748B] mb-4">请描述学生在各领域现有的能力水平、优势和困难。</p>
                {Object.entries(areaLabels).map(([key, label]) => (
                  <motion.div
                    key={key}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Object.keys(areaLabels).indexOf(key) * 0.08 }}
                    className="border border-[#E2E8F0] rounded-lg p-4"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-semibold text-[#1E293B]">{label}</h4>
                      <button className="text-xs text-[#977653] hover:text-[#7A5F42] cursor-pointer">
                        参考最近评估
                      </button>
                    </div>
                    <textarea
                      value={formData.current_levels[key] || ''}
                      onChange={(e) => updateForm({
                        current_levels: { ...formData.current_levels, [key]: e.target.value },
                      })}
                      placeholder={`请描述学生在${label}领域的现有能力水平、优势和困难...`}
                      rows={3}
                      className="w-full px-3 py-2 rounded-md border border-[#CBD5E1] text-sm text-[#1E293B] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#3B82F6] focus:shadow-[0_0_0_3px_rgba(59,130,246,0.15)] transition-all resize-y"
                    />
                  </motion.div>
                ))}
              </motion.div>
            )}

            {currentStep === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="space-y-4"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold text-[#1E293B]">
                    目标列表 ({formData.goals.length} 个)
                  </h3>
                  <button
                    onClick={() => { setEditingGoalIndex(null); setShowGoalModal(true); }}
                    className="flex items-center gap-1.5 h-8 px-3 rounded-md bg-[#977653] text-white text-sm font-medium hover:bg-[#7A5F42] transition-colors cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    添加目标
                  </button>
                </div>

                {formData.goals.length === 0 ? (
                  <div className="text-center py-12 border-2 border-dashed border-[#E2E8F0] rounded-lg">
                    <Target className="w-10 h-10 text-[#CBD5E1] mx-auto mb-3" />
                    <p className="text-sm text-[#64748B]">暂无目标，点击上方按钮添加</p>
                  </div>
                ) : (
                  formData.goals.map((goal, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="border border-[#E2E8F0] rounded-lg p-5 bg-white"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs text-[#94A3B8]">目标 {index + 1}</span>
                          <span className="text-sm font-semibold text-[#1E293B]">{goal.title}</span>
                          {goal.area && (
                            <span
                              className="px-2 py-0.5 rounded-full text-xs font-medium text-white"
                              style={{ backgroundColor: GOAL_AREA_COLORS[goal.area as GoalArea] || '#64748B' }}
                            >
                              {goal.area}
                            </span>
                          )}
                          <span className={cn(
                            'px-2 py-0.5 rounded-full text-xs font-medium',
                            goal.goal_type === '长期目标'
                              ? 'bg-[#F5F0EB] text-[#7A5F42]'
                              : 'bg-[#EFF6FF] text-[#2563EB]'
                          )}>
                            {goal.goal_type}
                          </span>
                        </div>
                        <button
                          onClick={() => removeGoal(index)}
                          className="p-1.5 rounded-md text-[#94A3B8] hover:text-[#EF4444] hover:bg-[#FEF2F2] transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      {goal.description && (
                        <p className="text-sm text-[#64748B] mb-2">{goal.description}</p>
                      )}
                      {goal.criteria && (
                        <p className="text-xs text-[#94A3B8] mb-2">成功标准: {goal.criteria}</p>
                      )}
                      {goal.teaching_strategies && (
                        <p className="text-xs text-[#94A3B8] mb-2">教学策略: {goal.teaching_strategies}</p>
                      )}
                      {/* Responsible Teacher Display */}
                      <div className="flex items-center gap-1.5">
                        <Users className="w-3 h-3 text-[#94A3B8]" />
                        <span className="text-xs text-[#64748B]">责任人:</span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#F5F0EB] text-[#7A5F42] text-xs font-medium">
                          <User className="w-3 h-3" />
                          {(goal as any).responsible_teacher_name || (goal as any).responsible_teacher || currentUserName}
                        </span>
                      </div>
                    </motion.div>
                  ))
                )}

                {/* Goal Modal */}
                <AnimatePresence>
                  {showGoalModal && (
                    <GoalModal
                      onClose={() => { setShowGoalModal(false); setEditingGoalIndex(null); }}
                      onAdd={addGoal}
                      isParticipate={isParticipate}
                      currentUserName={currentUserName}
                      currentUserId={currentUserId}
                      teachers={teachers}
                    />
                  )}
                </AnimatePresence>
              </motion.div>
            )}

            {currentStep === 3 && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="space-y-6"
              >
                {/* Services Table */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-base font-semibold text-[#1E293B]">相关服务配置</h3>
                    <button
                      onClick={addService}
                      className="flex items-center gap-1.5 h-8 px-3 rounded-md bg-[#977653] text-white text-sm font-medium hover:bg-[#7A5F42] transition-colors cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      添加服务
                    </button>
                  </div>
                  {formData.services.length > 0 ? (
                    <div className="border border-[#E2E8F0] rounded-lg overflow-hidden">
                      <table className="w-full">
                        <thead className="bg-[#F7F6F4]">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-[#94A3B8]">服务类型</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-[#94A3B8]">频次</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-[#94A3B8]">时长</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-[#94A3B8]">负责教师</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-[#94A3B8]">地点</th>
                            <th className="px-3 py-2 w-[60px]"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {formData.services.map((service, index) => (
                            <motion.tr
                              key={index}
                              initial={{ opacity: 0, y: 5 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: index * 0.06 }}
                              className="border-t border-[#F1F5F9]"
                            >
                              <td className="px-3 py-2">
                                <select
                                  value={service.service_type || '认知训练'}
                                  onChange={(e) => updateService(index, 'service_type', e.target.value)}
                                  className="h-8 px-2 rounded border border-[#CBD5E1] text-sm bg-white focus:outline-none focus:border-[#3B82F6] cursor-pointer"
                                >
                                  {SERVICE_TYPES.map(t => (
                                    <option key={t} value={t}>{t}</option>
                                  ))}
                                </select>
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  type="text"
                                  value={service.frequency || ''}
                                  onChange={(e) => updateService(index, 'frequency', e.target.value)}
                                  placeholder="每周几次"
                                  className="h-8 w-24 px-2 rounded border border-[#CBD5E1] text-sm focus:outline-none focus:border-[#3B82F6]"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  type="text"
                                  value={service.duration || ''}
                                  onChange={(e) => updateService(index, 'duration', e.target.value)}
                                  placeholder="多少分钟"
                                  className="h-8 w-24 px-2 rounded border border-[#CBD5E1] text-sm focus:outline-none focus:border-[#3B82F6]"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  type="text"
                                  value={service.teacher || ''}
                                  onChange={(e) => updateService(index, 'teacher', e.target.value)}
                                  placeholder="教师姓名"
                                  className="h-8 w-24 px-2 rounded border border-[#CBD5E1] text-sm focus:outline-none focus:border-[#3B82F6]"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  type="text"
                                  value={service.location || ''}
                                  onChange={(e) => updateService(index, 'location', e.target.value)}
                                  placeholder="服务地点"
                                  className="h-8 w-24 px-2 rounded border border-[#CBD5E1] text-sm focus:outline-none focus:border-[#3B82F6]"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <button
                                  onClick={() => removeService(index)}
                                  className="p-1 rounded text-[#94A3B8] hover:text-[#EF4444] hover:bg-[#FEF2F2] transition-colors cursor-pointer"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            </motion.tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-center py-8 border-2 border-dashed border-[#E2E8F0] rounded-lg">
                      <p className="text-sm text-[#64748B]">暂无服务配置，点击添加</p>
                    </div>
                  )}
                </div>

                {/* Teaching Adaptations */}
                <div>
                  <label className="block text-sm font-medium text-[#1E293B] mb-1.5">教学调整与辅助</label>
                  <textarea
                    value={formData.teaching_adaptations}
                    onChange={(e) => updateForm({ teaching_adaptations: e.target.value })}
                    placeholder="描述所需的辅助器具和环境调整..."
                    rows={3}
                    className="w-full px-3 py-2 rounded-md border border-[#CBD5E1] text-sm text-[#1E293B] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#3B82F6] focus:shadow-[0_0_0_3px_rgba(59,130,246,0.15)] transition-all resize-y"
                  />
                </div>

                {/* Assistive Tech */}
                <div>
                  <label className="block text-sm font-medium text-[#1E293B] mb-1.5">辅助技术</label>
                  <textarea
                    value={formData.assistive_tech}
                    onChange={(e) => updateForm({ assistive_tech: e.target.value })}
                    placeholder="描述所需的辅助技术设备和软件..."
                    rows={2}
                    className="w-full px-3 py-2 rounded-md border border-[#CBD5E1] text-sm text-[#1E293B] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#3B82F6] focus:shadow-[0_0_0_3px_rgba(59,130,246,0.15)] transition-all resize-y"
                  />
                </div>

                {/* Transition Plan */}
                <div>
                  <label className="block text-sm font-medium text-[#1E293B] mb-1.5">转衔计划</label>
                  <textarea
                    value={formData.transition_plan}
                    onChange={(e) => updateForm({ transition_plan: e.target.value })}
                    placeholder="描述阶段性过渡和衔接计划..."
                    rows={2}
                    className="w-full px-3 py-2 rounded-md border border-[#CBD5E1] text-sm text-[#1E293B] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#3B82F6] focus:shadow-[0_0_0_3px_rgba(59,130,246,0.15)] transition-all resize-y"
                  />
                </div>
              </motion.div>
            )}

            {currentStep === 4 && (
              <motion.div
                key="step4"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="space-y-6"
              >
                {/* Summary Card */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-[#F7F6F4] rounded-lg p-5"
                >
                  <h3 className="text-base font-semibold text-[#1E293B] mb-4">IEP 概览摘要</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-xs text-[#64748B]">学生</span>
                      <p className="text-sm font-medium text-[#1E293B]">{formData.student_name || '未选择'}</p>
                    </div>
                    <div>
                      <span className="text-xs text-[#64748B]">IEP 期间</span>
                      <p className="text-sm font-medium text-[#1E293B]">
                        {formData.start_date || '—'} ~ {formData.end_date || '—'}
                      </p>
                    </div>
                    <div>
                      <span className="text-xs text-[#64748B]">目标总数</span>
                      <p className="text-sm font-medium text-[#1E293B]">{formData.goals.length} 个目标</p>
                    </div>
                    <div>
                      <span className="text-xs text-[#64748B]">服务配置</span>
                      <p className="text-sm font-medium text-[#1E293B]">{formData.services.length} 项服务</p>
                    </div>
                  </div>
                </motion.div>

                {/* Goals Summary */}
                {formData.goals.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                  >
                    <h3 className="text-sm font-semibold text-[#1E293B] mb-3">目标摘要</h3>
                    <div className="border border-[#E2E8F0] rounded-lg overflow-hidden">
                      <table className="w-full">
                        <thead className="bg-[#F7F6F4]">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-[#94A3B8]">#</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-[#94A3B8]">目标名称</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-[#94A3B8]">类型</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-[#94A3B8]">领域</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-[#94A3B8]">责任人</th>
                          </tr>
                        </thead>
                        <tbody>
                          {formData.goals.map((goal, i) => (
                            <tr key={i} className="border-t border-[#F1F5F9]">
                              <td className="px-3 py-2 text-sm text-[#64748B]">{i + 1}</td>
                              <td className="px-3 py-2 text-sm text-[#1E293B]">{goal.title}</td>
                              <td className="px-3 py-2">
                                <span className={cn(
                                  'px-2 py-0.5 rounded-full text-xs',
                                  goal.goal_type === '长期目标' ? 'bg-[#F5F0EB] text-[#7A5F42]' : 'bg-[#EFF6FF] text-[#2563EB]'
                                )}>
                                  {goal.goal_type}
                                </span>
                              </td>
                              <td className="px-3 py-2">
                                {goal.area && (
                                  <span
                                    className="px-2 py-0.5 rounded-full text-xs text-white"
                                    style={{ backgroundColor: GOAL_AREA_COLORS[goal.area as GoalArea] || '#64748B' }}
                                  >
                                    {goal.area}
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-sm text-[#64748B]">
                                {(goal as any).responsible_teacher_name || (goal as any).responsible_teacher || currentUserName}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </motion.div>
                )}

                {/* Checklist */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="border border-[#E2E8F0] rounded-lg p-5"
                >
                  <h3 className="text-sm font-semibold text-[#1E293B] mb-3">提交前确认清单</h3>
                  <div className="space-y-2">
                    {[
                      '学生基本信息已确认',
                      '现况描述已填写',
                      '至少设置了 1 个长期目标和 2 个短期目标',
                      '成功标准已明确',
                      '教学策略已制定',
                      '服务配置已确认',
                    ].map((item, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          const newChecks = [...confirmChecks];
                          newChecks[i] = !newChecks[i];
                          setConfirmChecks(newChecks);
                        }}
                        className="flex items-center gap-3 w-full p-2 rounded-md hover:bg-[#F7F6F4] transition-colors text-left cursor-pointer"
                      >
                        <div className={cn(
                          'w-5 h-5 rounded border-2 flex items-center justify-center transition-colors flex-shrink-0',
                          confirmChecks[i]
                            ? 'bg-[#10B981] border-[#10B981]'
                            : 'border-[#CBD5E1]'
                        )}>
                          {confirmChecks[i] && <Check className="w-3 h-3 text-white" />}
                        </div>
                        <span className={cn(
                          'text-sm',
                          confirmChecks[i] ? 'text-[#1E293B]' : 'text-[#64748B]'
                        )}>{item}</span>
                      </button>
                    ))}
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[#E2E8F0] flex-shrink-0">
          <button
            onClick={handlePrev}
            disabled={currentStep === 0}
            className={cn(
              'flex items-center gap-1.5 h-10 px-4 rounded-md border border-[#CBD5E1] text-sm font-medium transition-colors cursor-pointer',
              currentStep === 0 ? 'text-[#94A3B8] cursor-not-allowed' : 'text-[#1E293B] hover:bg-[#F7F6F4]'
            )}
          >
            <ChevronLeft className="w-4 h-4" />
            上一步
          </button>

          {currentStep < 4 ? (
            <button
              onClick={handleNext}
              className="flex items-center gap-1.5 h-10 px-4 rounded-md bg-[#977653] text-white text-sm font-medium hover:bg-[#7A5F42] transition-colors cursor-pointer"
            >
              下一步
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <button
                onClick={() => onSave({ ...formData, status: '草稿' })}
                className="h-10 px-4 rounded-md border border-[#CBD5E1] text-sm font-medium text-[#64748B] hover:bg-[#F7F6F4] transition-colors cursor-pointer"
              >
                保存为草稿
              </button>
              <motion.button
                animate={allConfirmed ? { scale: [1, 1.02, 1] } : {}}
                transition={{ duration: 0.5, repeat: allConfirmed ? Infinity : 0, repeatDelay: 2 }}
                onClick={() => onSave({ ...formData, status: '审核中' })}
                disabled={!allConfirmed}
                className={cn(
                  'flex items-center gap-1.5 h-10 px-4 rounded-md text-sm font-medium transition-colors cursor-pointer',
                  allConfirmed
                    ? 'bg-[#977653] text-white hover:bg-[#7A5F42]'
                    : 'bg-[#E2E8F0] text-[#94A3B8] cursor-not-allowed'
                )}
              >
                <Send className="w-4 h-4" />
                提交审核
              </motion.button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

/* Goal Modal */
interface GoalModalProps {
  onClose: () => void;
  onAdd: (goal: Partial<IEPService> & { area: GoalArea; title: string; goal_type: GoalType; description: string; criteria: string; teaching_strategies: string; evaluation_method: EvaluationMethod; evaluation_frequency: EvaluationFrequency; priority: Priority; responsible_teacher: string; responsible_teacher_id: string; responsible_teacher_name: string }) => void;
  isParticipate: boolean;
  currentUserName: string;
  currentUserId: string;
  /** 真实教师列表，用于责任人下拉与姓名→ID 映射 */
  teachers: TeacherOption[];
}

function GoalModal({ onClose, onAdd, isParticipate, currentUserName, currentUserId, teachers }: GoalModalProps) {
  const [area, setArea] = useState<GoalArea>('认知');
  const [goalType, setGoalType] = useState<GoalType>('短期目标');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [criteria, setCriteria] = useState('');
  const [teachingStrategies, setTeachingStrategies] = useState('');
  const [evalMethod, setEvalMethod] = useState<EvaluationMethod>('观察记录');
  const [evalFreq, setEvalFreq] = useState<EvaluationFrequency>('每周2次');
  const [priority, setPriority] = useState<Priority>('中');
  const [responsibleTeacher, setResponsibleTeacher] = useState(currentUserName);
  const [errors, setErrors] = useState<string[]>([]);

  /** 责任人候选：真实教师列表 + 当前用户兜底 */
  const teacherNames = useMemo(() => {
    const names = teachers.map((t) => (t.name || '').trim()).filter(Boolean);
    if (currentUserName && !names.includes(currentUserName)) {
      names.unshift(currentUserName);
    }
    return names;
  }, [teachers, currentUserName]);

  /** 姓名 → 用户ID（真实映射，缺失时回退当前用户ID） */
  const teacherIdByName = useMemo(() => {
    const map: Record<string, string> = {};
    teachers.forEach((t) => {
      if (t.name) map[t.name] = String(t.id);
    });
    return map;
  }, [teachers]);

  const validate = () => {
    const errs: string[] = [];
    if (!title.trim()) errs.push('请输入目标名称');
    if (!description.trim()) errs.push('请输入目标描述');
    if (!criteria.trim()) errs.push('请输入成功标准');
    setErrors(errs);
    return errs.length === 0;
  };

  const handleAdd = () => {
    if (!validate()) return;
    const teacherId = teacherIdByName[responsibleTeacher] || currentUserId;
    onAdd({
      area,
      goal_type: goalType,
      title,
      description,
      criteria,
      teaching_strategies: teachingStrategies,
      evaluation_method: evalMethod,
      evaluation_frequency: evalFreq,
      priority,
      responsible_teacher: responsibleTeacher,
      responsible_teacher_id: teacherId,
      responsible_teacher_name: responsibleTeacher,
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-center justify-center"
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.2 }}
        className="relative w-full max-w-[560px] max-h-[90vh] overflow-y-auto bg-white rounded-xl shadow-xl flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-label="添加目标"
        data-state="open"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E2E8F0]">
          <h3 className="text-lg font-semibold text-[#1E293B]">添加目标</h3>
          <button onClick={onClose} className="p-1.5 rounded-md text-[#64748B] hover:bg-[#F7F6F4] cursor-pointer">
            <XCircle className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          {errors.length > 0 && (
            <div className="p-3 bg-[#FEF2F2] border border-[#FECACA] rounded-md">
              {errors.map((e, i) => (
                <div key={i} className="flex items-center gap-1.5 text-sm text-[#DC2626]">
                  <AlertCircle className="w-4 h-4" />
                  {e}
                </div>
              ))}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-[#1E293B] mb-1.5">
              目标名称 <span className="text-[#EF4444]">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="请输入目标名称"
              className="h-10 w-full px-3 rounded-md border border-[#CBD5E1] text-sm focus:outline-none focus:border-[#3B82F6] focus:shadow-[0_0_0_3px_rgba(59,130,246,0.15)]"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[#1E293B] mb-1.5">
                目标类型 <span className="text-[#EF4444]">*</span>
              </label>
              <div className="flex gap-2">
                {(['长期目标', '短期目标'] as GoalType[]).map(t => (
                  <button
                    key={t}
                    onClick={() => setGoalType(t)}
                    className={cn(
                      'flex-1 h-10 rounded-md text-sm font-medium border transition-all cursor-pointer',
                      goalType === t
                        ? 'border-[#977653] bg-[#F5F0EB] text-[#7A5F42]'
                        : 'border-[#E2E8F0] text-[#64748B] hover:border-[#CBD5E1]'
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#1E293B] mb-1.5">
                所属领域 <span className="text-[#EF4444]">*</span>
              </label>
              <select
                value={area}
                onChange={(e) => setArea(e.target.value as GoalArea)}
                className="h-10 w-full px-3 rounded-md border border-[#CBD5E1] text-sm bg-white focus:outline-none focus:border-[#3B82F6] cursor-pointer"
              >
                {GOAL_AREAS.map(a => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Responsible Teacher Selection */}
          <div>
            <label className="block text-sm font-medium text-[#1E293B] mb-1.5">
              责任人 <span className="text-[#EF4444]">*</span>
            </label>
            <select
              value={responsibleTeacher}
              onChange={(e) => setResponsibleTeacher(e.target.value)}
              disabled={isParticipate}
              className={cn(
                'h-10 w-full px-3 rounded-md border border-[#CBD5E1] text-sm bg-white focus:outline-none focus:border-[#3B82F6] cursor-pointer',
                isParticipate && 'bg-[#F7F6F4] cursor-not-allowed opacity-70'
              )}
            >
              {teacherNames.map((t) => (
                <option key={t} value={t}>{t}{t === currentUserName ? ' (我)' : ''}</option>
              ))}
            </select>
            {isParticipate && (
              <p className="text-xs text-[#94A3B8] mt-1">科任教师只能将自己设为责任人</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-[#1E293B] mb-1.5">
              目标描述 <span className="text-[#EF4444]">*</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="具体、可测量、可达成、相关、有时限地描述目标..."
              rows={3}
              className="w-full px-3 py-2 rounded-md border border-[#CBD5E1] text-sm focus:outline-none focus:border-[#3B82F6] focus:shadow-[0_0_0_3px_rgba(59,130,246,0.15)] resize-y"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[#1E293B] mb-1.5">
              成功标准 <span className="text-[#EF4444]">*</span>
            </label>
            <textarea
              value={criteria}
              onChange={(e) => setCriteria(e.target.value)}
              placeholder="明确描述达到目标的具体衡量标准..."
              rows={2}
              className="w-full px-3 py-2 rounded-md border border-[#CBD5E1] text-sm focus:outline-none focus:border-[#3B82F6] focus:shadow-[0_0_0_3px_rgba(59,130,246,0.15)] resize-y"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[#1E293B] mb-1.5">教学策略</label>
            <textarea
              value={teachingStrategies}
              onChange={(e) => setTeachingStrategies(e.target.value)}
              placeholder="描述将采用的教学方法和策略..."
              rows={2}
              className="w-full px-3 py-2 rounded-md border border-[#CBD5E1] text-sm focus:outline-none focus:border-[#3B82F6] focus:shadow-[0_0_0_3px_rgba(59,130,246,0.15)] resize-y"
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-[#1E293B] mb-1.5">评价方式</label>
              <select
                value={evalMethod}
                onChange={(e) => setEvalMethod(e.target.value as EvaluationMethod)}
                className="h-10 w-full px-3 rounded-md border border-[#CBD5E1] text-sm bg-white focus:outline-none focus:border-[#3B82F6] cursor-pointer"
              >
                {EVALUATION_METHODS.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#1E293B] mb-1.5">评价频次</label>
              <select
                value={evalFreq}
                onChange={(e) => setEvalFreq(e.target.value as EvaluationFrequency)}
                className="h-10 w-full px-3 rounded-md border border-[#CBD5E1] text-sm bg-white focus:outline-none focus:border-[#3B82F6] cursor-pointer"
              >
                {EVALUATION_FREQUENCIES.map(f => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#1E293B] mb-1.5">优先级</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
                className="h-10 w-full px-3 rounded-md border border-[#CBD5E1] text-sm bg-white focus:outline-none focus:border-[#3B82F6] cursor-pointer"
              >
                <option value="高">高</option>
                <option value="中">中</option>
                <option value="低">低</option>
              </select>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#E2E8F0]">
          <button
            onClick={onClose}
            className="h-10 px-4 rounded-md border border-[#CBD5E1] text-sm font-medium text-[#64748B] hover:bg-[#F7F6F4] transition-colors cursor-pointer"
          >
            取消
          </button>
          <button
            onClick={handleAdd}
            className="h-10 px-4 rounded-md bg-[#977653] text-white text-sm font-medium hover:bg-[#7A5F42] transition-colors cursor-pointer"
          >
            添加
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
