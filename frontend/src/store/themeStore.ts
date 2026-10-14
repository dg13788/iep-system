/**
 * 换肤（主题）系统
 * ============================================================================
 *
 * 【为什么需要它】
 * 教师用这套系统的时间点是碎片化的：白天在明亮教室里录数据，
 * 晚上在家补 IEP 计划，家长晚上开视频沟通时屏幕亮度都不一样。
 * 同一份界面在所有光照下都"能看"，不等于"看得舒服"。
 * 硬编码 hex 的时代做不了这件事——深色模式明确不做（ADR，见项目记忆），
 * 根因就是业务页近千处硬编码色值，半吊子换肤会得到"深底上飘着白卡片"的假深色。
 * 本轮 token 化（约 3400 处硬编码收口到 ~90 个语义 token）之后，这条路才成立。
 *
 * 【为什么是经典四主题，而不是把色板全开放给用户】
 * 教师不是设计师。自定义调色板会让界面失控（对比度不足、状态色被改成
 * "好看但看不清"）。所以这里只提供四个经过对比度校准的整套主题，
 * 一个开关就能来回切，永远不会出现"配色坏了"的界面。
 *
 * 【首屏防闪烁 FOUC】
 * 主题存 localStorage，但 React 挂载前 HTML 已经用默认主题渲染了一帧。
 * 若不处理，用户会看到"白闪一下变深色"——在一闪而过的错误底色上阅读文字，
 * 是明显的生理性不适。所以 index.html 里有一段同步内联脚本抢在 CSS 之前
 * 设置 data-theme；React 侧只能事后追认，不能反客为主。
 *
 * 【持久化】
 * 存在 localStorage（走主题本身要跟着用户跨设备，同步；
 * 且离线内网场景下 localStorage 是唯一可靠的选择）。
 * 'system' 表示跟随操作系统，切到夜间自动变深色。
 */
import { create } from 'zustand'

export type ThemeId = 'light' | 'dark' | 'warm' | 'contrast'

export interface ThemeDef {
  id: ThemeId
  name: string
  /** 一句话说明「什么场景用它」——教师不看色板，看场景 */
  scene: string
  /** 主题预览用的两枚色（画布 + 主色），切换器上给用户看 */
  preview: { bg: string; fg: string; accent: string }
}

export const THEMES: ThemeDef[] = [
  {
    id: 'light',
    name: '明亮',
    scene: '白天教室、投影演示',
    preview: { bg: '#F7F6F4', fg: '#1E293B', accent: '#977653' },
  },
  {
    id: 'dark',
    name: '夜间',
    scene: '夜间备课、家长沟通',
    preview: { bg: '#0C121E', fg: '#F1F5F9', accent: '#C4A47C' },
  },
  {
    id: 'warm',
    name: '暖阳',
    scene: '长时间阅读评估报告',
    preview: { bg: '#F5F0E6', fg: '#2C2620', accent: '#8A6239' },
  },
  {
    id: 'contrast',
    name: '高对比',
    scene: '投影、老花镜、视觉障碍',
    preview: { bg: '#FFFFFF', fg: '#000000', accent: '#7A4B00' },
  },
]

const STORAGE_KEY = 'iep:theme'
export const DEFAULT_THEME: ThemeId = 'light'

function isThemeId(v: unknown): v is ThemeId {
  return typeof v === 'string' && THEMES.some((t) => t.id === v)
}

/** 读取持久化主题；'system' 单独处理 */
function readStored(): ThemeId | 'system' {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'system') return 'system'
    if (isThemeId(v)) return v
  } catch {
    /* 隐私模式 / 禁用存储时静默降级为默认主题，不阻断登录 */
  }
  return DEFAULT_THEME
}

/** 系统偏好：夜间时段或系统深色偏好 */
function systemPrefersDark(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-color-scheme: dark)').matches === true
  )
}

/** 把偏好解析为具体主题 */
export function resolveTheme(pref: ThemeId | 'system'): ThemeId {
  if (pref !== 'system') return pref
  return systemPrefersDark() ? 'dark' : 'light'
}

/** 把主题写到 <html data-theme>，CSS 变量随即整体切换 */
export function applyTheme(theme: ThemeId) {
  const el = document.documentElement
  if (el.getAttribute('data-theme') !== theme) {
    el.setAttribute('data-theme', theme)
  }
  // 同步给浏览器 UI（滚动条、表单控件、下拉菜单），否则表单控件仍是浅色
  el.style.colorScheme = theme === 'dark' ? 'dark' : 'light'
}

interface ThemeState {
  /** 用户偏好，可能是 'system' */
  pref: ThemeId | 'system'
  /** 实际生效的主题（pref=system 时由系统偏好解析而来） */
  theme: ThemeId
  setTheme: (t: ThemeId | 'system') => void
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  pref: DEFAULT_THEME,
  theme: DEFAULT_THEME,
  setTheme: (t) => {
    if (t !== 'system' && !isThemeId(t)) return
    const resolved = resolveTheme(t)
    try {
      localStorage.setItem(STORAGE_KEY, t)
    } catch {
      /* 存不下不阻断使用，本会话内仍然有效 */
    }
    applyTheme(resolved)
    set({ pref: t, theme: resolved })
  },
}))

/**
 * 挂载时校准：与 index.html 的内联脚本结果对齐。
 * 内联脚本已先写了一版，这里读回来保证 React 侧状态与 DOM 一致，
 * 并补上「系统主题在运行中变化」的跟随。
 */
export function initTheme() {
  const dom = document.documentElement.getAttribute('data-theme')
  const pref = readStored()
  const resolved = resolveTheme(pref)
  applyTheme(resolved)
  useThemeStore.setState({ pref, theme: resolved })

  // 系统主题在运行中变化时跟随（用户没手动指定过才跟随）
  if (pref === 'system' && window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      if (useThemeStore.getState().pref !== 'system') return
      const t = mq.matches ? 'dark' : 'light'
      applyTheme(t)
      useThemeStore.setState({ theme: t })
    }
    mq.addEventListener?.('change', onChange)
  }

  // 内联脚本写的和这里解析出的不一致时，以内联脚本为准并记下来（异常信号）
  if (dom && dom !== resolved && import.meta.env.DEV) {
    console.warn('[theme] 内联脚本与 store 解析不一致', { dom, resolved })
  }
}

/**
 * 读取 CSS 变量的实际色值。
 *
 * 给「不能用 Tailwind 类名」的场景兜底：
 *  - <canvas>（签名板）：strokeStyle 是画布 API，不认 CSS 变量
 *  - recharts 的 SVG 属性：fill/stroke 传 CSS 变量虽可行，
 *    但图表内部有多处会把颜色写进 <style> 或做数值运算，用真实色值最稳
 *  - 导出到 Word/HTML 的文档（见 utils/documentExport.ts）
 */
export function cssVar(name: string): string {
  if (typeof window === 'undefined') return ''
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

/** 读取 token 并转成可直接喂给 canvas / SVG 的 rgb() 字符串 */
export function cssColor(token: string, fallback: string): string {
  const v = cssVar(token)
  if (!v) return fallback
  // 已是 hsl/rgb/hex 等成色值就原样返回（少数变量可能是这种形式）
  if (/^(#|hsl|rgb|oklch)/i.test(v)) return v
  return `rgb(${v})`
}

/**
 * 供文档导出使用：导出物必须白底黑字。
 * 导出是给外部文档（Word / PDF / 打印）的，主题不应该跟进去——
 * 深色界面里导出白底文档是预期行为，反过来做黑底文档打印出来没法看。
 */
export const EXPORT_SURFACE = {
  bg: '#FFFFFF',
  bgAlt: '#FAFBFC',
  ink: '#1E293B',
  ink2: '#64748B',
  line: '#E2E8F0',
  brand: '#977653',
}