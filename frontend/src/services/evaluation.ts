/**
 * 评估记录模块 service 层
 *
 * 契约来源：backend/api/assessments.php
 *
 * 端点一览：
 *   GET  /assessments/list          ?page&pageSize&student_id&assessment_type&status
 *                                  data: { list, total, page, pageSize }
 *   GET  /assessments/get           ?id                     data: 详情 + items[]
 *   POST /assessments/create        { student_id, assessment_type, date, total_score,
 *                                     max_score, summary, recommendations, template_id, items[] }
 *                                   （assessor_id 取当前用户）
 *   POST /assessments/update        { id, assessment_type/date/total_score/max_score/summary/recommendations/status }
 *   POST /assessments/delete        { id }（软删除）
 *   GET  /assessments/templates      data: 模板数组（含 category/description/is_system）
 *   GET  /assessments/template_items ?template_id   data: [{ dimension, item_name, item_description, max_score, sort_order }]
 *   GET  /assessments/recommend_goals ?student_id   data: 按 dimension 分组的推荐目标
 */

import { api } from '@/api';

/* ============================================================
 * 前端视图模型（与 Evaluation.tsx 保持一致）
 * ============================================================ */

export interface EvaluationRecord {
  id: string;
  studentId: string;
  studentName: string;
  studentNo: string;
  className: string;
  templateId: string;
  templateName: string;
  assessmentType: string;
  assessmentDate: string;
  assessor: string;
  totalScore: number;
  maxScore: number;
  status: 'completed' | 'in_progress' | 'draft';
  scores: Record<string, Record<string, number>>;
  notes: Record<string, Record<string, string>>;
  recommendations?: string;
}

export interface AssessmentTemplate {
  id: string;
  name: string;
  category: string;
  icon: string;
  color: string;
  description: string;
  dimensions: Dimension[];
}

export interface Dimension {
  id: string;
  name: string;
  items: AssessmentItem[];
}

export interface AssessmentItem {
  id: string;
  name: string;
  description: string;
  maxScore: number;
  score?: number;
  note?: string;
}

/* ============================================================
 * 后端原始数据结构
 * ============================================================ */

interface RawAssessment {
  id?: number | string;
  student_id?: number | string;
  student_name?: string | null;
  assessor_id?: number | string;
  assessor_name?: string | null;
  assessment_date?: string | null;
  assessment_type?: string | null;
  total_score?: number | string | null;
  max_score?: number | string | null;
  score_percentage?: number | string | null;
  status?: string | null;
  summary?: string | null;
  recommendations?: string | null;
  template_id?: number | string | null;
  created_at?: string | null;
}

interface RawTemplate {
  id?: number | string;
  name?: string | null;
  category?: string | null;
  description?: string | null;
  target_disability_types?: string | null;
  applicable_age_min?: number | string | null;
  applicable_age_max?: number | string | null;
  is_system?: number | string | null;
  is_active?: number | string | null;
  created_by?: number | string | null;
  created_at?: string | null;
}

interface RawTemplateItem {
  id?: number | string;
  dimension?: string | null;
  item_name?: string | null;
  item_description?: string | null;
  max_score?: number | string | null;
  sort_order?: number | string | null;
}

interface RawAssessmentItem {
  id?: number | string;
  dimension?: string | null;
  item_name?: string | null;
  item_description?: string | null;
  score?: number | string | null;
  max_score?: number | string | null;
  score_level?: string | null;
  notes?: string | null;
  sort_order?: number | string | null;
}

/* ============================================================
 * 工具函数
 * ============================================================ */

function str(v: unknown, fallback = ''): string {
  if (v === null || v === undefined) return fallback;
  const s = String(v).trim();
  return s === '' ? fallback : s;
}

function num(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) ? n : fallback;
}

function nullableStr(v: unknown): string {
  return v === null || v === undefined ? '' : String(v);
}

const STATUS_SET = new Set(['completed', 'in_progress', 'draft']);

/* ============================================================
 * 适配器
 * ============================================================ */

export function adaptEvaluation(raw: RawAssessment | null | undefined): EvaluationRecord {
  const r = raw ?? {};
  const status = str(r.status, 'completed');
  return {
    id: String(num(r.id, 0)),
    studentId: String(num(r.student_id, 0)),
    studentName: str(r.student_name, '未命名学生'),
    studentNo: '',
    className: '',
    templateId: '',
    templateName: str(r.assessment_type),
    assessmentType: str(r.assessment_type),
    assessmentDate: str(r.assessment_date),
    assessor: str(r.assessor_name, ''),
    totalScore: num(r.total_score, 0),
    maxScore: num(r.max_score, 0),
    status: (STATUS_SET.has(status) ? status : 'completed') as EvaluationRecord['status'],
    scores: {},
    notes: {},
    recommendations: nullableStr(r.recommendations),
  };
}

export function adaptTemplate(raw: RawTemplate | null | undefined): AssessmentTemplate {
  const r = raw ?? {};
  return {
    id: String(num(r.id, 0)),
    name: str(r.name, '未命名模板'),
    category: str(r.category),
    icon: 'brain',
    color: '#977653',
    description: nullableStr(r.description),
    dimensions: [],
  };
}

/** 将后端模板条目按 dimension 分组聚合为前端 Dimension[] */
export function aggregateItemsToDimensions(
  items: RawTemplateItem[],
  templateId: string,
): Dimension[] {
  const dimMap = new Map<string, AssessmentItem[]>();
  const dimOrder: string[] = [];
  items.forEach((it, idx) => {
    const dimName = str(it.dimension, '其他维度');
    if (!dimMap.has(dimName)) {
      dimMap.set(dimName, []);
      dimOrder.push(dimName);
    }
    dimMap.get(dimName)!.push({
      id: `${templateId}-d${idx}`,
      name: str(it.item_name),
      description: nullableStr(it.item_description),
      maxScore: num(it.max_score, 5),
    });
  });
  return dimOrder.map((d) => ({
    id: `${templateId}-${d}`,
    name: d,
    items: dimMap.get(d) ?? [],
  }));
}

/* ============================================================
 * 查询
 * ============================================================ */

export interface AssessmentListParams {
  page?: number;
  pageSize?: number;
  student_id?: number;
  assessment_type?: string;
  status?: string;
}

export interface AssessmentListResult {
  list: EvaluationRecord[];
  total: number;
  page: number;
  pageSize: number;
}

export async function fetchAssessments(
  params: AssessmentListParams = {},
): Promise<AssessmentListResult> {
  const query: Record<string, unknown> = {
    page: params.page ?? 1,
    pageSize: params.pageSize ?? 100,
  };
  if (params.student_id) query.student_id = params.student_id;
  if (params.assessment_type) query.assessment_type = params.assessment_type;
  if (params.status) query.status = params.status;

  const res = await api.get<{ list?: RawAssessment[]; total?: number; page?: number; pageSize?: number }>(
    '/assessments/list',
    query,
  );
  if (!res.success) {
    throw new Error(res.message || '评估列表加载失败');
  }
  const data = res.data ?? {};
  const rows = Array.isArray(data.list) ? data.list : [];
  return {
    list: rows.map((r) => adaptEvaluation(r)),
    total: num(data.total, 0),
    page: num(data.page, 1),
    pageSize: num(data.pageSize, 100),
  };
}

export async function fetchAssessment(id: number | string): Promise<EvaluationRecord> {
  const res = await api.get<RawAssessment & { items?: RawAssessmentItem[] }>('/assessments/get', { id });
  if (!res.success || !res.data) {
    throw new Error(res.message || '评估详情加载失败');
  }
  return adaptEvaluation(res.data);
}

/* ============================================================
 * 模板
 * ============================================================ */

export async function fetchAssessmentTemplates(): Promise<AssessmentTemplate[]> {
  const res = await api.get<RawTemplate[]>('/assessments/templates');
  if (!res.success || !Array.isArray(res.data)) return [];
  return res.data.map((r) => adaptTemplate(r));
}

export async function fetchTemplateItems(templateId: number | string): Promise<Dimension[]> {
  const res = await api.get<RawTemplateItem[]>('/assessments/template_items', { template_id: templateId });
  if (!res.success || !Array.isArray(res.data)) return [];
  return aggregateItemsToDimensions(res.data, String(templateId));
}

/* ============================================================
 * 写入操作
 * ============================================================ */

export interface AssessmentItemPayload {
  dimension: string;
  item_name: string;
  item_description?: string;
  score?: number;
  max_score?: number;
  notes?: string;
}

export interface AssessmentWritePayload {
  student_id: number;
  assessment_type: string;
  date?: string;
  total_score?: number;
  max_score?: number;
  summary?: string;
  recommendations?: string;
  template_id?: number;
  items?: AssessmentItemPayload[];
}

export async function createAssessment(data: AssessmentWritePayload): Promise<{ id: number }> {
  const res = await api.post<{ id?: number | string }>('/assessments/create', data);
  if (!res.success || !res.data) {
    throw new Error(res.message || '创建评估失败');
  }
  return { id: num(res.data.id, 0) };
}

export async function updateAssessment(
  id: number | string,
  data: Partial<AssessmentWritePayload> & { status?: string },
): Promise<void> {
  const res = await api.post('/assessments/update', { id, ...data });
  if (!res.success) {
    throw new Error(res.message || '更新评估失败');
  }
}

export async function deleteAssessment(id: number | string): Promise<void> {
  const res = await api.post('/assessments/delete', { id });
  if (!res.success) {
    throw new Error(res.message || '删除评估失败');
  }
}
