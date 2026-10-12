/**
 * 今日工作台 service 层（Step 2：教师的一天）
 *
 * 契约来源：backend/api/workbench.php（计算口径全部来自 backend/api/progress_analysis.php）
 *
 *   GET  /workbench/today       ?today=YYYY-MM-DD（可注入，便于回测）
 *   POST /workbench/trial_save  { objective_id, record_date?, groups[], session_type?, context?, notes? }
 *
 * 设计约定：
 *   - 本文件不复制任何阈值与等级定义；页面上出现的判断文案一律来自后端返回值。
 *   - 试次按「辅助层级」分组提交：不同提示层级下的成功不是一个含义，
 *     混在一起会永久丢失「该不该撤提示」的唯一依据。
 */

import { api } from '@/api';

function unwrap<T>(res: { success: boolean; message?: string; data?: T }): T {
  if (!res.success) {
    throw new Error(res.message || '请求失败');
  }
  return res.data as T;
}

const num = (v: unknown, fallback = 0): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
};

/* ============================================================
 * 类型
 * ============================================================ */

export type DueState = 'overdue' | 'due' | 'soon';

/** 今日待采：一条 = 一个「该练、该记」的短期目标 */
export interface DueItem {
  student_id: number;
  student_name: string;
  class_name: string | null;
  plan_id: number;
  goal_id: number;
  goal_title: string;
  area: string | null;
  objective_id: number;
  objective_title: string;
  mastery_pct: number | null;
  record_mode: 'trial' | 'rating';
  frequency: string | null;
  frequency_defaulted: boolean;
  expected_days: number;
  last_date: string | null;
  record_count: number;
  due_date: string;
  days_overdue: number;
  state: DueState;
}

/** 需要关注：一条 = 一个「数据提示该看看教法了」的长期目标 */
export interface AttentionItem {
  student_id: number;
  student_name: string;
  class_name: string | null;
  plan_id: number;
  goal_id: number;
  goal_title: string;
  area: string | null;
  level: 'adjust' | 'watch' | 'mastered';
  level_text: string;
  reasons: string[];
  evidence: {
    points?: number;
    below_window?: number;
    below_count?: number;
    trend_ratio?: number | null;
    days_since_last?: number;
    expected_days?: number | null;
  };
  suggestions: Array<{ type: string; text: string }>;
  points: number;
  last_date: string | null;
}

export type UpcomingKind =
  | 'review_due'
  | 'approval'
  | 'parent_sign'
  | 'draft'
  | 'adjustment_review';

/** 临期事项：复审 / 审批 / 家长签署 / 干预调整复核 */
export interface UpcomingItem {
  kind: UpcomingKind;
  plan_id: number;
  goal_id?: number;
  adjustment_id?: number;
  student_id: number;
  student_name: string;
  class_name: string | null;
  title: string;
  date: string | null;
  days_left: number | null;
  severity: 'overdue' | 'soon' | 'info';
  text: string;
}

export interface WorkbenchCounts {
  due: number;
  overdue: number;
  attention: number;
  upcoming: number;
  /** 未闭合但完全没有短期目标的长期目标数（IEP 自身缺陷，需补建后才能采集） */
  no_objective_goals: number;
}

export interface WorkbenchData {
  today: string;
  generated_at: string;
  scope_type: string;
  readonly: boolean;
  due: DueItem[];
  attention: AttentionItem[];
  upcoming: UpcomingItem[];
  counts: WorkbenchCounts;
  note: string;
}

/* ============================================================
 * 请求
 * ============================================================ */

/** GET /workbench/today */
export async function fetchWorkbench(today?: string): Promise<WorkbenchData> {
  const res = await api.get<WorkbenchData>('/workbench/today', today ? { today } : undefined);
  const d = unwrap(res) ?? ({} as WorkbenchData);
  return {
    today: d.today ?? '',
    generated_at: d.generated_at ?? '',
    scope_type: d.scope_type ?? '',
    readonly: !!d.readonly,
    due: d.due ?? [],
    attention: d.attention ?? [],
    upcoming: d.upcoming ?? [],
    counts: d.counts ?? { due: 0, overdue: 0, attention: 0, upcoming: 0, no_objective_goals: 0 },
    note: d.note ?? '',
  };
}

/* ============================================================
 * 试次计数器
 * ============================================================ */

export type PromptLevel = 'independent' | 'gesture' | 'verbal' | 'model' | 'physical';

export const PROMPT_LEVELS: Array<{ value: PromptLevel; label: string; hint: string }> = [
  { value: 'independent', label: '独立',       hint: '无任何提示下完成' },
  { value: 'gesture',     label: '手势',       hint: '手势 / 指点提示' },
  { value: 'verbal',      label: '语言',       hint: '口头提示 / 指令' },
  { value: 'model',       label: '示范',       hint: '教师示范后完成' },
  { value: 'physical',    label: '肢体辅助',   hint: '手把手辅助完成' },
];

export interface TrialGroup {
  prompt_level: PromptLevel;
  trial_count: number;
  success_count: number;
}

export interface TrialSavePayload {
  objective_id: number;
  record_date?: string;
  session_type?: string;
  context?: string;
  notes?: string;
  groups: TrialGroup[];
}

export interface TrialSaveResult {
  objective_id: number;
  goal_id: number;
  record_date: string;
  trial_count: number;
  success_count: number;
  achievement_pct: number;
  objective_status: string | null;
  rows: number;
  analysis: {
    goal_id: number;
    level: string;
    level_text: string;
    reasons: string[];
    points: number;
  } | null;
}

/** POST /workbench/trial_save */
export async function saveTrials(payload: TrialSavePayload): Promise<TrialSaveResult> {
  const res = await api.post<TrialSaveResult>('/workbench/trial_save', payload);
  const d = unwrap(res) ?? ({} as TrialSaveResult);
  return {
    objective_id: num(d.objective_id),
    goal_id: num(d.goal_id),
    record_date: d.record_date ?? '',
    trial_count: num(d.trial_count),
    success_count: num(d.success_count),
    achievement_pct: num(d.achievement_pct),
    objective_status: d.objective_status ?? null,
    rows: num(d.rows),
    analysis: d.analysis ?? null,
  };
}
