import { useState, useMemo, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  Search,
  Brain,
  MessageSquare,
  Activity,
  Users,
  HomeIcon,
  Pencil,
  Copy,
  MoreVertical,
  Eye,
  Trash2,
  X,
  ChevronUp,
  ChevronDown,
  GripVertical,
  Check,
  AlertCircle,
  LayoutTemplate,
  XCircle,
  Save,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import {
  fetchTemplates,
  fetchTemplateItemsRaw,
  aggregateItemsToDimensions,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  addTemplateItem,
  deleteTemplateItem,
} from '@/services/templates';

/* ─── Types ─── */

interface TemplateItem {
  id: string;
  name: string;
  description: string;
  maxScore: number;
}

interface TemplateDimension {
  id: string;
  name: string;
  description: string;
  minScore: number;
  maxScore: number;
  scoreDescriptions: Record<number, string>;
  items: TemplateItem[];
}

interface AssessmentTemplate {
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

/* ─── Category Config ─── */

const categories = [
  { key: 'all', label: '全部' },
  { key: 'system', label: '系统预设' },
  { key: 'custom', label: '自定义' },
  { key: '认知发展', label: '认知' },
  { key: '语言能力', label: '语言' },
  { key: '运动能力', label: '运动' },
  { key: '社交适应', label: '社交' },
  { key: '生活自理', label: '生活' },
];

const categoryColors: Record<string, string> = {
  '认知发展': 'bg-[#F5F0EB] text-[#5C4832]',
  '语言能力': 'bg-[#EFF6FF] text-[#2563EB]',
  '运动能力': 'bg-[#ECFDF5] text-[#059669]',
  '社交适应': 'bg-[#FFFBEB] text-[#D97706]',
  '生活自理': 'bg-[#F0F2F5] text-[#405680]',
};

const iconMap: Record<string, React.ReactNode> = {
  brain: <Brain className="w-6 h-6" style={{ color: '#977653' }} />,
  message: <MessageSquare className="w-6 h-6" style={{ color: '#3B82F6' }} />,
  activity: <Activity className="w-6 h-6" style={{ color: '#10B981' }} />,
  users: <Users className="w-6 h-6" style={{ color: '#F59E0B' }} />,
  home: <HomeIcon className="w-6 h-6" style={{ color: '#405680' }} />,
  custom: <LayoutTemplate className="w-6 h-6 text-[#64748B]" />,
};

const iconBgMap: Record<string, string> = {
  brain: 'bg-[#F5F0EB]',
  message: 'bg-[#EFF6FF]',
  activity: 'bg-[#ECFDF5]',
  users: 'bg-[#FFFBEB]',
  home: 'bg-[#F0F2F5]',
  custom: 'bg-[#F7F6F4]',
};

const disabilityOptions = [
  '智力发育迟缓',
  '自闭症谱系障碍',
  '唐氏综合征',
  '脑瘫',
  '语言发育迟缓',
  '注意力缺陷',
  '学习障碍',
  '情绪行为障碍',
];


/* ─── Main Component ─── */

export default function Templates() {
  const [templateList, setTemplateList] = useState<AssessmentTemplate[]>([]);
  const [activeCategory, setActiveCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const pageSize = 6;

  /* Drawer state */
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<'new' | 'edit'>('new');
  const [editingTemplate, setEditingTemplate] = useState<AssessmentTemplate | null>(null);

  /* Preview state */
  const [previewTemplate, setPreviewTemplate] = useState<AssessmentTemplate | null>(null);

  /* Form state */
  const [formName, setFormName] = useState('');
  const [formCategory, setFormCategory] = useState('认知发展');
  const [formDescription, setFormDescription] = useState('');
  const [formAgeMin, setFormAgeMin] = useState(4);
  const [formAgeMax, setFormAgeMax] = useState(18);
  const [formDisabilities, setFormDisabilities] = useState<string[]>([]);
  const [formDimensions, setFormDimensions] = useState<TemplateDimension[]>([]);

  /* Dimension editing */
  const [showDimForm, setShowDimForm] = useState(false);
  const [editingDimId, setEditingDimId] = useState<string | null>(null);
  const [dimName, setDimName] = useState('');
  const [dimDesc, setDimDesc] = useState('');
  const [dimMinScore, setDimMinScore] = useState(1);
  const [dimMaxScore, setDimMaxScore] = useState(5);

  /* Item editing */
  const [activeDimForItem, setActiveDimForItem] = useState<string | null>(null);
  const [showItemForm, setShowItemForm] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [itemName, setItemName] = useState('');
  const [itemDesc, setItemDesc] = useState('');
  const [itemMaxScore, setItemMaxScore] = useState(5);

  /* Load templates from backend */
  const loadTemplates = useCallback(async () => {
    try {
      const result = await fetchTemplates({ page: 1, pageSize: 100 });
      const templates: AssessmentTemplate[] = [];
      for (const t of result.list) {
        const rawItems = await fetchTemplateItemsRaw(t.id);
        templates.push({ ...t, dimensions: aggregateItemsToDimensions(rawItems, t.id) });
      }
      setTemplateList(templates);
    } catch (e) {
      toast.error('模板列表加载失败');
    }
  }, []);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  /* Filtered templates */
  const filteredTemplates = useMemo(() => {
    return templateList.filter((t) => {
      if (search && !t.name.includes(search)) return false;
      if (activeCategory === 'system' && t.type !== 'system') return false;
      if (activeCategory === 'custom' && t.type !== 'custom') return false;
      if (['认知发展', '语言能力', '运动能力', '社交适应', '生活自理'].includes(activeCategory) && t.category !== activeCategory) return false;
      if (typeFilter !== 'all' && t.type !== typeFilter) return false;
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      return true;
    });
  }, [templateList, activeCategory, search, typeFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredTemplates.length / pageSize));
  const paginatedTemplates = filteredTemplates.slice((page - 1) * pageSize, page * pageSize);

  /* Handlers */
  const resetFilters = () => {
    setSearch('');
    setTypeFilter('all');
    setStatusFilter('all');
    setActiveCategory('all');
    setPage(1);
  };

  const openNewTemplate = () => {
    setDrawerMode('new');
    setFormName('');
    setFormCategory('认知发展');
    setFormDescription('');
    setFormAgeMin(4);
    setFormAgeMax(18);
    setFormDisabilities([]);
    setFormDimensions([]);
    setEditingTemplate(null);
    setDrawerOpen(true);
  };

  const openEditTemplate = (t: AssessmentTemplate) => {
    setDrawerMode('edit');
    setFormName(t.name);
    setFormCategory(t.category);
    setFormDescription(t.description);
    setFormAgeMin(t.ageRange.min);
    setFormAgeMax(t.ageRange.max);
    setFormDisabilities([...t.applicableDisabilities]);
    setFormDimensions(t.dimensions.map((d) => ({ ...d, items: d.items.map((it) => ({ ...it })) })));
    setEditingTemplate(t);
    setDrawerOpen(true);
  };

  const handleSaveTemplate = async () => {
    if (!formName.trim()) {
      toast.error('请输入模板名称');
      return;
    }
    if (formDimensions.length === 0) {
      toast.error('请至少添加一个评估维度');
      return;
    }
    try {
      const payload = {
        name: formName,
        type: formCategory,
        description: formDescription,
        target_disability_types: formDisabilities.length > 0 ? JSON.stringify(formDisabilities) : undefined,
        applicable_age_min: formAgeMin,
        applicable_age_max: formAgeMax,
      };
      let templateId: number | string = '';
      if (drawerMode === 'edit' && editingTemplate) {
        await updateTemplate(editingTemplate.id, payload);
        templateId = editingTemplate.id;
        // 重建评分项：删除旧的再批量新增
        const oldRaw = await fetchTemplateItemsRaw(editingTemplate.id);
        for (const it of oldRaw) {
          if (it.id) await deleteTemplateItem(it.id);
        }
      } else {
        const created = await createTemplate(payload);
        templateId = created.id;
      }
      // 批量新增评分项
      for (const dim of formDimensions) {
        for (const it of dim.items) {
          await addTemplateItem(templateId, {
            dimension: dim.name,
            item_name: it.name,
            item_description: it.description,
            max_score: it.maxScore,
          });
        }
      }
      toast.success(drawerMode === 'edit' ? '模板已更新' : '模板创建成功');
      setDrawerOpen(false);
      loadTemplates();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存模板失败');
    }
  };

  const handleDuplicate = async (t: AssessmentTemplate) => {
    try {
      const created = await createTemplate({
        name: `${t.name} (副本)`,
        type: t.category,
        description: t.description,
        target_disability_types: t.applicableDisabilities.length > 0 ? JSON.stringify(t.applicableDisabilities) : undefined,
        applicable_age_min: t.ageRange.min,
        applicable_age_max: t.ageRange.max,
      });
      for (const dim of t.dimensions) {
        for (const it of dim.items) {
          await addTemplateItem(created.id, {
            dimension: dim.name,
            item_name: it.name,
            item_description: it.description,
            max_score: it.maxScore,
          });
        }
      }
      toast.success('模板已复制');
      loadTemplates();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '复制模板失败');
    }
  };

  const handleDelete = async (id: string) => {
    const t = templateList.find((x) => x.id === id);
    if (t?.type === 'system') {
      toast.error('系统预设模板不可删除');
      return;
    }
    try {
      await deleteTemplate(id);
      toast.success('模板已删除');
      loadTemplates();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '删除模板失败');
    }
  };

  const handleToggleStatus = async (id: string) => {
    const t = templateList.find((x) => x.id === id);
    try {
      await updateTemplate(id, { is_active: t?.status === 'active' ? 0 : 1 });
      toast.success('状态已更新');
      loadTemplates();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '更新状态失败');
    }
  };

  /* Dimension CRUD */
  const openDimForm = (dim?: TemplateDimension) => {
    if (dim) {
      setEditingDimId(dim.id);
      setDimName(dim.name);
      setDimDesc(dim.description);
      setDimMinScore(dim.minScore);
      setDimMaxScore(dim.maxScore);
    } else {
      setEditingDimId(null);
      setDimName('');
      setDimDesc('');
      setDimMinScore(1);
      setDimMaxScore(5);
    }
    setShowDimForm(true);
  };

  const saveDimension = () => {
    if (!dimName.trim()) {
      toast.error('请输入维度名称');
      return;
    }
    if (editingDimId) {
      setFormDimensions((prev) =>
        prev.map((d) =>
          d.id === editingDimId
            ? { ...d, name: dimName, description: dimDesc, minScore: dimMinScore, maxScore: dimMaxScore }
            : d
        )
      );
      toast.success('维度已更新');
    } else {
      const newDim: TemplateDimension = {
        id: `dim_${Date.now()}`,
        name: dimName,
        description: dimDesc,
        minScore: dimMinScore,
        maxScore: dimMaxScore,
        scoreDescriptions: { 1: '', 2: '', 3: '', 4: '', 5: '' },
        items: [],
      };
      setFormDimensions([...formDimensions, newDim]);
      toast.success('维度已添加');
    }
    setShowDimForm(false);
  };

  const deleteDimension = (id: string) => {
    setFormDimensions(formDimensions.filter((d) => d.id !== id));
    toast.success('维度已删除');
  };

  const moveDimension = (index: number, dir: -1 | 1) => {
    const newIndex = index + dir;
    if (newIndex < 0 || newIndex >= formDimensions.length) return;
    const next = [...formDimensions];
    [next[index], next[newIndex]] = [next[newIndex], next[index]];
    setFormDimensions(next);
  };

  /* Item CRUD */
  const openItemForm = (dimId: string, item?: TemplateItem) => {
    setActiveDimForItem(dimId);
    if (item) {
      setEditingItemId(item.id);
      setItemName(item.name);
      setItemDesc(item.description);
      setItemMaxScore(item.maxScore);
    } else {
      setEditingItemId(null);
      setItemName('');
      setItemDesc('');
      setItemMaxScore(5);
    }
    setShowItemForm(true);
  };

  const saveItem = () => {
    if (!itemName.trim()) {
      toast.error('请输入评分项名称');
      return;
    }
    if (!activeDimForItem) return;
    setFormDimensions((prev) =>
      prev.map((d) => {
        if (d.id !== activeDimForItem) return d;
        if (editingItemId) {
          return {
            ...d,
            items: d.items.map((it) =>
              it.id === editingItemId ? { ...it, name: itemName, description: itemDesc, maxScore: itemMaxScore } : it
            ),
          };
        }
        return {
          ...d,
          items: [...d.items, { id: `item_${Date.now()}`, name: itemName, description: itemDesc, maxScore: itemMaxScore }],
        };
      })
    );
    setShowItemForm(false);
    toast.success(editingItemId ? '评分项已更新' : '评分项已添加');
  };

  const deleteItem = (dimId: string, itemId: string) => {
    setFormDimensions((prev) =>
      prev.map((d) => (d.id === dimId ? { ...d, items: d.items.filter((it) => it.id !== itemId) } : d))
    );
    toast.success('评分项已删除');
  };

  const moveItem = (dimId: string, index: number, dir: -1 | 1) => {
    setFormDimensions((prev) =>
      prev.map((d) => {
        if (d.id !== dimId) return d;
        const newIndex = index + dir;
        if (newIndex < 0 || newIndex >= d.items.length) return d;
        const next = [...d.items];
        [next[index], next[newIndex]] = [next[newIndex], next[index]];
        return { ...d, items: next };
      })
    );
  };

  const toggleDisability = (d: string) => {
    setFormDisabilities((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]
    );
  };

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
          <h1 className="text-[28px] font-bold text-[#1E293B] leading-tight tracking-[-0.02em]">模板管理</h1>
          <p className="text-sm text-[#64748B] mt-1">评估模板的创建、配置与复用</p>
        </div>
        <Button onClick={openNewTemplate} className="h-10 bg-[#977653] hover:bg-[#7A5F42]">
          <Plus className="w-4 h-4 mr-2" />
          新建模板
        </Button>
      </motion.div>

      {/* Category Tabs */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: 0.05 }}
        className="bg-white rounded-lg p-4 mb-6 shadow-sm"
      >
        <div className="flex flex-wrap gap-2">
          {categories.map((cat, i) => (
            <motion.button
              key={cat.key}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.04 }}
              onClick={() => { setActiveCategory(cat.key); setPage(1); }}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-all cursor-pointer ${
                activeCategory === cat.key
                  ? 'bg-[#977653] text-white'
                  : 'bg-[#F7F6F4] text-[#64748B] hover:bg-[#EBE3DA] hover:text-[#5C4832]'
              }`}
            >
              {cat.label}
            </motion.button>
          ))}
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
              placeholder="搜索模板名称..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 w-[280px]"
            />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="模板类型" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部</SelectItem>
              <SelectItem value="system">系统预设</SelectItem>
              <SelectItem value="custom">自定义</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="使用状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部</SelectItem>
              <SelectItem value="active">使用中</SelectItem>
              <SelectItem value="inactive">已停用</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="secondary" onClick={() => setPage(1)}>筛选</Button>
          <Button variant="ghost" onClick={resetFilters}>重置</Button>
        </div>
      </motion.div>

      {/* Template Cards Grid */}
      {paginatedTemplates.length > 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.15 }}
          className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5"
        >
          {paginatedTemplates.map((t, idx) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: idx * 0.06 }}
              className={`bg-white rounded-lg p-6 border transition-all duration-150 hover:shadow-md hover:-translate-y-0.5 ${
                t.type === 'system' ? 'border-dashed border-[#CBD5E1]' : 'border-[#E2E8F0]'
              }`}
            >
              {/* Icon + Name */}
              <div className="flex items-start gap-4 mb-4">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${iconBgMap[t.icon] || 'bg-[#F7F6F4]'}`}>
                  {iconMap[t.icon] || <LayoutTemplate className="w-6 h-6 text-[#64748B]" />}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-base font-semibold text-[#1E293B] truncate">{t.name}</h4>
                  <div className="flex items-center gap-1.5 mt-1">
                    <Badge className={`${t.type === 'system' ? 'bg-[#EFF6FF] text-[#2563EB]' : 'bg-[#F5F0EB] text-[#5C4832]'} text-[11px] border-0`}>
                      {t.type === 'system' ? '系统预设' : '自定义'}
                    </Badge>
                    <Badge className={`${categoryColors[t.category] || 'bg-[#F0F2F5] text-[#64748B]'} text-[11px] border-0`}>
                      {t.category}
                    </Badge>
                    {t.status === 'inactive' && (
                      <Badge className="bg-[#FEF2F2] text-[#DC2626] text-[11px] border-0">已停用</Badge>
                    )}
                  </div>
                </div>
              </div>

              {/* Stats */}
              <div className="border-t border-[#E2E8F0] pt-4 mb-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-[#64748B]">评估维度</span>
                  <span className="text-[#1E293B] font-medium">{t.dimensions.length} 个</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[#64748B]">评分项目</span>
                  <span className="text-[#1E293B] font-medium">{t.dimensions.reduce((s, d) => s + d.items.length, 0)} 项</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[#64748B]">使用次数</span>
                  <span className="text-[#1E293B] font-medium">{t.useCount} 次</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[#64748B]">最近使用</span>
                  <span className="text-[#1E293B] font-medium">{t.lastUsed || '-'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[#64748B]">适用年龄</span>
                  <span className="text-[#1E293B] font-medium">{t.ageRange.min}-{t.ageRange.max}岁</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 pt-3 border-t border-[#E2E8F0]">
                <button
                  onClick={() => setPreviewTemplate(t)}
                  className="flex-1 flex items-center justify-center gap-1 py-2 rounded-md text-xs text-[#64748B] hover:bg-[#F7F6F4] hover:text-[#977653] transition-colors cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5" /> 预览
                </button>
                <button
                  onClick={() => openEditTemplate(t)}
                  className="flex-1 flex items-center justify-center gap-1 py-2 rounded-md text-xs text-[#64748B] hover:bg-[#F7F6F4] hover:text-[#977653] transition-colors cursor-pointer"
                >
                  <Pencil className="w-3.5 h-3.5" /> 编辑
                </button>
                <button
                  onClick={() => handleDuplicate(t)}
                  className="flex-1 flex items-center justify-center gap-1 py-2 rounded-md text-xs text-[#64748B] hover:bg-[#F7F6F4] hover:text-[#977653] transition-colors cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" /> 复制
                </button>
                <button
                  onClick={() => handleToggleStatus(t.id)}
                  className="flex-1 flex items-center justify-center gap-1 py-2 rounded-md text-xs text-[#64748B] hover:bg-[#F7F6F4] hover:text-[#F59E0B] transition-colors cursor-pointer"
                >
                  {t.status === 'active' ? (
                    <><XCircle className="w-3.5 h-3.5" /> 停用</>
                  ) : (
                    <><Check className="w-3.5 h-3.5" /> 启用</>
                  )}
                </button>
                <button
                  onClick={() => handleDelete(t.id)}
                  className="flex-1 flex items-center justify-center gap-1 py-2 rounded-md text-xs text-[#64748B] hover:bg-[#FEF2F2] hover:text-[#EF4444] transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" /> 删除
                </button>
              </div>
            </motion.div>
          ))}
        </motion.div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 bg-white rounded-lg shadow-sm">
          <LayoutTemplate className="w-12 h-12 text-[#94A3B8] mb-4" />
          <h4 className="text-base font-semibold text-[#1E293B] mb-1">
            {activeCategory === 'custom' ? '暂无自定义模板' : '暂无评估模板'}
          </h4>
          <p className="text-sm text-[#64748B] mb-4">
            {activeCategory === 'custom'
              ? '您可以复制系统模板进行修改，或从零创建'
              : '点击上方按钮创建第一个模板'}
          </p>
          <div className="flex gap-2">
            <Button onClick={openNewTemplate} className="bg-[#977653] hover:bg-[#7A5F42]">
              <Plus className="w-4 h-4 mr-2" />
              新建模板
            </Button>
            {activeCategory === 'custom' && (
              <Button variant="secondary" onClick={() => setActiveCategory('system')}>
                复制系统模板
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Pagination */}
      {filteredTemplates.length > 0 && (
        <div className="flex items-center justify-between mt-6">
          <div className="text-sm text-[#64748B]">
            共 {filteredTemplates.length} 个模板
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 rounded-md text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white transition-colors"
            >
              上一页
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={`w-8 h-8 rounded-md text-sm font-medium transition-colors ${p === page ? 'bg-[#977653] text-white' : 'text-[#64748B] hover:bg-white'}`}
              >
                {p}
              </button>
            ))}
            <button
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
              className="px-3 py-1.5 rounded-md text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white transition-colors"
            >
              下一页
            </button>
          </div>
        </div>
      )}

      {/* ─── Editor Drawer ─── */}
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
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-[#E2E8F0] sticky top-0 bg-white z-10">
                <div className="flex items-center gap-3">
                  <button onClick={() => setDrawerOpen(false)} className="w-8 h-8 rounded-full flex items-center justify-center text-[#64748B] hover:bg-[#F7F6F4] transition-colors cursor-pointer">
                    <X className="w-5 h-5" />
                  </button>
                  <h3 className="text-lg font-semibold text-[#1E293B]">
                    {drawerMode === 'new' ? '新建评估模板' : '编辑模板'}
                  </h3>
                </div>
              </div>

              <div className="px-6 py-6 space-y-8">
                {/* Basic Info */}
                <div>
                  <h4 className="text-base font-semibold text-[#1E293B] mb-4 pb-2 border-b border-[#E2E8F0]">模板基本信息</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2 sm:col-span-1">
                      <label className="block text-sm font-medium text-[#1E293B] mb-1.5">模板名称 <span className="text-[#EF4444]">*</span></label>
                      <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="输入模板名称" />
                    </div>
                    <div className="col-span-2 sm:col-span-1">
                      <label className="block text-sm font-medium text-[#1E293B] mb-1.5">模板分类 <span className="text-[#EF4444]">*</span></label>
                      <Select value={formCategory} onValueChange={setFormCategory}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="认知发展">认知发展</SelectItem>
                          <SelectItem value="语言能力">语言能力</SelectItem>
                          <SelectItem value="运动能力">运动能力</SelectItem>
                          <SelectItem value="社交适应">社交适应</SelectItem>
                          <SelectItem value="生活自理">生活自理</SelectItem>
                          <SelectItem value="其他">其他</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-[#1E293B] mb-1.5">模板描述</label>
                      <Textarea value={formDescription} onChange={(e) => setFormDescription(e.target.value)} placeholder="描述模板的用途和评估范围..." rows={3} />
                    </div>
                    <div className="col-span-2 sm:col-span-1">
                      <label className="block text-sm font-medium text-[#1E293B] mb-1.5">适用年龄范围（岁）</label>
                      <div className="flex items-center gap-2">
                        <Input type="number" value={formAgeMin} onChange={(e) => setFormAgeMin(Number(e.target.value))} className="w-20" />
                        <span className="text-[#94A3B8]">-</span>
                        <Input type="number" value={formAgeMax} onChange={(e) => setFormAgeMax(Number(e.target.value))} className="w-20" />
                      </div>
                    </div>
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-[#1E293B] mb-2">适用障碍类型</label>
                      <div className="flex flex-wrap gap-2">
                        {disabilityOptions.map((d) => (
                          <button
                            key={d}
                            onClick={() => toggleDisability(d)}
                            className={`px-3 py-1.5 rounded-full text-xs transition-colors cursor-pointer ${
                              formDisabilities.includes(d)
                                ? 'bg-[#F5F0EB] text-[#5C4832] border border-[#C1AC96]'
                                : 'bg-[#F7F6F4] text-[#64748B] border border-[#E2E8F0] hover:border-[#CBD5E1]'
                            }`}
                          >
                            {d}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Dimensions */}
                <div>
                  <div className="flex items-center justify-between mb-4 pb-2 border-b border-[#E2E8F0]">
                    <h4 className="text-base font-semibold text-[#1E293B]">评估维度与评分项</h4>
                    <span className="text-xs text-[#94A3B8]">共 {formDimensions.length} 个维度，{formDimensions.reduce((s, d) => s + d.items.length, 0)} 个评分项</span>
                  </div>

                  {/* Dimension List */}
                  <div className="space-y-4">
                    <AnimatePresence>
                      {formDimensions.map((dim, dimIdx) => (
                        <motion.div
                          key={dim.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, height: 0 }}
                          className="border border-[#E2E8F0] rounded-lg overflow-hidden"
                        >
                          {/* Dimension Header */}
                          <div className="flex items-center justify-between px-4 py-3 bg-[#F7F6F4]">
                            <div className="flex items-center gap-2">
                              <GripVertical className="w-4 h-4 text-[#CBD5E1]" />
                              <span className="text-sm font-semibold text-[#1E293B]">{dim.name}</span>
                              <span className="text-xs text-[#94A3B8]">{dim.items.length} 个评分项</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <button onClick={() => moveDimension(dimIdx, -1)} disabled={dimIdx === 0} className="w-7 h-7 rounded flex items-center justify-center text-[#64748B] hover:bg-white disabled:opacity-30 cursor-pointer">
                                <ChevronUp className="w-4 h-4" />
                              </button>
                              <button onClick={() => moveDimension(dimIdx, 1)} disabled={dimIdx === formDimensions.length - 1} className="w-7 h-7 rounded flex items-center justify-center text-[#64748B] hover:bg-white disabled:opacity-30 cursor-pointer">
                                <ChevronDown className="w-4 h-4" />
                              </button>
                              <button onClick={() => openDimForm(dim)} className="w-7 h-7 rounded flex items-center justify-center text-[#64748B] hover:bg-white hover:text-[#977653] cursor-pointer">
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => deleteDimension(dim.id)} className="w-7 h-7 rounded flex items-center justify-center text-[#64748B] hover:bg-white hover:text-[#EF4444] cursor-pointer">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* Items */}
                          {dim.items.length > 0 && (
                            <div className="divide-y divide-[#E2E8F0]">
                              {dim.items.map((item, itemIdx) => (
                                <div key={item.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-[#F7F6F4]">
                                  <div className="flex items-center gap-3">
                                    <span className="text-xs text-[#94A3B8] w-5">{itemIdx + 1}</span>
                                    <div>
                                      <span className="text-sm font-medium text-[#1E293B]">{item.name}</span>
                                      <span className="text-xs text-[#94A3B8] ml-2">{item.description}</span>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="text-[11px]">1-{item.maxScore}分</Badge>
                                    <button onClick={() => openItemForm(dim.id, item)} className="w-7 h-7 rounded flex items-center justify-center text-[#64748B] hover:text-[#977653] cursor-pointer">
                                      <Pencil className="w-3 h-3" />
                                    </button>
                                    <button onClick={() => moveItem(dim.id, itemIdx, -1)} disabled={itemIdx === 0} className="w-7 h-7 rounded flex items-center justify-center text-[#64748B] hover:text-[#977653] disabled:opacity-30 cursor-pointer">
                                      <ChevronUp className="w-3 h-3" />
                                    </button>
                                    <button onClick={() => moveItem(dim.id, itemIdx, 1)} disabled={itemIdx === dim.items.length - 1} className="w-7 h-7 rounded flex items-center justify-center text-[#64748B] hover:text-[#977653] disabled:opacity-30 cursor-pointer">
                                      <ChevronDown className="w-3 h-3" />
                                    </button>
                                    <button onClick={() => deleteItem(dim.id, item.id)} className="w-7 h-7 rounded flex items-center justify-center text-[#64748B] hover:text-[#EF4444] cursor-pointer">
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Add Item Button */}
                          <div className="px-4 py-2 border-t border-[#E2E8F0]">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openItemForm(dim.id)}
                              className="text-xs text-[#64748B] hover:text-[#977653]"
                            >
                              <Plus className="w-3.5 h-3.5 mr-1" />
                              添加评分项
                            </Button>
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>

                  {/* Add Dimension Button */}
                  <Button
                    variant="outline"
                    className="w-full mt-4 border-dashed border-[#CBD5E1] text-[#64748B] hover:border-[#C1AC96] hover:text-[#977653]"
                    onClick={() => openDimForm()}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    添加评估维度
                  </Button>
                </div>
              </div>

              {/* Footer */}
              <div className="sticky bottom-0 px-6 py-4 border-t border-[#E2E8F0] bg-white flex justify-end gap-2">
                <Button variant="outline" onClick={() => setDrawerOpen(false)}>取消</Button>
                <Button onClick={handleSaveTemplate} className="bg-[#977653] hover:bg-[#7A5F42]">
                  <Save className="w-4 h-4 mr-2" />
                  {drawerMode === 'new' ? '创建模板' : '保存模板'}
                </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ─── Dimension Form Modal ─── */}
      <AnimatePresence>
        {showDimForm && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 z-[60]"
              onClick={() => setShowDimForm(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[480px] max-w-[90vw] bg-white rounded-xl shadow-xl z-[70] p-6"
            >
              <h3 className="text-lg font-semibold text-[#1E293B] mb-4">
                {editingDimId ? '编辑维度' : '添加维度'}
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[#1E293B] mb-1.5">维度名称 <span className="text-[#EF4444]">*</span></label>
                  <Input value={dimName} onChange={(e) => setDimName(e.target.value)} placeholder="如：注意力、记忆力..." />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#1E293B] mb-1.5">维度说明</label>
                  <Textarea value={dimDesc} onChange={(e) => setDimDesc(e.target.value)} placeholder="描述该维度的评估标准..." rows={2} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-[#1E293B] mb-1.5">最低分</label>
                    <Input type="number" value={dimMinScore} onChange={(e) => setDimMinScore(Number(e.target.value))} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#1E293B] mb-1.5">最高分</label>
                    <Input type="number" value={dimMaxScore} onChange={(e) => setDimMaxScore(Number(e.target.value))} />
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <Button variant="outline" size="sm" onClick={() => setShowDimForm(false)}>取消</Button>
                <Button size="sm" onClick={saveDimension} className="bg-[#977653] hover:bg-[#7A5F42]">保存</Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ─── Item Form Modal ─── */}
      <AnimatePresence>
        {showItemForm && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 z-[60]"
              onClick={() => setShowItemForm(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[480px] max-w-[90vw] bg-white rounded-xl shadow-xl z-[70] p-6"
            >
              <h3 className="text-lg font-semibold text-[#1E293B] mb-4">
                {editingItemId ? '编辑评分项' : '添加评分项'}
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[#1E293B] mb-1.5">评分项名称 <span className="text-[#EF4444]">*</span></label>
                  <Input value={itemName} onChange={(e) => setItemName(e.target.value)} placeholder="如：视觉注意力..." />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#1E293B] mb-1.5">评分说明</label>
                  <Textarea value={itemDesc} onChange={(e) => setItemDesc(e.target.value)} placeholder="描述该项的评分细则..." rows={2} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#1E293B] mb-1.5">最高分</label>
                  <Input type="number" value={itemMaxScore} onChange={(e) => setItemMaxScore(Number(e.target.value))} />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <Button variant="outline" size="sm" onClick={() => setShowItemForm(false)}>取消</Button>
                <Button size="sm" onClick={saveItem} className="bg-[#977653] hover:bg-[#7A5F42]">保存</Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ─── Preview Modal ─── */}
      <AnimatePresence>
        {previewTemplate && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60]"
              onClick={() => setPreviewTemplate(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.25 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[720px] max-w-[90vw] max-h-[80vh] bg-white rounded-xl shadow-xl z-[70] overflow-hidden flex flex-col"
            >
              {/* Preview Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-[#E2E8F0]">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${iconBgMap[previewTemplate.icon]}`}>
                    {iconMap[previewTemplate.icon]}
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-[#1E293B]">{previewTemplate.name}</h3>
                    <div className="flex gap-1.5 mt-0.5">
                      <Badge className={`${categoryColors[previewTemplate.category]} text-[11px] border-0`}>{previewTemplate.category}</Badge>
                      <Badge className={`${previewTemplate.type === 'system' ? 'bg-[#EFF6FF] text-[#2563EB]' : 'bg-[#F5F0EB] text-[#5C4832]'} text-[11px] border-0`}>
                        {previewTemplate.type === 'system' ? '系统预设' : '自定义'}
                      </Badge>
                    </div>
                  </div>
                </div>
                <button onClick={() => setPreviewTemplate(null)} className="w-8 h-8 rounded-full flex items-center justify-center text-[#64748B] hover:bg-[#F7F6F4] cursor-pointer">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Preview Content */}
              <div className="flex-1 overflow-y-auto px-6 py-4">
                <p className="text-sm text-[#64748B] mb-4">{previewTemplate.description}</p>
                <div className="flex flex-wrap gap-1 mb-4">
                  {previewTemplate.applicableDisabilities.map((d) => (
                    <Badge key={d} variant="outline" className="text-[11px]">{d}</Badge>
                  ))}
                </div>
                <div className="text-xs text-[#94A3B8] mb-4">
                  适用年龄：{previewTemplate.ageRange.min}-{previewTemplate.ageRange.max}岁 · 共 {previewTemplate.dimensions.length} 个维度，{previewTemplate.dimensions.reduce((s, d) => s + d.items.length, 0)} 个评分项
                </div>

                {/* Dimensions */}
                <div className="space-y-3">
                  {previewTemplate.dimensions.map((dim) => (
                    <div key={dim.id} className="border border-[#E2E8F0] rounded-lg overflow-hidden">
                      <div className="px-4 py-2.5 bg-[#F7F6F4] flex items-center justify-between">
                        <span className="text-sm font-semibold text-[#1E293B]">{dim.name}</span>
                        <span className="text-xs text-[#94A3B8]">{dim.items.length} 项</span>
                      </div>
                      <div className="divide-y divide-[#E2E8F0]">
                        {dim.items.map((item, idx) => (
                          <div key={item.id} className="flex items-center justify-between px-4 py-2">
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-[#94A3B8]">{idx + 1}.</span>
                              <span className="text-sm text-[#1E293B]">{item.name}</span>
                            </div>
                            <div className="flex gap-1">
                              {[1, 2, 3, 4, 5].map((s) => (
                                <div key={s} className="w-6 h-6 rounded border border-[#E2E8F0] flex items-center justify-center text-[10px] text-[#CBD5E1]">
                                  {s}
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Preview Footer */}
              <div className="px-6 py-3 border-t border-[#E2E8F0] flex justify-end">
                <Button onClick={() => { setPreviewTemplate(null); toast.success('已选择此模板'); }} className="bg-[#977653] hover:bg-[#7A5F42]">
                  使用此模板
                </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
