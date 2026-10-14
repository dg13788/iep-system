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
  '认知': 'rgb(var(--info))',
  '沟通': 'rgb(var(--success))',
  '社交': 'rgb(var(--violet))',
  '生活自理': 'rgb(var(--warning))',
  '运动': 'rgb(var(--danger))',
  '情绪行为': 'rgb(var(--danger))',
  '学业': 'rgb(var(--surface-inverse-2))',
  // 培智课标课程（与既有色板同系但可区分，避免全部 fallback 成灰）
  '生活语文': 'rgb(var(--violet))',
  '生活数学': 'rgb(var(--info-strong))',
  '生活适应': 'rgb(var(--success-strong))',
  '劳动技能': 'rgb(var(--warning-strong))',
  '唱游与律动': 'rgb(var(--danger))',
  '绘画与手工': 'rgb(var(--info-strong))',
  '运动与保健': 'rgb(var(--danger-strong))',
  '信息技术': 'rgb(var(--info-strong))',
  '康复训练': 'rgb(var(--info-strong))',
  '艺术休闲': 'rgb(var(--warning-strong))',
  '职业转衔': 'rgb(var(--brand-strong))',
};

export const STATUS_COLORS: Record<IEPStatus, { bg: string; text: string; lightBg: string }> = {
  '草稿': { bg: 'bg-info', text: 'text-info-strong', lightBg: 'bg-info-soft' },
  '审核中': { bg: 'bg-warning', text: 'text-warning-strong', lightBg: 'bg-warning-soft' },
  '已通过': { bg: 'bg-success', text: 'text-success-strong', lightBg: 'bg-success-soft' },
  '已签名': { bg: 'bg-surface-inverse-2', text: 'text-ink-on-dark-2', lightBg: 'bg-surface-2' },
  '执行中': { bg: 'bg-violet', text: 'text-violet', lightBg: 'bg-violet-soft' },
  '已完成': { bg: 'bg-brand-strong', text: 'text-brand-ink', lightBg: 'bg-brand-soft' },
  '已驳回': { bg: 'bg-danger', text: 'text-danger-strong', lightBg: 'bg-danger-soft' },
};

export const GOAL_STATUS_COLORS: Record<GoalStatus, { bg: string; text: string }> = {
  '未开始': { bg: 'bg-surface-2', text: 'text-ink-2' },
  '进行中': { bg: 'bg-violet-soft', text: 'text-violet' },
  '已完成': { bg: 'bg-success-soft', text: 'text-success-strong' },
  '暂停': { bg: 'bg-warning-soft', text: 'text-warning-strong' },
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
