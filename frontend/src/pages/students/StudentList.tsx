import { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Plus,
  MoreVertical,
  Pencil,
  Trash2,
  Eye,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  X,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import type { Student, StudentStatus, ClassItem } from './data';
import { DISABILITY_TYPES, statusBadgeClass, disabilityBadgeColors } from './data';
import ImportExportActions from '@/components/io/ImportExportActions';

interface StudentListProps {
  students: Student[];
  classes: ClassItem[];
  readOnly?: boolean;
  /** 首次加载中（显示骨架） */
  loading?: boolean;
  /** 后台刷新中（显示顶部进度条） */
  refreshing?: boolean;
  /** 加载失败信息 */
  error?: string | null;
  /** 失败重试 */
  onRetry?: () => void;
  /** 批量删除（真实调用后端） */
  onBatchDelete?: (ids: string[]) => void;
  /** 批量变更学籍状态（真实调用后端） */
  onBatchStatus?: (ids: string[], status: StudentStatus) => void;
  onAdd: () => void;
  onEdit: (student: Student) => void;
  onDelete: (student: Student) => void;
  onViewDetail: (student: Student) => void;
  onSwitchToClasses: () => void;
  setStudents?: React.Dispatch<React.SetStateAction<Student[]>>;
  /** 导入完成后由父组件刷新列表 */
  onImported?: () => void;
}

const pageSizeOptions = [10, 20, 50];

export default function StudentList({
  students,
  classes,
  readOnly = false,
  loading = false,
  refreshing = false,
  error = null,
  onRetry,
  onBatchDelete,
  onBatchStatus,
  onAdd,
  onEdit,
  onDelete,
  onViewDetail,
  onSwitchToClasses,
  onImported,
}: StudentListProps) {
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('all');
  const [disabilityFilter, setDisabilityFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Student | null>(null);

  const filtered = useMemo(() => {
    let result = students;
    if (search.trim()) {
      const kw = search.trim().toLowerCase();
      result = result.filter(
        (s) =>
          s.name.includes(kw) ||
          s.student_no.toLowerCase().includes(kw) ||
          s.guardian_phone.includes(kw) ||
          s.id_card.toLowerCase().includes(kw)
      );
    }
    if (classFilter !== 'all') {
      result = result.filter((s) => s.class_id === classFilter);
    }
    if (disabilityFilter !== 'all') {
      result = result.filter((s) => s.disability_type === disabilityFilter);
    }
    if (statusFilter !== 'all') {
      result = result.filter((s) => s.status === statusFilter);
    }
    return result;
  }, [students, search, classFilter, disabilityFilter, statusFilter]);

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;
  const end = start + pageSize;
  const pageData = filtered.slice(start, end);

  const allPageSelected = pageData.length > 0 && pageData.every((s) => selectedIds.has(s.id));
  const somePageSelected = pageData.some((s) => selectedIds.has(s.id)) && !allPageSelected;

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allPageSelected) {
        pageData.forEach((s) => next.delete(s.id));
      } else {
        pageData.forEach((s) => next.add(s.id));
      }
      return next;
    });
  }, [allPageSelected, pageData]);

  const toggleSelectOne = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleDeleteClick = (student: Student) => {
    if (readOnly) return;
    setDeleteTarget(student);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (readOnly) return;
    if (deleteTarget) {
      onDelete(deleteTarget);
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(deleteTarget.id);
        return next;
      });
    }
  };

  /**
   * 修复说明：批量删除原先只改本地 state，刷新页面后数据复原（假删除）。
   * 现改为回调父组件，由 service 层逐个调用后端 /students/delete 真实落库。
   */
  const handleBatchDelete = () => {
    if (readOnly || selectedIds.size === 0) return;
    onBatchDelete?.(Array.from(selectedIds));
    setSelectedIds(new Set());
  };

  /** 同批量删除：批量变更状态改为真实调用后端 /students/update */
  const handleBatchStatus = (status: StudentStatus) => {
    if (readOnly || selectedIds.size === 0) return;
    onBatchStatus?.(Array.from(selectedIds), status);
    setSelectedIds(new Set());
  };

  const resetFilters = () => {
    setSearch('');
    setClassFilter('all');
    setDisabilityFilter('all');
    setStatusFilter('all');
    setPage(1);
  };

  const hasFilters = search || classFilter !== 'all' || disabilityFilter !== 'all' || statusFilter !== 'all';

  return (
    <div>
      {/* Page Header */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25 }}
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-3"
      >
        <div>
          <h1 className="text-[28px] font-bold text-[#1E293B] tracking-tight">学生管理</h1>
          <p className="text-sm text-[#64748B] mt-1">管理学生档案、班级信息与家长关联</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-10 px-4 text-[#64748B] border-[#E2E8F0] hover:bg-[#F7F6F4]"
            onClick={onSwitchToClasses}
          >
            <FolderOpen className="w-4 h-4 mr-1.5" />
            班级管理
          </Button>
          {!readOnly && (
            <Button
              size="sm"
              className="h-10 px-4 bg-primary-500 hover:bg-primary-600 text-white"
              onClick={onAdd}
            >
              <Plus className="w-4 h-4 mr-1.5" />
              新增学生
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
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-[280px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
            <Input
              placeholder="搜索姓名、学号、手机号..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="pl-9 h-10 bg-[#F7F6F4] border-[#E2E8F0] focus:border-[#3B82F6] focus:ring-[3px] focus:ring-[rgba(59,130,246,0.15)]"
            />
          </div>
          <Select value={classFilter} onValueChange={(v) => { setClassFilter(v); setPage(1); }}>
            <SelectTrigger className="w-[160px] h-10 bg-[#F7F6F4] border-[#E2E8F0]">
              <SelectValue placeholder="全部班级" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部班级</SelectItem>
              {classes.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={disabilityFilter} onValueChange={(v) => { setDisabilityFilter(v); setPage(1); }}>
            <SelectTrigger className="w-[160px] h-10 bg-[#F7F6F4] border-[#E2E8F0]">
              <SelectValue placeholder="全部障碍类型" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部障碍类型</SelectItem>
              {DISABILITY_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
            <SelectTrigger className="w-[140px] h-10 bg-[#F7F6F4] border-[#E2E8F0]">
              <SelectValue placeholder="全部状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              <SelectItem value="在读">在读</SelectItem>
              <SelectItem value="休学">休学</SelectItem>
              <SelectItem value="毕业">毕业</SelectItem>
              <SelectItem value="转衔">转衔</SelectItem>
            </SelectContent>
          </Select>
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="h-10 text-primary-500 hover:bg-primary-50"
              onClick={resetFilters}
            >
              <X className="w-4 h-4 mr-1" />
              重置
            </Button>
          )}
          <div className="ml-auto flex items-center gap-2">
            <ImportExportActions
              module="students"
              filenameBase="学生数据"
              readOnly={readOnly}
              onImported={onImported}
              exportParams={{
                keyword: search.trim() || undefined,
                class_id: classFilter !== 'all' ? classFilter : undefined,
                status: statusFilter !== 'all' ? statusFilter : undefined,
                disability_type: disabilityFilter !== 'all' ? disabilityFilter : undefined,
              }}
            />
          </div>
        </div>
      </motion.div>

      {/* Batch Operation Bar */}
      {!readOnly && (
        <AnimatePresence>
          {selectedIds.size > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden mb-2"
            >
              <div className="bg-primary-50 border border-primary-200 rounded-lg px-4 py-2 flex items-center justify-between">
                <span className="text-sm text-primary-700 font-medium">
                  已选择 {selectedIds.size} 项
                </span>
                <div className="flex items-center gap-2">
                  <Select onValueChange={(v) => handleBatchStatus(v as StudentStatus)}>
                    <SelectTrigger className="h-8 text-xs bg-white border-primary-200">
                      <SelectValue placeholder="批量变更状态" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="在读">变更为在读</SelectItem>
                      <SelectItem value="休学">变更为休学</SelectItem>
                      <SelectItem value="毕业">变更为毕业</SelectItem>
                      <SelectItem value="转衔">变更为转衔</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs text-danger-500 border-danger-200 hover:bg-danger-50"
                    onClick={handleBatchDelete}
                  >
                    <Trash2 className="w-3 h-3 mr-1" />
                    批量删除
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => { setSelectedIds(new Set()); }}
                  >
                    取消
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}

      {/* Data Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: 0.15 }}
        className="bg-white rounded-lg shadow-sm overflow-hidden"
      >
        {/* Table toolbar */}
        <div className="flex items-center justify-between px-4 py-3 bg-[#F7F6F4] rounded-t-lg border-b border-[#E2E8F0]">
          <div className="flex items-center gap-3">
            <Checkbox
              checked={allPageSelected}
              ref={(el) => {
                if (el) {
                  (el as unknown as HTMLInputElement).indeterminate = somePageSelected;
                }
              }}
              onCheckedChange={toggleSelectAll}
              aria-label="全选"
            />
            <span className="text-xs text-[#94A3B8]">全选</span>
          </div>
          <div className="flex items-center gap-3 text-sm text-[#64748B]">
            <span className="inline-flex items-center gap-1.5">
              共 {total} 条
              {refreshing && <Loader2 className="w-3.5 h-3.5 animate-spin text-primary-500" />}
            </span>
            <Select
              value={String(pageSize)}
              onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}
            >
              <SelectTrigger className="h-8 w-[90px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pageSizeOptions.map((o) => (
                  <SelectItem key={o} value={String(o)}>每页 {o}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#E2E8F0] bg-[#F7F6F4]">
                <th className="w-10 px-3 py-3"></th>
                <th className="px-3 py-3 text-left font-semibold text-[#94A3B8] text-xs">姓名</th>
                <th className="px-3 py-3 text-left font-semibold text-[#94A3B8] text-xs">学号</th>
                <th className="px-3 py-3 text-left font-semibold text-[#94A3B8] text-xs">性别</th>
                <th className="px-3 py-3 text-left font-semibold text-[#94A3B8] text-xs">年龄</th>
                <th className="px-3 py-3 text-left font-semibold text-[#94A3B8] text-xs">班级</th>
                <th className="px-3 py-3 text-left font-semibold text-[#94A3B8] text-xs">障碍类型</th>
                <th className="px-3 py-3 text-left font-semibold text-[#94A3B8] text-xs">障碍程度</th>
                <th className="px-3 py-3 text-left font-semibold text-[#94A3B8] text-xs">监护人</th>
                <th className="px-3 py-3 text-left font-semibold text-[#94A3B8] text-xs">监护人电话</th>
                <th className="px-3 py-3 text-left font-semibold text-[#94A3B8] text-xs">学籍状态</th>
                <th className="px-3 py-3 text-left font-semibold text-[#94A3B8] text-xs w-20">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={12} className="text-center py-16">
                    <div className="flex flex-col items-center">
                      <Loader2 className="w-8 h-8 text-primary-500 animate-spin mb-3" />
                      <p className="text-[#64748B] text-sm">正在加载学生数据…</p>
                    </div>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={12} className="text-center py-16">
                    <div className="flex flex-col items-center">
                      <AlertCircle className="w-10 h-10 text-danger-400 mb-3" />
                      <p className="text-[#1E293B] font-medium mb-1">学生数据加载失败</p>
                      <p className="text-[#94A3B8] text-xs mb-3">{error}</p>
                      {onRetry && (
                        <Button
                          size="sm"
                          className="bg-primary-500 hover:bg-primary-600 text-white"
                          onClick={onRetry}
                        >
                          重新加载
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : pageData.length === 0 ? (
                <tr>
                  <td colSpan={12} className="text-center py-16">
                    <div className="flex flex-col items-center">
                      <Search className="w-12 h-12 text-[#CBD5E1] mb-3" />
                      <p className="text-[#64748B] font-medium mb-1">
                        {hasFilters ? '未找到匹配的学生' : '暂无学生档案'}
                      </p>
                      <p className="text-[#94A3B8] text-xs mb-3">
                        {hasFilters ? '尝试调整筛选条件' : '点击右上角「新增学生」创建第一份档案'}
                      </p>
                      {hasFilters && (
                        <Button
                          size="sm"
                          className="bg-primary-500 hover:bg-primary-600 text-white"
                          onClick={resetFilters}
                        >
                          清除筛选
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                pageData.map((student, idx) => (
                  <motion.tr
                    key={student.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, delay: idx * 0.04 }}
                    className={`border-b border-[#E2E8F0] transition-colors duration-150 cursor-pointer ${
                      selectedIds.has(student.id) ? 'bg-primary-50' : 'hover:bg-[#F7F6F4]'
                    }`}
                    onClick={() => onViewDetail(student)}
                  >
                    <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedIds.has(student.id)}
                        onCheckedChange={() => toggleSelectOne(student.id)}
                        aria-label={`选择 ${student.name}`}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center text-xs font-bold text-primary-600">
                          {student.name[0]}
                        </div>
                        <span className="font-medium text-[#1E293B]">{student.name}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-[#64748B]">{student.student_no}</td>
                    <td className="px-3 py-3 text-[#64748B]">{student.gender}</td>
                    <td className="px-3 py-3 text-[#64748B]">{student.age}岁</td>
                    <td className="px-3 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-[#F0F2F5] text-[#405680]">
                        {student.class_name}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        disabilityBadgeColors[student.disability_type] || 'bg-[#F0F2F5] text-[#64748B]'
                      }`}>
                        {student.disability_type}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-[#64748B]">{student.disability_level}</td>
                    <td className="px-3 py-3 text-[#1E293B]">{student.guardian_name}</td>
                    <td className="px-3 py-3 text-[#64748B]">{student.guardian_phone}</td>
                    <td className="px-3 py-3">
                      <Badge className={`${statusBadgeClass[student.status]} text-xs font-medium`}>
                        {student.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        {!readOnly && (
                          <button
                            className="w-7 h-7 rounded-md flex items-center justify-center text-[#64748B] hover:bg-[#F7F6F4] hover:text-primary-500 transition-colors"
                            title="编辑"
                            onClick={() => onEdit(student)}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="w-7 h-7 rounded-md flex items-center justify-center text-[#64748B] hover:bg-[#F7F6F4] hover:text-primary-500 transition-colors">
                              <MoreVertical className="w-3.5 h-3.5" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => onViewDetail(student)}>
                              <Eye className="w-3.5 h-3.5 mr-2" />
                              查看详情
                            </DropdownMenuItem>
                            {!readOnly && (
                              <>
                                <DropdownMenuItem onClick={() => onEdit(student)}>
                                  <Pencil className="w-3.5 h-3.5 mr-2" />
                                  编辑
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="text-danger-500 focus:text-danger-500"
                                  onClick={() => handleDeleteClick(student)}
                                >
                                  <Trash2 className="w-3.5 h-3.5 mr-2" />
                                  删除档案
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {total > 0 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-[#E2E8F0]">
            <span className="text-sm text-[#64748B]">
              显示第 {start + 1}-{Math.min(end, total)} 条，共 {total} 条
            </span>
            <div className="flex items-center gap-1">
              <button
                className={`w-8 h-8 rounded-md flex items-center justify-center transition-colors ${
                  currentPage === 1
                    ? 'text-[#CBD5E1] cursor-not-allowed'
                    : 'text-[#64748B] hover:bg-[#F7F6F4]'
                }`}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  className={`w-8 h-8 rounded-md flex items-center justify-center text-sm font-medium transition-colors ${
                    p === currentPage
                      ? 'bg-primary-500 text-white'
                      : 'text-[#64748B] hover:bg-[#F7F6F4]'
                  }`}
                  onClick={() => setPage(p)}
                >
                  {p}
                </button>
              ))}
              <button
                className={`w-8 h-8 rounded-md flex items-center justify-center transition-colors ${
                  currentPage === totalPages
                    ? 'text-[#CBD5E1] cursor-not-allowed'
                    : 'text-[#64748B] hover:bg-[#F7F6F4]'
                }`}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </motion.div>

      {/* Delete Confirmation Dialog */}
      {!readOnly && (
        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent className="max-w-[400px]">
            <DialogHeader className="text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-danger-50 flex items-center justify-center mb-3">
                <Trash2 className="w-6 h-6 text-danger-500" />
              </div>
              <DialogTitle className="text-lg font-semibold text-[#1E293B]">确认删除</DialogTitle>
              <DialogDescription className="text-[#64748B]">
                确定要删除学生 <strong className="text-[#1E293B]">{deleteTarget?.name}</strong> 的档案吗？此操作不可撤销。
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
                取消
              </Button>
              <Button className="bg-danger-500 hover:bg-danger-600 text-white" onClick={confirmDelete}>
                确认删除
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
