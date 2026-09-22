/**
 * IEP 模块 service 层
 *
 * 契约来源：backend/api/iep.php + backend/sql/init.sql
 *
 * 端点一览（basePath 由 api.ts 统一拼成 /api）：
 *   GET  /iep/list            ?page&pageSize&student_id&status   data: { list, total, page, pageSize }
 *   GET  /iep/get             ?id                               data: 计划详情(含 goals/approval_logs/signatures)
 *   POST /iep/create          { student_id, title, academic_year?, semester?, start_date?, end_date? }
 *   POST /iep/update          { id, title?, semester?, academic_year?, start_date?, end_date?,
 *                               strengths?, needs?, priorities?, adaptations?, assistive_tech?,
 *                               transition_plan?, team_members?, status?, progress_summary? }
 *   POST /iep/delete          { id }
 *   POST /iep/submit          { id }
 *   POST /iep/approve         { id, decision: 'approve'|'reject', comment? }
 *   POST /iep/sign            { plan_id, signature_data, signature_type?, parent_id?, device_info? }
 *   POST /iep/save_goals      { plan_id, goals[] }
 *   POST /iep/progress        { goal_id, recorded_date?, score, max_score?, session_type?,
 *                               prompt_level?, is_generalized?, generalization_context?, notes? }
 *   GET  /iep/approval-logs   ?plan_id
 *   GET  /iep/goal_stats      ?student_id                        data: { total, by_area, by_status, avg_progress }
 *
 * 重要：后端数据库里 parent_signatures.signature_type 是
 *   ENUM('handwritten','digital','fingerprint')
 * 传 'parent' / 'electronic' / 'typed' 都会插入失败，本文件用联合类型在编译期约束。
 *
 * 适配策略：后端返回 snake_case + 英文枚举，页面使用的是 pages/iep/types.ts 的
 * 中文视图模型（string 型 id），所有转换集中在本文件，页面组件无需关心后端字段名。
 */

import { api } from '@/api';
import type {
  ApprovalLog,
  EvaluationFrequency,
  GoalArea,
  GoalStatus,
  IEPGoal,
  IEPPlan,
  IEPStatus,
  ParentSignature,
  Priority,
} from '@/pages/iep/types';

export type { ApprovalLog, IEPGoal, IEPPlan, ParentSignature };

/* ============================================================
 * 后端原始数据结构（严格按照 SQL SELECT / INSERT 字段书写）
 * ============================================================ */

/** iep_plans 行（list 为裁剪字段，get 为 p.* 加 join 别名） */
export interface RawIEPPlan {
  id: number;
  student_id: number;
  student_name?: string | null;
  plan_code?: string | null;
  title: string;
  academic_year?: string | null;
  semester?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  primary_teacher_id?: number | null;
  primary_teacher_name?: string | null;
  status: string;
  approved_by?: number | null;
  approved_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  goal_count?: number | null;
  team_members?: string | string[] | null;
  strengths?: string | null;
  needs?: string | null;
  priorities?: string | null;
  adaptations?: string | null;
  assistive_tech?: string | null;
  transition_plan?: string | null;
  progress_summary?: string | null;
  placement_type?: string | null;
  placement_notes?: string | null;
  regular_class_hours?: number | string | null;
  resource_room_hours?: number | string | null;
  meeting_date?: string | null;
  meeting_place?: string | null;
  next_review_date?: string | null;
  goals?: RawIEPGoal[];
  approval_logs?: RawApprovalLog[];
  signatures?: RawSignature[];
}

/** iep_goals 行 */
export interface RawIEPGoal {
  id: number;
  goal_code?: string | null;
  area?: string | null;
  title?: string | null;
  description?: string | null;
  target_behavior?: string | null;
  criteria?: string | null;
  evaluation_method?: string | null;
  baseline?: string | null;
  target_score?: number | string | null;
  current_score?: number | string | null;
  progress_percentage?: number | string | null;
  start_date?: string | null;
  target_date?: string | null;
  priority?: string | null;
  status?: string | null;
  teaching_strategies?: string | null;
  resources?: string | null;
  responsible_teacher_id?: number | null;
  sort_order?: number | null;
}

/** iep_approval_logs 行 */
export interface RawApprovalLog {
  id: number;
  approver_id?: number | null;
  approver_type?: string | null;
  approver_role?: string | null;
  approver_name?: string | null;
  action?: string | null;
  comment?: string | null;
  previous_status?: string | null;
  new_status?: string | null;
  created_at?: string | null;
}

/** parent_signatures（join parents 取姓名） */
export interface RawSignature {
  id: number;
  parent_id?: number | null;
  parent_name?: string | null;
  signature_type?: string | null;
  is_revoked?: number | string | null;
  signed_at?: string | null;
}

/* ============================================================
 * 枚举映射
 * ============================================================ */

/** iep_plans.status ENUM: draft/reviewing/approved/rejected/signed/active/completed/archived */
const STATUS_TO_CN: Record<string, IEPStatus> = {
  draft: '草稿',
  reviewing: '审核中',
  approved: '已通过',
  rejected: '已驳回',
  signed: '已签名',
  active: '执行中',
  completed: '已完成',
  archived: '已完成',
};

const STATUS_TO_EN: Record<IEPStatus, string> = {
  草稿: 'draft',
  审核中: 'reviewing',
  已通过: 'approved',
  已驳回: 'rejected',
  已签名: 'signed',
  执行中: 'active',
  已完成: 'completed',
};

/** iep_goals.status ENUM: not_started/in_progress/achieved/partially_achieved/discontinued/exceeded */
const GOAL_STATUS_TO_CN: Record<string, GoalStatus> = {
  not_started: '未开始',
  in_progress: '进行中',
  achieved: '已完成',
  partially_achieved: '进行中',
  discontinued: '暂停',
  exceeded: '已完成',
};

const GOAL_STATUS_TO_EN: Record<GoalStatus, string> = {
  未开始: 'not_started',
  进行中: 'in_progress',
  已完成: 'achieved',
  暂停: 'discontinued',
};

/** iep_goals.priority ENUM: high/medium/low */
const PRIORITY_TO_CN: Record<string, Priority> = { high: '高', medium: '中', low: '低' };
const PRIORITY_TO_EN: Record<Priority, string> = { 高: 'high', 中: 'medium', 低: 'low' };

/** iep_approval_logs.action ENUM: submit/review/approve/reject/revise/sign/withdraw */
const ACTION_TO_CN: Record<string, ApprovalLog['action']> = {
  submit: '提交审核',
  review: '提交审核',
  approve: '审批通过',
  reject: '审批驳回',
  revise: '退回修改',
  sign: '家长签名',
  withdraw: '退回修改',
};

/** parent_signatures.signature_type ENUM('handwritten','digital','fingerprint') */
export type SignatureType = 'handwritten' | 'digital' | 'fingerprint';
export const SIGNATURE_TYPES: SignatureType[] = ['handwritten', 'digital', 'fingerprint'];

/** /iep/approve 的 decision 参数（注意：不是 action） */
export type ApprovalDecision = 'approve' | 'reject';

/* ============================================================
 * 通用工具
 * ============================================================ */

class ApiError extends Error {}

/** 统一解包 { success, message, data }，失败时抛出带后端 message 的 Error */
function unwrap<T>(res: { success: boolean; message?: string; data?: T }): T {
  if (!res.success) {
    throw new ApiError(res.message || '请求失败');
  }
  return res.data as T;
}

const num = (v: unknown, fallback = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

function parseTeamMembers(raw: string | string[] | null | undefined): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String);
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch {
    /* 非 JSON，按分隔符兜底 */
  }
  return raw
    .split(/[,，、;；]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * 现况描述适配：iep_plans 没有“分领域现况”字段，
 * 前端的 current_levels（Record<string,string>）以 JSON 存入 needs(TEXT)，读取时反向解析。
 */
function parseCurrentLevels(raw: string | null | undefined): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const out: Record<string, string> = {};
      Object.entries(parsed as Record<string, unknown>).forEach(([k, v]) => {
        out[k] = str(v);
      });
      return out;
    }
  } catch {
    /* 历史文本格式：按行 “键：值” */
  }
  const out: Record<string, string> = {};
  raw.split('\n').forEach((line) => {
    const idx = line.search(/[：:]/);
    if (idx > 0) out[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  });
  return out;
}

function serializeCurrentLevels(levels: Record<string, string> | undefined | null): string {
  return JSON.stringify(levels ?? {});
}

function todayISO(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/* ============================================================
 * 原始 → 视图模型 适配
 * ============================================================ */

function toStatusCN(raw: string | null | undefined): IEPStatus {
  return STATUS_TO_CN[str(raw)] ?? '草稿';
}

function toStatusEN(status: IEPStatus | string): string {
  return STATUS_TO_EN[status as IEPStatus] ?? str(status);
}

function toGoalStatusCN(raw: string | null | undefined): GoalStatus {
  return GOAL_STATUS_TO_CN[str(raw)] ?? '未开始';
}

function toPriorityCN(raw: string | null | undefined): Priority {
  return PRIORITY_TO_CN[str(raw)] ?? '中';
}

function toPriorityEN(priority: Priority | string | undefined): string {
  return PRIORITY_TO_EN[priority as Priority] ?? 'medium';
}

function toActionCN(raw: string | null | undefined, previousStatus?: string | null): ApprovalLog['action'] {
  const action = str(raw);
  if (action === 'submit' && !previousStatus) return '提交草稿';
  return ACTION_TO_CN[action] ?? '提交审核';
}

/** list 接口不返回家长签名信息，只能依据计划状态推断 */
function inferSignatureStatus(status: IEPStatus, signed?: boolean): IEPPlan['signature_status'] {
  if (signed) return '已签名';
  if (status === '已签名' || status === '执行中' || status === '已完成') return '已签名';
  if (status === '已通过') return '待签名';
  return '不需要';
}

export function adaptPlan(raw: RawIEPPlan): IEPPlan {
  const status = toStatusCN(raw.status);
  return {
    id: str(raw.id),
    plan_code: str(raw.plan_code),
    title: str(raw.title),
    student_id: str(raw.student_id),
    student_name: str(raw.student_name),
    student_class: '',
    student_number: '',
    academic_year: str(raw.academic_year),
    semester: str(raw.semester),
    start_date: str(raw.start_date),
    end_date: str(raw.end_date),
    primary_teacher: str(raw.primary_teacher_name),
    team_members: parseTeamMembers(raw.team_members),
    status,
    // /iep/list 与 /iep/get 都不返回计划级进度，留空由页面显示「—」，
    // 详情接口会在拿到 goals 后用平均值回填（见 fetchIEP）。
    progress_percent: undefined,
    goals_count: num(raw.goal_count, 0),
    signed: status === '已签名' || status === '执行中' || status === '已完成',
    signature_status: inferSignatureStatus(status),
    current_levels: parseCurrentLevels(raw.needs),
    teaching_adaptations: str(raw.adaptations),
    assistive_tech: str(raw.assistive_tech),
    transition_plan: str(raw.transition_plan),
    // v4：安置与会议要件（p.* 透传）
    placement_type: str(raw.placement_type),
    placement_notes: str(raw.placement_notes),
    regular_class_hours: raw.regular_class_hours == null ? null : num(raw.regular_class_hours, 0),
    resource_room_hours: raw.resource_room_hours == null ? null : num(raw.resource_room_hours, 0),
    meeting_date: str(raw.meeting_date),
    meeting_place: str(raw.meeting_place),
    next_review_date: str(raw.next_review_date),
    created_at: str(raw.created_at),
    updated_at: str(raw.updated_at),
  };
}

export function adaptGoal(raw: RawIEPGoal, planId?: string | number): IEPGoal {
  const targetScore = num(raw.target_score, 5);
  const currentScore = num(raw.current_score, 0);
  return {
    id: str(raw.id),
    iep_plan_id: str(planId ?? ''),
    area: str(raw.area) as GoalArea,
    title: str(raw.title),
    description: str(raw.description),
    target_behavior: str(raw.target_behavior),
    criteria: str(raw.criteria),
    evaluation_method: str(raw.evaluation_method) as IEPGoal['evaluation_method'],
    evaluation_frequency: '每周2次' as EvaluationFrequency,
    baseline: str(raw.baseline),
    target_score: targetScore,
    current_score: currentScore,
    start_date: str(raw.start_date),
    target_date: str(raw.target_date),
    priority: toPriorityCN(raw.priority),
    teaching_strategies: str(raw.teaching_strategies),
    resources: str(raw.resources),
    responsible_teacher: '',
    responsible_teacher_id: raw.responsible_teacher_id === null || raw.responsible_teacher_id === undefined
      ? undefined
      : str(raw.responsible_teacher_id),
    progress_notes: '',
    goal_type: '短期目标',
    progress_percent: num(raw.progress_percentage, 0),
    status: toGoalStatusCN(raw.status),
    created_at: '',
    updated_at: '',
  };
}

export function adaptApprovalLog(raw: RawApprovalLog, planId?: string | number): ApprovalLog {
  return {
    id: str(raw.id),
    iep_plan_id: str(planId ?? ''),
    action: toActionCN(raw.action, raw.previous_status),
    from_status: raw.previous_status ? toStatusCN(raw.previous_status) : null,
    to_status: toStatusCN(raw.new_status),
    operator: str(raw.approver_name),
    operator_role: str(raw.approver_role) || (raw.approver_type === 'parent' ? '家长' : '教师'),
    comment: str(raw.comment),
    created_at: str(raw.created_at),
  };
}

export function adaptSignature(raw: RawSignature, planId?: string | number): ParentSignature {
  const revoked = num(raw.is_revoked, 0) === 1;
  return {
    id: str(raw.id),
    iep_plan_id: str(planId ?? ''),
    parent_name: str(raw.parent_name),
    signature_data: null,
    signed_at: raw.signed_at ? str(raw.signed_at) : null,
    status: revoked ? '待签名' : '已签名',
  };
}

/** 视图模型的目标 → save_goals 需要的后端字段 */
function toGoalPayload(goal: Partial<IEPGoal> & Record<string, unknown>, index: number) {
  const rawId = goal.id !== undefined && goal.id !== null ? num(goal.id, 0) : 0;
  const payload: Record<string, unknown> = {
    area: str(goal.area),
    title: str(goal.title),
    description: str(goal.description),
    target_behavior: str(goal.target_behavior),
    criteria: str(goal.criteria),
    evaluation_method: str((goal as Record<string, unknown>).evaluation_method),
    baseline: str(goal.baseline),
    target_score: num(goal.target_score, 5) || 5,
    start_date: goal.start_date || null,
    target_date: goal.target_date || null,
    priority: toPriorityEN(goal.priority),
    teaching_strategies: str(goal.teaching_strategies),
    resources: str(goal.resources),
    responsible_teacher_id:
      goal.responsible_teacher_id === undefined || goal.responsible_teacher_id === null || goal.responsible_teacher_id === ''
        ? null
        : num(goal.responsible_teacher_id, 0),
    sort_order: index,
  };
  // id > 0 时后端走 UPDATE 分支，否则走 INSERT
  if (rawId > 0) payload.id = rawId;
  return payload;
}

/* ============================================================
 * 下拉选项（学生 / 教师）
 * ============================================================ */

export interface StudentOption {
  id: number;
  name: string;
  class_name?: string | null;
  gender?: string | null;
}

export interface TeacherOption {
  id: number;
  name: string;
}

/** GET /students/options —— 学生下拉（在读） */
export async function fetchStudentOptions(): Promise<StudentOption[]> {
  const res = await api.get<unknown[]>('/students/options', { status: '在读' });
  const data = unwrap(res) ?? [];
  const rows = Array.isArray(data) ? data : (data as { list?: unknown[] }).list ?? [];
  return (rows as RawStudentOption[]).map((s) => ({
    id: num(s?.id, 0),
    name: str(s?.name),
    class_name: s?.class_name ?? null,
    gender: s?.gender ?? null,
  }));
}

interface RawStudentOption {
  id?: number | string;
  name?: string;
  class_name?: string | null;
  gender?: string | null;
}

/**
 * GET /system/users —— 教师下拉。
 * 该端点需要 user_manage 权限，普通教师会被后端拒绝，
 * 此时返回空数组，由调用方回退为“当前用户”。
 */
export async function fetchTeacherOptions(): Promise<TeacherOption[]> {
  const res = await api.get<{ list?: unknown[] }>('/system/users', { page: 1, pageSize: 100 });
  if (!res.success) return [];
  const rows = res.data?.list ?? [];
  return (rows as RawUserOption[]).map((u) => ({
    id: num(u?.id, 0),
    name: str(u?.real_name || u?.username),
  }));
}

interface RawUserOption {
  id?: number | string;
  real_name?: string;
  username?: string;
}

/* ============================================================
 * IEP 计划接口
 * ============================================================ */

export interface IEPListParams {
  page?: number;
  pageSize?: number;
  student_id?: number | string;
  /** 传前端中文状态或 'all'，内部转成后端英文枚举 */
  status?: IEPStatus | string;
}

export interface IEPListResult {
  list: IEPPlan[];
  total: number;
  page: number;
  pageSize: number;
}

export async function fetchIEPList(params: IEPListParams = {}): Promise<IEPListResult> {
  const status = params.status && params.status !== 'all' ? toStatusEN(params.status) : '';
  const res = await api.get<{ list?: RawIEPPlan[]; total?: number; page?: number; pageSize?: number }>(
    '/iep/list',
    {
      page: params.page ?? 1,
      pageSize: params.pageSize ?? 100,
      student_id: params.student_id ?? '',
      status,
    },
  );
  const data = unwrap(res) ?? {};
  const rawList = Array.isArray(data.list) ? data.list : [];
  return {
    list: rawList.map(adaptPlan),
    total: num(data.total, rawList.length),
    page: num(data.page, params.page ?? 1),
    pageSize: num(data.pageSize, params.pageSize ?? 100),
  };
}

/** 详情：计划 + 目标 + 审批记录 + 家长签名（后端 get 一次性返回） */
export async function fetchIEP(
  id: number | string,
): Promise<IEPPlan & { goals: IEPGoal[]; approvalLogs: ApprovalLog[]; signatures: ParentSignature[] }> {
  const res = await api.get<RawIEPPlan>('/iep/get', { id });
  const raw = unwrap(res);
  if (!raw) throw new ApiError('IEP计划不存在');
  const plan = adaptPlan(raw);
  const goals = (raw.goals ?? []).map((g) => adaptGoal(g, raw.id));
  const avgProgress = goals.length
    ? Math.round(goals.reduce((sum, g) => sum + g.progress_percent, 0) / goals.length)
    : 0;
  return {
    ...plan,
    goals_count: goals.length,
    progress_percent: avgProgress,
    goals,
    approvalLogs: (raw.approval_logs ?? []).map((l) => adaptApprovalLog(l, raw.id)),
    signatures: (raw.signatures ?? []).map((s) => adaptSignature(s, raw.id)),
  };
}

export interface CreateIEPPayload {
  student_id: number | string;
  title: string;
  academic_year?: string;
  semester?: string;
  start_date?: string;
  end_date?: string;
}

/** POST /iep/create —— 后端只回传 { id, plan_code }，不返回完整计划 */
export async function createIEP(data: CreateIEPPayload): Promise<{ id: number; plan_code: string }> {
  const res = await api.post<{ id?: number | string; plan_code?: string }>('/iep/create', {
    student_id: num(data.student_id, 0),
    title: data.title,
    academic_year: data.academic_year || undefined,
    semester: data.semester || undefined,
    start_date: data.start_date || undefined,
    end_date: data.end_date || undefined,
  });
  const data2 = unwrap(res) ?? {};
  return { id: num(data2.id, 0), plan_code: str(data2.plan_code) };
}

export interface UpdateIEPPayload {
  title?: string;
  semester?: string;
  academic_year?: string;
  start_date?: string;
  end_date?: string;
  strengths?: string;
  needs?: string;
  priorities?: string;
  adaptations?: string;
  assistive_tech?: string;
  transition_plan?: string;
  /** 后端 team_members 为 JSON 列，必须序列化成字符串才能绑定 PDO 参数 */
  team_members?: string[] | string;
  status?: IEPStatus | string;
  progress_summary?: string;
  // v4 特教内核（6.2）
  placement_type?: string;
  placement_notes?: string;
  regular_class_hours?: number;
  resource_room_hours?: number;
  meeting_date?: string;
  meeting_place?: string;
  next_review_date?: string;
}

/** POST /iep/update */
export async function updateIEP(id: number | string, data: UpdateIEPPayload): Promise<void> {
  const payload: Record<string, unknown> = { id: num(id, 0) };
  Object.entries(data).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    if (key === 'status') {
      payload.status = toStatusEN(value as string);
      return;
    }
    if (key === 'team_members' && Array.isArray(value)) {
      payload.team_members = JSON.stringify(value);
      return;
    }
    payload[key] = value;
  });
  const res = await api.post('/iep/update', payload);
  unwrap(res);
}

/** 把向导表单映射到后端可更新字段 */
export function buildPlanUpdatePayload(form: {
  title?: string;
  academic_year?: string;
  semester?: string;
  start_date?: string;
  end_date?: string;
  team_members?: string[];
  teaching_adaptations?: string;
  assistive_tech?: string;
  transition_plan?: string;
  current_levels?: Record<string, string>;
}): UpdateIEPPayload {
  const payload: UpdateIEPPayload = {
    needs: serializeCurrentLevels(form.current_levels),
    adaptations: form.teaching_adaptations ?? '',
    assistive_tech: form.assistive_tech ?? '',
    transition_plan: form.transition_plan ?? '',
    team_members: form.team_members ?? [],
  };
  if (form.title) payload.title = form.title;
  if (form.academic_year) payload.academic_year = form.academic_year;
  if (form.semester) payload.semester = form.semester;
  if (form.start_date) payload.start_date = form.start_date;
  if (form.end_date) payload.end_date = form.end_date;
  return payload;
}

/** POST /iep/delete */
export async function deleteIEP(id: number | string): Promise<void> {
  const res = await api.post('/iep/delete', { id: num(id, 0) });
  unwrap(res);
}

/** POST /iep/submit */
export async function submitIEP(id: number | string): Promise<void> {
  const res = await api.post('/iep/submit', { id: num(id, 0) });
  unwrap(res);
}

/**
 * POST /iep/approve
 * 注意参数名是 decision（'approve' | 'reject'），不是 action。
 */
export async function approveIEP(
  id: number | string,
  decision: ApprovalDecision,
  comment?: string,
): Promise<void> {
  const res = await api.post('/iep/approve', {
    id: num(id, 0),
    decision,
    comment: comment ?? '',
  });
  unwrap(res);
}

/**
 * POST /iep/sign
 * signature_type 必须是 ENUM('handwritten','digital','fingerprint') 之一。
 */
export async function signIEP(
  id: number | string,
  signatureData: string,
  signatureType: SignatureType = 'handwritten',
  extra?: { parent_id?: number | string; device_info?: string },
): Promise<void> {
  const res = await api.post('/iep/sign', {
    plan_id: num(id, 0),
    signature_data: signatureData,
    signature_type: signatureType,
    parent_id: extra?.parent_id !== undefined ? num(extra.parent_id, 0) : undefined,
    device_info: extra?.device_info ?? (typeof navigator !== 'undefined' ? navigator.userAgent : ''),
  });
  unwrap(res);
}

/** POST /iep/save_goals —— goals 为空数组时不请求（后端不接受空操作） */
export async function saveGoals(
  planId: number | string,
  goals: Array<Partial<IEPGoal> & Record<string, unknown>>,
): Promise<void> {
  if (!goals.length) return;
  const res = await api.post('/iep/save_goals', {
    plan_id: num(planId, 0),
    goals: goals.map(toGoalPayload),
  });
  unwrap(res);
}

export interface RecordProgressPayload {
  goal_id: number | string;
  /** 0-100 完成率，内部换算成 max_score 下的得分 */
  completion_rate?: number;
  score?: number;
  max_score?: number;
  recorded_date?: string;
  session_type?: string;
  prompt_level?: string;
  is_generalized?: boolean;
  generalization_context?: string;
  notes?: string;
}

export interface RecordProgressResult {
  current_score: number;
  progress: number;
}

/** POST /iep/progress */
export async function recordGoalProgress(payload: RecordProgressPayload): Promise<RecordProgressResult> {
  const maxScore = payload.max_score ?? 5;
  const score =
    payload.score !== undefined
      ? payload.score
      : Math.round(((payload.completion_rate ?? 0) / 100) * maxScore);
  const res = await api.post<{ current_score?: number; progress?: number }>('/iep/progress', {
    goal_id: num(payload.goal_id, 0),
    recorded_date: payload.recorded_date ?? todayISO(),
    score,
    max_score: maxScore,
    session_type: payload.session_type ?? '',
    prompt_level: payload.prompt_level ?? '',
    is_generalized: payload.is_generalized ? 1 : 0,
    generalization_context: payload.generalization_context ?? '',
    notes: payload.notes ?? '',
  });
  const data = unwrap(res) ?? {};
  return { current_score: num(data.current_score, 0), progress: num(data.progress, 0) };
}

/** GET /iep/approval-logs?plan_id= */
export async function fetchApprovalLogs(planId: number | string): Promise<ApprovalLog[]> {
  const res = await api.get<RawApprovalLog[]>('/iep/approval-logs', { plan_id: num(planId, 0) });
  const data = unwrap(res) ?? [];
  const rows = Array.isArray(data) ? data : [];
  return rows.map((l) => adaptApprovalLog(l, planId));
}

export interface GoalStats {
  total: number;
  by_area: Array<{ area: string; count: number }>;
  by_status: Array<{ status: string; count: number }>;
  avg_progress: number;
}

/** GET /iep/goal_stats?student_id= （注意参数名是 student_id，不是 plan_id） */
export async function fetchGoalStats(studentId: number | string): Promise<GoalStats> {
  const res = await api.get<GoalStats>('/iep/goal_stats', { student_id: num(studentId, 0) });
  const data = unwrap(res) ?? { total: 0, by_area: [], by_status: [], avg_progress: 0 };
  return {
    total: num(data.total, 0),
    by_area: Array.isArray(data.by_area) ? data.by_area : [],
    by_status: Array.isArray(data.by_status) ? data.by_status : [],
    avg_progress: num(data.avg_progress, 0),
  };
}

/**
 * 批量取多个计划的目标（用于“参与教师”视角的目标汇总）。
 * 后端没有按教师聚合的目标接口，只能逐个计划取详情，这里限制并发数量避免过度请求。
 */
export async function fetchGoalsForPlans(planIds: Array<number | string>, limit = 20): Promise<IEPGoal[]> {
  const ids = planIds.slice(0, limit);
  const results = await Promise.all(
    ids.map(async (id) => {
      try {
        const detail = await fetchIEP(id);
        return detail.goals;
      } catch {
        return [] as IEPGoal[];
      }
    }),
  );
  return results.flat();
}

/* ============================================================
 * v4 特教专业内核：短期目标 / 任务分析 / 试次记录（6.1）
 * ============================================================ */

/** iep_objectives 行（含 v_iep_objective_progress 汇总与挂载的步骤） */
export interface ObjectiveStep {
  id: number;
  step_no: number;
  title: string;
  description?: string | null;
  teaching_prompt?: string | null;
  is_critical: number;
}

export interface IEPObjective {
  id: number;
  iep_plan_id: number;
  goal_id: number;
  objective_code: string;
  seq_no: number;
  title: string;
  target_behavior?: string | null;
  criteria?: string | null;
  measurement_method?: string | null;
  baseline_level?: string | null;
  target_level?: string | null;
  mastery_pct: number;
  start_date?: string | null;
  target_date?: string | null;
  status: string;
  teaching_strategy?: string | null;
  sort_order: number;
  record_count: number;
  total_trials: number;
  total_success: number;
  overall_pct: number;
  latest_pct?: number | null;
  latest_prompt_level?: string | null;
  last_record_date?: string | null;
  steps: ObjectiveStep[];
}

export interface ObjectiveRecord {
  id: number;
  objective_id: number;
  step_id?: number | null;
  step_title?: string | null;
  record_date: string;
  session_type?: string | null;
  context?: string | null;
  trial_count: number;
  success_count: number;
  achievement_pct: number;
  prompt_level: string;
  is_generalized: number;
  duration_minutes?: number | null;
  notes?: string | null;
  recorder_name?: string | null;
}

export const OBJECTIVE_STATUS_CN: Record<string, string> = {
  not_started: '未开始',
  in_progress: '进行中',
  mastered: '已掌握',
  not_mastered: '未掌握',
  discontinued: '已终止',
};

export const PROMPT_LEVEL_CN: Record<string, string> = {
  independent: '独立完成',
  gesture: '手势提示',
  verbal: '语言提示',
  model: '示范提示',
  physical: '身体辅助',
};

/** GET /iep/objectives?plan_id= —— 计划的全部短期目标（含步骤与进度汇总） */
export async function fetchObjectives(planId: number | string): Promise<IEPObjective[]> {
  const res = await api.get<IEPObjective[]>('/iep/objectives', { plan_id: num(planId, 0) });
  const data = unwrap(res) ?? [];
  return Array.isArray(data) ? data : [];
}

export interface ObjectiveSavePayload {
  id?: number;
  goal_id?: number;
  title: string;
  target_behavior?: string;
  criteria?: string;
  measurement_method?: string;
  baseline_level?: string;
  target_level?: string;
  mastery_pct?: number;
  start_date?: string;
  target_date?: string;
  status?: string;
  teaching_strategy?: string;
  steps?: Array<{
    title: string;
    description?: string;
    teaching_prompt?: string;
    is_critical?: boolean;
  }>;
}

/** POST /iep/objective_save —— id>0 走更新，否则新建；步骤全量替换 */
export async function saveObjective(payload: ObjectiveSavePayload): Promise<number> {
  const res = await api.post<{ id?: number }>('/iep/objective_save', payload);
  const data = unwrap(res) ?? {};
  return num(data.id, 0);
}

/** POST /iep/objective_delete */
export async function deleteObjective(id: number): Promise<void> {
  const res = await api.post('/iep/objective_delete', { id });
  unwrap(res);
}

/** GET /iep/objective_records?objective_id= */
export async function fetchObjectiveRecords(objectiveId: number): Promise<ObjectiveRecord[]> {
  const res = await api.get<ObjectiveRecord[]>('/iep/objective_records', { objective_id: objectiveId });
  const data = unwrap(res) ?? [];
  return Array.isArray(data) ? data : [];
}

export interface ObjectiveRecordPayload {
  objective_id: number;
  step_id?: number | null;
  record_date?: string;
  session_type?: string;
  context?: string;
  trial_count: number;
  success_count: number;
  prompt_level: string;
  is_generalized?: boolean;
  duration_minutes?: number;
  notes?: string;
}

/** POST /iep/objective_record_add —— 达成率由后端生成列计算，连续达标自动判定已掌握 */
export async function addObjectiveRecord(
  payload: ObjectiveRecordPayload,
): Promise<{ achievement_pct: number; objective_status?: string | null }> {
  const res = await api.post<{ achievement_pct?: number; objective_status?: string | null }>(
    '/iep/objective_record_add',
    payload,
  );
  const data = unwrap(res) ?? {};
  return {
    achievement_pct: num(data.achievement_pct, 0),
    objective_status: data.objective_status ?? null,
  };
}

/** POST /iep/goal_rollup —— 由 trial 数据反推长期目标进度与状态
 *  后端返回 { updated: [{ goal_id, objective_count, mastered_count, avg_pct, suggested_status }] }
 *  兼容早期约定的 count 字段。 */
export async function rollupGoals(planId: number | string): Promise<number> {
  const res = await api.post<{ count?: number; updated?: unknown[] }>('/iep/goal_rollup', {
    plan_id: num(planId, 0),
  });
  const data = unwrap(res) ?? {};
  if (Array.isArray(data.updated)) return data.updated.length;
  return num(data.count, 0);
}

/* ============================================================
 * v4 相关服务台账 / IEP 会议参与人（6.2）
 * ============================================================ */

export interface RelatedService {
  id: number;
  iep_plan_id: number;
  service_code?: string | null;
  service_name: string;
  provider?: string | null;
  provider_role?: string | null;
  frequency_per_week: number;
  minutes_per_session: number;
  planned_sessions: number;
  completed_sessions: number;
  location?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  status: string;
  remark?: string | null;
}

export const SERVICE_STATUS_CN: Record<string, string> = {
  planned: '待开始',
  active: '进行中',
  completed: '已完成',
  suspended: '已暂停',
};

export async function fetchRelatedServices(planId: number | string): Promise<RelatedService[]> {
  const res = await api.get<RelatedService[]>('/iep/related_services', { plan_id: num(planId, 0) });
  const data = unwrap(res) ?? [];
  return Array.isArray(data) ? data : [];
}

export type RelatedServicePayload = Partial<RelatedService> & { plan_id: number; service_name: string };

export async function saveRelatedService(payload: RelatedServicePayload): Promise<number> {
  const res = await api.post<{ id?: number }>('/iep/related_service_save', payload);
  const data = unwrap(res) ?? {};
  return num(data.id, 0);
}

export async function deleteRelatedService(planId: number | string, id: number): Promise<void> {
  const res = await api.post('/iep/related_service_delete', { plan_id: num(planId, 0), id });
  unwrap(res);
}

export interface MeetingParticipant {
  id: number;
  iep_plan_id: number;
  participant_type: string;
  user_id?: number | null;
  parent_id?: number | null;
  name: string;
  role?: string | null;
  attendance: string;
  proxy_note?: string | null;
  signed_at?: string | null;
  remark?: string | null;
}

export const PARTICIPANT_TYPE_CN: Record<string, string> = {
  school: '学校人员',
  parent: '家长',
  student: '学生本人',
  specialist: '专业人员',
  external: '校外人员',
};

export const ATTENDANCE_CN: Record<string, string> = {
  present: '出席',
  proxy: '委托出席',
  absent: '缺席',
};

export async function fetchMeetingParticipants(planId: number | string): Promise<MeetingParticipant[]> {
  const res = await api.get<MeetingParticipant[]>('/iep/meeting_participants', {
    plan_id: num(planId, 0),
  });
  const data = unwrap(res) ?? [];
  return Array.isArray(data) ? data : [];
}

export type MeetingParticipantPayload = Partial<MeetingParticipant> & { plan_id: number; name: string };

export async function saveMeetingParticipant(payload: MeetingParticipantPayload): Promise<number> {
  const res = await api.post<{ id?: number }>('/iep/meeting_participant_save', payload);
  const data = unwrap(res) ?? {};
  return num(data.id, 0);
}

/* ============================================================
 * v4 字典：GET /iep/meta（安置形式 / 相关服务 / 沟通方式）
 * ============================================================ */

export interface IEPMeta {
  placement_types: string[];
  related_services: Array<{ code: string; name: string; category?: string | null; description?: string | null }>;
  communication_methods: Array<{ code: string; name: string; value?: string | null }>;
}

export async function fetchIEPMeta(): Promise<IEPMeta> {
  const res = await api.get<IEPMeta>('/iep/meta');
  const data = unwrap(res);
  return {
    placement_types: data?.placement_types ?? [],
    related_services: data?.related_services ?? [],
    communication_methods: data?.communication_methods ?? [],
  };
}
