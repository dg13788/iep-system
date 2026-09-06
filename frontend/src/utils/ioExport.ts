/**
 * 导入导出统一前端封装（对接后端 io_engine.php 的 io_export / io_parse_import）
 *
 * 导出：GET  /api/{module}/export?format=...&过滤参数   -> 二进制附件下载
 * 导入：POST /api/{module}/import (multipart/form-data) -> JSON 结果
 *
 * module 取值：students / iep / teaching / assessments / parents
 * format 取值：csv / xlsx / docx / pdf / markdown / json
 */

import { getToken } from '@/api';

const API_BASE: string = (import.meta.env.VITE_API_BASE_URL as string) || '/api';

export type ExportFormat = 'csv' | 'xlsx' | 'docx' | 'pdf' | 'markdown' | 'json';

export interface ExportFormatOption {
  value: ExportFormat;
  label: string;
}

/** 导出格式菜单（按后端 io_engine 支持的顺序） */
export const EXPORT_FORMAT_OPTIONS: ExportFormatOption[] = [
  { value: 'csv', label: 'CSV' },
  { value: 'xlsx', label: 'Excel (.xlsx)' },
  { value: 'docx', label: 'Word (.docx)' },
  { value: 'pdf', label: 'PDF' },
  { value: 'markdown', label: 'Markdown (.md)' },
  { value: 'json', label: 'JSON' },
];

export interface ImportResult {
  success?: boolean;
  message?: string;
  inserted?: number;
  updated?: number;
  failed?: number;
  errors?: string[];
}

function buildQuery(params?: Record<string, unknown>): string {
  if (!params) return '';
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    search.append(key, String(value));
  });
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

/** 生成带时间戳的下载文件名，避免同名覆盖 */
function buildFileName(filenameBase: string, format: ExportFormat): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const ts = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const ext = format === 'markdown' ? 'md' : format;
  return `${filenameBase}_${ts}.${ext}`;
}

/**
 * 导出下载
 * @param module 后端模块名
 * @param format 导出格式
 * @param params 过滤参数（会透传给后端 export 接口）
 * @param filenameBase 下载文件名前缀
 */
export async function ioExportDownload(
  module: string,
  format: ExportFormat,
  params?: Record<string, unknown>,
  filenameBase = '导出数据',
): Promise<void> {
  const url = `${API_BASE}/${module}/export?format=${format}${buildQuery(params)}`;
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const resp = await fetch(url, { headers });
  if (!resp.ok) {
    let msg = `导出失败（HTTP ${resp.status}）`;
    try {
      const j = await resp.json();
      if (j && j.message) msg = j.message;
    } catch {
      /* 忽略：非 JSON 错误体 */
    }
    throw new Error(msg);
  }

  const blob = await resp.blob();
  // 后端采用「HTTP 200 + JSON 错误体」统一约定（如未登录/非法格式），
  // 此时应抛错而非把 JSON 当文件下载。
  const contentType = resp.headers.get('Content-Type') || '';
  if (contentType.includes('application/json')) {
    const text = await blob.text();
    try {
      const j = JSON.parse(text) as { success?: boolean; message?: string };
      if (j && j.success === false) {
        throw new Error(j.message || '导出失败');
      }
    } catch (e) {
      if (e instanceof Error) throw e;
    }
  }

  // 后端文件名是 UTF-8 直接写入 Content-Disposition，fetch 解码易乱码，故统一用前端生成的时间戳文件名
  const filename = buildFileName(filenameBase, format);

  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(objectUrl);
}

/**
 * 导入上传
 * @param module 后端模块名
 * @param file 待导入文件（csv / xlsx / xls）
 */
export async function ioImportUpload(module: string, file: File): Promise<ImportResult> {
  const form = new FormData();
  form.append('file', file);

  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const resp = await fetch(`${API_BASE}/${module}/import`, {
    method: 'POST',
    headers,
    body: form,
  });

  let data: ImportResult = {};
  try {
    data = (await resp.json()) as ImportResult;
  } catch {
    /* 忽略：响应体不是 JSON */
  }

  if (!resp.ok || data.success === false) {
    throw new Error(data.message || `导入失败（HTTP ${resp.status}）`);
  }
  return data;
}
