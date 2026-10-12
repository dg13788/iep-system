/**
 * 转衔与家长闭环 service 层（Step 4）
 *
 * 契约来源：backend/api/transition.php
 *
 *   GET  /transition/overview          ?plan_id=
 *   POST /transition/goal_save         { plan_id, goal }
 *   POST /transition/goal_delete       { id, plan_id }
 *   POST /transition/service_save      { plan_id, service }
 *   POST /transition/service_delete    { id, plan_id }
 *   POST /transition/parent_input_save { plan_id, strengths?, concerns?, expectations?, support_at_home?, ... }
 *   GET  /transition/quarterly_report  ?plan_id=&from=&to=
 *
 * 设计约定：
 *   - 季度报告的「是否按预期进展」由后端 Step 1 决策引擎给出，前端不翻译、不重判。
 *   - 转衔目标与长期目标同构（基线/目标/期限），因此可复用同一套进度判定。
 */

import { api } from '@/api';

function unwrap<T>(res: { success: boolean; message?: string; data?: T }): T {
  if (!res.success) throw new Error(res.message || '请求失败');
  return res.data as T;
}

export type TransitionCategory = '升学' | '就业' | '独立生活';

export interface TransitionGoal {
  id: number;
  iep_plan_id: number;
  category: TransitionCategory;
  title: string;
  target_behavior: string | null;
  criteria: string | null;
  baseline: string | null;
  baseline_value: number | null;
  baseline_date: string | null;
  target_value: number | null;
  start_date: string | null;
  target_date: string | null;
  monitor_frequency: string | null;
  responsible_id: number | null;
  responsible_name: string | null;
  status: string;
  sort_order: number;
}

export interface TransitionService {
  id: number;
  iep_plan_id: number;
  service_name: string;
  provider: string | null;
  start_date: string | null;
  end_date: string | null;
  frequency: string | null;
  outcome_note: string | null;
}

export type ParentInputSource = 'parent_portal' | 'teacher_proxy' | 'paper' | 'phone';

export interface ParentMeetingInput {
  id: number;
  iep_plan_id: number;
  parent_id: number | null;
  parent_name: string | null;
  relation: string | null;
  meeting_date: string | null;
  strengths: string | null;
  concerns: string | null;
  expectations: string | null;
  support_at_home: string | null;
  source: ParentInputSource;
  submitted_at: string;
}

export interface TransitionOverview {
  goals: TransitionGoal[];
  services: TransitionService[];
  parent_inputs: ParentMeetingInput[];
  signatures: Array<{
    id: number;
    parent_id: number | null;
    signing_purpose: string | null;
    signed_at: string | null;
    is_revoked: number;
  }>;
}

export type OnTrackLabel = 'achieved' | 'on_track' | 'watch' | 'behind' | 'unknown';

export interface QuarterlyReportGoal {
  goal_id: number;
  title: string;
  area: string | null;
  baseline_value: number | null;
  current_value: number | null;
  target_value: number | null;
  target_date: string | null;
  on_track: OnTrackLabel;
  decision_text: string;
  reasons: string[];
  data_points: number;
  last_date: string | null;
}

export interface QuarterlyReport {
  plan: {
    id: number;
    title: string;
    student_name: string;
    start_date: string | null;
    end_date: string | null;
    status: string;
  };
  period: { from: string | null; to: string };
  goals: QuarterlyReportGoal[];
  summary: Partial<Record<OnTrackLabel, number>>;
  note: string;
}

export async function fetchTransitionOverview(planId: number | string): Promise<TransitionOverview> {
  const res = await api.get<TransitionOverview>(`/transition/overview?plan_id=${planId}`);
  return unwrap(res);
}

export async function saveTransitionGoal(
  planId: number | string,
  goal: Partial<TransitionGoal>,
): Promise<{ id: number }> {
  const res = await api.post<{ id: number }>('/transition/goal_save', {
    plan_id: Number(planId),
    goal,
  });
  return unwrap(res);
}

export async function deleteTransitionGoal(planId: number | string, id: number): Promise<void> {
  const res = await api.post('/transition/goal_delete', { plan_id: Number(planId), id });
  unwrap(res);
}

export async function saveTransitionService(
  planId: number | string,
  service: Partial<TransitionService>,
): Promise<{ id: number }> {
  const res = await api.post<{ id: number }>('/transition/service_save', {
    plan_id: Number(planId),
    service,
  });
  return unwrap(res);
}

export async function deleteTransitionService(planId: number | string, id: number): Promise<void> {
  const res = await api.post('/transition/service_delete', { plan_id: Number(planId), id });
  unwrap(res);
}

export async function saveParentMeetingInput(params: {
  plan_id: number | string;
  parent_id?: number;
  parent_name?: string;
  relation?: string;
  meeting_date?: string;
  strengths?: string;
  concerns?: string;
  expectations?: string;
  support_at_home?: string;
  source?: ParentInputSource;
}): Promise<{ id: number; source: ParentInputSource }> {
  const res = await api.post<{ id: number; source: ParentInputSource }>(
    '/transition/parent_input_save',
    params,
  );
  return unwrap(res);
}

export async function fetchQuarterlyReport(
  planId: number | string,
  from?: string,
  to?: string,
): Promise<QuarterlyReport> {
  let qs = `plan_id=${planId}`;
  if (from) qs += `&from=${from}`;
  if (to) qs += `&to=${to}`;
  const res = await api.get<QuarterlyReport>(`/transition/quarterly_report?${qs}`);
  return unwrap(res);
}

/** 给家长看的说法：不新造判定，只把引擎结论翻成家长能懂的话 */
export const ON_TRACK_TEXT: Record<OnTrackLabel, string> = {
  achieved: '已达成',
  on_track: '按预期进展',
  watch: '需继续观察',
  behind: '进展不及预期',
  unknown: '数据不足，暂不判断',
};

export const ON_TRACK_DOT: Record<OnTrackLabel, string> = {
  achieved: '#059669',
  on_track: '#2563EB',
  watch: '#D97706',
  behind: '#DC2626',
  unknown: '#94A3B8',
};
