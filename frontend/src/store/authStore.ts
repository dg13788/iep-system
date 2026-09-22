import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api, getToken, setToken, clearToken } from '../api';

export type IEPLevel = 'none' | 'view' | 'participate' | 'full';

export type DataScopeType = 'all' | 'class_only' | 'teacher_related' | 'own_only' | 'none';

export interface User {
  id: string;
  name: string;
  username: string;
  /** 角色名称，仅用于展示 */
  role: string;
  roleId?: number;
  avatar?: string;
  permissionGroupId?: number;
  permission_group_name?: string;
}

export interface Permissions {
  iep_level: IEPLevel;
  /** 后端下发的可访问菜单编码列表 */
  menu: string[];
  /** 后端下发的功能权限编码列表 */
  features: string[];
  /** 数据范围 */
  data_scope: DataScopeType;
}

interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  permissions: Permissions;
  token: string | null;
  /** 会话恢复中，用于避免刷新页面时权限闪烁导致菜单抖动 */
  restoring: boolean;
  login: (username: string, password: string) => Promise<{ ok: boolean; message?: string }>;
  logout: () => void;
  /** 应用启动时用已有 token 向后端换取真实权限 */
  restore: () => Promise<void>;
  hasMenu: (menu: string) => boolean;
  hasFeature: (feature: string) => boolean;
  getIepLevel: () => IEPLevel;
  getDataScope: () => DataScopeType;
}

/**
 * 修复说明(P0-5)：
 * 原实现的默认权限为 getDefaultPermissions('管理员')，即任何未登录用户
 * 都已拥有管理员的全部菜单与功能权限；logout() 后同样回落到管理员权限。
 * 这导致前端权限体系完全失效——菜单与按钮对所有人可见。
 * 现默认权限改为「无任何权限」，权限一律以后端下发为准。
 */
const NO_PERMISSIONS: Permissions = {
  iep_level: 'none',
  menu: [],
  features: [],
  data_scope: 'none',
};

/** 从后端 /auth/login 或 /auth/me 的响应中提取权限 */
function extractPermissions(raw: Record<string, unknown> | undefined): Permissions {
  const p = (raw ?? {}) as Record<string, unknown>;
  const toArray = (v: unknown): string[] => {
    if (Array.isArray(v)) return v.map(String);
    if (typeof v === 'string') {
      try {
        const parsed = JSON.parse(v);
        return Array.isArray(parsed) ? parsed.map(String) : [];
      } catch {
        return [];
      }
    }
    return [];
  };
  const level = String(p.iep_level ?? 'none');
  return {
    iep_level: (['none', 'view', 'participate', 'full'].includes(level) ? level : 'none') as IEPLevel,
    menu: toArray(p.menu),
    features: toArray(p.features),
    data_scope: String(p.data_scope ?? 'none') as DataScopeType,
  };
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      isAuthenticated: false,
      user: null,
      permissions: NO_PERMISSIONS,
      token: null,
      restoring: false,

      login: async (username: string, password: string) => {
        const data = await api.post<{
          token?: string;
          user?: Record<string, unknown>;
          permissions?: Record<string, unknown>;
        }>('/auth/login', { username, password });

        if (data.success && data.data?.token) {
          const u = (data.data.user ?? {}) as Record<string, unknown>;
          setToken(data.data.token);
          set({
            isAuthenticated: true,
            token: data.data.token,
            user: {
              id: String(u.id ?? ''),
              name: String(u.real_name ?? u.username ?? username),
              username: String(u.username ?? username),
              role: String(u.role_name ?? u.permission_group_name ?? ''),
              roleId: Number(u.role_id ?? 0) || undefined,
              avatar: u.avatar ? String(u.avatar) : undefined,
              permissionGroupId: Number(u.permission_group_id ?? 0) || undefined,
              permission_group_name: String(u.permission_group_name ?? u.role_name ?? ''),
            },
            // 修复说明(P0-5)：权限完全由后端下发，前端不再按角色名猜测
            permissions: extractPermissions(data.data.permissions),
          });
          return { ok: true };
        }

        // 修复说明(P1-1)：
        // 原实现在此处 catch 中内置了一份硬编码账号表，
        // 只要后端不可用，输入 admin/admin123 即可直接获得管理员会话（认证绕过）。
        // 现已彻底移除该后门；登录失败一律返回后端给出的错误信息。
        return { ok: false, message: data.message || '账号或密码错误' };
      },

      logout: () => {
        clearToken();
        set({
          isAuthenticated: false,
          user: null,
          // 修复说明(P0-5)：登出后权限必须清零，不可回落为管理员
          permissions: NO_PERMISSIONS,
          token: null,
        });
      },

      restore: async () => {
        const token = getToken();
        if (!token) {
          set({ isAuthenticated: false, user: null, permissions: NO_PERMISSIONS, token: null });
          return;
        }
        set({ restoring: true });
        const data = await api.get<{
          user?: Record<string, unknown>;
          permissions?: Record<string, unknown>;
        }>('/auth/me');

        /**
         * 修复说明(P0-1)：刷新页面即掉登录态
         *
         * 后端 /api/auth/me 返回的是**扁平结构**：
         *   { success: true, data: { id, username, real_name, ..., permissions } }
         * 而 /api/auth/login 返回的是**嵌套结构**：
         *   { success: true, data: { token, user: {...}, permissions: {...} } }
         *
         * 原实现仅按 login 的嵌套结构取值（data.data?.user），对 /auth/me 恒为
         * undefined，于是每次刷新都走进 else 分支执行 clearToken()，
         * 导致「刷新即被踢回登录页」。
         *
         * 现同时兼容两种结构：优先取 user 字段，缺失时回退到 data 本身。
         */
        const payload = data.data as unknown as Record<string, unknown> | undefined;
        const rawUser = ((payload?.user ?? payload) ?? {}) as Record<string, unknown>;
        const rawPerms = (payload?.permissions ?? rawUser?.permissions) as Record<string, unknown> | undefined;

        if (data.success && rawUser && Object.keys(rawUser).length > 0) {
          const u = rawUser;
          set({
            isAuthenticated: true,
            token,
            user: {
              id: String(u.id ?? ''),
              name: String(u.real_name ?? u.username ?? ''),
              username: String(u.username ?? ''),
              role: String(u.role_name ?? u.permission_group_name ?? ''),
              roleId: Number(u.role_id ?? 0) || undefined,
              avatar: u.avatar ? String(u.avatar) : undefined,
              permissionGroupId: Number(u.permission_group_id ?? 0) || undefined,
              permission_group_name: String(u.permission_group_name ?? u.role_name ?? ''),
            },
            permissions: extractPermissions(rawPerms),
            restoring: false,
          });
        } else {
          clearToken();
          set({
            isAuthenticated: false,
            user: null,
            permissions: NO_PERMISSIONS,
            token: null,
            restoring: false,
          });
        }
      },

      hasMenu: (menu: string): boolean => {
        const state = get();
        if (!state.isAuthenticated || !state.permissions?.menu) {
          return false;
        }
        return state.permissions.menu.includes(menu);
      },

      hasFeature: (feature: string): boolean => {
        const state = get();
        if (!state.isAuthenticated || !state.permissions?.features) {
          return false;
        }
        return state.permissions.features.includes(feature);
      },

      getIepLevel: (): IEPLevel => {
        const state = get();
        if (!state.isAuthenticated || !state.permissions) {
          return 'none';
        }
        return state.permissions.iep_level;
      },

      getDataScope: (): DataScopeType => {
        const state = get();
        if (!state.isAuthenticated || !state.permissions) {
          return 'none';
        }
        return state.permissions.data_scope;
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        isAuthenticated: state.isAuthenticated,
        user: state.user,
        token: state.token,
        permissions: state.permissions,
      }),
    }
  )
);
