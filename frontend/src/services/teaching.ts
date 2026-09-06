/**
 * 教学记录模块 service 层
 *
 * 契约来源：backend/api/teaching.php
 *
 * 端点一览：
 *   GET  /teaching/list        data: { list, total, page, pageSize }
 *   GET  /teaching/get  ?id
 *   POST /teaching/create      { student_id, record_date, ... }（teacher_id 取当前用户）
 *   POST /teaching/update      { id, ... }
 *   POST /teaching/delete      { id }（逻辑删除）
 *   GET  /teaching/student_options   data: [{ id, name, gender, class_name }]
 */

import { api } from '@/api';

/* ============================================================
 * 前端视图模型（与 Teaching.tsx 保持一致）
 * ============================================================ */

export interface TeachingRecord {
  id: string;
  date: string;
  student_id: string;
  student_name: string;
  iep_goal: string;
  teacher: string;
  session_type: '个训' | '小组' | '集体' | '生活实践';
  subject: string;
  teaching_content: string;
  teaching_method: string;
  student_performance: string;
  difficulties: string;
  adjustments: string;
  materials_used: string;
  homework: string;
  next_plan: string;
  effectiveness_score: number;
  duration_minutes: number;
  is_key_record: boolean;
}

export interface StudentOption {
  id: string;
  name: string;
  gender: string;
  class_name: string;
}

/* ============================================================
 * 后端原始数据结构
 * ============================================================ */

interface RawTeachingRecord {
  id?: number | string;
  student_id?: number | string;
  student_name?: string | null;
  teacher_id?: number | string;
  teacher_name?: string | null;
  record_date?: string | null;
  session_type?: string | null;
  subject?: string | null;
  teaching_content?: string | null;
  teaching_method?: string | null;
  student_performance?: string | null;
  difficulties?: string | null;
  adjustments?: string | null;
  materials_used?: string | null;
  homework?: string | null;
  next_plan?: string | null;
  effectiveness_score?: number | string | null;
  duration_minutes?: number | string | null;
  is_key_record?: number | string | null;
  iep_goal_id?: number | string | null;
  iep_goal_title?: string | null;
  created_at?: string | null;
}

interface RawStudentOption {
  id?: number | string;
  name?: string | null;
  gender?: string | null;
  class_name?: string | null;
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

function bool(v: unknown): boolean {
  if (v === true || v === 1 || v === '1') return true;
  if (v === false || v === 0 || v === '0') return false;
  return Boolean(v);
}

function nullableStr(v: unknown): string {
  return v === null || v === undefined ? '' : String(v);
}

function normalizeStudentId(sid: string): string {
  return sid.replace(/[^0-9]/g, '');
}

/* ============================================================
 * 适配器
 * ============================================================ */

const SESSION_TYPE_SET = new Set(['个训', '小组', '集体', '生活实践']);

export function adaptTeachingRecord(raw: RawTeachingRecord | null | undefined): TeachingRecord {
  const r = raw ?? {};
  const session = str(r.session_type, '个训');
  return {
    id: String(num(r.id, 0)),
    date: str(r.record_date),
    student_id: String(num(r.student_id, 0)),
    student_name: str(r.student_name, '未命名学生'),
    iep_goal: nullableStr(r.iep_goal_title),
    teacher: str(r.teacher_name, ''),
    session_type: (SESSION_TYPE_SET.has(session) ? session : '个训') as TeachingRecord['session_type'],
    subject: str(r.subject),
    teaching_content: nullableStr(r.teaching_content),
    teaching_method: nullableStr(r.teaching_method),
    student_performance: nullableStr(r.student_performance),
    difficulties: nullableStr(r.difficulties),
    adjustments: nullableStr(r.adjustments),
    materials_used: nullableStr(r.materials_used),
    homework: nullableStr(r.homework),
    next_plan: nullableStr(r.next_plan),
    effectiveness_score: num(r.effectiveness_score, 3),
    duration_minutes: num(r.duration_minutes, 30),
    is_key_record: bool(r.is_key_record),
  };
}

export function adaptStudentOption(raw: RawStudentOption | null | undefined): StudentOption {
  const r = raw ?? {};
  return {
    id: String(num(r.id, 0)),
    name: str(r.name, '未命名学生'),
    gender: str(r.gender),
    class_name: str(r.class_name),
  };
}

/* ============================================================
 * 查询
 * ============================================================ */

export interface TeachingListParams {
  page?: number;
  pageSize?: number;
  student_id?: number;
  teacher_id?: number;
  record_date?: string;
  is_key_record?: number;
}

export interface TeachingListResult {
  list: TeachingRecord[];
  total: number;
  page: number;
  pageSize: number;
}

export async function fetchTeachingRecords(
  params: TeachingListParams = {},
): Promise<TeachingListResult> {
  const query: Record<string, unknown> = {
    page: params.page ?? 1,
    pageSize: params.pageSize ?? 100,
  };
  if (params.student_id) query.student_id = params.student_id;
  if (params.teacher_id) query.teacher_id = params.teacher_id;
  if (params.record_date) query.record_date = params.record_date;
  if (params.is_key_record !== undefined) query.is_key_record = params.is_key_record;

  const res = await api.get<{ list?: RawTeachingRecord[]; total?: number; page?: number; pageSize?: number }>(
    '/teaching/list',
    query,
  );
  if (!res.success) {
    throw new Error(res.message || '教学记录加载失败');
  }
  const data = res.data ?? {};
  const rows = Array.isArray(data.list) ? data.list : [];
  return {
    list: rows.map((r) => adaptTeachingRecord(r)),
    total: num(data.total, 0),
    page: num(data.page, 1),
    pageSize: num(data.pageSize, 100),
  };
}

export async function fetchTeachingRecord(id: number | string): Promise<TeachingRecord> {
  const res = await api.get<RawTeachingRecord>('/teaching/get', { id });
  if (!res.success || !res.data) {
    throw new Error(res.message || '教学记录加载失败');
  }
  return adaptTeachingRecord(res.data);
}

export async function fetchStudentOptions(): Promise<StudentOption[]> {
  const res = await api.get<RawStudentOption[]>('/teaching/student_options');
  if (!res.success || !Array.isArray(res.data)) return [];
  return res.data.map((r) => adaptStudentOption(r));
}

/* ============================================================
 * 写入操作
 * ============================================================ */

export interface TeachingWritePayload {
  student_id: number;
  record_date: string;
  session_type?: string;
  subject?: string;
  teaching_content?: string;
  teaching_method?: string;
  student_performance?: string;
  difficulties?: string;
  adjustments?: string;
  materials_used?: string;
  homework?: string;
  next_plan?: string;
  effectiveness_score?: number;
  duration_minutes?: number;
  is_key_record?: boolean;
  iep_goal_id?: number;
}

export async function createTeachingRecord(data: TeachingWritePayload): Promise<{ id: number }> {
  const res = await api.post<{ id?: number | string }>('/teaching/create', data);
  if (!res.success || !res.data) {
    throw new Error(res.message || '创建教学记录失败');
  }
  return { id: num(res.data.id, 0) };
}

export async function updateTeachingRecord(
  id: number | string,
  data: Partial<TeachingWritePayload>,
): Promise<void> {
  const res = await api.post('/teaching/update', { id, ...data });
  if (!res.success) {
    throw new Error(res.message || '更新教学记录失败');
  }
}

export async function deleteTeachingRecord(id: number | string): Promise<void> {
  const res = await api.post('/teaching/delete', { id });
  if (!res.success) {
    throw new Error(res.message || '删除教学记录失败');
  }
}
