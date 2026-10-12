/**
 * 轻量校级协同 service 层（Step 5）
 *
 * 契约来源：backend/api/school.php
 *   GET /school/overview ?limit=
 *
 * 设计约定：
 *   - 健康度由后端决策引擎给出，前端只负责呈现，不重算、不换算百分比。
 *   - 本视图**不含**多校/区域级统计——那是方案明确不做的范围。
 */

import { api } from '@/api';

function unwrap<T>(res: { success: boolean; message?: string; data?: T }): T {
  if (!res.success) throw new Error(res.message || '请求失败');
  return res.data as T;
}

export interface ClassHealth {
  class_id: number;
  class_name: string;
  student_count: number;
  goals: number;
  on_track: number;
  watch: number;
  behind: number;
  unknown: number;
  achieved: number;
  overdue: number;
  /** 健康度 =（按预期 + 已达成）/ 目标总数；无目标时为 null（不是 0） */
  health: number | null;
}

export interface OverdueTeacher {
  teacher_id: number;
  teacher_name: string;
  overdue_goals: number;
  max_days: number;
  never: number;
}

export interface QcFailedPlan {
  plan_id: number;
  student_name: string;
  class_name: string;
  teacher_name: string | null;
  error_count: number;
  warn_count: number;
  top_issues: string[];
}

export interface SchoolOverview {
  scope_type: string;
  today: string;
  plan_count: number;
  classes: ClassHealth[];
  overdue: OverdueTeacher[];
  qc_failed: QcFailedPlan[];
  totals: Partial<Record<'achieved' | 'on_track' | 'watch' | 'behind' | 'unknown', number>>;
  note: string;
}

export async function fetchSchoolOverview(limit = 60): Promise<SchoolOverview> {
  const res = await api.get<SchoolOverview>(`/school/overview?limit=${limit}`);
  return unwrap(res);
}
