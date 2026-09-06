import { useState, useMemo, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  Users, Shield, ClipboardList, Settings, Search, Plus,
  Pencil, RotateCcw, Save, Bell, FileText, KeyRound,
  Download, ShieldCheck, BarChart3, BookOpen, Home, Layers,
  Cog, Trash2, Lock, UserCheck,
} from 'lucide-react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  RadioGroup, RadioGroupItem,
} from '@/components/ui/radio-group';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from '@/components/ui/sheet';
import {
  Tabs, TabsList, TabsTrigger, TabsContent,
} from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { exportAuditLogs } from '@/utils/export';
import {
  fetchUsers,
  createUser,
  updateUser,
  resetUserPassword,
  fetchRoles,
  fetchPermissionGroups,
  createPermissionGroup,
  updatePermissionGroup,
  deletePermissionGroup,
  fetchAuditLogs,
  fetchSystemSettings,
  saveSystemSettings,
} from '@/services/system';
import type { PermissionGroupPayload } from '@/services/system';

/* ------------------------------------------------------------------ */
/*  Permission Group Types & Constants                                 */
/* ------------------------------------------------------------------ */

interface PermissionGroup {
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

const DATA_SCOPE_OPTIONS: { value: PermissionGroup['data_scope_type']; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'class_only', label: '本班' },
  { value: 'teacher_related', label: '所教' },
  { value: 'own_only', label: '自己' },
  { value: 'none', label: '无' },
];

const IEP_LEVEL_OPTIONS: { value: PermissionGroup['iep_level']; label: string }[] = [
  { value: 'none', label: '不参与' },
  { value: 'view', label: '仅查看' },
  { value: 'participate', label: '参与制定' },
  { value: 'full', label: '完全控制' },
];

const FEATURE_PERMISSIONS: Record<string, { code: string; label: string }[]> = {
  dashboard: [
    { code: 'data_overview', label: '数据概览查看' },
    { code: 'statistics_view', label: '统计查看' },
  ],
  students: [
    { code: 'student_view', label: '学生查看' },
    { code: 'student_create', label: '学生新增' },
    { code: 'student_edit', label: '学生编辑' },
    { code: 'student_delete', label: '学生删除' },
    { code: 'class_manage', label: '班级管理' },
    { code: 'student_export', label: '导出' },
  ],
  evaluation: [
    { code: 'eval_view', label: '评估查看' },
    { code: 'eval_create', label: '评估录入' },
    { code: 'eval_edit', label: '评估编辑' },
    { code: 'eval_delete', label: '评估删除' },
    { code: 'report_generate', label: '报告生成' },
    { code: 'report_export', label: '报告导出' },
  ],
  iep: [
    { code: 'iep_view', label: 'IEP查看' },
    { code: 'iep_create', label: 'IEP制定' },
    { code: 'iep_edit', label: 'IEP编辑' },
    { code: 'iep_delete', label: 'IEP删除' },
    { code: 'iep_approve', label: 'IEP审批' },
    { code: 'signature_manage', label: '签名管理' },
    { code: 'goal_update', label: '目标进度更新' },
  ],
  teaching: [
    { code: 'record_view', label: '记录查看' },
    { code: 'record_create', label: '记录录入' },
    { code: 'record_edit', label: '记录编辑' },
    { code: 'record_delete', label: '记录删除' },
  ],
  templates: [
    { code: 'template_view', label: '模板查看' },
    { code: 'template_create', label: '模板创建' },
    { code: 'template_edit', label: '模板编辑' },
    { code: 'template_delete', label: '模板删除' },
    { code: 'system_template_edit', label: '系统模板编辑' },
  ],
  parents: [
    { code: 'parent_view', label: '家长查看' },
    { code: 'parent_manage', label: '家长管理' },
    { code: 'signature_send', label: '签名发送' },
    { code: 'communication_record', label: '沟通记录' },
    { code: 'notification_send', label: '通知发送' },
  ],
  system: [
    { code: 'user_view', label: '用户查看' },
    { code: 'user_manage', label: '用户管理' },
    { code: 'role_manage', label: '权限组管理' },
    { code: 'audit_log', label: '审计日志' },
    { code: 'system_settings', label: '系统设置' },
  ],
};

const MODULES = [
  { key: 'dashboard', label: '仪表盘', icon: BarChart3 },
  { key: 'students', label: '学生管理', icon: Users },
  { key: 'evaluation', label: '评估管理', icon: ClipboardList },
  { key: 'iep', label: 'IEP管理', icon: FileText },
  { key: 'teaching', label: '教学记录', icon: BookOpen },
  { key: 'templates', label: '模板管理', icon: Layers },
  { key: 'parents', label: '家校协作', icon: Home },
  { key: 'system', label: '系统管理', icon: Cog },
];

const ALL_FEATURE_CODES = Object.values(FEATURE_PERMISSIONS).flatMap((arr) => arr.map((a) => a.code));
const ALL_MENU_KEYS = MODULES.map((m) => m.key);

const DEFAULT_PERMISSION_GROUPS: PermissionGroup[] = [
  {
    id: 1, name: '超级管理员', description: '系统最高权限，可管理所有功能和配置',
    data_scope_type: 'all', iep_level: 'full',
    menu_permissions: [...ALL_MENU_KEYS],
    feature_permissions: [...ALL_FEATURE_CODES],
    sort_order: 1, is_system: 1, user_count: 1,
  },
  {
    id: 2, name: '教学主任', description: '教学管理、审批权限，可查看所有数据',
    data_scope_type: 'all', iep_level: 'full',
    menu_permissions: ['dashboard', 'students', 'evaluation', 'iep', 'teaching', 'templates', 'parents'],
    feature_permissions: [
      'data_overview', 'statistics_view',
      'student_view', 'student_create', 'student_edit', 'student_delete', 'class_manage', 'student_export',
      'eval_view', 'eval_create', 'eval_edit', 'eval_delete', 'report_generate', 'report_export',
      'iep_view', 'iep_create', 'iep_edit', 'iep_delete', 'iep_approve', 'signature_manage', 'goal_update',
      'record_view', 'record_create', 'record_edit', 'record_delete',
      'template_view', 'template_create', 'template_edit', 'template_delete', 'system_template_edit',
      'parent_view', 'parent_manage', 'signature_send', 'communication_record', 'notification_send',
      'user_view',
    ],
    sort_order: 2, is_system: 1, user_count: 1,
  },
  {
    id: 3, name: '班主任', description: '班级管理、IEP制定、教学记录',
    data_scope_type: 'class_only', iep_level: 'participate',
    menu_permissions: ['dashboard', 'students', 'evaluation', 'iep', 'teaching', 'parents'],
    feature_permissions: [
      'data_overview', 'statistics_view',
      'student_view', 'student_create', 'student_edit', 'student_delete', 'class_manage',
      'eval_view', 'eval_create', 'eval_edit', 'report_generate', 'report_export',
      'iep_view', 'iep_create', 'iep_edit', 'iep_delete', 'signature_manage',
      'record_view', 'record_create', 'record_edit', 'record_delete',
      'template_view',
      'parent_view', 'signature_send', 'communication_record',
    ],
    sort_order: 3, is_system: 1, user_count: 1,
  },
  {
    id: 4, name: '科任教师', description: '教学记录、评估录入、IEP查看',
    data_scope_type: 'teacher_related', iep_level: 'participate',
    menu_permissions: ['dashboard', 'students', 'evaluation', 'iep', 'teaching', 'parents'],
    feature_permissions: [
      'data_overview',
      'student_view',
      'eval_view', 'eval_create', 'eval_edit',
      'iep_view',
      'record_view', 'record_create', 'record_edit', 'record_delete',
      'template_view',
      'parent_view', 'communication_record',
    ],
    sort_order: 4, is_system: 1, user_count: 1,
  },
  {
    id: 5, name: '家长', description: '查看自己孩子的档案、IEP签名',
    data_scope_type: 'own_only', iep_level: 'view',
    menu_permissions: ['iep', 'parents'],
    feature_permissions: [
      'student_view',
      'iep_view', 'signature_manage',
      'parent_view', 'communication_record',
    ],
    sort_order: 5, is_system: 1, user_count: 4,
  },
  {
    id: 6, name: '只读用户', description: '仅查看权限，不能修改任何数据',
    data_scope_type: 'all', iep_level: 'view',
    menu_permissions: ['dashboard', 'students', 'evaluation', 'iep', 'teaching', 'templates', 'parents', 'system'],
    feature_permissions: [
      'data_overview', 'statistics_view',
      'student_view',
      'eval_view',
      'iep_view',
      'record_view',
      'template_view',
      'parent_view',
      'user_view', 'audit_log', 'system_settings',
    ],
    sort_order: 6, is_system: 1, user_count: 1,
  },
];

/* ------------------------------------------------------------------ */
/*  Mock Data                                                          */
/* ------------------------------------------------------------------ */

interface SystemUser {
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

interface AuditLog {
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

interface RoleDef {
  id: string;
  name: string;
  code: string;
  description: string;
  color: string;
  user_count: number;
  builtin: boolean;
}

const ROLES: RoleDef[] = [
  { id: 'r1', name: '超级管理员', code: 'super_admin', description: '系统最高权限，可管理所有功能和配置', color: '#EF4444', user_count: 1, builtin: true },
  { id: 'r2', name: '教学主任', code: 'director', description: '教学管理、审批权限，不能管理用户和角色', color: '#977653', user_count: 1, builtin: true },
  { id: 'r3', name: '班主任', code: 'class_teacher', description: '班级管理、IEP制定、教学记录', color: '#10B981', user_count: 1, builtin: true },
  { id: 'r4', name: '科任教师', code: 'teacher', description: '教学记录、评估录入、IEP查看', color: '#3B82F6', user_count: 1, builtin: true },
  { id: 'r5', name: '家长', code: 'parent', description: '查看自己孩子的档案、IEP签名', color: '#F59E0B', user_count: 4, builtin: true },
  { id: 'r6', name: '只读用户', code: 'viewer', description: '仅查看权限，不能修改任何数据', color: '#64748B', user_count: 1, builtin: true },
];

const ROLE_BADGE: Record<string, string> = {
  'super_admin': 'bg-danger-50 text-danger-600',
  'director': 'bg-primary-50 text-primary-700',
  'class_teacher': 'bg-success-50 text-success-600',
  'teacher': 'bg-info-50 text-info-600',
  'parent': 'bg-warning-50 text-warning-600',
  'viewer': 'bg-secondary-50 text-secondary-400',
};

const ACTION_BADGE: Record<string, string> = {
  '新增': 'bg-success-50 text-success-600',
  '修改': 'bg-info-50 text-info-600',
  '删除': 'bg-danger-50 text-danger-600',
  '查看': 'bg-secondary-50 text-secondary-400',
  '登录': 'bg-primary-50 text-primary-700',
  '登出': 'bg-secondary-50 text-secondary-300',
  '导出': 'bg-warning-50 text-warning-600',
};

const MODULE_BADGE: Record<string, string> = {
  '仪表盘': 'bg-primary-50 text-primary-700',
  '学生管理': 'bg-success-50 text-success-600',
  '评估管理': 'bg-info-50 text-info-600',
  'IEP管理': 'bg-purple-50 text-purple-500',
  '教学记录': 'bg-warning-50 text-warning-600',
  '模板管理': 'bg-secondary-50 text-secondary-400',
  '家校协作': 'bg-primary-50 text-primary-700',
  '系统管理': 'bg-danger-50 text-danger-600',
  '用户管理': 'bg-danger-50 text-danger-600',
  '角色权限': 'bg-danger-50 text-danger-600',
  '审计日志': 'bg-secondary-50 text-secondary-400',
  '系统设置': 'bg-secondary-50 text-secondary-400',
};

// Default permissions per role (role_code -> module_key -> Set of permission indices)
const OLD_PERMISSIONS: Record<string, string[]> = {
  dashboard: ['数据概览查看', '统计查看'],
  students: ['学生查看', '学生新增', '学生编辑', '学生删除', '班级管理', '导出'],
  evaluation: ['评估查看', '评估录入', '评估编辑', '评估删除', '报告生成', '报告导出'],
  iep: ['IEP查看', 'IEP制定', 'IEP编辑', 'IEP删除', 'IEP审批', '签名管理'],
  teaching: ['记录查看', '记录录入', '记录编辑', '记录删除'],
  templates: ['模板查看', '模板创建', '模板编辑', '模板删除', '系统模板编辑'],
  parents: ['家长查看', '家长管理', '签名发送', '沟通记录', '通知发送'],
  system: ['用户查看', '用户管理', '角色管理', '审计日志', '系统设置'],
};

const DEFAULT_ROLE_PERMS: Record<string, Record<string, Set<number>>> = {
  super_admin: Object.fromEntries(Object.keys(OLD_PERMISSIONS).map((m) => [m, new Set(OLD_PERMISSIONS[m].map((_, i) => i))])),
  director: {
    dashboard: new Set([0, 1]),
    students: new Set([0, 1, 2, 3, 4, 5]),
    evaluation: new Set([0, 1, 2, 3, 4, 5]),
    iep: new Set([0, 1, 2, 3, 4, 5]),
    teaching: new Set([0, 1, 2, 3]),
    templates: new Set([0, 1, 2, 3, 4]),
    parents: new Set([0, 1, 2, 3, 4]),
    system: new Set([0]),
  },
  class_teacher: {
    dashboard: new Set([0, 1]),
    students: new Set([0, 1, 2, 3, 4]),
    evaluation: new Set([0, 1, 2, 4, 5]),
    iep: new Set([0, 1, 2, 3]),
    teaching: new Set([0, 1, 2, 3]),
    templates: new Set([0]),
    parents: new Set([0, 2, 3]),
    system: new Set(),
  },
  teacher: {
    dashboard: new Set([0]),
    students: new Set([0]),
    evaluation: new Set([0, 1, 2]),
    iep: new Set([0]),
    teaching: new Set([0, 1, 2, 3]),
    templates: new Set([0]),
    parents: new Set([0, 3]),
    system: new Set(),
  },
  parent: {
    dashboard: new Set(),
    students: new Set([0]),
    evaluation: new Set(),
    iep: new Set([0, 5]),
    teaching: new Set(),
    templates: new Set(),
    parents: new Set([0, 3]),
    system: new Set(),
  },
  viewer: Object.fromEntries(Object.keys(OLD_PERMISSIONS).map((m) => [m, new Set([0])])),
};

function generateMockData() {
  const users: SystemUser[] = [
    { id: 'u1', username: 'admin', real_name: '系统管理员', role: '超级管理员', role_code: 'super_admin', department: '信息中心', phone: '13800000001', email: 'admin@school.edu', last_login: '2025-01-18 16:30', status: '正常', created_at: '2024-01-01', login_count: 328 },
    { id: 'u2', username: 'director1', real_name: '陈主任', role: '教学主任', role_code: 'director', department: '教学部', phone: '13800000002', email: 'director@school.edu', last_login: '2025-01-18 14:00', status: '正常', created_at: '2024-01-02', login_count: 215 },
    { id: 'u3', username: 'teacher1', real_name: '王老师', role: '班主任', role_code: 'class_teacher', department: '启智一班', phone: '13800000003', email: 'wang@school.edu', last_login: '2025-01-18 12:00', status: '正常', created_at: '2024-01-03', login_count: 186 },
    { id: 'u4', username: 'teacher2', real_name: '李老师', role: '科任教师', role_code: 'teacher', department: '康复组', phone: '13800000004', email: 'li@school.edu', last_login: '2025-01-17 18:00', status: '正常', created_at: '2024-01-04', login_count: 142 },
    { id: 'u5', username: 'parent1', real_name: '王建国', role: '家长', role_code: 'parent', department: '', phone: '13800138001', email: '', last_login: '2025-01-18 14:30', status: '正常', created_at: '2024-06-01', login_count: 45 },
    { id: 'u6', username: 'viewer1', real_name: '张督导', role: '只读用户', role_code: 'viewer', department: '督导室', phone: '13800000005', email: 'supervisor@school.edu', last_login: '2025-01-15 10:00', status: '正常', created_at: '2024-03-01', login_count: 28 },
  ];

  const auditLogs: AuditLog[] = [
    { id: 'al1', timestamp: '2025-01-18 16:30:22', user_name: '系统管理员', user_role: '超级管理员', ip_address: '192.168.1.100', module: '系统管理', action: '登录', target: '系统', description: '用户登录系统', status: '成功' },
    { id: 'al2', timestamp: '2025-01-18 16:25:10', user_name: '陈主任', user_role: '教学主任', ip_address: '192.168.1.101', module: 'IEP管理', action: '修改', target: 'IEP计划 #IEP-2025-001', description: '更新IEP目标设定', status: '成功' },
    { id: 'al3', timestamp: '2025-01-18 16:20:05', user_name: '王老师', user_role: '班主任', ip_address: '192.168.1.102', module: '教学记录', action: '新增', target: '教学记录 #TR-2025-018', description: '录入新的教学记录', status: '成功' },
    { id: 'al4', timestamp: '2025-01-18 16:15:33', user_name: '李老师', user_role: '科任教师', ip_address: '192.168.1.103', module: '评估管理', action: '查看', target: '评估报告 #EV-2025-005', description: '查看评估报告详情', status: '成功' },
    { id: 'al5', timestamp: '2025-01-18 16:10:18', user_name: '王建国', user_role: '家长', ip_address: '218.78.45.12', module: '家校协作', action: '查看', target: 'IEP签名', description: '查看待签名IEP', status: '成功' },
    { id: 'al6', timestamp: '2025-01-18 16:05:42', user_name: '系统管理员', user_role: '超级管理员', ip_address: '192.168.1.100', module: '用户管理', action: '修改', target: '用户 #u3', description: '重置王老师密码', status: '成功' },
    { id: 'al7', timestamp: '2025-01-18 15:55:20', user_name: '陈主任', user_role: '教学主任', ip_address: '192.168.1.101', module: '学生管理', action: '查看', target: '学生档案 #s5', description: '查看学生详细信息', status: '成功' },
    { id: 'al8', timestamp: '2025-01-18 15:50:11', user_name: '王老师', user_role: '班主任', ip_address: '192.168.1.102', module: '教学记录', action: '删除', target: '教学记录 #TR-2025-003', description: '删除错误的教学记录', status: '成功' },
    { id: 'al9', timestamp: '2025-01-18 15:45:08', user_name: '李老师', user_role: '科任教师', ip_address: '192.168.1.103', module: '教学记录', action: '新增', target: '教学记录 #TR-2025-019', description: '录入感觉统合训练记录', status: '成功' },
    { id: 'al10', timestamp: '2025-01-18 15:40:55', user_name: '系统管理员', user_role: '超级管理员', ip_address: '192.168.1.100', module: '系统设置', action: '修改', target: '通知设置', description: '修改签名提醒间隔为7天', status: '成功' },
    { id: 'al11', timestamp: '2025-01-18 15:35:30', user_name: '陈主任', user_role: '教学主任', ip_address: '192.168.1.101', module: '评估管理', action: '导出', target: '评估报告', description: '导出期末评估报告', status: '成功' },
    { id: 'al12', timestamp: '2025-01-18 15:30:15', user_name: '王建国', user_role: '家长', ip_address: '218.78.45.12', module: '家校协作', action: '修改', target: 'IEP签名 #sig1', description: '完成IEP电子签名', status: '成功' },
    { id: 'al13', timestamp: '2025-01-18 15:25:00', user_name: '张督导', user_role: '只读用户', ip_address: '192.168.1.104', module: '仪表盘', action: '查看', target: '数据概览', description: '查看系统统计数据', status: '成功' },
    { id: 'al14', timestamp: '2025-01-18 15:20:45', user_name: '李老师', user_role: '科任教师', ip_address: '192.168.1.103', module: '学生管理', action: '查看', target: '学生列表', description: '查看所负责学生', status: '成功' },
    { id: 'al15', timestamp: '2025-01-18 15:15:22', user_name: '系统管理员', user_role: '超级管理员', ip_address: '192.168.1.100', module: '角色权限', action: '修改', target: '角色 #r4', description: '修改科任教师权限配置', status: '成功' },
    { id: 'al16', timestamp: '2025-01-18 15:10:18', user_name: '陈主任', user_role: '教学主任', ip_address: '192.168.1.101', module: 'IEP管理', action: '新增', target: 'IEP计划', description: '创建新学期IEP计划', status: '成功' },
    { id: 'al17', timestamp: '2025-01-18 15:05:10', user_name: '王老师', user_role: '班主任', ip_address: '192.168.1.102', module: '家校协作', action: '新增', target: '沟通记录', description: '新增家校沟通记录', status: '成功' },
    { id: 'al18', timestamp: '2025-01-18 15:00:05', user_name: '系统管理员', user_role: '超级管理员', ip_address: '192.168.1.100', module: '用户管理', action: '新增', target: '用户 #u7', description: '新增家长用户账号', status: '成功' },
    { id: 'al19', timestamp: '2025-01-18 14:55:33', user_name: '王建国', user_role: '家长', ip_address: '218.78.45.12', module: '家校协作', action: '登录', target: '系统', description: '家长端登录', status: '成功' },
    { id: 'al20', timestamp: '2025-01-18 14:50:20', user_name: '系统管理员', user_role: '超级管理员', ip_address: '192.168.1.100', module: '审计日志', action: '导出', target: '日志数据', description: '导出本月审计日志', status: '成功' },
    { id: 'al21', timestamp: '2025-01-18 14:45:15', user_name: '李老师', user_role: '科任教师', ip_address: '192.168.1.103', module: '评估管理', action: '修改', target: '评估记录', description: '修改评估分数', status: '失败' },
    { id: 'al22', timestamp: '2025-01-18 14:40:10', user_name: '陈主任', user_role: '教学主任', ip_address: '192.168.1.101', module: '模板管理', action: '查看', target: '评估模板', description: '查看可用模板列表', status: '成功' },
  ];

  return { users, auditLogs };
}

const { users: INITIAL_USERS, auditLogs: INITIAL_AUDIT_LOGS } = generateMockData();

/* ------------------------------------------------------------------ */
/*  Tab 1: User Management                                             */
/* ------------------------------------------------------------------ */
function UserManagementTab() {
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<SystemUser | null>(null);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetUser, setResetUser] = useState<SystemUser | null>(null);
  const [newPassword, setNewPassword] = useState('Qz@123456');

  const loadUsers = useCallback(async () => {
    try {
      const res = await fetchUsers({ pageSize: 100 });
      setUsers(res.list);
    } catch (e) {
      const msg = (e as Error)?.message || '用户列表加载失败';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const filtered = useMemo(() => {
    return users.filter((u) => {
      if (search && !u.real_name.includes(search) && !u.username.includes(search)) return false;
      if (roleFilter !== 'all' && u.role_code !== roleFilter) return false;
      if (statusFilter !== 'all' && u.status !== statusFilter) return false;
      return true;
    });
  }, [users, search, roleFilter, statusFilter]);

  const ROLE_ID_MAP: Record<string, number> = {
    super_admin: 1, director: 2, class_teacher: 3, teacher: 4, parent: 5, viewer: 6,
  };

  const handleSave = async (data: Partial<SystemUser>) => {
    const roleId = ROLE_ID_MAP[data.role_code ?? 'teacher'] ?? 4;
    try {
      if (editingUser) {
        await updateUser({
          id: editingUser.id,
          username: data.username,
          real_name: data.real_name,
          phone: data.phone,
          email: data.email,
          role_id: roleId,
          department: data.department,
          is_active: data.status === '禁用' ? 0 : 1,
        });
        toast.success('用户信息已更新');
      } else {
        await createUser({
          username: data.username ?? '',
          password: (data as SystemUser & { password?: string }).password ?? '',
          real_name: data.real_name ?? '',
          phone: data.phone,
          email: data.email,
          role_id: roleId,
          department: data.department,
        });
        toast.success('用户已创建');
      }
      await loadUsers();
    } catch (e) {
      const msg = (e as Error)?.message || '保存失败';
      toast.error(msg);
      return;
    }
    setDrawerOpen(false);
    setEditingUser(null);
  };

  const handleResetPassword = async () => {
    if (!resetUser) return;
    try {
      await resetUserPassword(resetUser.id, newPassword);
      toast.success(`已重置 ${resetUser.real_name} 的密码`);
    } catch (e) {
      const msg = (e as Error)?.message || '重置密码失败';
      toast.error(msg);
      return;
    }
    setResetDialogOpen(false);
    setResetUser(null);
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg p-4 shadow-sm flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
          <Input placeholder="搜索用户名、姓名..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-[220px] pl-9" />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="角色" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部角色</SelectItem>
            {ROLES.map((r) => (<SelectItem key={r.code} value={r.code}>{r.name}</SelectItem>))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[130px]"><SelectValue placeholder="状态" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            <SelectItem value="正常">正常</SelectItem>
            <SelectItem value="禁用">禁用</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setRoleFilter('all'); setStatusFilter('all'); }}>
          <RotateCcw size={14} className="mr-1" /> 重置
        </Button>
        <div className="ml-auto">
          <Button onClick={() => { setEditingUser(null); setDrawerOpen(true); }} className="bg-[#977653] hover:bg-[#7A5F42] text-white gap-2">
            <Plus size={16} /> 添加用户
          </Button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-[#F7F6F4] hover:bg-[#F7F6F4]">
              <TableHead className="text-xs text-[#94A3B8] font-semibold">用户名</TableHead>
              <TableHead className="text-xs text-[#94A3B8] font-semibold">姓名</TableHead>
              <TableHead className="text-xs text-[#94A3B8] font-semibold">角色</TableHead>
              <TableHead className="text-xs text-[#94A3B8] font-semibold">部门</TableHead>
              <TableHead className="text-xs text-[#94A3B8] font-semibold">电话</TableHead>
              <TableHead className="text-xs text-[#94A3B8] font-semibold">最近登录</TableHead>
              <TableHead className="text-xs text-[#94A3B8] font-semibold">状态</TableHead>
              <TableHead className="text-xs text-[#94A3B8] font-semibold text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-sm text-[#94A3B8]">加载中...</TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-sm text-[#94A3B8]">暂无用户数据</TableCell>
              </TableRow>
            ) : (
            filtered.map((u) => (
              <TableRow key={u.id} className="hover:bg-[#F7F6F4] transition-colors">
                <TableCell>
                  <div>
                    <div className="text-sm font-semibold text-[#1E293B]">{u.username}</div>
                    <div className="text-xs text-[#94A3B8]">{u.email || '—'}</div>
                  </div>
                </TableCell>
                <TableCell className="text-sm text-[#1E293B]">{u.real_name}</TableCell>
                <TableCell>
                  <Badge className={cn('text-xs font-normal', ROLE_BADGE[u.role_code])}>{u.role}</Badge>
                </TableCell>
                <TableCell className="text-sm text-[#64748B]">{u.department || '—'}</TableCell>
                <TableCell className="text-sm text-[#1E293B]">{u.phone}</TableCell>
                <TableCell className="text-sm text-[#94A3B8]">{u.last_login || '—'}</TableCell>
                <TableCell>
                  <Badge className={cn('text-xs font-normal', u.status === '正常' ? 'bg-success-50 text-success-600' : 'bg-danger-50 text-danger-600')}>
                    {u.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => { setEditingUser(u); setDrawerOpen(true); }}>
                      <Pencil size={14} className="text-[#64748B]" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => { setResetUser(u); setResetDialogOpen(true); }}>
                      <KeyRound size={14} className="text-[#F59E0B]" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )))}
          </TableBody>
        </Table>
      </div>

      <UserFormDrawer open={drawerOpen} onClose={() => { setDrawerOpen(false); setEditingUser(null); }} user={editingUser} onSave={handleSave} />

      {/* Reset Password Dialog */}
      <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <DialogContent className="w-[400px]">
          <DialogHeader>
            <DialogTitle>重置密码</DialogTitle>
            <DialogDescription>确定要重置 {resetUser?.real_name} 的密码吗？</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <label className="block text-sm font-medium text-[#1E293B] mb-1.5">新密码</label>
            <Input value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            <p className="text-xs text-[#94A3B8] mt-1">重置后将恢复为默认密码，建议用户首次登录后修改。</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetDialogOpen(false)}>取消</Button>
            <Button onClick={handleResetPassword} className="bg-[#977653] hover:bg-[#7A5F42] text-white">确认重置</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* User Form Drawer */
function UserFormDrawer({ open, onClose, user, onSave }: { open: boolean; onClose: () => void; user: SystemUser | null; onSave: (d: Partial<SystemUser>) => void }) {
  const [form, setForm] = useState({
    username: '', password: '', real_name: '', role_code: 'teacher', department: '', phone: '', email: '', status: "正常" as "正常" | "禁用",
  });

  useEffect(() => {
    if (user) {
      setForm({
        username: user.username, password: '', real_name: user.real_name,
        role_code: user.role_code, department: user.department,
        phone: user.phone, email: user.email, status: user.status,
      });
    } else {
      setForm({
        username: '', password: '', real_name: '', role_code: 'teacher', department: '', phone: '', email: '', status: '正常',
      });
    }
  }, [user]);

  const update = (field: string, value: unknown) => setForm((prev) => ({ ...prev, [field]: value }));

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-[560px] sm:max-w-[560px] p-0 overflow-y-auto">
        <SheetHeader className="p-6 border-b border-[#E2E8F0]">
          <SheetTitle>{user ? '编辑用户' : '添加用户'}</SheetTitle>
          <SheetDescription>{user ? '修改用户信息' : '创建新的系统用户'}</SheetDescription>
        </SheetHeader>
        <div className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[#1E293B] mb-1.5">用户名 <span className="text-[#EF4444]">*</span></label>
              <Input value={form.username} onChange={(e) => update('username', e.target.value)} placeholder="登录账号" />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#1E293B] mb-1.5">姓名 <span className="text-[#EF4444]">*</span></label>
              <Input value={form.real_name} onChange={(e) => update('real_name', e.target.value)} placeholder="真实姓名" />
            </div>
          </div>
          {!user && (
            <div>
              <label className="block text-sm font-medium text-[#1E293B] mb-1.5">初始密码 <span className="text-[#EF4444]">*</span></label>
              <Input type="password" value={form.password} onChange={(e) => update('password', e.target.value)} placeholder="初始密码" />
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[#1E293B] mb-1.5">角色 <span className="text-[#EF4444]">*</span></label>
              <Select value={form.role_code} onValueChange={(v) => update('role_code', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (<SelectItem key={r.code} value={r.code}>{r.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#1E293B] mb-1.5">状态</label>
              <Select value={form.status} onValueChange={(v) => update('status', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="正常">正常</SelectItem>
                  <SelectItem value="禁用">禁用</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-[#1E293B] mb-1.5">部门</label>
            <Input value={form.department} onChange={(e) => update('department', e.target.value)} placeholder="所属部门" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[#1E293B] mb-1.5">手机号码 <span className="text-[#EF4444]">*</span></label>
              <Input value={form.phone} onChange={(e) => update('phone', e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#1E293B] mb-1.5">电子邮箱</label>
              <Input value={form.email} onChange={(e) => update('email', e.target.value)} placeholder="选填" />
            </div>
          </div>
        </div>
        <SheetFooter className="border-t border-[#E2E8F0] p-6">
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={() => onSave(form)} className="bg-[#977653] hover:bg-[#7A5F42] text-white">保存</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab 2: Permission Group Management                                 */
/* ------------------------------------------------------------------ */
function PermissionGroupManagementTab() {
  const [groups, setGroups] = useState<PermissionGroup[]>([]);
  const [selectedId, setSelectedId] = useState<number>(0);
  const [changed, setChanged] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PermissionGroup | null>(null);

  // Editing form state
  const selectedGroup = groups.find((g) => g.id === selectedId) ?? null;

  const [editForm, setEditForm] = useState<Partial<PermissionGroup>>({});

  const loadGroups = useCallback(async (keepId?: number) => {
    try {
      const list = await fetchPermissionGroups();
      setGroups(list);
      if (list.length === 0) {
        setSelectedId(0);
        setEditForm({});
        return;
      }
      const next = list.find((g) => g.id === keepId) ?? list[0];
      setSelectedId(next.id);
      setEditForm({ ...next });
      setIsAdding(false);
    } catch (e) {
      toast.error((e as Error)?.message || '权限组加载失败');
    }
  }, []);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  const beginEdit = (group: PermissionGroup) => {
    setEditForm({ ...group });
    setIsAdding(false);
    setChanged(false);
  };

  const handleSelectGroup = (id: number) => {
    setSelectedId(id);
    const group = groups.find((g) => g.id === id);
    if (group) beginEdit(group);
  };

  const handleAddNew = () => {
    const newId = Math.max(...groups.map((g) => g.id), 0) + 1;
    const newGroup: PermissionGroup = {
      id: newId,
      name: '',
      description: '',
      data_scope_type: 'teacher_related',
      iep_level: 'participate',
      menu_permissions: [],
      feature_permissions: [],
      sort_order: newId,
      is_system: 0,
      user_count: 0,
    };
    setEditForm({ ...newGroup });
    setIsAdding(true);
    setSelectedId(newId);
    setChanged(true);
  };

  const updateForm = (field: keyof PermissionGroup, value: unknown) => {
    setEditForm((prev) => ({ ...prev, [field]: value }));
    setChanged(true);
  };

  const toggleMenuPermission = (menuKey: string) => {
    const current = (editForm.menu_permissions as string[]) ?? [];
    if (current.includes(menuKey)) {
      updateForm('menu_permissions', current.filter((k) => k !== menuKey));
    } else {
      updateForm('menu_permissions', [...current, menuKey]);
    }
  };

  const toggleFeaturePermission = (permCode: string) => {
    const current = (editForm.feature_permissions as string[]) ?? [];
    if (current.includes(permCode)) {
      updateForm('feature_permissions', current.filter((c) => c !== permCode));
    } else {
      updateForm('feature_permissions', [...current, permCode]);
    }
  };

  const toggleModuleAllFeatures = (moduleKey: string) => {
    const modulePerms = FEATURE_PERMISSIONS[moduleKey] || [];
    const current = (editForm.feature_permissions as string[]) ?? [];
    const moduleCodes = modulePerms.map((p) => p.code);
    const allChecked = moduleCodes.every((c) => current.includes(c));
    if (allChecked) {
      updateForm('feature_permissions', current.filter((c) => !moduleCodes.includes(c)));
    } else {
      const merged = [...new Set([...current, ...moduleCodes])];
      updateForm('feature_permissions', merged);
    }
  };

  const handleSave = async () => {
    if (!editForm.name?.trim()) {
      toast.error('请填写权限组名称');
      return;
    }
    const payload: PermissionGroupPayload = {
      name: editForm.name!,
      description: editForm.description ?? '',
      data_scope_type: editForm.data_scope_type ?? 'teacher_related',
      iep_level: editForm.iep_level ?? 'participate',
      menu_permissions: (editForm.menu_permissions as string[]) ?? [],
      feature_permissions: (editForm.feature_permissions as string[]) ?? [],
      sort_order: editForm.sort_order ?? editForm.id ?? 0,
    };
    try {
      if (isAdding) {
        await createPermissionGroup(payload);
        toast.success(`权限组 "${payload.name}" 已创建`);
      } else if (editForm.id) {
        await updatePermissionGroup(editForm.id, payload);
        toast.success(`权限组 "${payload.name}" 已保存`);
      }
      setChanged(false);
      await loadGroups(editForm.id);
    } catch (e) {
      toast.error((e as Error)?.message || '保存失败');
    }
  };

  const handleCancel = () => {
    if (isAdding) {
      const firstGroup = groups[0];
      if (firstGroup) {
        setSelectedId(firstGroup.id);
        beginEdit(firstGroup);
      }
      setIsAdding(false);
    } else if (selectedGroup) {
      beginEdit(selectedGroup);
    }
    setChanged(false);
  };

  const handleDeleteClick = (group: PermissionGroup, e: React.MouseEvent) => {
    e.stopPropagation();
    if (group.is_system === 1) {
      toast.error('系统预设权限组不可删除');
      return;
    }
    if (group.user_count > 0) {
      toast.error('该权限组下有关联用户，不可删除');
      return;
    }
    setDeleteTarget(group);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deletePermissionGroup(deleteTarget.id);
      toast.success(`权限组 "${deleteTarget.name}" 已删除`);
    } catch (e) {
      toast.error((e as Error)?.message || '删除失败');
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
      return;
    }
    setDeleteDialogOpen(false);
    setDeleteTarget(null);
    await loadGroups();
  };

  const currentMenus = (editForm.menu_permissions as string[]) ?? [];
  const currentFeatures = (editForm.feature_permissions as string[]) ?? [];

  return (
    <div className="flex gap-6">
      {/* Left: Permission Group List */}
      <motion.div
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        className="w-[260px] flex-shrink-0 bg-white rounded-xl shadow-sm overflow-hidden flex flex-col"
      >
        <div className="p-4 border-b border-[#E2E8F0] flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[#1E293B]">权限组列表</h3>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-[#977653] hover:text-[#7A5F42] hover:bg-[#F7F6F4]"
            onClick={handleAddNew}
          >
            <Plus size={16} />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-[#F7F6F4]">
          <AnimatePresence>
            {groups.sort((a, b) => a.sort_order - b.sort_order).map((group, idx) => (
              <motion.button
                key={group.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.05 }}
                onClick={() => handleSelectGroup(group.id)}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-3 transition-colors text-left cursor-pointer relative',
                  selectedId === group.id
                    ? 'bg-[#F7F6F4]'
                    : 'hover:bg-[#FAFAF8]',
                  selectedId === group.id ? 'border-l-[3px] border-[#977653]' : 'border-l-[3px] border-transparent',
                )}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-[#1E293B] truncate">{group.name}</span>
                    {group.is_system === 1 && (
                      <Badge className="bg-[#F7F6F4] text-[#977653] text-[10px] font-normal border border-[#977653]/20">
                        <Lock size={8} className="mr-0.5" />系统
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-[#94A3B8] truncate mt-0.5">{group.description}</div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Badge className="bg-secondary-50 text-secondary-400 text-[10px] font-normal">{group.user_count}人</Badge>
                  {group.is_system !== 1 && group.user_count === 0 && (
                    <button
                      onClick={(e) => handleDeleteClick(group, e)}
                      className="p-1 rounded hover:bg-[#FEE2E2] text-[#94A3B8] hover:text-[#EF4444] transition-colors"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              </motion.button>
            ))}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Right: Configuration Panel */}
      <motion.div
        initial={{ opacity: 0, x: 10 }}
        animate={{ opacity: 1, x: 0 }}
        className="flex-1 bg-white rounded-xl shadow-sm overflow-hidden flex flex-col"
      >
        {editForm.id ? (
          <>
            {/* Header */}
            <div className="p-6 border-b border-[#E2E8F0]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-[#977653]/10 flex items-center justify-center">
                    <Shield size={20} className="text-[#977653]" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-[#1E293B]">
                      {isAdding ? '新增权限组' : editForm.name}
                    </h3>
                    <p className="text-sm text-[#64748B]">
                      {isAdding ? '配置新权限组的基本信息和权限' : editForm.description}
                    </p>
                  </div>
                </div>
                {!isAdding && editForm.is_system === 1 && (
                  <Badge className="bg-[#F7F6F4] text-[#977653] border border-[#977653]/20">
                    <Lock size={10} className="mr-1" />系统预设
                  </Badge>
                )}
                {!isAdding && (
                  <div className="text-sm text-[#94A3B8]">
                    关联用户: <span className="font-medium text-[#1E293B]">{editForm.user_count ?? 0}</span>人
                  </div>
                )}
              </div>
            </div>

            {/* Scrollable Form */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 max-h-[calc(100dvh-320px)]">
              <AnimatePresence mode="wait">
                <motion.div
                  key={editForm.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="space-y-6"
                >
                  {/* Basic Info */}
                  <div className="space-y-4">
                    <h4 className="text-sm font-semibold text-[#1E293B] flex items-center gap-2">
                      <UserCheck size={16} className="text-[#977653]" />
                      基本信息
                    </h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-sm text-[#1E293B] mb-1.5 block">
                          权限组名称 <span className="text-[#EF4444]">*</span>
                        </Label>
                        <Input
                          value={(editForm.name as string) ?? ''}
                          onChange={(e) => updateForm('name', e.target.value)}
                          placeholder="如：教学组长"
                        />
                      </div>
                      <div>
                        <Label className="text-sm text-[#1E293B] mb-1.5 block">描述</Label>
                        <Input
                          value={(editForm.description as string) ?? ''}
                          onChange={(e) => updateForm('description', e.target.value)}
                          placeholder="权限组的功能描述"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Data Scope */}
                  <div className="space-y-3">
                    <h4 className="text-sm font-semibold text-[#1E293B]">数据范围</h4>
                    <p className="text-xs text-[#94A3B8]">该权限组成员可访问的数据范围</p>
                    <RadioGroup
                      value={editForm.data_scope_type}
                      onValueChange={(v) => updateForm('data_scope_type', v)}
                      className="flex flex-wrap gap-4"
                    >
                      {DATA_SCOPE_OPTIONS.map((opt) => (
                        <div key={opt.value} className="flex items-center space-x-2">
                          <RadioGroupItem value={opt.value} id={`scope-${opt.value}`} />
                          <Label htmlFor={`scope-${opt.value}`} className="text-sm text-[#64748B] cursor-pointer font-normal">
                            {opt.label}
                          </Label>
                        </div>
                      ))}
                    </RadioGroup>
                  </div>

                  {/* IEP Level */}
                  <div className="space-y-3">
                    <h4 className="text-sm font-semibold text-[#1E293B]">IEP参与级别</h4>
                    <p className="text-xs text-[#94A3B8]">该权限组成员在IEP流程中的参与程度</p>
                    <RadioGroup
                      value={editForm.iep_level}
                      onValueChange={(v) => updateForm('iep_level', v)}
                      className="flex flex-wrap gap-4"
                    >
                      {IEP_LEVEL_OPTIONS.map((opt) => (
                        <div key={opt.value} className="flex items-center space-x-2">
                          <RadioGroupItem value={opt.value} id={`iep-${opt.value}`} />
                          <Label htmlFor={`iep-${opt.value}`} className="text-sm text-[#64748B] cursor-pointer font-normal">
                            {opt.label}
                          </Label>
                        </div>
                      ))}
                    </RadioGroup>
                  </div>

                  {/* Menu Access */}
                  <div className="space-y-3">
                    <h4 className="text-sm font-semibold text-[#1E293B]">菜单访问</h4>
                    <p className="text-xs text-[#94A3B8]">该权限组成员可在导航栏看到的模块</p>
                    <div className="flex flex-wrap gap-3">
                      {MODULES.map((mod) => {
                        const ModIcon = mod.icon;
                        const checked = currentMenus.includes(mod.key);
                        return (
                          <motion.button
                            key={mod.key}
                            whileTap={{ scale: 0.97 }}
                            onClick={() => toggleMenuPermission(mod.key)}
                            className={cn(
                              'flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors cursor-pointer',
                              checked
                                ? 'border-[#977653] bg-[#977653]/5 text-[#1E293B]'
                                : 'border-[#E2E8F0] bg-white text-[#64748B] hover:bg-[#F7F6F4]',
                            )}
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={() => toggleMenuPermission(mod.key)}
                              className="pointer-events-none"
                            />
                            <ModIcon size={14} />
                            <span>{mod.label}</span>
                          </motion.button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Feature Permission Matrix */}
                  <div className="space-y-4">
                    <h4 className="text-sm font-semibold text-[#1E293B]">功能权限矩阵</h4>
                    <p className="text-xs text-[#94A3B8]">该权限组成员可操作的具体功能</p>
                    <div className="space-y-4">
                      {MODULES.map((mod) => {
                        const ModIcon = mod.icon;
                        const modPerms = FEATURE_PERMISSIONS[mod.key] || [];
                        const modCodes = modPerms.map((p) => p.code);
                        const checkedCount = modCodes.filter((c) => currentFeatures.includes(c)).length;
                        const allChecked = modCodes.length > 0 && checkedCount === modCodes.length;
                        const someChecked = checkedCount > 0 && checkedCount < modCodes.length;

                        return (
                          <motion.div
                            key={mod.key}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.03 }}
                            className="border border-[#E2E8F0] rounded-lg p-4"
                          >
                            <div className="flex items-center gap-2 mb-3">
                              <Checkbox
                                checked={allChecked}
                                data-state={someChecked ? 'indeterminate' : allChecked ? 'checked' : 'unchecked'}
                                onCheckedChange={() => toggleModuleAllFeatures(mod.key)}
                              />
                              <ModIcon size={16} className="text-[#64748B]" />
                              <span className="text-sm font-semibold text-[#1E293B]">{mod.label}</span>
                              <span className="text-xs text-[#94A3B8] ml-1">({checkedCount}/{modPerms.length})</span>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 pl-6">
                              {modPerms.map((perm) => {
                                const checked = currentFeatures.includes(perm.code);
                                return (
                                  <motion.label
                                    key={perm.code}
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="flex items-center gap-2 text-sm text-[#64748B] cursor-pointer hover:text-[#1E293B] transition-colors"
                                  >
                                    <Checkbox
                                      checked={checked}
                                      onCheckedChange={() => toggleFeaturePermission(perm.code)}
                                    />
                                    <span>{perm.label}</span>
                                  </motion.label>
                                );
                              })}
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Footer Actions */}
            {changed && (
              <div className="p-4 border-t border-[#E2E8F0] flex justify-end gap-3">
                <Button variant="outline" onClick={handleCancel}>取消</Button>
                <Button onClick={handleSave} className="bg-[#977653] hover:bg-[#7A5F42] text-white gap-2">
                  <Save size={16} /> {isAdding ? '创建权限组' : '保存配置'}
                </Button>
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center p-12">
            <div className="text-center">
              <Shield size={48} className="mx-auto text-[#CBD5E1] mb-3" />
              <h4 className="text-base font-semibold text-[#1E293B]">暂无权限组</h4>
              <p className="text-sm text-[#94A3B8] mt-1">点击左侧"+"按钮创建新的权限组</p>
            </div>
          </div>
        )}
      </motion.div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[#EF4444]">
              <Trash2 size={18} />
              删除权限组
            </DialogTitle>
            <DialogDescription>
              确定要删除权限组 "{deleteTarget?.name}" 吗？此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>取消</Button>
            <Button onClick={confirmDelete} className="bg-[#EF4444] hover:bg-[#DC2626] text-white gap-2">
              <Trash2 size={14} /> 确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab 3: Audit Log                                                   */
/* ------------------------------------------------------------------ */
function AuditLogTab() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [search, setSearch] = useState('');
  const [userFilter, setUserFilter] = useState('all');
  const [actionFilter, setActionFilter] = useState('all');
  const [moduleFilter, setModuleFilter] = useState('all');

  useEffect(() => {
    let mounted = true;
    fetchAuditLogs({ pageSize: 200 })
      .then((res) => {
        if (mounted) setLogs(res.list);
      })
      .catch((e) => {
        if (mounted) toast.error((e as Error)?.message || '审计日志加载失败');
      });
    return () => {
      mounted = false;
    };
  }, []);

  const filtered = useMemo(() => {
    return logs.filter((l) => {
      if (search && !l.user_name.includes(search) && !l.description.includes(search)) return false;
      if (userFilter !== 'all' && l.user_name !== userFilter) return false;
      if (actionFilter !== 'all' && l.action !== actionFilter) return false;
      if (moduleFilter !== 'all' && l.module !== moduleFilter) return false;
      return true;
    });
  }, [logs, search, userFilter, actionFilter, moduleFilter]);

  const uniqueUsers = useMemo(() => [...new Set(logs.map((l) => l.user_name))], [logs]);
  const uniqueActions = useMemo(() => [...new Set(logs.map((l) => l.action))], [logs]);
  const uniqueModules = useMemo(() => [...new Set(logs.map((l) => l.module))], [logs]);

  // Group by date for timeline
  const groupedByDate = useMemo(() => {
    const map: Record<string, AuditLog[]> = {};
    filtered.forEach((l) => {
      const date = l.timestamp.split(' ')[0];
      if (!map[date]) map[date] = [];
      map[date].push(l);
    });
    return Object.entries(map).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtered]);

  const actionDotColor: Record<string, string> = {
    '新增': '#10B981',
    '修改': '#3B82F6',
    '删除': '#EF4444',
    '查看': '#94A3B8',
    '登录': '#977653',
    '登出': '#CBD5E1',
    '导出': '#F59E0B',
  };

  return (
    <div className="space-y-4">
      {/* Filter */}
      <div className="bg-white rounded-lg p-4 shadow-sm flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
          <Input placeholder="搜索用户、描述..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-[200px] pl-9" />
        </div>
        <Select value={userFilter} onValueChange={setUserFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="操作人" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部用户</SelectItem>
            {uniqueUsers.map((u) => (<SelectItem key={u} value={u}>{u}</SelectItem>))}
          </SelectContent>
        </Select>
        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger className="w-[130px]"><SelectValue placeholder="操作类型" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部类型</SelectItem>
            {uniqueActions.map((a) => (<SelectItem key={a} value={a}>{a}</SelectItem>))}
          </SelectContent>
        </Select>
        <Select value={moduleFilter} onValueChange={setModuleFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="操作模块" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部模块</SelectItem>
            {uniqueModules.map((m) => (<SelectItem key={m} value={m}>{m}</SelectItem>))}
          </SelectContent>
        </Select>
        <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setUserFilter('all'); setActionFilter('all'); setModuleFilter('all'); }}>
          <RotateCcw size={14} className="mr-1" /> 重置
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" className="text-xs" onClick={() => exportAuditLogs(logs)}>
            <Download size={14} className="mr-1" /> 导出CSV
          </Button>
        </div>
      </div>

      {/* Timeline View */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        {groupedByDate.length === 0 ? (
          <div className="text-center py-12">
            <ClipboardList size={48} className="mx-auto text-[#CBD5E1] mb-3" />
            <h4 className="text-base font-semibold text-[#1E293B]">暂无审计日志</h4>
          </div>
        ) : (
          <div className="space-y-6">
            {groupedByDate.map(([date, dayLogs]) => (
              <div key={date} className="relative">
                {/* Date header */}
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-2 h-2 rounded-full bg-[#977653]" />
                  <span className="text-sm font-semibold text-[#1E293B]">{date}</span>
                  <div className="flex-1 h-px bg-[#E2E8F0]" />
                  <span className="text-xs text-[#94A3B8]">{dayLogs.length} 条记录</span>
                </div>
                {/* Timeline entries */}
                <div className="ml-1 pl-4 border-l-2 border-[#E2E8F0] space-y-3">
                  {dayLogs.map((log, idx) => (
                    <motion.div
                      key={log.id}
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.03 }}
                      className="relative pl-4"
                    >
                      {/* Dot */}
                      <div
                        className="absolute -left-[21px] top-2 w-3 h-3 rounded-full border-2 border-white shadow-sm"
                        style={{ backgroundColor: actionDotColor[log.action] || '#94A3B8' }}
                      />
                      <div className="flex items-start gap-3 p-3 rounded-lg bg-[#F7F6F4]/50 hover:bg-[#F7F6F4] transition-colors">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs text-[#94A3B8] font-mono">{log.timestamp.split(' ')[1]}</span>
                            <Badge className={cn('text-[10px] font-normal', ACTION_BADGE[log.action])}>{log.action}</Badge>
                            <Badge className={cn('text-[10px] font-normal', MODULE_BADGE[log.module])}>{log.module}</Badge>
                            <span className="text-sm font-medium text-[#1E293B]">{log.user_name}</span>
                            <Badge className={cn('text-[10px] font-normal', ROLE_BADGE[ROLES.find((r) => r.name === log.user_role)?.code || 'viewer'])}>
                              {log.user_role}
                            </Badge>
                          </div>
                          <div className="text-sm text-[#64748B] mt-1">
                            {log.description} · <span className="text-[#94A3B8]">{log.target}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-[#94A3B8]">IP: {log.ip_address}</span>
                            <Badge className={cn('text-[10px] font-normal', log.status === '成功' ? 'bg-success-50 text-success-600' : 'bg-danger-50 text-danger-600')}>
                              {log.status}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab 4: System Settings                                             */
/* ------------------------------------------------------------------ */
function SystemSettingsTab() {
  const [settings, setSettings] = useState({
    school_name: '启智特殊教育学校',
    school_address: '北京市朝阳区教育路100号',
    school_phone: '010-12345678',
    iep_cycle: '6个月',
    data_retention: '3年',
    file_upload_limit: 50,
    password_min_length: 8,
    password_complexity: ['uppercase', 'lowercase', 'number'] as string[],
    login_fail_lock: 5,
    lock_duration: 30,
    session_timeout: 30,
    force_change_password: true,
    iep_notify: true,
    signature_reminder: true,
    reminder_interval: 7,
    evaluation_reminder: true,
    notify_channels: ['system', 'sms'] as string[],
  });
  const [changed, setChanged] = useState(false);

  useEffect(() => {
    let mounted = true;
    fetchSystemSettings()
      .then((data) => {
        if (!mounted) return;
        setSettings((prev) => {
          const next = { ...prev };
          (Object.keys(prev) as (keyof typeof prev)[]).forEach((key) => {
            if (data[key] === undefined || data[key] === null) return;
            const raw = String(data[key]);
            const current = prev[key];
            if (typeof current === 'boolean') {
              (next as Record<string, unknown>)[key] = raw === '1' || raw.toLowerCase() === 'true';
            } else if (typeof current === 'number') {
              const n = Number(raw);
              if (Number.isFinite(n)) (next as Record<string, unknown>)[key] = n;
            } else if (Array.isArray(current)) {
              try {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) (next as Record<string, unknown>)[key] = parsed.map(String);
              } catch {
                (next as Record<string, unknown>)[key] = raw.split(',').map((s) => s.trim()).filter(Boolean);
              }
            } else {
              (next as Record<string, unknown>)[key] = raw;
            }
          });
          return next;
        });
      })
      .catch((e) => {
        if (mounted) toast.error((e as Error)?.message || '系统设置加载失败');
      });
    return () => {
      mounted = false;
    };
  }, []);

  const update = (field: string, value: unknown) => {
    setSettings((prev) => ({ ...prev, [field]: value }));
    setChanged(true);
  };

  const handleSave = async () => {
    try {
      const payload: Record<string, string> = {};
      Object.entries(settings).forEach(([key, value]) => {
        if (typeof value === 'boolean') payload[key] = value ? '1' : '0';
        else if (Array.isArray(value)) payload[key] = JSON.stringify(value);
        else payload[key] = String(value);
      });
      await saveSystemSettings(payload);
      toast.success('设置已保存');
      setChanged(false);
    } catch (e) {
      toast.error((e as Error)?.message || '保存设置失败');
    }
  };

  return (
    <div className="space-y-4">
      {/* Basic Settings */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-xl shadow-sm p-6"
      >
        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-[#E2E8F0]">
          <Cog size={18} className="text-[#977653]" />
          <h3 className="text-base font-semibold text-[#1E293B]">基本设置</h3>
        </div>
        <div className="grid grid-cols-2 gap-5">
          <div>
            <label className="block text-sm font-medium text-[#1E293B] mb-1.5">学校名称</label>
            <Input value={settings.school_name} onChange={(e) => update('school_name', e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-[#1E293B] mb-1.5">联系电话</label>
            <Input value={settings.school_phone} onChange={(e) => update('school_phone', e.target.value)} />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium text-[#1E293B] mb-1.5">学校地址</label>
            <Input value={settings.school_address} onChange={(e) => update('school_address', e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-[#1E293B] mb-1.5">IEP默认周期</label>
            <Select value={settings.iep_cycle} onValueChange={(v) => update('iep_cycle', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="3个月">3个月</SelectItem>
                <SelectItem value="6个月">6个月</SelectItem>
                <SelectItem value="12个月">12个月</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="block text-sm font-medium text-[#1E293B] mb-1.5">文件上传限制 (MB)</label>
            <Input type="number" value={settings.file_upload_limit} onChange={(e) => update('file_upload_limit', Number(e.target.value))} />
          </div>
        </div>
      </motion.div>

      {/* Security Settings */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="bg-white rounded-xl shadow-sm p-6"
      >
        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-[#E2E8F0]">
          <ShieldCheck size={18} className="text-[#977653]" />
          <h3 className="text-base font-semibold text-[#1E293B]">安全设置</h3>
        </div>
        <div className="grid grid-cols-2 gap-5">
          <div>
            <label className="block text-sm font-medium text-[#1E293B] mb-1.5">密码最小长度</label>
            <Input type="number" value={settings.password_min_length} onChange={(e) => update('password_min_length', Number(e.target.value))} min={6} max={32} />
          </div>
          <div>
            <label className="block text-sm font-medium text-[#1E293B] mb-1.5">登录失败锁定次数</label>
            <Input type="number" value={settings.login_fail_lock} onChange={(e) => update('login_fail_lock', Number(e.target.value))} min={3} max={10} />
          </div>
          <div>
            <label className="block text-sm font-medium text-[#1E293B] mb-1.5">锁定时间 (分钟)</label>
            <Input type="number" value={settings.lock_duration} onChange={(e) => update('lock_duration', Number(e.target.value))} min={5} max={120} />
          </div>
          <div>
            <label className="block text-sm font-medium text-[#1E293B] mb-1.5">会话超时 (分钟)</label>
            <Input type="number" value={settings.session_timeout} onChange={(e) => update('session_timeout', Number(e.target.value))} min={10} max={120} />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium text-[#1E293B] mb-2">密码复杂度要求</label>
            <div className="flex flex-wrap gap-4">
              {['uppercase', 'lowercase', 'number', 'special'].map((type) => (
                <label key={type} className="flex items-center gap-2 text-sm text-[#64748B] cursor-pointer">
                  <Checkbox
                    checked={settings.password_complexity.includes(type)}
                    onCheckedChange={(checked) => {
                      if (checked) update('password_complexity', [...settings.password_complexity, type]);
                      else update('password_complexity', settings.password_complexity.filter((c) => c !== type));
                    }}
                  />
                  {type === 'uppercase' && '大写字母'}
                  {type === 'lowercase' && '小写字母'}
                  {type === 'number' && '数字'}
                  {type === 'special' && '特殊字符'}
                </label>
              ))}
            </div>
          </div>
          <div className="col-span-2 flex items-center gap-3">
            <Switch
              checked={settings.force_change_password}
              onCheckedChange={(v) => update('force_change_password', v)}
            />
            <label className="text-sm text-[#1E293B]">强制修改初始密码</label>
            <span className="text-xs text-[#94A3B8]">首次登录必须修改默认密码</span>
          </div>
        </div>
      </motion.div>

      {/* Notification Settings */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-white rounded-xl shadow-sm p-6"
      >
        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-[#E2E8F0]">
          <Bell size={18} className="text-[#977653]" />
          <h3 className="text-base font-semibold text-[#1E293B]">通知设置</h3>
        </div>
        <div className="space-y-4">
          <div className="flex items-center justify-between py-2 border-b border-[#F7F6F4]">
            <div>
              <div className="text-sm font-medium text-[#1E293B]">IEP审批通知</div>
              <div className="text-xs text-[#94A3B8]">有新IEP待审批时通知相关人员</div>
            </div>
            <Switch checked={settings.iep_notify} onCheckedChange={(v) => update('iep_notify', v)} />
          </div>
          <div className="flex items-center justify-between py-2 border-b border-[#F7F6F4]">
            <div>
              <div className="text-sm font-medium text-[#1E293B]">签名提醒</div>
              <div className="text-xs text-[#94A3B8]">自动发送签名提醒给家长</div>
            </div>
            <Switch checked={settings.signature_reminder} onCheckedChange={(v) => update('signature_reminder', v)} />
          </div>
          <div className="flex items-center gap-4 py-2 border-b border-[#F7F6F4]">
            <div className="flex-1">
              <div className="text-sm font-medium text-[#1E293B]">签名提醒间隔</div>
              <div className="text-xs text-[#94A3B8]">两次提醒之间的间隔天数</div>
            </div>
            <Input type="number" value={settings.reminder_interval} onChange={(e) => update('reminder_interval', Number(e.target.value))} className="w-[100px]" min={1} max={30} />
            <span className="text-sm text-[#94A3B8]">天</span>
          </div>
          <div className="flex items-center justify-between py-2">
            <div>
              <div className="text-sm font-medium text-[#1E293B]">评估到期提醒</div>
              <div className="text-xs text-[#94A3B8]">评估即将到期时提醒</div>
            </div>
            <Switch checked={settings.evaluation_reminder} onCheckedChange={(v) => update('evaluation_reminder', v)} />
          </div>
        </div>
      </motion.div>

      {/* Save */}
      {changed && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-end gap-3 p-4 bg-white rounded-xl shadow-sm"
        >
          <Button variant="outline" onClick={() => setChanged(false)}>恢复默认</Button>
          <Button onClick={handleSave} className="bg-[#977653] hover:bg-[#7A5F42] text-white gap-2">
            <Save size={16} /> 保存设置
          </Button>
        </motion.div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main System Page                                                   */
/* ------------------------------------------------------------------ */
export default function System() {
  const [activeTab, setActiveTab] = useState('users');

  return (
    <div className="p-6">
      {/* Page Header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <h1 className="text-[28px] font-bold text-[#1E293B] leading-tight">系统管理</h1>
        <p className="text-sm text-[#64748B] mt-1">用户、角色、权限与系统配置</p>
      </motion.div>

      {/* Tabs */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6 bg-white border border-[#E2E8F0] p-1 h-auto">
            <TabsTrigger value="users" className="data-[state=active]:bg-[#977653] data-[state=active]:text-white gap-1.5 px-4 py-2">
              <Users size={16} /> 用户管理
            </TabsTrigger>
            <TabsTrigger value="roles" className="data-[state=active]:bg-[#977653] data-[state=active]:text-white gap-1.5 px-4 py-2">
              <Shield size={16} /> 权限组管理
            </TabsTrigger>
            <TabsTrigger value="audit" className="data-[state=active]:bg-[#977653] data-[state=active]:text-white gap-1.5 px-4 py-2">
              <ClipboardList size={16} /> 审计日志
            </TabsTrigger>
            <TabsTrigger value="settings" className="data-[state=active]:bg-[#977653] data-[state=active]:text-white gap-1.5 px-4 py-2">
              <Settings size={16} /> 系统设置
            </TabsTrigger>
          </TabsList>

          <AnimatePresence mode="wait">
            <TabsContent value="users" className="mt-0">
              <motion.div key="users" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <UserManagementTab />
              </motion.div>
            </TabsContent>
            <TabsContent value="roles" className="mt-0">
              <motion.div key="roles" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <PermissionGroupManagementTab />
              </motion.div>
            </TabsContent>
            <TabsContent value="audit" className="mt-0">
              <motion.div key="audit" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <AuditLogTab />
              </motion.div>
            </TabsContent>
            <TabsContent value="settings" className="mt-0">
              <motion.div key="settings" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <SystemSettingsTab />
              </motion.div>
            </TabsContent>
          </AnimatePresence>
        </Tabs>
      </motion.div>
    </div>
  );
}
