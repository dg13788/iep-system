// API 配置文件
//
// 修复说明(P1-4)：原实现将 BASE_URL 硬编码为 'http://iep.local/api'，
// 该域名在生产环境不存在，构建产物部署后所有请求都会失败。
// 现改为：
//   1) 默认使用相对路径 '/api' —— 前后端同域部署（前端 / ，后端 /api/）时开箱可用；
//   2) 需要前后端分离部署时，通过构建期环境变量 VITE_API_BASE_URL 覆盖，
//      例如 VITE_API_BASE_URL=https://api.example.com/api npm run build

const BASE_URL: string = (import.meta.env.VITE_API_BASE_URL as string) || '/api';

export const TOKEN_KEY = 'iep-token';

/** 统一的未授权处理：清理本地凭证并跳转登录页，避免各页面重复实现 */
let onUnauthorized: (() => void) | null = null;

export function setUnauthorizedHandler(fn: () => void): void {
  onUnauthorized = fn;
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* 隐私模式下 localStorage 不可用时静默降级 */
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

/** 后端统一响应结构 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
  // 部分后端接口直接把列表字段平铺在顶层
  [key: string]: unknown;
}

// 统一请求封装
async function request<T = unknown>(path: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
  const url = `${BASE_URL}${path}`;
  const token = getToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(url, { ...options, headers });

    // 401：凭证失效，统一登出
    if (response.status === 401) {
      clearToken();
      if (onUnauthorized) {
        onUnauthorized();
      }
      return { success: false, message: '登录已失效，请重新登录' } as ApiResponse<T>;
    }

    // 204 No Content（部分 DELETE 接口）
    if (response.status === 204) {
      return { success: true } as ApiResponse<T>;
    }

    const text = await response.text();
    if (!text) {
      return {
        success: response.ok,
        message: response.ok ? '' : `请求失败（HTTP ${response.status}）`,
      } as ApiResponse<T>;
    }

    let data: ApiResponse<T>;
    try {
      data = JSON.parse(text) as ApiResponse<T>;
    } catch {
      return {
        success: false,
        message: `响应解析失败（HTTP ${response.status}）`,
      } as ApiResponse<T>;
    }

    // HTTP 层报错但响应体没有 success 字段时补齐
    if (!response.ok && typeof data.success === 'undefined') {
      data.success = false;
      if (!data.message) {
        data.message = `请求失败（HTTP ${response.status}）`;
      }
    }
    return data;
  } catch (error) {
    console.error('API request failed:', error);
    return { success: false, message: '网络请求失败，请检查后端服务是否启动' } as ApiResponse<T>;
  }
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

// 导出 HTTP 方法
export const api = {
  get: <T = unknown>(path: string, params?: Record<string, unknown>) =>
    request<T>(`${path}${buildQuery(params)}`, { method: 'GET' }),

  post: <T = unknown>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) }),

  put: <T = unknown>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body ?? {}) }),

  delete: <T = unknown>(path: string, body?: unknown) =>
    request<T>(path, { method: 'DELETE', body: body ? JSON.stringify(body) : undefined }),
};

export default api;
