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
 *   POST /admin/init               { mode: 'reset'|'demo', password, confirm }  confirm 必须为「初始化系统」
 *
 * 注意：不可逆操作（初始化 / 恢复）要求「登录密码 + 确认短语」，
 *      后端会在执行前强制再落一份备份；失败即中止，不留半截状态。
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

/** 系统初始化（需密码 + 确认短语=「初始化系统」） */
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
