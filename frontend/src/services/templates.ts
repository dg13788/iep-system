/**
 * 模板管理模块 service 层
 *
 * 契约来源：backend/api/templates.php
 *
 * 端点一览（basePath 由 api.ts 统一拼成 /api）：
 *   GET  /templates/list            data: { list, total, page, pageSize }
 *   GET  /templates/get  ?id        data: 模板详情
 *   GET  /templates/types           data: string[]
 *   GET  /templates/items ?template_id  data: template_items_custom[]
 *   POST /templates/create          { name,type,description,... } -> { id }
 *   POST /templates/update          { id, ...可更新字段 }
 *   POST /templates/delete          { id }
 *   POST /templates/add_item        { template_id, dimension, item_name, ... } -> { id }
 *   POST /templates/update_item     { id, ... }
 *   POST /templates/delete_item     { id }
 *
 * ── 重要契约差异（回测实测结论）────────────────────────
 * 1) 后端模板扁平结构：category AS type，无前端 dimensions/items 嵌套。
 *    前端视图模型 AssessmentTemplate 需要 dimensions，此处通过
 *    fetchTemplateItems 聚合组装，保持 UI 结构不变。
 * 2) 模板表无 icon/color/useCount/lastUsed/applicableDisabilities/ageRange
 *    （applicable_age_min/max 存在），前端依赖这些字段，适配层用派生值补齐。
 * 3) 系统模板 is_system=1，不可删除/停用；自定义模板 is_system=0。
 */

import { api } from '@/api';

/* ============================================================
 * 前端视图模型（与 Templates.tsx 保持一致）
 * ============================================================ */

export interface TemplateItem {
  id: string;
  name: string;
  description: string;
  maxScore: number;
}

export interface TemplateDimension {
  id: string;
  name: string;
  description: string;
  minScore: number;
  maxScore: number;
  scoreDescriptions: Record<number, string>;
  items: TemplateItem[];
}

export interface AssessmentTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  type: 'system' | 'custom';
  status: 'active' | 'inactive';
  icon: string;
  color: string;
  applicableDisabilities: string[];
  ageRange: { min: number; max: number };
  dimensions: TemplateDimension[];
  useCount: number;
  lastUsed?: string;
}

/* ============================================================
 * 后端原始数据结构
 * ============================================================ */

interface RawTemplate {
  id?: number | string;
  name?: string | null;
  type?: string | null;          // category AS type
  category?: string | null;
  description?: string | null;
  is_system?: number | string | null;
  is_active?: number | string | null;
  target_disability_types?: string | null;
  applicable_age_min?: number | string | null;
  applicable_age_max?: number | string | null;
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

/**
 * 将后端模板扁平行 + 其 items 聚合为前端视图模型。
 * items 为空时返回空 dimensions（仅当尚未加载 items）。
 */
export function adaptTemplate(
  raw: RawTemplate | null | undefined,
  items: TemplateItem[] = [],
): AssessmentTemplate {
  const r = raw ?? {};
  const id = num(r.id, 0);
  const isSystem = num(r.is_system, 0) === 1;

  // 聚合 items → 按维度分组
  const dimMap = new Map<string, TemplateDimension>();
  items.forEach((it) => {
    const dimName = it.name.split('｜')[0];
    const key = dimName;
    if (!dimMap.has(key)) {
      dimMap.set(key, {
        id: `d_${key}_${id}`,
        name: dimName,
        description: '',
        minScore: 1,
        maxScore: Math.max(5, it.maxScore),
        scoreDescriptions: { 1: '', 2: '', 3: '', 4: '', 5: '' },
        items: [],
      });
    }
    dimMap.get(key)!.items.push(it);
  });

  const dimensions = Array.from(dimMap.values());

  return {
    id: String(id),
    name: str(r.name),
    category: str(r.type) || str(r.category, '其他'),
    description: nullableStr(r.description),
    type: isSystem ? 'system' : 'custom',
    status: num(r.is_active, 1) === 1 ? 'active' : 'inactive',
    // 前端展示字段，后端无对应列，派生补齐
    icon: isSystem ? 'brain' : 'custom',
    color: '#977653',
    applicableDisabilities: [],
    ageRange: {
      min: num(r.applicable_age_min, 4),
      max: num(r.applicable_age_max, 18),
    },
    dimensions,
    useCount: 0,
    lastUsed: undefined,
  };
}

/** 解析 target_disability_types（JSON 字符串或逗号分隔） */
function parseDisabilities(v: unknown): string[] {
  const s = nullableStr(v);
  if (!s) return [];
  try {
    const parsed = JSON.parse(s);
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch {
    /* fallthrough */
  }
  return s.split(',').map((x) => x.trim()).filter(Boolean);
}

/** 完整详情适配（含 target_disability_types / ageRange / dimensions） */
export function adaptTemplateDetail(raw: RawTemplate | null | undefined): AssessmentTemplate {
  const r = raw ?? {};
  const base = adaptTemplate(r);
  base.applicableDisabilities = parseDisabilities(r.target_disability_types);
  return base;
}

/* ============================================================
 * 查询
 * ============================================================ */

export interface TemplateListParams {
  page?: number;
  pageSize?: number;
  type?: string;
}

export interface TemplateListResult {
  list: AssessmentTemplate[];
  total: number;
  page: number;
  pageSize: number;
}

export async function fetchTemplates(
  params: TemplateListParams = {},
): Promise<TemplateListResult> {
  const query: Record<string, unknown> = {
    page: params.page ?? 1,
    pageSize: params.pageSize ?? 100,
  };
  if (params.type) query.type = params.type;

  const res = await api.get<{ list?: RawTemplate[]; total?: number; page?: number; pageSize?: number }>(
    '/templates/list',
    query,
  );
  if (!res.success) {
    throw new Error(res.message || '模板列表加载失败');
  }
  const data = res.data ?? {};
  const rows = Array.isArray(data.list) ? data.list : [];
  return {
    list: rows.map((r) => adaptTemplate(r)),
    total: num(data.total, 0),
    page: num(data.page, 1),
    pageSize: num(data.pageSize, 100),
  };
}

export async function fetchTemplateTypes(): Promise<string[]> {
  const res = await api.get<string[]>('/templates/types');
  if (!res.success || !Array.isArray(res.data)) return [];
  return res.data.map(String);
}

/** 拉取某模板的全部评分项（含维度名），映射为前端 TemplateItem */
/** 拉取某模板的全部原始评分项（含 dimension 字段），不聚合 */
export async function fetchTemplateItemsRaw(templateId: number | string): Promise<RawTemplateItem[]> {
  const res = await api.get<RawTemplateItem[]>('/templates/items', { template_id: templateId });
  if (!res.success || !Array.isArray(res.data)) return [];
  return res.data;
}

/**
 * 将后端原始 items（含 dimension 字段）聚合为前端 TemplateDimension[]。
 * 后端 items 里 dimension 为维度名，item_name 为评分项名。
 */
export function aggregateItemsToDimensions(
  rawItems: RawTemplateItem[],
  templateId = '',
): TemplateDimension[] {
  const dimMap = new Map<string, TemplateDimension>();
  rawItems.forEach((it) => {
    const dimName = str(it?.dimension, '未命名维度');
    const maxScore = num(it?.max_score, 5);
    if (!dimMap.has(dimName)) {
      dimMap.set(dimName, {
        id: `d_${templateId}_${dimMap.size}`,
        name: dimName,
        description: '',
        minScore: 1,
        maxScore: Math.max(5, maxScore),
        scoreDescriptions: { 1: '', 2: '', 3: '', 4: '', 5: '' },
        items: [],
      });
    }
    dimMap.get(dimName)!.items.push({
      id: String(num(it?.id, 0)),
      name: str(it?.item_name),
      description: nullableStr(it?.item_description),
      maxScore,
    });
  });
  return Array.from(dimMap.values());
}

/** 拉取模板详情（含 items 聚合的完整维度） */
export async function fetchTemplateDetail(id: number | string): Promise<AssessmentTemplate> {
  const res = await api.get<RawTemplate>('/templates/get', { id });
  if (!res.success || !res.data) {
    throw new Error(res.message || '模板详情加载失败');
  }
  const items = await fetchTemplateItemsRaw(id);
  const detail = adaptTemplateDetail(res.data);
  detail.dimensions = aggregateItemsToDimensions(items, detail.id);
  return detail;
}

/* ============================================================
 * 写入操作
 * ============================================================ */

export interface TemplateWritePayload {
  name: string;
  type: string;                    // 对应后端 category
  description?: string;
  target_disability_types?: string;
  applicable_age_min?: number;
  applicable_age_max?: number;
}

export interface TemplateItemWritePayload {
  dimension: string;
  item_name: string;
  item_description?: string;
  max_score?: number;
  sort_order?: number;
}

export async function createTemplate(data: TemplateWritePayload): Promise<{ id: number }> {
  const res = await api.post<{ id?: number | string }>('/templates/create', data);
  if (!res.success || !res.data) {
    throw new Error(res.message || '创建模板失败');
  }
  return { id: num(res.data.id, 0) };
}

export async function updateTemplate(
  id: number | string,
  data: Partial<TemplateWritePayload> & { is_active?: number },
): Promise<void> {
  const res = await api.post('/templates/update', { id, ...data });
  if (!res.success) {
    throw new Error(res.message || '更新模板失败');
  }
}

export async function deleteTemplate(id: number | string): Promise<void> {
  const res = await api.post('/templates/delete', { id });
  if (!res.success) {
    throw new Error(res.message || '删除模板失败');
  }
}

export async function addTemplateItem(
  templateId: number | string,
  data: TemplateItemWritePayload,
): Promise<{ id: number }> {
  const res = await api.post<{ id?: number | string }>('/templates/add_item', {
    template_id: templateId,
    ...data,
  });
  if (!res.success || !res.data) {
    throw new Error(res.message || '添加评分项失败');
  }
  return { id: num(res.data.id, 0) };
}

export async function updateTemplateItem(
  id: number | string,
  data: Partial<TemplateItemWritePayload>,
): Promise<void> {
  const res = await api.post('/templates/update_item', { id, ...data });
  if (!res.success) {
    throw new Error(res.message || '更新评分项失败');
  }
}

export async function deleteTemplateItem(id: number | string): Promise<void> {
  const res = await api.post('/templates/delete_item', { id });
  if (!res.success) {
    throw new Error(res.message || '删除评分项失败');
  }
}
