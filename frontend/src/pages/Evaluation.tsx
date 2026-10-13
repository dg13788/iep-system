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
  Wand2,
  Heart,
  BookOpen,
  ClipboardCheck,
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
import { useIsReadOnly, useDataScopeConfig } from '@/utils/dataScope';
import { useDrawerA11y } from '@/hooks/useDrawerA11y';
import { ioExportDownload } from '@/utils/ioExport';
import ImportExportActions from '@/components/io/ImportExportActions';
import {
  fetchAssessments,
  fetchAssessment,
  fetchAssessmentTemplates,
  fetchTemplateItems,
  createAssessment,
  updateAssessment,
  deleteAssessment,
  type AssessmentTypeOption,
} from '@/services/evaluation';
import { fetchIEPList } from '@/services/iep';
import GoalDraftDrawer from '@/pages/iep/GoalDraftDrawer';
import { fetchStudents as fetchStudentsList } from '@/services/students';
import { useAuthStore } from '@/store/authStore';
import Pagination from '@/components/ui/pagination';
import ConfirmDialog from '@/components/feedback/ConfirmDialog';

/* ─── Data Scope Badge ─── */
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
  /** 字典编码（initial/midterm/final/annual） */
  assessmentType: string;
  /** 字典展示名（初期评估…），由后端随列表下发 */
  assessmentTypeLabel: string;
  assessmentDate: string;
  assessor: string;
  totalScore: number;
  maxScore: number;
  status: 'completed' | 'in_progress' | 'draft';
  scores: Record<string, Record<string, number>>;
  notes: Record<string, Record<string, string>>;
  /** 详情接口返回的条目得分（编辑态回填用） */
  items?: { dimension: string; item_name: string; score: number; max_score: number; notes: string }[];
  recommendations?: string;
}

interface Student {
  id: string;
  name: string;
  studentNo: string;
  className: string;
  disabilityType: string;
}

/**
 * v14：模板卡片图标按分类取（原 mock 模板自带 icon 字段，真实模板没有，
 * 全部落回 brain 图标）。分类取值见 assessment_templates.category。
 */
const CATEGORY_ICON_STYLE: Record<string, { icon: React.ReactNode; color: string }> = {
  '认知发展': { icon: <Brain className="w-8 h-8" style={{ color: '#977653' }} />, color: '#977653' },
  '沟通交往': { icon: <MessageSquare className="w-8 h-8" style={{ color: '#3B82F6' }} />, color: '#3B82F6' },
  '运动能力': { icon: <Activity className="w-8 h-8" style={{ color: '#10B981' }} />, color: '#10B981' },
  '社会适应': { icon: <Users className="w-8 h-8" style={{ color: '#F59E0B' }} />, color: '#F59E0B' },
  '生活自理': { icon: <HomeIcon className="w-8 h-8" style={{ color: '#405680' }} />, color: '#405680' },
  '情绪行为': { icon: <Heart className="w-8 h-8" style={{ color: '#EC4899' }} />, color: '#EC4899' },
  '学业准备': { icon: <BookOpen className="w-8 h-8" style={{ color: '#8B5CF6' }} />, color: '#8B5CF6' },
  '课程本位': { icon: <ClipboardCheck className="w-8 h-8" style={{ color: '#0EA5E9' }} />, color: '#0EA5E9' },
  '能力本位': { icon: <ClipboardCheck className="w-8 h-8" style={{ color: '#14B8A6' }} />, color: '#14B8A6' },
  '专项评估': { icon: <FileText className="w-8 h-8" style={{ color: '#64748B' }} />, color: '#64748B' },
};

function templateIcon(t: AssessmentTemplate): React.ReactNode {
  return CATEGORY_ICON_STYLE[t.category]?.icon ?? <FileText className="w-8 h-8" style={{ color: '#977653' }} />;
}

function templateColor(t: AssessmentTemplate): string {
  return CATEGORY_ICON_STYLE[t.category]?.color ?? '#977653';
}

/** 模板满分：各维度条目满分之和（随选中模板实时计算，不再查 mock 映射表） */
function calcTemplateMaxScore(t: AssessmentTemplate | null): number {
  if (!t) return 100;
  return t.dimensions.reduce((sum, d) => sum + d.items.reduce((s, i) => s + i.maxScore, 0), 0);
}

/**
 * 修复说明(P0-2)：原先此处为 `const readOnly = isReadOnly();`，
 * 写在**模块顶层**。模块在应用启动（用户尚未登录）时被求值一次即永久冻结为
 * true，导致超管登录后「录入评估」「继续评估」「编辑/删除」按钮全部消失，
 * 评估页只剩一个「导出」按钮。
 * 现改为在 Evaluation 组件内部通过 useIsReadOnly() 订阅 authStore 求值。
 */

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

/**
 * v14：评估类型字典兜底常量。
 * 唯一口径是后端 /assessments/list 随列表下发的 assessment_types（dict_common）。
 * 此前前端硬编码「认知发展/语言能力/运动能力/社交适应/生活自理」旧五类做筛选，
 * 与存量数据（全部 initial）完全对不上——选任何一项都查不到记录；
 * 而新建评估落库的又是模板分类（课程本位/专项评估…），三套口径互相矛盾。
 * 此处仅在接口未下发字典时兜底，避免"加载失败"被渲染成"没有类型可选"。
 */
const FALLBACK_ASSESSMENT_TYPES: AssessmentTypeOption[] = [
  { code: 'initial', name: '初期评估' },
  { code: 'midterm', name: '中期评估' },
  { code: 'final', name: '末期评估' },
  { code: 'annual', name: '年度评估' },
];

const scoreColors = [
  '',
  'bg-[#FEF2F2] text-[#DC2626] border-[#FECACA]',
  'bg-[#FFFBEB] text-[#D97706] border-[#FDE68A]',
  'bg-[#EFF6FF] text-[#2563EB] border-[#BFDBFE]',
  'bg-[#F5F0EB] text-[#5C4832] border-[#D6C8B8]',
  'bg-[#ECFDF5] text-[#059669] border-[#A7F3D0]',
];

function getGradeLabel(pct: number): { label: string; color: string } {
  if (pct >= 90) return { label: '优秀', color: 'text-[#059669]' };
  if (pct >= 75) return { label: '良好', color: 'text-[#977653]' };
  if (pct >= 60) return { label: '一般', color: 'text-[#3B82F6]' };
  return { label: '需加强', color: 'text-[#EF4444]' };
}

/* ─── Main Component ─── */

export default function Evaluation() {
  /* P0-2 修复：在组件内订阅 authStore 求值，避免模块顶层冻结为只读 */
  const readOnly = useIsReadOnly();

  /* Step 3：从评估起草 IEP 目标 */
  const [draftOpen, setDraftOpen] = useState(false);
  const [draftPlanId, setDraftPlanId] = useState<number | null>(null);
  const [draftAssessmentId, setDraftAssessmentId] = useState<number | null>(null);

  /** 评估 → IEP 的落点：找到该学生的 IEP 计划，把本次评估带进起草抽屉 */
  const handleDraftGoals = useCallback(async (record: EvaluationRecord) => {
    try {
      const r = await fetchIEPList({ student_id: record.studentId, pageSize: 100 });
      const plan = (r.list ?? [])[0];
      if (!plan) {
        toast.error('该学生还没有 IEP 计划，请先创建计划再据此起草目标');
        return;
      }
      setDraftPlanId(Number(plan.id));
      setDraftAssessmentId(Number(record.id));
      setDraftOpen(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '未找到可用的 IEP 计划');
    }
  }, []);

  /* List state */
  // 修复（三维度回测 0919 · P1-3 评估记录 mock 初始态）：
  // 原实现以本地 mock 数组作为初始 state，后端尚未返回甚至加载失败时，
  // 界面会持续展示「刘小美 / 生活自理评估 / 2025-01-02」这类根本不存在的档案，
  // 特教老师极可能把它当成真实评估记录。改为空态，由接口数据填充。
  const [records, setRecords] = useState<EvaluationRecord[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(false);
  // v14：评估类型字典由后端随列表下发（ADR-033），兜底常量防"加载失败=无可选项"
  const [assessmentTypes, setAssessmentTypes] = useState<AssessmentTypeOption[]>(FALLBACK_ASSESSMENT_TYPES);
  const [search, setSearch] = useState('');
  const [studentFilter, setStudentFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const pageSize = 8;

  /* Drawer state */
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<'new' | 'edit' | 'detail'>('new');
  const [activeRecord, setActiveRecord] = useState<EvaluationRecord | null>(null);
  /** v14：编辑态下被编辑的记录 id（草稿/进行中可继续编辑） */
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  // P3-1 修复：自研抽屉支持 Esc 关闭
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  useDrawerA11y(drawerOpen, closeDrawer);

  /* v14：评估模板改从后端真实模板库拉取。
   * 原实现用模块级 mock 模板（t1-t5「认知发展评估」等）：点卡片创建的评估
   * template_id 为空（'t1' → NaN → undefined）、条目是 mock 内容，
   * 与模板管理页维护的 30 个真实模板完全割裂。 */
  const [templates, setTemplates] = useState<AssessmentTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templateItemsLoading, setTemplateItemsLoading] = useState(false);

  /* New assessment flow state */
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedTemplate, setSelectedTemplate] = useState<AssessmentTemplate | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [assessmentDate, setAssessmentDate] = useState(new Date().toISOString().split('T')[0]);
  // v14：评估者默认取当前登录用户。原实现预填虚构人名「张老师」，而后端落库的
  // assessor_id 恒为当前用户（createAssessment 的 payload 里根本没有评估者字段）——
  // 表单显示与档案归属不一致，在特教评估档案里属于归因错误。输入框同步改为只读。
  const currentUserName = useAuthStore((s) => s.user?.name ?? '');
  const [assessor, setAssessor] = useState('');
  useEffect(() => {
    if (currentUserName && assessor === '') setAssessor(currentUserName);
  }, [currentUserName, assessor]);
  // v14：评估类型由教师按字典选择（初期/中期/末期/年度评估）。
  // 原实现取模板分类（课程本位/专项评估…）——分类与类型是两个维度，混用后
  // ①写入非字典值 ②按类型筛选永远查不到新建记录。默认初期评估。
  const [newAssessmentType, setNewAssessmentType] = useState('initial');
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
  // 同上：学生下拉同样不得以本地 mock 学生列表作为初始态，避免出现假学生可选。
  const [studentOptions, setStudentOptions] = useState<Student[]>([]);
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
      if (res.assessmentTypes.length > 0) {
        setAssessmentTypes(res.assessmentTypes);
      }
    } catch {
      // 保持空列表，UI 已提供兜底文案
    } finally {
      setRecordsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRecords();
    // v14：真实模板库（原 mock 模板整段已删）
    setTemplatesLoading(true);
    fetchAssessmentTemplates()
      .then((list) => setTemplates(list))
      .catch(() => {
        // 加载失败保持空列表，模板选择区显示"暂无可选模板"而非 mock 假模板
      })
      .finally(() => setTemplatesLoading(false));
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
        // 后端不可用时保持空下拉，不得回退假学生
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
    setEditingRecordId(null);
    setCurrentStep(1);
    setSelectedStudent(null);
    setSelectedTemplate(template || null);
    setAssessmentDate(new Date().toISOString().split('T')[0]);
    // v14：评估者取当前登录用户，不再重置为虚构人名
    setAssessor(currentUserName);
    setNewAssessmentType('initial');
    setAssessmentEnv('教室');
    setStudentState('');
    setToolsUsed('');
    setNote('');
    setItemScores({});
    setItemNotes({});
    setRecommendations('');
    setStudentSearch('');
    setActiveDimension('');
    setDrawerOpen(true);
    // v14：选中模板后异步拉取真实条目（模板列表接口不含维度/条目）
    if (template) {
      loadTemplateDimensions(template);
    }
  };

  /** v14：拉取模板维度与条目；失败时清空维度并提示，不得回退 mock 条目 */
  const loadTemplateDimensions = useCallback(async (template: AssessmentTemplate) => {
    setTemplateItemsLoading(true);
    try {
      const dims = await fetchTemplateItems(template.id);
      const full = { ...template, dimensions: dims };
      setSelectedTemplate(full);
      if (dims.length > 0) setActiveDimension(dims[0].id);
    } catch {
      setSelectedTemplate({ ...template, dimensions: [] });
      toast.error('模板条目加载失败，请重试');
    } finally {
      setTemplateItemsLoading(false);
    }
  }, []);

  /**
   * v14：继续编辑（草稿/进行中）。
   * 原实现点「继续编辑」调 openNewAssessment() 打开一张空白表单——
   * 教师以为在改草稿 A，提交后却新建了记录 B，属于会污染数据的误导入口。
   * 现改为真正的编辑态：载入原记录详情、模板条目，并把历史得分回填。
   */
  const openEditAssessment = useCallback(async (record: EvaluationRecord) => {
    setDrawerMode('edit');
    setEditingRecordId(record.id);
    setCurrentStep(1);
    setDrawerOpen(true);
    setTemplateItemsLoading(true);
    try {
      const detail = await fetchAssessment(record.id);
      const template = templates.find((t) => t.id === detail.templateId) ?? null;
      setSelectedStudent({
        id: detail.studentId,
        name: detail.studentName,
        studentNo: detail.studentNo,
        className: detail.className,
        disabilityType: '',
      });
      setAssessmentDate(detail.assessmentDate);
      setNewAssessmentType(detail.assessmentType || 'initial');
      setAssessor(detail.assessor || currentUserName);
      setNote('');
      setRecommendations(detail.recommendations ?? '');
      setStudentSearch('');
      if (template) {
        const dims = await fetchTemplateItems(template.id);
        setSelectedTemplate({ ...template, dimensions: dims });
        // 历史得分按「维度名 + 条目名」回填
        const scores: Record<string, number> = {};
        const notes: Record<string, string> = {};
        dims.forEach((d) => d.items.forEach((it) => {
          const hit = detail.items?.find((x) => x.dimension === d.name && x.item_name === it.name);
          if (hit) {
            scores[it.id] = hit.score ?? 0;
            if (hit.notes) notes[it.id] = hit.notes;
          }
        }));
        setItemScores(scores);
        setItemNotes(notes);
        if (dims.length > 0) setActiveDimension(dims[0].id);
      } else {
        setSelectedTemplate(null);
        setItemScores({});
        setItemNotes({});
      }
    } catch {
      toast.error('评估记录加载失败');
      setDrawerOpen(false);
    } finally {
      setTemplateItemsLoading(false);
    }
  }, [templates, currentUserName]);

  const openDetail = async (record: EvaluationRecord) => {
    setDrawerMode('detail');
    setDrawerOpen(true);
    try {
      // v14：详情必须拉真实条目明细。原实现直接把列表行丢进详情抽屉，
      // 「各维度得分」靠总分按维度满分比例估算（pro-rate），
      // 把估计值当实测值呈现——属于编造精度，已改为按 assessment_items 真实聚合。
      const detail = await fetchAssessment(record.id);
      setActiveRecord(detail);
    } catch {
      setActiveRecord(record);
      toast.error('评估详情加载失败，显示列表摘要');
    }
  };

  const handleNext = () => {
    if (currentStep === 1) {
      if (!selectedTemplate) {
        toast.error('请选择评估模板');
        return;
      }
      if (templateItemsLoading) {
        toast.error('模板条目加载中，请稍候');
        return;
      }
      if (selectedTemplate.dimensions.length === 0) {
        toast.error('该模板还没有条目，请先在「模板管理」中配置');
        return;
      }
      if (!selectedStudent) {
        toast.error('请选择学生');
        return;
      }
    }
    if (currentStep === 2) {
      if (!assessmentDate) {
        toast.error('请选择评估日期');
        return;
      }
      if (!newAssessmentType) {
        toast.error('请选择评估类型');
        return;
      }
    }
    if (currentStep < 4) setCurrentStep(currentStep + 1);
  };

  const handlePrev = () => {
    if (currentStep > 1) setCurrentStep(currentStep - 1);
  };

  const handleSubmit = async () => {
    if (!selectedStudent || !selectedTemplate) return;
    const maxScore = calcTemplateMaxScore(selectedTemplate);
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
      if (drawerMode === 'edit' && editingRecordId) {
        // v14：编辑态走 update（含条目整体重写），完成后状态回到已完成
        await updateAssessment(Number(editingRecordId), {
          assessment_type: newAssessmentType,
          date: assessmentDate,
          total_score: totalScore,
          max_score: maxScore,
          summary: note,
          recommendations,
          status: 'completed',
          items,
        });
        await loadRecords();
        toast.success('评估已更新');
        setDrawerOpen(false);
      } else {
        await createAssessment({
          student_id: Number(selectedStudent.id) || 0,
          // v14：评估类型取教师选择的字典编码，不再用模板分类顶替
          assessment_type: newAssessmentType,
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
      }
    } catch {
      toast.error(drawerMode === 'edit' ? '评估更新失败' : '评估录入失败');
    }
  };

  const handleSaveDraft = async () => {
    if (!selectedStudent || !selectedTemplate) {
      toast.error('请先选择学生和模板');
      return;
    }
    const maxScore = calcTemplateMaxScore(selectedTemplate);
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
      // v14：草稿同样可继续编辑——编辑态直接改原记录，不再新建后再打草稿标
      if (drawerMode === 'edit' && editingRecordId) {
        await updateAssessment(Number(editingRecordId), {
          assessment_type: newAssessmentType,
          date: assessmentDate,
          total_score: totalScore,
          max_score: maxScore,
          summary: note,
          recommendations,
          status: 'draft',
          items,
        });
        await loadRecords();
        toast.success('草稿已保存');
        setDrawerOpen(false);
        return;
      }
      const created = await createAssessment({
        student_id: Number(selectedStudent.id) || 0,
        // v14：评估类型取教师选择的字典编码，不再用模板分类顶替
        assessment_type: newAssessmentType,
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

  const [deleteTarget, setDeleteTarget] = useState<EvaluationRecord | null>(null);

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
        // v14：复制必须带上模板关联，否则复件是无模板孤儿记录
        template_id: record.templateId ? Number(record.templateId) : undefined,
      });
      await loadRecords();
      toast.success('已复制为空白评估（得分为空，请重新评分）');
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
            <Button onClick={() => openNewAssessment()} className="h-11 lg:h-10 bg-[#977653] hover:bg-[#7A5F42]">
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
              {studentOptions.map((s) => (
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
              {/* v14：选项改消费后端字典（code 为值、name 为展示）。
                  原硬编码旧五类与存量数据（initial）对不上，筛选恒为空。 */}
              {assessmentTypes.map((t) => (
                <SelectItem key={t.code} value={t.code}>{t.name}</SelectItem>
              ))}
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
        {templatesLoading ? (
          <div className="text-sm text-[#94A3B8] py-6">模板加载中…</div>
        ) : templates.length === 0 ? (
          <div className="text-sm text-[#94A3B8] py-6">暂无可用评估模板，请先在「模板管理」中创建</div>
        ) : (
          <div className="flex flex-wrap gap-3">
            {templates.map((t, i) => (
              <motion.button
                key={t.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: 0.2 + i * 0.06 }}
                onClick={() => openNewAssessment(t)}
                className="flex flex-col items-start w-[200px] p-4 bg-white border border-[#E2E8F0] rounded-lg text-left transition-all duration-150 hover:shadow-md hover:-translate-y-0.5 cursor-pointer group"
                style={{ borderColor: selectedTemplate?.id === t.id ? templateColor(t) : undefined, borderWidth: selectedTemplate?.id === t.id ? '2px' : '1px' }}
              >
                <div className="mb-2">{templateIcon(t)}</div>
                <span className="text-sm font-semibold text-[#1E293B] group-hover:text-[#977653]">{t.name}</span>
                <span className="text-xs text-[#94A3B8] mt-1 line-clamp-2">{t.description || t.category}</span>
              </motion.button>
            ))}
          </div>
        )}
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
                    {/* v14：徽章显示字典展示名（初期评估），不再把原始编码 initial 暴露给用户 */}
                    <Badge className={`${typeBadgeColor[record.assessmentTypeLabel] || 'bg-[#F0F2F5] text-[#64748B]'} text-xs font-medium border-0`}>
                      {record.assessmentTypeLabel}
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
                      <button onClick={() => openDetail(record)} className="w-11 h-11 lg:w-8 lg:h-8 rounded-full flex items-center justify-center text-[#64748B] hover:bg-[#F5F0EB] hover:text-[#977653] transition-colors cursor-pointer" title="查看报告">
                        <Eye className="w-4 h-4" />
                      </button>
                      {!readOnly && (record.status === 'draft' || record.status === 'in_progress') && (
                        <button onClick={() => { openEditAssessment(record); }} className="w-8 h-8 rounded-full flex items-center justify-center text-[#64748B] hover:bg-[#EFF6FF] hover:text-[#3B82F6] transition-colors cursor-pointer" title="继续编辑">
                          <Pencil className="w-4 h-4" />
                        </button>
                      )}
                      {!readOnly && (
                        <>
                          <button onClick={() => handleDuplicate(record)} className="w-11 h-11 lg:w-8 lg:h-8 rounded-full flex items-center justify-center text-[#64748B] hover:bg-[#F5F0EB] hover:text-[#977653] transition-colors cursor-pointer" title="复制">
                            <Copy className="w-4 h-4" />
                          </button>
                          <button onClick={() => setDeleteTarget(record)} className="w-11 h-11 lg:w-8 lg:h-8 rounded-full flex items-center justify-center text-[#64748B] hover:bg-[#FEF2F2] hover:text-[#EF4444] transition-colors cursor-pointer" title="删除">
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

        <ConfirmDialog
          open={deleteTarget !== null}
          onOpenChange={(o) => !o && setDeleteTarget(null)}
          title="删除这条评估记录？"
          description={
            <>
              将删除「{deleteTarget?.studentName ?? '该学生'}」的这条评估记录及其全部条目打分。
              <b className="text-[#B91C1C]">删除后不可撤销</b>
              ，后续做进度对比时会少一个数据点。
            </>
          }
          confirmText="删除"
          onConfirm={async () => {
            if (deleteTarget) await handleDelete(deleteTarget.id);
            setDeleteTarget(null);
          }}
        />

        {/* Pagination */}
        {filteredRecords.length > 0 && (
          <Pagination
            className="p-4 border-t border-[#E2E8F0]"
            page={page}
            totalPages={totalPages}
            onChange={setPage}
            summary={`共 ${filteredRecords.length} 条`}
          />
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
              role="dialog"
              aria-modal="true"
              aria-label={drawerMode === 'detail' ? '评估详情' : (drawerMode === 'edit' ? '编辑评估' : '录入评估')}
            >
              {drawerMode !== 'detail' ? (
                <NewAssessmentDrawer
                  currentStep={currentStep}
                  mode={drawerMode === 'edit' ? 'edit' : 'new'}
                  selectedTemplate={selectedTemplate}
                  selectedStudent={selectedStudent}
                  templates={templates}
                  templatesLoading={templatesLoading}
                  templateItemsLoading={templateItemsLoading}
                  assessmentDate={assessmentDate}
                  assessor={assessor}
                  assessmentType={newAssessmentType}
                  assessmentTypes={assessmentTypes}
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
                  onSetAssessmentType={setNewAssessmentType}
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
                    template={templates.find((t) => t.id === activeRecord?.templateId) ?? null}
                    onClose={() => setDrawerOpen(false)}
                    history={records}
                    {...(readOnly ? {} : { onDraftGoals: () => void handleDraftGoals(activeRecord) })}
                  />
                )
              )}
            </motion.div>
          </>
        )}

        {draftOpen && draftPlanId !== null && (
          <GoalDraftDrawer
            planId={draftPlanId}
            studentName={activeRecord?.studentName}
            editable={!readOnly}
            {...(draftAssessmentId !== null ? { assessmentId: draftAssessmentId } : {})}
            onClose={() => setDraftOpen(false)}
            onAdopted={() => {
              toast.success('目标已采纳，可在 IEP 计划详情中查看');
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── New Assessment Drawer ─── */

interface NewAssessmentDrawerProps {
  currentStep: number;
  /** v14：新建 / 编辑（草稿继续编辑） */
  mode: 'new' | 'edit';
  selectedTemplate: AssessmentTemplate | null;
  selectedStudent: Student | null;
  /** v14：真实模板库与加载态（原 mock 数组已删） */
  templates: AssessmentTemplate[];
  templatesLoading: boolean;
  templateItemsLoading: boolean;
  assessmentDate: string;
  assessor: string;
  /** v14：评估类型（字典编码）与字典选项 */
  assessmentType: string;
  assessmentTypes: AssessmentTypeOption[];
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
  onSetAssessmentType: (v: string) => void;
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
  mode,
  selectedTemplate,
  selectedStudent,
  templates,
  templatesLoading,
  templateItemsLoading,
  assessmentDate,
  assessor,
  assessmentType,
  assessmentTypes,
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
  onSetAssessmentType,
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
            {currentStep < 4 ? (mode === 'edit' ? '编辑评估' : '录入评估') : (mode === 'edit' ? '编辑完成' : '评估完成')}
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
                templatesLoading ? (
                  <div className="text-sm text-[#94A3B8] py-4">模板加载中…</div>
                ) : templates.length === 0 ? (
                  <div className="text-sm text-[#94A3B8] py-4">暂无可用评估模板，请先在「模板管理」中创建</div>
                ) : (
                  <div className="flex flex-wrap gap-3">
                    {templates.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => onSelectTemplate(t)}
                        className="flex items-center gap-3 p-3 border border-[#E2E8F0] rounded-lg hover:border-[#C1AC96] hover:shadow-sm transition-all cursor-pointer text-left"
                      >
                        {templateIcon(t)}
                        <div>
                          <div className="text-sm font-medium text-[#1E293B]">{t.name}</div>
                          <div className="text-xs text-[#94A3B8]">{t.category}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )
              ) : (
                <div className="flex items-center gap-3 p-3 bg-[#F5F0EB] border border-[#D6C8B8] rounded-lg">
                  {templateIcon(selectedTemplate)}
                  <div className="flex-1">
                    <div className="text-sm font-medium text-[#1E293B]">{selectedTemplate.name}</div>
                    <div className="text-xs text-[#64748B]">
                      {templateItemsLoading ? '条目加载中…' : (selectedTemplate.description || `${selectedTemplate.dimensions.length} 个维度`)}
                    </div>
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
                {/* v14：只读。后端 assessor_id 恒取当前登录用户，可编辑的输入框
                    会造成"填了别人名字就归别人"的假象；默认值也改为当前用户。 */}
                <Input value={assessor} readOnly className="bg-[#F7F6F4]" />
                <p className="text-xs text-[#94A3B8] mt-1">评估者自动取当前登录账号，不可修改</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-[#1E293B] mb-1.5">评估类型 <span className="text-[#EF4444]">*</span></label>
                {/* v14：类型由教师按字典选择。原实现把模板分类（课程本位/专项评估…）
                    写进 assessment_type，与字典和存量数据三套口径互相矛盾。 */}
                <Select value={assessmentType} onValueChange={onSetAssessmentType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {assessmentTypes.map((t) => (
                      <SelectItem key={t.code} value={t.code}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                <div className="text-[#64748B]">评估模板</div>
                <div className="text-[#1E293B] font-medium">{selectedTemplate?.name}</div>
                <div className="text-[#64748B]">评估类型</div>
                {/* v14：显示字典标签；原实现把模板名放在「评估类型」标签下，张冠李戴 */}
                <div className="text-[#1E293B] font-medium">
                  {assessmentTypes.find((t) => t.code === assessmentType)?.name ?? assessmentType}
                </div>
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
  /** v14：由父级从真实模板库解析后传入（原查 mock templateMap，已删） */
  template: AssessmentTemplate | null;
  onClose: () => void;
  /** 同学生的历史评估记录，用于计算「与上期对比」 */
  history: EvaluationRecord[];
  /** Step 3：据此评估起草 IEP 目标（无 IEP 计划时由父级提示） */
  onDraftGoals?: () => void;
}

/**
 * 修复说明(P2-2)：原实现是一份**写死的对比数据**
 * （认知能力 65/55、语言能力 48/42、社交技能 72/68 ……），
 * 与当前打开的评估记录毫无关系 —— 任何学生、任何模板、任何日期的评估，
 * 详情抽屉里都显示同一组数字。老师若据此判断「孩子进步了 10 分」，
 * 得到的其实是编造出来的结论，属于会造成实际教学误判的假数据。
 *
 * 现改为真实计算：
 *   1) 「当前得分」按各维度实际得分 / 该维度满分 换算为百分制；
 *   2) 「上期得分」取同一学生、日期更早且已完成的**最近一次**评估；
 *      仅当上期与本期使用同一模板时才做维度级对比，否则不给维度级数字；
 *   3) 找不到上期记录时 previous 为 null，界面显示「—」，**绝不编造数字**。
 */
interface ComparisonRow {
  dimension: string;
  current: number;
  previous: number | null;
  change: number;
}

/** 按维度计算百分制得分区 */
function dimensionPercent(
  record: EvaluationRecord,
): Array<{ name: string; percent: number }> {
  // v14：按 assessment_items 真实聚合。原实现读 record.scores（接口从不填充，
  // 恒为 {}），维度对比图「当前得分」永远是 0，还依赖 mock templateMap。
  return aggregateDimensions(record).map((d) => ({ name: d.name, percent: d.percent }));
}

/** v14：按维度聚合真实条目得分（维度名 → 得分/满分/百分制） */
function aggregateDimensions(
  record: EvaluationRecord,
): Array<{ name: string; score: number; max: number; percent: number }> {
  const items = record.items ?? [];
  if (items.length === 0) return [];
  const map = new Map<string, { score: number; max: number }>();
  items.forEach((it) => {
    const cur = map.get(it.dimension) ?? { score: 0, max: 0 };
    cur.score += it.score;
    cur.max += it.max_score;
    map.set(it.dimension, cur);
  });
  return [...map.entries()].map(([name, v]) => ({
    name,
    score: v.score,
    max: v.max,
    percent: v.max > 0 ? Math.round((v.score / v.max) * 100) : 0,
  }));
}

function buildComparisonData(
  record: EvaluationRecord,
  history: EvaluationRecord[],
): ComparisonRow[] {
  const dims = dimensionPercent(record);
  // 历史记录未保存维度明细时，退化为整体得分，不编造维度拆分
  const rows: Array<{ name: string; current: number }> =
    dims.length > 0
      ? dims.map((d) => ({ name: d.name, current: d.percent }))
      : [
          {
            name: '总体得分',
            current: record.maxScore > 0 ? Math.round((record.totalScore / record.maxScore) * 100) : 0,
          },
        ];

  const overallPct = (r: EvaluationRecord) =>
    r.maxScore > 0 ? Math.round((r.totalScore / r.maxScore) * 100) : 0;

  // 上期 = 同一学生、日期更早、状态为已完成的最近一条
  const prevRecord = history
    .filter(
      (r) =>
        r.id !== record.id &&
        r.studentId === record.studentId &&
        r.status === 'completed' &&
        r.assessmentDate < record.assessmentDate,
    )
    .sort((a, b) => b.assessmentDate.localeCompare(a.assessmentDate))[0];

  if (!prevRecord) {
    return rows.map((r) => ({ dimension: r.name, current: r.current, previous: null, change: 0 }));
  }

  // 仅当上期使用同一模板时，维度名称才具备可比性
  const prevDims = prevRecord.templateId === record.templateId ? dimensionPercent(prevRecord) : [];
  const prevMap = new Map(prevDims.map((d) => [d.name, d.percent]));
  const isSingleOverall = rows.length === 1;

  return rows.map((r) => {
    let previous: number | null = null;
    if (prevMap.has(r.name)) {
      previous = prevMap.get(r.name) as number;
    } else if (isSingleOverall) {
      previous = overallPct(prevRecord);
    }
    return {
      dimension: r.name,
      current: r.current,
      previous,
      change: previous === null ? 0 : r.current - previous,
    };
  });
}

function DetailDrawer({ record, template, onClose, history, onDraftGoals }: DetailDrawerProps) {
  const pct = record.maxScore > 0 ? Math.round((record.totalScore / record.maxScore) * 100) : 0;
  const grade = getGradeLabel(pct);

  // v14：各维度得分按 assessment_items 真实聚合。
  // 原实现用「总分 × 维度满分占比」估算（pro-rate），任何记录都会得到
  // 一份看起来精确、实则编造的维度分布；无条目明细时宁可显示空态。
  const dimensionRows = useMemo(
    () => aggregateDimensions(record).map((d) => ({ ...d, grade: getGradeLabel(d.percent) })),
    [record],
  );

  // P2-2 修复：对比数据由本条记录与历史记录真实计算得出
  const comparisonData = useMemo(
    () => buildComparisonData(record, history),
    [record, template, history],
  );
  const hasPrevious = comparisonData.some((r) => r.previous !== null);
  // 无上期数据时把 previous 置为 undefined，避免 recharts 画出一根 0 高度的假柱
  const chartData = useMemo(
    () => comparisonData.map((r) => ({ ...r, previous: r.previous ?? undefined })),
    [comparisonData],
  );

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
          {onDraftGoals && (
            <Button size="sm" onClick={onDraftGoals}>
              <Wand2 className="w-4 h-4 mr-1" />
              据此起草目标
            </Button>
          )}
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
            <div><span className="text-[#64748B]">学号：</span><span className="text-[#1E293B]">{record.studentNo || '—'}</span></div>
            <div><span className="text-[#64748B]">班级：</span><span className="text-[#1E293B]">{record.className || '—'}</span></div>
            <div><span className="text-[#64748B]">评估日期：</span><span className="text-[#1E293B]">{record.assessmentDate}</span></div>
            <div><span className="text-[#64748B]">评估者：</span><span className="text-[#1E293B]">{record.assessor || '—'}</span></div>
            <div><span className="text-[#64748B]">评估类型：</span><span className="text-[#1E293B]">{record.assessmentTypeLabel}</span></div>
            <div><span className="text-[#64748B]">评估模板：</span><span className="text-[#1E293B]">{template?.name ?? record.templateName}</span></div>
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
        {dimensionRows.length > 0 ? (
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
                {dimensionRows.map((dim) => (
                  <tr key={dim.name} className="border-b border-[#E2E8F0] last:border-0">
                    <td className="py-3 text-sm text-[#1E293B] font-medium">{dim.name}</td>
                    <td className="py-3 text-sm text-[#1E293B]">{dim.score}</td>
                    <td className="py-3 text-sm text-[#64748B]">{dim.max}</td>
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-2 bg-[#E2E8F0] rounded-full overflow-hidden">
                          <div className="h-full bg-[#977653] rounded-full" style={{ width: `${dim.percent}%` }} />
                        </div>
                        <span className="text-xs text-[#64748B]">{dim.percent}%</span>
                      </div>
                    </td>
                    <td className={`py-3 text-xs font-medium ${dim.grade.color}`}>{dim.grade.label}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="bg-white border border-[#E2E8F0] rounded-lg p-5">
            <h4 className="text-base font-semibold text-[#1E293B] mb-2">各维度得分</h4>
            <p className="text-sm text-[#94A3B8]">该记录没有条目明细，暂不展示维度分布（不做估算）。</p>
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
                    <td className="px-4 py-3 text-sm text-[#64748B]">
                      {item.previous === null ? '—' : item.previous}
                    </td>
                    <td className="px-4 py-3">
                      {item.previous === null ? (
                        // 无上期可比记录时明确显示「—」，不编造变化量
                        <span className="text-sm text-[#94A3B8]">—</span>
                      ) : (
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
                      )}
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Comparison Bar Chart */}
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
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
                {/* 仅当存在可比对的上期记录时才画「上期」柱，避免凭空出现 0 分柱 */}
                {hasPrevious && (
                  <Bar
                    dataKey="previous"
                    name="previous"
                    fill="#CBD5E1"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={40}
                  />
                )}
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
