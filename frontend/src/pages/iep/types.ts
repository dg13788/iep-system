export type IEPStatus = '草稿' | '审核中' | '已通过' | '已签名' | '执行中' | '已完成' | '已驳回';

/**
 * 目标领域：与 dict_common.category='goal_area' 的 name 取值保持一致。
 *
 * 2026-10-12 修复：原常量只有 7 个通用领域，而演示数据中约 43% 的目标
 * 用的是培智课标课程（生活数学/生活语文/生活适应/劳动技能/职业转衔…），
 * 下拉里根本选不到，颜色也全部 fallback 成灰色。字典建了却没人消费，
 * 等于口径分裂——教师新建目标时无法复现系统里已有的数据。
 */
export type GoalArea =
  // 通用领域（dict_common id 9~15）
  | '认知' | '沟通' | '社交' | '生活自理' | '运动' | '情绪行为' | '学业'
  // 培智学校义务教育课程标准课程（dict_common id 35~44）
  | '生活语文' | '生活数学' | '生活适应' | '劳动技能' | '唱游与律动'
  | '绘画与手工' | '运动与保健' | '信息技术' | '康复训练' | '艺术休闲'
  // 转衔
  | '职业转衔';

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
  /** v4 特教内核（6.2）：教育安置形式与 IEP 会议要件（后端 p.* 直接透传） */
  placement_type?: string;
  placement_notes?: string;
  regular_class_hours?: number | null;
  resource_room_hours?: number | null;
  meeting_date?: string;
  meeting_place?: string;
  next_review_date?: string;
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
  // 通用领域
  '认知': '#3B82F6',
  '沟通': '#10B981',
  '社交': '#8B5CF6',
  '生活自理': '#F59E0B',
  '运动': '#EF4444',
  '情绪行为': '#EC4899',
  '学业': '#405680',
  // 培智课标课程（与既有色板同系但可区分，避免全部 fallback 成灰）
  '生活语文': '#7C3AED',
  '生活数学': '#2563EB',
  '生活适应': '#059669',
  '劳动技能': '#D97706',
  '唱游与律动': '#DB2777',
  '绘画与手工': '#0891B2',
  '运动与保健': '#DC2626',
  '信息技术': '#0D9488',
  '康复训练': '#4F46E5',
  '艺术休闲': '#B45309',
  '职业转衔': '#7A5F42',
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

export const GOAL_AREAS: GoalArea[] = [
  // 通用领域
  '认知', '沟通', '社交', '生活自理', '运动', '情绪行为', '学业',
  // 培智学校义务教育课程标准课程
  '生活语文', '生活数学', '生活适应', '劳动技能', '唱游与律动',
  '绘画与手工', '运动与保健', '信息技术', '康复训练', '艺术休闲',
  // 转衔
  '职业转衔',
];

export const SERVICE_TYPES: ServiceType[] = ['认知训练', '语言治疗', '运动康复', '社交训练', '生活自理训练', '感觉统合', '艺术治疗', '其他'];

export const EVALUATION_METHODS: EvaluationMethod[] = ['观察记录', '标准化测试', '作品分析', '日常表现'];

export const EVALUATION_FREQUENCIES: EvaluationFrequency[] = ['每天', '每周2次', '每周1次', '每两周', '每月'];
