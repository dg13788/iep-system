import {
  CalendarCheck,
  LayoutDashboard,
  Users,
  ClipboardCheck,
  FileText,
  BookOpen,
  Layers,
  Home,
  Settings,
  School as SchoolIcon,
  ShieldAlert,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/**
 * 导航单一真源
 *
 * 此前侧栏自己维护一份 navItems，顶栏另有一份 breadcrumbMap，
 * 两处路径→文案各自硬编码。新增页面时只改一处就会漏另一处
 * （漏了的表现是：侧栏显示新页面、顶栏面包屑显示"页面"）。
 * 现在导航、面包屑、底部标签栏都从这里取。
 */

export interface NavItem {
  path: string;
  label: string;
  /** 底部标签栏用的短标签（空间只有两三个字） */
  short?: string;
  icon: LucideIcon;
  /** 恒可见（不参与菜单权限过滤） */
  always?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  // 今日工作台取代统计仪表盘成为首页：教师打开系统第一眼应该是「今天要做什么」
  { path: '/', label: '今日', short: '今日', icon: CalendarCheck, always: true },
  { path: '/dashboard', label: '仪表盘', short: '统计', icon: LayoutDashboard },
  { path: '/students', label: '学生管理', short: '学生', icon: Users },
  { path: '/evaluation', label: '评估管理', short: '评估', icon: ClipboardCheck },
  { path: '/iep', label: 'IEP管理', short: 'IEP', icon: FileText },
  { path: '/teaching', label: '教学记录', short: '记录', icon: BookOpen },
  { path: '/templates', label: '模板管理', short: '模板', icon: Layers },
  { path: '/parents', label: '家校协作', short: '家校', icon: Home },
  { path: '/school', label: '教学健康度', short: '健康度', icon: SchoolIcon },
  { path: '/system', label: '系统管理', short: '系统', icon: Settings },
  // 管理控制台：菜单权限 key 为 admin，仅超级管理员组（pg=1）持有
  { path: '/admin', label: '管理控制台', short: '控制台', icon: ShieldAlert },
];

/** 路径 → 菜单权限 key */
export const MENU_KEY_BY_PATH: Record<string, string> = {
  '/': 'today',
  '/dashboard': 'dashboard',
  '/students': 'students',
  '/evaluation': 'evaluation',
  '/iep': 'iep',
  '/teaching': 'teaching',
  '/templates': 'templates',
  '/parents': 'parents',
  '/school': 'school',
  '/system': 'system',
  '/admin': 'admin',
};

/** 面包屑文案（含侧栏未列的登录页） */
const EXTRA_LABELS: Record<string, string> = {
  '/login': '登录',
};

export function labelForPath(path: string): string {
  if (EXTRA_LABELS[path]) return EXTRA_LABELS[path];
  return NAV_ITEMS.find((i) => i.path === path)?.label ?? '页面';
}

/** 底部标签栏的展示顺序：取教师最常去的四个，其余收进「更多」 */
export const TAB_PRIORITY: string[] = ['/', '/students', '/iep', '/teaching'];
