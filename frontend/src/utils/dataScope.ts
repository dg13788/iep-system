/**
 * IEP System - Data Scope Permission Utilities
 * 数据范围权限工具
 *
 * ── 重要重构说明（回测修复）────────────────────────────────────
 * 本文件原实现是一套**硬编码的假权限逻辑**：
 *   - 按 username === 'teacher1' / role === '班主任' 猜测用户身份
 *   - 把用户映射到写死的 mock ID（classIds: ['c1']、studentIds: ['s1','s2','s4']）
 *   - 在前端用这些 mock ID 过滤数据
 *
 * 这带来两个致命问题：
 *   1. 后端 API 返回的班级/学生 ID 是**数字**（如 1、2），而这里的白名单是
 *      字符串 'c1' / 's1'，过滤结果恒为空 —— 班主任登录后看不到任何数据。
 *   2. 权限判断与后端 /auth/login 下发的真实权限完全脱节，
 *      前端"以为"的权限与后端实际授权不一致，属于典型的双源失真。
 *
 * 现在改为：
 *   - 数据范围 / IEP 参与级别 / 只读标记 **一律来自后端下发的 permissions**
 *     （见 authStore.extractPermissions，数据源为 /auth/login 与 /auth/me）
 *   - 列表数据**不再在前端二次过滤**，由后端 SQL 统一施加数据范围
 *     （后端已修复 fail-open，见 backend/api/*.php 的 P0-2 修复）
 *   - filterByDataScope 等函数保留签名以兼容既有调用方，但语义变为「直通」
 */

import { useAuthStore } from '@/store/authStore';
import type { DataScopeType, IEPLevel } from '@/store/authStore';

/** 数据范围类型（沿用后端枚举命名） */
export type { DataScopeType };

/** IEP参与级别 */
export type IEPLevelType = IEPLevel;

/** 当前用户的数据范围配置 */
export interface DataScopeConfig {
  /** 后端下发的数据范围类型 */
  type: DataScopeType;
  /**
   * 可访问的班级ID列表。
   * 后端已在 SQL 层完成过滤，前端不再持有该白名单，恒为空数组。
   */
  classIds: string[];
  /** 可访问的学生ID列表。同上，恒为空数组。 */
  studentIds: string[];
  /** 当前用户在 users 表中的ID（来自 authStore，可能为 null） */
  teacherId: string | null;
  /** 当前用户姓名 */
  teacherName: string | null;
  parentName: string | null;
  parentPhone: string | null;
  /** 后端下发的 IEP 参与级别 */
  iepLevel: IEPLevelType;
  /** 是否为只读模式 */
  readOnly: boolean;
}

/**
 * 获取当前用户的数据范围配置（后端下发为准）
 */
export function getDataScopeConfig(): DataScopeConfig {
  const state = useAuthStore.getState();
  const { user, permissions, isAuthenticated } = state;

  if (!isAuthenticated || !permissions) {
    return {
      type: 'none',
      classIds: [],
      studentIds: [],
      teacherId: null,
      teacherName: null,
      parentName: null,
      parentPhone: null,
      iepLevel: 'none',
      readOnly: true,
    };
  }

  const iepLevel = permissions.iep_level ?? 'none';
  // 无 IEP 参与级别（督导等只读账号）或仅查看级别（家长）→ 只读
  const readOnly = iepLevel === 'none' || iepLevel === 'view';

  return {
    type: permissions.data_scope ?? 'none',
    classIds: [],
    studentIds: [],
    teacherId: user?.id ?? null,
    teacherName: user?.name ?? null,
    parentName: null,
    parentPhone: null,
    iepLevel,
    readOnly,
  };
}

/** 判断用户是否有全部数据权限 */
export function hasFullAccess(): boolean {
  const config = getDataScopeConfig();
  return config.type === 'all' && !config.readOnly;
}

/** 判断用户是否只能只读 */
export function isReadOnly(): boolean {
  return getDataScopeConfig().readOnly;
}

/** 获取当前用户的IEP参与级别 */
export function getIepLevel(): IEPLevelType {
  return getDataScopeConfig().iepLevel;
}

/* ============================================================================
 * 数据过滤函数
 *
 * 语义变更：后端已在 SQL 层施加数据范围过滤，前端再过滤一次不仅多余，
 * 还会因 ID 空间不一致（数字 ID vs mock 字符串 ID）误伤数据。
 * 因此这里一律原样返回。
 * ========================================================================== */

/** 取值回调：从数据项中取出用于比对的ID字符串 */
type IdGetter<T> = (item: T) => string | undefined;

/**
 * 以下过滤函数保留原有参数签名（让调用方的回调仍能获得类型推断），
 * 但不再对数据做任何裁剪 —— 数据范围由后端 SQL 统一施加。
 */
export function filterByDataScope<T>(
  data: T[],
  _getStudentId?: IdGetter<T>,
  _getClassId?: IdGetter<T>,
  _getTeacherId?: IdGetter<T>,
): T[] {
  return data;
}

export function filterByStudentIds<T>(data: T[], _getStudentId?: IdGetter<T>): T[] {
  return data;
}

export function filterByClassIds<T>(data: T[], _getClassId?: IdGetter<T>): T[] {
  return data;
}

export function filterByTeacherId<T>(
  data: T[],
  _getTeacherId?: IdGetter<T>,
  _getStudentId?: IdGetter<T>,
): T[] {
  return data;
}

export function filterParentData<T>(
  data: T[],
  _getStudentId?: IdGetter<T>,
  _getParentName?: IdGetter<T>,
): T[] {
  return data;
}

/* ============================================================================
 * React Hook
 * ========================================================================== */

import { useMemo } from 'react';

/**
 * 修复说明(P0-2)：模块顶层求值导致权限被「冻结」
 *
 * 原先多个页面在**模块顶层**写下：
 *     const readOnly = isReadOnly();
 * 模块在应用启动时（用户尚未登录）就被 import 并求值一次，
 * 此时 authStore 中还没有用户与权限，isReadOnly() 恒返回 true，
 * 且此后**永远不会重新计算** —— 即使登录成功、即使后端下发了
 * 'full' 级别的 IEP 权限，页面里的新增/编辑/录入按钮依旧全部消失。
 * 这就是「超管登录后录入评估、家长写操作、快捷操作整体消失」的根因。
 *
 * 正确做法：在组件内部、通过订阅 authStore 的方式求值，
 * 这样登录状态或权限一变化，组件会自动重新渲染。
 * 下面两个 hook 即为此提供，禁止再在模块顶层调用 isReadOnly()。
 */

/** 订阅 authStore，返回当前用户的数据范围配置（登录/权限变化会自动重渲染） */
export function useDataScopeConfig(): DataScopeConfig {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const permissions = useAuthStore((s) => s.permissions);

  return useMemo<DataScopeConfig>(() => {
    if (!isAuthenticated || !permissions) {
      return {
        type: 'none',
        classIds: [],
        studentIds: [],
        teacherId: null,
        teacherName: null,
        parentName: null,
        parentPhone: null,
        iepLevel: 'none',
        readOnly: true,
      };
    }

    const iepLevel = permissions.iep_level ?? 'none';
    // 无 IEP 参与级别（督导等只读账号）或仅查看级别（家长）→ 只读
    const readOnly = iepLevel === 'none' || iepLevel === 'view';

    return {
      type: permissions.data_scope ?? 'none',
      classIds: [],
      studentIds: [],
      teacherId: user?.id ?? null,
      teacherName: user?.name ?? null,
      parentName: null,
      parentPhone: null,
      iepLevel,
      readOnly,
    };
  }, [isAuthenticated, user, permissions]);
}

/** 订阅 authStore，返回当前是否只读 */
export function useIsReadOnly(): boolean {
  return useDataScopeConfig().readOnly;
}

export function useDataScopeFilter<T>(
  data: T[],
  _getStudentId?: IdGetter<T>,
  _getClassId?: IdGetter<T>,
  _getTeacherId?: IdGetter<T>,
): T[] {
  return data;
}

/* ============================================================================
 * IEP目标权限（科任教师）
 * ========================================================================== */

/**
 * 按 IEP 参与级别拆分目标的可编辑 / 只读集合。
 * 依据后端下发的 iep_level，负责人比对使用真实用户ID与姓名。
 */
export function filterIEPGoals<T>(
  goals: T[],
  getResponsibleTeacherId: (item: T) => string | undefined,
  getResponsibleTeacherName?: (item: T) => string | undefined,
): { editable: T[]; viewable: T[] } {
  const config = getDataScopeConfig();

  // 管理员/教学主任/班主任：全部可编辑
  if (config.iepLevel === 'full') {
    return { editable: goals, viewable: [] };
  }

  // 科任教师：仅自己负责的目标可编辑
  if (config.iepLevel === 'participate') {
    const editable: T[] = [];
    const viewable: T[] = [];
    goals.forEach((goal) => {
      const teacherId = getResponsibleTeacherId(goal);
      const teacherName = getResponsibleTeacherName?.(goal);
      const mineById =
        !!teacherId && !!config.teacherId && String(teacherId) === String(config.teacherId);
      const mineByName =
        !!teacherName && !!config.teacherName && teacherName === config.teacherName;
      if (mineById || mineByName) {
        editable.push(goal);
      } else {
        viewable.push(goal);
      }
    });
    return { editable, viewable };
  }

  // 家长 / 只读：全部只看
  return { editable: [], viewable: goals };
}
