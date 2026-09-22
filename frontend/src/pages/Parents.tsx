import { useState, useMemo, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  Users, PenTool, MessageSquare, Bell, Search, Plus,
  Eye, Pencil, Send, CheckCircle, Clock,
  RotateCcw, AlertTriangle,
} from 'lucide-react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from '@/components/ui/sheet';
import {
  Tabs, TabsList, TabsTrigger, TabsContent,
} from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { useDataScopeConfig, useIsReadOnly, filterByDataScope, filterParentData } from '@/utils/dataScope';
import ImportExportActions from '@/components/io/ImportExportActions';
import {
  fetchParents,
  createParent,
  updateParent,
  fetchCommunications,
  createCommunication,
  fetchSignatures,
} from '@/services/parents';
import { fetchStudents } from '@/services/students';

/* ------------------------------------------------------------------ */
/*  Helpers: Student Name ↔ ID mapping for data scope filtering       */
/* ------------------------------------------------------------------ */
const studentNameToId: Record<string, string> = {
  '王小明': 's1',
  '李小红': 's2',
  '张小刚': 's3',
  '赵小芳': 's4',
  '陈小华': 's5',
  '刘小军': 's6',
  '孙小丽': 's7',
  '周小强': 's8',
};

/**
 * 修复说明(P0-2)：原先此处为
 *     const readOnly = isReadOnly();
 *     const dataScopeConfig = getDataScopeConfig();
 * 写在**模块顶层**，模块在应用启动（尚未登录）时求值一次即永久冻结为 true，
 * 导致超管登录后「新增家长账号 / 发送签名 / 新建沟通记录 / 发布通知」等
 * 写操作按钮全部消失。现改为在各 Tab 组件内部通过 useIsReadOnly() 订阅求值。
 */

function DataScopeBadge() {
  // P0-2 修复：改用 hook 订阅 authStore，避免登录状态变化后徽标不刷新
  const config = useDataScopeConfig();
  if (config.type === 'all') return null;
  const labels: Record<string, string> = {
    class_only: '班级视图',
    teacher_related: '教师视图',
    own_only: '仅本人',
    none: '无权限',
  };
  const colors: Record<string, string> = {
    class_only: 'bg-info-50 text-info-600',
    teacher_related: 'bg-warning-50 text-warning-600',
    own_only: 'bg-success-50 text-success-600',
    none: 'bg-danger-50 text-danger-600',
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors[config.type] || 'bg-secondary-50 text-secondary-400'}`}>
      {labels[config.type] || config.type}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Mock Data                                                          */
/* ------------------------------------------------------------------ */
const STUDENTS = ['王小明', '李小红', '张小刚', '赵小芳', '陈小华', '刘小军', '孙小丽', '周小强'];
const RELATIONS = ['父亲', '母亲', '祖父', '祖母', '其他'];

interface ParentAccount {
  id: string;
  name: string;
  phone: string;
  email: string;
  relation: string;
  student_names: string[];
  student_ids: string[];
  login_count: number;
  last_login: string;
  status: '正常' | '未激活' | '已禁用';
  address: string;
  created_at: string;
  remark: string;
}

interface SignatureRecord {
  id: string;
  student_name: string;
  iep_title: string;
  iep_period: string;
  iep_status: string;
  signature_status: '待签名' | '已签名' | '已过期';
  signed_date: string | null;
  send_count: number;
  last_sent: string;
  parent_name: string;
}

interface CommunicationRecord {
  id: string;
  date: string;
  student_name: string;
  parent_name: string;
  teacher_name: string;
  comm_type: '面谈' | '电话' | '微信' | '家访' | '其他';
  subject: string;
  content: string;
  follow_up: string;
  teacher_feedback: string;
}

interface NotificationRecord {
  id: string;
  title: string;
  notif_type: string;
  recipients: number;
  read_count: number;
  status: '发送中' | '已完成' | '定时发送' | '发送失败';
  sent_at: string;
  priority: '高' | '中' | '低';
  content: string;
}

function generateMockData() {
  const parents: ParentAccount[] = [
    { id: 'p1', name: '王建国', phone: '13800138001', email: 'wang@example.com', relation: '父亲', student_names: ['王小明'], student_ids: ['s1'], login_count: 45, last_login: '2025-01-18 14:30', status: "正常" as "正常" | "未激活" | "已禁用", address: '北京市朝阳区XX路1号', created_at: '2024-06-01', remark: '' },
    { id: 'p2', name: '李美华', phone: '13800138002', email: 'li@example.com', relation: '母亲', student_names: ['李小红'], student_ids: ['s2'], login_count: 32, last_login: '2025-01-17 09:15', status: "正常" as "正常" | "未激活" | "已禁用", address: '北京市海淀区YY街2号', created_at: '2024-06-02', remark: '' },
    { id: 'p3', name: '张大伟', phone: '13800138003', email: 'zhang@example.com', relation: '父亲', student_names: ['张小刚'], student_ids: ['s3'], login_count: 12, last_login: '2025-01-10 16:45', status: "正常" as "正常" | "未激活" | "已禁用", address: '北京市丰台区ZZ路3号', created_at: '2024-07-15', remark: '' },
    { id: 'p4', name: '赵丽娟', phone: '13800138004', email: '', relation: '母亲', student_names: ['赵小芳'], student_ids: ['s4'], login_count: 0, last_login: '', status: '未激活', address: '北京市东城区AA街4号', created_at: '2025-01-05', remark: '新添加家长' },
    { id: 'p5', name: '陈秀兰', phone: '13800138005', email: 'chen@example.com', relation: '祖母', student_names: ['陈小华'], student_ids: ['s5'], login_count: 8, last_login: '2025-01-15 11:20', status: "正常" as "正常" | "未激活" | "已禁用", address: '北京市西城区BB路5号', created_at: '2024-08-20', remark: '' },
    { id: 'p6', name: '刘志刚', phone: '13800138006', email: '', relation: '父亲', student_names: ['刘小军'], student_ids: ['s6'], login_count: 0, last_login: '', status: '已禁用', address: '北京市通州区CC街6号', created_at: '2024-09-01', remark: '账号异常' },
    { id: 'p7', name: '孙雅琴', phone: '13800138007', email: 'sun@example.com', relation: '母亲', student_names: ['孙小丽'], student_ids: ['s7'], login_count: 28, last_login: '2025-01-18 08:50', status: "正常" as "正常" | "未激活" | "已禁用", address: '北京市昌平区DD路7号', created_at: '2024-06-10', remark: '' },
    { id: 'p8', name: '周建国', phone: '13800138008', email: '', relation: '祖父', student_names: ['周小强'], student_ids: ['s8'], login_count: 3, last_login: '2025-01-12 15:30', status: "正常" as "正常" | "未激活" | "已禁用", address: '北京市大兴区EE街8号', created_at: '2024-11-01', remark: '' },
    { id: 'p9', name: '王淑芬', phone: '13800138009', email: 'wangsf@example.com', relation: '母亲', student_names: ['王小明'], student_ids: ['s1'], login_count: 15, last_login: '2025-01-16 10:00', status: "正常" as "正常" | "未激活" | "已禁用", address: '北京市朝阳区XX路1号', created_at: '2024-06-01', remark: '同王小明' },
    { id: 'p10', name: '李明德', phone: '13800138010', email: '', relation: '父亲', student_names: ['李小红'], student_ids: ['s2'], login_count: 0, last_login: '', status: '未激活', address: '北京市海淀区YY街2号', created_at: '2025-01-10', remark: '新添加家长' },
  ];

  const signatures: SignatureRecord[] = [
    { id: 'sig1', student_name: '王小明', iep_title: '2025年度上学期IEP计划', iep_period: '2025.01 ~ 2025.06', iep_status: '已通过', signature_status: '待签名', signed_date: null, send_count: 2, last_sent: '2025-01-18 10:00', parent_name: '王建国' },
    { id: 'sig2', student_name: '李小红', iep_title: '2025年度上学期IEP计划', iep_period: '2025.01 ~ 2025.06', iep_status: '已通过', signature_status: '已签名', signed_date: '2025-01-15', send_count: 1, last_sent: '2025-01-14 09:30', parent_name: '李美华' },
    { id: 'sig3', student_name: '张小刚', iep_title: '2025年度上学期IEP计划', iep_period: '2025.01 ~ 2025.06', iep_status: '已通过', signature_status: '待签名', signed_date: null, send_count: 3, last_sent: '2025-01-17 14:00', parent_name: '张大伟' },
    { id: 'sig4', student_name: '赵小芳', iep_title: '2025年度上学期IEP计划', iep_period: '2025.01 ~ 2025.06', iep_status: '已通过', signature_status: '待签名', signed_date: null, send_count: 1, last_sent: '2025-01-18 08:00', parent_name: '赵丽娟' },
    { id: 'sig5', student_name: '陈小华', iep_title: '2025年度上学期IEP计划', iep_period: '2025.01 ~ 2025.06', iep_status: '已通过', signature_status: '已签名', signed_date: '2025-01-12', send_count: 1, last_sent: '2025-01-11 16:00', parent_name: '陈秀兰' },
    { id: 'sig6', student_name: '刘小军', iep_title: '2025年度上学期IEP计划', iep_period: '2025.01 ~ 2025.06', iep_status: '已通过', signature_status: '已过期', signed_date: null, send_count: 5, last_sent: '2025-01-10 10:00', parent_name: '刘志刚' },
    { id: 'sig7', student_name: '孙小丽', iep_title: '2025年度上学期IEP计划', iep_period: '2025.01 ~ 2025.06', iep_status: '已通过', signature_status: '已签名', signed_date: '2025-01-16', send_count: 2, last_sent: '2025-01-15 11:00', parent_name: '孙雅琴' },
    { id: 'sig8', student_name: '周小强', iep_title: '2025年度上学期IEP计划', iep_period: '2025.01 ~ 2025.06', iep_status: '已通过', signature_status: '待签名', signed_date: null, send_count: 2, last_sent: '2025-01-17 09:00', parent_name: '周建国' },
  ];

  const communications: CommunicationRecord[] = [
    { id: 'c1', date: '2025-01-18', student_name: '王小明', parent_name: '王建国', teacher_name: '王老师', comm_type: '电话', subject: '小明本周在校表现反馈', content: '电话沟通了王小明本周在语言训练课上的表现。能正确指认8种动物图片，仿说三字词组正确率提升至80%。建议家长在家继续练习「我要+名词」的句式。', follow_up: '下周继续观察，家长每日练习15分钟', teacher_feedback: '进步明显，继续保持' },
    { id: 'c2', date: '2025-01-17', student_name: '李小红', parent_name: '李美华', teacher_name: '李老师', comm_type: '面谈', subject: 'IEP目标讨论', content: '在家长接待室进行了面谈，讨论了本学期IEP目标的设定。家长希望增加社交互动方面的训练内容。', follow_up: '调整IEP目标，增加社交游戏环节', teacher_feedback: '家长配合度高' },
    { id: 'c3', date: '2025-01-16', student_name: '张小刚', parent_name: '张大伟', teacher_name: '张老师', comm_type: '微信', subject: '穿脱外套训练进展', content: '微信沟通了张小刚在生活自理训练中的进展。目前能独立完成拉链操作，扣纽扣仍需辅助。', follow_up: '家长在家练习时使用分解步骤法', teacher_feedback: '家庭配合良好' },
    { id: 'c4', date: '2025-01-15', student_name: '赵小芳', parent_name: '赵丽娟', teacher_name: '赵老师', comm_type: '家访', subject: '家庭环境评估', content: '到家中进行家访，了解了赵小芳的家庭生活环境和日常作息。家长反馈孩子在家情绪波动较大。', follow_up: '制定家庭情绪管理计划', teacher_feedback: '需关注家庭教养方式' },
    { id: 'c5', date: '2025-01-14', student_name: '陈小华', parent_name: '陈秀兰', teacher_name: '王老师', comm_type: '电话', subject: '注意力训练反馈', content: '电话沟通了陈小华在注意力训练中的表现。通过积木游戏，持续专注时间已达到8分钟。', follow_up: '逐步增加干扰因素，提升抗干扰能力', teacher_feedback: '进步稳定' },
    { id: 'c6', date: '2025-01-13', student_name: '刘小军', parent_name: '刘志刚', teacher_name: '李老师', comm_type: '其他', subject: '请假及作业安排', content: '家长短信请假3天，沟通了请假期间的居家练习安排。', follow_up: '返校后进行补课', teacher_feedback: '已安排补课' },
    { id: 'c7', date: '2025-01-12', student_name: '孙小丽', parent_name: '孙雅琴', teacher_name: '张老师', comm_type: '微信', subject: '音乐治疗课表现', content: '微信分享了孙小丽在音乐治疗课上的视频片段。能跟随节奏做拍手动作，对欢快的儿歌反应积极。', follow_up: '家长在家播放儿歌，引导跟随律动', teacher_feedback: '音乐治疗效果好' },
    { id: 'c8', date: '2025-01-10', student_name: '周小强', parent_name: '周建国', teacher_name: '赵老师', comm_type: '面谈', subject: 'IEP签名确认', content: '家长到校签署IEP计划，详细解释了各项目标的设定依据。', follow_up: '关注签名进度', teacher_feedback: '家长理解并同意' },
  ];

  const notifications: NotificationRecord[] = [
    { id: 'n1', title: '2025年度上学期IEP签名通知', notif_type: 'IEP签名提醒', recipients: 8, read_count: 5, status: '发送中', sent_at: '2025-01-18 10:00', priority: '高', content: '尊敬的家长，您孩子的2025年度上学期个别化教育计划（IEP）已制定完成，请在系统中查看并签名确认。' },
    { id: 'n2', title: '本月家长开放日通知', notif_type: '会议通知', recipients: 20, read_count: 18, status: '已完成', sent_at: '2025-01-15 09:00', priority: '中', content: '学校将于1月25日举行家长开放日活动，欢迎各位家长参加。' },
    { id: 'n3', title: '期末评估安排', notif_type: '评估通知', recipients: 8, read_count: 7, status: '已完成', sent_at: '2025-01-12 14:00', priority: '高', content: '期末评估将于1月20日至24日进行，请各位家长配合。' },
    { id: 'n4', title: '寒假放假通知', notif_type: '一般通知', recipients: 50, read_count: 42, status: '发送中', sent_at: '2025-01-18 08:00', priority: '中', content: '寒假将于1月27日开始，2月16日返校。请家长做好假期安排。' },
    { id: 'n5', title: '家长培训讲座：家庭干预技巧', notif_type: '会议通知', recipients: 30, read_count: 15, status: '发送中', sent_at: '2025-01-17 16:00', priority: '低', content: '学校将于1月22日举办家长培训讲座，主题为家庭干预技巧。' },
    { id: 'n6', title: '紧急通知：明日停课安排', notif_type: '一般通知', recipients: 50, read_count: 48, status: '已完成', sent_at: '2025-01-10 20:00', priority: '高', content: '因天气原因，明日（1月11日）停课一天，请家长做好安排。' },
    { id: 'n7', title: '定期签名提醒', notif_type: 'IEP签名提醒', recipients: 3, read_count: 0, status: '定时发送', sent_at: '2025-01-20 09:00', priority: '中', content: '提醒家长及时完成IEP签名确认。' },
  ];

  return { parents, signatures, communications, notifications };
}

const { parents: INITIAL_PARENTS, signatures: INITIAL_SIGNATURES, communications: INITIAL_COMMUNICATIONS, notifications: INITIAL_NOTIFICATIONS } = generateMockData();

/* ------------------------------------------------------------------ */
/*  Data Scope Filtering                                               */
/* ------------------------------------------------------------------ */
const studentIdToClass: Record<string, string> = {
  's1': 'c1', 's2': 'c1', 's3': 'c2', 's4': 'c2',
  's5': 'c3', 's6': 'c3', 's7': 'c1', 's8': 'c2',
};

/**
 * Filter parent accounts by data scope (custom: student_ids is an array)
 *
 * 修复说明(P0-2)：原本是一个在**模块顶层**立即执行的 IIFE，
 * 应用启动时用户尚未登录，getDataScopeConfig().type 恒为 'none'，
 * 于是顶层常量被永久冻结为空数组 —— 登录成功后家长账号列表依旧一片空白。
 * 现改为接收 config 的纯函数，由组件在订阅到权限后调用。
 */
function getScopedParents(config: ReturnType<typeof useDataScopeConfig>): ParentAccount[] {
  if (config.type === 'all') return INITIAL_PARENTS;
  if (config.type === 'none') return [];
  if (config.type === 'class_only') {
    return INITIAL_PARENTS.filter((p) =>
      p.student_ids.some((sid) => {
        const cid = studentIdToClass[sid];
        return cid && config.classIds.includes(cid);
      })
    );
  }
  return filterByDataScope(
    INITIAL_PARENTS,
    (p) => p.student_ids[0],
    (p) => studentIdToClass[p.student_ids[0]],
  );
}

// 修复（三维度回测 0919 · P1-2）：原「按数据范围过滤的 mock 签名」常量已删除。
// 家长签名只能来自后端真实记录，任何本地伪造都会在法律效力环节造成误导。

// Filter communications by data scope
const scopedCommunications = filterByDataScope(
  INITIAL_COMMUNICATIONS,
  (c) => studentNameToId[c.student_name],
);

/* ------------------------------------------------------------------ */
/*  Badge Configs                                                      */
/* ------------------------------------------------------------------ */
const PARENT_STATUS: Record<string, string> = {
  '正常': 'bg-success-50 text-success-600',
  '未激活': 'bg-warning-50 text-warning-600',
  '已禁用': 'bg-danger-50 text-danger-600',
};

const SIGNATURE_STATUS: Record<string, { className: string; icon: typeof Clock }> = {
  '待签名': { className: 'bg-warning-50 text-warning-600', icon: Clock },
  '已签名': { className: 'bg-success-50 text-success-600', icon: CheckCircle },
  '已过期': { className: 'bg-danger-50 text-danger-600', icon: AlertTriangle },
};

const COMM_TYPE: Record<string, string> = {
  '面谈': 'bg-primary-50 text-primary-700',
  '电话': 'bg-info-50 text-info-600',
  '微信': 'bg-success-50 text-success-600',
  '家访': 'bg-warning-50 text-warning-600',
  '其他': 'bg-secondary-50 text-secondary-400',
};

const NOTIF_STATUS: Record<string, string> = {
  '发送中': 'bg-info-50 text-info-600',
  '已完成': 'bg-success-50 text-success-600',
  '定时发送': 'bg-warning-50 text-warning-600',
  '发送失败': 'bg-danger-50 text-danger-600',
};

const PRIORITY_CONFIG: Record<string, string> = {
  '高': 'bg-danger-50 text-danger-600',
  '中': 'bg-warning-50 text-warning-600',
  '低': 'bg-secondary-50 text-secondary-400',
};

/* ------------------------------------------------------------------ */
/*  Tab 1: Parent Accounts                                             */
/* ------------------------------------------------------------------ */
function ParentAccountsTab() {
  const readOnly = useIsReadOnly();
  const [parents, setParents] = useState<ParentAccount[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [studentFilter, setStudentFilter] = useState('all');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingParent, setEditingParent] = useState<ParentAccount | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailParent, setDetailParent] = useState<ParentAccount | null>(null);

  // P0-2 修复：在组件内订阅权限，避免顶层冻结导致回退列表恒为空
  const dataScopeConfig = useDataScopeConfig();
  const scopedParents = useMemo(() => getScopedParents(dataScopeConfig), [dataScopeConfig]);

  const loadParents = useCallback(async () => {
    try {
      const res = await fetchParents({ page: 1, pageSize: 200 });
      setParents(res.list);
    } catch {
      // 后端不可用时回退本地 mock
      setParents(scopedParents);
    }
  }, [scopedParents]);

  useEffect(() => {
    loadParents();
  }, [loadParents]);

  const filtered = useMemo(() => {
    return parents.filter((p) => {
      if (search && !p.name.includes(search) && !p.phone.includes(search)) return false;
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (studentFilter !== 'all' && !p.student_names.includes(studentFilter)) return false;
      return true;
    });
  }, [parents, search, statusFilter, studentFilter]);

  const handleSave = async (data: Partial<ParentAccount>) => {
    try {
      if (editingParent) {
        await updateParent(editingParent.id, {
          name: data.name,
          phone: data.phone,
          relation: data.relation,
          email: data.email,
          address: data.address,
          is_active: data.status === '已禁用' ? 0 : 1,
        });
        toast.success('家长信息已更新');
      } else {
        await createParent({
          name: data.name ?? '',
          phone: data.phone ?? '',
          relation: data.relation,
          email: data.email,
          address: data.address,
        });
        toast.success('家长账号已创建');
      }
      await loadParents();
    } catch {
      toast.error('保存失败');
    }
    setDrawerOpen(false);
    setEditingParent(null);
  };

  return (
    <div className="space-y-4">
      {/* Filter */}
      <div className="bg-white rounded-lg p-4 shadow-sm flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
          <Input placeholder="搜索家长姓名、电话..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-[220px] pl-9" />
        </div>
        <Select value={studentFilter} onValueChange={setStudentFilter}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="关联学生" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部学生</SelectItem>
            {STUDENTS.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="账号状态" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            <SelectItem value="正常">正常</SelectItem>
            <SelectItem value="未激活">未激活</SelectItem>
            <SelectItem value="已禁用">已禁用</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setStatusFilter('all'); setStudentFilter('all'); }}>
          <RotateCcw size={14} className="mr-1" /> 重置
        </Button>
        <ImportExportActions
          module="parents"
          filenameBase="家长账号"
          readOnly={readOnly}
          exportParams={{ keyword: search.trim() || undefined }}
          onImported={() => {
            void loadParents();
          }}
        />
        {!readOnly && (
          <div className="ml-auto">
            <Button onClick={() => { setEditingParent(null); setDrawerOpen(true); }} className="bg-[#977653] hover:bg-[#7A5F42] text-white gap-2">
              <Plus size={16} /> 添加家长
            </Button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-[#F7F6F4] hover:bg-[#F7F6F4]">
              <TableHead className="text-xs text-[#94A3B8] font-semibold">家长姓名</TableHead>
              <TableHead className="text-xs text-[#94A3B8] font-semibold">电话</TableHead>
              <TableHead className="text-xs text-[#94A3B8] font-semibold">关联学生</TableHead>
              <TableHead className="text-xs text-[#94A3B8] font-semibold">关系</TableHead>
              <TableHead className="text-xs text-[#94A3B8] font-semibold">登录次数</TableHead>
              <TableHead className="text-xs text-[#94A3B8] font-semibold">最近登录</TableHead>
              <TableHead className="text-xs text-[#94A3B8] font-semibold">状态</TableHead>
              <TableHead className="text-xs text-[#94A3B8] font-semibold text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((p) => (
              <TableRow key={p.id} className="hover:bg-[#F7F6F4] transition-colors">
                <TableCell>
                  <div>
                    <div className="text-sm font-semibold text-[#1E293B]">{p.name}</div>
                    <div className="text-xs text-[#94A3B8]">{p.id}</div>
                  </div>
                </TableCell>
                <TableCell className="text-sm text-[#1E293B]">{p.phone}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {p.student_names.map((s) => (
                      <span key={s} className="inline-flex items-center gap-1 text-xs bg-primary-50 text-primary-700 px-2 py-0.5 rounded-full">
                        <span className="w-4 h-4 rounded-full bg-primary-100 flex items-center justify-center text-[10px] font-bold">{s[0]}</span>
                        {s}
                      </span>
                    ))}
                  </div>
                </TableCell>
                <TableCell className="text-sm text-[#64748B]">{p.relation}</TableCell>
                <TableCell className="text-sm text-[#1E293B]">{p.login_count}</TableCell>
                <TableCell className="text-sm text-[#94A3B8]">{p.last_login || '—'}</TableCell>
                <TableCell>
                  <Badge className={cn('text-xs font-normal', PARENT_STATUS[p.status])}>{p.status}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => { setDetailParent(p); setDetailOpen(true); }}>
                      <Eye size={14} className="text-[#64748B]" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => { setEditingParent(p); setDrawerOpen(true); }}>
                      <Pencil size={14} className="text-[#64748B]" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Add/Edit Drawer */}
      <ParentFormDrawer open={drawerOpen} onClose={() => { setDrawerOpen(false); setEditingParent(null); }} parent={editingParent} onSave={handleSave} />

      {/* Detail Drawer */}
      <ParentDetailDrawer open={detailOpen} onClose={() => { setDetailOpen(false); setDetailParent(null); }} parent={detailParent} />
    </div>
  );
}

/* Parent Form Drawer */
function ParentFormDrawer({ open, onClose, parent, onSave }: { open: boolean; onClose: () => void; parent: ParentAccount | null; onSave: (d: Partial<ParentAccount>) => void }) {
  const [form, setForm] = useState({
    name: '', phone: '', password: '123456', email: '', relation: '父亲', student_names: [] as string[], address: '', status: "正常" as "正常" | "未激活" | "已禁用", remark: '',
  });

  useState(() => {
    if (parent) {
      setForm({
        name: parent.name, phone: parent.phone, password: '', email: parent.email,
        relation: parent.relation, student_names: parent.student_names,
        address: parent.address, status: parent.status as "正常" | "未激活" | "已禁用", remark: parent.remark,
      });
    }
  });

  const update = (field: string, value: unknown) => setForm((prev) => ({ ...prev, [field]: value }));

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-[560px] sm:max-w-[560px] p-0 overflow-y-auto">
        <SheetHeader className="p-6 border-b border-[#E2E8F0]">
          <SheetTitle>{parent ? '编辑家长' : '添加家长'}</SheetTitle>
          <SheetDescription>{parent ? '修改家长账号信息' : '创建新的家长账号'}</SheetDescription>
        </SheetHeader>
        <div className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[#1E293B] mb-1.5">家长姓名 <span className="text-[#EF4444]">*</span></label>
              <Input value={form.name} onChange={(e) => update('name', e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#1E293B] mb-1.5">手机号码 <span className="text-[#EF4444]">*</span></label>
              <Input value={form.phone} onChange={(e) => update('phone', e.target.value)} />
            </div>
          </div>
          {!parent && (
            <div>
              <label className="block text-sm font-medium text-[#1E293B] mb-1.5">初始密码 <span className="text-[#EF4444]">*</span></label>
              <Input value={form.password} onChange={(e) => update('password', e.target.value)} />
              <p className="text-xs text-[#94A3B8] mt-1">首次登录需修改密码</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[#1E293B] mb-1.5">与学生关系 <span className="text-[#EF4444]">*</span></label>
              <Select value={form.relation} onValueChange={(v) => update('relation', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{RELATIONS.map((r) => (<SelectItem key={r} value={r}>{r}</SelectItem>))}</SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#1E293B] mb-1.5">账号状态</label>
              <Select value={form.status} onValueChange={(v) => update('status', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="正常">正常</SelectItem>
                  <SelectItem value="未激活">未激活</SelectItem>
                  <SelectItem value="已禁用">已禁用</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-[#1E293B] mb-1.5">关联学生 <span className="text-[#EF4444]">*</span></label>
            <div className="flex flex-wrap gap-2 p-3 border border-[#E2E8F0] rounded-md">
              {STUDENTS.map((s) => (
                <label key={s} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <Checkbox checked={form.student_names.includes(s)} onCheckedChange={(checked) => {
                    if (checked) update('student_names', [...form.student_names, s]);
                    else update('student_names', form.student_names.filter((x) => x !== s));
                  }} />
                  {s}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-[#1E293B] mb-1.5">电子邮箱</label>
            <Input value={form.email} onChange={(e) => update('email', e.target.value)} placeholder="选填" />
          </div>
          <div>
            <label className="block text-sm font-medium text-[#1E293B] mb-1.5">家庭地址</label>
            <Input value={form.address} onChange={(e) => update('address', e.target.value)} placeholder="选填" />
          </div>
          <div>
            <label className="block text-sm font-medium text-[#1E293B] mb-1.5">备注</label>
            <Textarea value={form.remark} onChange={(e) => update('remark', e.target.value)} placeholder="选填" />
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

/* Parent Detail Drawer */
function ParentDetailDrawer({ open, onClose, parent }: { open: boolean; onClose: () => void; parent: ParentAccount | null }) {
  if (!parent) return null;
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-[560px] sm:max-w-[560px] p-0 overflow-y-auto">
        <SheetHeader className="p-6 border-b border-[#E2E8F0]">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-primary-50 flex items-center justify-center text-lg font-bold text-[#977653]">{parent.name[0]}</div>
            <div>
              <SheetTitle className="text-lg">{parent.name}</SheetTitle>
              <SheetDescription>{parent.phone} · {parent.relation}</SheetDescription>
            </div>
          </div>
        </SheetHeader>
        <div className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 rounded-lg bg-[#F7F6F4]">
              <div className="text-xs text-[#94A3B8] mb-1">账号状态</div>
              <Badge className={cn('text-xs', PARENT_STATUS[parent.status])}>{parent.status}</Badge>
            </div>
            <div className="p-3 rounded-lg bg-[#F7F6F4]">
              <div className="text-xs text-[#94A3B8] mb-1">创建时间</div>
              <div className="text-sm text-[#1E293B]">{parent.created_at}</div>
            </div>
          </div>
          <div className="p-4 rounded-lg bg-[#F7F6F4] space-y-3">
            <h4 className="text-sm font-semibold text-[#1E293B]">基本信息</h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="text-[#94A3B8]">邮箱</div><div className="text-[#1E293B]">{parent.email || '—'}</div>
              <div className="text-[#94A3B8]">地址</div><div className="text-[#1E293B]">{parent.address || '—'}</div>
              <div className="text-[#94A3B8]">登录次数</div><div className="text-[#1E293B]">{parent.login_count}</div>
              <div className="text-[#94A3B8]">最近登录</div><div className="text-[#1E293B]">{parent.last_login || '—'}</div>
            </div>
          </div>
          <div className="p-4 rounded-lg bg-[#F7F6F4]">
            <h4 className="text-sm font-semibold text-[#1E293B] mb-3">关联学生</h4>
            <div className="space-y-2">
              {parent.student_names.map((s) => (
                <div key={s} className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-primary-50 flex items-center justify-center text-xs font-bold text-[#977653]">{s[0]}</div>
                  <span className="text-sm text-[#1E293B]">{s}</span>
                </div>
              ))}
            </div>
          </div>
          {parent.remark && (
            <div className="p-4 rounded-lg bg-[#F7F6F4]">
              <h4 className="text-sm font-semibold text-[#1E293B] mb-1">备注</h4>
              <p className="text-sm text-[#64748B]">{parent.remark}</p>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab 2: Signature Management                                        */
/* ------------------------------------------------------------------ */
function SignatureManagementTab() {
  const readOnly = useIsReadOnly();
  const [signatures, setSignatures] = useState<SignatureRecord[]>([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');

  const loadSignatures = useCallback(async () => {
    try {
      const list = await fetchSignatures();
      // 修复（三维度回测 0919 · P1-2 家长签名 mock 污染）：
      // 家长电子签名是具法律效力的环节。原实现在后端返回空时回退本地 mock，
      // 界面会显示「王建国 等已签名」这类根本不存在的签署记录，
      // 足以误导审批判断与合规审查。此处改为如实呈现空态。
      setSignatures(Array.isArray(list) ? list : []);
    } catch {
      // 后端不可用同样不得伪造，保持空态由界面提示加载失败。
      setSignatures([]);
    }
  }, []);

  useEffect(() => {
    loadSignatures();
  }, [loadSignatures]);

  const filtered = useMemo(() => {
    return signatures.filter((s) => {
      if (search && !s.student_name.includes(search) && !s.parent_name.includes(search)) return false;
      if (statusFilter !== 'all' && s.signature_status !== statusFilter) return false;
      return true;
    });
  }, [signatures, search, statusFilter]);

  const stats = useMemo(() => ({
    pending: signatures.filter((s) => s.signature_status === '待签名').length,
    signed: signatures.filter((s) => s.signature_status === '已签名').length,
    expired: signatures.filter((s) => s.signature_status === '已过期').length,
    monthPending: signatures.filter((s) => s.signature_status === '待签名').length,
  }), [signatures]);

  const sendReminder = (id: string) => {
    setSignatures((prev) => prev.map((s) => s.id === id ? { ...s, send_count: s.send_count + 1, last_sent: new Date().toISOString().replace('T', ' ').slice(0, 16) } : s));
    toast.success('签名提醒已发送');
  };

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: '待签名', value: stats.pending, color: 'text-warning-600', bg: 'bg-warning-50' },
          { label: '已签名', value: stats.signed, color: 'text-success-600', bg: 'bg-success-50' },
          { label: '已过期', value: stats.expired, color: 'text-danger-600', bg: 'bg-danger-50' },
          { label: '本月待签', value: stats.monthPending, color: 'text-[#405680]', bg: 'bg-secondary-50' },
        ].map((s) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={cn('rounded-xl p-4', s.bg)}>
            <div className="text-sm text-[#64748B]">{s.label}</div>
            <div className={cn('text-2xl font-bold mt-1', s.color)}>{s.value}</div>
          </motion.div>
        ))}
      </div>

      {/* Filter */}
      <div className="bg-white rounded-lg p-4 shadow-sm flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
          <Input placeholder="搜索学生、家长..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-[220px] pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="签名状态" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            <SelectItem value="待签名">待签名</SelectItem>
            <SelectItem value="已签名">已签名</SelectItem>
            <SelectItem value="已过期">已过期</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-[#F7F6F4] hover:bg-[#F7F6F4]">
              <TableHead className="text-xs text-[#94A3B8] font-semibold">学生</TableHead>
              <TableHead className="text-xs text-[#94A3B8] font-semibold">IEP期间</TableHead>
              <TableHead className="text-xs text-[#94A3B8] font-semibold">签名状态</TableHead>
              <TableHead className="text-xs text-[#94A3B8] font-semibold">签名日期</TableHead>
              <TableHead className="text-xs text-[#94A3B8] font-semibold">发送次数</TableHead>
              <TableHead className="text-xs text-[#94A3B8] font-semibold text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((s) => {
              const sigCfg = SIGNATURE_STATUS[s.signature_status];
              const SigIcon = sigCfg.icon;
              return (
                <TableRow key={s.id} className="hover:bg-[#F7F6F4] transition-colors">
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-primary-50 flex items-center justify-center text-xs font-bold text-[#977653]">{s.student_name[0]}</div>
                      <div>
                        <div className="text-sm font-medium text-[#1E293B]">{s.student_name}</div>
                        <div className="text-xs text-[#94A3B8]">{s.parent_name}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-[#64748B]">{s.iep_period}</TableCell>
                  <TableCell>
                    <Badge className={cn('text-xs font-normal', sigCfg.className)}>
                      <SigIcon size={12} className="mr-1" />{s.signature_status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-[#94A3B8]">{s.signed_date || '—'}</TableCell>
                  <TableCell className="text-sm text-[#1E293B]">{s.send_count}次</TableCell>
                  <TableCell className="text-right">
                    {s.signature_status === '待签名' && !readOnly && (
                      <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => sendReminder(s.id)}>
                        <Send size={12} className="mr-1" /> 发送提醒
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab 3: Communication Records                                       */
/* ------------------------------------------------------------------ */
function CommunicationTab() {
  const readOnly = useIsReadOnly();
  const [communications, setCommunications] = useState<CommunicationRecord[]>([]);
  const [studentIdMap, setStudentIdMap] = useState<Record<string, number>>({});
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [studentFilter, setStudentFilter] = useState('all');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailComm, setDetailComm] = useState<CommunicationRecord | null>(null);

  const loadCommunications = useCallback(async () => {
    try {
      const res = await fetchCommunications({ page: 1, pageSize: 200 });
      setCommunications(res.list);
      // 建立 学生名 → 数字id 映射，供新增沟通记录时使用
      const students = await fetchStudents({ page: 1, pageSize: 200 });
      const map: Record<string, number> = {};
      students.list.forEach((s) => {
        map[s.name] = Number(s.id);
      });
      setStudentIdMap(map);
    } catch {
      // 后端不可用时回退本地 mock
      setCommunications(scopedCommunications);
    }
  }, []);

  useEffect(() => {
    loadCommunications();
  }, [loadCommunications]);

  const filtered = useMemo(() => {
    return communications.filter((c) => {
      if (search && !c.student_name.includes(search) && !c.subject.includes(search)) return false;
      if (typeFilter !== 'all' && c.comm_type !== typeFilter) return false;
      if (studentFilter !== 'all' && c.student_name !== studentFilter) return false;
      return true;
    });
  }, [communications, search, typeFilter, studentFilter]);

  const handleSave = async (data: Partial<CommunicationRecord>) => {
    try {
      const sid = studentIdMap[data.student_name ?? ''];
      if (!sid) {
        toast.error('无法匹配学生，请检查学生名称');
        return;
      }
      await createCommunication({
        student_id: sid,
        content: data.content ?? '',
        communication_type: data.comm_type,
        teacher_feedback: data.teacher_feedback,
        follow_up: data.follow_up,
        communication_date: new Date().toISOString().split('T')[0],
      });
      toast.success('沟通记录已添加');
      await loadCommunications();
    } catch {
      toast.error('保存失败');
    }
    setDrawerOpen(false);
  };

  return (
    <div className="space-y-4">
      {/* Filter */}
      <div className="bg-white rounded-lg p-4 shadow-sm flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
          <Input placeholder="搜索学生、主题..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-[220px] pl-9" />
        </div>
        <Select value={studentFilter} onValueChange={setStudentFilter}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="学生" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部学生</SelectItem>
            {STUDENTS.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[130px]"><SelectValue placeholder="沟通类型" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部类型</SelectItem>
            <SelectItem value="面谈">面谈</SelectItem>
            <SelectItem value="电话">电话</SelectItem>
            <SelectItem value="微信">微信</SelectItem>
            <SelectItem value="家访">家访</SelectItem>
            <SelectItem value="其他">其他</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setTypeFilter('all'); setStudentFilter('all'); }}>
          <RotateCcw size={14} className="mr-1" /> 重置
        </Button>
        {!readOnly && (
          <div className="ml-auto">
            <Button onClick={() => setDrawerOpen(true)} className="bg-[#977653] hover:bg-[#7A5F42] text-white gap-2">
              <Plus size={16} /> 新增沟通记录
            </Button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-[#F7F6F4] hover:bg-[#F7F6F4]">
              <TableHead className="text-xs text-[#94A3B8] font-semibold">日期</TableHead>
              <TableHead className="text-xs text-[#94A3B8] font-semibold">学生</TableHead>
              <TableHead className="text-xs text-[#94A3B8] font-semibold">沟通类型</TableHead>
              <TableHead className="text-xs text-[#94A3B8] font-semibold">沟通对象</TableHead>
              <TableHead className="text-xs text-[#94A3B8] font-semibold">沟通主题</TableHead>
              <TableHead className="text-xs text-[#94A3B8] font-semibold">教师</TableHead>
              <TableHead className="text-xs text-[#94A3B8] font-semibold text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((c) => (
              <TableRow key={c.id} className="hover:bg-[#F7F6F4] transition-colors">
                <TableCell className="text-sm text-[#1E293B]">{c.date}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-primary-50 flex items-center justify-center text-[10px] font-bold text-[#977653]">{c.student_name[0]}</div>
                    <span className="text-sm text-[#1E293B]">{c.student_name}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge className={cn('text-xs font-normal', COMM_TYPE[c.comm_type])}>{c.comm_type}</Badge>
                </TableCell>
                <TableCell className="text-sm text-[#64748B]">{c.parent_name}</TableCell>
                <TableCell className="text-sm text-[#1E293B] max-w-[200px] truncate" title={c.subject}>{c.subject}</TableCell>
                <TableCell className="text-sm text-[#64748B]">{c.teacher_name}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => { setDetailComm(c); setDetailOpen(true); }}>
                    <Eye size={14} className="text-[#64748B]" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Add Drawer */}
      <CommFormDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} onSave={handleSave} />

      {/* Detail Drawer */}
      <CommDetailDrawer open={detailOpen} onClose={() => { setDetailOpen(false); setDetailComm(null); }} record={detailComm} />
    </div>
  );
}

/* Communication Form Drawer */
function CommFormDrawer({ open, onClose, onSave }: { open: boolean; onClose: () => void; onSave: (d: Partial<CommunicationRecord>) => void }) {
  const [form, setForm] = useState({ student_name: '', comm_type: "电话" as const, parent_name: '', subject: '', content: '', follow_up: '', teacher_name: '王老师', teacher_feedback: '' });
  const update = (field: string, value: unknown) => setForm((prev) => ({ ...prev, [field]: value }));

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-[640px] sm:max-w-[640px] p-0 overflow-y-auto">
        <SheetHeader className="p-6 border-b border-[#E2E8F0]">
          <SheetTitle>新增沟通记录</SheetTitle>
          <SheetDescription>记录家校沟通详情</SheetDescription>
        </SheetHeader>
        <div className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[#1E293B] mb-1.5">学生 <span className="text-[#EF4444]">*</span></label>
              <Select value={form.student_name} onValueChange={(v) => update('student_name', v)}>
                <SelectTrigger><SelectValue placeholder="选择学生" /></SelectTrigger>
                <SelectContent>{STUDENTS.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}</SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#1E293B] mb-1.5">沟通类型 <span className="text-[#EF4444]">*</span></label>
              <Select value={form.comm_type} onValueChange={(v) => update('comm_type', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['面谈', '电话', '微信', '家访', '其他'].map((t) => (<SelectItem key={t} value={t}>{t}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[#1E293B] mb-1.5">沟通对象 <span className="text-[#EF4444]">*</span></label>
              <Input value={form.parent_name} onChange={(e) => update('parent_name', e.target.value)} placeholder="家长姓名" />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#1E293B] mb-1.5">教师 <span className="text-[#EF4444]">*</span></label>
              <Input value={form.teacher_name} onChange={(e) => update('teacher_name', e.target.value)} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-[#1E293B] mb-1.5">沟通主题 <span className="text-[#EF4444]">*</span></label>
            <Input value={form.subject} onChange={(e) => update('subject', e.target.value)} placeholder="沟通主题..." />
          </div>
          <div>
            <label className="block text-sm font-medium text-[#1E293B] mb-1.5">沟通内容 <span className="text-[#EF4444]">*</span></label>
            <Textarea value={form.content} onChange={(e) => update('content', e.target.value)} placeholder="详细描述沟通内容..." className="min-h-[120px]" />
          </div>
          <div>
            <label className="block text-sm font-medium text-[#1E293B] mb-1.5">后续计划</label>
            <Textarea value={form.follow_up} onChange={(e) => update('follow_up', e.target.value)} placeholder="后续跟进事项..." />
          </div>
          <div>
            <label className="block text-sm font-medium text-[#1E293B] mb-1.5">教师反馈</label>
            <Textarea value={form.teacher_feedback} onChange={(e) => update('teacher_feedback', e.target.value)} placeholder="教师反馈..." />
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

/* Communication Detail Drawer */
function CommDetailDrawer({ open, onClose, record }: { open: boolean; onClose: () => void; record: CommunicationRecord | null }) {
  if (!record) return null;
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-[560px] sm:max-w-[560px] p-0 overflow-y-auto">
        <SheetHeader className="p-6 border-b border-[#E2E8F0]">
          <div className="flex items-center gap-2 mb-2">
            <Badge className={cn('text-xs', COMM_TYPE[record.comm_type])}>{record.comm_type}</Badge>
          </div>
          <SheetTitle className="text-lg">{record.subject}</SheetTitle>
          <SheetDescription>{record.date} · {record.teacher_name} → {record.parent_name}</SheetDescription>
        </SheetHeader>
        <div className="p-6 space-y-5">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-[#F7F6F4]">
            <div className="w-8 h-8 rounded-full bg-primary-50 flex items-center justify-center text-sm font-bold text-[#977653]">{record.student_name[0]}</div>
            <div>
              <div className="text-sm font-medium text-[#1E293B]">{record.student_name}</div>
              <div className="text-xs text-[#94A3B8]">沟通对象: {record.parent_name}</div>
            </div>
          </div>
          <div className="p-4 rounded-lg bg-[#F7F6F4]">
            <h4 className="text-sm font-semibold text-[#1E293B] mb-2">沟通内容</h4>
            <p className="text-sm text-[#64748B] leading-relaxed whitespace-pre-line">{record.content}</p>
          </div>
          {record.teacher_feedback && (
            <div className="p-4 rounded-lg bg-[#F7F6F4]">
              <h4 className="text-sm font-semibold text-[#1E293B] mb-2">教师反馈</h4>
              <p className="text-sm text-[#64748B]">{record.teacher_feedback}</p>
            </div>
          )}
          {record.follow_up && (
            <div className="p-4 rounded-lg bg-[#F7F6F4]">
              <h4 className="text-sm font-semibold text-[#1E293B] mb-2">后续计划</h4>
              <p className="text-sm text-[#64748B]">{record.follow_up}</p>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab 4: Notification Center                                         */
/* ------------------------------------------------------------------ */
function NotificationTab() {
  const readOnly = useIsReadOnly();
  const [notifications, setNotifications] = useState<NotificationRecord[]>(INITIAL_NOTIFICATIONS);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    return notifications.filter((n) => {
      if (search && !n.title.includes(search)) return false;
      return true;
    });
  }, [notifications, search]);

  const handleSend = (data: Partial<NotificationRecord>) => {
    const newNotif: NotificationRecord = {
      ...data,
      id: `n-${Date.now()}`,
      status: '已完成',
      sent_at: new Date().toISOString().replace('T', ' ').slice(0, 16),
      read_count: 0,
    } as NotificationRecord;
    setNotifications((prev) => [newNotif, ...prev]);
    toast.success('通知已发送');
    setDrawerOpen(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
          <Input placeholder="搜索通知标题..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-[300px] pl-9" />
        </div>
        {!readOnly && (
          <Button onClick={() => setDrawerOpen(true)} className="bg-[#977653] hover:bg-[#7A5F42] text-white gap-2">
            <Send size={16} /> 发送新通知
          </Button>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-[#F7F6F4] hover:bg-[#F7F6F4]">
              <TableHead className="text-xs text-[#94A3B8] font-semibold">通知标题</TableHead>
              <TableHead className="text-xs text-[#94A3B8] font-semibold">类型</TableHead>
              <TableHead className="text-xs text-[#94A3B8] font-semibold">优先级</TableHead>
              <TableHead className="text-xs text-[#94A3B8] font-semibold">接收/已读</TableHead>
              <TableHead className="text-xs text-[#94A3B8] font-semibold">状态</TableHead>
              <TableHead className="text-xs text-[#94A3B8] font-semibold">发送时间</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((n) => (
              <TableRow key={n.id} className="hover:bg-[#F7F6F4] transition-colors">
                <TableCell>
                  <div className="text-sm font-semibold text-[#1E293B]">{n.title}</div>
                </TableCell>
                <TableCell>
                  <Badge className="bg-secondary-50 text-secondary-400 text-xs font-normal">{n.notif_type}</Badge>
                </TableCell>
                <TableCell>
                  <Badge className={cn('text-xs font-normal', PRIORITY_CONFIG[n.priority])}>{n.priority}</Badge>
                </TableCell>
                <TableCell className="text-sm text-[#1E293B]">{n.read_count}/{n.recipients}</TableCell>
                <TableCell>
                  <Badge className={cn('text-xs font-normal', NOTIF_STATUS[n.status])}>{n.status}</Badge>
                </TableCell>
                <TableCell className="text-sm text-[#94A3B8]">{n.sent_at}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <NotificationFormDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} onSave={handleSend} />
    </div>
  );
}

/* Notification Form Drawer */
function NotificationFormDrawer({ open, onClose, onSave }: { open: boolean; onClose: () => void; onSave: (d: Partial<NotificationRecord>) => void }) {
  const [form, setForm] = useState({
    title: '', notif_type: '一般通知', priority: "中" as const,
    recipients: 0, content: '',
  });
  const update = (field: string, value: unknown) => setForm((prev) => ({ ...prev, [field]: value }));

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-[640px] sm:max-w-[640px] p-0 overflow-y-auto">
        <SheetHeader className="p-6 border-b border-[#E2E8F0]">
          <SheetTitle>发送新通知</SheetTitle>
          <SheetDescription>填写通知内容并选择接收对象</SheetDescription>
        </SheetHeader>
        <div className="p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-[#1E293B] mb-1.5">通知标题 <span className="text-[#EF4444]">*</span></label>
            <Input value={form.title} onChange={(e) => update('title', e.target.value)} placeholder="通知标题..." />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[#1E293B] mb-1.5">通知类型</label>
              <Select value={form.notif_type} onValueChange={(v) => update('notif_type', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="IEP签名提醒">IEP签名提醒</SelectItem>
                  <SelectItem value="评估通知">评估通知</SelectItem>
                  <SelectItem value="会议通知">会议通知</SelectItem>
                  <SelectItem value="一般通知">一般通知</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#1E293B] mb-1.5">优先级</label>
              <Select value={form.priority} onValueChange={(v) => update('priority', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="高">高</SelectItem>
                  <SelectItem value="中">中</SelectItem>
                  <SelectItem value="低">低</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-[#1E293B] mb-1.5">接收人数</label>
            <Input type="number" value={form.recipients || ''} onChange={(e) => update('recipients', Number(e.target.value))} placeholder="预计接收人数" />
          </div>
          <div>
            <label className="block text-sm font-medium text-[#1E293B] mb-1.5">通知内容 <span className="text-[#EF4444]">*</span></label>
            <Textarea value={form.content} onChange={(e) => update('content', e.target.value)} placeholder="通知正文内容..." className="min-h-[150px]" />
          </div>
        </div>
        <SheetFooter className="border-t border-[#E2E8F0] p-6">
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={() => onSave(form)} className="bg-[#977653] hover:bg-[#7A5F42] text-white">发送通知</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Parents Page                                                  */
/* ------------------------------------------------------------------ */
export default function Parents() {
  const [activeTab, setActiveTab] = useState('accounts');

  return (
    <div className="p-6">
      {/* Page Header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <div className="flex items-center gap-3">
          <h1 className="text-[28px] font-bold text-[#1E293B] leading-tight">家校协作</h1>
          <DataScopeBadge />
        </div>
        <p className="text-sm text-[#64748B] mt-1">家长管理、签名确认与家校沟通</p>
      </motion.div>

      {/* Tabs */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6 bg-white border border-[#E2E8F0] p-1 h-auto">
            <TabsTrigger value="accounts" className="data-[state=active]:bg-[#977653] data-[state=active]:text-white gap-1.5 px-4 py-2">
              <Users size={16} /> 家长账号
            </TabsTrigger>
            <TabsTrigger value="signatures" className="data-[state=active]:bg-[#977653] data-[state=active]:text-white gap-1.5 px-4 py-2">
              <PenTool size={16} /> 签名管理
            </TabsTrigger>
            <TabsTrigger value="communication" className="data-[state=active]:bg-[#977653] data-[state=active]:text-white gap-1.5 px-4 py-2">
              <MessageSquare size={16} /> 沟通记录
            </TabsTrigger>
            <TabsTrigger value="notifications" className="data-[state=active]:bg-[#977653] data-[state=active]:text-white gap-1.5 px-4 py-2">
              <Bell size={16} /> 通知中心
            </TabsTrigger>
          </TabsList>

          <AnimatePresence mode="wait">
            <TabsContent value="accounts" className="mt-0">
              <motion.div key="accounts" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <ParentAccountsTab />
              </motion.div>
            </TabsContent>
            <TabsContent value="signatures" className="mt-0">
              <motion.div key="signatures" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <SignatureManagementTab />
              </motion.div>
            </TabsContent>
            <TabsContent value="communication" className="mt-0">
              <motion.div key="communication" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <CommunicationTab />
              </motion.div>
            </TabsContent>
            <TabsContent value="notifications" className="mt-0">
              <motion.div key="notifications" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <NotificationTab />
              </motion.div>
            </TabsContent>
          </AnimatePresence>
        </Tabs>
      </motion.div>
    </div>
  );
}
