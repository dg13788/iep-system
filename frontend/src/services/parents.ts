/**
 * 家长管理模块 service 层
 *
 * 契约来源：backend/api/parents.php
 *
 * 端点一览：
 *   GET  /parents/list                  ?page&pageSize&keyword   data: { list, total, page, pageSize }
 *   GET  /parents/get                   ?id                      data: 家长详情 + students[]
 *   POST /parents/create                { name, phone, relation?, email?, address? }
 *   POST /parents/update                { id, ...updatable }
 *   POST /parents/delete                { id }
 *   GET  /parents/students              ?parent_id
 *   POST /parents/link_student          { parent_id, student_id, relation? }
 *   POST /parents/unlink_student        { parent_id, student_id }
 *   GET  /parents/communications        ?page&pageSize&student_id&parent_id
 *   POST /parents/communications/create { student_id, content, ... }
 *   GET  /parents/signatures            ?parent_id&plan_id
 */

import { api } from '@/api';

/* ============================================================
 * 前端视图模型（与 Parents.tsx 保持一致）
 * ============================================================ */

export interface ParentAccount {
  id: string;
  name: string;
  phone: string;
  email: string;
  relation: string;
  student_names: string[];
  student_ids: string[];
  login_count: number;
  last_login: string;
  status: '正常' | '未激活' | '已禁用';
  address: string;
  created_at: string;
  remark: string;
}

export interface CommunicationRecord {
  id: string;
  date: string;
  student_name: string;
  parent_name: string;
  teacher_name: string;
  comm_type: '面谈' | '电话' | '微信' | '家访' | '其他';
  subject: string;
  content: string;
  follow_up: string;
  teacher_feedback: string;
}

export interface SignatureRecord {
  id: string;
  student_name: string;
  iep_title: string;
  iep_period: string;
  iep_status: string;
  signature_status: '待签名' | '已签名' | '已过期';
  signed_date: string | null;
  send_count: number;
  last_sent: string;
  parent_name: string;
}

/* ============================================================
 * 后端原始数据结构
 * ============================================================ */

interface RawParent {
  id?: number | string;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  relation?: string | null;
  is_active?: number | string | null;
  last_login_at?: string | null;
  address?: string | null;
  created_at?: string | null;
}

interface RawCommunication {
  id?: number | string;
  student_id?: number | string;
  student_name?: string | null;
  teacher_id?: number | string;
  teacher_name?: string | null;
  parent_id?: number | string | null;
  parent_name?: string | null;
  communication_type?: string | null;
  content?: string | null;
  teacher_feedback?: string | null;
  parent_feedback?: string | null;
  follow_up?: string | null;
  is_confidential?: number | string | null;
  communication_date?: string | null;
  created_at?: string | null;
}

interface RawSignature {
  id?: number | string;
  iep_plan_id?: number | string | null;
  plan_title?: string | null;
  parent_id?: number | string;
  parent_name?: string | null;
  signature_type?: string | null;
  is_revoked?: number | string | null;
  signed_at?: string | null;
  created_at?: string | null;
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

/* ============================================================
 * 适配器
 * ============================================================ */

export function adaptParent(raw: RawParent | null | undefined): ParentAccount {
  const r = raw ?? {};
  const active = r.is_active;
  let status: ParentAccount['status'] = '正常';
  if (active === 0 || active === '0') {
    status = '已禁用';
  } else if (!r.last_login_at) {
    status = '未激活';
  }
  return {
    id: String(num(r.id, 0)),
    name: str(r.name),
    phone: str(r.phone),
    email: nullableStr(r.email),
    relation: str(r.relation),
    student_names: [],
    student_ids: [],
    login_count: 0,
    last_login: nullableStr(r.last_login_at),
    status,
    address: nullableStr(r.address),
    created_at: str(r.created_at),
    remark: '',
  };
}

export function adaptCommunication(raw: RawCommunication | null | undefined): CommunicationRecord {
  const r = raw ?? {};
  const type = str(r.communication_type, '电话');
  const types = new Set(['面谈', '电话', '微信', '家访', '其他']);
  return {
    id: String(num(r.id, 0)),
    date: str(r.communication_date || r.created_at),
    student_name: str(r.student_name, '未命名学生'),
    parent_name: str(r.parent_name, ''),
    teacher_name: str(r.teacher_name, ''),
    comm_type: (types.has(type) ? type : '其他') as CommunicationRecord['comm_type'],
    subject: str(r.content, '').slice(0, 30),
    content: nullableStr(r.content),
    follow_up: nullableStr(r.follow_up),
    teacher_feedback: nullableStr(r.teacher_feedback),
  };
}

export function adaptSignature(raw: RawSignature | null | undefined): SignatureRecord {
  const r = raw ?? {};
  const signed = nullableStr(r.signed_at);
  return {
    id: String(num(r.id, 0)),
    student_name: '',
    iep_title: str(r.plan_title),
    iep_period: '',
    iep_status: '',
    signature_status: signed ? '已签名' : '待签名',
    signed_date: signed || null,
    send_count: 0,
    last_sent: str(r.created_at),
    parent_name: str(r.parent_name, ''),
  };
}

/* ============================================================
 * 查询
 * ============================================================ */

export async function fetchParents(
  params: { page?: number; pageSize?: number; keyword?: string } = {},
): Promise<{ list: ParentAccount[]; total: number }> {
  const query: Record<string, unknown> = {
    page: params.page ?? 1,
    pageSize: params.pageSize ?? 100,
  };
  if (params.keyword) query.keyword = params.keyword;

  const res = await api.get<{ list?: RawParent[]; total?: number }>('/parents/list', query);
  if (!res.success) {
    throw new Error(res.message || '家长列表加载失败');
  }
  const data = res.data ?? {};
  const rows = Array.isArray(data.list) ? data.list : [];
  return {
    list: rows.map((r) => adaptParent(r)),
    total: num(data.total, 0),
  };
}

export async function fetchCommunications(
  params: { page?: number; pageSize?: number; student_id?: number } = {},
): Promise<{ list: CommunicationRecord[]; total: number }> {
  const query: Record<string, unknown> = {
    page: params.page ?? 1,
    pageSize: params.pageSize ?? 100,
  };
  if (params.student_id) query.student_id = params.student_id;

  const res = await api.get<{ list?: RawCommunication[]; total?: number }>('/parents/communications', query);
  if (!res.success) {
    throw new Error(res.message || '沟通记录加载失败');
  }
  const data = res.data ?? {};
  const rows = Array.isArray(data.list) ? data.list : [];
  return {
    list: rows.map((r) => adaptCommunication(r)),
    total: num(data.total, 0),
  };
}

export async function fetchSignatures(
  params: { parent_id?: number; plan_id?: number } = {},
): Promise<SignatureRecord[]> {
  const query: Record<string, unknown> = {};
  if (params.parent_id) query.parent_id = params.parent_id;
  if (params.plan_id) query.plan_id = params.plan_id;

  const res = await api.get<RawSignature[]>('/parents/signatures', query);
  if (!res.success || !Array.isArray(res.data)) return [];
  return res.data.map((r) => adaptSignature(r));
}

/* ============================================================
 * 写入操作
 * ============================================================ */

export async function createParent(data: {
  name: string;
  phone: string;
  relation?: string;
  email?: string;
  address?: string;
}): Promise<{ id: number }> {
  const res = await api.post<{ id?: number | string }>('/parents/create', data);
  if (!res.success || !res.data) {
    throw new Error(res.message || '创建家长失败');
  }
  return { id: num(res.data.id, 0) };
}

export async function updateParent(
  id: number | string,
  data: Partial<{ name: string; phone: string; relation: string; email: string; address: string; is_active: number }>,
): Promise<void> {
  const res = await api.post('/parents/update', { id, ...data });
  if (!res.success) {
    throw new Error(res.message || '更新家长失败');
  }
}

export async function deleteParent(id: number | string): Promise<void> {
  const res = await api.post('/parents/delete', { id });
  if (!res.success) {
    throw new Error(res.message || '删除家长失败');
  }
}

export async function createCommunication(data: {
  student_id: number;
  content: string;
  parent_id?: number;
  communication_type?: string;
  teacher_feedback?: string;
  parent_feedback?: string;
  follow_up?: string;
  is_confidential?: number;
  communication_date?: string;
}): Promise<{ id: number }> {
  const res = await api.post<{ id?: number | string }>('/parents/communications/create', data);
  if (!res.success || !res.data) {
    throw new Error(res.message || '创建沟通记录失败');
  }
  return { id: num(res.data.id, 0) };
}
