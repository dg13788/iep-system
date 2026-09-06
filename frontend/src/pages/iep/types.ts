export type IEPStatus = '草稿' | '审核中' | '已通过' | '已签名' | '执行中' | '已完成' | '已驳回';

export type GoalArea = '认知' | '沟通' | '社交' | '生活自理' | '运动' | '情绪行为' | '学业';

export type GoalType = '长期目标' | '短期目标';

export type GoalStatus = '未开始' | '进行中' | '已完成' | '暂停';

export type EvaluationMethod = '观察记录' | '标准化测试' | '作品分析' | '日常表现';

export type EvaluationFrequency = '每天' | '每周2次' | '每周1次' | '每两周' | '每月';

export type ServiceType = '认知训练' | '语言治疗' | '运动康复' | '社交训练' | '生活自理训练' | '感觉统合' | '艺术治疗' | '其他';

export type Priority = '高' | '中' | '低';

export interface IEPGoal {
  id: string;
  iep_plan_id: string;
  area: GoalArea;
  title: string;
  description: string;
  target_behavior: string;
  criteria: string;
  evaluation_method: EvaluationMethod;
  evaluation_frequency: EvaluationFrequency;
  baseline: string;
  target_score: number;
  current_score: number;
  start_date: string;
  target_date: string;
  priority: Priority;
  teaching_strategies: string;
  resources: string;
  responsible_teacher: string;
  responsible_teacher_id?: string;
  responsible_teacher_name?: string;
  progress_notes?: string;
  goal_type: GoalType;
  progress_percent: number;
  status: GoalStatus;
  created_at: string;
  updated_at: string;
}

export interface IEPService {
  id: string;
  iep_plan_id: string;
  service_type: ServiceType;
  frequency: string;
  duration: string;
  teacher: string;
  location: string;
}

export interface ProgressRecord {
  id: string;
  goal_id: string;
  record_date: string;
  score: number;
  max_score: number;
  prompt_level: string;
  notes: string;
  teacher: string;
  created_at: string;
}

export interface ApprovalLog {
  id: string;
  iep_plan_id: string;
  action: '提交审核' | '审批通过' | '审批驳回' | '退回修改' | '家长签名' | '开始执行' | '执行完成' | '提交草稿';
  from_status: IEPStatus | null;
  to_status: IEPStatus;
  operator: string;
  operator_role: string;
  comment: string;
  created_at: string;
}

export interface ParentSignature {
  id: string;
  iep_plan_id: string;
  parent_name: string;
  signature_data: string | null;
  signed_at: string | null;
  status: '待签名' | '已签名';
}

export interface IEPPlan {
  id: string;
  plan_code: string;
  title: string;
  student_id: string;
  student_name: string;
  student_avatar?: string;
  student_class: string;
  student_number: string;
  academic_year: string;
  semester: string;
  start_date: string;
  end_date: string;
  primary_teacher: string;
  team_members: string[];
  status: IEPStatus;
  /** 后端列表/详情接口不返回计划级进度，未获取成功时为 undefined（页面显示「—」） */
  progress_percent?: number;
  goals_count: number;
  signed: boolean;
  signature_status: '待签名' | '已签名' | '不需要';
  current_levels: Record<string, string>;
  teaching_adaptations: string;
  assistive_tech: string;
  transition_plan: string;
  created_at: string;
  updated_at: string;
}

export interface WizardFormData {
  student_id: string;
  student_name: string;
  title: string;
  academic_year: string;
  semester: string;
  start_date: string;
  end_date: string;
  primary_teacher: string;
  team_members: string[];
  meeting_date: string;
  current_levels: Record<string, string>;
  goals: Array<Partial<IEPGoal>>;
  services: Array<Partial<IEPService>>;
  teaching_adaptations: string;
  assistive_tech: string;
  transition_plan: string;
}

export const GOAL_AREA_COLORS: Record<GoalArea, string> = {
  '认知': '#3B82F6',
  '沟通': '#10B981',
  '社交': '#8B5CF6',
  '生活自理': '#F59E0B',
  '运动': '#EF4444',
  '情绪行为': '#EC4899',
  '学业': '#405680',
};

export const STATUS_COLORS: Record<IEPStatus, { bg: string; text: string; lightBg: string }> = {
  '草稿': { bg: 'bg-[#3B82F6]', text: 'text-[#2563EB]', lightBg: 'bg-[#EFF6FF]' },
  '审核中': { bg: 'bg-[#F59E0B]', text: 'text-[#D97706]', lightBg: 'bg-[#FFFBEB]' },
  '已通过': { bg: 'bg-[#10B981]', text: 'text-[#059669]', lightBg: 'bg-[#ECFDF5]' },
  '已签名': { bg: 'bg-[#405680]', text: 'text-[#405680]', lightBg: 'bg-[#F0F2F5]' },
  '执行中': { bg: 'bg-[#8B5CF6]', text: 'text-[#8B5CF6]', lightBg: 'bg-[#F5F3FF]' },
  '已完成': { bg: 'bg-[#7A5F42]', text: 'text-[#7A5F42]', lightBg: 'bg-[#F5F0EB]' },
  '已驳回': { bg: 'bg-[#EF4444]', text: 'text-[#DC2626]', lightBg: 'bg-[#FEF2F2]' },
};

export const GOAL_STATUS_COLORS: Record<GoalStatus, { bg: string; text: string }> = {
  '未开始': { bg: 'bg-[#F0F2F5]', text: 'text-[#64748B]' },
  '进行中': { bg: 'bg-[#F5F3FF]', text: 'text-[#8B5CF6]' },
  '已完成': { bg: 'bg-[#ECFDF5]', text: 'text-[#059669]' },
  '暂停': { bg: 'bg-[#FFFBEB]', text: 'text-[#D97706]' },
};

export const GOAL_AREAS: GoalArea[] = ['认知', '沟通', '社交', '生活自理', '运动', '情绪行为', '学业'];

export const SERVICE_TYPES: ServiceType[] = ['认知训练', '语言治疗', '运动康复', '社交训练', '生活自理训练', '感觉统合', '艺术治疗', '其他'];

export const EVALUATION_METHODS: EvaluationMethod[] = ['观察记录', '标准化测试', '作品分析', '日常表现'];

export const EVALUATION_FREQUENCIES: EvaluationFrequency[] = ['每天', '每周2次', '每周1次', '每两周', '每月'];
