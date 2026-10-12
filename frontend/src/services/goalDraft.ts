/**
 * 目标起草助手 service 层（Step 3：评估 → IEP 因果链闭合）
 *
 * 契约来源：backend/api/goal_draft.php
 *
 *   GET  /goal_draft/profile      ?plan_id=&assessment_id=
 *   GET  /goal_draft/plaafp       ?plan_id=&assessment_id=
 *   POST /goal_draft/generate     { plan_id, assessment_id? }
 *   GET  /goal_draft/drafts       ?plan_id=
 *   POST /goal_draft/adopt        { plan_id, draft_id, final }
 *   POST /goal_draft/save_plaafp  { plan_id, assessment_id?, strengths, needs, draft_strengths?, draft_needs? }
 *
 * 设计约定（与后端同源，前端不复制任何阈值）：
 *   - 页面上出现的「掌握线 / 发展中 / 优先需求」等判断文案，一律取自后端 reason 字段。
 *   - 草案中标注 needs_confirm 的项必须显式提示教师确认，不得伪装成已确定值。
 */

import { api } from '@/api';

function unwrap<T>(res: { success: boolean; message?: string; data?: T }): T {
  if (!res.success) throw new Error(res.message || '请求失败');
  return res.data as T;
}

/* ============================================================
 * 类型
 * ============================================================ */

export interface DraftAssessmentMeta {
  id: number;
  date: string;
  type: string;
  template_name: string;
  assessor_name: string;
  item_count: number;
}

export interface DraftProfileItem {
  item_id: number;
  dimension: string;
  item_name: string;
  score: number | null;
  max_score: number | null;
  pct: number | null;
  level: string;
}

export type DimBand = 'mastered' | 'emerging' | 'priority' | 'unknown';

export interface DimensionProfile {
  dimension: string;
  item_count: number;
  avg_pct: number | null;
  min_pct: number | null;
  max_pct: number | null;
  spread: number | null;
  uneven: boolean;
  band: DimBand;
  reason: string;
  area: string | null;
  area_known: boolean;
  prompt_mix: Record<string, number>;
  level_scales: string[];
  scale_mixed: boolean;
  items: DraftProfileItem[];
}

export interface AssessmentProfile {
  has_assessment: boolean;
  reason?: string;
  assessment?: DraftAssessmentMeta;
  items?: DraftProfileItem[];
  dimensions?: DimensionProfile[];
  summary?: {
    dimension_count: number;
    strength_dims: string[];
    needs_dims: string[];
    unknown_dims: string[];
  };
}

export interface PlaafpDraft {
  strengths_text: string;
  needs_text: string;
  source_text: string;
  evidence: Array<{
    dimension: string;
    band: DimBand;
    avg_pct: number | null;
    reason: string;
    item_ids: number[];
  }>;
  caveats: string[];
  assessment?: DraftAssessmentMeta;
  current?: { strengths: string; needs: string };
}

export interface GoalDraft {
  draft_id?: number;
  area: string | null;
  area_confirmed: boolean;
  dimension: string;
  title: string;
  target_behavior: string;
  criteria: string;
  baseline: string;
  baseline_value: number | null;
  baseline_date: string | null;
  target_value: number | null;
  target_value_note: string;
  condition_text: string | null;
  condition_from: string;
  evaluation_method: string;
  monitor_frequency: string;
  monitor_frequency_note: string;
  target_date: string | null;
  priority: 'high' | 'medium' | 'low';
  assessment_id: number;
  assessment_item_id: number | null;
  evidence_item_ids: number[];
  drafted_from: 'item' | 'dimension';
  reason: string;
  needs_confirm: string[];
}

export interface GenerateResult {
  assessment: DraftAssessmentMeta;
  drafts: GoalDraft[];
  truncated: boolean;
  note: string | null;
  engine: { source: string; version: string; llm_available: boolean };
}

export interface DraftRecord {
  id: number;
  assessment_id: number | null;
  assessment_item_id: number | null;
  goal_id: number | null;
  draft_kind: 'goal' | 'plaafp';
  source: 'rule' | 'llm' | 'manual';
  engine_version: string;
  draft_json: unknown;
  final_json: unknown;
  edited_fields: string | null;
  adopted: number;
  rejected_reason: string | null;
  created_at: string;
  adopted_at: string | null;
  created_by_name: string | null;
}

/* ============================================================
 * 接口
 * ============================================================ */

export async function fetchDraftProfile(
  planId: number | string,
  assessmentId?: number | string,
): Promise<AssessmentProfile> {
  const qs = new URLSearchParams({ plan_id: String(planId) });
  if (assessmentId) qs.set('assessment_id', String(assessmentId));
  const res = await api.get<AssessmentProfile>(`/goal_draft/profile?${qs.toString()}`);
  return unwrap(res);
}

export async function fetchPlaafpDraft(
  planId: number | string,
  assessmentId?: number | string,
): Promise<PlaafpDraft> {
  const qs = new URLSearchParams({ plan_id: String(planId) });
  if (assessmentId) qs.set('assessment_id', String(assessmentId));
  const res = await api.get<PlaafpDraft>(`/goal_draft/plaafp?${qs.toString()}`);
  return unwrap(res);
}

export async function generateGoalDrafts(
  planId: number | string,
  assessmentId?: number | string,
): Promise<GenerateResult> {
  const res = await api.post<GenerateResult>('/goal_draft/generate', {
    plan_id: Number(planId),
    ...(assessmentId ? { assessment_id: Number(assessmentId) } : {}),
  });
  return unwrap(res);
}

export async function fetchDraftRecords(planId: number | string): Promise<DraftRecord[]> {
  const res = await api.get<DraftRecord[]>(`/goal_draft/drafts?plan_id=${planId}`);
  return unwrap(res);
}

export async function adoptGoalDraft(
  planId: number | string,
  draftId: number,
  final: Partial<GoalDraft> & Record<string, unknown>,
): Promise<{ goal_id: number; draft_id: number; edited_fields: string[]; edited_note: string }> {
  const res = await api.post<{
    goal_id: number;
    draft_id: number;
    edited_fields: string[];
    edited_note: string;
  }>('/goal_draft/adopt', {
    plan_id: Number(planId),
    draft_id: draftId,
    final,
  });
  return unwrap(res);
}

export async function savePlaafpDraft(params: {
  plan_id: number | string;
  assessment_id?: number | string;
  strengths: string;
  needs: string;
  draft_strengths?: string;
  draft_needs?: string;
}): Promise<{ draft_id: number; edited_fields: string[] }> {
  const res = await api.post<{ draft_id: number; edited_fields: string[] }>(
    '/goal_draft/save_plaafp',
    params,
  );
  return unwrap(res);
}
