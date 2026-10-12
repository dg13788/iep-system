/**
 * 系统管理员控制台 service 层（2026-09-20 新增）
 *
 * 契约来源：backend/api/admin.php
 * 权限：全部端点仅 permission_group_id = 1（超级管理员）可用，其余一律 403。
 *
 * 端点一览（basePath 由 api.ts 统一拼成 /api）：
 *   GET  /admin/overview                       data: { tables, table_counts, table_labels, db_size_mb,
 *                                                      backup_count, backup_size_mb, last_backup, metrics, env }
 *   GET  /admin/tables                         data: [{ table, label, count }]
 *   GET  /admin/all_data ?table=&page=&pageSize=&with_deleted=
 *                                              data: { list, columns, total, page, pageSize, label }
 *   GET  /admin/all_data_export ?table=        直接下载 CSV（非 JSON，用 fetch + blob）
 *   GET  /admin/backup/list                    data: { list: [{ file, size_mb, created_at }], dir }
 *   POST /admin/backup/create                  data: { file, size_mb, rows, tables }
 *   GET  /admin/backup/download ?file=         直接下载 .sql
 *   POST /admin/backup/delete      { file }
 *   POST /admin/backup/restore     { file, password, confirm }   confirm 必须等于文件名
 *   POST /admin/init               { mode: 'reset'|'demo', password, confirm }  confirm 必须为「系统初始化」
 *
 * v15 数据导入（复用各业务模块既有 import/export 端点，不新开admin端点）：
 *   GET  /<module>/export?template=1           下载导入模板（仅表头 CSV，列名与后端列映射同源）
 *   POST /<module>/import   multipart(file, dry_run)
 *        dry_run=1 → 预检报告 { would_insert, would_skip, errors }，不落库；
 *        缺省      → 真实导入 { inserted, failed, total, errors }
 *   module ∈ students | iep | assessments | parents | teaching
 *   （权限码 student_import/iep_import/eval_import/parent_import/record_import，
 *     v15 已登记进 permissions 表但不授予任何权限组——仅超管可用，见 ADR-030 精神）
 *
 * 注意：不可逆操作（初始化 / 恢复）要求「登录密码 + 确认短语」，
 *      后端会在执行前强制再落一份备份；失败即中止，不留半截状态。
 *      v15 起确认短语与界面字面严格一致（「系统初始化」= 页签名），
 *      前端对不匹配的输入实时提示差异，不再静默禁用按钮。
 */

import { api, getToken } from '@/api';

/* ============================================================
 * 类型
 * ============================================================ */

export interface AdminTableInfo {
  TABLE_NAME: string;
  TABLE_ROWS: number | null;
  size_mb: number | null;
  TABLE_COMMENT?: string | null;
}

export interface AdminOverview {
  tables: AdminTableInfo[];
  table_counts: Record<string, number | null>;
  table_labels: Record<string, string>;
  db_size_mb: number;
  backup_count: number;
  backup_size_mb: number;
  last_backup: string | null;
  last_backup_at: string | null;
  metrics: {
    student_count?: number | string | null;
    class_count?: number | string | null;
    iep_count?: number | string | null;
    user_count?: number | string | null;
    audit_count?: number | string | null;
    last_audit_at?: string | null;
  };
  env: {
    php_version: string;
    db_version: string;
    db_name: string;
    server_time: string;
    backup_dir: string;
    backup_dir_writable: boolean;
  };
}

export interface AdminTableOption {
  table: string;
  label: string;
  count: number | null;
}

export interface AdminAllData {
  list: Record<string, unknown>[];
  columns: string[];
  total: number;
  page: number;
  pageSize: number;
  label: string;
}

export interface AdminBackupFile {
  file: string;
  size_mb: number;
  created_at: string;
}

export interface AdminBackupCreateResult {
  file: string;
  size_mb: number;
  rows: number;
  tables: number;
}

/* ============================================================
 * v15 数据导入
 * ============================================================ */

/** 可导入模块（与后端 io_import_modules() 同序同键） */
export const IMPORT_MODULES = [
  { module: 'students', label: '学生档案', hint: '姓名必填；班级/障碍类型按系统中已有名称填写' },
  { module: 'iep', label: 'IEP 计划', hint: '学生姓名与计划标题必填；学生须已存在' },
  { module: 'assessments', label: '评估记录', hint: '学生姓名与评估类型必填（类型可用：初期/中期/末期/年度评估）' },
  { module: 'parents', label: '家长账号', hint: '姓名与手机号必填；初始密码为手机号后 6 位' },
  { module: 'teaching', label: '教学记录', hint: '学生姓名与记录日期必填' },
] as const;

export type ImportModule = (typeof IMPORT_MODULES)[number]['module'];

/** 预检报告（dry_run=1）：不落库 */
export interface ImportPrecheckResult {
  dry_run: true;
  module: string;
  would_insert: number;
  would_skip: number;
  errors: string[];
}

/** 真实导入结果 */
export interface ImportExecuteResult {
  inserted: number;
  failed: number;
  total: number;
  errors: string[];
}

/* ============================================================
 * 接口
 * ============================================================ */

/** 数据总览 */
export async function fetchAdminOverview(): Promise<AdminOverview> {
  const res = await api.get<AdminOverview>('/admin/overview');
  if (!res.success) throw new Error(res.message || '获取总览失败');
  return (res.data ?? {}) as AdminOverview;
}

/** 可查阅表清单（白名单） */
export async function fetchAdminTables(): Promise<AdminTableOption[]> {
  const res = await api.get<AdminTableOption[]>('/admin/tables');
  if (!res.success) throw new Error(res.message || '获取表清单失败');
  return Array.isArray(res.data) ? res.data : [];
}

/** 全量数据只读查阅 */
export async function fetchAdminAllData(params: {
  table: string;
  page?: number;
  pageSize?: number;
  with_deleted?: 0 | 1;
}): Promise<AdminAllData> {
  const res = await api.get<AdminAllData>('/admin/all_data', {
    table: params.table,
    page: params.page ?? 1,
    pageSize: params.pageSize ?? 20,
    with_deleted: params.with_deleted ?? 0,
  });
  if (!res.success) throw new Error(res.message || '查询失败');
  return (res.data ?? { list: [], columns: [], total: 0, page: 1, pageSize: 20, label: '' }) as AdminAllData;
}

/** 备份清单 */
export async function fetchAdminBackups(): Promise<AdminBackupFile[]> {
  const res = await api.get<{ list?: AdminBackupFile[] }>('/admin/backup/list');
  if (!res.success) throw new Error(res.message || '获取备份清单失败');
  return (res.data?.list ?? []) as AdminBackupFile[];
}

/** 一键备份 */
export async function createAdminBackup(): Promise<AdminBackupCreateResult> {
  const res = await api.post<AdminBackupCreateResult>('/admin/backup/create', {});
  if (!res.success) throw new Error(res.message || '备份失败');
  return res.data as AdminBackupCreateResult;
}

/** 删除备份 */
export async function deleteAdminBackup(file: string): Promise<void> {
  const res = await api.post('/admin/backup/delete', { file });
  if (!res.success) throw new Error(res.message || '删除失败');
}

/** 恢复备份（需密码 + 确认短语=文件名） */
export async function restoreAdminBackup(payload: {
  file: string;
  password: string;
  confirm: string;
}): Promise<{ restored_from: string; pre_backup: string }> {
  const res = await api.post<{ restored_from: string; pre_backup: string }>('/admin/backup/restore', payload);
  if (!res.success) throw new Error(res.message || '恢复失败');
  return res.data as { restored_from: string; pre_backup: string };
}

/** 系统初始化（需密码 + 确认短语=「系统初始化」，与页签名一致） */
export async function initSystem(payload: {
  mode: 'reset' | 'demo';
  password: string;
  confirm: string;
}): Promise<{ mode: string; backup: string; cleared: number; seeded: number }> {
  const res = await api.post<{ mode: string; backup: string; cleared: number; seeded: number }>(
    '/admin/init',
    payload,
  );
  if (!res.success) throw new Error(res.message || '初始化失败');
  return res.data as { mode: string; backup: string; cleared: number; seeded: number };
}

/* ============================================================
 * v15 数据导入（模板下载 + 预检 + 执行）
 * ============================================================ */

/** 下载导入模板（仅表头 CSV，列名以后端 io_import_column_map 为唯一口径） */
export async function downloadImportTemplate(module: ImportModule): Promise<void> {
  const res = await fetch(`/api/${module}/export?template=1`, { headers: authHeaders() });
  if (!res.ok) throw new Error('模板下载失败（HTTP ' + res.status + '）');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `iep_${module}_导入模板.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * 拉取模板表头（用于界面内联展示列格式）。
 * 不走下载，直接取文本解析第一行——列名仍然来自后端模板，保持同源。
 */
export async function fetchImportTemplateColumns(module: ImportModule): Promise<string[]> {
  const res = await fetch(`/api/${module}/export?template=1`, { headers: authHeaders() });
  if (!res.ok) throw new Error('模板获取失败（HTTP ' + res.status + '）');
  const text = await res.text();
  const firstLine = text.replace(/^﻿/, '').split(/\r?\n/)[0] ?? '';
  return firstLine.split(',').map((c) => c.trim()).filter(Boolean);
}

/** 预检或执行导入。dryRun=true 只出报告不落库 */
export async function importModuleData(
  module: ImportModule,
  file: File,
  dryRun: boolean,
): Promise<ImportPrecheckResult | ImportExecuteResult> {
  const form = new FormData();
  form.append('file', file);
  if (dryRun) form.append('dry_run', '1');
  const res = await fetch(`/api/${module}/import`, {
    method: 'POST',
    headers: authHeaders(),
    body: form,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json || !json.success) {
    throw new Error((json && json.message) || '导入失败（HTTP ' + res.status + '）');
  }
  return json.data as ImportPrecheckResult | ImportExecuteResult;
}

/** 判别导入响应是「预检报告」还是「真实导入结果」（dry_run 字段为判别式） */
export function isPrecheckResult(
  r: ImportPrecheckResult | ImportExecuteResult,
): r is ImportPrecheckResult {
  return 'dry_run' in r && r.dry_run === true;
}

/* ============================================================
 * 文件下载（不走 JSON 通道，直接拿 blob）
 * ============================================================ */

function authHeaders(): Record<string, string> {
  // 复用 api.ts 的令牌存取（localStorage 键 'iep-token'），避免两处实现漂移
  const token = getToken();
  return token ? { Authorization: 'Bearer ' + token } : {};
}

/** 下载全量数据 CSV */
export async function downloadAdminTableCsv(table: string): Promise<void> {
  const res = await fetch(`/api/admin/all_data_export?table=${encodeURIComponent(table)}`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('导出失败（HTTP ' + res.status + '）');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `iep_${table}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** 下载备份文件 */
export async function downloadAdminBackup(file: string): Promise<void> {
  const res = await fetch(`/api/admin/backup/download?file=${encodeURIComponent(file)}`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('下载失败（HTTP ' + res.status + '）');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = file;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
