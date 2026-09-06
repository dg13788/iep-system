/**
 * 系统管理模块 service 层
 *
 * 契约来源：backend/api/system.php、backend/api/permission_groups.php
 *
 * 端点一览（basePath 由 api.ts 统一拼成 /api）：
 *   GET  /system/users                  data: { list, total, page, pageSize }
 *   GET  /system/users/get      ?id     data: 用户详情
 *   POST /system/users/create           { username,password,real_name,phone,email,role_id,department }
 *   POST /system/users/update           { id, username,real_name,phone,email,role_id,department,is_active }
 *   POST /system/users/delete           { id } （软删 is_active=0）
 *   POST /system/users/reset_password   { id, new_password }
 *   GET  /system/roles                  data: roles[]
 *   GET  /system/audit-logs             data: { list, total, page, pageSize }
 *   GET  /system/settings               data: { code: value, ... }
 *   POST /system/settings               body: { code: value, ... }
 *   GET  /permission_groups             data: PermissionGroup[]（含 user_count）
 *   POST /permission_groups             { name,description,data_scope_type,iep_level,menu_permissions,feature_permissions,sort_order }
 *   PUT  /permission_groups?id=         { ...同上 }
 *   DELETE /permission_groups?id=       （软删）
 *
 * ── 契约差异 ─────────────────────────────────────────
 * 1) 后端 users 用 role_id / role_code / role_name / last_login_at / is_active，
 *    前端视图 SystemUser 用 role / role_code / last_login / status('正常'|'禁用')，适配层补齐。
 * 2) 后端 role_code 为 snake_case（super_admin/director/class_teacher/teacher/...），
 *    前端 ROLES 常量 code 一致，直接透传。
 * 3) 后端 audit-logs 字段为 username/user_type/ip/change_summary/created_at，
 *    前端 AuditLog 用 user_name/user_role/ip_address/description/timestamp，适配层映射。
 * 4) permission_groups 后端字段与前端 PermissionGroup 基本一致，直接映射。
 */

import { api } from '@/api';

/* ============================================================
 * 前端视图模型（与 System.tsx 保持一致）
 * ============================================================ */

export interface SystemUser {
  id: string;
  username: string;
  real_name: string;
  role: string;
  role_code: string;
  department: string;
  phone: string;
  email: string;
  last_login: string;
  status: '正常' | '禁用';
  created_at: string;
  login_count: number;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  user_name: string;
  user_role: string;
  ip_address: string;
  module: string;
  action: string;
  target: string;
  description: string;
  status: '成功' | '失败';
}

export interface PermissionGroup {
  id: number;
  name: string;
  description: string;
  data_scope_type: 'all' | 'class_only' | 'teacher_related' | 'own_only' | 'none';
  iep_level: 'none' | 'view' | 'participate' | 'full';
  menu_permissions: string[];
  feature_permissions: string[];
  sort_order: number;
  is_system: number;
  user_count: number;
}

export interface RoleDef {
  id: string;
  name: string;
  code: string;
  description: string;
  color: string;
  user_count: number;
  builtin: boolean;
}

/* ============================================================
 * 后端原始数据结构
 * ============================================================ */

interface RawUser {
  id?: number | string;
  username?: string | null;
  real_name?: string | null;
  phone?: string | null;
  email?: string | null;
  role_id?: number | string | null;
  role_name?: string | null;
  role_code?: string | null;
  department?: string | null;
  last_login_at?: string | null;
  is_active?: number | string | null;
  created_at?: string | null;
  login_count?: number | string | null;
}

interface RawAuditLog {
  id?: number | string;
  username?: string | null;
  user_type?: string | null;
  action?: string | null;
  module?: string | null;
  target_name?: string | null;
  change_summary?: string | null;
  ip?: string | null;
  alert_level?: string | null;
  created_at?: string | null;
}

interface RawPermissionGroup {
  id?: number | string;
  name?: string | null;
  description?: string | null;
  data_scope_type?: string | null;
  iep_level?: string | null;
  menu_permissions?: string[] | string | null;
  feature_permissions?: string[] | string | null;
  sort_order?: number | string | null;
  is_system?: number | string | null;
  user_count?: number | string | null;
}

interface RawRole {
  id?: number | string;
  name?: string | null;
  code?: string | null;
  description?: string | null;
  is_system?: number | string | null;
  is_active?: number | string | null;
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

function parseJsonArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === 'string' && v.trim()) {
    try {
      const parsed = JSON.parse(v);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      /* not json */
    }
    return v.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

/* ============================================================
 * 适配器
 * ============================================================ */

/* 角色 code 归一化：后端 roles 种子中超级管理员 code 为 'admin'，
 * 前端 ROLES 常量使用 'super_admin'，此处统一为前端值以匹配徽章与筛选。 */
export function normalizeRoleCode(code: string): string {
  return code === 'admin' ? 'super_admin' : code;
}

export function adaptUser(raw: RawUser | null | undefined): SystemUser {
  const r = raw ?? {};
  const roleCode = normalizeRoleCode(str(r.role_code));
  return {
    id: String(num(r.id, 0)),
    username: str(r.username),
    real_name: str(r.real_name),
    role: str(r.role_name) || roleCode,
    role_code: roleCode || 'teacher',
    department: str(r.department),
    phone: str(r.phone),
    email: str(r.email),
    last_login: str(r.last_login_at),
    status: num(r.is_active, 1) === 1 ? '正常' : '禁用',
    created_at: str(r.created_at),
    login_count: num(r.login_count, 0),
  };
}

/* 审计日志中英文映射（后端存英文 action/module，前端按中文展示） */
const ACTION_ZH: Record<string, string> = {
  create: '新增',
  update: '修改',
  delete: '删除',
  login: '登录',
  logout: '登出',
  submit: '提交',
  save_goals: '保存',
  progress: '记录',
  update_permissions: '权限变更',
  view: '查看',
  export: '导出',
};

const MODULE_ZH: Record<string, string> = {
  auth: '登录认证',
  system: '系统管理',
  permissions: '角色权限',
  iep: 'IEP管理',
  assessments: '评估管理',
  students: '学生管理',
  parents: '家校协作',
  templates: '模板管理',
  teaching: '教学记录',
};

export function adaptAuditLog(raw: RawAuditLog | null | undefined): AuditLog {
  const r = raw ?? {};
  const rawAction = str(r.action);
  const rawModule = str(r.module);
  return {
    id: String(num(r.id, 0)),
    timestamp: str(r.created_at),
    user_name: str(r.username),
    user_role: str(r.user_type) || '系统',
    ip_address: str(r.ip),
    module: MODULE_ZH[rawModule] || rawModule,
    action: ACTION_ZH[rawAction] || rawAction,
    target: str(r.target_name),
    description: str(r.change_summary),
    status: str(r.alert_level) === 'danger' ? '失败' : '成功',
  };
}

export function adaptPermissionGroup(raw: RawPermissionGroup | null | undefined): PermissionGroup {
  const r = raw ?? {};
  return {
    id: num(r.id, 0),
    name: str(r.name),
    description: str(r.description),
    data_scope_type: (['all', 'class_only', 'teacher_related', 'own_only', 'none'].includes(str(r.data_scope_type))
      ? str(r.data_scope_type)
      : 'teacher_related') as PermissionGroup['data_scope_type'],
    iep_level: (['none', 'view', 'participate', 'full'].includes(str(r.iep_level))
      ? str(r.iep_level)
      : 'none') as PermissionGroup['iep_level'],
    menu_permissions: parseJsonArray(r.menu_permissions),
    feature_permissions: parseJsonArray(r.feature_permissions),
    sort_order: num(r.sort_order, 0),
    is_system: num(r.is_system, 0),
    user_count: num(r.user_count, 0),
  };
}

export function adaptRole(raw: RawRole | null | undefined): RoleDef {
  const r = raw ?? {};
  return {
    id: String(num(r.id, 0)),
    name: str(r.name),
    code: str(r.code),
    description: str(r.description),
    color: '#977653',
    user_count: 0,
    builtin: num(r.is_system, 0) === 1,
  };
}

/* ============================================================
 * 查询
 * ============================================================ */

export interface UserListParams {
  page?: number;
  pageSize?: number;
  keyword?: string;
  role_id?: number;
}

export interface UserListResult {
  list: SystemUser[];
  total: number;
  page: number;
  pageSize: number;
}

export async function fetchUsers(params: UserListParams = {}): Promise<UserListResult> {
  const query: Record<string, unknown> = {
    page: params.page ?? 1,
    pageSize: params.pageSize ?? 100,
  };
  if (params.keyword) query.keyword = params.keyword;
  if (params.role_id) query.role_id = params.role_id;

  const res = await api.get<{ list?: RawUser[]; total?: number; page?: number; pageSize?: number }>(
    '/system/users',
    query,
  );
  if (!res.success) {
    throw new Error(res.message || '用户列表加载失败');
  }
  const data = res.data ?? {};
  const rows = Array.isArray(data.list) ? data.list : [];
  return {
    list: rows.map((r) => adaptUser(r)),
    total: num(data.total, 0),
    page: num(data.page, 1),
    pageSize: num(data.pageSize, 100),
  };
}

export async function fetchRoles(): Promise<RoleDef[]> {
  const res = await api.get<RawRole[]>('/system/roles');
  if (!res.success || !Array.isArray(res.data)) return [];
  return res.data.map((r) => adaptRole(r));
}

export interface AuditLogParams {
  page?: number;
  pageSize?: number;
  module?: string;
  action?: string;
}

export interface AuditLogResult {
  list: AuditLog[];
  total: number;
  page: number;
  pageSize: number;
}

export async function fetchAuditLogs(params: AuditLogParams = {}): Promise<AuditLogResult> {
  const query: Record<string, unknown> = {
    page: params.page ?? 1,
    pageSize: params.pageSize ?? 100,
  };
  if (params.module) query.module = params.module;
  if (params.action) query.action = params.action;

  const res = await api.get<{ list?: RawAuditLog[]; total?: number; page?: number; pageSize?: number }>(
    '/system/audit-logs',
    query,
  );
  if (!res.success) {
    throw new Error(res.message || '审计日志加载失败');
  }
  const data = res.data ?? {};
  const rows = Array.isArray(data.list) ? data.list : [];
  return {
    list: rows.map((r) => adaptAuditLog(r)),
    total: num(data.total, 0),
    page: num(data.page, 1),
    pageSize: num(data.pageSize, 100),
  };
}

export async function fetchPermissionGroups(): Promise<PermissionGroup[]> {
  const res = await api.get<RawPermissionGroup[]>('/permission_groups');
  if (!res.success || !Array.isArray(res.data)) return [];
  return res.data.map((g) => adaptPermissionGroup(g));
}

export async function fetchSystemSettings(): Promise<Record<string, string>> {
  const res = await api.get<Record<string, string>>('/system/settings');
  if (!res.success || !res.data) return {};
  return res.data;
}

/* ============================================================
 * 写入操作
 * ============================================================ */

export interface UserCreatePayload {
  username: string;
  password: string;
  real_name: string;
  phone?: string;
  email?: string;
  role_id: number;
  department?: string;
}

export interface UserUpdatePayload {
  id: number | string;
  username?: string;
  real_name?: string;
  phone?: string;
  email?: string;
  role_id?: number;
  department?: string;
  is_active?: number;
}

export async function createUser(data: UserCreatePayload): Promise<{ id: number }> {
  const res = await api.post<{ id?: number | string }>('/system/users/create', data);
  if (!res.success || !res.data) {
    throw new Error(res.message || '创建用户失败');
  }
  return { id: num(res.data.id, 0) };
}

export async function updateUser(data: UserUpdatePayload): Promise<void> {
  const res = await api.post('/system/users/update', data);
  if (!res.success) {
    throw new Error(res.message || '更新用户失败');
  }
}

export async function deleteUser(id: number | string): Promise<void> {
  const res = await api.post('/system/users/delete', { id });
  if (!res.success) {
    throw new Error(res.message || '删除用户失败');
  }
}

export async function resetUserPassword(id: number | string, newPassword: string): Promise<void> {
  const res = await api.post('/system/users/reset_password', { id, new_password: newPassword });
  if (!res.success) {
    throw new Error(res.message || '重置密码失败');
  }
}

export interface PermissionGroupPayload {
  name: string;
  description?: string;
  data_scope_type: string;
  iep_level: string;
  menu_permissions: string[];
  feature_permissions: string[];
  sort_order?: number;
}

export async function createPermissionGroup(data: PermissionGroupPayload): Promise<{ id: number }> {
  const res = await api.post<{ id?: number | string }>('/permission_groups', data);
  if (!res.success || !res.data) {
    throw new Error(res.message || '创建权限组失败');
  }
  return { id: num(res.data.id, 0) };
}

export async function updatePermissionGroup(id: number | string, data: PermissionGroupPayload): Promise<void> {
  const res = await api.put(`/permission_groups?id=${id}`, data);
  if (!res.success) {
    throw new Error(res.message || '更新权限组失败');
  }
}

export async function deletePermissionGroup(id: number | string): Promise<void> {
  const res = await api.delete(`/permission_groups?id=${id}`);
  if (!res.success) {
    throw new Error(res.message || '删除权限组失败');
  }
}

export async function saveSystemSettings(data: Record<string, unknown>): Promise<void> {
  const res = await api.post('/system/settings', data);
  if (!res.success) {
    throw new Error(res.message || '保存设置失败');
  }
}
