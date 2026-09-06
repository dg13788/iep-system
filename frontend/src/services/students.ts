/**
 * 学生管理模块 service 层
 *
 * 契约来源：backend/api/students.php + backend/sql/init.sql
 *
 * 端点一览（basePath 由 api.ts 统一拼成 /api）：
 *   GET  /students/list          ?page&pageSize&keyword&class_id&status&disability_type_id&sort_field&sort_order
 *                                data: { list, total, page, pageSize }
 *   GET  /students/get           ?id                     data: 学生详情(含 attachments)
 *   POST /students/create        { 白名单字段 }           data: { id }
 *   POST /students/update        { id, ...白名单字段 }
 *   POST /students/delete        { id }
 *   GET  /students/classes                               data: 班级数组
 *   POST /students/class_create  { name, grade?, teacher_id?, capacity?, description? }
 *   POST /students/class_update  { id, ...可更新字段 }
 *   POST /students/class_delete  { id }
 *   GET  /students/options       ?status                 data: 学生下拉数组
 *
 * ── 重要契约差异（回测实测结论，勿改回）────────────────────────
 * 1) students 表**不存在** student_no / age / diagnosis_date / diagnosis_org /
 *    diagnosis_note / secondary_disability / special_needs / guardian2_name /
 *    guardian2_phone 字段。前端视图模型 Student 依赖这些字段，此处在适配层
 *    用「派生值」补齐，保证 UI 不出现 undefined：
 *      - student_no  → 由 id + 入学年份派生（仅用于展示）
 *      - age         → 由 birth_date 实时计算
 *      - 其余         → 空字符串
 * 2) students.status 数据库 ENUM 为 ('在读','休学','毕业','转衔')，
 *    前端原定义为「转学」，与库不一致（写入会被拒）。本文件以**数据库为准**，
 *    将 StudentStatus 修正为「转衔」。
 * 3) student_classes 表不存在 room 字段，ClassItem.room 一律返回空串。
 *
 * 适配策略：后端 snake_case + 数字 id → 前端视图模型（string id + 中文枚举），
 * 所有转换集中在 adaptStudent / adaptClass，页面组件无需关心后端字段名。
 */

import { api } from '@/api';
import type {
  ClassItem,
  DisabilityLevel,
  Gender,
  Student,
  StudentStatus,
} from '@/pages/students/data';

export type { ClassItem, Student, StudentStatus };

/* ============================================================
 * 常量（与数据库 ENUM 严格对齐）
 * ============================================================ */

/** 与 students.status ENUM('在读','休学','毕业','转衔') 一致 */
export const STUDENT_STATUSES: StudentStatus[] = ['在读', '休学', '毕业', '转衔'];

/* ============================================================
 * 后端原始数据结构
 * ============================================================ */

interface RawStudent {
  id?: number | string;
  name?: string | null;
  gender?: string | null;
  birth_date?: string | null;
  id_card?: string | null;
  status?: string | null;
  disability_type_id?: number | string | null;
  disability_type_name?: string | null;
  disability_level?: string | null;
  disability_card_no?: string | null;
  class_id?: number | string | null;
  class_name?: string | null;
  guardian_name?: string | null;
  guardian_phone?: string | null;
  guardian_relation?: string | null;
  emergency_contact?: string | null;
  emergency_phone?: string | null;
  address?: string | null;
  health_info?: string | null;
  allergy_info?: string | null;
  medication_info?: string | null;
  photo_url?: string | null;
  enrollment_date?: string | null;
  graduation_date?: string | null;
  remarks?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

interface RawClass {
  id?: number | string;
  name?: string | null;
  grade?: string | null;
  capacity?: number | string | null;
  teacher_id?: number | string | null;
  assistant_teacher_id?: number | string | null;
  teacher_name?: string | null;
  description?: string | null;
  is_active?: number | string | null;
  student_count?: number | string | null;
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

/** 由出生日期计算周岁 */
function calcAge(birthDate: string): number {
  if (!birthDate) return 0;
  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return 0;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return age < 0 ? 0 : age;
}

/**
 * 派生学号（仅用于展示）。
 * 数据库无 student_no 字段，这里用「入学年份 + 4 位序号」稳定派生，
 * 保证同一学生每次渲染得到相同值。
 */
function deriveStudentNo(id: number, enrollmentDate?: string | null): string {
  if (!id) return '';
  const year = enrollmentDate && /^\d{4}/.test(enrollmentDate)
    ? enrollmentDate.slice(0, 4)
    : String(new Date().getFullYear());
  return `XH${year}${String(id).padStart(4, '0')}`;
}

/* ============================================================
 * 适配器：后端原始行 → 前端视图模型
 * ============================================================ */

export function adaptStudent(raw: RawStudent | null | undefined): Student {
  const r = raw ?? {};
  const id = num(r.id, 0);
  const birthDate = nullableStr(r.birth_date);
  const enrollmentDate = nullableStr(r.enrollment_date);

  return {
    id: String(id),
    name: str(r.name),
    student_no: deriveStudentNo(id, enrollmentDate),
    gender: (str(r.gender, '男') as Gender),
    birth_date: birthDate,
    id_card: nullableStr(r.id_card),
    disability_type: nullableStr(r.disability_type_name),
    disability_level: (nullableStr(r.disability_level) as DisabilityLevel),
    disability_card_no: nullableStr(r.disability_card_no),
    class_id: r.class_id === null || r.class_id === undefined ? '' : String(r.class_id),
    class_name: nullableStr(r.class_name),
    guardian_name: nullableStr(r.guardian_name),
    guardian_phone: nullableStr(r.guardian_phone),
    guardian_relation: nullableStr(r.guardian_relation),
    // 数据库无监护人2 / 诊断信息字段，留空
    guardian2_name: '',
    guardian2_phone: '',
    emergency_contact: nullableStr(r.emergency_contact),
    emergency_phone: nullableStr(r.emergency_phone),
    address: nullableStr(r.address),
    health_info: nullableStr(r.health_info),
    allergy_info: nullableStr(r.allergy_info),
    medication_info: nullableStr(r.medication_info),
    enrollment_date: enrollmentDate,
    status: (str(r.status, '在读') as StudentStatus),
    remarks: nullableStr(r.remarks),
    age: calcAge(birthDate),
    diagnosis_date: '',
    diagnosis_org: '',
    diagnosis_note: '',
    secondary_disability: '',
    special_needs: '',
  };
}

export function adaptClass(raw: RawClass | null | undefined): ClassItem {
  const r = raw ?? {};
  return {
    id: String(num(r.id, 0)),
    name: str(r.name),
    grade: nullableStr(r.grade),
    teacher: nullableStr(r.teacher_name),
    capacity: num(r.capacity, 0),
    student_count: num(r.student_count, 0),
    description: nullableStr(r.description),
    status: num(r.is_active, 1) === 1 ? 'active' : 'inactive',
    // 数据库无 room 字段
    room: '',
  };
}

/* ============================================================
 * 列表查询
 * ============================================================ */

export interface StudentListParams {
  page?: number;
  pageSize?: number;
  keyword?: string;
  class_id?: number | string;
  status?: StudentStatus | '';
  disability_type_id?: number | string;
  sort_field?: 'name' | 'created_at' | 'birth_date' | 'status';
  sort_order?: 'asc' | 'desc';
}

export interface StudentListResult {
  list: Student[];
  total: number;
  page: number;
  pageSize: number;
}

export async function fetchStudents(
  params: StudentListParams = {},
): Promise<StudentListResult> {
  const query: Record<string, unknown> = {
    page: params.page ?? 1,
    pageSize: params.pageSize ?? 20,
    sort_field: params.sort_field ?? 'created_at',
    sort_order: params.sort_order ?? 'desc',
  };
  if (params.keyword) query.keyword = params.keyword;
  if (params.class_id) query.class_id = params.class_id;
  if (params.status) query.status = params.status;
  if (params.disability_type_id) query.disability_type_id = params.disability_type_id;

  const res = await api.get<{ list?: RawStudent[]; total?: number; page?: number; pageSize?: number }>(
    '/students/list',
    query,
  );
  if (!res.success) {
    throw new Error(res.message || '学生列表加载失败');
  }
  const data = res.data ?? {};
  const rows = Array.isArray(data.list) ? data.list : [];
  return {
    list: rows.map(adaptStudent),
    total: num(data.total, 0),
    page: num(data.page, query.page as number),
    pageSize: num(data.pageSize, query.pageSize as number),
  };
}

/** GET /students/get?id —— 学生详情（后端返回 s.*，已含完整字段） */
export async function fetchStudent(id: number | string): Promise<Student> {
  const res = await api.get<RawStudent>('/students/get', { id });
  if (!res.success || !res.data) {
    throw new Error(res.message || '学生详情加载失败');
  }
  return adaptStudent(res.data);
}

/* ============================================================
 * 写入操作
 * 只提交后端白名单字段，避免前端视图模型中的派生字段污染请求。
 * ============================================================ */

const WRITABLE_FIELDS = [
  'name', 'gender', 'birth_date', 'id_card', 'disability_type_id',
  'disability_level', 'disability_card_no', 'class_id', 'guardian_name',
  'guardian_phone', 'guardian_relation', 'emergency_contact',
  'emergency_phone', 'address', 'health_info', 'allergy_info',
  'medication_info', 'photo_url', 'status', 'enrollment_date',
  'graduation_date', 'remarks',
] as const;

export type StudentWritePayload = Partial<Record<(typeof WRITABLE_FIELDS)[number], unknown>>;

/**
 * 从视图模型提取可提交字段。
 * 视图模型里的 student_no / age / diagnosis_* / guardian2_* 均为前端派生或
 * 库内不存在字段，必须剔除，否则后端 SQL 会报错。
 */
export function buildStudentPayload(form: Partial<Student> | Record<string, unknown>): StudentWritePayload {
  const source = form as Record<string, unknown>;
  const payload: Record<string, unknown> = {};
  WRITABLE_FIELDS.forEach((f) => {
    const v = source[f];
    if (v === undefined || v === null) return;
    if (typeof v === 'string' && v.trim() === '') return;
    payload[f] = v;
  });
  // class_id / disability_type_id 在视图模型里是 string，后端需要数字
  if (payload.class_id !== undefined) {
    payload.class_id = num(payload.class_id, 0) || null;
  }
  if (payload.disability_type_id !== undefined) {
    payload.disability_type_id = num(payload.disability_type_id, 0) || null;
  }
  return payload as StudentWritePayload;
}

export async function createStudent(data: StudentWritePayload): Promise<{ id: number }> {
  const res = await api.post<{ id?: number | string }>('/students/create', data);
  if (!res.success || !res.data) {
    throw new Error(res.message || '创建学生失败');
  }
  return { id: num(res.data.id, 0) };
}

export async function updateStudent(
  id: number | string,
  data: StudentWritePayload,
): Promise<void> {
  const res = await api.post('/students/update', { id, ...data });
  if (!res.success) {
    throw new Error(res.message || '更新学生失败');
  }
}

export async function deleteStudent(id: number | string): Promise<void> {
  const res = await api.post('/students/delete', { id });
  if (!res.success) {
    throw new Error(res.message || '删除学生失败');
  }
}

/* ============================================================
 * 班级
 * ============================================================ */

export async function fetchClasses(): Promise<ClassItem[]> {
  const res = await api.get<RawClass[] | { list?: RawClass[] }>('/students/classes');
  if (!res.success) {
    throw new Error(res.message || '班级列表加载失败');
  }
  const rows = Array.isArray(res.data)
    ? res.data
    : Array.isArray(res.data?.list)
      ? res.data.list
      : [];
  return rows.map(adaptClass);
}

export interface ClassWritePayload {
  name: string;
  grade?: string;
  teacher_id?: number | null;
  assistant_teacher_id?: number | null;
  capacity?: number | null;
  description?: string;
}

export async function createClass(data: ClassWritePayload): Promise<{ id: number }> {
  const res = await api.post<{ id?: number | string }>('/students/class_create', data);
  if (!res.success || !res.data) {
    throw new Error(res.message || '创建班级失败');
  }
  return { id: num(res.data.id, 0) };
}

export async function updateClass(
  id: number | string,
  data: Partial<ClassWritePayload> & { is_active?: number },
): Promise<void> {
  const res = await api.post('/students/class_update', { id, ...data });
  if (!res.success) {
    throw new Error(res.message || '更新班级失败');
  }
}

export async function deleteClass(id: number | string): Promise<void> {
  const res = await api.post('/students/class_delete', { id });
  if (!res.success) {
    throw new Error(res.message || '删除班级失败');
  }
}

/* ============================================================
 * 下拉选项
 * ============================================================ */

export interface StudentOption {
  id: number;
  name: string;
  class_name?: string | null;
  gender?: string | null;
}

export async function fetchStudentOptions(status = '在读'): Promise<StudentOption[]> {
  const res = await api.get<RawStudent[]>('/students/options', { status });
  if (!res.success) return [];
  const rows = Array.isArray(res.data) ? res.data : [];
  return rows.map((r) => ({
    id: num(r?.id, 0),
    name: str(r?.name),
    class_name: r?.class_name ?? null,
    gender: r?.gender ?? null,
  }));
}
