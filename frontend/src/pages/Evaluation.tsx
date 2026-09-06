import { useState, useMemo, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ClipboardPlus,
  Search,
  Brain,
  MessageSquare,
  Activity,
  Users,
  HomeIcon,
  Eye,
  Pencil,
  MoreVertical,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  X,
  Download,
  FileText,
  Trash2,
  Copy,
  Check,
  ChevronUp,
  ChevronDownIcon,
  CircleDot,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Minus,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { filterByDataScope, isReadOnly, getDataScopeConfig } from '@/utils/dataScope';
import { ioExportDownload } from '@/utils/ioExport';
import ImportExportActions from '@/components/io/ImportExportActions';
import {
  fetchAssessments,
  createAssessment,
  updateAssessment,
  deleteAssessment,
} from '@/services/evaluation';
import { fetchStudents as fetchStudentsList } from '@/services/students';

/* ─── Data Scope Badge ─── */
function DataScopeBadge() {
  const config = getDataScopeConfig();
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

/* ─── Class Name Mapping ─── */
const classNameToId: Record<string, string> = {
  '特教一班': 'c1',
  '特教二班': 'c2',
  '特教三班': 'c3',
};

/* ─── Types ─── */

interface Dimension {
  id: string;
  name: string;
  items: AssessmentItem[];
}

interface AssessmentItem {
  id: string;
  name: string;
  description: string;
  maxScore: number;
  score?: number;
  note?: string;
}

interface AssessmentTemplate {
  id: string;
  name: string;
  category: string;
  icon: string;
  color: string;
  description: string;
  dimensions: Dimension[];
}

interface EvaluationRecord {
  id: string;
  studentId: string;
  studentName: string;
  studentNo: string;
  className: string;
  templateId: string;
  templateName: string;
  assessmentType: string;
  assessmentDate: string;
  assessor: string;
  totalScore: number;
  maxScore: number;
  status: 'completed' | 'in_progress' | 'draft';
  scores: Record<string, Record<string, number>>;
  notes: Record<string, Record<string, string>>;
  recommendations?: string;
}

interface Student {
  id: string;
  name: string;
  studentNo: string;
  className: string;
  disabilityType: string;
}

/* ─── Mock Data: Templates ─── */

const templates: AssessmentTemplate[] = [
  {
    id: 't1',
    name: '认知发展评估',
    category: '认知发展',
    icon: 'brain',
    color: '#977653',
    description: '注意力、记忆力、逻辑思维等维度',
    dimensions: [
      {
        id: 'd1',
        name: '注意力',
        items: [
          { id: 'i1', name: '视觉注意力', description: '能否持续关注视觉目标5分钟以上', maxScore: 5 },
          { id: 'i2', name: '听觉注意力', description: '能否听从3步以上指令', maxScore: 5 },
          { id: 'i3', name: '注意力分配', description: '能否同时处理两项任务', maxScore: 5 },
          { id: 'i4', name: '注意力转移', description: '能否根据指令灵活转移注意力', maxScore: 5 },
        ],
      },
      {
        id: 'd2',
        name: '记忆力',
        items: [
          { id: 'i5', name: '瞬时记忆', description: '能否记住5-7个数字或物品', maxScore: 5 },
          { id: 'i6', name: '短时记忆', description: '30分钟后能否回忆所学内容', maxScore: 5 },
          { id: 'i7', name: '长时记忆', description: '能否回忆一周前学习的内容', maxScore: 5 },
        ],
      },
      {
        id: 'd3',
        name: '逻辑思维',
        items: [
          { id: 'i8', name: '分类能力', description: '能否按颜色、形状等特征分类', maxScore: 5 },
          { id: 'i9', name: '排序能力', description: '能否按大小、长短排序', maxScore: 5 },
          { id: 'i10', name: '因果关系', description: '能否理解简单因果关系', maxScore: 5 },
        ],
      },
      {
        id: 'd4',
        name: '问题解决',
        items: [
          { id: 'i11', name: '简单问题', description: '能否解决一步推理问题', maxScore: 5 },
          { id: 'i12', name: '多步问题', description: '能否解决需要2-3步的问题', maxScore: 5 },
        ],
      },
      {
        id: 'd5',
        name: '概念形成',
        items: [
          { id: 'i13', name: '数量概念', description: '能否理解10以内数量', maxScore: 5 },
          { id: 'i14', name: '时间概念', description: '能否理解昨天、今天、明天', maxScore: 5 },
          { id: 'i15', name: '空间概念', description: '能否理解上下左右前后', maxScore: 5 },
        ],
      },
    ],
  },
  {
    id: 't2',
    name: '语言能力评估',
    category: '语言能力',
    icon: 'message',
    color: '#3B82F6',
    description: '理解、表达、阅读、书写等维度',
    dimensions: [
      { id: 'd6', name: '语言理解', items: [
        { id: 'i16', name: '名词理解', description: '能否理解常见名词100个以上', maxScore: 5 },
        { id: 'i17', name: '动词理解', description: '能否理解常见动词50个以上', maxScore: 5 },
        { id: 'i18', name: '句子理解', description: '能否理解复杂句子', maxScore: 5 },
      ]},
      { id: 'd7', name: '语言表达', items: [
        { id: 'i19', name: '单词表达', description: '能否主动使用单词表达需求', maxScore: 5 },
        { id: 'i20', name: '句子表达', description: '能否使用完整句子表达', maxScore: 5 },
        { id: 'i21', name: '描述能力', description: '能否描述图片或事件', maxScore: 5 },
      ]},
      { id: 'd8', name: '阅读能力', items: [
        { id: 'i22', name: '识字量', description: '能否识别100个以上常用汉字', maxScore: 5 },
        { id: 'i23', name: '阅读理解', description: '能否理解简单短文', maxScore: 5 },
      ]},
      { id: 'd9', name: '书写能力', items: [
        { id: 'i24', name: '握笔姿势', description: '握笔姿势是否正确', maxScore: 5 },
        { id: 'i25', name: '字形书写', description: '能否正确书写常见汉字', maxScore: 5 },
        { id: 'i26', name: '书写工整', description: '书写是否工整清晰', maxScore: 5 },
      ]},
    ],
  },
  {
    id: 't3',
    name: '运动能力评估',
    category: '运动能力',
    icon: 'activity',
    color: '#10B981',
    description: '大肌肉、精细动作、协调性等维度',
    dimensions: [
      { id: 'd10', name: '大肌肉动作', items: [
        { id: 'i27', name: '跑', description: '能否平稳跑步20米以上', maxScore: 5 },
        { id: 'i28', name: '跳', description: '能否双脚连续跳跃', maxScore: 5 },
        { id: 'i29', name: '投掷', description: '能否准确投掷到目标', maxScore: 5 },
        { id: 'i30', name: '平衡', description: '单脚站立能否超过5秒', maxScore: 5 },
      ]},
      { id: 'd11', name: '精细动作', items: [
        { id: 'i31', name: '穿珠', description: '能否将珠子穿入细绳', maxScore: 5 },
        { id: 'i32', name: '剪纸', description: '能否沿直线剪纸', maxScore: 5 },
        { id: 'i33', name: '折纸', description: '能否完成简单折纸', maxScore: 5 },
      ]},
      { id: 'd12', name: '手眼协调', items: [
        { id: 'i34', name: '搭积木', description: '能否搭8块以上积木不倒', maxScore: 5 },
        { id: 'i35', name: '连线', description: '能否沿虚线连线', maxScore: 5 },
        { id: 'i36', name: '涂色', description: '能否在轮廓内涂色', maxScore: 5 },
      ]},
      { id: 'd13', name: '生活动作', items: [
        { id: 'i37', name: '翻书', description: '能否逐页翻书', maxScore: 5 },
        { id: 'i38', name: '拧瓶盖', description: '能否独立拧开瓶盖', maxScore: 5 },
      ]},
    ],
  },
  {
    id: 't4',
    name: '社交适应评估',
    category: '社交适应',
    icon: 'users',
    color: '#F59E0B',
    description: '人际互动、情绪管理、规则意识等维度',
    dimensions: [
      { id: 'd14', name: '人际互动', items: [
        { id: 'i39', name: '眼神接触', description: '交流时能否保持眼神接触', maxScore: 5 },
        { id: 'i40', name: '主动交往', description: '能否主动与同伴互动', maxScore: 5 },
        { id: 'i41', name: '合作游戏', description: '能否参与合作性游戏', maxScore: 5 },
      ]},
      { id: 'd15', name: '情绪管理', items: [
        { id: 'i42', name: '情绪识别', description: '能否识别自己和他人的情绪', maxScore: 5 },
        { id: 'i43', name: '情绪表达', description: '能否适当表达情绪', maxScore: 5 },
        { id: 'i44', name: '情绪调节', description: '能否在帮助下平复情绪', maxScore: 5 },
      ]},
      { id: 'd16', name: '规则意识', items: [
        { id: 'i45', name: '遵守规则', description: '能否遵守课堂规则', maxScore: 5 },
        { id: 'i46', name: '轮流等待', description: '能否学会轮流和等待', maxScore: 5 },
        { id: 'i47', name: '安全意识', description: '是否具备基本安全意识', maxScore: 5 },
      ]},
    ],
  },
  {
    id: 't5',
    name: '生活自理评估',
    category: '生活自理',
    icon: 'home',
    color: '#405680',
    description: '饮食、穿衣、卫生、出行等维度',
    dimensions: [
      { id: 'd17', name: '饮食自理', items: [
        { id: 'i48', name: '使用餐具', description: '能否正确使用勺子、筷子', maxScore: 5 },
        { id: 'i49', name: '饮水', description: '能否独立打开水杯饮水', maxScore: 5 },
        { id: 'i50', name: '进食习惯', description: '能否保持桌面整洁', maxScore: 5 },
      ]},
      { id: 'd18', name: '穿脱衣物', items: [
        { id: 'i51', name: '穿脱外套', description: '能否独立穿脱外套', maxScore: 5 },
        { id: 'i52', name: '穿脱鞋袜', description: '能否独立穿脱鞋袜', maxScore: 5 },
        { id: 'i53', name: '整理衣物', description: '能否叠放衣物', maxScore: 5 },
      ]},
      { id: 'd19', name: '个人卫生', items: [
        { id: 'i54', name: '洗手', description: '能否按步骤正确洗手', maxScore: 5 },
        { id: 'i55', name: '刷牙', description: '能否独立刷牙', maxScore: 5 },
        { id: 'i56', name: '洗脸', description: '能否独立洗脸', maxScore: 5 },
      ]},
      { id: 'd20', name: '如厕技能', items: [
        { id: 'i57', name: '表达需求', description: '能否表达如厕需求', maxScore: 5 },
        { id: 'i58', name: '如厕自理', description: '能否独立完成如厕过程', maxScore: 5 },
      ]},
      { id: 'd21', name: '出行安全', items: [
        { id: 'i59', name: '安全过马路', description: '能否看红绿灯过马路', maxScore: 5 },
        { id: 'i60', name: '交通规则', description: '能否理解基本交通规则', maxScore: 5 },
      ]},
    ],
  },
];

const templateMap = new Map(templates.map((t) => [t.id, t]));

function getTemplateMaxScore(templateId: string): number {
  const t = templateMap.get(templateId);
  if (!t) return 100;
  return t.dimensions.reduce((sum, d) => sum + d.items.reduce((s, i) => s + i.maxScore, 0), 0);
}

/* ─── Mock Data: Students ─── */

const students: Student[] = [
  { id: 's1', name: '王小明', studentNo: '2024001', className: '特教一班', disabilityType: '智力发育迟缓' },
  { id: 's2', name: '李小红', studentNo: '2024002', className: '特教一班', disabilityType: '自闭症谱系障碍' },
  { id: 's3', name: '张小刚', studentNo: '2024003', className: '特教二班', disabilityType: '唐氏综合征' },
  { id: 's4', name: '刘小美', studentNo: '2024004', className: '特教二班', disabilityType: '智力发育迟缓' },
  { id: 's5', name: '陈小军', studentNo: '2024005', className: '特教三班', disabilityType: '脑瘫' },
  { id: 's6', name: '赵小芳', studentNo: '2024006', className: '特教三班', disabilityType: '自闭症谱系障碍' },
  { id: 's7', name: '孙小亮', studentNo: '2024007', className: '特教一班', disabilityType: '语言发育迟缓' },
  { id: 's8', name: '周小静', studentNo: '2024008', className: '特教二班', disabilityType: '智力发育迟缓' },
  { id: 's9', name: '吴小强', studentNo: '2024009', className: '特教一班', disabilityType: '注意力缺陷' },
  { id: 's10', name: '马小丽', studentNo: '2024010', className: '特教三班', disabilityType: '唐氏综合征' },
];

/* ─── Mock Data: Evaluation Records ─── */

const initialRecords: EvaluationRecord[] = [
  { id: 'e1', studentId: 's1', studentName: '王小明', studentNo: '2024001', className: '特教一班', templateId: 't1', templateName: '认知发展评估', assessmentType: '认知发展', assessmentDate: '2025-01-15', assessor: '张老师', totalScore: 68, maxScore: 85, status: 'completed', scores: {}, notes: {}, recommendations: '建议加强注意力训练和逻辑思维能力培养。' },
  { id: 'e2', studentId: 's2', studentName: '李小红', studentNo: '2024002', className: '特教一班', templateId: 't2', templateName: '语言能力评估', assessmentType: '语言能力', assessmentDate: '2025-01-14', assessor: '李老师', totalScore: 42, maxScore: 75, status: 'completed', scores: {}, notes: {}, recommendations: '需要加强语言表达和理解训练，建议每日进行语言互动练习。' },
  { id: 'e3', studentId: 's3', studentName: '张小刚', studentNo: '2024003', className: '特教二班', templateId: 't3', templateName: '运动能力评估', assessmentType: '运动能力', assessmentDate: '2025-01-13', assessor: '王老师', totalScore: 55, maxScore: 80, status: 'completed', scores: {}, notes: {} },
  { id: 'e4', studentId: 's4', studentName: '刘小美', studentNo: '2024004', className: '特教二班', templateId: 't4', templateName: '社交适应评估', assessmentType: '社交适应', assessmentDate: '2025-01-12', assessor: '张老师', totalScore: 38, maxScore: 70, status: 'completed', scores: {}, notes: {} },
  { id: 'e5', studentId: 's5', studentName: '陈小军', studentNo: '2024005', className: '特教三班', templateId: 't5', templateName: '生活自理评估', assessmentType: '生活自理', assessmentDate: '2025-01-11', assessor: '赵老师', totalScore: 45, maxScore: 65, status: 'completed', scores: {}, notes: {} },
  { id: 'e6', studentId: 's6', studentName: '赵小芳', studentNo: '2024006', className: '特教三班', templateId: 't1', templateName: '认知发展评估', assessmentType: '认知发展', assessmentDate: '2025-01-10', assessor: '张老师', totalScore: 35, maxScore: 85, status: 'in_progress', scores: {}, notes: {} },
  { id: 'e7', studentId: 's7', studentName: '孙小亮', studentNo: '2024007', className: '特教一班', templateId: 't2', templateName: '语言能力评估', assessmentType: '语言能力', assessmentDate: '2025-01-09', assessor: '李老师', totalScore: 50, maxScore: 75, status: 'completed', scores: {}, notes: {} },
  { id: 'e8', studentId: 's8', studentName: '周小静', studentNo: '2024008', className: '特教二班', templateId: 't3', templateName: '运动能力评估', assessmentType: '运动能力', assessmentDate: '2025-01-08', assessor: '王老师', totalScore: 62, maxScore: 80, status: 'completed', scores: {}, notes: {} },
  { id: 'e9', studentId: 's9', studentName: '吴小强', studentNo: '2024009', className: '特教一班', templateId: 't4', templateName: '社交适应评估', assessmentType: '社交适应', assessmentDate: '2025-01-07', assessor: '张老师', totalScore: 28, maxScore: 70, status: 'draft', scores: {}, notes: {} },
  { id: 'e10', studentId: 's10', studentName: '马小丽', studentNo: '2024010', className: '特教三班', templateId: 't5', templateName: '生活自理评估', assessmentType: '生活自理', assessmentDate: '2025-01-06', assessor: '赵老师', totalScore: 52, maxScore: 65, status: 'completed', scores: {}, notes: {} },
  { id: 'e11', studentId: 's1', studentName: '王小明', studentNo: '2024001', className: '特教一班', templateId: 't4', templateName: '社交适应评估', assessmentType: '社交适应', assessmentDate: '2025-01-05', assessor: '张老师', totalScore: 48, maxScore: 70, status: 'completed', scores: {}, notes: {} },
  { id: 'e12', studentId: 's2', studentName: '李小红', studentNo: '2024002', className: '特教一班', templateId: 't1', templateName: '认知发展评估', assessmentType: '认知发展', assessmentDate: '2025-01-04', assessor: '李老师', totalScore: 55, maxScore: 85, status: 'completed', scores: {}, notes: {} },
  { id: 'e13', studentId: 's3', studentName: '张小刚', studentNo: '2024003', className: '特教二班', templateId: 't2', templateName: '语言能力评估', assessmentType: '语言能力', assessmentDate: '2025-01-03', assessor: '李老师', totalScore: 30, maxScore: 75, status: 'in_progress', scores: {}, notes: {} },
  { id: 'e14', studentId: 's4', studentName: '刘小美', studentNo: '2024004', className: '特教二班', templateId: 't5', templateName: '生活自理评估', assessmentType: '生活自理', assessmentDate: '2025-01-02', assessor: '赵老师', totalScore: 40, maxScore: 65, status: 'completed', scores: {}, notes: {} },
  { id: 'e15', studentId: 's5', studentName: '陈小军', studentNo: '2024005', className: '特教三班', templateId: 't3', templateName: '运动能力评估', assessmentType: '运动能力', assessmentDate: '2025-01-01', assessor: '王老师', totalScore: 48, maxScore: 80, status: 'completed', scores: {}, notes: {} },
];

/* ─── Data Scope Filtering ─── */
const scopedRecords = filterByDataScope(
  initialRecords,
  (r) => r.studentId,
  (r) => classNameToId[r.className],
);

const scopedStudents = filterByDataScope(
  students,
  (s) => s.id,
  (s) => classNameToId[s.className],
);

const readOnly = isReadOnly();

/* ─── Helpers ─── */

const statusBadge = {
  completed: { label: '已完成', className: 'bg-[#ECFDF5] text-[#059669] hover:bg-[#ECFDF5]' },
  in_progress: { label: '进行中', className: 'bg-[#FFFBEB] text-[#D97706] hover:bg-[#FFFBEB]' },
  draft: { label: '草稿', className: 'bg-[#EFF6FF] text-[#2563EB] hover:bg-[#EFF6FF]' },
};

const typeBadgeColor: Record<string, string> = {
  '认知发展': 'bg-[#F5F0EB] text-[#5C4832]',
  '语言能力': 'bg-[#EFF6FF] text-[#2563EB]',
  '运动能力': 'bg-[#ECFDF5] text-[#059669]',
  '社交适应': 'bg-[#FFFBEB] text-[#D97706]',
  '生活自理': 'bg-[#F0F2F5] text-[#405680]',
};

const scoreColors = [
  '',
  'bg-[#FEF2F2] text-[#DC2626] border-[#FECACA]',
  'bg-[#FFFBEB] text-[#D97706] border-[#FDE68A]',
  'bg-[#EFF6FF] text-[#2563EB] border-[#BFDBFE]',
  'bg-[#F5F0EB] text-[#5C4832] border-[#D6C8B8]',
  'bg-[#ECFDF5] text-[#059669] border-[#A7F3D0]',
];

const templateQuickIcons: Record<string, React.ReactNode> = {
  brain: <Brain className="w-8 h-8" style={{ color: '#977653' }} />,
  message: <MessageSquare className="w-8 h-8" style={{ color: '#3B82F6' }} />,
  activity: <Activity className="w-8 h-8" style={{ color: '#10B981' }} />,
  users: <Users className="w-8 h-8" style={{ color: '#F59E0B' }} />,
  home: <HomeIcon className="w-8 h-8" style={{ color: '#405680' }} />,
};

function getGradeLabel(pct: number): { label: string; color: string } {
  if (pct >= 90) return { label: '优秀', color: 'text-[#059669]' };
  if (pct >= 75) return { label: '良好', color: 'text-[#977653]' };
  if (pct >= 60) return { label: '一般', color: 'text-[#3B82F6]' };
  return { label: '需加强', color: 'text-[#EF4444]' };
}

/* ─── Main Component ─── */

export default function Evaluation() {
  /* List state */
  const [records, setRecords] = useState<EvaluationRecord[]>(scopedRecords);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [studentFilter, setStudentFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const pageSize = 8;

  /* Drawer state */
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<'new' | 'detail'>('new');
  const [activeRecord, setActiveRecord] = useState<EvaluationRecord | null>(null);

  /* New assessment flow state */
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedTemplate, setSelectedTemplate] = useState<AssessmentTemplate | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [assessmentDate, setAssessmentDate] = useState(new Date().toISOString().split('T')[0]);
  const [assessor, setAssessor] = useState('张老师');
  const [assessmentEnv, setAssessmentEnv] = useState('教室');
  const [studentState, setStudentState] = useState('');
  const [toolsUsed, setToolsUsed] = useState('');
  const [note, setNote] = useState('');
  const [itemScores, setItemScores] = useState<Record<string, number>>({});
  const [itemNotes, setItemNotes] = useState<Record<string, string>>({});
  const [activeDimension, setActiveDimension] = useState<string>('');
  const [recommendations, setRecommendations] = useState('');

  /* Student search */
  const [studentSearch, setStudentSearch] = useState('');
  const [studentOptions, setStudentOptions] = useState<Student[]>(scopedStudents);
  const filteredStudents = useMemo(() => {
    if (!studentSearch) return studentOptions;
    return studentOptions.filter((s) => s.name.includes(studentSearch) || s.studentNo.includes(studentSearch));
  }, [studentSearch, studentOptions]);

  /* Load records & students from backend */
  const loadRecords = useCallback(async () => {
    setRecordsLoading(true);
    try {
      const res = await fetchAssessments({ page: 1, pageSize: 100 });
      setRecords(res.list);
    } catch {
      // 保持空列表，UI 已提供兜底文案
    } finally {
      setRecordsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRecords();
    fetchStudentsList({ page: 1, pageSize: 200, sort_field: 'created_at', sort_order: 'asc' })
      .then((res) => {
        if (res.list.length > 0) {
          setStudentOptions(res.list.map((s) => ({
            id: s.id,
            name: s.name,
            studentNo: s.student_no,
            className: s.class_name,
            disabilityType: s.disability_type,
          })));
        }
      })
      .catch(() => {
        // 后端不可用时回退本地 mock 学生列表
      });
  }, [loadRecords]);

  /* Filtered records */
  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      if (search && !r.studentName.includes(search) && !r.studentNo.includes(search)) return false;
      if (studentFilter !== 'all' && r.studentId !== studentFilter) return false;
      if (typeFilter !== 'all' && r.assessmentType !== typeFilter) return false;
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      return true;
    });
  }, [records, search, studentFilter, typeFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / pageSize));
  const paginatedRecords = filteredRecords.slice((page - 1) * pageSize, page * pageSize);

  const allSelected = paginatedRecords.length > 0 && paginatedRecords.every((r) => selectedIds.has(r.id));

  /* Handlers */
  const toggleSelectAll = () => {
    if (allSelected) {
      const next = new Set(selectedIds);
      paginatedRecords.forEach((r) => next.delete(r.id));
      setSelectedIds(next);
    } else {
      const next = new Set(selectedIds);
      paginatedRecords.forEach((r) => next.add(r.id));
      setSelectedIds(next);
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const resetFilters = () => {
    setSearch('');
    setStudentFilter('all');
    setTypeFilter('all');
    setStatusFilter('all');
    setPage(1);
  };

  const openNewAssessment = (template?: AssessmentTemplate) => {
    setDrawerMode('new');
    setCurrentStep(1);
    setSelectedStudent(null);
    setSelectedTemplate(template || null);
    setAssessmentDate(new Date().toISOString().split('T')[0]);
    setAssessor('张老师');
    setAssessmentEnv('教室');
    setStudentState('');
    setToolsUsed('');
    setNote('');
    setItemScores({});
    setItemNotes({});
    setRecommendations('');
    setStudentSearch('');
    if (template && template.dimensions.length > 0) {
      setActiveDimension(template.dimensions[0].id);
    }
    setDrawerOpen(true);
  };

  const openDetail = (record: EvaluationRecord) => {
    setDrawerMode('detail');
    setActiveRecord(record);
    setDrawerOpen(true);
  };

  const handleNext = () => {
    if (currentStep === 1 && !selectedStudent) {
      toast.error('请选择学生');
      return;
    }
    if (currentStep === 2 && !assessmentDate) {
      toast.error('请选择评估日期');
      return;
    }
    if (currentStep < 4) setCurrentStep(currentStep + 1);
  };

  const handlePrev = () => {
    if (currentStep > 1) setCurrentStep(currentStep - 1);
  };

  const handleSubmit = async () => {
    if (!selectedStudent || !selectedTemplate) return;
    const maxScore = selectedTemplate.dimensions.reduce((s, d) => s + d.items.reduce((is, it) => is + it.maxScore, 0), 0);
    const totalScore = Object.values(itemScores).reduce((s, v) => s + (v || 0), 0);
    const items = selectedTemplate.dimensions.flatMap((d) =>
      d.items.map((it) => ({
        dimension: d.name,
        item_name: it.name,
        item_description: it.description,
        score: itemScores[it.id] ?? 0,
        max_score: it.maxScore,
        notes: itemNotes[it.id] ?? '',
      }))
    );
    try {
      await createAssessment({
        student_id: Number(selectedStudent.id) || 0,
        assessment_type: selectedTemplate.category,
        date: assessmentDate,
        total_score: totalScore,
        max_score: maxScore,
        summary: note,
        recommendations,
        template_id: Number(selectedTemplate.id) || undefined,
        items,
      });
      await loadRecords();
      toast.success('评估录入成功！');
      setCurrentStep(4);
    } catch {
      toast.error('评估录入失败');
    }
  };

  const handleSaveDraft = async () => {
    if (!selectedStudent || !selectedTemplate) {
      toast.error('请先选择学生和模板');
      return;
    }
    const maxScore = getTemplateMaxScore(selectedTemplate.id);
    const totalScore = Object.values(itemScores).reduce((s, v) => s + (v || 0), 0);
    const items = selectedTemplate.dimensions.flatMap((d) =>
      d.items.map((it) => ({
        dimension: d.name,
        item_name: it.name,
        item_description: it.description,
        score: itemScores[it.id] ?? 0,
        max_score: it.maxScore,
        notes: itemNotes[it.id] ?? '',
      }))
    );
    try {
      const created = await createAssessment({
        student_id: Number(selectedStudent.id) || 0,
        assessment_type: selectedTemplate.category,
        date: assessmentDate,
        total_score: totalScore,
        max_score: maxScore,
        summary: note,
        recommendations,
        template_id: Number(selectedTemplate.id) || undefined,
        items,
      });
      // 创建后更新状态为草稿
      await updateAssessment(created.id, { status: 'draft' });
      await loadRecords();
      toast.success('草稿已保存');
      setDrawerOpen(false);
    } catch {
      toast.error('草稿保存失败');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteAssessment(id);
      await loadRecords();
      toast.success('评估记录已删除');
    } catch {
      toast.error('删除失败');
    }
  };

  const handleDuplicate = async (record: EvaluationRecord) => {
    try {
      await createAssessment({
        student_id: Number(record.studentId) || 0,
        assessment_type: record.assessmentType,
        date: new Date().toISOString().split('T')[0],
        total_score: 0,
        max_score: record.maxScore,
        summary: '',
        recommendations: record.recommendations ?? '',
      });
      await loadRecords();
      toast.success('评估记录已复制');
    } catch {
      toast.error('复制失败');
    }
  };

  const currentScores = useMemo(() => {
    if (!selectedTemplate) return { total: 0, max: 0, pct: 0 };
    const max = selectedTemplate.dimensions.reduce((s, d) => s + d.items.reduce((is, it) => is + it.maxScore, 0), 0);
    const total = Object.values(itemScores).reduce((s, v) => s + (v || 0), 0);
    return { total, max, pct: max > 0 ? Math.round((total / max) * 100) : 0 };
  }, [selectedTemplate, itemScores]);

  const dimensionProgress = useMemo(() => {
    if (!selectedTemplate) return [];
    return selectedTemplate.dimensions.map((d) => {
      const scored = d.items.filter((it) => itemScores[it.id] !== undefined).length;
      const dimTotal = d.items.reduce((s, it) => s + (itemScores[it.id] || 0), 0);
      const dimMax = d.items.reduce((s, it) => s + it.maxScore, 0);
      return { ...d, scored, total: d.items.length, dimTotal, dimMax };
    });
  }, [selectedTemplate, itemScores]);

  /* ─── Render ─── */
  return (
    <div className="px-6 py-6">
      {/* Page Header */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25 }}
        className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6"
      >
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-[28px] font-bold text-[#1E293B] leading-tight tracking-[-0.02em]">评估管理</h1>
            <DataScopeBadge />
          </div>
          <p className="text-sm text-[#64748B] mt-1">评估记录录入、打分与报告生成</p>
        </div>
        <div className="flex gap-2">
          <ImportExportActions
            module="assessments"
            filenameBase="评估记录"
            readOnly={readOnly}
            exportParams={{
              student_id: studentFilter !== 'all' ? Number(studentFilter) || undefined : undefined,
              assessment_type: typeFilter !== 'all' ? typeFilter : undefined,
              status: statusFilter !== 'all' ? statusFilter : undefined,
            }}
            onImported={() => {
              void loadRecords();
            }}
          />
          {!readOnly && (
            <Button onClick={() => openNewAssessment()} className="h-10 bg-[#977653] hover:bg-[#7A5F42]">
              <ClipboardPlus className="w-4 h-4 mr-2" />
              录入评估
            </Button>
          )}
        </div>
      </motion.div>

      {/* Filter Bar */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: 0.1 }}
        className="bg-white rounded-lg p-4 mb-6 shadow-sm"
      >
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
            <Input
              placeholder="搜索学生姓名..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 w-[240px] h-10"
            />
          </div>
          <Select value={studentFilter} onValueChange={setStudentFilter}>
            <SelectTrigger className="w-[180px] h-10">
              <SelectValue placeholder="选择学生" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部学生</SelectItem>
              {scopedStudents.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name} ({s.studentNo})</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[160px] h-10">
              <SelectValue placeholder="评估类型" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部类型</SelectItem>
              <SelectItem value="认知发展">认知发展</SelectItem>
              <SelectItem value="语言能力">语言能力</SelectItem>
              <SelectItem value="运动能力">运动能力</SelectItem>
              <SelectItem value="社交适应">社交适应</SelectItem>
              <SelectItem value="生活自理">生活自理</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[130px] h-10">
              <SelectValue placeholder="完成状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              <SelectItem value="completed">已完成</SelectItem>
              <SelectItem value="in_progress">进行中</SelectItem>
              <SelectItem value="draft">草稿</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="secondary" onClick={() => setPage(1)}>筛选</Button>
          <Button variant="ghost" onClick={resetFilters}>重置</Button>
        </div>
      </motion.div>

      {/* Template Quick Access */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: 0.2 }}
        className="bg-white rounded-lg p-5 mb-6 shadow-sm"
      >
        <h4 className="text-base font-semibold text-[#1E293B] mb-4">选择评估模板</h4>
        <div className="flex flex-wrap gap-3">
          {templates.map((t, i) => (
            <motion.button
              key={t.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: 0.2 + i * 0.06 }}
              onClick={() => openNewAssessment(t)}
              className="flex flex-col items-start w-[200px] p-4 bg-white border border-[#E2E8F0] rounded-lg text-left transition-all duration-150 hover:shadow-md hover:-translate-y-0.5 cursor-pointer group"
              style={{ borderColor: selectedTemplate?.id === t.id ? t.color : undefined, borderWidth: selectedTemplate?.id === t.id ? '2px' : '1px' }}
            >
              <div className="mb-2">{templateQuickIcons[t.icon]}</div>
              <span className="text-sm font-semibold text-[#1E293B] group-hover:text-[#977653]">{t.name}</span>
              <span className="text-xs text-[#94A3B8] mt-1 line-clamp-2">{t.description}</span>
            </motion.button>
          ))}
        </div>
      </motion.div>

      {/* Records Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: 0.3 }}
        className="bg-white rounded-lg shadow-sm overflow-hidden"
      >
        {/* Table toolbar */}
        <div className="flex items-center justify-between p-4 border-b border-[#E2E8F0]">
          <div className="flex items-center gap-2">
            <Checkbox checked={allSelected} onCheckedChange={toggleSelectAll} />
            <span className="text-sm text-[#64748B]">全选</span>
            {selectedIds.size > 0 && (
              <span className="text-xs text-[#64748B] ml-2">已选 {selectedIds.size} 条</span>
            )}
          </div>
          <div className="text-sm text-[#64748B]">
            共 {filteredRecords.length} 条记录
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-[#F7F6F4]">
                <th className="w-10 px-4 py-3"></th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-[#94A3B8] tracking-wide">学生</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-[#94A3B8]">评估类型</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-[#94A3B8]">评估模板</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-[#94A3B8]">评估日期</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-[#94A3B8]">评估者</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-[#94A3B8]">总分</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-[#94A3B8]">状态</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-[#94A3B8]">操作</th>
              </tr>
            </thead>
            <tbody>
              {paginatedRecords.map((record, idx) => (
                <motion.tr
                  key={record.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: idx * 0.05 }}
                  className="border-b border-[#E2E8F0] hover:bg-[#F7F6F4] transition-colors"
                >
                  <td className="px-4 py-4">
                    <Checkbox checked={selectedIds.has(record.id)} onCheckedChange={() => toggleSelect(record.id)} />
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-full bg-[#F5F0EB] flex items-center justify-center text-xs font-bold text-[#977653]">
                        {record.studentName[0]}
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-[#1E293B]">{record.studentName}</div>
                        <div className="text-xs text-[#94A3B8]">{record.studentNo}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <Badge className={`${typeBadgeColor[record.assessmentType] || 'bg-[#F0F2F5] text-[#64748B]'} text-xs font-medium border-0`}>
                      {record.assessmentType}
                    </Badge>
                  </td>
                  <td className="px-4 py-4 text-sm text-[#1E293B]">{record.templateName}</td>
                  <td className="px-4 py-4 text-sm text-[#64748B]">{record.assessmentDate}</td>
                  <td className="px-4 py-4 text-sm text-[#64748B]">{record.assessor}</td>
                  <td className="px-4 py-4 text-sm font-medium text-[#1E293B]">{record.totalScore}/{record.maxScore}</td>
                  <td className="px-4 py-4">
                    <Badge className={`${statusBadge[record.status].className} text-xs font-medium border-0`}>
                      {statusBadge[record.status].label}
                    </Badge>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-1">
                      <button onClick={() => openDetail(record)} className="w-8 h-8 rounded-full flex items-center justify-center text-[#64748B] hover:bg-[#F5F0EB] hover:text-[#977653] transition-colors cursor-pointer" title="查看报告">
                        <Eye className="w-4 h-4" />
                      </button>
                      {!readOnly && (record.status === 'draft' || record.status === 'in_progress') && (
                        <button onClick={() => { openNewAssessment(); }} className="w-8 h-8 rounded-full flex items-center justify-center text-[#64748B] hover:bg-[#EFF6FF] hover:text-[#3B82F6] transition-colors cursor-pointer" title="继续编辑">
                          <Pencil className="w-4 h-4" />
                        </button>
                      )}
                      {!readOnly && (
                        <>
                          <button onClick={() => handleDuplicate(record)} className="w-8 h-8 rounded-full flex items-center justify-center text-[#64748B] hover:bg-[#F5F0EB] hover:text-[#977653] transition-colors cursor-pointer" title="复制">
                            <Copy className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDelete(record.id)} className="w-8 h-8 rounded-full flex items-center justify-center text-[#64748B] hover:bg-[#FEF2F2] hover:text-[#EF4444] transition-colors cursor-pointer" title="删除">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>

        {paginatedRecords.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16">
            <ClipboardPlus className="w-12 h-12 text-[#94A3B8] mb-4" />
            <h4 className="text-base font-semibold text-[#1E293B] mb-1">暂无评估记录</h4>
            <p className="text-sm text-[#64748B] mb-4">
              {readOnly ? '当前权限范围内无评估记录' : '点击上方按钮录入第一个评估'}
            </p>
            {!readOnly && (
              <Button onClick={() => openNewAssessment()} className="bg-[#977653] hover:bg-[#7A5F42]">
                <ClipboardPlus className="w-4 h-4 mr-2" />
                录入评估
              </Button>
            )}
          </div>
        )}

        {/* Pagination */}
        {filteredRecords.length > 0 && (
          <div className="flex items-center justify-between p-4 border-t border-[#E2E8F0]">
            <div className="text-sm text-[#64748B]">
              第 {page} / {totalPages} 页，共 {filteredRecords.length} 条
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 rounded-md text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#F7F6F4] transition-colors"
              >
                上一页
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`w-8 h-8 rounded-md text-sm font-medium transition-colors ${p === page ? 'bg-[#977653] text-white' : 'text-[#64748B] hover:bg-[#F7F6F4]'}`}
                >
                  {p}
                </button>
              ))}
              <button
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 rounded-md text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#F7F6F4] transition-colors"
              >
                下一页
              </button>
            </div>
          </div>
        )}
      </motion.div>

      {/* ─── Drawer ─── */}
      <AnimatePresence>
        {drawerOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
              onClick={() => setDrawerOpen(false)}
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
              className="fixed right-0 top-0 h-full w-[800px] max-w-[95vw] bg-white z-50 shadow-xl overflow-y-auto"
            >
              {drawerMode === 'new' ? (
                <NewAssessmentDrawer
                  currentStep={currentStep}
                  selectedTemplate={selectedTemplate}
                  selectedStudent={selectedStudent}
                  assessmentDate={assessmentDate}
                  assessor={assessor}
                  assessmentEnv={assessmentEnv}
                  studentState={studentState}
                  toolsUsed={toolsUsed}
                  note={note}
                  itemScores={itemScores}
                  itemNotes={itemNotes}
                  activeDimension={activeDimension}
                  recommendations={recommendations}
                  studentSearch={studentSearch}
                  filteredStudents={filteredStudents}
                  currentScores={currentScores}
                  dimensionProgress={dimensionProgress}
                  onClose={() => setDrawerOpen(false)}
                  onNext={handleNext}
                  onPrev={handlePrev}
                  onSubmit={handleSubmit}
                  onSaveDraft={handleSaveDraft}
                  onSelectTemplate={openNewAssessment}
                  onSelectStudent={setSelectedStudent}
                  onSetAssessmentDate={setAssessmentDate}
                  onSetAssessor={setAssessor}
                  onSetAssessmentEnv={setAssessmentEnv}
                  onSetStudentState={setStudentState}
                  onSetToolsUsed={setToolsUsed}
                  onSetNote={setNote}
                  onSetItemScore={(itemId, score) => setItemScores((prev) => ({ ...prev, [itemId]: score }))}
                  onSetItemNote={(itemId, note) => setItemNotes((prev) => ({ ...prev, [itemId]: note }))}
                  onSetActiveDimension={setActiveDimension}
                  onSetRecommendations={setRecommendations}
                  onSetStudentSearch={setStudentSearch}
                  onRestart={() => {
                    setCurrentStep(1);
                    setSelectedStudent(null);
                    setSelectedTemplate(null);
                    setItemScores({});
                    setItemNotes({});
                  }}
                  onOpenDetail={() => {
                    if (records.length > 0) {
                      setDrawerMode('detail');
                      setActiveRecord(records[0]);
                    }
                  }}
                />
              ) : (
                activeRecord && (
                  <DetailDrawer
                    record={activeRecord}
                    onClose={() => setDrawerOpen(false)}
                  />
                )
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── New Assessment Drawer ─── */

interface NewAssessmentDrawerProps {
  currentStep: number;
  selectedTemplate: AssessmentTemplate | null;
  selectedStudent: Student | null;
  assessmentDate: string;
  assessor: string;
  assessmentEnv: string;
  studentState: string;
  toolsUsed: string;
  note: string;
  itemScores: Record<string, number>;
  itemNotes: Record<string, string>;
  activeDimension: string;
  recommendations: string;
  studentSearch: string;
  filteredStudents: Student[];
  currentScores: { total: number; max: number; pct: number };
  dimensionProgress: (Dimension & { scored: number; total: number; dimTotal: number; dimMax: number })[];
  onClose: () => void;
  onNext: () => void;
  onPrev: () => void;
  onSubmit: () => void;
  onSaveDraft: () => void;
  onSelectTemplate: (t: AssessmentTemplate) => void;
  onSelectStudent: (s: Student | null) => void;
  onSetAssessmentDate: (v: string) => void;
  onSetAssessor: (v: string) => void;
  onSetAssessmentEnv: (v: string) => void;
  onSetStudentState: (v: string) => void;
  onSetToolsUsed: (v: string) => void;
  onSetNote: (v: string) => void;
  onSetItemScore: (itemId: string, score: number) => void;
  onSetItemNote: (itemId: string, note: string) => void;
  onSetActiveDimension: (id: string) => void;
  onSetRecommendations: (v: string) => void;
  onSetStudentSearch: (v: string) => void;
  onRestart: () => void;
  onOpenDetail: () => void;
}

function NewAssessmentDrawer({
  currentStep,
  selectedTemplate,
  selectedStudent,
  assessmentDate,
  assessor,
  assessmentEnv,
  studentState,
  toolsUsed,
  note,
  itemScores,
  itemNotes,
  activeDimension,
  recommendations,
  studentSearch,
  filteredStudents,
  currentScores,
  dimensionProgress,
  onClose,
  onNext,
  onPrev,
  onSubmit,
  onSaveDraft,
  onSelectTemplate,
  onSelectStudent,
  onSetAssessmentDate,
  onSetAssessor,
  onSetAssessmentEnv,
  onSetStudentState,
  onSetToolsUsed,
  onSetNote,
  onSetItemScore,
  onSetItemNote,
  onSetActiveDimension,
  onSetRecommendations,
  onSetStudentSearch,
  onRestart,
  onOpenDetail,
}: NewAssessmentDrawerProps) {
  const stepLabels = ['选择学生', '填写信息', '评估打分', '完成确认'];

  return (
    <div className="flex flex-col h-full">
      {/* Drawer Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#E2E8F0]">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center text-[#64748B] hover:bg-[#F7F6F4] transition-colors cursor-pointer">
            <X className="w-5 h-5" />
          </button>
          <h3 className="text-lg font-semibold text-[#1E293B]">
            {currentStep < 4 ? '录入评估' : '评估完成'}
            {selectedTemplate ? ` - ${selectedTemplate.name}` : ''}
          </h3>
        </div>
        {currentStep < 4 && (
          <Button variant="ghost" size="sm" onClick={onSaveDraft}>
            保存草稿
          </Button>
        )}
      </div>

      {/* Step Indicator */}
      {currentStep < 4 && (
        <div className="px-6 py-5">
          <div className="flex items-center justify-between relative">
            <div className="absolute top-1/2 left-0 right-0 h-[2px] bg-[#E2E8F0] -translate-y-1/2" />
            {stepLabels.map((label, i) => {
              const stepNum = i + 1;
              const isCompleted = currentStep > stepNum;
              const isActive = currentStep === stepNum;
              return (
                <div key={stepNum} className="relative flex flex-col items-center z-10">
                  <motion.div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold border-2 ${
                      isCompleted
                        ? 'bg-[#10B981] border-[#10B981] text-white'
                        : isActive
                        ? 'bg-[#977653] border-[#977653] text-white'
                        : 'bg-white border-[#CBD5E1] text-[#94A3B8]'
                    }`}
                    animate={isActive ? { scale: [1, 1.1, 1] } : {}}
                    transition={{ repeat: Infinity, duration: 1.5 }}
                  >
                    {isCompleted ? <Check className="w-4 h-4" /> : stepNum}
                  </motion.div>
                  <span className={`text-xs mt-1.5 ${isActive ? 'text-[#977653] font-medium' : 'text-[#94A3B8]'}`}>
                    {label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 px-6 py-4 overflow-y-auto">
        {/* Step 1: Select Student & Template */}
        {currentStep === 1 && (
          <div className="space-y-6">
            {/* Template Selection */}
            <div>
              <label className="block text-sm font-medium text-[#1E293B] mb-2">评估模板 <span className="text-[#EF4444]">*</span></label>
              {!selectedTemplate ? (
                <div className="flex flex-wrap gap-3">
                  {templates.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => onSelectTemplate(t)}
                      className="flex items-center gap-3 p-3 border border-[#E2E8F0] rounded-lg hover:border-[#C1AC96] hover:shadow-sm transition-all cursor-pointer text-left"
                    >
                      {templateQuickIcons[t.icon]}
                      <div>
                        <div className="text-sm font-medium text-[#1E293B]">{t.name}</div>
                        <div className="text-xs text-[#94A3B8]">{t.category}</div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-3 p-3 bg-[#F5F0EB] border border-[#D6C8B8] rounded-lg">
                  {templateQuickIcons[selectedTemplate.icon]}
                  <div className="flex-1">
                    <div className="text-sm font-medium text-[#1E293B]">{selectedTemplate.name}</div>
                    <div className="text-xs text-[#64748B]">{selectedTemplate.description}</div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => { onSelectTemplate(null as any); }}>更改</Button>
                </div>
              )}
            </div>

            {/* Student Search */}
            <div>
              <label className="block text-sm font-medium text-[#1E293B] mb-2">选择学生 <span className="text-[#EF4444]">*</span></label>
              {!selectedStudent ? (
                <>
                  <div className="relative mb-3">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
                    <Input
                      placeholder="搜索学生姓名或学号..."
                      value={studentSearch}
                      onChange={(e) => onSetStudentSearch(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <div className="border border-[#E2E8F0] rounded-lg overflow-hidden max-h-[300px] overflow-y-auto">
                    {filteredStudents.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => onSelectStudent(s)}
                        className="flex items-center gap-3 w-full px-4 py-3 text-left hover:bg-[#F5F0EB] transition-colors cursor-pointer border-b border-[#E2E8F0] last:border-0"
                      >
                        <div className="w-8 h-8 rounded-full bg-[#F5F0EB] flex items-center justify-center text-xs font-bold text-[#977653]">
                          {s.name[0]}
                        </div>
                        <div className="flex-1">
                          <div className="text-sm font-medium text-[#1E293B]">{s.name}</div>
                          <div className="text-xs text-[#94A3B8]">{s.studentNo} · {s.className}</div>
                        </div>
                        <div className="text-xs text-[#64748B]">{s.disabilityType}</div>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-3 p-4 bg-[#F5F0EB] border border-[#D6C8B8] rounded-lg">
                  <div className="w-10 h-10 rounded-full bg-[#977653] flex items-center justify-center text-sm font-bold text-white">
                    {selectedStudent.name[0]}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-[#1E293B]">{selectedStudent.name}</div>
                    <div className="text-xs text-[#64748B]">{selectedStudent.studentNo} · {selectedStudent.className} · {selectedStudent.disabilityType}</div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => onSelectStudent(null)}>更改</Button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 2: Fill Info */}
        {currentStep === 2 && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-[#1E293B] mb-1.5">评估模板</label>
                <Input value={selectedTemplate?.name || ''} readOnly className="bg-[#F7F6F4]" />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#1E293B] mb-1.5">评估日期 <span className="text-[#EF4444]">*</span></label>
                <Input type="date" value={assessmentDate} onChange={(e) => onSetAssessmentDate(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#1E293B] mb-1.5">评估者</label>
                <Input value={assessor} onChange={(e) => onSetAssessor(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#1E293B] mb-1.5">评估环境</label>
                <Select value={assessmentEnv} onValueChange={onSetAssessmentEnv}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="教室">教室</SelectItem>
                    <SelectItem value="个训室">个训室</SelectItem>
                    <SelectItem value="活动室">活动室</SelectItem>
                    <SelectItem value="自然情境">自然情境</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#1E293B] mb-1.5">被评估者状态</label>
              <Textarea placeholder="评估时学生的配合度、情绪状态等..." value={studentState} onChange={(e) => onSetStudentState(e.target.value)} rows={3} />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#1E293B] mb-1.5">使用工具/材料</label>
              <Textarea placeholder="评估中使用的教具、工具等..." value={toolsUsed} onChange={(e) => onSetToolsUsed(e.target.value)} rows={3} />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#1E293B] mb-1.5">备注</label>
              <Textarea placeholder="其他备注信息..." value={note} onChange={(e) => onSetNote(e.target.value)} rows={2} />
            </div>
          </motion.div>
        )}

        {/* Step 3: Scoring */}
        {currentStep === 3 && selectedTemplate && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex gap-4 h-[calc(100vh-280px)]">
            {/* Left: Dimension Nav */}
            <div className="w-[200px] flex-shrink-0 border-r border-[#E2E8F0] pr-3">
              <div className="text-xs font-medium text-[#94A3B8] mb-2 uppercase tracking-wider">评估维度</div>
              <div className="space-y-1">
                {dimensionProgress.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => onSetActiveDimension(d.id)}
                    className={`flex items-center justify-between w-full px-3 py-2.5 rounded-lg text-left text-sm transition-colors cursor-pointer ${
                      activeDimension === d.id ? 'bg-[#F5F0EB] text-[#977653] font-medium' : 'text-[#64748B] hover:bg-[#F7F6F4]'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      {d.scored === d.total && <CheckCircle2 className="w-3.5 h-3.5 text-[#10B981]" />}
                      {d.name}
                    </span>
                    <span className="text-xs text-[#94A3B8]">{d.dimTotal}/{d.dimMax}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Right: Scoring Detail */}
            <div className="flex-1 overflow-y-auto px-2">
              {selectedTemplate.dimensions.map((dim) => {
                if (dim.id !== activeDimension) return null;
                return (
                  <div key={dim.id}>
                    <h3 className="text-lg font-semibold text-[#1E293B] mb-1">{dim.name}</h3>
                    <p className="text-xs text-[#94A3B8] mb-4">请根据学生的表现对每个项目进行评分</p>
                    <div className="space-y-4">
                      {dim.items.map((item) => (
                        <motion.div
                          key={item.id}
                          layout
                          className="p-4 bg-[#F7F6F4] rounded-lg"
                        >
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <div className="text-sm font-semibold text-[#1E293B]">{item.name}</div>
                              <div className="text-xs text-[#94A3B8] mt-0.5">{item.description}</div>
                            </div>
                            <Badge variant="outline" className="text-xs">1-{item.maxScore}分</Badge>
                          </div>
                          <div className="flex gap-2 mb-2">
                            {[1, 2, 3, 4, 5].map((score) => (
                              <motion.button
                                key={score}
                                whileTap={{ scale: 0.95 }}
                                onClick={() => onSetItemScore(item.id, score)}
                                className={`w-10 h-10 rounded-lg border text-sm font-semibold transition-all cursor-pointer ${
                                  itemScores[item.id] === score
                                    ? scoreColors[score] + ' scale-105 shadow-sm'
                                    : 'bg-white border-[#E2E8F0] text-[#64748B] hover:bg-[#F5F0EB]'
                                }`}
                              >
                                {score}
                              </motion.button>
                            ))}
                          </div>
                          <Input
                            placeholder="备注（可选）..."
                            value={itemNotes[item.id] || ''}
                            onChange={(e) => onSetItemNote(item.id, e.target.value)}
                            className="h-8 text-sm"
                          />
                        </motion.div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* Step 4: Summary */}
        {currentStep === 4 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center py-10">
            <motion.div
              initial={{ scale: 0, rotate: -10 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 200, damping: 15, duration: 0.5 }}
            >
              <CheckCircle2 className="w-16 h-16 text-[#10B981] mb-4" />
            </motion.div>
            <h2 className="text-[22px] font-semibold text-[#1E293B] mb-2">评估录入完成！</h2>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="w-full max-w-md bg-[#F7F6F4] rounded-lg p-5 mt-4"
            >
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="text-[#64748B]">学生</div>
                <div className="text-[#1E293B] font-medium">{selectedStudent?.name}</div>
                <div className="text-[#64748B]">评估类型</div>
                <div className="text-[#1E293B] font-medium">{selectedTemplate?.name}</div>
                <div className="text-[#64748B]">评估日期</div>
                <div className="text-[#1E293B] font-medium">{assessmentDate}</div>
                <div className="text-[#64748B]">总分</div>
                <div className="text-[#1E293B] font-medium">{currentScores.total}/{currentScores.max} ({currentScores.pct}%)</div>
                <div className="text-[#64748B]">评估者</div>
                <div className="text-[#1E293B] font-medium">{assessor}</div>
              </div>
            </motion.div>
            <div className="flex gap-3 mt-6">
              <Button onClick={onRestart} variant="secondary">
                继续录入下一个
              </Button>
              <Button onClick={onOpenDetail} variant="outline">
                查看详情
              </Button>
            </div>
          </motion.div>
        )}
      </div>

      {/* Bottom Action Bar */}
      {currentStep < 4 && (
        <div className="flex items-center justify-between px-6 py-4 border-t border-[#E2E8F0] bg-white">
          <Button variant="secondary" onClick={onPrev} disabled={currentStep === 1}>
            <ChevronLeft className="w-4 h-4 mr-1" />
            上一步
          </Button>
          <Button variant="ghost" onClick={onSaveDraft}>
            保存草稿
          </Button>
          <Button onClick={currentStep === 3 ? onSubmit : onNext} className="bg-[#977653] hover:bg-[#7A5F42]">
            {currentStep === 3 ? '提交完成' : '下一步'}
            {currentStep !== 3 && <ChevronRight className="w-4 h-4 ml-1" />}
          </Button>
        </div>
      )}

      {/* Progress Bar for Step 3 */}
      {currentStep === 3 && (
        <div className="px-6 py-3 border-t border-[#E2E8F0] bg-[#F7F6F4]">
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="text-[#64748B]">
              已完成维度: {dimensionProgress.filter((d) => d.scored === d.total).length}/{dimensionProgress.length}
            </span>
            <span className="font-semibold text-[#1E293B]">
              总分: {currentScores.total}/{currentScores.max}
            </span>
          </div>
          <div className="w-full h-2 bg-[#E2E8F0] rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-[#977653] rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${currentScores.max > 0 ? (currentScores.total / currentScores.max) * 100 : 0}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Detail Drawer ─── */

interface DetailDrawerProps {
  record: EvaluationRecord;
  onClose: () => void;
}

const comparisonData = [
  { dimension: '认知能力', current: 65, previous: 55, change: +10 },
  { dimension: '语言能力', current: 48, previous: 42, change: +6 },
  { dimension: '社交技能', current: 72, previous: 68, change: +4 },
  { dimension: '生活自理', current: 80, previous: 70, change: +10 },
  { dimension: '运动能力', current: 60, previous: 58, change: +2 },
];

function DetailDrawer({ record, onClose }: DetailDrawerProps) {
  const template = templateMap.get(record.templateId);
  const pct = record.maxScore > 0 ? Math.round((record.totalScore / record.maxScore) * 100) : 0;
  const grade = getGradeLabel(pct);

  const exportSingleReport = async (fmt: 'pdf' | 'docx') => {
    try {
      await ioExportDownload('assessments', fmt, { id: record.id }, `评估报告_${record.studentName}_${record.assessmentDate}`);
      toast.success(fmt === 'pdf' ? '评估报告 PDF 已导出' : '评估报告 Word 已导出');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '报告导出失败');
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#E2E8F0]">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center text-[#64748B] hover:bg-[#F7F6F4] transition-colors cursor-pointer">
            <X className="w-5 h-5" />
          </button>
          <h3 className="text-lg font-semibold text-[#1E293B]">
            评估报告 - {record.studentName} - {record.templateName}
          </h3>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => void exportSingleReport('pdf')}>
            <FileText className="w-4 h-4 mr-1" />
            导出PDF
          </Button>
          <Button variant="secondary" size="sm" onClick={() => void exportSingleReport('docx')}>
            <Download className="w-4 h-4 mr-1" />
            导出Word
          </Button>
        </div>
      </div>

      {/* Report Content */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
        {/* Basic Info */}
        <div className="bg-[#F7F6F4] rounded-lg p-5">
          <h4 className="text-base font-semibold text-[#1E293B] mb-4">基本信息</h4>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div><span className="text-[#64748B]">学生姓名：</span><span className="text-[#1E293B] font-medium">{record.studentName}</span></div>
            <div><span className="text-[#64748B]">学号：</span><span className="text-[#1E293B]">{record.studentNo}</span></div>
            <div><span className="text-[#64748B]">班级：</span><span className="text-[#1E293B]">{record.className}</span></div>
            <div><span className="text-[#64748B]">评估日期：</span><span className="text-[#1E293B]">{record.assessmentDate}</span></div>
            <div><span className="text-[#64748B]">评估者：</span><span className="text-[#1E293B]">{record.assessor}</span></div>
            <div><span className="text-[#64748B]">评估类型：</span><span className="text-[#1E293B]">{record.assessmentType}</span></div>
          </div>
        </div>

        {/* Total Score */}
        <div className="bg-white border border-[#E2E8F0] rounded-lg p-5">
          <h4 className="text-base font-semibold text-[#1E293B] mb-4">评估总分</h4>
          <div className="flex items-center gap-6">
            <div className="relative w-28 h-28">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="42" fill="none" stroke="#E2E8F0" strokeWidth="8" />
                <motion.circle
                  cx="50" cy="50" r="42" fill="none"
                  stroke="#977653" strokeWidth="8" strokeLinecap="round"
                  strokeDasharray={`${pct * 2.64} ${264 - pct * 2.64}`}
                  initial={{ strokeDasharray: '0 264' }}
                  animate={{ strokeDasharray: `${pct * 2.64} ${264 - pct * 2.64}` }}
                  transition={{ duration: 1, ease: 'easeOut' }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold text-[#1E293B]">{pct}%</span>
              </div>
            </div>
            <div>
              <div className="text-3xl font-bold text-[#1E293B]">{record.totalScore}<span className="text-lg text-[#94A3B8]">/{record.maxScore}</span></div>
              <div className={`text-sm font-medium mt-1 ${grade.color}`}>评级：{grade.label}</div>
            </div>
          </div>
        </div>

        {/* Dimension Breakdown */}
        {template && (
          <div className="bg-white border border-[#E2E8F0] rounded-lg p-5">
            <h4 className="text-base font-semibold text-[#1E293B] mb-4">各维度得分</h4>
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#E2E8F0]">
                  <th className="text-left py-2 text-xs font-semibold text-[#94A3B8]">维度</th>
                  <th className="text-left py-2 text-xs font-semibold text-[#94A3B8]">得分</th>
                  <th className="text-left py-2 text-xs font-semibold text-[#94A3B8]">满分</th>
                  <th className="text-left py-2 text-xs font-semibold text-[#94A3B8]">百分比</th>
                  <th className="text-left py-2 text-xs font-semibold text-[#94A3B8]">等级</th>
                </tr>
              </thead>
              <tbody>
                {template.dimensions.map((dim) => {
                  const dimScore = Math.round(record.totalScore * (dim.items.reduce((s, it) => s + it.maxScore, 0) / record.maxScore));
                  const dimMax = dim.items.reduce((s, it) => s + it.maxScore, 0);
                  const dimPct = Math.round((dimScore / dimMax) * 100);
                  const dimGrade = getGradeLabel(dimPct);
                  return (
                    <tr key={dim.id} className="border-b border-[#E2E8F0] last:border-0">
                      <td className="py-3 text-sm text-[#1E293B] font-medium">{dim.name}</td>
                      <td className="py-3 text-sm text-[#1E293B]">{dimScore}</td>
                      <td className="py-3 text-sm text-[#64748B]">{dimMax}</td>
                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-2 bg-[#E2E8F0] rounded-full overflow-hidden">
                            <div className="h-full bg-[#977653] rounded-full" style={{ width: `${dimPct}%` }} />
                          </div>
                          <span className="text-xs text-[#64748B]">{dimPct}%</span>
                        </div>
                      </td>
                      <td className={`py-3 text-xs font-medium ${dimGrade.color}`}>{dimGrade.label}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Cross-period Comparison */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white border border-[#E2E8F0] rounded-lg p-5"
        >
          <h4 className="text-base font-semibold text-[#1E293B] mb-4">与上期评估对比</h4>

          {/* Comparison Table */}
          <div className="overflow-hidden rounded-lg border border-[#E2E8F0] mb-5">
            <table className="w-full">
              <thead className="bg-[#F7F6F4]">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-[#94A3B8]">维度</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-[#94A3B8]">当前得分</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-[#94A3B8]">上期得分</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-[#94A3B8]">变化</th>
                </tr>
              </thead>
              <tbody>
                {comparisonData.map((item, index) => (
                  <motion.tr
                    key={item.dimension}
                    initial={{ opacity: 0, x: -5 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.4 + index * 0.05 }}
                    className="border-t border-[#F1F5F9]"
                  >
                    <td className="px-4 py-3 text-sm font-medium text-[#1E293B]">{item.dimension}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-[#977653]">{item.current}</td>
                    <td className="px-4 py-3 text-sm text-[#64748B]">{item.previous}</td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1">
                        {item.change > 0 ? (
                          <TrendingUp className="w-4 h-4 text-[#10B981]" />
                        ) : item.change < 0 ? (
                          <TrendingDown className="w-4 h-4 text-[#EF4444]" />
                        ) : (
                          <Minus className="w-4 h-4 text-[#94A3B8]" />
                        )}
                        <span className={cn(
                          'text-sm font-medium',
                          item.change > 0 ? 'text-[#10B981]' :
                          item.change < 0 ? 'text-[#EF4444]' :
                          'text-[#94A3B8]'
                        )}>
                          {item.change > 0 ? `+${item.change}` : item.change}
                        </span>
                      </span>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Comparison Bar Chart */}
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={comparisonData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                <XAxis
                  dataKey="dimension"
                  tick={{ fontSize: 12, fill: '#94A3B8' }}
                  tickLine={false}
                  axisLine={{ stroke: '#E2E8F0' }}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fontSize: 12, fill: '#94A3B8' }}
                  tickLine={false}
                  axisLine={{ stroke: '#E2E8F0' }}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="bg-white border border-[#E2E8F0] rounded-lg px-3 py-2 shadow-sm">
                          <p className="text-xs text-[#94A3B8]">{label}</p>
                          {payload.map((entry, index) => (
                            <p key={index} className="text-sm font-medium" style={{ color: entry.color }}>
                              {entry.name === 'current' ? '当前' : '上期'}: {entry.value}
                            </p>
                          ))}
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Legend
                  formatter={(value: string) => (
                    <span className="text-xs text-[#64748B]">
                      {value === 'current' ? '当前得分' : '上期得分'}
                    </span>
                  )}
                />
                <Bar
                  dataKey="previous"
                  name="previous"
                  fill="#CBD5E1"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={40}
                />
                <Bar
                  dataKey="current"
                  name="current"
                  fill="#977653"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={40}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Recommendations */}
        {record.recommendations && (
          <div className="bg-white border border-[#E2E8F0] rounded-lg p-5">
            <h4 className="text-base font-semibold text-[#1E293B] mb-3">评估建议</h4>
            <p className="text-sm text-[#64748B] leading-relaxed">{record.recommendations}</p>
          </div>
        )}

        {/* Signatures */}
        <div className="bg-white border border-[#E2E8F0] rounded-lg p-5">
          <h4 className="text-base font-semibold text-[#1E293B] mb-4">签名确认</h4>
          <div className="grid grid-cols-2 gap-8">
            <div>
              <div className="text-sm text-[#64748B] mb-2">评估者签名</div>
              <div className="h-20 border border-dashed border-[#CBD5E1] rounded-lg flex items-center justify-center text-sm text-[#94A3B8]">
                {record.assessor}
              </div>
              <div className="text-xs text-[#94A3B8] mt-1">日期：{record.assessmentDate}</div>
            </div>
            <div>
              <div className="text-sm text-[#64748B] mb-2">家长签名</div>
              <div className="h-20 border border-dashed border-[#CBD5E1] rounded-lg flex items-center justify-center text-sm text-[#94A3B8]">
                待签名
              </div>
              <div className="text-xs text-[#94A3B8] mt-1">日期：</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
