/**
 * 行为干预计划（BIP）模块 service 层 —— v4 特教专业内核（6.5）
 *
 * 契约来源：backend/api/intervention.php
 *
 * 端点一览（basePath 由 api.ts 统一拼成 /api）：
 *   GET  /intervention/bip_list      ?student_id        data: BIP 数组（含学生名）
 *   GET  /intervention/bip_get       ?id                data: BIP 详情
 *   POST /intervention/bip_save      { id?|student_id, target_behavior, ...ABC 字段 }
 *   POST /intervention/bip_delete    { id }
 *   GET  /intervention/incidents     ?bip_id&pageSize   data: 事件台账
 *   POST /intervention/incident_add  { bip_id, occurred_at, ...ABC 记录字段 }
 */

import { api } from '@/api';

function unwrap<T>(res: { success: boolean; message?: string; data?: T }): T {
  if (!res.success) {
    throw new Error(res.message || '请求失败');
  }
  return res.data as T;
}

const num = (v: unknown, fallback = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

/** behavior_intervention_plans 行 */
export interface BipPlan {
  id: number;
  student_id: number;
  student_name?: string | null;
  iep_plan_id?: number | null;
  plan_code?: string | null;
  target_behavior: string;
  behavior_function?: string | null;
  antecedent?: string | null;
  behavior_desc?: string | null;
  consequence?: string | null;
  setting_events?: string | null;
  replacement_behavior?: string | null;
  prevention_strategy?: string | null;
  reinforcement_strategy?: string | null;
  reinforcement_schedule?: string | null;
  consequence_strategy?: string | null;
  crisis_procedure?: string | null;
  start_date?: string | null;
  review_cycle_days?: number | null;
  next_review_date?: string | null;
  status: string;
  created_at?: string | null;
  updated_at?: string | null;
}

export const BIP_STATUS_CN: Record<string, string> = {
  draft: '草稿',
  active: '执行中',
  revised: '已修订',
  closed: '已结案',
};

/** bip_incident_records 行 */
export interface BipIncident {
  id: number;
  bip_id: number;
  occurred_at: string;
  location?: string | null;
  activity?: string | null;
  antecedent?: string | null;
  behavior?: string | null;
  consequence?: string | null;
  intensity: string;
  duration_minutes?: number | null;
  has_injury: number;
  intervention_used?: string | null;
  effectiveness?: number | null;
  reporter_name?: string | null;
  created_at?: string | null;
}

export const BIP_INTENSITIES = ['轻度', '中度', '重度'] as const;

export async function fetchBipList(studentId: number | string): Promise<BipPlan[]> {
  const res = await api.get<BipPlan[]>('/intervention/bip_list', { student_id: num(studentId, 0) });
  const data = unwrap(res) ?? [];
  return Array.isArray(data) ? data : [];
}

export type BipSavePayload = Partial<BipPlan> & {
  student_id: number;
  target_behavior: string;
};

export async function saveBip(payload: BipSavePayload): Promise<number> {
  const res = await api.post<{ id?: number }>('/intervention/bip_save', payload);
  const data = unwrap(res) ?? {};
  return num(data.id, 0);
}

export async function deleteBip(id: number): Promise<void> {
  const res = await api.post('/intervention/bip_delete', { id });
  unwrap(res);
}

export interface IncidentStat {
  cnt: number;
  avg_effect?: string | null;
  avg_minutes?: string | null;
  injury_count?: string | number | null;
}

export interface IncidentQueryResult {
  list: BipIncident[];
  stat: IncidentStat | null;
}

/** GET /intervention/incidents?bip_id= —— 后端返回 { list: [...], stat: {...} } */
export async function fetchIncidents(bipId: number): Promise<IncidentQueryResult> {
  const res = await api.get<{ list?: BipIncident[]; stat?: IncidentStat } | BipIncident[]>(
    '/intervention/incidents',
    { bip_id: bipId },
  );
  const data = unwrap(res);
  if (Array.isArray(data)) return { list: data, stat: null };
  const d = (data ?? {}) as { list?: BipIncident[]; stat?: IncidentStat };
  return { list: Array.isArray(d.list) ? d.list : [], stat: d.stat ?? null };
}

export type IncidentPayload = {
  bip_id: number;
  occurred_at: string; // YYYY-MM-DD HH:mm
  location?: string;
  activity?: string;
  antecedent?: string;
  behavior?: string;
  consequence?: string;
  intensity?: string;
  duration_minutes?: number;
  has_injury?: boolean;
  intervention_used?: string;
  effectiveness?: number;
};

export async function addIncident(payload: IncidentPayload): Promise<number> {
  const res = await api.post<{ id?: number }>('/intervention/incident_add', {
    ...payload,
    has_injury: payload.has_injury ? 1 : 0,
  });
  const data = unwrap(res) ?? {};
  return num(data.id, 0);
}
